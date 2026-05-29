import type { ChatSession, ID, UnixMs } from './chat'
import type { PersonaProfile } from './persona'

export type TavernRegistryVersion = 1
export type TavernLorebookEntryPosition = 'after-character' | 'before-history'
export type TavernContextPreset = 'default' | 'compact'

export interface TavernSourceMetadata {
  kind: 'manual' | 'sillytavern-json'
  version?: string
  importedAt?: UnixMs
  sourceName?: string
  contentHash?: string
}

export interface TavernCharacter {
  id: ID
  name: string
  description?: string
  personality?: string
  scenario?: string
  systemPrompt?: string
  postHistoryInstructions?: string
  firstMessage?: string
  alternateGreetings: string[]
  messageExamples: string[]
  tags: string[]
  defaultLorebookIds: ID[]
  enabled: boolean
  source?: TavernSourceMetadata
  createdAt: UnixMs
  updatedAt: UnixMs
}

export interface TavernLorebookEntry {
  id: ID
  enabled: boolean
  keys: string[]
  secondaryKeys: string[]
  content: string
  constant: boolean
  selective: boolean
  priority: number
  order: number
  position: TavernLorebookEntryPosition
  tokenBudget?: number
  createdAt: UnixMs
  updatedAt: UnixMs
}

export interface TavernLorebook {
  id: ID
  name: string
  description?: string
  enabled: boolean
  entries: TavernLorebookEntry[]
  source?: TavernSourceMetadata
  createdAt: UnixMs
  updatedAt: UnixMs
}

export interface TavernRegistry {
  version: TavernRegistryVersion
  characters: TavernCharacter[]
  lorebooks: TavernLorebook[]
  updatedAt: UnixMs
}

export type TavernRegistryErrorCode =
  | 'invalid_registry'
  | 'invalid_json'
  | 'unsupported_version'
  | 'save_failed'
  | 'not_found'
  | 'validation'
  | 'import_failed'
  | 'unsupported_operation'

export interface TavernRegistryValidationIssue {
  path: string
  message: string
  code?: string
}

export interface TavernRegistryOperationError {
  code: TavernRegistryErrorCode
  message: string
  path?: string
  recoverable: boolean
  issues?: TavernRegistryValidationIssue[]
}

export interface TavernRegistryStatus {
  path: string
  backupPath: string
  exists: boolean
  backupExists: boolean
  loaded: boolean
  version?: TavernRegistryVersion
  recoverable: boolean
  error?: TavernRegistryOperationError
}

export interface TavernRegistryLoadResponse {
  registry: TavernRegistry
  status: TavernRegistryStatus
}

export type TavernRegistryChangeReason =
  | 'load'
  | 'save'
  | 'import'
  | 'character'
  | 'lorebook'
  | 'session'
  | 'persona'

export interface TavernRegistryChangedEvent extends TavernRegistryLoadResponse {
  reason: TavernRegistryChangeReason
  character?: TavernCharacter
  lorebook?: TavernLorebook
}

export interface TavernRegistryMutationResult extends TavernRegistryLoadResponse {
  ok?: boolean
  character?: TavernCharacter
  lorebook?: TavernLorebook
  persona?: PersonaProfile
  session?: ChatSession
}

export interface TavernCharacterDraft {
  id?: ID
  name: string
  description?: string
  personality?: string
  scenario?: string
  systemPrompt?: string
  postHistoryInstructions?: string
  firstMessage?: string
  alternateGreetings?: string[]
  messageExamples?: string[]
  tags?: string[]
  defaultLorebookIds?: ID[]
  enabled?: boolean
}

export interface TavernLorebookEntryDraft {
  id?: ID
  enabled?: boolean
  keys: string[]
  secondaryKeys?: string[]
  content: string
  constant?: boolean
  selective?: boolean
  priority?: number
  order?: number
  position?: TavernLorebookEntryPosition
  tokenBudget?: number
}

export interface TavernLorebookDraft {
  id?: ID
  name: string
  description?: string
  enabled?: boolean
  entries?: TavernLorebookEntryDraft[]
}

export interface ImportTavernCharacterRequest {
  content: string
  sourceName?: string
}

export interface ImportTavernCharacterResult extends TavernRegistryMutationResult {
  character: TavernCharacter
  lorebooks: TavernLorebook[]
}

export interface UpdateTavernCharacterRequest {
  id: ID
  character: TavernCharacterDraft
}

export interface CreateTavernCharacterRequest {
  character: TavernCharacterDraft
}

export interface DeleteTavernCharacterRequest {
  id: ID
}

export interface SetTavernCharacterEnabledRequest {
  id: ID
  enabled: boolean
}

export interface CreateTavernLorebookRequest {
  lorebook: TavernLorebookDraft
}

export interface UpdateTavernLorebookRequest {
  id: ID
  lorebook: TavernLorebookDraft
}

export interface DeleteTavernLorebookRequest {
  id: ID
}

export interface SetTavernLorebookEnabledRequest {
  id: ID
  enabled: boolean
}

export interface ExportTavernCharacterPersonaRequest {
  characterId: ID
  includeExamples?: boolean
}

export interface TavernSessionMetadata {
  enabled: boolean
  version: 1
  characterId: ID
  characterName?: string
  lorebookIds: ID[]
  missingLorebookIds?: ID[]
  userName: string
  selectedGreetingIndex: number
  contextPreset: TavernContextPreset
  createdAt?: UnixMs
  updatedAt?: UnixMs
}

export interface TavernGreetingMessageMetadata {
  tavern: {
    greeting: true
    local: true
    characterId: ID
    selectedGreetingIndex: number
  }
}

export interface CreateTavernSessionRequest {
  characterId: ID
  title?: string
  userName?: string
  lorebookIds?: ID[]
  selectedGreetingIndex?: number
  contextPreset?: TavernContextPreset
  providerId?: ID
  modelId?: string
}

export interface UpdateTavernSessionBindingRequest {
  sessionId: ID
  characterId?: ID
  userName?: string
  lorebookIds?: ID[]
  selectedGreetingIndex?: number
  contextPreset?: TavernContextPreset
}

export interface TavernSessionOperationResult extends TavernRegistryLoadResponse {
  ok?: boolean
  session: ChatSession
  greetingReplaced?: boolean
}

export interface TavernContextUnitAccountingItem {
  id: ID
  lorebookId?: ID
  hash?: string
  estimatedTokens?: number
  droppedReason?: string
  fallbackReason?: string
}

export interface TavernRequestSnapshotMetadata {
  enabled: boolean
  characterId?: ID
  characterName?: string
  lorebookIds?: ID[]
  missingLorebookIds?: ID[]
  selectedGreetingIndex?: number
  contextPreset?: TavernContextPreset
  runProfile?: 'low-noise'
  omittedInventoryReasons?: string[]
  selectedLoreCount?: number
  droppedLoreCount?: number
  selected?: {
    character?: TavernContextUnitAccountingItem[]
    lore?: TavernContextUnitAccountingItem[]
    example?: TavernContextUnitAccountingItem[]
    postHistory?: TavernContextUnitAccountingItem[]
  }
  dropped?: {
    lore?: TavernContextUnitAccountingItem[]
    example?: TavernContextUnitAccountingItem[]
    postHistory?: TavernContextUnitAccountingItem[]
  }
  error?: {
    code: TavernRegistryErrorCode
    recoverable?: boolean
  }
}
