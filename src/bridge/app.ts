export type BridgeUnsubscribe = () => void

export interface BridgeChatSession {
  id: string
  title: string
  status: 'active' | 'archived' | 'deleted'
  defaultProviderId?: string
  defaultModelId?: string
  providerId?: string
  modelId?: string
  systemPrompt?: string
  messageCount?: number
  lastMessagePreview?: string
  lastMessageAt?: number
  createdAt: number
  updatedAt: number
}

export interface BridgeChatMessagePart {
  type: string
  text?: string
  think?: string
  attachmentId?: string
  attachment_id?: string
  messageId?: string | number
  message_id?: string | number
  selectedText?: string
  selected_text?: string
  filename?: string
  toolCalls?: unknown[]
  tool_calls?: unknown[]
  [key: string]: unknown
}

export interface BridgeChatMessage {
  id: string
  sessionId: string
  role: 'system' | 'user' | 'assistant' | 'tool' | string
  status?: string
  parts: BridgeChatMessagePart[]
  runId?: string
  checkpointId?: string
  error?: { message?: string; code?: string }
  usage?: Record<string, unknown>
  metadata?: Record<string, unknown>
  createdAt: number
  updatedAt: number
}

export interface BridgeSendMessageRequest {
  sessionId: string
  parts?: BridgeChatMessagePart[]
  content?: string
  providerId?: string
  modelId?: string
  enableStreaming?: boolean
  idempotencyKey?: string
  checkpointId?: string | null
}

export interface BridgeSendMessageResponse {
  runId?: string
  userMessageId?: string
  assistantMessageId?: string
  messageId?: string
  accepted?: boolean
  userMessage?: BridgeChatMessage
  assistantMessage?: BridgeChatMessage
}

export interface BridgeStreamEvent {
  type: 'started' | 'delta' | 'final' | 'error' | 'aborted' | string
  runId: string
  sessionId: string
  assistantMessageId: string
  seq: number
  channel?: 'content' | 'reasoning' | 'tool_call' | string
  delta?: string
  text?: string
  message?: BridgeChatMessage
  error?: { message?: string; code?: string }
  usage?: Record<string, unknown>
}

export interface BridgeAttachment {
  id: string
  kind?: string
  originalName?: string
  storedName?: string
  filename?: string
  mimeType?: string
  sizeBytes?: number
  sha256?: string
  previewUrl?: string
  url?: string
  createdAt?: number
  updatedAt?: number
}

export interface BridgeProviderModel {
  id: string
  name?: string
  displayName?: string
  remoteId?: string
  enabled?: boolean
  input?: Array<'text' | 'image' | 'audio' | 'file'>
  supportsStreaming?: boolean
  supportsTools?: boolean
  supportsReasoning?: boolean
  contextWindow?: number
  maxOutputTokens?: number
  capabilities?: Record<string, unknown>
  compatibility?: Record<string, unknown>
}

export interface BridgeProviderConfig {
  id: string
  name: string
  type?: string
  api: 'openai-chat-completions' | 'openai-responses' | 'ollama' | 'omniinfer'
  baseUrl: string
  enabled?: boolean
  defaultModelId?: string
  models?: BridgeProviderModel[]
  capabilities?: Record<string, unknown>
  createdAt?: number
  updatedAt?: number
  [key: string]: unknown
}

export interface RendererOpenOmniClawBridge {
  app: {
    getInfo: () => Promise<{ name: string; version: string; platform: string }>
  }
  chat: {
    listSessions: () => Promise<BridgeChatSession[]>
    createSession: (request?: Partial<BridgeChatSession>) => Promise<BridgeChatSession>
    updateSession?: (sessionId: string, patch: Partial<BridgeChatSession>) => Promise<BridgeChatSession>
    updateSessionTitle?: (sessionId: string, title: string) => Promise<BridgeChatSession>
    deleteSession?: (sessionId: string) => Promise<void>
    listMessages?: (sessionId: string) => Promise<BridgeChatMessage[]>
    sendMessage: (request: BridgeSendMessageRequest) => Promise<BridgeSendMessageResponse>
    abortRun?: (runId: string, reason?: string) => Promise<void>
    editMessage?: (
      sessionId: string,
      messageId: string,
      parts: BridgeChatMessagePart[],
    ) => Promise<{ message?: BridgeChatMessage; needsRegenerate?: boolean; truncatedAfterMessage?: boolean }>
    regenerateMessage?: (
      sessionId: string,
      messageId: string,
      providerId?: string,
      modelId?: string,
    ) => Promise<BridgeSendMessageResponse>
    onStreamEvent?: (callback: (event: BridgeStreamEvent) => void) => BridgeUnsubscribe
    onToken?: (callback: (token: string) => void) => BridgeUnsubscribe
    onDone?: (callback: () => void) => BridgeUnsubscribe
  }
  attachment?: {
    upload: (request: { name: string; type: string; size: number; bytes: ArrayBuffer }) => Promise<BridgeAttachment>
    getPreviewUrl: (attachmentId: string) => Promise<string | { url: string; mimeType?: string }>
  }
  provider: {
    list: () => Promise<BridgeProviderConfig[]>
    refreshModels?: (providerId: string) => Promise<BridgeProviderModel[]>
    test?: (providerId: string, modelId?: string) => Promise<{ ok: boolean; error?: unknown }>
  }
  skill: {
    list: () => Promise<Array<{ name: string; description?: string; enabled?: boolean; parameters?: unknown }>>
  }
  cron: {
    list: () => Promise<unknown[]>
  }
}

const fallbackBridge: RendererOpenOmniClawBridge = {
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
        status: 'active',
        defaultProviderId: 'omniinfer-local',
        defaultModelId: 'local-small-model',
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
        status: 'active',
        defaultProviderId: 'omniinfer-local',
        defaultModelId: 'local-small-model',
        createdAt: now,
        updatedAt: now,
      }
    },
    updateSession: async (sessionId, patch) => ({
      id: sessionId,
      title: patch.title || '新会话',
      status: 'active',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      ...patch,
    }),
    updateSessionTitle: async (sessionId, title) => ({
      id: sessionId,
      title,
      status: 'active',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }),
    deleteSession: async () => {},
    listMessages: async () => [],
    sendMessage: async () => ({
      runId: crypto.randomUUID(),
      userMessageId: crypto.randomUUID(),
      assistantMessageId: crypto.randomUUID(),
      messageId: crypto.randomUUID(),
      accepted: true,
    }),
    abortRun: async () => {},
    editMessage: async () => ({ needsRegenerate: true, truncatedAfterMessage: true }),
    regenerateMessage: async () => ({
      runId: crypto.randomUUID(),
      assistantMessageId: crypto.randomUUID(),
      accepted: true,
    }),
    onStreamEvent: () => () => {},
    onToken: () => () => {},
    onDone: () => () => {},
  },
  attachment: {
    upload: async ({ name, type, size }) => ({
      id: crypto.randomUUID(),
      kind: type.startsWith('image/') ? 'image' : type.startsWith('audio/') ? 'audio' : type.startsWith('video/') ? 'video' : 'file',
      originalName: name,
      filename: name,
      mimeType: type,
      sizeBytes: size,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }),
    getPreviewUrl: async () => '',
  },
  provider: {
    list: async () => [
      {
        id: 'omniinfer-local',
        name: 'OmniInfer Local',
        type: 'omniinfer',
        api: 'omniinfer',
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

const exposedBridge = window.openOmniClaw as RendererOpenOmniClawBridge | undefined

export const appBridge = exposedBridge ?? fallbackBridge
