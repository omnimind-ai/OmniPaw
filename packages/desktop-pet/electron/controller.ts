import { join } from 'node:path'

import type { Logger } from '@core/logging'
import { IPC_CHANNELS } from '@shared/constants'
import type {
  CatBounds,
  CatBubbleDismissRequest,
  CatBubbleEvent,
  CatBubbleShowRequest,
  CatCommandEvent,
  CatDraftAttachment,
  CatDraftChangedEvent,
  CatDraftClearRequest,
  CatDraftRequest,
  CatDraftStageRequest,
  CatDraftState,
  CatDragPayload,
  CatHitArea,
  CatInteractionState,
  CatPanelActiveSessionState,
  CatPanelOpenRequest,
  CatPanelPlacement,
  CatPanelSetActiveSessionRequest,
  CatPanelToggleResult,
  CatStatus,
  CatTaskState,
  CatWindowState,
} from '@shared/types/cat'
import {
  CAT_PET_GIFT_IMAGE_DATA_URL_MAX_LENGTH,
  type CatPetGiftImage,
  type CatPetGiftUnlock,
} from '@shared/types/cat-pet'
import type { ObservationReactionEvent } from '@shared/types/observation'
import { app, BrowserWindow, ipcMain, screen } from 'electron'
import { applyMacDockIcon, createAppIconImage } from './app-icon'

type CatSessionIdResolver = (
  preferredSessionId?: string | null
) => string | null | Promise<string | null>

interface OpenCatPanelOptions {
  sessionId?: string | null
  source?: string
  activate?: boolean
}

interface StageCatDraftAttachmentsInput {
  sessionId?: string | null
  attachments?: unknown[]
  replace?: boolean
  source?: string
}

interface ClearCatDraftInput {
  sessionId?: string | null
  attachmentIds?: string[]
  source?: string
}

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
  width: 116,
  height: 116,
}

const catEdgeOverflow = 16

const catPanelSize = {
  width: 420,
  height: 560,
}

const catBubbleSize = {
  width: 320,
  height: 116,
}

const catPanelGap = 2
const catPanelCardInset = 20
const catBubbleCardInset = 14
const catBubbleAutoDismissMs = 7_000

const catStageVisualBounds = {
  x: 0,
  y: 0,
  width: 116,
  height: 116,
}

const defaultCatHitArea: CatHitArea = {
  x: 15,
  y: 30,
  width: 86,
  height: 86,
}

const isDarwin = process.platform === 'darwin'
const isWindows = process.platform === 'win32'
const shouldSkipFloatingWindowTaskbar = true
const catTopmostLevel: Parameters<BrowserWindow['setAlwaysOnTop']>[1] = isWindows
  ? 'pop-up-menu'
  : isDarwin
    ? 'screen-saver'
    : 'floating'
const catTopmostWatchdogMs = 5_000

let catWindow: BrowserWindow | null = null
let catHitWindow: BrowserWindow | null = null
let catPanelWindow: BrowserWindow | null = null
let catBubbleWindow: BrowserWindow | null = null
let catSnapTimer: ReturnType<typeof setInterval> | null = null
let catTopmostWatchdog: ReturnType<typeof setInterval> | null = null
let catHitArea: CatHitArea = { ...defaultCatHitArea }
let catHitLocked = false
let catDragSnapshot: {
  cursor: Electron.Point
  bounds: CatBounds
  moved: boolean
} | null = null
let catState: CatWindowState = 'hidden'
let catVisible = false
let lastKnownCatTaskState: CatTaskState | null = null
let catPanelVisible = false
let catPanelSide: CatPanelPlacement['side'] | null = null
let catBubbleVisible = false
let activeCatBubbleEvent: CatBubbleEvent | null = null
let catLogger: Logger | undefined
let activeCatSessionId: string | null = null
let activeCatSessionUpdatedAt = Date.now()
let catSessionIdResolver: CatSessionIdResolver | undefined
const catDrafts = new Map<string, CatDraftState>()

function setCatWindowLogger(logger: Logger): void {
  catLogger = logger
}

function setCatSessionIdResolver(resolver: CatSessionIdResolver | undefined): void {
  catSessionIdResolver = resolver
}

function getCatBaseFloatingExtras(): Partial<Electron.BrowserWindowConstructorOptions> {
  return isDarwin ? { type: 'panel' } : {}
}

function getCatChildFloatingExtras(): Partial<Electron.BrowserWindowConstructorOptions> {
  if (!isDarwin) {
    return {}
  }
  const extras: Partial<Electron.BrowserWindowConstructorOptions> = { type: 'panel' }
  if (catWindow && !catWindow.isDestroyed()) {
    extras.parent = catWindow
  }
  return extras
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isCatTaskState(state: CatWindowState): state is CatTaskState {
  return allowedTaskStates.has(state as CatTaskState)
}

function normalizeIdentifier(value: unknown, maxLength = 160): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const normalized = value.trim()
  if (!normalized) {
    return null
  }

  return normalized.slice(0, maxLength)
}

function sanitizeBoundedText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }

  const normalized = value
    .replace(/\p{Cc}/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!normalized) {
    return undefined
  }

  return normalized.slice(0, maxLength)
}

function sanitizeFilename(value: unknown): string {
  const fallback = 'attachment'
  const bounded = sanitizeBoundedText(value, 180)
  if (!bounded) {
    return fallback
  }

  const filename = bounded.split(/[\\/]/).filter(Boolean).at(-1)
  return filename || fallback
}

function normalizeDraftAttachment(value: unknown): CatDraftAttachment | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const record = value as Record<string, unknown>
  const attachmentId = normalizeIdentifier(record.attachmentId ?? record.id)
  if (!attachmentId) {
    return null
  }

  const sizeBytes = isFiniteNumber(record.sizeBytes ?? record.size)
    ? Math.max(0, Math.floor(Number(record.sizeBytes ?? record.size)))
    : undefined
  const mimeType = sanitizeBoundedText(record.mimeType ?? record.type, 120)
  const kind = normalizeAttachmentKind(record.kind)

  return {
    attachmentId,
    attachment_id: attachmentId,
    filename: sanitizeFilename(record.filename ?? record.originalName ?? record.name),
    originalName: sanitizeFilename(record.originalName ?? record.name),
    ...(mimeType ? { mimeType } : {}),
    ...(sizeBytes !== undefined ? { sizeBytes } : {}),
    ...(kind ? { kind } : {}),
  }
}

