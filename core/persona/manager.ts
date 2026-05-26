import type { Logger } from '@core/logging'
import type {
  CreatePersonaRequest,
  DeletePersonaRequest,
  PersonaProfile,
  PersonaProfileDraft,
  PersonaRegistry,
  PersonaRegistryChangeReason,
  PersonaRegistryLoadResponse,
  PersonaRegistryMutationResult,
  PersonaRegistryStatus,
  SetDefaultPersonaRequest,
  UpdatePersonaRequest,
} from '@shared/types/persona'
import {
  PersonaRegistryValidationError,
  personaRegistryError,
  sanitizePersonaRegistry,
} from './registry-schema'
import type { PersonaRegistryStore } from './registry-store'

export interface PersonaManagerOptions {
  registryStore: PersonaRegistryStore
  logger?: Logger
}

export class PersonaManager {
  private readonly registryStore: PersonaRegistryStore
  private readonly logger?: Logger

  constructor(options: PersonaManagerOptions) {
    this.registryStore = options.registryStore
    this.logger = options.logger
  }

  load(): PersonaRegistryLoadResponse {
    const registry = this.registryStore.load()
    return this.loadResult(registry)
  }

  list(): PersonaRegistryLoadResponse {
    const registry = this.registryStore.get()
    return this.loadResult(registry)
  }

  status(): PersonaRegistryStatus {
    return this.registryStore.status()
  }

  getActiveProfile(): PersonaProfile | undefined {
    const registry = this.registryStore.get()
    if (!registry.defaultPersonaId) return undefined
    return registry.profiles.find((item) => item.id === registry.defaultPersonaId)
  }

  create(request: CreatePersonaRequest): PersonaRegistryMutationResult {
    const validation = validateDraft(request.profile)
    if (validation.length) {
      throw new PersonaRegistryValidationError(
        personaRegistryError('validation', 'Persona profile is invalid.', { issues: validation })
      )
    }
    const registry = this.registryStore.get()
    const now = Date.now()
    const id = request.profile.id?.trim() || generatePersonaId(registry)
    if (registry.profiles.some((profile) => profile.id === id)) {
      throw new PersonaRegistryValidationError(
        personaRegistryError('validation', `Persona ID already exists: ${id}.`, {
          issues: [
            { path: 'profile.id', message: 'Persona ID already exists.', code: 'duplicate' },
          ],
        })
      )
    }
    const profile: PersonaProfile = {
      id,
      name: request.profile.name.trim(),
      description: request.profile.description?.trim() || undefined,
      prompt: request.profile.prompt,
      createdAt: now,
      updatedAt: now,
    }
    const next: PersonaRegistry = {
      ...registry,
      profiles: [...registry.profiles, profile],
      updatedAt: now,
    }
    const saved = this.registryStore.save(next)
    this.logger?.info('Persona created.', { personaId: profile.id })
    return this.mutationResult(saved, 'create', profile)
  }

  update(request: UpdatePersonaRequest): PersonaRegistryMutationResult {
    const validation = validateDraft(request.profile)
    if (validation.length) {
      throw new PersonaRegistryValidationError(
        personaRegistryError('validation', 'Persona profile is invalid.', { issues: validation })
      )
    }
    const registry = this.registryStore.get()
    const existing = registry.profiles.find((profile) => profile.id === request.id)
    if (!existing) {
      throw new PersonaRegistryValidationError(
        personaRegistryError('not_found', `Persona not found: ${request.id}.`)
      )
    }
    const now = Date.now()
    const updated: PersonaProfile = {
      ...existing,
      name: request.profile.name.trim(),
      description: request.profile.description?.trim() || undefined,
      prompt: request.profile.prompt,
      createdAt: existing.createdAt,
      updatedAt: now,
    }
    const next: PersonaRegistry = {
      ...registry,
      profiles: registry.profiles.map((profile) => (profile.id === updated.id ? updated : profile)),
      updatedAt: now,
    }
    const saved = this.registryStore.save(next)
    this.logger?.info('Persona updated.', { personaId: updated.id })
    return this.mutationResult(saved, 'update', updated)
  }

  delete(request: DeletePersonaRequest | string): PersonaRegistryMutationResult {
    const id = typeof request === 'string' ? request : request.id
    const registry = this.registryStore.get()
    const existing = registry.profiles.find((profile) => profile.id === id)
    if (!existing) {
      return this.mutationResult(registry, 'delete')
    }
    const now = Date.now()
    const next: PersonaRegistry = {
      ...registry,
      profiles: registry.profiles.filter((profile) => profile.id !== id),
      defaultPersonaId: registry.defaultPersonaId === id ? undefined : registry.defaultPersonaId,
      updatedAt: now,
    }
    const saved = this.registryStore.save(next)
    this.logger?.info('Persona deleted.', { personaId: id })
    return this.mutationResult(saved, 'delete')
  }

  setDefault(request: SetDefaultPersonaRequest): PersonaRegistryMutationResult {
    const registry = this.registryStore.get()
    const now = Date.now()
    if (!request.id) {
      const next: PersonaRegistry = {
        ...registry,
        defaultPersonaId: undefined,
        updatedAt: now,
      }
      const saved = this.registryStore.save(next)
      this.logger?.info('Active persona cleared.')
      return this.mutationResult(saved, 'default')
    }
    const target = registry.profiles.find((profile) => profile.id === request.id)
    if (!target) {
      throw new PersonaRegistryValidationError(
        personaRegistryError('not_found', `Persona not found: ${request.id}.`)
      )
    }
    const next: PersonaRegistry = {
      ...registry,
      defaultPersonaId: request.id,
      updatedAt: now,
    }
    const saved = this.registryStore.save(next)
    this.logger?.info('Active persona set.', { personaId: request.id })
    return this.mutationResult(saved, 'default', target)
  }

  private loadResult(registry: PersonaRegistry): PersonaRegistryLoadResponse {
    return {
      registry: sanitizePersonaRegistry(registry),
      status: this.registryStore.status(),
    }
  }

  private mutationResult(
    registry: PersonaRegistry,
    reason: PersonaRegistryChangeReason,
    profile?: PersonaProfile
  ): PersonaRegistryMutationResult {
    const payload: PersonaRegistryMutationResult = {
      ok: true,
      registry: sanitizePersonaRegistry(registry),
      status: this.registryStore.status(),
      profile: profile ? { ...profile } : undefined,
    }
    return payload
  }
}

function validateDraft(profile: PersonaProfileDraft) {
  const issues: { path: string; message: string; code?: string }[] = []
  if (!profile.name || !profile.name.trim()) {
    issues.push({ path: 'profile.name', message: 'Profile name is required.', code: 'required' })
  }
  if (typeof profile.prompt !== 'string' || !profile.prompt.trim()) {
    issues.push({
      path: 'profile.prompt',
      message: 'Profile prompt is required.',
      code: 'required',
    })
  }
  return issues
}

function generatePersonaId(registry: PersonaRegistry): string {
  const existing = new Set(registry.profiles.map((profile) => profile.id))
  // Use crypto.randomUUID if available; otherwise fall back to timestamp+rand
  const uuid =
    typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID()
      : `persona-${Date.now()}-${Math.floor(Math.random() * 1e9).toString(36)}`
  if (existing.has(uuid)) {
    return `${uuid}-${Math.floor(Math.random() * 1e9).toString(36)}`
  }
  return uuid
}
