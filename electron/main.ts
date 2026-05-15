import { join } from 'node:path'

import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { AttachmentService } from '@core/chat/attachment-service'
import { ChatService } from '@core/chat/chat-service'
import { ContextBuilder } from '@core/chat/context-manager'
import { RunManager } from '@core/chat/run-manager'
import { CronManager } from '@core/cron/cron-manager'
import { DatabaseClient } from '@core/db/client'
import { AttachmentRepo, AppSettingsRepo, ChatMessageRepo, ChatRunRepo, ChatSessionRepo, ProviderRepo } from '@core/db/repos'
import { seedDefaultChatData } from '@core/db/seed'
import { ToolManagementService } from '@core/agent/tool-management-service'
import {
  DbProviderCredentialRepository,
  DbProviderModelRepository,
  DbProviderRepository,
  DbSessionProviderOverrideRepository,
} from '@core/provider/db-adapters'
import { encryptCredentialValue } from '@core/provider/credentials'
import { ProviderManager } from '@core/provider/manager'
import { SkillManager } from '@core/skill/skill-manager'
import { APP_NAME, IPC_CHANNELS } from '@shared/constants'
import type {
  DeleteProviderRequest,
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
let providerRepo: ProviderRepo
let toolManagementService: ToolManagementService

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
  ipcMain.handle(IPC_CHANNELS.provider.upsert, async (_event, request: SaveProviderRequest) => {
    const now = Date.now()
    const credential = request.credential
    const credentialId =
      credential && (credential.value || credential.envVar)
        ? request.provider.credentialRef ?? `${request.provider.id}:default`
        : request.provider.credentialRef
    const provider = {
      ...request.provider,
      models: request.provider.models ?? [],
      credentialRef: credentialId,
      enabled: request.provider.enabled !== false,
      updatedAt: now,
      createdAt: request.provider.createdAt ?? now,
    }
    providerRepo.save(provider)

    if (credential && credentialId && (credential.value || credential.envVar)) {
      providerRepo.saveCredential({
        id: credentialId,
        providerId: provider.id,
        type: credential.type,
        label: credential.label || 'Default',
        encryptedValue: credential.value ? encryptCredentialValue(credential.value) : undefined,
        envVar: credential.envVar,
        createdAt: now,
        updatedAt: now,
      })
    }

    return providerManager.get(provider.id)
  })
  ipcMain.handle(IPC_CHANNELS.provider.delete, async (_event, request: DeleteProviderRequest | string) => {
    providerRepo.delete(typeof request === 'string' ? request : request.providerId)
    return { ok: true }
  })
  ipcMain.handle(IPC_CHANNELS.provider.test, (_event, request: TestProviderRequest | string, modelId?: string) =>
    providerManager.test(typeof request === 'string' ? request : request.providerId ?? request.provider?.id ?? '', typeof request === 'string' ? modelId : request.modelId),
  )
  ipcMain.handle(IPC_CHANNELS.provider.listModels, (_event, providerId: string) =>
    providerRepo.listModels(providerId),
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
  providerRepo = new ProviderRepo(db)
  const runRepo = new ChatRunRepo(db)
  const appSettingsRepo = new AppSettingsRepo(db)
  toolManagementService = new ToolManagementService(appSettingsRepo)

  providerManager = new ProviderManager({
    providers: new DbProviderRepository(providerRepo),
    models: new DbProviderModelRepository(providerRepo),
    credentials: new DbProviderCredentialRepository(providerRepo),
    sessions: new DbSessionProviderOverrideRepository(sessionRepo),
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
