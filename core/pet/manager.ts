import type { CatPetRepo } from '@core/db/repos/cat-pet-repo'
import type { Logger } from '@core/logging'
import {
  CAT_PET_AFFECTION_MAX,
  CAT_PET_AFFECTION_MIN,
  CAT_PET_DAILY_LIMITS,
  type CatPetAction,
  type CatPetChangedEvent,
  type CatPetChangeReason,
  type CatPetOutcome,
  type CatPetPerformResponse,
  type CatPetRecentInteraction,
  type CatPetState,
  moodFromAffection,
} from '@shared/types/cat-pet'

interface ActionDef {
  positiveDelta: number
  negativeDelta: number
  positiveProbability: number
}

const ACTION_TABLE: Record<CatPetAction, ActionDef> = {
  pat: { positiveDelta: 1, negativeDelta: -1, positiveProbability: 0.8 },
  tease: { positiveDelta: 3, negativeDelta: -2, positiveProbability: 0.6 },
}

export interface CatPetManagerOptions {
  repo: CatPetRepo
  onChanged?: (event: CatPetChangedEvent) => void
  logger?: Logger
  /** Test seam: deterministic outcome decider. Defaults to Math.random-based. */
  randomSource?: () => number
  /** Test seam: clock. Defaults to Date.now. */
  now?: () => number
}

export class CatPetManager {
  private readonly repo: CatPetRepo
  private readonly onChanged?: (event: CatPetChangedEvent) => void
  private readonly logger?: Logger
  private readonly randomSource: () => number
  private readonly nowFn: () => number

  constructor(options: CatPetManagerOptions) {
    this.repo = options.repo
    this.onChanged = options.onChanged
    this.logger = options.logger
    this.randomSource = options.randomSource ?? Math.random
    this.nowFn = options.now ?? Date.now
  }

  getState(): CatPetState {
    return this.buildState()
  }

  /** Called once during core boot to emit the initial broadcast. */
  emitInitial(): void {
    this.broadcast('init')
  }

  perform(action: CatPetAction): CatPetPerformResponse {
    const def = ACTION_TABLE[action]
    if (!def) {
      throw new Error(`Unknown cat pet action: ${action}`)
    }

    const date = this.localDate()
    const usage = this.repo.getDailyUsage(date)
    const limit = CAT_PET_DAILY_LIMITS[action]
    const used = action === 'pat' ? usage.pat : usage.tease

    if (used >= limit) {
      return { ok: false, reason: 'daily_limit', state: this.buildState(usage) }
    }

    const positive = this.randomSource() < def.positiveProbability
    const outcome: CatPetOutcome = positive ? 'positive' : 'negative'
    const delta = positive ? def.positiveDelta : def.negativeDelta
    const performedAt = this.nowFn()

    const record = this.repo.applyInteraction({
      action,
      delta,
      outcome,
      performedAt,
      performedDate: date,
      affectionMin: CAT_PET_AFFECTION_MIN,
      affectionMax: CAT_PET_AFFECTION_MAX,
    })

    const result: CatPetRecentInteraction = {
      action,
      delta: record.delta,
      outcome: record.outcome,
      affectionAfter: record.affectionAfter,
      performedAt: record.performedAt,
    }

    this.logger?.debug('Cat pet interaction recorded.', {
      action,
      outcome,
      delta,
      before: record.affectionBefore,
      after: record.affectionAfter,
    })

    const state = this.buildState()
    this.broadcastState(state, 'action')
    return { ok: true, state, result }
  }

  private buildState(usageOverride?: { pat: number; tease: number }): CatPetState {
    const affection = this.repo.getAffection()
    const date = this.localDate()
    const usage = usageOverride ?? this.repo.getDailyUsage(date)
    const recentRow = this.repo.getLatestInteraction(date)
    const recent: CatPetRecentInteraction | undefined = recentRow
      ? {
          action: recentRow.action,
          delta: recentRow.delta,
          outcome: recentRow.outcome,
          affectionAfter: recentRow.affection_after,
          performedAt: recentRow.performed_at,
        }
      : undefined

    return {
      affection,
      affectionMax: CAT_PET_AFFECTION_MAX,
      affectionMin: CAT_PET_AFFECTION_MIN,
      mood: moodFromAffection(affection),
      todayUsage: usage,
      limits: {
        pat: CAT_PET_DAILY_LIMITS.pat,
        tease: CAT_PET_DAILY_LIMITS.tease,
      },
      recent,
    }
  }

  private broadcast(reason: CatPetChangeReason): void {
    if (!this.onChanged) return
    this.broadcastState(this.buildState(), reason)
  }

  private broadcastState(state: CatPetState, reason: CatPetChangeReason): void {
    if (!this.onChanged) return
    try {
      this.onChanged({ state, reason })
    } catch (error) {
      this.logger?.warn('Cat pet change broadcast failed.', { error })
    }
  }

  /** Local YYYY-MM-DD; daily limit uses the user's local timezone. */
  private localDate(): string {
    const d = new Date(this.nowFn())
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }
}
