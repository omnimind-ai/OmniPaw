import { type ChildProcess, spawn } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { existsSync, mkdirSync, statSync } from 'node:fs'
import { dirname, extname, join, resolve } from 'node:path'
import type { Logger } from '@core/logging'
import type {
  OmniInferBackendInstallProgressListener,
  OmniInferProcessController,
  OmniInferProcessExitListener,
  OmniInferProcessLogListener,
  OmniInferProcessStateListener,
  OmniInferProcessStopOptions,
} from '@core/omniinfer/process-controller'
import {
  OMNIINFER_DEFAULT_BASE_URL,
  type OmniInferRuntimeClient,
} from '@core/omniinfer/runtime-client'
import type {
  OmniInferBackendInstallProgress,
  OmniInferBackendSetupStatus,
  OmniInferLogEntry,
  OmniInferProcessSnapshot,
  OmniInferProcessState,
} from '@shared/types/omniinfer'
import { cleanupStaleOmniInferProcesses } from './windows-cleanup'

const DEFAULT_PORT = 19157
const DEFAULT_HOST = '127.0.0.1'
const CREATE_NO_WINDOW = 0x0800_0000
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

export interface OmniInferProcessOptions {
  /** Absolute path to OmniInfer project/install directory; undefined -> `not_bundled`. */
  installDir?: string
  /** Writable OmniInfer state root, kept outside the application/install directory. */
  stateRoot: string
  /** Writable backend runtime root, kept outside the application/install directory. */
  runtimeRoot: string
  modelsDir: string
  logsDir: string
  /** Client used for graceful `/omni/shutdown` calls during stop(). */
  client: OmniInferRuntimeClient
  port?: number
  host?: string
  apiKey?: string
  logger?: Logger
  now?: () => number
}

export class OmniInferProcess implements OmniInferProcessController {
  private state: OmniInferProcessSnapshot
  private child?: ChildProcess
  private managedDataDirectoriesSupported?: boolean
  private readonly emitter = new EventEmitter()
  private readonly options: Required<
    Omit<OmniInferProcessOptions, 'logger' | 'installDir' | 'apiKey' | 'client' | 'now'>
  > & {
    installDir?: string
    cliPath?: string
    apiKey?: string
    logger?: Logger
    client: OmniInferRuntimeClient
    now: () => number
  }

  constructor(options: OmniInferProcessOptions) {
    this.options = {
      installDir: options.installDir,
      stateRoot: options.stateRoot,
      runtimeRoot: options.runtimeRoot,
      modelsDir: options.modelsDir,
      logsDir: options.logsDir,
      client: options.client,
      port: options.port ?? DEFAULT_PORT,
      host: options.host ?? DEFAULT_HOST,
      apiKey: options.apiKey,
      logger: options.logger,
      now: options.now ?? Date.now,
    }
    const initialState: OmniInferProcessState = options.installDir ? 'stopped' : 'not_bundled'
    this.state = {
      state: initialState,
      installDir: options.installDir,
      modelsDir: options.modelsDir,
      lastUpdatedAt: this.options.now(),
    }
    try {
      mkdirSync(this.options.stateRoot, { recursive: true })
      mkdirSync(this.options.runtimeRoot, { recursive: true })
      mkdirSync(this.options.logsDir, { recursive: true })
    } catch {
      // ignored
    }
    this.emitter.setMaxListeners(50)
  }

  getState(): OmniInferProcessSnapshot {
    return { ...this.state }
  }

  async inspectBackends(): Promise<OmniInferBackendSetupStatus> {
    const resolvedCli = this.resolveRuntimeCli()
    const env = this.buildRuntimeEnv()
    const managedDataDirectoriesSupported = await this.detectManagedDataDirectoriesSupport(
      resolvedCli,
      env
    )
    try {
      const advisor = await runCliCommand({
        cliPath: resolvedCli.cliPath,
        installDir: resolvedCli.installDir,
        args: this.buildCompatibleArgs(
          ['advisor', 'system', '--json'],
          managedDataDirectoriesSupported
        ),
        env,
      })
      return parseAdvisorSystemOutput(advisor.stdout, defaultBaseBackend())
    } catch (error) {
      this.options.logger?.warn?.(
        'OmniInfer advisor inspection failed; backend list compatibility mode will be used.',
        { error }
      )
      return this.inspectBackendsFromLists(resolvedCli, env, managedDataDirectoriesSupported)
    }
  }

