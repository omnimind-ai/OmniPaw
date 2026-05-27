import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

export const OPENOMNICLAW_DATA_ROOT_DIR = 'openomniclaw'
export const OPENOMNICLAW_DEFAULT_APP_NAME = 'OpenOmniClaw'

export interface ResolveDataRootOptions {
  appDataPath?: string
  dataRootPath?: string
}

export interface OpenOmniClawDataPaths {
  root: string
  configRoot: string
  config: string
  providerRegistry: string
  personaRegistry: string
  database: string
  mcpRegistry: string
  skillState: string
  skills: string
  attachments: string
  agentWorkspaces: string
  agentWorkspaceSessions: string
  logs: string
  observationTemp: string
}

export function resolveOpenOmniClawDataRoot(options: ResolveDataRootOptions = {}): string {
  if (options.dataRootPath) {
    return resolve(options.dataRootPath)
  }

  const overrideRoot = process.env.OPENOMNICLAW_DATA_DIR?.trim()
  if (overrideRoot) {
    return resolve(overrideRoot)
  }

  const appDataPath = options.appDataPath ?? resolveElectronAppDataPath()
  if (appDataPath) {
    return join(appDataPath, OPENOMNICLAW_DATA_ROOT_DIR)
  }

  const fallbackBase = process.env.XDG_DATA_HOME ?? join(homedir(), '.local', 'share')
  return join(fallbackBase, OPENOMNICLAW_DATA_ROOT_DIR)
}

export function resolveOpenOmniClawDataPaths(
  options: ResolveDataRootOptions = {}
): OpenOmniClawDataPaths {
  const root = resolveOpenOmniClawDataRoot(options)
  const configRoot = join(root, 'config')
  return {
    root,
    configRoot,
    config: join(configRoot, 'config.json'),
    providerRegistry: join(configRoot, 'providers.json'),
    personaRegistry: join(configRoot, 'personas.json'),
    database: join(root, 'openomniclaw.sqlite3'),
    mcpRegistry: join(configRoot, 'mcp_server.json'),
    skillState: join(root, 'skill_state.json'),
    skills: join(root, 'skills'),
    attachments: join(root, 'attachments'),
    agentWorkspaces: join(root, 'agent-workspaces'),
    agentWorkspaceSessions: join(root, 'agent-workspaces', 'sessions'),
    logs: join(root, 'logs'),
    observationTemp: join(root, 'tmp', 'observations'),
  }
}

export function resolveStoreDataRoot(options: {
  appDataPath?: string
  appName?: string
  dataRootPath?: string
}): string {
  if (options.dataRootPath) {
    return resolveOpenOmniClawDataRoot({ dataRootPath: options.dataRootPath })
  }

  if (options.appDataPath && options.appName && options.appName !== OPENOMNICLAW_DEFAULT_APP_NAME) {
    return join(options.appDataPath, options.appName)
  }

  return resolveOpenOmniClawDataRoot({ appDataPath: options.appDataPath })
}

function resolveElectronAppDataPath(): string | undefined {
  try {
    const require = createRequire(import.meta.url)
    const electron = require('electron') as {
      app?: {
        isReady?: () => boolean
        getPath?: (name: 'appData') => string
      }
    }
    if (electron.app?.isReady?.() && electron.app.getPath) {
      return electron.app.getPath('appData')
    }
  } catch {
    // Non-Electron smoke scripts use the filesystem fallback above.
  }
  return undefined
}
