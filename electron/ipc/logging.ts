import { copyFile } from 'node:fs/promises'
import { basename } from 'node:path'
import { writeRendererLogRequest } from '@core/logging'
import { IPC_CHANNELS } from '@shared/constants'
import { dialog, ipcMain, shell } from 'electron'
import { registerLoggedIpcHandler } from './common'
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

  registerLoggedIpcHandler(options, IPC_CHANNELS.logging.openLocation, async () => {
    const status = options.logSink.status()
    if (status.filePath) {
      shell.showItemInFolder(status.filePath)
      return { opened: true, path: status.filePath, kind: 'file' as const }
    }

    if (!status.logDir) {
      return { opened: false }
    }

    const errorMessage = await shell.openPath(status.logDir)
    if (errorMessage) {
      throw new Error(errorMessage)
    }
    return { opened: true, path: status.logDir, kind: 'directory' as const }
  })

  registerLoggedIpcHandler(options, IPC_CHANNELS.logging.export, async () => {
    const status = options.logSink.status()
    if (!status.filePath) {
      return { exported: false, reason: 'unavailable' as const }
    }

    const result = await dialog.showSaveDialog({
      defaultPath: basename(status.filePath),
      filters: [
        { name: 'Log files', extensions: ['log', 'txt'] },
        { name: 'All files', extensions: ['*'] },
      ],
      properties: ['createDirectory', 'showOverwriteConfirmation'],
    })
    if (result.canceled || !result.filePath) {
      return { exported: false, canceled: true }
    }

    await copyFile(status.filePath, result.filePath)
    return {
      exported: true,
      sourcePath: status.filePath,
      destinationPath: result.filePath,
    }
  })
}
