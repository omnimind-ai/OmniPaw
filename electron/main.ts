import { join } from 'node:path'

import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { AttachmentService } from '@core/chat/attachment-service'
import { ChatService } from '@core/chat/chat-service'
import { ContextBuilder } from '@core/chat/context-manager'
import { RunManager } from '@core/chat/run-manager'
import { ConfigStore } from '@core/config/store'
import { ConfigToolSettingsStore } from '@core/config/tool-settings-store'
import { configError, ConfigValidationError } from '@core/config/schema'
import { CronManager } from '@core/cron/cron-manager'
import { DatabaseClient } from '@core/db/client'
import { AttachmentRepo, ChatMessageRepo, ChatRunRepo, ChatSessionRepo } from '@core/db/repos'
import { seedDefaultChatData } from '@core/db/seed'
import { ToolManagementService } from '@core/agent/tool-management-service'
import { ProviderManager } from '@core/provider/manager'
import { SkillManager } from '@core/skill/skill-manager'
import { APP_NAME, IPC_CHANNELS } from '@shared/constants'
import type {
  DesktopSettingsConfig,
  DesktopSettingsChangedEvent,
  SettingsChangeReason,
  SaveDesktopSettingsRequest,
  SettingsOperationError,
} from '@shared/types/settings'
import type {
  DeleteProviderRequest,
  CreateProviderFromPresetRequest,
  RefreshProviderModelsRequest,
  SaveProviderRequest,
  SetSessionModelRequest,
  TestProviderRequest,
} from '@shared/types/provider'
import type { SetToolEnabledRequest } from '@shared/types/tool'

const isMac = process.platform === 'darwin'

const skillManager = new SkillManager()
const cronManager = new CronManager()

let mainWindow: BrowserWindow | null = null
let chatService: ChatService
let providerManager: ProviderManager
let sessionRepo: ChatSessionRepo
let toolManagementService: ToolManagementService
let configStore: ConfigStore

function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1240,
    height: 780,
    minWidth: 980,
    minHeight: 640,
    title: APP_NAME,
    backgroundColor: '#f7f4ed',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function registerIpcHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.app.getInfo, () => ({
    name: APP_NAME,
    version: app.getVersion(),
    platform: process.platform,
  }))

  ipcMain.handle(IPC_CHANNELS.settings.load, () => settingsResult(() => configStore.get()))
  ipcMain.handle(IPC_CHANNELS.settings.save, (_event, request: SaveDesktopSettingsRequest | DesktopSettingsConfig) =>
    settingsResult(() => {
      const config = isSaveSettingsRequest(request) ? request.config : request
      const saved = configStore.save(config)
      broadcastSettingsChanged('save', saved)
      return saved
    }),
  )
  ipcMain.handle(IPC_CHANNELS.settings.reset, () =>
    settingsResult(() => {
      const saved = configStore.reset()
      broadcastSettingsChanged('reset', saved)
      return saved
    }),
  )
  ipcMain.handle(IPC_CHANNELS.settings.status, () => settingsResult(() => configStore.status()))

  ipcMain.handle(IPC_CHANNELS.chat.listSessions, () => chatService.listSessions())
  ipcMain.handle(IPC_CHANNELS.chat.createSession, () => chatService.createSession())
  ipcMain.handle(IPC_CHANNELS.chat.getSession, (_event, sessionId: string) =>
    chatService.getSession(sessionId),
  )
  ipcMain.handle(IPC_CHANNELS.chat.updateSession, (_event, request) =>
    chatService.updateSession(normalizeUpdateSessionRequest(request)),
  )
  ipcMain.handle(IPC_CHANNELS.chat.deleteSession, (_event, request) =>
    chatService.deleteSession(request),
  )
  ipcMain.handle(IPC_CHANNELS.chat.listMessages, (_event, request) =>
    chatService.listMessages(request),
  )
  ipcMain.handle(IPC_CHANNELS.chat.sendMessage, (event, request) =>
    chatService.sendMessage(request, event.sender),
  )
  ipcMain.handle(IPC_CHANNELS.chat.abortRun, (_event, request) => chatService.abortRun(request))
  ipcMain.handle(IPC_CHANNELS.chat.editMessage, (_event, request) =>
    chatService.editMessage(normalizeEditMessageRequest(request)),
  )
  ipcMain.handle(IPC_CHANNELS.chat.regenerateMessage, (event, request) =>
    chatService.regenerateMessage(normalizeRegenerateRequest(request), event.sender),
  )
  ipcMain.handle(IPC_CHANNELS.chat.uploadAttachment, (_event, request) =>
    attachmentService.upload(normalizeUploadRequest(request)),
  )
  ipcMain.handle(IPC_CHANNELS.chat.getAttachmentPreview, (_event, request) => {
    const attachmentId = typeof request === 'string' ? request : request.attachmentId
    return attachmentService.getPreview(attachmentId)
  })

  ipcMain.handle(IPC_CHANNELS.provider.list, () => providerManager.list())
  ipcMain.handle(IPC_CHANNELS.provider.listPresets, () => providerManager.listPresets())
  ipcMain.handle(IPC_CHANNELS.provider.createFromPreset, (_event, request: CreateProviderFromPresetRequest | string) =>
    providerManager.createFromPreset(typeof request === 'string' ? request : request.presetId),
  )
  ipcMain.handle(IPC_CHANNELS.provider.upsert, (_event, request: SaveProviderRequest) =>
    providerManager.upsert(request),
  )
  ipcMain.handle(IPC_CHANNELS.provider.delete, async (_event, request: DeleteProviderRequest | string) => {
    await providerManager.delete(typeof request === 'string' ? request : request.providerId)
    return { ok: true }
  })
  ipcMain.handle(IPC_CHANNELS.provider.test, (_event, request: TestProviderRequest | string, modelId?: string) =>
    providerManager.test(typeof request === 'string' ? request : request.providerId ?? request.provider?.id ?? '', typeof request === 'string' ? modelId : request.modelId),
  )
  ipcMain.handle(IPC_CHANNELS.provider.listModels, (_event, providerId: string) =>
    providerManager.listModels(providerId),
  )
  ipcMain.handle(IPC_CHANNELS.provider.refreshModels, async (_event, request: RefreshProviderModelsRequest | string) =>
    providerManager.refreshModels(typeof request === 'string' ? request : request.providerId),
  )
  ipcMain.handle(IPC_CHANNELS.provider.setSessionModel, (_event, request: SetSessionModelRequest) =>
    chatService.updateSession({
      sessionId: request.sessionId,
      defaultProviderId: request.providerId,
      defaultModelId: request.modelId,
    }),
  )
  ipcMain.handle(IPC_CHANNELS.skill.list, () => skillManager.list())
  ipcMain.handle(IPC_CHANNELS.cron.list, () => cronManager.list())
  ipcMain.handle(IPC_CHANNELS.tools.list, () => toolManagementService.list())
  ipcMain.handle(IPC_CHANNELS.tools.setEnabled, (_event, request: SetToolEnabledRequest) =>
    toolManagementService.setEnabled(request.name, request.enabled),
  )
}

