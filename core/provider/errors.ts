import type { ChatError } from './base-provider'
import { ProviderError } from './base-provider'

const MAX_BODY_PREVIEW_LENGTH = 1000

export function normalizeProviderError(error: unknown): ChatError {
  if (error instanceof ProviderError) {
    return error.chatError
  }

  if (isAbortError(error)) {
    return {
      code: 'aborted',
      message: 'Provider request was aborted.',
      retryable: false,
    }
  }

  if (error instanceof TypeError) {
    return {
      code: 'network',
      message: error.message || 'Provider network request failed.',
      retryable: true,
    }
  }

  if (error instanceof Error) {
    return {
      code: 'unknown',
      message: error.message || 'Provider request failed.',
      retryable: false,
    }
  }

  return {
    code: 'unknown',
    message: 'Provider request failed.',
    retryable: false,
  }
}

export async function errorFromResponse(response: Response): Promise<ChatError> {
  const bodyPreview = await response.text().then(previewBody, () => undefined)
  const message = extractErrorMessage(bodyPreview) ?? response.statusText ?? 'Provider request failed.'

  return {
    code: codeFromStatus(response.status, bodyPreview),
    message,
    retryable: response.status === 408 || response.status === 409 || response.status === 429 || response.status >= 500,
    providerStatus: response.status,
    providerBodyPreview: bodyPreview,
  }
}

export function throwProviderError(chatError: ChatError, cause?: unknown): never {
  throw new ProviderError(chatError, cause)
}

function codeFromStatus(status: number, bodyPreview?: string): ChatError['code'] {
  const lowerBody = bodyPreview?.toLowerCase() ?? ''

  if (status === 401 || status === 403) {
    return 'provider_auth'
  }

  if (status === 429) {
    return 'provider_rate_limit'
  }

  if (status === 400 || status === 413 || status === 422) {
    if (
      lowerBody.includes('context') ||
      lowerBody.includes('token') ||
      lowerBody.includes('maximum') ||
      lowerBody.includes('too long')
    ) {
      return 'provider_context_length'
    }

    return 'provider_bad_request'
  }

  if (status >= 500 || status === 408) {
    return 'network'
  }

  return 'unknown'
}

function extractErrorMessage(bodyPreview?: string): string | undefined {
  if (!bodyPreview) {
    return undefined
  }

  try {
    const parsed = JSON.parse(bodyPreview) as unknown
    if (isRecord(parsed)) {
      const error = parsed.error
      if (typeof error === 'string') {
        return error
      }
      if (isRecord(error) && typeof error.message === 'string') {
        return error.message
      }
      if (typeof parsed.message === 'string') {
        return parsed.message
      }
    }
  } catch {
    // Plain-text provider errors are common; fall through to trimmed body text.
  }

  const trimmed = bodyPreview.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function previewBody(body: string): string | undefined {
  const trimmed = body.trim()
  if (!trimmed) {
    return undefined
  }

  return trimmed.slice(0, MAX_BODY_PREVIEW_LENGTH)
}

function isAbortError(error: unknown): boolean {
  return (
    error instanceof DOMException && error.name === 'AbortError'
  ) || (
    error instanceof Error && error.name === 'AbortError'
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
