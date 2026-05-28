import { AgentRunner } from '@core/agent/agent-runner'
import type { TerminalService } from '@core/agent/terminal'
import type { ToolResolutionInput } from '@core/agent/tools/registry'
import { ToolRegistry } from '@core/agent/tools/registry'
import type { AgentTool } from '@core/agent/tools/types'
import type { AgentWorkspaceService } from '@core/agent/workspace'
import type { CronManager } from '@core/cron/cron-manager'
import type { AttachmentRepo, ChatMessageRepo, ChatRunRepo, ChatSessionRepo } from '@core/db/repos'
import type { Logger } from '@core/logging'
import type { ObservationManager } from '@core/observation'
import type { PersonaManager } from '@core/persona/manager'
import type { ProviderManager } from '@core/provider/manager'
import type { SkillManager } from '@core/skill/skill-manager'
import type {
  AbortRunRequest,
  AbortRunResponse,
  ChatMessage,
  ChatSession,
  ChatSystemContextConfig,
  CreateSessionRequest,
  DeleteSessionRequest,
  EditMessageRequest,
  EditMessageResponse,
  ListMessagesRequest,
  ListSessionsRequest,
  RegenerateMessageRequest,
  SendMessageRequest,
  SendMessageResponse,
  SessionContextInstruction,
  ToolApprovalRequest,
  ToolApprovalResponse,
  ToolProfile,
  UpdateSessionRequest,
} from '@shared/types/chat'
import type {
  DesktopChatContextSettings,
  DesktopSystemContextSettings,
  DesktopToolSettings,
} from '@shared/types/settings'
import type { WebContents } from 'electron'
import type { AttachmentService } from './attachment-service'
import type { ContextCompactionService } from './context-compaction'
import type { ContextBuilder } from './context-manager'
import type { InternalSendMessageResponse } from './run/orchestrator'
import { ChatRunOrchestrator } from './run/orchestrator'
import { resolveSelectedProviderAndModel } from './run/provider-selector'
import type { ChatRunEventTarget, RunManager } from './run-manager'
import { MessageEditor } from './support/message-editor'
import { SessionSummaryUpdater } from './support/session-summary'
import { SessionTitleGenerator } from './support/title-generator'

export interface ChatServiceOptions {
  sessions: ChatSessionRepo
  messages: ChatMessageRepo
  runs: ChatRunRepo
  attachments: AttachmentService
  attachmentRepo: AttachmentRepo
  providers: ProviderManager
  contextBuilder: ContextBuilder
  contextCompaction?: ContextCompactionService
  runManager: RunManager
  disabledToolNames?: () => Iterable<string>
  mcpTools?: (input: ToolResolutionInput) => AgentTool[] | Promise<AgentTool[]>
  workspaceService?: AgentWorkspaceService
  terminalService?: TerminalService
  toolSettings?: () => DesktopToolSettings
  cronManager?: () => CronManager
  observationManager?: () => ObservationManager | undefined
  skills?: SkillManager
  compactSkillDescriptions?: () => boolean
  contextDefaults?: () => DesktopChatContextSettings
  systemContextDefaults?: () => DesktopSystemContextSettings | undefined
  personaManager?: PersonaManager
  agentToolProfile?: () => ToolProfile
  agentRunner?: AgentRunner
  logger?: Logger
}

export class ChatService {
  private readonly agentRunner: AgentRunner
  private readonly logger?: Logger
  private readonly messageEditor: MessageEditor
  private readonly runOrchestrator: ChatRunOrchestrator
  private readonly sessionSummary: SessionSummaryUpdater
  private readonly titleGenerator: SessionTitleGenerator

