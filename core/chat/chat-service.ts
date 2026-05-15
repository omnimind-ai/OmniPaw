import type { WebContents } from 'electron'

import type { ProviderManager } from '@core/provider/manager'
import { AgentRunner } from '@core/agent/agent-runner'
import { ToolRegistry } from '@core/agent/tool-registry'
import type {
  AttachmentRepo,
  ChatMessageRepo,
  ChatRunRepo,
  ChatSessionRepo,
} from '@core/db/repos'
import type { ChatSession } from '@shared/types/chat'
import type {
  AbortRunRequest,
  AbortRunResponse,
  ChatMessage,
  ChatMessagePart,
  ChatRun,
  DeleteSessionRequest,
  EditMessageRequest,
  EditMessageResponse,
  ListMessagesRequest,
  RegenerateMessageRequest,
  SendMessageRequest,
  SendMessageResponse,
  UpdateSessionRequest,
} from '@shared/types/chat'
import type { ProviderConfig, ProviderModel } from '@shared/types/provider'
import { AttachmentService } from './attachment-service'
import { ContextBuilder } from './context-manager'
import { RunManager } from './run-manager'

export interface ChatServiceOptions {
  sessions: ChatSessionRepo
  messages: ChatMessageRepo
  runs: ChatRunRepo
  attachments: AttachmentService
  attachmentRepo: AttachmentRepo
  providers: ProviderManager
  contextBuilder: ContextBuilder
  runManager: RunManager
  agentRunner?: AgentRunner
}

export class ChatService {
  private readonly agentRunner: AgentRunner

  constructor(private readonly options: ChatServiceOptions) {
    this.agentRunner = options.agentRunner ?? new AgentRunner({
      messages: options.messages,
      runs: options.runs,
      providers: options.providers,
      contextBuilder: options.contextBuilder,
      runManager: options.runManager,
      toolRegistry: new ToolRegistry({
        messages: options.messages,
        attachments: options.attachments,
      }),
      onComplete: (sessionId) => this.updateSessionSummary(sessionId),
    })
  }

  listSessions(): ChatSession[] {
    return this.options.sessions.list()
  }

