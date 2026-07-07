import type { DatabaseConnection } from '../client'
import { decodeJson, encodeJson } from '../json'
import type { ChatSession, ChatSessionKind, ChatSystemContextConfig, ContextPolicy } from '../types'

const systemContextMetadataKey = 'systemContext'

interface SessionRow {
  id: string
  title: string
  kind?: ChatSessionKind | null
  status: ChatSession['status']
  default_provider_id: string | null
  default_model_id: string | null
  system_prompt: string | null
  context_policy_json: string | null
  pinned: number
  message_count: number
  last_message_preview: string | null
  last_message_at: number | null
  metadata_json: string | null
  created_at: number
  updated_at: number
}

export interface ListSessionsOptions {
  includeDeleted?: boolean
  kind?: ChatSessionKind | 'all'
}

export class ChatSessionRepo {
  constructor(private readonly db: DatabaseConnection) {}

  list(options: ListSessionsOptions = {}): ChatSession[] {
    const filters: string[] = []
    const params: Record<string, unknown> = {}
    if (!options.includeDeleted) {
      filters.push("status != 'deleted'")
    }
    if (options.kind && options.kind !== 'all') {
      filters.push('kind = @kind')
      params.kind = options.kind
    }
    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : ''
    return this.db
      .prepare(`SELECT * FROM chat_sessions ${where} ORDER BY pinned DESC, updated_at DESC`)
      .all(params)
      .map((row) => mapSession(row as SessionRow))
  }

  get(id: string): ChatSession | undefined {
    const row = this.db.prepare('SELECT * FROM chat_sessions WHERE id = ?').get(id) as
      | SessionRow
      | undefined
    return row ? mapSession(row) : undefined
  }

  count(): number {
    return (
      this.db.prepare('SELECT COUNT(*) AS count FROM chat_sessions').get() as { count: number }
    ).count
  }

  save(session: ChatSession): void {
    this.db
      .prepare(
        `
          INSERT INTO chat_sessions (
            id, title, kind, status, default_provider_id, default_model_id, system_prompt,
            context_policy_json, pinned, message_count, last_message_preview,
            last_message_at, metadata_json, created_at, updated_at
          ) VALUES (
            @id, @title, @kind, @status, @defaultProviderId, @defaultModelId, @systemPrompt,
            @contextPolicyJson, @pinned, @messageCount, @lastMessagePreview,
            @lastMessageAt, @metadataJson, @createdAt, @updatedAt
          )
          ON CONFLICT(id) DO UPDATE SET
            title = excluded.title,
            kind = excluded.kind,
            status = excluded.status,
            default_provider_id = excluded.default_provider_id,
            default_model_id = excluded.default_model_id,
            system_prompt = excluded.system_prompt,
            context_policy_json = excluded.context_policy_json,
            pinned = excluded.pinned,
            message_count = excluded.message_count,
            last_message_preview = excluded.last_message_preview,
            last_message_at = excluded.last_message_at,
            metadata_json = excluded.metadata_json,
            updated_at = excluded.updated_at
        `
      )
      .run(toSessionParams(session))
  }

  updateTitle(id: string, title: string, updatedAt = Date.now()): boolean {
    return (
      this.db
        .prepare('UPDATE chat_sessions SET title = ?, updated_at = ? WHERE id = ?')
        .run(title, updatedAt, id).changes > 0
    )
  }

  markDeleted(id: string, updatedAt = Date.now()): boolean {
    return (
      this.db
        .prepare("UPDATE chat_sessions SET status = 'deleted', updated_at = ? WHERE id = ?")
        .run(updatedAt, id).changes > 0
    )
  }

  updateMessageSummary(
    id: string,
    summary: Pick<ChatSession, 'messageCount' | 'lastMessagePreview' | 'lastMessageAt'>,
    updatedAt = Date.now()
  ): boolean {
    return (
      this.db
        .prepare(
          `
          UPDATE chat_sessions
          SET message_count = @messageCount,
              last_message_preview = @lastMessagePreview,
              last_message_at = @lastMessageAt,
              updated_at = @updatedAt
          WHERE id = @id
        `
        )
        .run({
          id,
          messageCount: summary.messageCount ?? 0,
          lastMessagePreview: summary.lastMessagePreview ?? null,
          lastMessageAt: summary.lastMessageAt ?? null,
          updatedAt,
        }).changes > 0
    )
  }
}

function mapSession(row: SessionRow): ChatSession {
  const metadata = decodeJson<Record<string, unknown> | undefined>(row.metadata_json, undefined)
  const systemContext = getSystemContextFromMetadata(metadata, row.system_prompt ?? undefined)

  return {
    id: row.id,
    title: row.title,
    kind: row.kind ?? 'chat',
    status: row.status,
    defaultProviderId: row.default_provider_id ?? undefined,
    defaultModelId: row.default_model_id ?? undefined,
    systemPrompt: row.system_prompt ?? undefined,
    systemContext,
    pinned: row.pinned === 1,
    messageCount: row.message_count,
    lastMessagePreview: row.last_message_preview ?? undefined,
    lastMessageAt: row.last_message_at ?? undefined,
    contextPolicy: decodeJson<ContextPolicy | undefined>(row.context_policy_json, undefined),
    metadata,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toSessionParams(session: ChatSession): Record<string, unknown> {
  const systemPrompt = session.systemPrompt ?? session.systemContext?.baseSystemPrompt
  const systemContext =
    session.systemContext || systemPrompt
      ? {
          ...(session.systemContext ?? {}),
          ...(systemPrompt !== undefined ? { baseSystemPrompt: systemPrompt } : {}),
        }
      : undefined

  return {
    id: session.id,
    title: session.title,
    kind: session.kind ?? 'chat',
    status: session.status,
    defaultProviderId: session.defaultProviderId ?? null,
    defaultModelId: session.defaultModelId ?? null,
    systemPrompt: systemPrompt ?? null,
    contextPolicyJson: encodeJson(session.contextPolicy),
    pinned: session.pinned ? 1 : 0,
    messageCount: session.messageCount ?? 0,
    lastMessagePreview: session.lastMessagePreview ?? null,
    lastMessageAt: session.lastMessageAt ?? null,
    metadataJson: encodeJson(withSystemContextMetadata(session.metadata, systemContext)),
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  }
}

function getSystemContextFromMetadata(
  metadata: Record<string, unknown> | undefined,
  systemPrompt: string | undefined
): ChatSystemContextConfig | undefined {
  const value = metadata?.[systemContextMetadataKey]
  if (isSystemContextConfig(value)) {
    return value
  }
  return systemPrompt ? { baseSystemPrompt: systemPrompt } : undefined
}

function withSystemContextMetadata(
  metadata: Record<string, unknown> | undefined,
  systemContext: ChatSystemContextConfig | undefined
): Record<string, unknown> | undefined {
  if (!systemContext) {
    return metadata
  }
  return {
    ...(metadata ?? {}),
    [systemContextMetadataKey]: systemContext,
  }
}

function isSystemContextConfig(value: unknown): value is ChatSystemContextConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }
  const candidate = value as ChatSystemContextConfig
  return (
    (candidate.baseSystemPrompt === undefined || typeof candidate.baseSystemPrompt === 'string') &&
    (candidate.mask === undefined || typeof candidate.mask === 'object') &&
    (candidate.role === undefined || typeof candidate.role === 'object') &&
    (candidate.runtimeInstructions === undefined || Array.isArray(candidate.runtimeInstructions))
  )
}
