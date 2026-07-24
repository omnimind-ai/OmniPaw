import { type app, Menu, type MenuItemConstructorOptions, Tray } from 'electron'
import { createTrayIconImage } from './app-icon'

interface TrayDevActions {
  debugUnlockNextGift: () => void
  showFirstLaunchGuide: () => void
  triggerObservationReaction: () => void
  showDirectCatBubble: () => void
}

interface TrayControllerOptions {
  app: typeof app
  appName: string
  devActions?: TrayDevActions
  isDevMode?: () => boolean
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
    const template: MenuItemConstructorOptions[] = [
      {
        label: '显示主窗口',
        click: () => options.showMainWindow(),
      },
      {
        label: `关闭到托盘：${minimizeToTrayEnabled ? '开启' : '关闭'}`,
        enabled: false,
      },
    ]

    const devItems = buildDevMenuItems()
    if (devItems.length > 0) {
      template.push(
        { type: 'separator' },
        {
          label: '开发测试',
          submenu: devItems,
        }
      )
    }

    template.push(
      { type: 'separator' },
      {
        label: '退出',
        click: () => options.quitApp(),
      }
    )

    tray.setContextMenu(Menu.buildFromTemplate(template))
  }

  function buildDevMenuItems(): MenuItemConstructorOptions[] {
    if (!options.isDevMode?.() || !options.devActions) {
      return []
    }

    return [
      {
        label: '显示首次引导',
        click: () => options.devActions?.showFirstLaunchGuide(),
      },
      {
        label: '测试触发礼物',
        click: () => options.devActions?.debugUnlockNextGift(),
      },
      {
        label: '模型测气泡',
        click: () => options.devActions?.triggerObservationReaction(),
      },
      {
        label: '直接弹气泡',
        click: () => options.devActions?.showDirectCatBubble(),
      },
    ]
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
