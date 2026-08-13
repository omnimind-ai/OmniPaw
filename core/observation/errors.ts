import type { ObservationErrorCode, ObservationErrorInfo } from '@shared/types/observation'

export class ObservationRuntimeError extends Error {
  readonly details: ObservationErrorInfo

  constructor(details: ObservationErrorInfo) {
    super(details.message)
    this.name = 'ObservationRuntimeError'
    this.details = details
  }
}

export function createObservationError(
  code: ObservationErrorCode,
  message: string,
  recoverable = false
): ObservationRuntimeError {
  return new ObservationRuntimeError(toObservationErrorInfo(code, message, recoverable))
}

export function toObservationErrorInfo(
  code: ObservationErrorCode,
  message: string,
  recoverable = false
): ObservationErrorInfo {
  return { code, message, recoverable }
}

export function normalizeObservationError(error: unknown): ObservationErrorInfo {
  if (error instanceof ObservationRuntimeError) {
    return error.details
  }
  if (isAbortError(error)) {
    return { code: 'aborted', message: '观察已停止。', recoverable: false }
  }
  return {
    code: 'unknown',
    message: error instanceof Error ? error.message : '主动视觉观察失败。',
    recoverable: true,
  }
}

export function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === 'AbortError') ||
    (error instanceof Error && error.name === 'AbortError')
  )
}
