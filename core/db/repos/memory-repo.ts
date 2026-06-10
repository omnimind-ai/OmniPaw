import type {
  CompanionMemoryDeleteRequest,
  CompanionMemoryExtractionDiagnostics,
  CompanionMemoryExtractionJob,
  CompanionMemoryFilters,
  CompanionMemoryImportanceRequest,
  CompanionMemoryInspectResponse,
  CompanionMemoryItem,
  CompanionMemoryLink,
  CompanionMemoryListResponse,
  CompanionMemoryLocalEmbedding,
  CompanionMemoryMaintenanceProposal,
  CompanionMemoryProposalListRequest,
  CompanionMemorySearchResult,
  CompanionMemorySourceEvidence,
  CreateCompanionMemoryProposalRequest,
  CreateCompanionMemoryRequest,
  UpdateCompanionMemoryProposalRequest,
  UpdateCompanionMemoryRequest,
} from '@shared/types/memory'
import {
  hashEmbeddingText,
  localMemoryEmbedding,
  localMemoryEmbeddingDimension,
  localMemoryEmbeddingModel,
  localMemoryEmbeddingProvider,
  type MemoryEmbeddingMetadata,
  type MemoryEmbeddingResult,
  memoryEmbeddingText,
} from '../../memory/embedding'
import type { DatabaseConnection } from '../client'
import { decodeJson, encodeJson } from '../json'

interface MemoryItemRow {
  id: string
  kind: CompanionMemoryItem['kind']
  scope: CompanionMemoryItem['scope']
  status: CompanionMemoryItem['status']
  subject: string | null
  content: string
  importance: number
  confidence: number
  user_id: string | null
  character_id: string | null
  session_id: string | null
  source_run_id: string | null
  observed_at: number | null
  expires_at: number | null
  archived_at: number | null
  deleted_at: number | null
  metadata_json: string | null
  created_at: number
  updated_at: number
  lexical_score?: number | null
}

interface SourceRow {
  id: string
  memory_id: string
  source_kind: CompanionMemorySourceEvidence['sourceKind']
  session_id: string | null
  run_id: string | null
  message_ids_json: string
  source_role: CompanionMemorySourceEvidence['sourceRole'] | null
  evidence_hash: string
  source_created_at: number | null
  metadata_json: string | null
  created_at: number
}

interface JobRow {
  id: string
  run_id: string
  session_id: string
  session_kind: CompanionMemoryExtractionJob['sessionKind'] | null
  status: CompanionMemoryExtractionJob['status']
  error_code: string | null
  error_message: string | null
  created_memory_ids_json: string
  diagnostics_json?: string | null
  started_at: number | null
  finished_at: number | null
  created_at: number
  updated_at: number
}

interface LinkRow {
  id: string
  memory_id: string
  linked_memory_id: string
  relation: CompanionMemoryLink['relation']
  confidence: number
  metadata_json: string | null
  created_at: number
}

interface ProposalRow {
  id: string
  kind: CompanionMemoryMaintenanceProposal['kind']
  status: CompanionMemoryMaintenanceProposal['status']
  memory_id: string | null
  related_memory_id: string | null
  proposed_content: string | null
  reason: string
  confidence: number
  source: CompanionMemoryMaintenanceProposal['source']
  run_id: string | null
  metadata_json: string | null
  created_at: number
  updated_at: number
}

interface EmbeddingRow {
  memory_id: string
  provider: string
  model: string
  dimension: number
  content_hash: string
  vector_json: string
  created_at: number
  updated_at: number
}

export class CompanionMemoryRepo {
  constructor(private readonly db: DatabaseConnection) {}

  create(request: CreateCompanionMemoryRequest): CompanionMemoryItem {
    const now = Date.now()
    const memory: CompanionMemoryItem = {
      id: crypto.randomUUID(),
      kind: request.kind,
      scope: request.scope ?? 'user',
      status: request.status ?? 'active',
      subject: cleanOptionalText(request.subject),
      content: request.content.trim(),
      importance: clampInteger(request.importance ?? 3, 1, 5),
      confidence: clampNumber(request.confidence ?? 0.7, 0, 1),
      userId: cleanOptionalText(request.userId),
      characterId: cleanOptionalText(request.characterId),
      sessionId: cleanOptionalText(request.sessionId),
      sourceRunId: cleanOptionalText(request.sourceRunId),
      observedAt: request.observedAt,
      expiresAt: request.expiresAt,
      metadata: request.metadata,
      createdAt: now,
      updatedAt: now,
    }

    const save = this.db.transaction(() => {
      this.insertOrReplaceMemory(memory)
      this.replaceFts(memory)
      this.replaceEmbedding(memory)
      for (const source of request.sources ?? []) {
        this.addSource({
          ...source,
          memoryId: memory.id,
        })
      }
    })
    save()

    return this.get(memory.id) ?? memory
  }

