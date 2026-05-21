import { listBuiltinToolDefinitions } from '@core/agent/tools/builtin-tools'
import { ToolManagementService } from '@core/agent/tools/management-service'
import { ToolRegistry } from '@core/agent/tools/registry'
import { AttachmentService } from '@core/chat/attachment-service'
import { ChatService } from '@core/chat/chat-service'
import { ContextBuilder } from '@core/chat/context-manager'
import { RunManager } from '@core/chat/run-manager'
import { ConfigValidationError } from '@core/config/schema'
import { ConfigStore } from '@core/config/store'
import { ConfigToolSettingsStore } from '@core/config/tool-settings-store'
import { CronManager } from '@core/cron/cron-manager'
import { ScheduledTaskAgentExecutor } from '@core/cron/scheduled-task-executor'
import { DatabaseClient } from '@core/db/client'
import {
  AttachmentRepo,
  ChatMessageRepo,
  ChatRunRepo,
  ChatSessionRepo,
  CronRunRepo,
  CronTaskRepo,
} from '@core/db/repos'
import { defaultContextPolicy, seedDefaultChatData } from '@core/db/seed'
import type { Logger } from '@core/logging'
import { McpRegistryStore, McpServerManager, McpValidationError } from '@core/mcp'
import { ProviderManager } from '@core/provider/manager'
import { ProviderRegistryValidationError } from '@core/provider/registry-schema'
import { ProviderRegistryStore } from '@core/provider/registry-store'
import { SkillManager, SkillValidationError } from '@core/skill'
import { SYSTEM_SESSION_IDS } from '@shared/constants'
import type { ChatSession } from '@shared/types/chat'
import type { CronTaskChangedEvent } from '@shared/types/cron'
import type { DesktopSettingsConfig, SettingsChangeReason } from '@shared/types/settings'
import type { app } from 'electron'

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
}

export interface CoreRuntime {
  attachmentService: AttachmentService
  chatService: ChatService
  configStore: ConfigStore
  cronManager: CronManager
  mcpServerManager: McpServerManager
  providerManager: ProviderManager
  sessionRepo: ChatSessionRepo
  skillManager: SkillManager
  toolManagementService: ToolManagementService
  dispose: () => void
}

export function createCoreRuntime(options: CoreRuntimeOptions): CoreRuntime {
  const coreLogger = options.rootLogger.child({ scope: 'core' })
  const startedAt = Date.now()
  coreLogger.info('Core initialization started.')

  const dbClient = new DatabaseClient({ logger: coreLogger.child({ scope: 'db' }) })
  const db = dbClient.connect()
  seedDefaultChatData(db)
  coreLogger.debug('Default chat seed checked.')

  const sessionRepo = new ChatSessionRepo(db)
  const messageRepo = new ChatMessageRepo(db)
  const attachmentRepo = new AttachmentRepo(db)
  const runRepo = new ChatRunRepo(db)
  const cronTaskRepo = new CronTaskRepo(db)
  const cronRunRepo = new CronRunRepo(db)
  const configStore = new ConfigStore({
    appDataPath: options.app.getPath('appData'),
    appName: options.appName,
    logger: coreLogger.child({ scope: 'config' }),
  })
  loadStartupConfig(configStore, options.lifecycleLogger)

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
    store: new McpRegistryStore({ userDataPath: options.app.getPath('userData') }),
    reservedToolNames: listBuiltinToolDefinitions().map((tool) => tool.name),
    onChanged: options.onMcpChanged,
    logger: coreLogger.child({ scope: 'mcp' }),
  })
  loadStartupMcp(mcpServerManager, options.lifecycleLogger)

  const skillManager = new SkillManager({
    userDataPath: options.app.getPath('userData'),
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

  const providerManager = new ProviderManager({
    configStore,
    registryStore: new ProviderRegistryStore({
      appDataPath: options.app.getPath('appData'),
      appName: options.appName,
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
  const attachmentService = new AttachmentService({ repo: attachmentRepo })
  const contextBuilder = new ContextBuilder(attachmentService)
  const runManager = new RunManager(runRepo)
  const chatService = new ChatService({
    sessions: sessionRepo,
    messages: messageRepo,
    runs: runRepo,
    attachments: attachmentService,
    attachmentRepo,
    providers: providerManager,
    contextBuilder,
    runManager,
    skills: skillManager,
    compactSkillDescriptions: () => configStore.get().app.compactSkillDescriptions,
    agentToolProfile: () => configStore.get().tools.agentToolProfile,
    disabledToolNames: () => toolManagementService.getDisabledToolNames(),
    mcpTools: () => mcpServerManager.getAgentTools(),
    cronManager: () => cronManager,
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
    chatService,
    configStore,
    cronManager,
    mcpServerManager,
    providerManager,
    sessionRepo,
    skillManager,
    toolManagementService,
    dispose: () => {
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
