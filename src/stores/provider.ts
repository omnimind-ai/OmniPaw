import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import {
  appBridge,
  ensureElectronBridge,
  isFallbackBridge,
  type BridgeProviderConfig,
  type BridgeProviderPreset,
} from '@/bridge/app'
import type {
  DeleteProviderRequest,
  CreateProviderFromPresetRequest,
  ProviderConfig,
  ProviderModel,
  ProviderOperationResult,
  SaveProviderRequest,
  SetSessionModelRequest,
} from '@shared/types/provider'

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

export const useProviderStore = defineStore('provider', () => {
  const providers = ref<ProviderConfig[]>([])
  const rawProviders = ref<BridgeProviderConfig[]>([])
  const providerPresets = ref<BridgeProviderPreset[]>([])
  const loading = ref(false)
  const presetsLoading = ref(false)
  const testing = ref<Record<string, boolean>>({})
  const saving = ref(false)
  const persistenceAvailable = computed(() => !isFallbackBridge)

  const modelOptions = computed<ProviderModelOption[]>(() =>
    rawProviders.value.flatMap((provider) => {
      const models = provider.models?.length
        ? provider.models
        : provider.defaultModelId
          ? [{ id: provider.defaultModelId, name: provider.defaultModelId }]
          : []

      return models.map((model) => {
        const input = modelInputModalities(model) as Array<'text' | 'image' | 'audio' | 'file'>
        const supportsTools = Boolean(
          model.supportsTools || model.capabilities?.tools || model.capabilities?.toolCall
        )
        const supportsReasoning = Boolean(model.supportsReasoning || model.capabilities?.reasoning)

        return {
          key: `${provider.id}:${model.id}`,
          providerId: provider.id,
          providerName: provider.name,
          providerApi: provider.api,
          providerType: mapProviderType(provider.type || provider.api),
          baseUrl: provider.baseUrl || '',
          modelId: model.id,
          modelName: model.displayName || model.name || model.id,
          remoteId: model.remoteId || model.id,
          enabled: provider.enabled !== false && model.enabled !== false,
          input,
          supportsStreaming: model.supportsStreaming !== false,
          supportsTools,
          supportsReasoning,
          contextWindow: model.contextWindow,
          maxOutputTokens: model.maxOutputTokens,
        }
      })
    })
  )

  const enabledModelOptions = computed(() => modelOptions.value.filter((option) => option.enabled))

  async function loadProviders(): Promise<void> {
    loading.value = true
    try {
      rawProviders.value = await appBridge.provider.list()
      providers.value = rawProviders.value.flatMap(mapBridgeProvider)
    } finally {
      loading.value = false
    }
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

    const models = await appBridge.provider.refreshModels(providerId)
    await loadProviders()
    return models
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
  ): Promise<ProviderOperationResult | undefined> {
    ensureElectronBridge('删除 Provider')
    if (!appBridge.provider.delete) {
      throw new Error('当前 Electron bridge 缺少 provider.delete，无法删除 Provider。')
    }

    const result = await appBridge.provider.delete(request)
    await loadProviders()
    return result
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

  return {
    providers,
    rawProviders,
    providerPresets,
    modelOptions,
    enabledModelOptions,
    loading,
    presetsLoading,
    saving,
    testing,
    persistenceAvailable,
    loadProviders,
    loadProviderPresets,
    createProviderFromPreset,
    refreshModels,
    saveProvider,
    deleteProvider,
    listModels,
    setSessionModel,
    testProvider,
  }
})

function mapBridgeProvider(provider: BridgeProviderConfig): ProviderConfig[] {
  const models = provider.models?.length
    ? provider.models
    : provider.defaultModelId
      ? [{ id: provider.defaultModelId, name: provider.defaultModelId }]
      : []

  if (!models.length) {
    return [
      {
        id: provider.id,
        name: provider.name,
        api: provider.api,
        type: mapProviderType(provider.type || provider.api),
        baseUrl: provider.baseUrl || '',
        enabled: provider.enabled !== false,
        models: [],
        model: provider.defaultModelId || '',
        enable: provider.enabled !== false,
      } as ProviderConfig,
    ]
  }

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

function mapProviderType(type?: string): ProviderConfig['type'] {
  if (type === 'ollama') return 'ollama'
  if (type === 'omniinfer') return 'omniinfer'
  return 'openai-compatible'
}

function toIpcPayload<T>(value: T): T {
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
