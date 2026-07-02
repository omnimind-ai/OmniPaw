import type {
  CatCommandEvent,
  CatDraftAttachment,
  CatHitRegionRect,
  CatWindowState,
} from '@shared/types/cat'
import type {
  CatAppearanceAssetKey,
  CatAppearanceDurations,
  CatAppearanceLayout,
  CatAppearanceResolvedPack,
} from '@shared/types/cat-appearance'
import doTaskImage from '@/asserts/cat/anim_cat_doing_task.webp'
import draggedImage from '@/asserts/cat/anim_cat_dragging.webp'
import endTaskImage from '@/asserts/cat/anim_cat_end_doing.webp'
import finishImage from '@/asserts/cat/anim_cat_finish.webp'
import firstShowImage from '@/asserts/cat/anim_cat_show.webp'
import startTaskImage from '@/asserts/cat/anim_cat_start_doing.webp'
import doTaskFallbackImage from '@/asserts/cat/ic_cat_doing_task.png'
import firstShowFallbackImage from '@/asserts/cat/ic_cat_first_show.png'
import idleImage from '@/asserts/cat/ic_cat_normal.png'
import draggedFallbackImage from '@/asserts/cat/ic_cat_normal_dragging.png'
import { appBridge } from '@/bridge/app'
import { i18n } from '@/i18n'

const surface = document.querySelector<HTMLElement>('.cat-surface')
const stage = document.querySelector<HTMLButtonElement>('#cat-stage')
const imageFrame = document.querySelector<HTMLElement>('#cat-image-frame')
const image = document.querySelector<HTMLImageElement>('#cat-image')

const states = Object.freeze({
  HIDDEN: 'hidden',
  APPEARING: 'appearing',
  IDLE: 'idle',
  DRAGGING: 'dragging',
  PREPARING: 'preparing',
  RUNNING: 'running',
  COMPLETED: 'completed',
} satisfies Record<string, CatWindowState>)

const stableStates = new Set<CatWindowState>([
  states.IDLE,
  states.PREPARING,
  states.RUNNING,
  states.COMPLETED,
])

type RequiredCatWindowAssetKey = Exclude<CatAppearanceAssetKey, 'dragTransition'>
type CatWindowAssets = Record<RequiredCatWindowAssetKey, string> &
  Partial<Record<'dragTransition', string>>

const defaultAssets = Object.freeze({
  show: firstShowImage,
  showFallback: firstShowFallbackImage,
  idle: idleImage,
  drag: draggedImage,
  dragFallback: draggedFallbackImage,
  startDoing: startTaskImage,
  doing: doTaskImage,
  doingFallback: doTaskFallbackImage,
  endDoing: endTaskImage,
  finish: finishImage,
} satisfies CatWindowAssets)

const defaultAnimationDurations = Object.freeze({
  appearing: 1000,
  dragTransition: 1100,
  preparing: 1050,
  completedEnd: 980,
  completedFinish: 1500,
})

const catWindowRenderSize = 116
const defaultBuiltinLayout = Object.freeze({
  scale: 86 / catWindowRenderSize,
  offsetX: 0,
  offsetY: 0,
} satisfies CatAppearanceLayout)
const defaultLocalLayout = Object.freeze({
  scale: 1,
  offsetX: 0,
  offsetY: 0,
} satisfies CatAppearanceLayout)
const hitRegionAlphaThreshold = 8
const maxHitRegionRects = 220

let assets: CatWindowAssets = {
  ...defaultAssets,
}

let animationDurations: CatAppearanceDurations = {
  ...defaultAnimationDurations,
}

let appearanceLayout: CatAppearanceLayout = {
  ...defaultBuiltinLayout,
}

const dropAttachmentLimits = Object.freeze({
  maxFileBytes: 25 * 1024 * 1024,
  maxFilesPerMessage: 12,
})

let currentState: CatWindowState = states.HIDDEN
let currentStableState: CatWindowState = states.IDLE
let previousStableState: CatWindowState = states.IDLE
let firstShow = true
let fileDragDepth = 0
let stateTimer: ReturnType<typeof window.setTimeout> | null = null
let hitRegionTimer: number | null = null
let suppressNextImageError = false
let dragSession:
  | {
      pointerId: number
      startScreenX: number
      startScreenY: number
      startBounds: { x: number; y: number; width: number; height: number }
      active: boolean
    }
  | undefined

