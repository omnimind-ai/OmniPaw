import type { ChatSession, ChatSessionKind, ContextPolicy } from '@shared/types/chat'

export const VISION_SESSION_TITLE = '主动视觉'
export const CAT_SESSION_TITLE = '小猫会话'

export function createVisionSessionContextPolicy(): ContextPolicy {
  return {
    mode: 'summary-plus-recent',
    keepRecentTurns: 6,
    includeAttachments: 'current-only',
  }
}

export function createDefaultSessionContextPolicy(input: {
  kind: Extract<ChatSessionKind, 'chat' | 'cat'>
  recentMessages?: number
  includeAttachments?: ContextPolicy['includeAttachments']
}): ContextPolicy {
  return {
    mode: 'recent-turns',
    maxMessages: input.recentMessages ?? 40,
    includeAttachments: input.includeAttachments ?? 'current-only',
  }
}

export function createVisionSessionRecord(now = Date.now()): ChatSession {
  return {
    id: crypto.randomUUID(),
    title: VISION_SESSION_TITLE,
    kind: 'vision',
    status: 'active',
    messageCount: 0,
    contextPolicy: createVisionSessionContextPolicy(),
    metadata: {
      system: 'observation',
    },
    createdAt: now,
    updatedAt: now,
  }
}

export function createDefaultSessionRecord(input: {
  kind: Extract<ChatSessionKind, 'chat' | 'cat'>
  title?: string
  defaultProviderId?: string
  defaultModelId?: string
  systemPrompt?: string
  systemContext?: ChatSession['systemContext']
  recentMessages?: number
  includeAttachments?: ContextPolicy['includeAttachments']
  now?: number
}): ChatSession {
  const now = input.now ?? Date.now()
  const systemPrompt = input.systemPrompt?.trim() || undefined
  return {
    id: crypto.randomUUID(),
    title: input.title?.trim() || (input.kind === 'cat' ? CAT_SESSION_TITLE : '新会话'),
    kind: input.kind,
    status: 'active',
    defaultProviderId: input.defaultProviderId,
    defaultModelId: input.defaultModelId,
    systemPrompt,
    systemContext: input.systemContext,
    messageCount: 0,
    contextPolicy: createDefaultSessionContextPolicy({
      kind: input.kind,
      recentMessages: input.recentMessages,
      includeAttachments: input.includeAttachments,
    }),
    createdAt: now,
    updatedAt: now,
  }
}
