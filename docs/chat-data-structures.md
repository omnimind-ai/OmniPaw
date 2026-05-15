# Chat 推荐数据结构

本文档给出 `OpenOmniClaw-electron` chat、附件、上下文、provider 管理的推荐 TypeScript 类型和 SQLite 持久化结构。设计目标是兼容当前 AstrBot 风格 UI message parts，同时让 core 层可以稳定编译 OpenAI-compatible provider payload。

## 设计原则

1. UI 展示消息和 provider 请求消息分离。
2. 消息只引用附件 ID，不把绝对路径和 base64 暴露给 renderer。
3. Provider、Model、Credential 分离。
4. 每次生成都是一个 `ChatRun`，流式事件必须带 `runId/sessionId/messageId/seq`。
5. 所有核心实体使用 `createdAt/updatedAt` epoch milliseconds，DB 使用 INTEGER。
6. JSON 字段只放变化快或结构复杂的数据，常用查询字段单独建列。

## 基础类型

```ts
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

export type ProviderApi =
  | 'openai-chat-completions'
  | 'openai-responses'
  | 'ollama'
  | 'omniinfer'
```

## Message Parts

当前 UI 已经使用 AstrBot 风格 parts，例如 `plain/think/image/record/file/video/reply/tool_call`。建议 core 层保留这套作为展示协议。

```ts
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
  attachmentId: ID
  filename?: string
  alt?: string
}

export interface AudioPart {
  type: 'record'
  attachmentId: ID
  filename?: string
  durationMs?: number
}

export interface VideoPart {
  type: 'video'
  attachmentId: ID
  filename?: string
}

export interface FilePart {
  type: 'file'
  attachmentId: ID
  filename?: string
  extractedTextId?: ID
}

export interface ReplyPart {
  type: 'reply'
  messageId: ID
  selectedText?: string
}

export interface ToolCallPart {
  type: 'tool_call'
  toolCalls: ToolCallDisplay[]
}

export interface ToolCallDisplay {
  id: string
  name?: string
  arguments?: unknown
  result?: unknown
  startedAt?: UnixMs
  finishedAt?: UnixMs
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
```

兼容当前迁移代码时，可以在 IPC boundary 做字段别名：

- `attachmentId` <-> `attachment_id`
- `messageId` <-> `message_id`
- `selectedText` <-> `selected_text`
- `toolCalls` <-> `tool_calls`

## Message

```ts
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
}

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
```

说明：

- `parts` 是 UI canonical content。
- `providerId/modelId` 是生成当时的快照，避免 provider 后续改名导致历史不可解释。
- `checkpointId` 用于编辑、重新生成和 side thread。
- `parentMessageId/rootMessageId` 为未来分支预留。

## Session

```ts
export interface ChatSession {
  id: ID
  title: string
  status: 'active' | 'archived' | 'deleted'

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
}

export interface ContextPolicy {
  mode: 'recent-turns' | 'token-budget' | 'summary-plus-recent'
  maxMessages?: number
  maxInputTokens?: number
  keepRecentTurns?: number
  includeAttachments?: 'current-only' | 'recent' | 'never'
}
```

MVP 默认：

```ts
const defaultContextPolicy: ContextPolicy = {
  mode: 'recent-turns',
  maxMessages: 40,
  includeAttachments: 'current-only',
}
```

## Attachment

```ts
export interface Attachment {
  id: ID
  kind: AttachmentKind
  originalName: string
  storedName: string
  mimeType: string
  sizeBytes: number
  sha256: string

  storagePath: string
  previewPath?: string

  extractedText?: string
  extractedTextStatus?: 'none' | 'pending' | 'complete' | 'error'
  extractedTextError?: string

  createdAt: UnixMs
  updatedAt: UnixMs
}

export interface MessageAttachment {
  messageId: ID
  attachmentId: ID
  partIndex: number
  role: 'input' | 'output'
}
```

附件进入 provider payload 时由 `ContextBuilder` 按 provider/model 能力动态 materialize：

- image -> data URL `image_url`
- text file -> `<attachment name="...">...</attachment>`
- unsupported binary -> `[File Attachment: name ..., mime ..., size ...]`

## Provider

