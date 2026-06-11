import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'

import type { AttachmentRepo } from '@core/db/repos'
import { resolveOpenOmniClawDataPaths } from '@core/utils/data-paths'
import { inferComplexDocumentMimeType } from '@shared/attachment-documents'
import type {
  Attachment,
  AttachmentKind,
  ChatMessagePart,
  InternalAttachmentRecord,
  MessageAttachment,
  UploadAttachmentRequest,
  UploadAttachmentResponse,
} from '@shared/types/chat'

export interface AttachmentServiceOptions {
  repo: AttachmentRepo
  rootDir?: string
  maxAttachmentsPerMessage?: number
  maxFileBytes?: number
  maxExtractedChars?: number
}

export class AttachmentService {
  private readonly repo: AttachmentRepo
  private readonly rootDir: string
  private readonly maxAttachmentsPerMessage: number
  private readonly maxFileBytes: number
  private readonly maxExtractedChars: number

  constructor(options: AttachmentServiceOptions) {
    this.repo = options.repo
    this.rootDir = options.rootDir ?? resolveOpenOmniClawDataPaths().attachments
    this.maxAttachmentsPerMessage = options.maxAttachmentsPerMessage ?? 12
    this.maxFileBytes = options.maxFileBytes ?? 25 * 1024 * 1024
    this.maxExtractedChars = options.maxExtractedChars ?? 100_000
  }

  async upload(request: UploadAttachmentRequest): Promise<UploadAttachmentResponse> {
    const bytes = Buffer.from(request.bytes)
    if (bytes.byteLength > this.maxFileBytes) {
      throw new Error(`Attachment exceeds ${this.maxFileBytes} bytes.`)
    }

    const sha256 = createHash('sha256').update(bytes).digest('hex')
    const existing = this.repo.getBySha256(sha256)
    if (existing) {
      return { attachment: sanitizeAttachment(existing) }
    }

    const now = Date.now()
    const originalName = basename(request.name || 'attachment')
    const mimeType = request.mimeType || inferMimeType(originalName)

    // TODO：目前先禁止上传 PDF、音频和视频文件，因为它们可能需要特殊处理（如生成预览图、提取元数据等），后续可以根据需要添加支持
    if (isPdfFile(originalName, mimeType)) {
      throw new Error('PDF attachments are not supported yet.')
    }
    if (isAudioVideoFile(originalName, mimeType)) {
      throw new Error('Audio and video attachments are not supported yet.')
    }

    const kind = inferKind(mimeType, originalName)
    const ext = safeExtension(originalName, mimeType)
    const storedName = `${sha256}${ext}`
    const bucket = join(
      this.rootDir,
      String(new Date(now).getFullYear()),
      String(new Date(now).getMonth() + 1).padStart(2, '0')
    )
    await mkdir(bucket, { recursive: true })
    const storagePath = join(bucket, storedName)
    await writeFile(storagePath, bytes)

    const extraction = extractText(bytes, mimeType, this.maxExtractedChars)
    const attachment: InternalAttachmentRecord = {
      id: crypto.randomUUID(),
      kind,
      originalName,
      storedName,
      mimeType,
      sizeBytes: bytes.byteLength,
      sha256,
      storagePath,
      extractedText: extraction.text,
      extractedTextStatus: extraction.status,
      extractedTextError: extraction.error,
      createdAt: now,
      updatedAt: now,
    }

    const saved = this.repo.save(attachment)
    if (!saved) {
      const existingAfterConflict = this.repo.getBySha256(sha256)
      if (existingAfterConflict) {
        return { attachment: sanitizeAttachment(existingAfterConflict) }
      }
      throw new Error('Attachment upload failed after content hash conflict.')
    }

    return { attachment: sanitizeAttachment(attachment) }
  }

  get(id: string): InternalAttachmentRecord | undefined {
    return this.repo.get(id)
  }

  getLimits(): {
    maxAttachmentsPerMessage: number
    maxFileBytes: number
    maxExtractedChars: number
  } {
    return {
      maxAttachmentsPerMessage: this.maxAttachmentsPerMessage,
      maxFileBytes: this.maxFileBytes,
      maxExtractedChars: this.maxExtractedChars,
    }
  }

  async getPreview(
    id: string
  ): Promise<{ attachmentId: string; url: string; mimeType: string; filename: string }> {
    const attachment = this.repo.get(id)
    if (!attachment) {
      throw new Error(`Attachment not found: ${id}`)
    }

    const bytes = await readFile(attachment.storagePath)
    return {
      attachmentId: attachment.id,
      url: `data:${attachment.mimeType};base64,${bytes.toString('base64')}`,
      mimeType: attachment.mimeType,
      filename: attachment.originalName,
    }
  }

