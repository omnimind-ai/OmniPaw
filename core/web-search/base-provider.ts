import type { WebSearchDepth, WebSearchProvider } from '@shared/types/web-search'
import { WebSearchProviderError } from './errors'

export type WebSearchTopic = 'general' | 'news'
export type WebSearchTimeRange = 'day' | 'week' | 'month' | 'year'

export interface WebSearchProviderSearchRequest {
  query: string
  maxResults: number
  searchDepth: WebSearchDepth
  topic: WebSearchTopic
  days?: number
  timeRange?: WebSearchTimeRange
  country?: string
  language?: string
  includeDomains?: string[]
  excludeDomains?: string[]
  signal?: AbortSignal
}

export interface WebSearchProviderResult {
  title: string
  url: string
  snippet?: string
  favicon?: string
}

export interface BaseWebSearchProvider {
  readonly id: WebSearchProvider
  search(request: WebSearchProviderSearchRequest): Promise<WebSearchProviderResult[]>
}

export interface WebSearchProviderClientOptions {
  apiKey: string
  fetch?: typeof fetch
}

export abstract class AbstractWebSearchProvider implements BaseWebSearchProvider {
  abstract readonly id: WebSearchProvider
  protected readonly apiKey: string
  protected readonly fetchImpl: typeof fetch

  constructor(options: WebSearchProviderClientOptions) {
    this.apiKey = options.apiKey
    this.fetchImpl = options.fetch ?? fetch
  }

  abstract search(request: WebSearchProviderSearchRequest): Promise<WebSearchProviderResult[]>

  protected async requestJson(
    url: string,
    init: RequestInit,
    signal?: AbortSignal
  ): Promise<unknown> {
    let response: Response
    try {
      response = await this.fetchImpl(url, { ...init, signal })
    } catch (error) {
      if (signal?.aborted || isAbortError(error)) {
        throw new WebSearchProviderError({
          code: 'aborted',
          provider: this.id,
          message: 'Web Search request was aborted.',
          retryable: false,
          cause: error,
        })
      }
      throw new WebSearchProviderError({
        code: 'network',
        provider: this.id,
        message: `${providerName(this.id)} could not be reached.`,
        retryable: true,
        cause: error,
      })
    }

    if (!response.ok) {
      throw errorFromStatus(this.id, response.status)
    }

    try {
      return await response.json()
    } catch (error) {
      throw new WebSearchProviderError({
        code: 'provider_response',
        provider: this.id,
        message: `${providerName(this.id)} returned an invalid response.`,
        retryable: false,
        providerStatus: response.status,
        cause: error,
      })
    }
  }
}

function errorFromStatus(provider: WebSearchProvider, status: number): WebSearchProviderError {
  const name = providerName(provider)
  if (status === 401 || status === 403) {
    return new WebSearchProviderError({
      code: 'provider_auth',
      provider,
      message: `${name} rejected the saved API key.`,
      retryable: false,
      providerStatus: status,
    })
  }
  if (status === 429 || status === 432) {
    return new WebSearchProviderError({
      code: 'provider_rate_limit',
      provider,
      message: `${name} search is temporarily rate limited.`,
      retryable: true,
      providerStatus: status,
    })
  }
  return new WebSearchProviderError({
    code: 'provider_request',
    provider,
    message: `${name} search failed with HTTP ${status}.`,
    retryable: status >= 500,
    providerStatus: status,
  })
}

function providerName(provider: WebSearchProvider): string {
  return {
    tavily: 'Tavily',
    bocha: 'Bocha',
    brave: 'Brave',
    firecrawl: 'Firecrawl',
    baidu: 'Baidu AI Search',
    exa: 'Exa',
  }[provider]
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}
