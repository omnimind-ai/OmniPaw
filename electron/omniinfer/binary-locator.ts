import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import type { App } from 'electron'

const DEFAULT_BINARY_NAMES_WINDOWS = [
  'OmniInfer.exe',
  'omniinfer.exe',
  'omniinfer-cli.exe',
  'omniinfer_gateway.exe',
]
const DEFAULT_BINARY_NAMES_POSIX = ['OmniInfer', 'omniinfer', 'omniinfer-cli', 'omniinfer_gateway']

export interface LocateBinaryContext {
  app: App
  /** Override repo root path; used for tests / migration. */
  repoRoot?: string
}

export interface LocateBinaryResult {
  binaryPath?: string
  searched: string[]
  envOverride?: string
}

/**
 * Locate the OmniInfer binary. Precedence:
 *   1. `OMNICLAW_OMNIINFER_PATH` env var (absolute path)
 *   2. `<repoRoot>/resources/omniinfer/<binaryName>` (dev mode)
 *   3. `<process.resourcesPath>/omniinfer/<binaryName>` (packaged)
 *   4. Common Tauri-style layouts as fallback
 */
export function locateOmniInferBinary(ctx: LocateBinaryContext): LocateBinaryResult {
  const envOverride = process.env.OMNICLAW_OMNIINFER_PATH?.trim()
  const candidates: string[] = []

  if (envOverride && existsSync(envOverride)) {
    return { binaryPath: envOverride, searched: [envOverride], envOverride }
  }

  const binaryNames =
    process.platform === 'win32' ? DEFAULT_BINARY_NAMES_WINDOWS : DEFAULT_BINARY_NAMES_POSIX
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
    for (const binary of binaryNames) {
      const candidate = resolve(dir, binary)
      searched.push(candidate)
      if (existsSync(candidate)) {
        return { binaryPath: candidate, searched, envOverride: undefined }
      }
    }
  }

  return { binaryPath: undefined, searched, envOverride: undefined }
}
