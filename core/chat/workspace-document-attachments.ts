import { constants } from 'node:fs'
import { copyFile, lstat, mkdir, realpath } from 'node:fs/promises'
import { basename, extname, join, relative, resolve, sep } from 'node:path'

import type { AgentWorkspaceService } from '@core/agent/workspace'
import type {
  ChatMessagePart,
  ComplexDocumentAttachmentRejection,
  ComplexDocumentAttachmentRejectionReason,
  InternalAttachmentRecord,
  WorkspaceStagedAttachmentMetadata,
} from '@shared/types/chat'
import type { AttachmentService } from './attachment-service'
import { attachmentIdFromPart } from './attachment-service'

export const WORKSPACE_DOCUMENT_ATTACHMENTS_METADATA_KEY = 'workspaceDocumentAttachments'

export interface StageWorkspaceDocumentAttachmentsInput {
  sessionId: string
  messageId: string
  parts: ChatMessagePart[]
  attachmentIds: string[]
  attachments: AttachmentService
  workspace: AgentWorkspaceService
  attachmentMaxFileBytes: number
  workspaceMaxFileBytes: number
}

interface WorkspaceStagingDirectory {
  rootRealPath: string
  messageDirRealPath: string
  messageRelativePath: string
}

export class WorkspaceDocumentAttachmentStagingError extends Error {
  readonly rejection: ComplexDocumentAttachmentRejection

  constructor(rejection: ComplexDocumentAttachmentRejection) {
    super(rejection.message)
    this.name = 'WorkspaceDocumentAttachmentStagingError'
    this.rejection = rejection
  }
}

export async function stageWorkspaceDocumentAttachments(
  input: StageWorkspaceDocumentAttachmentsInput
): Promise<WorkspaceStagedAttachmentMetadata[]> {
  const currentMessageAttachmentIds = new Set(
    input.parts.map(attachmentIdFromPart).filter((id): id is string => Boolean(id))
  )
  const uniqueAttachmentIds = [...new Set(input.attachmentIds)]
  const directory = await ensureStagingDirectory(input.workspace, input.sessionId, input.messageId)
  const staged: WorkspaceStagedAttachmentMetadata[] = []

  for (const attachmentId of uniqueAttachmentIds) {
    if (!currentMessageAttachmentIds.has(attachmentId)) {
      throw new WorkspaceDocumentAttachmentStagingError(
        rejection('attachment_not_authorized', {
          attachmentId,
          message: 'Document attachment is not linked to the current message.',
        })
      )
    }

    const attachment = input.attachments.get(attachmentId)
    if (!attachment) {
      throw new WorkspaceDocumentAttachmentStagingError(
        rejection('attachment_not_found', {
          attachmentId,
          message: 'Document attachment was not found.',
        })
      )
    }

    assertAttachmentSize(attachment, input.attachmentMaxFileBytes, input.workspaceMaxFileBytes)
    const sourceStats = await lstat(attachment.storagePath)
    if (!sourceStats.isFile() || sourceStats.isSymbolicLink()) {
      throw new WorkspaceDocumentAttachmentStagingError(
        rejection('staging_failed', {
          attachment,
          message: 'Document attachment storage is not a regular file.',
        })
      )
    }

    const workspaceRelativePath = await copyAttachmentWithoutOverwrite(attachment, directory)
    staged.push({
      attachmentId: attachment.id,
      originalName: attachment.originalName,
      mimeType: attachment.mimeType,
      sizeBytes: attachment.sizeBytes,
      workspaceRelativePath,
    })
  }

  return staged
}

export function workspaceDocumentAttachmentsFromMetadata(
  metadata: Record<string, unknown> | undefined
): WorkspaceStagedAttachmentMetadata[] {
  const value = metadata?.[WORKSPACE_DOCUMENT_ATTACHMENTS_METADATA_KEY]
  if (!Array.isArray(value)) {
    return []
  }
  return value.filter(isWorkspaceStagedAttachmentMetadata)
}

export function withWorkspaceDocumentAttachmentsMetadata(
  metadata: Record<string, unknown> | undefined,
  staged: WorkspaceStagedAttachmentMetadata[]
): Record<string, unknown> | undefined {
  if (!staged.length) {
    return metadata
  }
  return {
    ...(metadata ?? {}),
    [WORKSPACE_DOCUMENT_ATTACHMENTS_METADATA_KEY]: staged,
  }
}

function assertAttachmentSize(
  attachment: InternalAttachmentRecord,
  attachmentMaxFileBytes: number,
  workspaceMaxFileBytes: number
): void {
  if (attachment.sizeBytes > attachmentMaxFileBytes) {
    throw new WorkspaceDocumentAttachmentStagingError(
      rejection('attachment_size_limit', {
        attachment,
        message: `Document attachment exceeds the attachment size limit of ${attachmentMaxFileBytes} bytes.`,
      })
    )
  }
  if (attachment.sizeBytes > workspaceMaxFileBytes) {
    throw new WorkspaceDocumentAttachmentStagingError(
      rejection('workspace_size_limit', {
        attachment,
        message: `Document attachment exceeds the workspace file size limit of ${workspaceMaxFileBytes} bytes.`,
      })
    )
  }
}

