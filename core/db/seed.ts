import { DEFAULT_CHAT_SYSTEM_PROMPT } from '@core/prompts'
import type { DatabaseConnection } from './client'
import { ChatSessionRepo } from './repos'
import type { ChatSession } from './types'

export const defaultContextPolicy: ChatSession['contextPolicy'] = {
  mode: 'recent-turns',
  maxMessages: 40,
  includeAttachments: 'current-only',
}

export function seedDefaultChatData(db: DatabaseConnection, now = Date.now()): void {
  const sessions = new ChatSessionRepo(db)

  const seed = db.transaction(() => {
    if (sessions.count() === 0) {
      sessions.save(defaultChatSession(now))
    }
  })

  seed()
}

export function defaultChatSession(now = Date.now()): ChatSession {
  return {
    id: 'default',
    title: 'New chat',
    kind: 'chat',
    status: 'active',
    defaultProviderId: 'openai-compatible',
    defaultModelId: 'gpt-4o-mini',
    systemPrompt: DEFAULT_CHAT_SYSTEM_PROMPT,
    pinned: false,
    messageCount: 0,
    contextPolicy: defaultContextPolicy,
    createdAt: now,
    updatedAt: now,
  }
}
