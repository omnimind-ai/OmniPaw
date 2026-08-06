import { type ChildProcess, spawn } from 'node:child_process'
import type { Logger } from '@core/logging'
import type { LocalProcessStatus, LocalProcessSummary } from '@shared/types/local-agent'

export interface ProcessExecutionRequest {
  sessionId: string
  runId?: string
  toolCallId?: string
  workspaceId?: string
  command: string
  cwd: string
  env: Record<string, string>
  timeoutMs: number
  maxOutputChars: number
  background: boolean
  signal?: AbortSignal
}

export interface ProcessExecutionResult {
  process: LocalProcessSummary
  stdout: string
  stderr: string
  exitCode?: number | null
  signal?: string | null
  timedOut: boolean
  aborted: boolean
  truncated: boolean
}

export interface ProcessSupervisorOptions {
  maxForegroundProcesses: () => number
  maxBackgroundProcesses: () => number
  backgroundMaxLifetimeMs: () => number
  processTree?: ProcessTreeController
  logger?: Logger
}

export interface ProcessTreeController {
  detached: boolean
  terminate(child: ChildProcess): Promise<{ terminated: boolean; signal: string }>
}

interface ProcessExit {
  exitCode: number | null
  signal: string | null
}

interface ProcessRecord {
  summary: LocalProcessSummary
  child?: ChildProcess
  stdout: string
  stderr: string
  foreground: boolean
  lifetimeTimer?: NodeJS.Timeout
  closed: Promise<ProcessExit>
  resolveClosed: (exit: ProcessExit) => void
  closedSettled: boolean
  terminationStatus?: LocalProcessStatus
  terminationPromise?: Promise<boolean>
}

const PROCESS_CLOSE_TIMEOUT_MS = 5_000

export class ProcessSupervisor {
  private readonly processes = new Map<string, ProcessRecord>()
  private readonly logger?: Logger

  constructor(private readonly options: ProcessSupervisorOptions) {
    this.logger = options.logger
  }

  async execute(input: ProcessExecutionRequest): Promise<ProcessExecutionResult> {
    if (input.background) {
      return this.startBackground(input)
    }
    this.ensureProcessCapacity(false)
    return this.runForeground(input)
  }

  list(input: { sessionId?: string } = {}): LocalProcessSummary[] {
    return [...this.processes.values()]
      .map((record) => ({ ...record.summary }))
      .filter((process) => !input.sessionId || process.sessionId === input.sessionId)
      .sort((first, second) => second.startedAt - first.startedAt)
  }

  get(processId: string): LocalProcessSummary | null {
    const record = this.processes.get(processId)
    return record ? { ...record.summary } : null
  }

  async kill(processId: string): Promise<boolean> {
    const record = this.processes.get(processId)
    if (!record) {
      return false
    }
    return this.terminateRecord(record, 'killed')
  }

  async cleanupSession(sessionId: string): Promise<number> {
    const records = [...this.processes.values()].filter(
      (record) => record.summary.sessionId === sessionId
    )
    const results = await Promise.all(
      records.map((record) => this.terminateRecord(record, 'killed'))
    )
    const terminated = results.filter(Boolean).length
    for (const record of records) {
      if (record.summary.status !== 'running') {
        this.processes.delete(record.summary.id)
      }
    }
    this.logger?.info('Local session processes cleaned up.', { sessionId, terminated })
    return terminated
  }

  async dispose(): Promise<number> {
    const records = [...this.processes.values()]
    const results = await Promise.all(
      records.map((record) => this.terminateRecord(record, 'killed'))
    )
    const terminated = results.filter(Boolean).length
    for (const record of records) {
      if (record.lifetimeTimer) {
        clearTimeout(record.lifetimeTimer)
        record.lifetimeTimer = undefined
      }
    }
    this.processes.clear()
    this.logger?.info('Local process supervisor disposed.', { terminated })
    return terminated
  }

