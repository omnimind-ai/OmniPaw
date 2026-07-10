import type { CatCommandEvent, CatDraftAttachment, CatTaskState } from '@shared/types/cat'
import { appBridge } from '@/bridge/app'
import { i18n } from '@/i18n'

const area = document.querySelector<HTMLElement>('#cat-hit-area')
const dragThreshold = 4
const dropAttachmentLimits = Object.freeze({
  maxFileBytes: 25 * 1024 * 1024,
  maxFilesPerMessage: 12,
})
const taskStates = new Set<CatTaskState>(['idle', 'preparing', 'running', 'completed'])

let stableState: CatTaskState = 'idle'
let fileDragDepth = 0
let dragMoveScheduled = false
let dragMoveInFlight = false
let dragMovePending = false
let dragSession:
  | {
      pointerId: number
      startClientX: number
      startClientY: number
      active: boolean
      startPromise: Promise<unknown>
    }
  | undefined

function handleCommand(event: CatCommandEvent) {
  if (taskStates.has(event.state as CatTaskState)) {
    stableState = event.state as CatTaskState
  }
}

function queueDragMove() {
  dragMovePending = true
  if (dragMoveScheduled || dragMoveInFlight) return

  dragMoveScheduled = true
  window.requestAnimationFrame(async () => {
    dragMoveScheduled = false
    if (!dragSession?.active) {
      dragMovePending = false
      return
    }

    dragMovePending = false
    dragMoveInFlight = true
    try {
      await appBridge.cat.dragMove()
    } finally {
      dragMoveInFlight = false
      if (dragMovePending && dragSession?.active) {
        queueDragMove()
      }
    }
  })
}

async function stopPointerDrag(pointerId?: number) {
  if (!dragSession || (pointerId !== undefined && dragSession.pointerId !== pointerId)) {
    return
  }

  const session = dragSession
  dragSession = undefined
  dragMovePending = false
  area?.classList.remove('is-dragging')

  try {
    await session.startPromise
  } catch {
    return
  }

  await appBridge.cat.dragEnd().catch(() => null)
  if (session.active) {
    await appBridge.cat.setInteractionState(stableState).catch(() => undefined)
  }
}

function hasDraggedFiles(event: DragEvent) {
  return Array.from(event.dataTransfer?.types || []).includes('Files')
}

function handleFileDragEnter(event: DragEvent) {
  if (!hasDraggedFiles(event)) return
  event.preventDefault()
  fileDragDepth += 1
  if (fileDragDepth === 1) {
    void appBridge.cat.setInteractionState('dragging')
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
  if (fileDragDepth === 0) {
    void appBridge.cat.setInteractionState(stableState)
  }
}

async function handleFileDrop(event: DragEvent) {
  if (!hasDraggedFiles(event)) return
  event.preventDefault()
  fileDragDepth = 0

  const files = Array.from(event.dataTransfer?.files || [])
  if (!files.length) {
    await appBridge.cat.setInteractionState(stableState)
    return
  }

  await appBridge.cat.setInteractionState('preparing')
  try {
    const sessionId = await ensureCatDropSessionId()
    const attachments = await uploadDroppedFiles(sessionId, files)
    if (attachments.length) {
      await appBridge.catPanel.stageDraftAttachments?.({ sessionId, attachments })
      await appBridge.catPanel.open?.({ sessionId })
    }
  } finally {
    await appBridge.cat.setInteractionState('idle')
  }
}

async function ensureCatDropSessionId(): Promise<string> {
  const active = await appBridge.catPanel.getActiveSession?.().catch(() => undefined)
  if (active?.sessionId) return active.sessionId

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
  const attachments: CatDraftAttachment[] = []

  for (const file of files.slice(0, availableCount)) {
    if (file.size > dropAttachmentLimits.maxFileBytes) continue

    try {
      const uploaded = await appBridge.attachment?.upload({
        name: file.name,
        type: file.type || 'application/octet-stream',
        size: file.size,
        bytes: await file.arrayBuffer(),
      })
      if (!uploaded?.id) continue

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
      // Keep processing the remaining files; the panel will contain successful uploads.
    }
  }

  return attachments
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

area?.addEventListener('pointerdown', (event) => {
  if (event.button !== 0 || dragSession) return
  area.setPointerCapture(event.pointerId)
  dragSession = {
    pointerId: event.pointerId,
    startClientX: event.clientX,
    startClientY: event.clientY,
    active: false,
    startPromise: appBridge.cat.dragStart(),
  }
})

document.addEventListener('pointermove', (event) => {
  if (!dragSession || dragSession.pointerId !== event.pointerId) return

  const dx = Math.abs(event.clientX - dragSession.startClientX)
  const dy = Math.abs(event.clientY - dragSession.startClientY)
  if (!dragSession.active && Math.max(dx, dy) > dragThreshold) {
    dragSession.active = true
    area?.classList.add('is-dragging')
    void appBridge.cat.setInteractionState('dragging')
  }
  if (dragSession.active) queueDragMove()
})

document.addEventListener('pointerup', (event) => {
  if (event.button === 0) void stopPointerDrag(event.pointerId)
})
area?.addEventListener('pointercancel', (event) => {
  void stopPointerDrag(event.pointerId)
})
area?.addEventListener('lostpointercapture', (event) => {
  void stopPointerDrag(event.pointerId)
})
window.addEventListener('blur', () => {
  void stopPointerDrag()
})
area?.addEventListener('contextmenu', (event) => {
  event.preventDefault()
  void appBridge.cat.togglePanel()
})
area?.addEventListener('dragenter', handleFileDragEnter)
area?.addEventListener('dragover', handleFileDragOver)
area?.addEventListener('dragleave', handleFileDragLeave)
area?.addEventListener('drop', (event) => {
  void handleFileDrop(event)
})

appBridge.cat.onCommand(handleCommand)
