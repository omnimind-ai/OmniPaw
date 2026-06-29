import { IPC_CHANNELS } from '@shared/constants'
import type { CatAppearanceSetActiveRequest } from '@shared/types/cat-appearance'
import { registerLoggedIpcHandler } from './common'
import type { IpcHandlerOptions } from './types'

export function registerCatAppearanceIpcHandlers(options: IpcHandlerOptions): void {
  registerLoggedIpcHandler(options, IPC_CHANNELS.catAppearance.current, () =>
    options.runtime.catAppearanceManager.current()
  )
  registerLoggedIpcHandler(options, IPC_CHANNELS.catAppearance.list, () =>
    options.runtime.catAppearanceManager.list()
  )
  registerLoggedIpcHandler(options, IPC_CHANNELS.catAppearance.refresh, () =>
    options.runtime.catAppearanceManager.refresh()
  )
  registerLoggedIpcHandler(
    options,
    IPC_CHANNELS.catAppearance.setActive,
    (_event, request: CatAppearanceSetActiveRequest | string) =>
      options.runtime.catAppearanceManager.setActive(request)
  )
}
