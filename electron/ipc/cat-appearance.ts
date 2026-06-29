import { IPC_CHANNELS } from '@shared/constants'
import type {
  CatAppearanceImportResponse,
  CatAppearanceSetActiveRequest,
} from '@shared/types/cat-appearance'
import { BrowserWindow, dialog } from 'electron'
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
    IPC_CHANNELS.catAppearance.importPack,
    async (event): Promise<CatAppearanceImportResponse> => {
      const senderWindow = BrowserWindow.fromWebContents(event.sender) ?? undefined
      const result = senderWindow
        ? await dialog.showOpenDialog(senderWindow, catAppearancePackDialogOptions())
        : await dialog.showOpenDialog(catAppearancePackDialogOptions())
      if (result.canceled || result.filePaths.length === 0) {
        return {
          ...options.runtime.catAppearanceManager.list(),
          canceled: true,
        }
      }
      return options.runtime.catAppearanceManager.importFromDirectory(result.filePaths[0])
    }
  )
  registerLoggedIpcHandler(
    options,
    IPC_CHANNELS.catAppearance.setActive,
    (_event, request: CatAppearanceSetActiveRequest | string) =>
      options.runtime.catAppearanceManager.setActive(request)
  )
}

function catAppearancePackDialogOptions(): Electron.OpenDialogOptions {
  return {
    title: '选择小猫悬浮窗形象包目录',
    buttonLabel: '导入',
    properties: ['openDirectory'],
  }
}