  async installBackend(
    backend: string,
    onProgress?: OmniInferBackendInstallProgressListener
  ): Promise<OmniInferBackendSetupStatus> {
    const normalizedBackend = backend.trim()
    if (!/^[A-Za-z0-9._-]+$/.test(normalizedBackend)) {
      throw new Error('Invalid OmniInfer backend identifier.')
    }
    const setup = await this.inspectBackends()
    if (setup.installedBackends.includes(normalizedBackend)) {
      return setup
    }
    if (!setup.compatibleBackends.includes(normalizedBackend)) {
      throw new Error(`OmniInfer backend is unavailable on this device: ${normalizedBackend}`)
    }

    const resolvedCli = this.resolveRuntimeCli()
    const env = this.buildRuntimeEnv()
    const managedDataDirectoriesSupported = await this.detectManagedDataDirectoriesSupport(
      resolvedCli,
      env
    )
    const installArgs = await this.resolveBackendInstallArgs(
      resolvedCli,
      env,
      normalizedBackend,
      managedDataDirectoriesSupported
    )
    await runCliCommand({
      cliPath: resolvedCli.cliPath,
      installDir: resolvedCli.installDir,
      args: installArgs,
      env,
      onStdout: (line) => {
        this.emitLog('stdout', line)
        const progress = parseBackendInstallProgress(line)
        if (progress) onProgress?.(progress)
      },
      onStderr: (line) => this.emitLog('stderr', line),
    })
    return this.inspectBackends()
  }

  getLogsPath(): string | undefined {
    return this.options.logsDir
  }

  setInstallDir(installDir: string | undefined): void {
    this.options.installDir = installDir
    this.options.cliPath = undefined
    this.managedDataDirectoriesSupported = undefined
    if (this.state.state === 'not_bundled' && installDir) {
      this.transition({ state: 'stopped', installDir, cliPath: undefined })
    } else if (!installDir && this.state.state === 'stopped') {
      this.transition({ state: 'not_bundled', installDir: undefined, cliPath: undefined })
    } else {
      this.transition({ installDir, cliPath: undefined })
    }
  }

  setModelsDir(dir: string): void {
    this.options.modelsDir = dir
    this.transition({ modelsDir: dir })
  }

  setEndpoint(endpoint: { host: string; port: number }): void {
    if (!endpoint.host || !Number.isFinite(endpoint.port)) return
    this.options.host = endpoint.host
    this.options.port = Math.round(endpoint.port)
  }

  async start(): Promise<OmniInferProcessSnapshot> {
    if (!this.options.installDir) {
      this.transition({ state: 'not_bundled' })
      return this.getState()
    }
    if (this.state.state === 'running' || this.state.state === 'starting') {
      return this.getState()
    }
    const resolvedCli = resolveConfiguredCli(this.options.installDir)
    if (!resolvedCli) {
      this.transition({
        state: 'not_bundled',
        errorMessage: `OmniInfer startup script not found: ${this.options.installDir}`,
      })
      return this.getState()
    }
    this.options.installDir = resolvedCli.installDir
    this.options.cliPath = resolvedCli.cliPath
    this.transition({ installDir: resolvedCli.installDir, cliPath: resolvedCli.cliPath })

    if (process.platform === 'win32') {
      await cleanupStaleOmniInferProcesses({
        cliPath: resolvedCli.cliPath,
        installDir: resolvedCli.installDir,
        port: this.options.port,
        logger: this.options.logger,
      })
    }

    this.transition({ state: 'starting', errorMessage: undefined })

    const env = this.buildRuntimeEnv()
    const managedDataDirectoriesSupported = await this.detectManagedDataDirectoriesSupport(
      resolvedCli,
      env
    )

    const command = buildServeCommand(
      resolvedCli.cliPath,
      this.buildArgs(managedDataDirectoriesSupported)
    )
    const spawnOptions: Parameters<typeof spawn>[2] = {
      cwd: resolvedCli.installDir,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    }
    if (process.platform === 'win32') {
      ;(spawnOptions as { creationFlags?: number }).creationFlags = CREATE_NO_WINDOW
    }

    const child = spawn(command.command, command.args, spawnOptions)
    this.child = child
    this.options.logger?.info('OmniInfer process spawned.', {
      installDir: resolvedCli.installDir,
      cliPath: resolvedCli.cliPath,
      pid: child.pid,
      command: command.command,
      args: command.args,
    })
    this.transition({ pid: child.pid, state: 'running', errorMessage: undefined })

    child.stdout?.setEncoding('utf8')
    child.stderr?.setEncoding('utf8')
    attachLineReader(child.stdout, (line) => this.emitLog('stdout', line))
    attachLineReader(child.stderr, (line) => this.emitLog('stderr', line))

    child.on('error', (error) => {
      this.options.logger?.error('OmniInfer process error.', { error })
      this.transition({
        state: 'crashed',
        errorMessage: error.message,
      })
      this.emitter.emit('exit', this.getState())
    })
    child.on('exit', (code, signal) => {
      this.options.logger?.info('OmniInfer process exited.', { code, signal })
      this.child = undefined
      const isClean = this.state.state === 'stopped'
      this.transition({
        state: isClean ? 'stopped' : code === 0 ? 'stopped' : 'crashed',
        exitCode: code,
        signal: signal,
      })
      this.emitter.emit('exit', this.getState())
    })

    return this.getState()
  }

