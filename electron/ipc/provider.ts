import { IPC_CHANNELS } from '@shared/constants'
import type {
  CreateProviderFromPresetRequest,
  DeleteProviderRequest,
  RefreshProviderModelsRequest,
  SaveProviderRequest,
  SetSessionModelRequest,
  TestProviderRequest,
} from '@shared/types/provider'
import { registerLoggedIpcHandler } from './common'
import type { IpcHandlerOptions } from './types'

export function registerProviderIpcHandlers(options: IpcHandlerOptions): void {
  const runtime = options.runtime

  registerLoggedIpcHandler(options, IPC_CHANNELS.provider.list, () =>
    runtime.providerManager.list()
  )
  registerLoggedIpcHandler(options, IPC_CHANNELS.provider.listPresets, () =>
    runtime.providerManager.listPresets()
  )
  registerLoggedIpcHandler(
    options,
    IPC_CHANNELS.provider.createFromPreset,
    (_event, request: CreateProviderFromPresetRequest | string) =>
      runtime.providerManager.createFromPreset(
        typeof request === 'string' ? request : request.presetId
      )
  )
  registerLoggedIpcHandler(
    options,
    IPC_CHANNELS.provider.upsert,
    (_event, request: SaveProviderRequest) => runtime.providerManager.upsert(request)
  )
  registerLoggedIpcHandler(
    options,
    IPC_CHANNELS.provider.delete,
    async (_event, request: DeleteProviderRequest | string) => {
      await runtime.providerManager.delete(
        typeof request === 'string' ? request : request.providerId
      )
      return { ok: true }
    }
  )
  registerLoggedIpcHandler(
    options,
    IPC_CHANNELS.provider.test,
    (_event, request: TestProviderRequest | string, modelId?: string) =>
      runtime.providerManager.test(
        typeof request === 'string' ? request : (request.providerId ?? request.provider?.id ?? ''),
        typeof request === 'string' ? modelId : request.modelId
      )
  )
  registerLoggedIpcHandler(
    options,
    IPC_CHANNELS.provider.listModels,
    (_event, providerId: string) => runtime.providerManager.listModels(providerId)
  )
  registerLoggedIpcHandler(
    options,
    IPC_CHANNELS.provider.refreshModels,
    async (_event, request: RefreshProviderModelsRequest | string) =>
      runtime.providerManager.refreshModels(
        typeof request === 'string' ? request : request.providerId
      )
  )
  registerLoggedIpcHandler(
    options,
    IPC_CHANNELS.provider.setSessionModel,
    (_event, request: SetSessionModelRequest) =>
      runtime.chatService.updateSession({
        sessionId: request.sessionId,
        defaultProviderId: request.providerId,
        defaultModelId: request.modelId,
      })
  )
}
