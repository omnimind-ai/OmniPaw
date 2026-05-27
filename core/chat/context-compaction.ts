import type { ChatContextSummaryRepo } from '@core/db/repos'
import { CONTEXT_PROMPTS } from '@core/prompts'
import type { ChatContextSummary, ChatMessage, ProviderRequestSnapshot } from '@shared/types/chat'
import type { ProviderConfig, ProviderModel } from '@shared/types/provider'
import type { DesktopChatContextSettings } from '@shared/types/settings'

export interface ContextCompactionInput {
  sessionId: string
  messages: ChatMessage[]
  provider: ProviderConfig
  model: ProviderModel
  snapshot?: ProviderRequestSnapshot
  settings?: DesktopChatContextSettings
  force?: boolean
}

export class ContextCompactionService {
  constructor(private readonly summaries: ChatContextSummaryRepo) {}

  markStaleByMessage(message: Pick<ChatMessage, 'sessionId' | 'id' | 'createdAt'>): number {
    return this.summaries.markStaleByCoverage({
      sessionId: message.sessionId,
      messageId: message.id,
      messageCreatedAt: message.createdAt,
    })
  }

  hideForSession(sessionId: string): number {
    return this.summaries.hideForSession(sessionId)
  }

  maybeCompact(input: ContextCompactionInput): ChatContextSummary | undefined {
    if (!input.force && !shouldCompact(input.snapshot, input.settings)) {
      return undefined
    }

    const eligible = input.messages.filter(
      (message) =>
        message.status === 'complete' &&
        (message.role === 'user' || message.role === 'assistant') &&
        message.parts.length > 0
    )
    const keepRecentMessages = 8
    const source = eligible.slice(0, Math.max(0, eligible.length - keepRecentMessages))
    if (source.length < 4) {
      return undefined
    }

    const now = Date.now()
    const latest = this.summaries.latestUsable(input.sessionId)
    if (latest?.coveredToMessageId === source.at(-1)?.id) {
      return latest
    }

    const summaryText = buildStructuredSummary(source, latest)
    const first = source[0]
    const last = source.at(-1)
    if (!first || !last || !summaryText.trim()) {
      return undefined
    }

    const summary: ChatContextSummary = {
      id: crypto.randomUUID(),
      sessionId: input.sessionId,
      summary: summaryText,
      status: 'usable',
      coveredFromMessageId: first.id,
      coveredToMessageId: last.id,
      coveredFromCreatedAt: first.createdAt,
      coveredToCreatedAt: last.createdAt,
      sourceMessageIds: source.map((message) => message.id),
      providerId: input.provider.id,
      modelId: input.model.id,
      tokenEstimateBefore: input.snapshot?.estimatedInputTokens,
      tokenEstimateAfter: Math.ceil(summaryText.length / 4),
      metadata: {
        strategy: 'structured-extractive-v1',
        compactModelId: input.settings?.compactModelId,
        compactModelFallback: input.settings?.compactModelId ? 'configured' : 'active_model',
        previousSummaryId: latest?.id,
      },
      createdAt: now,
      updatedAt: now,
    }

    if (latest) {
      this.summaries.update(latest.id, {
        status: 'stale',
        staleAt: now,
        metadata: {
          ...(latest.metadata ?? {}),
          replacedBySummaryId: summary.id,
        },
      })
    }

    return this.summaries.create(summary)
  }
}

function shouldCompact(
  snapshot: ProviderRequestSnapshot | undefined,
  settings: DesktopChatContextSettings | undefined
): boolean {
  if (!settings?.autoCompact || !snapshot?.contextUsage) {
    return false
  }
  const usagePercent =
    snapshot.contextUsage.usagePercent ??
    (snapshot.contextUsage.estimatedInputTokens && snapshot.contextUsage.budgetInputTokens
      ? (snapshot.contextUsage.estimatedInputTokens / snapshot.contextUsage.budgetInputTokens) * 100
      : undefined)
  return usagePercent !== undefined && usagePercent >= settings.compactThresholdPercent
}

function buildStructuredSummary(messages: ChatMessage[], previous?: ChatContextSummary): string {
  const lines = messages
    .map((message) => `${message.role}: ${messageText(message)}`)
    .filter((line) => line.trim().length > 0)
  const clipped = softClip(lines.join('\n'), 6000)
  return CONTEXT_PROMPTS.structuredSummary({
    clippedMessages: clipped,
    previousSummary: previous?.summary ? softClip(previous.summary, 1800) : undefined,
  })
}

function messageText(message: ChatMessage): string {
  return message.parts
    .map((part) => {
      if (part.type === 'plain') {
        return part.text
      }
      if (part.type === 'think') {
        return ''
      }
      if (part.type === 'tool_call') {
        const calls = Array.isArray(part.tool_calls)
          ? part.tool_calls
          : Array.isArray(part.toolCalls)
            ? part.toolCalls
            : []
        return `[tool calls: ${calls.map((call) => call.name ?? call.id).join(', ')}]`
      }
      const record = part as Record<string, unknown>
      const filename = typeof record.filename === 'string' ? record.filename : undefined
      return filename ? `[attachment: ${filename}]` : `[${part.type}]`
    })
    .filter(Boolean)
    .join(' ')
    .trim()
}

function softClip(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text
  }
  return `${text.slice(0, maxChars)}\n[...older context clipped...]`
}
