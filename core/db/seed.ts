import type { DatabaseConnection } from './client'
import { ProviderRepo, ChatSessionRepo } from './repos'
import type { ChatSession, ProviderConfig } from './types'

export const defaultContextPolicy: ChatSession['contextPolicy'] = {
  mode: 'recent-turns',
  maxMessages: 40,
  includeAttachments: 'current-only',
}

export function seedDefaultChatData(db: DatabaseConnection, now = Date.now()): void {
  const sessions = new ChatSessionRepo(db)
  const providers = new ProviderRepo(db)

  const seed = db.transaction(() => {
    if (providers.count() === 0) {
      providers.save(defaultOpenAICompatibleProvider(now))
    }

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
    status: 'active',
    defaultProviderId: 'openai-compatible',
    defaultModelId: 'gpt-4o-mini',
    systemPrompt: 'You are OpenOmniClaw, a local-first desktop AI assistant.',
    pinned: false,
    messageCount: 0,
    contextPolicy: defaultContextPolicy,
    createdAt: now,
    updatedAt: now,
  }
}

export function defaultOpenAICompatibleProvider(now = Date.now()): ProviderConfig {
  return {
    id: 'openai-compatible',
    name: 'OpenAI Compatible',
    api: 'openai-chat-completions',
    baseUrl: 'https://api.openai.com/v1',
    enabled: false,
    authHeader: 'Authorization',
    defaultModelId: 'gpt-4o-mini',
    capabilities: {
      listModels: true,
      streaming: true,
      tools: true,
      vision: true,
    },
    models: [
      {
        id: 'gpt-4o-mini',
        providerId: 'openai-compatible',
        name: 'GPT-4o mini',
        remoteId: 'gpt-4o-mini',
        enabled: true,
        input: ['text', 'image'],
        supportsStreaming: true,
        supportsTools: true,
        supportsReasoning: false,
        contextWindow: 128000,
        maxOutputTokens: 16384,
        compat: {
          maxTokensField: 'max_tokens',
          supportsSystemRole: true,
          supportsJsonMode: true,
          reasoningFormat: 'none',
        },
      },
    ],
    createdAt: now,
    updatedAt: now,
  }
}
