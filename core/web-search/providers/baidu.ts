import {
  AbstractWebSearchProvider,
  type WebSearchProviderResult,
  type WebSearchProviderSearchRequest,
} from '../base-provider'
import { arrayValue, bearerHeaders, recordValue, stringValue } from '../provider-utils'

export class BaiduWebSearchProvider extends AbstractWebSearchProvider {
  readonly id = 'baidu' as const

  async search(request: WebSearchProviderSearchRequest): Promise<WebSearchProviderResult[]> {
    const payload: Record<string, unknown> = {
      messages: [{ role: 'user', content: request.query.slice(0, 72) }],
      search_source: 'baidu_search_v2',
      resource_type_filter: [{ type: 'web', top_k: request.maxResults }],
    }
    if (request.timeRange) payload.search_recency_filter = baiduFreshness(request.timeRange)
    if (request.includeDomains?.length) {
      payload.search_filter = { match: { site: request.includeDomains.slice(0, 100) } }
    }

    const data = await this.requestJson(
      'https://qianfan.baidubce.com/v2/ai_search/web_search',
      {
        method: 'POST',
        headers: {
          ...bearerHeaders(this.apiKey),
          'X-Appbuilder-Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(payload),
      },
      request.signal
    )
    return arrayValue(recordValue(data)?.references).map((item) => ({
      title: stringValue(recordValue(item)?.title),
      url: stringValue(recordValue(item)?.url),
      snippet: stringValue(recordValue(item)?.content),
      favicon: stringValue(recordValue(item)?.icon),
    }))
  }
}

function baiduFreshness(value: NonNullable<WebSearchProviderSearchRequest['timeRange']>): string {
  return value === 'day' || value === 'week' ? 'week' : value
}
