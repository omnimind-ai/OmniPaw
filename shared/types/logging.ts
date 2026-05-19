export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface SerializedLogError {
  name?: string
  message: string
  stack?: string
  code?: string
  retryable?: boolean
  recoverable?: boolean
  cause?: SerializedLogError
}

export interface SerializedLogRecord {
  ts: string
  level: LogLevel
  scope: string
  message: string
  context?: Record<string, unknown>
  error?: SerializedLogError
  pid?: number
  processType?: string
  appVersion?: string
  platform?: string
}

export interface RendererLogRequest {
  level: LogLevel
  scope?: string
  message: string
  context?: Record<string, unknown>
  error?: unknown
  timestamp?: number
}

export interface LoggerWriteResponse {
  accepted: boolean
  persisted: boolean
  dropped?: boolean
  reason?: string
}

export interface LoggerHealthStatus {
  initialized: boolean
  available: boolean
  runtime: 'electron' | 'fallback' | 'test'
  transport: 'electron-log' | 'none'
  logDir?: string
  filePath?: string
  maxFileBytes?: number
  writeCount: number
  droppedCount: number
  failedWriteCount: number
  lastFailure?: SerializedLogError
  startedAt: number
  updatedAt: number
}