function mergeDraftAttachments(
  existing: CatDraftAttachment[],
  incoming: CatDraftAttachment[]
): CatDraftAttachment[] {
  const byId = new Map<string, CatDraftAttachment>()
  for (const attachment of existing) {
    byId.set(attachment.attachmentId, attachment)
  }
  for (const attachment of incoming) {
    byId.set(attachment.attachmentId, attachment)
  }
  return [...byId.values()]
}

function normalizeAttachmentKind(value: unknown): CatDraftAttachment['kind'] | undefined {
  return value === 'image' ||
    value === 'audio' ||
    value === 'video' ||
    value === 'file' ||
    value === 'text'
    ? value
    : undefined
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

function applyCatFloatingWindowBehavior(window: BrowserWindow): void {
  window.setAlwaysOnTop(true, catTopmostLevel)
  window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
}

function guardCatAlwaysOnTop(window: BrowserWindow): void {
  if (!isWindows) {
    return
  }

  window.on('always-on-top-changed', (_event, isAlwaysOnTop) => {
    if (!isAlwaysOnTop && !window.isDestroyed()) {
      window.setAlwaysOnTop(true, catTopmostLevel)
    }
  })
}

function startCatTopmostWatchdog(): void {
  if (!isWindows || catTopmostWatchdog) {
    return
  }

  catTopmostWatchdog = setInterval(() => {
    for (const window of [catWindow, catHitWindow, catPanelWindow, catBubbleWindow]) {
      if (window && !window.isDestroyed() && window.isVisible()) {
        window.setAlwaysOnTop(true, catTopmostLevel)
      }
    }
  }, catTopmostWatchdogMs)
}

function stopCatTopmostWatchdog(): void {
  if (catTopmostWatchdog) {
    clearInterval(catTopmostWatchdog)
    catTopmostWatchdog = null
  }
}

function sendToCatPanel(channel: string, payload: unknown): void {
  if (!catPanelWindow || catPanelWindow.isDestroyed()) {
    return
  }

  const send = () => {
    if (catPanelWindow && !catPanelWindow.isDestroyed()) {
      catPanelWindow.webContents.send(channel, payload)
    }
  }

  if (catPanelWindow.webContents.isLoading()) {
    catPanelWindow.webContents.once('did-finish-load', send)
  } else {
    send()
  }
}

function sendToCatWindow(channel: string, payload: unknown): void {
  if (!catWindow || catWindow.isDestroyed()) {
    return
  }

  const send = () => {
    if (catWindow && !catWindow.isDestroyed()) {
      catWindow.webContents.send(channel, payload)
    }
  }

  if (catWindow.webContents.isLoading()) {
    catWindow.webContents.once('did-finish-load', send)
  } else {
    send()
  }
}

function sendToCatHitWindow(channel: string, payload: unknown): void {
  if (!catHitWindow || catHitWindow.isDestroyed()) {
    return
  }

  const send = () => {
    if (catHitWindow && !catHitWindow.isDestroyed()) {
      catHitWindow.webContents.send(channel, payload)
    }
  }

  if (catHitWindow.webContents.isLoading()) {
    catHitWindow.webContents.once('did-finish-load', send)
  } else {
    send()
  }
}

function sendToCatBubble(channel: string, payload: unknown): void {
  if (!catBubbleWindow || catBubbleWindow.isDestroyed()) {
    return
  }

  const send = () => {
    if (catBubbleWindow && !catBubbleWindow.isDestroyed()) {
      catBubbleWindow.webContents.send(channel, payload)
    }
  }

  if (catBubbleWindow.webContents.isLoading()) {
    catBubbleWindow.webContents.once('did-finish-load', send)
  } else {
    send()
  }
}

function sendCatPanelPlacement(placement: CatPanelPlacement): void {
  sendToCatPanel(IPC_CHANNELS.catPanel.placement, placement)
}

function sendCatBubblePlacement(placement: CatPanelPlacement): void {
  sendToCatBubble(IPC_CHANNELS.cat.bubblePlacement, placement)
}

function sendCatBubbleEvent(event: CatBubbleEvent): void {
  sendToCatBubble(IPC_CHANNELS.cat.bubbleEvent, event)
}

function syncCatBubbleWindowState(delayMs = 0): void {
  const sync = () => {
    if (
      !activeCatBubbleEvent ||
      !catBubbleWindow ||
      catBubbleWindow.isDestroyed() ||
      !catWindow ||
      catWindow.isDestroyed()
    ) {
      return
    }

    sendCatBubblePlacement(getCatBubblePlacement(catWindow.getBounds()))
    sendCatBubbleEvent(activeCatBubbleEvent)
  }

  if (delayMs > 0) {
    setTimeout(sync, delayMs)
    return
  }

  sync()
}

function sendCatObservationReaction(event: ObservationReactionEvent): void {
  showCatWindow()
  const reaction = sanitizeObservationReactionEvent(event)
  const request: CatBubbleShowRequest = {
    id: reaction.id,
    text: reaction.text,
    kind: 'observation',
    observationReaction: reaction,
    autoDismissMs: catBubbleAutoDismissMs,
    source: 'observation',
  }
  if (showCatBubble(request)) {
    return
  }

  const window = catWindow
  if (!window || window.isDestroyed()) {
    catLogger?.warn('Cat observation reaction dropped because cat window is unavailable.', {
      reactionId: reaction.id,
    })
    return
  }

  const retry = () => {
    if (!catWindow || catWindow.isDestroyed()) {
      return
    }
    if (!catWindow.isVisible()) {
      catWindow.showInactive()
    }
    const shown = showCatBubble(request)
    if (!shown) {
      catLogger?.warn('Cat observation reaction could not show bubble.', {
        reactionId: reaction.id,
        catVisible,
        catState,
      })
    }
  }

  if (window.webContents.isLoading()) {
    window.webContents.once('did-finish-load', () => {
      setTimeout(retry, 50)
    })
  } else {
    setTimeout(retry, 50)
  }
}

function notifyActiveCatSessionChanged(source = 'main'): void {
  const event: CatPanelActiveSessionState = {
    ...(activeCatSessionId ? { sessionId: activeCatSessionId } : {}),
    updatedAt: activeCatSessionUpdatedAt,
  }
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(IPC_CHANNELS.catPanel.activeSessionChanged, event)
  }
  catLogger?.debug('Active cat session changed.', {
    sessionId: activeCatSessionId,
    source,
  })
}

