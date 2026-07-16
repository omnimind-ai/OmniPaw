import type { DatabaseConnection } from '../client'
import { decodeJson, encodeJson } from '../json'
import type { ChatRun, RunStatus, TokenUsage } from '../types'

interface RunRow {
  id: string
  session_id: string
  user_message_id: string
  assistant_message_id: string
  provider_id: string
  model_id: string
  status: RunStatus
  idempotency_key: string | null
  started_at: number | null
  finished_at: number | null
  abort_reason: string | null
  usage_json: string | null
  error_json: string | null
  request_snapshot_json: string | null
  created_at: number
  updated_at: number
}

export class ChatRunRepo {
  constructor(private readonly db: DatabaseConnection) {}

  get(id: string): ChatRun | undefined {
    const row = this.db.prepare('SELECT * FROM chat_runs WHERE id = ?').get(id) as
      | RunRow
      | undefined
    return row ? mapRun(row) : undefined
  }

  getByIdempotencyKey(idempotencyKey: string): ChatRun | undefined {
    const row = this.db
      .prepare('SELECT * FROM chat_runs WHERE idempotency_key = ?')
      .get(idempotencyKey) as RunRow | undefined
    return row ? mapRun(row) : undefined
  }

  getByAssistantMessageId(assistantMessageId: string): ChatRun | undefined {
    const row = this.db
      .prepare(
        'SELECT * FROM chat_runs WHERE assistant_message_id = ? ORDER BY created_at DESC LIMIT 1'
      )
      .get(assistantMessageId) as RunRow | undefined
    return row ? mapRun(row) : undefined
  }

  list(filters: { sessionId?: string; statuses?: RunStatus[]; limit?: number } = {}): ChatRun[] {
    const conditions: string[] = []
    const params: unknown[] = []

    if (filters.sessionId) {
      conditions.push('session_id = ?')
      params.push(filters.sessionId)
    }
    if (filters.statuses?.length) {
      conditions.push(`status IN (${filters.statuses.map(() => '?').join(', ')})`)
      params.push(...filters.statuses)
    }

    const limit = Math.max(1, Math.min(Math.floor(filters.limit ?? 100), 500))
    params.push(limit)
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
    const rows = this.db
      .prepare(`SELECT * FROM chat_runs ${where} ORDER BY created_at DESC LIMIT ?`)
      .all(...params) as RunRow[]
    return rows.map(mapRun)
  }

  save(run: ChatRun): ChatRun {
    if (run.idempotencyKey) {
      const existing = this.getByIdempotencyKey(run.idempotencyKey)
      if (existing && existing.id !== run.id) {
        return existing
      }
    }

    this.db
      .prepare(
        `
          INSERT INTO chat_runs (
            id, session_id, user_message_id, assistant_message_id, provider_id, model_id,
            status, idempotency_key, started_at, finished_at, abort_reason, usage_json,
            error_json, request_snapshot_json, created_at, updated_at
          ) VALUES (
            @id, @sessionId, @userMessageId, @assistantMessageId, @providerId, @modelId,
            @status, @idempotencyKey, @startedAt, @finishedAt, @abortReason, @usageJson,
            @errorJson, @requestSnapshotJson, @createdAt, @updatedAt
          )
          ON CONFLICT(id) DO UPDATE SET
            status = excluded.status,
            started_at = excluded.started_at,
            finished_at = excluded.finished_at,
            abort_reason = excluded.abort_reason,
            usage_json = excluded.usage_json,
            error_json = excluded.error_json,
            request_snapshot_json = excluded.request_snapshot_json,
            updated_at = excluded.updated_at
        `
      )
      .run(toRunParams(run))

    return this.get(run.id) ?? run
  }

  updateStatus(
    id: string,
    status: RunStatus,
    fields: Partial<Pick<ChatRun, 'usage' | 'error' | 'abortReason' | 'finishedAt'>> = {},
    updatedAt = Date.now()
  ): boolean {
    return (
      this.db
        .prepare(
          `
          UPDATE chat_runs
          SET status = @status,
              finished_at = @finishedAt,
              abort_reason = @abortReason,
              usage_json = @usageJson,
              error_json = @errorJson,
              updated_at = @updatedAt
          WHERE id = @id
        `
        )
        .run({
          id,
          status,
          finishedAt: fields.finishedAt ?? null,
          abortReason: fields.abortReason ?? null,
          usageJson: encodeJson(fields.usage),
          errorJson: encodeJson(fields.error),
          updatedAt,
        }).changes > 0
    )
  }
}

function mapRun(row: RunRow): ChatRun {
  return {
    id: row.id,
    sessionId: row.session_id,
    userMessageId: row.user_message_id,
    assistantMessageId: row.assistant_message_id,
    providerId: row.provider_id,
    modelId: row.model_id,
    status: row.status,
    idempotencyKey: row.idempotency_key ?? undefined,
    startedAt: row.started_at ?? undefined,
    finishedAt: row.finished_at ?? undefined,
    abortReason: row.abort_reason ?? undefined,
    usage: decodeJson<TokenUsage | undefined>(row.usage_json, undefined),
    error: decodeJson<ChatRun['error'] | undefined>(row.error_json, undefined),
    requestSnapshot: decodeJson<ChatRun['requestSnapshot'] | undefined>(
      row.request_snapshot_json,
      undefined
    ),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toRunParams(run: ChatRun): Record<string, unknown> {
  return {
    id: run.id,
    sessionId: run.sessionId,
    userMessageId: run.userMessageId,
    assistantMessageId: run.assistantMessageId,
    providerId: run.providerId,
    modelId: run.modelId,
    status: run.status,
    idempotencyKey: run.idempotencyKey ?? null,
    startedAt: run.startedAt ?? null,
    finishedAt: run.finishedAt ?? null,
    abortReason: run.abortReason ?? null,
    usageJson: encodeJson(run.usage),
    errorJson: encodeJson(run.error),
    requestSnapshotJson: encodeJson(run.requestSnapshot),
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
  }
}
