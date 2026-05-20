import type {
  CatBounds,
  CatCommandEvent,
  CatDragPayload,
  CatPanelPlacement,
  CatPanelToggleResult,
  CatStatus,
  CatTaskState,
  CatWindowState,
} from '@shared/types/cat'
import type {
  CreateCronTaskRequest,
  CreateCronTaskResponse,
  CronTaskChangedEvent,
  DeleteCronTaskRequest,
  DeleteCronTaskResponse,
  ListCronRunsRequest,
  ListCronRunsResponse,
  ListCronTasksRequest,
  ListCronTasksResponse,
  RunCronTaskNowRequest,
  RunCronTaskNowResponse,
  UpdateCronTaskRequest,
  UpdateCronTaskResponse,
} from '@shared/types/cron'
import type {
  LoggerHealthStatus,
  LoggerWriteResponse,
  RendererLogRequest,
} from '@shared/types/logging'

export type BridgeUnsubscribe = () => void

export type BridgeAppTheme = 'system' | 'light' | 'dark'
export type BridgeAppLanguage = 'system' | 'zh-CN' | 'en-US'
export type BridgeToolProfile = 'minimal' | 'assistant' | 'power' | string

export interface BridgeDesktopSettingsConfig {
  version: 1
  app: {
    language: BridgeAppLanguage
    theme: BridgeAppTheme
    minimizeToTrayOnStartup: boolean
    zoom: {
      factor: number
      min: number
      max: number
    }
    maxRecentMessages: number
    compactSkillDescriptions: boolean
    dataDir?: string
  }
  providers: {
    sources: Array<
      Record<string, unknown> & { id: string; name: string; baseUrl: string; enabled: boolean }
    >
    models: Array<
      Record<string, unknown> & {
        id: string
        name: string
        providerSourceId: string
        enabled: boolean
      }
    >
    settings: {
      defaultModelId: string
      fallbackModelIds: string[]
      streaming: boolean
    }
  }
  tools: {
    agentToolProfile: BridgeToolProfile
    enabledByName: Record<string, boolean>
  }
  scheduledTasks: {
    enabled: boolean
    misfirePolicy: 'run_once' | 'skip'
    misfireGraceMs: number
    misfireStartupLimit: number
  }
}

export interface BridgeSettingsOperationError {
  code: string
  message: string
  path?: string
  recoverable: boolean
  issues?: Array<{ path: string; message: string; code?: string }>
}

export interface BridgeDesktopSettingsStatus {
  path: string
  backupPath: string
  exists: boolean
  backupExists: boolean
  loaded: boolean
  version?: 1
  recoverable: boolean
  error?: BridgeSettingsOperationError
}

export interface BridgeDesktopSettingsChangedEvent {
  reason: 'load' | 'save' | 'reset'
  config: BridgeDesktopSettingsConfig
  status: BridgeDesktopSettingsStatus
}

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

export interface BridgeChatSessionChangedEvent {
  reason: 'created' | 'updated' | 'deleted' | 'title_generated' | string
  sessionId: string
  session?: BridgeChatSession
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
  toolCall?: unknown
  tool_call?: unknown
  [key: string]: unknown
}

export type BridgeChatRunMode = 'assistant' | 'fast_chat' | string
export type BridgeToolCallStatus =
  | 'pending'
  | 'running'
  | 'complete'
  | 'error'
  | 'denied'
  | 'aborted'
  | string

