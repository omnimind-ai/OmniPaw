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

  const systemText = providerMessages
    .filter((message) => message.role === 'system')
    .map((message) => contentToText(message.content))
    .filter(Boolean)
    .join('\n\n')
  const rest = providerMessages.filter((message) => message.role !== 'system')
  if (!systemText) {
    return rest
  }
  return [{ role: 'user', content: `System instructions:\n${systemText}` }, ...rest]
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
        return '[Image attachment]'
      }
      return '[Attachment]'
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
