import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { searchWeb, webSearchRefPartFromMessageParts } from '../../core/agent/tools/web-search'
import { WebSearchStore } from '../../core/web-search'
import type { ChatMessagePart } from '../../shared/types/chat'
import type { WebSearchProvider } from '../../shared/types/web-search'

async function runSmoke(): Promise<void> {
  await testTavilySearchAndCitations()
  await testAllProviderAdapters()
  testEncryptedSettingsStore()
  console.log('Web search smoke check passed')
}

async function testTavilySearchAndCitations(): Promise<void> {
  const requests: Array<{ url: string; init?: RequestInit }> = []
  const response = await searchWeb({
    query: 'current framework release',
    toolCallId: 'call_search_42',
    maxResults: 2,
    topic: 'news',
    days: 7,
    runtime: {
      provider: 'tavily',
      apiKey: 'test-key',
      maxResults: 5,
      searchDepth: 'basic',
    },
    fetchImpl: (async (url: string | URL | Request, init?: RequestInit) => {
      requests.push({ url: String(url), init })
      return jsonResponse({
        results: [
          {
            title: 'Release notes',
            url: 'https://example.com/releases',
            content: 'The latest release is available.',
            favicon: 'https://example.com/favicon.ico',
          },
          {
            title: 'Maintainer update',
            url: 'https://updates.example.org/post',
            content: 'The maintainer published an update.',
          },
          {
            title: 'Excluded result',
            url: 'javascript:alert(1)',
            content: 'Unsafe URL.',
          },
        ],
      })
    }) as typeof fetch,
  })

  assert.equal(requests.length, 1)
  assert.equal(requests[0]?.url, 'https://api.tavily.com/search')
  assert.equal(
    (requests[0]?.init?.headers as Record<string, string>).Authorization,
    'Bearer test-key'
  )
  assert.equal(response.provider, 'tavily')
  assert.equal(response.results.length, 2)
  assert.equal(response.results[0]?.id, 'call_search_42.1')
  assert.equal(response.results[0]?.favicon, 'https://example.com/favicon.ico')

  const parts: ChatMessagePart[] = [
    {
      type: 'tool_call',
      tool_calls: [
        {
          id: 'call_search_42',
          name: 'web_search',
          status: 'complete',
          result: JSON.stringify(response),
        },
      ],
    },
    {
      type: 'plain',
      text: 'Documented.<ref>call_search_42.2</ref> Released.<ref>call_search_42.1</ref> Repeated.<ref>call_search_42.2</ref>',
    },
  ]
  const refPart = webSearchRefPartFromMessageParts(parts)
  assert.equal(refPart?.source, 'web_search')
  assert.deepEqual(
    refPart?.refs.map((item) => item.id),
    ['call_search_42.2', 'call_search_42.1']
  )
  assert.equal(
    webSearchRefPartFromMessageParts([{ type: 'plain', text: 'No citations.' }]),
    undefined
  )
}

async function testAllProviderAdapters(): Promise<void> {
  const fixtures: Record<WebSearchProvider, unknown> = {
    tavily: { results: [{ title: 'T', url: 'https://tavily.example', content: 't' }] },
    bocha: {
      data: {
        webPages: {
          value: [
            {
              name: 'B',
              url: 'https://bocha.example',
              snippet: 'b',
              siteIcon: 'https://bocha.example/icon',
            },
          ],
        },
      },
    },
    brave: { web: { results: [{ title: 'R', url: 'https://brave.example', description: 'r' }] } },
    firecrawl: {
      data: { web: [{ title: 'F', url: 'https://firecrawl.example', description: 'f' }] },
    },
    baidu: { references: [{ title: 'D', url: 'https://baidu.example', content: 'd' }] },
    exa: { results: [{ title: 'E', url: 'https://exa.example', text: 'e' }] },
  }

  for (const provider of Object.keys(fixtures) as WebSearchProvider[]) {
    const requests: string[] = []
    const response = await searchWeb({
      query: 'test query',
      toolCallId: `call-${provider}`,
      runtime: { provider, apiKey: 'secret', maxResults: 3, searchDepth: 'advanced' },
      fetchImpl: (async (url: string | URL | Request) => {
        requests.push(String(url))
        return jsonResponse(fixtures[provider])
      }) as typeof fetch,
    })
    assert.equal(requests.length, 1)
    assert.equal(response.provider, provider)
    assert.equal(response.results.length, 1)
    assert.match(response.results[0]?.url ?? '', /^https:/)
  }
}

function testEncryptedSettingsStore(): void {
  const root = mkdtempSync(join(tmpdir(), 'omnipaw-web-search-'))
  try {
    const store = new WebSearchStore({
      dataRootPath: root,
      encrypt: (value) => `encrypted:${Buffer.from(value).toString('base64')}`,
      decrypt: (value) =>
        value.startsWith('encrypted:')
          ? Buffer.from(value.slice('encrypted:'.length), 'base64').toString('utf8')
          : undefined,
    })
    const initial = store.load()
    assert.equal(initial.enabled, false)
    assert.equal(initial.configuredProviders.tavily, false)

    const saved = store.save({
      enabled: true,
      provider: 'exa',
      maxResults: 7,
      searchDepth: 'advanced',
      apiKey: 'private-key',
    })
    assert.equal(saved.configuredProviders.exa, true)
    assert.equal('apiKey' in saved, false)
    assert.equal(store.runtime()?.apiKey, 'private-key')

    const persisted = readFileSync(store.storePath, 'utf8')
    assert.equal(persisted.includes('private-key'), false)
    assert.equal(persisted.includes('encrypted:'), true)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

void runSmoke()
