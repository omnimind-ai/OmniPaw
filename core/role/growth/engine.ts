import {
  CAT_PET_ACTIONS,
  CAT_PET_DAILY_LIMITS,
  CAT_PET_INTERACTION_TEMPLATES,
  CAT_PET_MOOD_TEXT,
  CAT_PET_UNLOCK_AFFECTION,
  normalizePetGiftConfigs,
  normalizePetInteractionConfigs,
  PET_CHAT_RUNTIME_INSTRUCTION,
  type PetInteractionTemplate,
} from '@core/role/presets'
import {
  CAT_PET_AFFECTION_DEFAULT,
  CAT_PET_AFFECTION_MAX,
  CAT_PET_AFFECTION_MIN,
  CAT_PET_MOOD_DEFAULT,
  CAT_PET_MOOD_MAX,
  CAT_PET_MOOD_MIN,
  type CatPetAction,
  type CatPetGiftConfig,
  type CatPetGiftDefinition,
  type CatPetInteractionConfig,
  type CatPetInteractionDefinition,
  type CatPetMood,
  type CatPetOutcome,
  type CatPetState,
  isCatPetAction,
  moodFromScore,
} from '@shared/types/cat-pet'

const HOUR_MS = 60 * 60 * 1000

export interface PetVitals {
  affection: number
  mood: CatPetMood
  moodScore: number
}

export interface PetInteractionOutcome {
  action: CatPetAction
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
  feedback: string
}

export interface PetLaunchEffect {
  awayMs: number
  moodDelta: number
  moodBefore: CatPetMood
  moodAfter: CatPetMood
  moodScoreBefore: number
  moodScoreAfter: number
}

export interface PetGiftUnlockCandidate {
  gift: CatPetGiftConfig
  affection: number
  mood: CatPetMood
}

export function parseInteractionConfigsJson(value: string | null | undefined) {
  if (!value?.trim()) {
    return normalizePetInteractionConfigs(undefined)
  }

  try {
    const parsed = JSON.parse(value) as { interactions?: unknown; customInteractions?: unknown }
    return normalizePetInteractionConfigs(
      Array.isArray(parsed) ? parsed : (parsed.interactions ?? parsed.customInteractions)
    )
  } catch {
    return normalizePetInteractionConfigs(undefined)
  }
}

export function serializeInteractionConfigsJson(
  interactions: readonly CatPetInteractionConfig[]
): string {
  return JSON.stringify({
    interactions: normalizePetInteractionConfigs(interactions),
  })
}

export function buildInteractionDefinitions(
  interactionConfigs: readonly CatPetInteractionConfig[],
  affection: number
): CatPetInteractionDefinition[] {
  const configById = new Map(
    normalizePetInteractionConfigs(interactionConfigs).map((item) => [item.id, item])
  )
  const affectionValue = clampAffection(affection)

  return CAT_PET_ACTIONS.map((id) => {
    const template = CAT_PET_INTERACTION_TEMPLATES[id]
    const config = configById.get(id)
    const unlockAffection = CAT_PET_UNLOCK_AFFECTION[id]
    const label = config?.label?.trim() || id
    const feedback = {
      positive: config?.positiveFeedback?.trim() || label,
      negative: config?.negativeFeedback?.trim() || label,
    }
    return {
      id,
      enabled: config?.enabled !== false,
      unlocked: affectionValue >= unlockAffection,
      customizable: template.customizable,
      unlockAffection,
      dailyLimit: CAT_PET_DAILY_LIMITS[id],
      positive: template.positive,
      negative: template.negative,
      positiveProbability: template.positiveProbability,
      label,
      description: config?.description,
      feedback,
    }
  })
}

export function buildGiftDefinitions(input: {
  giftConfigs: readonly CatPetGiftConfig[]
  unlockedGiftIds: ReadonlySet<string>
  affection: number
}): CatPetGiftDefinition[] {
  return normalizePetGiftConfigs(input.giftConfigs).map((gift) => ({
    ...gift,
    enabled: gift.enabled !== false,
    unlocked: input.unlockedGiftIds.has(gift.id),
    unlockAffection: clampAffection(gift.unlockAffection),
    storyLines: [...gift.storyLines],
    ...(gift.image ? { image: { ...gift.image } } : {}),
  }))
}

