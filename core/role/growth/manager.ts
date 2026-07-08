import type { CatPetRepo } from '@core/db/repos/cat-pet-repo'
import type { Logger } from '@core/logging'
import { normalizePetGiftConfigs, normalizePetInteractionConfigs } from '@core/role/presets'
import {
  CAT_PET_AFFECTION_MAX,
  CAT_PET_AFFECTION_MIN,
  CAT_PET_MOOD_MAX,
  CAT_PET_MOOD_MIN,
  type CatPetAction,
  type CatPetActionCounters,
  type CatPetChangedEvent,
  type CatPetChangeReason,
  type CatPetDebugUnlockGiftResponse,
  type CatPetGiftConfig,
  type CatPetGiftUnlock,
  type CatPetInteractionConfig,
  type CatPetInteractionDefinition,
  type CatPetPerformResponse,
  type CatPetRecentInteraction,
  type CatPetState,
  type CatPetUpdateInteractionsRequest,
  type CatPetUpdateInteractionsResponse,
  emptyCatPetActionCounters,
  isCatPetAction,
} from '@shared/types/cat-pet'
import {
  buildGiftDefinitions,
  buildInteractionDefinitions,
  clampAffection,
  clampMoodScore,
  normalizePersistedMood,
  parseInteractionConfigsJson,
  petChatRuntimeInstruction,
  resolveInteractionOutcome,
  resolveLaunchEffect,
  resolvePendingGiftUnlock,
  serializeInteractionConfigsJson,
} from './engine'

export interface CatPetManagerOptions {
  repo: CatPetRepo
  onChanged?: (event: CatPetChangedEvent) => void
  interactionConfigs?: () => readonly CatPetInteractionConfig[] | undefined
  saveInteractionConfigs?: (configs: CatPetInteractionConfig[]) => void
  giftConfigs?: () => readonly CatPetGiftConfig[] | undefined
  activeRoleId?: () => string | undefined
  onGiftUnlocked?: (event: CatPetGiftUnlock) => void
  logger?: Logger
  randomSource?: () => number
  now?: () => number
}

interface BuildStateOptions {
  usageOverride?: Partial<Record<CatPetAction, number>>
  touchSeen?: boolean
}

export class CatPetManager {
  private readonly repo: CatPetRepo
  private readonly onChanged?: (event: CatPetChangedEvent) => void
  private readonly interactionConfigs?: () => readonly CatPetInteractionConfig[] | undefined
  private readonly saveInteractionConfigs?: (configs: CatPetInteractionConfig[]) => void
  private readonly giftConfigs?: () => readonly CatPetGiftConfig[] | undefined
  private readonly activeRoleId?: () => string | undefined
  private readonly onGiftUnlocked?: (event: CatPetGiftUnlock) => void
  private readonly logger?: Logger
  private readonly randomSource: () => number
  private readonly nowFn: () => number
  private startupAwayMs = 0

  constructor(options: CatPetManagerOptions) {
    this.repo = options.repo
    this.onChanged = options.onChanged
    this.interactionConfigs = options.interactionConfigs
    this.saveInteractionConfigs = options.saveInteractionConfigs
    this.giftConfigs = options.giftConfigs
    this.activeRoleId = options.activeRoleId
    this.onGiftUnlocked = options.onGiftUnlocked
    this.logger = options.logger
    this.randomSource = options.randomSource ?? Math.random
    this.nowFn = options.now ?? Date.now
  }

  recordLaunch(): void {
    const now = this.nowFn()
    const persisted = this.repo.getState()
    const affection = clampAffection(persisted.affection)
    const moodScore = clampMoodScore(persisted.moodScore)
    const mood = normalizePersistedMood(persisted.mood, moodScore, affection)
    const effect = resolveLaunchEffect({
      vitals: { affection, mood, moodScore },
      now,
      lastSeenAt: persisted.lastSeenAt ?? persisted.lastLaunchAt,
    })

    this.startupAwayMs = effect.awayMs
    this.repo.recordLaunch({
      now,
      mood: effect.moodAfter,
      moodScore: effect.moodScoreAfter,
    })
    if (effect.moodDelta !== 0) {
      this.maybeUnlockGift({
        affection,
        mood: effect.moodAfter,
        unlockedAt: now,
      })
    }

    if (effect.moodDelta !== 0) {
      this.logger?.debug('Cat pet launch mood adjusted.', {
        awayMs: effect.awayMs,
        moodDelta: effect.moodDelta,
        mood: effect.moodAfter,
      })
    }
  }

  getState(): CatPetState {
    return this.buildState({ touchSeen: true })
  }

  getChatRuntimeInstruction(): string {
    return petChatRuntimeInstruction(this.buildState({ touchSeen: true }))
  }

  emitInitial(): void {
    this.broadcast('init')
  }

  emitConfigChanged(): void {
    this.broadcast('config')
  }

