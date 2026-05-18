export type SkillSource = 'local'
export type SkillStatus = 'available' | 'invalid' | 'missing'
export type SkillChangeReason = 'load' | 'refresh' | 'enable'
export type SkillStateVersion = 1

export interface SkillMetadata {
  name?: string
  description?: string
  license?: string
  compatibility?: string
  [key: string]: string | undefined
}

export interface LocalSkillSummary {
  id: string
  name: string
  description: string
  source: SkillSource
  status: SkillStatus
  enabled: boolean
  rootName: string
  relativePath: string
  metadata: SkillMetadata
  compatibility?: string
  error?: string
  updatedAt?: number
}

export interface SkillState {
  version: SkillStateVersion
  enabledById: Record<string, boolean>
}

export interface SkillValidationIssue {
  path: string
  message: string
  code?: string
}

export type SkillErrorCode =
  | 'invalid_json'
  | 'invalid_state'
  | 'unsupported_version'
  | 'skill_io_error'
  | 'save_failed'
  | 'not_found'
  | 'validation_failed'
  | 'read_failed'

export interface SkillOperationError {
  code: SkillErrorCode
  message: string
  path?: string
  recoverable: boolean
  issues?: SkillValidationIssue[]
}

export interface SkillStateStatus {
  path: string
  backupPath: string
  exists: boolean
  backupExists: boolean
  loaded: boolean
  version?: SkillStateVersion
  recoverable: boolean
  error?: SkillOperationError
}

export interface SkillListResponse {
  skills: LocalSkillSummary[]
  status: SkillStateStatus
  rootPath?: string
}

export interface SetSkillEnabledRequest {
  skillId: string
  enabled: boolean
}

export interface SkillChangedEvent {
  reason: SkillChangeReason
  skills: LocalSkillSummary[]
  status: SkillStateStatus
}

export interface SkillPromptContext {
  enabledSkillIds: string[]
  injected: boolean
  omittedReason?: string
  content?: string
}

export interface SkillReadResult {
  skillId: string
  name: string
  content: string
}