export function resolvePendingGiftUnlock(input: {
  giftConfigs: readonly CatPetGiftConfig[]
  unlockedGiftIds: ReadonlySet<string>
  affection: number
  mood: CatPetMood
}): PetGiftUnlockCandidate | undefined {
  if (!isGiftUnlockMood(input.mood)) {
    return undefined
  }

  const affection = clampAffection(input.affection)
  const gift = normalizePetGiftConfigs(input.giftConfigs)
    .filter((gift) => gift.enabled !== false && !input.unlockedGiftIds.has(gift.id))
    .sort((left, right) => left.unlockAffection - right.unlockAffection)
    .find((gift) => affection >= clampAffection(gift.unlockAffection))
  return gift ? { gift, affection, mood: input.mood } : undefined
}

export function interactionDefinitionForAction(
  action: CatPetAction,
  interactionConfigs: readonly CatPetInteractionConfig[],
  affection: number
): CatPetInteractionDefinition | undefined {
  return buildInteractionDefinitions(interactionConfigs, affection).find(
    (item) => item.id === action
  )
}

export function resolveInteractionOutcome(input: {
  action: CatPetAction
  vitals: PetVitals
  interactionConfigs: readonly CatPetInteractionConfig[]
  random: number
}): PetInteractionOutcome | undefined {
  if (!isCatPetAction(input.action)) {
    return undefined
  }

  const definition = interactionDefinitionForAction(
    input.action,
    input.interactionConfigs,
    input.vitals.affection
  )
  if (!definition?.enabled || !definition.unlocked) {
    return undefined
  }

  const template = CAT_PET_INTERACTION_TEMPLATES[input.action]
  const probability = adjustedPositiveProbability(template, definition, input.vitals)
  const positive = input.random < probability
  const effect = positive ? definition.positive : definition.negative
  const affectionBefore = clampAffection(input.vitals.affection)
  const moodScoreBefore = clampMoodScore(input.vitals.moodScore)
  const affectionAfter = clampAffection(affectionBefore + effect.affection)
  const moodScoreAfter = clampMoodScore(moodScoreBefore + effect.mood)

  return {
    action: input.action,
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
    feedback: positive ? definition.feedback.positive : definition.feedback.negative,
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
    PET_CHAT_RUNTIME_INSTRUCTION.opening,
    `当前心情：${moodText}；好感度：${state.affection}/${state.affectionMax}。`,
    away ? `用户上次离开到这次启动约 ${away}。` : '',
    PET_CHAT_RUNTIME_INSTRUCTION.style,
    PET_CHAT_RUNTIME_INSTRUCTION.interaction,
  ]
    .filter(Boolean)
    .join('\n')
}

function adjustedPositiveProbability(
  template: PetInteractionTemplate,
  definition: CatPetInteractionDefinition,
  vitals: PetVitals
): number {
  const affectionBias = ((clampAffection(vitals.affection) - 100) / 100) * 0.08
  const moodBias = (clampMoodScore(vitals.moodScore) / 100) * 0.1
  const deepBadMoodPenalty =
    template.intensity === 'deep' && vitals.moodScore < -20 ? Math.abs(vitals.moodScore) / 500 : 0
  const softBadMoodLift =
    template.intensity === 'soft' && vitals.moodScore < -35 ? Math.abs(vitals.moodScore) / 800 : 0
  const lockedProximityLift =
    definition.unlockAffection > 0 && vitals.affection >= definition.unlockAffection ? 0.02 : 0

  return clamp(
    definition.positiveProbability +
      affectionBias +
      moodBias -
      deepBadMoodPenalty +
      softBadMoodLift +
      lockedProximityLift,
    0.12,
    0.96
  )
}

function petMoodText(mood: CatPetMood): string {
  return CAT_PET_MOOD_TEXT[mood]
}

function isGiftUnlockMood(mood: CatPetMood): boolean {
  return mood === 'happy' || mood === 'attached'
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
