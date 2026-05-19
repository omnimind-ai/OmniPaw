import { ipcMain } from 'electron'
import type { IpcHandlerOptions } from './types'

export function registerLoggedIpcHandler<T extends unknown[]>(
  options: IpcHandlerOptions,
  channel: string,
  handler: (event: Electron.IpcMainInvokeEvent, ...args: T) => unknown
): void {
  ipcMain.handle(channel, async (event, ...args) => {
    const startedAt = Date.now()
    try {
      const result = await handler(event, ...(args as T))
      logIpcCompletion(options, channel, startedAt, result)
      return result
    } catch (error) {
      options.ipcLogger.error('IPC handler failed.', {
        channel,
        durationMs: Date.now() - startedAt,
        error,
      })
      throw error
    }
  })
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function logIpcCompletion(
  options: IpcHandlerOptions,
  channel: string,
  startedAt: number,
  result: unknown
): void {
  const durationMs = Date.now() - startedAt
  if (isIpcFailureResult(result)) {
    options.ipcLogger.warn('IPC handler returned failure.', {
      channel,
      durationMs,
      errorCode: typeof result.error?.code === 'string' ? result.error.code : undefined,
      recoverable:
        typeof result.error?.recoverable === 'boolean' ? result.error.recoverable : undefined,
    })
    return
  }

  options.ipcLogger.debug('IPC handler completed.', { channel, durationMs })
}

function isIpcFailureResult(
  value: unknown
): value is { ok: false; error?: { code?: unknown; recoverable?: unknown } } {
  return isRecord(value) && value.ok === false
}