  createSession(): ChatSession {
    const now = Date.now()
    const session: ChatSession = {
      id: crypto.randomUUID(),
      title: '新会话',
      status: 'active',
      defaultProviderId: 'openai-compatible',
      defaultModelId: 'gpt-4o-mini',
      messageCount: 0,
      contextPolicy: {
        mode: 'recent-turns',
        maxMessages: 40,
        includeAttachments: 'current-only',
      },
      createdAt: now,
      updatedAt: now,
    }
    this.options.sessions.save(session)
    return session
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
      pinned: request.pinned ?? session.pinned,
      contextPolicy: request.contextPolicy ?? session.contextPolicy,
      updatedAt: Date.now(),
    }
    this.options.sessions.save(updated)
    return updated
  }

  deleteSession(request: DeleteSessionRequest | string): { deleted: boolean } {
    const sessionId = typeof request === 'string' ? request : request.sessionId
    return { deleted: this.options.sessions.markDeleted(sessionId) }
  }

  listMessages(request: ListMessagesRequest | string): ChatMessage[] {
    const sessionId = typeof request === 'string' ? request : request.sessionId
    const limit = typeof request === 'string' ? undefined : request.limit
    return this.options.messages.listBySession(sessionId, { limit })
  }

  async sendMessage(request: SendMessageRequest, webContents: WebContents): Promise<SendMessageResponse> {
    const existing = this.options.runManager.getExistingIdempotentRun(request.idempotencyKey)
    if (existing) {
      return responseFromRun(existing)
    }

    const session = this.requireSession(request.sessionId)
    const { provider, model } = await this.resolveProviderAndModel(session, request.providerId, request.modelId)
    const parts = normalizeSendParts(request)
    const attachmentLinks = this.options.attachments.validateMessageParts(parts)
    const now = Date.now()
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      sessionId: session.id,
      role: 'user',
      status: 'complete',
      parts,
      providerId: provider.id,
      modelId: model.id,
      createdAt: now,
      updatedAt: now,
    }
    const assistantMessage: ChatMessage = {
      id: crypto.randomUUID(),
      sessionId: session.id,
      role: 'assistant',
      status: 'streaming',
      parts: [],
      providerId: provider.id,
      modelId: model.id,
      createdAt: now + 1,
      updatedAt: now + 1,
    }

    this.options.messages.save(userMessage)
    this.options.messages.save(assistantMessage)
    this.options.messages.replaceAttachmentLinks(
      userMessage.id,
      attachmentLinks.map((link) => ({ ...link, messageId: userMessage.id })),
    )

    const run: ChatRun = {
      id: crypto.randomUUID(),
      sessionId: session.id,
      userMessageId: userMessage.id,
      assistantMessageId: assistantMessage.id,
      providerId: provider.id,
      modelId: model.id,
      status: 'running',
      idempotencyKey: request.idempotencyKey,
      startedAt: Date.now(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }

    this.options.runs.save(run)
    const signal = this.options.runManager.start(run.id, webContents)
    this.options.runManager.emit({
      type: 'started',
      runId: run.id,
      sessionId: session.id,
      assistantMessageId: assistantMessage.id,
      seq: this.options.runManager.nextSeq(run.id),
    })

    void this.agentRunner.run({
      run,
      session,
      provider,
      model,
      signal,
      mode: request.mode,
      toolProfile: request.toolProfile,
      maxSteps: request.maxSteps,
    })

    return responseFromRun(run)
  }

  async abortRun(request: AbortRunRequest | string): Promise<AbortRunResponse> {
    const runId = typeof request === 'string' ? request : request.runId
    const reason = typeof request === 'string' ? undefined : request.reason
    const aborted = this.options.runManager.abort(runId, reason)
    if (aborted) {
      const run = this.options.runs.get(runId)
      if (run) {
        const error = { code: 'aborted' as const, message: reason ?? 'Run aborted.', retryable: false }
        this.options.runs.updateStatus(runId, 'aborted', {
          finishedAt: Date.now(),
          abortReason: reason,
          error,
        })
        this.options.messages.updateStatus(run.assistantMessageId, 'aborted')
      }
    }
    return { runId, aborted }
  }

  editMessage(request: EditMessageRequest): EditMessageResponse {
    const message = this.options.messages.get(request.messageId)
    if (!message || message.sessionId !== request.sessionId || message.role !== 'user') {
      throw new Error('Editable user message not found.')
    }
    this.options.messages.updateParts(message.id, request.parts, { status: 'complete' })
    const updated = this.options.messages.get(message.id) ?? { ...message, parts: request.parts }
    const messages = this.options.messages.listBySession(request.sessionId)
    const messageIndex = messages.findIndex((item) => item.id === message.id)
    for (const later of messages.slice(messageIndex + 1)) {
      this.options.messages.updateStatus(later.id, 'superseded')
    }
    return {
      message: updated,
      needsRegenerate: true,
      truncatedAfterMessage: true,
    }
  }

  async regenerateMessage(
    request: RegenerateMessageRequest,
    webContents: WebContents,
  ): Promise<SendMessageResponse> {
    const target = this.options.messages.get(request.messageId)
    if (!target) {
      throw new Error('Message not found.')
    }
    const messages = this.options.messages.listBySession(request.sessionId)
    const targetIndex = messages.findIndex((message) => message.id === request.messageId)
    const user = [...messages.slice(0, targetIndex)].reverse().find((message) => message.role === 'user')
    if (!user) {
      throw new Error('No preceding user message found.')
    }
    this.options.messages.updateStatus(target.id, 'superseded')
    return this.sendMessage(
      {
        sessionId: request.sessionId,
        parts: user.parts,
        providerId: request.providerId,
        modelId: request.modelId,
        idempotencyKey: request.idempotencyKey,
      },
      webContents,
    )
  }

  private requireSession(sessionId: string): ChatSession {
    const session = this.options.sessions.get(sessionId)
    if (!session || session.status === 'deleted') {
      throw new Error(`Session not found: ${sessionId}`)
    }
    return session
  }

  private async resolveProviderAndModel(
    session: ChatSession,
    providerId?: string,
    modelId?: string,
  ): Promise<{ provider: ProviderConfig; model: ProviderModel }> {
    const provider =
      (providerId ? await this.options.providers.get(providerId) : undefined) ??
      (session.defaultProviderId ? await this.options.providers.get(session.defaultProviderId) : undefined) ??
      (await this.options.providers.list()).find((item) => item.enabled)
    if (!provider) {
      throw new Error('No provider is configured.')
    }
    const model =
      provider.models.find((item) => item.id === (modelId ?? session.defaultModelId ?? provider.defaultModelId)) ??
      provider.models.find((item) => item.enabled)
    if (!model || model.enabled === false) {
      throw new Error(`No enabled model is configured for provider ${provider.id}.`)
    }
    return { provider, model }
  }

  private updateSessionSummary(sessionId: string): void {
    const messages = this.options.messages.listBySession(sessionId)
    const last = [...messages].reverse().find((message) => message.status !== 'deleted')
    this.options.sessions.updateMessageSummary(sessionId, {
      messageCount: messages.length,
      lastMessagePreview: last ? previewMessage(last) : undefined,
      lastMessageAt: last?.createdAt,
    })
  }
}

function normalizeSendParts(request: SendMessageRequest): ChatMessagePart[] {
  if (request.parts?.length) {
    return request.parts
  }
  if (request.content) {
    return [{ type: 'plain', text: request.content }]
  }
  throw new Error('Message content is empty.')
}

function responseFromRun(run: ChatRun): SendMessageResponse {
  return {
    runId: run.id,
    userMessageId: run.userMessageId,
    assistantMessageId: run.assistantMessageId,
    messageId: run.assistantMessageId,
    accepted: true,
  }
}

function previewMessage(message: ChatMessage): string {
  const text = message.parts
    .map((part) => {
      const record = part as Record<string, unknown>
      return typeof record.text === 'string' ? record.text : ''
    })
    .join('')
    .trim()
  return text.slice(0, 160)
}
