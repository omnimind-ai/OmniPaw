export type ID = string
export type UnixMs = number

export type MessageRole = 'system' | 'user' | 'assistant' | 'tool'

export type MessageStatus =
  | 'draft'
  | 'pending'
  | 'streaming'
  | 'complete'
  | 'error'
  | 'aborted'
  | 'deleted'
  | 'superseded'

export type AttachmentKind = 'image' | 'audio' | 'video' | 'file' | 'text'

export type ChatSessionStatus = 'active' | 'archived' | 'deleted'

export type ChatRunStatus = 'queued' | 'running' | 'complete' | 'error' | 'aborted'

export interface TextPart {
  type: 'plain'
  text: string
}

export interface ReasoningPart {
  type: 'think'
  think: string
  signature?: string
}

export interface ImagePart {
  type: 'image'
  attachmentId?: ID
  attachment_id?: ID
  filename?: string
  alt?: string
  embedded_url?: string
}

export interface AudioPart {
  type: 'record'
  attachmentId?: ID
  attachment_id?: ID
  filename?: string
  durationMs?: number
  duration_ms?: number
  embedded_url?: string
}

export interface VideoPart {
  type: 'video'
  attachmentId?: ID
  attachment_id?: ID
  filename?: string
  embedded_url?: string
}

export interface FilePart {
  type: 'file'
  attachmentId?: ID
  attachment_id?: ID
  filename?: string
  extractedTextId?: ID
  extracted_text_id?: ID
  embedded_file?: {
    url?: string
    filename?: string
    attachment_id?: ID
  }
}

export interface ReplyPart {
  type: 'reply'
  messageId?: ID
  message_id?: ID | number
  selectedText?: string
  selected_text?: string
}

export interface ToolCallPart {
  type: 'tool_call'
  toolCalls?: ToolCallDisplay[]
  tool_calls?: ToolCallDisplay[]
}

export interface ToolCallDisplay {
  id: string
  name?: string
  arguments?: unknown
  result?: unknown
  startedAt?: UnixMs
  finishedAt?: UnixMs
  ts?: UnixMs
  finished_ts?: UnixMs
  status?: 'pending' | 'running' | 'complete' | 'error'
}

export interface RefPart {
  type: 'ref'
  refs: Array<{
    id: string
    title?: string
    url?: string
    snippet?: string
  }>
}

export type ChatMessagePart =
  | TextPart
  | ReasoningPart
  | ImagePart
  | AudioPart
  | VideoPart
  | FilePart
  | ReplyPart
  | ToolCallPart
  | RefPart
  | Record<string, unknown>

export interface ChatError {
  code:
    | 'provider_auth'
    | 'provider_rate_limit'
    | 'provider_context_length'
    | 'provider_bad_request'
    | 'network'
    | 'aborted'
    | 'validation'
    | 'not_found'
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

export interface ContextPolicy {
  mode: 'recent-turns' | 'token-budget' | 'summary-plus-recent'
  maxMessages?: number
  maxInputTokens?: number
  keepRecentTurns?: number
  includeAttachments?: 'current-only' | 'recent' | 'never'
}

export const defaultContextPolicy: ContextPolicy = {
  mode: 'recent-turns',
  maxMessages: 40,
  includeAttachments: 'current-only',
}

export interface ChatSession {
  id: ID
  title: string
  status: ChatSessionStatus
  defaultProviderId?: ID
  defaultModelId?: string
  systemPrompt?: string
  pinned?: boolean
  messageCount?: number
  lastMessagePreview?: string
  lastMessageAt?: UnixMs
  contextPolicy?: ContextPolicy
  metadata?: Record<string, unknown>
  createdAt: UnixMs
  updatedAt: UnixMs

  /** Compatibility aliases for the existing renderer store. */
  providerId?: ID
  modelId?: string
}

export interface ChatMessage {
  id: ID
  sessionId: ID
  role: MessageRole
  status: MessageStatus
  parts: ChatMessagePart[]
  parentMessageId?: ID
  rootMessageId?: ID
  checkpointId?: ID
  runId?: ID
  providerId?: ID
  modelId?: string
  providerMessageId?: string
  error?: ChatError
  usage?: TokenUsage
  metadata?: Record<string, unknown>
  createdAt: UnixMs
  updatedAt: UnixMs

