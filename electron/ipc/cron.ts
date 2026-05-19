import { IPC_CHANNELS } from '@shared/constants'
import { registerLoggedIpcHandler } from './common'
import type { IpcHandlerOptions } from './types'

export function registerCronIpcHandlers(options: IpcHandlerOptions): void {
  registerLoggedIpcHandler(options, IPC_CHANNELS.cron.list, () =>
    options.runtime.cronManager.list()
  )
}
