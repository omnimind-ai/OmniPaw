import type { AppInfo, OpenChatSessionRequest, OpenDirectoryResponse } from './app'
import type {
  CatBounds,
  CatBubbleDismissRequest,
  CatBubbleEvent,
  CatBubbleShowRequest,
  CatCommandEvent,
  CatDraftChangedEvent,
  CatDraftClearRequest,
  CatDraftRequest,
  CatDraftStageRequest,
  CatDraftState,
  CatDragPayload,
  CatHitGeometry,
  CatInteractionState,
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
  CatAppearanceChangedEvent,
  CatAppearanceDeletePackRequest,
  CatAppearanceDeleteResponse,
  CatAppearanceGetPackRequest,
  CatAppearanceImportResponse,
  CatAppearanceListResponse,
  CatAppearanceResolvedPack,
  CatAppearanceSetActiveRequest,
} from './cat-appearance'
import type {
  CatPetChangedEvent,
  CatPetDebugUnlockGiftResponse,
  CatPetInventoryRequest,
  CatPetInventoryResponse,
  CatPetPerformRequest,
  CatPetPerformResponse,
  CatPetState,
  CatPetUpdateInteractionsRequest,
  CatPetUpdateInteractionsResponse,
} from './cat-pet'
import type {
  AbortRunRequest,
  AbortRunResponse,
  AttachmentPreviewRequest,
  AttachmentPreviewResponse,
  ChatMessage,
  ChatMessagePart,
  ChatRun,
  ChatSession,
  ChatSessionChangedEvent,
  ChatStreamEvent,
  CreateSessionRequest,
  DeleteSessionRequest,
  EditMessageRequest,
  EditMessageResponse,
  ListMessagesRequest,
  ListRunsRequest,
  ListSessionsRequest,
  RegenerateMessageRequest,
  SendMessageRequest,
  SendMessageResponse,
  SubscribeRunRequest,
  SubscribeRunResponse,
  ToolApprovalRequest,
  ToolApprovalResponse,
  UpdateSessionRequest,
  UploadAttachmentRequest,
  UploadAttachmentResponse,
} from './chat'
import type {
  ExportCompanionRoleCardRequest,
  ExportCompanionRoleCardResponse,
  ImportCompanionRoleCardRequest,
  ImportCompanionRoleCardResponse,
} from './companion-role'
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
import type {
  AgentWorkspaceStatus,
  AgentWorkspaceStatusRequest,
  CleanupWorkspaceRequest,
  CleanupWorkspaceResponse,
  DeleteWorkspaceFileRequest,
  DeleteWorkspaceFileResponse,
  ExportWorkspaceFileRequest,
  ExportWorkspaceFileResponse,
  GetLocalProcessRequest,
  KillLocalProcessRequest,
  KillLocalProcessResponse,
  ListLocalProcessesRequest,
  ListWorkspaceFilesRequest,
  ListWorkspaceFilesResponse,
  LocalProcessSummary,
  ReadWorkspaceFileRequest,
  ReadWorkspaceFileResponse,
  RevealWorkspaceFileRequest,
  RevealWorkspaceFileResponse,
} from './local-agent'
import type {
  ExportLogResponse,
  LoggerHealthStatus,
  LoggerWriteResponse,
  OpenLogLocationResponse,
  RendererLogRequest,
} from './logging'
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
  CompanionMemoryDeleteRequest,
  CompanionMemoryFilters,
  CompanionMemoryImportanceRequest,
  CompanionMemoryInspectResponse,
  CompanionMemoryItem,
  CompanionMemoryListResponse,
  CompanionMemoryMaintenanceProposal,
  CompanionMemoryProposalListRequest,
  CompanionMemorySettingsRequest,
  CreateCompanionMemoryRequest,
  DesktopMemorySettings,
  UpdateCompanionMemoryProposalRequest,
  UpdateCompanionMemoryRequest,
} from './memory'
import type {
  ObservationChangedEvent,
  ObservationPermissionStatus,
  ObservationReactionEvent,
  ObservationState,
  ObservationStatusRequest,
  StartObservationRequest,
  StopObservationRequest,
  TriggerObservationRequest,
} from './observation'
import type {
  GetOmniInferLogsPathResponse,
  InstalledModelRecord,
  OmniInferLogEntry,
  OmniInferRuntimeSnapshot,
  PickLocalGgufResponse,
  PickOmniInferInstallDirResponse,
  RescanInstalledModelsResponse,
  SelectModelRequest,
  SetThinkingRequest,
} from './omniinfer'
import type {
  CreateProviderFromPresetRequest,
  DeleteProviderRequest,
  OpenAICodexOAuthProviderRequest,
  OpenAICodexOAuthStatus,
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
  PickDesktopBackgroundImageResponse,
  SaveDesktopSettingsRequest,
} from './settings'
import type { ShortcutStatusChangedEvent } from './shortcuts'
import type {
  ImportSkillRequest,
  ImportSkillResponse,
  LocalSkillSummary,
  ReadSkillRequest,
  SetSkillEnabledRequest,
  SkillChangedEvent,
  SkillListResponse,
  SkillReadResult,
} from './skill'
import type { ManagedToolInfo, SetToolEnabledRequest, SetToolEnabledResponse } from './tool'
import type { DesktopWindowState, DesktopWindowStateChangedEvent } from './window'

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
  omniInferInstallDir?: string
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
  embeddingModelRef?: ProviderModelRef
  observationVisionModelRef?: ProviderModelRef
  observationReactionModelRef?: ProviderModelRef
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
  | 'embedding'
  | 'observation'

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

