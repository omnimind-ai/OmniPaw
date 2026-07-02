import type { Logger } from '@core/logging'
import type {
  CreateTavernCharacterRequest,
  CreateTavernLorebookRequest,
  CreateTavernPromptPresetRequest,
  CreateTavernUserProfileRequest,
  DeleteTavernCharacterRequest,
  DeleteTavernLorebookRequest,
  DeleteTavernPromptPresetRequest,
  DeleteTavernUserProfileRequest,
  ImportTavernCharacterRequest,
  ImportTavernCharacterResult,
  SetTavernCharacterEnabledRequest,
  SetTavernLorebookEnabledRequest,
  SetTavernPromptPresetEnabledRequest,
  SetTavernUserProfileEnabledRequest,
  TavernCharacter,
  TavernCharacterDraft,
  TavernLorebook,
  TavernLorebookDraft,
  TavernLorebookEntry,
  TavernLorebookEntryDraft,
  TavernPromptPreset,
  TavernPromptPresetDraft,
  TavernPromptSlot,
  TavernPromptSlotDraft,
  TavernRegistry,
  TavernRegistryChangeReason,
  TavernRegistryLoadResponse,
  TavernRegistryMutationResult,
  TavernRegistryStatus,
  TavernUserProfile,
  TavernUserProfileDraft,
  UpdateTavernCharacterRequest,
  UpdateTavernLorebookRequest,
  UpdateTavernPromptPresetRequest,
  UpdateTavernUserProfileRequest,
} from '@shared/types/tavern'
import { parseSillyTavernCharacterImport } from './importer'
import {
  sanitizeTavernRegistry,
  TavernRegistryValidationError,
  tavernRegistryError,
} from './registry-schema'
import type { TavernRegistryStore } from './registry-store'
import { hashSensitiveText } from './template'

export interface TavernManagerOptions {
  registryStore: TavernRegistryStore
  logger?: Logger
}

export class TavernManager {
  private readonly registryStore: TavernRegistryStore
  private readonly logger?: Logger

  constructor(options: TavernManagerOptions) {
    this.registryStore = options.registryStore
    this.logger = options.logger
  }

  load(): TavernRegistryLoadResponse {
    const registry = this.registryStore.load()
    return this.loadResult(registry)
  }

  list(): TavernRegistryLoadResponse {
    const registry = this.registryStore.get()
    return this.loadResult(registry)
  }

  status(): TavernRegistryStatus {
    return this.registryStore.status()
  }

  getCharacter(characterId: string): TavernCharacter | undefined {
    return this.registryStore.get().characters.find((character) => character.id === characterId)
  }

  getLorebook(lorebookId: string): TavernLorebook | undefined {
    return this.registryStore.get().lorebooks.find((lorebook) => lorebook.id === lorebookId)
  }

  getLorebooks(lorebookIds: readonly string[]): TavernLorebook[] {
    const wanted = new Set(lorebookIds)
    return this.registryStore.get().lorebooks.filter((lorebook) => wanted.has(lorebook.id))
  }

  getPromptPreset(presetId: string | undefined): TavernPromptPreset | undefined {
    return presetId
      ? this.registryStore.get().promptPresets.find((preset) => preset.id === presetId)
      : undefined
  }

  getUserProfile(profileId: string | undefined): TavernUserProfile | undefined {
    return profileId
      ? this.registryStore.get().userProfiles.find((profile) => profile.id === profileId)
      : undefined
  }

