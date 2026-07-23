import type { CatPetGiftUnlock } from './cat-pet'
import type { AttachmentKind, ID, UnixMs } from './chat'
import type { ObservationReactionEvent } from './observation'

export type CatTaskState = 'idle' | 'preparing' | 'running' | 'completed'

export type CatWindowState = CatTaskState | 'hidden' | 'appearing' | 'dragging'

export type CatInteractionState = CatTaskState | 'dragging'

export type CatDockSide = 'left' | 'right'

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
  dockSide?: CatDockSide
  source?: string
}

export type CatBubbleKind = 'status' | 'observation' | 'gift'

export type CatBubbleDismissReason =
  | 'timeout'
  | 'close'
  | 'source-opened'
  | 'story-complete'
  | 'cat-hidden'
  | 'state-hidden'
  | 'replaced'

export interface CatBubbleShowRequest {
  id?: ID
  text: string
  kind?: CatBubbleKind
  observationReaction?: ObservationReactionEvent
  gift?: CatPetGiftUnlock
  autoDismissMs?: number
  source?: string
}

export interface CatBubbleEvent {
  id: ID
  text: string
  kind: CatBubbleKind
  visible: boolean
  observationReaction?: ObservationReactionEvent
  gift?: CatPetGiftUnlock
  autoDismissMs?: number
  source?: string
  createdAt: UnixMs
}

export interface CatBubbleDismissRequest {
  id?: ID
  reason?: CatBubbleDismissReason
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

export interface CatHitArea {
  x: number
  y: number
  width: number
  height: number
}

export interface CatHitGeometry {
  hitArea: CatHitArea
  visualAreas: Record<CatDockSide, CatHitArea>
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
  activate?: boolean
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