```ts
export interface ProviderConfig {
  id: ID
  name: string
  api: ProviderApi
  baseUrl: string
  enabled: boolean

  credentialRef?: ID
  authHeader?: string
  headers?: Record<string, string>
  extraBody?: Record<string, unknown>

  defaultModelId?: string
  models: ProviderModel[]
  capabilities?: ProviderCapabilities
  createdAt: UnixMs
  updatedAt: UnixMs
}

export interface ProviderModel {
  id: string
  providerId: ID
  name: string
  remoteId: string
  enabled: boolean

  input: Array<'text' | 'image' | 'audio' | 'file'>
  supportsStreaming: boolean
  supportsTools: boolean
  supportsReasoning?: boolean

  contextWindow?: number
  maxOutputTokens?: number
  pricing?: {
    inputPer1M?: number
    outputPer1M?: number
  }
  compat?: ProviderCompat
}

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
```

## Credential

Credential 不应返回给 renderer。

```ts
export interface ProviderCredential {
  id: ID
  providerId: ID
  type: 'api-key' | 'bearer-token' | 'env'
  label: string
  encryptedValue?: string
  envVar?: string
  createdAt: UnixMs
  updatedAt: UnixMs
}
```

推荐解析顺序：

1. session/provider 显式 credential。
2. provider 默认 credential。
3. `envVar`。
4. provider 配置中的临时 key，仅用于开发，不作为长期方案。

## Chat Run

```ts
export interface ChatRun {
  id: ID
  sessionId: ID
  userMessageId: ID
  assistantMessageId: ID
  providerId: ID
  modelId: string

  status: 'queued' | 'running' | 'complete' | 'error' | 'aborted'
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

export interface ProviderRequestSnapshot {
  api: ProviderApi
  baseUrlHost?: string
  model: string
  messageCount: number
  attachmentCount: number
  estimatedInputTokens?: number
}
```

流式事件：

```ts
export type ChatStreamEvent =
  | ChatRunStartedEvent
  | ChatRunDeltaEvent
  | ChatRunPartEvent
  | ChatRunFinalEvent
  | ChatRunErrorEvent

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
```

## Provider 输入模型

这是 core 内部结构，不直接持久化为唯一历史。

```ts
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
```

## SQLite 表结构建议

### `chat_sessions`

```sql
CREATE TABLE chat_sessions (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  default_provider_id TEXT,
  default_model_id TEXT,
  system_prompt TEXT,
  context_policy_json TEXT,
  pinned INTEGER NOT NULL DEFAULT 0,
  message_count INTEGER NOT NULL DEFAULT 0,
  last_message_preview TEXT,
  last_message_at INTEGER,
  metadata_json TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX idx_chat_sessions_updated_at ON chat_sessions(updated_at DESC);
```

### `chat_messages`

```sql
CREATE TABLE chat_messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL,
  status TEXT NOT NULL,
  parts_json TEXT NOT NULL,
  parent_message_id TEXT,
  root_message_id TEXT,
  checkpoint_id TEXT,
  run_id TEXT,
  provider_id TEXT,
  model_id TEXT,
  provider_message_id TEXT,
  usage_json TEXT,
  error_json TEXT,
  metadata_json TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY(session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
);

CREATE INDEX idx_chat_messages_session_created ON chat_messages(session_id, created_at);
CREATE INDEX idx_chat_messages_checkpoint ON chat_messages(checkpoint_id);
CREATE INDEX idx_chat_messages_run ON chat_messages(run_id);
```

### `attachments`

```sql
CREATE TABLE attachments (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  original_name TEXT NOT NULL,
  stored_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  preview_path TEXT,
  extracted_text TEXT,
  extracted_text_status TEXT NOT NULL DEFAULT 'none',
  extracted_text_error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX idx_attachments_sha256 ON attachments(sha256);
```

### `message_attachments`

```sql
CREATE TABLE message_attachments (
  message_id TEXT NOT NULL,
  attachment_id TEXT NOT NULL,
  part_index INTEGER NOT NULL,
  role TEXT NOT NULL,
  PRIMARY KEY(message_id, attachment_id, part_index),
  FOREIGN KEY(message_id) REFERENCES chat_messages(id) ON DELETE CASCADE,
  FOREIGN KEY(attachment_id) REFERENCES attachments(id) ON DELETE RESTRICT
);
```

### `providers`

