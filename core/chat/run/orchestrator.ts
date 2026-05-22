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
import type { WebContents } from 'electron'
import type { RunManager } from '../run-manager'
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

export class ChatRunOrchestrator {
  constructor(private readonly options: ChatRunOrchestratorOptions) {}

  async sendMessage(
    request: SendMessageRequest,
    webContents: WebContents
  ): Promise<SendMessageResponse> {
    const existing = this.options.runManager.getExistingIdempotentRun(request.idempotencyKey)
    if (existing) {
      return responseFromRun(existing)
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
    const signal = this.options.runManager.start(run.id, webContents)
    const toolProfile = request.toolProfile ?? this.options.agentToolProfile?.()
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
      mode: request.mode,
      toolProfile,
      maxSteps: request.maxSteps,
    })
    void this.options.titleGenerator.generateFromMessage(session.id, userMessage.id, webContents)

    this.options.logger?.info('Chat run accepted.', {
      runId: run.id,
      sessionId: session.id,
      providerId: provider.id,
      modelId: model.id,
      fallbackReason,
      attachmentCount: attachmentLinks.length,
      mode: request.mode,
      toolProfile,
    })
    return responseFromRun(run)
  }

  async regenerateMessage(
    request: RegenerateMessageRequest,
    webContents: WebContents
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
      webContents
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