  async stop(options: OmniInferProcessStopOptions = {}): Promise<OmniInferProcessSnapshot> {
    const child = this.child
    if (!child || child.exitCode !== null) {
      this.transition({ state: 'stopped' })
      return this.getState()
    }

    const shutdownTimeoutMs = options.shutdownTimeoutMs ?? 3_000
    this.transition({ state: 'stopped' })

    try {
      await Promise.race([
        this.options.client.shutdown(),
        new Promise<void>((resolve) => setTimeout(resolve, shutdownTimeoutMs)),
      ])
    } catch (error) {
      this.options.logger?.debug?.('OmniInfer graceful shutdown rejected.', { error })
    }

    // Give the child a moment to exit cleanly after /omni/shutdown.
    const exited = await waitForExit(child, 2_000)
    if (!exited) {
      try {
        child.kill('SIGTERM')
      } catch (error) {
        this.options.logger?.warn?.('OmniInfer SIGTERM failed.', { error })
      }
      const exitedAfterSigterm = await waitForExit(child, 2_000)
      if (!exitedAfterSigterm) {
        try {
          child.kill('SIGKILL')
        } catch (error) {
          this.options.logger?.warn?.('OmniInfer SIGKILL failed.', { error })
        }
      }
    }

    if (process.platform === 'win32' && this.options.cliPath) {
      await cleanupStaleOmniInferProcesses({
        cliPath: this.options.cliPath,
        installDir: this.options.installDir,
        port: this.options.port,
        logger: this.options.logger,
      })
    }

    return this.getState()
  }

  onLog(listener: OmniInferProcessLogListener): () => void {
    this.emitter.on('log', listener)
    return () => {
      this.emitter.off('log', listener)
    }
  }

  onExit(listener: OmniInferProcessExitListener): () => void {
    this.emitter.on('exit', listener)
    return () => {
      this.emitter.off('exit', listener)
    }
  }

  onStateChanged(listener: OmniInferProcessStateListener): () => void {
    this.emitter.on('state', listener)
    return () => {
      this.emitter.off('state', listener)
    }
  }

  private buildArgs(managedDataDirectoriesSupported: boolean): string[] {
    const args: string[] = [
      'serve',
      '--port',
      String(this.options.port),
      '--host',
      this.options.host,
    ]
    args.push('--window-mode', 'hidden')
    if (this.options.apiKey) {
      args.push('--api-key', this.options.apiKey)
    }
    return this.buildCompatibleArgs(args, managedDataDirectoriesSupported)
  }

  private buildRuntimeEnv(): NodeJS.ProcessEnv {
    return {
      ...process.env,
      OMNIINFER_MODELS_DIR: this.options.modelsDir,
      OMNIINFER_LLAMA_CPP_CPU_MODELS_DIR: this.options.modelsDir,
      OMNIINFER_LLAMA_CPP_GPU_MODELS_DIR: this.options.modelsDir,
      OMNIINFER_SERVE_DIRECT: '1',
    }
  }

  private resolveRuntimeCli(): { installDir: string; cliPath: string } {
    if (!this.options.installDir) {
      throw new Error('OmniInfer is not bundled in this application.')
    }
    const resolvedCli = resolveConfiguredCli(this.options.installDir)
    if (!resolvedCli) {
      throw new Error(`OmniInfer startup script not found: ${this.options.installDir}`)
    }
    this.options.installDir = resolvedCli.installDir
    this.options.cliPath = resolvedCli.cliPath
    this.transition({ installDir: resolvedCli.installDir, cliPath: resolvedCli.cliPath })
    return resolvedCli
  }