  perform(action: CatPetAction): CatPetPerformResponse {
    if (!isCatPetAction(action)) {
      throw new Error(`Unknown cat pet action: ${String(action)}`)
    }

    const date = this.localDate()
    const interactionConfigs = this.currentInteractionConfigs()
    const persisted = this.repo.getState()
    const affection = clampAffection(persisted.affection)
    const moodScore = clampMoodScore(persisted.moodScore)
    const mood = normalizePersistedMood(persisted.mood, moodScore, affection)
    const definition = buildInteractionDefinitions(interactionConfigs, affection).find(
      (item) => item.id === action
    )

    if (!definition?.enabled) {
      return { ok: false, reason: 'disabled_action', state: this.buildState({ touchSeen: true }) }
    }
    if (!definition.unlocked) {
      return { ok: false, reason: 'locked_action', state: this.buildState({ touchSeen: true }) }
    }

    const usage = this.repo.getDailyUsage(date)
    const used = usage[action] ?? 0
    if (used >= definition.dailyLimit) {
      return {
        ok: false,
        reason: 'daily_limit',
        state: this.buildState({ usageOverride: usage, touchSeen: true }),
      }
    }

    const outcome = resolveInteractionOutcome({
      action,
      vitals: { affection, mood, moodScore },
      interactionConfigs,
      random: this.randomSource(),
    })
    if (!outcome) {
      return { ok: false, reason: 'disabled_action', state: this.buildState({ touchSeen: true }) }
    }

    const performedAt = this.nowFn()
    const record = this.repo.applyInteraction({
      action,
      label: definition.label,
      delta: outcome.affectionDelta,
      moodDelta: outcome.moodDelta,
      outcome: outcome.outcome,
      affectionBefore: outcome.affectionBefore,
      affectionAfter: outcome.affectionAfter,
      moodBefore: outcome.moodBefore,
      moodAfter: outcome.moodAfter,
      moodScoreBefore: outcome.moodScoreBefore,
      moodScoreAfter: outcome.moodScoreAfter,
      performedAt,
      performedDate: date,
    })

    const result: CatPetRecentInteraction = {
      action,
      label: record.label ?? definition.label,
      feedback: outcome.feedback,
      delta: record.delta,
      moodDelta: record.moodDelta,
      outcome: record.outcome,
      affectionAfter: record.affectionAfter,
      moodScoreAfter: record.moodScoreAfter,
      performedAt: record.performedAt,
    }

    this.logger?.debug('Cat pet interaction recorded.', {
      action,
      outcome: outcome.outcome,
      affectionDelta: outcome.affectionDelta,
      moodDelta: outcome.moodDelta,
      probability: outcome.positiveProbability,
      before: record.affectionBefore,
      after: record.affectionAfter,
    })

    const giftUnlock = this.maybeUnlockGift({
      affection: outcome.affectionAfter,
      mood: outcome.moodAfter,
      unlockedAt: performedAt,
    })
    const state = this.buildState({ touchSeen: false })
    this.broadcastState(state, 'action', giftUnlock)
    return { ok: true, state, result, ...(giftUnlock ? { giftUnlock } : {}) }
  }

  updateInteractions(request: CatPetUpdateInteractionsRequest): CatPetUpdateInteractionsResponse {
    const interactionConfigs = normalizePetInteractionConfigs(
      request.interactions ?? request.customInteractions
    )
    this.saveInteractionConfigs?.(interactionConfigs)
    this.repo.saveCustomInteractions({
      json: serializeInteractionConfigsJson(interactionConfigs),
      now: this.nowFn(),
    })
    const state = this.buildState({ touchSeen: true })
    this.broadcastState(state, 'config')
    return { state }
  }

  debugUnlockNextGift(): CatPetDebugUnlockGiftResponse {
    const giftUnlock = this.maybeUnlockGift({
      affection: CAT_PET_AFFECTION_MAX,
      mood: 'happy',
      unlockedAt: this.nowFn(),
    })
    const state = this.buildState({ touchSeen: false })
    this.broadcastState(state, 'config', giftUnlock)
    return { state, ...(giftUnlock ? { giftUnlock } : {}) }
  }

