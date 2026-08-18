import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, isAbsolute, join, normalize, relative, sep } from 'node:path'
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
import type { UtilityProcess } from 'electron'
import type {
  TerminalSandboxWorkerRequest,
  TerminalSandboxWorkerResponse,
} from './terminal-sandbox-protocol'

interface SrtTerminalSandboxOptions {
  logger?: Logger
}

export class SrtTerminalSandbox implements TerminalSandboxRunner {
  private readonly logger?: Logger
  private readonly broker: TerminalSandboxBroker
  private tail: Promise<void> = Promise.resolve()
  private cleanupFailed = false

  constructor(options: SrtTerminalSandboxOptions = {}) {
    this.logger = options.logger
    this.broker = new TerminalSandboxBroker(options.logger)
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
        const preparationStartedAt = Date.now()
        this.logger?.info('Terminal sandbox preparation started.', {
          platform: sandboxPlatform(),
          network: input.network,
        })
        const launch = await this.broker.prepare({
          runtimeConfig,
          allowNetwork: input.network !== 'deny',
          command: input.command,
          commandId: input.commandId,
          cwd: input.cwd,
        })
        throwIfAborted(input.signal)
        const normalizedLaunch: TerminalSandboxLaunch =
          process.platform === 'win32' ? launch : { ...launch, env: { ...input.env } }
        this.logger?.info('Terminal sandbox preparation completed.', {
          platform: sandboxPlatform(),
          durationMs: Date.now() - preparationStartedAt,
        })
        this.logger?.info('Sandboxed terminal command started.', {
          platform: sandboxPlatform(),
          network: input.network,
        })
        outcome = { ok: true, value: await execute(normalizedLaunch) }
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

      const cleanupStartedAt = Date.now()
      const cleanupError = await this.broker.cleanup().then(
        () => undefined,
        (error) => error
      )
      if (cleanupError) {
        this.cleanupFailed = true
        this.logger?.error('Terminal sandbox cleanup failed.', {
          platform: sandboxPlatform(),
          errorCode: sandboxErrorCode(cleanupError),
        })
      } else {
        this.logger?.info('Terminal sandbox cleanup completed.', {
          platform: sandboxPlatform(),
          durationMs: Date.now() - cleanupStartedAt,
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
    try {
      await this.broker.dispose()
    } catch (cleanupError) {
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

interface TerminalSandboxBrokerPrepareInput {
  runtimeConfig: SandboxRuntimeConfig
  allowNetwork: boolean
  command: string
  commandId: string
  cwd: string
}

interface PendingBrokerRequest {
  resolve: (response: TerminalSandboxWorkerResponse) => void
  reject: (error: Error) => void
  timer: NodeJS.Timeout
}

const SANDBOX_BROKER_TIMEOUT_MS = 120_000

class TerminalSandboxBroker {
  private child?: UtilityProcess
  private childReady?: Promise<UtilityProcess>
  private readonly pending = new Map<string, PendingBrokerRequest>()
  private failure?: Error
  private disposed = false

  constructor(private readonly logger?: Logger) {}

  async prepare(input: TerminalSandboxBrokerPrepareInput): Promise<TerminalSandboxLaunch> {
    const response = await this.send({
      id: crypto.randomUUID(),
      type: 'prepare',
      ...input,
    })
    if (!response.launch) {
      throw new Error('Terminal sandbox worker returned no launch configuration.')
    }
    return response.launch
  }

  async cleanup(): Promise<void> {
    if (!this.child && !this.childReady) return
    await this.send({ id: crypto.randomUUID(), type: 'cleanup' })
  }

  async dispose(): Promise<void> {
    if (this.disposed) return
    try {
      if (this.child || this.childReady) {
        await this.send({ id: crypto.randomUUID(), type: 'dispose' })
      }
    } finally {
      this.disposed = true
      this.child?.kill()
      this.child = undefined
      this.childReady = undefined
    }
  }

  private async send(
    request: TerminalSandboxWorkerRequest
  ): Promise<TerminalSandboxWorkerResponse & { ok: true }> {
    if (this.disposed) throw new Error('Terminal sandbox worker is disposed.')
    if (this.failure) throw this.failure
    const child = await this.ensureProcess()

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const error = new Error(
          `Terminal sandbox worker timed out during ${request.type} after ${SANDBOX_BROKER_TIMEOUT_MS}ms.`
        )
        this.fail(error)
      }, SANDBOX_BROKER_TIMEOUT_MS)
      this.pending.set(request.id, {
        timer,
        resolve: (response) => {
          if (response.ok) resolve(response)
          else reject(new Error(response.error))
        },
        reject,
      })
      try {
        child.postMessage(request)
      } catch (error) {
        this.pending.delete(request.id)
        clearTimeout(timer)
        reject(error instanceof Error ? error : new Error(String(error)))
      }
    })
  }

  private ensureProcess(): Promise<UtilityProcess> {
    if (this.child) return Promise.resolve(this.child)
    if (this.childReady) return this.childReady
    if (this.failure) return Promise.reject(this.failure)

    this.childReady = this.startProcess().catch((error) => {
      this.childReady = undefined
      throw error
    })
    return this.childReady
  }

  private async startProcess(): Promise<UtilityProcess> {
    const { utilityProcess } = await import('electron')
    const scriptPath = join(__dirname, 'workers/terminal-sandbox.cjs')
    return new Promise<UtilityProcess>((resolve, reject) => {
      let child: UtilityProcess
      try {
        child = utilityProcess.fork(scriptPath, [], {
          serviceName: 'omnipaw-terminal-sandbox',
        })
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)))
        return
      }

      let spawned = false
      child.once('spawn', () => {
        spawned = true
        this.child = child
        this.logger?.info('Terminal sandbox worker started.', { pid: child.pid })
        resolve(child)
      })
      child.on('message', (message: TerminalSandboxWorkerResponse) => {
        const pending = this.pending.get(message.id)
        if (!pending) return
        this.pending.delete(message.id)
        clearTimeout(pending.timer)
        pending.resolve(message)
      })
      child.on('exit', (code) => {
        this.child = undefined
        this.childReady = undefined
        if (this.disposed) return
        const error = new Error(`Terminal sandbox worker exited with code ${code}.`)
        if (!spawned) reject(error)
        this.fail(error, false)
      })
    })
  }

  private fail(error: Error, terminate = true): void {
    this.failure ??= error
    if (terminate) this.child?.kill()
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer)
      pending.reject(this.failure)
    }
    this.pending.clear()
    this.logger?.error('Terminal sandbox worker failed.', {
      errorCode: sandboxErrorCode(error),
    })
  }
}

