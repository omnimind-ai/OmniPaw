import type { ChatMessageRepo } from '@core/db/repos'
import type { Logger } from '@core/logging'
import type { EditMessageRequest, EditMessageResponse } from '@shared/types/chat'
import type { ContextCompactionService } from '../context-compaction'

export interface MessageEditorOptions {
  messages: ChatMessageRepo
  contextCompaction?: ContextCompactionService
  logger?: Logger
}

export class MessageEditor {
  constructor(private readonly options: MessageEditorOptions) {}

  editMessage(request: EditMessageRequest): EditMessageResponse {
    const message = this.options.messages.get(request.messageId)
    if (!message || message.sessionId !== request.sessionId || message.role !== 'user') {
      throw new Error('Editable user message not found.')
    }
    this.options.contextCompaction?.markStaleByMessage(message)
    this.options.messages.updateParts(message.id, request.parts, { status: 'complete' })
    const updated = this.options.messages.get(message.id) ?? { ...message, parts: request.parts }
    const messages = this.options.messages.listBySession(request.sessionId)
    const messageIndex = messages.findIndex((item) => item.id === message.id)
    for (const later of messages.slice(messageIndex + 1)) {
      this.options.messages.updateStatus(later.id, 'superseded')
      this.options.contextCompaction?.markStaleByMessage(later)
    }
    this.options.logger?.info('Chat message edited.', {
      sessionId: request.sessionId,
      messageId: request.messageId,
      truncatedCount: Math.max(0, messages.length - messageIndex - 1),
    })
    return {
      message: updated,
      needsRegenerate: true,
      truncatedAfterMessage: true,
    }
  }
}
