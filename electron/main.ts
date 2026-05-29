import { join } from 'node:path'
import type { ChatRunEventTarget } from '@core/chat/run-manager'
import { createElectronLogSink, createProjectLogger } from '@core/logging'
import { resolveOpenOmniClawDataPaths } from '@core/utils/data-paths'
import { APP_NAME, IPC_CHANNELS } from '@shared/constants'
import type { OpenChatSessionRequest } from '@shared/types/app'
import type { ChatSessionChangedEvent } from '@shared/types/chat'
import type { CronTaskChangedEvent } from '@shared/types/cron'
import type { ObservationChangedEvent, ObservationReactionEvent } from '@shared/types/observation'
import type {
  DesktopSettingsChangedEvent,
  DesktopSettingsConfig,
  SettingsChangeReason,
} from '@shared/types/settings'
import { app, BrowserWindow } from 'electron'
import {
  type CatNotificationController,
  createCatNotificationController,
} from './cat-notification-controller'
import {
  closeCatWindow,
  getActiveCatSessionId,
  getCatWindowBounds,
  openCatPanelWindow,
  registerCatWindowIpcHandlers,
  sendCatObservationReaction,
  setActiveCatSessionId,
  setCatSessionIdResolver,
  setCatWindowLogger,
  showCatWindow,
} from './cat-window'
import {
  type CoreRuntime,
  createCoreRuntime,
  type McpChangedEvent,
  type SkillChangedEvent,
} from './core-runtime'
import { registerIpcHandlers } from './ipc'
import { createMainWindowController, type MainWindowController } from './main-window'
import { createTrayController, type TrayController } from './tray'

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

let runtime: CoreRuntime | undefined
let mainWindowController: MainWindowController | undefined
let trayController: TrayController | undefined
let catNotificationController: CatNotificationController | undefined
let isQuitting = false

registerProcessDiagnostics()

function resolveAppLogsPath(): string {
  try {
    return resolveOpenOmniClawDataPaths({ appDataPath: app.getPath('appData') }).logs
  } catch {
    try {
      return resolveOpenOmniClawDataPaths().logs
    } catch {
      return join(process.cwd(), 'openomniclaw', 'logs')
    }
  }
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

function createControllers(): void {
  mainWindowController = createMainWindowController({
    app,
    appName: APP_NAME,
    logger: mainLogger,
    isQuitting: () => isQuitting,
    setQuitting: markQuitting,
    shouldMinimizeToTray: isMinimizeToTrayEnabled,
    onHiddenToTray: updateTrayMenu,
    onClosed: closeCatWindow,
    showCatWindow: () => {
      showCatWindow()
    },
  })

  trayController = createTrayController({
    app,
    appName: APP_NAME,
    quitApp,
    shouldMinimizeToTray: isMinimizeToTrayEnabled,
    showMainWindow,
  })
}

function markQuitting(): void {
  isQuitting = true
}

function quitApp(): void {
  markQuitting()
  catNotificationController?.destroy()
  closeCatWindow()
  trayController?.destroy()
  app.quit()
}

function showMainWindow(): void {
  mainWindowController?.show()
}

function openMainChatSession(sessionId: string, kind?: OpenChatSessionRequest['kind']): void {
  showMainWindow()
  const window = mainWindowController?.getWindow()
  if (!window || window.isDestroyed()) {
    return
  }

  const request: OpenChatSessionRequest = { sessionId, kind }
  const send = () => {
    if (!window.isDestroyed()) {
      window.webContents.send(IPC_CHANNELS.app.navigateToChat, request)
    }
  }

  if (window.webContents.isLoading()) {
    window.webContents.once('did-finish-load', send)
  } else {
    send()
  }
}

function updateTrayMenu(): void {
  trayController?.updateMenu()
}

function isMinimizeToTrayEnabled(): boolean {
  try {
    return runtime?.configStore.get().app.minimizeToTrayOnStartup ?? false
  } catch {
    return false
  }
}

function getRuntimeSessionKind(sessionId: string): string | undefined {
  const session = runtime?.sessionRepo.get(sessionId)
  return typeof session?.kind === 'string' ? session.kind : undefined
}

function normalizeSessionId(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const normalized = value.trim()
  return normalized || null
}

async function resolveRuntimeCatSessionId(
  preferredSessionId?: string | null
): Promise<string | null> {
  if (!runtime) {
    return null
  }

  const preferred = normalizeSessionId(preferredSessionId)
  const active = normalizeSessionId(getActiveCatSessionId())

  try {
    const session = await runtime.chatService.getOrCreateSession({
      kind: 'cat',
      preferredIds: [preferred, active],
      preferredMismatch: 'ignore',
    })
    return session.id
  } catch (error) {
    mainLogger.warn('Unable to create cat session for cat window state.', { error })
    return null
  }
}

function createCatNotificationControllerForRuntime(): CatNotificationController {
  return createCatNotificationController({
    logger: mainLogger.child({ scope: 'cat.notification' }),
    getSessionKind: getRuntimeSessionKind,
    getAnchorBounds: getCatWindowBounds,
    openCatPanel: (sessionId) => {
      setActiveCatSessionId(sessionId, 'notification')
      openCatPanelWindow({ sessionId, source: 'notification' })
    },
  })
}

function broadcastSettingsChanged(
  reason: SettingsChangeReason,
  config: DesktopSettingsConfig
): void {
  if (!runtime) {
    return
  }

  updateTrayMenu()

  const event: DesktopSettingsChangedEvent = {
    reason,
    config,
    status: runtime.configStore.status(),
  }

  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(IPC_CHANNELS.settings.changed, event)
  }
}

