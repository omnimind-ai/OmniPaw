import type { Message } from '@shared/types/chat'

export class ContextManager {
  trimToRecentTurns(messages: Message[], maxMessages = 20): Message[] {
    return messages.slice(-maxMessages)
  }
}
