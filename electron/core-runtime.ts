import { join } from 'node:path'
import { ProcessSupervisor, TerminalService } from '@core/agent/terminal'
import { listBuiltinToolDefinitions } from '@core/agent/tools/builtin-tools'
import { ToolManagementService } from '@core/agent/tools/management-service'
import { ToolRegistry } from '@core/agent/tools/registry'
import { AgentWorkspaceService } from '@core/agent/workspace'
import { CatAppearanceManager } from '@core/appearance'
import { AttachmentService } from '@core/chat/attachment-service'
import { ChatService } from '@core/chat/chat-service'
import { ContextCompactionService } from '@core/chat/context-compaction'
import { ContextBuilder } from '@core/chat/context-manager'
import type { ChatRunEventTarget } from '@core/chat/run-manager'
import { RunManager } from '@core/chat/run-manager'
import { CompanionRoleService } from '@core/companion-role'
import { ConfigValidationError } from '@core/config/schema'
import { ConfigStore } from '@core/config/store'
import { ConfigToolSettingsStore } from '@core/config/tool-settings-store'
import { CronManager } from '@core/cron/cron-manager'
import { ScheduledTaskAgentExecutor } from '@core/cron/scheduled-task-executor'
import { DatabaseClient } from '@core/db/client'
import {
  AttachmentRepo,
  CatPetRepo,
  ChatContextSummaryRepo,
  ChatMessageRepo,
  ChatRunRepo,
  ChatSessionRepo,
  CompanionMemoryRepo,
  CronRunRepo,
  CronTaskRepo,
} from '@core/db/repos'
import { defaultContextPolicy, seedDefaultChatData } from '@core/db/seed'
import type { Logger } from '@core/logging'
import { McpRegistryStore, McpServerManager, McpValidationError } from '@core/mcp'
import { CompanionMemoryPolicyService, CompanionMemoryService } from '@core/memory'
import { ObservationManager } from '@core/observation'
import type { OmniInferProcessController } from '@core/omniinfer'
import {
  InstalledModelRegistry,
  OmniInferRuntimeClient,
  OmniInferRuntimeService,
  resolveModelsDir,
  syncOmniInferProviderModels,
} from '@core/omniinfer'
import { CatPetManager } from '@core/pet'
import { ProviderManager } from '@core/provider/manager'
import { OpenAICodexOAuthService } from '@core/provider/openai-codex-oauth'
import { ProviderRegistryValidationError } from '@core/provider/registry-schema'
import { ProviderRegistryStore } from '@core/provider/registry-store'
import { SkillManager, SkillValidationError } from '@core/skill'
import {
  TavernContextService,
  TavernManager,
  TavernRegistryStore,
  TavernRegistryValidationError,
} from '@core/tavern'
import { resolveOmniPawDataPaths } from '@core/utils/data-paths'
import { SYSTEM_SESSION_IDS } from '@shared/constants'
import type { CatAppearanceAssetKey, CatAppearanceChangedEvent } from '@shared/types/cat-appearance'
import type { CatPetChangedEvent } from '@shared/types/cat-pet'
import type { ChatSession } from '@shared/types/chat'
import type { CronTaskChangedEvent } from '@shared/types/cron'
import type { ObservationChangedEvent, ObservationReactionEvent } from '@shared/types/observation'
import type { DesktopSettingsConfig, SettingsChangeReason } from '@shared/types/settings'
import type { app } from 'electron'
import { ElectronDesktopCaptureAdapter } from './desktop-capture-adapter'

export type McpChangedEvent = Parameters<
  NonNullable<ConstructorParameters<typeof McpServerManager>[0]['onChanged']>
>[0]

export type SkillChangedEvent = Parameters<
  NonNullable<ConstructorParameters<typeof SkillManager>[0]['onChanged']>
>[0]

export type { CatAppearanceChangedEvent }

interface CoreRuntimeOptions {
  app: typeof app
  appName: string
  rootLogger: Logger
  lifecycleLogger: Logger
  onSettingsChanged: (reason: SettingsChangeReason, config: DesktopSettingsConfig) => void
  onCronChanged: (event: CronTaskChangedEvent) => void
  onMcpChanged: (event: McpChangedEvent) => void
  onSkillChanged: (event: SkillChangedEvent) => void
  onCatAppearanceChanged: (event: CatAppearanceChangedEvent) => void
  onCatPetChanged: (event: CatPetChangedEvent) => void
  onObservationChanged: (event: ObservationChangedEvent) => void
  onObservationReaction: (event: ObservationReactionEvent) => void
  chatEventTarget?: () => ChatRunEventTarget | undefined
  resolveCatSessionId?: () => Promise<string | null> | string | null
  buildCatAppearanceAssetUrl: (
    packId: string,
    assetKey: CatAppearanceAssetKey,
    version: string
  ) => string
  /** Constructed in main.ts because it must touch resourcesPath / child_process. */
  omniInferProcessController?: OmniInferProcessController
  /** Optional override of OmniInfer logs directory (used for "View logs" UI). */
  omniInferLogsDir?: string
}

