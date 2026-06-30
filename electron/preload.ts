import { IPC_CHANNELS } from '@shared/constants'
import {
  normalizeLogLevel,
  sanitizeLogContext,
  sanitizeLogMessage,
  serializeLogError,
} from '@shared/logging/sanitize'
import type {
  DeleteProviderModelRequest,
  DeleteProviderSourceRequest,
  OmniPawBridge,
  SetDefaultProviderModelRequest,
  SetEmbeddingProviderModelRequest,
  SetFallbackProviderModelsRequest,
  SetObservationProviderModelsRequest,
  SetTitleProviderModelRequest,
  Unsubscribe,
  UpsertProviderModelRequest,
  UpsertProviderSourceRequest,
} from '@shared/types/bridge'
import type { CatPetPerformRequest } from '@shared/types/cat-pet'
import type {
  AgentWorkspaceStatus,
  CleanupWorkspaceResponse,
  DeleteWorkspaceFileResponse,
  ExportWorkspaceFileResponse,
  KillLocalProcessResponse,
  ListWorkspaceFilesResponse,
  LocalAgentOperationError,
  LocalProcessSummary,
  ReadWorkspaceFileResponse,
  RevealWorkspaceFileResponse,
} from '@shared/types/local-agent'
import type {
  ExportLogResponse,
  LoggerHealthStatus,
  LoggerWriteResponse,
  OpenLogLocationResponse,
  RendererLogRequest,
} from '@shared/types/logging'
import type {
  CompanionMemoryDeleteRequest,
  CompanionMemoryFilters,
  CompanionMemoryImportanceRequest,
  CompanionMemoryProposalListRequest,
  CompanionMemorySettingsRequest,
  CreateCompanionMemoryRequest,
  DesktopMemorySettings,
  UpdateCompanionMemoryProposalRequest,
  UpdateCompanionMemoryRequest,
} from '@shared/types/memory'
import type { SelectModelRequest, SetThinkingRequest } from '@shared/types/omniinfer'
import type {
  CreatePersonaRequest,
  DeletePersonaRequest,
  SetDefaultPersonaRequest,
  UpdatePersonaRequest,
} from '@shared/types/persona'
import type {
  CreateProviderFromPresetRequest,
  DeleteProviderRequest,
  OpenAICodexOAuthProviderRequest,
  RefreshProviderModelsRequest,
  SaveProviderRequest,
  SetSessionModelRequest,
  TestProviderRequest,
} from '@shared/types/provider'
import type { DesktopSettingsConfig, SaveDesktopSettingsRequest } from '@shared/types/settings'
import type { ShortcutStatusChangedEvent } from '@shared/types/shortcuts'
import type {
  CopyPersonaToTavernUserProfileRequest,
  CreateTavernCharacterRequest,
  CreateTavernLorebookRequest,
  CreateTavernPromptPresetRequest,
  CreateTavernSessionRequest,
  CreateTavernUserProfileRequest,
  DeleteTavernCharacterRequest,
  DeleteTavernLorebookRequest,
  DeleteTavernPromptPresetRequest,
  DeleteTavernUserProfileRequest,
  ExportTavernCharacterPersonaRequest,
  ImportTavernCharacterRequest,
  SetTavernCharacterEnabledRequest,
  SetTavernLorebookEnabledRequest,
  SetTavernPromptPresetEnabledRequest,
  SetTavernUserProfileEnabledRequest,
  TavernPromptPreviewRequest,
  UpdateTavernCharacterRequest,
  UpdateTavernLorebookRequest,
  UpdateTavernPromptPresetRequest,
  UpdateTavernSessionBindingRequest,
  UpdateTavernUserProfileRequest,
} from '@shared/types/tavern'
import { contextBridge, ipcRenderer } from 'electron'

const allowedTaskStates = new Set(['idle', 'preparing', 'running', 'completed'])

function fallbackLoggingStatus(): LoggerHealthStatus {
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
}

function createUnsubscriber<T>(channel: string, callback: (payload: T) => void): Unsubscribe {
  const listener = (_event: Electron.IpcRendererEvent, payload: T) => callback(payload)

  ipcRenderer.on(channel, listener)

  return () => {
    ipcRenderer.removeListener(channel, listener)
  }
}

function stripProviderRegistryFromSettingsRequest(
  request: SaveDesktopSettingsRequest | DesktopSettingsConfig
): SaveDesktopSettingsRequest | DesktopSettingsConfig {
  const config = 'config' in request ? request.config : request
  const { providers: _providers, ...rest } = config as DesktopSettingsConfig & {
    providers?: unknown
  }

  return 'config' in request
    ? ({ config: rest as DesktopSettingsConfig } as SaveDesktopSettingsRequest)
    : (rest as DesktopSettingsConfig)
}

