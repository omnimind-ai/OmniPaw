import { IPC_CHANNELS } from '@shared/constants'
import type { ShortcutStatusChangedEvent } from '@shared/types/shortcuts'
import { registerLoggedIpcHandler } from './common'
import type { IpcHandlerOptions } from './types'

export function registerShortcutIpcHandlers(options: IpcHandlerOptions): void {
  registerLoggedIpcHandler(options, IPC_CHANNELS.shortcuts.status, () => getStatus(options))
  registerLoggedIpcHandler(
    options,
    IPC_CHANNELS.shortcuts.setCaptureMode,
    (_event, enabled: boolean) => getController(options).setCaptureMode(Boolean(enabled))
  )
}

function getStatus(options: IpcHandlerOptions): ShortcutStatusChangedEvent {
  return getController(options).status()
}

function getController(options: IpcHandlerOptions) {
  if (!options.shortcutController) {
    throw new Error('Shortcut controller is not available.')
  }

  return options.shortcutController
}
