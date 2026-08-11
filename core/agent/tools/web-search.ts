import {
  searchWeb,
  type WebSearchResult,
  type WebSearchRuntimeConfig,
  type WebSearchTimeRange,
} from '@core/web-search'
import type { ChatMessagePart, RefPart, ToolCallDisplay } from '@shared/types/chat'
import type { AgentTool } from './types'

const WEB_SEARCH_TOOL_NAME = 'web_search'
const MAX_SNIPPET_LENGTH = 1_500

export type { WebSearchResult, WebSearchRuntimeConfig } from '@core/web-search'

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
  timeRange?: WebSearchTimeRange
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

function isTimeRange(value: unknown): value is WebSearchTimeRange {
  return value === 'day' || value === 'week' || value === 'month' || value === 'year'
}
