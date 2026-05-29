import type { AgentRunner } from '@core/agent/agent-runner'
import type { AttachmentService } from '@core/chat/attachment-service'
import type { ContextCompactionService } from '@core/chat/context-compaction'
import type { SessionTitleGenerator } from '@core/chat/support/title-generator'
import type { ChatMessageRepo, ChatRunRepo, ChatSessionRepo } from '@core/db/repos'
import type { Logger } from '@core/logging'
import type { ProviderManager } from '@core/provider/manager'
import type {
  AbortRunRequest,
  AbortRunResponse,
  ChatSession,
  RegenerateMessageRequest,
  SendMessageRequest,
  SendMessageResponse,
  ToolProfile,
} from '@shared/types/chat'
import type { ChatRunEventTarget, ChatRunTerminalEvent, RunManager } from '../run-manager'
import { resolveProviderAndModel } from './provider-selector'
import { responseFromRun } from './response'
import { prepareSendRecords } from './send-preparation'

export interface ChatRunOrchestratorOptions {
  sessions: ChatSessionRepo
  messages: ChatMessageRepo
  runs: ChatRunRepo
  attachments: AttachmentService
  providers: ProviderManager
  contextCompaction?: ContextCompactionService
  runManager: RunManager
  agentRunner: AgentRunner
  titleGenerator: SessionTitleGenerator
  agentToolProfile?: () => ToolProfile
  logger?: Logger
}

export interface InternalSendMessageResponse extends SendMessageResponse {
  terminalEvent: Promise<ChatRunTerminalEvent>
}

export class ChatRunOrchestrator {
  constructor(private readonly options: ChatRunOrchestratorOptions) {}

  async sendMessage(
    request: SendMessageRequest,
    target: ChatRunEventTarget
  ): Promise<SendMessageResponse> {
    const { terminalEvent: _terminalEvent, ...response } = await this.sendMessageToTarget(
      request,
      target,
      { generateTitle: request.titleGeneration !== false }
    )
    return response
  }

  async sendInternalMessage(
    request: SendMessageRequest,
    target: ChatRunEventTarget,
    signal?: AbortSignal
  ): Promise<InternalSendMessageResponse> {
    return this.sendMessageToTarget(request, target, {
      generateTitle: false,
      signal,
    })
  }

  private async sendMessageToTarget(
    request: SendMessageRequest,
    target: ChatRunEventTarget,
    options: {
      generateTitle: boolean
      signal?: AbortSignal
    }
  ): Promise<InternalSendMessageResponse> {
    const existing = this.options.runManager.getExistingIdempotentRun(request.idempotencyKey)
    if (existing) {
      const response = responseFromRun(existing)
      return {
        ...response,
        terminalEvent: this.options.runManager.waitForTerminalEvent(existing.id, options.signal),
      }
    }

    const session = this.requireSession(request.sessionId)
    const { provider, model, fallbackReason } = await resolveProviderAndModel(
      this.options.providers,
      session,
      request.providerId,
      request.modelId
    )
    const { userMessage, assistantMessage, run, attachmentLinks } = prepareSendRecords({
      request,
      session,
      provider,
      model,
      attachments: this.options.attachments,
      fallbackReason,
    })

    this.options.messages.save(userMessage)
    this.options.messages.save(assistantMessage)
    this.options.messages.replaceAttachmentLinks(
      userMessage.id,
      attachmentLinks.map((link) => ({ ...link, messageId: userMessage.id }))
    )
    this.options.runs.save(run)
    const signal = this.options.runManager.start(run.id, target)
    const terminalEvent = this.options.runManager.waitForTerminalEvent(run.id, options.signal)
    const abort = () => this.options.runManager.abort(run.id, 'external_abort')
    options.signal?.addEventListener('abort', abort, { once: true })
    terminalEvent.finally(() => options.signal?.removeEventListener('abort', abort)).catch(() => {})
    const tavernDefaultRun = isDefaultTavernRun(session, request)
    const toolProfile = tavernDefaultRun
      ? 'minimal'
      : (request.toolProfile ?? this.options.agentToolProfile?.())
    const mode = tavernDefaultRun ? 'fast_chat' : request.mode
    const omittedInventoryReasons = tavernDefaultRun
      ? ['tavern_run_profile_no_tool_inventory', 'tavern_run_profile_no_skill_inventory']
      : undefined
    this.options.runManager.emit({
      type: 'started',
      runId: run.id,
      sessionId: session.id,
      assistantMessageId: assistantMessage.id,
      seq: this.options.runManager.nextSeq(run.id),
    })

    void this.options.agentRunner.run({
      run,
      session,
      provider,
      model,
      signal,
      mode,
      toolProfile,
      maxSteps: request.maxSteps,
      transientImageInputs: request.transientImageInputs,
      transientSystemInstructions: request.transientSystemInstructions,
      transientCurrentMessageParts: request.transientCurrentMessageParts,
      omitSkillInventory: tavernDefaultRun,
      omittedInventoryReasons,
    })
    if (options.generateTitle && session.kind !== 'vision') {
      void this.options.titleGenerator.generateFromMessage(session.id, userMessage.id, target)
    }

    this.options.logger?.info('Chat run accepted.', {
      runId: run.id,
      sessionId: session.id,
      providerId: provider.id,
      modelId: model.id,
      fallbackReason,
      attachmentCount: attachmentLinks.length,
      mode,
      toolProfile,
      tavernDefaultRun,
    })
    return {
      ...responseFromRun(run),
      terminalEvent,
    }
  }

