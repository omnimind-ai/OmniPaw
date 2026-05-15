import { join } from 'node:path'

import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { SessionManager } from '@core/chat/session-manager'
import { StreamHandler } from '@core/chat/stream-handler'
import { CronManager } from '@core/cron/cron-manager'
import { ProviderManager } from '@core/provider/manager'
import { SkillManager } from '@core/skill/skill-manager'
import { APP_NAME, IPC_CHANNELS } from '@shared/constants'
import type { SendMessageRequest } from '@shared/types/chat'

const isMac = process.platform === 'darwin'

const sessionManager = new SessionManager()
const providerManager = new ProviderManager()
const skillManager = new SkillManager()
const cronManager = new CronManager()
const streamHandler = new StreamHandler()

let mainWindow: BrowserWindow | null = null

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
      preload: join(__dirname, '../preload/preload.js'),
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

  ipcMain.handle(IPC_CHANNELS.chat.listSessions, () => sessionManager.list())
  ipcMain.handle(IPC_CHANNELS.chat.createSession, () => sessionManager.create())
  ipcMain.handle(IPC_CHANNELS.provider.list, () => providerManager.list())
  ipcMain.handle(IPC_CHANNELS.skill.list, () => skillManager.list())
  ipcMain.handle(IPC_CHANNELS.cron.list, () => cronManager.list())

  ipcMain.handle(IPC_CHANNELS.chat.sendMessage, async (event, request: SendMessageRequest) => {
    const messageId = crypto.randomUUID()
    const reply = `已收到：${request.content}`

    for (const token of reply) {
      streamHandler.pushToken(event.sender, token)
      await new Promise((resolve) => setTimeout(resolve, 8))
    }

    streamHandler.pushDone(event.sender)

    return {
      messageId,
      accepted: true,
    }
  })
}

app.whenReady().then(() => {
  registerIpcHandlers()
  createMainWindow()

  app.on('activate', () => {
    if (!mainWindow) {
      createMainWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (!isMac) {
    app.quit()
  }
})
