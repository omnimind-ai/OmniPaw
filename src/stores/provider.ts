import type {
  CreateProviderFromPresetRequest,
  DeleteProviderRequest,
  ProviderConfig,
  ProviderModel,
  ProviderOperationResult,
  SaveProviderRequest,
  SetSessionModelRequest,
} from '@shared/types/provider'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import {
  appBridge,
  type BridgeProviderConfig,
  type BridgeProviderPreset,
  type BridgeProviderRegistryChangedEvent,
  type BridgeProviderRegistryConfig,
  type BridgeProviderRegistryLoadResponse,
  type BridgeProviderRegistryModel,
  type BridgeProviderRegistryMutationResult,
  type BridgeProviderRegistrySelection,
  type BridgeProviderRegistrySource,
  type BridgeProviderRegistryStatus,
  type BridgeUnsubscribe,
  ensureElectronBridge,
  isFallbackBridge,
} from '@/bridge/app'

export interface ProviderModelRef {
  providerId: string
  modelId: string
}

export interface ProviderRegistrySettings {
  defaultModelRef?: ProviderModelRef
  fallbackModelRefs: ProviderModelRef[]
  titleModelRef?: ProviderModelRef
  streaming: boolean
}

export interface ProviderRegistryStatus {
  path?: string
  backupPath?: string
  exists?: boolean
  backupExists?: boolean
  loaded?: boolean
  version?: number
  recoverable?: boolean
  error?: unknown
}

export interface ProviderModelOption {
  key: string
  providerId: string
  providerName: string
  providerApi?: ProviderConfig['api']
  providerType?: ProviderConfig['type']
  baseUrl: string
  modelId: string
  modelName: string
  remoteId?: string
  enabled: boolean
  input: Array<'text' | 'image' | 'audio' | 'file'>
  supportsStreaming: boolean
  supportsTools: boolean
  supportsReasoning: boolean
  contextWindow?: number
  maxOutputTokens?: number
}

export interface ProviderDeleteResult extends ProviderOperationResult {
  nextSelection?: ProviderModelRef
  nextProviderId?: string
}

type ProviderRegistrySnapshot = {
  registry?: BridgeProviderRegistryConfig
  sources?: BridgeProviderRegistrySource[]
  providers?: BridgeProviderRegistrySource[]
  models?: BridgeProviderRegistryModel[]
  settings?: Partial<ProviderRegistrySettings> & {
    defaultProviderId?: string
    defaultModelId?: string
    fallbackModelIds?: string[]
  }
  status?: ProviderRegistryStatus
  nextSelection?: BridgeProviderRegistrySelection
}

type ProviderBridgeWithSettings = typeof appBridge.provider & {
  setSettings?: (
    settings: ProviderRegistrySettings
  ) => Promise<BridgeProviderRegistryMutationResult>
}

const emptyRegistrySettings = (): ProviderRegistrySettings => ({
  defaultModelRef: undefined,
  fallbackModelRefs: [],
  titleModelRef: undefined,
  streaming: true,
})