export interface CoreRuntime {
  attachmentService: AttachmentService
  agentWorkspaceService: AgentWorkspaceService
  catAppearanceManager: CatAppearanceManager
  catPetManager: CatPetManager
  chatService: ChatService
  companionRoleService: CompanionRoleService
  configStore: ConfigStore
  cronManager: CronManager
  mcpServerManager: McpServerManager
  memoryService: CompanionMemoryService
  observationManager: ObservationManager
  openAICodexOAuthService: OpenAICodexOAuthService
  providerManager: ProviderManager
  sessionRepo: ChatSessionRepo
  skillManager: SkillManager
  tavernManager: TavernManager
  terminalService: TerminalService
  toolManagementService: ToolManagementService
  omniInferRuntimeService?: OmniInferRuntimeService
  omniInferInstalledModels?: InstalledModelRegistry
  omniInferProcessController?: OmniInferProcessController
  omniInferLogsDir?: string
  dispose: () => void
}

export function createCoreRuntime(options: CoreRuntimeOptions): CoreRuntime {
  const coreLogger = options.rootLogger.child({ scope: 'core' })
  const startedAt = Date.now()
  coreLogger.info('Core initialization started.')

  const appDataPath = options.app.getPath('appData')
  const dataPaths = resolveOmniPawDataPaths({ appDataPath })

  const dbClient = new DatabaseClient({
    path: dataPaths.database,
    logger: coreLogger.child({ scope: 'db' }),
  })
  const db = dbClient.connect()
  seedDefaultChatData(db)
  coreLogger.debug('Default chat seed checked.')

  const sessionRepo = new ChatSessionRepo(db)
  const messageRepo = new ChatMessageRepo(db)
  const attachmentRepo = new AttachmentRepo(db)
  const contextSummaryRepo = new ChatContextSummaryRepo(db)
  const runRepo = new ChatRunRepo(db)
  const memoryRepo = new CompanionMemoryRepo(db)
  const cronTaskRepo = new CronTaskRepo(db)
  const cronRunRepo = new CronRunRepo(db)
  const catPetRepo = new CatPetRepo(db)
  const configStore = new ConfigStore({
    dataRootPath: dataPaths.root,
    logger: coreLogger.child({ scope: 'config' }),
  })
  loadStartupConfig(configStore, options.lifecycleLogger)
  const agentWorkspaceService = new AgentWorkspaceService({
    dataRootPath: dataPaths.root,
    settings: () => configStore.get().tools.workspace,
    logger: coreLogger.child({ scope: 'agent.workspace' }),
  })
  const processSupervisor = new ProcessSupervisor({
    maxForegroundProcesses: () => configStore.get().tools.terminal.maxForegroundProcesses,
    maxBackgroundProcesses: () => configStore.get().tools.terminal.maxBackgroundProcesses,
    backgroundMaxLifetimeMs: () => configStore.get().tools.terminal.backgroundMaxLifetimeMs,
    logger: coreLogger.child({ scope: 'agent.process' }),
  })
  const terminalService = new TerminalService({
    workspace: agentWorkspaceService,
    supervisor: processSupervisor,
    settings: () => configStore.get().tools.terminal,
    logger: coreLogger.child({ scope: 'agent.terminal' }),
  })

  const cronManager = new CronManager({
    tasks: cronTaskRepo,
    runs: cronRunRepo,
    sessions: {
      get: (id) => sessionRepo.get(id),
      getOrCreateCronSession: () => getOrCreateCronSession(sessionRepo),
    },
    settings: () => configStore.get().scheduledTasks,
    onChanged: options.onCronChanged,
    logger: coreLogger.child({ scope: 'cron' }),
  })

  const mcpServerManager = new McpServerManager({
    store: new McpRegistryStore({ dataRootPath: dataPaths.root }),
    reservedToolNames: listBuiltinToolDefinitions().map((tool) => tool.name),
    onChanged: options.onMcpChanged,
    logger: coreLogger.child({ scope: 'mcp' }),
  })
  loadStartupMcp(mcpServerManager, options.lifecycleLogger)

  const skillManager = new SkillManager({
    dataRootPath: dataPaths.root,
    onChanged: options.onSkillChanged,
    logger: coreLogger.child({ scope: 'skill' }),
  })
  loadStartupSkills(skillManager, options.lifecycleLogger)

  const catAppearanceManager = new CatAppearanceManager({
    dataRootPath: dataPaths.root,
    buildAssetUrl: options.buildCatAppearanceAssetUrl,
    onChanged: options.onCatAppearanceChanged,
    logger: coreLogger.child({ scope: 'cat.appearance' }),
  })
  loadStartupCatAppearances(catAppearanceManager, options.lifecycleLogger)
  syncStartupCompanionRoleAppearance(
    catAppearanceManager,
    configStore.get(),
    options.lifecycleLogger
  )

  const catPetManager = new CatPetManager({
    repo: catPetRepo,
    onChanged: options.onCatPetChanged,
    logger: coreLogger.child({ scope: 'cat.pet' }),
  })
  catPetManager.emitInitial()

  const toolManagementService = new ToolManagementService(
    new ConfigToolSettingsStore(configStore, (saved) => {
      options.onSettingsChanged('save', saved)
    }),
    () =>
      mcpServerManager.listTools().tools.map((tool) => ({
        name: tool.name,
        providerName: tool.providerName,
        label: tool.label,
        description: tool.description,
        parameters: tool.parameters,
        risk: tool.risk,
        profiles: tool.profiles,
        source: 'mcp' as const,
        serverId: tool.serverId,
        serverName: tool.serverName,
        discoveryStatus: 'available',
        enabled: tool.enabled,
        readonly: true,
      }))
  )

  const tavernManager = new TavernManager({
    registryStore: new TavernRegistryStore({
      dataRootPath: dataPaths.root,
    }),
    logger: coreLogger.child({ scope: 'tavern' }),
  })
  loadStartupTavernRegistry(tavernManager, options.lifecycleLogger)

  const omniInferLogger = coreLogger.child({ scope: 'omniinfer' })
  const modelsDir = resolveModelsDir({
    userDataPath: appDataPath,
    repoRoot: options.app.isPackaged ? undefined : process.cwd(),
  })
  const omniInferInstalledModels = new InstalledModelRegistry({
    storagePath: join(dataPaths.root, 'omniinfer-installed-models.json'),
    modelsDir,
    logger: omniInferLogger.child({ scope: 'installed-models' }),
  })
  const omniInferClient = new OmniInferRuntimeClient()
  let omniInferRuntimeService: OmniInferRuntimeService | undefined
  if (options.omniInferProcessController) {
    omniInferRuntimeService = new OmniInferRuntimeService({
      client: omniInferClient,
      process: options.omniInferProcessController,
      installedModels: omniInferInstalledModels,
      logger: omniInferLogger.child({ scope: 'runtime' }),
    })
  }
  const openAICodexOAuthService = new OpenAICodexOAuthService({
    dataRootPath: dataPaths.root,
  })

  const providerManager = new ProviderManager({
    configStore,
    registryStore: new ProviderRegistryStore({
      dataRootPath: dataPaths.root,
    }),
    onConfigSaved: (saved) => options.onSettingsChanged('save', saved),
    logger: coreLogger.child({ scope: 'provider' }),
    omniInferRuntimeService,
    omniInferInstalledModels,
    openAICodexOAuthService,
    sessions: {
      async getProviderOverride(sessionId: string) {
        const session = sessionRepo.get(sessionId)
        return session
          ? {
              providerId: session.defaultProviderId,
              modelId: session.defaultModelId,
            }
          : undefined
      },
      async clearProviderOverrides({ providerId, modelIds }) {
        const now = Date.now()
        let changed = 0
        const removedModelIds = modelIds ? new Set(modelIds) : undefined
        for (const session of sessionRepo.list({ includeDeleted: true })) {
          if (session.defaultProviderId !== providerId) {
            continue
          }
          if (
            removedModelIds &&
            session.defaultModelId &&
            !removedModelIds.has(session.defaultModelId)
          ) {
            continue
          }
          sessionRepo.save({
            ...session,
            defaultProviderId: undefined,
            defaultModelId: undefined,
            updatedAt: now,
          })
          changed += 1
        }
        return changed
      },
    },
  })
  loadStartupProviderRegistry(providerManager, options.lifecycleLogger)
  migrateOmniInferProvider(providerManager, omniInferLogger)
    .then(async () => {
      if (!omniInferRuntimeService) return
      const providers = await providerManager.list()
      const omniInferProvider = providers.find(
        (item) => item.api === 'omniinfer' || item.type === 'omniinfer'
      )
      if (omniInferProvider?.baseUrl) {
        omniInferRuntimeService.setBaseUrl(omniInferProvider.baseUrl)
      }
      if (omniInferProvider?.omniInferInstallDir) {
        omniInferRuntimeService.setInstallDir(omniInferProvider.omniInferInstallDir)
      }
    })
    .catch((error: unknown) => {
      omniInferLogger.warn('OmniInfer provider migration failed.', { error })
    })
  // Initial sync; main.ts will trigger another after the gateway is ready.
  void syncOmniInferProviderModels({
    providers: providerManager,
    installedModels: omniInferInstalledModels,
    logger: omniInferLogger,
  })
  omniInferInstalledModels.onChanged(() => {
    void syncOmniInferProviderModels({
      providers: providerManager,
      installedModels: omniInferInstalledModels,
      logger: omniInferLogger,
    })
  })

  const attachmentService = new AttachmentService({
    repo: attachmentRepo,
    rootDir: dataPaths.attachments,
  })
  const desktopCapture = new ElectronDesktopCaptureAdapter({
    tempDir: dataPaths.observationTemp,
  })
  void desktopCapture.cleanupAll()
  const contextBuilder = new ContextBuilder(attachmentService, {
    summaries: contextSummaryRepo,
    contextDefaults: () => configStore.get().app.chatContext,
  })
  const tavernContextService = new TavernContextService({
    tavernManager,
  })
  const contextCompaction = new ContextCompactionService(contextSummaryRepo)
  const runManager = new RunManager(runRepo)
  const memoryPolicy = new CompanionMemoryPolicyService(() => configStore.get().app.memory)
  const memoryService = new CompanionMemoryService({
    repo: memoryRepo,
    sessions: sessionRepo,
    messages: messageRepo,
    runs: runRepo,
    policy: memoryPolicy,
    providers: providerManager,
    settings: () => configStore.get().app.memory,
    saveSettings: (memorySettings) => {
      const next = configStore.get()
      const saved = configStore.save({
        ...next,
        app: {
          ...next.app,
          memory: memorySettings,
        },
      })
      options.onSettingsChanged('save', saved)
      return saved.app.memory
    },
    logger: coreLogger.child({ scope: 'memory' }),
  })
  const companionRoleService = new CompanionRoleService()
  let chatService: ChatService
  const observationManager = new ObservationManager({
    capture: desktopCapture,
    settings: () => configStore.get().observation,
    providers: providerManager,
    attachments: attachmentService,
    chatService: () => chatService,
    eventTarget: options.chatEventTarget,
    resolveCatSessionId: options.resolveCatSessionId,
    onChanged: options.onObservationChanged,
    onReaction: options.onObservationReaction,
    logger: coreLogger.child({ scope: 'observation' }),
    devMode: () => !options.app.isPackaged,
  })
  chatService = new ChatService({
    sessions: sessionRepo,
    messages: messageRepo,
    runs: runRepo,
    attachments: attachmentService,
    attachmentRepo,
    providers: providerManager,
    contextBuilder,
    contextCompaction,
    runManager,
    skills: skillManager,
    compactSkillDescriptions: () => configStore.get().app.compactSkillDescriptions,
    contextDefaults: () => configStore.get().app.chatContext,
    systemContextDefaults: () => configStore.get().app.systemContext,
    companionRoles: () => configStore.get().app.companionRoles,
    companionRoleDefaults: () => {
      const appSettings = configStore.get().app
      return (
        appSettings.companionRoles.find((role) => role.id === appSettings.activeCompanionRoleId) ??
        appSettings.companionRoles[0]
      )
    },
    tavernManager,
    tavernContextService,
    memoryService,
    agentToolProfile: () => configStore.get().tools.agentToolProfile,
    maxAgentSteps: () => configStore.get().tools.maxAgentSteps,
    disabledToolNames: () => toolManagementService.getDisabledToolNames(),
    mcpTools: () => mcpServerManager.getAgentTools(),
    workspaceService: agentWorkspaceService,
    terminalService,
    toolSettings: () => configStore.get().tools,
    cronManager: () => cronManager,
    observationManager: () => observationManager,
    logger: coreLogger.child({ scope: 'chat' }),
  })

  cronManager.setExecutor(
    new ScheduledTaskAgentExecutor({
      sessions: sessionRepo,
      messages: messageRepo,
      providers: providerManager,
      contextBuilder,
      toolRegistry: new ToolRegistry({
        messages: messageRepo,
        attachments: attachmentService,
        skills: skillManager,
        cronManager: () => cronManager,
        observationManager: () => observationManager,
        workspaceService: agentWorkspaceService,
        terminalService,
        toolSettings: () => configStore.get().tools,
        disabledToolNames: () => toolManagementService.getDisabledToolNames(),
        mcpTools: () => mcpServerManager.getAgentTools(),
      }),
      skills: skillManager,
      compactSkillDescriptions: () => configStore.get().app.compactSkillDescriptions,
      logger: coreLogger.child({ scope: 'cron.agent' }),
    })
  )
  cronManager.start()

  coreLogger.info('Core initialization complete.', { durationMs: Date.now() - startedAt })

  return {
    attachmentService,
    agentWorkspaceService,
    catAppearanceManager,
    catPetManager,
    chatService,
    companionRoleService,
    configStore,
    cronManager,
    mcpServerManager,
    memoryService,
    observationManager,
    openAICodexOAuthService,
    providerManager,
    sessionRepo,
    skillManager,
    tavernManager,
    terminalService,
    toolManagementService,
    omniInferRuntimeService,
    omniInferInstalledModels,
    omniInferProcessController: options.omniInferProcessController,
    omniInferLogsDir: options.omniInferLogsDir,
    dispose: () => {
      observationManager.dispose('app_exit')
      catAppearanceManager.dispose()
      cronManager.stop()
      omniInferRuntimeService?.dispose()
      dbClient.close()
    },
  }
}

