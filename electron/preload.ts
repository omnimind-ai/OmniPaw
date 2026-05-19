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
  OpenOmniClawBridge,
  SetDefaultProviderModelRequest,
  SetFallbackProviderModelsRequest,
  Unsubscribe,
  UpsertProviderModelRequest,
  UpsertProviderSourceRequest,
} from '@shared/types/bridge'
import type {
  LoggerHealthStatus,
  LoggerWriteResponse,
  RendererLogRequest,
} from '@shared/types/logging'
import type {
  CreateProviderFromPresetRequest,
  DeleteProviderRequest,
  RefreshProviderModelsRequest,
  SaveProviderRequest,
  SetSessionModelRequest,
  TestProviderRequest,
} from '@shared/types/provider'
import type { DesktopSettingsConfig, SaveDesktopSettingsRequest } from '@shared/types/settings'
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

const bridge: OpenOmniClawBridge = {
  app: {
    getInfo: () => ipcRenderer.invoke(IPC_CHANNELS.app.getInfo),
  },
  logging: {
    write: writeRendererLog,
    status: getLoggingStatus,
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
  },
  catPanel: {
    onPlacement: (callback) => createUnsubscriber(IPC_CHANNELS.catPanel.placement, callback),
  },
  settings: {
    load: () => invokeSettings(IPC_CHANNELS.settings.load),
    save: (request) =>
      invokeSettings(IPC_CHANNELS.settings.save, stripProviderRegistryFromSettingsRequest(request)),
    reset: () => invokeSettings(IPC_CHANNELS.settings.reset),
    status: () => invokeSettings(IPC_CHANNELS.settings.status),
    onChanged: (callback) => createUnsubscriber(IPC_CHANNELS.settings.changed, callback),
  },
  chat: {
    listSessions: () => ipcRenderer.invoke(IPC_CHANNELS.chat.listSessions),
    createSession: () => ipcRenderer.invoke(IPC_CHANNELS.chat.createSession),
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
    list: () => ipcRenderer.invoke(IPC_CHANNELS.cron.list),
  },
  tools: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.tools.list),
    setEnabled: (request) => ipcRenderer.invoke(IPC_CHANNELS.tools.setEnabled, request),
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
}

contextBridge.exposeInMainWorld('openOmniClaw', bridge)
