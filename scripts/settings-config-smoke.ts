import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ToolManagementService } from '../core/agent/tools/management-service'
import { ConfigValidationError, cloneDefaultConfig, normalizeConfig } from '../core/config/schema'
import { ConfigStore } from '../core/config/store'
import { ConfigToolSettingsStore } from '../core/config/tool-settings-store'
import { ProviderManager } from '../core/provider/manager'

const tempDir = mkdtempSync(join(tmpdir(), 'openomniclaw-settings-smoke-'))

try {
  const normalized = normalizeConfig({
    version: 1,
    app: {
      theme: 'dark',
      unknownField: true,
    },
    providers: {
      sources: [
        {
          id: 'custom-openai',
          name: 'Custom OpenAI',
          baseUrl: 'https://example.test/v1',
          enabled: true,
          apiKey: 'sk-test-secret',
        },
      ],
      models: [
        {
          id: 'custom-model',
          name: 'Custom Model',
          providerSourceId: 'custom-openai',
          enabled: true,
        },
      ],
      settings: {
        defaultModelId: 'custom-model',
      },
    },
    tools: {
      enabledByName: {
        calculator: false,
        stale_tool: false,
      },
    },
    scheduledTasks: {
      enabled: true,
      tasks: [{ id: 'legacy-placeholder' }],
      misfireGraceMs: 120000,
    },
  }).config

  assert.equal(normalized.app.theme, 'dark')
  assert.equal(normalized.app.language, 'system')
  assert.equal(normalized.app.chatContext.recentMessages, 20)
  assert.equal(normalized.app.chatContext.includeAttachments, 'current-only')
  assert.equal(normalized.app.chatContext.autoCompact, true)
  assert.equal('unknownField' in normalized.app, false)
  assert.equal(normalized.providers.sources[0]?.id, 'custom-openai')
  assert.equal(normalized.providers.models[0]?.providerSourceId, 'custom-openai')
  assert.equal(normalized.providers.settings.defaultModelId, 'custom-model')
  assert.equal(normalized.tools.agentToolProfile, 'assistant')
  assert.equal(normalized.scheduledTasks.enabled, true)
  assert.equal(normalized.scheduledTasks.misfirePolicy, 'run_once')
  assert.equal(normalized.scheduledTasks.misfireGraceMs, 120000)
  assert.equal(normalized.scheduledTasks.misfireStartupLimit, 3)
  assert.equal('tasks' in normalized.scheduledTasks, false)

  assert.throws(
    () => normalizeConfig({ ...cloneDefaultConfig(), version: 999 }),
    ConfigValidationError
  )
  assert.throws(
    () =>
      normalizeConfig({
        ...cloneDefaultConfig(),
        providers: {
          ...cloneDefaultConfig().providers,
          settings: {
            defaultModelId: 'missing-model',
            fallbackModelIds: [],
            streaming: true,
          },
        },
      }),
    ConfigValidationError
  )
  assert.throws(
    () =>
      normalizeConfig({
        ...cloneDefaultConfig(),
        app: 'invalid',
      }),
    ConfigValidationError
  )
  assert.throws(
    () =>
      normalizeConfig({
        ...cloneDefaultConfig(),
        app: {
          ...cloneDefaultConfig().app,
          chatContext: {
            ...cloneDefaultConfig().app.chatContext,
            maxInputBudgetPercent: 101,
          },
        },
      }),
    ConfigValidationError
  )
  assert.throws(
    () =>
      normalizeConfig({
        ...cloneDefaultConfig(),
        scheduledTasks: {
          ...cloneDefaultConfig().scheduledTasks,
          misfirePolicy: 'invalid',
        },
      }),
    ConfigValidationError
  )

  const store = new ConfigStore({ appDataPath: tempDir })
  const firstLoad = store.load()
  assert.equal(firstLoad.version, 1)
  assert.equal(store.status().exists, true)

  firstLoad.app.theme = 'light'
  const saved = store.save(firstLoad)
  assert.equal(saved.app.theme, 'light')
  assert.equal(store.status().backupExists, true)
  assert.match(readFileSync(store.configPath, 'utf8'), /"scheduledTasks"/)

  const providerStore = new ConfigStore({ appDataPath: tempDir, appName: 'providers' })
  providerStore.save(normalized)
  const providers = new ProviderManager({ configStore: providerStore })
  const provider = await providers.get('custom-openai')
  assert.equal(provider?.enabled, true)
  assert.equal(provider?.models[0]?.id, 'custom-model')
  assert.equal(provider?.apiKey, undefined)

  const configWithFallback = providerStore.get()
  configWithFallback.providers.settings.fallbackModelIds = ['custom-model']
  providerStore.save(configWithFallback)
  const replacementProvider = await providers.upsert({
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
      defaultModelId: 'replacement-model',
      capabilities: {},
      models: [
        {
          id: 'replacement-model',
          name: 'Replacement Model',
          enabled: true,
        },
      ],
    },
  })
  assert.equal(replacementProvider?.defaultModelId, 'replacement-model')
  assert.deepEqual(providerStore.get().providers.settings.fallbackModelIds, [])

  const openAiPreset = await providers.createFromPreset('openai-compatible')
  assert.equal(openAiPreset.models.length, 0)
  assert.equal(openAiPreset.defaultModelId, undefined)
  const firstPreset = await providers.createFromPreset('omniinfer-local')
  const secondPreset = await providers.createFromPreset('omniinfer-local')
  assert.equal(firstPreset.id, 'omniinfer-local')
  assert.equal(secondPreset.id, 'omniinfer-local_1')
  assert.equal(secondPreset.name, 'OmniInfer Local_1')
  assert.equal(secondPreset.models[0]?.providerId, 'omniinfer-local_1')
  assert.equal(secondPreset.models[0]?.id, 'omniinfer-local_1:local-small-model')
  const savedProvider = await providers.upsert({
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
      models: [],
    },
    credential: {
      type: 'api-key',
      label: 'Default API Key',
      value: 'sk-updated-secret',
    },
  })
  assert.equal(savedProvider?.apiKey, undefined)
  assert.equal(
    providerStore.get().providers.sources.find((source) => source.id === 'custom-openai')?.apiKey,
    'sk-updated-secret'
  )
  assert.equal((await providers.get('custom-openai'))?.models.length, 0)

  const toolSettings = new ConfigToolSettingsStore(store)
  const tools = new ToolManagementService(toolSettings)
  assert.equal(tools.list().find((tool) => tool.name === 'calculator')?.enabled, true)
  tools.setEnabled('calculator', false)
  assert.equal(
    new ToolManagementService(toolSettings).list().find((tool) => tool.name === 'calculator')
      ?.enabled,
    false
  )

  console.log('Settings config smoke check passed')
} finally {
  rmSync(tempDir, { recursive: true, force: true })
}
