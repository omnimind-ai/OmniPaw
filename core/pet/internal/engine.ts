import {
  CAT_PET_ACTIONS,
  CAT_PET_AFFECTION_DEFAULT,
  CAT_PET_AFFECTION_MAX,
  CAT_PET_AFFECTION_MIN,
  CAT_PET_CUSTOM_ACTIONS,
  CAT_PET_DAILY_LIMITS,
  CAT_PET_MOOD_DEFAULT,
  CAT_PET_MOOD_MAX,
  CAT_PET_MOOD_MIN,
  type CatPetAction,
  type CatPetCustomAction,
  type CatPetCustomInteractionConfig,
  type CatPetInteractionDefinition,
  type CatPetInteractionEffect,
  type CatPetInteractionRisk,
  type CatPetMood,
  type CatPetOutcome,
  type CatPetState,
  isCatPetAction,
  isCatPetCustomAction,
  moodFromScore,
} from '@shared/types/cat-pet'

const HOUR_MS = 60 * 60 * 1000
const MAX_CUSTOM_LABEL_LENGTH = 18
const MAX_CUSTOM_DESCRIPTION_LENGTH = 80

interface InteractionTemplate {
  risk: CatPetInteractionRisk
  customizable: boolean
  positive: CatPetInteractionEffect
  negative: CatPetInteractionEffect
  positiveProbability: number
}

export interface PetVitals {
  affection: number
  mood: CatPetMood
  moodScore: number
}

export interface PetInteractionOutcome {
  action: CatPetAction
  risk: CatPetInteractionRisk
  outcome: CatPetOutcome
  affectionDelta: number
  moodDelta: number
  affectionBefore: number
  affectionAfter: number
  moodBefore: CatPetMood
  moodAfter: CatPetMood
  moodScoreBefore: number
  moodScoreAfter: number
  positiveProbability: number
}

export interface PetLaunchEffect {
  awayMs: number
  moodDelta: number
  moodBefore: CatPetMood
  moodAfter: CatPetMood
  moodScoreBefore: number
  moodScoreAfter: number
}

const ACTION_TEMPLATES: Record<CatPetAction, InteractionTemplate> = {
  pat: {
    risk: 'low',
    customizable: false,
    positive: { affection: 1, mood: 8 },
    negative: { affection: 0, mood: -3 },
    positiveProbability: 0.92,
  },
  tease: {
    risk: 'medium',
    customizable: false,
    positive: { affection: 3, mood: 10 },
    negative: { affection: -2, mood: -12 },
    positiveProbability: 0.68,
  },
  feed: {
    risk: 'low',
    customizable: false,
    positive: { affection: 2, mood: 7 },
    negative: { affection: 0, mood: -4 },
    positiveProbability: 0.86,
  },
  custom_low: {
    risk: 'low',
    customizable: true,
    positive: { affection: 2, mood: 8 },
    negative: { affection: -1, mood: -6 },
    positiveProbability: 0.82,
  },
  custom_medium: {
    risk: 'medium',
    customizable: true,
    positive: { affection: 5, mood: 13 },
    negative: { affection: -2, mood: -14 },
    positiveProbability: 0.64,
  },
  custom_high: {
    risk: 'high',
    customizable: true,
    positive: { affection: 9, mood: 18 },
    negative: { affection: -5, mood: -25 },
    positiveProbability: 0.48,
  },
}

export function defaultCustomInteractions(): CatPetCustomInteractionConfig[] {
  return CAT_PET_CUSTOM_ACTIONS.map((id) => ({
    id,
    enabled: true,
  }))
}

export function normalizeCustomInteractions(
  input: readonly CatPetCustomInteractionConfig[] | undefined
): CatPetCustomInteractionConfig[] {
  const byId = new Map<CatPetCustomAction, CatPetCustomInteractionConfig>()
  for (const item of input ?? []) {
    if (!isCatPetCustomAction(item?.id)) {
      continue
    }
    byId.set(item.id, {
      id: item.id,
      enabled: item.enabled !== false,
      label: normalizeOptionalText(item.label, MAX_CUSTOM_LABEL_LENGTH),
      description: normalizeOptionalText(item.description, MAX_CUSTOM_DESCRIPTION_LENGTH),
    })
  }

  return defaultCustomInteractions().map((fallback) => ({
    ...fallback,
    ...(byId.get(fallback.id) ?? {}),
  }))
}

