import { mkdirSync } from 'node:fs'
import { resolveOpenOmniClawDataPaths } from '@core/utils/data-paths'
import { IPC_CHANNELS } from '@shared/constants'
import { shell } from 'electron'
import { isRecord, registerLoggedIpcHandler } from './common'
import type { IpcHandlerOptions } from './types'

export function registerAppIpcHandlers(options: IpcHandlerOptions): void {
  registerLoggedIpcHandler(options, IPC_CHANNELS.app.getInfo, () => ({
    name: options.appName,
    version: options.appVersion,
    platform: options.platform,
  }))
  registerLoggedIpcHandler(options, IPC_CHANNELS.app.openSettingsDirectory, async () => {
    const directory = resolveOpenOmniClawDataPaths({
      appDataPath: options.appDataPath,
    }).configRoot
    mkdirSync(directory, { recursive: true })

    const errorMessage = await shell.openPath(directory)
    if (errorMessage) {
      throw new Error(errorMessage)
    }

    return { opened: true, path: directory }
  })
  registerLoggedIpcHandler(
    options,
    IPC_CHANNELS.app.openChatSession,
    (_event, request: unknown) => {
      const sessionId = normalizeSessionId(request)
      if (!sessionId) {
        throw new Error('openChatSession requires sessionId.')
      }
      options.openChatSession?.(sessionId, normalizeKind(request))
    }
  )
}

function normalizeSessionId(request: unknown): string {
  if (typeof request === 'string') {
    return request.trim()
  }
  if (isRecord(request) && typeof request.sessionId === 'string') {
    return request.sessionId.trim()
  }
  return ''
}

function normalizeKind(request: unknown): 'chat' | 'tavern' | 'cat' | 'vision' | undefined {
  if (!isRecord(request)) {
    return undefined
  }
  return request.kind === 'tavern' ||
    request.kind === 'cat' ||
    request.kind === 'vision' ||
    request.kind === 'chat'
    ? request.kind
    : undefined
}
