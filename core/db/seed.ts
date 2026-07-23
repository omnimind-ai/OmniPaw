import type { ChatSystemContextConfig } from '@shared/types/chat'
import type { DatabaseConnection } from './client'
import { ChatSessionRepo } from './repos'
import type { ChatSession } from './types'

export const defaultContextPolicy: ChatSession['contextPolicy'] = {
  mode: 'recent-turns',
  maxMessages: 40,
  includeAttachments: 'current-only',
}

export interface SeedDefaultChatDataOptions {
  now?: number
  systemContext?: ChatSystemContextConfig
}

export function seedDefaultChatData(
  db: DatabaseConnection,
  options: SeedDefaultChatDataOptions = {}
): void {
  const sessions = new ChatSessionRepo(db)
  const now = options.now ?? Date.now()

  const seed = db.transaction(() => {
    if (sessions.count() === 0) {
      sessions.save(defaultChatSession(now, options.systemContext))
      return
    }
    repairLegacyDefaultSessionRole(sessions, options.systemContext)
  })

  seed()
}

export function defaultChatSession(
  now = Date.now(),
  systemContext?: ChatSystemContextConfig
): ChatSession {
  return {
    id: 'default',
    title: 'New chat',
    kind: 'chat',
    status: 'active',
    defaultProviderId: 'openai-compatible',
    defaultModelId: 'gpt-4o-mini',
    systemPrompt: systemContext?.baseSystemPrompt,
    systemContext: cloneSystemContext(systemContext),
    pinned: false,
    messageCount: 0,
    contextPolicy: defaultContextPolicy,
    createdAt: now,
    updatedAt: now,
  }
}

function repairLegacyDefaultSessionRole(
  sessions: ChatSessionRepo,
  defaultSystemContext: ChatSystemContextConfig | undefined
): void {
  const session = sessions.get('default')
  const role = defaultSystemContext?.role
  if (
    !session ||
    session.status === 'deleted' ||
    session.systemContext?.role?.text?.trim() ||
    !role?.text?.trim()
  ) {
    return
  }

  const baseSystemPrompt =
    session.systemContext?.baseSystemPrompt ??
    session.systemPrompt ??
    defaultSystemContext?.baseSystemPrompt
  sessions.save({
    ...session,
    systemContext: {
      ...(baseSystemPrompt !== undefined ? { baseSystemPrompt } : {}),
      role: { ...role },
    },
  })
}

function cloneSystemContext(
  systemContext: ChatSystemContextConfig | undefined
): ChatSystemContextConfig | undefined {
  if (!systemContext) {
    return undefined
  }
  return {
    ...(systemContext.baseSystemPrompt !== undefined
      ? { baseSystemPrompt: systemContext.baseSystemPrompt }
      : {}),
    ...(systemContext.role ? { role: { ...systemContext.role } } : {}),
  }
}
