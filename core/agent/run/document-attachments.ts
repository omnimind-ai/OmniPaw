import { type AttachmentService, attachmentIdFromPart } from '@core/chat/attachment-service'
import {
  stageWorkspaceDocumentAttachments,
  WorkspaceDocumentAttachmentStagingError,
  withWorkspaceDocumentAttachmentsMetadata,
} from '@core/chat/workspace-document-attachments'
import type { ChatMessageRepo } from '@core/db/repos'
import { isComplexDocumentAttachment } from '@shared/attachment-documents'
import type {
  ChatMessage,
  ChatRunMode,
  ComplexDocumentAttachmentRejection,
  ComplexDocumentAttachmentRunDiagnostic,
  InternalAttachmentRecord,
  ToolProfile,
  WorkspaceStagedAttachmentMetadata,
} from '@shared/types/chat'
import type { DesktopToolSettings } from '@shared/types/settings'
import type { AgentRunInput, AgentRunnerOptions } from '../agent-runner'
import type { AgentTool } from '../tools/types'

const REQUIRED_DOCUMENT_TOOLS = ['workspace_file', 'terminal_exec']

export interface PrepareRunDocumentAttachmentInput {
  options: Pick<
    AgentRunnerOptions,
    'attachments' | 'messages' | 'workspaceService' | 'toolSettings' | 'disabledToolNames'
  >
  input: AgentRunInput
  sourceMessages: ChatMessage[]
  requestedMode: ChatRunMode
  mode: ChatRunMode
  supportsTools: boolean
  toolProfile: ToolProfile
  agentTools: AgentTool[]
}

export interface PrepareRunDocumentAttachmentResult {
  sourceMessages: ChatMessage[]
  diagnostic?: ComplexDocumentAttachmentRunDiagnostic
  rejectionMessage?: string
}

interface ComplexDocumentCandidate {
  attachmentId: string
  attachment?: InternalAttachmentRecord
}

export async function prepareRunDocumentAttachments(
  input: PrepareRunDocumentAttachmentInput
): Promise<PrepareRunDocumentAttachmentResult> {
  const attachments = input.options.attachments
  const currentMessage = input.sourceMessages.find(
    (message) => message.id === input.input.run.userMessageId
  )
  if (!attachments || !currentMessage) {
    return { sourceMessages: input.sourceMessages }
  }

  const candidates = collectComplexDocumentCandidates(currentMessage, attachments)
  if (!candidates.length) {
    return { sourceMessages: input.sourceMessages }
  }

  const candidateAttachments = candidates
    .map((candidate) => candidate.attachment)
    .filter((attachment): attachment is InternalAttachmentRecord => Boolean(attachment))
  const attachmentLimits = attachments.getLimits()
  const toolSettings = input.options.toolSettings?.()
  const workspaceMaxFileBytes = toolSettings?.workspace.maxFileBytes ?? Number.MAX_SAFE_INTEGER
  const rejections = [
    ...candidates
      .filter((candidate) => !candidate.attachment)
      .map((candidate) =>
        rejection('attachment_not_found', {
          attachmentId: candidate.attachmentId,
          message: '文档附件记录不存在，无法提供给 Agent 读取。',
        })
      ),
    ...evaluateComplexDocumentAttachmentAdmission({
      documents: candidateAttachments,
      requestedMode: input.requestedMode,
      mode: input.mode,
      supportsTools: input.supportsTools,
      toolProfile: input.toolProfile,
      agentTools: input.agentTools,
      workspaceServiceAvailable: Boolean(input.options.workspaceService),
      toolSettings,
      disabledToolNames: input.options.disabledToolNames?.(),
      attachmentMaxFileBytes: attachmentLimits.maxFileBytes,
      workspaceMaxFileBytes,
    }),
  ]
  const baseDiagnostic = buildDocumentDiagnostic(input, candidates.length, [], rejections)

  if (rejections.length) {
    return {
      sourceMessages: input.sourceMessages,
      diagnostic: baseDiagnostic,
      rejectionMessage: formatDocumentAttachmentRejectionMessage(rejections),
    }
  }

  const workspaceService = input.options.workspaceService
  if (!workspaceService) {
    const workspaceRejection = rejection('workspace_disabled', {
      message: '当前 workspace 能力关闭，无法安全提供文档路径给 Agent。',
    })
    return {
      sourceMessages: input.sourceMessages,
      diagnostic: buildDocumentDiagnostic(input, candidates.length, [], [workspaceRejection]),
      rejectionMessage: formatDocumentAttachmentRejectionMessage([workspaceRejection]),
    }
  }

  try {
    const staged = await stageWorkspaceDocumentAttachments({
      sessionId: input.input.session.id,
      messageId: currentMessage.id,
      parts: currentMessage.parts,
      attachmentIds: candidateAttachments.map((attachment) => attachment.id),
      attachments,
      workspace: workspaceService,
      attachmentMaxFileBytes: attachmentLimits.maxFileBytes,
      workspaceMaxFileBytes,
    })
    const updatedMessage: ChatMessage = {
      ...currentMessage,
      metadata: withWorkspaceDocumentAttachmentsMetadata(currentMessage.metadata, staged),
      updatedAt: Date.now(),
    }
    saveMessageWithMetadata(input.options.messages, updatedMessage)
    return {
      sourceMessages: input.sourceMessages.map((message) =>
        message.id === updatedMessage.id ? updatedMessage : message
      ),
      diagnostic: buildDocumentDiagnostic(input, candidates.length, staged, []),
    }
  } catch (error) {
    const stagingRejection =
      error instanceof WorkspaceDocumentAttachmentStagingError
        ? error.rejection
        : rejection('staging_failed', {
            message:
              error instanceof Error
                ? error.message
                : '文档附件复制到 workspace 时失败，无法提供给 Agent 读取。',
          })
    const diagnostic = buildDocumentDiagnostic(input, candidates.length, [], [stagingRejection])
    return {
      sourceMessages: input.sourceMessages,
      diagnostic,
      rejectionMessage: formatDocumentAttachmentRejectionMessage([stagingRejection]),
    }
  }
}

