import type { WebSearchProvider } from '@shared/types/web-search'

export type WebSearchErrorCode =
  | 'provider_auth'
  | 'provider_rate_limit'
  | 'provider_request'
  | 'provider_response'
  | 'network'
  | 'aborted'

export interface WebSearchProviderErrorOptions {
  code: WebSearchErrorCode
  provider: WebSearchProvider
  message: string
  retryable: boolean
  providerStatus?: number
  cause?: unknown
}

export class WebSearchProviderError extends Error {
  readonly code: WebSearchErrorCode
  readonly provider: WebSearchProvider
  readonly retryable: boolean
  readonly providerStatus?: number

  constructor(options: WebSearchProviderErrorOptions) {
    super(options.message)
    this.name = 'WebSearchProviderError'
    this.code = options.code
    this.provider = options.provider
    this.retryable = options.retryable
    this.providerStatus = options.providerStatus
    this.cause = options.cause
  }
}
