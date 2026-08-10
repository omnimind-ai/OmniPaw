import type { ChatMessagePart, RefPart, ToolCallDisplay } from '@shared/types/chat'
import type { WebSearchDepth, WebSearchProvider } from '@shared/types/web-search'
import type { AgentTool } from './types'

const WEB_SEARCH_TOOL_NAME = 'web_search'
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
  topic?: 'general' | 'news'
  days?: number
  timeRange?: 'day' | 'week' | 'month' | 'year'
  country?: string
  language?: string
  includeDomains?: string[]
  excludeDomains?: string[]
  signal?: AbortSignal
  fetchImpl?: typeof fetch
}

interface ProviderSearchResult {
  title: string
  url: string
  snippet?: string
  favicon?: string
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
  const providerInput = { ...input, query, maxResults }
  const results = await searchProvider(providerInput)
  return {
    query,
    provider: input.runtime.provider,
    results: normalizeProviderResults(results, input.toolCallId, maxResults),
  }
}

export function createWebSearchExecutor(
  runtimeSettings: () => WebSearchRuntimeConfig | undefined
): AgentTool['execute'] {
  return async (toolCallId, args, signal) => {
    const runtime = runtimeSettings()
    if (!runtime) {
      throw new Error('Web Search is disabled or its selected provider has no saved API key.')
    }
    const input = asWebSearchArgs(args)
    const response = await searchWeb({
      ...input,
      query: input.query ?? '',
      toolCallId,
      runtime,
      signal,
    })
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            ...response,
            citationFormat: '<ref>result-id</ref>',
          }),
        },
      ],
    }
  }
}

export function webSearchRefPartFromMessageParts(
  parts: readonly ChatMessagePart[]
): RefPart | undefined {
  const citedIds = citedReferenceIds(parts)
  if (!citedIds.length) return undefined

  const results = webSearchResultsFromParts(parts)
  const refs = citedIds.flatMap((id) => {
    const result = results.get(id)
    return result ? [result] : []
  })
  return refs.length ? { type: 'ref', source: 'web_search', refs } : undefined
}

export function synchronizeWebSearchRefPart(parts: ChatMessagePart[]): void {
  const nextRefPart = webSearchRefPartFromMessageParts(parts)
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const part = parts[index]
    if (part?.type === 'ref' && part.source === 'web_search') parts.splice(index, 1)
  }
  if (nextRefPart) parts.push(nextRefPart)
}

async function searchProvider(
  input: WebSearchInput & { maxResults: number }
): Promise<ProviderSearchResult[]> {
  switch (input.runtime.provider) {
    case 'tavily':
      return searchTavily(input)
    case 'bocha':
      return searchBocha(input)
    case 'brave':
      return searchBrave(input)
    case 'firecrawl':
      return searchFirecrawl(input)
    case 'baidu':
      return searchBaidu(input)
    case 'exa':
      return searchExa(input)
  }
}

async function searchTavily(
  input: WebSearchInput & { maxResults: number }
): Promise<ProviderSearchResult[]> {
  const payload: Record<string, unknown> = {
    query: input.query,
    max_results: input.maxResults,
    search_depth: input.runtime.searchDepth,
    topic: input.topic === 'news' ? 'news' : 'general',
    include_answer: false,
    include_raw_content: false,
    include_favicon: true,
  }
  if (input.topic === 'news') payload.days = clampInteger(input.days, 3, 1, 30)
  if (input.timeRange) payload.time_range = input.timeRange
  if (input.includeDomains?.length) payload.include_domains = input.includeDomains
  if (input.excludeDomains?.length) payload.exclude_domains = input.excludeDomains

  const data = await fetchJson(input, 'https://api.tavily.com/search', {
    method: 'POST',
    headers: bearerHeaders(input.runtime.apiKey),
    body: JSON.stringify(payload),
  })
  return arrayValue(recordValue(data)?.results).map((item) => ({
    title: stringValue(recordValue(item)?.title),
    url: stringValue(recordValue(item)?.url),
    snippet: stringValue(recordValue(item)?.content),
    favicon: stringValue(recordValue(item)?.favicon),
  }))
}

async function searchBocha(
  input: WebSearchInput & { maxResults: number }
): Promise<ProviderSearchResult[]> {
  const payload: Record<string, unknown> = {
    query: input.query,
    count: input.maxResults,
    summary: false,
  }
  if (input.timeRange) payload.freshness = bochaFreshness(input.timeRange)
  if (input.includeDomains?.length) payload.include = input.includeDomains.join('|')
  if (input.excludeDomains?.length) payload.exclude = input.excludeDomains.join('|')

  const data = await fetchJson(input, 'https://api.bochaai.com/v1/web-search', {
    method: 'POST',
    headers: { ...bearerHeaders(input.runtime.apiKey), 'Accept-Encoding': 'gzip, deflate' },
    body: JSON.stringify(payload),
  })
  const rows = recordValue(recordValue(recordValue(data)?.data)?.webPages)?.value
  return arrayValue(rows).map((item) => ({
    title: stringValue(recordValue(item)?.name),
    url: stringValue(recordValue(item)?.url),
    snippet: stringValue(recordValue(item)?.snippet),
    favicon: stringValue(recordValue(item)?.siteIcon),
  }))
}

