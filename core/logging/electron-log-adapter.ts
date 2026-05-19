import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

import electronLog from 'electron-log/main'
import type { LoggerHealthStatus, SerializedLogError, SerializedLogRecord } from '@shared/types/logging'
import { serializeLogError } from '@shared/logging/sanitize'
import type { LogSink } from './logger'

export interface ElectronLogSinkOptions {
  logDir: string
  appName: string
  appVersion?: string
  fileName?: string
  maxFileBytes?: number
  runtime?: LoggerHealthStatus['runtime']
}

type MutableElectronLogger = typeof electronLog & {
  processInternalErrorFn?: (error: unknown) => void
}

type ElectronFileLike = {
  on?: (event: 'error', listener: (error: unknown) => void) => void
  isNull?: () => boolean
  toString?: () => string
}

const defaultMaxFileBytes = 5 * 1024 * 1024

export function createElectronLogSink(options: ElectronLogSinkOptions): LogSink {
  return new ElectronLogSink(options)
}

class ElectronLogSink implements LogSink {
  private readonly startedAt = Date.now()
  private readonly maxFileBytes: number
  private readonly logDir: string
  private readonly fileName: string
  private readonly runtime: LoggerHealthStatus['runtime']
  private native: MutableElectronLogger | undefined
  private filePath: string | undefined
  private fileListenerAttached = false
  private writeCount = 0
  private droppedCount = 0
  private failedWriteCount = 0
  private lastFailure: SerializedLogError | undefined
  private available = false

  constructor(options: ElectronLogSinkOptions) {
    this.logDir = options.logDir
    this.fileName = options.fileName ?? 'openomniclaw.log'
    this.maxFileBytes = options.maxFileBytes ?? defaultMaxFileBytes
    this.runtime = options.runtime ?? 'electron'

    try {
      mkdirSync(this.logDir, { recursive: true })
      const native = electronLog.create({ logId: 'openomniclaw' }) as MutableElectronLogger
      native.transports.console = createNoopTransport() as unknown as typeof native.transports.console
      native.transports.ipc = createNoopTransport() as unknown as typeof native.transports.ipc
      native.transports.remote = createNoopTransport() as unknown as typeof native.transports.remote
      native.transports.file.level = 'silly'
      native.transports.file.format = '{text}'
      native.transports.file.fileName = this.fileName
      native.transports.file.maxSize = this.maxFileBytes
      native.transports.file.resolvePathFn = () => join(this.logDir, this.fileName)
      native.processInternalErrorFn = (error) => this.recordFailure(error)

      this.native = native
      this.attachFileFailureListener()
      this.available = true
    } catch (error) {
      this.recordFailure(error)
      this.available = false
    }
  }

  write(record: SerializedLogRecord): void {
    this.writeCount += 1

    if (!this.native || !this.available) {
      this.droppedCount += 1
      return
    }

    try {
      this.attachFileFailureListener()
      this.native[record.level](JSON.stringify(record))
    } catch (error) {
      this.recordFailure(error)
    }
  }

  status(): LoggerHealthStatus {
    return {
      initialized: true,
      available: this.available,
      runtime: this.runtime,
      transport: 'electron-log',
      logDir: this.logDir,
      filePath: this.filePath,
      maxFileBytes: this.maxFileBytes,
      writeCount: this.writeCount,
      droppedCount: this.droppedCount,
      failedWriteCount: this.failedWriteCount,
      lastFailure: this.lastFailure ? { ...this.lastFailure } : undefined,
      startedAt: this.startedAt,
      updatedAt: Date.now(),
    }
  }

  private attachFileFailureListener(): void {
    if (!this.native) {
      return
    }

    const file = this.native.transports.file.getFile({
      data: [''],
      date: new Date(),
      level: 'info',
    }) as ElectronFileLike
    this.filePath = file.toString?.()
    if (file.isNull?.()) {
      this.recordFailure(new Error(`Log file is not writable: ${this.filePath ?? this.logDir}`))
      this.available = false
      return
    }
    if (!this.fileListenerAttached && typeof file.on === 'function') {
      file.on('error', (error) => this.recordFailure(error))
      this.fileListenerAttached = true
    }
  }

  private recordFailure(error: unknown): void {
    this.failedWriteCount += 1
    this.droppedCount += 1
    this.lastFailure = serializeLogError(error)
  }
}

function createNoopTransport() {
  return Object.assign(() => {}, { level: false })
}
