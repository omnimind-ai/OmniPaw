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
  ChatMessage,
  ChatRun,
  ChatSession,
  ListRunsRequest,
  RegenerateMessageRequest,
  SendMessageRequest,
  SendMessageResponse,
  SubscribeRunRequest,
  SubscribeRunResponse,
  ToolProfile,
} from '@shared/types/chat'
import type { ChatRunEventTarget, ChatRunTerminalEvent, RunManager } from '../run-manager'
import { resolveProviderAndModel, resolveSelectedProviderAndModel } from './provider-selector'
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
  maxAgentSteps?: () => number
  logger?: Logger
}

export interface InternalSendMessageResponse extends SendMessageResponse {
  terminalEvent: Promise<ChatRunTerminalEvent>
}

export class ChatRunOrchestrator {
  constructor(private readonly options: ChatRunOrchestratorOptions) {}

  listRuns(request: ListRunsRequest = {}): ChatRun[] {
    return this.options.runs.list({
      sessionId: request.sessionId,
      statuses: request.statuses,
      limit: request.limit,
    })
  }

  subscribeRun(request: SubscribeRunRequest, target: ChatRunEventTarget): SubscribeRunResponse {
    const run = this.options.runs.get(request.runId)
    if (!run) {
      throw new Error(`Run not found: ${request.runId}`)
    }
    const replay = this.options.runManager.subscribe(run.id, target, request.afterSeq)
    return {
      run,
      message: this.options.messages.get(run.assistantMessageId),
      ...replay,
    }
  }

  async recoverResidualRuns(
    target: ChatRunEventTarget
  ): Promise<{ resumed: number; interrupted: number }> {
    const residualRuns = this.options.runs.list({
      statuses: ['queued', 'running'],
      limit: 500,
    })
    let resumed = 0
    let interrupted = 0
    const reconciledSessionIds = new Set<string>()

    for (const run of residualRuns) {
      if (reconciledSessionIds.has(run.sessionId)) {
        this.archiveInterruptedRun(
          run,
          this.options.messages.get(run.assistantMessageId),
          'superseded_by_newer_residual_run'
        )
        interrupted += 1
        continue
      }
      reconciledSessionIds.add(run.sessionId)
      const result = await this.recoverResidualRun(run, target)
      if (result === 'resumed') {
        resumed += 1
      } else {
        interrupted += 1
      }
    }

    if (residualRuns.length) {
      this.options.logger?.info('Residual chat runs reconciled at startup.', {
        residualRunCount: residualRuns.length,
        resumed,
        interrupted,
      })
    }
    return { resumed, interrupted }
  }

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
    const toolProfile = request.toolProfile ?? this.options.agentToolProfile?.()
    const mode = request.mode
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
      maxSteps: request.maxSteps ?? this.options.maxAgentSteps?.(),
      transientImageInputs: request.transientImageInputs,
      transientSystemInstructions: request.transientSystemInstructions,
      transientCurrentMessageParts: request.transientCurrentMessageParts,
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

