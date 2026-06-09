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
    observation: {
      enabled: true,
      defaultIntervalMs: 120_000,
      minIntervalMs: 30_000,
      defaultScope: 'selected_window',
      outputMode: 'chat',
      retention: 'persist',
      dailyCaptureLimit: 12,
      consecutiveFailureLimit: 4,
      reactionCooldownMs: 45_000,
      reactionNudgeAfterSilentCaptures: 4,
      reactionNudgeProbability: 0.5,
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
  assert.equal(normalized.tools.maxAgentSteps, 6)
  assert.equal(normalized.tools.workspace.enabled, true)
  assert.equal(normalized.tools.workspace.rootStrategy, 'managed-user-data')
  assert.equal(normalized.tools.workspace.maxReadBytes, 512 * 1024)
  assert.equal(normalized.tools.terminal.enabled, true)
  assert.equal('sandbox' in normalized.tools.terminal, false)
  assert.equal(normalized.tools.terminal.assistant.approval, 'ask')
  assert.equal('approval' in normalized.tools.terminal.power, false)
  assert.equal(normalized.tools.terminal.power.fullAccess, true)
  assert.equal(normalized.scheduledTasks.enabled, true)
  assert.equal(normalized.scheduledTasks.misfirePolicy, 'run_once')
  assert.equal(normalized.scheduledTasks.misfireGraceMs, 120000)
  assert.equal(normalized.scheduledTasks.misfireStartupLimit, 3)
  assert.equal('tasks' in normalized.scheduledTasks, false)
  assert.equal('enabled' in normalized.observation, false)
  assert.equal('outputMode' in normalized.observation, false)
  assert.equal('retention' in normalized.observation, false)
  assert.equal('defaultIntervalMs' in normalized.observation, false)
  assert.equal(normalized.observation.evaluationIntervalMs, 120_000)
  assert.equal(normalized.observation.captureProbability, 0.25)
  assert.equal(normalized.observation.reactionNudgeAfterSilentCaptures, 4)
  assert.equal(normalized.observation.reactionNudgeProbability, 0.5)
  assert.equal(normalized.observation.minCaptureIntervalMs, 30_000)
  assert.equal(normalized.observation.defaultScope, 'selected_window')
  assert.equal(normalized.observation.screenshotRetention, 'persist')
  assert.equal(normalized.observation.allowRemoteProviders, false)
  assert.equal(normalized.observation.localOnly, true)
  assert.equal(normalized.observation.dailyCaptureLimit, 12)
  assert.equal(normalized.observation.consecutiveFailureLimit, 4)
  assert.equal(normalized.observation.notificationCooldownMs, 45_000)

  const defaultObservation = cloneDefaultConfig().observation
  assert.equal(defaultObservation.screenshotRetention, 'ephemeral')
  assert.equal(defaultObservation.allowRemoteProviders, false)
  assert.equal(defaultObservation.localOnly, true)
  assert.equal(defaultObservation.reactionNudgeAfterSilentCaptures, 3)
  assert.equal(defaultObservation.reactionNudgeProbability, 0.35)
  assert.equal('enabled' in defaultObservation, false)

  const legacyObservation = normalizeConfig({
    ...cloneDefaultConfig(),
    observation: {
      enabled: true,
      intervalMs: 90_000,
      durationMs: 180_000,
      minIntervalMs: 15_000,
      cooldownMs: 10_000,
      replyNudgeAfterSilentCaptures: 2,
      replyNudgeProbability: 0.25,
      defaultScope: 'selected_display',
      dailyCaptureLimit: 9,
      consecutiveFailureLimit: 5,
      retention: 'chat',
    },
  }).config.observation
  assert.equal('enabled' in legacyObservation, false)
  assert.equal('durationMs' in legacyObservation, false)
  assert.equal(legacyObservation.evaluationIntervalMs, 90_000)
  assert.equal(legacyObservation.minCaptureIntervalMs, 15_000)
  assert.equal(legacyObservation.notificationCooldownMs, 10_000)
  assert.equal(legacyObservation.reactionNudgeAfterSilentCaptures, 2)
  assert.equal(legacyObservation.reactionNudgeProbability, 0.25)
  assert.equal(legacyObservation.defaultScope, 'selected_display')
  assert.equal(legacyObservation.dailyCaptureLimit, 9)
  assert.equal(legacyObservation.consecutiveFailureLimit, 5)
  assert.equal(legacyObservation.screenshotRetention, 'ephemeral')

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
        tools: {
          ...cloneDefaultConfig().tools,
          terminal: {
            ...cloneDefaultConfig().tools.terminal,
            timeoutMs: 0,
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
  assert.throws(
    () =>
      normalizeConfig({
        ...cloneDefaultConfig(),
        observation: {
          ...cloneDefaultConfig().observation,
          evaluationIntervalMs: 1_000,
        },
      }),
    ConfigValidationError
  )
  assert.throws(
    () =>
      normalizeConfig({
        ...cloneDefaultConfig(),
        observation: {
          ...cloneDefaultConfig().observation,
          captureProbability: 1.5,
        },
      }),
    ConfigValidationError
  )
  assert.throws(
    () =>
      normalizeConfig({
        ...cloneDefaultConfig(),
        observation: {
          ...cloneDefaultConfig().observation,
          reactionNudgeAfterSilentCaptures: 0,
        },
      }),
    ConfigValidationError
  )
  assert.throws(
    () =>
      normalizeConfig({
        ...cloneDefaultConfig(),
        observation: {
          ...cloneDefaultConfig().observation,
          reactionNudgeProbability: 1.5,
        },
      }),
    ConfigValidationError
  )
  assert.throws(
    () =>
      normalizeConfig({
        ...cloneDefaultConfig(),
        observation: {
          ...cloneDefaultConfig().observation,
          minCaptureIntervalMs: 1_000,
        },
      }),
    ConfigValidationError
  )
  assert.throws(
    () =>
      normalizeConfig({
        ...cloneDefaultConfig(),
        observation: {
          ...cloneDefaultConfig().observation,
          screenshotRetention: 'chat',
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
  assert.match(readFileSync(store.configPath, 'utf8'), /"observation"/)

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
