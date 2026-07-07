import type { UnixMs } from './chat'

export const CAT_PET_AFFECTION_MAX = 200
export const CAT_PET_AFFECTION_MIN = 0
export const CAT_PET_AFFECTION_DEFAULT = 50

export const CAT_PET_MOOD_MAX = 100
export const CAT_PET_MOOD_MIN = -100
export const CAT_PET_MOOD_DEFAULT = 0

export const CAT_PET_ACTIONS = ['pat', 'tease', 'custom_100', 'custom_150'] as const
export const CAT_PET_CUSTOM_ACTIONS = ['custom_100', 'custom_150'] as const

export const CAT_PET_DAILY_LIMITS = {
  pat: 2,
  tease: 1,
  custom_100: 1,
  custom_150: 1,
} as const satisfies Record<CatPetAction, number>

export const CAT_PET_UNLOCK_AFFECTION = {
  pat: 0,
  tease: 0,
  custom_100: 100,
  custom_150: 150,
} as const satisfies Record<CatPetAction, number>

const CAT_PET_DEFAULT_INTERACTIONS = [
  {
    id: 'pat',
    enabled: true,
    label: '摸摸',
    description: '轻轻摸摸猫咪',
    positiveFeedback: '猫咪舒服地眯起了眼',
    negativeFeedback: '猫咪不太喜欢这样摸',
  },
  {
    id: 'tease',
    enabled: true,
    label: '逗逗',
    description: '逗逗猫咪',
    positiveFeedback: '猫咪玩得很开心',
    negativeFeedback: '猫咪有点不高兴',
  },
  {
    id: 'custom_100',
    enabled: true,
    label: '轻声夸夸',
    description: '关系更熟悉后解锁的亲近互动',
    positiveFeedback: '猫咪认真听完，看起来更亲近了',
    negativeFeedback: '猫咪还没有完全放松下来',
  },
  {
    id: 'custom_150',
    enabled: true,
    label: '贴贴陪伴',
    description: '关系很亲近后解锁的特别互动',
    positiveFeedback: '猫咪主动靠近，安静地陪着你',
    negativeFeedback: '猫咪现在想自己待一会儿',
  },
] as const satisfies readonly CatPetInteractionConfig[]

const MAX_LABEL_LENGTH = 18
const MAX_DESCRIPTION_LENGTH = 80
const MAX_FEEDBACK_LENGTH = 120

export type CatPetAction = (typeof CAT_PET_ACTIONS)[number]
export type CatPetCustomAction = (typeof CAT_PET_CUSTOM_ACTIONS)[number]
export type CatPetMood = 'angry' | 'sad' | 'down' | 'normal' | 'happy' | 'attached'
export type CatPetOutcome = 'positive' | 'negative'
export type CatPetChangeReason = 'init' | 'action' | 'refresh' | 'config' | 'launch'

export type CatPetActionCounters = Record<CatPetAction, number>

export interface CatPetInteractionEffect {
  affection: number
  mood: number
}

export interface CatPetInteractionFeedback {
  positive: string
  negative: string
}

export interface CatPetInteractionConfig {
  id: CatPetAction
  enabled?: boolean
  label?: string
  description?: string
  positiveFeedback?: string
  negativeFeedback?: string
}

export interface CatPetInteractionDefinition {
  id: CatPetAction
  enabled: boolean
  unlocked: boolean
  customizable: boolean
  unlockAffection: number
  dailyLimit: number
  positive: CatPetInteractionEffect
  negative: CatPetInteractionEffect
  positiveProbability: number
  label: string
  description?: string
  feedback: CatPetInteractionFeedback
}

export interface CatPetDailyLimits extends CatPetActionCounters {}

export interface CatPetDailyUsage extends CatPetActionCounters {}

export interface CatPetRecentInteraction {
  action: CatPetAction
  label: string
  feedback?: string
  delta: number
  moodDelta: number
  outcome: CatPetOutcome
  affectionAfter: number
  moodScoreAfter: number
  performedAt: UnixMs
}