export interface BridgeToolCall {
  id?: string
  index?: number
  toolCallId?: string
  tool_call_id?: string
  name?: string
  toolName?: string
  tool_name?: string
  args?: unknown
  arguments?: unknown
  argumentsDelta?: string
  arguments_delta?: string
  result?: unknown
  error?: unknown
  status?: BridgeToolCallStatus
  state?: BridgeToolCallStatus
  toolStatus?: BridgeToolCallStatus
  tool_status?: BridgeToolCallStatus
  startedAt?: number
  started_at?: number
  startTime?: number
  start_time?: number
  ts?: number
  finishedAt?: number
  finished_at?: number
  finishedTs?: number
  finished_ts?: number
  endTime?: number
  end_time?: number
  durationMs?: number
  duration_ms?: number
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
  mode?: BridgeChatRunMode
  toolProfile?: BridgeToolProfile
  tool_profile?: BridgeToolProfile
  maxSteps?: number
  max_steps?: number
  enableStreaming?: boolean
  idempotencyKey?: string
  checkpointId?: string | null
  metadata?: Record<string, unknown>
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

export interface BridgeRegenerateMessageRequest {
  sessionId: string
  messageId: string
  providerId?: string
  modelId?: string
  toolProfile?: BridgeToolProfile
  maxSteps?: number
  idempotencyKey?: string
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
  part?: BridgeChatMessagePart
  toolCall?: BridgeToolCall
  tool_call?: BridgeToolCall
  toolCalls?: BridgeToolCall[]
  tool_calls?: BridgeToolCall[]
  toolCallId?: string
  tool_call_id?: string
  name?: string
  toolName?: string
  tool_name?: string
  args?: unknown
  arguments?: unknown
  argumentsDelta?: string
  arguments_delta?: string
  index?: number
  result?: unknown
  status?: BridgeToolCallStatus
  state?: BridgeToolCallStatus
  step?: number
  maxSteps?: number
  max_steps?: number
  message?: BridgeChatMessage
  error?: { message?: string; code?: string } | unknown
  usage?: Record<string, unknown>
  [key: string]: unknown
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
  compat?: Record<string, unknown>
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

export interface BridgeProviderPreset {
  id: string
  name: string
  type: 'openai-compatible' | 'ollama' | 'omniinfer'
  api: 'openai-chat-completions' | 'openai-responses' | 'ollama' | 'omniinfer'
  baseUrl: string
  description?: string
  enabled?: boolean
  credentialRef?: string
  authHeader?: string
  headers?: Record<string, string>
  extraBody?: Record<string, unknown>
  defaultModelId?: string
  models?: BridgeProviderModel[]
  capabilities?: Record<string, unknown>
  compat?: Record<string, unknown>
}

export interface BridgeProviderRegistrySource extends Omit<BridgeProviderConfig, 'models'> {
  defaultModelId?: string
}

export interface BridgeProviderRegistryModel extends BridgeProviderModel {
  providerId: string
  providerSourceId?: string
  manual?: boolean
}

export interface BridgeProviderRegistrySettings {
  defaultProviderId?: string
  defaultModelId?: string
  fallbackModelRefs: Array<{ providerId: string; modelId: string }>
  titleModelRef?: { providerId: string; modelId: string }
  streaming: boolean
}

export interface BridgeProviderRegistryConfig {
  version: 1
  sources: BridgeProviderRegistrySource[]
  models: BridgeProviderRegistryModel[]
  settings: BridgeProviderRegistrySettings
}

export interface BridgeProviderRegistryOperationError {
  code: string
  message: string
  path?: string
  recoverable: boolean
  issues?: Array<{ path: string; message: string; code?: string }>
}

export interface BridgeProviderRegistryStatus {
  path: string
  backupPath: string
  exists: boolean
  backupExists: boolean
  loaded: boolean
  version?: 1
  recoverable: boolean
  error?: BridgeProviderRegistryOperationError
}

export type BridgeProviderRegistryChangeReason =
  | 'load'
  | 'save'
  | 'delete'
  | 'refresh'
  | 'default'
  | 'fallback'
  | 'title'

export interface BridgeProviderRegistrySelection {
  providerId?: string
  modelId?: string
}

export interface BridgeProviderRegistryLoadResponse {
  registry: BridgeProviderRegistryConfig
  status: BridgeProviderRegistryStatus
}

export interface BridgeProviderRegistryMutationResult extends BridgeProviderRegistryLoadResponse {
  ok?: boolean
  source?: BridgeProviderRegistrySource
  model?: BridgeProviderRegistryModel
  models?: BridgeProviderRegistryModel[]
  nextSelection?: BridgeProviderRegistrySelection
}

export interface BridgeProviderRegistryChangedEvent extends BridgeProviderRegistryLoadResponse {
  reason: BridgeProviderRegistryChangeReason
  nextSelection?: BridgeProviderRegistrySelection
}

export interface BridgeUpsertProviderSourceRequest {
  source: BridgeProviderRegistrySource
  credential?: {
    type: 'api-key' | 'bearer-token' | 'env'
    label: string
    value?: string
    envVar?: string
  }
}

export interface BridgeUpsertProviderModelRequest {
  providerId: string
  model: BridgeProviderRegistryModel
}

export interface BridgeDeleteProviderSourceRequest {
  providerId: string
}

export interface BridgeDeleteProviderModelRequest {
  providerId: string
  modelId: string
}

export interface BridgeSetDefaultProviderModelRequest {
  providerId?: string
  modelId?: string
}

export interface BridgeSetFallbackProviderModelsRequest {
  models: Array<{ providerId: string; modelId: string }>
}

export interface BridgeSetTitleProviderModelRequest {
  providerId?: string
  modelId?: string
}

export interface BridgeManagedToolInfo {
  name: string
  providerName?: string
  label?: string
  description: string
  parameters: Record<string, unknown>
  risk: string
  profiles: string[]
  source: string
  serverId?: string
  serverName?: string
  discoveryStatus?: string
  error?: string
  enabled: boolean
  readonly?: boolean
}

export type BridgeMcpServerTransportType = 'stdio' | 'http'
export type BridgeMcpDiscoveryStatus = 'idle' | 'refreshing' | 'available' | 'error' | 'disabled'

export interface BridgeMcpStdioTransportConfig {
  type: 'stdio'
  command: string
  args: string[]
  cwd?: string
  env: Record<string, string>
}

export interface BridgeMcpHttpTransportConfig {
  type: 'http'
  url: string
  headers: Record<string, string>
}

export type BridgeMcpServerTransportConfig =
  | BridgeMcpStdioTransportConfig
  | BridgeMcpHttpTransportConfig

export interface BridgeMcpSafeStdioTransport {
  type: 'stdio'
  command: string
  args: string[]
  cwd?: string
  envKeys: string[]
}

export interface BridgeMcpSafeHttpTransport {
  type: 'http'
  url: string
  headerKeys: string[]
}

export type BridgeMcpSafeTransport = BridgeMcpSafeStdioTransport | BridgeMcpSafeHttpTransport

export interface BridgeMcpDiscoveredToolSummary {
  name: string
  providerName: string
  label?: string
  description: string
  parameters: Record<string, unknown>
  risk: string
  profiles: string[]
  source: 'mcp'
  serverId: string
  serverName: string
  enabled: boolean
}

export interface BridgeMcpServerSummary {
  id: string
  name: string
  enabled: boolean
  transport: BridgeMcpSafeTransport
  timeoutMs: number
  toolTimeoutMs: number
  status: BridgeMcpDiscoveryStatus
  error?: string
  tools: BridgeMcpDiscoveredToolSummary[]
  createdAt: number
  updatedAt: number
}

export interface BridgeMcpRegistryStatus {
  path: string
  backupPath: string
  exists: boolean
  backupExists: boolean
  loaded: boolean
  version?: 1
  recoverable: boolean
  error?: {
    code: string
    message: string
    path?: string
    recoverable: boolean
    issues?: Array<{ path: string; message: string; code?: string }>
  }
}

export interface BridgeSaveMcpServerRequest {
  server: {
    id?: string
    name: string
    enabled?: boolean
    transport: BridgeMcpServerTransportConfig
    timeoutMs?: number
    toolTimeoutMs?: number
  }
}

export interface BridgeMcpServerListResponse {
  servers: BridgeMcpServerSummary[]
  status: BridgeMcpRegistryStatus
}

export interface BridgeMcpToolInventoryResponse {
  tools: BridgeMcpDiscoveredToolSummary[]
  servers: BridgeMcpServerSummary[]
}

export interface BridgeMcpChangedEvent {
  reason: 'load' | 'save' | 'delete' | 'enable' | 'refresh'
  servers: BridgeMcpServerSummary[]
  status: BridgeMcpRegistryStatus
}

export type BridgeSkillStatus = 'available' | 'invalid' | 'missing'

export interface BridgeSkillOperationError {
  code: string
  message: string
  path?: string
  recoverable: boolean
  issues?: Array<{ path: string; message: string; code?: string }>
}

export interface BridgeSkillStateStatus {
  path: string
  backupPath: string
  exists: boolean
  backupExists: boolean
  loaded: boolean
  version?: 1
  recoverable: boolean
  error?: BridgeSkillOperationError
}

export interface BridgeLocalSkillSummary {
  id: string
  name: string
  description: string
  source: 'local'
  status: BridgeSkillStatus
  enabled: boolean
  rootName: string
  relativePath: string
  metadata: Record<string, string | undefined>
  compatibility?: string
  error?: string
  updatedAt?: number
}

export interface BridgeSkillListResponse {
  skills: BridgeLocalSkillSummary[]
  status: BridgeSkillStateStatus
  rootPath?: string
}

export interface BridgeImportSkillRequest {
  fileName: string
  bytes: ArrayBuffer | Uint8Array
  overwrite?: boolean
  skillNameHint?: string
}

export interface BridgeImportSkillResponse {
  imported: BridgeLocalSkillSummary[]
  skills: BridgeLocalSkillSummary[]
  status: BridgeSkillStateStatus
}

export interface BridgeSkillChangedEvent {
  reason: 'load' | 'refresh' | 'enable' | 'import'
  skills: BridgeLocalSkillSummary[]
  status: BridgeSkillStateStatus
}

export interface RendererOpenOmniClawBridge {
  app: {
    getInfo: () => Promise<{ name: string; version: string; platform: string }>
  }
  logging: {
    write: (request: RendererLogRequest) => Promise<LoggerWriteResponse>
    status: () => Promise<LoggerHealthStatus>
  }
  cat: {
    show: () => Promise<CatStatus>
    hide: () => Promise<CatStatus>
    toggleVisibility: () => Promise<CatStatus>
    setState: (state: CatTaskState) => Promise<CatStatus>
    reportState: (state: CatWindowState) => void
    onCommand: (callback: (event: CatCommandEvent) => void) => BridgeUnsubscribe
    togglePanel: () => Promise<CatPanelToggleResult>
    dragStart: () => Promise<CatBounds | null>
    dragMove: (payload: CatDragPayload) => Promise<CatBounds | null>
    dragEnd: () => Promise<CatBounds | null>
  }
  catPanel: {
    onPlacement: (callback: (event: CatPanelPlacement) => void) => BridgeUnsubscribe
  }
  settings?: {
    load: () => Promise<BridgeDesktopSettingsConfig>
    save: (
      request: { config: BridgeDesktopSettingsConfig } | BridgeDesktopSettingsConfig
    ) => Promise<BridgeDesktopSettingsConfig>
    reset: () => Promise<BridgeDesktopSettingsConfig>
    status: () => Promise<BridgeDesktopSettingsStatus>
    onChanged: (callback: (event: BridgeDesktopSettingsChangedEvent) => void) => BridgeUnsubscribe
  }
  chat: {
    listSessions: () => Promise<BridgeChatSession[]>
    createSession: (request?: Partial<BridgeChatSession>) => Promise<BridgeChatSession>
    updateSession?: (
      sessionId: string,
      patch: Partial<BridgeChatSession>
    ) => Promise<BridgeChatSession>
    updateSessionTitle?: (sessionId: string, title: string) => Promise<BridgeChatSession>
    deleteSession?: (sessionId: string) => Promise<void>
    listMessages?: (sessionId: string) => Promise<BridgeChatMessage[]>
    sendMessage: (request: BridgeSendMessageRequest) => Promise<BridgeSendMessageResponse>
    abortRun?: (runId: string, reason?: string) => Promise<void>
    editMessage?: (
      sessionId: string,
      messageId: string,
      parts: BridgeChatMessagePart[]
    ) => Promise<{
      message?: BridgeChatMessage
      needsRegenerate?: boolean
      truncatedAfterMessage?: boolean
    }>
    regenerateMessage?: (
      ...args:
        | [request: BridgeRegenerateMessageRequest]
        | [sessionId: string, messageId: string, providerId?: string, modelId?: string]
    ) => Promise<BridgeSendMessageResponse>
    onSessionChanged?: (
      callback: (event: BridgeChatSessionChangedEvent) => void
    ) => BridgeUnsubscribe
    onStreamEvent?: (callback: (event: BridgeStreamEvent) => void) => BridgeUnsubscribe
    onToken?: (callback: (token: string) => void) => BridgeUnsubscribe
    onDone?: (callback: () => void) => BridgeUnsubscribe
  }
  attachment?: {
    upload: (request: {
      name: string
      type: string
      size: number
      bytes: ArrayBuffer
    }) => Promise<BridgeAttachment>
    getPreviewUrl: (attachmentId: string) => Promise<string | { url: string; mimeType?: string }>
  }
  provider: {
    load: () => Promise<BridgeProviderRegistryLoadResponse>
    status: () => Promise<BridgeProviderRegistryStatus>
    list: () => Promise<BridgeProviderConfig[]>
    listPresets?: () => Promise<BridgeProviderPreset[]>
    createFromPreset?: (request: string | { presetId: string }) => Promise<BridgeProviderConfig>
    upsertSource?: (
      request: BridgeUpsertProviderSourceRequest
    ) => Promise<BridgeProviderRegistryMutationResult>
    upsertModel?: (
      request: BridgeUpsertProviderModelRequest
    ) => Promise<BridgeProviderRegistryMutationResult>
    upsert?: (request: unknown) => Promise<BridgeProviderConfig>
    deleteSource?: (
      request: string | BridgeDeleteProviderSourceRequest
    ) => Promise<BridgeProviderRegistryMutationResult>
    deleteModel?: (
      request: BridgeDeleteProviderModelRequest
    ) => Promise<BridgeProviderRegistryMutationResult>
    delete?: (
      request: string | { providerId: string }
    ) => Promise<{ ok?: boolean; error?: unknown }>
    setDefaultModel?: (
      request: BridgeSetDefaultProviderModelRequest
    ) => Promise<BridgeProviderRegistryMutationResult>
    setFallbackModels?: (
      request: BridgeSetFallbackProviderModelsRequest
    ) => Promise<BridgeProviderRegistryMutationResult>
    setTitleModel?: (
      request: BridgeSetTitleProviderModelRequest
    ) => Promise<BridgeProviderRegistryMutationResult>
    listModels?: (providerId: string) => Promise<BridgeProviderModel[]>
    refreshModels?: (providerId: string) => Promise<BridgeProviderModel[]>
    test?: (providerId: string, modelId?: string) => Promise<{ ok: boolean; error?: unknown }>
    setSessionModel?: (request: {
      sessionId: string
      providerId: string
      modelId: string
    }) => Promise<BridgeChatSession>
    onChanged: (callback: (event: BridgeProviderRegistryChangedEvent) => void) => BridgeUnsubscribe
  }
  skill: {
    list: () => Promise<BridgeSkillListResponse>
    refresh?: () => Promise<BridgeSkillListResponse>
    setEnabled?: (request: {
      skillId: string
      enabled: boolean
    }) => Promise<BridgeLocalSkillSummary>
    importSkill?: (request: BridgeImportSkillRequest) => Promise<BridgeImportSkillResponse>
    onChanged?: (callback: (event: BridgeSkillChangedEvent) => void) => BridgeUnsubscribe
  }
  cron: {
    list: (request?: ListCronTasksRequest) => Promise<ListCronTasksResponse>
    create?: (request: CreateCronTaskRequest) => Promise<CreateCronTaskResponse>
    update?: (request: UpdateCronTaskRequest) => Promise<UpdateCronTaskResponse>
    delete?: (request: DeleteCronTaskRequest | string) => Promise<DeleteCronTaskResponse>
    runNow?: (request: RunCronTaskNowRequest | string) => Promise<RunCronTaskNowResponse>
    listRuns?: (request?: ListCronRunsRequest) => Promise<ListCronRunsResponse>
    onChanged?: (callback: (event: CronTaskChangedEvent) => void) => BridgeUnsubscribe
  }
  tools?: {
    list: () => Promise<BridgeManagedToolInfo[]>
    setEnabled: (request: {
      name: string
      enabled: boolean
    }) => Promise<{ tool: BridgeManagedToolInfo; tools: BridgeManagedToolInfo[] }>
  }
  mcp?: {
    listServers: () => Promise<BridgeMcpServerListResponse>
    saveServer: (request: BridgeSaveMcpServerRequest) => Promise<BridgeMcpServerSummary>
    deleteServer: (request: string | { serverId: string }) => Promise<BridgeMcpServerListResponse>
    setServerEnabled: (request: {
      serverId: string
      enabled: boolean
    }) => Promise<BridgeMcpServerSummary>
    refreshServer: (
      request?: string | { serverId?: string }
    ) => Promise<BridgeMcpServerListResponse>
    listTools: () => Promise<BridgeMcpToolInventoryResponse>
    onChanged: (callback: (event: BridgeMcpChangedEvent) => void) => BridgeUnsubscribe
  }
}

export type BridgeRuntime = 'electron' | 'fallback'

export const fallbackBridgePersistenceMessage =
  '当前未连接 Electron 主进程，本地配置不会写入磁盘。请在 Electron 窗口中操作。'

function rejectFallbackPersistence<T>(operation: string): Promise<T> {
  return Promise.reject(new Error(`${fallbackBridgePersistenceMessage} (${operation})`))
}

let fallbackCatVisible = false
let fallbackCatState: CatWindowState = 'hidden'
let fallbackCatPanelVisible = false
let fallbackCatPanelSide: CatPanelPlacement['side'] | null = null

function fallbackCatStatus(extra: Partial<CatStatus> = {}): CatStatus {
  return {
    state: fallbackCatState,
    visible: fallbackCatVisible,
    bounds: null,
    panelVisible: fallbackCatPanelVisible,
    panelSide: fallbackCatPanelSide,
    ...extra,
  }
}

function emptyProviderRegistryStatus(): BridgeProviderRegistryStatus {
  return {
    path: '',
    backupPath: '',
    exists: false,
    backupExists: false,
    loaded: true,
    version: 1,
    recoverable: false,
  }
}

function emptyProviderRegistry(): BridgeProviderRegistryConfig {
  return {
    version: 1,
    sources: [],
    models: [],
    settings: {
      defaultModelId: '',
      fallbackModelRefs: [],
      streaming: true,
    },
  }
}

function stripProviderRegistryFromSettingsRequest(
  request: { config: BridgeDesktopSettingsConfig } | BridgeDesktopSettingsConfig
): { config: BridgeDesktopSettingsConfig } | BridgeDesktopSettingsConfig {
  const config = 'config' in request ? request.config : request
  const { providers: _providers, ...rest } = config as BridgeDesktopSettingsConfig & {
    providers?: unknown
  }

  return 'config' in request
    ? ({ config: rest as BridgeDesktopSettingsConfig } as { config: BridgeDesktopSettingsConfig })
    : (rest as BridgeDesktopSettingsConfig)
}

const fallbackBridge: RendererOpenOmniClawBridge = {
  app: {
    getInfo: async () => ({
      name: 'OpenOmniClaw',
      version: 'dev',
      platform: 'win32',
    }),
  },
  logging: {
    write: async () => ({
      accepted: false,
      persisted: false,
      dropped: true,
      reason: 'fallback_runtime',
    }),
    status: async () => {
      const now = Date.now()
      return {
        initialized: false,
        available: false,
        runtime: 'fallback',
        transport: 'none',
        writeCount: 0,
        droppedCount: 0,
        failedWriteCount: 0,
        startedAt: now,
        updatedAt: now,
      }
    },
  },
  cat: {
    show: async () => {
      fallbackCatVisible = true
      if (fallbackCatState === 'hidden') {
        fallbackCatState = 'idle'
      }
      return fallbackCatStatus()
    },
    hide: async () => {
      fallbackCatVisible = false
      fallbackCatState = 'hidden'
      fallbackCatPanelVisible = false
      fallbackCatPanelSide = null
      return fallbackCatStatus()
    },
    toggleVisibility: async () => {
      if (fallbackCatVisible) {
        fallbackCatVisible = false
        fallbackCatState = 'hidden'
        fallbackCatPanelVisible = false
        fallbackCatPanelSide = null
        return fallbackCatStatus()
      }

      fallbackCatVisible = true
      if (fallbackCatState === 'hidden') {
        fallbackCatState = 'idle'
      }
      return fallbackCatStatus()
    },
    setState: async (state) => {
      fallbackCatVisible = true
      fallbackCatState = state
      return fallbackCatStatus()
    },
    reportState: (state) => {
      fallbackCatState = state
      fallbackCatVisible = state !== 'hidden'
    },
    onCommand: () => () => {},
    togglePanel: async () => {
      fallbackCatPanelVisible = !fallbackCatPanelVisible
      fallbackCatPanelSide = fallbackCatPanelVisible ? 'right' : null
      return {
        visible: fallbackCatPanelVisible,
        side: fallbackCatPanelSide || undefined,
      }
    },
    dragStart: async () => null,
    dragMove: async () => null,
    dragEnd: async () => null,
  },
  catPanel: {
    onPlacement: () => () => {},
  },
  settings: {
    load: async () => fallbackSettingsConfig(),
    save: () => rejectFallbackPersistence<BridgeDesktopSettingsConfig>('settings.save'),
    reset: () => rejectFallbackPersistence<BridgeDesktopSettingsConfig>('settings.reset'),
    status: async () => ({
      path: '',
      backupPath: '',
      exists: false,
      backupExists: false,
      loaded: true,
      version: 1,
      recoverable: false,
    }),
    onChanged: () => () => {},
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
    onSessionChanged: () => () => {},
    onStreamEvent: () => () => {},
    onToken: () => () => {},
    onDone: () => () => {},
  },
  attachment: {
    upload: async ({ name, type, size }) => ({
      id: crypto.randomUUID(),
      kind: type.startsWith('image/')
        ? 'image'
        : type.startsWith('audio/')
          ? 'audio'
          : type.startsWith('video/')
            ? 'video'
            : 'file',
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
    load: async () => ({
      registry: emptyProviderRegistry(),
      status: emptyProviderRegistryStatus(),
    }),
    status: async () => emptyProviderRegistryStatus(),
    list: async () => [],
    listPresets: async () => [
      {
        id: 'openai-compatible',
        name: 'OpenAI Compatible',
        type: 'openai-compatible',
        api: 'openai-chat-completions',
        baseUrl: 'https://api.openai.com/v1',
        description: 'OpenAI API and compatible services.',
      },
      {
        id: 'ollama',
        name: 'Ollama',
        type: 'ollama',
        api: 'ollama',
        baseUrl: 'http://localhost:11434/v1',
        description: 'Local Ollama OpenAI-compatible endpoint.',
      },
      {
        id: 'omniinfer-local',
        name: 'OmniInfer Local',
        type: 'omniinfer',
        api: 'omniinfer',
        baseUrl: 'http://localhost:11434/v1',
        description: 'Local OmniInfer-compatible model service.',
      },
    ],
    createFromPreset: () =>
      rejectFallbackPersistence<BridgeProviderConfig>('provider.createFromPreset'),
    upsertSource: () =>
      rejectFallbackPersistence<BridgeProviderRegistryMutationResult>('provider.upsertSource'),
    upsertModel: () =>
      rejectFallbackPersistence<BridgeProviderRegistryMutationResult>('provider.upsertModel'),
    upsert: () => rejectFallbackPersistence<BridgeProviderConfig>('provider.upsert'),
    deleteSource: () =>
      rejectFallbackPersistence<BridgeProviderRegistryMutationResult>('provider.deleteSource'),
    deleteModel: () =>
      rejectFallbackPersistence<BridgeProviderRegistryMutationResult>('provider.deleteModel'),
    delete: () => rejectFallbackPersistence<{ ok?: boolean; error?: unknown }>('provider.delete'),
    setDefaultModel: () =>
      rejectFallbackPersistence<BridgeProviderRegistryMutationResult>('provider.setDefaultModel'),
    setFallbackModels: () =>
      rejectFallbackPersistence<BridgeProviderRegistryMutationResult>('provider.setFallbackModels'),
    setTitleModel: () =>
      rejectFallbackPersistence<BridgeProviderRegistryMutationResult>('provider.setTitleModel'),
    listModels: async () => [],
    refreshModels: () => rejectFallbackPersistence<BridgeProviderModel[]>('provider.refreshModels'),
    test: () => rejectFallbackPersistence<{ ok: boolean; error?: unknown }>('provider.test'),
    setSessionModel: () => rejectFallbackPersistence<BridgeChatSession>('provider.setSessionModel'),
    onChanged: () => () => {},
  },
  skill: {
    list: async () => ({
      skills: [],
      status: {
        path: '',
        backupPath: '',
        exists: false,
        backupExists: false,
        loaded: true,
        version: 1,
        recoverable: false,
      },
    }),
    refresh: () => rejectFallbackPersistence<BridgeSkillListResponse>('skill.refresh'),
    setEnabled: () => rejectFallbackPersistence<BridgeLocalSkillSummary>('skill.setEnabled'),
    importSkill: () => rejectFallbackPersistence<BridgeImportSkillResponse>('skill.importSkill'),
    onChanged: () => () => {},
  },
  cron: {
    list: async () => ({ tasks: [] }),
    create: () => rejectFallbackPersistence<CreateCronTaskResponse>('cron.create'),
    update: () => rejectFallbackPersistence<UpdateCronTaskResponse>('cron.update'),
    delete: () => rejectFallbackPersistence<DeleteCronTaskResponse>('cron.delete'),
    runNow: () => rejectFallbackPersistence<RunCronTaskNowResponse>('cron.runNow'),
    listRuns: async () => ({ runs: [] }),
    onChanged: () => () => {},
  },
  tools: {
    list: async () => [
      {
        name: 'system_time',
        label: 'System time',
        description: 'Get the current local time, timezone, and UTC offset.',
        parameters: {
          type: 'object',
          properties: {},
          additionalProperties: false,
        },
        risk: 'safe',
        profiles: ['minimal', 'assistant', 'power'],
        source: 'builtin',
        enabled: true,
      },
    ],
    setEnabled: () =>
      rejectFallbackPersistence<{ tool: BridgeManagedToolInfo; tools: BridgeManagedToolInfo[] }>(
        'tools.setEnabled'
      ),
  },
  mcp: {
    listServers: async () => ({
      servers: [],
      status: {
        path: '',
        backupPath: '',
        exists: false,
        backupExists: false,
        loaded: true,
        version: 1,
        recoverable: false,
      },
    }),
    saveServer: () => rejectFallbackPersistence<BridgeMcpServerSummary>('mcp.saveServer'),
    deleteServer: () => rejectFallbackPersistence<BridgeMcpServerListResponse>('mcp.deleteServer'),
    setServerEnabled: () =>
      rejectFallbackPersistence<BridgeMcpServerSummary>('mcp.setServerEnabled'),
    refreshServer: () =>
      rejectFallbackPersistence<BridgeMcpServerListResponse>('mcp.refreshServer'),
    listTools: async () => ({ tools: [], servers: [] }),
    onChanged: () => () => {},
  },
}

function fallbackSettingsConfig(): BridgeDesktopSettingsConfig {
  return {
    version: 1,
    app: {
      language: 'system',
      theme: 'system',
      minimizeToTrayOnStartup: false,
      zoom: {
        factor: 1,
        min: 0.75,
        max: 1.5,
      },
      maxRecentMessages: 20,
      compactSkillDescriptions: true,
    },
    providers: {
      sources: [],
      models: [],
      settings: {
        defaultModelId: '',
        fallbackModelIds: [],
        streaming: true,
      },
    },
    tools: {
      agentToolProfile: 'assistant',
      enabledByName: {},
    },
    scheduledTasks: {
      enabled: false,
      misfirePolicy: 'run_once',
      misfireGraceMs: 15 * 60 * 1000,
      misfireStartupLimit: 3,
    },
  }
}

const exposedBridge =
  typeof window === 'undefined'
    ? undefined
    : (window.openOmniClaw as RendererOpenOmniClawBridge | undefined)

export const bridgeRuntime: BridgeRuntime = exposedBridge ? 'electron' : 'fallback'
export const isFallbackBridge = bridgeRuntime === 'fallback'

function createSettingsBridge(
  bridge: RendererOpenOmniClawBridge['settings'] | undefined
): RendererOpenOmniClawBridge['settings'] {
  if (!bridge) {
    return fallbackBridge.settings
  }

  return {
    ...fallbackBridge.settings,
    ...bridge,
    save: (request) => bridge.save(stripProviderRegistryFromSettingsRequest(request)),
  }
}

function createProviderBridge(
  bridge: RendererOpenOmniClawBridge['provider'] | undefined
): RendererOpenOmniClawBridge['provider'] {
  if (!bridge) {
    return fallbackBridge.provider
  }

  return {
    ...fallbackBridge.provider,
    ...bridge,
    load: bridge.load ?? fallbackBridge.provider.load,
    status: bridge.status ?? fallbackBridge.provider.status,
    onChanged: bridge.onChanged ?? fallbackBridge.provider.onChanged,
  }
}

function createCronBridge(
  bridge: RendererOpenOmniClawBridge['cron'] | undefined
): RendererOpenOmniClawBridge['cron'] {
  if (!bridge) {
    return fallbackBridge.cron
  }

  return {
    ...fallbackBridge.cron,
    ...bridge,
    list: bridge.list ?? fallbackBridge.cron.list,
    listRuns: bridge.listRuns ?? fallbackBridge.cron.listRuns,
    onChanged: bridge.onChanged ?? fallbackBridge.cron.onChanged,
  }
}

export const appBridge: RendererOpenOmniClawBridge = exposedBridge
  ? {
      ...fallbackBridge,
      ...exposedBridge,
      logging: exposedBridge.logging ?? fallbackBridge.logging,
      settings: createSettingsBridge(exposedBridge.settings),
      provider: createProviderBridge(exposedBridge.provider),
      cron: createCronBridge(exposedBridge.cron),
    }
  : fallbackBridge

export function ensureElectronBridge(operation = '该操作'): void {
  if (isFallbackBridge) {
    throw new Error(`${fallbackBridgePersistenceMessage} (${operation})`)
  }
}
