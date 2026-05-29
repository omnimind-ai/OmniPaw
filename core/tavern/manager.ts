import type { Logger } from '@core/logging'
import type { PersonaManager } from '@core/persona/manager'
import type {
  CreateTavernCharacterRequest,
  CreateTavernLorebookRequest,
  DeleteTavernCharacterRequest,
  DeleteTavernLorebookRequest,
  ExportTavernCharacterPersonaRequest,
  ImportTavernCharacterRequest,
  ImportTavernCharacterResult,
  SetTavernCharacterEnabledRequest,
  SetTavernLorebookEnabledRequest,
  TavernCharacter,
  TavernCharacterDraft,
  TavernLorebook,
  TavernLorebookDraft,
  TavernLorebookEntry,
  TavernLorebookEntryDraft,
  TavernRegistry,
  TavernRegistryChangeReason,
  TavernRegistryLoadResponse,
  TavernRegistryMutationResult,
  TavernRegistryStatus,
  UpdateTavernCharacterRequest,
  UpdateTavernLorebookRequest,
} from '@shared/types/tavern'
import { parseSillyTavernCharacterJson } from './importer'
import {
  sanitizeTavernRegistry,
  TavernRegistryValidationError,
  tavernRegistryError,
} from './registry-schema'
import type { TavernRegistryStore } from './registry-store'

export interface TavernManagerOptions {
  registryStore: TavernRegistryStore
  personaManager: PersonaManager
  logger?: Logger
}

export class TavernManager {
  private readonly registryStore: TavernRegistryStore
  private readonly personaManager: PersonaManager
  private readonly logger?: Logger

  constructor(options: TavernManagerOptions) {
    this.registryStore = options.registryStore
    this.personaManager = options.personaManager
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

  importCharacter(request: ImportTavernCharacterRequest): ImportTavernCharacterResult {
    const parsed = parseSillyTavernCharacterJson(request.content, request.sourceName)
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

  exportCharacterAsPersona(
    request: ExportTavernCharacterPersonaRequest
  ): TavernRegistryMutationResult {
    const registry = this.registryStore.get()
    const character = registry.characters.find((item) => item.id === request.characterId)
    if (!character) {
      throwNotFound('Character', request.characterId)
    }
    const prompt = compileCharacterPersonaPrompt(character, request.includeExamples === true)
    const result = this.personaManager.create({
      profile: {
        name: character.name,
        description: character.description,
        prompt,
      },
    })
    this.logger?.info('Tavern character exported as persona.', {
      characterId: character.id,
      personaId: result.profile?.id,
    })
    return {
      ok: true,
      registry: sanitizeTavernRegistry(registry),
      status: this.registryStore.status(),
      character: { ...character },
      persona: result.profile,
    }
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
    options: { character?: TavernCharacter; lorebook?: TavernLorebook } = {}
  ): TavernRegistryMutationResult {
    return {
      ok: true,
      registry: sanitizeTavernRegistry(registry),
      status: this.registryStore.status(),
      character: options.character ? { ...options.character } : undefined,
      lorebook: options.lorebook ? { ...options.lorebook } : undefined,
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
      position: draft.position === 'before-history' ? 'before-history' : 'after-character',
      tokenBudget: finitePositiveNumber(draft.tokenBudget),
      createdAt: existingEntry?.createdAt ?? now,
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

function compileCharacterPersonaPrompt(
  character: TavernCharacter,
  includeExamples: boolean
): string {
  const sections: string[] = []
  pushSection(sections, 'Character', character.name)
  pushSection(sections, 'Description', character.description)
  pushSection(sections, 'Personality', character.personality)
  pushSection(sections, 'Scenario', character.scenario)
  pushSection(sections, 'System prompt', character.systemPrompt)
  pushSection(sections, 'Post-history instructions', character.postHistoryInstructions)
  if (includeExamples && character.messageExamples.length) {
    pushSection(sections, 'Example dialogue', character.messageExamples.join('\n\n'))
  }
  return sections.join('\n\n')
}

function pushSection(sections: string[], label: string, value: string | undefined): void {
  const text = value?.trim()
  if (text) {
    sections.push(`${label}:\n${text}`)
  }
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
