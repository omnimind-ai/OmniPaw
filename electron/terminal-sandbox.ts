import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, isAbsolute, join, normalize, sep } from 'node:path'
import {
  checkWindowsDependenciesAsync,
  checkWindowsSandboxStatusAsync,
  installWindowsSandboxAsync,
  resolveSrtWin,
  SandboxManager,
  type SandboxRuntimeConfig,
  VENDORED_SRT_WIN_EXE,
} from '@anthropic-ai/sandbox-runtime'
import type {
  TerminalSandboxExecutionInput,
  TerminalSandboxLaunch,
  TerminalSandboxRunner,
} from '@core/agent/terminal'
import { TerminalSandboxError } from '@core/agent/terminal'
import type { Logger } from '@core/logging'
import type {
  InstallTerminalSandboxResponse,
  TerminalSandboxPlatform,
  TerminalSandboxStatus,
} from '@shared/types/local-agent'

interface SrtTerminalSandboxOptions {
  logger?: Logger
}

export class SrtTerminalSandbox implements TerminalSandboxRunner {
  private readonly logger?: Logger
  private tail: Promise<void> = Promise.resolve()
  private cleanupFailed = false

  constructor(options: SrtTerminalSandboxOptions = {}) {
    this.logger = options.logger
  }

  async getStatus(): Promise<TerminalSandboxStatus> {
    const checkedAt = Date.now()
    const platform = sandboxPlatform()
    if (this.cleanupFailed) {
      return status({
        platform,
        state: 'error',
        implementation: sandboxImplementation(platform),
        errors: ['Terminal sandbox cleanup failed. Restart the application before continuing.'],
        checkedAt,
      })
    }
    if (platform === 'unsupported' || !SandboxManager.isSupportedPlatform()) {
      return status({
        platform: 'unsupported',
        state: 'unsupported',
        implementation: 'none',
        errors: ['This operating system does not have a supported terminal sandbox backend.'],
        checkedAt,
      })
    }

    try {
      if (platform === 'windows') {
        const srtWin = resolveSrtWin({ path: resolveWindowsHelperPath() })
        const [dependencies, installed] = await Promise.all([
          checkWindowsDependenciesAsync({ srtWin }),
          checkWindowsSandboxStatusAsync({ srtWin }),
        ])
        const provisioned =
          installed.user.provisioned && installed.user.credPresent && installed.user.inSandboxGroup
        if (!provisioned) {
          return status({
            platform,
            state: 'setup_required',
            implementation: 'srt-windows',
            warnings: dependencies.warnings,
            errors: dependencies.errors,
            checkedAt,
          })
        }
        return status({
          platform,
          state: dependencies.errors.length ? 'error' : 'ready',
          implementation: 'srt-windows',
          installed: true,
          warnings: dependencies.warnings,
          errors: dependencies.errors,
          checkedAt,
        })
      }

      const dependencies = await SandboxManager.checkDependenciesAsync({ command: 'rg' })
      return status({
        platform,
        state: dependencies.errors.length ? 'dependency_missing' : 'ready',
        implementation: platform === 'macos' ? 'seatbelt' : 'bubblewrap',
        installed: dependencies.errors.length === 0,
        warnings: dependencies.warnings,
        errors: dependencies.errors,
        checkedAt,
      })
    } catch (error) {
      this.logger?.warn('Terminal sandbox status check failed.', {
        platform,
        errorCode: sandboxErrorCode(error),
      })
      return status({
        platform,
        state: 'error',
        implementation:
          platform === 'windows' ? 'srt-windows' : platform === 'macos' ? 'seatbelt' : 'bubblewrap',
        errors: [safeErrorMessage(error, 'Terminal sandbox status check failed.')],
        checkedAt,
      })
    }
  }

  install(): Promise<InstallTerminalSandboxResponse> {
    return this.exclusive(undefined, async () => {
      if (process.platform !== 'win32') {
        throw new TerminalSandboxError(
          'terminal_sandbox_install_failed',
          'Automatic terminal sandbox installation is only available on Windows.'
        )
      }
      try {
        const srtWin = resolveSrtWin({ path: resolveWindowsHelperPath() })
        const result = await installWindowsSandboxAsync({ srtWin })
        return {
          cancelled: result.cancelled === true,
          status: await this.getStatus(),
        }
      } catch (error) {
        throw new TerminalSandboxError(
          'terminal_sandbox_install_failed',
          safeErrorMessage(error, 'Terminal sandbox installation failed.'),
          { cause: error }
        )
      }
    })
  }