  importCharacter(request: ImportTavernCharacterRequest): ImportTavernCharacterResult {
    const parsed = parseSillyTavernCharacterImport(request)
    const registry = this.registryStore.get()
    const now = Date.now()
    const createdLorebooks = parsed.lorebooks.map((draft) =>
      createLorebookRecord(draft, registry, now, parsed.source)
    )
    const character = createCharacterRecord(
      {
        ...parsed.character,
        defaultLorebookIds: createdLorebooks.map((lorebook) => lorebook.id),
      },
      {
        ...registry,
        lorebooks: [...registry.lorebooks, ...createdLorebooks],
      },
      now,
      parsed.source
    )
    const saved = this.registryStore.save({
      ...registry,
      characters: [...registry.characters, character],
      lorebooks: [...registry.lorebooks, ...createdLorebooks],
      updatedAt: now,
    })
    this.logger?.info('Tavern character imported.', {
      characterId: character.id,
      lorebookCount: createdLorebooks.length,
      sourceKind: parsed.source.kind,
    })
    return {
      ok: true,
      registry: sanitizeTavernRegistry(saved),
      status: this.registryStore.status(),
      character: { ...character },
      lorebooks: createdLorebooks.map((lorebook) => ({ ...lorebook })),
    }
  }

  createCharacter(request: CreateTavernCharacterRequest): TavernRegistryMutationResult {
    const registry = this.registryStore.get()
    const now = Date.now()
    const character = createCharacterRecord(request.character, registry, now)
    const saved = this.registryStore.save({
      ...registry,
      characters: [...registry.characters, character],
      updatedAt: now,
    })
    this.logger?.info('Tavern character created.', { characterId: character.id })
    return this.mutationResult(saved, 'character', { character })
  }

  updateCharacter(request: UpdateTavernCharacterRequest): TavernRegistryMutationResult {
    const registry = this.registryStore.get()
    const existing = registry.characters.find((character) => character.id === request.id)
    if (!existing) {
      throwNotFound('Character', request.id)
    }
    validateCharacterDraft(request.character, registry, request.id)
    const now = Date.now()
    const updated: TavernCharacter = {
      ...existing,
      ...normalizeCharacterDraft(request.character),
      id: existing.id,
      defaultLorebookIds: normalizeReferencedLorebookIds(
        request.character.defaultLorebookIds ?? existing.defaultLorebookIds,
        registry
      ),
      createdAt: existing.createdAt,
      updatedAt: now,
    }
    const saved = this.registryStore.save({
      ...registry,
      characters: registry.characters.map((character) =>
        character.id === updated.id ? updated : character
      ),
      updatedAt: now,
    })
    this.logger?.info('Tavern character updated.', { characterId: updated.id })
    return this.mutationResult(saved, 'character', { character: updated })
  }

  deleteCharacter(request: DeleteTavernCharacterRequest | string): TavernRegistryMutationResult {
    const id = typeof request === 'string' ? request : request.id
    const registry = this.registryStore.get()
    const existing = registry.characters.find((character) => character.id === id)
    if (!existing) {
      return this.mutationResult(registry, 'character')
    }
    const now = Date.now()
    const saved = this.registryStore.save({
      ...registry,
      characters: registry.characters.filter((character) => character.id !== id),
      updatedAt: now,
    })
    this.logger?.info('Tavern character deleted.', { characterId: id })
    return this.mutationResult(saved, 'character')
  }

  setCharacterEnabled(request: SetTavernCharacterEnabledRequest): TavernRegistryMutationResult {
    const registry = this.registryStore.get()
    const existing = registry.characters.find((character) => character.id === request.id)
    if (!existing) {
      throwNotFound('Character', request.id)
    }
    return this.updateCharacter({
      id: request.id,
      character: {
        ...existing,
        enabled: request.enabled,
      },
    })
  }

  createLorebook(request: CreateTavernLorebookRequest): TavernRegistryMutationResult {
    const registry = this.registryStore.get()
    const now = Date.now()
    const lorebook = createLorebookRecord(request.lorebook, registry, now)
    const saved = this.registryStore.save({
      ...registry,
      lorebooks: [...registry.lorebooks, lorebook],
      updatedAt: now,
    })
    this.logger?.info('Tavern lorebook created.', { lorebookId: lorebook.id })
    return this.mutationResult(saved, 'lorebook', { lorebook })
  }