export const useProviderStore = defineStore('provider', () => {
  const providers = ref<ProviderConfig[]>([])
  const rawProviders = ref<BridgeProviderConfig[]>([])
  const registryModels = ref<BridgeProviderRegistryModel[]>([])
  const registrySettings = ref<ProviderRegistrySettings>(emptyRegistrySettings())
  const registryStatus = ref<ProviderRegistryStatus | null>(null)
  const providerPresets = ref<BridgeProviderPreset[]>([])
  const loading = ref(false)
  const presetsLoading = ref(false)
  const testing = ref<Record<string, boolean>>({})
  const saving = ref(false)
  const persistenceAvailable = computed(() => !isFallbackBridge)
  let unsubscribeProviderChanges: BridgeUnsubscribe | undefined

  const sources = computed(() => rawProviders.value)
  const models = computed(() => registryModels.value)
  const defaultModelKey = computed(() => modelRefToKey(registrySettings.value.defaultModelRef))
  const fallbackModelKeys = computed(() =>
    registrySettings.value.fallbackModelRefs.map(modelRefToKey).filter(Boolean)
  )
  const titleModelKey = computed(() => modelRefToKey(registrySettings.value.titleModelRef))

  const modelOptions = computed<ProviderModelOption[]>(() =>
    registryModels.value.map((model) => {
      const provider = rawProviders.value.find((source) => source.id === model.providerId)
      const input = modelInputModalities(model) as Array<'text' | 'image' | 'audio' | 'file'>
      const supportsTools = Boolean(
        model.supportsTools || model.capabilities?.tools || model.capabilities?.toolCall
      )
      const supportsReasoning = Boolean(model.supportsReasoning || model.capabilities?.reasoning)

      return {
        key: modelRefToKey({ providerId: model.providerId, modelId: model.id }),
        providerId: model.providerId,
        providerName: provider?.name || model.providerId,
        providerApi: provider?.api,
        providerType: mapProviderType(provider?.type || provider?.api),
        baseUrl: provider?.baseUrl || '',
        modelId: model.id,
        modelName: model.displayName || model.name || model.id,
        remoteId: model.remoteId || model.id,
        enabled: provider?.enabled !== false && model.enabled !== false,
        input,
        supportsStreaming: model.supportsStreaming !== false,
        supportsTools,
        supportsReasoning,
        contextWindow: model.contextWindow,
        maxOutputTokens: model.maxOutputTokens,
      }
    })
  )

  const enabledModelOptions = computed(() => modelOptions.value.filter((option) => option.enabled))

  async function loadProviders(): Promise<void> {
    loading.value = true
    try {
      const bridge = providerBridge()
      const snapshot = bridge.load ? await bridge.load() : await legacySnapshot()
      reconcileRegistrySnapshot(snapshot)
      await refreshRegistryStatus()
      subscribeToProviderChanges()
    } finally {
      loading.value = false
    }
  }

  async function refreshRegistryStatus(): Promise<ProviderRegistryStatus | null> {
    const status = await providerBridge().status?.()
    registryStatus.value = normalizeRegistryStatus(status ?? registryStatus.value)
    return registryStatus.value
  }

  async function loadProviderPresets(): Promise<void> {
    presetsLoading.value = true
    try {
      providerPresets.value = (await appBridge.provider.listPresets?.()) ?? []
    } finally {
      presetsLoading.value = false
    }
  }

  async function createProviderFromPreset(
    request: CreateProviderFromPresetRequest | string
  ): Promise<ProviderConfig | undefined> {
    saving.value = true
    try {
      ensureElectronBridge('添加 Provider')
      if (!appBridge.provider.createFromPreset) {
        throw new Error(
          '当前 Electron bridge 缺少 provider.createFromPreset，无法从预设添加 Provider。'
        )
      }

      const saved = await appBridge.provider.createFromPreset(
        typeof request === 'string' ? request : { presetId: request.presetId }
      )
      if (!saved) {
        throw new Error('Provider 预设保存后没有返回有效结果。')
      }

      await loadProviders()
      return saved
    } finally {
      saving.value = false
    }
  }

  async function refreshModels(providerId: string): Promise<ProviderModel[]> {
    ensureElectronBridge('刷新模型')
    if (!appBridge.provider.refreshModels) {
      throw new Error('当前 Electron bridge 缺少 provider.refreshModels，无法刷新模型。')
    }

    const refreshedModels = await appBridge.provider.refreshModels(providerId)
    await loadProviders()
    return refreshedModels
  }

  async function saveProvider(request: SaveProviderRequest): Promise<ProviderConfig | undefined> {
    saving.value = true
    try {
      ensureElectronBridge('保存 Provider')
      if (!appBridge.provider.upsert) {
        throw new Error('当前 Electron bridge 缺少 provider.upsert，无法保存 Provider。')
      }

      const saved = await appBridge.provider.upsert(toIpcPayload(request))
      if (!saved) {
        throw new Error('Provider 保存后没有返回有效结果。')
      }

      await loadProviders()
      return saved
    } finally {
      saving.value = false
    }
  }

  async function deleteProvider(
    request: DeleteProviderRequest | string
  ): Promise<ProviderDeleteResult | undefined> {
    ensureElectronBridge('删除 Provider')
    const bridge = providerBridge()
    const providerId = typeof request === 'string' ? request : request.providerId
    const nextBeforeDelete = nextSelectionAfterProviderDelete(providerId)
    const result = bridge.deleteSource
      ? await bridge.deleteSource(request)
      : await legacyDeleteProvider(request)
    const operationResult = isProviderOperationResult(result) ? result : undefined
    const nextFromResult = isRegistryMutationResult(result)
      ? normalizeSelection(result.nextSelection)
      : undefined

    await loadProviders()

    return {
      ok: operationResult?.ok ?? true,
      error: operationResult?.error,
      nextSelection: nextFromResult ?? nextBeforeDelete,
      nextProviderId: nextFromResult?.providerId ?? nextBeforeDelete?.providerId,
    }
  }

  async function setDefaultModelKey(key: string): Promise<void> {
    const nextDefault = parseModelKey(key)
    const nextSettings: ProviderRegistrySettings = {
      ...registrySettings.value,
      defaultModelRef: nextDefault,
      fallbackModelRefs: registrySettings.value.fallbackModelRefs.filter(
        (ref) => modelRefToKey(ref) !== modelRefToKey(nextDefault)
      ),
    }

    await saveRegistrySettings(nextSettings, async () => {
      const result = await providerBridge().setDefaultModel?.(nextDefault ?? {})
      return result
    })
  }

  async function setFallbackModelKeys(keys: string[]): Promise<void> {
    const defaultKey = defaultModelKey.value
    const refs = keys
      .filter((key) => key && key !== defaultKey)
      .map(parseModelKey)
      .filter((ref): ref is ProviderModelRef => Boolean(ref))
      .filter((ref) =>
        enabledModelOptions.value.some((option) => option.key === modelRefToKey(ref))
      )

    await saveRegistrySettings(
      {
        ...registrySettings.value,
        fallbackModelRefs: dedupeModelRefs(refs),
      },
      async () => providerBridge().setFallbackModels?.({ models: dedupeModelRefs(refs) })
    )
  }

  async function setTitleModelKey(key: string): Promise<void> {
    const nextTitleModel = parseModelKey(key)
    const nextSettings: ProviderRegistrySettings = {
      ...registrySettings.value,
      titleModelRef: nextTitleModel,
    }

    await saveRegistrySettings(nextSettings, async () =>
      providerBridge().setTitleModel?.(nextTitleModel ?? {})
    )
  }

  async function setStreaming(streaming: boolean): Promise<void> {
    await saveRegistrySettings({
      ...registrySettings.value,
      streaming,
    })
  }

  async function listModels(providerId: string): Promise<ProviderModel[]> {
    return (await appBridge.provider.listModels?.(providerId)) ?? []
  }

  async function setSessionModel(request: SetSessionModelRequest) {
    ensureElectronBridge('设置会话模型')
    if (!appBridge.provider.setSessionModel) {
      throw new Error('当前 Electron bridge 缺少 provider.setSessionModel，无法设置会话模型。')
    }

    return await appBridge.provider.setSessionModel(request)
  }

  async function testProvider(providerId: string, modelId?: string) {
    testing.value = { ...testing.value, [providerId]: true }
    try {
      ensureElectronBridge('测试 Provider')
      if (!appBridge.provider.test) {
        throw new Error('当前 Electron bridge 缺少 provider.test，无法测试 Provider。')
      }

      return await appBridge.provider.test(providerId, modelId)
    } finally {
      testing.value = { ...testing.value, [providerId]: false }
    }
  }

  function subscribeToProviderChanges(): void {
    if (unsubscribeProviderChanges || !providerBridge().onChanged) {
      return
    }

    unsubscribeProviderChanges = providerBridge().onChanged?.((event) => {
      reconcileRegistrySnapshot(event)
    })
  }

  function stopProviderSubscription(): void {
    unsubscribeProviderChanges?.()
    unsubscribeProviderChanges = undefined
  }

  return {
    providers,
    rawProviders,
    sources,
    models,
    registryModels,
    registrySettings,
    registryStatus,
    providerPresets,
    modelOptions,
    enabledModelOptions,
    defaultModelKey,
    fallbackModelKeys,
    titleModelKey,
    loading,
    presetsLoading,
    saving,
    testing,
    persistenceAvailable,
    loadProviders,
    refreshRegistryStatus,
    loadProviderPresets,
    createProviderFromPreset,
    refreshModels,
    saveProvider,
    deleteProvider,
    setDefaultModelKey,
    setFallbackModelKeys,
    setTitleModelKey,
    setStreaming,
    listModels,
    setSessionModel,
    testProvider,
    subscribeToProviderChanges,
    stopProviderSubscription,
  }

  async function legacySnapshot(): Promise<BridgeProviderRegistryLoadResponse> {
    return await appBridge.provider.load()
  }

  async function legacyDeleteProvider(
    request: DeleteProviderRequest | string
  ): Promise<ProviderOperationResult> {
    if (!appBridge.provider.delete) {
      throw new Error('当前 Electron bridge 缺少 provider.delete，无法删除 Provider。')
    }

    return await appBridge.provider.delete(request)
  }

  async function saveRegistrySettings(
    nextSettings: ProviderRegistrySettings,
    operation?: () => Promise<BridgeProviderRegistryMutationResult | undefined>
  ): Promise<void> {
    saving.value = true
    try {
      ensureElectronBridge('保存 Provider 默认模型')
      const result =
        (operation ? await operation() : undefined) ??
        (await providerBridgeWithSettings().setSettings?.(toIpcPayload(nextSettings)))

      if (isRegistryMutationResult(result)) {
        reconcileRegistrySnapshot(result)
      } else {
        registrySettings.value = normalizeRegistrySettings(result ?? nextSettings)
      }
    } finally {
      saving.value = false
    }
  }

  function reconcileRegistrySnapshot(
    snapshot:
      | BridgeProviderRegistryLoadResponse
      | BridgeProviderRegistryMutationResult
      | BridgeProviderRegistryChangedEvent
      | ProviderRegistrySnapshot
      | BridgeProviderRegistryConfig
  ) {
    const registry = isRegistryConfig(snapshot)
      ? snapshot
      : (snapshot.registry ?? {
          version: 1,
          sources: snapshot.sources ?? snapshot.providers ?? [],
          models: snapshot.models ?? [],
          settings: snapshot.settings ?? emptyRegistrySettings(),
        })

    const nextSources = attachModelsToSources(
      clone(registry.sources ?? []),
      clone(registry.models ?? [])
    )
    const nextModels = clone(registry.models ?? [])

    rawProviders.value = nextSources
    registryModels.value = nextModels
    providers.value = rawProviders.value.flatMap(mapBridgeProvider)
    registrySettings.value = normalizeRegistrySettings(registry.settings ?? registrySettings.value)
    registryStatus.value = normalizeRegistryStatus(snapshot.status ?? registryStatus.value)
  }

  function nextSelectionAfterProviderDelete(providerId: string): ProviderModelRef | undefined {
    return registryModels.value
      .filter((model) => model.providerId !== providerId)
      .map((model) => ({ providerId: model.providerId, modelId: model.id }))[0]
  }
})

