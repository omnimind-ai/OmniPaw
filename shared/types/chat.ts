import type { LocalToolApprovalPlan } from './local-agent'
import type { CompanionMemoryRequestSnapshot } from './memory'

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
export type ChatSessionKind = 'chat' | 'cat' | 'cron' | 'vision'

export type ChatRunStatus = 'queued' | 'running' | 'complete' | 'error' | 'aborted'

export type ChatRunMode = 'assistant' | 'fast_chat'

export type ToolProfile = 'minimal' | 'assistant' | 'power'

export type ToolRisk = 'safe' | 'read' | 'write' | 'network' | 'exec'

export type ToolCallStatus = 'pending' | 'running' | 'complete' | 'error' | 'denied' | 'aborted'

export type ToolApprovalAction = 'approve' | 'reject'

export type ToolApprovalState = 'pending' | 'approved' | 'rejected'

export interface ToolCallApprovalDisplay {
  required: boolean
  state: ToolApprovalState
  risk?: ToolRisk
  reason?: string
  plan?: LocalToolApprovalPlan
  fullAccess?: boolean
}

export interface ToolApprovalRequest {
  runId: ID
  toolCallId: ID
  action: ToolApprovalAction
}

export interface ToolApprovalResponse {
  accepted: boolean
  runId: ID
  toolCallId: ID
  action: ToolApprovalAction
  reason?: string
}

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
  runId?: ID
  sessionId?: ID
  name?: string
  args?: unknown
  arguments?: unknown
  result?: unknown
  error?: unknown
  approval?: ToolCallApprovalDisplay
  startedAt?: UnixMs
  finishedAt?: UnixMs
  ts?: UnixMs
  finished_ts?: UnixMs
  status?: ToolCallStatus
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