  private async inspectBackendsFromLists(
    resolvedCli: { installDir: string; cliPath: string },
    env: NodeJS.ProcessEnv,
    managedDataDirectoriesSupported: boolean
  ): Promise<OmniInferBackendSetupStatus> {
    const [installedResult, compatibleResult] = await Promise.all([
      runCliCommand({
        cliPath: resolvedCli.cliPath,
        installDir: resolvedCli.installDir,
        args: this.buildCompatibleArgs(
          ['backend', 'list', '--scope', 'installed'],
          managedDataDirectoriesSupported
        ),
        env,
      }),
      runCliCommand({
        cliPath: resolvedCli.cliPath,
        installDir: resolvedCli.installDir,
        args: this.buildCompatibleArgs(
          ['backend', 'list', '--scope', 'compatible'],
          managedDataDirectoriesSupported
        ),
        env,
      }),
    ])
    const baseBackend = defaultBaseBackend()
    const installedBackends = parseBackendTable(installedResult.stdout)
    const compatibleBackends = parseBackendTable(compatibleResult.stdout).filter(
      (backend) => !backend.startsWith('ik_')
    )
    return {
      baseBackend,
      baseBackendInstalled: installedBackends.includes(baseBackend),
      recommendedBackend: compatibleBackends.find(
        (backend) => backend !== baseBackend && !installedBackends.includes(backend)
      ),
      recommendedInstalledBackend: installedBackends[0],
      compatibleBackends,
      installedBackends,
    }
  }

  private buildCompatibleArgs(args: string[], managedDataDirectoriesSupported: boolean): string[] {
    if (!managedDataDirectoriesSupported) return args
    return buildManagedCliArgs(this.options.stateRoot, this.options.runtimeRoot, args)
  }

  private async detectManagedDataDirectoriesSupport(
    resolvedCli: { installDir: string; cliPath: string },
    env: NodeJS.ProcessEnv
  ): Promise<boolean> {
    if (this.managedDataDirectoriesSupported !== undefined) {
      return this.managedDataDirectoriesSupported
    }

    try {
      const help = await runCliCommand({
        cliPath: resolvedCli.cliPath,
        installDir: resolvedCli.installDir,
        args: ['--help'],
        env,
      })
      const supported = supportsManagedDataDirectories(`${help.stdout}\n${help.stderr}`)
      this.managedDataDirectoriesSupported = supported
      if (!supported) {
        this.options.logger?.warn?.(
          'OmniInfer CLI does not expose managed data directory arguments; compatibility arguments will be used.',
          { cliPath: resolvedCli.cliPath }
        )
      }
      return supported
    } catch (error) {
      this.options.logger?.warn?.(
        'OmniInfer CLI capability detection failed; managed data directory arguments will be preserved.',
        { error, cliPath: resolvedCli.cliPath }
      )
      this.managedDataDirectoriesSupported = true
      return true
    }
  }

  private async resolveBackendInstallArgs(
    resolvedCli: { installDir: string; cliPath: string },
    env: NodeJS.ProcessEnv,
    backend: string,
    managedDataDirectoriesSupported: boolean
  ): Promise<string[]> {
    const legacyInstallArgs = ['backend', 'install', backend, '--json']
    try {
      const help = await runCliCommand({
        cliPath: resolvedCli.cliPath,
        installDir: resolvedCli.installDir,
        args: this.buildCompatibleArgs(['backend', '--help'], managedDataDirectoriesSupported),
        env,
      })
      const helpOutput = `${help.stdout}\n${help.stderr}`
      const args = supportsBackendInstallCommand(helpOutput)
        ? legacyInstallArgs
        : ['build', backend, '--prebuilt']
      return this.buildCompatibleArgs(args, managedDataDirectoriesSupported)
    } catch (error) {
      this.options.logger?.warn?.(
        'OmniInfer backend command detection failed; the legacy installation command will be used.',
        { error }
      )
      return this.buildCompatibleArgs(legacyInstallArgs, managedDataDirectoriesSupported)
    }
  }

  private transition(patch: Partial<OmniInferProcessSnapshot>): void {
    const previous = this.state.state
    const next: OmniInferProcessSnapshot = {
      ...this.state,
      ...patch,
      previousState: previous,
      lastUpdatedAt: this.options.now(),
    }
    this.state = next
    this.emitter.emit('state', this.getState())
  }