async function searchBrave(
  input: WebSearchInput & { maxResults: number }
): Promise<ProviderSearchResult[]> {
  const url = new URL('https://api.search.brave.com/res/v1/web/search')
  url.searchParams.set('q', input.query)
  url.searchParams.set('count', String(input.maxResults))
  url.searchParams.set('country', normalizeCountryCode(input.country, 'US'))
  url.searchParams.set('search_lang', input.language?.trim() || 'zh-hans')
  if (input.timeRange) url.searchParams.set('freshness', braveFreshness(input.timeRange))

  const data = await fetchJson(input, url.toString(), {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      'X-Subscription-Token': input.runtime.apiKey,
    },
  })
  return arrayValue(recordValue(recordValue(data)?.web)?.results).map((item) => ({
    title: stringValue(recordValue(item)?.title),
    url: stringValue(recordValue(item)?.url),
    snippet: stringValue(recordValue(item)?.description),
  }))
}

async function searchFirecrawl(
  input: WebSearchInput & { maxResults: number }
): Promise<ProviderSearchResult[]> {
  const payload: Record<string, unknown> = {
    query: input.query,
    limit: input.maxResults,
    sources: ['web'],
  }
  if (input.country) payload.country = normalizeCountryCode(input.country, 'US')

  const data = await fetchJson(input, 'https://api.firecrawl.dev/v2/search', {
    method: 'POST',
    headers: bearerHeaders(input.runtime.apiKey),
    body: JSON.stringify(payload),
  })
  const rawData = recordValue(data)?.data
  const rows = Array.isArray(rawData) ? rawData : recordValue(rawData)?.web
  return arrayValue(rows).map((item) => {
    const raw = recordValue(item)
    return {
      title: stringValue(raw?.title),
      url: stringValue(raw?.url),
      snippet:
        stringValue(raw?.description) || stringValue(raw?.snippet) || stringValue(raw?.markdown),
    }
  })
}

