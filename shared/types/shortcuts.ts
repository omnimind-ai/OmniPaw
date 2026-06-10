export const SHORTCUT_ACTIONS = [
  'cat.toggleVisibility',
  'cat.openPanel',
  'app.zoomIn',
  'app.zoomOut',
  'app.zoomReset',
] as const

export const GLOBAL_SHORTCUT_ACTIONS = ['cat.toggleVisibility', 'cat.openPanel'] as const

export type ShortcutAction = (typeof SHORTCUT_ACTIONS)[number]
export type GlobalShortcutAction = (typeof GLOBAL_SHORTCUT_ACTIONS)[number]

export interface ShortcutBinding {
  enabled: boolean
  accelerator: string
}

export type ShortcutBindingMap = Record<ShortcutAction, ShortcutBinding>

export interface DesktopShortcutSettings {
  bindings: ShortcutBindingMap
}

export type ShortcutRegistrationState = 'registered' | 'disabled' | 'invalid' | 'conflict'

export interface ShortcutRegistrationStatus {
  action: ShortcutAction
  enabled: boolean
  accelerator: string
  state: ShortcutRegistrationState
  message?: string
  updatedAt: number
}

export interface ShortcutStatusChangedEvent {
  statuses: ShortcutRegistrationStatus[]
}