  updateLorebook(request: UpdateTavernLorebookRequest): TavernRegistryMutationResult {
    const registry = this.registryStore.get()
    const existing = registry.lorebooks.find((lorebook) => lorebook.id === request.id)
    if (!existing) {
      throwNotFound('Lorebook', request.id)
    }
    validateLorebookDraft(request.lorebook)
    const now = Date.now()
    const updated: TavernLorebook = {
      ...existing,
      name: request.lorebook.name.trim(),
      description: request.lorebook.description?.trim() || undefined,
      enabled: request.lorebook.enabled ?? existing.enabled,
      entries: normalizeEntryDrafts(request.lorebook.entries ?? existing.entries, existing, now),
      updatedAt: now,
    }
    const saved = this.registryStore.save({
      ...registry,
      lorebooks: registry.lorebooks.map((lorebook) =>
        lorebook.id === updated.id ? updated : lorebook
      ),
      updatedAt: now,
    })
    this.logger?.info('Tavern lorebook updated.', {
      lorebookId: updated.id,
      entryCount: updated.entries.length,
    })
    return this.mutationResult(saved, 'lorebook', { lorebook: updated })
  }

  deleteLorebook(request: DeleteTavernLorebookRequest | string): TavernRegistryMutationResult {
    const id = typeof request === 'string' ? request : request.id
    const registry = this.registryStore.get()
    const existing = registry.lorebooks.find((lorebook) => lorebook.id === id)
    if (!existing) {
      return this.mutationResult(registry, 'lorebook')
    }
    const now = Date.now()
    const saved = this.registryStore.save({
      ...registry,
      lorebooks: registry.lorebooks.filter((lorebook) => lorebook.id !== id),
      characters: registry.characters.map((character) => ({
        ...character,
        defaultLorebookIds: character.defaultLorebookIds.filter((lorebookId) => lorebookId !== id),
      })),
      updatedAt: now,
    })
    this.logger?.info('Tavern lorebook deleted.', { lorebookId: id })
    return this.mutationResult(saved, 'lorebook')
  }

  setLorebookEnabled(request: SetTavernLorebookEnabledRequest): TavernRegistryMutationResult {
    const registry = this.registryStore.get()
    const existing = registry.lorebooks.find((lorebook) => lorebook.id === request.id)
    if (!existing) {
      throwNotFound('Lorebook', request.id)
    }
    return this.updateLorebook({
      id: request.id,
      lorebook: {
        ...existing,
        enabled: request.enabled,
      },
    })
  }

  createPromptPreset(request: CreateTavernPromptPresetRequest): TavernRegistryMutationResult {
    const registry = this.registryStore.get()
    const now = Date.now()
    const promptPreset = createPromptPresetRecord(request.preset, registry, now)
    const saved = this.registryStore.save({
      ...registry,
      promptPresets: [...registry.promptPresets, promptPreset],
      updatedAt: now,
    })
    this.logger?.info('Tavern prompt preset created.', { promptPresetId: promptPreset.id })
    return this.mutationResult(saved, 'prompt-preset', { promptPreset })
  }

  updatePromptPreset(request: UpdateTavernPromptPresetRequest): TavernRegistryMutationResult {
    const registry = this.registryStore.get()
    const existing = registry.promptPresets.find((preset) => preset.id === request.id)
    if (!existing) {
      throwNotFound('Prompt preset', request.id)
    }
    validatePromptPresetDraft(request.preset, registry, request.id)
    const now = Date.now()
    const slots = normalizePromptSlotDrafts(request.preset.slots ?? existing.slots, existing, now)
    const updated: TavernPromptPreset = {
      ...existing,
      name: request.preset.name.trim(),
      description: request.preset.description?.trim() || undefined,
      enabled: request.preset.enabled ?? existing.enabled,
      slots,
      contentHash: hashPromptPreset(slots),
      updatedAt: now,
    }
    const saved = this.registryStore.save({
      ...registry,
      promptPresets: registry.promptPresets.map((preset) =>
        preset.id === updated.id ? updated : preset
      ),
      updatedAt: now,
    })
    this.logger?.info('Tavern prompt preset updated.', {
      promptPresetId: updated.id,
      slotCount: updated.slots.length,
    })
    return this.mutationResult(saved, 'prompt-preset', { promptPreset: updated })
  }

