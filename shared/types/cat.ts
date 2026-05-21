import type { AttachmentKind, ID, UnixMs } from './chat'

export type CatTaskState = 'idle' | 'preparing' | 'running' | 'completed'

export type CatWindowState = CatTaskState | 'hidden' | 'appearing' | 'dragging'

export type CatPanelSide = 'left' | 'right'

export interface CatBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface CatStatus {
  state: CatWindowState
  visible: boolean
  bounds: CatBounds | null
  panelVisible?: boolean
  panelSide?: CatPanelSide | null
  source?: string
}

export interface CatCommandEvent {
  state: CatWindowState
  source?: string
}

export interface CatPanelPlacement {
  side: CatPanelSide
  bounds: CatBounds
}

export interface CatPanelToggleResult {
  visible: boolean
  side?: CatPanelSide
  bounds?: CatBounds
}

export interface CatDragPayload {
  startBounds: CatBounds
  deltaX: number
  deltaY: number
}

export interface CatPanelActiveSessionState {
  sessionId?: ID
  updatedAt: UnixMs
}

export interface CatPanelSetActiveSessionRequest {
  sessionId?: ID
}

export interface CatPanelOpenRequest {
  sessionId?: ID
}

export interface CatDraftAttachment {
  attachmentId: ID
  attachment_id?: ID
  filename: string
  originalName?: string
  mimeType?: string
  sizeBytes?: number
  kind?: AttachmentKind
  previewUrl?: string
}

export interface CatDraftState {
  sessionId: ID
  attachments: CatDraftAttachment[]
  updatedAt: UnixMs
}

export interface CatDraftChangedEvent {
  sessionId?: ID
  draft: CatDraftState | null
  source?: string
  updatedAt?: UnixMs
}

export interface CatDraftRequest {
  sessionId?: ID
}

export interface CatDraftStageRequest {
  sessionId: ID
  attachments: CatDraftAttachment[]
}

export interface CatDraftClearRequest {
  sessionId: ID
  attachmentIds?: ID[]
}

export type CatNotificationStatus = 'complete' | 'failed' | 'interrupted'

export interface CatNotificationEvent {
  id: ID
  status: CatNotificationStatus
  taskId: ID
  runId?: ID
  sessionId: ID
  resultMessageId?: ID
  title: string
  summaryPreview: string
  createdAt: UnixMs
}

export interface CatNotificationActionRequest {
  notificationId?: ID
  sessionId?: ID
}
