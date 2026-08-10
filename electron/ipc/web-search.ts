import { IPC_CHANNELS } from '@shared/constants'
import type { SaveWebSearchSettingsRequest, TestWebSearchRequest } from '@shared/types/web-search'
import { registerLoggedIpcHandler } from './common'
import type { IpcHandlerOptions } from './types'

export function registerWebSearchIpcHandlers(options: IpcHandlerOptions): void {
  const manager = options.runtime.webSearchManager

  registerLoggedIpcHandler(options, IPC_CHANNELS.webSearch.getSettings, () => manager.getSettings())
  registerLoggedIpcHandler(
    options,
    IPC_CHANNELS.webSearch.saveSettings,
    (_event, request: SaveWebSearchSettingsRequest) => manager.saveSettings(request)
  )
  registerLoggedIpcHandler(
    options,
    IPC_CHANNELS.webSearch.test,
    (_event, request: TestWebSearchRequest) => manager.test(request)
  )
}