function buildRuntimeConfig(input: TerminalSandboxExecutionInput): SandboxRuntimeConfig {
  const home = homedir()
  const sensitivePaths = input.denyPatterns.map((pattern) =>
    isAbsolute(pattern) ? normalize(pattern) : join(input.workspaceFiles, normalizePattern(pattern))
  )
  const executableDirectories = pathDirectories(input.env.PATH)
  const allowRead = uniqueExistingDirectories([
    input.workspaceRoot,
    ...(process.platform === 'win32'
      ? executableDirectories.filter((entry) => isWithinDirectory(home, entry))
      : executableDirectories),
  ])
  // The Windows sandbox account has no inherited access to the real user's profile.
  // Stamping the whole profile again can make srt-win traverse it for minutes, so
  // Windows only stamps the workspace-specific sensitive entries.
  const denyRead = uniquePaths(
    process.platform === 'win32' ? sensitivePaths : [home, ...sensitivePaths]
  )
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

function isWithinDirectory(parent: string, candidate: string): boolean {
  const child = relative(parent, candidate)
  return child === '' || (!child.startsWith(`..${sep}`) && child !== '..' && !isAbsolute(child))
}

function normalizePattern(pattern: string): string {
  return pattern.replaceAll('/', sep).replaceAll('\\', sep)
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
