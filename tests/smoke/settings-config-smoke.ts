import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CompanionRoleService } from '@core/role/package'
import {
  BUILTIN_COMPANION_ROLE_PRESET_CATALOG,
  createBuiltinCompanionRolePresets,
  DEFAULT_ACTIVE_COMPANION_ROLE_ID,
} from '@core/role/presets'
import { ToolManagementService } from '../../core/agent/tools/management-service'
import {
  ConfigValidationError,
  CURRENT_SETTINGS_VERSION,
  cloneDefaultConfig,
  normalizeConfig,
} from '../../core/config/schema'
import { ConfigStore } from '../../core/config/store'
import { ConfigToolSettingsStore } from '../../core/config/tool-settings-store'
import { ProviderManager } from '../../core/provider/manager'

const tempDir = mkdtempSync(join(tmpdir(), 'omnipaw-settings-smoke-'))

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
  assert.deepEqual(normalized.app.systemContext, { baseSystemPrompt: '' })
  assert.equal('unknownField' in normalized.app, false)
  assert.equal(normalized.providers.sources[0]?.id, 'custom-openai')
  assert.equal(normalized.providers.models[0]?.providerSourceId, 'custom-openai')
  assert.equal(normalized.providers.settings.defaultModelId, 'custom-model')
  assert.equal(normalized.tools.agentToolProfile, 'assistant')
  assert.equal(normalized.tools.maxAgentSteps, 6)
  assert.equal('enabled' in normalized.tools.workspace, false)
  assert.equal(normalized.tools.workspace.rootStrategy, 'managed-user-data')
  assert.equal(normalized.tools.workspace.maxReadBytes, 512 * 1024)
  assert.equal('enabled' in normalized.tools.terminal, false)
  assert.equal('sandbox' in normalized.tools.terminal, false)
  assert.equal('approval' in normalized.tools.terminal.assistant, false)
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

  const migratedLegacySystemContext = normalizeConfig({
    ...cloneDefaultConfig(),
    version: 2,
    app: {
      ...cloneDefaultConfig().app,
      systemContext: {
        baseSystemPrompt: 'Legacy base prompt',
        mask: {
          enabled: true,
          label: 'Legacy mask',
          text: 'Legacy mask prompt',
        },
      },
    },
  }).config
  assert.equal(migratedLegacySystemContext.version, CURRENT_SETTINGS_VERSION)
  assert.deepEqual(migratedLegacySystemContext.app.systemContext, {
    baseSystemPrompt: 'Legacy base prompt',
  })
  assert.equal('mask' in migratedLegacySystemContext.app.systemContext, false)

  const builtinPresetIds = BUILTIN_COMPANION_ROLE_PRESET_CATALOG.map((preset) => preset.id)
  assert.deepEqual(builtinPresetIds, ['default', 'xiaozhi'])
  assert.equal(new Set(builtinPresetIds).size, builtinPresetIds.length)
  assert.equal(
    BUILTIN_COMPANION_ROLE_PRESET_CATALOG.every(
      (preset) => preset.introducedInSettingsVersion <= CURRENT_SETTINGS_VERSION
    ),
    true
  )
  assert.equal(DEFAULT_ACTIVE_COMPANION_ROLE_ID, 'default')
  assert.deepEqual(
    BUILTIN_COMPANION_ROLE_PRESET_CATALOG.filter(
      (preset) => preset.introducedInSettingsVersion > 1
    ).map((preset) => preset.id),
    ['xiaozhi']
  )
  assert.notEqual(
    createBuiltinCompanionRolePresets()[0],
    createBuiltinCompanionRolePresets()[0],
    'builtin role factories must return independent role instances'
  )

  const xiaowanRole = cloneDefaultConfig().app.companionRoles[0]
  assert.equal(xiaowanRole?.introduction, '你最好的桌面伙伴')
  assert.equal(xiaowanRole?.avatar?.source, 'appearance-idle')
  assert.equal('speechStyle' in (xiaowanRole ?? {}), false)
  assert.equal('relationship' in (xiaowanRole ?? {}), false)
  assert.equal('proactiveStyle' in (xiaowanRole ?? {}), false)

  const legacyRoleFields = normalizeConfig({
    ...cloneDefaultConfig(),
    app: {
      ...cloneDefaultConfig().app,
      companionRoles: [
        {
          ...xiaowanRole,
          speechStyle: 'Legacy speech style',
          relationship: 'Legacy relationship',
          proactiveStyle: 'Legacy proactive style',
        },
      ],
    },
  }).config.app.companionRoles[0]
  assert.equal(legacyRoleFields?.speechStyle, 'Legacy speech style')
  assert.equal(legacyRoleFields?.relationship, 'Legacy relationship')
  assert.equal(legacyRoleFields?.proactiveStyle, 'Legacy proactive style')

  const xiaozhiRole = cloneDefaultConfig().app.companionRoles[1]
  assert.equal(xiaozhiRole?.id, 'xiaozhi')
  assert.equal(xiaozhiRole?.name, '小智')
  assert.equal(xiaozhiRole?.introduction, '活力满满的桌面搭档')
  assert.equal(xiaozhiRole?.appearancePackId, 'builtin-dog')
  assert.match(xiaozhiRole?.personality ?? '', /活泼/)
  assert.equal(xiaozhiRole?.petGifts[0]?.image?.packagePath, 'presets/dog/gifts/squeaky-ball.png')

  const normalizedPartialXiaozhi = normalizeConfig({
    ...cloneDefaultConfig(),
    app: {
      ...cloneDefaultConfig().app,
      companionRoles: [{ id: 'xiaozhi' }],
      activeCompanionRoleId: 'xiaozhi',
    },
  }).config.app.companionRoles[0]
  assert.equal(normalizedPartialXiaozhi?.name, '小智')
  assert.equal(normalizedPartialXiaozhi?.appearancePackId, 'builtin-dog')
  assert.match(normalizedPartialXiaozhi?.personality ?? '', /活泼/)
  assert.equal(normalizedPartialXiaozhi?.petInteractions[0]?.label, '摸摸')
  assert.equal(
    normalizedPartialXiaozhi?.petGifts[0]?.image?.packagePath,
    'presets/dog/gifts/squeaky-ball.png'
  )

  const existingXiaowanRole = cloneDefaultConfig().app.companionRoles[0]
  const legacyExistingRolesConfig = {
    ...cloneDefaultConfig(),
    version: 1,
    app: {
      ...cloneDefaultConfig().app,
      companionRoles: [
        existingXiaowanRole,
        {
          ...existingXiaowanRole,
          id: 'existing-custom-role',
          name: 'Existing Custom Role',
        },
      ],
      activeCompanionRoleId: 'existing-custom-role',
    },
  }
  const migratedExistingRoles = normalizeConfig(legacyExistingRolesConfig).config
  assert.equal(migratedExistingRoles.version, CURRENT_SETTINGS_VERSION)
  assert.equal(migratedExistingRoles.app.companionRoles.length, 3)
  assert.equal(
    migratedExistingRoles.app.companionRoles.some((role) => role.id === 'xiaozhi'),
    true
  )
  assert.equal(migratedExistingRoles.app.activeCompanionRoleId, 'existing-custom-role')

  const legacyConfigPath = join(tempDir, 'legacy-existing-roles.json')
  writeFileSync(legacyConfigPath, JSON.stringify(legacyExistingRolesConfig), 'utf8')
  const migratedStore = new ConfigStore({ configPath: legacyConfigPath })
  const migratedFromDisk = migratedStore.load()
  assert.equal(migratedFromDisk.version, CURRENT_SETTINGS_VERSION)
  assert.equal(migratedFromDisk.app.activeCompanionRoleId, 'existing-custom-role')
  assert.equal(
    migratedFromDisk.app.companionRoles.some((role) => role.id === 'xiaozhi'),
    true
  )
  assert.equal(JSON.parse(readFileSync(legacyConfigPath, 'utf8')).version, CURRENT_SETTINGS_VERSION)
  assert.equal(migratedStore.status().backupExists, true)

  const savedWithoutXiaozhi = normalizeConfig({
    ...cloneDefaultConfig(),
    app: {
      ...cloneDefaultConfig().app,
      companionRoles: [existingXiaowanRole],
      activeCompanionRoleId: existingXiaowanRole?.id ?? DEFAULT_ACTIVE_COMPANION_ROLE_ID,
    },
  }).config
  assert.equal(
    savedWithoutXiaozhi.app.companionRoles.some((role) => role.id === 'xiaozhi'),
    false
  )

  const roleConfig = normalizeConfig({
    ...cloneDefaultConfig(),
    app: {
      ...cloneDefaultConfig().app,
      companionRoles: [
        {
          ...cloneDefaultConfig().app.companionRoles[0],
          introduction: 'A display-only smoke introduction.',
          avatar: {
            source: 'custom',
            dataUrl: 'data:image/png;base64,YXZhdGFyLXNtb2tl',
            mimeType: 'image/png',
            fileName: 'avatar-smoke.png',
          },
          appearanceLayoutOverride: {
            scale: 3,
          },
          enabled: false,
          greeting: '旧开场白',
          greetingMode: 'random',
          alternateGreetings: ['早呀'],
          knowledgeSettings: {
            scanDepth: 5,
            maxTokens: 1200,
          },
          knowledgeEntries: [
            {
              id: 'role-knowledge-smoke',
              enabled: true,
              title: '桌面设定',
              content: '角色住在用户桌面里。',
              keys: ['桌面'],
              constant: true,
              priority: 2,
              order: 1,
            },
          ],
          source: {
            kind: 'sillytavern-json',
            sourceName: 'smoke.json',
          },
          petGifts: [
            {
              id: 'gift_100',
              enabled: true,
              unlockAffection: 100,
              name: 'Smoke Gift',
              description: 'A normalized gift.',
              image: {
                dataUrl: 'data:image/png;base64,aW1hZ2Utc21va2U=',
                mimeType: 'image/png',
                fileName: 'gift-smoke.png',
              },
              storyLines: ['Here is a smoke gift.'],
            },
            {
              id: 'gift_custom_smoke',
              enabled: true,
              unlockAffection: 180,
              name: 'Custom Smoke Gift',
              description: 'A custom normalized gift.',
              storyLines: ['Here is a custom gift.'],
            },
          ],
        },
      ],
    },
  }).config
  const normalizedRoleConfig = roleConfig.app.companionRoles[0]
  assert.ok(normalizedRoleConfig)
  assert.equal('enabled' in normalizedRoleConfig, false)
  assert.equal('greeting' in normalizedRoleConfig, false)
  assert.equal('greetingMode' in normalizedRoleConfig, false)
  assert.equal('alternateGreetings' in normalizedRoleConfig, false)
  assert.equal(roleConfig.app.companionRoles[0]?.introduction, 'A display-only smoke introduction.')
  assert.equal(roleConfig.app.companionRoles[0]?.avatar?.source, 'custom')
  assert.equal(
    roleConfig.app.companionRoles[0]?.avatar?.dataUrl,
    'data:image/png;base64,YXZhdGFyLXNtb2tl'
  )
  assert.deepEqual(roleConfig.app.companionRoles[0]?.appearanceLayoutOverride, {
    scale: 2,
  })
  assert.equal(roleConfig.app.companionRoles[0]?.knowledgeSettings.scanDepth, 5)
  assert.equal(roleConfig.app.companionRoles[0]?.knowledgeSettings.maxTokens, 1200)
  assert.equal(roleConfig.app.companionRoles[0]?.knowledgeEntries[0]?.title, '桌面设定')
  assert.equal(roleConfig.app.companionRoles[0]?.source?.kind, 'sillytavern-json')
  assert.equal(roleConfig.app.companionRoles[0]?.petGifts.length, 3)
  assert.equal(roleConfig.app.companionRoles[0]?.petGifts[0]?.name, 'Smoke Gift')
  assert.equal(
    roleConfig.app.companionRoles[0]?.petGifts[0]?.image?.dataUrl,
    'data:image/png;base64,aW1hZ2Utc21va2U='
  )
  assert.equal(roleConfig.app.companionRoles[0]?.petGifts[1]?.id, 'gift_200')
  assert.equal(roleConfig.app.companionRoles[0]?.petGifts[2]?.unlockAffection, 300)

  const companionRoleService = new CompanionRoleService()
  const importedRole = companionRoleService.importCard({
    sourceKind: 'json',
    sourceName: 'mika.json',
    content: JSON.stringify({
      spec: 'chara_card_v2',
      data: {
        name: 'Mika',
        creator_notes: 'A bright role card introduction.',
        description: 'A cheerful desktop partner.',
        personality: 'bright and concise',
        first_mes: 'Hi {{user}}, Mika is here.',
        alternate_greetings: ['Ready when you are.'],
        character_book: {
          name: 'Mika book',
          entries: [
            {
              comment: 'Moon lore',
              keys: ['moon'],
              content: 'Mika likes moonlit desktop themes.',
              constant: true,
              priority: 7,
            },
          ],
        },
      },
    }),
  })
  assert.equal(importedRole.role.name, 'Mika')
  assert.equal(importedRole.role.introduction, 'A bright role card introduction.')
  assert.equal('greeting' in importedRole.role, false)
  assert.equal('alternateGreetings' in importedRole.role, false)
  assert.equal(importedRole.knowledgeEntryCount, 1)
  assert.equal(importedRole.role.knowledgeEntries?.[0]?.title, 'Moon lore')
  assert.equal(importedRole.source.kind, 'sillytavern-json')

  const exportedGiftPackage = companionRoleService.exportCard({
    role: {
      name: 'Gift Role',
      introduction: 'A role package introduction.',
      avatar: {
        source: 'custom',
        dataUrl: 'data:image/png;base64,YXZhdGFyLXBhY2thZ2U=',
        mimeType: 'image/png',
        fileName: 'role-avatar.png',
      },
      appearanceLayoutOverride: {
        scale: 1.1,
      },
      petGifts: [
        {
          id: 'gift_100',
          enabled: true,
          unlockAffection: 100,
          name: 'Gift Package Smoke',
          description: 'Checks package gift images.',
          image: {
            dataUrl: 'data:image/png;base64,aW1hZ2Utc21va2U=',
            mimeType: 'image/png',
            fileName: 'gift-smoke.png',
          },
          storyLines: ['A packaged gift appears.'],
        },
      ],
    },
  })
  const importedGiftPackage = companionRoleService.importCard({
    sourceKind: 'omnipaw-role',
    sourceName: 'gift-role.omnipaw-role',
    dataBase64: exportedGiftPackage.data.toString('base64'),
  })
  assert.equal(importedGiftPackage.role.introduction, 'A role package introduction.')
  assert.equal(importedGiftPackage.role.avatar?.source, 'custom')
  assert.equal(
    importedGiftPackage.role.avatar?.dataUrl,
    'data:image/png;base64,YXZhdGFyLXBhY2thZ2U='
  )
  assert.deepEqual(importedGiftPackage.role.appearanceLayoutOverride, {
    scale: 1.1,
  })
  assert.equal(importedGiftPackage.role.petGifts?.[0]?.name, 'Gift Package Smoke')
  assert.equal(
    importedGiftPackage.role.petGifts?.[0]?.image?.dataUrl,
    'data:image/png;base64,aW1hZ2Utc21va2U='
  )

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
  assert.equal(firstLoad.version, CURRENT_SETTINGS_VERSION)
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
