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
  terminate(child: ChildProcess): { terminated: boolean; signal: string }
}

interface ProcessRecord {
  summary: LocalProcessSummary
  child?: ChildProcess
  stdout: string
  stderr: string
  foreground: boolean
  lifetimeTimer?: NodeJS.Timeout
}

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

  kill(processId: string): boolean {
    const record = this.processes.get(processId)
    if (!record) {
      return false
    }
    return this.terminateRecord(record, 'killed')
  }

  cleanupSession(sessionId: string): number {
    const records = [...this.processes.values()].filter(
      (record) => record.summary.sessionId === sessionId
    )
    let terminated = 0
    for (const record of records) {
      if (this.terminateRecord(record, 'killed')) {
        terminated += 1
      }
      if (record.summary.status !== 'running') {
        this.processes.delete(record.summary.id)
      }
    }
    this.logger?.info('Local session processes cleaned up.', { sessionId, terminated })
    return terminated
  }

  dispose(): number {
    let terminated = 0
    for (const record of this.processes.values()) {
      if (this.terminateRecord(record, 'killed')) {
        terminated += 1
      }
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
      this.terminateRecord(record, 'killed')
    }

    try {
      return await new Promise<ProcessExecutionResult>((resolve) => {
        timeout = setTimeout(() => {
          timedOut = true
          this.terminateRecord(record, 'timed-out')
        }, input.timeoutMs)

        if (input.signal) {
          if (input.signal.aborted) {
            abort()
          } else {
            input.signal.addEventListener('abort', abort, { once: true })
          }
        }

        record.child?.on('close', (exitCode, signal) => {
          if (record.summary.status === 'running') {
            const status: LocalProcessStatus = timedOut
              ? 'timed-out'
              : aborted
                ? 'killed'
                : exitCode === 0
                  ? 'exited'
                  : 'failed'
            this.finishRecord(record, status, { exitCode, signal })
          } else {
            record.summary = {
              ...record.summary,
              exitCode: record.summary.exitCode ?? exitCode,
              signal: record.summary.signal ?? signal,
              stdoutTail: record.stdout,
              stderrTail: record.stderr,
            }
          }
          resolve({
            process: { ...record.summary },
            stdout: record.stdout,
            stderr: record.stderr,
            exitCode,
            signal,
            timedOut,
            aborted,
            truncated: record.summary.truncated,
          })
        })
      })
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
        this.terminateRecord(record, 'timed-out')
      }
    }, this.options.backgroundMaxLifetimeMs())
    record.child?.on('close', (exitCode, signal) => {
      if (record.summary.status !== 'running') return
      this.finishRecord(record, exitCode === 0 ? 'exited' : 'failed', { exitCode, signal })
    })
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
    const record: ProcessRecord = {
      stdout: '',
      stderr: '',
      foreground: !background,
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
      record.child = spawn(input.command, {
        cwd: input.cwd,
        env: input.env,
        shell: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: this.options.processTree?.detached ?? false,
        windowsHide: true,
      })
      record.child.stdout?.on('data', (chunk: Buffer) => {
        appendOutput(record, 'stdout', chunk.toString('utf8'), input.maxOutputChars)
      })
      record.child.stderr?.on('data', (chunk: Buffer) => {
        appendOutput(record, 'stderr', chunk.toString('utf8'), input.maxOutputChars)
      })
      record.child.on('error', (error) => {
        this.finishRecord(record, 'failed', {})
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

  private terminateRecord(record: ProcessRecord, status: LocalProcessStatus): boolean {
    if (record.summary.status !== 'running' || !record.child) {
      return false
    }
    const termination = this.options.processTree
      ? this.options.processTree.terminate(record.child)
      : terminateChild(record.child)
    if (!termination.terminated) {
      return false
    }
    this.finishRecord(record, status, { signal: termination.signal })
    return true
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

function terminateChild(child: ChildProcess): { terminated: boolean; signal: string } {
  if (child.killed || child.exitCode !== null) {
    return { terminated: false, signal: 'SIGTERM' }
  }
  try {
    return { terminated: child.kill('SIGTERM'), signal: 'SIGTERM' }
  } catch {
    return { terminated: false, signal: 'SIGTERM' }
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