  async regenerateMessage(
    request: RegenerateMessageRequest,
    targetEvent: ChatRunEventTarget
  ): Promise<SendMessageResponse> {
    const target = this.options.messages.get(request.messageId)
    if (!target) {
      throw new Error('Message not found.')
    }
    if (isTavernGreetingMessage(target)) {
      throw new UnsupportedChatOperationError(
        'Local tavern greeting messages cannot be regenerated.'
      )
    }
    const messages = this.options.messages.listBySession(request.sessionId)
    const targetIndex = messages.findIndex((message) => message.id === request.messageId)
    const user = [...messages.slice(0, targetIndex)]
      .reverse()
      .find((message) => message.role === 'user')
    if (!user) {
      throw new Error('No preceding user message found.')
    }
    this.options.messages.updateStatus(target.id, 'superseded')
    this.options.contextCompaction?.markStaleByMessage(target)
    this.options.logger?.info('Chat regeneration requested.', {
      sessionId: request.sessionId,
      targetMessageId: request.messageId,
      providerId: request.providerId,
      modelId: request.modelId,
    })
    return this.sendMessage(
      {
        sessionId: request.sessionId,
        parts: user.parts,
        providerId: request.providerId,
        modelId: request.modelId,
        toolProfile: request.toolProfile,
        maxSteps: request.maxSteps,
        idempotencyKey: request.idempotencyKey,
      },
      targetEvent
    )
  }

  async abortRun(request: AbortRunRequest | string): Promise<AbortRunResponse> {
    const runId = typeof request === 'string' ? request : request.runId
    const reason = typeof request === 'string' ? undefined : request.reason
    const aborted = this.options.runManager.abort(runId, reason)
    if (aborted) {
      const run = this.options.runs.get(runId)
      if (run) {
        const error = {
          code: 'aborted' as const,
          message: reason ?? 'Run aborted.',
          retryable: false,
        }
        this.options.runs.updateStatus(runId, 'aborted', {
          finishedAt: Date.now(),
          abortReason: reason,
          error,
        })
        this.options.messages.updateStatus(run.assistantMessageId, 'aborted')
      }
    }
    this.options.logger?.info('Chat run abort requested.', { runId, aborted })
    return { runId, aborted }
  }

  private requireSession(sessionId: string): ChatSession {
    const session = this.options.sessions.get(sessionId)
    if (!session || session.status === 'deleted') {
      throw new Error(`Session not found: ${sessionId}`)
    }
    return session
  }
}

function isDefaultTavernRun(session: ChatSession, request: SendMessageRequest): boolean {
  return Boolean(session.metadata?.tavern?.enabled && request.mode === undefined)
}

class UnsupportedChatOperationError extends Error {
  readonly code = 'unsupported_operation'

  constructor(message: string) {
    super(message)
    this.name = 'UnsupportedChatOperationError'
  }
}

function isTavernGreetingMessage(message: { metadata?: Record<string, unknown> }): boolean {
  const tavern = message.metadata?.tavern
  return Boolean(
    tavern &&
      typeof tavern === 'object' &&
      'greeting' in tavern &&
      (tavern as { greeting?: unknown }).greeting === true
  )
}