  get(memoryId: string): CompanionMemoryItem | undefined {
    const row = this.db.prepare('SELECT * FROM companion_memory_items WHERE id = ?').get(memoryId)
    return row ? mapMemory(row as MemoryItemRow) : undefined
  }

  inspect(memoryId: string): CompanionMemoryInspectResponse | undefined {
    const memory = this.get(memoryId)
    if (!memory) {
      return undefined
    }
    return {
      memory,
      sources: this.listSources(memoryId),
      links: this.listLinks(memoryId),
      proposals: this.listProposals({ memoryId, status: 'pending', limit: 50 }).items,
    }
  }

  list(filters: CompanionMemoryFilters = {}): CompanionMemoryListResponse {
    if (filters.query?.trim()) {
      return this.search(filters)
    }

    const { where, params } = this.buildFilter(filters)
    const limit = clampInteger(filters.limit ?? 100, 1, 500)
    const offset = Math.max(0, Math.round(filters.offset ?? 0))
    const items = this.db
      .prepare(
        `
          SELECT * FROM companion_memory_items
          ${where}
          ORDER BY updated_at DESC, id ASC
          LIMIT @limit OFFSET @offset
        `
      )
      .all({ ...params, limit, offset })
      .map((row) => mapMemory(row as MemoryItemRow))
    const total = (
      this.db
        .prepare(`SELECT count(*) AS count FROM companion_memory_items ${where}`)
        .get(params) as {
        count: number
      }
    ).count
    return { items, total }
  }

  search(filters: CompanionMemoryFilters = {}): CompanionMemoryListResponse {
    const query = ftsQuery(filters.query)
    if (!query) {
      return this.list({ ...filters, query: undefined })
    }

    const { where, params } = this.buildFilter(filters, 'items')
    const limit = clampInteger(filters.limit ?? 100, 1, 500)
    const offset = Math.max(0, Math.round(filters.offset ?? 0))
    try {
      const items = this.db
        .prepare(
          `
            SELECT items.*, bm25(companion_memory_fts) AS lexical_score
            FROM companion_memory_fts
            JOIN companion_memory_items items ON items.id = companion_memory_fts.memory_id
            ${where ? `${where} AND` : 'WHERE'} companion_memory_fts MATCH @query
            ORDER BY lexical_score ASC, items.importance DESC, items.updated_at DESC
            LIMIT @limit OFFSET @offset
          `
        )
        .all({ ...params, query, limit, offset })
        .map((row) => {
          const item = mapMemory(row as MemoryItemRow)
          return {
            ...item,
            lexicalScore: Number((row as MemoryItemRow).lexical_score ?? 0),
          }
        })
      return { items, total: items.length }
    } catch {
      return this.searchLike(filters)
    }
  }

  update(request: UpdateCompanionMemoryRequest): CompanionMemoryItem | undefined {
    const existing = this.get(request.memoryId)
    if (!existing) {
      return undefined
    }
    const updated: CompanionMemoryItem = {
      ...existing,
      kind: request.kind ?? existing.kind,
      scope: request.scope ?? existing.scope,
      status: request.status ?? existing.status,
      subject:
        request.subject !== undefined ? cleanOptionalText(request.subject) : existing.subject,
      content: request.content !== undefined ? request.content.trim() : existing.content,
      importance:
        request.importance !== undefined
          ? clampInteger(request.importance, 1, 5)
          : existing.importance,
      confidence:
        request.confidence !== undefined
          ? clampNumber(request.confidence, 0, 1)
          : existing.confidence,
      userId: request.userId !== undefined ? cleanOptionalText(request.userId) : existing.userId,
      characterId:
        request.characterId !== undefined
          ? cleanOptionalText(request.characterId)
          : existing.characterId,
      sessionId:
        request.sessionId !== undefined ? cleanOptionalText(request.sessionId) : existing.sessionId,
      expiresAt:
        request.expiresAt === null
          ? undefined
          : request.expiresAt !== undefined
            ? request.expiresAt
            : existing.expiresAt,
      metadata: request.metadata !== undefined ? request.metadata : existing.metadata,
      archivedAt:
        request.status === 'archived' && existing.status !== 'archived'
          ? Date.now()
          : request.status !== 'archived'
            ? undefined
            : existing.archivedAt,
      deletedAt:
        request.status === 'deleted' && existing.status !== 'deleted'
          ? Date.now()
          : request.status !== 'deleted'
            ? undefined
            : existing.deletedAt,
      updatedAt: Date.now(),
    }
    this.insertOrReplaceMemory(updated)
    this.replaceFts(updated)
    this.replaceEmbedding(updated)
    return this.get(updated.id)
  }

