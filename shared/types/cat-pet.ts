import type { UnixMs } from './chat'

export const CAT_PET_AFFECTION_MAX = 200
export const CAT_PET_AFFECTION_MIN = 0
export const CAT_PET_AFFECTION_DEFAULT = 50

export const CAT_PET_DAILY_LIMITS = {
  pat: 2,
  tease: 1,
} as const

export type CatPetAction = 'pat' | 'tease'
export type CatPetMood = 'sad' | 'normal' | 'happy' | 'attached'
export type CatPetOutcome = 'positive' | 'negative'
export type CatPetChangeReason = 'init' | 'action' | 'refresh'

export interface CatPetDailyLimits {
  pat: number
  tease: number
}

export interface CatPetDailyUsage {
  pat: number
  tease: number
}

export interface CatPetRecentInteraction {
  action: CatPetAction
  delta: number
  outcome: CatPetOutcome
  affectionAfter: number
  performedAt: UnixMs
}

export interface CatPetState {
  affection: number
  affectionMax: number
  affectionMin: number
  mood: CatPetMood
  todayUsage: CatPetDailyUsage
  limits: CatPetDailyLimits
  recent?: CatPetRecentInteraction
}

export interface CatPetPerformRequest {
  action: CatPetAction
}

export type CatPetPerformResponse =
  | { ok: true; state: CatPetState; result: CatPetRecentInteraction }
  | { ok: false; reason: 'daily_limit'; state: CatPetState }

export interface CatPetChangedEvent {
  state: CatPetState
  reason: CatPetChangeReason
}

export function moodFromAffection(affection: number): CatPetMood {
  if (affection <= 40) return 'sad'
  if (affection <= 100) return 'normal'
  if (affection <= 160) return 'happy'
  return 'attached'
}
