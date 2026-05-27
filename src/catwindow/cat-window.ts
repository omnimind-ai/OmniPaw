import type { CatCommandEvent, CatDraftAttachment, CatWindowState } from '@shared/types/cat'
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

const surface = document.querySelector<HTMLElement>('.cat-surface')
const stage = document.querySelector<HTMLButtonElement>('#cat-stage')
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

const assets = Object.freeze({
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
})

const copy = Object.freeze<Record<CatWindowState, string>>({
  hidden: '',
  appearing: '你好',
  idle: '待命',
  dragging: '移动中',
  preparing: '准备执行',
  running: '执行中',
  completed: '已完成',
})

const animationDurations = Object.freeze({
  appearing: 1000,
  preparing: 1050,
  completedEnd: 980,
  completedFinish: 1500,
})

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

function reportState(state: CatWindowState) {
  appBridge.cat.reportState(state)
}

function setBubble(text: string, visible = true) {
  if (!visible || text.length === 0) {
    void appBridge.cat.dismissBubble?.({ reason: 'state-hidden', source: 'cat-window' })
    return
  }

  void appBridge.cat.showBubble?.({
    text,
    kind: 'status',
    source: 'cat-window',
  })
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

  window.requestAnimationFrame(() => {
    image.src = src
  })
}

function enterState(state: CatWindowState, options: { fromDragRestore?: boolean } = {}) {
  if (!Object.values(states).includes(state)) {
    return
  }

  clearStateTimer()
  currentState = state

  if (stableStates.has(state)) {
    currentStableState = state
  }

  setSurfaceState(state)
  setBubble(copy[state], state !== states.HIDDEN)
  reportState(state)

  switch (state) {
    case states.HIDDEN:
      setImage(assets.idle)
      setBubble('', false)
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

  if (options.fromDragRestore) {
    setBubble(copy[state], state !== states.HIDDEN)
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
    setBubble('添加附件')
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
    enterState(previousStableState, { fromDragRestore: true })
  }
}

async function handleFileDrop(event: DragEvent) {
  if (!hasDraggedFiles(event)) return
  event.preventDefault()
  fileDragDepth = 0

  const files = Array.from(event.dataTransfer?.files || [])
  if (!files.length) {
    enterState(previousStableState, { fromDragRestore: true })
    return
  }

  previousStableState = currentStableState
  enterState(states.PREPARING)
  setBubble('上传中')

  try {
    const sessionId = await ensureCatDropSessionId()
    const staged = await uploadDroppedFiles(sessionId, files)

    if (staged.attachments.length) {
      await appBridge.catPanel.stageDraftAttachments?.({
        sessionId,
        attachments: staged.attachments,
      })
      await appBridge.catPanel.open?.({ sessionId })
      setBubble(`已添加 ${staged.attachments.length} 个附件`)
    }

    if (staged.failedCount) {
      setBubble(`${staged.failedCount} 个附件失败`)
    }
    enterState(states.IDLE, { fromDragRestore: true })
  } catch (error) {
    setBubble(error instanceof Error ? error.message : '附件上传失败')
    enterState(states.IDLE, { fromDragRestore: true })
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
        title: '小猫会话',
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
  image.src = fallback
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
  enterState(previousStableState, { fromDragRestore: true })
})

stage?.addEventListener('pointercancel', async (event) => {
  if (!dragSession || dragSession.pointerId !== event.pointerId) {
    return
  }

  const wasDragging = dragSession.active
  dragSession = undefined

  if (wasDragging) {
    await appBridge.cat.dragEnd()
    enterState(previousStableState, { fromDragRestore: true })
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

if (image) {
  image.src = idleImage
}