  private async runForeground(input: ProcessExecutionRequest): Promise<ProcessExecutionResult> {
    const record = this.startRecord(input, false)
    let timeout: NodeJS.Timeout | undefined
    let aborted = false
    let timedOut = false
    const abort = () => {
      aborted = true
      void this.terminateRecord(record, 'killed')
    }

    try {
      timeout = setTimeout(() => {
        timedOut = true
        void this.terminateRecord(record, 'timed-out')
      }, input.timeoutMs)

      if (input.signal) {
        if (input.signal.aborted) {
          abort()
        } else {
          input.signal.addEventListener('abort', abort, { once: true })
        }
      }

      const { exitCode, signal } = await record.closed
      return {
        process: { ...record.summary },
        stdout: record.stdout,
        stderr: record.stderr,
        exitCode,
        signal: record.summary.signal ?? signal,
        timedOut,
        aborted,
        truncated: record.summary.truncated,
      }
    } finally {
      if (timeout) clearTimeout(timeout)
      input.signal?.removeEventListener('abort', abort)
    }
  }

  private async startBackground(input: ProcessExecutionRequest): Promise<ProcessExecutionResult> {
    this.ensureProcessCapacity(true)
    const record = this.startRecord(input, true)
    record.lifetimeTimer = setTimeout(() => {
      if (record.summary.status === 'running') {
        void this.terminateRecord(record, 'timed-out')
      }
    }, this.options.backgroundMaxLifetimeMs())
    return {
      process: { ...record.summary },
      stdout: '',
      stderr: '',
      exitCode: undefined,
      signal: undefined,
      timedOut: false,
      aborted: false,
      truncated: false,
    }
  }

  private startRecord(input: ProcessExecutionRequest, background: boolean): ProcessRecord {
    const now = Date.now()
    const processId = crypto.randomUUID()
    let resolveClosed: (exit: ProcessExit) => void = () => {}
    const closed = new Promise<ProcessExit>((resolve) => {
      resolveClosed = resolve
    })
    const record: ProcessRecord = {
      stdout: '',
      stderr: '',
      foreground: !background,
      closed,
      resolveClosed,
      closedSettled: false,
      summary: {
        id: processId,
        sessionId: input.sessionId,
        runId: input.runId,
        toolCallId: input.toolCallId,
        workspaceId: input.workspaceId,
        command: input.command,
        cwd: input.cwd,
        status: 'running',
        background,
        startedAt: now,
        stdoutTail: '',
        stderrTail: '',
        truncated: false,
      },
    }
    this.processes.set(processId, record)
    try {
      const child = spawn(input.command, {
        cwd: input.cwd,
        env: input.env,
        shell: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: this.options.processTree?.detached ?? false,
        windowsHide: true,
      })
      record.child = child
      child.stdout?.on('data', (chunk: Buffer) => {
        appendOutput(record, 'stdout', chunk.toString('utf8'), input.maxOutputChars)
      })
      child.stderr?.on('data', (chunk: Buffer) => {
        appendOutput(record, 'stderr', chunk.toString('utf8'), input.maxOutputChars)
      })
      child.once('close', (exitCode, signal) => {
        this.settleRecordClose(record, { exitCode, signal })
      })
      child.on('error', (error) => {
        if (!child.pid) {
          this.settleRecordClose(record, { exitCode: null, signal: null })
        }
        this.logger?.warn('Local process failed to start.', {
          processId,
          sessionId: input.sessionId,
          error,
        })
      })
      this.logger?.info('Local process started.', {
        processId,
        sessionId: input.sessionId,
        background,
      })
    } catch (error) {
      this.finishRecord(record, 'failed', {})
      throw error
    }
    return record
  }

  private finishRecord(
    record: ProcessRecord,
    status: LocalProcessStatus,
    exit: { exitCode?: number | null; signal?: string | null }
  ): void {
    const finishedAt = Date.now()
    if (record.lifetimeTimer) {
      clearTimeout(record.lifetimeTimer)
      record.lifetimeTimer = undefined
    }
    record.summary = {
      ...record.summary,
      status,
      finishedAt,
      durationMs: finishedAt - record.summary.startedAt,
      exitCode: exit.exitCode,
      signal: exit.signal,
      stdoutTail: record.stdout,
      stderrTail: record.stderr,
    }
    this.logger?.info('Local process finished.', {
      processId: record.summary.id,
      sessionId: record.summary.sessionId,
      status,
      durationMs: record.summary.durationMs,
      exitCode: exit.exitCode,
      signal: exit.signal,
    })
  }

