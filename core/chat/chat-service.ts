import { AgentRunner } from '@core/agent/agent-runner'
import type { TerminalService } from '@core/agent/terminal'
import type { ToolResolutionInput } from '@core/agent/tools/registry'
import { ToolRegistry } from '@core/agent/tools/registry'
import type { AgentTool } from '@core/agent/tools/types'
import type { AgentWorkspaceService } from '@core/agent/workspace'
import type { CronManager } from '@core/cron/cron-manager'
import type { AttachmentRepo, ChatMessageRepo, ChatRunRepo, ChatSessionRepo } from '@core/db/repos'
import type { Logger } from '@core/logging'
import type { CompanionMemoryService } from '@core/memory/service'
import type { ObservationManager } from '@core/observation'
import type { ProviderManager } from '@core/provider/manager'
import type { SkillManager } from '@core/skill/skill-manager'
import type {
  AbortRunRequest,
  AbortRunResponse,
  ChatMessage,
  ChatMessagePart,
  ChatSession,
  ChatSessionKind,
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
  DesktopCompanionRoleSettings,
  DesktopSystemContextSettings,
  DesktopToolSettings,
} from '@shared/types/settings'
import type { WebContents } from 'electron'
import {
  buildCompanionRoleKnowledgeInstruction,
  companionRoleKnowledgeScanDepth,
  compileCompanionRoleInstruction,
  renderCompanionRoleTemplate,
} from '../prompts'
import type { AttachmentService } from './attachment-service'
import type { ContextCompactionService } from './context-compaction'
import type { ContextBuilder } from './context-manager'
import type { InternalSendMessageResponse } from './run/orchestrator'
import { ChatRunOrchestrator } from './run/orchestrator'
import { resolveSelectedProviderAndModel } from './run/provider-selector'
import type { ChatRunEventTarget, RunManager } from './run-manager'
import { createDefaultSessionRecord, createVisionSessionRecord } from './session-defaults'
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
  companionRoles?: () => readonly DesktopCompanionRoleSettings[]
  companionRoleDefaults?: () => DesktopCompanionRoleSettings | undefined
  catPetRuntimeInstruction?: () => string | undefined
  memoryService?: CompanionMemoryService
  agentToolProfile?: () => ToolProfile
  maxAgentSteps?: () => number
  agentRunner?: AgentRunner
  logger?: Logger
}

export class ChatSessionKindMismatchError extends Error {
  readonly code = 'session_kind_mismatch'

  constructor(
    readonly sessionId: string,
    readonly expectedKind: ChatSessionKind,
    readonly actualKind: ChatSessionKind | undefined
  ) {
    super(`Session ${sessionId} is not a ${expectedKind} session.`)
    this.name = 'ChatSessionKindMismatchError'
  }
}

