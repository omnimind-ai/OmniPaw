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
import type { TavernContextService } from '@core/tavern/context-service'
import type { TavernManager } from '@core/tavern/manager'
import { TavernRegistryValidationError, tavernRegistryError } from '@core/tavern/registry-schema'
import { renderTavernTemplate } from '@core/tavern/template'
import type {
  AbortRunRequest,
  AbortRunResponse,
  ChatMessage,
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
  DesktopSystemContextSettings,
  DesktopToolSettings,
} from '@shared/types/settings'
import type {
  CreateTavernSessionRequest,
  TavernCharacter,
  TavernSessionMetadata,
  TavernSessionOperationResult,
  UpdateTavernSessionBindingRequest,
} from '@shared/types/tavern'
import type { WebContents } from 'electron'
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
  personaManager?: PersonaManager
  tavernManager?: TavernManager
  tavernContextService?: TavernContextService
  agentToolProfile?: () => ToolProfile
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
        tavernContextService: options.tavernContextService,
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
    const modelRef = await this.resolveInitialModelRef(request)
    const kind = request.kind === 'cat' || request.kind === 'vision' ? request.kind : 'chat'
    const session = this.createSessionRecord({
      kind,
      title: request.title,
      modelRef,
      includeDefaultSystemContext: true,
      metadata: request.metadata,
    })
    this.options.sessions.save(session)
    this.logger?.info('Chat session created.', {
      sessionId: session.id,
      kind: session.kind,
      providerId: session.defaultProviderId,
      modelId: session.defaultModelId,
      personaRefId: session.systemContext?.persona?.refId,
    })
    return session
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
        ? await this.resolveInitialModelRef({}).catch(() => undefined)
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
    this.logger?.info('Chat session ensured.', { sessionId: session.id, kind: session.kind })
    return this.options.sessions.get(session.id) ?? session
  }

  buildDefaultSystemContext(): ChatSystemContextConfig | undefined {
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

  async createTavernSession(
    request: CreateTavernSessionRequest
  ): Promise<TavernSessionOperationResult> {
    const manager = this.requireTavernManager()
    const character = manager.getCharacter(request.characterId)
    if (!character || character.enabled === false) {
      throw new TavernRegistryValidationError(
        tavernRegistryError('not_found', `Tavern character not found: ${request.characterId}.`)
      )
    }
    const modelRef = await this.resolveInitialModelRef(request)
    const lorebookIds = normalizeLorebookBinding(
      request.lorebookIds?.length ? request.lorebookIds : character.defaultLorebookIds,
      manager
    )
    const selectedGreetingIndex = clampGreetingIndex(character, request.selectedGreetingIndex ?? 0)
    const now = Date.now()
    const metadata: TavernSessionMetadata = {
      enabled: true,
      version: 1,
      characterId: character.id,
      characterName: character.name,
      lorebookIds,
      userName: request.userName?.trim() || 'User',
      selectedGreetingIndex,
      contextPreset: request.contextPreset ?? 'default',
      createdAt: now,
      updatedAt: now,
    }
    const session = withoutPersonaContext(
      this.createSessionRecord({
        kind: 'tavern',
        title: request.title?.trim() || character.name,
        modelRef,
        includeDefaultSystemContext: true,
        metadata: { tavern: metadata },
      })
    )
    this.options.sessions.save(session)
    const greetingCreated = this.seedTavernGreeting(session, character, metadata)
    this.logger?.info('Tavern chat session created.', {
      sessionId: session.id,
      characterId: character.id,
      lorebookCount: lorebookIds.length,
      greetingCreated,
    })
    return {
      ok: true,
      registry: manager.list().registry,
      status: manager.status(),
      session: this.options.sessions.get(session.id) ?? session,
      greetingReplaced: greetingCreated,
    }
  }

  updateTavernSessionBinding(
    request: UpdateTavernSessionBindingRequest
  ): TavernSessionOperationResult {
    const manager = this.requireTavernManager()
    const session = this.requireSession(request.sessionId)
    const existing = session.metadata?.tavern
    if (!existing?.enabled) {
      throw new TavernRegistryValidationError(
        tavernRegistryError('unsupported_operation', 'Session is not a tavern session.')
      )
    }
    const characterId = request.characterId ?? existing.characterId
    const character = manager.getCharacter(characterId)
    if (!character || character.enabled === false) {
      throw new TavernRegistryValidationError(
        tavernRegistryError('not_found', `Tavern character not found: ${characterId}.`)
      )
    }
    const lorebookIds =
      request.lorebookIds !== undefined
        ? normalizeLorebookBinding(request.lorebookIds, manager)
        : existing.lorebookIds
    const nextMetadata: TavernSessionMetadata = {
      ...existing,
      characterId: character.id,
      characterName: character.name,
      lorebookIds,
      userName: request.userName?.trim() || existing.userName || 'User',
      selectedGreetingIndex: clampGreetingIndex(
        character,
        request.selectedGreetingIndex ?? existing.selectedGreetingIndex
      ),
      contextPreset: request.contextPreset ?? existing.contextPreset ?? 'default',
      updatedAt: Date.now(),
    }
    const updated: ChatSession = {
      ...session,
      kind: 'tavern',
      title: session.title || character.name,
      metadata: {
        ...(session.metadata ?? {}),
        tavern: nextMetadata,
      },
      updatedAt: Date.now(),
    }
    this.options.sessions.save(updated)
    const greetingReplaced = this.replaceTavernGreetingBeforeUserTurn(
      updated,
      character,
      nextMetadata
    )
    this.logger?.info('Tavern session binding updated.', {
      sessionId: updated.id,
      characterId: character.id,
      lorebookCount: lorebookIds.length,
      greetingReplaced,
    })
    return {
      ok: true,
      registry: manager.list().registry,
      status: manager.status(),
      session: this.options.sessions.get(updated.id) ?? updated,
      greetingReplaced,
    }
  }

  private requireSession(sessionId: string): ChatSession {
    const session = this.options.sessions.get(sessionId)
    if (!session || session.status === 'deleted') {
      throw new Error(`Session not found: ${sessionId}`)
    }
    return session
  }

  private requireTavernManager(): TavernManager {
    if (!this.options.tavernManager) {
      throw new TavernRegistryValidationError(
        tavernRegistryError('unsupported_operation', 'Tavern manager is not available.')
      )
    }
    return this.options.tavernManager
  }

  private seedTavernGreeting(
    session: ChatSession,
    character: TavernCharacter,
    metadata: TavernSessionMetadata
  ): boolean {
    const text = tavernGreetingText(character, metadata)
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
        tavern: {
          greeting: true,
          local: true,
          characterId: character.id,
          selectedGreetingIndex: metadata.selectedGreetingIndex,
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

  private replaceTavernGreetingBeforeUserTurn(
    session: ChatSession,
    character: TavernCharacter,
    metadata: TavernSessionMetadata
  ): boolean {
    const messages = this.options.messages.listBySession(session.id)
    if (messages.some((message) => message.role === 'user')) {
      return false
    }
    const text = tavernGreetingText(character, metadata)
    if (!text) {
      return false
    }
    const existing = messages.find((message) => isTavernGreetingMessage(message))
    const now = Date.now()
    if (existing) {
      this.options.messages.updateParts(
        existing.id,
        [{ type: 'plain', text }],
        {
          status: 'complete',
          metadata: {
            ...(existing.metadata ?? {}),
            tavern: {
              greeting: true,
              local: true,
              characterId: character.id,
              selectedGreetingIndex: metadata.selectedGreetingIndex,
            },
          },
        },
        now
      )
    } else {
      this.seedTavernGreeting(session, character, metadata)
    }
    this.options.sessions.updateMessageSummary(
      session.id,
      {
        messageCount: existing ? messages.length : messages.length + 1,
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
    kind: Extract<ChatSessionKind, 'chat' | 'tavern' | 'cat' | 'vision'>
    title?: string
    modelRef?: { providerId: string; modelId: string }
    includeDefaultSystemContext: boolean
    metadata?: ChatSession['metadata']
  }): ChatSession {
    const now = Date.now()
    const systemContext = input.includeDefaultSystemContext
      ? this.buildDefaultSystemContext()
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
}

export class TavernChatOperationError extends Error {
  readonly code: 'unsupported_operation'

  constructor(message: string) {
    super(message)
    this.name = 'TavernChatOperationError'
    this.code = 'unsupported_operation'
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

function tavernGreetingText(
  character: TavernCharacter,
  metadata: TavernSessionMetadata
): string | undefined {
  const greetings = characterGreetingTexts(character)
  const raw = greetings[metadata.selectedGreetingIndex] ?? greetings[0]
  const rendered = renderTavernTemplate(raw, {
    char: character.name,
    user: metadata.userName || 'User',
  }).trim()
  return rendered || undefined
}

function characterGreetingTexts(character: TavernCharacter): string[] {
  return [character.firstMessage, ...character.alternateGreetings]
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim())
}

function clampGreetingIndex(character: TavernCharacter, index: number): number {
  const max = Math.max(0, characterGreetingTexts(character).length - 1)
  if (!Number.isFinite(index)) {
    return 0
  }
  return Math.max(0, Math.min(max, Math.floor(index)))
}

function normalizeLorebookBinding(ids: readonly string[], manager: TavernManager): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const id of ids) {
    const trimmed = id.trim()
    if (!trimmed || seen.has(trimmed)) continue
    if (!manager.getLorebook(trimmed)) continue
    seen.add(trimmed)
    result.push(trimmed)
  }
  return result
}

function isTavernGreetingMessage(message: ChatMessage): boolean {
  const tavern = message.metadata?.tavern
  return Boolean(
    tavern &&
      typeof tavern === 'object' &&
      'greeting' in tavern &&
      (tavern as { greeting?: unknown }).greeting === true
  )
}

function withoutPersonaContext(session: ChatSession): ChatSession {
  if (!session.systemContext?.persona) {
    return session
  }
  const { persona: _persona, ...systemContext } = session.systemContext
  return {
    ...session,
    systemContext,
  }
}
