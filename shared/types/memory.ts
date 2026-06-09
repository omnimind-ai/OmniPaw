import type { ChatSessionKind, ID, MessageRole, UnixMs } from './chat'

export type CompanionMemoryKind =
  | 'profile'
  | 'preference'
  | 'relationship'
  | 'episode'
  | 'plan'
  | 'boundary'
  | 'fact'

export type CompanionMemoryScope = 'global' | 'user' | 'companion' | 'session' | 'character'

export type CompanionMemoryStatus = 'active' | 'pending' | 'archived' | 'deleted' | 'disabled'

export type CompanionMemorySourceKind =
  | 'chat-turn'
  | 'message-window'
  | 'manual'
  | 'tool'
  | 'manual-intent'

export type CompanionMemoryAttribution = 'user-stated' | 'assistant-provided' | 'mixed'

export type CompanionMemoryExtractionMethod = 'semantic' | 'heuristic-fallback' | 'manual' | 'tool'

export interface CompanionMemoryLink {
  id: ID
  memoryId: ID
  linkedMemoryId: ID
  relation: 'related' | 'duplicate' | 'conflicts' | 'supports' | 'supersedes'
  confidence: number
  metadata?: Record<string, unknown>
  createdAt: UnixMs
}

export type CompanionMemoryProposalKind = 'update' | 'merge' | 'archive' | 'delete' | 'review'

export type CompanionMemoryProposalStatus = 'pending' | 'accepted' | 'ignored' | 'applied'

export interface CompanionMemoryMaintenanceProposal {
  id: ID
  kind: CompanionMemoryProposalKind
  status: CompanionMemoryProposalStatus
  memoryId?: ID
  relatedMemoryId?: ID
  proposedContent?: string
  reason: string
  confidence: number
  source: 'maintenance' | 'tool'
  runId?: ID
  metadata?: Record<string, unknown>
  createdAt: UnixMs
  updatedAt: UnixMs
}

export interface CompanionMemorySemanticCandidate {
  kind: CompanionMemoryKind
  scope?: CompanionMemoryScope
  subject?: string
  content: string
  importance: number
  confidence: number
  sourceMessageIds: ID[]
  attributedTo: CompanionMemoryAttribution
  expiresAt?: UnixMs
  linkedMemoryIds?: ID[]
  metadata?: Record<string, unknown>
}

export interface CompanionMemoryCandidateRejection {
  index: number
  reason: string
  hash?: string
}

export interface CompanionMemoryExtractionDiagnostics {
  extractor: CompanionMemoryExtractionMethod
  modelId?: string
  candidateCount: number
  acceptedCount: number
  rejectedCount: number
  hashes: string[]
  rejections: CompanionMemoryCandidateRejection[]
  fallbackReason?: string
  durationMs?: number
}

export interface CompanionMemoryItem {
  id: ID
  kind: CompanionMemoryKind
  scope: CompanionMemoryScope
  status: CompanionMemoryStatus
  subject?: string
  content: string
  importance: number
  confidence: number
  userId?: ID
  characterId?: ID
  sessionId?: ID
  sourceRunId?: ID
  observedAt?: UnixMs
  expiresAt?: UnixMs
  archivedAt?: UnixMs
  deletedAt?: UnixMs
  metadata?: Record<string, unknown>
  linkedMemoryIds?: ID[]
  attribution?: CompanionMemoryAttribution
  extractionMethod?: CompanionMemoryExtractionMethod
  createdAt: UnixMs
  updatedAt: UnixMs
}

export interface CompanionMemorySourceEvidence {
  id: ID
  memoryId: ID
  sourceKind: CompanionMemorySourceKind
  sessionId?: ID
  runId?: ID
  messageIds: ID[]
  sourceRole?: MessageRole | 'mixed'
  evidenceHash: string
  sourceCreatedAt?: UnixMs
  metadata?: Record<string, unknown>
  createdAt: UnixMs
}

export interface CompanionMemorySearchResult extends CompanionMemoryItem {
  retrievalScore?: number
  lexicalScore?: number
  vectorScore?: number
  retrievalSource?: 'lexical' | 'vector' | 'hybrid'
}

export interface CompanionMemoryFilters {
  query?: string
  kinds?: CompanionMemoryKind[]
  scopes?: CompanionMemoryScope[]
  statuses?: CompanionMemoryStatus[]
  sessionId?: ID
  characterId?: ID
  userId?: ID
  includeInactive?: boolean
  minConfidence?: number
  limit?: number
  offset?: number
}