  private emitLog(stream: 'stdout' | 'stderr', message: string): void {
    if (!message.trim()) return
    const upper = message.toUpperCase()
    const level: OmniInferLogEntry['level'] = upper.includes('ERROR')
      ? 'error'
      : upper.includes('WARN')
        ? 'warn'
        : stream === 'stderr'
          ? 'warn'
          : 'info'
    const entry: OmniInferLogEntry = {
      stream,
      level,
      message,
      timestamp: this.options.now(),
    }
    this.emitter.emit('log', entry)
    if (level === 'error') {
      this.options.logger?.error('OmniInfer process log.', { stream, message })
    } else if (level === 'warn') {
      this.options.logger?.warn?.('OmniInfer process log.', { stream, message })
    } else {
      this.options.logger?.debug?.('OmniInfer process log.', { stream, message })
    }
  }
}

function attachLineReader(
  stream: NodeJS.ReadableStream | null | undefined,
  onLine: (line: string) => void
): void {
  if (!stream) return
  let buffer = ''
  stream.on('data', (chunk: string | Buffer) => {
    buffer += chunk.toString()
    let idx = buffer.indexOf('\n')
    while (idx !== -1) {
      const line = buffer.slice(0, idx).replace(/\r$/, '')
      buffer = buffer.slice(idx + 1)
      onLine(line)
      idx = buffer.indexOf('\n')
    }
  })
  stream.on('end', () => {
    if (buffer.length > 0) {
      onLine(buffer)
      buffer = ''
    }
  })
}

function buildServeCommand(
  cliPath: string,
  serveArgs: string[]
): { command: string; args: string[] } {
  const extension = extname(cliPath).toLowerCase()
  if (extension === '.py') {
    const python =
      process.env.OMNIPAW_OMNIINFER_PYTHON ?? (process.platform === 'win32' ? 'python' : 'python3')
    return { command: python, args: [cliPath, ...serveArgs] }
  }
  if (extension === '.ps1') {
    return {
      command: 'powershell.exe',
      args: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', cliPath, ...serveArgs],
    }
  }
  if (extension === '.cmd' || extension === '.bat') {
    return {
      command: 'cmd.exe',
      args: ['/d', '/s', '/c', `"${cliPath}" ${serveArgs.map(quoteCmdArg).join(' ')}`],
    }
  }
  return { command: cliPath, args: serveArgs }
}

interface RunCliCommandOptions {
  cliPath: string
  installDir: string
  args: string[]
  env: NodeJS.ProcessEnv
  onStdout?: (line: string) => void
  onStderr?: (line: string) => void
}

async function runCliCommand(
  options: RunCliCommandOptions
): Promise<{ stdout: string; stderr: string }> {
  const command = buildServeCommand(options.cliPath, options.args)
  const spawnOptions: Parameters<typeof spawn>[2] = {
    cwd: options.installDir,
    env: options.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  }
  if (process.platform === 'win32') {
    ;(spawnOptions as { creationFlags?: number }).creationFlags = CREATE_NO_WINDOW
  }

  return new Promise((resolvePromise, reject) => {
    const child = spawn(command.command, command.args, spawnOptions)
    let stdout = ''
    let stderr = ''
    child.stdout?.setEncoding('utf8')
    child.stderr?.setEncoding('utf8')
    attachLineReader(child.stdout, (line) => {
      stdout += `${line}\n`
      options.onStdout?.(line)
    })
    attachLineReader(child.stderr, (line) => {
      stderr += `${line}\n`
      options.onStderr?.(line)
    })
    child.on('error', reject)
    child.on('close', (code, signal) => {
      if (code === 0) {
        resolvePromise({ stdout, stderr })
        return
      }
      reject(
        new Error(
          `OmniInfer command exited with ${code ?? signal ?? 'unknown'}: ${
            stderr.trim() || stdout.trim() || command.command
          }`
        )
      )
    })
  })
}

export function parseBackendTable(output: string): string[] {
  const lines = output.split(/\r?\n/)
  const separatorIndex = lines.findIndex((line) => /^\s*-{3,}/.test(line))
  if (separatorIndex < 0) return []
  return lines
    .slice(separatorIndex + 1)
    .map((line) => /^\s*([A-Za-z0-9._-]+)(?:\s{2,}.*)?\s*$/.exec(line)?.[1])
    .filter((value): value is string => Boolean(value))
}

