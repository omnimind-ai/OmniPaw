import { IPC_CHANNELS } from '@shared/constants'
import type { DesktopWindowState } from '@shared/types/window'
import { BrowserWindow } from 'electron'
import { registerLoggedIpcHandler } from './common'
import type { IpcHandlerOptions } from './types'

export function registerWindowIpcHandlers(options: IpcHandlerOptions): void {
  registerLoggedIpcHandler(options, IPC_CHANNELS.window.getState, (event) =>
    getWindowState(requireSenderWindow(event), options.platform)
  )

  registerLoggedIpcHandler(options, IPC_CHANNELS.window.minimize, (event) => {
    const window = requireSenderWindow(event)
    if (window.isMinimizable()) {
      window.minimize()
    }
    return getWindowState(window, options.platform)
  })

  registerLoggedIpcHandler(options, IPC_CHANNELS.window.toggleMaximize, (event) => {
    const window = requireSenderWindow(event)
    if (!window.isMaximizable()) {
      return getWindowState(window, options.platform)
    }

    if (window.isFullScreen()) {
      window.setFullScreen(false)
    } else if (window.isMaximized()) {
      window.unmaximize()
    } else {
      window.maximize()
    }

    return getWindowState(window, options.platform)
  })

  registerLoggedIpcHandler(options, IPC_CHANNELS.window.close, (event) => {
    requireSenderWindow(event).close()
  })
}

function requireSenderWindow(event: Electron.IpcMainInvokeEvent): BrowserWindow {
  const window = BrowserWindow.fromWebContents(event.sender)
  if (!window || window.isDestroyed()) {
    throw new Error('Window operation requires an active BrowserWindow.')
  }
  return window
}

function getWindowState(window: BrowserWindow, platform: NodeJS.Platform): DesktopWindowState {
  return {
    platform,
    isMaximized: window.isMaximized() || window.isFullScreen(),
  }
}