export function parseCustomInteractionsJson(value: string | null | undefined) {
  if (!value?.trim()) {
    return defaultCustomInteractions()
  }

  try {
    const parsed = JSON.parse(value) as { customInteractions?: CatPetCustomInteractionConfig[] }
    return normalizeCustomInteractions(Array.isArray(parsed) ? parsed : parsed.customInteractions)
  } catch {
    return defaultCustomInteractions()
  }
}

export function serializeCustomInteractionsJson(
  customInteractions: readonly CatPetCustomInteractionConfig[]
): string {
  return JSON.stringify({
    customInteractions: normalizeCustomInteractions(customInteractions),
  })
}

export function buildInteractionDefinitions(
  customInteractions: readonly CatPetCustomInteractionConfig[]
): CatPetInteractionDefinition[] {
  const customById = new Map(
    normalizeCustomInteractions(customInteractions).map((item) => [item.id, item])
  )

  return CAT_PET_ACTIONS.map((id) => {
    const template = ACTION_TEMPLATES[id]
    const custom = template.customizable ? customById.get(id as CatPetCustomAction) : undefined
    return {
      id,
      risk: template.risk,
      enabled: custom?.enabled ?? true,
      customizable: template.customizable,
      dailyLimit: CAT_PET_DAILY_LIMITS[id],
      positive: template.positive,
      negative: template.negative,
      positiveProbability: template.positiveProbability,
      label: custom?.label,
      description: custom?.description,
    }
  })
}

export function interactionDefinitionForAction(
  action: CatPetAction,
  customInteractions: readonly CatPetCustomInteractionConfig[]
): CatPetInteractionDefinition | undefined {
  return buildInteractionDefinitions(customInteractions).find((item) => item.id === action)
}

export function resolveInteractionOutcome(input: {
  action: CatPetAction
  vitals: PetVitals
  customInteractions: readonly CatPetCustomInteractionConfig[]
  random: number
}): PetInteractionOutcome | undefined {
  if (!isCatPetAction(input.action)) {
    return undefined
  }

  const definition = interactionDefinitionForAction(input.action, input.customInteractions)
  if (!definition?.enabled) {
    return undefined
  }

  const probability = adjustedPositiveProbability(definition, input.vitals)
  const positive = input.random < probability
  const effect = positive ? definition.positive : definition.negative
  const affectionBefore = clampAffection(input.vitals.affection)
  const moodScoreBefore = clampMoodScore(input.vitals.moodScore)
  const affectionAfter = clampAffection(affectionBefore + effect.affection)
  const moodScoreAfter = clampMoodScore(moodScoreBefore + effect.mood)

  return {
    action: input.action,
    risk: definition.risk,
    outcome: positive ? 'positive' : 'negative',
    affectionDelta: affectionAfter - affectionBefore,
    moodDelta: moodScoreAfter - moodScoreBefore,
    affectionBefore,
    affectionAfter,
    moodBefore: input.vitals.mood,
    moodAfter: moodFromScore(moodScoreAfter, affectionAfter),
    moodScoreBefore,
    moodScoreAfter,
    positiveProbability: probability,
  }
}

export function resolveLaunchEffect(input: {
  vitals: PetVitals
  now: number
  lastSeenAt?: number
}): PetLaunchEffect {
  const affection = clampAffection(input.vitals.affection)
  const moodScoreBefore = clampMoodScore(input.vitals.moodScore)
  const awayMs = Math.max(0, input.lastSeenAt ? input.now - input.lastSeenAt : 0)
  const awayHours = awayMs / HOUR_MS

  if (awayHours < 6) {
    return {
      awayMs,
      moodDelta: 0,
      moodBefore: input.vitals.mood,
      moodAfter: input.vitals.mood,
      moodScoreBefore,
      moodScoreAfter: moodScoreBefore,
    }
  }

  const affectionProtection = clamp((affection - 45) / 155, 0, 1)
  const absenceWeight = Math.log2(awayHours / 6 + 1)
  const longAwayWeight = awayHours >= 72 ? Math.min(16, Math.floor((awayHours - 72) / 24) * 2) : 0
  const penalty = Math.round(
    Math.min(46, absenceWeight * 9 * (1 - affectionProtection * 0.58) + longAwayWeight)
  )
  const moodScoreAfter = clampMoodScore(moodScoreBefore - penalty)

  return {
    awayMs,
    moodDelta: moodScoreAfter - moodScoreBefore,
    moodBefore: input.vitals.mood,
    moodAfter: moodFromScore(moodScoreAfter, affection),
    moodScoreBefore,
    moodScoreAfter,
  }
}

