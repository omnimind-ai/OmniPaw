import { existsSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import type { App } from 'electron'

const DEFAULT_CLI_NAMES_WINDOWS = [
  'omniinfer.ps1',
  'omniinfer.cmd',
  'omniinfer.bat',
  'omniinfer.py',
  'omniinfer',
  'OmniInfer.exe',
  'omniinfer.exe',
  'omniinfer-cli.exe',
  'omniinfer_gateway.exe',
]
const DEFAULT_CLI_NAMES_POSIX = [
  'omniinfer',
  'omniinfer.py',
  'OmniInfer',
  'omniinfer-cli',
  'omniinfer_gateway',
]

export interface LocateInstallContext {
  app: App
  /** Override repo root path; used for tests / migration. */
  repoRoot?: string
}

export interface LocateInstallResult {
  installDir?: string
  cliPath?: string
  searched: string[]
  envOverride?: string
}

/**
 * Locate the OmniInfer install directory. Precedence:
 *   1. `OMNIPAW_OMNIINFER_HOME` env var (project/install directory)
 *   2. legacy `OMNIPAW_OMNIINFER_PATH` env var (directory or startup script)
 *   3. `<repoRoot>/resources/omniinfer/<cliName>` (dev mode)
 *   4. `<process.resourcesPath>/omniinfer/<cliName>` (packaged)
 *   4. Common Tauri-style layouts as fallback
 */
export function locateOmniInferInstall(ctx: LocateInstallContext): LocateInstallResult {
  const envOverride =
    process.env.OMNIPAW_OMNIINFER_HOME?.trim() ?? process.env.OMNIPAW_OMNIINFER_PATH?.trim()
  const candidates: string[] = []

  if (envOverride) {
    const resolved = resolveInstallCandidate(envOverride)
    if (resolved) {
      return { ...resolved, searched: [envOverride], envOverride }
    }
  }

  const searched: string[] = []

  // Dev mode: repo root resources/omniinfer/
  if (!ctx.app.isPackaged) {
    const repoRoot = ctx.repoRoot ?? process.cwd()
    candidates.push(join(repoRoot, 'resources', 'omniinfer'))
  }

  // Packaged: process.resourcesPath/omniinfer/
  if (process.resourcesPath) {
    candidates.push(join(process.resourcesPath, 'omniinfer'))
    candidates.push(join(process.resourcesPath, 'app.asar.unpacked', 'resources', 'omniinfer'))
  }

  // Fallback: alongside the executable (NSIS unpacks resources next to .exe sometimes)
  try {
    const exePath = ctx.app.getPath('exe')
    if (exePath) {
      candidates.push(join(dirname(exePath), 'resources', 'omniinfer'))
      candidates.push(join(dirname(exePath), 'omniinfer'))
    }
  } catch {
    // ignored
  }

  for (const dir of candidates) {
    const resolved = resolveInstallCandidate(dir, searched)
    if (resolved) {
      return { ...resolved, searched, envOverride: undefined }
    }
  }

  return { installDir: undefined, cliPath: undefined, searched, envOverride: undefined }
}

function resolveInstallCandidate(
  candidatePath: string,
  searched: string[] = []
): { installDir: string; cliPath: string } | undefined {
  const absolute = resolve(candidatePath)
  searched.push(absolute)
  if (!existsSync(absolute)) return undefined

  try {
    const stat = statSync(absolute)
    if (!stat.isDirectory()) {
      return { installDir: dirname(absolute), cliPath: absolute }
    }

    const cliNames =
      process.platform === 'win32' ? DEFAULT_CLI_NAMES_WINDOWS : DEFAULT_CLI_NAMES_POSIX
    for (const cliName of cliNames) {
      const cliPath = join(absolute, cliName)
      searched.push(cliPath)
      if (existsSync(cliPath)) {
        return { installDir: absolute, cliPath }
      }
    }
  } catch {
    return undefined
  }
  return undefined
}
