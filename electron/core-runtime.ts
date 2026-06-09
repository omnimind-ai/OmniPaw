import { ProcessSupervisor, TerminalService } from '@core/agent/terminal'
import { listBuiltinToolDefinitions } from '@core/agent/tools/builtin-tools'
import { ToolManagementService } from '@core/agent/tools/management-service'
import { ToolRegistry } from '@core/agent/tools/registry'
import { AgentWorkspaceService } from '@core/agent/workspace'
import { AttachmentService } from '@core/chat/attachment-service'
import { ChatService } from '@core/chat/chat-service'
import { ContextCompactionService } from '@core/chat/context-compaction'
import { ContextBuilder } from '@core/chat/context-manager'
import type { ChatRunEventTarget } from '@core/chat/run-manager'
import { RunManager } from '@core/chat/run-manager'
import { ConfigValidationError } from '@core/config/schema'
import { ConfigStore } from '@core/config/store'
import { ConfigToolSettingsStore } from '@core/config/tool-settings-store'
import { CronManager } from '@core/cron/cron-manager'
import { ScheduledTaskAgentExecutor } from '@core/cron/scheduled-task-executor'
import { DatabaseClient } from '@core/db/client'
import {
  AttachmentRepo,
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
import { PersonaManager } from '@core/persona/manager'
import { PersonaRegistryValidationError } from '@core/persona/registry-schema'
import { PersonaRegistryStore } from '@core/persona/registry-store'
import { ProviderManager } from '@core/provider/manager'
import { ProviderRegistryValidationError } from '@core/provider/registry-schema'
import { ProviderRegistryStore } from '@core/provider/registry-store'
import { SkillManager, SkillValidationError } from '@core/skill'
import {
  TavernContextService,
  TavernManager,
  TavernRegistryStore,
  TavernRegistryValidationError,
} from '@core/tavern'
import { resolveOpenOmniClawDataPaths } from '@core/utils/data-paths'
import { SYSTEM_SESSION_IDS } from '@shared/constants'
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

interface CoreRuntimeOptions {
  app: typeof app
  appName: string
  rootLogger: Logger
  lifecycleLogger: Logger
  onSettingsChanged: (reason: SettingsChangeReason, config: DesktopSettingsConfig) => void
  onCronChanged: (event: CronTaskChangedEvent) => void
  onMcpChanged: (event: McpChangedEvent) => void
  onSkillChanged: (event: SkillChangedEvent) => void
  onObservationChanged: (event: ObservationChangedEvent) => void
  onObservationReaction: (event: ObservationReactionEvent) => void
  chatEventTarget?: () => ChatRunEventTarget | undefined
  resolveCatSessionId?: () => Promise<string | null> | string | null
}

export interface CoreRuntime {
  attachmentService: AttachmentService
  agentWorkspaceService: AgentWorkspaceService
  chatService: ChatService
  configStore: ConfigStore
  cronManager: CronManager
  mcpServerManager: McpServerManager
  memoryService: CompanionMemoryService
  observationManager: ObservationManager
  personaManager: PersonaManager
  providerManager: ProviderManager
  sessionRepo: ChatSessionRepo
  skillManager: SkillManager
  tavernManager: TavernManager
  terminalService: TerminalService
  toolManagementService: ToolManagementService
  dispose: () => void
}

export function createCoreRuntime(options: CoreRuntimeOptions): CoreRuntime {
  const coreLogger = options.rootLogger.child({ scope: 'core' })
  const startedAt = Date.now()
  coreLogger.info('Core initialization started.')

  const appDataPath = options.app.getPath('appData')
  const dataPaths = resolveOpenOmniClawDataPaths({ appDataPath })

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

  const personaManager = new PersonaManager({
    registryStore: new PersonaRegistryStore({
      dataRootPath: dataPaths.root,
    }),
    logger: coreLogger.child({ scope: 'persona' }),
  })
  loadStartupPersonaRegistry(personaManager, options.lifecycleLogger)

  const tavernManager = new TavernManager({
    registryStore: new TavernRegistryStore({
      dataRootPath: dataPaths.root,
    }),
    personaManager,
    logger: coreLogger.child({ scope: 'tavern' }),
  })
  loadStartupTavernRegistry(tavernManager, options.lifecycleLogger)

  const providerManager = new ProviderManager({
    configStore,
    registryStore: new ProviderRegistryStore({
      dataRootPath: dataPaths.root,
    }),
    onConfigSaved: (saved) => options.onSettingsChanged('save', saved),
    logger: coreLogger.child({ scope: 'provider' }),
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
    personaManager,
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
    chatService,
    configStore,
    cronManager,
    mcpServerManager,
    memoryService,
    observationManager,
    personaManager,
    providerManager,
    sessionRepo,
    skillManager,
    tavernManager,
    terminalService,
    toolManagementService,
    dispose: () => {
      observationManager.dispose('app_exit')
      cronManager.stop()
      dbClient.close()
    },
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

function loadStartupPersonaRegistry(personaManager: PersonaManager, lifecycleLogger: Logger): void {
  try {
    const { registry } = personaManager.load()
    lifecycleLogger.info('Startup persona registry loaded.', {
      version: registry.version,
      profileCount: registry.profiles.length,
    })
  } catch (error) {
    if (error instanceof PersonaRegistryValidationError) {
      lifecycleLogger.warn('Startup persona registry validation failed.', {
        errorCode: error.details.code,
        recoverable: error.details.recoverable,
      })
      return
    }
    lifecycleLogger.error('Startup persona registry load failed.', { error })
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
