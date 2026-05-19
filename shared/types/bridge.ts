import type { AppInfo } from './app'
import type { LoggerHealthStatus, LoggerWriteResponse, RendererLogRequest } from './logging'
import type {
  CatBounds,
  CatCommandEvent,
  CatPanelPlacement,
  CatPanelToggleResult,
  CatStatus,
  CatTaskState,
  CatWindowState,
  CatDragPayload,
} from './cat'
import type { CronTask } from './cron'
import type {
  DesktopSettingsChangedEvent,
  DesktopSettingsConfig,
  DesktopSettingsStatus,
  SaveDesktopSettingsRequest,
} from './settings'
import type {
  AbortRunRequest,
  AbortRunResponse,
  AttachmentPreviewRequest,
  AttachmentPreviewResponse,
  ChatMessagePart,
  ChatMessage,
  ChatSession,
  ChatStreamEvent,
  DeleteSessionRequest,
  EditMessageRequest,
  EditMessageResponse,
  ListMessagesRequest,
  RegenerateMessageRequest,
  SendMessageRequest,
  SendMessageResponse,
  UpdateSessionRequest,
  UploadAttachmentRequest,
  UploadAttachmentResponse,
} from './chat'
import type {
  DeleteProviderRequest,
  CreateProviderFromPresetRequest,
  ProviderConfig,
  ProviderModel,
  ProviderOperationResult,
  ProviderPreset,
  ProviderTestResult,
  RefreshProviderModelsRequest,
  SaveProviderRequest,
  SetSessionModelRequest,
  TestProviderRequest,
} from './provider'
import type {
  ImportSkillRequest,
  ImportSkillResponse,
  LocalSkillSummary,
  SetSkillEnabledRequest,
  SkillChangedEvent,
  SkillListResponse,
} from './skill'
import type { ManagedToolInfo, SetToolEnabledRequest, SetToolEnabledResponse } from './tool'
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

export type Unsubscribe = () => void

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
    listSessions: () => Promise<ChatSession[]>
    createSession: () => Promise<ChatSession>
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
    list: () => Promise<ProviderConfig[]>
    listPresets: () => Promise<ProviderPreset[]>
    createFromPreset: (request: CreateProviderFromPresetRequest | string) => Promise<ProviderConfig>
    upsert: (request: SaveProviderRequest) => Promise<ProviderConfig>
    delete: (request: DeleteProviderRequest | string) => Promise<ProviderOperationResult>
    test: (
      ...args: [request: TestProviderRequest] | [providerId: string, modelId?: string]
    ) => Promise<ProviderTestResult>
    listModels: (providerId: string) => Promise<ProviderModel[]>
    refreshModels: (request: RefreshProviderModelsRequest | string) => Promise<ProviderModel[]>
    setSessionModel: (request: SetSessionModelRequest) => Promise<ChatSession>
  }
  skill: {
    list: () => Promise<SkillListResponse>
    refresh: () => Promise<SkillListResponse>
    setEnabled: (request: SetSkillEnabledRequest) => Promise<LocalSkillSummary>
    importSkill: (request: ImportSkillRequest) => Promise<ImportSkillResponse>
    onChanged: (callback: (event: SkillChangedEvent) => void) => Unsubscribe
  }
  cron: {
    list: () => Promise<CronTask[]>
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