  deletePromptPreset(
    request: DeleteTavernPromptPresetRequest | string
  ): TavernRegistryMutationResult {
    const id = typeof request === 'string' ? request : request.id
    const registry = this.registryStore.get()
    if (!registry.promptPresets.some((preset) => preset.id === id)) {
      return this.mutationResult(registry, 'prompt-preset')
    }
    const now = Date.now()
    const saved = this.registryStore.save({
      ...registry,
      promptPresets: registry.promptPresets.filter((preset) => preset.id !== id),
      updatedAt: now,
    })
    this.logger?.info('Tavern prompt preset deleted.', { promptPresetId: id })
    return this.mutationResult(saved, 'prompt-preset')
  }

  setPromptPresetEnabled(
    request: SetTavernPromptPresetEnabledRequest
  ): TavernRegistryMutationResult {
    const existing = this.getPromptPreset(request.id)
    if (!existing) {
      throwNotFound('Prompt preset', request.id)
    }
    return this.updatePromptPreset({
      id: request.id,
      preset: { ...existing, enabled: request.enabled },
    })
  }

  createUserProfile(request: CreateTavernUserProfileRequest): TavernRegistryMutationResult {
    const registry = this.registryStore.get()
    const now = Date.now()
    const userProfile = createUserProfileRecord(request.profile, registry, now)
    const saved = this.registryStore.save({
      ...registry,
      userProfiles: [...registry.userProfiles, userProfile],
      updatedAt: now,
    })
    this.logger?.info('Tavern user profile created.', { userProfileId: userProfile.id })
    return this.mutationResult(saved, 'user-profile', { userProfile })
  }

  updateUserProfile(request: UpdateTavernUserProfileRequest): TavernRegistryMutationResult {
    const registry = this.registryStore.get()
    const existing = registry.userProfiles.find((profile) => profile.id === request.id)
    if (!existing) {
      throwNotFound('User profile', request.id)
    }
    validateUserProfileDraft(request.profile, registry, request.id)
    const now = Date.now()
    const updated: TavernUserProfile = {
      ...existing,
      name: request.profile.name.trim(),
      description: request.profile.description,
      enabled: request.profile.enabled ?? existing.enabled,
      contentHash: hashSensitiveText(request.profile.description),
      updatedAt: now,
    }
    const saved = this.registryStore.save({
      ...registry,
      userProfiles: registry.userProfiles.map((profile) =>
        profile.id === updated.id ? updated : profile
      ),
      updatedAt: now,
    })
    this.logger?.info('Tavern user profile updated.', { userProfileId: updated.id })
    return this.mutationResult(saved, 'user-profile', { userProfile: updated })
  }

  deleteUserProfile(
    request: DeleteTavernUserProfileRequest | string
  ): TavernRegistryMutationResult {
    const id = typeof request === 'string' ? request : request.id
    const registry = this.registryStore.get()
    if (!registry.userProfiles.some((profile) => profile.id === id)) {
      return this.mutationResult(registry, 'user-profile')
    }
    const now = Date.now()
    const saved = this.registryStore.save({
      ...registry,
      userProfiles: registry.userProfiles.filter((profile) => profile.id !== id),
      updatedAt: now,
    })
    this.logger?.info('Tavern user profile deleted.', { userProfileId: id })
    return this.mutationResult(saved, 'user-profile')
  }

  setUserProfileEnabled(request: SetTavernUserProfileEnabledRequest): TavernRegistryMutationResult {
    const existing = this.getUserProfile(request.id)
    if (!existing) {
      throwNotFound('User profile', request.id)
    }
    return this.updateUserProfile({
      id: request.id,
      profile: { ...existing, enabled: request.enabled },
    })
  }