  run<T>(
    input: TerminalSandboxExecutionInput,
    execute: (launch: TerminalSandboxLaunch) => Promise<T>
  ): Promise<T> {
    return this.exclusive(input.signal, async () => {
      throwIfAborted(input.signal)
      const currentStatus = await this.getStatus()
      if (!currentStatus.ready) {
        const setupRequired = currentStatus.state === 'setup_required'
        throw new TerminalSandboxError(
          setupRequired ? 'terminal_sandbox_setup_required' : 'terminal_sandbox_unavailable',
          setupRequired
            ? 'The terminal sandbox needs one-time setup in Local Agent settings.'
            : currentStatus.errors[0] || 'The terminal sandbox is unavailable.'
        )
      }

      const runtimeConfig = buildRuntimeConfig(input)
      let outcome: { ok: true; value: T } | { ok: false; error: unknown }
      try {
        await SandboxManager.initialize(
          runtimeConfig,
          input.network === 'deny' ? undefined : async () => true
        )
        throwIfAborted(input.signal)
        const wrapped = await SandboxManager.wrapWithSandboxArgv(
          input.command,
          undefined,
          undefined,
          input.signal,
          input.cwd,
          {
            commandId: input.commandId,
            commandText: input.command,
          }
        )
        const launch: TerminalSandboxLaunch = {
          executable: wrapped.argv[0],
          args: wrapped.argv.slice(1),
          env: process.platform === 'win32' ? normalizeEnvironment(wrapped.env) : { ...input.env },
        }
        if (!launch.executable) {
          throw new Error('Terminal sandbox returned an empty executable.')
        }
        this.logger?.info('Sandboxed terminal command started.', {
          platform: sandboxPlatform(),
          network: input.network,
        })
        outcome = { ok: true, value: await execute(launch) }
      } catch (error) {
        outcome = {
          ok: false,
          error:
            error instanceof TerminalSandboxError
              ? error
              : new TerminalSandboxError(
                  'terminal_sandbox_unavailable',
                  safeErrorMessage(error, 'Sandboxed terminal execution failed.'),
                  { cause: error }
                ),
        }
      }

      const cleanupError = await cleanupSandboxRuntime()
      if (cleanupError) {
        this.cleanupFailed = true
        this.logger?.error('Terminal sandbox cleanup failed.', {
          platform: sandboxPlatform(),
          errorCode: sandboxErrorCode(cleanupError),
        })
      }
      if (!outcome.ok) throw outcome.error
      if (cleanupError) {
        throw new TerminalSandboxError(
          'terminal_sandbox_unavailable',
          'Terminal sandbox cleanup failed. Restart the application before continuing.',
          { cause: cleanupError }
        )
      }
      return outcome.value
    })
  }

  async dispose(): Promise<void> {
    await this.tail.catch(() => undefined)
    const cleanupError = await cleanupSandboxRuntime()
    if (cleanupError) {
      this.cleanupFailed = true
      throw cleanupError
    }
  }

  private async exclusive<T>(signal: AbortSignal | undefined, task: () => Promise<T>): Promise<T> {
    const previous = this.tail.catch(() => undefined)
    let release = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    this.tail = previous.then(() => gate)
    try {
      await waitForTurn(previous, signal)
      throwIfAborted(signal)
      return await task()
    } finally {
      release()
    }
  }
}

function buildRuntimeConfig(input: TerminalSandboxExecutionInput): SandboxRuntimeConfig {
  const home = homedir()
  const sensitivePaths = input.denyPatterns.map((pattern) =>
    isAbsolute(pattern) ? normalize(pattern) : join(input.workspaceFiles, normalizePattern(pattern))
  )
  const allowRead = uniqueExistingDirectories([
    input.workspaceRoot,
    ...pathDirectories(input.env.PATH),
  ])
  const denyRead = uniquePaths([home, ...sensitivePaths])
  const denyWrite = uniquePaths(sensitivePaths)

  return {
    network: {
      allowedDomains: [],
      deniedDomains: [],
      strictAllowlist: input.network === 'deny',
      allowLocalBinding: false,
    },
    filesystem: {
      denyRead,
      allowRead,
      allowWrite: uniquePaths([input.workspaceFiles, input.workspaceTmp]),
      denyWrite,
    },
    allowPty: false,
    enableWeakerNestedSandbox: false,
    ...(process.platform === 'win32'
      ? {
          windows: {
            srtWin: { path: resolveWindowsHelperPath() },
          },
        }
      : {}),
  }
}

