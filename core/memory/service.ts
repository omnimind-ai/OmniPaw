import { createHash } from 'node:crypto'
import type {
  ChatMessageRepo,
  ChatRunRepo,
  ChatSessionRepo,
  CompanionMemoryRepo,
} from '@core/db/repos'
import type { Logger } from '@core/logging'
import type { ProviderManager } from '@core/provider/manager'
import type {
  ChatMessage,
  ChatRun,
  ChatSession,
  ChatSessionKind,
  MessageRole,
  ProviderRequestSnapshot,
} from '@shared/types/chat'
import type {
  CompanionMemoryContextItem,
  CompanionMemoryContextPlan,
  CompanionMemoryDeleteRequest,
  CompanionMemoryExtractionDiagnostics,
  CompanionMemoryFilters,
  CompanionMemoryImportanceRequest,
  CompanionMemoryInspectResponse,
  CompanionMemoryItem,
  CompanionMemoryKind,
  CompanionMemoryListResponse,
  CompanionMemoryMaintenanceProposal,
  CompanionMemoryProposalListRequest,
  CompanionMemoryScope,
  CompanionMemorySearchResult,
  CompanionMemorySemanticCandidate,
  CreateCompanionMemoryProposalRequest,
  CreateCompanionMemoryRequest,
  DesktopMemorySettings,
  UpdateCompanionMemoryProposalRequest,
  UpdateCompanionMemoryRequest,
} from '@shared/types/memory'
import { embeddingCosine, localTextEmbedding } from './local-embedding'
import type { CompanionMemoryPolicyService } from './policy'
import {
  CompanionMemorySemanticExtractor,
  cleanMemoryContent,
  SemanticExtractionError,
} from './semantic-extractor'

export interface CompanionMemoryServiceOptions {
  repo: CompanionMemoryRepo
  sessions: ChatSessionRepo
  messages: ChatMessageRepo
  runs: ChatRunRepo
  policy: CompanionMemoryPolicyService
  providers?: ProviderManager
  settings: () => DesktopMemorySettings
  saveSettings?: (settings: DesktopMemorySettings) => DesktopMemorySettings
  logger?: Logger
}

export interface CompletedRunInput {
  run: ChatRun
  session?: ChatSession
}

export interface CompanionMemoryToolSearchRequest {
  sessionId: string
  query?: string
  mode?: 'search' | 'overview'
  limit?: number
  kinds?: CompanionMemoryKind[]
  scopes?: CompanionMemoryScope[]
  minConfidence?: number
  sessionOnly?: boolean
}

export interface CompanionMemoryToolSearchHit {
  id: string
  kind: CompanionMemoryKind
  scope: CompanionMemoryScope
  subject?: string
  content: string
  importance: number
  confidence: number
  observedAt?: number
  updatedAt: number
  score: number
  source: 'lexical' | 'vector' | 'hybrid' | 'ranked'
}

export interface CompanionMemoryToolSearchResponse {
  ok: boolean
  mode: 'search' | 'overview'
  query: string
  resultCount: number
  results: CompanionMemoryToolSearchHit[]
  reason?: 'memory_unavailable' | 'validation' | 'not_found'
  message?: string
}

export class CompanionMemoryService {
  private readonly semanticExtractor?: CompanionMemorySemanticExtractor

  constructor(private readonly options: CompanionMemoryServiceOptions) {
    this.semanticExtractor = options.providers
      ? new CompanionMemorySemanticExtractor(options.providers)
      : undefined
  }

  list(filters?: CompanionMemoryFilters): CompanionMemoryListResponse {
    return this.options.repo.list(filters)
  }

  search(filters?: CompanionMemoryFilters): CompanionMemoryListResponse {
    return this.options.repo.search(filters)
  }

  inspect(memoryId: string): CompanionMemoryInspectResponse | undefined {
    return this.options.repo.inspect(memoryId)
  }

  create(request: CreateCompanionMemoryRequest): CompanionMemoryItem {
    return this.options.repo.create({
      ...request,
      status: request.status ?? 'active',
      confidence: request.confidence ?? 1,
      sources: request.sources?.length
        ? request.sources
        : [
            {
              sourceKind: 'manual',
              messageIds: [],
              evidenceHash: hashText(request.content),
            },
          ],
    })
  }