export interface SetEmbeddingProviderModelRequest {
  providerId?: string
  modelId?: string
}

export interface SetObservationProviderModelsRequest {
  observationVisionModelRef?: ProviderModelRef
  observationReactionModelRef?: ProviderModelRef
}

export interface RefreshProviderRegistryModelsRequest {
  providerId: string
}

export interface TestProviderRegistryRequest extends Omit<TestProviderRequest, 'provider'> {
  source?: ProviderRegistrySource
  model?: ProviderRegistryModel
}

export interface OmniPawBridge {
  app: {
    getInfo: () => Promise<AppInfo>
    openSettingsDirectory: () => Promise<OpenDirectoryResponse>
    openChatSession: (request: OpenChatSessionRequest | string) => Promise<void>
    onOpenChatSession: (callback: (request: OpenChatSessionRequest) => void) => Unsubscribe
  }
  window: {
    getState: () => Promise<DesktopWindowState>
    minimize: () => Promise<DesktopWindowState>
    toggleMaximize: () => Promise<DesktopWindowState>
    close: () => Promise<void>
    onStateChanged: (callback: (event: DesktopWindowStateChangedEvent) => void) => Unsubscribe
  }
  logging: {
    write: (request: RendererLogRequest) => Promise<LoggerWriteResponse>
    status: () => Promise<LoggerHealthStatus>
    openLocation: () => Promise<OpenLogLocationResponse>
    export: () => Promise<ExportLogResponse>
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
    dragMove: (payload?: CatDragPayload) => Promise<CatBounds | null>
    dragEnd: () => Promise<CatBounds | null>
    setHitArea: (geometry: CatHitGeometry) => Promise<void>
    setInteractionState: (state: CatInteractionState) => Promise<void>
    onObservationReaction: (callback: (event: ObservationReactionEvent) => void) => Unsubscribe
    openObservationSource: (event: ObservationReactionEvent) => Promise<void>
    showBubble: (request: CatBubbleShowRequest | string) => Promise<CatBubbleEvent | null>
    dismissBubble: (request?: CatBubbleDismissRequest | string) => Promise<void>
    reportBubbleReady: () => void
    onBubbleEvent: (callback: (event: CatBubbleEvent) => void) => Unsubscribe
    onBubblePlacement: (callback: (placement: CatPanelPlacement) => void) => Unsubscribe
  }
  catAppearance: {
    current: () => Promise<CatAppearanceResolvedPack>
    getPack: (request: CatAppearanceGetPackRequest | string) => Promise<CatAppearanceResolvedPack>
    list: () => Promise<CatAppearanceListResponse>
    refresh: () => Promise<CatAppearanceListResponse>
    importPack: () => Promise<CatAppearanceImportResponse>
    deletePack: (
      request: CatAppearanceDeletePackRequest | string
    ) => Promise<CatAppearanceDeleteResponse>
    setActive: (
      request: CatAppearanceSetActiveRequest | string
    ) => Promise<CatAppearanceResolvedPack>
    onChanged: (callback: (event: CatAppearanceChangedEvent) => void) => Unsubscribe
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
  catPet: {
    getState: () => Promise<CatPetState>
    getInventory: (request: CatPetInventoryRequest) => Promise<CatPetInventoryResponse>
    perform: (request: CatPetPerformRequest) => Promise<CatPetPerformResponse>
    updateInteractions: (
      request: CatPetUpdateInteractionsRequest
    ) => Promise<CatPetUpdateInteractionsResponse>
    debugUnlockNextGift: () => Promise<CatPetDebugUnlockGiftResponse>
    onChanged: (callback: (event: CatPetChangedEvent) => void) => Unsubscribe
  }
  settings: {
    load: () => Promise<DesktopSettingsConfig>
    save: (
      request: SaveDesktopSettingsRequest | DesktopSettingsConfig
    ) => Promise<DesktopSettingsConfig>
    reset: () => Promise<DesktopSettingsConfig>
    status: () => Promise<DesktopSettingsStatus>
    pickBackgroundImage: () => Promise<PickDesktopBackgroundImageResponse>
    onChanged: (callback: (event: DesktopSettingsChangedEvent) => void) => Unsubscribe
  }
  shortcuts: {
    status: () => Promise<ShortcutStatusChangedEvent>
    setCaptureMode: (enabled: boolean) => Promise<ShortcutStatusChangedEvent>
    onChanged: (callback: (event: ShortcutStatusChangedEvent) => void) => Unsubscribe
  }
  memory: {
    list: (filters?: CompanionMemoryFilters) => Promise<CompanionMemoryListResponse>
    search: (filters?: CompanionMemoryFilters) => Promise<CompanionMemoryListResponse>
    inspect: (memoryId: string) => Promise<CompanionMemoryInspectResponse | null>
    create: (request: CreateCompanionMemoryRequest) => Promise<CompanionMemoryItem>
    update: (request: UpdateCompanionMemoryRequest) => Promise<CompanionMemoryItem | null>
    archive: (memoryId: string) => Promise<CompanionMemoryItem | null>
    delete: (request: CompanionMemoryDeleteRequest | string) => Promise<{ deleted: boolean }>
    setImportance: (
      request: CompanionMemoryImportanceRequest
    ) => Promise<CompanionMemoryItem | null>
    listProposals: (
      request?: CompanionMemoryProposalListRequest
    ) => Promise<{ items: CompanionMemoryMaintenanceProposal[]; total: number }>
    updateProposal: (
      request: UpdateCompanionMemoryProposalRequest
    ) => Promise<CompanionMemoryMaintenanceProposal | null>
    getSettings: () => Promise<DesktopMemorySettings>
    updateSettings: (
      request: CompanionMemorySettingsRequest | DesktopMemorySettings
    ) => Promise<DesktopMemorySettings>
  }
  companionRole: {
    importCard: (
      request: ImportCompanionRoleCardRequest
    ) => Promise<ImportCompanionRoleCardResponse>
    exportCard: (
      request: ExportCompanionRoleCardRequest
    ) => Promise<ExportCompanionRoleCardResponse>
  }
  observation: {
    permissionStatus: () => Promise<ObservationPermissionStatus>
    status: (request?: ObservationStatusRequest) => Promise<ObservationState>
    start: (request: StartObservationRequest) => Promise<ObservationState>
    stop: (request?: StopObservationRequest) => Promise<ObservationState>
    trigger: (request?: TriggerObservationRequest) => Promise<ObservationState>
    onChanged: (callback: (event: ObservationChangedEvent) => void) => Unsubscribe
    onNotification: (callback: (event: ObservationReactionEvent) => void) => Unsubscribe
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
    listRuns: (request?: ListRunsRequest) => Promise<ChatRun[]>
    subscribeRun: (request: SubscribeRunRequest) => Promise<SubscribeRunResponse>
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
    setEmbeddingModel: (
      request: SetEmbeddingProviderModelRequest
    ) => Promise<ProviderRegistryMutationResult>
    setObservationModels: (
      request: SetObservationProviderModelsRequest
    ) => Promise<ProviderRegistryMutationResult>
    test: (
      ...args: [request: TestProviderRequest] | [providerId: string, modelId?: string]
    ) => Promise<ProviderTestResult>
    listModels: (providerId: string) => Promise<ProviderModel[]>
    refreshModels: (request: RefreshProviderModelsRequest | string) => Promise<ProviderModel[]>
    setSessionModel: (request: SetSessionModelRequest) => Promise<ChatSession>
    openAICodexOAuthStatus: (
      request: OpenAICodexOAuthProviderRequest | string
    ) => Promise<OpenAICodexOAuthStatus>
    openAICodexOAuthLogin: (
      request: OpenAICodexOAuthProviderRequest | string
    ) => Promise<OpenAICodexOAuthStatus>
    openAICodexOAuthLogout: (
      request: OpenAICodexOAuthProviderRequest | string
    ) => Promise<OpenAICodexOAuthStatus>
    onChanged: (callback: (event: ProviderRegistryChangedEvent) => void) => Unsubscribe
  }
  skill: {
    list: () => Promise<SkillListResponse>
    refresh: () => Promise<SkillListResponse>
    read: (request: ReadSkillRequest) => Promise<SkillReadResult>
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
  workspace: {
    status: (request: AgentWorkspaceStatusRequest | string) => Promise<AgentWorkspaceStatus>
    listFiles: (request: ListWorkspaceFilesRequest) => Promise<ListWorkspaceFilesResponse>
    readFile: (request: ReadWorkspaceFileRequest) => Promise<ReadWorkspaceFileResponse>
    exportFile: (request: ExportWorkspaceFileRequest) => Promise<ExportWorkspaceFileResponse>
    revealFile: (request: RevealWorkspaceFileRequest) => Promise<RevealWorkspaceFileResponse>
    deleteFile: (request: DeleteWorkspaceFileRequest) => Promise<DeleteWorkspaceFileResponse>
    cleanup: (request: CleanupWorkspaceRequest | string) => Promise<CleanupWorkspaceResponse>
  }
  terminalProcess: {
    list: (request?: ListLocalProcessesRequest) => Promise<LocalProcessSummary[]>
    get: (request: GetLocalProcessRequest | string) => Promise<LocalProcessSummary | null>
    kill: (request: KillLocalProcessRequest | string) => Promise<KillLocalProcessResponse>
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
  omniinfer: {
    getStatus: () => Promise<OmniInferRuntimeSnapshot>
    start: () => Promise<OmniInferRuntimeSnapshot>
    stop: () => Promise<OmniInferRuntimeSnapshot>
    selectModel: (request: SelectModelRequest) => Promise<OmniInferRuntimeSnapshot>
    unloadModel: () => Promise<OmniInferRuntimeSnapshot>
    setThinking: (request: SetThinkingRequest) => Promise<OmniInferRuntimeSnapshot>
    getLogsPath: () => Promise<GetOmniInferLogsPathResponse>
    pickLocalGguf: () => Promise<PickLocalGgufResponse>
    pickInstallDir: () => Promise<PickOmniInferInstallDirResponse>
    rescanModels: () => Promise<RescanInstalledModelsResponse>
    listInstalledModels: () => Promise<InstalledModelRecord[]>
    onStatusChanged: (callback: (event: OmniInferRuntimeSnapshot) => void) => Unsubscribe
    onLog: (callback: (event: OmniInferLogEntry) => void) => Unsubscribe
  }
}
