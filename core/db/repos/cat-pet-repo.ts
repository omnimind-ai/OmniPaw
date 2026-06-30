import type { CatPetAction, CatPetOutcome } from '@shared/types/cat-pet'
import type { DatabaseConnection } from '../client'

interface PetStateRow {
  affection: number
  updated_at: number
}

interface InteractionLogRow {
  action: CatPetAction
  delta: number
  outcome: CatPetOutcome
  affection_after: number
  performed_at: number
}

interface DailyUsageRow {
  action: CatPetAction
  total: number
}

export interface CatPetInteractionRecord {
  action: CatPetAction
  delta: number
  outcome: CatPetOutcome
  affectionBefore: number
  affectionAfter: number
  performedAt: number
  performedDate: string
}

export class CatPetRepo {
  constructor(private readonly db: DatabaseConnection) {}

  getAffection(): number {
    const row = this.db
      .prepare('SELECT affection, updated_at FROM cat_pet_state WHERE id = 1')
      .get() as PetStateRow | undefined
    return row?.affection ?? 50
  }

  getDailyUsage(date: string): { pat: number; tease: number } {
    const rows = this.db
      .prepare(
        `SELECT action, COUNT(*) AS total
         FROM cat_pet_interaction_log
         WHERE performed_date = ?
         GROUP BY action`
      )
      .all(date) as DailyUsageRow[]
    const usage = { pat: 0, tease: 0 }
    for (const row of rows) {
      if (row.action === 'pat') usage.pat = row.total
      else if (row.action === 'tease') usage.tease = row.total
    }
    return usage
  }

  getLatestInteraction(date: string): InteractionLogRow | undefined {
    return this.db
      .prepare(
        `SELECT action, delta, outcome, affection_after, performed_at
         FROM cat_pet_interaction_log
         WHERE performed_date = ?
         ORDER BY performed_at DESC
         LIMIT 1`
      )
      .get(date) as InteractionLogRow | undefined
  }

  /**
   * Applies an interaction atomically: clamps affection, persists the new value, and writes the log row.
   * Returns the resulting record so the manager can build a response without an extra read.
   */
  applyInteraction(input: {
    action: CatPetAction
    delta: number
    outcome: CatPetOutcome
    performedAt: number
    performedDate: string
    affectionMin: number
    affectionMax: number
  }): CatPetInteractionRecord {
    const transact = this.db.transaction((args: typeof input) => {
      const stateRow = this.db.prepare('SELECT affection FROM cat_pet_state WHERE id = 1').get() as
        | { affection: number }
        | undefined
      const before = stateRow?.affection ?? 50
      const after = Math.max(args.affectionMin, Math.min(args.affectionMax, before + args.delta))

      this.db
        .prepare(
          `UPDATE cat_pet_state
           SET affection = ?, updated_at = ?
           WHERE id = 1`
        )
        .run(after, args.performedAt)

      this.db
        .prepare(
          `INSERT INTO cat_pet_interaction_log
             (action, delta, outcome, affection_before, affection_after, performed_at, performed_date)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          args.action,
          args.delta,
          args.outcome,
          before,
          after,
          args.performedAt,
          args.performedDate
        )

      return { before, after }
    })

    const { before, after } = transact(input)
    return {
      action: input.action,
      delta: input.delta,
      outcome: input.outcome,
      affectionBefore: before,
      affectionAfter: after,
      performedAt: input.performedAt,
      performedDate: input.performedDate,
    }
  }
}
