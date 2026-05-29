import { redactSensitiveText } from '@core/logging/redaction'
import type {
  TavernCharacter,
  TavernLorebook,
  TavernLorebookEntry,
  TavernLorebookEntryPosition,
  TavernRegistry,
  TavernRegistryErrorCode,
  TavernRegistryOperationError,
  TavernRegistryValidationIssue,
  TavernRegistryVersion,
} from '@shared/types/tavern'

export const TAVERN_REGISTRY_FILE_NAME = 'tavern.json'
export const CURRENT_TAVERN_REGISTRY_VERSION: TavernRegistryVersion = 1

export const defaultTavernRegistry: TavernRegistry = {
  version: CURRENT_TAVERN_REGISTRY_VERSION,
  characters: [],
  lorebooks: [],
  updatedAt: 0,
}

export interface NormalizeTavernRegistryResult {
  registry: TavernRegistry
  changed: boolean
}

export class TavernRegistryValidationError extends Error {
  readonly details: TavernRegistryOperationError

  constructor(details: TavernRegistryOperationError) {
    super(details.message)
    this.name = 'TavernRegistryValidationError'
    this.details = details
  }
}

export function cloneDefaultTavernRegistry(): TavernRegistry {
  return cloneTavernRegistry(defaultTavernRegistry)
}

export function cloneTavernRegistry(registry: TavernRegistry): TavernRegistry {
  return structuredClone(registry)
}

export function normalizeTavernRegistry(raw: unknown): NormalizeTavernRegistryResult {
  const migrated = migrateRegistry(raw)
  const issues: TavernRegistryValidationIssue[] = []
  const registry = normalizeRegistryShape(migrated, issues)
  validateRegistryShape(registry, issues)
  if (issues.length) {
    throwValidationError('invalid_registry', 'Tavern registry is invalid.', issues)
  }
  const normalized = sortRegistry(registry)
  return {
    registry: normalized,
    changed: stableComparable(normalized) !== stableComparable(raw),
  }
}

export function validateTavernRegistry(input: unknown): TavernRegistry {
  const issues: TavernRegistryValidationIssue[] = []
  if (!isPlainObject(input)) {
    throwValidationError('invalid_registry', 'Tavern registry is invalid.', [
      { path: '', message: 'Registry must be an object.', code: 'invalid_type' },
    ])
  }
  const registry = input as unknown as TavernRegistry
  validateRegistryShape(registry, issues)
  if (issues.length) {
    throwValidationError('invalid_registry', 'Tavern registry is invalid.', issues)
  }
  return sortRegistry(registry)
}

export function serializeTavernRegistry(registry: TavernRegistry): string {
  return `${JSON.stringify(validateTavernRegistry(registry), null, 2)}\n`
}

export function sanitizeTavernRegistry(registry: TavernRegistry): TavernRegistry {
  return cloneTavernRegistry(registry)
}

export function tavernRegistryError(
  code: TavernRegistryErrorCode,
  message: string,
  options: {
    path?: string
    recoverable?: boolean
    issues?: TavernRegistryValidationIssue[]
  } = {}
): TavernRegistryOperationError {
  return {
    code,
    message: redactSecretText(message),
    path: options.path,
    recoverable: options.recoverable ?? false,
    issues: options.issues?.map((issue) => ({
      ...issue,
      message: redactSecretText(issue.message),
    })),
  }
}

function migrateRegistry(raw: unknown): unknown {
  if (raw === undefined || raw === null) {
    return cloneDefaultTavernRegistry()
  }
  if (!isPlainObject(raw)) {
    throwValidationError('invalid_registry', 'Tavern registry is invalid.', [
      { path: '', message: 'Registry must be an object.', code: 'invalid_type' },
    ])
  }
  const version = typeof raw.version === 'number' ? raw.version : CURRENT_TAVERN_REGISTRY_VERSION
  if (version > CURRENT_TAVERN_REGISTRY_VERSION) {
    throw new TavernRegistryValidationError(
      tavernRegistryError(
        'unsupported_version',
        `Tavern registry version ${version} is newer than supported version ${CURRENT_TAVERN_REGISTRY_VERSION}.`,
        {
          issues: [
            {
              path: 'version',
              message: `Unsupported future tavern registry version ${version}.`,
              code: 'unsupported_version',
            },
          ],
        }
      )
    )
  }
  if (version < CURRENT_TAVERN_REGISTRY_VERSION) {
    return {
      ...raw,
      version: CURRENT_TAVERN_REGISTRY_VERSION,
    }
  }
  return raw
}

function normalizeRegistryShape(
  raw: unknown,
  issues: TavernRegistryValidationIssue[]
): TavernRegistry {
  if (!isPlainObject(raw)) {
    issues.push({ path: '', message: 'Registry must be an object.', code: 'invalid_type' })
    return cloneDefaultTavernRegistry()
  }

  return {
    version:
      typeof raw.version === 'number'
        ? (raw.version as TavernRegistryVersion)
        : CURRENT_TAVERN_REGISTRY_VERSION,
    characters: normalizeArray(raw.characters, 'characters', issues, normalizeCharacterRecord),
    lorebooks: normalizeArray(raw.lorebooks, 'lorebooks', issues, normalizeLorebookRecord),
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : 0,
  }
}

