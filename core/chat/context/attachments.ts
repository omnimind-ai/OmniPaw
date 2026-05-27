import { ATTACHMENT_PROMPTS } from '@core/prompts'
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
      content.push({ type: 'text', text: ATTACHMENT_PROMPTS.missingAttachment(attachmentId) })
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
        text: ATTACHMENT_PROMPTS.extractedText({
          name: attachment.originalName,
          mimeType: attachment.mimeType,
          text: attachment.extractedText,
        }),
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
        text: ATTACHMENT_PROMPTS.unstagedWorkspaceDocument({
          name: attachment.originalName,
          mimeType: attachment.mimeType,
          sizeBytes: attachment.sizeBytes,
        }),
      })
      continue
    }

    content.push({
      type: 'text',
      text: ATTACHMENT_PROMPTS.file({
        name: attachment.originalName,
        mimeType: attachment.mimeType,
        sizeBytes: attachment.sizeBytes,
      }),
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

function formatWorkspaceDocumentAttachmentBlock(
  attachment: WorkspaceStagedAttachmentMetadata
): string {
  return ATTACHMENT_PROMPTS.workspaceDocument({
    attachmentId: attachment.attachmentId,
    name: attachment.originalName,
    mimeType: attachment.mimeType,
    sizeBytes: attachment.sizeBytes,
    path: attachment.workspaceRelativePath,
  })
}