export interface VisionCapturePart {
  type: 'vision_capture'
  captureId: ID
  scope?: string
  sourceId?: string
  sourceType?: 'screen' | 'window'
  mimeType?: string
  width?: number
  height?: number
  retention?: 'ephemeral' | 'persist'
  createdAt: UnixMs
  marker?: string
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
  | VisionCapturePart
  | Record<string, unknown>

export interface ChatError {
  code:
    | 'provider_auth'
    | 'provider_rate_limit'
    | 'provider_context_length'
    | 'provider_bad_request'
    | 'provider_stream_incomplete'
    | 'network'
    | 'aborted'
    | 'validation'
    | 'not_found'
    | 'unsupported_operation'
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

export type ContextAttachmentPolicy = 'current-only' | 'recent' | 'never'
export type ContextUsageSource = 'estimated' | 'actual' | 'mixed'
export type ContextUnitKind =
  | 'base-system'
  | 'role'
  | 'memory-profile'
  | 'memory-preference'
  | 'memory-relationship'
  | 'memory-episode'
  | 'memory-plan'
  | 'memory-boundary'
  | 'memory-fact'
  | 'runtime'
  | 'skill'
  | 'tool-inventory'
  | 'summary'
  | 'message'
  | 'attachment'
  | 'tool-result'
export type ContextUnitSource =
  | 'session'
  | 'settings'
  | 'runtime'
  | 'memory'
  | 'skill'
  | 'tool'
  | 'message'
  | 'attachment'
  | 'summary'
export type ContextSummaryStatus = 'usable' | 'stale' | 'hidden'

export interface ContextPolicy {
  mode: 'recent-turns' | 'token-budget' | 'summary-plus-recent'
  maxMessages?: number
  maxInputTokens?: number
  keepRecentTurns?: number
  includeAttachments?: ContextAttachmentPolicy
}

export const defaultContextPolicy: ContextPolicy = {
  mode: 'recent-turns',
  maxMessages: 40,
  includeAttachments: 'current-only',
}

export interface SessionContextInstruction {
  id?: ID
  label?: string
  text?: string
  refId?: ID
}

export interface ChatSystemContextConfig {
  baseSystemPrompt?: string
  role?: SessionContextInstruction
}

export interface ContextUnitMetadata {
  kind: ContextUnitKind
  source: ContextUnitSource
  required: boolean
  priority: number
  estimatedTokens?: number
  selected?: boolean
  count?: number
  messageRole?: MessageRole
  fallbackReason?: string
}

export interface ContextUnitAccounting {
  kind: ContextUnitKind
  selectedCount: number
  droppedCount?: number
  estimatedTokens?: number
  refId?: ID
  unitIds?: ID[]
  hashes?: string[]
  selected?: Array<{
    id: ID
    refId?: ID
    hash?: string
    estimatedTokens?: number
  }>
  dropped?: Array<{
    id: ID
    refId?: ID
    hash?: string
    estimatedTokens?: number
    reason?: string
  }>
  droppedReason?: string
  fallbackReason?: string
}

export interface ContextUsageMetadata {
  source: ContextUsageSource
  inputTokens?: number
  outputTokens?: number
  cachedInputTokens?: number
  reasoningTokens?: number
  totalTokens?: number
  estimatedInputTokens?: number
  contextWindowTokens?: number
  budgetInputTokens?: number
  budgetPercent?: number
  windowUsagePercent?: number
  usagePercent?: number
  reservedOutputTokens?: number
  selectedUnitCount?: number
  droppedUnitCount?: number
  selectedMessageCount?: number
  droppedMessageCount?: number
  summaryId?: ID
  fallbackReasons?: string[]
  updatedAt: UnixMs
}

export interface ChatContextSummary {
  id: ID
  sessionId: ID
  summary: string
  status: ContextSummaryStatus
  coveredFromMessageId?: ID
  coveredToMessageId?: ID
  coveredFromCreatedAt?: UnixMs
  coveredToCreatedAt?: UnixMs
  sourceMessageIds?: ID[]
  providerId?: ID
  modelId?: string
  tokenEstimateBefore?: number
  tokenEstimateAfter?: number
  metadata?: Record<string, unknown>
  createdAt: UnixMs
  updatedAt: UnixMs
  staleAt?: UnixMs
  hiddenAt?: UnixMs
}

export interface ChatSession {
  id: ID
  title: string
  kind?: ChatSessionKind
  status: ChatSessionStatus
  defaultProviderId?: ID
  defaultModelId?: string
  systemPrompt?: string
  systemContext?: ChatSystemContextConfig
  pinned?: boolean
  messageCount?: number
  lastMessagePreview?: string
  lastMessageAt?: UnixMs
  contextPolicy?: ContextPolicy
  metadata?: ChatSessionMetadata
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

export interface WorkspaceStagedAttachmentMetadata {
  attachmentId: ID
  originalName: string
  mimeType: string
  sizeBytes: number
  workspaceRelativePath: string
}

export type ComplexDocumentAttachmentRejectionReason =
  | 'fast_chat_mode'
  | 'minimal_profile'
  | 'model_does_not_support_tools'
  | 'workspace_disabled'
  | 'workspace_tool_disabled'
  | 'terminal_tool_disabled'
  | 'workspace_tool_unavailable'
  | 'terminal_tool_unavailable'
  | 'attachment_not_authorized'
  | 'attachment_not_found'
  | 'attachment_size_limit'
  | 'workspace_size_limit'
  | 'staging_failed'

export interface ComplexDocumentAttachmentRejection {
  attachmentId?: ID
  originalName?: string
  mimeType?: string
  sizeBytes?: number
  reason: ComplexDocumentAttachmentRejectionReason
  message: string
}

export interface ComplexDocumentAttachmentRunDiagnostic {
  complexCount: number
  stagedCount: number
  rejectedCount: number
  stagingStatus: 'none' | 'staged' | 'rejected'
  requestedMode?: ChatRunMode
  mode?: ChatRunMode
  toolProfile?: ToolProfile
  supportsTools: boolean
  requiredTools: string[]
  availableTools: string[]
  providerFacingToolNames: string[]
  staged?: WorkspaceStagedAttachmentMetadata[]
  rejections?: ComplexDocumentAttachmentRejection[]
}

export interface ProviderRequestSnapshot {
  api: string
  baseUrlHost?: string
  model: string
  mode?: ChatRunMode
  contextPolicyMode?: ContextPolicy['mode']
  toolProfile?: ToolProfile
  availableTools?: string[]
  toolSources?: Array<{
    name: string
    source: 'builtin' | 'mcp' | 'skill'
    serverId?: string
  }>
  localCapabilities?: {
    enabled: boolean
    providerFacingToolNames: string[]
    profile: ToolProfile
    fullAccess?: boolean
    hiddenReasons?: string[]
  }
  skills?: {
    enabledSkillIds: string[]
    injected: boolean
    omittedReason?: string
    readSkillIds?: string[]
  }
  memory?: CompanionMemoryRequestSnapshot
  maxSteps?: number
  complexDocumentAttachments?: ComplexDocumentAttachmentRunDiagnostic
  fallbackReason?: string
  fallbackReasons?: string[]
  messageCount: number
  attachmentCount: number
  imageInputCount?: number
  tokenBudget?: {
    maxInputTokens?: number
    usableInputTokens?: number
    reservedOutputTokens?: number
  }
  estimatedInputTokens?: number
  usageSource?: ContextUsageSource
  contextUsage?: ContextUsageMetadata
  contextUnits?: ContextUnitAccounting[]
  selectedCounts?: Partial<Record<ContextUnitKind, number>>
  droppedCounts?: Partial<Record<ContextUnitKind, number>>
  summaryId?: ID
  transport?: {
    retryCount?: number
    lastRetryAt?: UnixMs
    streamCompleted?: boolean
    recovery?: {
      disposition: 'resumed' | 'interrupted'
      reason: string
      at: UnixMs
    }
  }
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

export interface TransientChatImageInput {
  captureId?: ID
  dataUrl: string
  mimeType?: string
  width?: number
  height?: number
  createdAt?: UnixMs
}

export type TransientChatInstructionKind = Extract<
  ContextUnitKind,
  'base-system' | 'role' | 'runtime'
>

export interface TransientChatInstruction {
  id?: string
  kind?: TransientChatInstructionKind
  source?: string
  refId?: string
  text: string
}

export interface SendMessageRequest {
  sessionId: ID
  parts?: ChatMessagePart[]
  content?: string
  providerId?: ID
  modelId?: string
  mode?: ChatRunMode
  toolProfile?: ToolProfile
  maxSteps?: number
  idempotencyKey?: string
  metadata?: Record<string, unknown>
  transientImageInputs?: TransientChatImageInput[]
  transientSystemInstructions?: TransientChatInstruction[]
  transientCurrentMessageParts?: ChatMessagePart[]
  titleGeneration?: boolean
}

export interface SendMessageResponse {
  runId: ID
  userMessageId: ID
  assistantMessageId: ID
  accepted: boolean