  private buildState(options: BuildStateOptions = {}): CatPetState {
    const persisted = this.repo.getState()
    const affection = clampAffection(persisted.affection)
    const moodScore = clampMoodScore(persisted.moodScore)
    const mood = normalizePersistedMood(persisted.mood, moodScore, affection)
    const interactionConfigs = this.currentInteractionConfigs()
    const interactions = buildInteractionDefinitions(interactionConfigs, affection)
    const roleId = this.currentRoleId()
    const giftConfigs = this.currentGiftConfigs()
    const unlockedGifts = this.repo.listGiftUnlocks(roleId)
    const unlockedGiftIds = new Set(unlockedGifts.map((gift) => gift.id))
    const gifts = buildGiftDefinitions({
      giftConfigs,
      unlockedGiftIds,
      affection,
    })
    const date = this.localDate()
    const usage = completeCounters(options.usageOverride ?? this.repo.getDailyUsage(date))
    const limits = completeCounters(
      Object.fromEntries(interactions.map((item) => [item.id, item.dailyLimit])) as Partial<
        Record<CatPetAction, number>
      >
    )
    const recent = this.latestInteraction(date, interactions)

    if (options.touchSeen) {
      this.repo.touchSeen(this.nowFn())
    }

    return {
      affection,
      affectionMax: CAT_PET_AFFECTION_MAX,
      affectionMin: CAT_PET_AFFECTION_MIN,
      mood,
      moodScore,
      moodMax: CAT_PET_MOOD_MAX,
      moodMin: CAT_PET_MOOD_MIN,
      todayUsage: usage,
      limits,
      interactions,
      interactionConfigs,
      gifts,
      giftConfigs,
      unlockedGifts,
      launchCount: persisted.launchCount,
      lastLaunchAt: persisted.lastLaunchAt,
      lastSeenAt: persisted.lastSeenAt,
      awayMs: this.startupAwayMs,
      recent,
    }
  }

  private latestInteraction(
    date: string,
    interactions: readonly CatPetInteractionDefinition[]
  ): CatPetRecentInteraction | undefined {
    const row = this.repo.getLatestInteraction(date)
    if (!row || !isCatPetAction(row.action)) {
      return undefined
    }

    const definition = interactions.find((item) => item.id === row.action)
    const moodAfter = clampMoodScore(row.mood_score_after ?? 0)
    const label = row.label ?? definition?.label ?? row.action
    const feedback = definition?.feedback[row.outcome]
    return {
      action: row.action,
      label,
      feedback,
      delta: row.delta,
      moodDelta: row.mood_delta ?? 0,
      outcome: row.outcome,
      affectionAfter: row.affection_after,
      moodScoreAfter: moodAfter,
      performedAt: row.performed_at,
    }
  }

  private currentInteractionConfigs(): CatPetInteractionConfig[] {
    const fromRole = this.interactionConfigs?.()
    if (fromRole) {
      return normalizePetInteractionConfigs(fromRole)
    }
    return parseInteractionConfigsJson(this.repo.getState().customInteractionsJson)
  }

  private currentGiftConfigs(): CatPetGiftConfig[] {
    return normalizePetGiftConfigs(this.giftConfigs?.())
  }

  private currentRoleId(): string {
    return this.activeRoleId?.()?.trim() || 'default'
  }

  private maybeUnlockGift(input: {
    affection: number
    mood: CatPetGiftUnlock['mood']
    unlockedAt: number
  }): CatPetGiftUnlock | undefined {
    const roleId = this.currentRoleId()
    const giftConfigs = this.currentGiftConfigs()
    const unlockedGiftIds = new Set(this.repo.listGiftUnlocks(roleId).map((gift) => gift.id))
    const candidate = resolvePendingGiftUnlock({
      giftConfigs,
      unlockedGiftIds,
      affection: input.affection,
      mood: input.mood,
    })
    if (!candidate) {
      return undefined
    }

    this.repo.recordGiftUnlock({
      roleId,
      giftId: candidate.gift.id,
      unlockedAt: input.unlockedAt,
    })
    const giftUnlock: CatPetGiftUnlock = {
      roleId,
      gift: {
        ...candidate.gift,
        ...(candidate.gift.image ? { image: { ...candidate.gift.image } } : {}),
        storyLines: [...candidate.gift.storyLines],
      },
      affection: candidate.affection,
      mood: candidate.mood,
      unlockedAt: input.unlockedAt,
    }
    this.logger?.debug('Cat pet gift unlocked.', {
      roleId,
      giftId: candidate.gift.id,
      affection: candidate.affection,
      mood: candidate.mood,
    })
    try {
      this.onGiftUnlocked?.(giftUnlock)
    } catch (error) {
      this.logger?.warn('Cat pet gift unlock callback failed.', { error })
    }
    return giftUnlock
  }

  private broadcast(reason: CatPetChangeReason): void {
    if (!this.onChanged) return
    this.broadcastState(this.buildState({ touchSeen: false }), reason)
  }

  private broadcastState(
    state: CatPetState,
    reason: CatPetChangeReason,
    giftUnlock?: CatPetGiftUnlock
  ): void {
    if (!this.onChanged) return
    try {
      this.onChanged({ state, reason, ...(giftUnlock ? { giftUnlock } : {}) })
    } catch (error) {
      this.logger?.warn('Cat pet change broadcast failed.', { error })
    }
  }

  private localDate(): string {
    const d = new Date(this.nowFn())
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }
}

function completeCounters(values: Partial<Record<CatPetAction, number>>): CatPetActionCounters {
  const counters = emptyCatPetActionCounters()
  for (const key of Object.keys(values)) {
    if (isCatPetAction(key)) {
      counters[key] = Math.max(0, Math.floor(values[key] ?? 0))
    }
  }
  return counters
}
