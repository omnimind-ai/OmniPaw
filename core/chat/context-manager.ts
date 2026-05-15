import type { AttachmentService } from './attachment-service'
import { attachmentIdFromPart } from './attachment-service'
import type { ChatMessage, ChatMessagePart, ChatSession, ProviderRequestSnapshot } from '@shared/types/chat'
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