  /** Compatibility alias for old callers. */
  messageId?: ID
}

export interface ListSessionsRequest {
  kind?: ChatSessionKind | 'all'
  includeDeleted?: boolean
}

export interface CreateSessionRequest {
  title?: string
  kind?: Extract<ChatSessionKind, 'chat' | 'cat' | 'vision'>
  providerId?: ID
  modelId?: string
  metadata?: ChatSessionMetadata
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
  systemContext?: ChatSystemContextConfig
  pinned?: boolean
  contextPolicy?: ContextPolicy
  metadata?: ChatSessionMetadata
}

export interface DeleteSessionRequest {
  sessionId: ID
}

export interface ChatSessionChangedEvent {
  reason: 'created' | 'updated' | 'deleted' | 'title_generated' | 'observation'
  sessionId: ID
  session?: ChatSession
}

export interface AbortRunRequest {
  runId: ID
  reason?: string
}

export interface AbortRunResponse {
  runId: ID
  aborted: boolean
}

export interface ListRunsRequest {
  sessionId?: ID
  statuses?: ChatRunStatus[]
  limit?: number
}

export interface SubscribeRunRequest {
  runId: ID
  afterSeq?: number
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
  toolProfile?: ToolProfile
  maxSteps?: number
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

export interface ChatRunAgentStepEvent {
  type: 'agent_step'
  runId: ID
  sessionId: ID
  assistantMessageId: ID
  seq: number
  step: number
  maxSteps: number
  status: 'started' | 'tool_calling' | 'tool_complete' | 'complete' | 'max_steps'
}

export interface ChatRunToolCallEvent {
  type: 'tool_call'
  runId: ID
  sessionId: ID
  assistantMessageId: ID
  seq: number
  step: number
  toolCall: ToolCallDisplay
}

export interface ChatRunToolResultEvent {
  type: 'tool_result'
  runId: ID
  sessionId: ID
  assistantMessageId: ID
  seq: number
  step: number
  toolCall: ToolCallDisplay
}

export interface ChatRunFinalEvent {
  type: 'final'
  runId: ID
  sessionId: ID
  assistantMessageId: ID
  seq: number
  contextUsage?: ContextUsageMetadata
  requestSnapshot?: ProviderRequestSnapshot
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

export interface ChatRunRetryEvent {
  type: 'retry'
  runId: ID
  sessionId: ID
  assistantMessageId: ID
  seq: number
  attempt: number
  maxAttempts: number
  delayMs: number
  reason: 'network' | 'stream_incomplete'
}

export interface ChatRunResumedEvent {
  type: 'resumed'
  runId: ID
  sessionId: ID
  assistantMessageId: ID
  seq: number
  reason: 'startup_recovery'
}

export type ChatStreamEvent =
  | ChatRunStartedEvent
  | ChatRunDeltaEvent
  | ChatRunPartEvent
  | ChatRunAgentStepEvent
  | ChatRunToolCallEvent
  | ChatRunToolResultEvent
  | ChatRunFinalEvent
  | ChatRunErrorEvent
  | ChatRunRetryEvent
  | ChatRunResumedEvent

export interface SubscribeRunResponse {
  run: ChatRun
  message?: ChatMessage
  active: boolean
  latestSeq: number
  replayFromSeq?: number
  reset: boolean
  events: ChatStreamEvent[]
  statusEvent?: ChatRunRetryEvent | ChatRunResumedEvent
}

export type Session = ChatSession
export type Message = ChatMessage
export type ToolCall = ToolCallDisplay

export interface ChatSessionMetadata extends Record<string, unknown> {}
