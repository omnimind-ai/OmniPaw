import {
  closeSync,
  copyFileSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'

import type {
  PersonaRegistry,
  PersonaRegistryOperationError,
  PersonaRegistryStatus,
} from '@shared/types/persona'
import {
  cloneDefaultPersonaRegistry,
  clonePersonaRegistry,
  normalizePersonaRegistry,
  PERSONA_REGISTRY_FILE_NAME,
  PersonaRegistryValidationError,
  personaRegistryError,
  serializePersonaRegistry,
} from './registry-schema'

export interface PersonaRegistryStoreOptions {
  appDataPath: string
  appName?: string
  fileName?: string
}

export class PersonaRegistryStore {
  readonly registryPath: string
  readonly backupPath: string
  private loadedRegistry: PersonaRegistry | undefined
  private lastError: PersonaRegistryOperationError | undefined

  constructor(options: PersonaRegistryStoreOptions) {
    this.registryPath = resolvePersonaRegistryPath(
      options.appDataPath,
      options.appName,
      options.fileName
    )
    this.backupPath = `${this.registryPath}.bak`
  }

  load(): PersonaRegistry {
    this.ensureDirectory()

    if (!existsSync(this.registryPath)) {
      return this.writeLoaded(cloneDefaultPersonaRegistry(), false)
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(readFileSync(this.registryPath, 'utf8')) as unknown
    } catch (error) {
      this.lastError = personaRegistryError(
        'invalid_json',
        errorMessage(error, 'Failed to parse persona registry.'),
        {
          path: this.registryPath,
          recoverable: existsSync(this.backupPath),
        }
      )
      throw new PersonaRegistryValidationError(this.lastError)
    }

    const { registry, changed } = this.normalizeOrThrow(parsed)
    if (changed) {
      this.save(registry)
      return this.get()
    }

    this.loadedRegistry = clonePersonaRegistry(registry)
    this.lastError = undefined
    return this.get()
  }

  get(): PersonaRegistry {
    if (!this.loadedRegistry) {
      return this.load()
    }
    return clonePersonaRegistry(this.loadedRegistry)
  }

  save(nextRegistry: PersonaRegistry): PersonaRegistry {
    const { registry } = this.normalizeOrThrow(nextRegistry)
    this.writeLoaded(registry, true)
    return this.get()
  }

  reset(): PersonaRegistry {
    return this.writeLoaded(cloneDefaultPersonaRegistry(), true)
  }

  status(): PersonaRegistryStatus {
    return {
      path: this.registryPath,
      backupPath: this.backupPath,
      exists: existsSync(this.registryPath),
      backupExists: existsSync(this.backupPath),
      loaded: Boolean(this.loadedRegistry),
      version: this.loadedRegistry?.version,
      recoverable: existsSync(this.backupPath),
      error: this.lastError,
    }
  }

  private normalizeOrThrow(raw: unknown): ReturnType<typeof normalizePersonaRegistry> {
    try {
      const result = normalizePersonaRegistry(raw)
      this.lastError = undefined
      return result
    } catch (error) {
      if (error instanceof PersonaRegistryValidationError) {
        this.lastError = {
          ...error.details,
          path: error.details.path ?? this.registryPath,
          recoverable: error.details.recoverable || existsSync(this.backupPath),
        }
        throw new PersonaRegistryValidationError(this.lastError)
      }
      this.lastError = personaRegistryError(
        'invalid_registry',
        errorMessage(error, 'Failed to normalize persona registry.'),
        {
          path: this.registryPath,
          recoverable: existsSync(this.backupPath),
        }
      )
      throw new PersonaRegistryValidationError(this.lastError)
    }
  }

  private writeLoaded(registry: PersonaRegistry, backupExisting: boolean): PersonaRegistry {
    try {
      atomicWriteJson(
        this.registryPath,
        serializePersonaRegistry(registry),
        backupExisting ? this.backupPath : undefined
      )
      this.loadedRegistry = clonePersonaRegistry(registry)
      this.lastError = undefined
      return this.get()
    } catch (error) {
      this.lastError = personaRegistryError(
        'save_failed',
        errorMessage(error, 'Failed to save persona registry.'),
        {
          path: this.registryPath,
          recoverable: existsSync(this.backupPath),
        }
      )
      throw new PersonaRegistryValidationError(this.lastError)
    }
  }

  private ensureDirectory(): void {
    mkdirSync(dirname(this.registryPath), { recursive: true })
  }
}

export function resolvePersonaRegistryPath(
  appDataPath: string,
  appName = 'OpenOmniClaw',
  fileName = PERSONA_REGISTRY_FILE_NAME
): string {
  return join(appDataPath, appName, fileName)
}

function atomicWriteJson(path: string, content: string, backupPath?: string): void {
  mkdirSync(dirname(path), { recursive: true })

  if (backupPath && existsSync(path)) {
    copyFileSync(path, backupPath)
  }

  const tempPath = `${path}.${process.pid}.${Date.now()}.tmp`
  const fd = openSync(tempPath, 'w')
  try {
    writeFileSync(fd, content, 'utf8')
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
  renameSync(tempPath, path)
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}