async function migrateOmniInferProvider(
  providerManager: ProviderManager,
  logger: Logger
): Promise<void> {
  // Only migrate URLs that were *never* a valid OmniInfer gateway. Port 9000 is a legitimate
  // user choice (OmniInfer's own config port), so leave it alone — otherwise the migration
  // overwrites the user's deliberate choice on every restart.
  const KNOWN_LEGACY_URLS = new Set(['http://localhost:11434/v1', 'http://127.0.0.1:11434/v1'])
  const TARGET_URL = 'http://127.0.0.1:19157/v1'
  const providers = await providerManager.list()
  for (const provider of providers) {
    if (provider.id !== 'omniinfer-local') continue
    const normalized = (provider.baseUrl || '').trim().toLowerCase()
    const needsUrlFix = KNOWN_LEGACY_URLS.has(normalized)
    const needsCapabilityFix = provider.capabilities?.listModels !== true
    if (!needsUrlFix && !needsCapabilityFix) continue
    const nextBaseUrl = needsUrlFix ? TARGET_URL : provider.baseUrl
    const nextCapabilities = {
      ...(provider.capabilities ?? {}),
      listModels: true,
    }
    await providerManager.save({
      id: provider.id,
      name: provider.name,
      type: provider.type,
      api: provider.api,
      baseUrl: nextBaseUrl,
      enabled: provider.enabled,
      credentialRef: provider.credentialRef,
      authHeader: provider.authHeader,
      headers: provider.headers,
      extraBody: provider.extraBody,
      defaultModelId: provider.defaultModelId,
      capabilities: nextCapabilities,
      models: provider.models?.map((model) => ({
        ...model,
        providerId: provider.id,
        enabled: model.enabled !== false,
      })),
      updatedAt: Date.now(),
    })
    logger.info('Migrated omniinfer-local provider.', {
      providerId: provider.id,
      baseUrlFrom: needsUrlFix ? provider.baseUrl : undefined,
      baseUrlTo: needsUrlFix ? TARGET_URL : undefined,
      listModelsFixed: needsCapabilityFix,
    })
  }
}

