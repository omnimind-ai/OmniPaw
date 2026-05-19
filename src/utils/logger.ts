import { sanitizeLogContext, sanitizeLogMessage, serializeLogError } from '@shared/logging/sanitize'
import type { LogLevel, RendererLogRequest } from '@shared/types/logging'
import { appBridge } from '@/bridge/app'

export type RendererLogContext = Record<string, unknown> & { error?: unknown }

export interface RendererLogger {
  child(context: string | (Record<string, unknown> & { scope?: string })): RendererLogger
  debug(message: string, context?: RendererLogContext): void
  info(message: string, context?: RendererLogContext): void
  warn(message: string, context?: RendererLogContext): void
  error(message: string, context?: RendererLogContext): void
}

export function createRendererLogger(
  scope = 'renderer',
  context: Record<string, unknown> = {}
): RendererLogger {
  return new BridgeRendererLogger(scope, context)
}

class BridgeRendererLogger implements RendererLogger {
  constructor(
    private readonly scope: string,
    private readonly context: Record<string, unknown>
  ) {}

  child(context: string | (Record<string, unknown> & { scope?: string })): RendererLogger {
    const childContext = typeof context === 'string' ? { scope: context } : context
    const { scope, ...rest } = childContext
    return new BridgeRendererLogger(combineScope(this.scope, scope), {
      ...this.context,
      ...rest,
    })
  }

  debug(message: string, context?: RendererLogContext): void {
    this.write('debug', message, context)
  }

  info(message: string, context?: RendererLogContext): void {
    this.write('info', message, context)
  }

  warn(message: string, context?: RendererLogContext): void {
    this.write('warn', message, context)
  }

  error(message: string, context?: RendererLogContext): void {
    this.write('error', message, context)
  }

  private write(level: LogLevel, message: string, context?: RendererLogContext): void {
    const { error, ...rest } = context ?? {}
    const request: RendererLogRequest = {
      level,
      scope: this.scope,
      message: sanitizeLogMessage(message),
      context: sanitizeLogContext({
        ...this.context,
        ...rest,
        route: safeRoute(),
      }),
      error: error === undefined ? undefined : serializeLogError(error),
      timestamp: Date.now(),
    }

    void appBridge.logging.write(request).catch(() => {})
  }
}

function combineScope(parent: string, child?: string): string {
  if (!child) {
    return parent
  }
  if (!parent || parent === 'renderer') {
    return child
  }
  return `${parent}.${child}`
}

function safeRoute(): string | undefined {
  if (typeof window === 'undefined') {
    return undefined
  }
  return `${window.location.pathname}${window.location.search}`
}

export const logger = createRendererLogger()