async function invokeSettings<T>(channel: string, payload?: unknown): Promise<T> {
  const response =
    payload === undefined
      ? await ipcRenderer.invoke(channel)
      : await ipcRenderer.invoke(channel, payload)

  if (response?.ok === false) {
    const error = new Error(response.error?.message || 'Settings operation failed.') as Error & {
      details?: unknown
    }
    error.name = 'SettingsOperationError'
    error.details = response.error
    throw error
  }

  return response?.ok === true ? (response.value as T) : (response as T)
}

async function invokeMcp<T>(channel: string, payload?: unknown): Promise<T> {
  const response =
    payload === undefined
      ? await ipcRenderer.invoke(channel)
      : await ipcRenderer.invoke(channel, payload)

  if (response?.ok === false) {
    const error = new Error(response.error?.message || 'MCP operation failed.') as Error & {
      details?: unknown
    }
    error.name = 'McpOperationError'
    error.details = response.error
    throw error
  }

  return response?.ok === true ? (response.value as T) : (response as T)
}

async function invokeLocal<T>(channel: string, payload?: unknown): Promise<T> {
  const response =
    payload === undefined
      ? await ipcRenderer.invoke(channel)
      : await ipcRenderer.invoke(channel, payload)

  if (response?.ok === false) {
    const error = new Error(
      response.error?.message || 'Local capability operation failed.'
    ) as Error & {
      details?: LocalAgentOperationError
    }
    error.name = 'LocalCapabilityOperationError'
    error.details = response.error
    throw error
  }

  return response?.ok === true ? (response.value as T) : (response as T)
}

async function invokeSkill<T>(channel: string, payload?: unknown): Promise<T> {
  const response =
    payload === undefined
      ? await ipcRenderer.invoke(channel)
      : await ipcRenderer.invoke(channel, payload)

  if (response?.ok === false) {
    const error = new Error(response.error?.message || 'Skill operation failed.') as Error & {
      details?: unknown
    }
    error.name = 'SkillOperationError'
    error.details = response.error
    throw error
  }

  return response?.ok === true ? (response.value as T) : (response as T)
}

async function invokePersona<T>(channel: string, payload?: unknown): Promise<T> {
  const response =
    payload === undefined
      ? await ipcRenderer.invoke(channel)
      : await ipcRenderer.invoke(channel, payload)

  if (response?.ok === false) {
    const error = new Error(response.error?.message || 'Persona operation failed.') as Error & {
      details?: unknown
    }
    error.name = 'PersonaOperationError'
    error.details = response.error
    throw error
  }

  return response?.ok === true ? (response.value as T) : (response as T)
}

async function invokeTavern<T>(channel: string, payload?: unknown): Promise<T> {
  const response =
    payload === undefined
      ? await ipcRenderer.invoke(channel)
      : await ipcRenderer.invoke(channel, payload)

  if (response?.ok === false) {
    const error = new Error(response.error?.message || 'Tavern operation failed.') as Error & {
      details?: unknown
    }
    error.name = 'TavernOperationError'
    error.details = response.error
    throw error
  }

  return response?.ok === true ? (response.value as T) : (response as T)
}

function normalizeRendererLogPayload(request: RendererLogRequest): RendererLogRequest {
  const payload = request as Partial<RendererLogRequest>
  return {
    level: normalizeLogLevel(payload?.level, 'info'),
    scope:
      typeof payload?.scope === 'string' && payload.scope.trim()
        ? sanitizeLogMessage(payload.scope, { maxStringLength: 160, includeStack: false })
        : 'renderer',
    message: sanitizeLogMessage(payload?.message ?? 'Renderer diagnostic event.'),
    context: sanitizeLogContext(payload?.context),
    error: payload?.error === undefined ? undefined : serializeLogError(payload.error),
    timestamp: Number.isFinite(payload?.timestamp) ? payload.timestamp : Date.now(),
  }
}

async function writeRendererLog(request: RendererLogRequest): Promise<LoggerWriteResponse> {
  try {
    return await ipcRenderer.invoke(
      IPC_CHANNELS.logging.write,
      normalizeRendererLogPayload(request)
    )
  } catch {
    return {
      accepted: false,
      persisted: false,
      dropped: true,
      reason: 'ipc_failed',
    }
  }
}

