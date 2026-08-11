import {
  AbstractWebSearchProvider,
  type WebSearchProviderResult,
  type WebSearchProviderSearchRequest,
} from '../base-provider'
import {
  arrayValue,
  bearerHeaders,
  clampInteger,
  recordValue,
  stringValue,
} from '../provider-utils'

export class TavilyWebSearchProvider extends AbstractWebSearchProvider {
  readonly id = 'tavily' as const

  async search(request: WebSearchProviderSearchRequest): Promise<WebSearchProviderResult[]> {
    const payload: Record<string, unknown> = {
      query: request.query,
      max_results: request.maxResults,
      search_depth: request.searchDepth,
      topic: request.topic,
      include_answer: false,
      include_raw_content: false,
      include_favicon: true,
    }
    if (request.topic === 'news') payload.days = clampInteger(request.days, 3, 1, 30)
    if (request.timeRange) payload.time_range = request.timeRange
    if (request.includeDomains?.length) payload.include_domains = request.includeDomains
    if (request.excludeDomains?.length) payload.exclude_domains = request.excludeDomains

    const data = await this.requestJson(
      'https://api.tavily.com/search',
      {
        method: 'POST',
        headers: bearerHeaders(this.apiKey),
        body: JSON.stringify(payload),
      },
      request.signal
    )
    return arrayValue(recordValue(data)?.results).map((item) => ({
      title: stringValue(recordValue(item)?.title),
      url: stringValue(recordValue(item)?.url),
      snippet: stringValue(recordValue(item)?.content),
      favicon: stringValue(recordValue(item)?.favicon),
    }))
  }
}
