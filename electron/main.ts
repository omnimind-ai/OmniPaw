import { join } from 'node:path'

import { createElectronLogSink, createProjectLogger } from '@core/logging'
import { APP_NAME, IPC_CHANNELS } from '@shared/constants'
import type {
  DesktopSettingsChangedEvent,
  DesktopSettingsConfig,
  SettingsChangeReason,
} from '@shared/types/settings'
import { app, BrowserWindow } from 'electron'
import {
  closeCatWindow,
  registerCatWindowIpcHandlers,
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
let isQuitting = false

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
      onMcpChanged: broadcastMcpChanged,
      onSkillChanged: broadcastSkillChanged,
    })
    createControllers()
    setCatWindowLogger(mainLogger.child({ scope: 'cat' }))
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
  closeCatWindow()
  trayController?.destroy()
})

app.on('window-all-closed', () => {
  lifecycleLogger.info('All windows closed.')
  app.quit()
})