function normalizeCharacterRecord(
  raw: unknown,
  path: string,
  issues: TavernRegistryValidationIssue[]
): TavernCharacter {
  if (!isPlainObject(raw)) {
    issues.push({ path, message: 'Character must be an object.', code: 'invalid_type' })
    return defaultCharacterRecord()
  }
  const now = Date.now()
  return {
    id: stringValue(raw.id),
    name: stringValue(raw.name),
    description: optionalString(raw.description),
    personality: optionalString(raw.personality),
    scenario: optionalString(raw.scenario),
    systemPrompt: optionalString(raw.systemPrompt),
    postHistoryInstructions: optionalString(raw.postHistoryInstructions),
    firstMessage: optionalString(raw.firstMessage),
    alternateGreetings: normalizeStringArray(raw.alternateGreetings),
    messageExamples: normalizeStringArray(raw.messageExamples),
    tags: normalizeStringArray(raw.tags),
    defaultLorebookIds: normalizeStringArray(raw.defaultLorebookIds),
    enabled: raw.enabled !== false,
    source: normalizeSource(raw.source),
    createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : now,
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : now,
  }
}

function normalizeLorebookRecord(
  raw: unknown,
  path: string,
  issues: TavernRegistryValidationIssue[]
): TavernLorebook {
  if (!isPlainObject(raw)) {
    issues.push({ path, message: 'Lorebook must be an object.', code: 'invalid_type' })
    return defaultLorebookRecord()
  }
  const now = Date.now()
  return {
    id: stringValue(raw.id),
    name: stringValue(raw.name),
    description: optionalString(raw.description),
    enabled: raw.enabled !== false,
    entries: normalizeArray(raw.entries, `${path}.entries`, issues, normalizeLorebookEntryRecord),
    source: normalizeSource(raw.source),
    createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : now,
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : now,
  }
}

function normalizeLorebookEntryRecord(
  raw: unknown,
  path: string,
  issues: TavernRegistryValidationIssue[]
): TavernLorebookEntry {
  if (!isPlainObject(raw)) {
    issues.push({ path, message: 'Lorebook entry must be an object.', code: 'invalid_type' })
    return defaultLorebookEntryRecord()
  }
  const now = Date.now()
  return {
    id: stringValue(raw.id),
    enabled: raw.enabled !== false,
    keys: normalizeKeys(raw.keys),
    secondaryKeys: normalizeKeys(raw.secondaryKeys),
    content: typeof raw.content === 'string' ? raw.content : '',
    constant: raw.constant === true,
    selective: raw.selective === true,
    priority: finiteNumber(raw.priority, 0),
    order: finiteNumber(raw.order, 0),
    position: normalizePosition(raw.position),
    tokenBudget: finitePositiveNumber(raw.tokenBudget),
    createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : now,
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : now,
  }
}

function validateRegistryShape(
  registry: TavernRegistry,
  issues: TavernRegistryValidationIssue[]
): void {
  if (registry.version !== CURRENT_TAVERN_REGISTRY_VERSION) {
    issues.push({
      path: 'version',
      message: `Registry version must be ${CURRENT_TAVERN_REGISTRY_VERSION}.`,
      code: 'invalid_version',
    })
  }
  const characterIds = validateIdCollection(registry.characters, 'characters', 'Character', issues)
  const lorebookIds = validateIdCollection(registry.lorebooks, 'lorebooks', 'Lorebook', issues)

  for (const [index, character] of registry.characters.entries()) {
    const path = `characters.${index}`
    if (!character.name.trim()) {
      issues.push({
        path: `${path}.name`,
        message: 'Character name is required.',
        code: 'required',
      })
    }
    for (const lorebookId of character.defaultLorebookIds) {
      if (!lorebookIds.has(lorebookId)) {
        issues.push({
          path: `${path}.defaultLorebookIds`,
          message: 'Default lorebook reference is missing.',
          code: 'missing_reference',
        })
      }
    }
  }

  for (const [bookIndex, lorebook] of registry.lorebooks.entries()) {
    const path = `lorebooks.${bookIndex}`
    if (!lorebook.name.trim()) {
      issues.push({ path: `${path}.name`, message: 'Lorebook name is required.', code: 'required' })
    }
    const entryIds = new Set<string>()
    for (const [entryIndex, entry] of lorebook.entries.entries()) {
      const entryPath = `${path}.entries.${entryIndex}`
      if (!entry.id) {
        issues.push({ path: `${entryPath}.id`, message: 'Entry ID is required.', code: 'required' })
      }
      if (entryIds.has(entry.id)) {
        issues.push({
          path: `${entryPath}.id`,
          message: 'Entry ID must be unique within a lorebook.',
          code: 'duplicate',
        })
      }
      entryIds.add(entry.id)
      if (!entry.constant && !entry.keys.length) {
        issues.push({
          path: `${entryPath}.keys`,
          message: 'Entry keywords are required unless the entry is constant.',
          code: 'required',
        })
      }
      if (!entry.content.trim()) {
        issues.push({
          path: `${entryPath}.content`,
          message: 'Entry content is required.',
          code: 'required',
        })
      }
    }
  }

  void characterIds
}

