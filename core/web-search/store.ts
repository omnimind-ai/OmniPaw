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
import { resolveStoreDataRoot } from '@core/utils/data-paths'
import {
  type SaveWebSearchSettingsRequest,
  WEB_SEARCH_PROVIDERS,
  type WebSearchDepth,
  type WebSearchProvider,
  type WebSearchSettings,
} from '@shared/types/web-search'

const STORE_VERSION = 1
const DEFAULT_PROVIDER: WebSearchProvider = 'tavily'

interface StoredWebSearchConfig {
  version: typeof STORE_VERSION
  enabled: boolean
  provider: WebSearchProvider
  maxResults: number
  searchDepth: WebSearchDepth
  encryptedApiKeys: Partial<Record<WebSearchProvider, string>>
  updatedAt?: number
}

export interface WebSearchStoreOptions {
  appDataPath?: string
  appName?: string
  dataRootPath?: string
  fileName?: string
  storePath?: string
  encrypt: (value: string) => string
  decrypt: (value: string) => string | undefined
}

export interface WebSearchRuntimeSettings {
  provider: WebSearchProvider
  apiKey: string
  maxResults: number
  searchDepth: WebSearchDepth
}

export class WebSearchStore {
  readonly storePath: string
  readonly backupPath: string
  private loaded: StoredWebSearchConfig | undefined

  constructor(private readonly options: WebSearchStoreOptions) {
    this.storePath =
      options.storePath ??
      join(resolveStoreDataRoot(options), 'config', options.fileName ?? 'web-search.json')
    this.backupPath = `${this.storePath}.bak`
  }

  load(): WebSearchSettings {
    if (!existsSync(this.storePath)) {
      this.loaded = defaultStoredConfig()
      return this.publicSettings(this.loaded)
    }

    const parsed = JSON.parse(readFileSync(this.storePath, 'utf8')) as unknown
    this.loaded = normalizeStoredConfig(parsed)
    return this.publicSettings(this.loaded)
  }

  get(): WebSearchSettings {
    const stored = this.ensureLoaded()
    return this.publicSettings(stored)
  }

  save(request: SaveWebSearchSettingsRequest): WebSearchSettings {
    const current = this.ensureLoaded()
    const apiKey = request.apiKey?.trim()
    const next: StoredWebSearchConfig = {
      ...current,
      enabled: Boolean(request.enabled),
      provider: normalizeProvider(request.provider),
      maxResults: clampInteger(request.maxResults, 5, 1, 10),
      searchDepth: normalizeDepth(request.searchDepth),
      encryptedApiKeys: { ...current.encryptedApiKeys },
      updatedAt: Date.now(),
    }
    if (apiKey) {
      next.encryptedApiKeys[next.provider] = this.options.encrypt(apiKey)
    }

    atomicWriteJson(this.storePath, serializeStoredConfig(next), this.backupPath)
    this.loaded = next
    return this.publicSettings(next)
  }

  runtime(
    provider?: WebSearchProvider,
    apiKeyOverride?: string
  ): WebSearchRuntimeSettings | undefined {
    const current = this.ensureLoaded()
    const selectedProvider = provider ?? current.provider
    const encryptedValue = current.encryptedApiKeys[selectedProvider]
    const apiKey =
      apiKeyOverride?.trim() || (encryptedValue ? this.options.decrypt(encryptedValue) : '')
    if (!apiKey) return undefined
    if (!provider && !current.enabled) return undefined
    return {
      provider: selectedProvider,
      apiKey,
      maxResults: current.maxResults,
      searchDepth: current.searchDepth,
    }
  }

  reset(): WebSearchSettings {
    if (existsSync(this.storePath)) {
      rmSync(this.storePath)
    }
    this.loaded = defaultStoredConfig()
    return this.publicSettings(this.loaded)
  }

  private ensureLoaded(): StoredWebSearchConfig {
    if (!this.loaded) this.load()
    return this.loaded ?? defaultStoredConfig()
  }

  private publicSettings(stored: StoredWebSearchConfig): WebSearchSettings {
    return {
      enabled: stored.enabled,
      provider: stored.provider,
      maxResults: stored.maxResults,
      searchDepth: stored.searchDepth,
      configuredProviders: Object.fromEntries(
        WEB_SEARCH_PROVIDERS.map((provider) => [
          provider,
          Boolean(stored.encryptedApiKeys[provider]),
        ])
      ) as Record<WebSearchProvider, boolean>,
      updatedAt: stored.updatedAt,
    }
  }
}

function defaultStoredConfig(): StoredWebSearchConfig {
  return {
    version: STORE_VERSION,
    enabled: false,
    provider: DEFAULT_PROVIDER,
    maxResults: 5,
    searchDepth: 'basic',
    encryptedApiKeys: {},
  }
}

function normalizeStoredConfig(value: unknown): StoredWebSearchConfig {
  if (!isRecord(value)) {
    throw new Error('Web Search settings must be a JSON object.')
  }
  if (value.version !== STORE_VERSION) {
    throw new Error(`Unsupported Web Search settings version: ${String(value.version)}`)
  }

  const encryptedApiKeys: Partial<Record<WebSearchProvider, string>> = {}
  if (isRecord(value.encryptedApiKeys)) {
    for (const provider of WEB_SEARCH_PROVIDERS) {
      const encryptedValue = value.encryptedApiKeys[provider]
      if (typeof encryptedValue === 'string' && encryptedValue) {
        encryptedApiKeys[provider] = encryptedValue
      }
    }
  }

  return {
    version: STORE_VERSION,
    enabled: Boolean(value.enabled),
    provider: normalizeProvider(value.provider),
    maxResults: clampInteger(value.maxResults, 5, 1, 10),
    searchDepth: normalizeDepth(value.searchDepth),
    encryptedApiKeys,
    updatedAt: finiteNumber(value.updatedAt),
  }
}

function serializeStoredConfig(config: StoredWebSearchConfig): string {
  return `${JSON.stringify(config, null, 2)}\n`
}

function atomicWriteJson(path: string, content: string, backupPath: string): void {
  mkdirSync(dirname(path), { recursive: true })
  if (existsSync(path)) copyFileSync(path, backupPath)

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

function normalizeProvider(value: unknown): WebSearchProvider {
  return WEB_SEARCH_PROVIDERS.includes(value as WebSearchProvider)
    ? (value as WebSearchProvider)
    : DEFAULT_PROVIDER
}

function normalizeDepth(value: unknown): WebSearchDepth {
  return value === 'advanced' ? 'advanced' : 'basic'
}

function clampInteger(value: unknown, fallback: number, min: number, max: number): number {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.max(min, Math.min(Math.floor(number), max))
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