async function getLoggingStatus(): Promise<LoggerHealthStatus> {
  try {
    return await ipcRenderer.invoke(IPC_CHANNELS.logging.status)
  } catch {
    return fallbackLoggingStatus()
  }
}

const bridge: OmniPawBridge = {
  app: {
    getInfo: () => ipcRenderer.invoke(IPC_CHANNELS.app.getInfo),
    openSettingsDirectory: () => ipcRenderer.invoke(IPC_CHANNELS.app.openSettingsDirectory),
    openChatSession: (request) => ipcRenderer.invoke(IPC_CHANNELS.app.openChatSession, request),
    onOpenChatSession: (callback) => createUnsubscriber(IPC_CHANNELS.app.navigateToChat, callback),
  },
  window: {
    getState: () => ipcRenderer.invoke(IPC_CHANNELS.window.getState),
    minimize: () => ipcRenderer.invoke(IPC_CHANNELS.window.minimize),
    toggleMaximize: () => ipcRenderer.invoke(IPC_CHANNELS.window.toggleMaximize),
    close: () => ipcRenderer.invoke(IPC_CHANNELS.window.close),
    onStateChanged: (callback) => createUnsubscriber(IPC_CHANNELS.window.stateChanged, callback),
  },
  logging: {
    write: writeRendererLog,
    status: getLoggingStatus,
    openLocation: () =>
      ipcRenderer.invoke(IPC_CHANNELS.logging.openLocation) as Promise<OpenLogLocationResponse>,
    export: () => ipcRenderer.invoke(IPC_CHANNELS.logging.export) as Promise<ExportLogResponse>,
  },
  cat: {
    show: () => ipcRenderer.invoke(IPC_CHANNELS.cat.show),
    hide: () => ipcRenderer.invoke(IPC_CHANNELS.cat.hide),
    toggleVisibility: () => ipcRenderer.invoke(IPC_CHANNELS.cat.toggleVisibility),
    setState: (state) => {
      if (!allowedTaskStates.has(state)) {
        return Promise.resolve({
          state: 'idle',
          visible: false,
          bounds: null,
        })
      }

      return ipcRenderer.invoke(IPC_CHANNELS.cat.setState, state)
    },
    reportState: (state) => ipcRenderer.send(IPC_CHANNELS.cat.reportState, state),
    onCommand: (callback) => createUnsubscriber(IPC_CHANNELS.cat.commandState, callback),
    togglePanel: () => ipcRenderer.invoke(IPC_CHANNELS.cat.togglePanel),
    dragStart: () => ipcRenderer.invoke(IPC_CHANNELS.cat.dragStart),
    dragMove: (payload) => ipcRenderer.invoke(IPC_CHANNELS.cat.dragMove, payload),
    dragEnd: () => ipcRenderer.invoke(IPC_CHANNELS.cat.dragEnd),
    onObservationReaction: (callback) =>
      createUnsubscriber(IPC_CHANNELS.cat.observationReaction, callback),
    openObservationSource: (event) =>
      ipcRenderer.invoke(IPC_CHANNELS.cat.openObservationSource, event),
    showBubble: (request) => ipcRenderer.invoke(IPC_CHANNELS.cat.showBubble, request),
    dismissBubble: (request) => ipcRenderer.invoke(IPC_CHANNELS.cat.dismissBubble, request),
    reportBubbleReady: () => ipcRenderer.send(IPC_CHANNELS.cat.bubbleReady),
    onBubbleEvent: (callback) => createUnsubscriber(IPC_CHANNELS.cat.bubbleEvent, callback),
    onBubblePlacement: (callback) => createUnsubscriber(IPC_CHANNELS.cat.bubblePlacement, callback),
  },
  catAppearance: {
    current: () => ipcRenderer.invoke(IPC_CHANNELS.catAppearance.current),
    getPack: (request) => ipcRenderer.invoke(IPC_CHANNELS.catAppearance.getPack, request),
    list: () => ipcRenderer.invoke(IPC_CHANNELS.catAppearance.list),
    refresh: () => ipcRenderer.invoke(IPC_CHANNELS.catAppearance.refresh),
    importPack: () => ipcRenderer.invoke(IPC_CHANNELS.catAppearance.importPack),
    deletePack: (request) => ipcRenderer.invoke(IPC_CHANNELS.catAppearance.deletePack, request),
    setActive: (request) => ipcRenderer.invoke(IPC_CHANNELS.catAppearance.setActive, request),
    onChanged: (callback) => createUnsubscriber(IPC_CHANNELS.catAppearance.changed, callback),
  },
  catPanel: {
    onPlacement: (callback) => createUnsubscriber(IPC_CHANNELS.catPanel.placement, callback),
    open: (request) => ipcRenderer.invoke(IPC_CHANNELS.catPanel.open, request),
    getActiveSession: () => ipcRenderer.invoke(IPC_CHANNELS.catPanel.getActiveSession),
    setActiveSession: (request) =>
      ipcRenderer.invoke(IPC_CHANNELS.catPanel.setActiveSession, request),
    onActiveSessionChanged: (callback) =>
      createUnsubscriber(IPC_CHANNELS.catPanel.activeSessionChanged, callback),
    getDraft: (request) => ipcRenderer.invoke(IPC_CHANNELS.catPanel.getDraft, request),
    stageDraftAttachments: (request) =>
      ipcRenderer.invoke(IPC_CHANNELS.catPanel.stageDraftAttachments, request),
    clearDraft: (request) => ipcRenderer.invoke(IPC_CHANNELS.catPanel.clearDraft, request),
    onDraftChanged: (callback) => createUnsubscriber(IPC_CHANNELS.catPanel.draftChanged, callback),
  },
  catNotification: {
    onEvent: (callback) => createUnsubscriber(IPC_CHANNELS.catNotification.event, callback),
    close: (request) => ipcRenderer.invoke(IPC_CHANNELS.catNotification.close, request),
    viewResult: (request) => ipcRenderer.invoke(IPC_CHANNELS.catNotification.viewResult, request),
  },
  catPet: {
    getState: () => ipcRenderer.invoke(IPC_CHANNELS.catPet.getState),
    perform: (request: CatPetPerformRequest) =>
      ipcRenderer.invoke(IPC_CHANNELS.catPet.performAction, request),
    onChanged: (callback) => createUnsubscriber(IPC_CHANNELS.catPet.changed, callback),
  },
  settings: {
    load: () => invokeSettings(IPC_CHANNELS.settings.load),
    save: (request) =>
      invokeSettings(IPC_CHANNELS.settings.save, stripProviderRegistryFromSettingsRequest(request)),
    reset: () => invokeSettings(IPC_CHANNELS.settings.reset),
    status: () => invokeSettings(IPC_CHANNELS.settings.status),
    onChanged: (callback) => createUnsubscriber(IPC_CHANNELS.settings.changed, callback),
  },
  shortcuts: {
    status: () =>
      ipcRenderer.invoke(IPC_CHANNELS.shortcuts.status) as Promise<ShortcutStatusChangedEvent>,
    setCaptureMode: (enabled) =>
      ipcRenderer.invoke(
        IPC_CHANNELS.shortcuts.setCaptureMode,
        enabled
      ) as Promise<ShortcutStatusChangedEvent>,
    onChanged: (callback) => createUnsubscriber(IPC_CHANNELS.shortcuts.changed, callback),
  },
  memory: {
    list: (filters?: CompanionMemoryFilters) =>
      ipcRenderer.invoke(IPC_CHANNELS.memory.list, filters),
    search: (filters?: CompanionMemoryFilters) =>
      ipcRenderer.invoke(IPC_CHANNELS.memory.search, filters),
    inspect: (memoryId: string) => ipcRenderer.invoke(IPC_CHANNELS.memory.inspect, memoryId),
    create: (request: CreateCompanionMemoryRequest) =>
      ipcRenderer.invoke(IPC_CHANNELS.memory.create, request),
    update: (request: UpdateCompanionMemoryRequest) =>
      ipcRenderer.invoke(IPC_CHANNELS.memory.update, request),
    archive: (memoryId: string) => ipcRenderer.invoke(IPC_CHANNELS.memory.archive, memoryId),
    delete: (request: CompanionMemoryDeleteRequest | string) =>
      ipcRenderer.invoke(IPC_CHANNELS.memory.delete, request),
    setImportance: (request: CompanionMemoryImportanceRequest) =>
      ipcRenderer.invoke(IPC_CHANNELS.memory.setImportance, request),
    listProposals: (request?: CompanionMemoryProposalListRequest) =>
      ipcRenderer.invoke(IPC_CHANNELS.memory.listProposals, request),
    updateProposal: (request: UpdateCompanionMemoryProposalRequest) =>
      ipcRenderer.invoke(IPC_CHANNELS.memory.updateProposal, request),
    getSettings: () => ipcRenderer.invoke(IPC_CHANNELS.memory.getSettings),
    updateSettings: (request: CompanionMemorySettingsRequest | DesktopMemorySettings) =>
      ipcRenderer.invoke(IPC_CHANNELS.memory.updateSettings, request),
  },
  observation: {
    permissionStatus: () => ipcRenderer.invoke(IPC_CHANNELS.observation.permissionStatus),
    status: (request) => ipcRenderer.invoke(IPC_CHANNELS.observation.status, request),
    start: (request) => ipcRenderer.invoke(IPC_CHANNELS.observation.start, request),
    stop: (request) => ipcRenderer.invoke(IPC_CHANNELS.observation.stop, request),
    trigger: (request) => ipcRenderer.invoke(IPC_CHANNELS.observation.trigger, request),
    onChanged: (callback) => createUnsubscriber(IPC_CHANNELS.observation.changed, callback),
    onNotification: (callback) =>
      createUnsubscriber(IPC_CHANNELS.observation.notification, callback),
  },
  chat: {
    listSessions: (request) => ipcRenderer.invoke(IPC_CHANNELS.chat.listSessions, request),
    createSession: (request) => ipcRenderer.invoke(IPC_CHANNELS.chat.createSession, request),
    getSession: (sessionId) => ipcRenderer.invoke(IPC_CHANNELS.chat.getSession, sessionId),
    updateSession: (...args) => {
      const request =
        args.length === 2 && typeof args[0] === 'string'
          ? { sessionId: args[0], ...(args[1] as object) }
          : args[0]
      return ipcRenderer.invoke(IPC_CHANNELS.chat.updateSession, request)
    },
    deleteSession: (request) => ipcRenderer.invoke(IPC_CHANNELS.chat.deleteSession, request),
    listMessages: (request) => ipcRenderer.invoke(IPC_CHANNELS.chat.listMessages, request),
    sendMessage: (request) => ipcRenderer.invoke(IPC_CHANNELS.chat.sendMessage, request),
    abortRun: (...args) => {
      const request =
        args.length >= 2 && typeof args[0] === 'string'
          ? { runId: args[0], reason: args[1] as string | undefined }
          : args[0]
      return ipcRenderer.invoke(IPC_CHANNELS.chat.abortRun, request)
    },
    approveToolCall: (request) => ipcRenderer.invoke(IPC_CHANNELS.chat.approveToolCall, request),
    editMessage: (...args) => {
      const request =
        args.length >= 3 && typeof args[0] === 'string'
          ? { sessionId: args[0], messageId: args[1] as string, parts: args[2] }
          : args[0]
      return ipcRenderer.invoke(IPC_CHANNELS.chat.editMessage, request)
    },
    regenerateMessage: (...args) => {
      const request =
        args.length >= 2 && typeof args[0] === 'string'
          ? {
              sessionId: args[0],
              messageId: args[1] as string,
              providerId: args[2] as string | undefined,
              modelId: args[3] as string | undefined,
            }
          : args[0]
      return ipcRenderer.invoke(IPC_CHANNELS.chat.regenerateMessage, request)
    },
    uploadAttachment: (request) => ipcRenderer.invoke(IPC_CHANNELS.chat.uploadAttachment, request),
    getAttachmentPreview: (request) =>
      ipcRenderer.invoke(IPC_CHANNELS.chat.getAttachmentPreview, request),
    onSessionChanged: (callback) => createUnsubscriber(IPC_CHANNELS.chat.sessionChanged, callback),
    onStreamEvent: (callback) => createUnsubscriber(IPC_CHANNELS.chat.streamEvent, callback),
    onToken: (callback) => createUnsubscriber<string>(IPC_CHANNELS.chat.streamToken, callback),
    onDone: (callback) => {
      const listener = () => callback()
      ipcRenderer.on(IPC_CHANNELS.chat.streamDone, listener)

      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.chat.streamDone, listener)
      }
    },
  },
  attachment: {
    upload: (request) =>
      ipcRenderer
        .invoke(IPC_CHANNELS.chat.uploadAttachment, request)
        .then((response) => response?.attachment ?? response),
    getPreviewUrl: (request) =>
      ipcRenderer
        .invoke(IPC_CHANNELS.chat.getAttachmentPreview, request)
        .then((response) => response),
  },
  provider: {
    load: () => ipcRenderer.invoke(IPC_CHANNELS.provider.load),
    status: () => ipcRenderer.invoke(IPC_CHANNELS.provider.status),
    list: () => ipcRenderer.invoke(IPC_CHANNELS.provider.list),
    listPresets: () => ipcRenderer.invoke(IPC_CHANNELS.provider.listPresets),
    createFromPreset: (request: CreateProviderFromPresetRequest | string) =>
      ipcRenderer.invoke(IPC_CHANNELS.provider.createFromPreset, request),
    upsertSource: (request: UpsertProviderSourceRequest) =>
      ipcRenderer.invoke(IPC_CHANNELS.provider.upsertSource, request),
    upsertModel: (request: UpsertProviderModelRequest) =>
      ipcRenderer.invoke(IPC_CHANNELS.provider.upsertModel, request),
    upsert: (request: SaveProviderRequest) =>
      ipcRenderer.invoke(IPC_CHANNELS.provider.upsert, request),
    deleteSource: (request: DeleteProviderSourceRequest | string) =>
      ipcRenderer.invoke(IPC_CHANNELS.provider.deleteSource, request),
    deleteModel: (request: DeleteProviderModelRequest) =>
      ipcRenderer.invoke(IPC_CHANNELS.provider.deleteModel, request),
    delete: (request: DeleteProviderRequest | string) =>
      ipcRenderer.invoke(IPC_CHANNELS.provider.delete, request),
    setDefaultModel: (request: SetDefaultProviderModelRequest) =>
      ipcRenderer.invoke(IPC_CHANNELS.provider.setDefaultModel, request),
    setFallbackModels: (request: SetFallbackProviderModelsRequest) =>
      ipcRenderer.invoke(IPC_CHANNELS.provider.setFallbackModels, request),
    setTitleModel: (request: SetTitleProviderModelRequest) =>
      ipcRenderer.invoke(IPC_CHANNELS.provider.setTitleModel, request),
    setEmbeddingModel: (request: SetEmbeddingProviderModelRequest) =>
      ipcRenderer.invoke(IPC_CHANNELS.provider.setEmbeddingModel, request),
    setObservationModels: (request: SetObservationProviderModelsRequest) =>
      ipcRenderer.invoke(IPC_CHANNELS.provider.setObservationModels, request),
    test: (...args: [request: TestProviderRequest] | [providerId: string, modelId?: string]) => {
      const request =
        typeof args[0] === 'string'
          ? { providerId: args[0], modelId: args[1] as string | undefined }
          : args[0]
      return ipcRenderer.invoke(IPC_CHANNELS.provider.test, request)
    },
    listModels: (providerId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.provider.listModels, providerId),
    refreshModels: (request: RefreshProviderModelsRequest | string) =>
      ipcRenderer.invoke(IPC_CHANNELS.provider.refreshModels, request),
    setSessionModel: (request: SetSessionModelRequest) =>
      ipcRenderer.invoke(IPC_CHANNELS.provider.setSessionModel, request),
    openAICodexOAuthStatus: (request: OpenAICodexOAuthProviderRequest | string) =>
      ipcRenderer.invoke(IPC_CHANNELS.provider.openAICodexOAuthStatus, request),
    openAICodexOAuthLogin: (request: OpenAICodexOAuthProviderRequest | string) =>
      ipcRenderer.invoke(IPC_CHANNELS.provider.openAICodexOAuthLogin, request),
    openAICodexOAuthLogout: (request: OpenAICodexOAuthProviderRequest | string) =>
      ipcRenderer.invoke(IPC_CHANNELS.provider.openAICodexOAuthLogout, request),
    onChanged: (callback) => createUnsubscriber(IPC_CHANNELS.provider.changed, callback),
  },
  skill: {
    list: () => invokeSkill(IPC_CHANNELS.skill.list),
    refresh: () => invokeSkill(IPC_CHANNELS.skill.refresh),
    setEnabled: (request) => invokeSkill(IPC_CHANNELS.skill.setEnabled, request),
    importSkill: (request) => invokeSkill(IPC_CHANNELS.skill.importSkill, request),
    onChanged: (callback) => createUnsubscriber(IPC_CHANNELS.skill.changed, callback),
  },
  cron: {
    list: (request) => ipcRenderer.invoke(IPC_CHANNELS.cron.list, request),
    create: (request) => ipcRenderer.invoke(IPC_CHANNELS.cron.create, request),
    update: (request) => ipcRenderer.invoke(IPC_CHANNELS.cron.update, request),
    delete: (request) => ipcRenderer.invoke(IPC_CHANNELS.cron.delete, request),
    runNow: (request) => ipcRenderer.invoke(IPC_CHANNELS.cron.runNow, request),
    listRuns: (request) => ipcRenderer.invoke(IPC_CHANNELS.cron.listRuns, request),
    onChanged: (callback) => createUnsubscriber(IPC_CHANNELS.cron.changed, callback),
  },
  tools: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.tools.list),
    setEnabled: (request) => ipcRenderer.invoke(IPC_CHANNELS.tools.setEnabled, request),
  },
  workspace: {
    status: (request) => invokeLocal<AgentWorkspaceStatus>(IPC_CHANNELS.workspace.status, request),
    listFiles: (request) =>
      invokeLocal<ListWorkspaceFilesResponse>(IPC_CHANNELS.workspace.listFiles, request),
    readFile: (request) =>
      invokeLocal<ReadWorkspaceFileResponse>(IPC_CHANNELS.workspace.readFile, request),
    exportFile: (request) =>
      invokeLocal<ExportWorkspaceFileResponse>(IPC_CHANNELS.workspace.exportFile, request),
    revealFile: (request) =>
      invokeLocal<RevealWorkspaceFileResponse>(IPC_CHANNELS.workspace.revealFile, request),
    deleteFile: (request) =>
      invokeLocal<DeleteWorkspaceFileResponse>(IPC_CHANNELS.workspace.deleteFile, request),
    cleanup: (request) =>
      invokeLocal<CleanupWorkspaceResponse>(IPC_CHANNELS.workspace.cleanup, request),
  },
  terminalProcess: {
    list: (request) =>
      invokeLocal<LocalProcessSummary[]>(IPC_CHANNELS.terminalProcess.list, request),
    get: (request) =>
      invokeLocal<LocalProcessSummary | null>(IPC_CHANNELS.terminalProcess.get, request),
    kill: (request) =>
      invokeLocal<KillLocalProcessResponse>(IPC_CHANNELS.terminalProcess.kill, request),
  },
  mcp: {
    listServers: () => invokeMcp(IPC_CHANNELS.mcp.listServers),
    saveServer: (request) => invokeMcp(IPC_CHANNELS.mcp.saveServer, request),
    deleteServer: (request) => invokeMcp(IPC_CHANNELS.mcp.deleteServer, request),
    setServerEnabled: (request) => invokeMcp(IPC_CHANNELS.mcp.setServerEnabled, request),
    refreshServer: (request) => invokeMcp(IPC_CHANNELS.mcp.refreshServer, request),
    listTools: () => invokeMcp(IPC_CHANNELS.mcp.listTools),
    onChanged: (callback) => createUnsubscriber(IPC_CHANNELS.mcp.changed, callback),
  },
  persona: {
    load: () => invokePersona(IPC_CHANNELS.persona.load),
    list: () => invokePersona(IPC_CHANNELS.persona.list),
    status: () => invokePersona(IPC_CHANNELS.persona.status),
    create: (request: CreatePersonaRequest) => invokePersona(IPC_CHANNELS.persona.create, request),
    update: (request: UpdatePersonaRequest) => invokePersona(IPC_CHANNELS.persona.update, request),
    delete: (request: DeletePersonaRequest | string) =>
      invokePersona(IPC_CHANNELS.persona.delete, request),
    setDefault: (request: SetDefaultPersonaRequest) =>
      invokePersona(IPC_CHANNELS.persona.setDefault, request),
    onChanged: (callback) => createUnsubscriber(IPC_CHANNELS.persona.changed, callback),
  },
  omniinfer: {
    getStatus: () => ipcRenderer.invoke(IPC_CHANNELS.omniinfer.getStatus),
    start: () => ipcRenderer.invoke(IPC_CHANNELS.omniinfer.start),
    stop: () => ipcRenderer.invoke(IPC_CHANNELS.omniinfer.stop),
    selectModel: (request: SelectModelRequest) =>
      ipcRenderer.invoke(IPC_CHANNELS.omniinfer.selectModel, request),
    unloadModel: () => ipcRenderer.invoke(IPC_CHANNELS.omniinfer.unloadModel),
    setThinking: (request: SetThinkingRequest) =>
      ipcRenderer.invoke(IPC_CHANNELS.omniinfer.setThinking, request),
    getLogsPath: () => ipcRenderer.invoke(IPC_CHANNELS.omniinfer.getLogsPath),
    pickLocalGguf: () => ipcRenderer.invoke(IPC_CHANNELS.omniinfer.pickLocalGguf),
    pickInstallDir: () => ipcRenderer.invoke(IPC_CHANNELS.omniinfer.pickInstallDir),
    rescanModels: () => ipcRenderer.invoke(IPC_CHANNELS.omniinfer.rescanModels),
    listInstalledModels: async () => {
      const result = await ipcRenderer.invoke(IPC_CHANNELS.omniinfer.rescanModels)
      return result?.models ?? []
    },
    onStatusChanged: (callback) =>
      createUnsubscriber(IPC_CHANNELS.omniinfer.statusChanged, callback),
    onLog: (callback) => createUnsubscriber(IPC_CHANNELS.omniinfer.log, callback),
  },
  tavern: {
    load: () => invokeTavern(IPC_CHANNELS.tavern.load),
    list: () => invokeTavern(IPC_CHANNELS.tavern.list),
    status: () => invokeTavern(IPC_CHANNELS.tavern.status),
    importCharacter: (request: ImportTavernCharacterRequest) =>
      invokeTavern(IPC_CHANNELS.tavern.importCharacter, request),
    createCharacter: (request: CreateTavernCharacterRequest) =>
      invokeTavern(IPC_CHANNELS.tavern.createCharacter, request),
    updateCharacter: (request: UpdateTavernCharacterRequest) =>
      invokeTavern(IPC_CHANNELS.tavern.updateCharacter, request),
    deleteCharacter: (request: DeleteTavernCharacterRequest | string) =>
      invokeTavern(IPC_CHANNELS.tavern.deleteCharacter, request),
    setCharacterEnabled: (request: SetTavernCharacterEnabledRequest) =>
      invokeTavern(IPC_CHANNELS.tavern.setCharacterEnabled, request),
    createLorebook: (request: CreateTavernLorebookRequest) =>
      invokeTavern(IPC_CHANNELS.tavern.createLorebook, request),
    updateLorebook: (request: UpdateTavernLorebookRequest) =>
      invokeTavern(IPC_CHANNELS.tavern.updateLorebook, request),
    deleteLorebook: (request: DeleteTavernLorebookRequest | string) =>
      invokeTavern(IPC_CHANNELS.tavern.deleteLorebook, request),
    setLorebookEnabled: (request: SetTavernLorebookEnabledRequest) =>
      invokeTavern(IPC_CHANNELS.tavern.setLorebookEnabled, request),
    createPromptPreset: (request: CreateTavernPromptPresetRequest) =>
      invokeTavern(IPC_CHANNELS.tavern.createPromptPreset, request),
    updatePromptPreset: (request: UpdateTavernPromptPresetRequest) =>
      invokeTavern(IPC_CHANNELS.tavern.updatePromptPreset, request),
    deletePromptPreset: (request: DeleteTavernPromptPresetRequest | string) =>
      invokeTavern(IPC_CHANNELS.tavern.deletePromptPreset, request),
    setPromptPresetEnabled: (request: SetTavernPromptPresetEnabledRequest) =>
      invokeTavern(IPC_CHANNELS.tavern.setPromptPresetEnabled, request),
    createUserProfile: (request: CreateTavernUserProfileRequest) =>
      invokeTavern(IPC_CHANNELS.tavern.createUserProfile, request),
    updateUserProfile: (request: UpdateTavernUserProfileRequest) =>
      invokeTavern(IPC_CHANNELS.tavern.updateUserProfile, request),
    deleteUserProfile: (request: DeleteTavernUserProfileRequest | string) =>
      invokeTavern(IPC_CHANNELS.tavern.deleteUserProfile, request),
    setUserProfileEnabled: (request: SetTavernUserProfileEnabledRequest) =>
      invokeTavern(IPC_CHANNELS.tavern.setUserProfileEnabled, request),
    copyPersonaToUserProfile: (request: CopyPersonaToTavernUserProfileRequest) =>
      invokeTavern(IPC_CHANNELS.tavern.copyPersonaToUserProfile, request),
    exportCharacterAsPersona: (request: ExportTavernCharacterPersonaRequest) =>
      invokeTavern(IPC_CHANNELS.tavern.exportCharacterAsPersona, request),
    createSession: (request: CreateTavernSessionRequest) =>
      invokeTavern(IPC_CHANNELS.tavern.createSession, request),
    updateSessionBinding: (request: UpdateTavernSessionBindingRequest) =>
      invokeTavern(IPC_CHANNELS.tavern.updateSessionBinding, request),
    previewPrompt: (request: TavernPromptPreviewRequest) =>
      invokeTavern(IPC_CHANNELS.tavern.previewPrompt, request),
    onChanged: (callback) => createUnsubscriber(IPC_CHANNELS.tavern.changed, callback),
  },
}

contextBridge.exposeInMainWorld('omniPaw', bridge)
