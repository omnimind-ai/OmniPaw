import type { OpenOmniClawBridge } from '@shared/types/bridge'

const fallbackBridge: OpenOmniClawBridge = {
  app: {
    getInfo: async () => ({
      name: 'OpenOmniClaw',
      version: 'dev',
      platform: 'win32',
    }),
  },
  chat: {
    listSessions: async () => [
      {
        id: 'welcome',
        title: '默认会话',
        providerId: 'omniinfer-local',
        modelId: 'local-small-model',
        systemPrompt: '你是 OpenOmniClaw，本地优先的桌面 AI 助手。',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ],
    createSession: async () => {
      const now = Date.now()

      return {
        id: crypto.randomUUID(),
        title: '新会话',
        providerId: 'omniinfer-local',
        modelId: 'local-small-model',
        createdAt: now,
        updatedAt: now,
      }
    },
    sendMessage: async () => ({
      messageId: crypto.randomUUID(),
      accepted: true,
    }),
    onToken: () => () => {},
    onDone: () => () => {},
  },
  provider: {
    list: async () => [
      {
        id: 'omniinfer-local',
        name: 'OmniInfer Local',
        type: 'omniinfer',
        baseUrl: 'http://localhost:11434/v1',
        enabled: true,
        models: [
          {
            id: 'local-small-model',
            name: 'Local Small Model',
            contextWindow: 8192,
          },
        ],
      },
    ],
  },
  skill: {
    list: async () => [
      {
        name: 'system_time',
        description: '查询当前系统时间',
        enabled: true,
        parameters: {
          type: 'object',
          properties: {},
        },
      },
    ],
  },
  cron: {
    list: async () => [],
  },
}

const exposedBridge = window.openOmniClaw as OpenOmniClawBridge | undefined

export const appBridge = exposedBridge ?? fallbackBridge