  private loadResult(registry: TavernRegistry): TavernRegistryLoadResponse {
    return {
      registry: sanitizeTavernRegistry(registry),
      status: this.registryStore.status(),
    }
  }

  private mutationResult(
    registry: TavernRegistry,
    _reason: TavernRegistryChangeReason,
    options: {
      character?: TavernCharacter
      lorebook?: TavernLorebook
      promptPreset?: TavernPromptPreset
      userProfile?: TavernUserProfile
    } = {}
  ): TavernRegistryMutationResult {
    return {
      ok: true,
      registry: sanitizeTavernRegistry(registry),
      status: this.registryStore.status(),
      character: options.character ? { ...options.character } : undefined,
      lorebook: options.lorebook ? { ...options.lorebook } : undefined,
      promptPreset: options.promptPreset ? { ...options.promptPreset } : undefined,
      userProfile: options.userProfile ? { ...options.userProfile } : undefined,
    }
  }
}

function createCharacterRecord(
  draft: TavernCharacterDraft,
  registry: TavernRegistry,
  now: number,
  source?: TavernCharacter['source']
): TavernCharacter {
  validateCharacterDraft(draft, registry)
  const id =
    draft.id?.trim() ||
    uniqueId(
      'tavern-character',
      registry.characters.map((item) => item.id)
    )
  if (registry.characters.some((character) => character.id === id)) {
    throwValidation('character.id', 'Character ID already exists.', 'duplicate')
  }
  return {
    id,
    ...normalizeCharacterDraft(draft),
    defaultLorebookIds: normalizeReferencedLorebookIds(draft.defaultLorebookIds ?? [], registry),
    enabled: draft.enabled ?? true,
    source,
    createdAt: now,
    updatedAt: now,
  }
}

function createLorebookRecord(
  draft: TavernLorebookDraft,
  registry: TavernRegistry,
  now: number,
  source?: TavernLorebook['source']
): TavernLorebook {
  validateLorebookDraft(draft)
  const id =
    draft.id?.trim() ||
    uniqueId(
      'tavern-lorebook',
      registry.lorebooks.map((item) => item.id)
    )
  if (registry.lorebooks.some((lorebook) => lorebook.id === id)) {
    throwValidation('lorebook.id', 'Lorebook ID already exists.', 'duplicate')
  }
  const emptyExisting: TavernLorebook = {
    id,
    name: draft.name.trim(),
    enabled: draft.enabled ?? true,
    entries: [],
    createdAt: now,
    updatedAt: now,
  }
  return {
    id,
    name: draft.name.trim(),
    description: draft.description?.trim() || undefined,
    enabled: draft.enabled ?? true,
    entries: normalizeEntryDrafts(draft.entries ?? [], emptyExisting, now),
    source,
    createdAt: now,
    updatedAt: now,
  }
}

function createPromptPresetRecord(
  draft: TavernPromptPresetDraft,
  registry: TavernRegistry,
  now: number
): TavernPromptPreset {
  validatePromptPresetDraft(draft, registry)
  const id =
    draft.id?.trim() ||
    uniqueId(
      'tavern-prompt-preset',
      registry.promptPresets.map((item) => item.id)
    )
  if (registry.promptPresets.some((preset) => preset.id === id)) {
    throwValidation('promptPreset.id', 'Prompt preset ID already exists.', 'duplicate')
  }
  const slots = normalizePromptSlotDrafts(draft.slots ?? [], { id, slots: [] }, now)
  return {
    id,
    name: draft.name.trim(),
    description: draft.description?.trim() || undefined,
    enabled: draft.enabled ?? true,
    slots,
    version: 1,
    contentHash: hashPromptPreset(slots),
    createdAt: now,
    updatedAt: now,
  }
}

