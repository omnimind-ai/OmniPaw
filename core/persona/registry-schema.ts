import { redactSensitiveText } from '@core/logging/redaction'
import type {
  PersonaProfile,
  PersonaRegistry,
  PersonaRegistryErrorCode,
  PersonaRegistryOperationError,
  PersonaRegistryValidationIssue,
  PersonaRegistryVersion,
} from '@shared/types/persona'

export const PERSONA_REGISTRY_FILE_NAME = 'personas.json'
export const CURRENT_PERSONA_REGISTRY_VERSION: PersonaRegistryVersion = 1

export const defaultPersonaRegistry: PersonaRegistry = {
  version: CURRENT_PERSONA_REGISTRY_VERSION,
  profiles: [],
  defaultPersonaId: undefined,
  updatedAt: 0,
}

export interface NormalizePersonaRegistryResult {
  registry: PersonaRegistry
  changed: boolean
}

export class PersonaRegistryValidationError extends Error {
  readonly details: PersonaRegistryOperationError

  constructor(details: PersonaRegistryOperationError) {
    super(details.message)
    this.name = 'PersonaRegistryValidationError'
    this.details = details
  }
}

export function cloneDefaultPersonaRegistry(): PersonaRegistry {
  return clonePersonaRegistry(defaultPersonaRegistry)
}

export function clonePersonaRegistry(registry: PersonaRegistry): PersonaRegistry {
  return structuredClone(registry)
}

export function normalizePersonaRegistry(raw: unknown): NormalizePersonaRegistryResult {
  const migrated = migrateRegistry(raw)
  const issues: PersonaRegistryValidationIssue[] = []
  const registry = normalizeRegistryShape(migrated, issues)
  validateRegistryShape(registry, issues)
  if (issues.length) {
    throwValidationError('invalid_registry', 'Persona registry is invalid.', issues)
  }
  const normalized = sortRegistry(registry)
  return {
    registry: normalized,
    changed: stableComparable(normalized) !== stableComparable(raw),
  }
}

export function validatePersonaRegistry(input: unknown): PersonaRegistry {
  const issues: PersonaRegistryValidationIssue[] = []
  if (!isPlainObject(input)) {
    throwValidationError('invalid_registry', 'Persona registry is invalid.', [
      { path: '', message: 'Registry must be an object.', code: 'invalid_type' },
    ])
  }
  const registry = input as unknown as PersonaRegistry
  validateRegistryShape(registry, issues)
  if (issues.length) {
    throwValidationError('invalid_registry', 'Persona registry is invalid.', issues)
  }
  return sortRegistry(registry)
}

export function serializePersonaRegistry(registry: PersonaRegistry): string {
  return `${JSON.stringify(validatePersonaRegistry(registry), null, 2)}\n`
}

export function sanitizePersonaRegistry(registry: PersonaRegistry): PersonaRegistry {
  return {
    ...registry,
    profiles: registry.profiles.map((profile) => ({ ...profile })),
  }
}

export function personaRegistryError(
  code: PersonaRegistryErrorCode,
  message: string,
  options: {
    path?: string
    recoverable?: boolean
    issues?: PersonaRegistryValidationIssue[]
  } = {}
): PersonaRegistryOperationError {
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
    return cloneDefaultPersonaRegistry()
  }
  if (!isPlainObject(raw)) {
    throwValidationError('invalid_registry', 'Persona registry is invalid.', [
      { path: '', message: 'Registry must be an object.', code: 'invalid_type' },
    ])
  }
  const version = typeof raw.version === 'number' ? raw.version : CURRENT_PERSONA_REGISTRY_VERSION
  if (version > CURRENT_PERSONA_REGISTRY_VERSION) {
    throw new PersonaRegistryValidationError(
      personaRegistryError(
        'unsupported_version',
        `Persona registry version ${version} is newer than supported version ${CURRENT_PERSONA_REGISTRY_VERSION}.`,
        {
          issues: [
            {
              path: 'version',
              message: `Unsupported future persona registry version ${version}.`,
              code: 'unsupported_version',
            },
          ],
        }
      )
    )
  }
  if (version < CURRENT_PERSONA_REGISTRY_VERSION) {
    return {
      ...raw,
      version: CURRENT_PERSONA_REGISTRY_VERSION,
    }
  }
  return raw
}