function clearStateTimer() {
  if (stateTimer) {
    window.clearTimeout(stateTimer)
    stateTimer = null
  }
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function normalizeLayout(
  layout: Partial<CatAppearanceLayout> | undefined,
  fallback: CatAppearanceLayout
): CatAppearanceLayout {
  return {
    scale:
      typeof layout?.scale === 'number' && Number.isFinite(layout.scale)
        ? clampNumber(layout.scale, 0.25, 2)
        : fallback.scale,
    offsetX:
      typeof layout?.offsetX === 'number' && Number.isFinite(layout.offsetX)
        ? clampNumber(layout.offsetX, -catWindowRenderSize, catWindowRenderSize)
        : fallback.offsetX,
    offsetY:
      typeof layout?.offsetY === 'number' && Number.isFinite(layout.offsetY)
        ? clampNumber(layout.offsetY, -catWindowRenderSize, catWindowRenderSize)
        : fallback.offsetY,
  }
}

function applyCatLayout(layout: CatAppearanceLayout) {
  if (!imageFrame) return
  imageFrame.style.setProperty('--cat-image-scale', String(layout.scale))
  imageFrame.style.setProperty('--cat-image-offset-x', `${layout.offsetX}px`)
  imageFrame.style.setProperty('--cat-image-offset-y', `${layout.offsetY}px`)
}

function applyImageCorsMode(src: string) {
  if (!image) return
  if (src.startsWith('omnipaw-cat-asset:')) {
    image.crossOrigin = 'anonymous'
    return
  }
  image.removeAttribute('crossorigin')
}

function reportState(state: CatWindowState) {
  appBridge.cat.reportState(state)
}

function setSurfaceState(state: CatWindowState) {
  if (!surface) return
  surface.classList.toggle('is-dragging', state === states.DRAGGING)
  surface.classList.toggle('is-running', state === states.RUNNING)
  surface.classList.toggle('is-completed', state === states.COMPLETED)
}

function setImage(src: string, fallback = assets.idle) {
  if (!image) return
  suppressNextImageError = false
  image.dataset.fallback = fallback
  image.removeAttribute('src')
  applyImageCorsMode(src)

  window.requestAnimationFrame(() => {
    image.src = src
  })
}

function scheduleHitRegionSync() {
  if (hitRegionTimer !== null) {
    window.cancelAnimationFrame(hitRegionTimer)
  }
  hitRegionTimer = window.requestAnimationFrame(() => {
    hitRegionTimer = null
    syncHitRegion()
  })
}

function syncHitRegion() {
  const setHitRegion = appBridge.cat.setHitRegion
  if (!setHitRegion) {
    return
  }

  try {
    const rects = image?.complete && image.naturalWidth > 0 ? buildImageHitRegion(image) : []
    setHitRegion({
      rects: rects.length ? rects : [buildLayoutHitRect()],
      source: 'cat-window',
    })
  } catch {
    setHitRegion({
      rects: [buildLayoutHitRect()],
      source: 'cat-window-fallback',
    })
  }
}

function buildImageHitRegion(target: HTMLImageElement): CatHitRegionRect[] {
  const canvas = document.createElement('canvas')
  canvas.width = catWindowRenderSize
  canvas.height = catWindowRenderSize
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) {
    return []
  }

  context.clearRect(0, 0, catWindowRenderSize, catWindowRenderSize)
  context.save()
  context.translate(appearanceLayout.offsetX, appearanceLayout.offsetY)
  context.translate(catWindowRenderSize / 2, catWindowRenderSize)
  context.scale(appearanceLayout.scale, appearanceLayout.scale)
  context.translate(-catWindowRenderSize / 2, -catWindowRenderSize)
  drawContainedImage(context, target)
  context.restore()

  const pixels = context.getImageData(0, 0, catWindowRenderSize, catWindowRenderSize).data
  const rects = buildAlphaRects(pixels, catWindowRenderSize, catWindowRenderSize)
  return rects.length <= maxHitRegionRects ? rects : [buildAlphaBounds(pixels)]
}

function drawContainedImage(context: CanvasRenderingContext2D, target: HTMLImageElement) {
  const naturalWidth = target.naturalWidth || catWindowRenderSize
  const naturalHeight = target.naturalHeight || catWindowRenderSize
  const scale = Math.min(catWindowRenderSize / naturalWidth, catWindowRenderSize / naturalHeight)
  const width = naturalWidth * scale
  const height = naturalHeight * scale
  const x = (catWindowRenderSize - width) / 2
  const y = (catWindowRenderSize - height) / 2
  context.drawImage(target, x, y, width, height)
}

