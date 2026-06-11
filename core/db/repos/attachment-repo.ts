import type { DatabaseConnection } from '../client'
import type { InternalAttachmentRecord } from '../types'

interface AttachmentRow {
  id: string
  kind: InternalAttachmentRecord['kind']
  original_name: string
  stored_name: string
  mime_type: string
  size_bytes: number
  sha256: string
  storage_path: string
  preview_path: string | null
  extracted_text: string | null
  extracted_text_status: InternalAttachmentRecord['extractedTextStatus']
  extracted_text_error: string | null
  created_at: number
  updated_at: number
}

export class AttachmentRepo {
  constructor(private readonly db: DatabaseConnection) {}

  get(id: string): InternalAttachmentRecord | undefined {
    const row = this.db.prepare('SELECT * FROM attachments WHERE id = ?').get(id) as
      | AttachmentRow
      | undefined
    return row ? mapAttachment(row) : undefined
  }

  getBySha256(sha256: string): InternalAttachmentRecord | undefined {
    const row = this.db.prepare('SELECT * FROM attachments WHERE sha256 = ?').get(sha256) as
      | AttachmentRow
      | undefined
    return row ? mapAttachment(row) : undefined
  }

  save(attachment: InternalAttachmentRecord): boolean {
    const result = this.db
      .prepare(
        `
          INSERT INTO attachments (
            id, kind, original_name, stored_name, mime_type, size_bytes, sha256,
            storage_path, preview_path, extracted_text, extracted_text_status,
            extracted_text_error, created_at, updated_at
          ) VALUES (
            @id, @kind, @originalName, @storedName, @mimeType, @sizeBytes, @sha256,
            @storagePath, @previewPath, @extractedText, @extractedTextStatus,
            @extractedTextError, @createdAt, @updatedAt
          )
          ON CONFLICT(id) DO UPDATE SET
            kind = excluded.kind,
            original_name = excluded.original_name,
            stored_name = excluded.stored_name,
            mime_type = excluded.mime_type,
            size_bytes = excluded.size_bytes,
            sha256 = excluded.sha256,
            storage_path = excluded.storage_path,
            preview_path = excluded.preview_path,
            extracted_text = excluded.extracted_text,
            extracted_text_status = excluded.extracted_text_status,
            extracted_text_error = excluded.extracted_text_error,
            updated_at = excluded.updated_at
          ON CONFLICT(sha256) DO NOTHING
        `
      )
      .run({
        id: attachment.id,
        kind: attachment.kind,
        originalName: attachment.originalName,
        storedName: attachment.storedName,
        mimeType: attachment.mimeType,
        sizeBytes: attachment.sizeBytes,
        sha256: attachment.sha256,
        storagePath: attachment.storagePath,
        previewPath: attachment.previewPath ?? null,
        extractedText: attachment.extractedText ?? null,
        extractedTextStatus: attachment.extractedTextStatus ?? 'none',
        extractedTextError: attachment.extractedTextError ?? null,
        createdAt: attachment.createdAt,
        updatedAt: attachment.updatedAt,
      })
    return result.changes > 0
  }

  updateExtraction(
    id: string,
    fields: Pick<
      InternalAttachmentRecord,
      'extractedText' | 'extractedTextStatus' | 'extractedTextError'
    >,
    updatedAt = Date.now()
  ): boolean {
    return (
      this.db
        .prepare(
          `
          UPDATE attachments
          SET extracted_text = @extractedText,
              extracted_text_status = @extractedTextStatus,
              extracted_text_error = @extractedTextError,
              updated_at = @updatedAt
          WHERE id = @id
        `
        )
        .run({
          id,
          extractedText: fields.extractedText ?? null,
          extractedTextStatus: fields.extractedTextStatus ?? 'none',
          extractedTextError: fields.extractedTextError ?? null,
          updatedAt,
        }).changes > 0
    )
  }
}

function mapAttachment(row: AttachmentRow): InternalAttachmentRecord {
  return {
    id: row.id,
    kind: row.kind,
    originalName: row.original_name,
    storedName: row.stored_name,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    sha256: row.sha256,
    storagePath: row.storage_path,
    previewPath: row.preview_path ?? undefined,
    extractedText: row.extracted_text ?? undefined,
    extractedTextStatus: row.extracted_text_status,
    extractedTextError: row.extracted_text_error ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