export function evaluateComplexDocumentAttachmentAdmission(input: {
  documents: InternalAttachmentRecord[]
  requestedMode: ChatRunMode
  mode: ChatRunMode
  supportsTools: boolean
  toolProfile: ToolProfile
  agentTools: AgentTool[]
  workspaceServiceAvailable: boolean
  toolSettings?: DesktopToolSettings
  disabledToolNames?: Iterable<string>
  attachmentMaxFileBytes: number
  workspaceMaxFileBytes: number
}): ComplexDocumentAttachmentRejection[] {
  const rejections: ComplexDocumentAttachmentRejection[] = []
  const disabledToolNames = new Set(input.disabledToolNames ?? [])
  const availableToolNames = new Set(input.agentTools.map((tool) => tool.name))

  if (input.requestedMode === 'fast_chat' || input.mode !== 'assistant') {
    rejections.push(
      rejection('fast_chat_mode', {
        message: '当前快速聊天模式无法通过本地 workspace 读取 Office 文档，请切换到助手模式。',
      })
    )
  }
  if (!input.supportsTools) {
    rejections.push(
      rejection('model_does_not_support_tools', {
        message: '当前模型不支持工具调用，无法读取此类文档。',
      })
    )
  }
  if (input.toolProfile === 'minimal') {
    rejections.push(
      rejection('minimal_profile', {
        message: '当前最小工具模式无法读取此类文档，请切换到助手或高级工具模式。',
      })
    )
  }
  if (!input.workspaceServiceAvailable) {
    rejections.push(
      rejection('workspace_disabled', {
        message: '当前 workspace 能力关闭，无法安全提供文档路径给 Agent。',
      })
    )
  }
  if (disabledToolNames.has('workspace_file')) {
    rejections.push(
      rejection('workspace_tool_disabled', {
        message: 'workspace_file 工具已被禁用，无法提供文档路径给 Agent。',
      })
    )
  }
  if (disabledToolNames.has('terminal_exec')) {
    rejections.push(
      rejection('terminal_tool_disabled', {
        message: 'terminal_exec 工具已被禁用，无法处理此类文档。',
      })
    )
  }
  if (
    input.mode === 'assistant' &&
    input.toolProfile !== 'minimal' &&
    !availableToolNames.has('workspace_file')
  ) {
    rejections.push(
      rejection('workspace_tool_unavailable', {
        message: '当前 run 未解析到 workspace_file 工具，无法提供文档路径给 Agent。',
      })
    )
  }
  if (
    input.mode === 'assistant' &&
    input.toolProfile !== 'minimal' &&
    !availableToolNames.has('terminal_exec')
  ) {
    rejections.push(
      rejection('terminal_tool_unavailable', {
        message: '当前 run 未解析到 terminal_exec 工具，无法处理此类文档。',
      })
    )
  }

  for (const document of input.documents) {
    if (document.sizeBytes > input.attachmentMaxFileBytes) {
      rejections.push(
        rejection('attachment_size_limit', {
          attachment: document,
          message: `文档附件超过附件大小限制 ${input.attachmentMaxFileBytes} bytes。`,
        })
      )
    }
    if (document.sizeBytes > input.workspaceMaxFileBytes) {
      rejections.push(
        rejection('workspace_size_limit', {
          attachment: document,
          message: `文档附件超过 workspace 文件大小限制 ${input.workspaceMaxFileBytes} bytes。`,
        })
      )
    }
  }

  return dedupeRejections(rejections)
}

