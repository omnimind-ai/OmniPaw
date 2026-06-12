import { IPC_CHANNELS } from '@shared/constants'
import type {
  OmniInferDownloadAndActivateRequest,
  OmniInferLoadModelRequest,
} from '@shared/types/omniinfer'
import { registerLoggedIpcHandler } from './common'
import type { IpcHandlerOptions } from './types'

export function registerOmniInferIpcHandlers(options: IpcHandlerOptions): void {
  const manager = options.runtime.omniInferManager

  registerLoggedIpcHandler(options, IPC_CHANNELS.omniinfer.status, () => manager.status())
  registerLoggedIpcHandler(options, IPC_CHANNELS.omniinfer.catalog, () => manager.catalog())
  registerLoggedIpcHandler(
    options,
    IPC_CHANNELS.omniinfer.downloadAndActivate,
    (_event, request: OmniInferDownloadAndActivateRequest) =>
      manager.downloadAndActivate(request)
  )
  registerLoggedIpcHandler(
    options,
    IPC_CHANNELS.omniinfer.loadModel,
    (_event, request: OmniInferLoadModelRequest) => manager.loadModel(request)
  )
  registerLoggedIpcHandler(options, IPC_CHANNELS.omniinfer.stop, () => manager.stop())
}
