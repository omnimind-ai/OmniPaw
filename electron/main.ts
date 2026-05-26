import { join } from 'node:path'

import { createElectronLogSink, createProjectLogger } from '@core/logging'
import { resolveOpenOmniClawDataPaths } from '@core/utils/data-paths'
import { APP_NAME, IPC_CHANNELS } from '@shared/constants'
import type { ChatSession } from '@shared/types/chat'
import type { CronTaskChangedEvent } from '@shared/types/cron'
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

function isRuntimeCatSession(session: ChatSession | undefined | null): session is ChatSession {
  return session?.status !== 'deleted' && session?.kind === 'cat'
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
  if (preferred && isRuntimeCatSession(runtime.sessionRepo.get(preferred))) {
    return preferred
  }

  const active = normalizeSessionId(getActiveCatSessionId())
  if (active && isRuntimeCatSession(runtime.sessionRepo.get(active))) {
    return active
  }

  const existing = runtime.sessionRepo
    .list({ kind: 'all' })
    .find((session) => isRuntimeCatSession(session))
  if (existing) {
    return existing.id
  }

  try {
    const created = await createRuntimeCatSession(runtime)
    return created.id
  } catch (error) {
    mainLogger.warn('Unable to create cat session for cat window state.', { error })
    return null
  }
}

async function createRuntimeCatSession(currentRuntime: CoreRuntime): Promise<ChatSession> {
  const session = await currentRuntime.chatService.createSession({
    kind: 'cat',
    title: '小猫会话',
  })
  mainLogger.info('Cat session created.', {
    sessionId: session.id,
    providerId: session.defaultProviderId,
    modelId: session.defaultModelId,
  })
  return session
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