function broadcastMcpChanged(event: McpChangedEvent): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(IPC_CHANNELS.mcp.changed, event)
  }
}

function broadcastSkillChanged(event: SkillChangedEvent): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(IPC_CHANNELS.skill.changed, event)
  }
}

function broadcastCronChanged(event: CronTaskChangedEvent): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(IPC_CHANNELS.cron.changed, event)
  }
  catNotificationController?.handleCronChanged(event)
}

function broadcastObservationChanged(event: ObservationChangedEvent): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(IPC_CHANNELS.observation.changed, event)
  }

  const sessionId = event.run?.visionSessionId
  if (!sessionId) {
    return
  }

  const session = runtime?.sessionRepo.get(sessionId)
  if (!session) {
    return
  }

  const chatEvent: ChatSessionChangedEvent = {
    reason: 'observation',
    sessionId,
    session,
  }
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(IPC_CHANNELS.chat.sessionChanged, chatEvent)
  }
}

function broadcastObservationReaction(event: ObservationReactionEvent): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(IPC_CHANNELS.observation.notification, event)
  }
  sendCatObservationReaction(event)
}

function createBroadcastChatEventTarget(): ChatRunEventTarget {
  return {
    send(channel, event) {
      for (const window of BrowserWindow.getAllWindows()) {
        window.webContents.send(channel, event)
      }
    },
  }
}

app
  .whenReady()
  .then(() => {
    lifecycleLogger.info('Electron app ready.', {
      version: app.getVersion(),
      logDir: logSink.status().logDir,
    })

    runtime = createCoreRuntime({
      app,
      appName: APP_NAME,
      rootLogger,
      lifecycleLogger,
      onSettingsChanged: broadcastSettingsChanged,
      onCronChanged: broadcastCronChanged,
      onMcpChanged: broadcastMcpChanged,
      onSkillChanged: broadcastSkillChanged,
      onObservationChanged: broadcastObservationChanged,
      onObservationReaction: broadcastObservationReaction,
      chatEventTarget: createBroadcastChatEventTarget,
      resolveCatSessionId: () => resolveRuntimeCatSessionId(getActiveCatSessionId()),
    })
    createControllers()
    setCatWindowLogger(mainLogger.child({ scope: 'cat' }))
    setCatSessionIdResolver(resolveRuntimeCatSessionId)
    catNotificationController = createCatNotificationControllerForRuntime()
    catNotificationController.registerIpcHandlers()
    registerCatWindowIpcHandlers()
    registerIpcHandlers({
      appName: APP_NAME,
      appVersion: app.getVersion(),
      logSink,
      rootLogger,
      ipcLogger,
      platform: process.platform,
      runtime,
      onSettingsChanged: broadcastSettingsChanged,
      openChatSession: openMainChatSession,
    })
    trayController?.create()
    mainWindowController?.create()

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
  markQuitting()
  catNotificationController?.destroy()
  closeCatWindow()
  runtime?.dispose()
  trayController?.destroy()
})

app.on('window-all-closed', () => {
  lifecycleLogger.info('All windows closed.')
  app.quit()
})
