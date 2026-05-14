const { app, BrowserWindow, ipcMain, screen, shell } = require('electron')
const path = require('node:path')

const isMac = process.platform === 'darwin'
const isDev = !app.isPackaged
const allowedPanelStates = new Set(['idle', 'preparing', 'running', 'completed'])
const allowedRendererStates = new Set([
  'hidden',
  'appearing',
  'idle',
  'dragging',
  'preparing',
  'running',
  'completed',
])

const catWindowSize = {
  width: 148,
  height: 132,
}
const catPanelSize = {
  width: 280,
  height: 280,
}
const catPanelGap = 10

let mainWindow = null
let catWindow = null
let catPanelWindow = null
let catSnapTimer = null
let catState = 'hidden'
let catVisible = false

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value)
}

function getCatDisplay(bounds) {
  return screen.getDisplayMatching(bounds)
}

function getInitialCatBounds() {
  const primaryDisplay = screen.getPrimaryDisplay()
  const workArea = primaryDisplay.workArea
  const x = workArea.x + workArea.width - Math.round(catWindowSize.width * 0.68)
  const y = workArea.y + Math.round((workArea.height - catWindowSize.height) / 2)

  return {
    width: catWindowSize.width,
    height: catWindowSize.height,
    x,
    y: clamp(y, workArea.y + 8, workArea.y + workArea.height - catWindowSize.height - 8),
  }
}

function constrainCatBounds(bounds) {
  const display = getCatDisplay(bounds)
  const workArea = display.workArea
  const minY = workArea.y + 8
  const maxY = workArea.y + workArea.height - bounds.height - 8

  return {
    ...bounds,
    y: clamp(bounds.y, minY, maxY),
  }
}

function broadcastCatStatus(extra = {}) {
  const payload = {
    state: catState,
    visible: catVisible,
    bounds: catWindow && !catWindow.isDestroyed() ? catWindow.getBounds() : null,
    ...extra,
  }

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('cat:status-changed', payload)
  }
}

function sendCatState(state, source = 'main') {
  if (!allowedRendererStates.has(state)) {
    return false
  }

  catState = state

  if (catWindow && !catWindow.isDestroyed()) {
    const send = () => {
      if (catWindow && !catWindow.isDestroyed()) {
        catWindow.webContents.send('cat:state-changed', { state, source })
      }
    }

    if (catWindow.webContents.isLoading()) {
      catWindow.webContents.once('did-finish-load', send)
    } else {
      send()
    }
  }

  broadcastCatStatus({ source })
  return true
}

