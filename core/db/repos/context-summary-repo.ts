import type { DatabaseConnection } from '../client'
import { decodeJson, encodeJson } from '../json'
import type { ChatContextSummary, ContextSummaryStatus } from '../types'

interface ContextSummaryRow {
  id: string
  session_id: string
  summary_text: string
  status: ContextSummaryStatus
  covered_from_message_id: string | null
  covered_to_message_id: string | null
  covered_from_created_at: number | null
  covered_to_created_at: number | null
  source_message_ids_json: string | null
  provider_id: string | null
  model_id: string | null
  token_estimate_before: number | null
  token_estimate_after: number | null
  metadata_json: string | null
  stale_at: number | null
  hidden_at: number | null
  created_at: number
  updated_at: number
}

export interface MarkSummaryStaleByCoverageOptions {
  sessionId: string
  messageId?: string
  messageCreatedAt?: number
  updatedAt?: number
}

export class ChatContextSummaryRepo {
  constructor(private readonly db: DatabaseConnection) {}

  create(summary: ChatContextSummary): ChatContextSummary {
    this.db
      .prepare(
        `
          INSERT INTO chat_context_summaries (
            id, session_id, summary_text, status, covered_from_message_id,
            covered_to_message_id, covered_from_created_at, covered_to_created_at,
            source_message_ids_json, provider_id, model_id, token_estimate_before,
            token_estimate_after, metadata_json, stale_at, hidden_at, created_at, updated_at
          ) VALUES (
            @id, @sessionId, @summaryText, @status, @coveredFromMessageId,
            @coveredToMessageId, @coveredFromCreatedAt, @coveredToCreatedAt,
            @sourceMessageIdsJson, @providerId, @modelId, @tokenEstimateBefore,
            @tokenEstimateAfter, @metadataJson, @staleAt, @hiddenAt, @createdAt, @updatedAt
          )
        `
      )
      .run(toSummaryParams(summary))

    return this.get(summary.id) ?? summary
  }

  update(
    id: string,
    fields: Partial<
      Pick<
        ChatContextSummary,
        | 'summary'
        | 'status'
        | 'coveredFromMessageId'
        | 'coveredToMessageId'
        | 'coveredFromCreatedAt'
        | 'coveredToCreatedAt'
        | 'sourceMessageIds'
        | 'providerId'
        | 'modelId'
        | 'tokenEstimateBefore'
        | 'tokenEstimateAfter'
        | 'metadata'
        | 'staleAt'
        | 'hiddenAt'
      >
    >,
    updatedAt = Date.now()
  ): ChatContextSummary | undefined {
    const existing = this.get(id)
    if (!existing) {
      return undefined
    }

    const next: ChatContextSummary = {
      ...existing,
      ...fields,
      updatedAt,
    }
    this.db
      .prepare(
        `
          UPDATE chat_context_summaries
          SET summary_text = @summaryText,
              status = @status,
              covered_from_message_id = @coveredFromMessageId,
              covered_to_message_id = @coveredToMessageId,
              covered_from_created_at = @coveredFromCreatedAt,
              covered_to_created_at = @coveredToCreatedAt,
              source_message_ids_json = @sourceMessageIdsJson,
              provider_id = @providerId,
              model_id = @modelId,
              token_estimate_before = @tokenEstimateBefore,
              token_estimate_after = @tokenEstimateAfter,
              metadata_json = @metadataJson,
              stale_at = @staleAt,
              hidden_at = @hiddenAt,
              updated_at = @updatedAt
          WHERE id = @id
        `
      )
      .run(toSummaryParams(next))

    return this.get(id)
  }

  get(id: string): ChatContextSummary | undefined {
    const row = this.db.prepare('SELECT * FROM chat_context_summaries WHERE id = ?').get(id) as
      | ContextSummaryRow
      | undefined
    return row ? mapSummary(row) : undefined
  }

  latestUsable(sessionId: string): ChatContextSummary | undefined {
    const row = this.db
      .prepare(
        `
          SELECT *
          FROM chat_context_summaries
          WHERE session_id = @sessionId
            AND status = 'usable'
            AND hidden_at IS NULL
          ORDER BY covered_to_created_at DESC, updated_at DESC
          LIMIT 1
        `
      )
      .get({ sessionId }) as ContextSummaryRow | undefined

    return row ? mapSummary(row) : undefined
  }

