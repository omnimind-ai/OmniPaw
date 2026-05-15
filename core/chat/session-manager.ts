import type { Session } from '@shared/types/chat'

export class SessionManager {
  private readonly sessions: Session[] = [
    {
      id: 'welcome',
      title: '默认会话',
      status: 'active',
      defaultProviderId: 'omniinfer-local',
      defaultModelId: 'local-small-model',
      providerId: 'omniinfer-local',
      modelId: 'local-small-model',
      systemPrompt: '你是 OpenOmniClaw，本地优先的桌面 AI 助手。',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
  ]

  list(): Session[] {
    return this.sessions
  }

  create(): Session {
    const now = Date.now()
    const session: Session = {
      id: crypto.randomUUID(),
      title: '新会话',
      status: 'active',
      defaultProviderId: 'omniinfer-local',
      defaultModelId: 'local-small-model',
      providerId: 'omniinfer-local',
      modelId: 'local-small-model',
      createdAt: now,
      updatedAt: now,
    }

    this.sessions.unshift(session)
    return session
  }
}