  constructor(private readonly options: ChatServiceOptions) {
    this.logger = options.logger
    this.sessionSummary = new SessionSummaryUpdater({
      sessions: options.sessions,
      messages: options.messages,
      runs: options.runs,
      logger: options.logger,
    })
    this.messageEditor = new MessageEditor({
      messages: options.messages,
      contextCompaction: options.contextCompaction,
      logger: options.logger,
    })
    this.titleGenerator = new SessionTitleGenerator({
      sessions: options.sessions,
      messages: options.messages,
      providers: options.providers,
      logger: options.logger,
    })
    this.agentRunner =
      options.agentRunner ??
      new AgentRunner({
        messages: options.messages,
        runs: options.runs,
        attachments: options.attachments,
        providers: options.providers,
        contextBuilder: options.contextBuilder,
        contextCompaction: options.contextCompaction,
        runManager: options.runManager,
        workspaceService: options.workspaceService,
        toolSettings: options.toolSettings,
        disabledToolNames: options.disabledToolNames,
        skills: options.skills,
        compactSkillDescriptions: options.compactSkillDescriptions,
        contextDefaults: options.contextDefaults,
        toolRegistry: new ToolRegistry({
          messages: options.messages,
          attachments: options.attachments,
          skills: options.skills,
          cronManager: options.cronManager,
          observationManager: options.observationManager,
          workspaceService: options.workspaceService,
          terminalService: options.terminalService,
          toolSettings: options.toolSettings,
          disabledToolNames: options.disabledToolNames,
          mcpTools: options.mcpTools,
        }),
        onComplete: (sessionId) => this.sessionSummary.updateSessionSummary(sessionId),
        logger: options.logger?.child({ scope: 'agent' }),
      })
    this.runOrchestrator = new ChatRunOrchestrator({
      sessions: options.sessions,
      messages: options.messages,
      runs: options.runs,
      attachments: options.attachments,
      providers: options.providers,
      contextCompaction: options.contextCompaction,
      runManager: options.runManager,
      agentRunner: this.agentRunner,
      titleGenerator: this.titleGenerator,
      agentToolProfile: options.agentToolProfile,
      logger: options.logger,
    })
  }

  listSessions(request: ListSessionsRequest = {}): ChatSession[] {
    return this.options.sessions.list({
      kind: request.kind ?? 'chat',
      includeDeleted: request.includeDeleted,
    })
  }

  async createSession(request: CreateSessionRequest = {}): Promise<ChatSession> {
    const now = Date.now()
    const modelRef = await this.resolveInitialModelRef(request)
    const kind = request.kind === 'cat' || request.kind === 'vision' ? request.kind : 'chat'
    const contextDefaults = this.options.contextDefaults?.()
    const systemContext = this.buildDefaultSystemContext()
    const baseSystemPrompt = systemContext?.baseSystemPrompt
    const session: ChatSession = {
      id: crypto.randomUUID(),
      title:
        request.title?.trim() ||
        (kind === 'cat' ? '小猫会话' : kind === 'vision' ? '主动视觉' : '新会话'),
      kind,
      status: 'active',
      defaultProviderId: modelRef?.providerId,
      defaultModelId: modelRef?.modelId,
      systemPrompt: baseSystemPrompt?.trim() ? baseSystemPrompt : undefined,
      systemContext,
      messageCount: 0,
      contextPolicy: {
        mode: 'recent-turns',
        maxMessages: contextDefaults?.recentMessages ?? 40,
        includeAttachments: contextDefaults?.includeAttachments ?? 'current-only',
      },
      createdAt: now,
      updatedAt: now,
    }
    this.options.sessions.save(session)
    this.logger?.info('Chat session created.', {
      sessionId: session.id,
      kind: session.kind,
      providerId: session.defaultProviderId,
      modelId: session.defaultModelId,
      personaRefId: systemContext?.persona?.refId,
    })
    return session
  }

  private buildDefaultSystemContext(): ChatSystemContextConfig | undefined {
    const defaults = this.options.systemContextDefaults?.()
    const personaProfile = this.options.personaManager?.getActiveProfile()

    const baseSystemPrompt = defaults?.baseSystemPrompt?.trim() || undefined
    const maskInput = defaults?.mask
    const mask: SessionContextInstruction | undefined = maskInput?.text?.trim()
      ? {
          label: maskInput.label,
          text: maskInput.text,
          enabled: maskInput.enabled !== false,
        }
      : undefined
    const persona: SessionContextInstruction | undefined = personaProfile
      ? {
          refId: personaProfile.id,
          label: personaProfile.name,
          text: personaProfile.prompt,
        }
      : undefined

    if (!baseSystemPrompt && !mask && !persona) {
      return undefined
    }
    const systemContext: ChatSystemContextConfig = {}
    if (baseSystemPrompt) systemContext.baseSystemPrompt = baseSystemPrompt
    if (mask) systemContext.mask = mask
    if (persona) systemContext.persona = persona
    return systemContext
  }