export interface CatPetState {
  affection: number
  affectionMax: number
  affectionMin: number
  mood: CatPetMood
  moodScore: number
  moodMax: number
  moodMin: number
  todayUsage: CatPetDailyUsage
  limits: CatPetDailyLimits
  interactions: CatPetInteractionDefinition[]
  interactionConfigs: CatPetInteractionConfig[]
  launchCount: number
  lastLaunchAt?: UnixMs
  lastSeenAt?: UnixMs
  awayMs?: number
  recent?: CatPetRecentInteraction
}

export interface CatPetPerformRequest {
  action: CatPetAction
}

export interface CatPetUpdateInteractionsRequest {
  interactions?: CatPetInteractionConfig[]
  customInteractions?: CatPetInteractionConfig[]
}

export type CatPetPerformResponse =
  | { ok: true; state: CatPetState; result: CatPetRecentInteraction }
  | { ok: false; reason: 'daily_limit' | 'disabled_action' | 'locked_action'; state: CatPetState }

export interface CatPetUpdateInteractionsResponse {
  state: CatPetState
}

export interface CatPetChangedEvent {
  state: CatPetState
  reason: CatPetChangeReason
}

export function emptyCatPetActionCounters(): CatPetActionCounters {
  return {
    pat: 0,
    tease: 0,
    custom_100: 0,
    custom_150: 0,
  }
}

export function defaultCatPetInteractionConfigs(): CatPetInteractionConfig[] {
  return CAT_PET_DEFAULT_INTERACTIONS.map((item) => ({ ...item }))
}

export function normalizeCatPetInteractionConfigs(input: unknown): CatPetInteractionConfig[] {
  const byId = new Map<CatPetAction, CatPetInteractionConfig>()
  const items = Array.isArray(input) ? input : []
  for (const item of items) {
    const record = asRecord(item)
    const id = normalizeInteractionConfigId(record?.id)
    if (!record || !id) {
      continue
    }
    byId.set(id, {
      id,
      enabled: record.enabled !== false,
      label: normalizeOptionalText(record.label, MAX_LABEL_LENGTH),
      description: normalizeOptionalText(record.description, MAX_DESCRIPTION_LENGTH),
      positiveFeedback: normalizeOptionalText(record.positiveFeedback, MAX_FEEDBACK_LENGTH),
      negativeFeedback: normalizeOptionalText(record.negativeFeedback, MAX_FEEDBACK_LENGTH),
    })
  }

  return defaultCatPetInteractionConfigs().map((fallback) => ({
    ...fallback,
    ...(byId.get(fallback.id) ?? {}),
  }))
}

export function isCatPetAction(value: unknown): value is CatPetAction {
  return typeof value === 'string' && (CAT_PET_ACTIONS as readonly string[]).includes(value)
}

export function isCatPetCustomAction(value: unknown): value is CatPetCustomAction {
  return typeof value === 'string' && (CAT_PET_CUSTOM_ACTIONS as readonly string[]).includes(value)
}

export function moodFromScore(score: number, affection = CAT_PET_AFFECTION_DEFAULT): CatPetMood {
  if (score <= -70 && affection <= 70) return 'angry'
  if (score <= -45) return affection <= 110 ? 'sad' : 'down'
  if (score <= -18) return 'down'
  if (score >= 72 && affection >= 150) return 'attached'
  if (score >= 28) return 'happy'
  return 'normal'
}

export function moodFromAffection(affection: number): CatPetMood {
  if (affection <= 30) return 'sad'
  if (affection <= 90) return 'down'
  if (affection <= 150) return 'normal'
  return 'happy'
}

function normalizeInteractionConfigId(value: unknown): CatPetAction | undefined {
  if (isCatPetAction(value)) {
    return value
  }
  if (value === 'custom_medium') {
    return 'custom_100'
  }
  if (value === 'custom_high') {
    return 'custom_150'
  }
  return undefined
}

function normalizeOptionalText(value: unknown, maxLength: number): string | undefined {
  const trimmed = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''
  return trimmed ? trimmed.slice(0, maxLength) : undefined
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}