  archive(memoryId: string): CompanionMemoryItem | undefined {
    return this.update({ memoryId, status: 'archived' })
  }

  setImportance(request: CompanionMemoryImportanceRequest): CompanionMemoryItem | undefined {
    return this.update({ memoryId: request.memoryId, importance: request.importance })
  }

  delete(request: CompanionMemoryDeleteRequest | string): boolean {
    const memoryId = typeof request === 'string' ? request : request.memoryId
    const hardDelete = typeof request === 'string' ? false : request.hardDelete === true
    if (hardDelete) {
      const remove = this.db.transaction(() => {
        this.db.prepare('DELETE FROM companion_memory_fts WHERE memory_id = ?').run(memoryId)
        this.db.prepare('DELETE FROM companion_memory_embeddings WHERE memory_id = ?').run(memoryId)
        this.db.prepare('DELETE FROM companion_memory_items WHERE id = ?').run(memoryId)
      })
      remove()
      return true
    }
    return Boolean(this.update({ memoryId, status: 'deleted' }))
  }

  addSource(
    source: Omit<CompanionMemorySourceEvidence, 'id' | 'createdAt'> & {
      id?: string
      createdAt?: number
    }
  ): CompanionMemorySourceEvidence {
    const row: CompanionMemorySourceEvidence = {
      id: source.id ?? crypto.randomUUID(),
      memoryId: source.memoryId,
      sourceKind: source.sourceKind,
      sessionId: cleanOptionalText(source.sessionId),
      runId: cleanOptionalText(source.runId),
      messageIds: source.messageIds,
      sourceRole: source.sourceRole,
      evidenceHash: source.evidenceHash,
      sourceCreatedAt: source.sourceCreatedAt,
      metadata: source.metadata,
      createdAt: source.createdAt ?? Date.now(),
    }
    this.db
      .prepare(
        `
          INSERT INTO companion_memory_sources (
            id, memory_id, source_kind, session_id, run_id, message_ids_json, source_role,
            evidence_hash, source_created_at, metadata_json, created_at
          ) VALUES (
            @id, @memoryId, @sourceKind, @sessionId, @runId, @messageIdsJson, @sourceRole,
            @evidenceHash, @sourceCreatedAt, @metadataJson, @createdAt
          )
        `
      )
      .run({
        id: row.id,
        memoryId: row.memoryId,
        sourceKind: row.sourceKind,
        sessionId: row.sessionId ?? null,
        runId: row.runId ?? null,
        messageIdsJson: encodeJson(row.messageIds) ?? '[]',
        sourceRole: row.sourceRole ?? null,
        evidenceHash: row.evidenceHash,
        sourceCreatedAt: row.sourceCreatedAt ?? null,
        metadataJson: encodeJson(row.metadata),
        createdAt: row.createdAt,
      })
    return row
  }

  listSources(memoryId: string): CompanionMemorySourceEvidence[] {
    return this.db
      .prepare(
        `
          SELECT * FROM companion_memory_sources
          WHERE memory_id = ?
          ORDER BY created_at DESC
        `
      )
      .all(memoryId)
      .map((row) => mapSource(row as SourceRow))
  }

  createJob(input: {
    runId: string
    sessionId: string
    sessionKind?: CompanionMemoryExtractionJob['sessionKind']
    status?: CompanionMemoryExtractionJob['status']
  }): CompanionMemoryExtractionJob {
    const now = Date.now()
    const job: CompanionMemoryExtractionJob = {
      id: crypto.randomUUID(),
      runId: input.runId,
      sessionId: input.sessionId,
      sessionKind: input.sessionKind,
      status: input.status ?? 'queued',
      createdMemoryIds: [],
      createdAt: now,
      updatedAt: now,
    }
    this.db
      .prepare(
        `
          INSERT INTO companion_memory_extraction_jobs (
            id, run_id, session_id, session_kind, status, created_memory_ids_json,
            created_at, updated_at
          ) VALUES (
            @id, @runId, @sessionId, @sessionKind, @status, @createdMemoryIdsJson,
            @createdAt, @updatedAt
          )
        `
      )
      .run(toJobParams(job))
    return job
  }

