import { join } from 'node:path'
import { listBuiltinToolDefinitions } from '@core/agent/builtin-tools'
import { ToolManagementService } from '@core/agent/tool-management-service'
import { AttachmentService } from '@core/chat/attachment-service'
import { ChatService } from '@core/chat/chat-service'
import { ContextBuilder } from '@core/chat/context-manager'
import { RunManager } from '@core/chat/run-manager'
import { ConfigValidationError, configError } from '@core/config/schema'
import { ConfigStore } from '@core/config/store'
import { ConfigToolSettingsStore } from '@core/config/tool-settings-store'
import { CronManager } from '@core/cron/cron-manager'
import { DatabaseClient } from '@core/db/client'
import { AttachmentRepo, ChatMessageRepo, ChatRunRepo, ChatSessionRepo } from '@core/db/repos'
import { seedDefaultChatData } from '@core/db/seed'
import { createElectronLogSink, createProjectLogger, writeRendererLogRequest } from '@core/logging'
import { McpRegistryStore, McpServerManager, McpValidationError, mcpError } from '@core/mcp'
import { ProviderManager } from '@core/provider/manager'
import { SkillManager, SkillValidationError, skillError } from '@core/skill'
import { APP_NAME, IPC_CHANNELS } from '@shared/constants'
import type {
  AbortRunRequest,
  AttachmentPreviewRequest,
  ChatMessagePart,
  DeleteSessionRequest,
  EditMessageRequest,
  ListMessagesRequest,
  RegenerateMessageRequest,
  SendMessageRequest,
  UploadAttachmentRequest,
} from '@shared/types/chat'
import type {
  DeleteMcpServerRequest,
  McpOperationError,
  RefreshMcpServerRequest,
  SaveMcpServerRequest,
  SetMcpServerEnabledRequest,
} from '@shared/types/mcp'
import type {
  CreateProviderFromPresetRequest,
  DeleteProviderRequest,
  RefreshProviderModelsRequest,
  SaveProviderRequest,
  SetSessionModelRequest,
  TestProviderRequest,
} from '@shared/types/provider'
import type {
  DesktopSettingsChangedEvent,
  DesktopSettingsConfig,
  SaveDesktopSettingsRequest,
  SettingsChangeReason,
  SettingsOperationError,
} from '@shared/types/settings'
import type {
  ImportSkillRequest,
  SetSkillEnabledRequest,
  SkillOperationError,
} from '@shared/types/skill'
import type { SetToolEnabledRequest } from '@shared/types/tool'
import { app, BrowserWindow, ipcMain, Menu, nativeImage, shell, Tray } from 'electron'
import {
  closeCatWindow,
  registerCatWindowIpcHandlers,
  setCatWindowLogger,
  showCatWindow,
} from './cat-window'

const cronManager = new CronManager()
const logSink = createElectronLogSink({
  logDir: resolveAppLogsPath(),
  appName: APP_NAME,
  appVersion: app.getVersion(),
})
const rootLogger = createProjectLogger({
  sink: logSink,
  scope: 'desktop',
  meta: {
    pid: process.pid,
    processType: process.type ?? 'main',
    appVersion: app.getVersion(),
    platform: process.platform,
  },
})
const mainLogger = rootLogger.child({ scope: 'main' })
const ipcLogger = mainLogger.child({ scope: 'ipc' })
const lifecycleLogger = mainLogger.child({ scope: 'lifecycle' })

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let isQuitting = false
let chatService: ChatService
let providerManager: ProviderManager
let sessionRepo: ChatSessionRepo
let toolManagementService: ToolManagementService
let configStore: ConfigStore
let mcpServerManager: McpServerManager
let skillManager: SkillManager

registerProcessDiagnostics()

function resolveAppLogsPath(): string {
  try {
    app.setAppLogsPath()
    return app.getPath('logs')
  } catch {
    try {
      return join(app.getPath('userData'), 'logs')
    } catch {
      return join(process.cwd(), 'logs')
    }
  }
}