async function searchBaidu(
  input: WebSearchInput & { maxResults: number }
): Promise<ProviderSearchResult[]> {
  const payload: Record<string, unknown> = {
    messages: [{ role: 'user', content: input.query.slice(0, 72) }],
    search_source: 'baidu_search_v2',
    resource_type_filter: [{ type: 'web', top_k: input.maxResults }],
  }
  if (input.timeRange) payload.search_recency_filter = baiduFreshness(input.timeRange)
  if (input.includeDomains?.length) {
    payload.search_filter = { match: { site: input.includeDomains.slice(0, 100) } }
  }

  const apiKey = input.runtime.apiKey
  const data = await fetchJson(input, 'https://qianfan.baidubce.com/v2/ai_search/web_search', {
    method: 'POST',
    headers: {
      ...bearerHeaders(apiKey),
      'X-Appbuilder-Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  })
  return arrayValue(recordValue(data)?.references).map((item) => ({
    title: stringValue(recordValue(item)?.title),
    url: stringValue(recordValue(item)?.url),
    snippet: stringValue(recordValue(item)?.content),
    favicon: stringValue(recordValue(item)?.icon),
  }))
}

async function searchExa(
  input: WebSearchInput & { maxResults: number }
): Promise<ProviderSearchResult[]> {
  const payload: Record<string, unknown> = {
    query: input.query,
    numResults: input.maxResults,
    type: 'auto',
    contents: { text: { maxCharacters: 500 } },
  }
  if (input.includeDomains?.length) payload.includeDomains = input.includeDomains
  if (input.excludeDomains?.length) payload.excludeDomains = input.excludeDomains
  if (input.topic === 'news') payload.category = 'news'

  const data = await fetchJson(input, 'https://api.exa.ai/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': input.runtime.apiKey,
    },
    body: JSON.stringify(payload),
  })
  return arrayValue(recordValue(data)?.results).map((item) => {
    const raw = recordValue(item)
    return {
      title: stringValue(raw?.title),
      url: stringValue(raw?.url),
      snippet:
        stringValue(raw?.text) ||
        stringValue(arrayValue(raw?.highlights)[0]) ||
        stringValue(raw?.summary),
    }
  })
}

async function fetchJson(
  input: Pick<WebSearchInput, 'runtime' | 'signal' | 'fetchImpl'>,
  url: string,
  init: RequestInit
): Promise<unknown> {
  const response = await (input.fetchImpl ?? fetch)(url, { ...init, signal: input.signal })
  if (!response.ok) throw new Error(providerErrorMessage(input.runtime.provider, response.status))
  return response.json() as Promise<unknown>
}

function bearerHeaders(apiKey: string): Record<string, string> {
  return { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
}

function normalizeProviderResults(
  results: ProviderSearchResult[],
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

function citedReferenceIds(parts: readonly ChatMessagePart[]): string[] {
  const text = parts
    .filter((part): part is Extract<ChatMessagePart, { type: 'plain' }> => part.type === 'plain')
    .map((part) => part.text)
    .join('')
  const ids: string[] = []
  const seen = new Set<string>()
  for (const match of text.matchAll(/<ref>\s*([^<>\r\n]{1,128}?)\s*<\/ref>/gi)) {
    const id = match[1]?.trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    ids.push(id)
  }
  return ids
}

function webSearchResultsFromParts(
  parts: readonly ChatMessagePart[]
): Map<string, WebSearchResult> {
  const results = new Map<string, WebSearchResult>()
  for (const part of parts) {
    if (part.type !== 'tool_call') continue
    const calls = (part.tool_calls ?? part.toolCalls ?? []) as ToolCallDisplay[]
    for (const call of calls) {
      if (call.name !== WEB_SEARCH_TOOL_NAME || call.status !== 'complete') continue
      const payload = parseJsonRecord(call.result)
      for (const item of arrayValue(payload?.results)) {
        const normalized = normalizeStoredResult(item)
        if (normalized) results.set(normalized.id, normalized)
      }
    }
  }
  return results
}

function normalizeStoredResult(value: unknown): WebSearchResult | undefined {
  const raw = recordValue(value)
  const id = stringValue(raw?.id)
  const url = safeHttpUrl(raw?.url)
  if (!id || !url) return undefined
  return {
    id,
    title: stringValue(raw?.title) || url,
    url,
    snippet: stringValue(raw?.snippet).slice(0, MAX_SNIPPET_LENGTH) || undefined,
    favicon: safeHttpUrl(raw?.favicon),
  }
}

interface WebSearchArgs {
  query?: string
  maxResults?: number
  topic?: 'general' | 'news'
  days?: number
  timeRange?: 'day' | 'week' | 'month' | 'year'
  country?: string
  language?: string
  includeDomains?: string[]
  excludeDomains?: string[]
}

function asWebSearchArgs(value: unknown): WebSearchArgs {
  const raw = recordValue(value)
  const timeRange = raw?.timeRange ?? raw?.time_range
  return {
    query: stringValue(raw?.query),
    maxResults: numberValue(raw?.maxResults ?? raw?.max_results),
    topic: raw?.topic === 'news' ? 'news' : 'general',
    days: numberValue(raw?.days),
    timeRange: isTimeRange(timeRange) ? timeRange : undefined,
    country: stringValue(raw?.country) || undefined,
    language: stringValue(raw?.language ?? raw?.search_lang) || undefined,
    includeDomains: stringArray(raw?.includeDomains ?? raw?.include_domains),
    excludeDomains: stringArray(raw?.excludeDomains ?? raw?.exclude_domains),
  }
}

function parseJsonRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== 'string') return recordValue(value)
  try {
    return recordValue(JSON.parse(value))
  } catch {
    return undefined
  }
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function stringArray(value: unknown): string[] | undefined {
  const values = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/[|,]/) : []
  const normalized = values
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 100)
  return normalized.length ? normalized : undefined
}

function numberValue(value: unknown): number | undefined {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : undefined
}

function safeHttpUrl(value: unknown): string | undefined {
  const candidate = stringValue(value)
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
  return normalized || 'web'
}

function normalizeCountryCode(value: string | undefined, fallback: string): string {
  const normalized = value?.trim().toUpperCase()
  return normalized && /^[A-Z]{2}$/.test(normalized) ? normalized : fallback
}

function clampInteger(value: unknown, fallback: number, min: number, max: number): number {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return fallback
  return Math.max(min, Math.min(Math.floor(numeric), max))
}

function isTimeRange(value: unknown): value is NonNullable<WebSearchArgs['timeRange']> {
  return value === 'day' || value === 'week' || value === 'month' || value === 'year'
}

function bochaFreshness(value: NonNullable<WebSearchArgs['timeRange']>): string {
  return { day: 'oneDay', week: 'oneWeek', month: 'oneMonth', year: 'oneYear' }[value]
}

function braveFreshness(value: NonNullable<WebSearchArgs['timeRange']>): string {
  return { day: 'pd', week: 'pw', month: 'pm', year: 'py' }[value]
}

function baiduFreshness(value: NonNullable<WebSearchArgs['timeRange']>): string {
  return value === 'day' || value === 'week' ? 'week' : value
}

function providerErrorMessage(provider: WebSearchProvider, status: number): string {
  const name = {
    tavily: 'Tavily',
    bocha: 'Bocha',
    brave: 'Brave',
    firecrawl: 'Firecrawl',
    baidu: 'Baidu AI Search',
    exa: 'Exa',
  }[provider]
  if (status === 401 || status === 403) return `${name} rejected the saved API key.`
  if (status === 429 || status === 432) return `${name} search is temporarily rate limited.`
  return `${name} search failed with HTTP ${status}.`
}