app.whenReady().then(() => {
  initializeCore()
  registerIpcHandlers()
  createMainWindow()

  app.on('activate', () => {
    if (!mainWindow) {
      createMainWindow()
    }
  })
})

let attachmentService: AttachmentService

function initializeCore(): void {
  const db = new DatabaseClient().connect()
  seedDefaultChatData(db)

  sessionRepo = new ChatSessionRepo(db)
  const messageRepo = new ChatMessageRepo(db)
  const attachmentRepo = new AttachmentRepo(db)
  const runRepo = new ChatRunRepo(db)
  configStore = new ConfigStore({ appDataPath: app.getPath('appData'), appName: APP_NAME })
  loadStartupConfig()
  toolManagementService = new ToolManagementService(new ConfigToolSettingsStore(configStore, (saved) => {
    broadcastSettingsChanged('save', saved)
  }))

  providerManager = new ProviderManager({
    configStore,
    onConfigSaved: (saved) => broadcastSettingsChanged('save', saved),
    sessions: {
      async getProviderOverride(sessionId: string) {
        const session = sessionRepo.get(sessionId)
        return session
          ? {
              providerId: session.defaultProviderId,
              modelId: session.defaultModelId,
            }
          : undefined
      },
    },
  })
  attachmentService = new AttachmentService({ repo: attachmentRepo })
  const contextBuilder = new ContextBuilder(attachmentService)
  const runManager = new RunManager(runRepo)
  chatService = new ChatService({
    sessions: sessionRepo,
    messages: messageRepo,
    runs: runRepo,
    attachments: attachmentService,
    attachmentRepo,
    providers: providerManager,
    contextBuilder,
    runManager,
    disabledToolNames: () => toolManagementService.getDisabledToolNames(),
  })
}

function broadcastSettingsChanged(reason: SettingsChangeReason, config: DesktopSettingsConfig): void {
  const event: DesktopSettingsChangedEvent = {
    reason,
    config,
    status: configStore.status(),
  }

  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(IPC_CHANNELS.settings.changed, event)
  }
}

type SettingsIpcResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: SettingsOperationError }

function settingsResult<T>(operation: () => T): SettingsIpcResult<T> {
  try {
    return {
      ok: true,
      value: operation(),
    }
  } catch (error) {
    if (error instanceof ConfigValidationError) {
      return {
        ok: false,
        error: error.details,
      }
    }
    return {
      ok: false,
      error: configError('config_io_error', error instanceof Error ? error.message : 'Settings operation failed.', {
        path: configStore.status().path,
        recoverable: configStore.status().recoverable,
      }),
    }
  }
}

function isSaveSettingsRequest(value: SaveDesktopSettingsRequest | DesktopSettingsConfig): value is SaveDesktopSettingsRequest {
  return Boolean(value && typeof value === 'object' && 'config' in value)
}

function loadStartupConfig(): DesktopSettingsConfig | undefined {
  try {
    return configStore.load()
  } catch (error) {
    if (error instanceof ConfigValidationError) {
      return undefined
    }
    throw error
  }
}

function normalizeUpdateSessionRequest(request: unknown) {
  if (typeof request === 'string') {
    return { sessionId: request }
  }
  return request as Parameters<ChatService['updateSession']>[0]
}

function normalizeEditMessageRequest(request: unknown) {
  if (Array.isArray(request)) {
    return {
      sessionId: String(request[0]),
      messageId: String(request[1]),
      parts: request[2] ?? [],
    }
  }
  return request as Parameters<ChatService['editMessage']>[0]
}

function normalizeRegenerateRequest(request: unknown) {
  if (Array.isArray(request)) {
    return {
      sessionId: String(request[0]),
      messageId: String(request[1]),
      providerId: typeof request[2] === 'string' ? request[2] : undefined,
      modelId: typeof request[3] === 'string' ? request[3] : undefined,
    }
  }
  return request as Parameters<ChatService['regenerateMessage']>[0]
}

function normalizeUploadRequest(request: unknown) {
  const payload = request as { name: string; mimeType?: string; type?: string; bytes: ArrayBuffer }
  return {
    name: payload.name,
    mimeType: payload.mimeType ?? payload.type,
    bytes: payload.bytes,
  }
}

app.on('window-all-closed', () => {
  if (!isMac) {
    app.quit()
  }
})