  private settleRecordClose(record: ProcessRecord, exit: ProcessExit): void {
    if (record.closedSettled) return
    record.closedSettled = true
    const status =
      record.terminationStatus ?? (exit.exitCode === 0 ? ('exited' as const) : ('failed' as const))
    this.finishRecord(record, status, {
      exitCode: exit.exitCode,
      signal: exit.signal ?? (record.terminationStatus ? 'SIGKILL' : null),
    })
    record.resolveClosed(exit)
  }

  private terminateRecord(record: ProcessRecord, status: LocalProcessStatus): Promise<boolean> {
    if (record.terminationPromise) {
      return record.terminationPromise
    }
    if (record.summary.status !== 'running' || !record.child) {
      return Promise.resolve(false)
    }

    record.terminationStatus = status
    const child = record.child
    const terminationPromise = (async () => {
      let termination: { terminated: boolean; signal: string }
      try {
        termination = this.options.processTree
          ? await this.options.processTree.terminate(child)
          : terminateChild(child, 'SIGTERM')
      } catch (error) {
        this.logger?.warn('Local process tree termination failed.', {
          processId: record.summary.id,
          sessionId: record.summary.sessionId,
          error,
        })
        termination = terminateChild(child, 'SIGKILL')
      }

      if (!termination.terminated) {
        record.terminationStatus = undefined
        record.terminationPromise = undefined
        return false
      }

      const closed = await waitForPromise(record.closed, PROCESS_CLOSE_TIMEOUT_MS)
      if (!closed) {
        terminateChild(child, 'SIGKILL')
        child.stdout?.destroy()
        child.stderr?.destroy()
        this.settleRecordClose(record, {
          exitCode: child.exitCode,
          signal: termination.signal,
        })
        this.logger?.warn('Local process close event exceeded the cleanup timeout.', {
          processId: record.summary.id,
          sessionId: record.summary.sessionId,
        })
      }
      return true
    })()
    record.terminationPromise = terminationPromise
    return terminationPromise
  }

  private ensureProcessCapacity(background: boolean): void {
    const running = [...this.processes.values()].filter(
      (record) => record.summary.status === 'running' && record.summary.background === background
    ).length
    const max = background
      ? this.options.maxBackgroundProcesses()
      : this.options.maxForegroundProcesses()
    if (running >= max) {
      throw new Error(
        background
          ? 'Background process limit has been reached.'
          : 'Foreground process limit has been reached.'
      )
    }
  }
}

function terminateChild(
  child: ChildProcess,
  signal: NodeJS.Signals
): { terminated: boolean; signal: string } {
  if (child.exitCode !== null) {
    return { terminated: false, signal }
  }
  try {
    return { terminated: child.kill(signal), signal }
  } catch {
    return { terminated: false, signal }
  }
}

async function waitForPromise<T>(promise: Promise<T>, timeoutMs: number): Promise<boolean> {
  let timeout: NodeJS.Timeout | undefined
  try {
    return await Promise.race([
      promise.then(() => true),
      new Promise<boolean>((resolve) => {
        timeout = setTimeout(() => resolve(false), timeoutMs)
      }),
    ])
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}

function appendOutput(
  record: ProcessRecord,
  field: 'stdout' | 'stderr',
  text: string,
  maxChars: number
): void {
  const next = `${record[field]}${text}`
  if (next.length > maxChars) {
    record[field] = next.slice(-maxChars)
    record.summary.truncated = true
  } else {
    record[field] = next
  }
  if (field === 'stdout') {
    record.summary.stdoutTail = record.stdout
  } else {
    record.summary.stderrTail = record.stderr
  }
}
