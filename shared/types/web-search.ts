export const WEB_SEARCH_PROVIDERS = [
  'tavily',
  'bocha',
  'brave',
  'firecrawl',
  'baidu',
  'exa',
] as const

export type WebSearchProvider = (typeof WEB_SEARCH_PROVIDERS)[number]

export type WebSearchDepth = 'basic' | 'advanced'

export interface WebSearchSettings {
  enabled: boolean
  provider: WebSearchProvider
  maxResults: number
  searchDepth: WebSearchDepth
  configuredProviders: Record<WebSearchProvider, boolean>
  updatedAt?: number
}

export interface SaveWebSearchSettingsRequest {
  enabled: boolean
  provider: WebSearchProvider
  maxResults: number
  searchDepth: WebSearchDepth
  /** A non-empty value replaces the saved key for the selected provider. */
  apiKey?: string
}

export interface TestWebSearchRequest {
  provider: WebSearchProvider
  query?: string
  /** Tests an unsaved key when supplied. The value is never returned. */
  apiKey?: string
}

export interface TestWebSearchResponse {
  ok: boolean
  provider: WebSearchProvider
  resultCount: number
  error?: {
    code: string
    message: string
  }
}
