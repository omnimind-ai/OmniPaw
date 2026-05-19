import { IPC_CHANNELS } from '@shared/constants'
import type {
  DeleteProviderModelRequest,
  DeleteProviderSourceRequest,
  ProviderRegistryChangedEvent,
  ProviderRegistryChangeReason,
  ProviderRegistryLoadResponse,
  ProviderRegistryModel,
  ProviderRegistryMutationResult,
  ProviderRegistrySource,
  ProviderRegistryStatus,
  SetDefaultProviderModelRequest,
  SetFallbackProviderModelsRequest,
  UpsertProviderModelRequest,
  UpsertProviderSourceRequest,
} from '@shared/types/bridge'
import type {
  CreateProviderFromPresetRequest,
  DeleteProviderRequest,
  ProviderConfig,
  ProviderModel,
  RefreshProviderModelsRequest,
  SaveProviderRequest,
  SetSessionModelRequest,
  TestProviderRequest,
} from '@shared/types/provider'
import { registerLoggedIpcHandler } from './common'
import type { IpcHandlerOptions } from './types'

type Runtime = IpcHandlerOptions['runtime']

interface ProviderRegistryApi {
  load?: () => Promise<ProviderRegistryLoadResponse> | ProviderRegistryLoadResponse
  loadRegistry?: () => Promise<ProviderRegistryLoadResponse> | ProviderRegistryLoadResponse
  status?: () => Promise<ProviderRegistryStatus> | ProviderRegistryStatus
  registryStatus?: () => Promise<ProviderRegistryStatus> | ProviderRegistryStatus
  upsertSource?: (request: UpsertProviderSourceRequest) => Promise<ProviderRegistryMutationResult>
  upsertModel?: (request: UpsertProviderModelRequest) => Promise<ProviderRegistryMutationResult>
  deleteSource?: (
    request: DeleteProviderSourceRequest | string
  ) => Promise<ProviderRegistryMutationResult>
  deleteModel?: (request: DeleteProviderModelRequest) => Promise<ProviderRegistryMutationResult>
  setDefaultModel?: (
    request: SetDefaultProviderModelRequest
  ) => Promise<ProviderRegistryMutationResult>
  setFallbackModels?: (
    request: SetFallbackProviderModelsRequest
  ) => Promise<ProviderRegistryMutationResult>
  [method: string]: unknown
}