  getSession(sessionId: string): ChatSession | null {
    return this.options.sessions.get(sessionId) ?? null
  }

  updateSession(request: UpdateSessionRequest): ChatSession {
    const session = this.requireSession(request.sessionId)
    const updated: ChatSession = {
      ...session,
      title: request.title ?? session.title,
      status: request.status ?? session.status,
      defaultProviderId: request.defaultProviderId ?? session.defaultProviderId,
      defaultModelId: request.defaultModelId ?? session.defaultModelId,
      systemPrompt: request.systemPrompt ?? session.systemPrompt,
      systemContext:
        request.systemContext ??
        (request.systemPrompt !== undefined
          ? {
              ...(session.systemContext ?? {}),
              baseSystemPrompt: request.systemPrompt,
            }
          : session.systemContext),
      pinned: request.pinned ?? session.pinned,
      contextPolicy: request.contextPolicy ?? session.contextPolicy,
      updatedAt: Date.now(),
    }
    this.options.sessions.save(updated)
    this.logger?.debug('Chat session updated.', {
      sessionId: updated.id,
      status: updated.status,
      providerId: updated.defaultProviderId,
      modelId: updated.defaultModelId,
    })
    return updated
  }

  deleteSession(request: DeleteSessionRequest | string): { deleted: boolean } {
    const sessionId = typeof request === 'string' ? request : request.sessionId
    const session = this.options.sessions.get(sessionId)
    if (session?.kind === 'vision') {
      this.options.observationManager?.()?.stopIfSessionActive(sessionId, 'session_deleted')
    }
    const deleted = this.options.sessions.markDeleted(sessionId)
    if (deleted) {
      this.options.contextCompaction?.hideForSession(sessionId)
    }
    this.logger?.info('Chat session delete requested.', { sessionId, deleted })
    return { deleted }
  }

  listMessages(request: ListMessagesRequest | string): ChatMessage[] {
    const sessionId = typeof request === 'string' ? request : request.sessionId
    const limit = typeof request === 'string' ? undefined : request.limit
    return this.options.messages
      .listBySession(sessionId, { limit })
      .map((message) => this.sessionSummary.attachRunContextUsage(message))
  }

  async sendMessage(
    request: SendMessageRequest,
    webContents: WebContents
  ): Promise<SendMessageResponse> {
    return this.runOrchestrator.sendMessage(request, webContents)
  }

  async sendInternalMessage(
    request: SendMessageRequest,
    target: ChatRunEventTarget,
    signal?: AbortSignal
  ): Promise<InternalSendMessageResponse> {
    return this.runOrchestrator.sendInternalMessage(
      {
        ...request,
        titleGeneration: false,
      },
      target,
      signal
    )
  }

  async abortRun(request: AbortRunRequest | string): Promise<AbortRunResponse> {
    return this.runOrchestrator.abortRun(request)
  }

  approveToolCall(request: ToolApprovalRequest): ToolApprovalResponse {
    return this.options.runManager.resolveToolApproval(request)
  }

  editMessage(request: EditMessageRequest): EditMessageResponse {
    return this.messageEditor.editMessage(request)
  }

  async regenerateMessage(
    request: RegenerateMessageRequest,
    webContents: WebContents
  ): Promise<SendMessageResponse> {
    return this.runOrchestrator.regenerateMessage(request, webContents)
  }

  private requireSession(sessionId: string): ChatSession {
    const session = this.options.sessions.get(sessionId)
    if (!session || session.status === 'deleted') {
      throw new Error(`Session not found: ${sessionId}`)
    }
    return session
  }

  private async resolveInitialModelRef(
    request: CreateSessionRequest
  ): Promise<{ providerId: string; modelId: string } | undefined> {
    if (request.providerId) {
      const { provider, model } = await resolveSelectedProviderAndModel(
        this.options.providers,
        request.providerId,
        request.modelId
      )
      return { providerId: provider.id, modelId: model.id }
    }

    if (request.modelId) {
      throw new Error('Creating a session with a model override requires a providerId.')
    }

    try {
      const { provider, modelId } = await this.options.providers.resolveDefaultProvider()
      return { providerId: provider.id, modelId }
    } catch (error) {
      this.logger?.warn('Chat session created without a resolved default model.', { error })
      return undefined
    }
  }
}
