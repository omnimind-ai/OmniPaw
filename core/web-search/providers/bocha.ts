import {
  AbstractWebSearchProvider,
  type WebSearchProviderResult,
  type WebSearchProviderSearchRequest,
} from '../base-provider'
import { arrayValue, bearerHeaders, recordValue, stringValue } from '../provider-utils'

export class BochaWebSearchProvider extends AbstractWebSearchProvider {
  readonly id = 'bocha' as const

  async search(request: WebSearchProviderSearchRequest): Promise<WebSearchProviderResult[]> {
    const payload: Record<string, unknown> = {
      query: request.query,
      count: request.maxResults,
      summary: false,
    }
    if (request.timeRange) payload.freshness = bochaFreshness(request.timeRange)
    if (request.includeDomains?.length) payload.include = request.includeDomains.join('|')
    if (request.excludeDomains?.length) payload.exclude = request.excludeDomains.join('|')

    const data = await this.requestJson(
      'https://api.bochaai.com/v1/web-search',
      {
        method: 'POST',
        headers: { ...bearerHeaders(this.apiKey), 'Accept-Encoding': 'gzip, deflate' },
        body: JSON.stringify(payload),
      },
      request.signal
    )
    const rows = recordValue(recordValue(recordValue(data)?.data)?.webPages)?.value
    return arrayValue(rows).map((item) => ({
      title: stringValue(recordValue(item)?.name),
      url: stringValue(recordValue(item)?.url),
      snippet: stringValue(recordValue(item)?.snippet),
      favicon: stringValue(recordValue(item)?.siteIcon),
    }))
  }
}

function bochaFreshness(value: NonNullable<WebSearchProviderSearchRequest['timeRange']>): string {
  return { day: 'oneDay', week: 'oneWeek', month: 'oneMonth', year: 'oneYear' }[value]
}
