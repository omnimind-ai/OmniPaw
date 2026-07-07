import type { CatAppearanceEmbeddedPack } from './cat-appearance'
import type { ID, UnixMs } from './chat'

export type CompanionRoleCardImportSourceKind = 'json' | 'png' | 'webp'

export interface CompanionRoleSourceMetadata {
  kind: 'manual' | 'sillytavern-json' | 'sillytavern-png' | 'sillytavern-webp'
  version?: string
  importedAt?: UnixMs
  sourceName?: string
  mimeType?: string
  contentHash?: string
}

export interface CompanionRoleKnowledgeEntry {
  id: ID
  enabled: boolean
  title: string
  content: string
  keys: string[]
  constant: boolean
  priority: number
  order: number
  tokenBudget?: number
  createdAt?: UnixMs
  updatedAt?: UnixMs
}

export interface CompanionRoleKnowledgeEntryDraft {
  id?: ID
  enabled?: boolean
  title?: string
  content: string
  keys?: string[]
  constant?: boolean
  priority?: number
  order?: number
  tokenBudget?: number
}

export interface ImportedCompanionRoleDraft {
  name: string
  appearancePackId?: string
  userNickname?: string
  personality?: string
  speechStyle?: string
  relationship?: string
  background?: string
  greeting?: string
  alternateGreetings?: string[]
  proactiveStyle?: string
  advanced?: {
    enabled?: boolean
    systemPrompt?: string
    knowledge?: string
    exampleDialogue?: string
    finalInstructions?: string
  }
  knowledgeEntries?: CompanionRoleKnowledgeEntryDraft[]
  source?: CompanionRoleSourceMetadata
}

export interface ImportCompanionRoleCardRequest {
  content?: string
  dataBase64?: string
  sourceKind?: CompanionRoleCardImportSourceKind
  mimeType?: string
  sourceName?: string
}

export interface ImportCompanionRoleCardResponse {
  role: ImportedCompanionRoleDraft
  source: CompanionRoleSourceMetadata
  knowledgeEntryCount: number
  appearancePack?: CatAppearanceEmbeddedPack
}

export interface ExportCompanionRoleCardRequest {
  role: ImportedCompanionRoleDraft
  sourceName?: string
  appearancePack?: CatAppearanceEmbeddedPack
}

export interface ExportCompanionRoleCardPayload {
  spec: 'omnipaw_companion_role'
  specVersion: 1
  exportedAt: UnixMs
  role: ImportedCompanionRoleDraft
  appearancePack?: CatAppearanceEmbeddedPack
}

export interface ExportCompanionRoleCardResponse {
  exported: boolean
  canceled?: boolean
  destinationPath?: string
}
