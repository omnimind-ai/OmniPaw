import type {
  CatPetAction,
  CatPetMood,
  CatPetOutcome,
  CatPetUnlockedGiftRecord,
} from '@shared/types/cat-pet'
import { isCatPetAction } from '@shared/types/cat-pet'
import type { DatabaseConnection } from '../client'

interface PetStateRow {
  affection: number
  mood?: string
  mood_score?: number
  custom_interactions_json?: string | null
  last_launch_at?: number | null
  last_seen_at?: number | null
  launch_count?: number | null
  updated_at: number
}

export interface CatPetLatestInteractionRow {
  action: string
  delta: number
  outcome: CatPetOutcome
  affection_after: number
  performed_at: number
  mood_delta?: number | null
  mood_after?: string | null
  mood_score_after?: number | null
  label?: string | null
}

interface DailyUsageRow {
  action: string
  total: number
}

interface GiftUnlockRow {
  gift_id: string
  role_id: string
  unlocked_at: number
}

export interface CatPetPersistedState {
  affection: number
  mood?: string
  moodScore: number
  customInteractionsJson?: string
  lastLaunchAt?: number
  lastSeenAt?: number
  launchCount: number
  updatedAt: number
}

export interface CatPetInteractionRecord {
  action: CatPetAction
  label?: string
  delta: number
  moodDelta: number
  outcome: CatPetOutcome
  affectionBefore: number
  affectionAfter: number
  moodBefore: CatPetMood
  moodAfter: CatPetMood
  moodScoreBefore: number
  moodScoreAfter: number
  performedAt: number
  performedDate: string
}

export class CatPetRepo {
  constructor(private readonly db: DatabaseConnection) {}

  getState(): CatPetPersistedState {
    const row = this.db
      .prepare(
        `SELECT affection, mood, mood_score, custom_interactions_json, last_launch_at,
                last_seen_at, launch_count, updated_at
         FROM cat_pet_state
         WHERE id = 1`
      )
      .get() as PetStateRow | undefined

    if (!row) {
      const now = Date.now()
      this.ensureStateRow(now)
      return {
        affection: 50,
        moodScore: 0,
        launchCount: 0,
        updatedAt: now,
      }
    }

    return {
      affection: row.affection,
      mood: row.mood,
      moodScore: row.mood_score ?? 0,
      customInteractionsJson: row.custom_interactions_json ?? undefined,
      lastLaunchAt: row.last_launch_at ?? undefined,
      lastSeenAt: row.last_seen_at ?? undefined,
      launchCount: row.launch_count ?? 0,
      updatedAt: row.updated_at,
    }
  }

  getAffection(): number {
    return this.getState().affection
  }

  getDailyUsage(date: string): Partial<Record<CatPetAction, number>> {
    const rows = this.db
      .prepare(
        `SELECT action, COUNT(*) AS total
         FROM cat_pet_interaction_log
         WHERE performed_date = ?
         GROUP BY action`
      )
      .all(date) as DailyUsageRow[]
    const usage: Partial<Record<CatPetAction, number>> = {}
    for (const row of rows) {
      if (isCatPetAction(row.action)) {
        usage[row.action] = row.total
      }
    }
    return usage
  }

  getLatestInteraction(date: string): CatPetLatestInteractionRow | undefined {
    return this.db
      .prepare(
        `SELECT action, delta, outcome, affection_after, performed_at, mood_delta,
                mood_after, mood_score_after, label
         FROM cat_pet_interaction_log
         WHERE performed_date = ?
         ORDER BY performed_at DESC
         LIMIT 1`
      )
      .get(date) as CatPetLatestInteractionRow | undefined
  }

  listGiftUnlocks(roleId: string): CatPetUnlockedGiftRecord[] {
    return (
      this.db
        .prepare(
          `SELECT gift_id, role_id, unlocked_at
           FROM cat_pet_gift_unlocks
           WHERE role_id = ?
           ORDER BY unlocked_at ASC`
        )
        .all(roleId) as GiftUnlockRow[]
    ).map((row) => ({
      id: row.gift_id,
      roleId: row.role_id,
      unlockedAt: row.unlocked_at,
    }))
  }

  recordGiftUnlock(input: { roleId: string; giftId: string; unlockedAt: number }): void {
    this.db
      .prepare(
        `INSERT OR IGNORE INTO cat_pet_gift_unlocks
           (role_id, gift_id, unlocked_at)
         VALUES (?, ?, ?)`
      )
      .run(input.roleId, input.giftId, input.unlockedAt)
  }

  recordLaunch(input: { now: number; mood: CatPetMood; moodScore: number }): void {
    this.ensureStateRow(input.now)
    this.db
      .prepare(
        `UPDATE cat_pet_state
         SET mood = ?, mood_score = ?, last_launch_at = ?, last_seen_at = ?,
             launch_count = launch_count + 1, updated_at = ?
         WHERE id = 1`
      )
      .run(input.mood, input.moodScore, input.now, input.now, input.now)
  }

  touchSeen(now: number): void {
    this.ensureStateRow(now)
    this.db
      .prepare(
        `UPDATE cat_pet_state
         SET last_seen_at = ?, updated_at = ?
         WHERE id = 1`
      )
      .run(now, now)
  }

  saveCustomInteractions(input: { json: string; now: number }): void {
    this.ensureStateRow(input.now)
    this.db
      .prepare(
        `UPDATE cat_pet_state
         SET custom_interactions_json = ?, updated_at = ?
         WHERE id = 1`
      )
      .run(input.json, input.now)
  }

  applyInteraction(input: CatPetInteractionRecord): CatPetInteractionRecord {
    const transact = this.db.transaction((args: CatPetInteractionRecord) => {
      this.ensureStateRow(args.performedAt)
      this.db
        .prepare(
          `UPDATE cat_pet_state
           SET affection = ?, mood = ?, mood_score = ?, last_seen_at = ?, updated_at = ?
           WHERE id = 1`
        )
        .run(
          args.affectionAfter,
          args.moodAfter,
          args.moodScoreAfter,
          args.performedAt,
          args.performedAt
        )

      this.db
        .prepare(
          `INSERT INTO cat_pet_interaction_log
             (action, delta, outcome, affection_before, affection_after, performed_at,
              performed_date, mood_delta, mood_before, mood_after, mood_score_before,
              mood_score_after, label)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          args.action,
          args.delta,
          args.outcome,
          args.affectionBefore,
          args.affectionAfter,
          args.performedAt,
          args.performedDate,
          args.moodDelta,
          args.moodBefore,
          args.moodAfter,
          args.moodScoreBefore,
          args.moodScoreAfter,
          args.label ?? null
        )
    })

    transact(input)
    return input
  }

  private ensureStateRow(now: number): void {
    this.db
      .prepare(
        `INSERT OR IGNORE INTO cat_pet_state
           (id, affection, mood, mood_score, created_at, updated_at)
         VALUES (1, 50, 'normal', 0, ?, ?)`
      )
      .run(now, now)
  }
}
