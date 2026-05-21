import { IPC_CHANNELS } from '@shared/constants'
import type {
  AbortRunRequest,
  AttachmentPreviewRequest,
  ChatMessagePart,
  DeleteSessionRequest,
  EditMessageRequest,
  ListMessagesRequest,
  RegenerateMessageRequest,
  SendMessageRequest,
  ToolApprovalRequest,
  UploadAttachmentRequest,
} from '@shared/types/chat'
import type { CoreRuntime } from '../core-runtime'
import { registerLoggedIpcHandler } from './common'
import type { IpcHandlerOptions } from './types'

export function registerChatIpcHandlers(options: IpcHandlerOptions): void {
  const runtime = options.runtime

  registerLoggedIpcHandler(options, IPC_CHANNELS.chat.listSessions, () =>
    runtime.chatService.listSessions()
  )
  registerLoggedIpcHandler(options, IPC_CHANNELS.chat.createSession, () =>
    runtime.chatService.createSession()
  )
  registerLoggedIpcHandler(options, IPC_CHANNELS.chat.getSession, (_event, sessionId: string) =>
    runtime.chatService.getSession(sessionId)
  )
  registerLoggedIpcHandler(options, IPC_CHANNELS.chat.updateSession, (_event, request) =>
    runtime.chatService.updateSession(normalizeUpdateSessionRequest(request))
  )
  registerLoggedIpcHandler(
    options,
    IPC_CHANNELS.chat.deleteSession,
    (_event, request: DeleteSessionRequest | string) => runtime.chatService.deleteSession(request)
  )
  registerLoggedIpcHandler(
    options,
    IPC_CHANNELS.chat.listMessages,
    (_event, request: ListMessagesRequest | string) => runtime.chatService.listMessages(request)
  )
  registerLoggedIpcHandler(
    options,
    IPC_CHANNELS.chat.sendMessage,
    (event, request: SendMessageRequest) => runtime.chatService.sendMessage(request, event.sender)
  )
  registerLoggedIpcHandler(
    options,
    IPC_CHANNELS.chat.abortRun,
    (_event, request: AbortRunRequest | string) => runtime.chatService.abortRun(request)
  )
  registerLoggedIpcHandler(
    options,
    IPC_CHANNELS.chat.approveToolCall,
    (_event, request: ToolApprovalRequest) => runtime.chatService.approveToolCall(request)
  )
  registerLoggedIpcHandler(
    options,
    IPC_CHANNELS.chat.editMessage,
    (_event, request: EditMessageRequest | [string, string, ChatMessagePart[]]) =>
      runtime.chatService.editMessage(normalizeEditMessageRequest(request))
  )
  registerLoggedIpcHandler(
    options,
    IPC_CHANNELS.chat.regenerateMessage,
    (event, request: RegenerateMessageRequest | [string, string, string?, string?]) =>
      runtime.chatService.regenerateMessage(normalizeRegenerateRequest(request), event.sender)
  )
  registerLoggedIpcHandler(
    options,
    IPC_CHANNELS.chat.uploadAttachment,
    (_event, request: UploadAttachmentRequest) =>
      runtime.attachmentService.upload(normalizeUploadRequest(request))
  )
  registerLoggedIpcHandler(
    options,
    IPC_CHANNELS.chat.getAttachmentPreview,
    (_event, request: AttachmentPreviewRequest | string) => {
      const attachmentId = typeof request === 'string' ? request : request.attachmentId
      return runtime.attachmentService.getPreview(attachmentId)
    }
  )
}

function normalizeUpdateSessionRequest(request: unknown) {
  if (typeof request === 'string') {
    return { sessionId: request }
  }
  return request as Parameters<CoreRuntime['chatService']['updateSession']>[0]
}

function normalizeEditMessageRequest(request: unknown) {
  if (Array.isArray(request)) {
    return {
      sessionId: String(request[0]),
      messageId: String(request[1]),
      parts: request[2] ?? [],
    }
  }
  return request as Parameters<CoreRuntime['chatService']['editMessage']>[0]
}

function normalizeRegenerateRequest(request: unknown) {
  if (Array.isArray(request)) {
    return {
      sessionId: String(request[0]),
      messageId: String(request[1]),
      providerId: typeof request[2] === 'string' ? request[2] : undefined,
      modelId: typeof request[3] === 'string' ? request[3] : undefined,
    }
  }
  return request as Parameters<CoreRuntime['chatService']['regenerateMessage']>[0]
}

function normalizeUploadRequest(request: unknown) {
  const payload = request as { name: string; mimeType?: string; type?: string; bytes: ArrayBuffer }
  return {
    name: payload.name,
    mimeType: payload.mimeType ?? payload.type,
    bytes: payload.bytes,
  }
}