  update(request: UpdateCompanionMemoryRequest): CompanionMemoryItem | undefined {
    return this.options.repo.update(request)
  }

  archive(memoryId: string): CompanionMemoryItem | undefined {
    return this.options.repo.archive(memoryId)
  }

  delete(request: CompanionMemoryDeleteRequest | string): boolean {
    return this.options.repo.delete(request)
  }

  setImportance(request: CompanionMemoryImportanceRequest): CompanionMemoryItem | undefined {
    return this.options.repo.setImportance(request)
  }

  listProposals(request?: CompanionMemoryProposalListRequest): {
    items: CompanionMemoryMaintenanceProposal[]
    total: number
  } {
    return this.options.repo.listProposals(request)
  }

  updateProposal(
    request: UpdateCompanionMemoryProposalRequest
  ): CompanionMemoryMaintenanceProposal | undefined {
    const updated = this.options.repo.updateProposal(request)
    if (updated && updated.status === 'accepted') {
      this.applyAcceptedProposal(updated)
      return this.options.repo.updateProposal({ proposalId: updated.id, status: 'applied' })
    }
    return updated
  }

  createProposal(
    request: CreateCompanionMemoryProposalRequest
  ): CompanionMemoryMaintenanceProposal {
    return this.options.repo.createProposal(request)
  }

  getSettings(): DesktopMemorySettings {
    return this.options.settings()
  }

  updateSettings(settings: DesktopMemorySettings): DesktopMemorySettings {
    if (!this.options.saveSettings) {
      return settings
    }
    return this.options.saveSettings(settings)
  }

  canSearchForSession(sessionId: string): boolean {
    const session = this.options.sessions.get(sessionId)
    return Boolean(session && this.options.policy.canRetrieve(session))
  }

  canWriteForSession(sessionId: string): boolean {
    const session = this.options.sessions.get(sessionId)
    return Boolean(session && this.options.policy.canUseWriteTools(session))
  }

  searchForTool(request: CompanionMemoryToolSearchRequest): CompanionMemoryToolSearchResponse {
    const session = this.options.sessions.get(request.sessionId)
    const query = request.query?.trim() ?? ''
    const mode = request.mode === 'overview' || !query ? 'overview' : 'search'
    if (!this.options.policy.canRetrieve(session)) {
      return {
        ok: false,
        mode,
        query,
        resultCount: 0,
        results: [],
        reason: 'memory_unavailable',
        message: 'Companion memory retrieval is disabled or unavailable for this session.',
      }
    }

    const settings = this.options.policy.settingsSnapshot()
    const limit = clampInteger(request.limit ?? Math.min(settings.maxContextItems, 8), 1, 20)
    const minConfidence = clampNumber(request.minConfidence ?? settings.minConfidence, 0, 1)
    const searchLimit = Math.max(20, limit * 4)
    const filters = {
      query,
      sessionId: request.sessionId,
      minConfidence,
      limit: searchLimit,
      kinds: request.kinds,
      scopes: request.sessionOnly ? (['session'] as CompanionMemoryScope[]) : request.scopes,
    }

    if (mode === 'search') {
      this.options.repo.ensureEmbeddings(filters)
    }
    const lexicalResults = mode === 'search' ? this.searchForRetrieval(filters) : []
    const vectorResults = mode === 'search' ? this.searchVectorForRetrieval(filters) : []
    const ranked =
      mode === 'overview'
        ? rankMemories(
            this.options.repo.list({
              sessionId: request.sessionId,
              minConfidence,
              limit: searchLimit,
              kinds: request.kinds,
              scopes: filters.scopes,
            }).items,
            session?.kind
          )
        : rankMemories(mergeRetrievalResults(lexicalResults, vectorResults), session?.kind)
    const results = ranked.slice(0, limit).map((memory) => toToolSearchHit(memory))

    this.options.logger?.debug('Companion memory tool search completed.', {
      sessionId: request.sessionId,
      sessionKind: session?.kind,
      mode,
      queryHash: hashText(query),
      resultCount: results.length,
      lexicalCandidateCount: lexicalResults.length,
      vectorCandidateCount: vectorResults.length,
    })

    return {
      ok: true,
      mode,
      query,
      resultCount: results.length,
      results,
      reason: results.length ? undefined : 'not_found',
      message: results.length ? undefined : 'No matching companion memories found.',
    }
  }

