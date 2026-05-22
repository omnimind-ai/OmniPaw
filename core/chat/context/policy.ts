import type { ChatContextSummary, ChatMessage, ContextPolicy } from '@shared/types/chat'
import type { ChatContextDefaults } from './types'

export function normalizePolicy(
  sessionPolicy: ContextPolicy | undefined,
  defaults: ChatContextDefaults | undefined
): ContextPolicy {
  return {
    mode: sessionPolicy?.mode ?? 'recent-turns',
    maxMessages: sessionPolicy?.maxMessages ?? defaults?.recentMessages ?? 40,
    maxInputTokens: sessionPolicy?.maxInputTokens,
    keepRecentTurns: sessionPolicy?.keepRecentTurns,
    includeAttachments:
      sessionPolicy?.includeAttachments ?? defaults?.includeAttachments ?? 'current-only',
  }
}

export function eligibleMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages
    .filter((message) => ['complete', 'streaming'].includes(message.status))
    .filter(
      (message) =>
        message.role === 'system' || message.role === 'user' || message.role === 'assistant'
    )
}

export function filterMessagesAfterSummary(
  messages: ChatMessage[],
  summary: ChatContextSummary | undefined
): ChatMessage[] {
  if (!summary || summary.status !== 'usable') {
    return messages
  }
  if (summary.coveredToCreatedAt !== undefined) {
    const cutoff = summary.coveredToCreatedAt
    return messages.filter((message) => message.createdAt > cutoff)
  }
  if (!summary.coveredToMessageId) {
    return messages
  }
  const index = messages.findIndex((message) => message.id === summary.coveredToMessageId)
  return index >= 0 ? messages.slice(index + 1) : messages
}
