import type { ChatMessageRepo, ChatRunRepo, ChatSessionRepo } from '@core/db/repos'
import type { Logger } from '@core/logging'
import type { ChatMessage } from '@shared/types/chat'
import { previewMessage } from './message-text'

export interface SessionSummaryUpdaterOptions {
  sessions: ChatSessionRepo
  messages: ChatMessageRepo
  runs: ChatRunRepo
  logger?: Logger
}

export class SessionSummaryUpdater {
  constructor(private readonly options: SessionSummaryUpdaterOptions) {}

  updateSessionSummary(sessionId: string): void {
    const messages = this.options.messages.listBySession(sessionId)
    const last = [...messages].reverse().find((message) => message.status !== 'deleted')
    this.options.sessions.updateMessageSummary(sessionId, {
      messageCount: messages.length,
      lastMessagePreview: last ? previewMessage(last) : undefined,
      lastMessageAt: last?.createdAt,
    })
    this.options.logger?.debug('Chat session summary updated.', {
      sessionId,
      messageCount: messages.length,
      lastMessageAt: last?.createdAt,
    })
  }

  attachRunContextUsage(message: ChatMessage): ChatMessage {
    if (message.metadata?.contextUsage || message.role !== 'assistant') {
      return message
    }
    const run = message.runId
      ? this.options.runs.get(message.runId)
      : this.options.runs.getByAssistantMessageId(message.id)
    if (!run?.requestSnapshot?.contextUsage) {
      return message
    }
    return {
      ...message,
      runId: message.runId ?? run.id,
      metadata: {
        ...(message.metadata ?? {}),
        contextUsage: run.requestSnapshot.contextUsage,
      },
    }
  }
}