  /** Compatibility field for older modules that expect a flat text message. */
  content?: string
  toolCalls?: ToolCallDisplay[]
  toolCallId?: string
  tokenCount?: number
}

export interface Attachment {
  id: ID
  kind: AttachmentKind
  originalName: string
  storedName: string
  mimeType: string
  sizeBytes: number
  sha256: string
  previewUrl?: string
  extractedText?: string
  extractedTextStatus?: 'none' | 'pending' | 'complete' | 'error'
  extractedTextError?: string
  createdAt: UnixMs
  updatedAt: UnixMs
}

export interface InternalAttachmentRecord extends Attachment {
  storagePath: string
  previewPath?: string
}

export interface MessageAttachment {
  messageId: ID
  attachmentId: ID
  partIndex: number
  role: 'input' | 'output'
}

export interface ProviderRequestSnapshot {
  api: string
  baseUrlHost?: string
  model: string
  messageCount: number
  attachmentCount: number
  estimatedInputTokens?: number
}

export interface ChatRun {
  id: ID
  sessionId: ID
  userMessageId: ID
  assistantMessageId: ID
  providerId: ID
  modelId: string
  status: ChatRunStatus
  idempotencyKey?: string
  startedAt?: UnixMs
  finishedAt?: UnixMs
  abortReason?: string
  error?: ChatError
  usage?: TokenUsage
  requestSnapshot?: ProviderRequestSnapshot
  createdAt: UnixMs
  updatedAt: UnixMs
}

export interface SendMessageRequest {
  sessionId: ID
  parts?: ChatMessagePart[]
  content?: string
  providerId?: ID
  modelId?: string
  idempotencyKey?: string
}

export interface SendMessageResponse {
  runId: ID
  userMessageId: ID
  assistantMessageId: ID
  accepted: boolean

  /** Compatibility alias for old callers. */
  messageId?: ID
}

export interface ListMessagesRequest {
  sessionId: ID
  limit?: number
  beforeMessageId?: ID
}

export interface UpdateSessionRequest {
  sessionId: ID
  title?: string
  status?: ChatSessionStatus
  defaultProviderId?: ID
  defaultModelId?: string
  systemPrompt?: string
  pinned?: boolean
  contextPolicy?: ContextPolicy
}

export interface DeleteSessionRequest {
  sessionId: ID
}

export interface AbortRunRequest {
  runId: ID
  reason?: string
}

export interface AbortRunResponse {
  runId: ID
  aborted: boolean
}

export interface EditMessageRequest {
  sessionId: ID
  messageId: ID
  parts: ChatMessagePart[]
}

export interface EditMessageResponse {
  message: ChatMessage
  needsRegenerate: boolean
  truncatedAfterMessage: boolean
}

export interface RegenerateMessageRequest {
  sessionId: ID
  messageId: ID
  providerId?: ID
  modelId?: string
  idempotencyKey?: string
}

export interface UploadAttachmentRequest {
  name: string
  mimeType?: string
  bytes: ArrayBuffer
}

export interface UploadAttachmentResponse {
  attachment: Attachment
}

export interface AttachmentPreviewRequest {
  attachmentId: ID
}

export interface AttachmentPreviewResponse {
  attachmentId: ID
  url: string
  mimeType: string
  filename: string
}

export interface ChatRunStartedEvent {
  type: 'started'
  runId: ID
  sessionId: ID
  assistantMessageId: ID
  seq: number
}

export interface ChatRunDeltaEvent {
  type: 'delta'
  runId: ID
  sessionId: ID
  assistantMessageId: ID
  seq: number
  text: string
  channel?: 'content' | 'reasoning'
}

export interface ChatRunPartEvent {
  type: 'part'
  runId: ID
  sessionId: ID
  assistantMessageId: ID
  seq: number
  part: ChatMessagePart
}

export interface ChatRunFinalEvent {
  type: 'final'
  runId: ID
  sessionId: ID
  assistantMessageId: ID
  seq: number
  message: ChatMessage
}

export interface ChatRunErrorEvent {
  type: 'error'
  runId: ID
  sessionId: ID
  assistantMessageId: ID
  seq: number
  error: ChatError
}

export type ChatStreamEvent =
  | ChatRunStartedEvent
  | ChatRunDeltaEvent
  | ChatRunPartEvent
  | ChatRunFinalEvent
  | ChatRunErrorEvent

export type Session = ChatSession
export type Message = ChatMessage
export type ToolCall = ToolCallDisplay