async function ensureStagingDirectory(
  workspace: AgentWorkspaceService,
  sessionId: string,
  messageId: string
): Promise<WorkspaceStagingDirectory> {
  const paths = await workspace.getWorkspacePaths(sessionId)
  const rootRealPath = await realpath(paths.files)
  const safeMessageId = sanitizePathSegment(messageId)
  const attachmentsDir = join(paths.files, 'attachments')
  const messageDir = join(attachmentsDir, safeMessageId)

  await mkdir(attachmentsDir, { recursive: true })
  await assertDirectoryInside(attachmentsDir, rootRealPath)
  await mkdir(messageDir, { recursive: true })
  const messageDirRealPath = await assertDirectoryInside(messageDir, rootRealPath)

  return {
    rootRealPath,
    messageDirRealPath,
    messageRelativePath: `attachments/${safeMessageId}`,
  }
}

async function assertDirectoryInside(path: string, rootRealPath: string): Promise<string> {
  const stats = await lstat(path)
  if (!stats.isDirectory() || stats.isSymbolicLink()) {
    throw new WorkspaceDocumentAttachmentStagingError(
      rejection('staging_failed', {
        message: 'Workspace attachment staging directory is not a regular directory.',
      })
    )
  }

  const real = await realpath(path)
  if (!isInside(real, rootRealPath)) {
    throw new WorkspaceDocumentAttachmentStagingError(
      rejection('staging_failed', {
        message: 'Workspace attachment staging path resolves outside the managed workspace.',
      })
    )
  }
  return real
}

async function copyAttachmentWithoutOverwrite(
  attachment: InternalAttachmentRecord,
  directory: WorkspaceStagingDirectory
): Promise<string> {
  const safeName = sanitizeAttachmentFilename(attachment.originalName)
  const ext = extname(safeName)
  const stem = ext ? safeName.slice(0, -ext.length) : safeName

  for (let attempt = 0; attempt < 1000; attempt += 1) {
    const candidateName = attempt === 0 ? safeName : `${stem}-${attempt + 1}${ext}`
    const absolutePath = resolve(directory.messageDirRealPath, candidateName)
    if (!isInside(absolutePath, directory.rootRealPath)) {
      throw new WorkspaceDocumentAttachmentStagingError(
        rejection('staging_failed', {
          attachment,
          message: 'Workspace attachment target resolves outside the managed workspace.',
        })
      )
    }

    try {
      await copyFile(attachment.storagePath, absolutePath, constants.COPYFILE_EXCL)
      const copiedRealPath = await realpath(absolutePath)
      const copiedStats = await lstat(copiedRealPath)
      if (!copiedStats.isFile() || copiedStats.isSymbolicLink()) {
        throw new Error('Copied document is not a regular file.')
      }
      if (!isInside(copiedRealPath, directory.rootRealPath)) {
        throw new Error('Copied document resolves outside the managed workspace.')
      }
      return `${directory.messageRelativePath}/${candidateName}`
    } catch (error) {
      if (isFileExistsError(error)) {
        continue
      }
      throw new WorkspaceDocumentAttachmentStagingError(
        rejection('staging_failed', {
          attachment,
          message: error instanceof Error ? error.message : 'Document attachment staging failed.',
        })
      )
    }
  }

  throw new WorkspaceDocumentAttachmentStagingError(
    rejection('staging_failed', {
      attachment,
      message: 'Could not create a non-conflicting workspace attachment path.',
    })
  )
}

function sanitizeAttachmentFilename(value: string): string {
  const fallback = 'attachment'
  const input = basename(value || fallback)
  const cleaned = replaceUnsafeFilenameCharacters(input).replace(/\s+/g, ' ').trim()
  const withoutTraversal = cleaned
    .split('.')
    .filter((part) => part !== '..')
    .join('.')
    .replace(/^\.+$/, '')
  const result = withoutTraversal || fallback
  return result.length > 180 ? result.slice(0, 180) : result
}

function replaceUnsafeFilenameCharacters(value: string): string {
  let result = ''
  for (const char of value) {
    const codePoint = char.codePointAt(0) ?? 0
    result += codePoint <= 31 || codePoint === 127 || '<>:"/\\|?*'.includes(char) ? '_' : char
  }
  return result
}

function sanitizePathSegment(value: string): string {
  const cleaned = String(value || '')
    .trim()
    .replace(/[^A-Za-z0-9_.-]+/g, '_')
    .replace(/^\.+$/, '')
    .slice(0, 120)
  return cleaned || 'message'
}

function rejection(
  reason: ComplexDocumentAttachmentRejectionReason,
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

function isWorkspaceStagedAttachmentMetadata(
  value: unknown
): value is WorkspaceStagedAttachmentMetadata {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }
  const record = value as Record<string, unknown>
  return (
    typeof record.attachmentId === 'string' &&
    typeof record.originalName === 'string' &&
    typeof record.mimeType === 'string' &&
    typeof record.sizeBytes === 'number' &&
    typeof record.workspaceRelativePath === 'string' &&
    !record.workspaceRelativePath.includes('\0') &&
    !record.workspaceRelativePath.startsWith('/') &&
    !record.workspaceRelativePath.split('/').includes('..')
  )
}

function isInside(candidate: string, root: string): boolean {
  const relativePath = relative(root, candidate)
  return relativePath === '' || (!relativePath.startsWith('..') && !relativePath.startsWith(sep))
}

function isFileExistsError(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'EEXIST')
}
