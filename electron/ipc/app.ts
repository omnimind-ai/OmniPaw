import { IPC_CHANNELS } from '@shared/constants'
import { registerLoggedIpcHandler } from './common'
import type { IpcHandlerOptions } from './types'

export function registerAppIpcHandlers(options: IpcHandlerOptions): void {
  registerLoggedIpcHandler(options, IPC_CHANNELS.app.getInfo, () => ({
    name: options.appName,
    version: options.appVersion,
    platform: options.platform,
  }))
}