function createMainWindow(): void {
  const window = new BrowserWindow({
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
  mainWindow = window
  attachWindowDiagnostics(window, 'main')

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }

  window.once('ready-to-show', () => {
    if (mainWindow !== window || window.isDestroyed()) {
      return
    }

    showMainWindow()
  })

  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  window.on('minimize', () => {
    if (!isQuitting && isMinimizeToTrayEnabled()) {
      hideMainWindowToTray()
    }
  })

  window.on('close', (event) => {
    if (!isQuitting && isMinimizeToTrayEnabled()) {
      event.preventDefault()
      hideMainWindowToTray()
    }
  })

  window.on('closed', () => {
    mainWindow = null
    closeCatWindow()

    if (!isQuitting) {
      isQuitting = true
      app.quit()
    }
  })
}

function attachWindowDiagnostics(window: BrowserWindow, windowName: string): void {
  const logger = mainLogger.child({ scope: `window.${windowName}` })
  window.webContents.on('preload-error', (_event, preloadPath, error) => {
    logger.error('Preload script failed.', { preloadPath, error })
  })
  window.webContents.on('render-process-gone', (_event, details) => {
    const level = details.reason === 'clean-exit' ? 'info' : 'error'
    logger[level]('Renderer process ended.', {
      reason: details.reason,
      exitCode: details.exitCode,
    })
  })
  window.webContents.on('unresponsive', () => {
    logger.warn('Window became unresponsive.')
  })
}

function registerProcessDiagnostics(): void {
  process.on('uncaughtExceptionMonitor', (error, origin) => {
    mainLogger.error('Uncaught exception observed.', { origin, error })
  })
  process.on('unhandledRejection', (reason) => {
    mainLogger.error('Unhandled promise rejection observed.', { error: reason })
  })
  app.on('child-process-gone', (_event, details) => {
    mainLogger.error('Child process ended unexpectedly.', {
      type: details.type,
      reason: details.reason,
      exitCode: details.exitCode,
      serviceName: details.serviceName,
      name: details.name,
    })
  })
}

function createTray(): void {
  if (tray) {
    updateTrayMenu()
    return
  }

  tray = new Tray(createTrayIcon())
  tray.setToolTip(APP_NAME)
  tray.on('click', () => {
    showMainWindow()
  })
  tray.on('double-click', () => {
    showMainWindow()
  })
  updateTrayMenu()
}

function createTrayIcon() {
  const trayIconPath = join(app.getAppPath(), 'resources/tray.png')
  const icon = nativeImage.createFromPath(trayIconPath)
  const size = process.platform === 'darwin' ? 18 : 16
  const resized = icon.resize({ width: size, height: size })

  if (process.platform === 'darwin') {
    resized.setTemplateImage(true)
  }

  return resized
}

function updateTrayMenu(): void {
  if (!tray) {
    return
  }

  const minimizeToTrayEnabled = isMinimizeToTrayEnabled()
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: '显示主窗口',
        click: () => showMainWindow(),
      },
      {
        label: `关闭/最小化到托盘：${minimizeToTrayEnabled ? '开启' : '关闭'}`,
        enabled: false,
      },
      { type: 'separator' },
      {
        label: '退出',
        click: () => quitApp(),
      },
    ])
  )
}

function destroyTray(): void {
  if (!tray) {
    return
  }

  tray.destroy()
  tray = null
}

function quitApp(): void {
  isQuitting = true
  closeCatWindow()
  destroyTray()
  app.quit()
}

function hideMainWindowToTray(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return
  }

  mainWindow.hide()
  updateTrayMenu()
}

function showMainWindow(): void {
  if (isQuitting) {
    return
  }

  if (!mainWindow) {
    createMainWindow()
    return
  }

  if (process.platform === 'darwin') {
    app.dock?.show()
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore()
  }

  if (!mainWindow.isVisible()) {
    mainWindow.show()
  }

  mainWindow.focus()
  showCatWindow()
  updateTrayMenu()
}

function isMinimizeToTrayEnabled(): boolean {
  try {
    return configStore.get().app.minimizeToTrayOnStartup
  } catch {
    return false
  }
}