function getOrCreateCronSession(sessionRepo: ChatSessionRepo): ChatSession {
  const now = Date.now()
  const existing = sessionRepo.get(SYSTEM_SESSION_IDS.cron)
  const session: ChatSession = existing
    ? {
        ...existing,
        title: existing.title || '计划任务',
        kind: 'cron',
        status: 'active',
        updatedAt: now,
      }
    : {
        id: SYSTEM_SESSION_IDS.cron,
        title: '计划任务',
        kind: 'cron',
        status: 'active',
        pinned: false,
        messageCount: 0,
        contextPolicy: defaultContextPolicy,
        metadata: {
          system: 'cron',
        },
        createdAt: now,
        updatedAt: now,
      }
  sessionRepo.save(session)
  return sessionRepo.get(session.id) ?? session
}

function loadStartupConfig(
  configStore: ConfigStore,
  lifecycleLogger: Logger
): DesktopSettingsConfig | undefined {
  try {
    const config = configStore.load()
    lifecycleLogger.info('Startup config loaded.', { version: config.version })
    return config
  } catch (error) {
    if (error instanceof ConfigValidationError) {
      lifecycleLogger.warn('Startup config validation failed.', {
        errorCode: error.details.code,
        recoverable: error.details.recoverable,
      })
      return undefined
    }
    lifecycleLogger.error('Startup config load failed.', { error })
    throw error
  }
}

