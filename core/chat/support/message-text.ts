import type { ChatMessage, ChatMessagePart } from '@shared/types/chat'

export function textFromParts(parts: ChatMessagePart[]): string {
  return parts
    .map((part) => {
      const record = part as Record<string, unknown>
      return typeof record.text === 'string' ? record.text : ''
    })
    .join('\n')
    .replace(/\s+/g, ' ')
    .trim()
}

export function previewMessage(message: ChatMessage): string {
  const text = textFromParts(message.parts)
  return text.slice(0, 160)
}