  enqueueExtraction(input: CompletedRunInput): void {
    const run = this.options.runs.get(input.run.id) ?? input.run
    const session = input.session ?? this.options.sessions.get(run.sessionId)
    if (!this.options.policy.canExtract(session)) {
      this.options.logger?.debug('Companion memory extraction skipped by policy.', {
        runId: run.id,
        sessionId: run.sessionId,
        sessionKind: session?.kind,
      })
      return
    }

    const job = this.options.repo.createJob({
      runId: run.id,
      sessionId: run.sessionId,
      sessionKind: session?.kind,
    })
    void Promise.resolve().then(() => this.extractCompletedRun({ run, session, jobId: job.id }))
  }

  async extractCompletedRun(input: CompletedRunInput & { jobId?: string }): Promise<string[]> {
    const run = this.options.runs.get(input.run.id) ?? input.run
    const session = input.session ?? this.options.sessions.get(run.sessionId)
    const job =
      input.jobId ??
      this.options.repo.createJob({
        runId: run.id,
        sessionId: run.sessionId,
        sessionKind: session?.kind,
        status: 'running',
      }).id
    const startedAt = Date.now()

    if (run.status !== 'complete' || !this.options.policy.canExtract(session)) {
      this.options.repo.updateJob(job, {
        status: 'skipped',
        startedAt,
        finishedAt: Date.now(),
      })
      return []
    }

    this.options.repo.updateJob(job, { status: 'running', startedAt })
    try {
      const messages = this.sourceMessages(run)
      const semantic = await this.trySemanticExtraction({ run, session, messages, startedAt })
      const candidates = semantic.used ? semantic.candidates : extractCandidates(messages)
      const createdIds: string[] = []
      const seen = new Set<string>()
      for (const candidate of candidates) {
        const content = cleanMemoryContent(candidate.content)
        if (!content || seen.has(normalizeMemoryKey(content))) {
          continue
        }
        seen.add(normalizeMemoryKey(content))
        const duplicate = this.findDuplicateMemory(content, run.sessionId)
        if (duplicate) {
          if (candidate.linkedMemoryIds?.length) {
            this.linkCandidateMemory(duplicate.id, candidate, 'duplicate')
          }
          continue
        }
        const sourceText = messages.map((message) => messageText(message)).join('\n')
        const memory = this.options.repo.create({
          kind: candidate.kind,
          scope: candidate.scope ?? (session?.kind === 'cat' ? 'companion' : 'user'),
          status:
            candidate.confidence <
            this.options.policy.settingsSnapshot().lowConfidenceReviewThreshold
              ? 'pending'
              : 'active',
          content,
          subject: candidate.subject,
          confidence: candidate.confidence,
          importance: candidate.importance,
          sessionId: run.sessionId,
          sourceRunId: run.id,
          observedAt: Date.now(),
          metadata: {
            extractor: semantic.used ? 'semantic' : 'heuristic-add-only',
            sessionKind: session?.kind,
            attributedTo: candidate.attributedTo ?? 'user-stated',
            linkedMemoryIds: candidate.linkedMemoryIds,
          },
          sources: [
            {
              sourceKind: 'chat-turn',
              sessionId: run.sessionId,
              runId: run.id,
              messageIds: candidate.sourceMessageIds?.length
                ? candidate.sourceMessageIds
                : messages.map((message) => message.id),
              sourceRole: sourceRoleForCandidate(candidate, messages),
              evidenceHash: hashText(sourceText),
              sourceCreatedAt: Math.min(...messages.map((message) => message.createdAt)),
              metadata: {
                attributedTo: candidate.attributedTo ?? 'user-stated',
              },
            },
          ],
        })
        createdIds.push(memory.id)
        this.linkCandidateMemory(memory.id, candidate, 'related')
        this.runMaintenanceForMemory(memory)
      }
      this.options.repo.updateJob(job, {
        status: 'complete',
        createdMemoryIds: createdIds,
        diagnostics: {
          extractor: semantic.used ? 'semantic' : 'heuristic-fallback',
          modelId: semantic.diagnostics?.modelId,
          candidateCount: semantic.diagnostics?.candidateCount ?? candidates.length,
          acceptedCount: createdIds.length,
          rejectedCount: semantic.diagnostics?.rejectedCount ?? 0,
          hashes: createdIds.map((id) => hashText(id)),
          rejections: semantic.diagnostics?.rejections ?? [],
          fallbackReason: semantic.fallbackReason,
          durationMs: Date.now() - startedAt,
        },
        finishedAt: Date.now(),
      })
      this.options.logger?.debug('Companion memory extraction completed.', {
        runId: run.id,
        sessionId: run.sessionId,
        createdCount: createdIds.length,
      })
      return createdIds
    } catch (error) {
      const normalized = normalizeJobError(error)
      this.options.repo.updateJob(job, {
        status: 'error',
        errorCode: normalized.code,
        errorMessage: normalized.message,
        finishedAt: Date.now(),
      })
      this.options.logger?.warn('Companion memory extraction failed.', {
        runId: run.id,
        sessionId: run.sessionId,
        errorCode: normalized.code,
        error: normalized,
      })
      return []
    }
  }

