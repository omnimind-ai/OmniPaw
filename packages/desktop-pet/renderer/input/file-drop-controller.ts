import type { CatDraftAttachment, CatTaskState } from '@shared/types/cat'
import { appBridge } from '@/bridge/app'
import { i18n } from '@/i18n'

interface FileDropControllerOptions {
  area: HTMLElement
  stableState: () => CatTaskState
}

export interface FileDropController {
  dispose: () => void
}

const attachmentLimits = Object.freeze({
  maxFileBytes: 25 * 1024 * 1024,
  maxFilesPerMessage: 12,
})

function hasDraggedFiles(event: DragEvent): boolean {
  return Array.from(event.dataTransfer?.types || []).includes('Files')
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

async function uploadDroppedFiles(sessionId: string, files: File[]): Promise<CatDraftAttachment[]> {
  const existingDraft = await appBridge.catPanel.getDraft?.({ sessionId }).catch(() => null)
  const existingCount = existingDraft?.attachments.length || 0
  const availableCount = Math.max(0, attachmentLimits.maxFilesPerMessage - existingCount)
  const attachments: CatDraftAttachment[] = []

  for (const file of files.slice(0, availableCount)) {
    if (file.size > attachmentLimits.maxFileBytes) continue

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
      // A failed file must not prevent the remaining dropped files from uploading.
    }
  }

  return attachments
}

export function createFileDropController(options: FileDropControllerOptions): FileDropController {
  const { area } = options
  let fileDragDepth = 0

  function handleDragEnter(event: DragEvent): void {
    if (!hasDraggedFiles(event)) return
    event.preventDefault()
    fileDragDepth += 1
    if (fileDragDepth === 1) void appBridge.cat.setInteractionState('dragging')
  }

  function handleDragOver(event: DragEvent): void {
    if (!hasDraggedFiles(event)) return
    event.preventDefault()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
  }

  function handleDragLeave(event: DragEvent): void {
    if (!hasDraggedFiles(event)) return
    event.preventDefault()
    fileDragDepth = Math.max(0, fileDragDepth - 1)
    if (fileDragDepth === 0) void appBridge.cat.setInteractionState(options.stableState())
  }

  async function handleDrop(event: DragEvent): Promise<void> {
    if (!hasDraggedFiles(event)) return
    event.preventDefault()
    fileDragDepth = 0

    const files = Array.from(event.dataTransfer?.files || [])
    if (!files.length) {
      await appBridge.cat.setInteractionState(options.stableState())
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

  function handleDropEvent(event: DragEvent): void {
    void handleDrop(event)
  }

  area.addEventListener('dragenter', handleDragEnter)
  area.addEventListener('dragover', handleDragOver)
  area.addEventListener('dragleave', handleDragLeave)
  area.addEventListener('drop', handleDropEvent)

  return {
    dispose() {
      area.removeEventListener('dragenter', handleDragEnter)
      area.removeEventListener('dragover', handleDragOver)
      area.removeEventListener('dragleave', handleDragLeave)
      area.removeEventListener('drop', handleDropEvent)
    },
  }
}