function createCatWindow() {
  if (catWindow && !catWindow.isDestroyed()) {
    return catWindow
  }

  catWindow = new BrowserWindow({
    ...getInitialCatBounds(),
    title: 'OpenOmniClaw Cat',
    frame: false,
    transparent: true,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    show: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  catWindow.setAlwaysOnTop(true, 'floating')
  catWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  catWindow.loadFile(path.join(__dirname, '../renderer/cat-window.html'))

  catWindow.on('closed', () => {
    catWindow = null
    catVisible = false
    catState = 'hidden'
    broadcastCatStatus()
  })

  return catWindow
}

function showCatWindow() {
  const window = createCatWindow()
  catVisible = true

  if (!window.isVisible()) {
    window.showInactive()
  }

  sendCatState(catState === 'hidden' ? 'idle' : catState, 'show')
  return {
    ok: true,
    state: catState,
    visible: catVisible,
    bounds: window.getBounds(),
  }
}

function hideCatWindow() {
  if (catWindow && !catWindow.isDestroyed()) {
    catWindow.hide()
  }

  closeCatPanelWindow()

  catVisible = false
  catState = 'hidden'
  broadcastCatStatus({ source: 'hide' })

  return {
    ok: true,
    state: catState,
    visible: catVisible,
  }
}

function cancelCatSnapAnimation() {
  if (catSnapTimer) {
    clearInterval(catSnapTimer)
    catSnapTimer = null
  }
}

function animateCatBounds(targetBounds, duration = 260) {
  cancelCatSnapAnimation()

  if (!catWindow || catWindow.isDestroyed()) {
    return Promise.resolve(null)
  }

  const startBounds = catWindow.getBounds()
  const startedAt = Date.now()

  return new Promise((resolve) => {
    catSnapTimer = setInterval(() => {
      if (!catWindow || catWindow.isDestroyed()) {
        cancelCatSnapAnimation()
        resolve(null)
        return
      }

      const progress = clamp((Date.now() - startedAt) / duration, 0, 1)
      const eased = 1 - (1 - progress) ** 3
      const nextBounds = {
        width: startBounds.width,
        height: startBounds.height,
        x: Math.round(startBounds.x + (targetBounds.x - startBounds.x) * eased),
        y: Math.round(startBounds.y + (targetBounds.y - startBounds.y) * eased),
      }

      catWindow.setBounds(nextBounds)

      if (progress >= 1) {
        cancelCatSnapAnimation()
        catWindow.setBounds(targetBounds)
        broadcastCatStatus({ source: 'drag-end' })
        resolve(targetBounds)
      }
    }, 16)
  })
}

function getSnapTargetBounds() {
  if (!catWindow || catWindow.isDestroyed()) {
    return null
  }

  const bounds = catWindow.getBounds()
  const display = getCatDisplay(bounds)
  const workArea = display.workArea
  const centerX = bounds.x + bounds.width / 2
  const displayCenterX = workArea.x + workArea.width / 2
  const isRight = centerX > displayCenterX
  const targetX = isRight
    ? workArea.x + workArea.width - Math.round(bounds.width * 0.68)
    : workArea.x - Math.round(bounds.width * 0.32)

  return constrainCatBounds({
    ...bounds,
    x: targetX,
  })
}

function closeCatPanelWindow() {
  if (catPanelWindow && !catPanelWindow.isDestroyed()) {
    catPanelWindow.close()
  }
}

function getCatPanelPlacement(catBounds) {
  const display = getCatDisplay(catBounds)
  const workArea = display.workArea
  const leftSpace = catBounds.x - workArea.x - catPanelGap
  const rightSpace = workArea.x + workArea.width - (catBounds.x + catBounds.width) - catPanelGap
  const side = rightSpace >= catPanelSize.width || rightSpace >= leftSpace ? 'right' : 'left'
  const preferredX =
    side === 'right'
      ? catBounds.x + catBounds.width + catPanelGap
      : catBounds.x - catPanelSize.width - catPanelGap
  const centeredY = catBounds.y + Math.round((catBounds.height - catPanelSize.height) / 2)

  return {
    side,
    bounds: {
      width: catPanelSize.width,
      height: catPanelSize.height,
      x: clamp(preferredX, workArea.x + 8, workArea.x + workArea.width - catPanelSize.width - 8),
      y: clamp(centeredY, workArea.y + 8, workArea.y + workArea.height - catPanelSize.height - 8),
    },
  }
}

function createCatPanelWindow(placement) {
  if (catPanelWindow && !catPanelWindow.isDestroyed()) {
    return catPanelWindow
  }

  catPanelWindow = new BrowserWindow({
    ...placement.bounds,
    title: 'OpenOmniClaw Cat Panel',
    frame: false,
    transparent: true,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    show: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  catPanelWindow.setAlwaysOnTop(true, 'floating')
  catPanelWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  catPanelWindow.loadFile(path.join(__dirname, '../renderer/cat-panel.html'))

  catPanelWindow.on('closed', () => {
    catPanelWindow = null
    broadcastCatStatus({ panelVisible: false, source: 'cat-panel' })
  })

  return catPanelWindow
}

function toggleCatPanelWindow() {
  if (!catWindow || catWindow.isDestroyed() || !catWindow.isVisible()) {
    return {
      ok: false,
      error: 'Cat window is not visible',
    }
  }

  if (catPanelWindow && !catPanelWindow.isDestroyed() && catPanelWindow.isVisible()) {
    closeCatPanelWindow()

    return {
      ok: true,
      visible: false,
    }
  }

  const placement = getCatPanelPlacement(catWindow.getBounds())
  const panelWindow = createCatPanelWindow(placement)
  panelWindow.setBounds(placement.bounds)

  const sendPlacement = () => {
    if (catPanelWindow && !catPanelWindow.isDestroyed()) {
      catPanelWindow.webContents.send('cat-panel:placement', placement)
    }
  }

  if (panelWindow.webContents.isLoading()) {
    panelWindow.webContents.once('did-finish-load', sendPlacement)
  } else {
    sendPlacement()
  }

  panelWindow.showInactive()
  broadcastCatStatus({ panelVisible: true, panelSide: placement.side, source: 'cat-panel' })

  return {
    ok: true,
    visible: true,
    side: placement.side,
    bounds: placement.bounds,
  }
}

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

    if (!isMac && catWindow && !catWindow.isDestroyed()) {
      catWindow.close()
    }

    closeCatPanelWindow()
  })
}

app.whenReady().then(() => {
  ipcMain.handle('app:get-version', () => app.getVersion())
  ipcMain.handle('cat:show', () => showCatWindow())
  ipcMain.handle('cat:hide', () => hideCatWindow())
  ipcMain.handle('cat:toggle-panel', () => toggleCatPanelWindow())
  ipcMain.handle('cat:set-state', (_event, state) => {
    if (!allowedPanelStates.has(state)) {
      return {
        ok: false,
        error: 'Invalid cat state',
        state: catState,
        visible: catVisible,
      }
    }

    showCatWindow()
    sendCatState(state, 'panel')

    return {
      ok: true,
      state,
      visible: catVisible,
      bounds: catWindow && !catWindow.isDestroyed() ? catWindow.getBounds() : null,
    }
  })
  ipcMain.handle('cat:drag-start', () => {
    cancelCatSnapAnimation()
    closeCatPanelWindow()

    if (!catWindow || catWindow.isDestroyed()) {
      return null
    }

    return catWindow.getBounds()
  })
  ipcMain.handle('cat:drag-move', (_event, payload = {}) => {
    if (
      !catWindow ||
      catWindow.isDestroyed() ||
      !payload.startBounds ||
      !isFiniteNumber(payload.startBounds.x) ||
      !isFiniteNumber(payload.startBounds.y) ||
      !isFiniteNumber(payload.startBounds.width) ||
      !isFiniteNumber(payload.startBounds.height) ||
      !isFiniteNumber(payload.deltaX) ||
      !isFiniteNumber(payload.deltaY)
    ) {
      return null
    }

    const nextBounds = constrainCatBounds({
      width: Math.round(payload.startBounds.width),
      height: Math.round(payload.startBounds.height),
      x: Math.round(payload.startBounds.x + payload.deltaX),
      y: Math.round(payload.startBounds.y + payload.deltaY),
    })

    catWindow.setBounds(nextBounds)
    broadcastCatStatus({ source: 'drag-move' })

    return nextBounds
  })
  ipcMain.handle('cat:drag-end', async () => {
    const targetBounds = getSnapTargetBounds()

    if (!targetBounds) {
      return null
    }

    return animateCatBounds(targetBounds)
  })
  ipcMain.on('cat:renderer-state', (_event, state) => {
    if (!allowedRendererStates.has(state)) {
      return
    }

    catState = state
    catVisible = state !== 'hidden' && !!catWindow && !catWindow.isDestroyed() && catWindow.isVisible()
    broadcastCatStatus({ source: 'cat-window' })
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