function collectComplexDocumentCandidates(
  message: ChatMessage,
  attachments: AttachmentService
): ComplexDocumentCandidate[] {
  const candidates: ComplexDocumentCandidate[] = []
  const seen = new Set<string>()
  for (const part of message.parts) {
    const attachmentId = attachmentIdFromPart(part)
    if (!attachmentId || seen.has(attachmentId)) {
      continue
    }
    const attachment = attachments.get(attachmentId)
    const partRecord = part as Record<string, unknown>
    if (
      attachment
        ? isComplexDocumentAttachment({
            originalName: attachment.originalName,
            mimeType: attachment.mimeType,
          })
        : isComplexDocumentAttachment({
            filename: typeof partRecord.filename === 'string' ? partRecord.filename : undefined,
          })
    ) {
      candidates.push({ attachmentId, attachment })
      seen.add(attachmentId)
    }
  }
  return candidates
}

function buildDocumentDiagnostic(
  input: PrepareRunDocumentAttachmentInput,
  complexCount: number,
  staged: WorkspaceStagedAttachmentMetadata[],
  rejections: ComplexDocumentAttachmentRejection[]
): ComplexDocumentAttachmentRunDiagnostic {
  const providerFacingToolNames = input.agentTools.map((tool) => tool.providerName ?? tool.name)
  return {
    complexCount,
    stagedCount: staged.length,
    rejectedCount: rejections.length,
    stagingStatus: rejections.length ? 'rejected' : staged.length ? 'staged' : 'none',
    requestedMode: input.requestedMode,
    mode: input.mode,
    toolProfile: input.toolProfile,
    supportsTools: input.supportsTools,
    requiredTools: REQUIRED_DOCUMENT_TOOLS,
    availableTools: input.agentTools.map((tool) => tool.name),
    providerFacingToolNames,
    staged: staged.length ? staged : undefined,
    rejections: rejections.length ? rejections : undefined,
  }
}

function saveMessageWithMetadata(messages: ChatMessageRepo, message: ChatMessage): void {
  messages.save(message)
}

function formatDocumentAttachmentRejectionMessage(
  rejections: ComplexDocumentAttachmentRejection[]
): string {
  const first = rejections[0]
  if (!first) {
    return '无法将 Office 文档附件作为可读取文档发送。'
  }
  const name = first.originalName ? `「${first.originalName}」` : 'Office 文档附件'
  return `无法将 ${name} 作为可读取文档发送：${first.message}`
}

function dedupeRejections(
  rejections: ComplexDocumentAttachmentRejection[]
): ComplexDocumentAttachmentRejection[] {
  const seen = new Set<string>()
  return rejections.filter((item) => {
    const key = `${item.attachmentId ?? ''}:${item.reason}:${item.message}`
    if (seen.has(key)) {
      return false
    }
    seen.add(key)
    return true
  })
}

function rejection(
  reason: ComplexDocumentAttachmentRejection['reason'],
  input: {
    attachment?: InternalAttachmentRecord
    attachmentId?: string
    message: string
  }
): ComplexDocumentAttachmentRejection {
  return {
    attachmentId: input.attachment?.id ?? input.attachmentId,
    originalName: input.attachment?.originalName,
    mimeType: input.attachment?.mimeType,
    sizeBytes: input.attachment?.sizeBytes,
    reason,
    message: input.message,
  }
}