export interface CreateCompanionMemoryRequest {
  kind: CompanionMemoryKind
  scope?: CompanionMemoryScope
  status?: CompanionMemoryStatus
  subject?: string
  content: string
  importance?: number
  confidence?: number
  userId?: ID
  characterId?: ID
  sessionId?: ID
  sourceRunId?: ID
  observedAt?: UnixMs
  expiresAt?: UnixMs
  metadata?: Record<string, unknown>
  sources?: Array<
    Omit<CompanionMemorySourceEvidence, 'id' | 'memoryId' | 'createdAt'> & {
      id?: ID
      memoryId?: ID
      createdAt?: UnixMs
    }
  >
}

export interface UpdateCompanionMemoryRequest {
  memoryId: ID
  kind?: CompanionMemoryKind
  scope?: CompanionMemoryScope
  status?: CompanionMemoryStatus
  subject?: string
  content?: string
  importance?: number
  confidence?: number
  userId?: ID
  characterId?: ID
  sessionId?: ID
  expiresAt?: UnixMs | null
  metadata?: Record<string, unknown>
}

export interface CompanionMemoryImportanceRequest {
  memoryId: ID
  importance: number
}

export interface CompanionMemoryDeleteRequest {
  memoryId: ID
  hardDelete?: boolean
}

export interface CompanionMemoryInspectResponse {
  memory: CompanionMemoryItem
  sources: CompanionMemorySourceEvidence[]
  links?: CompanionMemoryLink[]
  proposals?: CompanionMemoryMaintenanceProposal[]
}

export interface CompanionMemoryListResponse {
  items: CompanionMemorySearchResult[]
  total: number
}

export interface DesktopMemorySettings {
  enabled: boolean
  extractionEnabled: boolean
  semanticExtractionEnabled: boolean
  retrievalEnabled: boolean
  activeToolWriteEnabled: boolean
  maintenanceEnabled: boolean
  destructiveToolRequiresConfirmation: boolean
  minConfidence: number
  lowConfidenceReviewThreshold: number
  maxContextItems: number
  maxContextTokens: number
}

export interface CompanionMemorySettingsRequest {
  settings: DesktopMemorySettings
}

export interface CompanionMemoryExtractionJob {
  id: ID
  runId: ID
  sessionId: ID
  sessionKind?: ChatSessionKind
  status: 'queued' | 'running' | 'complete' | 'error' | 'skipped'
  errorCode?: string
  errorMessage?: string
  createdMemoryIds: ID[]
  diagnostics?: CompanionMemoryExtractionDiagnostics
  startedAt?: UnixMs
  finishedAt?: UnixMs
  createdAt: UnixMs
  updatedAt: UnixMs
}

export interface CreateCompanionMemoryProposalRequest {
  kind: CompanionMemoryProposalKind
  memoryId?: ID
  relatedMemoryId?: ID
  proposedContent?: string
  reason: string
  confidence?: number
  source?: CompanionMemoryMaintenanceProposal['source']
  runId?: ID
  metadata?: Record<string, unknown>
}

export interface UpdateCompanionMemoryProposalRequest {
  proposalId: ID
  status?: CompanionMemoryProposalStatus
  proposedContent?: string
  metadata?: Record<string, unknown>
}

export interface CompanionMemoryProposalListRequest {
  status?: CompanionMemoryProposalStatus
  memoryId?: ID
  limit?: number
}

export interface CompanionMemorySnapshotItem {
  id: ID
  kind: CompanionMemoryKind
  hash?: string
  estimatedTokens?: number
  selected: boolean
  reason?: string
}

export interface CompanionMemoryRequestSnapshot {
  enabled: boolean
  retrievalEnabled: boolean
  selected: CompanionMemorySnapshotItem[]
  dropped: CompanionMemorySnapshotItem[]
  budgetTokens: number
  budgetItems: number
  minConfidence: number
  strategy?: 'lexical' | 'vector' | 'hybrid'
  queryHash?: string
  lexicalCandidateCount?: number
  vectorCandidateCount?: number
  candidateCount?: number
}

export interface CompanionMemoryContextItem {
  id: ID
  kind: CompanionMemoryKind
  scope: CompanionMemoryScope
  content: string
  importance: number
  confidence: number
  hash: string
  estimatedTokens: number
  score: number
  reason: string
}

export interface CompanionMemoryContextPlan {
  selected: CompanionMemoryContextItem[]
  dropped: CompanionMemoryContextItem[]
  snapshot: CompanionMemoryRequestSnapshot
}

export interface CompanionMemoryLocalEmbedding {
  memoryId: ID
  provider: string
  model: string
  dimension: number
  contentHash: string
  vector: number[]
  createdAt: UnixMs
  updatedAt: UnixMs
}