  validateMessageParts(parts: ChatMessagePart[]): MessageAttachment[] {
    const links: MessageAttachment[] = []
    for (const [index, part] of parts.entries()) {
      const attachmentId = attachmentIdFromPart(part)
      if (!attachmentId) {
        continue
      }
      if (!this.repo.get(attachmentId)) {
        throw new Error(`Attachment not found: ${attachmentId}`)
      }
      links.push({
        messageId: '',
        attachmentId,
        partIndex: index,
        role: 'input',
      })
    }

    if (links.length > this.maxAttachmentsPerMessage) {
      throw new Error(`Too many attachments. Maximum is ${this.maxAttachmentsPerMessage}.`)
    }

    return links
  }

  async materializeImageDataUrl(attachment: InternalAttachmentRecord): Promise<string> {
    const bytes = await readFile(attachment.storagePath)
    return `data:${attachment.mimeType};base64,${bytes.toString('base64')}`
  }
}

export function attachmentIdFromPart(part: ChatMessagePart): string | undefined {
  const record = part as Record<string, unknown>
  const value = record.attachmentId ?? record.attachment_id
  return typeof value === 'string' && value ? value : undefined
}

export function sanitizeAttachment(attachment: InternalAttachmentRecord): Attachment {
  return {
    id: attachment.id,
    kind: attachment.kind,
    originalName: attachment.originalName,
    storedName: attachment.storedName,
    mimeType: attachment.mimeType,
    sizeBytes: attachment.sizeBytes,
    sha256: attachment.sha256,
    extractedText: attachment.extractedText,
    extractedTextStatus: attachment.extractedTextStatus,
    extractedTextError: attachment.extractedTextError,
    createdAt: attachment.createdAt,
    updatedAt: attachment.updatedAt,
  }
}

function inferKind(mimeType: string, name: string): AttachmentKind {
  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType.startsWith('audio/')) return 'audio'
  if (mimeType.startsWith('video/')) return 'video'
  if (mimeType.startsWith('text/') || /\.(md|txt|json|csv|log)$/i.test(name)) return 'text'
  return 'file'
}

function isPdfFile(name: string, mimeType: string): boolean {
  return mimeType === 'application/pdf' || /\.pdf$/i.test(name)
}

function isAudioVideoFile(name: string, mimeType: string): boolean {
  return (
    mimeType.startsWith('audio/') ||
    mimeType.startsWith('video/') ||
    /\.(aac|avi|flac|m4a|m4v|mkv|mov|mp3|mp4|mpeg|mpg|oga|ogg|opus|wav|webm|wmv)$/i.test(name)
  )
}

function inferMimeType(name: string): string {
  const ext = extname(name).toLowerCase()
  if (ext === '.png') return 'image/png'
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  if (ext === '.gif') return 'image/gif'
  if (ext === '.webp') return 'image/webp'
  if (ext === '.mp3') return 'audio/mpeg'
  if (ext === '.wav') return 'audio/wav'
  if (ext === '.mp4') return 'video/mp4'
  if (ext === '.json') return 'application/json'
  if (ext === '.md') return 'text/markdown'
  if (ext === '.csv') return 'text/csv'
  if (ext === '.txt' || ext === '.log') return 'text/plain'
  const complexDocumentMimeType = inferComplexDocumentMimeType(name)
  if (complexDocumentMimeType) return complexDocumentMimeType
  return 'application/octet-stream'
}

function safeExtension(name: string, mimeType: string): string {
  const ext = extname(name)
    .toLowerCase()
    .replace(/[^a-z0-9.]/g, '')
  if (ext) return ext
  if (mimeType === 'image/png') return '.png'
  if (mimeType === 'image/jpeg') return '.jpg'
  if (mimeType === 'text/plain') return '.txt'
  return '.bin'
}

function extractText(
  bytes: Buffer,
  mimeType: string,
  maxChars: number
): {
  status: InternalAttachmentRecord['extractedTextStatus']
  text?: string
  error?: string
} {
  if (!mimeType.startsWith('text/') && mimeType !== 'application/json') {
    return { status: 'none' }
  }

  try {
    return {
      status: 'complete',
      text: bytes.toString('utf8').slice(0, maxChars),
    }
  } catch (error) {
    return {
      status: 'error',
      error: error instanceof Error ? error.message : 'Text extraction failed.',
    }
  }
}