export interface GetOrCreateSessionRequest {
  kind: Extract<ChatSessionKind, 'cat' | 'vision'>
  preferredId?: string | null
  preferredIds?: Array<string | null | undefined>
  title?: string
  preferredMismatch?: 'throw' | 'ignore'
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
        memoryService: options.memoryService,
        toolRegistry: new ToolRegistry({
          messages: options.messages,
          attachments: options.attachments,
          memoryService: options.memoryService,
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
        onRunComplete: ({ run, session }) =>
          options.memoryService?.enqueueExtraction({ run, session }),
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
      maxAgentSteps: options.maxAgentSteps,
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
    const kind = request.kind === 'cat' || request.kind === 'vision' ? request.kind : 'chat'
    const modelRef = await this.resolveInitialModelRef(
      this.withCompanionRoleModelDefaults(kind, request)
    )
    const session = this.createSessionRecord({
      kind,
      title: request.title,
      modelRef,
      includeDefaultSystemContext: true,
      metadata: request.metadata,
    })
    this.options.sessions.save(session)
    const greetingSeeded =
      kind === 'cat'
        ? this.seedCompanionRoleGreeting(session, this.options.companionRoleDefaults?.())
        : false
    this.logger?.info('Chat session created.', {
      sessionId: session.id,
      kind: session.kind,
      providerId: session.defaultProviderId,
      modelId: session.defaultModelId,
      roleRefId: session.systemContext?.role?.refId,
    })
    return greetingSeeded ? (this.options.sessions.get(session.id) ?? session) : session
  }

  async getOrCreateSession(request: GetOrCreateSessionRequest): Promise<ChatSession> {
    const preferredIds = normalizePreferredSessionIds(request)
    for (const requestedId of preferredIds) {
      const preferred = this.options.sessions.get(requestedId)
      if (preferred && preferred.status !== 'deleted' && preferred.kind === request.kind) {
        return preferred
      }
      if (preferred && preferred.kind !== request.kind) {
        if (request.preferredMismatch !== 'ignore') {
          throw new ChatSessionKindMismatchError(
            requestedId,
            request.kind,
            preferred.kind ?? 'chat'
          )
        }
      }
    }

    const existing = this.options.sessions
      .list({ kind: request.kind })
      .find((session) => session.status === 'active')
    if (existing) {
      return existing
    }

    const modelRef =
      request.kind === 'cat'
        ? await this.resolveInitialModelRef(this.withCompanionRoleModelDefaults('cat', {})).catch(
            () => undefined
          )
        : undefined
    const session =
      request.kind === 'vision'
        ? this.createSessionRecord({
            kind: 'vision',
            title: request.title,
            includeDefaultSystemContext: false,
          })
        : this.createSessionRecord({
            kind: 'cat',
            title: request.title,
            modelRef,
            includeDefaultSystemContext: true,
          })
    this.options.sessions.save(session)
    const greetingSeeded =
      request.kind === 'cat'
        ? this.seedCompanionRoleGreeting(session, this.options.companionRoleDefaults?.())
        : false
    this.logger?.info('Chat session ensured.', { sessionId: session.id, kind: session.kind })
    return greetingSeeded ? (this.options.sessions.get(session.id) ?? session) : session
  }

  buildDefaultSystemContext(
    kind: Extract<ChatSessionKind, 'chat' | 'cat' | 'vision'> = 'chat'
  ): ChatSystemContextConfig | undefined {
    const defaults = this.options.systemContextDefaults?.()
    const roleInstruction =
      kind === 'chat' || kind === 'cat'
        ? compileCompanionRoleInstruction(this.options.companionRoleDefaults?.())
        : undefined

    const baseSystemPrompt = defaults?.baseSystemPrompt?.trim() || undefined
    const maskInput = defaults?.mask
    const mask: SessionContextInstruction | undefined = maskInput?.text?.trim()
      ? {
          label: maskInput.label,
          text: maskInput.text,
          enabled: maskInput.enabled !== false,
        }
      : undefined
    if (!baseSystemPrompt && !mask && !roleInstruction) {
      return undefined
    }
    const systemContext: ChatSystemContextConfig = {}
    if (baseSystemPrompt) systemContext.baseSystemPrompt = baseSystemPrompt
    if (mask) systemContext.mask = mask
    if (roleInstruction) systemContext.role = roleInstruction
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
      metadata:
        request.metadata !== undefined
          ? {
              ...(session.metadata ?? {}),
              ...request.metadata,
            }
          : session.metadata,
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
    return this.runOrchestrator.sendMessage(this.withRuntimeInstructions(request), webContents)
  }

  async sendInternalMessage(
    request: SendMessageRequest,
    target: ChatRunEventTarget,
    signal?: AbortSignal
  ): Promise<InternalSendMessageResponse> {
    return this.runOrchestrator.sendInternalMessage(
      {
        ...this.withRuntimeInstructions(request),
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

  private seedCompanionRoleGreeting(
    session: ChatSession,
    role: DesktopCompanionRoleSettings | undefined
  ): boolean {
    if (!role?.enabled) {
      return false
    }

    const text = companionRoleGreetingText(role)
    if (!text) {
      return false
    }

    const now = Date.now()
    const message: ChatMessage = {
      id: crypto.randomUUID(),
      sessionId: session.id,
      role: 'assistant',
      status: 'complete',
      parts: [{ type: 'plain', text }],
      metadata: {
        companionRole: {
          greeting: true,
          local: true,
          roleId: role.id,
        },
      },
      createdAt: now,
      updatedAt: now,
    }
    this.options.messages.save(message)
    this.options.sessions.updateMessageSummary(
      session.id,
      {
        messageCount: 1,
        lastMessagePreview: text.slice(0, 240),
        lastMessageAt: now,
      },
      now
    )
    return true
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

  private createSessionRecord(input: {
    kind: Extract<ChatSessionKind, 'chat' | 'cat' | 'vision'>
    title?: string
    modelRef?: { providerId: string; modelId: string }
    includeDefaultSystemContext: boolean
    metadata?: ChatSession['metadata']
  }): ChatSession {
    const now = Date.now()
    const systemContext = input.includeDefaultSystemContext
      ? this.buildDefaultSystemContext(input.kind)
      : undefined
    const baseSystemPrompt = systemContext?.baseSystemPrompt

    if (input.kind === 'vision') {
      const session = createVisionSessionRecord(now)
      return {
        ...session,
        ...(input.title?.trim() ? { title: input.title.trim() } : {}),
        defaultProviderId: input.modelRef?.providerId,
        defaultModelId: input.modelRef?.modelId,
        systemPrompt: baseSystemPrompt?.trim() ? baseSystemPrompt : undefined,
        systemContext,
        metadata: input.metadata ?? session.metadata,
      }
    }

    const contextDefaults = this.options.contextDefaults?.()
    return createDefaultSessionRecord({
      kind: input.kind,
      title: input.title,
      defaultProviderId: input.modelRef?.providerId,
      defaultModelId: input.modelRef?.modelId,
      systemPrompt: baseSystemPrompt,
      systemContext,
      metadata: input.metadata,
      recentMessages: contextDefaults?.recentMessages,
      includeAttachments: contextDefaults?.includeAttachments,
      now,
    })
  }

  private withCompanionRoleModelDefaults(
    kind: Extract<ChatSessionKind, 'chat' | 'cat' | 'vision'>,
    request: Pick<CreateSessionRequest, 'providerId' | 'modelId'>
  ): Pick<CreateSessionRequest, 'providerId' | 'modelId'> {
    if (kind !== 'cat' || request.providerId || request.modelId) {
      return request
    }

    const role = this.options.companionRoleDefaults?.()
    if (!role?.defaultProviderId || !role.defaultModelId) {
      return request
    }

    return {
      ...request,
      providerId: role.defaultProviderId,
      modelId: role.defaultModelId,
    }
  }

  private withCompanionRoleKnowledgeInstructions(request: SendMessageRequest): SendMessageRequest {
    const session = this.options.sessions.get(request.sessionId)
    const role = session ? this.companionRoleForSession(session) : undefined
    const recentMessages = session
      ? this.options.messages
          .listBySession(session.id)
          .slice(-companionRoleKnowledgeScanDepth(role))
      : []
    const instruction = buildCompanionRoleKnowledgeInstruction(role, [
      ...recentMessages.map(chatMessageText),
      sendRequestText(request),
    ])
    if (!instruction) {
      return request
    }

    return {
      ...request,
      transientSystemInstructions: [...(request.transientSystemInstructions ?? []), instruction],
    }
  }

  private withRuntimeInstructions(request: SendMessageRequest): SendMessageRequest {
    return this.withCatPetRuntimeInstruction(this.withCompanionRoleKnowledgeInstructions(request))
  }

  private withCatPetRuntimeInstruction(request: SendMessageRequest): SendMessageRequest {
    const session = this.options.sessions.get(request.sessionId)
    if (session?.kind !== 'cat') {
      return request
    }

    const text = this.options.catPetRuntimeInstruction?.()?.trim()
    if (!text) {
      return request
    }

    return {
      ...request,
      transientSystemInstructions: [
        ...(request.transientSystemInstructions ?? []),
        {
          id: 'cat-pet-state',
          kind: 'runtime',
          source: 'cat.pet',
          refId: 'cat-pet',
          text,
        },
      ],
    }
  }

  private companionRoleForSession(session: ChatSession): DesktopCompanionRoleSettings | undefined {
    const roleRefId = session.systemContext?.role?.refId?.trim()
    if (!roleRefId) {
      return undefined
    }

    const role =
      this.options.companionRoles?.().find((item) => item.id === roleRefId) ??
      this.options.companionRoleDefaults?.()
    if (!role?.enabled || role.id !== roleRefId) {
      return undefined
    }
    return role
  }
}

function normalizePreferredSessionIds(request: GetOrCreateSessionRequest): string[] {
  const ids = [request.preferredId, ...(request.preferredIds ?? [])]
  const seen = new Set<string>()
  const normalized: string[] = []
  for (const value of ids) {
    const id = value?.trim()
    if (!id || seen.has(id)) {
      continue
    }
    seen.add(id)
    normalized.push(id)
  }
  return normalized
}

function chatMessageText(message: ChatMessage): string {
  return chatMessagePartsText(message.parts)
}

function sendRequestText(request: SendMessageRequest): string {
  const partsText = chatMessagePartsText(request.parts ?? [])
  const transientPartsText = chatMessagePartsText(request.transientCurrentMessageParts ?? [])
  return [request.content ?? '', partsText, transientPartsText].filter(Boolean).join('\n')
}

function chatMessagePartsText(parts: readonly ChatMessagePart[]): string {
  return parts
    .map((part) => {
      if (part.type === 'plain' && typeof part.text === 'string') return part.text
      if (part.type === 'reply' && typeof part.selectedText === 'string') return part.selectedText
      if (part.type === 'reply' && typeof part.selected_text === 'string') return part.selected_text
      return ''
    })
    .filter(Boolean)
    .join('\n')
}

function companionRoleGreetingText(role: DesktopCompanionRoleSettings): string | undefined {
  const greetings = [role.greeting, ...role.alternateGreetings]
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim())
  const raw =
    role.greetingMode === 'random' && greetings.length > 1
      ? greetings[Math.floor(Math.random() * greetings.length)]
      : greetings[0]
  const rendered = raw ? renderCompanionRoleTemplate(raw, role).trim() : ''
  return rendered || undefined
}
