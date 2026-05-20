import type { CronRun, CronRunError, CronRunReason, CronRunStatus } from '@shared/types/cron'
import type { DatabaseConnection } from '../client'
import { decodeJson, encodeJson } from '../json'

interface CronRunRow {
  id: string
  task_id: string
  reason: CronRunReason
  status: CronRunStatus
  scheduled_for: number | null
  started_at: number | null
  completed_at: number | null
  duration_ms: number | null
  result_message_id: string | null
  result_summary: string | null
  error_json: string | null
  created_at: number
  updated_at: number
}

export interface ListCronRunsOptions {
  taskId?: string
  sessionId?: string
  limit?: number
}

export interface StartCronRunInput {
  taskId: string
  reason: CronRunReason
  scheduledFor?: number
  startedAt?: number
}

export interface FinishCronRunInput {
  status: Exclude<CronRunStatus, 'running'>
  completedAt?: number
  resultMessageId?: string
  resultSummary?: string
  error?: CronRunError
}

export class CronRunRepo {
  constructor(private readonly db: DatabaseConnection) {}

  get(id: string): CronRun | undefined {
    const row = this.db.prepare('SELECT * FROM cron_runs WHERE id = ?').get(id) as
      | CronRunRow
      | undefined
    return row ? mapCronRun(row) : undefined
  }

  list(options: ListCronRunsOptions = {}): CronRun[] {
    const params: Record<string, unknown> = { limit: normalizeLimit(options.limit) }
    const filters: string[] = []
    let join = ''
    if (options.taskId) {
      filters.push('runs.task_id = @taskId')
      params.taskId = options.taskId
    }
    if (options.sessionId) {
      join = 'JOIN cron_tasks tasks ON tasks.id = runs.task_id'
      filters.push('(tasks.source_session_id = @sessionId OR tasks.target_session_id = @sessionId)')
      params.sessionId = options.sessionId
    }
    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : ''
    return this.db
      .prepare(
        `
          SELECT runs.* FROM cron_runs runs
          ${join}
          ${where}
          ORDER BY runs.created_at DESC
          LIMIT @limit
        `
      )
      .all(params)
      .map((row) => mapCronRun(row as CronRunRow))
  }

  listRunning(): CronRun[] {
    return this.db
      .prepare("SELECT * FROM cron_runs WHERE status = 'running' ORDER BY started_at ASC")
      .all()
      .map((row) => mapCronRun(row as CronRunRow))
  }

  create(run: CronRun): CronRun {
    this.db
      .prepare(
        `
          INSERT INTO cron_runs (
            id, task_id, reason, status, scheduled_for, started_at, completed_at,
            duration_ms, result_message_id, result_summary, error_json, created_at, updated_at
          ) VALUES (
            @id, @taskId, @reason, @status, @scheduledFor, @startedAt, @completedAt,
            @durationMs, @resultMessageId, @resultSummary, @errorJson, @createdAt, @updatedAt
          )
        `
      )
      .run(toCronRunParams(run))
    return this.get(run.id) ?? run
  }

  createRunning(input: StartCronRunInput): CronRun {
    const now = input.startedAt ?? Date.now()
    return this.create({
      id: crypto.randomUUID(),
      taskId: input.taskId,
      reason: input.reason,
      status: 'running',
      scheduledFor: input.scheduledFor,
      startedAt: now,
      createdAt: now,
      updatedAt: now,
    })
  }

  createTerminal(input: {
    taskId: string
    reason: CronRunReason
    status: Exclude<CronRunStatus, 'running'>
    scheduledFor?: number
    error?: CronRunError
    createdAt?: number
  }): CronRun {
    const now = input.createdAt ?? Date.now()
    return this.create({
      id: crypto.randomUUID(),
      taskId: input.taskId,
      reason: input.reason,
      status: input.status,
      scheduledFor: input.scheduledFor,
      completedAt: now,
      error: input.error,
      createdAt: now,
      updatedAt: now,
    })
  }

  finish(id: string, input: FinishCronRunInput): CronRun | undefined {
    const existing = this.get(id)
    if (!existing) {
      return undefined
    }
    const completedAt = input.completedAt ?? Date.now()
    const startedAt = existing.startedAt ?? completedAt
    this.db
      .prepare(
        `
          UPDATE cron_runs
          SET status = @status,
              completed_at = @completedAt,
              duration_ms = @durationMs,
              result_message_id = @resultMessageId,
              result_summary = @resultSummary,
              error_json = @errorJson,
              updated_at = @completedAt
          WHERE id = @id
        `
      )
      .run({
        id,
        status: input.status,
        completedAt,
        durationMs: Math.max(0, completedAt - startedAt),
        resultMessageId: input.resultMessageId ?? null,
        resultSummary: input.resultSummary ?? null,
        errorJson: encodeJson(input.error),
      })
    return this.get(id)
  }
}

function mapCronRun(row: CronRunRow): CronRun {
  return {
    id: row.id,
    taskId: row.task_id,
    reason: row.reason,
    status: row.status,
    scheduledFor: row.scheduled_for ?? undefined,
    startedAt: row.started_at ?? undefined,
    completedAt: row.completed_at ?? undefined,
    durationMs: row.duration_ms ?? undefined,
    resultMessageId: row.result_message_id ?? undefined,
    resultSummary: row.result_summary ?? undefined,
    error: decodeJson<CronRunError | undefined>(row.error_json, undefined),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toCronRunParams(run: CronRun): Record<string, unknown> {
  return {
    id: run.id,
    taskId: run.taskId,
    reason: run.reason,
    status: run.status,
    scheduledFor: run.scheduledFor ?? null,
    startedAt: run.startedAt ?? null,
    completedAt: run.completedAt ?? null,
    durationMs: run.durationMs ?? null,
    resultMessageId: run.resultMessageId ?? null,
    resultSummary: run.resultSummary ?? null,
    errorJson: encodeJson(run.error),
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
  }
}

function normalizeLimit(value: number | undefined): number {
  if (!Number.isFinite(value)) {
    return 50
  }
  return Math.max(1, Math.min(Math.floor(value ?? 50), 200))
}
