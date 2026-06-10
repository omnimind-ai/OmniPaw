export interface ChatError {
  code:
    | 'provider_auth'
    | 'provider_rate_limit'
    | 'provider_context_length'
    | 'provider_bad_request'
    | 'network'
    | 'aborted'
    | 'unknown'
  message: string
  retryable?: boolean
  providerStatus?: number
  providerBodyPreview?: string
}

export interface TokenUsage {
  input?: number
  output?: number
  cachedInput?: number
  reasoning?: number
  total?: number
}

export type ProviderMessageRole = 'system' | 'user' | 'assistant' | 'tool'

export type ProviderContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }
  | { type: 'input_audio'; input_audio: { data: string; format: string } }

export interface ProviderToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

export interface ProviderMessage {
  role: ProviderMessageRole
  content: string | ProviderContentPart[]
  reasoningContent?: string
  toolCalls?: ProviderToolCall[]
  toolCallId?: string
}

export interface ProviderTool {
  type: 'function'
  function: {
    name: string
    description?: string
    parameters: Record<string, unknown>
  }
}

export type ChatCompletionChunk =
  | {
      type: 'delta'
      content?: string
      reasoning?: string
      done: false
      finishReason?: string
      usage?: TokenUsage
      raw?: unknown
    }
  | {
      type: 'tool_call_delta'
      index: number
      id?: string
      toolCallType?: ProviderToolCall['type']
      name?: string
      argumentsDelta?: string
      done: false
      finishReason?: string
      usage?: TokenUsage
      raw?: unknown
    }
  | {
      type: 'tool_call_final'
      toolCalls: ProviderToolCall[]
      done: false
      finishReason?: string
      usage?: TokenUsage
      raw?: unknown
    }
  | {
      type: 'final'
      done: true
      finishReason?: string
      usage?: TokenUsage
      raw?: unknown
    }

export interface ChatCompletionRequest {
  modelId: string
  messages: ProviderMessage[]
  temperature?: number
  topP?: number
  maxOutputTokens?: number
  tools?: ProviderTool[]
  abortSignal?: AbortSignal
}

export interface TextEmbeddingRequest {
  modelId: string
  input: string[]
  abortSignal?: AbortSignal
}

export interface TextEmbeddingResponse {
  embeddings: number[][]
  modelId?: string
}

export interface BaseProvider {
  id: string
  streamChat: (request: ChatCompletionRequest) => AsyncIterable<ChatCompletionChunk>
  embedTexts?: (request: TextEmbeddingRequest) => Promise<TextEmbeddingResponse>
  test?: (modelId?: string, signal?: AbortSignal) => Promise<void>
  listModels?: (signal?: AbortSignal) => Promise<ProviderModelCandidate[]>
}

export interface ProviderModelCandidate {
  id: string
  name?: string
  input?: Array<'text' | 'image' | 'audio' | 'file'>
  supportsTools?: boolean
  supportsReasoning?: boolean
  contextWindow?: number
  maxOutputTokens?: number
}

export class ProviderError extends Error {
  readonly chatError: ChatError

  constructor(chatError: ChatError, cause?: unknown) {
    super(chatError.message)
    this.name = 'ProviderError'
    this.chatError = chatError
    this.cause = cause
  }
}
