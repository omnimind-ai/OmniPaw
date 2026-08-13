import type { WebSearchDepth, WebSearchProvider } from '@shared/types/web-search'
import type { WebSearchTimeRange, WebSearchTopic } from './base-provider'
import {
  defaultWebSearchProviderRegistry,
  type WebSearchProviderRegistry,
} from './provider-registry'
import { clampInteger } from './provider-utils'

const MAX_QUERY_LENGTH = 400
const MAX_RESULT_COUNT = 10
const MAX_SNIPPET_LENGTH = 1_500

export interface WebSearchResult {
  id: string
  title: string
  url: string
  snippet?: string
  favicon?: string
}

export interface WebSearchRuntimeConfig {
  provider: WebSearchProvider
  apiKey: string
  maxResults: number
  searchDepth: WebSearchDepth
}

export interface WebSearchInput {
  query: string
  toolCallId: string
  runtime: WebSearchRuntimeConfig
  maxResults?: number
  topic?: WebSearchTopic
  days?: number
  timeRange?: WebSearchTimeRange
  country?: string
  language?: string
  includeDomains?: string[]
  excludeDomains?: string[]
  signal?: AbortSignal
  fetchImpl?: typeof fetch
  providerRegistry?: WebSearchProviderRegistry
}

export async function searchWeb(input: WebSearchInput): Promise<{
  query: string
  provider: WebSearchProvider
  results: WebSearchResult[]
}> {
  const query = input.query.trim().slice(0, MAX_QUERY_LENGTH)
  if (!query) throw new Error('web_search requires a non-empty query.')
  if (!input.runtime.apiKey.trim()) {
    throw new Error('The selected Web Search provider has no saved API key.')
  }

  const configuredMaxResults = clampInteger(input.runtime.maxResults, 5, 1, MAX_RESULT_COUNT)
  const maxResults = clampInteger(input.maxResults, configuredMaxResults, 1, configuredMaxResults)
  const provider = (input.providerRegistry ?? defaultWebSearchProviderRegistry).create(
    input.runtime.provider,
    { apiKey: input.runtime.apiKey, fetch: input.fetchImpl }
  )
  const results = await provider.search({
    query,
    maxResults,
    searchDepth: input.runtime.searchDepth,
    topic: input.topic === 'news' ? 'news' : 'general',
    days: input.days,
    timeRange: input.timeRange,
    country: input.country,
    language: input.language,
    includeDomains: input.includeDomains,
    excludeDomains: input.excludeDomains,
    signal: input.signal,
  })

  return {
    query,
    provider: provider.id,
    results: normalizeProviderResults(results, input.toolCallId, maxResults),
  }
}

function normalizeProviderResults(
  results: Array<{ title: string; url: string; snippet?: string; favicon?: string }>,
  toolCallId: string,
  maxResults: number
): WebSearchResult[] {
  const prefix = normalizeReferencePrefix(toolCallId)
  return results
    .flatMap((result, index) => {
      const url = safeHttpUrl(result.url)
      if (!url) return []
      return [
        {
          id: `${prefix}.${index + 1}`,
          title: result.title.trim() || url,
          url,
          snippet: result.snippet?.trim().slice(0, MAX_SNIPPET_LENGTH) || undefined,
          favicon: safeHttpUrl(result.favicon),
        },
      ]
    })
    .slice(0, maxResults)
}

function safeHttpUrl(value: unknown): string | undefined {
  const candidate = typeof value === 'string' ? value.trim() : ''
  if (!candidate) return undefined
  try {
    const parsed = new URL(candidate)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
      ? parsed.toString()
      : undefined
  } catch {
    return undefined
  }
}

function normalizeReferencePrefix(toolCallId: string): string {
  const normalized = toolCallId.replace(/[^a-z0-9_-]/gi, '').slice(-24)
  if (!normalized) return 'web'
  return normalized.length <= 16 ? normalized : `web_${normalized.slice(-12)}`
}