function normalizeRegistryShape(
  raw: unknown,
  issues: PersonaRegistryValidationIssue[]
): PersonaRegistry {
  if (!isPlainObject(raw)) {
    issues.push({ path: '', message: 'Registry must be an object.', code: 'invalid_type' })
    return cloneDefaultPersonaRegistry()
  }
  const profiles = normalizeArray(raw.profiles, 'profiles', issues, normalizeProfileRecord)
  return {
    version:
      typeof raw.version === 'number'
        ? (raw.version as PersonaRegistryVersion)
        : CURRENT_PERSONA_REGISTRY_VERSION,
    profiles,
    defaultPersonaId: stringValue(raw.defaultPersonaId) || undefined,
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : 0,
  }
}

function normalizeProfileRecord(
  raw: unknown,
  path: string,
  issues: PersonaRegistryValidationIssue[]
): PersonaProfile {
  if (!isPlainObject(raw)) {
    issues.push({ path, message: 'Persona profile must be an object.', code: 'invalid_type' })
    return defaultProfileRecord()
  }
  const now = Date.now()
  const prompt = typeof raw.prompt === 'string' ? raw.prompt : ''
  return {
    id: stringValue(raw.id),
    name: stringValue(raw.name),
    description: typeof raw.description === 'string' ? raw.description : undefined,
    prompt,
    createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : now,
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : now,
  }
}

function validateRegistryShape(
  registry: PersonaRegistry,
  issues: PersonaRegistryValidationIssue[]
): void {
  if (registry.version !== CURRENT_PERSONA_REGISTRY_VERSION) {
    issues.push({
      path: 'version',
      message: `Registry version must be ${CURRENT_PERSONA_REGISTRY_VERSION}.`,
      code: 'invalid_version',
    })
  }
  if (!Array.isArray(registry.profiles)) {
    issues.push({ path: 'profiles', message: 'Profiles must be an array.', code: 'invalid_type' })
    return
  }
  const ids = new Set<string>()
  for (const [index, profile] of registry.profiles.entries()) {
    const path = `profiles.${index}`
    if (!profile.id) {
      issues.push({ path: `${path}.id`, message: 'Profile ID is required.', code: 'required' })
    }
    if (ids.has(profile.id)) {
      issues.push({ path: `${path}.id`, message: 'Profile ID must be unique.', code: 'duplicate' })
    }
    ids.add(profile.id)
    if (!profile.name || !profile.name.trim()) {
      issues.push({
        path: `${path}.name`,
        message: 'Profile name is required.',
        code: 'required',
      })
    }
    if (typeof profile.prompt !== 'string') {
      issues.push({
        path: `${path}.prompt`,
        message: 'Profile prompt must be a string.',
        code: 'invalid_type',
      })
    }
  }
  if (registry.defaultPersonaId && !ids.has(registry.defaultPersonaId)) {
    issues.push({
      path: 'defaultPersonaId',
      message: 'Active persona must reference an existing profile.',
      code: 'missing_reference',
    })
  }
}

function sortRegistry(registry: PersonaRegistry): PersonaRegistry {
  return {
    ...registry,
    profiles: [...registry.profiles].sort((left, right) => {
      const leftAt = left.createdAt ?? 0
      const rightAt = right.createdAt ?? 0
      if (leftAt !== rightAt) return leftAt - rightAt
      return left.id.localeCompare(right.id)
    }),
  }
}

function defaultProfileRecord(): PersonaProfile {
  const now = Date.now()
  return {
    id: '',
    name: '',
    description: undefined,
    prompt: '',
    createdAt: now,
    updatedAt: now,
  }
}

function normalizeArray<T>(
  raw: unknown,
  path: string,
  issues: PersonaRegistryValidationIssue[],
  normalizer: (item: unknown, path: string, issues: PersonaRegistryValidationIssue[]) => T
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

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
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
  code: PersonaRegistryErrorCode,
  message: string,
  issues: PersonaRegistryValidationIssue[]
): never {
  throw new PersonaRegistryValidationError(
    personaRegistryError(code, message, { issues, recoverable: false })
  )
}
