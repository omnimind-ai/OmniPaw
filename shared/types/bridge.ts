import type { AppInfo } from './app'
import type {
  CatBounds,
  CatCommandEvent,
  CatDraftChangedEvent,
  CatDraftClearRequest,
  CatDraftRequest,
  CatDraftStageRequest,
  CatDraftState,
  CatDragPayload,
  CatNotificationActionRequest,
  CatNotificationEvent,
  CatPanelActiveSessionState,
  CatPanelOpenRequest,
  CatPanelPlacement,
  CatPanelSetActiveSessionRequest,
  CatPanelToggleResult,
  CatStatus,
  CatTaskState,
  CatWindowState,
} from './cat'
import type {
  AbortRunRequest,
  AbortRunResponse,
  AttachmentPreviewRequest,
  AttachmentPreviewResponse,
  ChatMessage,
  ChatMessagePart,
  ChatSession,
  ChatSessionChangedEvent,
  ChatStreamEvent,
  CreateSessionRequest,
  DeleteSessionRequest,
  EditMessageRequest,
  EditMessageResponse,
  ListMessagesRequest,
  ListSessionsRequest,
  RegenerateMessageRequest,
  SendMessageRequest,
  SendMessageResponse,
  ToolApprovalRequest,
  ToolApprovalResponse,
  UpdateSessionRequest,
  UploadAttachmentRequest,
  UploadAttachmentResponse,
} from './chat'
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
} from './cron'
import type { LoggerHealthStatus, LoggerWriteResponse, RendererLogRequest } from './logging'
import type {
  DeleteMcpServerRequest,
  McpServerChangedEvent,
  McpServerListResponse,
  McpServerSummary,
  McpToolInventoryResponse,
  RefreshMcpServerRequest,
  SaveMcpServerRequest,
  SetMcpServerEnabledRequest,
} from './mcp'
import type {
  CreateProviderFromPresetRequest,
  DeleteProviderRequest,
  ProviderApi,
  ProviderCapabilities,
  ProviderCompat,
  ProviderConfig,
  ProviderCredential,
  ProviderModel,
  ProviderOperationResult,
  ProviderPreset,
  ProviderTestResult,
  ProviderType,
  RefreshProviderModelsRequest,
  SaveProviderRequest,
  SetSessionModelRequest,
  TestProviderRequest,
} from './provider'
import type {
  DesktopSettingsChangedEvent,
  DesktopSettingsConfig,
  DesktopSettingsStatus,
  SaveDesktopSettingsRequest,
} from './settings'
import type {
  ImportSkillRequest,
  ImportSkillResponse,
  LocalSkillSummary,
  SetSkillEnabledRequest,
  SkillChangedEvent,
  SkillListResponse,
} from './skill'
import type { ManagedToolInfo, SetToolEnabledRequest, SetToolEnabledResponse } from './tool'

export type Unsubscribe = () => void

export interface ProviderModelRef {
  providerId: string
  modelId: string
}

export interface ProviderRegistrySource {
  id: string
  name: string
  type?: ProviderType
  api?: ProviderApi
  baseUrl: string
  enabled: boolean
  credentialRef?: string
  authHeader?: string
  headers?: Record<string, string>
  extraBody?: Record<string, unknown>
  defaultModelId?: string
  capabilities?: ProviderCapabilities
  compat?: ProviderCompat
  createdAt?: number
  updatedAt?: number
}

export interface ProviderRegistryModel extends ProviderModel {
  providerId: string
  providerSourceId?: string
  manual?: boolean
  createdAt?: number
  updatedAt?: number
}

export interface ProviderRegistrySettings {
  defaultProviderId?: string
  defaultModelId?: string
  fallbackModelRefs: ProviderModelRef[]
  titleModelRef?: ProviderModelRef
  streaming: boolean
}

export interface ProviderRegistryConfig {
  version: 1
  sources: ProviderRegistrySource[]
  models: ProviderRegistryModel[]
  settings: ProviderRegistrySettings
}

export interface ProviderRegistryOperationError {
  code: string
  message: string
  path?: string
  recoverable: boolean
  issues?: Array<{ path: string; message: string; code?: string }>
}

export interface ProviderRegistryStatus {
  path: string
  backupPath: string
  exists: boolean
  backupExists: boolean
  loaded: boolean
  version?: 1
  recoverable: boolean
  error?: ProviderRegistryOperationError
}

export type ProviderRegistryChangeReason =
  | 'load'
  | 'save'
  | 'delete'
  | 'refresh'
  | 'default'
  | 'fallback'
  | 'title'

export interface ProviderSelectionRef {
  providerId?: string
  modelId?: string
}

export interface ProviderRegistryLoadResponse {
  registry: ProviderRegistryConfig
  status: ProviderRegistryStatus
}