function buildAlphaRects(
  pixels: Uint8ClampedArray,
  width: number,
  height: number
): CatHitRegionRect[] {
  const rects: CatHitRegionRect[] = []
  let activeRects = new Map<string, CatHitRegionRect>()

  for (let y = 0; y < height; y += 1) {
    const runs = alphaRunsForRow(pixels, width, y)
    const nextActiveRects = new Map<string, CatHitRegionRect>()

    for (const run of runs) {
      const key = `${run.x}:${run.width}`
      const previous = activeRects.get(key)

      if (previous && previous.y + previous.height === y) {
        previous.height += 1
        nextActiveRects.set(key, previous)
      } else {
        const rect = {
          x: run.x,
          y,
          width: run.width,
          height: 1,
        }
        rects.push(rect)
        nextActiveRects.set(key, rect)
      }
    }

    activeRects = nextActiveRects
  }

  return rects
}

function alphaRunsForRow(
  pixels: Uint8ClampedArray,
  width: number,
  y: number
): Array<{ x: number; width: number }> {
  const runs: Array<{ x: number; width: number }> = []
  let x = 0

  while (x < width) {
    while (x < width && alphaAt(pixels, width, x, y) <= hitRegionAlphaThreshold) {
      x += 1
    }
    if (x >= width) {
      break
    }

    const start = x
    while (x < width && alphaAt(pixels, width, x, y) > hitRegionAlphaThreshold) {
      x += 1
    }
    const end = x
    const paddedStart = Math.max(0, start - 1)
    const paddedEnd = Math.min(width, end + 1)
    runs.push({
      x: paddedStart,
      width: paddedEnd - paddedStart,
    })
  }

  return runs
}

function alphaAt(pixels: Uint8ClampedArray, width: number, x: number, y: number): number {
  return pixels[(y * width + x) * 4 + 3] ?? 0
}

function buildAlphaBounds(pixels: Uint8ClampedArray): CatHitRegionRect {
  let minX = catWindowRenderSize
  let minY = catWindowRenderSize
  let maxX = -1
  let maxY = -1

  for (let y = 0; y < catWindowRenderSize; y += 1) {
    for (let x = 0; x < catWindowRenderSize; x += 1) {
      if (alphaAt(pixels, catWindowRenderSize, x, y) <= hitRegionAlphaThreshold) {
        continue
      }
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    }
  }

  if (maxX < minX || maxY < minY) {
    return buildLayoutHitRect()
  }

  return {
    x: Math.max(0, minX - 1),
    y: Math.max(0, minY - 1),
    width: Math.min(catWindowRenderSize, maxX + 2) - Math.max(0, minX - 1),
    height: Math.min(catWindowRenderSize, maxY + 2) - Math.max(0, minY - 1),
  }
}

function buildLayoutHitRect(): CatHitRegionRect {
  const width = catWindowRenderSize * appearanceLayout.scale
  const height = catWindowRenderSize * appearanceLayout.scale
  const x = catWindowRenderSize / 2 - width / 2 + appearanceLayout.offsetX
  const y = catWindowRenderSize - height + appearanceLayout.offsetY
  const left = clampNumber(Math.floor(x), 0, catWindowRenderSize)
  const top = clampNumber(Math.floor(y), 0, catWindowRenderSize)
  const right = clampNumber(Math.ceil(x + width), 0, catWindowRenderSize)
  const bottom = clampNumber(Math.ceil(y + height), 0, catWindowRenderSize)

  return {
    x: left,
    y: top,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top),
  }
}

function enterState(state: CatWindowState) {
  if (!Object.values(states).includes(state)) {
    return
  }

  clearStateTimer()
  currentState = state

  if (stableStates.has(state)) {
    currentStableState = state
  }

  setSurfaceState(state)
  reportState(state)

  switch (state) {
    case states.HIDDEN:
      setImage(assets.idle)
      break
    case states.APPEARING:
      setImage(assets.show, assets.showFallback)
      stateTimer = window.setTimeout(() => {
        firstShow = false
        enterState(states.IDLE)
      }, animationDurations.appearing)
      break
    case states.IDLE:
      setImage(assets.idle)
      break
    case states.DRAGGING:
      if (assets.dragTransition) {
        setImage(assets.dragTransition, assets.dragFallback)
        stateTimer = window.setTimeout(() => {
          if (currentState === states.DRAGGING) {
            setImage(assets.drag, assets.dragFallback)
          }
        }, animationDurations.dragTransition)
        break
      }
      setImage(assets.drag, assets.dragFallback)
      break
    case states.PREPARING:
      setImage(assets.startDoing, assets.doingFallback)
      stateTimer = window.setTimeout(() => {
        if (currentState === states.PREPARING) {
          setImage(assets.doingFallback)
        }
      }, animationDurations.preparing)
      break
    case states.RUNNING:
      setImage(assets.doing, assets.doingFallback)
      break
    case states.COMPLETED:
      setImage(assets.endDoing, assets.doingFallback)
      stateTimer = window.setTimeout(() => {
        if (currentState !== states.COMPLETED) {
          return
        }

        setImage(assets.finish, assets.idle)
        stateTimer = window.setTimeout(() => {
          if (currentState === states.COMPLETED) {
            enterState(states.IDLE)
          }
        }, animationDurations.completedFinish)
      }, animationDurations.completedEnd)
      break
  }
}

