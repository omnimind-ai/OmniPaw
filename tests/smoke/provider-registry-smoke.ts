import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { ConfigStore } from '../../core/config/store'
import type { InstalledModelRegistry } from '../../core/omniinfer/installed-models'
import type { OmniInferRuntimeService } from '../../core/omniinfer/runtime-service'
import { ProviderManager } from '../../core/provider/manager'
import {
  MODELS_DEV_METADATA_URL,
  OPENAI_COMPATIBLE_FALLBACK_CONTEXT_WINDOW,
} from '../../core/provider/models-dev-metadata'
import { AnthropicCompatibleProvider } from '../../core/provider/providers/anthropic'
import { OpenAICompatibleProvider } from '../../core/provider/providers/openai'
import { ProviderRegistryStore } from '../../core/provider/registry-store'

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  })
}

function requestUrl(input: Parameters<typeof fetch>[0]): string {
  if (typeof input === 'string') {
    return input
  }
  if (input instanceof URL) {
    return input.toString()
  }
  return input.url
}

const tempDir = mkdtempSync(join(tmpdir(), 'omnipaw-provider-registry-smoke-'))

try {
  const fakeOpenAiFetch: typeof fetch = async (input) => {
    const url = requestUrl(input)
    if (url === 'https://metadata.example/v1/models') {
      return jsonResponse({
        data: [
          { id: 'gpt-4o-mini' },
          {
            id: 'inline-context-model',
            context_length: 64000,
            max_completion_tokens: 4096,
            supported_parameters: ['tools'],
            architecture: { input_modalities: ['text', 'image'] },
          },
          { id: 'custom-missing-metadata' },
        ],
      })
    }
    if (url === MODELS_DEV_METADATA_URL) {
      return jsonResponse({
        openai: {
          models: {
            'gpt-4o-mini': {
              id: 'gpt-4o-mini',
              reasoning: true,
              tool_call: true,
              modalities: { input: ['text', 'image'], output: ['text'] },
              limit: { context: 128000, output: 16384 },
            },
          },
        },
      })
    }
    throw new Error(`Unexpected fetch URL: ${url}`)
  }
  const metadataProvider = new OpenAICompatibleProvider({
    id: 'metadata-test',
    baseUrl: 'https://metadata.example/v1',
    fetch: fakeOpenAiFetch,
  })
  const detectedModels = await metadataProvider.listModels()
  const detectedGpt = detectedModels.find((model) => model.id === 'gpt-4o-mini')
  assert.equal(detectedGpt?.contextWindow, 128000)
  assert.equal(detectedGpt?.maxOutputTokens, 16384)
  assert.deepEqual(detectedGpt?.input, ['text', 'image'])
  assert.equal(detectedGpt?.supportsTools, true)
  assert.equal(detectedGpt?.supportsReasoning, true)
  const detectedInline = detectedModels.find((model) => model.id === 'inline-context-model')
  assert.equal(detectedInline?.contextWindow, 64000)
  assert.equal(detectedInline?.maxOutputTokens, 4096)
  assert.deepEqual(detectedInline?.input, ['text', 'image'])
  assert.equal(detectedInline?.supportsTools, true)
  const detectedFallback = detectedModels.find((model) => model.id === 'custom-missing-metadata')
  assert.equal(detectedFallback?.contextWindow, OPENAI_COMPATIBLE_FALLBACK_CONTEXT_WINDOW)

  const registryStore = new ProviderRegistryStore({ appDataPath: tempDir })
  const configStore = new ConfigStore({ appDataPath: tempDir, appName: 'settings' })
  let cleanedSessionRefs: { providerId: string; modelIds?: string[] } | undefined
  const localSmallModel = {
    id: 'local-small-model',
    name: 'local-small-model.gguf',
    displayName: 'Local Small Model',
    path: join(tempDir, 'local-small-model.gguf'),
    sizeBytes: 1,
    mtimeMs: Date.now(),
    missing: false,
  }
  const providers = new ProviderManager({
    configStore,
    registryStore,
    sessions: {
      async getProviderOverride() {
        return undefined
      },
      async clearProviderOverrides(input) {
        cleanedSessionRefs = input
        return 1
      },
    },
    omniInferRuntimeService: {
      setBaseUrl() {},
      setModelsDir() {},
      async ensureModelLoaded() {},
    } as unknown as OmniInferRuntimeService,
    omniInferInstalledModels: {
      async scan() {
        return [localSmallModel]
      },
      list() {
        return [localSmallModel]
      },
      resolveModelPath(modelId: string) {
        return modelId === localSmallModel.id ? localSmallModel.path : undefined
      },
    } as unknown as InstalledModelRegistry,
  })

  const empty = registryStore.load()
  assert.equal(empty.sources.length, 0)
  assert.equal(empty.models.length, 0)
  assert.equal(empty.settings.defaultProviderId, undefined)
  assert.equal(empty.settings.defaultModelId, undefined)
  assert.deepEqual(empty.settings.fallbackModelRefs, [])
  assert.match(readFileSync(registryStore.registryPath, 'utf8'), /"sources": \[\]/)

  const openAiPreset = await providers.createFromPreset('openai-compatible')
  assert.equal(openAiPreset.models.length, 0)
  assert.equal(openAiPreset.defaultModelId, undefined)

  const firstLocalPreset = await providers.createFromPreset('omniinfer-local')
  const secondLocalPreset = await providers.createFromPreset('omniinfer-local')
  assert.equal(firstLocalPreset.id, 'omniinfer-local')
  assert.equal(firstLocalPreset.models[0]?.id, 'local-small-model')
  assert.equal(secondLocalPreset.id, 'omniinfer-local_1')
  assert.equal(secondLocalPreset.models[0]?.id, 'local-small-model')

  const saved = await providers.upsert({
    provider: {
      id: 'custom-openai',
      name: 'Custom OpenAI',
      type: 'openai-compatible',
      api: 'openai-chat-completions',
      baseUrl: 'https://example.test/v1',
      enabled: true,
      credentialRef: 'custom-openai:default',
      authHeader: 'Authorization',
      headers: {},
      extraBody: {},
      capabilities: {},
      models: [
        {
          id: 'gpt-4o-mini',
          name: 'GPT-4o Mini',
          enabled: true,
        },
        {
          id: 'gpt-4o-mini-pro',
          name: 'GPT-4o Mini Pro',
          enabled: true,
          input: ['text'],
        },
      ],
    },
    credential: {
      type: 'api-key',
      label: 'Primary Key',
      value: 'sk-test-secret',
    },
  })
  assert.equal(saved?.models.length, 2)
  assert.equal(saved?.models[0]?.providerId, 'custom-openai')
  assert.equal(JSON.stringify(saved).includes('sk-test-secret'), false)
  assert.equal((await providers.get('custom-openai'))?.models.length, 2)
  assert.equal(JSON.stringify(await providers.list()).includes('sk-test-secret'), false)
  assert.equal(registryStore.get().settings.defaultModelId, undefined)

  const originalFetch = globalThis.fetch
  const fakeRegistryFetch: typeof fetch = async (input) => {
    const url = requestUrl(input)
    if (url === 'https://example.test/v1/models') {
      return jsonResponse({
        data: [{ id: 'gpt-4o-mini' }, { id: 'gpt-4o-mini-pro' }],
      })
    }
    if (url === MODELS_DEV_METADATA_URL) {
      return jsonResponse({
        openai: {
          models: {
            'gpt-4o-mini': {
              id: 'gpt-4o-mini',
              tool_call: true,
              reasoning: true,
              modalities: { input: ['text', 'image'], output: ['text'] },
              limit: { context: 111111, output: 2222 },
            },
          },
        },
      })
    }
    throw new Error(`Unexpected fetch URL: ${url}`)
  }
  globalThis.fetch = fakeRegistryFetch
  try {
    const refreshedOpenAi = await providers.refreshModels('custom-openai')
    const refreshedGpt = refreshedOpenAi.find((model) => model.id === 'gpt-4o-mini')
    assert.equal(refreshedGpt?.contextWindow, 111111)
    assert.equal(refreshedGpt?.maxOutputTokens, 2222)
    assert.equal(refreshedGpt?.supportsTools, true)
    assert.equal(refreshedGpt?.supportsReasoning, true)
    assert.deepEqual(refreshedGpt?.input, ['text', 'image'])
    const refreshedFallback = refreshedOpenAi.find((model) => model.id === 'gpt-4o-mini-pro')
    assert.equal(refreshedFallback?.contextWindow, OPENAI_COMPATIBLE_FALLBACK_CONTEXT_WINDOW)
  } finally {
    globalThis.fetch = originalFetch
  }

  await assert.rejects(
    () =>
      providers.setObservationModels({
        observationVisionModelRef: { providerId: 'custom-openai', modelId: 'gpt-4o-mini-pro' },
      }),
    /must support image input/
  )

  await providers.setDefaultModel({ providerId: 'custom-openai', modelId: 'gpt-4o-mini' })
  assert.equal(registryStore.get().settings.defaultProviderId, 'custom-openai')
  assert.equal(registryStore.get().settings.defaultModelId, 'gpt-4o-mini')

  await providers.setFallbackModels([
    { providerId: 'omniinfer-local', modelId: 'local-small-model' },
    { providerId: 'omniinfer-local_1', modelId: 'local-small-model' },
  ])
  assert.deepEqual(registryStore.get().settings.fallbackModelRefs, [
    { providerId: 'omniinfer-local', modelId: 'local-small-model' },
    { providerId: 'omniinfer-local_1', modelId: 'local-small-model' },
  ])

  await providers.setObservationModels({
    observationVisionModelRef: { providerId: 'custom-openai', modelId: 'gpt-4o-mini' },
    observationReactionModelRef: { providerId: 'omniinfer-local', modelId: 'local-small-model' },
  })
  assert.deepEqual(registryStore.get().settings.observationVisionModelRef, {
    providerId: 'custom-openai',
    modelId: 'gpt-4o-mini',
  })
  assert.deepEqual(registryStore.get().settings.observationReactionModelRef, {
    providerId: 'omniinfer-local',
    modelId: 'local-small-model',
  })

  await providers.setObservationModels({
    observationVisionModelRef: { providerId: 'custom-openai', modelId: 'gpt-4o-mini' },
    observationReactionModelRef: { providerId: 'custom-openai', modelId: 'gpt-4o-mini' },
  })
  assert.deepEqual(registryStore.get().settings.observationReactionModelRef, {
    providerId: 'custom-openai',
    modelId: 'gpt-4o-mini',
  })
  await providers.setObservationModels({
    observationVisionModelRef: { providerId: 'custom-openai', modelId: 'gpt-4o-mini' },
    observationReactionModelRef: { providerId: 'omniinfer-local', modelId: 'local-small-model' },
  })

  const refreshed = await providers.refreshModels('omniinfer-local')
  assert.equal(refreshed.length, 1)
  assert.equal(refreshed[0]?.id, 'local-small-model')
  assert.equal(registryStore.get().settings.defaultProviderId, 'custom-openai')

  const resolvedBeforeDelete = await providers.resolveDefaultProvider()
  assert.equal(resolvedBeforeDelete.provider.id, 'custom-openai')
  assert.equal(resolvedBeforeDelete.modelId, 'gpt-4o-mini')

  const deleteResult = await providers.deleteWithSelection('custom-openai')
  assert.equal(deleteResult.deleted, true)
  assert.deepEqual(cleanedSessionRefs, {
    providerId: 'custom-openai',
    modelIds: ['gpt-4o-mini', 'gpt-4o-mini-pro'],
  })
  assert.deepEqual(deleteResult.nextSelection, {
    providerId: 'omniinfer-local',
    modelId: 'local-small-model',
  })
  assert.equal(registryStore.get().settings.defaultProviderId, undefined)
  assert.equal(registryStore.get().settings.defaultModelId, undefined)
  assert.equal(registryStore.get().settings.observationVisionModelRef, undefined)
  assert.deepEqual(registryStore.get().settings.observationReactionModelRef, {
    providerId: 'omniinfer-local',
    modelId: 'local-small-model',
  })
  assert.deepEqual(registryStore.get().settings.fallbackModelRefs, [
    { providerId: 'omniinfer-local', modelId: 'local-small-model' },
    { providerId: 'omniinfer-local_1', modelId: 'local-small-model' },
  ])

  await providers.setObservationModels({
    observationReactionModelRef: { providerId: 'omniinfer-local_1', modelId: 'local-small-model' },
  })
  await providers.deleteModel({ providerId: 'omniinfer-local_1', modelId: 'local-small-model' })
  assert.equal(registryStore.get().settings.observationReactionModelRef, undefined)

  const runtimeFallback = await providers.resolveDefaultProvider()
  assert.equal(runtimeFallback.provider.id, 'omniinfer-local')
  assert.equal(runtimeFallback.modelId, 'local-small-model')
  assert.equal(registryStore.get().settings.defaultProviderId, undefined)
  assert.equal(registryStore.get().settings.defaultModelId, undefined)

  const codexPreset = await providers.createFromPreset('openai-codex')
  assert.equal(codexPreset.id, 'openai-codex')
  assert.equal(codexPreset.type, 'openai-codex')
  assert.equal(codexPreset.api, 'openai-codex-responses')
  assert.equal(codexPreset.models.length, 0)

  const anthropicPreset = await providers.createFromPreset('anthropic-compatible')
  assert.equal(anthropicPreset.id, 'anthropic-compatible')
  assert.equal(anthropicPreset.type, 'anthropic-compatible')
  assert.equal(anthropicPreset.api, 'anthropic-messages')
  assert.equal(anthropicPreset.authHeader, 'x-api-key')
  assert.equal(anthropicPreset.models.length, 0)
  assert.equal(
    (await providers.createProviderClient(anthropicPreset.id)) instanceof
      AnthropicCompatibleProvider,
    true
  )

  console.log('Provider registry smoke check passed')
} finally {
  rmSync(tempDir, { recursive: true, force: true })
}
