import type { ChatError, ID, TokenUsage } from './chat'

export type ProviderApi = 'openai-chat-completions' | 'openai-responses' | 'ollama' | 'omniinfer'

export type ProviderType = 'openai-compatible' | 'ollama' | 'omniinfer'

export interface ProviderCapabilities {
  listModels?: boolean
  streaming?: boolean
  tools?: boolean
  vision?: boolean
}

export interface ProviderCompat {
  maxTokensField?: 'max_tokens' | 'max_completion_tokens'
  supportsSystemRole?: boolean
  supportsDeveloperRole?: boolean
  supportsJsonMode?: boolean
  reasoningFormat?: 'none' | 'openai' | 'deepseek' | 'qwen'
}

export interface ProviderModel {
  id: string
  providerId?: ID
  name: string
  remoteId?: string
  enabled?: boolean
  input?: Array<'text' | 'image' | 'audio' | 'file'>
  supportsStreaming?: boolean
  supportsTools?: boolean
  supportsReasoning?: boolean
  contextWindow?: number
  maxOutputTokens?: number
  pricing?: {
    inputPer1M?: number
    outputPer1M?: number
  }
  compat?: ProviderCompat

  /** Compatibility fields used by migrated provider UI. */
  displayName?: string
  capabilities?: Record<string, unknown>
}

export interface ProviderConfig {
  id: ID
  name: string
  api?: ProviderApi
  baseUrl: string
  enabled: boolean
  credentialRef?: ID
  authHeader?: string
  headers?: Record<string, string>
  extraBody?: Record<string, unknown>
  defaultModelId?: string
  models: ProviderModel[]
  capabilities?: ProviderCapabilities
  createdAt?: number
  updatedAt?: number

  /** Compatibility alias for existing UI code. */
  type?: ProviderType
  model?: string
  enable?: boolean
  model_metadata?: Record<string, unknown>
}

export interface ProviderPreset {
  id: ID
  name: string
  type: ProviderType
  api: ProviderApi
  baseUrl: string
  description?: string
  enabled?: boolean
  credentialRef?: ID
  authHeader?: string
  headers?: Record<string, string>
  extraBody?: Record<string, unknown>
  defaultModelId?: string
  models?: ProviderModel[]
  capabilities?: ProviderCapabilities
  compat?: ProviderCompat
}

export interface ProviderCredential {
  id: ID
  providerId: ID
  type: 'api-key' | 'bearer-token' | 'env'
  label: string
  encryptedValue?: string
  envVar?: string
  createdAt: number
  updatedAt: number
}

export interface SaveProviderRequest {
  provider: Omit<ProviderConfig, 'models'> & {
    models?: ProviderModel[]
  }
  credential?: {
    type: ProviderCredential['type']
    label: string
    value?: string
    envVar?: string
  }
}

export interface DeleteProviderRequest {
  providerId: ID
}

export interface RefreshProviderModelsRequest {
  providerId: ID
}

export interface SetSessionModelRequest {
  sessionId: ID
  providerId: ID
  modelId: string
}

export interface CreateProviderFromPresetRequest {
  presetId: ID
}

export interface TestProviderRequest {
  providerId?: ID
  provider?: ProviderConfig
  modelId?: string
  credentialValue?: string
}

export interface ProviderOperationResult {
  ok: boolean
  error?: ChatError
}

export interface ProviderTestResult extends ProviderOperationResult {
  latencyMs?: number
  modelId?: string
}

export interface ProviderChatRequest {
  providerId: ID
  modelId: string
  messages: ProviderMessage[]
  temperature?: number
  topP?: number
  maxOutputTokens?: number
  tools?: ProviderTool[]
  abortSignal?: AbortSignal
}

export interface ProviderMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | ProviderContentPart[]
  toolCalls?: ProviderToolCall[]
  toolCallId?: string
}

export type ProviderContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }
  | { type: 'input_audio'; input_audio: { data: string; format: string } }

export interface ProviderTool {
  type: 'function'
  function: {
    name: string
    description?: string
    parameters: Record<string, unknown>
  }
}

export interface ProviderToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

export type ProviderStreamChunk =
  | {
      type: 'delta'
      content: string
      channel?: 'content' | 'reasoning'
    }
  | {
      type: 'tool_call_delta'
      index: number
      id?: string
      toolCallType?: ProviderToolCall['type']
      name?: string
      argumentsDelta?: string
    }
  | {
      type: 'tool_call_final'
      toolCalls: ProviderToolCall[]
    }
  | {
      type: 'usage'
      usage: TokenUsage
    }
  | {
      type: 'final'
      finishReason?: string
      usage?: TokenUsage
    }

export type ModelConfig = ProviderModel
