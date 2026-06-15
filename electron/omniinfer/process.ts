import { type ChildProcess, spawn } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { existsSync, mkdirSync, statSync } from 'node:fs'
import { dirname, extname, join, resolve } from 'node:path'
import type { Logger } from '@core/logging'
import type {
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
      mkdirSync(this.options.logsDir, { recursive: true })
    } catch {
      // ignored
    }
    this.emitter.setMaxListeners(50)
  }

  getState(): OmniInferProcessSnapshot {
    return { ...this.state }
  }

  getLogsPath(): string | undefined {
    return this.options.logsDir
  }

  setInstallDir(installDir: string | undefined): void {
    this.options.installDir = installDir
    this.options.cliPath = undefined
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

    const env: NodeJS.ProcessEnv = {
      ...process.env,
      OMNIINFER_MODELS_DIR: this.options.modelsDir,
      OMNIINFER_LLAMA_CPP_CPU_MODELS_DIR: this.options.modelsDir,
      OMNIINFER_LLAMA_CPP_GPU_MODELS_DIR: this.options.modelsDir,
      OMNIINFER_SERVE_DIRECT: '1',
    }

    const command = buildServeCommand(resolvedCli.cliPath, this.buildArgs())
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

  private buildArgs(): string[] {
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
    return args
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
      process.env.OPENOMNICLAW_OMNIINFER_PYTHON ??
      (process.platform === 'win32' ? 'python' : 'python3')
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

export function defaultOmniInferLogsDir(rootLogsDir: string): string {
  return join(rootLogsDir, 'omniinfer')
}

export { OMNIINFER_DEFAULT_BASE_URL }
