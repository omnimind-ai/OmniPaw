import type { ChatError, ID, TokenUsage } from './chat'

export type ProviderApi =
  | 'openai-chat-completions'
  | 'openai-responses'
  | 'openai-codex-responses'
  | 'ollama'
  | 'omniinfer'

export type ProviderType = 'openai-compatible' | 'openai-codex' | 'ollama' | 'omniinfer'

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
  compat?: ProviderCompat
  createdAt?: number
  updatedAt?: number

  /** Compatibility alias for existing UI code. */
  type?: ProviderType
  model?: string
  enable?: boolean
  model_metadata?: Record<string, unknown>

  /**
   * OmniInfer-only: when this provider points to an externally-managed OmniInfer instance,
   * the user can set its models directory (e.g. `D:\omniinfer\OmniInfer\.local\models\`) so
   * OmniClaw can scan it directly without needing a manual "选择本地 .gguf" round-trip.
   * Ignored for non-OmniInfer providers and for OmniClaw-bundled OmniInfer instances.
   */
  omniInferModelsDir?: string

  /**
   * OmniInfer-only: absolute path to a user-installed OmniInfer project/install directory.
   * When set, OmniClaw can run the directory's `omniinfer` startup script and stop that
   * local installation instead of only probing an already-running external gateway.
   */
  omniInferInstallDir?: string
  /** @deprecated Use `omniInferInstallDir`; kept only for old provider objects. */
  omniInferBinaryPath?: string
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

export type ProviderRegistryVersion = 1

export interface ProviderModelRef {
  providerId: ID
  modelId: string
}

export interface ProviderRegistrySource {
  id: ID
  name: string
  type?: ProviderType
  api?: ProviderApi
  baseUrl: string
  enabled: boolean
  credentialRef?: ID
  authHeader?: string
  apiKey?: string
  envVar?: string
  headers?: Record<string, string>
  extraBody?: Record<string, unknown>
  capabilities?: ProviderCapabilities
  compat?: ProviderCompat
  createdAt: number
  updatedAt: number
  omniInferModelsDir?: string
  omniInferInstallDir?: string
  /** @deprecated Use `omniInferInstallDir`; kept only for old registry normalization. */
  omniInferBinaryPath?: string
}

export interface ProviderRegistryModel
  extends Omit<ProviderModel, 'providerId' | 'displayName' | 'capabilities'> {
  providerId: ID
  manual?: boolean
  capabilities?: Record<string, unknown>
  createdAt: number
  updatedAt: number
}

export interface ProviderRegistrySettings {
  defaultProviderId?: ID
  defaultModelId?: string
  fallbackModelRefs: ProviderModelRef[]
  titleModelRef?: ProviderModelRef
  embeddingModelRef?: ProviderModelRef
  observationVisionModelRef?: ProviderModelRef
  observationReactionModelRef?: ProviderModelRef
  streaming: boolean
}

export interface ProviderRegistry {
  version: ProviderRegistryVersion
  sources: ProviderRegistrySource[]
  models: ProviderRegistryModel[]
  settings: ProviderRegistrySettings
}

export interface ProviderRegistryValidationIssue {
  path: string
  message: string
  code?: string
}

export type ProviderRegistryErrorCode =
  | 'invalid_json'
  | 'invalid_registry'
  | 'unsupported_version'
  | 'save_failed'
  | 'not_found'
  | 'validation_failed'

export interface ProviderRegistryOperationError {
  code: ProviderRegistryErrorCode
  message: string
  path?: string
  recoverable: boolean
  issues?: ProviderRegistryValidationIssue[]
}

export interface ProviderRegistryStatus {
  path: string
  backupPath: string
  exists: boolean
  backupExists: boolean
  loaded: boolean
  version?: ProviderRegistryVersion
  recoverable: boolean
  error?: ProviderRegistryOperationError
}

export type ProviderRegistryChangeReason =
  | 'load'
  | 'save'
  | 'reset'
  | 'delete'
  | 'refresh'
  | 'settings'
  | 'title'
  | 'embedding'
  | 'observation'

export interface ProviderRegistryChangedEvent {
  reason: ProviderRegistryChangeReason
  registry: ProviderRegistry
  status: ProviderRegistryStatus
}

export interface SetProviderDefaultModelRequest extends ProviderModelRef {}

export interface SetProviderFallbackModelsRequest {
  models: ProviderModelRef[]
}

export interface SetProviderTitleModelRequest extends Partial<ProviderModelRef> {}

export interface SetProviderEmbeddingModelRequest extends Partial<ProviderModelRef> {}

export interface SetProviderObservationModelsRequest {
  observationVisionModelRef?: ProviderModelRef
  observationReactionModelRef?: ProviderModelRef
}

export interface DeleteProviderModelRequest extends ProviderModelRef {}

export interface ProviderDeleteResult {
  deleted: boolean
  nextSelection?: ProviderModelRef
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

export interface OpenAICodexOAuthStatus {
  providerId: ID
  authenticated: boolean
  accountId?: string
  email?: string
  expires?: number
  updatedAt?: number
}

export interface OpenAICodexOAuthProviderRequest {
  providerId: ID
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
  reasoningContent?: string
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
