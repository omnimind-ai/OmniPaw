import type { AttachmentService } from '@core/chat/attachment-service'
import type {
  ChatMessage,
  ChatMessagePart,
  ChatRun,
  ChatSession,
  SendMessageRequest,
} from '@shared/types/chat'
import type { ProviderConfig, ProviderModel } from '@shared/types/provider'

export interface PreparedSendRecords {
  userMessage: ChatMessage
  assistantMessage: ChatMessage
  run: ChatRun
  attachmentLinks: ReturnType<AttachmentService['validateMessageParts']>
}

export function prepareSendRecords(input: {
  request: SendMessageRequest
  session: ChatSession
  provider: ProviderConfig
  model: ProviderModel
  attachments: AttachmentService
  fallbackReason?: string
}): PreparedSendRecords {
  const parts = normalizeSendParts(input.request)
  const attachmentLinks = input.attachments.validateMessageParts(parts)
  const now = Date.now()
  const runId = crypto.randomUUID()
  const userMessage: ChatMessage = {
    id: crypto.randomUUID(),
    sessionId: input.session.id,
    role: 'user',
    status: 'complete',
    parts,
    providerId: input.provider.id,
    modelId: input.model.id,
    createdAt: now,
    updatedAt: now,
  }
  const assistantMessage: ChatMessage = {
    id: crypto.randomUUID(),
    sessionId: input.session.id,
    role: 'assistant',
    status: 'streaming',
    parts: [],
    runId,
    providerId: input.provider.id,
    modelId: input.model.id,
    createdAt: now + 1,
    updatedAt: now + 1,
  }

  const run: ChatRun = {
    id: runId,
    sessionId: input.session.id,
    userMessageId: userMessage.id,
    assistantMessageId: assistantMessage.id,
    providerId: input.provider.id,
    modelId: input.model.id,
    status: 'running',
    idempotencyKey: input.request.idempotencyKey,
    startedAt: Date.now(),
    requestSnapshot: input.fallbackReason
      ? {
          api: input.provider.api ?? input.provider.type ?? input.provider.id,
          model: input.model.remoteId || input.model.id,
          fallbackReason: input.fallbackReason,
          messageCount: 0,
          attachmentCount: attachmentLinks.length,
        }
      : undefined,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }

  return {
    userMessage,
    assistantMessage,
    run,
    attachmentLinks,
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