function createUserProfileRecord(
  draft: TavernUserProfileDraft,
  registry: TavernRegistry,
  now: number
): TavernUserProfile {
  validateUserProfileDraft(draft, registry)
  const id =
    draft.id?.trim() ||
    uniqueId(
      'tavern-user-profile',
      registry.userProfiles.map((item) => item.id)
    )
  if (registry.userProfiles.some((profile) => profile.id === id)) {
    throwValidation('userProfile.id', 'User profile ID already exists.', 'duplicate')
  }
  return {
    id,
    name: draft.name.trim(),
    description: draft.description,
    enabled: draft.enabled ?? true,
    version: 1,
    contentHash: hashSensitiveText(draft.description),
    createdAt: now,
    updatedAt: now,
  }
}

function normalizeCharacterDraft(
  draft: TavernCharacterDraft
): Omit<TavernCharacter, 'id' | 'source' | 'createdAt' | 'updatedAt'> {
  return {
    name: draft.name.trim(),
    description: draft.description?.trim() || undefined,
    personality: draft.personality?.trim() || undefined,
    scenario: draft.scenario?.trim() || undefined,
    systemPrompt: draft.systemPrompt?.trim() || undefined,
    postHistoryInstructions: draft.postHistoryInstructions?.trim() || undefined,
    firstMessage: draft.firstMessage?.trim() || undefined,
    alternateGreetings: cleanStringArray(draft.alternateGreetings),
    messageExamples: cleanStringArray(draft.messageExamples),
    tags: cleanStringArray(draft.tags),
    defaultLorebookIds: cleanStringArray(draft.defaultLorebookIds),
    enabled: draft.enabled ?? true,
  }
}

function normalizeEntryDrafts(
  drafts: Array<TavernLorebookEntryDraft | TavernLorebookEntry>,
  existing: TavernLorebook,
  now: number
): TavernLorebookEntry[] {
  const existingById = new Map(existing.entries.map((entry) => [entry.id, entry]))
  const usedIds = new Set<string>()
  return drafts.map((draft, index) => {
    validateEntryDraft(draft, index)
    const existingEntry = draft.id ? existingById.get(draft.id) : undefined
    const id =
      draft.id?.trim() ||
      uniqueId('tavern-entry', [
        ...existing.entries.map((entry) => entry.id),
        ...Array.from(usedIds),
      ])
    usedIds.add(id)
    return {
      id,
      enabled: draft.enabled ?? true,
      keys: cleanStringArray(draft.keys).map((key) => key.replace(/\s+/g, ' ')),
      secondaryKeys: cleanStringArray(draft.secondaryKeys).map((key) => key.replace(/\s+/g, ' ')),
      content: draft.content,
      constant: draft.constant ?? false,
      selective: draft.selective ?? false,
      priority: finiteNumber(draft.priority, 0),
      order: finiteNumber(draft.order, index),
      position:
        draft.position === 'before-history' || draft.position === 'after-history'
          ? draft.position
          : 'after-character',
      tokenBudget: finitePositiveNumber(draft.tokenBudget),
      createdAt: existingEntry?.createdAt ?? now,
      updatedAt: now,
    }
  })
}

function normalizePromptSlotDrafts(
  drafts: Array<TavernPromptSlotDraft | TavernPromptSlot>,
  existing: Pick<TavernPromptPreset, 'id' | 'slots'>,
  now: number
): TavernPromptSlot[] {
  const existingById = new Map(existing.slots.map((slot) => [slot.id, slot]))
  const usedIds = new Set<string>()
  return drafts.map((draft, index) => {
    validatePromptSlotDraft(draft, index)
    const existingSlot = draft.id ? existingById.get(draft.id) : undefined
    const placement = draft.placement === 'final' ? 'final' : 'main'
    const id =
      draft.id?.trim() ||
      uniqueId('tavern-prompt-slot', [
        ...existing.slots.map((slot) => slot.id),
        ...Array.from(usedIds),
      ])
    usedIds.add(id)
    return {
      id,
      label: draft.label?.trim() || (placement === 'final' ? 'Final prompt' : 'Main prompt'),
      placement,
      text: draft.text,
      enabled: draft.enabled ?? true,
      order: finiteNumber(draft.order, index),
      createdAt: existingSlot?.createdAt ?? now,
      updatedAt: now,
    }
  })
}