export interface ProviderRegistryMutationResult extends ProviderRegistryLoadResponse {
  ok?: boolean
  source?: ProviderRegistrySource
  model?: ProviderRegistryModel
  models?: ProviderRegistryModel[]
  nextSelection?: ProviderSelectionRef
}

export interface ProviderRegistryChangedEvent extends ProviderRegistryLoadResponse {
  reason: ProviderRegistryChangeReason
  nextSelection?: ProviderSelectionRef
}

export interface UpsertProviderSourceRequest {
  source: ProviderRegistrySource
  credential?: {
    type: ProviderCredential['type']
    label: string
    value?: string
    envVar?: string
  }
}

export interface UpsertProviderModelRequest {
  providerId: string
  model: ProviderRegistryModel
}

export interface DeleteProviderSourceRequest {
  providerId: string
}

export interface DeleteProviderModelRequest {
  providerId: string
  modelId: string
}

export interface SetDefaultProviderModelRequest {
  providerId?: string
  modelId?: string
}

export interface SetFallbackProviderModelsRequest {
  models: ProviderModelRef[]
}

export interface SetTitleProviderModelRequest {
  providerId?: string
  modelId?: string
}

export interface RefreshProviderRegistryModelsRequest {
  providerId: string
}

export interface TestProviderRegistryRequest extends Omit<TestProviderRequest, 'provider'> {
  source?: ProviderRegistrySource
  model?: ProviderRegistryModel
}

