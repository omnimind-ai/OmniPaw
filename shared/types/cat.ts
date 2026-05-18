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
