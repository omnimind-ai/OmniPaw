import type { CronRunError, CronRunStatus, CronTask, CronTaskState } from '@shared/types/cron'
import type { DatabaseConnection } from '../client'
import { decodeJson, encodeJson } from '../json'

interface CronTaskRow {
  id: string
  name: string
  note: string
  source_session_id: string
  target_session_id: string
  schedule_kind: 'at' | 'cron'
  run_at: number | null
  cron_expression: string | null
  timezone: string | null
  enabled: number
  state: CronTaskState
  next_run_at: number | null
  running_at: number | null
  last_run_at: number | null
  last_completed_at: number | null
  last_status: CronRunStatus | null
  last_error_json: string | null
  failure_count: number
  created_at: number
  updated_at: number
}

export interface ListCronTasksOptions {
  sessionId?: string
  includeDisabled?: boolean
}

export class CronTaskRepo {
  constructor(private readonly db: DatabaseConnection) {}

  list(options: ListCronTasksOptions = {}): CronTask[] {
    const filters: string[] = []
    const params: Record<string, unknown> = {}
    if (options.sessionId) {
      filters.push('(source_session_id = @sessionId OR target_session_id = @sessionId)')
      params.sessionId = options.sessionId
    }
    if (options.includeDisabled === false) {
      filters.push('enabled = 1')
    }
    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : ''
    return this.db
      .prepare(`SELECT * FROM cron_tasks ${where} ORDER BY updated_at DESC`)
      .all(params)
      .map((row) => mapCronTask(row as CronTaskRow))
  }

  get(id: string): CronTask | undefined {
    const row = this.db.prepare('SELECT * FROM cron_tasks WHERE id = ?').get(id) as
      | CronTaskRow
      | undefined
    return row ? mapCronTask(row) : undefined
  }

  getForSession(id: string, sessionId: string): CronTask | undefined {
    const row = this.db
      .prepare(
        `
          SELECT * FROM cron_tasks
          WHERE id = @id
            AND (source_session_id = @sessionId OR target_session_id = @sessionId)
        `
      )
      .get({ id, sessionId }) as CronTaskRow | undefined
    return row ? mapCronTask(row) : undefined
  }

  save(task: CronTask): CronTask {
    this.db
      .prepare(
        `
          INSERT INTO cron_tasks (
            id, name, note, source_session_id, target_session_id, schedule_kind, run_at,
            cron_expression, timezone, enabled, state, next_run_at, running_at,
            last_run_at, last_completed_at, last_status, last_error_json,
            failure_count, created_at, updated_at
          ) VALUES (
            @id, @name, @note, @sourceSessionId, @targetSessionId, @scheduleKind, @runAt,
            @cronExpression, @timezone, @enabled, @state, @nextRunAt, @runningAt,
            @lastRunAt, @lastCompletedAt, @lastStatus, @lastErrorJson,
            @failureCount, @createdAt, @updatedAt
          )
          ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            note = excluded.note,
            source_session_id = excluded.source_session_id,
            target_session_id = excluded.target_session_id,
            schedule_kind = excluded.schedule_kind,
            run_at = excluded.run_at,
            cron_expression = excluded.cron_expression,
            timezone = excluded.timezone,
            enabled = excluded.enabled,
            state = excluded.state,
            next_run_at = excluded.next_run_at,
            running_at = excluded.running_at,
            last_run_at = excluded.last_run_at,
            last_completed_at = excluded.last_completed_at,
            last_status = excluded.last_status,
            last_error_json = excluded.last_error_json,
            failure_count = excluded.failure_count,
            updated_at = excluded.updated_at
        `
      )
      .run(toCronTaskParams(task))

    return this.get(task.id) ?? task
  }

