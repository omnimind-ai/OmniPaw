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
import type { Logger } from '@core/logging'
import { resolveStoreDataRoot } from '@core/utils/data-paths'
import type {
  DesktopSettingsConfig,
  DesktopSettingsStatus,
  SettingsOperationError,
} from '@shared/types/settings'
import {
  ConfigValidationError,
  cloneConfig,
  cloneDefaultConfig,
  configError,
  normalizeConfig,
  serializeConfig,
} from './schema'

export interface ConfigStoreOptions {
  appDataPath?: string
  appName?: string
  dataRootPath?: string
  configPath?: string
  logger?: Logger
}

export class ConfigStore {
  readonly configPath: string
  readonly backupPath: string
  private readonly logger?: Logger
  private loadedConfig: DesktopSettingsConfig | undefined
  private lastError: SettingsOperationError | undefined

  constructor(options: ConfigStoreOptions) {
    this.configPath = options.configPath ?? resolveDesktopConfigPath(resolveStoreDataRoot(options))
    this.backupPath = `${this.configPath}.bak`
    this.logger = options.logger
    this.logger?.debug('Config store initialized.', { path: this.configPath })
  }

  load(): DesktopSettingsConfig {
    this.ensureDirectory()

    if (!existsSync(this.configPath)) {
      this.logger?.info('Config file missing; writing default config.', { path: this.configPath })
      return this.writeLoaded(cloneDefaultConfig(), false)
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(readFileSync(this.configPath, 'utf8')) as unknown
    } catch (error) {
      this.lastError = configError(
        'invalid_json',
        errorMessage(error, 'Failed to parse settings config.'),
        {
          path: this.configPath,
          recoverable: existsSync(this.backupPath),
        }
      )
      this.logger?.warn('Config parse failed.', {
        path: this.configPath,
        recoverable: this.lastError.recoverable,
        error,
      })
      throw new ConfigValidationError(this.lastError)
    }

    const { config, changed } = this.normalizeOrThrow(parsed)
    if (changed) {
      this.logger?.info('Config normalized with compatibility changes.', { path: this.configPath })
      this.save(config)
      return this.get()
    }

    this.loadedConfig = cloneConfig(config)
    this.lastError = undefined
    this.logger?.info('Config loaded.', { path: this.configPath, version: config.version })
    return this.get()
  }

  get(): DesktopSettingsConfig {
    if (!this.loadedConfig) {
      return this.load()
    }
    return cloneConfig(this.loadedConfig)
  }

  save(nextConfig: DesktopSettingsConfig): DesktopSettingsConfig {
    const { config } = this.normalizeOrThrow(nextConfig)
    this.writeLoaded(config, true)
    this.logger?.debug('Config saved.', { path: this.configPath, version: config.version })
    return this.get()
  }

  reset(): DesktopSettingsConfig {
    this.logger?.info('Config reset to defaults.', { path: this.configPath })
    return this.writeLoaded(cloneDefaultConfig(), true)
  }

  status(): DesktopSettingsStatus {
    return {
      path: this.configPath,
      backupPath: this.backupPath,
      exists: existsSync(this.configPath),
      backupExists: existsSync(this.backupPath),
      loaded: Boolean(this.loadedConfig),
      version: this.loadedConfig?.version,
      recoverable: existsSync(this.backupPath),
      error: this.lastError,
    }
  }

  private normalizeOrThrow(raw: unknown): ReturnType<typeof normalizeConfig> {
    try {
      const result = normalizeConfig(raw)
      this.lastError = undefined
      return result
    } catch (error) {
      if (error instanceof ConfigValidationError) {
        this.lastError = {
          ...error.details,
          path: error.details.path ?? this.configPath,
          recoverable: error.details.recoverable || existsSync(this.backupPath),
        }
        throw new ConfigValidationError(this.lastError)
      }

      this.lastError = configError(
        'invalid_config',
        errorMessage(error, 'Failed to normalize settings config.'),
        {
          path: this.configPath,
          recoverable: existsSync(this.backupPath),
        }
      )
      this.logger?.warn('Config normalization failed.', {
        path: this.configPath,
        recoverable: this.lastError.recoverable,
        error,
      })
      throw new ConfigValidationError(this.lastError)
    }
  }

  private writeLoaded(
    config: DesktopSettingsConfig,
    backupExisting: boolean
  ): DesktopSettingsConfig {
    try {
      atomicWriteJson(
        this.configPath,
        serializeConfig(config),
        backupExisting ? this.backupPath : undefined
      )
      this.loadedConfig = cloneConfig(config)
      this.lastError = undefined
      return this.get()
    } catch (error) {
      this.lastError = configError(
        'save_failed',
        errorMessage(error, 'Failed to save settings config.'),
        {
          path: this.configPath,
          recoverable: existsSync(this.backupPath),
        }
      )
      this.logger?.error('Config save failed.', {
        path: this.configPath,
        recoverable: this.lastError.recoverable,
        error,
      })
      throw new ConfigValidationError(this.lastError)
    }
  }

  private ensureDirectory(): void {
    mkdirSync(dirname(this.configPath), { recursive: true })
  }
}

export function resolveDesktopConfigPath(dataRootPath: string): string {
  return join(dataRootPath, 'config', 'config.json')
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
