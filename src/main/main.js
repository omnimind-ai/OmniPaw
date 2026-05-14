const { app, BrowserWindow, ipcMain, shell } = require('electron')
const path = require('node:path')
const catManager = require('./cat-manager')

const isMac = process.platform === 'darwin'
const isDev = !app.isPackaged

let mainWindow = null

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 920,
    minHeight: 620,
    title: 'OpenOmniClaw',
    backgroundColor: '#f4f1e8',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))

  mainWindow.once('ready-to-show', () => {
    mainWindow.show()

    if (isDev) {
      mainWindow.webContents.openDevTools({ mode: 'detach' })
    }
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.on('closed', () => {
    mainWindow = null

    if (!isMac) {
      catManager.cleanup()
    }
  })
}

app.whenReady().then(() => {
  ipcMain.handle('app:get-version', () => app.getVersion())

  catManager.registerIpcHandlers((payload) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('cat:status-changed', payload)
    }
  })

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
