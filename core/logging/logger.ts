import { normalizeLogLevel, sanitizeLogContext, sanitizeLogRecord } from '@shared/logging/sanitize'
import type {
  LoggerHealthStatus,
  LogLevel,
  RendererLogRequest,
  SerializedLogRecord,
} from '@shared/types/logging'

export type LogContext = Record<string, unknown> & { error?: unknown }

export interface LoggerChildContext extends Record<string, unknown> {
  scope?: string
}

export interface Logger {
  child(context: LoggerChildContext | string): Logger
  debug(message: string, context?: LogContext): void
  info(message: string, context?: LogContext): void
  warn(message: string, context?: LogContext): void
  error(message: string, context?: LogContext): void
}

export interface LogSink {
  write(record: SerializedLogRecord): void
  status(): LoggerHealthStatus
}

export interface ProjectLoggerOptions {
  sink: LogSink
  scope?: string
  context?: Record<string, unknown>
  meta?: {
    pid?: number
    processType?: string
    appVersion?: string
    platform?: string
  }
}

export function createProjectLogger(options: ProjectLoggerOptions): Logger {
  return new ScopedProjectLogger(
    options.sink,
    options.scope ?? 'app',
    options.context ?? {},
    options.meta ?? defaultMeta()
  )
}

export function createNoopLogger(status?: Partial<LoggerHealthStatus>): Logger {
  return createProjectLogger({ sink: createNoopLogSink(status) })
}

export function createNoopLogSink(status?: Partial<LoggerHealthStatus>): LogSink {
  const startedAt = Date.now()
  const state: LoggerHealthStatus = {
    initialized: false,
    available: false,
    runtime: 'fallback',
    transport: 'none',
    writeCount: 0,
    droppedCount: 0,
    failedWriteCount: 0,
    startedAt,
    updatedAt: startedAt,
    ...status,
  }

  return {
    write() {
      state.writeCount += 1
      state.droppedCount += 1
      state.updatedAt = Date.now()
    },
    status() {
      return { ...state, lastFailure: state.lastFailure ? { ...state.lastFailure } : undefined }
    },
  }
}

export function writeRendererLogRequest(
  logger: Logger,
  request: unknown
): { accepted: boolean; reason?: string } {
  if (!isRecord(request)) {
    logger.warn('Dropped renderer log payload with invalid shape.', { scope: 'renderer.ipc' })
    return { accepted: false, reason: 'invalid_payload' }
  }

  const rendererRequest = request as Partial<RendererLogRequest>
  const level = normalizeLogLevel(rendererRequest.level, 'info')
  const message =
    typeof rendererRequest.message === 'string' && rendererRequest.message.trim()
      ? rendererRequest.message
      : 'Renderer diagnostic event.'
  const scope =
    typeof rendererRequest.scope === 'string' && rendererRequest.scope.trim()
      ? rendererRequest.scope.trim()
      : 'renderer'
  const context = isRecord(rendererRequest.context)
    ? sanitizeLogContext(rendererRequest.context)
    : undefined
  const child = logger.child({ scope })
  const payload = {
    ...(context ?? {}),
    ...(Number.isFinite(rendererRequest.timestamp)
      ? { rendererTimestamp: rendererRequest.timestamp }
      : {}),
    ...(rendererRequest.error !== undefined ? { error: rendererRequest.error } : {}),
  }

  writeByLevel(child, level, message, payload)
  return { accepted: true }
}

class ScopedProjectLogger implements Logger {
  constructor(
    private readonly sink: LogSink,
    private readonly scope: string,
    private readonly context: Record<string, unknown>,
    private readonly meta: NonNullable<ProjectLoggerOptions['meta']>
  ) {}

  child(context: LoggerChildContext | string): Logger {
    const childContext = typeof context === 'string' ? { scope: context } : context
    const { scope, ...rest } = childContext
    return new ScopedProjectLogger(
      this.sink,
      combineScope(this.scope, scope),
      {
        ...this.context,
        ...rest,
      },
      this.meta
    )
  }

  debug(message: string, context?: LogContext): void {
    this.write('debug', message, context)
  }

  info(message: string, context?: LogContext): void {
    this.write('info', message, context)
  }

  warn(message: string, context?: LogContext): void {
    this.write('warn', message, context)
  }

  error(message: string, context?: LogContext): void {
    this.write('error', message, context)
  }

  private write(level: LogLevel, message: string, context?: LogContext): void {
    const { error, ...contextWithoutError } = context ?? {}
    const mergedContext = {
      ...this.context,
      ...contextWithoutError,
    }

    try {
      this.sink.write(
        sanitizeLogRecord({
          level,
          scope: this.scope,
          message,
          context: Object.keys(mergedContext).length ? mergedContext : undefined,
          error,
          meta: this.meta,
        })
      )
    } catch {
      // The sink is required to swallow failures, but callers must never pay for a logger bug.
    }
  }
}

function writeByLevel(
  logger: Logger,
  level: LogLevel,
  message: string,
  context?: LogContext
): void {
  if (level === 'debug') {
    logger.debug(message, context)
    return
  }
  if (level === 'warn') {
    logger.warn(message, context)
    return
  }
  if (level === 'error') {
    logger.error(message, context)
    return
  }
  logger.info(message, context)
}

function combineScope(parent: string, child?: string): string {
  if (!child) {
    return parent
  }
  if (!parent || parent === 'app') {
    return child
  }
  return `${parent}.${child}`
}

function defaultMeta(): NonNullable<ProjectLoggerOptions['meta']> {
  return {
    pid: typeof process !== 'undefined' ? process.pid : undefined,
    processType: typeof process !== 'undefined' ? (process.type ?? 'browser') : undefined,
    platform: typeof process !== 'undefined' ? process.platform : undefined,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
