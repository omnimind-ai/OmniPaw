import { createHash } from 'node:crypto'
import type {
  ChatMessageRepo,
  ChatRunRepo,
  ChatSessionRepo,
  CompanionMemoryRepo,
} from '@core/db/repos'
import type { Logger } from '@core/logging'
import type {
  ChatMessage,
  ChatRun,
  ChatSession,
  ChatSessionKind,
  ProviderRequestSnapshot,
} from '@shared/types/chat'
import type {
  CompanionMemoryContextItem,
  CompanionMemoryContextPlan,
  CompanionMemoryDeleteRequest,
  CompanionMemoryFilters,
  CompanionMemoryImportanceRequest,
  CompanionMemoryInspectResponse,
  CompanionMemoryItem,
  CompanionMemoryKind,
  CompanionMemoryListResponse,
  CompanionMemoryScope,
  CompanionMemorySearchResult,
  CreateCompanionMemoryRequest,
  DesktopMemorySettings,
  UpdateCompanionMemoryRequest,
} from '@shared/types/memory'
import { embeddingCosine, localTextEmbedding } from './local-embedding'
import type { CompanionMemoryPolicyService } from './policy'

export interface CompanionMemoryServiceOptions {
  repo: CompanionMemoryRepo
  sessions: ChatSessionRepo
  messages: ChatMessageRepo
  runs: ChatRunRepo
  policy: CompanionMemoryPolicyService
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
  query: string
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
  query: string
  resultCount: number
  results: CompanionMemoryToolSearchHit[]
  reason?: 'memory_unavailable' | 'validation' | 'not_found'
  message?: string
}

export class CompanionMemoryService {
  constructor(private readonly options: CompanionMemoryServiceOptions) {}

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

  searchForTool(request: CompanionMemoryToolSearchRequest): CompanionMemoryToolSearchResponse {
    const session = this.options.sessions.get(request.sessionId)
    const query = request.query.trim()
    if (!query) {
      return {
        ok: false,
        query,
        resultCount: 0,
        results: [],
        reason: 'validation',
        message: 'memory_search requires query.',
      }
    }
    if (!this.options.policy.canRetrieve(session)) {
      return {
        ok: false,
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

    this.options.repo.ensureEmbeddings(filters)
    const lexicalResults = this.searchForRetrieval(filters)
    const vectorResults = this.searchVectorForRetrieval(filters)
    const ranked = rankMemories(mergeRetrievalResults(lexicalResults, vectorResults), session?.kind)
    const results = ranked.slice(0, limit).map((memory) => toToolSearchHit(memory))

    this.options.logger?.debug('Companion memory tool search completed.', {
      sessionId: request.sessionId,
      sessionKind: session?.kind,
      queryHash: hashText(query),
      resultCount: results.length,
      lexicalCandidateCount: lexicalResults.length,
      vectorCandidateCount: vectorResults.length,
    })

    return {
      ok: true,
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
      const candidates = extractCandidates(messages)
      const createdIds: string[] = []
      for (const candidate of candidates) {
        const sourceText = messages.map((message) => messageText(message)).join('\n')
        const memory = this.options.repo.create({
          kind: candidate.kind,
          scope: session?.kind === 'cat' ? 'companion' : 'user',
          content: candidate.content,
          subject: candidate.subject,
          confidence: candidate.confidence,
          importance: candidate.importance,
          sessionId: run.sessionId,
          sourceRunId: run.id,
          observedAt: Date.now(),
          metadata: {
            extractor: 'heuristic-add-only',
            sessionKind: session?.kind,
          },
          sources: [
            {
              sourceKind: 'chat-turn',
              sessionId: run.sessionId,
              runId: run.id,
              messageIds: messages.map((message) => message.id),
              sourceRole: 'mixed',
              evidenceHash: hashText(sourceText),
              sourceCreatedAt: Math.min(...messages.map((message) => message.createdAt)),
            },
          ],
        })
        createdIds.push(memory.id)
      }
      this.options.repo.updateJob(job, {
        status: 'complete',
        createdMemoryIds: createdIds,
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
}

interface MemoryCandidate {
  kind: CompanionMemoryKind
  subject?: string
  content: string
  importance: number
  confidence: number
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
      content: content.trim(),
      importance: preferenceMatch || boundaryMatch ? 4 : 3,
      confidence: 0.72,
    })
  }
  return dedupeCandidates(candidates)
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