  retrieveForRun(input: {
    session: ChatSession
    messages: ChatMessage[]
    currentUserMessageId: string
  }): CompanionMemoryContextPlan | undefined {
    const settings = this.options.policy.settingsSnapshot()
    const current = input.messages.find((message) => message.id === input.currentUserMessageId)
    const query = messageText(current).trim()
    const queryHash = hashText(query)
    if (!this.options.policy.canRetrieve(input.session)) {
      return {
        selected: [],
        dropped: [],
        snapshot: {
          enabled: settings.enabled,
          retrievalEnabled: settings.retrievalEnabled,
          selected: [],
          dropped: [],
          budgetTokens: settings.maxContextTokens,
          budgetItems: settings.maxContextItems,
          minConfidence: settings.minConfidence,
          strategy: 'hybrid',
          queryHash,
          lexicalCandidateCount: 0,
          vectorCandidateCount: 0,
          candidateCount: 0,
        },
      }
    }

    const searchLimit = Math.max(50, settings.maxContextItems * 4)
    this.options.repo.ensureEmbeddings({
      sessionId: input.session.id,
      minConfidence: settings.minConfidence,
    })
    const lexicalResults = this.searchForRetrieval({
      query,
      sessionId: input.session.id,
      minConfidence: settings.minConfidence,
      limit: searchLimit,
    })
    const vectorResults = this.searchVectorForRetrieval({
      query,
      sessionId: input.session.id,
      minConfidence: settings.minConfidence,
      limit: searchLimit,
    })
    const results = mergeRetrievalResults(lexicalResults, vectorResults)
    const ranked = rankMemories(results, input.session.kind)
    const selected: CompanionMemoryContextItem[] = []
    const dropped: CompanionMemoryContextItem[] = []
    let usedTokens = 0

    for (const memory of ranked) {
      const item = toContextItem(memory)
      if (
        selected.length >= settings.maxContextItems ||
        usedTokens + item.estimatedTokens > settings.maxContextTokens
      ) {
        dropped.push({ ...item, reason: 'memory_retrieval_budget' })
        continue
      }
      selected.push(item)
      usedTokens += item.estimatedTokens
    }

    const plan: CompanionMemoryContextPlan = {
      selected,
      dropped,
      snapshot: {
        enabled: settings.enabled,
        retrievalEnabled: settings.retrievalEnabled,
        selected: selected.map((item) => snapshotItem(item, true)),
        dropped: dropped.map((item) => snapshotItem(item, false)),
        budgetTokens: settings.maxContextTokens,
        budgetItems: settings.maxContextItems,
        minConfidence: settings.minConfidence,
        strategy: 'hybrid',
        queryHash,
        lexicalCandidateCount: lexicalResults.length,
        vectorCandidateCount: vectorResults.length,
        candidateCount: results.length,
      },
    }
    this.options.logger?.debug('Companion memory retrieval completed.', {
      sessionId: input.session.id,
      sessionKind: input.session.kind,
      selectedCount: selected.length,
      droppedCount: dropped.length,
      lexicalCandidateCount: lexicalResults.length,
      vectorCandidateCount: vectorResults.length,
      candidateCount: results.length,
      queryHash,
    })
    return plan
  }