function providerBridge(): typeof appBridge.provider {
  return appBridge.provider
}

function providerBridgeWithSettings(): ProviderBridgeWithSettings {
  return appBridge.provider as ProviderBridgeWithSettings
}

function mapBridgeProvider(provider: BridgeProviderConfig): ProviderConfig[] {
  const models = provider.models?.length ? provider.models : []
  if (!models.length) return []

  return models.map((model) => {
    const input = modelInputModalities(model) as Array<'text' | 'image' | 'audio' | 'file'>
    const supportsTools = Boolean(
      model.supportsTools || model.capabilities?.tools || model.capabilities?.toolCall
    )
    const supportsReasoning = Boolean(model.supportsReasoning || model.capabilities?.reasoning)

    return {
      id: provider.id,
      name: provider.name,
      api: provider.api,
      type: mapProviderType(provider.type || provider.api),
      baseUrl: provider.baseUrl || '',
      enabled: provider.enabled !== false && model.enabled !== false,
      models: [
        {
          id: model.id,
          providerId: provider.id,
          name: model.displayName || model.name || model.id,
          remoteId: model.remoteId || model.id,
          enabled: model.enabled !== false,
          input,
          supportsStreaming: model.supportsStreaming !== false,
          supportsTools,
          supportsReasoning,
          contextWindow: model.contextWindow,
          maxOutputTokens: model.maxOutputTokens,
          compat: model.compat,
        },
      ],
      model: model.id,
      enable: provider.enabled !== false && model.enabled !== false,
      model_metadata: {
        modalities: {
          input,
        },
        tool_call: supportsTools,
        reasoning: supportsReasoning,
      },
    } as ProviderConfig
  })
}

