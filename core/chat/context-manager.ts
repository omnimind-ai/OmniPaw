import type { AttachmentService } from './attachment-service'
import { attachmentIdFromPart } from './attachment-service'
import type { ChatMessage, ChatMessagePart, ChatSession, ProviderRequestSnapshot, ToolCallDisplay } from '@shared/types/chat'
import type { ProviderConfig, ProviderMessage, ProviderModel } from '@shared/types/provider'

export interface BuildContextInput {
  session: ChatSession
  messages: ChatMessage[]
  currentUserMessageId: string
  provider: ProviderConfig
  model: ProviderModel
}

export interface BuildContextResult {
  messages: ProviderMessage[]
  snapshot: ProviderRequestSnapshot
}

export class ContextBuilder {
  constructor(private readonly attachments: AttachmentService) {}

  async build(input: BuildContextInput): Promise<BuildContextResult> {
    const policy = input.session.contextPolicy ?? {
      mode: 'recent-turns',
      maxMessages: 40,
      includeAttachments: 'current-only' as const,
    }
    const eligible = input.messages
      .filter((message) => ['complete', 'streaming'].includes(message.status))
      .filter((message) => message.role === 'system' || message.role === 'user' || message.role === 'assistant')
    const selected = eligible.slice(-(policy.maxMessages ?? 40))
    const providerMessages: ProviderMessage[] = []

    if (input.session.systemPrompt && input.model.compat?.supportsSystemRole !== false) {
      providerMessages.push({ role: 'system', content: input.session.systemPrompt })
    }

    let attachmentCount = 0
    for (const message of selected) {
      const isCurrent = message.id === input.currentUserMessageId
      if (message.role === 'assistant') {
        const textContent = await this.partsToProviderContent(
          message.parts.filter((part) => part.type !== 'tool_call'),
          input.model,
          isCurrent || policy.includeAttachments === 'recent',
          policy.includeAttachments === 'never',
        )
        const reasoningContent = partsReasoningText(message.parts)
        const compiledToolMessages = compileToolCallMessages(message.parts, {
          content: textContent,
          reasoningContent,
        })
        if (compiledToolMessages.length) {
          providerMessages.push(...compiledToolMessages)
          attachmentCount += countAttachmentParts(message.parts)
          continue
        }
      }
      const content = await this.partsToProviderContent(
        message.parts,
        input.model,
        isCurrent || policy.includeAttachments === 'recent',
        policy.includeAttachments === 'never',
      )
      attachmentCount += countAttachmentParts(message.parts)
      if (!content || (Array.isArray(content) && content.length === 0)) {
        continue
      }
      providerMessages.push({
        role: message.role === 'assistant' ? 'assistant' : message.role === 'system' ? 'system' : 'user',
        content,
        reasoningContent: message.role === 'assistant' ? partsReasoningText(message.parts) : undefined,
      })
    }

    return {
      messages: providerMessages,
      snapshot: {
        api: input.provider.api ?? 'openai-chat-completions',
        baseUrlHost: hostFromUrl(input.provider.baseUrl),
        model: input.model.remoteId ?? input.model.id,
        messageCount: providerMessages.length,
        attachmentCount,
        estimatedInputTokens: estimateTokens(providerMessages),
      },
    }
  }

  private async partsToProviderContent(
    parts: ChatMessagePart[],
    model: ProviderModel,
    includeAttachmentPayloads: boolean,
    neverIncludeAttachments: boolean,
  ): Promise<ProviderMessage['content']> {
    const content: Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }> = []