  updateJob(
    jobId: string,
    patch: Partial<
      Pick<
        CompanionMemoryExtractionJob,
        | 'status'
        | 'errorCode'
        | 'errorMessage'
        | 'createdMemoryIds'
        | 'diagnostics'
        | 'startedAt'
        | 'finishedAt'
      >
    >
  ): CompanionMemoryExtractionJob | undefined {
    const existing = this.getJob(jobId)
    if (!existing) {
      return undefined
    }
    const job: CompanionMemoryExtractionJob = {
      ...existing,
      ...patch,
      updatedAt: Date.now(),
    }
    this.db
      .prepare(
        `
          UPDATE companion_memory_extraction_jobs
          SET status = @status,
              error_code = @errorCode,
              error_message = @errorMessage,
              created_memory_ids_json = @createdMemoryIdsJson,
              diagnostics_json = @diagnosticsJson,
              started_at = @startedAt,
              finished_at = @finishedAt,
              updated_at = @updatedAt
          WHERE id = @id
        `
      )
      .run(toJobParams(job))
    return this.getJob(job.id)
  }

  getJob(jobId: string): CompanionMemoryExtractionJob | undefined {
    const row = this.db
      .prepare('SELECT * FROM companion_memory_extraction_jobs WHERE id = ?')
      .get(jobId)
    return row ? mapJob(row as JobRow) : undefined
  }

  addLink(
    link: Omit<CompanionMemoryLink, 'id' | 'createdAt'> & { id?: string; createdAt?: number }
  ): CompanionMemoryLink {
    const row: CompanionMemoryLink = {
      id: link.id ?? crypto.randomUUID(),
      memoryId: link.memoryId,
      linkedMemoryId: link.linkedMemoryId,
      relation: link.relation,
      confidence: clampNumber(link.confidence, 0, 1),
      metadata: link.metadata,
      createdAt: link.createdAt ?? Date.now(),
    }
    this.db
      .prepare(
        `
          INSERT INTO companion_memory_links (
            id, memory_id, linked_memory_id, relation, confidence, metadata_json, created_at
          ) VALUES (
            @id, @memoryId, @linkedMemoryId, @relation, @confidence, @metadataJson, @createdAt
          )
          ON CONFLICT(memory_id, linked_memory_id, relation) DO UPDATE SET
            confidence = excluded.confidence,
            metadata_json = excluded.metadata_json
        `
      )
      .run({
        id: row.id,
        memoryId: row.memoryId,
        linkedMemoryId: row.linkedMemoryId,
        relation: row.relation,
        confidence: row.confidence,
        metadataJson: encodeJson(row.metadata),
        createdAt: row.createdAt,
      })
    return row
  }

  listLinks(memoryId: string): CompanionMemoryLink[] {
    return this.db
      .prepare(
        `
          SELECT * FROM companion_memory_links
          WHERE memory_id = @memoryId OR linked_memory_id = @memoryId
          ORDER BY created_at DESC
        `
      )
      .all({ memoryId })
      .map((row) => mapLink(row as LinkRow))
  }

  createProposal(
    request: CreateCompanionMemoryProposalRequest
  ): CompanionMemoryMaintenanceProposal {
    const now = Date.now()
    const proposal: CompanionMemoryMaintenanceProposal = {
      id: crypto.randomUUID(),
      kind: request.kind,
      status: 'pending',
      memoryId: cleanOptionalText(request.memoryId),
      relatedMemoryId: cleanOptionalText(request.relatedMemoryId),
      proposedContent: cleanOptionalText(request.proposedContent),
      reason: request.reason.trim() || 'Memory proposal requires review.',
      confidence: clampNumber(request.confidence ?? 0.7, 0, 1),
      source: request.source ?? 'maintenance',
      runId: cleanOptionalText(request.runId),
      metadata: request.metadata,
      createdAt: now,
      updatedAt: now,
    }
    this.db
      .prepare(
        `
          INSERT INTO companion_memory_proposals (
            id, kind, status, memory_id, related_memory_id, proposed_content, reason,
            confidence, source, run_id, metadata_json, created_at, updated_at
          ) VALUES (
            @id, @kind, @status, @memoryId, @relatedMemoryId, @proposedContent, @reason,
            @confidence, @source, @runId, @metadataJson, @createdAt, @updatedAt
          )
        `
      )
      .run(toProposalParams(proposal))
    return proposal
  }