export function parseAdvisorSystemOutput(
  output: string,
  baseBackend = defaultBaseBackend()
): OmniInferBackendSetupStatus {
  const payload = JSON.parse(output.trim()) as {
    backends?: Array<{
      id?: unknown
      installed?: unknown
      compatibility?: unknown
      hardware_compatible?: unknown
      prebuilt_installable?: unknown
    }>
    summary?: {
      compatible_backends?: unknown
      installed_backends?: unknown
      recommended_backend_to_install?: unknown
      recommended_installed_backend?: unknown
    }
  }
  const backends = Array.isArray(payload.backends) ? payload.backends : []
  const summary = payload.summary ?? {}
  const installedBackends = stringArray(summary.installed_backends)
  const compatibleFromInventory = backends
    .filter(
      (entry) =>
        typeof entry.id === 'string' &&
        entry.compatibility !== 'incompatible' &&
        entry.hardware_compatible !== false &&
        (entry.prebuilt_installable === true || entry.installed === true)
    )
    .map((entry) => entry.id as string)
  const compatibleBackends =
    compatibleFromInventory.length > 0
      ? compatibleFromInventory
      : stringArray(summary.compatible_backends).filter((backend) => !backend.startsWith('ik_'))
  const recommendedCandidate = stringValue(summary.recommended_backend_to_install)
  const recommendedBackend =
    recommendedCandidate && compatibleBackends.includes(recommendedCandidate)
      ? recommendedCandidate
      : compatibleBackends.find(
          (backend) => backend !== baseBackend && !installedBackends.includes(backend)
        )

  return {
    baseBackend,
    baseBackendInstalled: installedBackends.includes(baseBackend),
    recommendedBackend,
    recommendedInstalledBackend: stringValue(summary.recommended_installed_backend),
    compatibleBackends,
    installedBackends,
  }
}

export function parseBackendInstallProgress(
  line: string
): OmniInferBackendInstallProgress | undefined {
  let payload: Record<string, unknown>
  try {
    payload = JSON.parse(line) as Record<string, unknown>
  } catch {
    return undefined
  }
  if (typeof payload.event !== 'string') return undefined
  return {
    event: payload.event,
    backend: stringValue(payload.backend),
    assetCount: numberValue(payload.asset_count),
    assetIndex: numberValue(payload.asset_index),
    bytesDownloaded: numberValue(payload.bytes_downloaded),
    bytesTotal: numberValue(payload.bytes_total),
    message: stringValue(payload.error) ?? stringValue(payload.message),
  }
}

export function supportsManagedDataDirectories(helpOutput: string): boolean {
  return helpOutput.includes('--state-root') && helpOutput.includes('--runtime-root')
}

export function supportsBackendInstallCommand(helpOutput: string): boolean {
  return /\binstall\b/i.test(helpOutput)
}

export function buildManagedCliArgs(
  stateRoot: string,
  runtimeRoot: string,
  args: string[]
): string[] {
  return ['--state-root', stateRoot, '--runtime-root', runtimeRoot, ...args]
}

function defaultBaseBackend(platform: NodeJS.Platform = process.platform): string {
  return platform === 'darwin' ? 'llama.cpp-mac' : 'llama.cpp-cpu'
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : []
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function quoteCmdArg(value: string): string {
  return /^[A-Za-z0-9._:/=-]+$/.test(value) ? value : `"${value.replace(/"/g, '\\"')}"`
}

function resolveConfiguredCli(
  configuredPath: string
): { installDir: string; cliPath: string } | undefined {
  if (!existsSync(configuredPath)) return undefined
  try {
    const absolute = resolve(configuredPath)
    const stat = statSync(absolute)
    if (!stat.isDirectory()) {
      return { installDir: dirname(absolute), cliPath: absolute }
    }
    const cliNames =
      process.platform === 'win32' ? DEFAULT_CLI_NAMES_WINDOWS : DEFAULT_CLI_NAMES_POSIX
    for (const cliName of cliNames) {
      const candidate = join(absolute, cliName)
      if (existsSync(candidate)) {
        return { installDir: absolute, cliPath: candidate }
      }
    }
  } catch {
    return undefined
  }
  return undefined
}

function waitForExit(child: ChildProcess, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    if (child.exitCode !== null) {
      resolve(true)
      return
    }
    const timer = setTimeout(() => {
      child.off('exit', onExit)
      resolve(false)
    }, timeoutMs)
    const onExit = () => {
      clearTimeout(timer)
      resolve(true)
    }
    child.once('exit', onExit)
  })
}

export { OMNIINFER_DEFAULT_BASE_URL }