```sql
CREATE TABLE providers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  api TEXT NOT NULL,
  base_url TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  credential_ref TEXT,
  auth_header TEXT,
  headers_json TEXT,
  extra_body_json TEXT,
  default_model_id TEXT,
  capabilities_json TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
```

### `provider_models`

```sql
CREATE TABLE provider_models (
  provider_id TEXT NOT NULL,
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  remote_id TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  input_json TEXT NOT NULL,
  supports_streaming INTEGER NOT NULL DEFAULT 1,
  supports_tools INTEGER NOT NULL DEFAULT 0,
  supports_reasoning INTEGER NOT NULL DEFAULT 0,
  context_window INTEGER,
  max_output_tokens INTEGER,
  pricing_json TEXT,
  compat_json TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(provider_id, id),
  FOREIGN KEY(provider_id) REFERENCES providers(id) ON DELETE CASCADE
);
```

### `provider_credentials`

```sql
CREATE TABLE provider_credentials (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL,
  type TEXT NOT NULL,
  label TEXT NOT NULL,
  encrypted_value TEXT,
  env_var TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY(provider_id) REFERENCES providers(id) ON DELETE CASCADE
);
```

### `chat_runs`

```sql
CREATE TABLE chat_runs (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  user_message_id TEXT NOT NULL,
  assistant_message_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  model_id TEXT NOT NULL,
  status TEXT NOT NULL,
  idempotency_key TEXT,
  started_at INTEGER,
  finished_at INTEGER,
  abort_reason TEXT,
  usage_json TEXT,
  error_json TEXT,
  request_snapshot_json TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY(session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
);

CREATE INDEX idx_chat_runs_session_created ON chat_runs(session_id, created_at DESC);
CREATE UNIQUE INDEX idx_chat_runs_idempotency ON chat_runs(idempotency_key)
  WHERE idempotency_key IS NOT NULL;
```

## IPC 请求响应建议

```ts
export interface SendMessageRequest {
  sessionId: ID
  parts: ChatMessagePart[]
  providerId?: ID
  modelId?: string
  idempotencyKey?: string
}

export interface SendMessageResponse {
  runId: ID
  userMessageId: ID
  assistantMessageId: ID
  accepted: boolean
}

export interface UploadAttachmentRequest {
  name: string
  mimeType?: string
  bytes: ArrayBuffer
}

export interface UploadAttachmentResponse {
  attachment: Attachment
}
```

## 与当前代码的迁移映射

现有 `shared/types/chat.ts`：

- `Session` 扩展为 `ChatSession`。
- `Message.content: string` 替换为 `parts: ChatMessagePart[]`。
- `SendMessageRequest.content` 替换为 `parts`。
- `ToolCall` 迁入 `ToolCallPart` 或 provider tool call。

现有 `shared/types/provider.ts`：

- `ProviderType` 替换或扩展为 `ProviderApi`。
- `ProviderConfig.models` 替换为完整 `ProviderModel[]`。
- `apiKey` 移出 renderer 可见结构，改为 `credentialRef`。

现有 `src/composables/useMessages.ts`：

- 可以继续消费 `plain/think/image/record/file/video/reply/tool_call`。
- 将 REST/SSE 调用替换为 IPC bridge。
- 将 `attachment_id` alias 映射为 `attachmentId`，或在 renderer 保持 snake_case 兼容层。

现有 `core/provider/providers/openai.ts`：

- `ChatCompletionRequest.messages` 应改用 `ProviderMessage[]`。
- `ChatCompletionChunk` 应至少带 `type/channel/delta/usage/finishReason`。

## MVP 默认数据

首次启动可写入一个默认 provider：

```ts
const defaultProvider: ProviderConfig = {
  id: 'openai-compatible',
  name: 'OpenAI Compatible',
  api: 'openai-chat-completions',
  baseUrl: 'https://api.openai.com/v1',
  enabled: true,
  models: [],
  capabilities: {
    listModels: true,
    streaming: true,
    tools: true,
    vision: true,
  },
  createdAt: Date.now(),
  updatedAt: Date.now(),
}
```

默认 session：

```ts
const defaultSession: ChatSession = {
  id: crypto.randomUUID(),
  title: '新会话',
  status: 'active',
  contextPolicy: {
    mode: 'recent-turns',
    maxMessages: 40,
    includeAttachments: 'current-only',
  },
  createdAt: Date.now(),
  updatedAt: Date.now(),
}
```
