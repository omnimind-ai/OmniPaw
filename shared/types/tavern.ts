import type { ChatSession, ID, UnixMs } from './chat'
import type { PersonaProfile } from './persona'

export type TavernRegistryVersion = 2
export type TavernPromptRecordVersion = 1
export type TavernUserProfileVersion = 1
export type TavernLorebookEntryPosition = 'after-character' | 'before-history' | 'after-history'
export type TavernPromptSlotPlacement = 'main' | 'final'
export type TavernContextPreset = 'default' | 'compact'

export interface TavernSourceMetadata {
  kind: 'manual' | 'sillytavern-json' | 'sillytavern-png' | 'sillytavern-webp'
  version?: string
  importedAt?: UnixMs
  sourceName?: string
  mimeType?: string
  contentHash?: string
}

export interface TavernPromptSlot {
  id: ID
  label: string
  placement: TavernPromptSlotPlacement
  text: string
  enabled: boolean
  order: number
  createdAt: UnixMs
  updatedAt: UnixMs
}

export interface TavernPromptPreset {
  id: ID
  name: string
  description?: string
  enabled: boolean
  slots: TavernPromptSlot[]
  version: TavernPromptRecordVersion
  contentHash: string
  createdAt: UnixMs
  updatedAt: UnixMs
}

export interface TavernUserProfileSource {
  kind: 'manual' | 'persona-copy'
  personaId?: ID
  copiedAt?: UnixMs
}

export interface TavernUserProfile {
  id: ID
  name: string
  description: string
  enabled: boolean
  version: TavernUserProfileVersion
  contentHash: string
  source?: TavernUserProfileSource
  createdAt: UnixMs
  updatedAt: UnixMs
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
  promptPresets: TavernPromptPreset[]
  userProfiles: TavernUserProfile[]
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
  | 'unsupported_metadata'
  | 'invalid_metadata'
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
  | 'prompt-preset'
  | 'user-profile'
  | 'preview'
  | 'session'
  | 'persona'

export interface TavernRegistryChangedEvent extends TavernRegistryLoadResponse {
  reason: TavernRegistryChangeReason
  character?: TavernCharacter
  lorebook?: TavernLorebook
  promptPreset?: TavernPromptPreset
  userProfile?: TavernUserProfile
}

export interface TavernRegistryMutationResult extends TavernRegistryLoadResponse {
  ok?: boolean
  character?: TavernCharacter
  lorebook?: TavernLorebook
  promptPreset?: TavernPromptPreset
  userProfile?: TavernUserProfile
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

export interface TavernPromptSlotDraft {
  id?: ID
  label?: string
  placement: TavernPromptSlotPlacement
  text: string
  enabled?: boolean
  order?: number
}

export interface TavernPromptPresetDraft {
  id?: ID
  name: string
  description?: string
  enabled?: boolean
  slots?: TavernPromptSlotDraft[]
}

export interface TavernUserProfileDraft {
  id?: ID
  name: string
  description: string
  enabled?: boolean
}

export interface ImportTavernCharacterRequest {
  content?: string
  dataBase64?: string
  sourceKind?: 'json' | 'png' | 'webp'
  mimeType?: string
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

export interface CreateTavernPromptPresetRequest {
  preset: TavernPromptPresetDraft
}

export interface UpdateTavernPromptPresetRequest {
  id: ID
  preset: TavernPromptPresetDraft
}

export interface DeleteTavernPromptPresetRequest {
  id: ID
}

export interface SetTavernPromptPresetEnabledRequest {
  id: ID
  enabled: boolean
}

export interface CreateTavernUserProfileRequest {
  profile: TavernUserProfileDraft
}

export interface UpdateTavernUserProfileRequest {
  id: ID
  profile: TavernUserProfileDraft
}

export interface DeleteTavernUserProfileRequest {
  id: ID
}

export interface SetTavernUserProfileEnabledRequest {
  id: ID
  enabled: boolean
}

export interface CopyPersonaToTavernUserProfileRequest {
  personaId: ID
  name?: string
}

export interface TavernLoreSettings {
  scanDepth: number
  loreBudget: number
}

export interface TavernSessionMetadata {
  enabled: boolean
  version: 1
  characterId: ID
  characterName?: string
  lorebookIds: ID[]
  missingLorebookIds?: ID[]
  promptPresetId?: ID
  missingPromptPresetId?: ID
  userProfileId?: ID
  missingUserProfileId?: ID
  userDescriptionSnapshot?: string
  userName: string
  selectedGreetingIndex: number
  contextPreset: TavernContextPreset
  loreSettings: TavernLoreSettings
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
  promptPresetId?: ID
  userProfileId?: ID
  userDescriptionSnapshot?: string
  loreSettings?: Partial<TavernLoreSettings>
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
  promptPresetId?: ID | null
  userProfileId?: ID | null
  userDescriptionSnapshot?: string
  loreSettings?: Partial<TavernLoreSettings>
}

export interface TavernSessionOperationResult extends TavernRegistryLoadResponse {
  ok?: boolean
  session: ChatSession
  greetingReplaced?: boolean
}

export interface TavernContextUnitAccountingItem {
  id: ID
  lorebookId?: ID
  promptPresetId?: ID
  promptSlotId?: ID
  userProfileId?: ID
  placement?: TavernPromptSlotPlacement | TavernLorebookEntryPosition
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
  promptPresetId?: ID
  missingPromptPresetId?: ID
  userProfileId?: ID
  missingUserProfileId?: ID
  userDescriptionSnapshotHash?: string
  loreSettings?: TavernLoreSettings
  selectedGreetingIndex?: number
  contextPreset?: TavernContextPreset
  runProfile?: 'low-noise'
  omittedInventoryReasons?: string[]
  selectedLoreCount?: number
  droppedLoreCount?: number
  selected?: {
    promptPreset?: TavernContextUnitAccountingItem[]
    character?: TavernContextUnitAccountingItem[]
    lore?: TavernContextUnitAccountingItem[]
    example?: TavernContextUnitAccountingItem[]
    postHistory?: TavernContextUnitAccountingItem[]
  }
  dropped?: {
    promptPreset?: TavernContextUnitAccountingItem[]
    lore?: TavernContextUnitAccountingItem[]
    example?: TavernContextUnitAccountingItem[]
    postHistory?: TavernContextUnitAccountingItem[]
  }
  error?: {
    code: TavernRegistryErrorCode
    recoverable?: boolean
  }
}

export type TavernPromptPreviewSectionKind =
  | 'base-system'
  | 'prompt-preset'
  | 'character'
  | 'lore'
  | 'example'
  | 'history'
  | 'current-input'
  | 'final'

export interface TavernPromptPreviewSection {
  id: ID
  kind: TavernPromptPreviewSectionKind
  title: string
  text: string
  estimatedTokens: number
  sourceId?: ID
  placement?: TavernPromptSlotPlacement | TavernLorebookEntryPosition
  hash: string
}

export interface TavernPromptPreviewRequest {
  sessionId: ID
  currentInput?: string
}

export interface TavernPromptPreviewResult {
  ok: boolean
  sessionId: ID
  generatedAt: UnixMs
  characterId?: ID
  promptPresetId?: ID
  userProfileId?: ID
  missingLorebookIds: ID[]
  missingPromptPresetId?: ID
  missingUserProfileId?: ID
  loreSettings: TavernLoreSettings
  sections: TavernPromptPreviewSection[]
  snapshot: TavernRequestSnapshotMetadata
}
