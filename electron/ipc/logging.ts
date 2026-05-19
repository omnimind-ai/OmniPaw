import { writeRendererLogRequest } from '@core/logging'
import { IPC_CHANNELS } from '@shared/constants'
import { ipcMain } from 'electron'
import type { IpcHandlerOptions } from './types'

export function registerLoggingIpcHandlers(options: IpcHandlerOptions): void {
  ipcMain.handle(IPC_CHANNELS.logging.write, (_event, request) => {
    const result = writeRendererLogRequest(options.rootLogger.child({ scope: 'renderer' }), request)
    const status = options.logSink.status()
    return {
      accepted: result.accepted,
      persisted: result.accepted && status.available,
      dropped: !result.accepted || !status.available,
      reason: result.reason ?? (status.available ? undefined : 'transport_unavailable'),
    }
  })

  ipcMain.handle(IPC_CHANNELS.logging.status, () => options.logSink.status())
}
