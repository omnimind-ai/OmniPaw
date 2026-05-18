import { join } from 'node:path'

import { IPC_CHANNELS } from '@shared/constants'
import type {
  CatBounds,
  CatCommandEvent,
  CatDragPayload,
  CatPanelPlacement,
  CatPanelToggleResult,
  CatStatus,
  CatTaskState,
  CatWindowState,
} from '@shared/types/cat'
import { BrowserWindow, ipcMain, screen } from 'electron'

const allowedTaskStates = new Set<CatTaskState>(['idle', 'preparing', 'running', 'completed'])
const allowedWindowStates = new Set<CatWindowState>([
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
  width: 376,
  height: 360,
}

const catPanelGap = 2
const catPanelCardInset = 20

const catStageVisualBounds = {
  x: 31,
  y: 36,
  width: 86,
  height: 86,
}

let catWindow: BrowserWindow | null = null
let catPanelWindow: BrowserWindow | null = null
let catSnapTimer: ReturnType<typeof setInterval> | null = null
let catState: CatWindowState = 'hidden'
let catVisible = false
let catPanelVisible = false
let catPanelSide: CatPanelPlacement['side'] | null = null

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function getDisplay(bounds: CatBounds) {
  return screen.getDisplayMatching(bounds)
}

function resolveRendererEntry(entryName: string): string {
  const devUrl = process.env.ELECTRON_RENDERER_URL
  if (devUrl) {
    return new URL(entryName, devUrl).toString()
  }

  return join(__dirname, '../renderer', entryName)
}

function loadRendererEntry(window: BrowserWindow, entryName: string): void {
  const entry = resolveRendererEntry(entryName)
  if (entry.startsWith('http://') || entry.startsWith('https://')) {
    void window.loadURL(entry)
    return
  }

  void window.loadFile(entry)
}

function getInitialCatBounds(): CatBounds {
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

function constrainCatBounds(bounds: CatBounds): CatBounds {
  const display = getDisplay(bounds)
  const workArea = display.workArea
  const minY = workArea.y + 8
  const maxY = workArea.y + workArea.height - bounds.height - 8

  return {
    ...bounds,
    y: clamp(bounds.y, minY, maxY),
  }
}

function getCatStatus(extra: Partial<CatStatus> = {}): CatStatus {
  return {
    state: catState,
    visible: catVisible,
    bounds: catWindow && !catWindow.isDestroyed() ? catWindow.getBounds() : null,
    panelVisible: catPanelVisible,
    panelSide: catPanelSide,
    ...extra,
  }
}

function sendCatCommand(state: CatWindowState, source = 'main'): void {
  if (!allowedWindowStates.has(state)) {
    return
  }

  catState = state

  if (catWindow && !catWindow.isDestroyed()) {
    const payload: CatCommandEvent = {
      state,
      source,
    }

    const send = () => {
      if (catWindow && !catWindow.isDestroyed()) {
        catWindow.webContents.send(IPC_CHANNELS.cat.commandState, payload)
      }
    }

    if (catWindow.webContents.isLoading()) {
      catWindow.webContents.once('did-finish-load', send)
    } else {
      send()
    }
  }
}

function reportCatState(state: CatWindowState): void {
  if (!allowedWindowStates.has(state)) {
    return
  }

  catState = state
  catVisible =
    state !== 'hidden' && !!catWindow && !catWindow.isDestroyed() && catWindow.isVisible()
}

function createCatWindow(): BrowserWindow {
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
      preload: join(__dirname, '../preload/preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  catWindow.setAlwaysOnTop(true, 'floating')
  catWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  loadRendererEntry(catWindow, 'cat-window.html')

  catWindow.on('closed', () => {
    cancelCatSnapAnimation()
    catWindow = null
    catVisible = false
    catState = 'hidden'
    closeCatPanelWindow()
  })

  return catWindow
}

function createCatPanelWindow(placement: CatPanelPlacement): BrowserWindow {
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
      preload: join(__dirname, '../preload/preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  catPanelWindow.setAlwaysOnTop(true, 'floating')
  catPanelWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  loadRendererEntry(catPanelWindow, 'cat-panel.html')

  catPanelWindow.on('closed', () => {
    catPanelWindow = null
    catPanelVisible = false
    catPanelSide = null
  })

  return catPanelWindow
}

function closeCatPanelWindow(): void {
  if (catPanelWindow && !catPanelWindow.isDestroyed()) {
    catPanelVisible = false
    catPanelSide = null
    catPanelWindow.close()
  }
}

function cancelCatSnapAnimation(): void {
  if (catSnapTimer) {
    clearInterval(catSnapTimer)
    catSnapTimer = null
  }
}

function getSnapTargetBounds(): CatBounds | null {
  if (!catWindow || catWindow.isDestroyed()) {
    return null
  }

  const bounds = catWindow.getBounds()
  const display = getDisplay(bounds)
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

function animateCatBounds(targetBounds: CatBounds, duration = 260): Promise<CatBounds | null> {
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
      const nextBounds: CatBounds = {
        width: startBounds.width,
        height: startBounds.height,
        x: Math.round(startBounds.x + (targetBounds.x - startBounds.x) * eased),
        y: Math.round(startBounds.y + (targetBounds.y - startBounds.y) * eased),
      }

      catWindow.setBounds(nextBounds)

      if (progress >= 1) {
        cancelCatSnapAnimation()
        catWindow.setBounds(targetBounds)
        resolve(targetBounds)
      }
    }, 16)
  })
}

function getCatPanelPlacement(catBounds: CatBounds): CatPanelPlacement {
  const display = getDisplay(catBounds)
  const workArea = display.workArea
  const visibleCatBounds: CatBounds = {
    width: catStageVisualBounds.width,
    height: catStageVisualBounds.height,
    x: catBounds.x + catStageVisualBounds.x,
    y: catBounds.y + catStageVisualBounds.y,
  }
  const leftSpace = visibleCatBounds.x - workArea.x - catPanelGap
  const rightSpace =
    workArea.x + workArea.width - (visibleCatBounds.x + visibleCatBounds.width) - catPanelGap
  const requiredPanelSpace = catPanelSize.width - catPanelCardInset
  const side: CatPanelPlacement['side'] =
    rightSpace >= requiredPanelSpace || rightSpace >= leftSpace ? 'right' : 'left'
  const preferredX =
    side === 'right'
      ? visibleCatBounds.x + visibleCatBounds.width + catPanelGap - catPanelCardInset
      : visibleCatBounds.x - (catPanelSize.width - catPanelCardInset) - catPanelGap
  const centeredY =
    visibleCatBounds.y + Math.round((visibleCatBounds.height - catPanelSize.height) / 2)

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

function ensureCatWindow(): BrowserWindow {
  return createCatWindow()
}

function showCatWindow(): CatStatus {
  const window = ensureCatWindow()
  catVisible = true

  if (!window.isVisible()) {
    window.showInactive()
  }

  if (catState === 'hidden') {
    sendCatCommand('idle', 'show')
  } else {
    sendCatCommand(catState, 'show')
  }

  return getCatStatus()
}

function hideCatWindow(): CatStatus {
  if (catWindow && !catWindow.isDestroyed()) {
    sendCatCommand('hidden', 'hide')
    catWindow.hide()
  }

  closeCatPanelWindow()

  catVisible = false
  catState = 'hidden'

  return getCatStatus({ state: 'hidden', visible: false })
}

function toggleCatVisibility(): CatStatus {
  if (catWindow && !catWindow.isDestroyed() && catWindow.isVisible()) {
    return hideCatWindow()
  }

  return showCatWindow()
}

function setCatState(state: CatTaskState): CatStatus {
  if (!allowedTaskStates.has(state)) {
    return getCatStatus()
  }

  const window = ensureCatWindow()
  catVisible = true

  if (!window.isVisible()) {
    window.showInactive()
  }

  sendCatCommand(state, 'panel')
  return getCatStatus({ state, visible: true })
}

function toggleCatPanelWindow(): CatPanelToggleResult {
  if (!catWindow || catWindow.isDestroyed() || !catWindow.isVisible()) {
    return {
      visible: false,
    }
  }

  if (catPanelWindow && !catPanelWindow.isDestroyed() && catPanelWindow.isVisible()) {
    closeCatPanelWindow()
    catPanelVisible = false
    catPanelSide = null

    return {
      visible: false,
    }
  }

  const placement = getCatPanelPlacement(catWindow.getBounds())
  const panelWindow = createCatPanelWindow(placement)
  panelWindow.setBounds(placement.bounds)

  const sendPlacement = () => {
    if (catPanelWindow && !catPanelWindow.isDestroyed()) {
      catPanelWindow.webContents.send(IPC_CHANNELS.catPanel.placement, placement)
    }
  }

  if (panelWindow.webContents.isLoading()) {
    panelWindow.webContents.once('did-finish-load', sendPlacement)
  } else {
    sendPlacement()
  }

  panelWindow.showInactive()
  catPanelVisible = true
  catPanelSide = placement.side

  return {
    visible: true,
    side: placement.side,
    bounds: placement.bounds,
  }
}

function dragStart(): CatBounds | null {
  cancelCatSnapAnimation()
  closeCatPanelWindow()

  if (!catWindow || catWindow.isDestroyed()) {
    return null
  }

  return catWindow.getBounds()
}

function dragMove(payload: CatDragPayload): CatBounds | null {
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
  return nextBounds
}

async function dragEnd(): Promise<CatBounds | null> {
  const targetBounds = getSnapTargetBounds()
  if (!targetBounds) {
    return null
  }

  return animateCatBounds(targetBounds)
}

function registerCatWindowIpcHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.cat.show, () => showCatWindow())
  ipcMain.handle(IPC_CHANNELS.cat.hide, () => hideCatWindow())
  ipcMain.handle(IPC_CHANNELS.cat.toggleVisibility, () => toggleCatVisibility())
  ipcMain.handle(IPC_CHANNELS.cat.setState, (_event, state: CatTaskState) => setCatState(state))
  ipcMain.handle(IPC_CHANNELS.cat.togglePanel, () => toggleCatPanelWindow())
  ipcMain.handle(IPC_CHANNELS.cat.dragStart, () => dragStart())
  ipcMain.handle(IPC_CHANNELS.cat.dragMove, (_event, payload: CatDragPayload) => dragMove(payload))
  ipcMain.handle(IPC_CHANNELS.cat.dragEnd, () => dragEnd())
  ipcMain.on(IPC_CHANNELS.cat.reportState, (_event, state: CatWindowState) => {
    reportCatState(state)
  })
}

export {
  closeCatPanelWindow,
  dragEnd,
  dragMove,
  dragStart,
  hideCatWindow,
  registerCatWindowIpcHandlers,
  setCatState,
  showCatWindow,
  toggleCatPanelWindow,
  toggleCatVisibility,
}
