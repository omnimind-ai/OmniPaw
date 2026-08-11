import {
  AbstractWebSearchProvider,
  type WebSearchProviderResult,
  type WebSearchProviderSearchRequest,
} from '../base-provider'
import { arrayValue, normalizeCountryCode, recordValue, stringValue } from '../provider-utils'

export class BraveWebSearchProvider extends AbstractWebSearchProvider {
  readonly id = 'brave' as const

  async search(request: WebSearchProviderSearchRequest): Promise<WebSearchProviderResult[]> {
    const url = new URL('https://api.search.brave.com/res/v1/web/search')
    url.searchParams.set('q', request.query)
    url.searchParams.set('count', String(request.maxResults))
    url.searchParams.set('country', normalizeCountryCode(request.country, 'US'))
    url.searchParams.set('search_lang', request.language?.trim() || 'zh-hans')
    if (request.timeRange) url.searchParams.set('freshness', braveFreshness(request.timeRange))

    const data = await this.requestJson(
      url.toString(),
      {
        method: 'GET',
        headers: { Accept: 'application/json', 'X-Subscription-Token': this.apiKey },
      },
      request.signal
    )
    return arrayValue(recordValue(recordValue(data)?.web)?.results).map((item) => ({
      title: stringValue(recordValue(item)?.title),
      url: stringValue(recordValue(item)?.url),
      snippet: stringValue(recordValue(item)?.description),
    }))
  }
}

function braveFreshness(value: NonNullable<WebSearchProviderSearchRequest['timeRange']>): string {
  return { day: 'pd', week: 'pw', month: 'pm', year: 'py' }[value]
}