  applySnapshotMemory(
    snapshot: ProviderRequestSnapshot,
    memoryContext: CompanionMemoryContextPlan | undefined
  ): ProviderRequestSnapshot {
    if (!memoryContext) {
      return snapshot
    }
    return {
      ...snapshot,
      memory: memoryContext.snapshot,
    }
  }

  private sourceMessages(run: ChatRun): ChatMessage[] {
    const messages = [
      this.options.messages.get(run.userMessageId),
      this.options.messages.get(run.assistantMessageId),
    ].filter((message): message is ChatMessage => Boolean(message))
    if (messages.length) {
      return messages
    }
    return this.options.messages.listBySession(run.sessionId).slice(-6)
  }

  private searchForRetrieval(filters: {
    query: string
    sessionId: string
    minConfidence: number
    limit: number
    kinds?: CompanionMemoryKind[]
    scopes?: CompanionMemoryScope[]
  }): CompanionMemorySearchResult[] {
    const results = new Map<string, CompanionMemorySearchResult>()
    for (const query of memorySearchQueries(filters.query)) {
      const batch = this.options.repo.search({
        query,
        sessionId: filters.sessionId,
        minConfidence: filters.minConfidence,
        limit: filters.limit,
        kinds: filters.kinds,
        scopes: filters.scopes,
      }).items
      for (const item of batch) {
        const existing = results.get(item.id)
        if (!existing || Math.abs(item.lexicalScore ?? 0) > Math.abs(existing.lexicalScore ?? 0)) {
          results.set(item.id, item)
        }
      }
      if (results.size >= filters.limit) {
        break
      }
    }
    return [...results.values()]
  }

  private searchVectorForRetrieval(filters: {
    query: string
    sessionId: string
    minConfidence: number
    limit: number
    kinds?: CompanionMemoryKind[]
    scopes?: CompanionMemoryScope[]
  }): CompanionMemorySearchResult[] {
    const queryVector = localTextEmbedding(filters.query)
    const embeddings = this.options.repo.listEmbeddings({
      sessionId: filters.sessionId,
      minConfidence: filters.minConfidence,
      limit: 1000,
      kinds: filters.kinds,
      scopes: filters.scopes,
    })
    const scored = embeddings
      .map((embedding) => ({
        embedding,
        vectorScore: embeddingCosine(queryVector, embedding.vector),
      }))
      .filter((item) => item.vectorScore > 0.03)
      .sort(
        (left, right) =>
          right.vectorScore - left.vectorScore ||
          right.embedding.updatedAt - left.embedding.updatedAt ||
          left.embedding.memoryId.localeCompare(right.embedding.memoryId)
      )
      .slice(0, filters.limit)

    const results: CompanionMemorySearchResult[] = []
    for (const item of scored) {
      const memory = this.options.repo.get(item.embedding.memoryId)
      if (!memory || memory.status !== 'active' || memory.confidence < filters.minConfidence) {
        continue
      }
      results.push({
        ...memory,
        vectorScore: item.vectorScore,
        retrievalSource: 'vector',
      })
    }
    return results
  }

  private async trySemanticExtraction(input: {
    run: ChatRun
    session?: ChatSession
    messages: ChatMessage[]
    startedAt: number
  }): Promise<{
    used: boolean
    candidates: CompanionMemorySemanticCandidate[]
    diagnostics?: CompanionMemoryExtractionDiagnostics
    fallbackReason?: string
  }> {
    const settings = this.options.policy.settingsSnapshot()
    if (!settings.semanticExtractionEnabled) {
      return { used: false, candidates: [], fallbackReason: 'semantic_extraction_disabled' }
    }
    if (!this.semanticExtractor) {
      return { used: false, candidates: [], fallbackReason: 'provider_unavailable' }
    }
    try {
      const result = await this.semanticExtractor.extract({
        run: input.run,
        session: input.session,
        messages: input.messages,
        observationDate: new Date(input.startedAt),
      })
      return {
        used: true,
        candidates: result.candidates,
        diagnostics: result.diagnostics,
      }
    } catch (error) {
      const fallbackReason =
        error instanceof SemanticExtractionError ? error.code : 'semantic_extraction_failed'
      this.options.logger?.warn('Companion semantic memory extraction fell back.', {
        runId: input.run.id,
        sessionId: input.run.sessionId,
        fallbackReason,
      })
      return { used: false, candidates: [], fallbackReason }
    }
  }