  private async recoverResidualRun(
    run: ChatRun,
    target: ChatRunEventTarget
  ): Promise<'resumed' | 'interrupted'> {
    const session = this.options.sessions.get(run.sessionId)
    const userMessage = this.options.messages.get(run.userMessageId)
    const assistantMessage = this.options.messages.get(run.assistantMessageId)
    const unsafeReason = residualRunUnsafeReason(run, session, userMessage, assistantMessage)
    if (unsafeReason) {
      this.archiveInterruptedRun(run, assistantMessage, unsafeReason)
      return 'interrupted'
    }
    if (!session || !assistantMessage) {
      this.archiveInterruptedRun(run, assistantMessage, 'recovery_state_unavailable')
      return 'interrupted'
    }

    const signal = this.options.runManager.start(run.id, target)
    try {
      const { provider, model } = await resolveSelectedProviderAndModel(
        this.options.providers,
        run.providerId,
        run.modelId
      )
      const recoveredAt = Date.now()
      const recoveredRun: ChatRun = {
        ...run,
        status: 'running',
        finishedAt: undefined,
        abortReason: undefined,
        error: undefined,
        requestSnapshot: {
          ...(run.requestSnapshot ?? {
            api: provider.api ?? provider.type ?? provider.id,
            model: model.remoteId || model.id,
            messageCount: 0,
            attachmentCount: 0,
          }),
          transport: {
            ...run.requestSnapshot?.transport,
            streamCompleted: false,
            recovery: {
              disposition: 'resumed',
              reason: 'safe_empty_assistant_message',
              at: recoveredAt,
            },
          },
        },
        updatedAt: recoveredAt,
      }
      this.options.runs.save(recoveredRun)
      this.options.messages.save({
        ...assistantMessage,
        status: 'streaming',
        error: undefined,
        updatedAt: recoveredAt,
      })
      this.options.runManager.emit({
        type: 'resumed',
        runId: run.id,
        sessionId: run.sessionId,
        assistantMessageId: run.assistantMessageId,
        seq: this.options.runManager.nextSeq(run.id),
        reason: 'startup_recovery',
      })
      void this.options.agentRunner
        .run({
          run: recoveredRun,
          session,
          provider,
          model,
          signal,
          mode: recoveredRun.requestSnapshot?.mode,
          toolProfile: recoveredRun.requestSnapshot?.toolProfile,
          maxSteps: recoveredRun.requestSnapshot?.maxSteps,
        })
        .catch((error) => {
          this.options.logger?.warn('Recovered chat run rejected unexpectedly.', {
            runId: run.id,
            sessionId: run.sessionId,
            error,
          })
        })
      this.options.logger?.info('Residual chat run resumed.', {
        runId: run.id,
        sessionId: run.sessionId,
        providerId: run.providerId,
        modelId: run.modelId,
      })
      return 'resumed'
    } catch (error) {
      const archivedError = this.archiveInterruptedRun(
        run,
        assistantMessage,
        'provider_or_model_unavailable'
      )
      this.options.runManager.emit({
        type: 'error',
        runId: run.id,
        sessionId: run.sessionId,
        assistantMessageId: run.assistantMessageId,
        seq: this.options.runManager.nextSeq(run.id),
        error: archivedError,
      })
      this.options.runManager.finish(run.id)
      this.options.logger?.warn('Residual chat run could not be resumed.', {
        runId: run.id,
        sessionId: run.sessionId,
        providerId: run.providerId,
        modelId: run.modelId,
        error,
      })
      return 'interrupted'
    }
  }

  private archiveInterruptedRun(
    run: ChatRun,
    assistantMessage: ChatMessage | undefined,
    reason: string
  ) {
    const interruptedAt = Date.now()
    const error = {
      code: 'aborted' as const,
      message: 'Run was interrupted by an application restart and was archived safely.',
      retryable: true,
    }
    this.options.runs.save({
      ...run,
      status: 'aborted',
      finishedAt: interruptedAt,
      abortReason: `startup_interrupted:${reason}`,
      error,
      requestSnapshot: run.requestSnapshot
        ? {
            ...run.requestSnapshot,
            transport: {
              ...run.requestSnapshot.transport,
              streamCompleted: false,
              recovery: {
                disposition: 'interrupted',
                reason,
                at: interruptedAt,
              },
            },
          }
        : undefined,
      updatedAt: interruptedAt,
    })
    if (assistantMessage) {
      this.options.messages.save({
        ...assistantMessage,
        status: 'aborted',
        error,
        updatedAt: interruptedAt,
      })
    }
    return error
  }
}

function residualRunUnsafeReason(
  run: ChatRun,
  session: ChatSession | undefined,
  userMessage: ChatMessage | undefined,
  assistantMessage: ChatMessage | undefined
): string | undefined {
  if (!session || session.status === 'deleted') {
    return 'session_unavailable'
  }
  if (session.kind === 'vision' || session.kind === 'cron') {
    return 'transient_session_not_recoverable'
  }
  if (!userMessage || !assistantMessage) {
    return 'message_unavailable'
  }
  if (
    userMessage.sessionId !== run.sessionId ||
    assistantMessage.sessionId !== run.sessionId ||
    userMessage.role !== 'user' ||
    assistantMessage.role !== 'assistant'
  ) {
    return 'message_contract_mismatch'
  }
  if (assistantMessage.parts.length > 0) {
    return 'partial_output_or_tool_activity'
  }
  if (assistantMessage.status !== 'streaming' && assistantMessage.status !== 'pending') {
    return 'assistant_message_not_streaming'
  }
  return undefined
}
