import type { DatabaseConnection } from '../client'
import { decodeJson, encodeJson } from '../json'
import type { ChatMessage, ChatMessagePart, MessageAttachment, MessageStatus, TokenUsage } from '../types'

interface MessageRow {
  id: string
  session_id: string
  role: ChatMessage['role']
  status: MessageStatus
  parts_json: string
  parent_message_id: string | null
  root_message_id: string | null
  checkpoint_id: string | null
  run_id: string | null
  provider_id: string | null
  model_id: string | null
  provider_message_id: string | null
  usage_json: string | null
  error_json: string | null
  metadata_json: string | null
  created_at: number
  updated_at: number
}

interface MessageAttachmentRow {
  message_id: string
  attachment_id: string
  part_index: number
  role: 'input' | 'output'
}

export interface ListMessagesOptions {
  includeDeleted?: boolean
  limit?: number
  beforeCreatedAt?: number
}

export class ChatMessageRepo {
  constructor(private readonly db: DatabaseConnection) {}

  listBySession(sessionId: string, options: ListMessagesOptions = {}): ChatMessage[] {
    const filters = ['session_id = @sessionId']
    if (!options.includeDeleted) {
      filters.push("status != 'deleted'")
    }
    if (options.beforeCreatedAt !== undefined) {
      filters.push('created_at < @beforeCreatedAt')
    }
    const limit = options.limit ? 'LIMIT @limit' : ''
    return this.db
      .prepare(
        `
          SELECT * FROM chat_messages
          WHERE ${filters.join(' AND ')}
          ORDER BY created_at ASC
          ${limit}
        `,
      )
      .all({
        sessionId,
        beforeCreatedAt: options.beforeCreatedAt,
        limit: options.limit,
      })
      .map((row) => mapMessage(row as MessageRow))
  }

  get(id: string): ChatMessage | undefined {
    const row = this.db.prepare('SELECT * FROM chat_messages WHERE id = ?').get(id) as
      | MessageRow
      | undefined
    return row ? mapMessage(row) : undefined
  }

  save(message: ChatMessage): void {
    this.db
      .prepare(
        `
          INSERT INTO chat_messages (
            id, session_id, role, status, parts_json, parent_message_id, root_message_id,
            checkpoint_id, run_id, provider_id, model_id, provider_message_id, usage_json,
            error_json, metadata_json, created_at, updated_at
          ) VALUES (
            @id, @sessionId, @role, @status, @partsJson, @parentMessageId, @rootMessageId,
            @checkpointId, @runId, @providerId, @modelId, @providerMessageId, @usageJson,
            @errorJson, @metadataJson, @createdAt, @updatedAt
          )
          ON CONFLICT(id) DO UPDATE SET
            session_id = excluded.session_id,
            role = excluded.role,
            status = excluded.status,
            parts_json = excluded.parts_json,
            parent_message_id = excluded.parent_message_id,
            root_message_id = excluded.root_message_id,
            checkpoint_id = excluded.checkpoint_id,
            run_id = excluded.run_id,
            provider_id = excluded.provider_id,
            model_id = excluded.model_id,
            provider_message_id = excluded.provider_message_id,
            usage_json = excluded.usage_json,
            error_json = excluded.error_json,
            metadata_json = excluded.metadata_json,
            updated_at = excluded.updated_at
        `,
      )
      .run(toMessageParams(message))
  }

  updateStatus(id: string, status: MessageStatus, updatedAt = Date.now()): boolean {
    return this.db
      .prepare('UPDATE chat_messages SET status = ?, updated_at = ? WHERE id = ?')
      .run(status, updatedAt, id).changes > 0
  }

  updateParts(
    id: string,
    parts: ChatMessagePart[],
    fields: Partial<Pick<ChatMessage, 'status' | 'usage' | 'error' | 'metadata'>> = {},
    updatedAt = Date.now(),
  ): boolean {
    return this.db
      .prepare(
        `
          UPDATE chat_messages
          SET parts_json = @partsJson,
              status = COALESCE(@status, status),
              usage_json = @usageJson,
              error_json = @errorJson,
              metadata_json = @metadataJson,
              updated_at = @updatedAt
          WHERE id = @id
        `,
      )
      .run({
        id,
        partsJson: encodeJson(parts),
        status: fields.status ?? null,
        usageJson: encodeJson(fields.usage),
        errorJson: encodeJson(fields.error),
        metadataJson: encodeJson(fields.metadata),
        updatedAt,
      }).changes > 0
  }

  linkAttachment(link: MessageAttachment): void {
    this.db
      .prepare(
        `
          INSERT OR REPLACE INTO message_attachments (message_id, attachment_id, part_index, role)
          VALUES (@messageId, @attachmentId, @partIndex, @role)
        `,
      )
      .run(link)
  }

  replaceAttachmentLinks(messageId: string, links: MessageAttachment[]): void {
    const replace = this.db.transaction(() => {
      this.db.prepare('DELETE FROM message_attachments WHERE message_id = ?').run(messageId)
      const statement = this.db.prepare(
        `
          INSERT INTO message_attachments (message_id, attachment_id, part_index, role)
          VALUES (@messageId, @attachmentId, @partIndex, @role)
        `,
      )
      for (const link of links) {
        statement.run(link)
      }
    })
    replace()
  }

  listAttachmentLinks(messageId: string): MessageAttachment[] {
    return this.db
      .prepare('SELECT * FROM message_attachments WHERE message_id = ? ORDER BY part_index ASC')
      .all(messageId)
      .map((row) => {
        const link = row as MessageAttachmentRow
        return {
          messageId: link.message_id,
          attachmentId: link.attachment_id,
          partIndex: link.part_index,
          role: link.role,
        }
      })
  }
}

function mapMessage(row: MessageRow): ChatMessage {
  return {
    id: row.id,
    sessionId: row.session_id,
    role: row.role,
    status: row.status,
    parts: decodeJson<ChatMessagePart[]>(row.parts_json, []),
    parentMessageId: row.parent_message_id ?? undefined,
    rootMessageId: row.root_message_id ?? undefined,
    checkpointId: row.checkpoint_id ?? undefined,
    runId: row.run_id ?? undefined,
    providerId: row.provider_id ?? undefined,
    modelId: row.model_id ?? undefined,
    providerMessageId: row.provider_message_id ?? undefined,
    usage: decodeJson<TokenUsage | undefined>(row.usage_json, undefined),
    error: decodeJson<ChatMessage['error'] | undefined>(row.error_json, undefined),
    metadata: decodeJson<Record<string, unknown> | undefined>(row.metadata_json, undefined),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toMessageParams(message: ChatMessage): Record<string, unknown> {
  return {
    id: message.id,
    sessionId: message.sessionId,
    role: message.role,
    status: message.status,
    partsJson: encodeJson(message.parts) ?? '[]',
    parentMessageId: message.parentMessageId ?? null,
    rootMessageId: message.rootMessageId ?? null,
    checkpointId: message.checkpointId ?? null,
    runId: message.runId ?? null,
    providerId: message.providerId ?? null,
    modelId: message.modelId ?? null,
    providerMessageId: message.providerMessageId ?? null,
    usageJson: encodeJson(message.usage),
    errorJson: encodeJson(message.error),
    metadataJson: encodeJson(message.metadata),
    createdAt: message.createdAt,
    updatedAt: message.updatedAt,
  }
}
