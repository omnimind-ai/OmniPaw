import { join } from 'node:path'

import type { Logger } from '@core/logging'
import { IPC_CHANNELS } from '@shared/constants'
import type { DesktopWindowState } from '@shared/types/window'
import { type app, BrowserWindow, shell } from 'electron'

interface MainWindowControllerOptions {
  app: typeof app
  appName: string
  logger: Logger
  isQuitting: () => boolean
  setQuitting: () => void
  shouldMinimizeToTray: () => boolean
  onHiddenToTray: () => void
  onClosed: () => void
  showCatWindow: () => void
}

export interface MainWindowController {
  create: () => void
  getWindow: () => BrowserWindow | null
  hideToTray: () => void
  show: () => void
}

export function createMainWindowController(
  options: MainWindowControllerOptions
): MainWindowController {
  let mainWindow: BrowserWindow | null = null

  function create(): void {
    const isMac = process.platform === 'darwin'
    const window = new BrowserWindow({
      width: 1240,
      height: 780,
      minWidth: 980,
      minHeight: 640,
      title: options.appName,
      backgroundColor: '#f7f4ed',
      ...(isMac
        ? {
            titleBarStyle: 'hiddenInset',
            trafficLightPosition: { x: 12, y: 4 },
          }
        : {
            frame: false,
          }),
      autoHideMenuBar: true,
      show: false,
      webPreferences: {
        preload: join(__dirname, '../preload/preload.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
    })
    mainWindow = window
    attachWindowDiagnostics(window, 'main', options.logger)
    attachWindowStateEvents(window)

    if (process.env.ELECTRON_RENDERER_URL) {
      void window.loadURL(process.env.ELECTRON_RENDERER_URL)
    } else {
      void window.loadFile(join(__dirname, '../renderer/index.html'))
    }

    window.once('ready-to-show', () => {
      if (mainWindow !== window || window.isDestroyed()) {
        return
      }

      show()
    })

    window.webContents.setWindowOpenHandler(({ url }) => {
      void shell.openExternal(url)
      return { action: 'deny' }
    })

    window.on('minimize', () => {
      if (!options.isQuitting() && options.shouldMinimizeToTray()) {
        hideToTray()
      }
    })

    window.on('close', (event) => {
      if (!options.isQuitting() && options.shouldMinimizeToTray()) {
        event.preventDefault()
        hideToTray()
      }
    })

    window.on('closed', () => {
      mainWindow = null
      options.onClosed()

      if (!options.isQuitting()) {
        options.setQuitting()
        options.app.quit()
      }
    })
  }

  function hideToTray(): void {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return
    }

    mainWindow.hide()
    options.onHiddenToTray()
  }

  function show(): void {
    if (options.isQuitting()) {
      return
    }

    if (!mainWindow) {
      create()
      return
    }

    if (process.platform === 'darwin') {
      options.app.dock?.show()
    }

    if (mainWindow.isMinimized()) {
      mainWindow.restore()
    }

    if (!mainWindow.isVisible()) {
      mainWindow.show()
    }

    mainWindow.focus()
    options.showCatWindow()
    options.onHiddenToTray()
  }

  return {
    create,
    getWindow: () => mainWindow,
    hideToTray,
    show,
  }
}

function attachWindowDiagnostics(window: BrowserWindow, windowName: string, logger: Logger): void {
  const windowLogger = logger.child({ scope: `window.${windowName}` })
  window.webContents.on('preload-error', (_event, preloadPath, error) => {
    windowLogger.error('Preload script failed.', { preloadPath, error })
  })
  window.webContents.on('render-process-gone', (_event, details) => {
    const level = details.reason === 'clean-exit' ? 'info' : 'error'
    windowLogger[level]('Renderer process ended.', {
      reason: details.reason,
      exitCode: details.exitCode,
    })
  })
  window.webContents.on('unresponsive', () => {
    windowLogger.warn('Window became unresponsive.')
  })
}

function attachWindowStateEvents(window: BrowserWindow): void {
  const sendState = () => {
    if (window.isDestroyed()) {
      return
    }

    window.webContents.send(IPC_CHANNELS.window.stateChanged, getWindowState(window))
  }

  window.on('maximize', sendState)
  window.on('unmaximize', sendState)
  window.on('enter-full-screen', sendState)
  window.on('leave-full-screen', sendState)
}

function getWindowState(window: BrowserWindow): DesktopWindowState {
  return {
    platform: process.platform,
    isMaximized: window.isMaximized() || window.isFullScreen(),
  }
}
