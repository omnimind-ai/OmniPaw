import type {
  SkillErrorCode,
  SkillOperationError,
  SkillState,
  SkillStateVersion,
  SkillValidationIssue,
} from '@shared/types/skill'

export const SKILL_STATE_FILE_NAME = 'skill_state.json'
export const SKILL_ROOT_DIRECTORY_NAME = 'skills'
export const CURRENT_SKILL_STATE_VERSION: SkillStateVersion = 1
export const MAX_SKILL_FILE_BYTES = 256 * 1024
export const MAX_SKILL_READ_CHARS = 120_000
export const MAX_SKILL_IMPORT_ARCHIVE_BYTES = 10 * 1024 * 1024
export const MAX_SKILL_IMPORT_TOTAL_BYTES = 5 * 1024 * 1024
export const MAX_SKILL_IMPORT_FILES = 200
export const MAX_SKILL_DESCRIPTION_CHARS = 240
export const MAX_COMPACT_SKILL_DESCRIPTION_CHARS = 120

export const defaultSkillState: SkillState = {
  version: CURRENT_SKILL_STATE_VERSION,
  enabledById: {},
}

export interface NormalizeSkillStateResult {
  state: SkillState
  changed: boolean
}

export class SkillValidationError extends Error {
  readonly details: SkillOperationError

  constructor(details: SkillOperationError) {
    super(details.message)
    this.name = 'SkillValidationError'
    this.details = details
  }
}

export function cloneDefaultSkillState(): SkillState {
  return cloneSkillState(defaultSkillState)
}

export function cloneSkillState(state: SkillState): SkillState {
  return structuredClone(state)
}

export function normalizeSkillState(raw: unknown): NormalizeSkillStateResult {
  const migrated = migrateState(raw)
  const issues: SkillValidationIssue[] = []
  const state = normalizeStateShape(migrated, issues)
  validateStateShape(state, issues)

  if (issues.length) {
    throwValidationError('invalid_state', 'Skill state is invalid.', issues)
  }

  const normalized = sortState(state)
  return {
    state: normalized,
    changed: stableComparable(normalized) !== stableComparable(raw),
  }
}

export function validateSkillState(input: unknown): SkillState {
  const issues: SkillValidationIssue[] = []

  if (!isPlainObject(input)) {
    throwValidationError('invalid_state', 'Skill state is invalid.', [
      { path: '', message: 'Skill state must be an object.', code: 'invalid_type' },
    ])
  }

  const state = input as unknown as SkillState
  validateStateShape(state, issues)
  if (issues.length) {
    throwValidationError('invalid_state', 'Skill state is invalid.', issues)
  }
  return sortState(state)
}

export function serializeSkillState(state: SkillState): string {
  return `${JSON.stringify(validateSkillState(state), null, 2)}\n`
}

export function skillError(
  code: SkillErrorCode,
  message: string,
  options: {
    path?: string
    recoverable?: boolean
    issues?: SkillValidationIssue[]
  } = {},
): SkillOperationError {
  return {
    code,
    message: redactPathLikeText(message),
    path: options.path,
    recoverable: options.recoverable ?? false,
    issues: options.issues?.map((issue) => ({
      ...issue,
      message: redactPathLikeText(issue.message),
    })),
  }
}

export function normalizeSkillId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
}

export function truncateText(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value
  }
  return `${value.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`
}

export function redactPathLikeText(text: string): string {
  return text.replace(/\/Users\/[^,\s)]+/g, '[path]')
}

function migrateState(raw: unknown): unknown {
  if (raw === undefined || raw === null) {
    return cloneDefaultSkillState()
  }
  if (!isPlainObject(raw)) {
    throwValidationError('invalid_state', 'Skill state is invalid.', [
      { path: '', message: 'Skill state must be an object.', code: 'invalid_type' },
    ])
  }

  const version = typeof raw.version === 'number' ? raw.version : CURRENT_SKILL_STATE_VERSION
  if (version > CURRENT_SKILL_STATE_VERSION) {
    throw new SkillValidationError(skillError(
      'unsupported_version',
      `Skill state version ${version} is newer than supported version ${CURRENT_SKILL_STATE_VERSION}.`,
      {
        issues: [
          {
            path: 'version',
            message: `Unsupported future skill state version ${version}.`,
            code: 'unsupported_version',
          },
        ],
      },
    ))
  }

  if (version < CURRENT_SKILL_STATE_VERSION) {
    return {
      ...raw,
      version: CURRENT_SKILL_STATE_VERSION,
    }
  }

  return raw
}

function normalizeStateShape(raw: unknown, issues: SkillValidationIssue[]): SkillState {
  if (!isPlainObject(raw)) {
    issues.push({ path: '', message: 'Skill state must be an object.', code: 'invalid_type' })
    return cloneDefaultSkillState()
  }

  return {
    version: typeof raw.version === 'number' ? raw.version as SkillStateVersion : CURRENT_SKILL_STATE_VERSION,
    enabledById: normalizeBooleanRecord(raw.enabledById, 'enabledById', issues),
  }
}

function normalizeBooleanRecord(
  raw: unknown,
  path: string,
  issues: SkillValidationIssue[],
): Record<string, boolean> {
  if (raw === undefined || raw === null) {
    return {}
  }
  if (!isPlainObject(raw)) {
    issues.push({ path, message: 'Value must be an object.', code: 'invalid_type' })
    return {}
  }

  const record: Record<string, boolean> = {}
  for (const [key, value] of Object.entries(raw)) {
    const id = normalizeSkillId(key)
    if (!id) {
      issues.push({ path: `${path}.${key}`, message: 'Skill id is invalid.', code: 'invalid_id' })
      continue
    }
    if (typeof value !== 'boolean') {
      issues.push({ path: `${path}.${key}`, message: 'Enabled value must be boolean.', code: 'invalid_type' })
      continue
    }
    record[id] = value
  }
  return record
}

function validateStateShape(state: SkillState, issues: SkillValidationIssue[]): void {
  if (state.version !== CURRENT_SKILL_STATE_VERSION) {
    issues.push({
      path: 'version',
      message: `Skill state version must be ${CURRENT_SKILL_STATE_VERSION}.`,
      code: 'invalid_version',
    })
  }
  if (!isPlainObject(state.enabledById)) {
    issues.push({ path: 'enabledById', message: 'Enabled state must be an object.', code: 'invalid_type' })
  }
}

function sortState(state: SkillState): SkillState {
  const enabledById: Record<string, boolean> = {}
  for (const key of Object.keys(state.enabledById).sort()) {
    enabledById[key] = state.enabledById[key] ?? true
  }
  return {
    version: CURRENT_SKILL_STATE_VERSION,
    enabledById,
  }
}

function throwValidationError(code: SkillErrorCode, message: string, issues: SkillValidationIssue[]): never {
  throw new SkillValidationError(skillError(code, message, { issues }))
}

function stableComparable(value: unknown): string {
  return JSON.stringify(value)
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}
