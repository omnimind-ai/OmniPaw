import {
  CAT_PET_ACTIONS,
  CAT_PET_CUSTOM_ACTIONS,
  CAT_PET_DAILY_LIMITS,
  CAT_PET_UNLOCK_AFFECTION,
  createDefaultPetInteractionConfigs,
  isPresetCatPetAction,
  isPresetCatPetCustomAction,
  normalizePetInteractionConfigs,
} from '../../core/pet/presets/interactions'
import type { UnixMs } from './chat'

export const CAT_PET_AFFECTION_MAX = 200
export const CAT_PET_AFFECTION_MIN = 0
export const CAT_PET_AFFECTION_DEFAULT = 50

export const CAT_PET_MOOD_MAX = 100
export const CAT_PET_MOOD_MIN = -100
export const CAT_PET_MOOD_DEFAULT = 0

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
  return createDefaultPetInteractionConfigs()
}

export function normalizeCatPetInteractionConfigs(input: unknown): CatPetInteractionConfig[] {
  return normalizePetInteractionConfigs(input)
}

export function isCatPetAction(value: unknown): value is CatPetAction {
  return isPresetCatPetAction(value)
}

export function isCatPetCustomAction(value: unknown): value is CatPetCustomAction {
  return isPresetCatPetCustomAction(value)
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

export { CAT_PET_ACTIONS, CAT_PET_CUSTOM_ACTIONS, CAT_PET_DAILY_LIMITS, CAT_PET_UNLOCK_AFFECTION }
