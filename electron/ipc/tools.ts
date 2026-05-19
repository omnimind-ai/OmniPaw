import { IPC_CHANNELS } from '@shared/constants'
import type { SetToolEnabledRequest } from '@shared/types/tool'
import { registerLoggedIpcHandler } from './common'
import type { IpcHandlerOptions } from './types'

export function registerToolIpcHandlers(options: IpcHandlerOptions): void {
  const runtime = options.runtime

  registerLoggedIpcHandler(options, IPC_CHANNELS.tools.list, () =>
    runtime.toolManagementService.list()
  )
  registerLoggedIpcHandler(
    options,
    IPC_CHANNELS.tools.setEnabled,
    (_event, request: SetToolEnabledRequest) =>
      runtime.toolManagementService.setEnabled(request.name, request.enabled)
  )
}
