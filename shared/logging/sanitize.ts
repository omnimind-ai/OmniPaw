import type { LogLevel, SerializedLogError, SerializedLogRecord } from '@shared/types/logging'

export const REDACTED_VALUE = '[redacted]'
export const TRUNCATED_VALUE = '[truncated]'

const secretKeyPattern =
  /(?:api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|token|password|secret|authorization|credential)/i
const assignmentPattern =
  /((?:api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|token|password|secret|authorization|credential)\s*[:=]\s*["']?)[^"',\s}\]]+/gi
const bearerPattern = /(bearer\s+)[A-Za-z0-9._~+/=-]+/gi
const urlPattern = /\b(?:https?|wss?):\/\/[^\s"'<>]+/gi

const defaultOptions = {
  maxDepth: 6,
  maxArrayItems: 50,
  maxObjectKeys: 60,
  maxStringLength: 2_000,
  maxTotalChars: 8_000,
  includeStack: true,
}

export interface SanitizeLogOptions {
  maxDepth?: number
  maxArrayItems?: number
  maxObjectKeys?: number
  maxStringLength?: number
  maxTotalChars?: number
  includeStack?: boolean
}

interface ResolvedSanitizeLogOptions {
  maxDepth: number
  maxArrayItems: number
  maxObjectKeys: number
  maxStringLength: number
  maxTotalChars: number
  includeStack: boolean
}

export interface SanitizeLogRecordInput {
  level: LogLevel
  scope: string
  message: string
  context?: Record<string, unknown>
  error?: unknown
  timestamp?: number
  meta?: {
    pid?: number
    processType?: string
    appVersion?: string
    platform?: string
  }
}

export function isLogLevel(value: unknown): value is LogLevel {
  return value === 'debug' || value === 'info' || value === 'warn' || value === 'error'
}

export function normalizeLogLevel(value: unknown, fallback: LogLevel = 'info'): LogLevel {
  return isLogLevel(value) ? value : fallback
}

export function isSensitiveKey(key: string): boolean {
  return secretKeyPattern.test(key)
}

export function redactSensitiveText(text: string): string {
  return redactUrlsInText(text)
    .replace(bearerPattern, `$1${REDACTED_VALUE}`)
    .replace(assignmentPattern, `$1${REDACTED_VALUE}`)
}

export function redactUrl(value: string): string {
  try {
    const url = new URL(value)
    if (url.username) {
      url.username = REDACTED_VALUE
    }
    if (url.password) {
      url.password = REDACTED_VALUE
    }
    for (const key of [...url.searchParams.keys()]) {
      if (isSensitiveKey(key)) {
        url.searchParams.set(key, REDACTED_VALUE)
      }
    }
    return url.toString().replaceAll('%5Bredacted%5D', REDACTED_VALUE)
  } catch {
    return value
  }
}

export function sanitizeLogRecord(
  input: SanitizeLogRecordInput,
  options?: SanitizeLogOptions
): SerializedLogRecord {
  const resolved = resolveOptions(options)
  const context = sanitizeLogContext(input.context, resolved)
  const timestamp =
    typeof input.timestamp === 'number' && Number.isFinite(input.timestamp)
      ? input.timestamp
      : Date.now()
  const record: SerializedLogRecord = {
    ts: new Date(timestamp).toISOString(),
    level: input.level,
    scope: truncateString(redactSensitiveText(input.scope || 'app'), 160),
    message: sanitizeLogMessage(input.message, resolved),
    pid: input.meta?.pid,
    processType: input.meta?.processType,
    appVersion: input.meta?.appVersion,
    platform: input.meta?.platform,
  }

  if (context) {
    record.context = context
  }
  if (input.error !== undefined) {
    record.error = serializeLogError(input.error, resolved)
  }

  return record
}

export function sanitizeLogMessage(message: unknown, options?: SanitizeLogOptions): string {
  const resolved = resolveOptions(options)
  const text = typeof message === 'string' ? message : stringifyUnknown(message)
  return truncateString(redactSensitiveText(text), resolved.maxStringLength)
}

export function sanitizeLogContext(
  context: unknown,
  options?: SanitizeLogOptions
): Record<string, unknown> | undefined {
  if (context === undefined || context === null) {
    return undefined
  }

  const resolved = resolveOptions(options)
  const sanitized = sanitizeValue(context, resolved, new WeakSet(), 0, '')
  const record = isRecord(sanitized) ? sanitized : { value: sanitized }
  return boundRecord(record, resolved)
}

export function serializeLogError(
  error: unknown,
  options?: SanitizeLogOptions,
  depth = 0
): SerializedLogError {
  const resolved = resolveOptions(options)
  if (depth > 3) {
    return { message: '[cause depth exceeded]' }
  }

  if (isSerializedLogErrorRecord(error)) {
    const record = error as SerializedLogError & { cause?: unknown }
    const sanitized: SerializedLogError = {
      message: truncateString(redactSensitiveText(record.message), resolved.maxStringLength),
    }
    if (typeof record.name === 'string') {
      sanitized.name = truncateString(redactSensitiveText(record.name), 160)
    }
    if (typeof record.stack === 'string' && resolved.includeStack) {
      sanitized.stack = truncateString(
        redactSensitiveText(record.stack),
        resolved.maxStringLength * 2
      )
    }
    if (typeof record.code === 'string') {
      sanitized.code = truncateString(redactSensitiveText(record.code), 160)
    }
    if (typeof record.retryable === 'boolean') {
      sanitized.retryable = record.retryable
    }
    if (typeof record.recoverable === 'boolean') {
      sanitized.recoverable = record.recoverable
    }
    if (record.cause !== undefined) {
      sanitized.cause = serializeLogError(record.cause, resolved, depth + 1)
    }
    return sanitized
  }

  if (error instanceof Error) {
    const details: SerializedLogError = {
      name: error.name,
      message: truncateString(redactSensitiveText(error.message), resolved.maxStringLength),
    }
    if (resolved.includeStack && error.stack) {
      details.stack = truncateString(redactSensitiveText(error.stack), resolved.maxStringLength * 2)
    }

    const record = error as Error & {
      code?: unknown
      retryable?: unknown
      recoverable?: unknown
      cause?: unknown
    }
    if (typeof record.code === 'string') {
      details.code = truncateString(redactSensitiveText(record.code), 160)
    }
    if (typeof record.retryable === 'boolean') {
      details.retryable = record.retryable
    }
    if (typeof record.recoverable === 'boolean') {
      details.recoverable = record.recoverable
    }
    if (record.cause !== undefined) {
      details.cause = serializeLogError(record.cause, resolved, depth + 1)
    }
    return details
  }

  if (typeof error === 'string') {
    return {
      message: truncateString(redactSensitiveText(error), resolved.maxStringLength),
    }
  }

  const value = sanitizeValue(error, resolved, new WeakSet(), 0, '')
  return {
    message: truncateString(stringifyUnknown(value), resolved.maxStringLength),
  }
}

function sanitizeValue(
  value: unknown,
  options: ResolvedSanitizeLogOptions,
  seen: WeakSet<object>,
  depth: number,
  key: string
): unknown {
  if (isSensitiveKey(key)) {
    return REDACTED_VALUE
  }

  if (value === null || value === undefined) {
    return value
  }
  if (typeof value === 'string') {
    return truncateString(redactSensitiveText(value), options.maxStringLength)
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : String(value)
  }
  if (typeof value === 'boolean') {
    return value
  }
  if (typeof value === 'bigint') {
    return `${value.toString()}n`
  }
  if (typeof value === 'symbol') {
    return value.description ? `Symbol(${value.description})` : 'Symbol()'
  }
  if (typeof value === 'function') {
    return `[Function${value.name ? `: ${value.name}` : ''}]`
  }
  if (value instanceof Error) {
    return serializeLogError(value, options)
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? '[Invalid Date]' : value.toISOString()
  }
  if (value instanceof URL) {
    return redactUrl(value.toString())
  }
  if (ArrayBuffer.isView(value)) {
    return `[${value.constructor.name} byteLength=${value.byteLength}]`
  }
  if (value instanceof ArrayBuffer) {
    return `[ArrayBuffer byteLength=${value.byteLength}]`
  }
  if (depth >= options.maxDepth) {
    return '[max depth exceeded]'
  }

  if (typeof value === 'object') {
    if (seen.has(value)) {
      return '[circular]'
    }
    seen.add(value)
  }

  if (Array.isArray(value)) {
    const items = value
      .slice(0, options.maxArrayItems)
      .map((item, index) => sanitizeValue(item, options, seen, depth + 1, String(index)))
    if (value.length > options.maxArrayItems) {
      items.push(`[${value.length - options.maxArrayItems} more items]`)
    }
    return items
  }

  if (value instanceof Map) {
    const result: Record<string, unknown> = {}
    let count = 0
    for (const [mapKey, mapValue] of value) {
      if (count >= options.maxObjectKeys) {
        result._truncatedKeys = value.size - options.maxObjectKeys
        break
      }
      const normalizedKey = String(mapKey)
      result[normalizedKey] = sanitizeValue(mapValue, options, seen, depth + 1, normalizedKey)
      count += 1
    }
    return result
  }

  if (value instanceof Set) {
    const items = [...value]
      .slice(0, options.maxArrayItems)
      .map((item, index) => sanitizeValue(item, options, seen, depth + 1, String(index)))
    if (value.size > options.maxArrayItems) {
      items.push(`[${value.size - options.maxArrayItems} more items]`)
    }
    return items
  }

  if (isRecord(value)) {
    const result: Record<string, unknown> = {}
    const entries = Object.entries(value)
    for (const [entryKey, entryValue] of entries.slice(0, options.maxObjectKeys)) {
      result[entryKey] = sanitizeValue(entryValue, options, seen, depth + 1, entryKey)
    }
    if (entries.length > options.maxObjectKeys) {
      result._truncatedKeys = entries.length - options.maxObjectKeys
    }
    return result
  }

  return stringifyUnknown(value)
}

function redactUrlsInText(text: string): string {
  return text.replace(urlPattern, (raw) => {
    const trailing = raw.match(/[),.;]+$/)?.[0] ?? ''
    const url = trailing ? raw.slice(0, -trailing.length) : raw
    return `${redactUrl(url)}${trailing}`
  })
}

function truncateString(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value
  }
  return `${value.slice(0, Math.max(0, maxLength - 18))} ${TRUNCATED_VALUE}`
}

function boundRecord(
  record: Record<string, unknown>,
  options: ResolvedSanitizeLogOptions
): Record<string, unknown> {
  const serialized = stringifyUnknown(record)
  if (serialized.length <= options.maxTotalChars) {
    return record
  }

  return {
    _truncated: true,
    preview: truncateString(serialized, options.maxTotalChars),
  }
}

function stringifyUnknown(value: unknown): string {
  try {
    if (typeof value === 'string') {
      return value
    }
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function resolveOptions(options?: SanitizeLogOptions): ResolvedSanitizeLogOptions {
  return {
    ...defaultOptions,
    ...options,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isSerializedLogErrorRecord(value: unknown): value is SerializedLogError {
  return isRecord(value) && typeof value.message === 'string'
}