function applyCatAppearance(pack: CatAppearanceResolvedPack) {
  const customAssets = Object.fromEntries(
    Object.entries(pack.assets || {}).filter(([, value]) => typeof value === 'string' && value)
  ) as Partial<Record<CatAppearanceAssetKey, string>>
  const fallbackLayout = pack.source === 'builtin' ? defaultBuiltinLayout : defaultLocalLayout

  assets = {
    ...defaultAssets,
    ...customAssets,
  }
  animationDurations = {
    ...defaultAnimationDurations,
    ...pack.durations,
  }
  appearanceLayout = normalizeLayout(pack.layout, fallbackLayout)
  applyCatLayout(appearanceLayout)
  enterState(currentState)
  scheduleHitRegionSync()
}

async function loadCatAppearance() {
  try {
    applyCatAppearance(await appBridge.catAppearance.current())
  } catch {
    assets = {
      ...defaultAssets,
    }
    animationDurations = {
      ...defaultAnimationDurations,
    }
    appearanceLayout = {
      ...defaultBuiltinLayout,
    }
    applyCatLayout(appearanceLayout)
    scheduleHitRegionSync()
  }
}

function handleCommand(payload: CatCommandEvent) {
  const nextState = payload?.state

  if (!nextState) {
    return
  }

  if (nextState === states.IDLE && firstShow && currentState === states.HIDDEN) {
    enterState(states.APPEARING)
    return
  }

  enterState(nextState)
}

function hasDraggedFiles(event: DragEvent) {
  return Array.from(event.dataTransfer?.types || []).includes('Files')
}

function handleFileDragEnter(event: DragEvent) {
  if (!hasDraggedFiles(event)) return
  event.preventDefault()
  fileDragDepth += 1
  if (fileDragDepth === 1) {
    previousStableState = currentStableState
    enterState(states.DRAGGING)
  }
}

function handleFileDragOver(event: DragEvent) {
  if (!hasDraggedFiles(event)) return
  event.preventDefault()
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'copy'
  }
}

function handleFileDragLeave(event: DragEvent) {
  if (!hasDraggedFiles(event)) return
  event.preventDefault()
  fileDragDepth = Math.max(0, fileDragDepth - 1)
  if (fileDragDepth === 0 && currentState === states.DRAGGING && !dragSession?.active) {
    enterState(previousStableState)
  }
}

async function handleFileDrop(event: DragEvent) {
  if (!hasDraggedFiles(event)) return
  event.preventDefault()
  fileDragDepth = 0

  const files = Array.from(event.dataTransfer?.files || [])
  if (!files.length) {
    enterState(previousStableState)
    return
  }

  previousStableState = currentStableState
  enterState(states.PREPARING)

  try {
    const sessionId = await ensureCatDropSessionId()
    const staged = await uploadDroppedFiles(sessionId, files)

    if (staged.attachments.length) {
      await appBridge.catPanel.stageDraftAttachments?.({
        sessionId,
        attachments: staged.attachments,
      })
      await appBridge.catPanel.open?.({ sessionId })
    }
    enterState(states.IDLE)
  } catch {
    enterState(states.IDLE)
  }
}

async function ensureCatDropSessionId(): Promise<string> {
  const active = await appBridge.catPanel.getActiveSession?.().catch(() => undefined)
  if (active?.sessionId) {
    return active.sessionId
  }

  const sessions = await appBridge.chat.listSessions({ kind: 'cat' }).catch(() => [])
  const existing = sessions.find((session) => session.kind === 'cat' && session.status === 'active')
  const sessionId =
    existing?.id ||
    (
      await appBridge.chat.createSession({
        kind: 'cat',
        title: i18n.global.t('catWindow.chat.defaultSessionTitle'),
      })
    ).id

  await appBridge.catPanel.setActiveSession?.({ sessionId }).catch(() => undefined)
  return sessionId
}

