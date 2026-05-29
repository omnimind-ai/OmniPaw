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
  TavernRegistry,
  TavernRegistryOperationError,
  TavernRegistryStatus,
} from '@shared/types/tavern'
import {
  cloneDefaultTavernRegistry,
  cloneTavernRegistry,
  normalizeTavernRegistry,
  serializeTavernRegistry,
  TAVERN_REGISTRY_FILE_NAME,
  TavernRegistryValidationError,
  tavernRegistryError,
} from './registry-schema'

export interface TavernRegistryStoreOptions {
  appDataPath?: string
  appName?: string
  dataRootPath?: string
  fileName?: string
  registryPath?: string
}

export class TavernRegistryStore {
  readonly registryPath: string
  readonly backupPath: string
  private loadedRegistry: TavernRegistry | undefined
  private lastError: TavernRegistryOperationError | undefined

  constructor(options: TavernRegistryStoreOptions) {
    this.registryPath =
      options.registryPath ??
      resolveTavernRegistryPath(resolveStoreDataRoot(options), options.fileName)
    this.backupPath = `${this.registryPath}.bak`
  }

  load(): TavernRegistry {
    this.ensureDirectory()

    if (!existsSync(this.registryPath)) {
      return this.writeLoaded(cloneDefaultTavernRegistry(), false)
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(readFileSync(this.registryPath, 'utf8')) as unknown
    } catch (error) {
      this.lastError = tavernRegistryError(
        'invalid_json',
        errorMessage(error, 'Failed to parse tavern registry.'),
        {
          path: this.registryPath,
          recoverable: existsSync(this.backupPath),
        }
      )
      throw new TavernRegistryValidationError(this.lastError)
    }

    const { registry, changed } = this.normalizeOrThrow(parsed)
    if (changed) {
      this.save(registry)
      return this.get()
    }

    this.loadedRegistry = cloneTavernRegistry(registry)
    this.lastError = undefined
    return this.get()
  }

  get(): TavernRegistry {
    if (!this.loadedRegistry) {
      return this.load()
    }
    return cloneTavernRegistry(this.loadedRegistry)
  }

  save(nextRegistry: TavernRegistry): TavernRegistry {
    const { registry } = this.normalizeOrThrow(nextRegistry)
    this.writeLoaded(registry, true)
    return this.get()
  }

  reset(): TavernRegistry {
    return this.writeLoaded(cloneDefaultTavernRegistry(), true)
  }

  status(): TavernRegistryStatus {
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

  private normalizeOrThrow(raw: unknown): ReturnType<typeof normalizeTavernRegistry> {
    try {
      const result = normalizeTavernRegistry(raw)
      this.lastError = undefined
      return result
    } catch (error) {
      if (error instanceof TavernRegistryValidationError) {
        this.lastError = {
          ...error.details,
          path: error.details.path ?? this.registryPath,
          recoverable: error.details.recoverable || existsSync(this.backupPath),
        }
        throw new TavernRegistryValidationError(this.lastError)
      }
      this.lastError = tavernRegistryError(
        'invalid_registry',
        errorMessage(error, 'Failed to normalize tavern registry.'),
        {
          path: this.registryPath,
          recoverable: existsSync(this.backupPath),
        }
      )
      throw new TavernRegistryValidationError(this.lastError)
    }
  }

  private writeLoaded(registry: TavernRegistry, backupExisting: boolean): TavernRegistry {
    try {
      atomicWriteJson(
        this.registryPath,
        serializeTavernRegistry(registry),
        backupExisting ? this.backupPath : undefined
      )
      this.loadedRegistry = cloneTavernRegistry(registry)
      this.lastError = undefined
      return this.get()
    } catch (error) {
      this.lastError = tavernRegistryError(
        'save_failed',
        errorMessage(error, 'Failed to save tavern registry.'),
        {
          path: this.registryPath,
          recoverable: existsSync(this.backupPath),
        }
      )
      throw new TavernRegistryValidationError(this.lastError)
    }
  }

  private ensureDirectory(): void {
    mkdirSync(dirname(this.registryPath), { recursive: true })
  }
}

export function resolveTavernRegistryPath(
  dataRootPath: string,
  fileName = TAVERN_REGISTRY_FILE_NAME
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