  markStaleByCoverage(options: MarkSummaryStaleByCoverageOptions): number {
    const updatedAt = options.updatedAt ?? Date.now()
    const filters = ['session_id = @sessionId', "status = 'usable'", 'hidden_at IS NULL']
    const params: Record<string, unknown> = {
      sessionId: options.sessionId,
      updatedAt,
    }

    if (options.messageCreatedAt !== undefined) {
      filters.push(`
        covered_from_created_at IS NOT NULL
        AND covered_to_created_at IS NOT NULL
        AND @messageCreatedAt BETWEEN covered_from_created_at AND covered_to_created_at
      `)
      params.messageCreatedAt = options.messageCreatedAt
    } else if (options.messageId) {
      filters.push(`
        (
          covered_from_message_id = @messageId
          OR covered_to_message_id = @messageId
          OR instr(source_message_ids_json, @quotedMessageId) > 0
        )
      `)
      params.messageId = options.messageId
      params.quotedMessageId = JSON.stringify(options.messageId)
    } else {
      return 0
    }

    return this.db
      .prepare(
        `
          UPDATE chat_context_summaries
          SET status = 'stale',
              stale_at = COALESCE(stale_at, @updatedAt),
              updated_at = @updatedAt
          WHERE ${filters.join(' AND ')}
        `
      )
      .run(params).changes
  }

  markStaleForSession(sessionId: string, updatedAt = Date.now()): number {
    return this.db
      .prepare(
        `
          UPDATE chat_context_summaries
          SET status = 'stale',
              stale_at = COALESCE(stale_at, @updatedAt),
              updated_at = @updatedAt
          WHERE session_id = @sessionId
            AND status = 'usable'
        `
      )
      .run({ sessionId, updatedAt }).changes
  }

  hideForSession(sessionId: string, updatedAt = Date.now()): number {
    return this.db
      .prepare(
        `
          UPDATE chat_context_summaries
          SET status = 'hidden',
              hidden_at = COALESCE(hidden_at, @updatedAt),
              updated_at = @updatedAt
          WHERE session_id = @sessionId
            AND status != 'hidden'
        `
      )
      .run({ sessionId, updatedAt }).changes
  }

  deleteHiddenForSession(sessionId: string): number {
    return this.db
      .prepare(
        `
          DELETE FROM chat_context_summaries
          WHERE session_id = @sessionId
            AND status = 'hidden'
        `
      )
      .run({ sessionId }).changes
  }
}

function mapSummary(row: ContextSummaryRow): ChatContextSummary {
  return {
    id: row.id,
    sessionId: row.session_id,
    summary: row.summary_text,
    status: row.status,
    coveredFromMessageId: row.covered_from_message_id ?? undefined,
    coveredToMessageId: row.covered_to_message_id ?? undefined,
    coveredFromCreatedAt: row.covered_from_created_at ?? undefined,
    coveredToCreatedAt: row.covered_to_created_at ?? undefined,
    sourceMessageIds: decodeJson<string[] | undefined>(row.source_message_ids_json, undefined),
    providerId: row.provider_id ?? undefined,
    modelId: row.model_id ?? undefined,
    tokenEstimateBefore: row.token_estimate_before ?? undefined,
    tokenEstimateAfter: row.token_estimate_after ?? undefined,
    metadata: decodeJson<Record<string, unknown> | undefined>(row.metadata_json, undefined),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    staleAt: row.stale_at ?? undefined,
    hiddenAt: row.hidden_at ?? undefined,
  }
}

function toSummaryParams(summary: ChatContextSummary): Record<string, unknown> {
  return {
    id: summary.id,
    sessionId: summary.sessionId,
    summaryText: summary.summary,
    status: summary.status,
    coveredFromMessageId: summary.coveredFromMessageId ?? null,
    coveredToMessageId: summary.coveredToMessageId ?? null,
    coveredFromCreatedAt: summary.coveredFromCreatedAt ?? null,
    coveredToCreatedAt: summary.coveredToCreatedAt ?? null,
    sourceMessageIdsJson: encodeJson(summary.sourceMessageIds),
    providerId: summary.providerId ?? null,
    modelId: summary.modelId ?? null,
    tokenEstimateBefore: summary.tokenEstimateBefore ?? null,
    tokenEstimateAfter: summary.tokenEstimateAfter ?? null,
    metadataJson: encodeJson(summary.metadata),
    staleAt: summary.staleAt ?? null,
    hiddenAt: summary.hiddenAt ?? null,
    createdAt: summary.createdAt,
    updatedAt: summary.updatedAt,
  }
}