function loadStartupMcp(mcpServerManager: McpServerManager, lifecycleLogger: Logger): void {
  try {
    mcpServerManager.load()
    mcpServerManager.startBackgroundRefresh()
    lifecycleLogger.info('Startup MCP registry loaded.')
  } catch (error) {
    if (error instanceof McpValidationError) {
      lifecycleLogger.warn('Startup MCP registry validation failed.', {
        errorCode: error.details.code,
        recoverable: error.details.recoverable,
      })
      return
    }
    lifecycleLogger.error('Startup MCP registry load failed.', { error })
    throw error
  }
}

function loadStartupSkills(skillManager: SkillManager, lifecycleLogger: Logger): void {
  try {
    skillManager.load()
    lifecycleLogger.info('Startup skills loaded.')
  } catch (error) {
    if (error instanceof SkillValidationError) {
      lifecycleLogger.warn('Startup skill state validation failed.', {
        errorCode: error.details.code,
        recoverable: error.details.recoverable,
      })
      return
    }
    lifecycleLogger.error('Startup skill load failed.', { error })
    throw error
  }
}

function loadStartupCatAppearances(
  catAppearanceManager: CatAppearanceManager,
  lifecycleLogger: Logger
): void {
  try {
    const response = catAppearanceManager.load()
    lifecycleLogger.info('Startup cat appearance packs loaded.', {
      packCount: response.packs.length,
      activePackId: response.activePackId,
    })
  } catch (error) {
    lifecycleLogger.warn('Startup cat appearance packs failed to load; using built-in pack.', {
      error,
    })
  }
}

