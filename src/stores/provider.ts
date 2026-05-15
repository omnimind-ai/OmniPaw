import { defineStore } from 'pinia'
import { ref } from 'vue'

import { appBridge, type BridgeProviderConfig } from '@/bridge/app'
import type { ProviderConfig } from '@shared/types/provider'

export const useProviderStore = defineStore('provider', () => {
  const providers = ref<ProviderConfig[]>([])
  const rawProviders = ref<BridgeProviderConfig[]>([])
  const loading = ref(false)
  const testing = ref<Record<string, boolean>>({})

  async function loadProviders(): Promise<void> {
    loading.value = true
    try {
      rawProviders.value = await appBridge.provider.list()
      providers.value = rawProviders.value.flatMap(mapBridgeProvider)
    } finally {
      loading.value = false
    }
  }

  async function refreshModels(providerId: string): Promise<void> {
    await appBridge.provider.refreshModels?.(providerId)
    await loadProviders()
  }

  async function testProvider(providerId: string, modelId?: string) {
    testing.value = { ...testing.value, [providerId]: true }
    try {
      return await appBridge.provider.test?.(providerId, modelId)
    } finally {
      testing.value = { ...testing.value, [providerId]: false }
    }
  }

  return {
    providers,
    rawProviders,
    loading,
    testing,
    loadProviders,
    refreshModels,
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

  return models.map((model) => ({
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
        input: model.input || (modelInputModalities(model) as Array<'text' | 'image' | 'audio' | 'file'>),
        supportsStreaming: model.supportsStreaming !== false,
        supportsTools: Boolean(model.supportsTools || model.capabilities?.tools || model.capabilities?.toolCall),
        contextWindow: model.contextWindow,
      },
    ],
    model: model.id,
    enable: provider.enabled !== false && model.enabled !== false,
    model_metadata: {
      modalities: {
        input: modelInputModalities(model),
      },
      tool_call: Boolean(model.capabilities?.tools || model.capabilities?.toolCall),
      reasoning: Boolean(model.capabilities?.reasoning),
    },
  } as ProviderConfig))
}

function mapProviderType(type?: string): ProviderConfig['type'] {
  if (type === 'ollama') return 'ollama'
  if (type === 'omniinfer') return 'omniinfer'
  return 'openai-compatible'
}

function modelInputModalities(model: { capabilities?: Record<string, unknown>; input?: unknown }) {
  const capabilities = model.capabilities || {}
  const input = model.input ?? capabilities.input
  if (Array.isArray(input)) return input.filter((item): item is string => typeof item === 'string')

  const modalities = ['text']
  if (capabilities.imageInput || capabilities.images || capabilities.vision) modalities.push('image')
  if (capabilities.audioInput || capabilities.audio) modalities.push('audio')
  return modalities
}