function registerIpcHandlers(): void {
  registerLoggingIpcHandlers()

  registerLoggedIpcHandler(IPC_CHANNELS.app.getInfo, () => ({
    name: APP_NAME,
    version: app.getVersion(),
    platform: process.platform,
  }))

  registerLoggedIpcHandler(IPC_CHANNELS.settings.load, () =>
    settingsResult(() => configStore.get())
  )
  registerLoggedIpcHandler(
    IPC_CHANNELS.settings.save,
    (_event, request: SaveDesktopSettingsRequest | DesktopSettingsConfig) =>
      settingsResult(() => {
        const config = isSaveSettingsRequest(request) ? request.config : request
        const saved = configStore.save(config)
        broadcastSettingsChanged('save', saved)
        return saved
      })
  )
  registerLoggedIpcHandler(IPC_CHANNELS.settings.reset, () =>
    settingsResult(() => {
      const saved = configStore.reset()
      broadcastSettingsChanged('reset', saved)
      return saved
    })
  )
  registerLoggedIpcHandler(IPC_CHANNELS.settings.status, () =>
    settingsResult(() => configStore.status())
  )

  registerLoggedIpcHandler(IPC_CHANNELS.chat.listSessions, () => chatService.listSessions())
  registerLoggedIpcHandler(IPC_CHANNELS.chat.createSession, () => chatService.createSession())
  registerLoggedIpcHandler(IPC_CHANNELS.chat.getSession, (_event, sessionId: string) =>
    chatService.getSession(sessionId)
  )
  registerLoggedIpcHandler(IPC_CHANNELS.chat.updateSession, (_event, request) =>
    chatService.updateSession(normalizeUpdateSessionRequest(request))
  )
  registerLoggedIpcHandler(
    IPC_CHANNELS.chat.deleteSession,
    (_event, request: DeleteSessionRequest | string) => chatService.deleteSession(request)
  )
  registerLoggedIpcHandler(
    IPC_CHANNELS.chat.listMessages,
    (_event, request: ListMessagesRequest | string) => chatService.listMessages(request)
  )
  registerLoggedIpcHandler(IPC_CHANNELS.chat.sendMessage, (event, request: SendMessageRequest) =>
    chatService.sendMessage(request, event.sender)
  )
  registerLoggedIpcHandler(
    IPC_CHANNELS.chat.abortRun,
    (_event, request: AbortRunRequest | string) => chatService.abortRun(request)
  )
  registerLoggedIpcHandler(
    IPC_CHANNELS.chat.editMessage,
    (_event, request: EditMessageRequest | [string, string, ChatMessagePart[]]) =>
      chatService.editMessage(normalizeEditMessageRequest(request))
  )
  registerLoggedIpcHandler(
    IPC_CHANNELS.chat.regenerateMessage,
    (event, request: RegenerateMessageRequest | [string, string, string?, string?]) =>
      chatService.regenerateMessage(normalizeRegenerateRequest(request), event.sender)
  )
  registerLoggedIpcHandler(
    IPC_CHANNELS.chat.uploadAttachment,
    (_event, request: UploadAttachmentRequest) =>
      attachmentService.upload(normalizeUploadRequest(request))
  )
  registerLoggedIpcHandler(
    IPC_CHANNELS.chat.getAttachmentPreview,
    (_event, request: AttachmentPreviewRequest | string) => {
      const attachmentId = typeof request === 'string' ? request : request.attachmentId
      return attachmentService.getPreview(attachmentId)
    }
  )

  registerLoggedIpcHandler(IPC_CHANNELS.provider.list, () => providerManager.list())
  registerLoggedIpcHandler(IPC_CHANNELS.provider.listPresets, () => providerManager.listPresets())
  registerLoggedIpcHandler(
    IPC_CHANNELS.provider.createFromPreset,
    (_event, request: CreateProviderFromPresetRequest | string) =>
      providerManager.createFromPreset(typeof request === 'string' ? request : request.presetId)
  )
  registerLoggedIpcHandler(IPC_CHANNELS.provider.upsert, (_event, request: SaveProviderRequest) =>
    providerManager.upsert(request)
  )
  registerLoggedIpcHandler(
    IPC_CHANNELS.provider.delete,
    async (_event, request: DeleteProviderRequest | string) => {
      await providerManager.delete(typeof request === 'string' ? request : request.providerId)
      return { ok: true }
    }
  )
  registerLoggedIpcHandler(
    IPC_CHANNELS.provider.test,
    (_event, request: TestProviderRequest | string, modelId?: string) =>
      providerManager.test(
        typeof request === 'string' ? request : (request.providerId ?? request.provider?.id ?? ''),
        typeof request === 'string' ? modelId : request.modelId
      )
  )
  registerLoggedIpcHandler(IPC_CHANNELS.provider.listModels, (_event, providerId: string) =>
    providerManager.listModels(providerId)
  )
  registerLoggedIpcHandler(
    IPC_CHANNELS.provider.refreshModels,
    async (_event, request: RefreshProviderModelsRequest | string) =>
      providerManager.refreshModels(typeof request === 'string' ? request : request.providerId)
  )
  registerLoggedIpcHandler(
    IPC_CHANNELS.provider.setSessionModel,
    (_event, request: SetSessionModelRequest) =>
      chatService.updateSession({
        sessionId: request.sessionId,
        defaultProviderId: request.providerId,
        defaultModelId: request.modelId,
      })
  )
  registerLoggedIpcHandler(IPC_CHANNELS.skill.list, () => skillResult(() => skillManager.list()))
  registerLoggedIpcHandler(IPC_CHANNELS.skill.refresh, () =>
    skillResult(() => skillManager.refresh())
  )
  registerLoggedIpcHandler(
    IPC_CHANNELS.skill.setEnabled,
    (_event, request: SetSkillEnabledRequest) => skillResult(() => skillManager.setEnabled(request))
  )
  registerLoggedIpcHandler(IPC_CHANNELS.skill.importSkill, (_event, request: ImportSkillRequest) =>
    skillResult(() => skillManager.importSkill(request))
  )
  registerLoggedIpcHandler(IPC_CHANNELS.cron.list, () => cronManager.list())
  registerLoggedIpcHandler(IPC_CHANNELS.tools.list, () => toolManagementService.list())
  registerLoggedIpcHandler(
    IPC_CHANNELS.tools.setEnabled,
    (_event, request: SetToolEnabledRequest) =>
      toolManagementService.setEnabled(request.name, request.enabled)
  )
  registerLoggedIpcHandler(IPC_CHANNELS.mcp.listServers, () =>
    mcpResult(() => mcpServerManager.listServers())
  )
  registerLoggedIpcHandler(IPC_CHANNELS.mcp.saveServer, (_event, request: SaveMcpServerRequest) =>
    mcpResult(() => mcpServerManager.saveServer(request))
  )
  registerLoggedIpcHandler(
    IPC_CHANNELS.mcp.deleteServer,
    (_event, request: DeleteMcpServerRequest | string) =>
      mcpResult(() =>
        mcpServerManager.deleteServer(typeof request === 'string' ? request : request.serverId)
      )
  )
  registerLoggedIpcHandler(
    IPC_CHANNELS.mcp.setServerEnabled,
    (_event, request: SetMcpServerEnabledRequest) =>
      mcpResult(() => mcpServerManager.setServerEnabled(request))
  )
  registerLoggedIpcHandler(
    IPC_CHANNELS.mcp.refreshServer,
    (_event, request?: RefreshMcpServerRequest | string) =>
      mcpResult(() =>
        mcpServerManager.refreshServer(typeof request === 'string' ? request : request?.serverId)
      )
  )
  registerLoggedIpcHandler(IPC_CHANNELS.mcp.listTools, () =>
    mcpResult(() => mcpServerManager.listTools())
  )
}

function registerLoggingIpcHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.logging.write, (_event, request) => {
    const result = writeRendererLogRequest(rootLogger.child({ scope: 'renderer' }), request)
    const status = logSink.status()
    return {
      accepted: result.accepted,
      persisted: result.accepted && status.available,
      dropped: !result.accepted || !status.available,
      reason: result.reason ?? (status.available ? undefined : 'transport_unavailable'),
    }
  })

  ipcMain.handle(IPC_CHANNELS.logging.status, () => logSink.status())
}

function registerLoggedIpcHandler<T extends unknown[]>(
  channel: string,
  handler: (event: Electron.IpcMainInvokeEvent, ...args: T) => unknown
): void {
  ipcMain.handle(channel, async (event, ...args) => {
    const startedAt = Date.now()
    try {
      const result = await handler(event, ...(args as T))
      logIpcCompletion(channel, startedAt, result)
      return result
    } catch (error) {
      ipcLogger.error('IPC handler failed.', {
        channel,
        durationMs: Date.now() - startedAt,
        error,
      })
      throw error
    }
  })
}

function logIpcCompletion(channel: string, startedAt: number, result: unknown): void {
  const durationMs = Date.now() - startedAt
  if (isIpcFailureResult(result)) {
    ipcLogger.warn('IPC handler returned failure.', {
      channel,
      durationMs,
      errorCode: typeof result.error?.code === 'string' ? result.error.code : undefined,
      recoverable:
        typeof result.error?.recoverable === 'boolean' ? result.error.recoverable : undefined,
    })
    return
  }

  ipcLogger.debug('IPC handler completed.', { channel, durationMs })
}

