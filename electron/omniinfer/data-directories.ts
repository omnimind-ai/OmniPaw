import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { Logger } from '@core/logging'

const TRANSIENT_LEGACY_ENTRIES = new Set(['run'])

export interface OmniInferDataDirectories {
  stateRoot: string
  runtimeRoot: string
  logsDir: string
}

export interface PrepareOmniInferDataDirectoriesOptions {
  dataRootPath: string
  installDir?: string
  logger?: Logger
}

/**
 * Keep every mutable OmniInfer file outside the application/install directory. Packaged
 * application bundles must remain immutable so upgrades do not delete runtimes and macOS code
 * signatures remain valid.
 */
export function prepareOmniInferDataDirectories(
  options: PrepareOmniInferDataDirectoriesOptions
): OmniInferDataDirectories {
  const stateRoot = resolve(options.dataRootPath, 'omniinfer')
  const runtimeRoot = join(stateRoot, 'runtime', omniInferRuntimePlatformDirectory())
  const logsDir = join(stateRoot, 'logs')

  mkdirSync(stateRoot, { recursive: true })
  migrateLegacyState(options.installDir, stateRoot, options.logger)
  mkdirSync(runtimeRoot, { recursive: true })
  mkdirSync(logsDir, { recursive: true })

  return { stateRoot, runtimeRoot, logsDir }
}

export function omniInferRuntimePlatformDirectory(
  platform: NodeJS.Platform = process.platform
): string {
  if (platform === 'darwin') return 'macos'
  if (platform === 'win32') return 'windows'
  return platform
}

function migrateLegacyState(
  installDir: string | undefined,
  stateRoot: string,
  logger: Logger | undefined
): void {
  if (!installDir) return
  const legacyRoot = resolve(installDir, '.local')
  if (samePath(legacyRoot, stateRoot) || !existsSync(legacyRoot)) return

  const migrated: string[] = []
  try {
    for (const entry of readdirSync(legacyRoot, { withFileTypes: true })) {
      if (TRANSIENT_LEGACY_ENTRIES.has(entry.name)) continue
      const destination = join(stateRoot, entry.name)
      if (existsSync(destination)) continue
      cpSync(join(legacyRoot, entry.name), destination, {
        recursive: entry.isDirectory(),
        errorOnExist: false,
        force: false,
      })
      migrated.push(entry.name)
    }
  } catch (error) {
    logger?.warn('Failed to migrate legacy OmniInfer state.', {
      error,
      from: legacyRoot,
      to: stateRoot,
    })
    return
  }

  if (migrated.length > 0) {
    logger?.info('Migrated legacy OmniInfer state outside the install directory.', {
      from: legacyRoot,
      to: stateRoot,
      entries: migrated,
    })
  }
}

function samePath(left: string, right: string): boolean {
  return normalizePath(left) === normalizePath(right)
}

function normalizePath(value: string): string {
  return resolve(value).replace(/\\/g, '/').toLowerCase()
}
