import type { CatPetRepo } from '@core/db/repos/cat-pet-repo'
import type { Logger } from '@core/logging'
import {
  CAT_PET_AFFECTION_MAX,
  CAT_PET_AFFECTION_MIN,
  CAT_PET_MOOD_MAX,
  CAT_PET_MOOD_MIN,
  type CatPetAction,
  type CatPetActionCounters,
  type CatPetChangedEvent,
  type CatPetChangeReason,
  type CatPetCustomInteractionConfig,
  type CatPetInteractionRisk,
  type CatPetPerformResponse,
  type CatPetRecentInteraction,
  type CatPetState,
  type CatPetUpdateInteractionsRequest,
  type CatPetUpdateInteractionsResponse,
  emptyCatPetActionCounters,
  isCatPetAction,
} from '@shared/types/cat-pet'
import {
  buildInteractionDefinitions,
  clampAffection,
  clampMoodScore,
  normalizeCustomInteractions,
  normalizePersistedMood,
  parseCustomInteractionsJson,
  petChatRuntimeInstruction,
  resolveInteractionOutcome,
  resolveLaunchEffect,
  serializeCustomInteractionsJson,
} from './internal/engine'

export interface CatPetManagerOptions {
  repo: CatPetRepo
  onChanged?: (event: CatPetChangedEvent) => void
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
  private readonly logger?: Logger
  private readonly randomSource: () => number
  private readonly nowFn: () => number
  private startupAwayMs = 0

  constructor(options: CatPetManagerOptions) {
    this.repo = options.repo
    this.onChanged = options.onChanged
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

  perform(action: CatPetAction): CatPetPerformResponse {
    if (!isCatPetAction(action)) {
      throw new Error(`Unknown cat pet action: ${String(action)}`)
    }

    const date = this.localDate()
    const customInteractions = this.currentCustomInteractions()
    const definitions = buildInteractionDefinitions(customInteractions)
    const definition = definitions.find((item) => item.id === action)
    if (!definition?.enabled) {
      return { ok: false, reason: 'disabled_action', state: this.buildState({ touchSeen: true }) }
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

    const persisted = this.repo.getState()
    const affection = clampAffection(persisted.affection)
    const moodScore = clampMoodScore(persisted.moodScore)
    const mood = normalizePersistedMood(persisted.mood, moodScore, affection)
    const outcome = resolveInteractionOutcome({
      action,
      vitals: { affection, mood, moodScore },
      customInteractions,
      random: this.randomSource(),
    })
    if (!outcome) {
      return { ok: false, reason: 'disabled_action', state: this.buildState({ touchSeen: true }) }
    }

    const performedAt = this.nowFn()
    const record = this.repo.applyInteraction({
      action,
      risk: outcome.risk,
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
      risk: record.risk,
      label: record.label,
      delta: record.delta,
      moodDelta: record.moodDelta,
      outcome: record.outcome,
      affectionAfter: record.affectionAfter,
      moodScoreAfter: record.moodScoreAfter,
      performedAt: record.performedAt,
    }

    this.logger?.debug('Cat pet interaction recorded.', {
      action,
      risk: outcome.risk,
      outcome: outcome.outcome,
      affectionDelta: outcome.affectionDelta,
      moodDelta: outcome.moodDelta,
      probability: outcome.positiveProbability,
      before: record.affectionBefore,
      after: record.affectionAfter,
    })

    const state = this.buildState({ touchSeen: false })
    this.broadcastState(state, 'action')
    return { ok: true, state, result }
  }

  updateInteractions(request: CatPetUpdateInteractionsRequest): CatPetUpdateInteractionsResponse {
    const customInteractions = normalizeCustomInteractions(request.customInteractions)
    this.repo.saveCustomInteractions({
      json: serializeCustomInteractionsJson(customInteractions),
      now: this.nowFn(),
    })
    const state = this.buildState({ touchSeen: true })
    this.broadcastState(state, 'config')
    return { state }
  }

  private buildState(options: BuildStateOptions = {}): CatPetState {
    const persisted = this.repo.getState()
    const affection = clampAffection(persisted.affection)
    const moodScore = clampMoodScore(persisted.moodScore)
    const mood = normalizePersistedMood(persisted.mood, moodScore, affection)
    const customInteractions = parseCustomInteractionsJson(persisted.customInteractionsJson)
    const interactions = buildInteractionDefinitions(customInteractions)
    const date = this.localDate()
    const usage = completeCounters(options.usageOverride ?? this.repo.getDailyUsage(date))
    const limits = completeCounters(
      Object.fromEntries(interactions.map((item) => [item.id, item.dailyLimit])) as Partial<
        Record<CatPetAction, number>
      >
    )
    const recent = this.latestInteraction(date, customInteractions)

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
      customInteractions,
      launchCount: persisted.launchCount,
      lastLaunchAt: persisted.lastLaunchAt,
      lastSeenAt: persisted.lastSeenAt,
      awayMs: this.startupAwayMs,
      recent,
    }
  }

  private latestInteraction(
    date: string,
    customInteractions: readonly CatPetCustomInteractionConfig[]
  ): CatPetRecentInteraction | undefined {
    const row = this.repo.getLatestInteraction(date)
    if (!row || !isCatPetAction(row.action)) {
      return undefined
    }

    const definition = buildInteractionDefinitions(customInteractions).find(
      (item) => item.id === row.action
    )
    const moodAfter = clampMoodScore(row.mood_score_after ?? 0)
    return {
      action: row.action,
      risk: normalizeRisk(row.risk, definition?.risk),
      label: row.label ?? definition?.label,
      delta: row.delta,
      moodDelta: row.mood_delta ?? 0,
      outcome: row.outcome,
      affectionAfter: row.affection_after,
      moodScoreAfter: moodAfter,
      performedAt: row.performed_at,
    }
  }

  private currentCustomInteractions(): CatPetCustomInteractionConfig[] {
    return parseCustomInteractionsJson(this.repo.getState().customInteractionsJson)
  }

  private broadcast(reason: CatPetChangeReason): void {
    if (!this.onChanged) return
    this.broadcastState(this.buildState({ touchSeen: false }), reason)
  }

  private broadcastState(state: CatPetState, reason: CatPetChangeReason): void {
    if (!this.onChanged) return
    try {
      this.onChanged({ state, reason })
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

function normalizeRisk(
  value: string | null | undefined,
  fallback: CatPetInteractionRisk | undefined
): CatPetInteractionRisk {
  return value === 'low' || value === 'medium' || value === 'high' ? value : (fallback ?? 'low')
}