function validateCharacterDraft(
  draft: TavernCharacterDraft,
  registry: TavernRegistry,
  existingId?: string
): void {
  const issues: Array<{ path: string; message: string; code?: string }> = []
  if (!draft.name?.trim()) {
    issues.push({
      path: 'character.name',
      message: 'Character name is required.',
      code: 'required',
    })
  }
  for (const lorebookId of draft.defaultLorebookIds ?? []) {
    if (!registry.lorebooks.some((lorebook) => lorebook.id === lorebookId)) {
      issues.push({
        path: 'character.defaultLorebookIds',
        message: 'Default lorebook does not exist.',
        code: 'missing_reference',
      })
    }
  }
  if (
    draft.id &&
    draft.id !== existingId &&
    registry.characters.some((character) => character.id === draft.id)
  ) {
    issues.push({
      path: 'character.id',
      message: 'Character ID already exists.',
      code: 'duplicate',
    })
  }
  if (issues.length) {
    throw new TavernRegistryValidationError(
      tavernRegistryError('validation', 'Tavern character is invalid.', { issues })
    )
  }
}

function validateLorebookDraft(draft: TavernLorebookDraft): void {
  const issues: Array<{ path: string; message: string; code?: string }> = []
  if (!draft.name?.trim()) {
    issues.push({ path: 'lorebook.name', message: 'Lorebook name is required.', code: 'required' })
  }
  for (const [index, entry] of (draft.entries ?? []).entries()) {
    try {
      validateEntryDraft(entry, index)
    } catch (error) {
      if (error instanceof TavernRegistryValidationError) {
        issues.push(...(error.details.issues ?? []))
      } else {
        throw error
      }
    }
  }
  if (issues.length) {
    throw new TavernRegistryValidationError(
      tavernRegistryError('validation', 'Tavern lorebook is invalid.', { issues })
    )
  }
}

function validatePromptPresetDraft(
  draft: TavernPromptPresetDraft,
  registry: TavernRegistry,
  existingId?: string
): void {
  const issues: Array<{ path: string; message: string; code?: string }> = []
  if (!draft.name?.trim()) {
    issues.push({
      path: 'promptPreset.name',
      message: 'Prompt preset name is required.',
      code: 'required',
    })
  }
  if (
    draft.id &&
    draft.id !== existingId &&
    registry.promptPresets.some((preset) => preset.id === draft.id)
  ) {
    issues.push({
      path: 'promptPreset.id',
      message: 'Prompt preset ID already exists.',
      code: 'duplicate',
    })
  }
  for (const [index, slot] of (draft.slots ?? []).entries()) {
    try {
      validatePromptSlotDraft(slot, index)
    } catch (error) {
      if (error instanceof TavernRegistryValidationError) {
        issues.push(...(error.details.issues ?? []))
      } else {
        throw error
      }
    }
  }
  if (issues.length) {
    throw new TavernRegistryValidationError(
      tavernRegistryError('validation', 'Tavern prompt preset is invalid.', { issues })
    )
  }
}

function validatePromptSlotDraft(
  draft: TavernPromptSlotDraft | TavernPromptSlot,
  index: number
): void {
  const issues: Array<{ path: string; message: string; code?: string }> = []
  const path = `promptPreset.slots.${index}`
  if (draft.placement !== 'main' && draft.placement !== 'final') {
    issues.push({
      path: `${path}.placement`,
      message: 'Prompt slot placement is invalid.',
      code: 'invalid_value',
    })
  }
  if ((draft.enabled ?? true) && !draft.text?.trim()) {
    issues.push({
      path: `${path}.text`,
      message: 'Prompt slot text is required.',
      code: 'required',
    })
  }
  if (issues.length) {
    throw new TavernRegistryValidationError(
      tavernRegistryError('validation', 'Tavern prompt slot is invalid.', { issues })
    )
  }
}