  private findDuplicateMemory(content: string, sessionId: string): CompanionMemoryItem | undefined {
    const key = normalizeMemoryKey(content)
    return this.options.repo
      .list({ sessionId, includeInactive: true, limit: 500 })
      .items.find((item) => normalizeMemoryKey(item.content) === key && item.status !== 'deleted')
  }

  private linkCandidateMemory(
    memoryId: string,
    candidate: Pick<CompanionMemorySemanticCandidate, 'linkedMemoryIds' | 'confidence'>,
    relation: 'related' | 'duplicate'
  ): void {
    for (const linkedMemoryId of candidate.linkedMemoryIds ?? []) {
      if (linkedMemoryId === memoryId || !this.options.repo.get(linkedMemoryId)) {
        continue
      }
      this.options.repo.addLink({
        memoryId,
        linkedMemoryId,
        relation,
        confidence: candidate.confidence,
      })
    }
  }

  private runMaintenanceForMemory(memory: CompanionMemoryItem): void {
    const settings = this.options.policy.settingsSnapshot()
    if (!settings.maintenanceEnabled) {
      return
    }
    try {
      const related = this.findRelatedMemories(memory)
      for (const item of related.slice(0, 3)) {
        this.options.repo.addLink({
          memoryId: memory.id,
          linkedMemoryId: item.id,
          relation: item.relation,
          confidence: item.score,
          metadata: { maintenance: 'token-overlap' },
        })
        if (item.relation === 'conflicts') {
          this.options.repo.createProposal({
            kind: 'review',
            memoryId: memory.id,
            relatedMemoryId: item.id,
            reason: 'Possible conflict with an existing memory.',
            confidence: item.score,
            source: 'maintenance',
          })
        }
      }
      if (memory.kind === 'plan' && memory.expiresAt && memory.expiresAt < Date.now()) {
        this.options.repo.createProposal({
          kind: 'archive',
          memoryId: memory.id,
          reason: 'Plan memory appears stale because its expiry date has passed.',
          confidence: 0.85,
          source: 'maintenance',
        })
      }
      if (memory.status === 'pending') {
        this.options.repo.createProposal({
          kind: 'review',
          memoryId: memory.id,
          proposedContent: memory.content,
          reason: 'Low confidence memory candidate requires review.',
          confidence: memory.confidence,
          source: 'maintenance',
        })
      }
    } catch (error) {
      this.options.logger?.warn('Companion memory maintenance failed.', {
        memoryId: memory.id,
        errorCode: error instanceof Error ? 'maintenance_failed' : 'unknown',
      })
    }
  }

  private findRelatedMemories(
    memory: CompanionMemoryItem
  ): Array<{ id: string; relation: 'related' | 'conflicts'; score: number }> {
    const memoryTokens = memoryTokensFor(memory.content)
    if (!memoryTokens.size) {
      return []
    }
    return this.options.repo
      .list({ sessionId: memory.sessionId, includeInactive: true, limit: 500 })
      .items.filter((item) => item.id !== memory.id && item.status !== 'deleted')
      .map((item) => {
        const tokens = memoryTokensFor(item.content)
        const overlap = [...memoryTokens].filter((token) => tokens.has(token)).length
        const score = overlap / Math.max(1, Math.min(memoryTokens.size, tokens.size))
        const sameSubject = Boolean(
          memory.subject && item.subject && memory.subject === item.subject
        )
        const relation: 'related' | 'conflicts' =
          sameSubject &&
          memory.kind === item.kind &&
          normalizeMemoryKey(memory.content) !== normalizeMemoryKey(item.content)
            ? 'conflicts'
            : 'related'
        return { id: item.id, relation, score }
      })
      .filter((item) => item.score >= 0.45)
      .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id))
  }

  private applyAcceptedProposal(proposal: CompanionMemoryMaintenanceProposal): void {
    if (!proposal.memoryId) {
      return
    }
    if (proposal.kind === 'archive') {
      this.archive(proposal.memoryId)
      return
    }
    if (proposal.kind === 'delete') {
      this.delete({ memoryId: proposal.memoryId })
      return
    }
    if ((proposal.kind === 'update' || proposal.kind === 'merge') && proposal.proposedContent) {
      this.update({ memoryId: proposal.memoryId, content: proposal.proposedContent })
    }
  }
}