function validateIdCollection<T extends { id: string }>(
  records: T[],
  path: string,
  label: string,
  issues: TavernRegistryValidationIssue[]
): Set<string> {
  const ids = new Set<string>()
  for (const [index, record] of records.entries()) {
    if (!record.id) {
      issues.push({
        path: `${path}.${index}.id`,
        message: `${label} ID is required.`,
        code: 'required',
      })
    }
    if (ids.has(record.id)) {
      issues.push({
        path: `${path}.${index}.id`,
        message: `${label} ID must be unique.`,
        code: 'duplicate',
      })
    }
    ids.add(record.id)
  }
  return ids
}

function sortRegistry(registry: TavernRegistry): TavernRegistry {
  return {
    ...registry,
    characters: [...registry.characters].sort(sortByCreatedAtThenId),
    lorebooks: [...registry.lorebooks].sort(sortByCreatedAtThenId).map((lorebook) => ({
      ...lorebook,
      entries: [...lorebook.entries].sort(
        (left, right) => left.order - right.order || left.id.localeCompare(right.id)
      ),
    })),
  }
}

function sortByCreatedAtThenId(
  left: { id: string; createdAt: number },
  right: { id: string; createdAt: number }
) {
  if (left.createdAt !== right.createdAt) return left.createdAt - right.createdAt
  return left.id.localeCompare(right.id)
}

function defaultCharacterRecord(): TavernCharacter {
  const now = Date.now()
  return {
    id: '',
    name: '',
    alternateGreetings: [],
    messageExamples: [],
    tags: [],
    defaultLorebookIds: [],
    enabled: true,
    createdAt: now,
    updatedAt: now,
  }
}

function defaultLorebookRecord(): TavernLorebook {
  const now = Date.now()
  return {
    id: '',
    name: '',
    enabled: true,
    entries: [],
    createdAt: now,
    updatedAt: now,
  }
}

function defaultLorebookEntryRecord(): TavernLorebookEntry {
  const now = Date.now()
  return {
    id: '',
    enabled: true,
    keys: [],
    secondaryKeys: [],
    content: '',
    constant: false,
    selective: false,
    priority: 0,
    order: 0,
    position: 'after-character',
    createdAt: now,
    updatedAt: now,
  }
}

function normalizeArray<T>(
  raw: unknown,
  path: string,
  issues: TavernRegistryValidationIssue[],
  normalizer: (item: unknown, path: string, issues: TavernRegistryValidationIssue[]) => T
): T[] {
  if (raw === undefined || raw === null) {
    return []
  }
  if (!Array.isArray(raw)) {
    issues.push({ path, message: 'Value must be an array.', code: 'invalid_type' })
    return []
  }
  return raw.map((item, index) => normalizer(item, `${path}.${index}`, issues))
}

export function normalizeKeys(raw: unknown): string[] {
  const values = normalizeStringArray(raw)
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of values) {
    const key = value.trim().replace(/\s+/g, ' ')
    const normalized = key.toLocaleLowerCase()
    if (!key || seen.has(normalized)) continue
    seen.add(normalized)
    result.push(key)
  }
  return result
}

function normalizeStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return []
  }
  return raw
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
}

function normalizeSource(raw: unknown): TavernCharacter['source'] {
  if (!isPlainObject(raw)) {
    return undefined
  }
  const kind = raw.kind === 'sillytavern-json' ? 'sillytavern-json' : 'manual'
  return {
    kind,
    version: optionalString(raw.version),
    importedAt: typeof raw.importedAt === 'number' ? raw.importedAt : undefined,
    sourceName: optionalString(raw.sourceName),
    contentHash: optionalString(raw.contentHash),
  }
}

function normalizePosition(raw: unknown): TavernLorebookEntryPosition {
  return raw === 'before-history' ? 'before-history' : 'after-character'
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : fallback
}

function finitePositiveNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.round(value)
    : undefined
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function redactSecretText(text: string): string {
  return redactSensitiveText(text)
}

function stableComparable(value: unknown): string {
  return JSON.stringify(value)
}

function throwValidationError(
  code: TavernRegistryErrorCode,
  message: string,
  issues: TavernRegistryValidationIssue[]
): never {
  throw new TavernRegistryValidationError(
    tavernRegistryError(code, message, { issues, recoverable: false })
  )
}