function syncStartupCompanionRoleAppearance(
  catAppearanceManager: CatAppearanceManager,
  config: DesktopSettingsConfig,
  lifecycleLogger: Logger
): void {
  const activeRole =
    config.app.companionRoles.find((role) => role.id === config.app.activeCompanionRoleId) ??
    config.app.companionRoles[0]
  const packId = activeRole?.appearancePackId?.trim()
  if (!packId) {
    return
  }

  try {
    catAppearanceManager.setActive({ packId })
    lifecycleLogger.info('Companion role appearance synced.', { packId })
  } catch (error) {
    lifecycleLogger.warn('Failed to sync companion role appearance.', {
      packId,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

function loadStartupProviderRegistry(
  providerManager: ProviderManager,
  lifecycleLogger: Logger
): void {
  try {
    const { registry } = providerManager.loadRegistry()
    lifecycleLogger.info('Startup Provider registry loaded.', {
      version: registry.version,
      sourceCount: registry.sources.length,
      modelCount: registry.models.length,
    })
  } catch (error) {
    if (error instanceof ProviderRegistryValidationError) {
      lifecycleLogger.warn('Startup Provider registry validation failed.', {
        errorCode: error.details.code,
        recoverable: error.details.recoverable,
      })
      return
    }
    lifecycleLogger.error('Startup Provider registry load failed.', { error })
    throw error
  }
}

function loadStartupTavernRegistry(tavernManager: TavernManager, lifecycleLogger: Logger): void {
  try {
    const { registry } = tavernManager.load()
    lifecycleLogger.info('Startup tavern registry loaded.', {
      version: registry.version,
      characterCount: registry.characters.length,
      lorebookCount: registry.lorebooks.length,
    })
  } catch (error) {
    if (error instanceof TavernRegistryValidationError) {
      lifecycleLogger.warn('Startup tavern registry validation failed.', {
        errorCode: error.details.code,
        recoverable: error.details.recoverable,
      })
      return
    }
    lifecycleLogger.error('Startup tavern registry load failed.', { error })
    throw error
  }
}