  listProposals(request: CompanionMemoryProposalListRequest = {}): {
    items: CompanionMemoryMaintenanceProposal[]
    total: number
  } {
    const clauses: string[] = []
    const params: Record<string, unknown> = {}
    if (request.status) {
      clauses.push('status = @status')
      params.status = request.status
    }
    if (request.memoryId) {
      clauses.push('(memory_id = @memoryId OR related_memory_id = @memoryId)')
      params.memoryId = request.memoryId
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
    const limit = clampInteger(request.limit ?? 100, 1, 500)
    const items = this.db
      .prepare(
        `
          SELECT * FROM companion_memory_proposals
          ${where}
          ORDER BY updated_at DESC, id ASC
          LIMIT @limit
        `
      )
      .all({ ...params, limit })
      .map((row) => mapProposal(row as ProposalRow))
    const total = (
      this.db
        .prepare(`SELECT count(*) AS count FROM companion_memory_proposals ${where}`)
        .get(params) as { count: number }
    ).count
    return { items, total }
  }

  updateProposal(
    request: UpdateCompanionMemoryProposalRequest
  ): CompanionMemoryMaintenanceProposal | undefined {
    const existing = this.getProposal(request.proposalId)
    if (!existing) {
      return undefined
    }
    const proposal: CompanionMemoryMaintenanceProposal = {
      ...existing,
      status: request.status ?? existing.status,
      proposedContent:
        request.proposedContent !== undefined
          ? cleanOptionalText(request.proposedContent)
          : existing.proposedContent,
      metadata: request.metadata !== undefined ? request.metadata : existing.metadata,
      updatedAt: Date.now(),
    }
    this.db
      .prepare(
        `
          UPDATE companion_memory_proposals
          SET status = @status,
              proposed_content = @proposedContent,
              metadata_json = @metadataJson,
              updated_at = @updatedAt
          WHERE id = @id
        `
      )
      .run(toProposalParams(proposal))
    return this.getProposal(proposal.id)
  }

  getProposal(proposalId: string): CompanionMemoryMaintenanceProposal | undefined {
    const row = this.db
      .prepare('SELECT * FROM companion_memory_proposals WHERE id = ?')
      .get(proposalId)
    return row ? mapProposal(row as ProposalRow) : undefined
  }

  listEmbeddings(
    filters: CompanionMemoryFilters = {},
    embedding?: MemoryEmbeddingMetadata
  ): CompanionMemoryLocalEmbedding[] {
    const { where, params } = this.buildFilter(filters, 'items')
    const embeddingClauses = embedding ? embeddingFilterClauses(embedding) : []
    const limit = clampInteger(filters.limit ?? 500, 1, 5000)
    const rows = this.db
      .prepare(
        `
          SELECT embeddings.*
          FROM companion_memory_embeddings embeddings
          JOIN companion_memory_items items ON items.id = embeddings.memory_id
          ${appendWhere(where, embeddingClauses)}
          ORDER BY items.importance DESC, items.updated_at DESC
          LIMIT @limit
        `
      )
      .all({ ...params, ...embeddingParams(embedding), limit })
    return rows.map((row) => mapEmbedding(row as EmbeddingRow)).filter((row) => row.vector.length)
  }

  ensureEmbeddings(filters: CompanionMemoryFilters = {}): number {
    const rows = this.listMissingEmbeddings(filters, {
      provider: localMemoryEmbeddingProvider,
      model: localMemoryEmbeddingModel,
      dimension: localMemoryEmbeddingDimension,
    })

    for (const memory of rows) {
      this.replaceEmbedding(memory)
    }
    return rows.length
  }

  listMissingEmbeddings(
    filters: CompanionMemoryFilters = {},
    embedding: MemoryEmbeddingMetadata
  ): CompanionMemorySearchResult[] {
    const { where, params } = this.buildFilter(filters, 'items')
    const rows = this.db
      .prepare(
        `
          SELECT items.*
          FROM companion_memory_items items
          LEFT JOIN companion_memory_embeddings embeddings ON embeddings.memory_id = items.id
          ${appendWhere(where, [
            `(
              embeddings.memory_id IS NULL
              OR embeddings.provider != @embeddingProvider
              OR embeddings.model != @embeddingModel
              OR embeddings.dimension != @embeddingDimension
            )`,
          ])}
          ORDER BY items.updated_at DESC
          LIMIT 1000
        `
      )
      .all({
        ...params,
        ...embeddingParams(embedding),
      })
      .map((row) => mapMemory(row as MemoryItemRow))

    return rows
  }

  private searchLike(filters: CompanionMemoryFilters): CompanionMemoryListResponse {
    const { where, params } = this.buildFilter(filters)
    const query = `%${filters.query?.trim() ?? ''}%`
    const limit = clampInteger(filters.limit ?? 100, 1, 500)
    const items = this.db
      .prepare(
        `
          SELECT * FROM companion_memory_items
          ${where ? `${where} AND` : 'WHERE'} (content LIKE @likeQuery OR subject LIKE @likeQuery)
          ORDER BY importance DESC, updated_at DESC
          LIMIT @limit
        `
      )
      .all({ ...params, likeQuery: query, limit })
      .map((row) => mapMemory(row as MemoryItemRow))
    return { items, total: items.length }
  }

  private buildFilter(
    filters: CompanionMemoryFilters,
    tableAlias?: string
  ): { where: string; params: Record<string, unknown> } {
    const prefix = tableAlias ? `${tableAlias}.` : ''
    const clauses: string[] = []
    const params: Record<string, unknown> = {}

    if (!filters.includeInactive) {
      clauses.push(`${prefix}status = 'active'`)
      clauses.push(`(${prefix}expires_at IS NULL OR ${prefix}expires_at > @now)`)
      params.now = Date.now()
      params.minConfidence = filters.minConfidence ?? 0
      clauses.push(`${prefix}confidence >= @minConfidence`)
    } else if (filters.statuses?.length) {
      clauses.push(`${prefix}status IN (${placeholders('status', filters.statuses, params)})`)
    }

    if (filters.kinds?.length) {
      clauses.push(`${prefix}kind IN (${placeholders('kind', filters.kinds, params)})`)
    }
    if (filters.scopes?.length) {
      clauses.push(`${prefix}scope IN (${placeholders('scope', filters.scopes, params)})`)
    }
    if (filters.sessionId) {
      clauses.push(`(${prefix}session_id = @sessionId OR ${prefix}scope != 'session')`)
      params.sessionId = filters.sessionId
    }
    if (filters.characterId) {
      clauses.push(`(${prefix}character_id = @characterId OR ${prefix}character_id IS NULL)`)
      params.characterId = filters.characterId
    }
    if (filters.userId) {
      clauses.push(`(${prefix}user_id = @userId OR ${prefix}user_id IS NULL)`)
      params.userId = filters.userId
    }

    return {
      where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '',
      params,
    }
  }

  private insertOrReplaceMemory(memory: CompanionMemoryItem): void {
    this.db
      .prepare(
        `
          INSERT INTO companion_memory_items (
            id, kind, scope, status, subject, content, importance, confidence, user_id,
            character_id, session_id, source_run_id, observed_at, expires_at, archived_at,
            deleted_at, metadata_json, created_at, updated_at
          ) VALUES (
            @id, @kind, @scope, @status, @subject, @content, @importance, @confidence, @userId,
            @characterId, @sessionId, @sourceRunId, @observedAt, @expiresAt, @archivedAt,
            @deletedAt, @metadataJson, @createdAt, @updatedAt
          )
          ON CONFLICT(id) DO UPDATE SET
            kind = excluded.kind,
            scope = excluded.scope,
            status = excluded.status,
            subject = excluded.subject,
            content = excluded.content,
            importance = excluded.importance,
            confidence = excluded.confidence,
            user_id = excluded.user_id,
            character_id = excluded.character_id,
            session_id = excluded.session_id,
            source_run_id = excluded.source_run_id,
            observed_at = excluded.observed_at,
            expires_at = excluded.expires_at,
            archived_at = excluded.archived_at,
            deleted_at = excluded.deleted_at,
            metadata_json = excluded.metadata_json,
            updated_at = excluded.updated_at
        `
      )
      .run(toMemoryParams(memory))
  }

  private replaceFts(memory: CompanionMemoryItem): void {
    this.db.prepare('DELETE FROM companion_memory_fts WHERE memory_id = ?').run(memory.id)
    if (memory.status === 'deleted') {
      return
    }
    this.db
      .prepare(
        `
          INSERT INTO companion_memory_fts (memory_id, subject, content)
          VALUES (?, ?, ?)
        `
      )
      .run(memory.id, memory.subject ?? '', memory.content)
  }

  replaceEmbedding(memory: CompanionMemoryItem, embedding?: MemoryEmbeddingResult): void {
    this.db.prepare('DELETE FROM companion_memory_embeddings WHERE memory_id = ?').run(memory.id)
    if (memory.status === 'deleted') {
      return
    }

    const text = memoryEmbeddingText(memory)
    const result = embedding ?? localMemoryEmbedding(text)
    const now = Date.now()
    this.db
      .prepare(
        `
          INSERT INTO companion_memory_embeddings (
            memory_id, provider, model, dimension, content_hash, vector_json, created_at, updated_at
          ) VALUES (
            @memoryId, @provider, @model, @dimension, @contentHash, @vectorJson, @createdAt, @updatedAt
          )
        `
      )
      .run({
        memoryId: memory.id,
        provider: result.provider,
        model: result.model,
        dimension: result.dimension,
        contentHash: result.contentHash || hashEmbeddingText(text),
        vectorJson: encodeJson(result.vector) ?? '[]',
        createdAt: now,
        updatedAt: now,
      })
  }
}

function mapMemory(row: MemoryItemRow): CompanionMemorySearchResult {
  const metadata = decodeJson<Record<string, unknown> | undefined>(row.metadata_json, undefined)
  return {
    id: row.id,
    kind: row.kind,
    scope: row.scope,
    status: row.status,
    subject: row.subject ?? undefined,
    content: row.content,
    importance: row.importance,
    confidence: row.confidence,
    userId: row.user_id ?? undefined,
    characterId: row.character_id ?? undefined,
    sessionId: row.session_id ?? undefined,
    sourceRunId: row.source_run_id ?? undefined,
    observedAt: row.observed_at ?? undefined,
    expiresAt: row.expires_at ?? undefined,
    archivedAt: row.archived_at ?? undefined,
    deletedAt: row.deleted_at ?? undefined,
    metadata,
    linkedMemoryIds: Array.isArray(metadata?.linkedMemoryIds)
      ? metadata.linkedMemoryIds.filter((value): value is string => typeof value === 'string')
      : undefined,
    attribution:
      metadata?.attributedTo === 'user-stated' ||
      metadata?.attributedTo === 'assistant-provided' ||
      metadata?.attributedTo === 'mixed'
        ? metadata.attributedTo
        : undefined,
    extractionMethod:
      metadata?.extractor === 'semantic'
        ? 'semantic'
        : metadata?.extractor === 'heuristic-add-only'
          ? 'heuristic-fallback'
          : metadata?.extractor === 'tool'
            ? 'tool'
            : metadata?.extractor === 'manual'
              ? 'manual'
              : undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lexicalScore: row.lexical_score ?? undefined,
  }
}

function appendWhere(where: string, clauses: string[]): string {
  if (!clauses.length) {
    return where
  }
  return where ? `${where} AND ${clauses.join(' AND ')}` : `WHERE ${clauses.join(' AND ')}`
}

function embeddingFilterClauses(embedding: MemoryEmbeddingMetadata): string[] {
  return [
    'embeddings.provider = @embeddingProvider',
    'embeddings.model = @embeddingModel',
    'embeddings.dimension = @embeddingDimension',
  ]
}

function embeddingParams(
  embedding: MemoryEmbeddingMetadata | undefined
): Record<string, string | number> {
  if (!embedding) {
    return {}
  }
  return {
    embeddingProvider: embedding.provider,
    embeddingModel: embedding.model,
    embeddingDimension: embedding.dimension,
  }
}

function mapSource(row: SourceRow): CompanionMemorySourceEvidence {
  return {
    id: row.id,
    memoryId: row.memory_id,
    sourceKind: row.source_kind,
    sessionId: row.session_id ?? undefined,
    runId: row.run_id ?? undefined,
    messageIds: decodeJson<string[]>(row.message_ids_json, []),
    sourceRole: row.source_role ?? undefined,
    evidenceHash: row.evidence_hash,
    sourceCreatedAt: row.source_created_at ?? undefined,
    metadata: decodeJson<Record<string, unknown> | undefined>(row.metadata_json, undefined),
    createdAt: row.created_at,
  }
}

function mapJob(row: JobRow): CompanionMemoryExtractionJob {
  return {
    id: row.id,
    runId: row.run_id,
    sessionId: row.session_id,
    sessionKind: row.session_kind ?? undefined,
    status: row.status,
    errorCode: row.error_code ?? undefined,
    errorMessage: row.error_message ?? undefined,
    createdMemoryIds: decodeJson<string[]>(row.created_memory_ids_json, []),
    diagnostics: decodeJson<CompanionMemoryExtractionDiagnostics | undefined>(
      row.diagnostics_json ?? undefined,
      undefined
    ),
    startedAt: row.started_at ?? undefined,
    finishedAt: row.finished_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapLink(row: LinkRow): CompanionMemoryLink {
  return {
    id: row.id,
    memoryId: row.memory_id,
    linkedMemoryId: row.linked_memory_id,
    relation: row.relation,
    confidence: row.confidence,
    metadata: decodeJson<Record<string, unknown> | undefined>(row.metadata_json, undefined),
    createdAt: row.created_at,
  }
}

function mapProposal(row: ProposalRow): CompanionMemoryMaintenanceProposal {
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    memoryId: row.memory_id ?? undefined,
    relatedMemoryId: row.related_memory_id ?? undefined,
    proposedContent: row.proposed_content ?? undefined,
    reason: row.reason,
    confidence: row.confidence,
    source: row.source,
    runId: row.run_id ?? undefined,
    metadata: decodeJson<Record<string, unknown> | undefined>(row.metadata_json, undefined),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapEmbedding(row: EmbeddingRow): CompanionMemoryLocalEmbedding {
  return {
    memoryId: row.memory_id,
    provider: row.provider,
    model: row.model,
    dimension: row.dimension,
    contentHash: row.content_hash,
    vector: decodeJson<number[]>(row.vector_json, []).filter(Number.isFinite),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toMemoryParams(memory: CompanionMemoryItem): Record<string, unknown> {
  return {
    id: memory.id,
    kind: memory.kind,
    scope: memory.scope,
    status: memory.status,
    subject: memory.subject ?? null,
    content: memory.content,
    importance: memory.importance,
    confidence: memory.confidence,
    userId: memory.userId ?? null,
    characterId: memory.characterId ?? null,
    sessionId: memory.sessionId ?? null,
    sourceRunId: memory.sourceRunId ?? null,
    observedAt: memory.observedAt ?? null,
    expiresAt: memory.expiresAt ?? null,
    archivedAt: memory.archivedAt ?? null,
    deletedAt: memory.deletedAt ?? null,
    metadataJson: encodeJson(memory.metadata),
    createdAt: memory.createdAt,
    updatedAt: memory.updatedAt,
  }
}

function toJobParams(job: CompanionMemoryExtractionJob): Record<string, unknown> {
  return {
    id: job.id,
    runId: job.runId,
    sessionId: job.sessionId,
    sessionKind: job.sessionKind ?? null,
    status: job.status,
    errorCode: job.errorCode ?? null,
    errorMessage: job.errorMessage ?? null,
    createdMemoryIdsJson: encodeJson(job.createdMemoryIds) ?? '[]',
    diagnosticsJson: encodeJson(job.diagnostics),
    startedAt: job.startedAt ?? null,
    finishedAt: job.finishedAt ?? null,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  }
}

function toProposalParams(proposal: CompanionMemoryMaintenanceProposal): Record<string, unknown> {
  return {
    id: proposal.id,
    kind: proposal.kind,
    status: proposal.status,
    memoryId: proposal.memoryId ?? null,
    relatedMemoryId: proposal.relatedMemoryId ?? null,
    proposedContent: proposal.proposedContent ?? null,
    reason: proposal.reason,
    confidence: proposal.confidence,
    source: proposal.source,
    runId: proposal.runId ?? null,
    metadataJson: encodeJson(proposal.metadata),
    createdAt: proposal.createdAt,
    updatedAt: proposal.updatedAt,
  }
}

function cleanOptionalText(value: string | undefined): string | undefined {
  const text = value?.trim()
  return text || undefined
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min
  }
  return Math.min(max, Math.max(min, value))
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(Number.isFinite(value) ? value : min)))
}

function placeholders(prefix: string, values: readonly string[], params: Record<string, unknown>) {
  return values
    .map((value, index) => {
      const key = `${prefix}${index}`
      params[key] = value
      return `@${key}`
    })
    .join(', ')
}

function ftsQuery(value: string | undefined): string | undefined {
  const tokens = value
    ?.trim()
    .split(/\s+/)
    .map((token) => token.replace(/"/g, '""'))
    .filter(Boolean)
  if (!tokens?.length) {
    return undefined
  }
  return tokens.map((token) => `"${token}"`).join(' ')
}
