import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { ConfigStore } from '../core/config/store'
import { ProviderManager } from '../core/provider/manager'
import { ProviderRegistryStore } from '../core/provider/registry-store'

const tempDir = mkdtempSync(join(tmpdir(), 'openomniclaw-provider-registry-smoke-'))

try {
  const registryStore = new ProviderRegistryStore({ appDataPath: tempDir })
  const configStore = new ConfigStore({ appDataPath: tempDir, appName: 'settings' })
  let cleanedSessionRefs: { providerId: string; modelIds?: string[] } | undefined
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
  assert.deepEqual(registryStore.get().settings.fallbackModelRefs, [
    { providerId: 'omniinfer-local', modelId: 'local-small-model' },
    { providerId: 'omniinfer-local_1', modelId: 'local-small-model' },
  ])

  const runtimeFallback = await providers.resolveDefaultProvider()
  assert.equal(runtimeFallback.provider.id, 'omniinfer-local')
  assert.equal(runtimeFallback.modelId, 'local-small-model')
  assert.equal(registryStore.get().settings.defaultProviderId, undefined)
  assert.equal(registryStore.get().settings.defaultModelId, undefined)

  console.log('Provider registry smoke check passed')
} finally {
  rmSync(tempDir, { recursive: true, force: true })
}