interface MemoryCandidate {
  kind: CompanionMemoryKind
  scope?: CompanionMemoryScope
  subject?: string
  content: string
  importance: number
  confidence: number
  sourceMessageIds?: string[]
  attributedTo?: 'user-stated' | 'assistant-provided' | 'mixed'
  linkedMemoryIds?: string[]
}

function extractCandidates(messages: ChatMessage[]): MemoryCandidate[] {
  const candidates: MemoryCandidate[] = []
  const userText = messages
    .filter((message) => message.role === 'user')
    .map((message) => messageText(message))
    .join('\n')
  for (const line of userText.split(/\n+/)) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const rememberMatch = trimmed.match(
      /(?:remember that|please remember|记住|请记住|记得)[:：]?\s*(.+)$/i
    )
    const preferenceMatch = trimmed.match(
      /(?:i prefer|i like|我喜欢|我偏好|我的偏好是)[:：]?\s*(.+)$/i
    )
    const boundaryMatch = trimmed.match(/(?:do not|don't|不要|别)[:：]?\s*(.+)$/i)
    const planMatch = trimmed.match(/(?:remind me|计划|待办|promise|承诺)[:：]?\s*(.+)$/i)
    const content =
      rememberMatch?.[1] ?? preferenceMatch?.[1] ?? boundaryMatch?.[1] ?? planMatch?.[1]
    if (!content || content.trim().length < 3) {
      continue
    }
    candidates.push({
      kind: preferenceMatch
        ? 'preference'
        : boundaryMatch
          ? 'boundary'
          : planMatch
            ? 'plan'
            : 'fact',
      content: cleanMemoryContent(content),
      importance: preferenceMatch || boundaryMatch ? 4 : 3,
      confidence: 0.72,
      sourceMessageIds: messages
        .filter((message) => message.role === 'user')
        .map((message) => message.id),
      attributedTo: 'user-stated',
    })
  }
  return dedupeCandidates(candidates)
}

function sourceRoleForCandidate(
  candidate: Pick<MemoryCandidate, 'sourceMessageIds'>,
  messages: ChatMessage[]
): MessageRole | 'mixed' {
  const ids = new Set(candidate.sourceMessageIds ?? [])
  const roles = new Set(
    messages.filter((message) => ids.has(message.id)).map((message) => message.role)
  )
  if (roles.size === 1) {
    return [...roles][0] ?? 'mixed'
  }
  return 'mixed'
}

function normalizeMemoryKey(content: string): string {
  return content.toLowerCase().replace(/\s+/g, ' ').trim()
}

function memoryTokensFor(content: string): Set<string> {
  return new Set(
    content
      .toLowerCase()
      .split(/[^\p{L}\p{N}_]+/u)
      .map((token) => token.trim())
      .filter((token) => token.length >= 2 && !retrievalStopwords.has(token))
      .slice(0, 80)
  )
}

function dedupeCandidates(candidates: MemoryCandidate[]): MemoryCandidate[] {
  const seen = new Set<string>()
  const result: MemoryCandidate[] = []
  for (const candidate of candidates) {
    const key = `${candidate.kind}:${candidate.content.toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)
    result.push(candidate)
  }
  return result.slice(0, 8)
}

const retrievalStopwords = new Set([
  'a',
  'an',
  'and',
  'are',
  'be',
  'for',
  'how',
  'or',
  'should',
  'the',
  'to',
  'we',
  'what',
  'with',
  '吗',
  '呢',
  '了',
  '的',
  '怎么',
])

function memorySearchQueries(query: string): string[] {
  const trimmed = query.trim()
  const tokens = trimmed
    .toLowerCase()
    .split(/[^\p{L}\p{N}_]+/u)
    .map((token) => normalizeRetrievalToken(token))
    .filter((token) => token.length >= 2 && !retrievalStopwords.has(token))

  const uniqueTokens = [...new Set(tokens)].slice(0, 8)
  return [...new Set([trimmed, ...uniqueTokens.filter((token) => token.length >= 3)])].filter(
    Boolean
  )
}

function normalizeRetrievalToken(token: string): string {
  if (token.length > 4 && token.endsWith('s')) {
    return token.slice(0, -1)
  }
  return token
}

function mergeRetrievalResults(
  lexicalResults: CompanionMemorySearchResult[],
  vectorResults: CompanionMemorySearchResult[]
): CompanionMemorySearchResult[] {
  const results = new Map<string, CompanionMemorySearchResult>()
  for (const memory of lexicalResults) {
    results.set(memory.id, {
      ...memory,
      retrievalSource: 'lexical',
    })
  }
  for (const memory of vectorResults) {
    const existing = results.get(memory.id)
    if (!existing) {
      results.set(memory.id, memory)
      continue
    }
    results.set(memory.id, {
      ...existing,
      vectorScore: Math.max(existing.vectorScore ?? 0, memory.vectorScore ?? 0),
      retrievalSource: 'hybrid',
    })
  }
  return [...results.values()]
}

function rankMemories(
  memories: CompanionMemorySearchResult[],
  sessionKind: ChatSessionKind | undefined
): CompanionMemorySearchResult[] {
  const now = Date.now()
  return [...memories]
    .map((memory) => {
      const ageDays = Math.max(0, (now - memory.updatedAt) / 86_400_000)
      const recency = Math.max(0, 10 - ageDays / 7)
      const lexical = Math.abs(memory.lexicalScore ?? 0)
      const vector = Math.max(0, memory.vectorScore ?? 0)
      const companionBoost = sessionKind === 'cat' && memory.scope === 'companion' ? 8 : 0
      return {
        ...memory,
        retrievalScore:
          memory.importance * 12 +
          memory.confidence * 20 +
          vector * 35 +
          recency +
          companionBoost -
          lexical,
      }
    })
    .sort(
      (left, right) =>
        (right.retrievalScore ?? 0) - (left.retrievalScore ?? 0) ||
        right.importance - left.importance ||
        right.updatedAt - left.updatedAt ||
        left.id.localeCompare(right.id)
    )
}

function toContextItem(memory: CompanionMemorySearchResult): CompanionMemoryContextItem {
  const content = memory.content.trim()
  return {
    id: memory.id,
    kind: memory.kind,
    scope: memory.scope,
    content,
    importance: memory.importance,
    confidence: memory.confidence,
    hash: hashText(content),
    estimatedTokens: estimateTextTokens(content),
    score: memory.retrievalScore ?? 0,
    reason: memory.retrievalSource
      ? `${memory.retrievalSource}_memory_match`
      : 'ranked_memory_match',
  }
}

function toToolSearchHit(memory: CompanionMemorySearchResult): CompanionMemoryToolSearchHit {
  return {
    id: memory.id,
    kind: memory.kind,
    scope: memory.scope,
    subject: memory.subject,
    content: memory.content.trim(),
    importance: memory.importance,
    confidence: memory.confidence,
    observedAt: memory.observedAt,
    updatedAt: memory.updatedAt,
    score: memory.retrievalScore ?? 0,
    source: memory.retrievalSource ?? 'ranked',
  }
}

function snapshotItem(item: CompanionMemoryContextItem, selected: boolean) {
  return {
    id: item.id,
    kind: item.kind,
    hash: item.hash,
    estimatedTokens: item.estimatedTokens,
    selected,
    reason: item.reason,
  }
}

function messageText(message: ChatMessage | undefined): string {
  if (!message) {
    return ''
  }
  return message.parts
    .map((part) => {
      if (part && typeof part === 'object' && part.type === 'plain') {
        return String((part as { text?: unknown }).text ?? '')
      }
      return ''
    })
    .filter(Boolean)
    .join('\n')
}

function hashText(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 24)
}

function estimateTextTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4))
}

function clampInteger(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min
  }
  return Math.max(min, Math.min(Math.round(value), max))
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min
  }
  return Math.max(min, Math.min(value, max))
}

function normalizeJobError(error: unknown): { code: string; message: string } {
  if (error instanceof Error) {
    return {
      code: 'extraction_failed',
      message: error.message,
    }
  }
  return {
    code: 'extraction_failed',
    message: 'Memory extraction failed.',
  }
}