    for (const part of parts) {
      const record = part as Record<string, unknown>
      if (part.type === 'plain' && typeof record.text === 'string') {
        content.push({ type: 'text', text: record.text })
        continue
      }
      if (part.type === 'think') {
        continue
      }

      const attachmentId = attachmentIdFromPart(part)
      if (!attachmentId) {
        continue
      }
      const attachment = this.attachments.get(attachmentId)
      if (!attachment) {
        content.push({ type: 'text', text: `[Missing attachment: ${attachmentId}]` })
        continue
      }

      if (
        includeAttachmentPayloads &&
        !neverIncludeAttachments &&
        attachment.kind === 'image' &&
        (model.input ?? ['text']).includes('image')
      ) {
        content.push({
          type: 'image_url',
          image_url: {
            url: await this.attachments.materializeImageDataUrl(attachment),
          },
        })
        continue
      }

      if (
        includeAttachmentPayloads &&
        !neverIncludeAttachments &&
        attachment.extractedTextStatus === 'complete' &&
        attachment.extractedText
      ) {
        content.push({
          type: 'text',
          text: `<attachment name="${escapeAttribute(attachment.originalName)}" mime="${escapeAttribute(attachment.mimeType)}">\n${attachment.extractedText}\n</attachment>`,
        })
        continue
      }

      content.push({
        type: 'text',
        text: `[File Attachment: name=${attachment.originalName}, mime=${attachment.mimeType}, size=${attachment.sizeBytes}]`,
      })
    }

    if (content.length === 1 && content[0]?.type === 'text') {
      return content[0].text
    }

    return content
  }
}

export class ContextManager extends ContextBuilder {
  trimToRecentTurns(messages: ChatMessage[], maxMessages = 20): ChatMessage[] {
    return messages.slice(-maxMessages)
  }
}

function countAttachmentParts(parts: ChatMessagePart[]): number {
  return parts.reduce((count, part) => count + (attachmentIdFromPart(part) ? 1 : 0), 0)
}

function estimateTokens(messages: ProviderMessage[]): number {
  const chars = JSON.stringify(messages).length
  return Math.ceil(chars / 4)
}

function hostFromUrl(value: string): string | undefined {
  try {
    return new URL(value).host
  } catch {
    return undefined
  }
}

function escapeAttribute(value: string): string {
  return value.replace(/["&<>]/g, (char) => ({
    '"': '&quot;',
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
  })[char] ?? char)
}

function compileToolCallMessages(
  parts: ChatMessagePart[],
  assistantContext: Pick<ProviderMessage, 'content' | 'reasoningContent'>,
): ProviderMessage[] {
  const compiled = completedToolCalls(parts).flatMap((toolCall) => {
    const args = serializeToolArguments(toolCall.arguments ?? toolCall.args)
    const result = serializeToolResult(toolCall.result ?? toolCall.error)
    if (!toolCall.id || !toolCall.name || args === undefined || result === undefined) {
      return []
    }

    return [{
      toolCall: {
        id: toolCall.id,
        type: 'function' as const,
        function: {
          name: toolCall.name,
          arguments: args,
        },
      },
      result,
    }]
  })

  if (!compiled.length) {
    return []
  }

  return [
    {
      role: 'assistant',
      content: hasProviderContent(assistantContext.content) ? assistantContext.content : '',
      reasoningContent: assistantContext.reasoningContent,
      toolCalls: compiled.map((item) => item.toolCall),
    },
    ...compiled.map((item) => ({
      role: 'tool' as const,
      toolCallId: item.toolCall.id,
      content: item.result,
    })),
  ]
}

function hasProviderContent(content: ProviderMessage['content']): boolean {
  return typeof content === 'string' ? content.length > 0 : content.length > 0
}

function completedToolCalls(parts: ChatMessagePart[]): ToolCallDisplay[] {
  const calls: ToolCallDisplay[] = []
  for (const part of parts) {
    if (part.type !== 'tool_call') {
      continue
    }
    const toolCalls = (part.tool_calls ?? part.toolCalls ?? []) as ToolCallDisplay[]
    for (const toolCall of toolCalls) {
      if (toolCall.status === 'complete' || toolCall.status === 'denied' || toolCall.status === 'error') {
        calls.push(toolCall)
      }
    }
  }
  return calls
}

function serializeToolArguments(value: unknown): string | undefined {
  if (value === undefined) {
    return '{}'
  }
  if (typeof value === 'string') {
    return value
  }
  try {
    return JSON.stringify(value)
  } catch {
    return undefined
  }
}

function serializeToolResult(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined
  }
  if (typeof value === 'string') {
    return value
  }
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function partsReasoningText(parts: ChatMessagePart[]): string | undefined {
  const text = parts
    .filter((part): part is Extract<ChatMessagePart, { type: 'think' }> => part.type === 'think')
    .map((part) => part.think)
    .join('')
    .trim()
  return text || undefined
}