function attachModelsToSources(
  sources: BridgeProviderRegistrySource[],
  models: BridgeProviderRegistryModel[]
): BridgeProviderConfig[] {
  return sources.map((source) => ({
    ...source,
    models: models
      .filter((model) => model.providerId === source.id)
      .map(({ providerId: _providerId, providerSourceId: _providerSourceId, ...model }) => model),
  }))
}

function normalizeRegistrySettings(
  value: Partial<ProviderRegistrySettings> & {
    defaultProviderId?: string
    defaultModelId?: string
    fallbackModelIds?: string[]
  }
): ProviderRegistrySettings {
  const defaultModelRef =
    value.defaultModelRef ??
    (value.defaultProviderId && value.defaultModelId
      ? { providerId: value.defaultProviderId, modelId: value.defaultModelId }
      : undefined)

  const fallbackModelRefs =
    value.fallbackModelRefs ??
    value.fallbackModelIds?.map((modelId) => ({ providerId: '', modelId })).filter(Boolean) ??
    []

  return {
    defaultModelRef,
    fallbackModelRefs: dedupeModelRefs(fallbackModelRefs),
    titleModelRef: normalizeSelection(value.titleModelRef),
    streaming: value.streaming !== false,
  }
}

function normalizeSelection(
  selection: BridgeProviderRegistrySelection | undefined
): ProviderModelRef | undefined {
  if (!selection?.providerId || !selection.modelId) return undefined
  return {
    providerId: selection.providerId,
    modelId: selection.modelId,
  }
}

