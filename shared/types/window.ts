export interface DesktopWindowState {
  platform: string
  isMaximized: boolean
  isMaximizable: boolean
}

export type DesktopWindowStateChangedEvent = DesktopWindowState