function validateUserProfileDraft(
  draft: TavernUserProfileDraft,
  registry: TavernRegistry,
  existingId?: string
): void {
  const issues: Array<{ path: string; message: string; code?: string }> = []
  if (!draft.name?.trim()) {
    issues.push({
      path: 'userProfile.name',
      message: 'User profile name is required.',
      code: 'required',
    })
  }
  if (
    draft.id &&
    draft.id !== existingId &&
    registry.userProfiles.some((profile) => profile.id === draft.id)
  ) {
    issues.push({
      path: 'userProfile.id',
      message: 'User profile ID already exists.',
      code: 'duplicate',
    })
  }
  if (typeof draft.description !== 'string') {
    issues.push({
      path: 'userProfile.description',
      message: 'User profile description must be a string.',
      code: 'invalid_type',
    })
  }
  if (issues.length) {
    throw new TavernRegistryValidationError(
      tavernRegistryError('validation', 'Tavern user profile is invalid.', { issues })
    )
  }
}

function validateEntryDraft(
  draft: TavernLorebookEntryDraft | TavernLorebookEntry,
  index: number
): void {
  const issues: Array<{ path: string; message: string; code?: string }> = []
  const path = `lorebook.entries.${index}`
  if (!draft.constant && !cleanStringArray(draft.keys).length) {
    issues.push({ path: `${path}.keys`, message: 'Entry keywords are required.', code: 'required' })
  }
  if (!draft.content?.trim()) {
    issues.push({
      path: `${path}.content`,
      message: 'Entry content is required.',
      code: 'required',
    })
  }
  if (issues.length) {
    throw new TavernRegistryValidationError(
      tavernRegistryError('validation', 'Tavern lorebook entry is invalid.', { issues })
    )
  }
}

function normalizeReferencedLorebookIds(
  ids: readonly string[],
  registry: TavernRegistry
): string[] {
  const available = new Set(registry.lorebooks.map((lorebook) => lorebook.id))
  const seen = new Set<string>()
  const result: string[] = []
  for (const id of cleanStringArray(ids)) {
    if (!available.has(id) || seen.has(id)) continue
    seen.add(id)
    result.push(id)
  }
  return result
}

function cleanStringArray(values: readonly string[] | undefined): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of values ?? []) {
    const text = value.trim()
    if (!text || seen.has(text)) continue
    seen.add(text)
    result.push(text)
  }
  return result
}

function uniqueId(prefix: string, existingIds: readonly string[]): string {
  const existing = new Set(existingIds)
  const uuid =
    typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID()
      : `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e9).toString(36)}`
  const id = uuid.startsWith(prefix) ? uuid : `${prefix}-${uuid}`
  return existing.has(id) ? `${id}-${Math.floor(Math.random() * 1e9).toString(36)}` : id
}

function throwNotFound(label: string, id: string): never {
  throw new TavernRegistryValidationError(
    tavernRegistryError('not_found', `${label} not found: ${id}.`, {
      recoverable: false,
    })
  )
}

function throwValidation(path: string, message: string, code?: string): never {
  throw new TavernRegistryValidationError(
    tavernRegistryError('validation', 'Tavern registry draft is invalid.', {
      issues: [{ path, message, code }],
    })
  )
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : fallback
}

function finitePositiveNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.round(value)
    : undefined
}

function hashPromptPreset(slots: readonly TavernPromptSlot[]): string {
  return hashSensitiveText(
    JSON.stringify(
      slots.map((slot) => ({
        id: slot.id,
        placement: slot.placement,
        enabled: slot.enabled,
        order: slot.order,
        text: slot.text,
      }))
    )
  )
}
