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

export type CompanionMemoryStatus = 'active' | 'archived' | 'deleted' | 'disabled'

export type CompanionMemorySourceKind = 'chat-turn' | 'message-window' | 'manual'

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
}

export interface CompanionMemoryListResponse {
  items: CompanionMemorySearchResult[]
  total: number
}

export interface DesktopMemorySettings {
  enabled: boolean
  extractionEnabled: boolean
  retrievalEnabled: boolean
  minConfidence: number
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
  startedAt?: UnixMs
  finishedAt?: UnixMs
  createdAt: UnixMs
  updatedAt: UnixMs
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
