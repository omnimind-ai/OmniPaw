import {
  AbstractWebSearchProvider,
  type WebSearchProviderResult,
  type WebSearchProviderSearchRequest,
} from '../base-provider'
import {
  arrayValue,
  bearerHeaders,
  normalizeCountryCode,
  recordValue,
  stringValue,
} from '../provider-utils'

export class FirecrawlWebSearchProvider extends AbstractWebSearchProvider {
  readonly id = 'firecrawl' as const

  async search(request: WebSearchProviderSearchRequest): Promise<WebSearchProviderResult[]> {
    const payload: Record<string, unknown> = {
      query: request.query,
      limit: request.maxResults,
      sources: ['web'],
    }
    if (request.country) payload.country = normalizeCountryCode(request.country, 'US')

    const data = await this.requestJson(
      'https://api.firecrawl.dev/v2/search',
      {
        method: 'POST',
        headers: bearerHeaders(this.apiKey),
        body: JSON.stringify(payload),
      },
      request.signal
    )
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
}