export function normalizePersistedMood(
  value: string | undefined,
  moodScore: number,
  affection: number
) {
  const valid: readonly CatPetMood[] = ['angry', 'sad', 'down', 'normal', 'happy', 'attached']
  return valid.includes(value as CatPetMood)
    ? (value as CatPetMood)
    : moodFromScore(moodScore, affection)
}

export function clampAffection(value: number): number {
  return clampInteger(
    value,
    CAT_PET_AFFECTION_DEFAULT,
    CAT_PET_AFFECTION_MIN,
    CAT_PET_AFFECTION_MAX
  )
}

export function clampMoodScore(value: number): number {
  return clampInteger(value, CAT_PET_MOOD_DEFAULT, CAT_PET_MOOD_MIN, CAT_PET_MOOD_MAX)
}

export function petChatRuntimeInstruction(state: CatPetState): string {
  const away = formatAwayDuration(state.awayMs ?? 0)
  const moodText = petMoodText(state.mood)
  return [
    '桌宠养成状态会轻微影响你的回复方式，但不要机械复述数值，除非用户主动询问。',
    `当前心情：${moodText}；好感度：${state.affection}/${state.affectionMax}；心情值：${state.moodScore}/${state.moodMax}。`,
    away ? `用户上次离开到这次启动约 ${away}。` : '',
    '回复时保持当前角色设定：心情低落时可以更柔软、委屈或别扭一点；心情好时可以更轻快亲近；不要夸张表演，不要责备用户。',
    '如果用户进行了桌宠互动或提到陪伴状态，可以自然承接互动带来的情绪变化。',
  ]
    .filter(Boolean)
    .join('\n')
}

function adjustedPositiveProbability(
  definition: CatPetInteractionDefinition,
  vitals: PetVitals
): number {
  const affectionBias = ((clampAffection(vitals.affection) - 100) / 100) * 0.08
  const moodBias = (clampMoodScore(vitals.moodScore) / 100) * 0.1
  const highRiskBadMoodPenalty =
    definition.risk === 'high' && vitals.moodScore < -20 ? Math.abs(vitals.moodScore) / 500 : 0
  const lowRiskBadMoodLift =
    definition.risk === 'low' && vitals.moodScore < -35 ? Math.abs(vitals.moodScore) / 800 : 0

  return clamp(
    definition.positiveProbability +
      affectionBias +
      moodBias -
      highRiskBadMoodPenalty +
      lowRiskBadMoodLift,
    0.12,
    0.96
  )
}

function normalizeOptionalText(value: string | undefined, maxLength: number): string | undefined {
  const trimmed = value?.replace(/\s+/g, ' ').trim()
  if (!trimmed) {
    return undefined
  }
  return trimmed.slice(0, maxLength)
}

function petMoodText(mood: CatPetMood): string {
  switch (mood) {
    case 'angry':
      return '有点生气'
    case 'sad':
      return '伤心'
    case 'down':
      return '失落'
    case 'happy':
      return '开心'
    case 'attached':
      return '很亲近'
    default:
      return '平静'
  }
}

function formatAwayDuration(ms: number): string {
  if (ms <= 0) {
    return ''
  }
  const hours = Math.floor(ms / HOUR_MS)
  if (hours < 1) {
    return '不到 1 小时'
  }
  if (hours < 48) {
    return `${hours} 小时`
  }
  return `${Math.floor(hours / 24)} 天`
}

function clampInteger(value: number, fallback: number, min: number, max: number): number {
  return Math.round(clamp(Number.isFinite(value) ? value : fallback, min, max))
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}