function resolveWindowsHelperPath(): string {
  const candidates = [
    VENDORED_SRT_WIN_EXE.replace(`${sep}app.asar${sep}`, `${sep}app.asar.unpacked${sep}`),
    VENDORED_SRT_WIN_EXE,
  ]
  const resolved = candidates.find((candidate) => existsSync(candidate))
  if (!resolved) {
    throw new TerminalSandboxError(
      'terminal_sandbox_unavailable',
      'The bundled Windows terminal sandbox helper is missing.'
    )
  }
  return resolved
}

function pathDirectories(value: string | undefined): string[] {
  if (!value) return []
  return value
    .split(delimiter)
    .map((entry) => entry.trim().replace(/^"|"$/g, ''))
    .filter((entry) => isAbsolute(entry))
}

function uniqueExistingDirectories(paths: string[]): string[] {
  return uniquePaths(paths.filter((entry) => existsSync(entry)))
}

function uniquePaths(paths: Array<string | undefined>): string[] {
  const values = paths.filter((entry): entry is string => Boolean(entry?.trim())).map(normalize)
  return [...new Set(values)]
}

function normalizePattern(pattern: string): string {
  return pattern.replaceAll('/', sep).replaceAll('\\', sep)
}

function normalizeEnvironment(env: NodeJS.ProcessEnv): Record<string, string> {
  return Object.fromEntries(
    Object.entries(env).filter((entry): entry is [string, string] => typeof entry[1] === 'string')
  )
}

function sandboxPlatform(): TerminalSandboxPlatform {
  if (process.platform === 'win32') return 'windows'
  if (process.platform === 'darwin') return 'macos'
  if (process.platform === 'linux') return 'linux'
  return 'unsupported'
}

function sandboxImplementation(
  platform: TerminalSandboxPlatform
): TerminalSandboxStatus['implementation'] {
  if (platform === 'windows') return 'srt-windows'
  if (platform === 'macos') return 'seatbelt'
  if (platform === 'linux') return 'bubblewrap'
  return 'none'
}

async function cleanupSandboxRuntime(): Promise<unknown | undefined> {
  let cleanupError: unknown
  try {
    SandboxManager.cleanupAfterCommand()
  } catch (error) {
    cleanupError = error
  }
  try {
    await SandboxManager.reset()
  } catch (error) {
    cleanupError ??= error
  }
  return cleanupError
}

function status(input: {
  platform: TerminalSandboxPlatform
  state: TerminalSandboxStatus['state']
  implementation: TerminalSandboxStatus['implementation']
  installed?: boolean
  warnings?: string[]
  errors?: string[]
  checkedAt: number
}): TerminalSandboxStatus {
  const supported = input.platform !== 'unsupported'
  return {
    platform: input.platform,
    state: input.state,
    supported,
    ready: input.state === 'ready',
    installed: input.installed ?? input.state === 'ready',
    implementation: input.implementation,
    warnings: input.warnings ?? [],
    errors: input.errors ?? [],
    checkedAt: input.checkedAt,
  }
}

function waitForTurn(promise: Promise<void>, signal?: AbortSignal): Promise<void> {
  if (!signal) return promise
  if (signal.aborted) return Promise.reject(abortError())
  return new Promise((resolve, reject) => {
    const abort = () => reject(abortError())
    signal.addEventListener('abort', abort, { once: true })
    void promise.then(
      () => {
        signal.removeEventListener('abort', abort)
        resolve()
      },
      (error) => {
        signal.removeEventListener('abort', abort)
        reject(error)
      }
    )
  })
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortError()
}

function abortError(): Error {
  return new DOMException('Terminal sandbox operation was aborted.', 'AbortError')
}

function sandboxErrorCode(error: unknown): string | undefined {
  return error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
    ? error.code
    : undefined
}

function safeErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim() ? error.message : fallback
}