export interface OpenOmniClawBridge {
  app: {
    getInfo: () => Promise<AppInfo>
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
    onCommand: (callback: (event: CatCommandEvent) => void) => Unsubscribe
    togglePanel: () => Promise<CatPanelToggleResult>
    dragStart: () => Promise<CatBounds | null>
    dragMove: (payload: CatDragPayload) => Promise<CatBounds | null>
    dragEnd: () => Promise<CatBounds | null>
  }
  catPanel: {
    onPlacement: (callback: (placement: CatPanelPlacement) => void) => Unsubscribe
    open: (request?: CatPanelOpenRequest) => Promise<CatPanelToggleResult>
    getActiveSession: () => Promise<CatPanelActiveSessionState>
    setActiveSession: (
      request: CatPanelSetActiveSessionRequest | string
    ) => Promise<CatPanelActiveSessionState>
    onActiveSessionChanged: (callback: (event: CatPanelActiveSessionState) => void) => Unsubscribe
    getDraft: (request?: CatDraftRequest | string) => Promise<CatDraftState | null>
    stageDraftAttachments: (request: CatDraftStageRequest) => Promise<CatDraftState>
    clearDraft: (request: CatDraftClearRequest | string) => Promise<CatDraftState | null>
    onDraftChanged: (callback: (event: CatDraftChangedEvent) => void) => Unsubscribe
  }
  catNotification: {
    onEvent: (callback: (event: CatNotificationEvent) => void) => Unsubscribe
    close: (request?: CatNotificationActionRequest | string) => Promise<void>
    viewResult: (request: CatNotificationActionRequest | string) => Promise<void>
  }
  settings: {
    load: () => Promise<DesktopSettingsConfig>
    save: (
      request: SaveDesktopSettingsRequest | DesktopSettingsConfig
    ) => Promise<DesktopSettingsConfig>
    reset: () => Promise<DesktopSettingsConfig>
    status: () => Promise<DesktopSettingsStatus>
    onChanged: (callback: (event: DesktopSettingsChangedEvent) => void) => Unsubscribe
  }
  chat: {
    listSessions: (request?: ListSessionsRequest) => Promise<ChatSession[]>
    createSession: (request?: CreateSessionRequest) => Promise<ChatSession>
    getSession: (sessionId: string) => Promise<ChatSession | null>
    updateSession: (
      ...args: [request: UpdateSessionRequest] | [sessionId: string, patch: Partial<ChatSession>]
    ) => Promise<ChatSession>
    deleteSession: (request: DeleteSessionRequest | string) => Promise<{ deleted: boolean }>
    listMessages: (request: ListMessagesRequest | string) => Promise<ChatMessage[]>
    sendMessage: (request: SendMessageRequest) => Promise<SendMessageResponse>
    abortRun: (
      ...args: [request: AbortRunRequest | string] | [runId: string, reason?: string]
    ) => Promise<AbortRunResponse>
    approveToolCall: (request: ToolApprovalRequest) => Promise<ToolApprovalResponse>
    editMessage: (
      ...args:
        | [request: EditMessageRequest]
        | [sessionId: string, messageId: string, parts: ChatMessagePart[]]
    ) => Promise<EditMessageResponse>
    regenerateMessage: (
      ...args:
        | [request: RegenerateMessageRequest]
        | [sessionId: string, messageId: string, providerId?: string, modelId?: string]
    ) => Promise<SendMessageResponse>
    uploadAttachment: (request: UploadAttachmentRequest) => Promise<UploadAttachmentResponse>
    getAttachmentPreview: (
      request: AttachmentPreviewRequest | string
    ) => Promise<AttachmentPreviewResponse>
    onSessionChanged: (callback: (event: ChatSessionChangedEvent) => void) => Unsubscribe
    onStreamEvent: (callback: (event: ChatStreamEvent) => void) => Unsubscribe

    /** Legacy global stream subscriptions kept for transitional UI code. */
    onToken: (callback: (token: string) => void) => Unsubscribe
    onDone: (callback: () => void) => Unsubscribe
  }
  attachment: {
    upload: (
      request: UploadAttachmentRequest & { type?: string; size?: number }
    ) => Promise<UploadAttachmentResponse['attachment']>
    getPreviewUrl: (
      request: AttachmentPreviewRequest | string
    ) => Promise<AttachmentPreviewResponse | string>
  }
  provider: {
    load: () => Promise<ProviderRegistryLoadResponse>
    status: () => Promise<ProviderRegistryStatus>
    list: () => Promise<ProviderConfig[]>
    listPresets: () => Promise<ProviderPreset[]>
    createFromPreset: (request: CreateProviderFromPresetRequest | string) => Promise<ProviderConfig>
    upsertSource: (request: UpsertProviderSourceRequest) => Promise<ProviderRegistryMutationResult>
    upsertModel: (request: UpsertProviderModelRequest) => Promise<ProviderRegistryMutationResult>
    upsert: (request: SaveProviderRequest) => Promise<ProviderConfig>
    deleteSource: (
      request: DeleteProviderSourceRequest | string
    ) => Promise<ProviderRegistryMutationResult>
    deleteModel: (request: DeleteProviderModelRequest) => Promise<ProviderRegistryMutationResult>
    delete: (request: DeleteProviderRequest | string) => Promise<ProviderOperationResult>
    setDefaultModel: (
      request: SetDefaultProviderModelRequest
    ) => Promise<ProviderRegistryMutationResult>
    setFallbackModels: (
      request: SetFallbackProviderModelsRequest
    ) => Promise<ProviderRegistryMutationResult>
    setTitleModel: (
      request: SetTitleProviderModelRequest
    ) => Promise<ProviderRegistryMutationResult>
    test: (
      ...args: [request: TestProviderRequest] | [providerId: string, modelId?: string]
    ) => Promise<ProviderTestResult>
    listModels: (providerId: string) => Promise<ProviderModel[]>
    refreshModels: (request: RefreshProviderModelsRequest | string) => Promise<ProviderModel[]>
    setSessionModel: (request: SetSessionModelRequest) => Promise<ChatSession>
    onChanged: (callback: (event: ProviderRegistryChangedEvent) => void) => Unsubscribe
  }
  skill: {
    list: () => Promise<SkillListResponse>
    refresh: () => Promise<SkillListResponse>
    setEnabled: (request: SetSkillEnabledRequest) => Promise<LocalSkillSummary>
    importSkill: (request: ImportSkillRequest) => Promise<ImportSkillResponse>
    onChanged: (callback: (event: SkillChangedEvent) => void) => Unsubscribe
  }
  cron: {
    list: (request?: ListCronTasksRequest) => Promise<ListCronTasksResponse>
    create: (request: CreateCronTaskRequest) => Promise<CreateCronTaskResponse>
    update: (request: UpdateCronTaskRequest) => Promise<UpdateCronTaskResponse>
    delete: (request: DeleteCronTaskRequest | string) => Promise<DeleteCronTaskResponse>
    runNow: (request: RunCronTaskNowRequest | string) => Promise<RunCronTaskNowResponse>
    listRuns: (request?: ListCronRunsRequest) => Promise<ListCronRunsResponse>
    onChanged: (callback: (event: CronTaskChangedEvent) => void) => Unsubscribe
  }
  tools: {
    list: () => Promise<ManagedToolInfo[]>
    setEnabled: (request: SetToolEnabledRequest) => Promise<SetToolEnabledResponse>
  }
  mcp: {
    listServers: () => Promise<McpServerListResponse>
    saveServer: (request: SaveMcpServerRequest) => Promise<McpServerSummary>
    deleteServer: (request: DeleteMcpServerRequest | string) => Promise<McpServerListResponse>
    setServerEnabled: (request: SetMcpServerEnabledRequest) => Promise<McpServerSummary>
    refreshServer: (request?: RefreshMcpServerRequest | string) => Promise<McpServerListResponse>
    listTools: () => Promise<McpToolInventoryResponse>
    onChanged: (callback: (event: McpServerChangedEvent) => void) => Unsubscribe
  }
}
