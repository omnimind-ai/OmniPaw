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
import { resolveStoreDataRoot } from '@core/utils/data-paths'

import type {
  ProviderRegistry,
  ProviderRegistryOperationError,
  ProviderRegistryStatus,
} from '@shared/types/provider'
import {
  cloneDefaultProviderRegistry,
  cloneProviderRegistry,
  normalizeProviderRegistry,
  PROVIDER_REGISTRY_FILE_NAME,
  ProviderRegistryValidationError,
  providerRegistryError,
  serializeProviderRegistry,
} from './registry-schema'

export interface ProviderRegistryStoreOptions {
  appDataPath?: string
  appName?: string
  dataRootPath?: string
  fileName?: string
  registryPath?: string
}

export class ProviderRegistryStore {
  readonly registryPath: string
  readonly backupPath: string
  private loadedRegistry: ProviderRegistry | undefined
  private lastError: ProviderRegistryOperationError | undefined

  constructor(options: ProviderRegistryStoreOptions) {
    this.registryPath =
      options.registryPath ??
      resolveProviderRegistryPath(resolveStoreDataRoot(options), options.fileName)
    this.backupPath = `${this.registryPath}.bak`
  }

  load(): ProviderRegistry {
    this.ensureDirectory()

    if (!existsSync(this.registryPath)) {
      return this.writeLoaded(cloneDefaultProviderRegistry(), false)
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(readFileSync(this.registryPath, 'utf8')) as unknown
    } catch (error) {
      this.lastError = providerRegistryError(
        'invalid_json',
        errorMessage(error, 'Failed to parse Provider registry.'),
        {
          path: this.registryPath,
          recoverable: existsSync(this.backupPath),
        }
      )
      throw new ProviderRegistryValidationError(this.lastError)
    }

    const { registry, changed } = this.normalizeOrThrow(parsed)
    if (changed) {
      this.save(registry)
      return this.get()
    }

    this.loadedRegistry = cloneProviderRegistry(registry)
    this.lastError = undefined
    return this.get()
  }

  get(): ProviderRegistry {
    if (!this.loadedRegistry) {
      return this.load()
    }
    return cloneProviderRegistry(this.loadedRegistry)
  }

  save(nextRegistry: ProviderRegistry): ProviderRegistry {
    const { registry } = this.normalizeOrThrow(nextRegistry)
    this.writeLoaded(registry, true)
    return this.get()
  }

  reset(): ProviderRegistry {
    return this.writeLoaded(cloneDefaultProviderRegistry(), true)
  }

  status(): ProviderRegistryStatus {
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

  private normalizeOrThrow(raw: unknown): ReturnType<typeof normalizeProviderRegistry> {
    try {
      const result = normalizeProviderRegistry(raw)
      this.lastError = undefined
      return result
    } catch (error) {
      if (error instanceof ProviderRegistryValidationError) {
        this.lastError = {
          ...error.details,
          path: error.details.path ?? this.registryPath,
          recoverable: error.details.recoverable || existsSync(this.backupPath),
        }
        throw new ProviderRegistryValidationError(this.lastError)
      }

      this.lastError = providerRegistryError(
        'invalid_registry',
        errorMessage(error, 'Failed to normalize Provider registry.'),
        {
          path: this.registryPath,
          recoverable: existsSync(this.backupPath),
        }
      )
      throw new ProviderRegistryValidationError(this.lastError)
    }
  }

  private writeLoaded(registry: ProviderRegistry, backupExisting: boolean): ProviderRegistry {
    try {
      atomicWriteJson(
        this.registryPath,
        serializeProviderRegistry(registry),
        backupExisting ? this.backupPath : undefined
      )
      this.loadedRegistry = cloneProviderRegistry(registry)
      this.lastError = undefined
      return this.get()
    } catch (error) {
      this.lastError = providerRegistryError(
        'save_failed',
        errorMessage(error, 'Failed to save Provider registry.'),
        {
          path: this.registryPath,
          recoverable: existsSync(this.backupPath),
        }
      )
      throw new ProviderRegistryValidationError(this.lastError)
    }
  }

  private ensureDirectory(): void {
    mkdirSync(dirname(this.registryPath), { recursive: true })
  }
}

export function resolveProviderRegistryPath(
  dataRootPath: string,
  fileName = PROVIDER_REGISTRY_FILE_NAME
): string {
  return join(dataRootPath, 'config', fileName)
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
