import type { ChatSystemContextConfig } from '@shared/types/chat'
import type { DatabaseConnection } from './client'
import { ChatSessionRepo } from './repos'
import type { ChatSession } from './types'

export const defaultContextPolicy: ChatSession['contextPolicy'] = {
  mode: 'recent-turns',
  maxMessages: 40,
  includeAttachments: 'current-only',
}

export interface LegacyDefaultChatSessionRepairOptions {
  systemContext?: ChatSystemContextConfig
}

export function repairLegacyDefaultChatSession(
  db: DatabaseConnection,
  options: LegacyDefaultChatSessionRepairOptions = {}
): void {
  const sessions = new ChatSessionRepo(db)
  const repair = db.transaction(() => {
    repairLegacyDefaultSessionRole(sessions, options.systemContext)
  })

  repair()
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