export function registerProviderIpcHandlers(options: IpcHandlerOptions): void {
  const runtime = options.runtime

  registerLoggedIpcHandler(options, IPC_CHANNELS.provider.load, () => loadProviderRegistry(runtime))
  registerLoggedIpcHandler(options, IPC_CHANNELS.provider.status, () =>
    providerRegistryStatus(runtime)
  )
  registerLoggedIpcHandler(options, IPC_CHANNELS.provider.list, () =>
    runtime.providerManager.list()
  )
  registerLoggedIpcHandler(options, IPC_CHANNELS.provider.listPresets, () =>
    runtime.providerManager.listPresets()
  )
  registerLoggedIpcHandler(
    options,
    IPC_CHANNELS.provider.createFromPreset,
    async (event, request: CreateProviderFromPresetRequest | string) => {
      const saved = await runtime.providerManager.createFromPreset(
        typeof request === 'string' ? request : request.presetId
      )
      await emitProviderChanged(event, runtime, 'save')
      return saved
    }
  )
  registerLoggedIpcHandler(
    options,
    IPC_CHANNELS.provider.upsertSource,
    async (event, request: UpsertProviderSourceRequest) => {
      const result = await callRegistryMutation(runtime, 'upsertSource', request)
      emitProviderChanged(event, runtime, 'save', result)
      return result
    }
  )
  registerLoggedIpcHandler(
    options,
    IPC_CHANNELS.provider.upsertModel,
    async (event, request: UpsertProviderModelRequest) => {
      const result = await callRegistryMutation(runtime, 'upsertModel', request)
      emitProviderChanged(event, runtime, 'save', result)
      return result
    }
  )
  registerLoggedIpcHandler(
    options,
    IPC_CHANNELS.provider.upsert,
    async (event, request: SaveProviderRequest) => {
      const saved = await runtime.providerManager.upsert(request)
      await emitProviderChanged(event, runtime, 'save')
      return saved
    }
  )
  registerLoggedIpcHandler(
    options,
    IPC_CHANNELS.provider.deleteSource,
    async (event, request: DeleteProviderSourceRequest | string) => {
      const result = await callRegistryMutation(runtime, 'deleteSource', request)
      emitProviderChanged(event, runtime, 'delete', result)
      return result
    }
  )
  registerLoggedIpcHandler(
    options,
    IPC_CHANNELS.provider.deleteModel,
    async (event, request: DeleteProviderModelRequest) => {
      const result = await callRegistryMutation(runtime, 'deleteModel', request)
      emitProviderChanged(event, runtime, 'delete', result)
      return result
    }
  )
  registerLoggedIpcHandler(
    options,
    IPC_CHANNELS.provider.delete,
    async (event, request: DeleteProviderRequest | string) => {
      await runtime.providerManager.delete(
        typeof request === 'string' ? request : request.providerId
      )
      await emitProviderChanged(event, runtime, 'delete')
      return { ok: true }
    }
  )
  registerLoggedIpcHandler(
    options,
    IPC_CHANNELS.provider.setDefaultModel,
    async (event, request: SetDefaultProviderModelRequest) => {
      const result = await callRegistryMutation(runtime, 'setDefaultModel', request)
      emitProviderChanged(event, runtime, 'default', result)
      return result
    }
  )
  registerLoggedIpcHandler(
    options,
    IPC_CHANNELS.provider.setFallbackModels,
    async (event, request: SetFallbackProviderModelsRequest) => {
      const result = await callRegistryMutation(runtime, 'setFallbackModels', request)
      emitProviderChanged(event, runtime, 'fallback', result)
      return result
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
    async (event, request: RefreshProviderModelsRequest | string) => {
      const models = await runtime.providerManager.refreshModels(
        typeof request === 'string' ? request : request.providerId
      )
      await emitProviderChanged(event, runtime, 'refresh')
      return models
    }
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

async function loadProviderRegistry(runtime: Runtime): Promise<ProviderRegistryLoadResponse> {
  const registryApi = runtime.providerManager as unknown as ProviderRegistryApi
  if (typeof registryApi.loadRegistry === 'function') {
    return registryApi.loadRegistry()
  }
  if (typeof registryApi.load === 'function') {
    return registryApi.load()
  }

  return legacyProviderRegistryResponse(runtime)
}

async function providerRegistryStatus(runtime: Runtime): Promise<ProviderRegistryStatus> {
  const registryApi = runtime.providerManager as unknown as ProviderRegistryApi
  if (typeof registryApi.registryStatus === 'function') {
    return registryApi.registryStatus()
  }
  if (typeof registryApi.status === 'function') {
    return registryApi.status()
  }

  return legacyProviderRegistryStatus(runtime)
}

async function callRegistryMutation(
  runtime: Runtime,
  method: keyof ProviderRegistryApi,
  request: unknown
): Promise<ProviderRegistryMutationResult> {
  const registryApi = runtime.providerManager as unknown as ProviderRegistryApi
  const candidate = registryApi[method]

  if (typeof candidate !== 'function') {
    throw new Error(
      `Provider registry API is not available: ${String(method)}. Apply the core provider registry slice first.`
    )
  }

  return (await candidate.call(registryApi, request)) as ProviderRegistryMutationResult
}

async function emitProviderChanged(
  event: Electron.IpcMainInvokeEvent,
  runtime: Runtime,
  reason: ProviderRegistryChangeReason,
  result?: ProviderRegistryMutationResult
): Promise<void> {
  const payload = result
    ? providerChangedEventFromResult(reason, result)
    : {
        reason,
        ...(await legacyProviderRegistryResponse(runtime)),
      }

  event.sender.send(IPC_CHANNELS.provider.changed, payload)
}

function providerChangedEventFromResult(
  reason: ProviderRegistryChangeReason,
  result: ProviderRegistryMutationResult
): ProviderRegistryChangedEvent {
  return {
    reason,
    registry: result.registry,
    status: result.status,
    nextSelection: result.nextSelection,
  }
}

async function legacyProviderRegistryResponse(
  runtime: Runtime
): Promise<ProviderRegistryLoadResponse> {
  const providers = await runtime.providerManager.list()
  const settings = legacyProviderSettings(runtime, providers)

  return {
    registry: {
      version: 1,
      sources: providers.map(legacyProviderSource),
      models: providers.flatMap((provider) =>
        (provider.models ?? []).map((model) => legacyProviderModel(provider.id, model))
      ),
      settings,
    },
    status: legacyProviderRegistryStatus(runtime),
  }
}

function legacyProviderRegistryStatus(runtime: Runtime): ProviderRegistryStatus {
  const status = runtime.configStore.status()

  return {
    path: '',
    backupPath: '',
    exists: false,
    backupExists: false,
    loaded: status.loaded,
    version: 1,
    recoverable: status.recoverable,
  }
}

function legacyProviderSettings(runtime: Runtime, providers: ProviderConfig[]) {
  const config = runtime.configStore.get() as {
    providers?: {
      settings?: {
        defaultModelId?: string
        fallbackModelIds?: string[]
        streaming?: boolean
      }
    }
  }
  const defaultModelId = config.providers?.settings?.defaultModelId || undefined
  const defaultProviderId = defaultModelId
    ? findProviderIdForModel(providers, defaultModelId)
    : undefined

  return {
    defaultProviderId,
    defaultModelId,
    fallbackModelRefs:
      config.providers?.settings?.fallbackModelIds
        ?.map((modelId) => {
          const providerId = findProviderIdForModel(providers, modelId)
          return providerId ? { providerId, modelId } : undefined
        })
        .filter(isDefined) ?? [],
    streaming: config.providers?.settings?.streaming ?? true,
  }
}

function legacyProviderSource(provider: ProviderConfig): ProviderRegistrySource {
  return {
    id: provider.id,
    name: provider.name,
    type: provider.type,
    api: provider.api,
    baseUrl: provider.baseUrl,
    enabled: provider.enabled,
    credentialRef: provider.credentialRef,
    authHeader: provider.authHeader,
    headers: provider.headers,
    extraBody: provider.extraBody,
    defaultModelId: provider.defaultModelId,
    capabilities: provider.capabilities,
    compat: provider.compat,
    createdAt: provider.createdAt,
    updatedAt: provider.updatedAt,
  }
}

function legacyProviderModel(providerId: string, model: ProviderModel): ProviderRegistryModel {
  return {
    ...model,
    providerId,
    providerSourceId: providerId,
    enabled: model.enabled !== false,
  }
}

function findProviderIdForModel(providers: ProviderConfig[], modelId: string): string | undefined {
  return providers.find((provider) => (provider.models ?? []).some((model) => model.id === modelId))
    ?.id
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined
}
