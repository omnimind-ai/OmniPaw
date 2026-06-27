import {
  closeSync,
  copyFileSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { resolveOmniPawDataRoot } from '@core/utils/data-paths'

import type {
  McpOperationError,
  McpRegistryStatus,
  McpServerRecord,
  McpServerRegistry,
} from '@shared/types/mcp'
import {
  cloneDefaultMcpRegistry,
  cloneRegistry,
  MCP_REGISTRY_FILE_NAME,
  McpValidationError,
  mcpError,
  normalizeMcpRegistry,
  serializeMcpRegistry,
} from './schema'

export interface McpRegistryStoreOptions {
  userDataPath?: string
  dataRootPath?: string
  fileName?: string
  registryPath?: string
}

export class McpRegistryStore {
  readonly registryPath: string
  readonly backupPath: string
  private loadedRegistry: McpServerRegistry | undefined
  private lastError: McpOperationError | undefined

  constructor(options: McpRegistryStoreOptions) {
    this.registryPath =
      options.registryPath ?? resolveMcpRegistryPath(resolveMcpDataRoot(options), options.fileName)
    this.backupPath = `${this.registryPath}.bak`
  }

  load(): McpServerRegistry {
    this.ensureDirectory()

    if (!existsSync(this.registryPath)) {
      return this.writeLoaded(cloneDefaultMcpRegistry(), false)
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(readFileSync(this.registryPath, 'utf8')) as unknown
    } catch (error) {
      this.lastError = mcpError(
        'invalid_json',
        errorMessage(error, 'Failed to parse MCP server registry.'),
        {
          path: this.registryPath,
          recoverable: existsSync(this.backupPath),
        }
      )
      throw new McpValidationError(this.lastError)
    }

    const { registry, changed } = this.normalizeOrThrow(parsed)
    if (changed) {
      this.save(registry)
      return this.get()
    }

    this.loadedRegistry = cloneRegistry(registry)
    this.lastError = undefined
    return this.get()
  }

  get(): McpServerRegistry {
    if (!this.loadedRegistry) {
      return this.load()
    }
    return cloneRegistry(this.loadedRegistry)
  }

  save(nextRegistry: McpServerRegistry): McpServerRegistry {
    const { registry } = this.normalizeOrThrow(nextRegistry)
    this.writeLoaded(registry, true)
    return this.get()
  }

  list(): McpServerRecord[] {
    return this.get().servers.map((server) => structuredClone(server))
  }

  upsert(server: McpServerRecord): McpServerRecord {
    const registry = this.get()
    const index = registry.servers.findIndex((item) => item.id === server.id)
    const servers = [...registry.servers]
    if (index >= 0) {
      servers[index] = structuredClone(server)
    } else {
      servers.push(structuredClone(server))
    }
    const saved = this.save({ ...registry, servers })
    const next = saved.servers.find((item) => item.id === server.id)
    if (!next) {
      throw new McpValidationError(
        mcpError('save_failed', `Failed to save MCP server: ${server.id}`, {
          path: this.registryPath,
          recoverable: existsSync(this.backupPath),
        })
      )
    }
    return structuredClone(next)
  }

  delete(serverId: string): boolean {
    const registry = this.get()
    const servers = registry.servers.filter((server) => server.id !== serverId)
    if (servers.length === registry.servers.length) {
      return false
    }
    this.save({ ...registry, servers })
    return true
  }

  setEnabled(serverId: string, enabled: boolean): McpServerRecord {
    const registry = this.get()
    const server = registry.servers.find((item) => item.id === serverId)
    if (!server) {
      throw new McpValidationError(
        mcpError('not_found', `MCP server was not found: ${serverId}`, {
          path: this.registryPath,
          recoverable: false,
        })
      )
    }
    return this.upsert({
      ...server,
      enabled,
      updatedAt: Date.now(),
    })
  }

  status(): McpRegistryStatus {
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

  private normalizeOrThrow(raw: unknown): ReturnType<typeof normalizeMcpRegistry> {
    try {
      const result = normalizeMcpRegistry(raw)
      this.lastError = undefined
      return result
    } catch (error) {
      if (error instanceof McpValidationError) {
        this.lastError = {
          ...error.details,
          path: error.details.path ?? this.registryPath,
          recoverable: error.details.recoverable || existsSync(this.backupPath),
        }
        throw new McpValidationError(this.lastError)
      }

      this.lastError = mcpError(
        'invalid_registry',
        errorMessage(error, 'Failed to normalize MCP server registry.'),
        {
          path: this.registryPath,
          recoverable: existsSync(this.backupPath),
        }
      )
      throw new McpValidationError(this.lastError)
    }
  }

  private writeLoaded(registry: McpServerRegistry, backupExisting: boolean): McpServerRegistry {
    try {
      atomicWriteJson(
        this.registryPath,
        serializeMcpRegistry(registry),
        backupExisting ? this.backupPath : undefined
      )
      this.loadedRegistry = cloneRegistry(registry)
      this.lastError = undefined
      return this.get()
    } catch (error) {
      this.lastError = mcpError(
        'save_failed',
        errorMessage(error, 'Failed to save MCP server registry.'),
        {
          path: this.registryPath,
          recoverable: existsSync(this.backupPath),
        }
      )
      throw new McpValidationError(this.lastError)
    }
  }

  private ensureDirectory(): void {
    mkdirSync(dirname(this.registryPath), { recursive: true })
  }
}

export function resolveMcpRegistryPath(
  dataRootPath: string,
  fileName = MCP_REGISTRY_FILE_NAME
): string {
  return join(dataRootPath, 'config', fileName)
}

function resolveMcpDataRoot(options: McpRegistryStoreOptions): string {
  return options.dataRootPath
    ? resolveOmniPawDataRoot({ dataRootPath: options.dataRootPath })
    : (options.userDataPath ?? resolveOmniPawDataRoot())
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
  } catch (error) {
    rmSync(tempPath, { force: true })
    throw error
  } finally {
    closeSync(fd)
  }
  renameSync(tempPath, path)
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}