function notifyCatDraftChanged(snapshot: CatDraftState | null, source = 'main'): void {
  const sessionId = snapshot?.sessionId ?? activeCatSessionId ?? undefined
  const event: CatDraftChangedEvent = {
    ...(sessionId ? { sessionId } : {}),
    draft: snapshot,
    source,
    updatedAt: Date.now(),
  }
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(IPC_CHANNELS.catPanel.draftChanged, event)
  }
}

function getInitialCatBounds(): CatBounds {
  const primaryDisplay = screen.getPrimaryDisplay()
  const workArea = primaryDisplay.workArea
  const x = workArea.x + workArea.width - catWindowSize.width + catEdgeOverflow
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

function getCatWindowBounds(): CatBounds | null {
  return catWindow && !catWindow.isDestroyed() ? catWindow.getBounds() : null
}

function getActiveCatSessionId(): string | null {
  return activeCatSessionId
}

function setActiveCatSessionId(
  sessionId: string | null | undefined,
  source = 'main'
): string | null {
  const normalized = normalizeIdentifier(sessionId)
  if (activeCatSessionId === normalized) {
    return activeCatSessionId
  }

  activeCatSessionId = normalized
  activeCatSessionUpdatedAt = Date.now()
  notifyActiveCatSessionChanged(source)
  if (activeCatSessionId) {
    notifyCatDraftChanged(catDrafts.get(activeCatSessionId) ?? null, source)
  }
  return activeCatSessionId
}

async function ensureActiveCatSessionId(
  preferredSessionId?: string | null
): Promise<string | null> {
  const preferred = normalizeIdentifier(preferredSessionId)
  const fallback = preferred ?? activeCatSessionId

  if (catSessionIdResolver) {
    const resolved = normalizeIdentifier(await catSessionIdResolver(fallback))
    if (resolved) {
      return setActiveCatSessionId(resolved, preferred ? 'preferred' : 'resolver')
    }
  }

  if (fallback) {
    return setActiveCatSessionId(fallback, preferred ? 'preferred' : 'cached')
  }

  return null
}

function getCatDraftSnapshot(sessionId = activeCatSessionId): CatDraftState | null {
  const normalized = normalizeIdentifier(sessionId)
  if (!normalized) {
    return null
  }

  return catDrafts.get(normalized) ?? null
}

async function stageCatDraftAttachments(
  input: StageCatDraftAttachmentsInput
): Promise<CatDraftState | null> {
  const sessionId = await ensureActiveCatSessionId(input.sessionId)
  if (!sessionId) {
    catLogger?.warn('Unable to stage cat draft attachments without an active cat session.')
    return null
  }

  const incoming = (input.attachments ?? [])
    .map((attachment) => normalizeDraftAttachment(attachment))
    .filter((attachment): attachment is CatDraftAttachment => attachment !== null)

  const existing = catDrafts.get(sessionId)
  if (incoming.length === 0) {
    openCatPanelWindow({ sessionId, source: input.source ?? 'draft' })
    notifyCatDraftChanged(existing ?? null, input.source ?? 'draft')
    return existing ?? null
  }

  const snapshot: CatDraftState = {
    sessionId,
    attachments: (input.replace
      ? incoming
      : mergeDraftAttachments(existing?.attachments ?? [], incoming)
    ).slice(0, 12),
    updatedAt: Date.now(),
  }
  catDrafts.set(sessionId, snapshot)

  openCatPanelWindow({ sessionId, source: input.source ?? 'draft' })
  notifyCatDraftChanged(snapshot, input.source ?? 'draft')

  catLogger?.info('Cat draft attachments staged.', {
    sessionId,
    attachmentCount: incoming.length,
    totalAttachmentCount: snapshot.attachments.length,
    source: input.source,
  })
  return snapshot
}

function clearCatDraft(input: ClearCatDraftInput = {}): CatDraftState | null {
  const sessionId = normalizeIdentifier(input.sessionId) ?? activeCatSessionId
  if (!sessionId) {
    return null
  }

  const existing = catDrafts.get(sessionId)
  if (!existing) {
    notifyCatDraftChanged(null, input.source ?? 'clear')
    return null
  }

  const attachmentIds = new Set((input.attachmentIds ?? []).map((id) => normalizeIdentifier(id)))
  attachmentIds.delete(null)

  if (attachmentIds.size === 0) {
    catDrafts.delete(sessionId)
    notifyCatDraftChanged(null, input.source ?? 'clear')
    return null
  }

  const snapshot: CatDraftState = {
    sessionId,
    attachments: existing.attachments.filter(
      (attachment) => !attachmentIds.has(attachment.attachmentId)
    ),
    updatedAt: Date.now(),
  }

  if (snapshot.attachments.length === 0) {
    catDrafts.delete(sessionId)
    notifyCatDraftChanged(null, input.source ?? 'clear')
    return null
  }

  catDrafts.set(sessionId, snapshot)
  notifyCatDraftChanged(snapshot, input.source ?? 'clear')
  return snapshot
}

function sendCatCommand(state: CatWindowState, source = 'main'): void {
  if (!allowedWindowStates.has(state)) {
    return
  }

  catState = state

  const payload: CatCommandEvent = {
    state,
    source,
  }
  if (catWindow && !catWindow.isDestroyed()) {
    sendToCatWindow(IPC_CHANNELS.cat.commandState, payload)
  }
  if (catHitWindow && !catHitWindow.isDestroyed()) {
    sendToCatHitWindow(IPC_CHANNELS.cat.commandState, payload)
  }
}

function reportCatState(state: CatWindowState): void {
  if (!allowedWindowStates.has(state)) {
    return
  }

  catState = state
  if (isCatTaskState(state)) {
    lastKnownCatTaskState = state
  } else {
    lastKnownCatTaskState = null
  }
  catVisible =
    state !== 'hidden' && !!catWindow && !catWindow.isDestroyed() && catWindow.isVisible()

  if (activeCatBubbleEvent?.kind === 'status' && activeCatBubbleEvent.source === 'cat-window') {
    hideCatBubbleWindow({
      id: activeCatBubbleEvent.id,
      reason: 'state-hidden',
      source: 'cat-window',
    })
  }
}

function createCatWindow(): BrowserWindow {
  if (catWindow && !catWindow.isDestroyed()) {
    return catWindow
  }

  catWindow = new BrowserWindow({
    ...getInitialCatBounds(),
    title: 'OmniPaw Cat',
    icon: createAppIconImage(app),
    ...getCatBaseFloatingExtras(),
    frame: false,
    transparent: true,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: shouldSkipFloatingWindowTaskbar,
    alwaysOnTop: true,
    hasShadow: false,
    show: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: join(__dirname, '../preload/preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  })

  attachCatDiagnostics(catWindow, 'window')
  catWindow.setFocusable(false)
  catWindow.setIgnoreMouseEvents(true)
  applyCatFloatingWindowBehavior(catWindow)
  guardCatAlwaysOnTop(catWindow)
  loadRendererEntry(catWindow, 'cat-window.html')
  createCatHitWindow()
  startCatTopmostWatchdog()

  catWindow.on('closed', () => {
    cancelCatSnapAnimation()
    closeCatHitWindow()
    catWindow = null
    catVisible = false
    catState = 'hidden'
    lastKnownCatTaskState = null
    closeCatPanelWindow()
    closeCatBubbleWindow()
  })
  catWindow.on('show', () => {
    catVisible = true
    if (isDarwin) {
      applyMacDockIcon(app)
    }
  })
  catWindow.on('hide', () => {
    catVisible = false
    lastKnownCatTaskState = null
  })
  catWindow.webContents.on('did-finish-load', () => {
    if (isDarwin) {
      applyMacDockIcon(app)
    }
  })
  catWindow.on('move', () => {
    syncCatHitWindowBounds()
  })

  return catWindow
}

function createCatHitWindow(): BrowserWindow | null {
  if (catHitWindow && !catHitWindow.isDestroyed()) {
    return catHitWindow
  }
  if (!catWindow || catWindow.isDestroyed()) {
    return null
  }

  const bounds = resolveCatHitWindowBounds()
  catHitWindow = new BrowserWindow({
    ...bounds,
    title: 'OmniPaw Cat Input',
    icon: createAppIconImage(app),
    ...getCatBaseFloatingExtras(),
    frame: false,
    transparent: true,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: shouldSkipFloatingWindowTaskbar,
    alwaysOnTop: true,
    hasShadow: false,
    show: false,
    focusable: isWindows,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: join(__dirname, '../preload/preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  })

  attachCatDiagnostics(catHitWindow, 'hit-window')
  catHitWindow.setIgnoreMouseEvents(false)
  applyCatFloatingWindowBehavior(catHitWindow)
  guardCatAlwaysOnTop(catHitWindow)
  applyCatHitWindowShape(catHitWindow, bounds)
  loadRendererEntry(catHitWindow, 'cat-hit-window.html')

  catHitWindow.on('closed', () => {
    catHitWindow = null
    catHitLocked = false
    catDragSnapshot = null
  })

  return catHitWindow
}

function resolveCatHitWindowBounds(): CatBounds {
  const catBounds =
    catWindow && !catWindow.isDestroyed() ? catWindow.getBounds() : getInitialCatBounds()
  return {
    x: Math.round(catBounds.x + catHitArea.x),
    y: Math.round(catBounds.y + catHitArea.y),
    width: Math.max(8, Math.round(catHitArea.width)),
    height: Math.max(8, Math.round(catHitArea.height)),
  }
}

function applyCatHitWindowShape(window: BrowserWindow, bounds: CatBounds): void {
  if (isDarwin) {
    return
  }
  try {
    window.setShape([{ x: 0, y: 0, width: bounds.width, height: bounds.height }])
  } catch (error) {
    catLogger?.debug('Unable to apply native cat hit window shape.', { error })
  }
}

function syncCatHitWindowBounds(force = false): void {
  if (catHitLocked && !force) {
    return
  }
  if (!catHitWindow || catHitWindow.isDestroyed() || !catWindow || catWindow.isDestroyed()) {
    return
  }

  const bounds = resolveCatHitWindowBounds()
  catHitWindow.setBounds(bounds)
  applyCatHitWindowShape(catHitWindow, bounds)
}

function closeCatHitWindow(): void {
  catHitLocked = false
  catDragSnapshot = null
  if (catHitWindow && !catHitWindow.isDestroyed()) {
    catHitWindow.close()
  }
}

function createCatPanelWindow(placement: CatPanelPlacement): BrowserWindow {
  if (catPanelWindow && !catPanelWindow.isDestroyed()) {
    return catPanelWindow
  }

  catPanelWindow = new BrowserWindow({
    ...placement.bounds,
    title: 'OmniPaw Cat Panel',
    icon: createAppIconImage(app),
    ...getCatChildFloatingExtras(),
    frame: false,
    transparent: true,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: shouldSkipFloatingWindowTaskbar,
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

  attachCatDiagnostics(catPanelWindow, 'panel')
  applyCatFloatingWindowBehavior(catPanelWindow)
  guardCatAlwaysOnTop(catPanelWindow)
  loadRendererEntry(catPanelWindow, 'cat-panel.html')

  catPanelWindow.on('closed', () => {
    catPanelWindow = null
    catPanelVisible = false
    catPanelSide = null
  })
  catPanelWindow.on('show', () => {
    catPanelVisible = true
    if (isDarwin) {
      applyMacDockIcon(app)
    }
  })
  catPanelWindow.on('hide', () => {
    catPanelVisible = false
  })
  catPanelWindow.webContents.on('did-finish-load', () => {
    if (isDarwin) {
      applyMacDockIcon(app)
    }
  })

  return catPanelWindow
}

function createCatBubbleWindow(placement: CatPanelPlacement): BrowserWindow {
  if (catBubbleWindow && !catBubbleWindow.isDestroyed()) {
    return catBubbleWindow
  }

  catBubbleWindow = new BrowserWindow({
    ...placement.bounds,
    title: 'OmniPaw Cat Bubble',
    icon: createAppIconImage(app),
    ...getCatChildFloatingExtras(),
    frame: false,
    transparent: true,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: shouldSkipFloatingWindowTaskbar,
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

  attachCatDiagnostics(catBubbleWindow, 'bubble')
  applyCatFloatingWindowBehavior(catBubbleWindow)
  guardCatAlwaysOnTop(catBubbleWindow)
  loadRendererEntry(catBubbleWindow, 'cat-bubble.html')

  catBubbleWindow.on('closed', () => {
    catBubbleWindow = null
    catBubbleVisible = false
    activeCatBubbleEvent = null
  })
  catBubbleWindow.webContents.on('did-finish-load', () => {
    if (isDarwin) {
      applyMacDockIcon(app)
    }
  })

  return catBubbleWindow
}

function attachCatDiagnostics(window: BrowserWindow, windowName: string): void {
  const logger = catLogger?.child({ scope: windowName })
  window.webContents.on('preload-error', (_event, preloadPath, error) => {
    logger?.error('Cat preload script failed.', { preloadPath, error })
  })
  window.webContents.on('render-process-gone', (_event, details) => {
    const context = {
      reason: details.reason,
      exitCode: details.exitCode,
    }
    if (details.reason === 'clean-exit') {
      logger?.info('Cat renderer process ended.', context)
      return
    }
    logger?.error('Cat renderer process ended.', context)
  })
  window.webContents.on('unresponsive', () => {
    logger?.warn('Cat window became unresponsive.')
  })
}

function closeCatPanelWindow(): void {
  catPanelVisible = false
  catPanelSide = null

  if (catPanelWindow && !catPanelWindow.isDestroyed()) {
    catPanelWindow.close()
  }
}

function hideCatBubbleWindow(request: CatBubbleDismissRequest | string = {}): void {
  const dismissRequest = normalizeCatBubbleDismissRequest(request)
  if (dismissRequest.id && activeCatBubbleEvent && dismissRequest.id !== activeCatBubbleEvent.id) {
    return
  }

  const hiddenEvent = activeCatBubbleEvent
    ? {
        ...activeCatBubbleEvent,
        visible: false,
      }
    : null

  activeCatBubbleEvent = null
  catBubbleVisible = false

  if (hiddenEvent) {
    sendCatBubbleEvent(hiddenEvent)
  }

  if (catBubbleWindow && !catBubbleWindow.isDestroyed()) {
    catBubbleWindow.close()
  }
}

function closeCatBubbleWindow(): void {
  activeCatBubbleEvent = null
  catBubbleVisible = false

  if (catBubbleWindow && !catBubbleWindow.isDestroyed()) {
    catBubbleWindow.close()
  }
}

function closeCatWindow(): void {
  cancelCatSnapAnimation()
  stopCatTopmostWatchdog()
  closeCatHitWindow()
  closeCatPanelWindow()
  closeCatBubbleWindow()

  catVisible = false
  catState = 'hidden'
  lastKnownCatTaskState = null

  if (catWindow && !catWindow.isDestroyed()) {
    catWindow.close()
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
    ? workArea.x + workArea.width - bounds.width + catEdgeOverflow
    : workArea.x - catEdgeOverflow

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
      repositionCatBubbleWindow()

      if (progress >= 1) {
        cancelCatSnapAnimation()
        catWindow.setBounds(targetBounds)
        repositionCatBubbleWindow()
        resolve(targetBounds)
      }
    }, 16)
  })
}

function getCatAnchoredPlacement(
  catBounds: CatBounds,
  size: { width: number; height: number },
  cardInset: number
): CatPanelPlacement {
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
  const requiredPanelSpace = size.width - cardInset
  const side: CatPanelPlacement['side'] =
    rightSpace >= requiredPanelSpace || rightSpace >= leftSpace ? 'right' : 'left'
  const preferredX =
    side === 'right'
      ? visibleCatBounds.x + visibleCatBounds.width + catPanelGap - cardInset
      : visibleCatBounds.x - (size.width - cardInset) - catPanelGap
  const centeredY = visibleCatBounds.y + Math.round((visibleCatBounds.height - size.height) / 2)

  return {
    side,
    bounds: {
      width: size.width,
      height: size.height,
      x: clamp(preferredX, workArea.x + 8, workArea.x + workArea.width - size.width - 8),
      y: clamp(centeredY, workArea.y + 8, workArea.y + workArea.height - size.height - 8),
    },
  }
}

function getCatPanelPlacement(catBounds: CatBounds): CatPanelPlacement {
  return getCatAnchoredPlacement(catBounds, catPanelSize, catPanelCardInset)
}

function getCatBubblePlacement(catBounds: CatBounds): CatPanelPlacement {
  return getCatAnchoredPlacement(catBounds, catBubbleSize, catBubbleCardInset)
}

function repositionCatBubbleWindow(): void {
  if (
    !catBubbleVisible ||
    !catBubbleWindow ||
    catBubbleWindow.isDestroyed() ||
    !catWindow ||
    catWindow.isDestroyed()
  ) {
    return
  }

  const placement = getCatBubblePlacement(catWindow.getBounds())
  catBubbleWindow.setBounds(placement.bounds)
  sendCatBubblePlacement(placement)
}

function normalizeCatBubbleDismissRequest(
  request: CatBubbleDismissRequest | string | undefined
): CatBubbleDismissRequest {
  if (!request) {
    return {}
  }

  if (typeof request === 'string') {
    return { id: normalizeIdentifier(request) ?? undefined }
  }

  return {
    ...(request.id ? { id: normalizeIdentifier(request.id) ?? undefined } : {}),
    ...(request.reason ? { reason: request.reason } : {}),
    ...(request.source ? { source: sanitizeBoundedText(request.source, 80) } : {}),
  }
}

function normalizeCatBubbleShowRequest(
  request: CatBubbleShowRequest | string
): CatBubbleEvent | null {
  const input: CatBubbleShowRequest = typeof request === 'string' ? { text: request } : request
  const gift = input.gift ? sanitizeCatPetGiftUnlock(input.gift) : undefined
  const kind =
    input.kind === 'observation' || input.observationReaction
      ? 'observation'
      : input.kind === 'gift' || gift
        ? 'gift'
        : 'status'
  const text =
    sanitizeBoundedText(input.text, kind === 'status' ? 80 : 180) ??
    (gift ? sanitizeBoundedText(gift.gift.storyLines[0] ?? gift.gift.name, 180) : undefined)
  if (!text) {
    return null
  }

  const observationReaction = input.observationReaction
    ? sanitizeObservationReactionEvent(input.observationReaction)
    : undefined

  return {
    id: normalizeIdentifier(input.id) ?? observationReaction?.id ?? crypto.randomUUID(),
    text,
    kind,
    visible: true,
    ...(observationReaction ? { observationReaction } : {}),
    ...(gift ? { gift } : {}),
    ...(isFiniteNumber(input.autoDismissMs)
      ? { autoDismissMs: clamp(Math.round(Number(input.autoDismissMs)), 1_000, 60_000) }
      : {}),
    ...(input.source ? { source: sanitizeBoundedText(input.source, 80) } : {}),
    createdAt: Date.now(),
  }
}

function showCatBubble(request: CatBubbleShowRequest | string): CatBubbleEvent | null {
  if (!catWindow || catWindow.isDestroyed()) {
    return null
  }

  const event = normalizeCatBubbleShowRequest(request)
  if (!event) {
    hideCatBubbleWindow({ reason: 'state-hidden', source: 'show-empty' })
    return null
  }
  if (catPanelVisible && event.kind === 'status') {
    return null
  }
  if (activeCatBubbleEvent?.kind === 'observation' && event.kind === 'status') {
    return null
  }

  const placement = getCatBubblePlacement(catWindow.getBounds())
  const window = createCatBubbleWindow(placement)
  if (!catWindow.isVisible()) {
    catVisible = true
    catWindow.showInactive()
  }
  window.setBounds(placement.bounds)
  window.setIgnoreMouseEvents(event.kind !== 'observation' && event.kind !== 'gift', {
    forward: true,
  })

  activeCatBubbleEvent = event
  catBubbleVisible = true

  sendCatBubblePlacement(placement)
  sendCatBubbleEvent(event)

  if (!window.isVisible()) {
    window.showInactive()
  }

  return event
}

function showCatWindowBubble(request: CatBubbleShowRequest | string): CatBubbleEvent | null {
  return showCatBubble(request)
}

function restoreMacApplicationVisibility(activate = false): void {
  if (process.platform !== 'darwin') {
    return
  }

  try {
    app.setActivationPolicy('regular')
  } catch (error) {
    catLogger?.warn('Unable to restore macOS activation policy.', { error })
  }

  try {
    applyMacDockIcon(app)
    if (app.dock && !app.dock.isVisible()) {
      void app.dock
        .show()
        .then(() => applyMacDockIcon(app))
        .catch((error) => {
          catLogger?.warn('Unable to show macOS Dock icon.', { error })
        })
    }
  } catch (error) {
    catLogger?.warn('Unable to request macOS Dock visibility.', { error })
  }

  if (activate) {
    try {
      app.focus({ steal: true })
    } catch (error) {
      catLogger?.warn('Unable to focus macOS application.', { error })
    }
  }
}

function ensureCatWindow(): BrowserWindow {
  return createCatWindow()
}

function showCatWindow(): CatStatus {
  const existingWindow = catWindow
  const wasHidden = !existingWindow || existingWindow.isDestroyed() || !existingWindow.isVisible()
  if (wasHidden) {
    restoreMacApplicationVisibility()
  }
  const window = ensureCatWindow()
  catVisible = true

  if (!window.isVisible()) {
    window.showInactive()
  }
  const hitWindow = createCatHitWindow()
  syncCatHitWindowBounds(true)
  if (hitWindow && !hitWindow.isVisible()) {
    hitWindow.showInactive()
  }
  startCatTopmostWatchdog()

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
  if (catHitWindow && !catHitWindow.isDestroyed()) {
    catHitWindow.hide()
  }

  closeCatPanelWindow()
  hideCatBubbleWindow({ reason: 'cat-hidden', source: 'main' })

  catVisible = false
  catState = 'hidden'
  lastKnownCatTaskState = null

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
  const alreadyVisible = window.isVisible()

  if (alreadyVisible && state === lastKnownCatTaskState) {
    return getCatStatus({ state, visible: true })
  }

  if (!alreadyVisible) {
    restoreMacApplicationVisibility()
    window.showInactive()
  }
  catVisible = true

  lastKnownCatTaskState = state
  sendCatCommand(state, 'panel')
  return getCatStatus({ state, visible: true })
}

function openCatPanelWindow(options: OpenCatPanelOptions = {}): CatPanelToggleResult {
  restoreMacApplicationVisibility(options.activate ?? false)

  if (options.sessionId) {
    setActiveCatSessionId(options.sessionId, options.source ?? 'panel')
  }

  showCatWindow()

  if (!catWindow || catWindow.isDestroyed() || !catWindow.isVisible()) {
    return {
      visible: false,
    }
  }

  const placement = getCatPanelPlacement(catWindow.getBounds())
  const panelWindow = createCatPanelWindow(placement)
  panelWindow.setBounds(placement.bounds)
  sendCatPanelPlacement(placement)

  if (options.activate) {
    panelWindow.show()
    panelWindow.focus()
    panelWindow.webContents.focus()
  } else {
    panelWindow.showInactive()
  }
  catPanelVisible = true
  catPanelSide = placement.side
  hideCatBubbleWindow({ reason: 'replaced', source: 'panel' })

  if (process.platform === 'darwin') {
    setTimeout(() => restoreMacApplicationVisibility(false), 0)
  }

  notifyActiveCatSessionChanged(options.source ?? 'panel')
  if (activeCatSessionId) {
    notifyCatDraftChanged(catDrafts.get(activeCatSessionId) ?? null, options.source ?? 'panel')
  }

  return {
    visible: true,
    side: placement.side,
    bounds: placement.bounds,
  }
}

function toggleCatPanelWindow(options: OpenCatPanelOptions = {}): CatPanelToggleResult {
  if (
    catPanelWindow &&
    !catPanelWindow.isDestroyed() &&
    (catPanelVisible || catPanelWindow.isVisible() || catPanelWindow.isFocused())
  ) {
    closeCatPanelWindow()

    return {
      visible: false,
    }
  }

  return openCatPanelWindow({
    ...options,
    source: options.source ?? 'toggle',
  })
}

function dragStart(): CatBounds | null {
  cancelCatSnapAnimation()
  closeCatPanelWindow()

  if (!catWindow || catWindow.isDestroyed()) {
    return null
  }

  const bounds = catWindow.getBounds()
  catHitLocked = true
  catDragSnapshot = {
    cursor: screen.getCursorScreenPoint(),
    bounds,
    moved: false,
  }
  return bounds
}

function dragMove(payload?: CatDragPayload): CatBounds | null {
  if (!catWindow || catWindow.isDestroyed()) {
    return null
  }

  let nextBounds: CatBounds
  if (catDragSnapshot) {
    const cursor = screen.getCursorScreenPoint()
    catDragSnapshot.moved = true
    nextBounds = constrainCatBounds({
      ...catDragSnapshot.bounds,
      x: Math.round(catDragSnapshot.bounds.x + cursor.x - catDragSnapshot.cursor.x),
      y: Math.round(catDragSnapshot.bounds.y + cursor.y - catDragSnapshot.cursor.y),
    })
  } else if (
    payload?.startBounds &&
    isFiniteNumber(payload.startBounds.x) &&
    isFiniteNumber(payload.startBounds.y) &&
    isFiniteNumber(payload.startBounds.width) &&
    isFiniteNumber(payload.startBounds.height) &&
    isFiniteNumber(payload.deltaX) &&
    isFiniteNumber(payload.deltaY)
  ) {
    nextBounds = constrainCatBounds({
      width: Math.round(payload.startBounds.width),
      height: Math.round(payload.startBounds.height),
      x: Math.round(payload.startBounds.x + payload.deltaX),
      y: Math.round(payload.startBounds.y + payload.deltaY),
    })
  } else {
    return null
  }

  catWindow.setBounds(nextBounds)
  repositionCatBubbleWindow()
  return nextBounds
}

async function dragEnd(): Promise<CatBounds | null> {
  const moved = catDragSnapshot?.moved ?? false
  catDragSnapshot = null
  catHitLocked = false
  syncCatHitWindowBounds(true)

  if (!moved) {
    return catWindow && !catWindow.isDestroyed() ? catWindow.getBounds() : null
  }

  const targetBounds = getSnapTargetBounds()
  if (!targetBounds) {
    return null
  }

  return animateCatBounds(targetBounds)
}

function setCatHitArea(area: CatHitArea): void {
  if (
    !area ||
    !isFiniteNumber(area.x) ||
    !isFiniteNumber(area.y) ||
    !isFiniteNumber(area.width) ||
    !isFiniteNumber(area.height)
  ) {
    return
  }

  catHitArea = {
    x: clamp(Math.round(area.x), -catWindowSize.width, catWindowSize.width),
    y: clamp(Math.round(area.y), -catWindowSize.height, catWindowSize.height),
    width: clamp(Math.round(area.width), 8, catWindowSize.width * 2),
    height: clamp(Math.round(area.height), 8, catWindowSize.height * 2),
  }
  syncCatHitWindowBounds()
}

function setCatInteractionState(state: CatInteractionState): void {
  if (state !== 'dragging' && !allowedTaskStates.has(state)) {
    return
  }
  sendCatCommand(state, 'hit-window')
}

function registerCatWindowIpcHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.cat.show, () => showCatWindow())
  ipcMain.handle(IPC_CHANNELS.cat.hide, () => hideCatWindow())
  ipcMain.handle(IPC_CHANNELS.cat.toggleVisibility, () => toggleCatVisibility())
  ipcMain.handle(IPC_CHANNELS.cat.setState, (_event, state: CatTaskState) => setCatState(state))
  ipcMain.handle(IPC_CHANNELS.cat.togglePanel, () => toggleCatPanelWindow())
  ipcMain.handle(IPC_CHANNELS.cat.dragStart, () => dragStart())
  ipcMain.handle(IPC_CHANNELS.cat.dragMove, (_event, payload?: CatDragPayload) => dragMove(payload))
  ipcMain.handle(IPC_CHANNELS.cat.dragEnd, () => dragEnd())
  ipcMain.handle(IPC_CHANNELS.cat.setHitArea, (event, area: CatHitArea) => {
    if (catWindow && !catWindow.isDestroyed() && event.sender.id === catWindow.webContents.id) {
      setCatHitArea(area)
    }
  })
  ipcMain.handle(IPC_CHANNELS.cat.setInteractionState, (event, state: CatInteractionState) => {
    if (
      catHitWindow &&
      !catHitWindow.isDestroyed() &&
      event.sender.id === catHitWindow.webContents.id
    ) {
      setCatInteractionState(state)
    }
  })
  ipcMain.handle(
    IPC_CHANNELS.cat.openObservationSource,
    (_event, event: ObservationReactionEvent) => openObservationSource(event)
  )
  ipcMain.handle(IPC_CHANNELS.cat.showBubble, (_event, request: CatBubbleShowRequest | string) =>
    showCatBubble(request)
  )
  ipcMain.handle(
    IPC_CHANNELS.cat.dismissBubble,
    (_event, request?: CatBubbleDismissRequest | string) => {
      hideCatBubbleWindow(request)
    }
  )
  ipcMain.on(IPC_CHANNELS.cat.bubbleReady, (event) => {
    if (!catBubbleWindow || catBubbleWindow.isDestroyed()) {
      return
    }
    if (event.sender.id !== catBubbleWindow.webContents.id) {
      return
    }

    syncCatBubbleWindowState()
  })
  ipcMain.on(IPC_CHANNELS.cat.reportState, (_event, state: CatWindowState) => {
    reportCatState(state)
  })

  ipcMain.handle(IPC_CHANNELS.catPanel.open, async (_event, request?: CatPanelOpenRequest) => {
    const sessionId = await ensureActiveCatSessionId(request?.sessionId)
    return openCatPanelWindow({ sessionId, source: 'ipc', activate: request?.activate })
  })
  ipcMain.handle(IPC_CHANNELS.catPanel.getActiveSession, async () => {
    await ensureActiveCatSessionId(activeCatSessionId)
    return {
      ...(activeCatSessionId ? { sessionId: activeCatSessionId } : {}),
      updatedAt: activeCatSessionUpdatedAt,
    }
  })
  ipcMain.handle(
    IPC_CHANNELS.catPanel.setActiveSession,
    (_event, request: CatPanelSetActiveSessionRequest | string | undefined) => {
      const sessionId = typeof request === 'string' ? request : request?.sessionId
      setActiveCatSessionId(sessionId, 'panel')
      return {
        ...(activeCatSessionId ? { sessionId: activeCatSessionId } : {}),
        updatedAt: activeCatSessionUpdatedAt,
      }
    }
  )
  ipcMain.handle(IPC_CHANNELS.catPanel.getDraft, (_event, request?: CatDraftRequest | string) => {
    const sessionId = typeof request === 'string' ? request : request?.sessionId
    return getCatDraftSnapshot(sessionId ?? activeCatSessionId)
  })
  ipcMain.handle(
    IPC_CHANNELS.catPanel.stageDraftAttachments,
    (_event, input: StageCatDraftAttachmentsInput | CatDraftStageRequest) =>
      stageCatDraftAttachments(input)
  )
  ipcMain.handle(
    IPC_CHANNELS.catPanel.clearDraft,
    (_event, input: ClearCatDraftInput | CatDraftClearRequest | string) =>
      clearCatDraft(typeof input === 'string' ? { sessionId: input } : input)
  )
}

function openObservationSource(event: ObservationReactionEvent): void {
  const catSessionId = normalizeIdentifier(event?.catSessionId)
  if (!catSessionId) {
    return
  }

  hideCatBubbleWindow({ id: activeCatBubbleEvent?.id, reason: 'source-opened', source: 'main' })
  setActiveCatSessionId(catSessionId, 'observation')
  openCatPanelWindow({ sessionId: catSessionId, source: 'observation' })
}

function sanitizeObservationReactionEvent(
  event: ObservationReactionEvent
): ObservationReactionEvent {
  const captureId = event.captureId ? normalizeIdentifier(event.captureId) : null
  const sourceRunId = event.sourceRunId ? normalizeIdentifier(event.sourceRunId) : null
  const sourceMessageId = event.sourceMessageId ? normalizeIdentifier(event.sourceMessageId) : null
  return {
    id: normalizeIdentifier(event.id) ?? crypto.randomUUID(),
    observationRunId: normalizeIdentifier(event.observationRunId) ?? '',
    visionSessionId: normalizeIdentifier(event.visionSessionId) ?? '',
    catSessionId: normalizeIdentifier(event.catSessionId) ?? '',
    ...(sourceRunId ? { sourceRunId } : {}),
    ...(sourceMessageId ? { sourceMessageId } : {}),
    decision: event.decision === 'ask' ? 'ask' : 'notify',
    text: sanitizeBoundedText(event.text, 240) ?? '',
    ...(captureId ? { captureId } : {}),
    createdAt: Number.isFinite(event.createdAt) ? event.createdAt : Date.now(),
  }
}

function sanitizeCatPetGiftUnlock(event: CatPetGiftUnlock): CatPetGiftUnlock | undefined {
  const roleId = normalizeIdentifier(event.roleId)
  const giftId = normalizeIdentifier(event.gift?.id)
  const name = sanitizeBoundedText(event.gift?.name, 80)
  if (!roleId || !giftId || !name) {
    return undefined
  }

  const storyLines = Array.isArray(event.gift.storyLines)
    ? event.gift.storyLines
        .map((line) => sanitizeBoundedText(line, 180))
        .filter((line): line is string => Boolean(line))
        .slice(0, 8)
    : []
  const description = sanitizeBoundedText(event.gift.description, 180)
  const image = sanitizeCatPetGiftImage(event.gift.image)
  return {
    roleId,
    gift: {
      id: giftId,
      enabled: event.gift.enabled !== false,
      unlockAffection: clamp(Math.round(Number(event.gift.unlockAffection) || 0), 0, 300),
      name,
      ...(description ? { description } : {}),
      ...(image ? { image } : {}),
      storyLines: storyLines.length ? storyLines : [name],
    },
    affection: clamp(Math.round(Number(event.affection) || 0), 0, 300),
    mood: event.mood === 'attached' ? 'attached' : 'happy',
    unlockedAt: Number.isFinite(event.unlockedAt) ? event.unlockedAt : Date.now(),
  }
}

function sanitizeCatPetGiftImage(image: CatPetGiftImage | undefined): CatPetGiftImage | undefined {
  if (!image || typeof image !== 'object') {
    return undefined
  }
  const dataUrl =
    typeof image.dataUrl === 'string' &&
    image.dataUrl.length <= CAT_PET_GIFT_IMAGE_DATA_URL_MAX_LENGTH &&
    /^data:image\/(?:png|jpe?g|webp|gif);base64,[a-z0-9+/=]+$/i.test(image.dataUrl)
      ? image.dataUrl
      : undefined
  const packagePath = sanitizeBoundedText(image.packagePath, 240)
  if (!dataUrl && !packagePath) {
    return undefined
  }
  const mimeType = sanitizeBoundedText(image.mimeType, 80)
  const fileName = sanitizeBoundedText(image.fileName, 120)
  return {
    ...(dataUrl ? { dataUrl } : {}),
    ...(mimeType?.startsWith('image/') ? { mimeType } : {}),
    ...(fileName ? { fileName } : {}),
    ...(packagePath ? { packagePath } : {}),
  }
}

export {
  clearCatDraft,
  closeCatPanelWindow,
  closeCatWindow,
  dragEnd,
  dragMove,
  dragStart,
  getActiveCatSessionId,
  getCatDraftSnapshot,
  getCatWindowBounds,
  hideCatWindow,
  openCatPanelWindow,
  registerCatWindowIpcHandlers,
  sendCatObservationReaction,
  setActiveCatSessionId,
  setCatSessionIdResolver,
  setCatState,
  setCatWindowLogger,
  showCatWindow,
  showCatWindowBubble,
  stageCatDraftAttachments,
  toggleCatPanelWindow,
  toggleCatVisibility,
}
