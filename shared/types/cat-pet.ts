import type { UnixMs } from './chat'

export const CAT_PET_AFFECTION_MAX = 200
export const CAT_PET_AFFECTION_MIN = 0
export const CAT_PET_AFFECTION_DEFAULT = 50

export const CAT_PET_MOOD_MAX = 100
export const CAT_PET_MOOD_MIN = -100
export const CAT_PET_MOOD_DEFAULT = 0

export const CAT_PET_ACTIONS = [
  'pat',
  'tease',
  'feed',
  'custom_low',
  'custom_medium',
  'custom_high',
] as const

export const CAT_PET_CUSTOM_ACTIONS = ['custom_low', 'custom_medium', 'custom_high'] as const

export const CAT_PET_DAILY_LIMITS = {
  pat: 2,
  tease: 1,
  feed: 1,
  custom_low: 2,
  custom_medium: 1,
  custom_high: 1,
} as const satisfies Record<CatPetAction, number>

export type CatPetAction = (typeof CAT_PET_ACTIONS)[number]
export type CatPetCustomAction = (typeof CAT_PET_CUSTOM_ACTIONS)[number]
export type CatPetInteractionRisk = 'low' | 'medium' | 'high'
export type CatPetMood = 'angry' | 'sad' | 'down' | 'normal' | 'happy' | 'attached'
export type CatPetOutcome = 'positive' | 'negative'
export type CatPetChangeReason = 'init' | 'action' | 'refresh' | 'config' | 'launch'

export type CatPetActionCounters = Record<CatPetAction, number>

export interface CatPetInteractionEffect {
  affection: number
  mood: number
}

export interface CatPetInteractionDefinition {
  id: CatPetAction
  risk: CatPetInteractionRisk
  enabled: boolean
  customizable: boolean
  dailyLimit: number
  positive: CatPetInteractionEffect
  negative: CatPetInteractionEffect
  positiveProbability: number
  label?: string
  description?: string
}

export interface CatPetCustomInteractionConfig {
  id: CatPetCustomAction
  enabled: boolean
  label?: string
  description?: string
}

export interface CatPetDailyLimits extends CatPetActionCounters {}

export interface CatPetDailyUsage extends CatPetActionCounters {}

export interface CatPetRecentInteraction {
  action: CatPetAction
  risk: CatPetInteractionRisk
  label?: string
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
  customInteractions: CatPetCustomInteractionConfig[]
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
  customInteractions: CatPetCustomInteractionConfig[]
}

export type CatPetPerformResponse =
  | { ok: true; state: CatPetState; result: CatPetRecentInteraction }
  | { ok: false; reason: 'daily_limit' | 'disabled_action'; state: CatPetState }

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
    feed: 0,
    custom_low: 0,
    custom_medium: 0,
    custom_high: 0,
  }
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
