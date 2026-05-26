import type { ID, UnixMs } from './chat'

export type PersonaRegistryVersion = 1

export interface PersonaProfile {
  id: ID
  name: string
  description?: string
  prompt: string
  createdAt: UnixMs
  updatedAt: UnixMs
}

export interface PersonaRegistry {
  version: PersonaRegistryVersion
  profiles: PersonaProfile[]
  defaultPersonaId?: ID
  updatedAt: UnixMs
}

export type PersonaRegistryErrorCode =
  | 'invalid_registry'
  | 'invalid_json'
  | 'unsupported_version'
  | 'save_failed'
  | 'not_found'
  | 'validation'

export interface PersonaRegistryValidationIssue {
  path: string
  message: string
  code?: string
}

export interface PersonaRegistryOperationError {
  code: PersonaRegistryErrorCode
  message: string
  path?: string
  recoverable: boolean
  issues?: PersonaRegistryValidationIssue[]
}

export interface PersonaRegistryStatus {
  path: string
  backupPath: string
  exists: boolean
  backupExists: boolean
  loaded: boolean
  version?: PersonaRegistryVersion
  recoverable: boolean
  error?: PersonaRegistryOperationError
}

export interface PersonaRegistryLoadResponse {
  registry: PersonaRegistry
  status: PersonaRegistryStatus
}

export type PersonaRegistryChangeReason =
  | 'load'
  | 'save'
  | 'create'
  | 'update'
  | 'delete'
  | 'default'

export interface PersonaRegistryMutationResult extends PersonaRegistryLoadResponse {
  ok?: boolean
  profile?: PersonaProfile
}

export interface PersonaRegistryChangedEvent extends PersonaRegistryLoadResponse {
  reason: PersonaRegistryChangeReason
  profile?: PersonaProfile
}

export interface PersonaProfileDraft {
  id?: ID
  name: string
  description?: string
  prompt: string
}

export interface CreatePersonaRequest {
  profile: PersonaProfileDraft
}

export interface UpdatePersonaRequest {
  id: ID
  profile: PersonaProfileDraft
}

export interface DeletePersonaRequest {
  id: ID
}

export interface SetDefaultPersonaRequest {
  id?: ID
}