function isIpcFailureResult(
  value: unknown
): value is { ok: false; error?: { code?: unknown; recoverable?: unknown } } {
  return isRecord(value) && value.ok === false
}

app
  .whenReady()
  .then(() => {
    lifecycleLogger.info('Electron app ready.', {
      version: app.getVersion(),
      logDir: logSink.status().logDir,
    })
    initializeCore()
    setCatWindowLogger(mainLogger.child({ scope: 'cat' }))
    registerCatWindowIpcHandlers()
    registerIpcHandlers()
    createTray()
    createMainWindow()

    lifecycleLogger.info('Desktop startup complete.')

    app.on('activate', () => {
      lifecycleLogger.debug('App activate event.')
      showMainWindow()
    })
  })
  .catch((error) => {
    lifecycleLogger.error('Desktop startup failed.', { error })
    throw error
  })

app.on('before-quit', () => {
  lifecycleLogger.info('App before-quit.')
  isQuitting = true
  closeCatWindow()
  destroyTray()
})

let attachmentService: AttachmentService

function initializeCore(): void {
  const coreLogger = rootLogger.child({ scope: 'core' })
  const startedAt = Date.now()
  coreLogger.info('Core initialization started.')

  const db = new DatabaseClient({ logger: coreLogger.child({ scope: 'db' }) }).connect()
  seedDefaultChatData(db)
  coreLogger.debug('Default chat seed checked.')

  sessionRepo = new ChatSessionRepo(db)
  const messageRepo = new ChatMessageRepo(db)
  const attachmentRepo = new AttachmentRepo(db)
  const runRepo = new ChatRunRepo(db)
  configStore = new ConfigStore({
    appDataPath: app.getPath('appData'),
    appName: APP_NAME,
    logger: coreLogger.child({ scope: 'config' }),
  })
  loadStartupConfig()
  mcpServerManager = new McpServerManager({
    store: new McpRegistryStore({ userDataPath: app.getPath('userData') }),
    reservedToolNames: listBuiltinToolDefinitions().map((tool) => tool.name),
    onChanged: broadcastMcpChanged,
    logger: coreLogger.child({ scope: 'mcp' }),
  })
  loadStartupMcp()
  skillManager = new SkillManager({
    userDataPath: app.getPath('userData'),
    onChanged: broadcastSkillChanged,
    logger: coreLogger.child({ scope: 'skill' }),
  })
  loadStartupSkills()
  toolManagementService = new ToolManagementService(
    new ConfigToolSettingsStore(configStore, (saved) => {
      broadcastSettingsChanged('save', saved)
    }),
    () =>
      mcpServerManager.listTools().tools.map((tool) => ({
        name: tool.name,
        providerName: tool.providerName,
        label: tool.label,
        description: tool.description,
        parameters: tool.parameters,
        risk: tool.risk,
        profiles: tool.profiles,
        source: 'mcp' as const,
        serverId: tool.serverId,
        serverName: tool.serverName,
        discoveryStatus: 'available',
        enabled: tool.enabled,
        readonly: true,
      }))
  )

  providerManager = new ProviderManager({
    configStore,
    onConfigSaved: (saved) => broadcastSettingsChanged('save', saved),
    logger: coreLogger.child({ scope: 'provider' }),
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
    skills: skillManager,
    compactSkillDescriptions: () => configStore.get().app.compactSkillDescriptions,
    disabledToolNames: () => toolManagementService.getDisabledToolNames(),
    mcpTools: () => mcpServerManager.getAgentTools(),
    logger: coreLogger.child({ scope: 'chat' }),
  })
  coreLogger.info('Core initialization complete.', { durationMs: Date.now() - startedAt })
}

function broadcastSettingsChanged(
  reason: SettingsChangeReason,
  config: DesktopSettingsConfig
): void {
  updateTrayMenu()

  const event: DesktopSettingsChangedEvent = {
    reason,
    config,
    status: configStore.status(),
  }

  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(IPC_CHANNELS.settings.changed, event)
  }
}

function broadcastMcpChanged(
  event: Parameters<NonNullable<ConstructorParameters<typeof McpServerManager>[0]['onChanged']>>[0]
): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(IPC_CHANNELS.mcp.changed, event)
  }
}

