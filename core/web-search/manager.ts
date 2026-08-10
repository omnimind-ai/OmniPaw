import { searchWeb, type WebSearchRuntimeConfig } from '@core/agent/tools/web-search'
import type {
  SaveWebSearchSettingsRequest,
  TestWebSearchRequest,
  TestWebSearchResponse,
  WebSearchSettings,
} from '@shared/types/web-search'
import type { WebSearchStore } from './store'

export interface WebSearchManagerOptions {
  store: WebSearchStore
  fetch?: typeof fetch
}

export class WebSearchManager {
  private readonly fetchImpl: typeof fetch

  constructor(private readonly options: WebSearchManagerOptions) {
    this.fetchImpl = options.fetch ?? fetch
  }

  load(): WebSearchSettings {
    return this.options.store.load()
  }

  getSettings(): WebSearchSettings {
    return this.options.store.get()
  }

  saveSettings(request: SaveWebSearchSettingsRequest): WebSearchSettings {
    return this.options.store.save(request)
  }

  runtimeSettings(): WebSearchRuntimeConfig | undefined {
    return this.options.store.runtime()
  }

  async test(request: TestWebSearchRequest): Promise<TestWebSearchResponse> {
    const runtime = this.options.store.runtime(request.provider, request.apiKey)
    if (!runtime) {
      return {
        ok: false,
        provider: request.provider,
        resultCount: 0,
        error: {
          code: 'credential_missing',
          message: 'An API key is required for the selected Web Search provider.',
        },
      }
    }

    try {
      const response = await searchWeb({
        query: request.query?.trim() || 'OpenAI',
        toolCallId: 'settings-test',
        runtime: { ...runtime, maxResults: 1 },
        fetchImpl: this.fetchImpl,
      })
      return {
        ok: true,
        provider: request.provider,
        resultCount: response.results.length,
      }
    } catch (error) {
      return {
        ok: false,
        provider: request.provider,
        resultCount: 0,
        error: {
          code: 'request_failed',
          message: error instanceof Error ? error.message : 'Web Search test failed.',
        },
      }
    }
  }
}