  delete(id: string, sessionId?: string): boolean {
    const result = sessionId
      ? this.db
          .prepare(
            `
              DELETE FROM cron_tasks
              WHERE id = @id
                AND (source_session_id = @sessionId OR target_session_id = @sessionId)
            `
          )
          .run({ id, sessionId })
      : this.db.prepare('DELETE FROM cron_tasks WHERE id = ?').run(id)
    return result.changes > 0
  }

  findDue(now: number, limit = 20): CronTask[] {
    return this.db
      .prepare(
        `
          SELECT * FROM cron_tasks
          WHERE enabled = 1
            AND next_run_at IS NOT NULL
            AND next_run_at <= @now
            AND running_at IS NULL
          ORDER BY next_run_at ASC
          LIMIT @limit
        `
      )
      .all({ now, limit })
      .map((row) => mapCronTask(row as CronTaskRow))
  }

  findRunning(): CronTask[] {
    return this.db
      .prepare('SELECT * FROM cron_tasks WHERE running_at IS NOT NULL ORDER BY running_at ASC')
      .all()
      .map((row) => mapCronTask(row as CronTaskRow))
  }

  findNextPending(now: number): CronTask | undefined {
    const row = this.db
      .prepare(
        `
          SELECT * FROM cron_tasks
          WHERE enabled = 1
            AND next_run_at IS NOT NULL
            AND next_run_at > @now
            AND running_at IS NULL
          ORDER BY next_run_at ASC
          LIMIT 1
        `
      )
      .get({ now }) as CronTaskRow | undefined
    return row ? mapCronTask(row) : undefined
  }

  tryMarkRunning(id: string, runningAt: number): CronTask | undefined {
    const changes = this.db
      .prepare(
        `
          UPDATE cron_tasks
          SET state = 'running',
              running_at = @runningAt,
              last_run_at = @runningAt,
              updated_at = @runningAt
          WHERE id = @id
            AND running_at IS NULL
        `
      )
      .run({ id, runningAt }).changes
    return changes > 0 ? this.get(id) : undefined
  }
}

function mapCronTask(row: CronTaskRow): CronTask {
  const schedule =
    row.schedule_kind === 'at'
      ? {
          kind: 'at' as const,
          runAt: row.run_at ?? 0,
          timezone: row.timezone ?? undefined,
        }
      : {
          kind: 'cron' as const,
          cronExpression: row.cron_expression ?? '',
          timezone: row.timezone ?? undefined,
        }

  return {
    id: row.id,
    name: row.name,
    note: row.note,
    sourceSessionId: row.source_session_id,
    targetSessionId: row.target_session_id,
    schedule,
    enabled: row.enabled === 1,
    state: row.state,
    nextRunAt: row.next_run_at ?? undefined,
    runningAt: row.running_at ?? undefined,
    lastRunAt: row.last_run_at ?? undefined,
    lastCompletedAt: row.last_completed_at ?? undefined,
    lastStatus: row.last_status ?? undefined,
    lastError: decodeJson<CronRunError | undefined>(row.last_error_json, undefined),
    failureCount: row.failure_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toCronTaskParams(task: CronTask): Record<string, unknown> {
  return {
    id: task.id,
    name: task.name,
    note: task.note,
    sourceSessionId: task.sourceSessionId,
    targetSessionId: task.targetSessionId,
    scheduleKind: task.schedule.kind,
    runAt: task.schedule.kind === 'at' ? task.schedule.runAt : null,
    cronExpression: task.schedule.kind === 'cron' ? task.schedule.cronExpression : null,
    timezone: task.schedule.timezone ?? null,
    enabled: task.enabled ? 1 : 0,
    state: task.state,
    nextRunAt: task.nextRunAt ?? null,
    runningAt: task.runningAt ?? null,
    lastRunAt: task.lastRunAt ?? null,
    lastCompletedAt: task.lastCompletedAt ?? null,
    lastStatus: task.lastStatus ?? null,
    lastErrorJson: encodeJson(task.lastError),
    failureCount: task.failureCount,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  }
}