function normalizeRegistryStatus(
  value: ProviderRegistryStatus | BridgeProviderRegistryStatus | null | undefined
): ProviderRegistryStatus | null {
  if (!value) return null
  return {
    path: value.path,
    backupPath: value.backupPath,
    loaded: value.loaded,
    version: value.version,
    recoverable: value.recoverable,
    error: value.error,
    exists: value.exists,
    backupExists: value.backupExists,
  }
}

function dedupeModelRefs(refs: ProviderModelRef[]): ProviderModelRef[] {
  const seen = new Set<string>()
  return refs.filter((ref) => {
    const key = modelRefToKey(ref)
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function modelRefToKey(ref: ProviderModelRef | null | undefined): string {
  if (!ref?.providerId || !ref.modelId) return ''
  return `${ref.providerId}:${ref.modelId}`
}

export function parseModelKey(key: string): ProviderModelRef | undefined {
  const [providerId, ...modelIdParts] = key.split(':')
  const modelId = modelIdParts.join(':')
  if (!providerId || !modelId) return undefined
  return { providerId, modelId }
}

function isRegistryConfig(value: unknown): value is BridgeProviderRegistryConfig {
  return Boolean(
    value &&
      typeof value === 'object' &&
      'version' in value &&
      'sources' in value &&
      'models' in value &&
      'settings' in value
  )
}

function isRegistryMutationResult(value: unknown): value is BridgeProviderRegistryMutationResult {
  return Boolean(value && typeof value === 'object' && 'registry' in value && 'status' in value)
}

function isProviderOperationResult(value: unknown): value is ProviderOperationResult {
  return Boolean(value && typeof value === 'object' && 'ok' in value)
}

function mapProviderType(type?: string): ProviderConfig['type'] {
  if (type === 'ollama') return 'ollama'
  if (type === 'omniinfer') return 'omniinfer'
  return 'openai-compatible'
}

function toIpcPayload<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function modelInputModalities(model: { capabilities?: Record<string, unknown>; input?: unknown }) {
  const capabilities = model.capabilities || {}
  const input = model.input ?? capabilities.input
  if (Array.isArray(input)) return input.filter((item): item is string => typeof item === 'string')

  const modalities = ['text']
  if (capabilities.imageInput || capabilities.images || capabilities.vision)
    modalities.push('image')
  if (capabilities.audioInput || capabilities.audio) modalities.push('audio')
  return modalities
}
