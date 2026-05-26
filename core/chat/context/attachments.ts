import { isComplexDocumentAttachment } from '@shared/attachment-documents'
import type { ChatMessagePart, WorkspaceStagedAttachmentMetadata } from '@shared/types/chat'
import type { ProviderMessage, ProviderModel } from '@shared/types/provider'
import type { AttachmentService } from '../attachment-service'
import { attachmentIdFromPart } from '../attachment-service'

export async function partsToProviderContent(
  attachments: AttachmentService,
  parts: ChatMessagePart[],
  model: ProviderModel,
  includeAttachmentPayloads: boolean,
  neverIncludeAttachments: boolean,
  options: {
    workspaceDocumentAttachments?: WorkspaceStagedAttachmentMetadata[]
  } = {}
): Promise<ProviderMessage['content']> {
  const content: Array<
    { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }
  > = []

  for (const part of parts) {
    const record = part as Record<string, unknown>
    if (part.type === 'plain' && typeof record.text === 'string') {
      content.push({ type: 'text', text: record.text })
      continue
    }
    if (part.type === 'think') {
      continue
    }

    const attachmentId = attachmentIdFromPart(part)
    if (!attachmentId) {
      continue
    }
    const attachment = attachments.get(attachmentId)
    if (!attachment) {
      content.push({ type: 'text', text: `[Missing attachment: ${attachmentId}]` })
      continue
    }

    const stagedDocument = options.workspaceDocumentAttachments?.find(
      (item) => item.attachmentId === attachmentId
    )
    if (includeAttachmentPayloads && !neverIncludeAttachments && stagedDocument) {
      content.push({
        type: 'text',
        text: formatWorkspaceDocumentAttachmentBlock(stagedDocument),
      })
      continue
    }

    if (
      includeAttachmentPayloads &&
      !neverIncludeAttachments &&
      attachment.kind === 'image' &&
      (model.input ?? ['text']).includes('image')
    ) {
      content.push({
        type: 'image_url',
        image_url: {
          url: await attachments.materializeImageDataUrl(attachment),
        },
      })
      continue
    }

    if (
      includeAttachmentPayloads &&
      !neverIncludeAttachments &&
      attachment.extractedTextStatus === 'complete' &&
      attachment.extractedText
    ) {
      content.push({
        type: 'text',
        text: `<attachment name="${escapeAttribute(attachment.originalName)}" mime="${escapeAttribute(attachment.mimeType)}">\n${attachment.extractedText}\n</attachment>`,
      })
      continue
    }

    if (
      isComplexDocumentAttachment({
        originalName: attachment.originalName,
        mimeType: attachment.mimeType,
      })
    ) {
      content.push({
        type: 'text',
        text: `[Workspace Document Attachment: name=${attachment.originalName}, mime=${attachment.mimeType}, size=${attachment.sizeBytes}; content has not been staged into the managed workspace for this context, so it has not been read.]`,
      })
      continue
    }

    content.push({
      type: 'text',
      text: `[File Attachment: name=${attachment.originalName}, mime=${attachment.mimeType}, size=${attachment.sizeBytes}]`,
    })
  }

  if (content.length === 1 && content[0]?.type === 'text') {
    return content[0].text
  }

  return content
}

export function countAttachmentParts(parts: ChatMessagePart[]): number {
  return parts.reduce((count, part) => count + (attachmentIdFromPart(part) ? 1 : 0), 0)
}

function escapeAttribute(value: string): string {
  return value.replace(
    /["&<>]/g,
    (char) =>
      ({
        '"': '&quot;',
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
      })[char] ?? char
  )
}

function formatWorkspaceDocumentAttachmentBlock(
  attachment: WorkspaceStagedAttachmentMetadata
): string {
  return [
    'Uploaded document attachments have been copied into the managed workspace.',
    'Do not claim that you have read a document until you inspect it with available tools.',
    'Check available tools and skills first; use skill_read before following a relevant enabled skill.',
    'workspace_file.read may only report binary metadata for Office documents; conversion may require terminal_exec, but do not assume any specific converter or library exists.',
    'If no suitable tool, skill, dependency, approval, or command result is available, say that the current environment cannot read the file.',
    `<workspace_attachment attachment_id="${escapeAttribute(attachment.attachmentId)}" name="${escapeAttribute(attachment.originalName)}" mime="${escapeAttribute(attachment.mimeType)}" size="${attachment.sizeBytes}" path="${escapeAttribute(attachment.workspaceRelativePath)}" />`,
  ].join('\n')
}