async function uploadDroppedFiles(sessionId: string, files: File[]) {
  const existingDraft = await appBridge.catPanel.getDraft?.({ sessionId }).catch(() => null)
  const existingCount = existingDraft?.attachments.length || 0
  const availableCount = Math.max(0, dropAttachmentLimits.maxFilesPerMessage - existingCount)
  const acceptedFiles = files.slice(0, availableCount)
  let failedCount = Math.max(0, files.length - acceptedFiles.length)
  const attachments: CatDraftAttachment[] = []

  for (const file of acceptedFiles) {
    if (file.size > dropAttachmentLimits.maxFileBytes) {
      failedCount += 1
      continue
    }

    try {
      const uploaded = await appBridge.attachment?.upload({
        name: file.name,
        type: file.type || 'application/octet-stream',
        size: file.size,
        bytes: await file.arrayBuffer(),
      })
      if (!uploaded?.id) {
        failedCount += 1
        continue
      }
      attachments.push({
        attachmentId: uploaded.id,
        attachment_id: uploaded.id,
        filename: uploaded.originalName || uploaded.filename || file.name || 'attachment',
        originalName: uploaded.originalName || file.name || 'attachment',
        mimeType: uploaded.mimeType || file.type || 'application/octet-stream',
        sizeBytes: uploaded.sizeBytes || file.size,
        kind: normalizeAttachmentKind(uploaded.kind),
        previewUrl: uploaded.previewUrl,
      })
    } catch {
      failedCount += 1
    }
  }

  return { attachments, failedCount }
}

function normalizeAttachmentKind(kind: string | undefined): CatDraftAttachment['kind'] | undefined {
  return kind === 'image' ||
    kind === 'audio' ||
    kind === 'video' ||
    kind === 'file' ||
    kind === 'text'
    ? kind
    : undefined
}

image?.addEventListener('error', () => {
  if (suppressNextImageError || !image) {
    return
  }

  const fallback = image.dataset.fallback || assets.idle
  suppressNextImageError = true
  applyImageCorsMode(fallback)
  image.src = fallback
})

image?.addEventListener('load', () => {
  scheduleHitRegionSync()
})

stage?.addEventListener('pointerdown', async (event) => {
  if (!stage) {
    return
  }

  stage.setPointerCapture(event.pointerId)

  const bounds = await appBridge.cat.dragStart()
  if (!bounds) {
    stage.releasePointerCapture(event.pointerId)
    return
  }

  dragSession = {
    pointerId: event.pointerId,
    startScreenX: event.screenX,
    startScreenY: event.screenY,
    startBounds: bounds,
    active: false,
  }
})

stage?.addEventListener('pointermove', (event) => {
  if (!dragSession || dragSession.pointerId !== event.pointerId) {
    return
  }

  const dx = Math.abs(event.screenX - dragSession.startScreenX)
  const dy = Math.abs(event.screenY - dragSession.startScreenY)

  if (!dragSession.active && Math.max(dx, dy) > 4) {
    previousStableState = currentStableState
    dragSession.active = true
    enterState(states.DRAGGING)
  }

  if (!dragSession.active) {
    return
  }

  void appBridge.cat.dragMove({
    startBounds: dragSession.startBounds,
    deltaX: event.screenX - dragSession.startScreenX,
    deltaY: event.screenY - dragSession.startScreenY,
  })
})

stage?.addEventListener('pointerup', async (event) => {
  if (!dragSession || dragSession.pointerId !== event.pointerId) {
    return
  }

  const wasDragging = dragSession.active
  dragSession = undefined
  stage.releasePointerCapture(event.pointerId)

  if (!wasDragging) {
    return
  }

  await appBridge.cat.dragEnd()
  enterState(previousStableState)
})

stage?.addEventListener('pointercancel', async (event) => {
  if (!dragSession || dragSession.pointerId !== event.pointerId) {
    return
  }

  const wasDragging = dragSession.active
  dragSession = undefined

  if (wasDragging) {
    await appBridge.cat.dragEnd()
    enterState(previousStableState)
  }
})

stage?.addEventListener('contextmenu', async (event) => {
  event.preventDefault()
  await appBridge.cat.togglePanel()
})

for (const target of [surface, stage]) {
  target?.addEventListener('dragenter', handleFileDragEnter)
  target?.addEventListener('dragover', handleFileDragOver)
  target?.addEventListener('dragleave', handleFileDragLeave)
  target?.addEventListener('drop', handleFileDrop)
}

appBridge.cat.onCommand(handleCommand)
appBridge.catAppearance.onChanged((event) => {
  applyCatAppearance(event.current)
})

if (image) {
  applyCatLayout(appearanceLayout)
  setImage(idleImage)
}

void loadCatAppearance()
