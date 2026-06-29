import { type app, Menu, Tray } from 'electron'
import { createTrayIconImage } from './app-icon'

interface TrayControllerOptions {
  app: typeof app
  appName: string
  quitApp: () => void
  shouldMinimizeToTray: () => boolean
  showMainWindow: () => void
}

export interface TrayController {
  create: () => void
  destroy: () => void
  updateMenu: () => void
}

export function createTrayController(options: TrayControllerOptions): TrayController {
  let tray: Tray | null = null

  function create(): void {
    if (tray) {
      updateMenu()
      return
    }

    tray = new Tray(createTrayIcon(options.app))
    tray.setToolTip(options.appName)
    tray.on('click', () => {
      options.showMainWindow()
    })
    tray.on('double-click', () => {
      options.showMainWindow()
    })
    updateMenu()
  }

  function updateMenu(): void {
    if (!tray) {
      return
    }

    const minimizeToTrayEnabled = options.shouldMinimizeToTray()
    tray.setContextMenu(
      Menu.buildFromTemplate([
        {
          label: '显示主窗口',
          click: () => options.showMainWindow(),
        },
        {
          label: `关闭到托盘：${minimizeToTrayEnabled ? '开启' : '关闭'}`,
          enabled: false,
        },
        { type: 'separator' },
        {
          label: '退出',
          click: () => options.quitApp(),
        },
      ])
    )
  }

  function destroy(): void {
    if (!tray) {
      return
    }

    tray.destroy()
    tray = null
  }

  return {
    create,
    destroy,
    updateMenu,
  }
}

function createTrayIcon(electronApp: typeof app) {
  const icon = createTrayIconImage(electronApp)
  const size = process.platform === 'darwin' ? 18 : 16
  const resized = icon.resize({ width: size, height: size })

  if (process.platform === 'darwin') {
    resized.setTemplateImage(true)
  }

  return resized
}
