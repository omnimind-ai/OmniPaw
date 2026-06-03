import { ATTACHMENT_PROMPTS, CONTEXT_PROMPTS } from '@core/prompts'
import type { ChatMessagePart } from '@shared/types/chat'
import type { ProviderMessage } from '@shared/types/provider'
import type { ContextUnit } from './types'

export function serializeUnits(
  units: ContextUnit[],
  supportsSystemRole: boolean
): ProviderMessage[] {
  const providerMessages = units.flatMap((unit) => unit.messages)
  if (supportsSystemRole) {
    return mergeAdjacentSystemMessages(providerMessages)
  }

  return providerMessages.map((message) =>
    message.role === 'system'
      ? {
          role: 'user' as const,
          content: CONTEXT_PROMPTS.systemInstructionsFallback(contentToText(message.content)),
        }
      : message
  )
}

export function mergeAdjacentSystemMessages(messages: ProviderMessage[]): ProviderMessage[] {
  const output: ProviderMessage[] = []
  let pendingSystem: string[] = []
  const flushSystem = () => {
    if (!pendingSystem.length) {
      return
    }
    output.push({ role: 'system', content: pendingSystem.join('\n\n') })
    pendingSystem = []
  }

  for (const message of messages) {
    if (message.role === 'system') {
      pendingSystem.push(contentToText(message.content))
      continue
    }
    flushSystem()
    output.push(message)
  }
  flushSystem()
  return output
}

export function hasProviderContent(content: ProviderMessage['content']): boolean {
  return typeof content === 'string' ? content.length > 0 : content.length > 0
}

export function contentToText(content: ProviderMessage['content']): string {
  if (typeof content === 'string') {
    return content
  }
  return content
    .map((part) => {
      if (part.type === 'text') {
        return part.text
      }
      if (part.type === 'image_url') {
        return ATTACHMENT_PROMPTS.imageAttachment
      }
      return ATTACHMENT_PROMPTS.genericAttachment
    })
    .join('\n')
}

export function partsReasoningText(parts: ChatMessagePart[]): string | undefined {
  const text = parts
    .filter((part): part is Extract<ChatMessagePart, { type: 'think' }> => part.type === 'think')
    .map((part) => part.think)
    .join('')
    .trim()
  return text || undefined
}