function broadcastSkillChanged(
  event: Parameters<NonNullable<ConstructorParameters<typeof SkillManager>[0]['onChanged']>>[0]
): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(IPC_CHANNELS.skill.changed, event)
  }
}

type SettingsIpcResult<T> = { ok: true; value: T } | { ok: false; error: SettingsOperationError }

function settingsResult<T>(operation: () => T): SettingsIpcResult<T> {
  try {
    return {
      ok: true,
      value: operation(),
    }
  } catch (error) {
    if (error instanceof ConfigValidationError) {
      ipcLogger.warn('Settings operation failed.', {
        errorCode: error.details.code,
        recoverable: error.details.recoverable,
      })
      return {
        ok: false,
        error: error.details,
      }
    }
    ipcLogger.error('Settings operation failed unexpectedly.', { error })
    return {
      ok: false,
      error: configError(
        'config_io_error',
        error instanceof Error ? error.message : 'Settings operation failed.',
        {
          path: configStore.status().path,
          recoverable: configStore.status().recoverable,
        }
      ),
    }
  }
}

type McpIpcResult<T> = { ok: true; value: T } | { ok: false; error: McpOperationError }

async function mcpResult<T>(operation: () => T | Promise<T>): Promise<McpIpcResult<T>> {
  try {
    return {
      ok: true,
      value: await operation(),
    }
  } catch (error) {
    if (error instanceof McpValidationError) {
      ipcLogger.warn('MCP operation failed.', {
        errorCode: error.details.code,
        recoverable: error.details.recoverable,
      })
      return {
        ok: false,
        error: error.details,
      }
    }
    ipcLogger.error('MCP operation failed unexpectedly.', { error })
    return {
      ok: false,
      error: mcpError(
        'mcp_io_error',
        error instanceof Error ? error.message : 'MCP operation failed.',
        {
          recoverable: true,
        }
      ),
    }
  }
}

type SkillIpcResult<T> = { ok: true; value: T } | { ok: false; error: SkillOperationError }

function skillResult<T>(operation: () => T): SkillIpcResult<T> {
  try {
    return {
      ok: true,
      value: operation(),
    }
  } catch (error) {
    if (error instanceof SkillValidationError) {
      ipcLogger.warn('Skill operation failed.', {
        errorCode: error.details.code,
        recoverable: error.details.recoverable,
      })
      return {
        ok: false,
        error: error.details,
      }
    }
    ipcLogger.error('Skill operation failed unexpectedly.', { error })
    return {
      ok: false,
      error: skillError(
        'skill_io_error',
        error instanceof Error ? error.message : 'Skill operation failed.',
        {
          recoverable: true,
        }
      ),
    }
  }
}

function isSaveSettingsRequest(
  value: SaveDesktopSettingsRequest | DesktopSettingsConfig
): value is SaveDesktopSettingsRequest {
  return Boolean(value && typeof value === 'object' && 'config' in value)
}

function loadStartupConfig(): DesktopSettingsConfig | undefined {
  try {
    const config = configStore.load()
    lifecycleLogger.info('Startup config loaded.', { version: config.version })
    return config
  } catch (error) {
    if (error instanceof ConfigValidationError) {
      lifecycleLogger.warn('Startup config validation failed.', {
        errorCode: error.details.code,
        recoverable: error.details.recoverable,
      })
      return undefined
    }
    lifecycleLogger.error('Startup config load failed.', { error })
    throw error
  }
}

function loadStartupMcp(): void {
  try {
    mcpServerManager.load()
    mcpServerManager.startBackgroundRefresh()
    lifecycleLogger.info('Startup MCP registry loaded.')
  } catch (error) {
    if (error instanceof McpValidationError) {
      lifecycleLogger.warn('Startup MCP registry validation failed.', {
        errorCode: error.details.code,
        recoverable: error.details.recoverable,
      })
      return
    }
    lifecycleLogger.error('Startup MCP registry load failed.', { error })
    throw error
  }
}

function loadStartupSkills(): void {
  try {
    skillManager.load()
    lifecycleLogger.info('Startup skills loaded.')
  } catch (error) {
    if (error instanceof SkillValidationError) {
      lifecycleLogger.warn('Startup skill state validation failed.', {
        errorCode: error.details.code,
        recoverable: error.details.recoverable,
      })
      return
    }
    lifecycleLogger.error('Startup skill load failed.', { error })
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
  lifecycleLogger.info('All windows closed.')
  app.quit()
})

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
