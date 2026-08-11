import {
  AbstractWebSearchProvider,
  type WebSearchProviderResult,
  type WebSearchProviderSearchRequest,
} from '../base-provider'
import { arrayValue, recordValue, stringValue } from '../provider-utils'

export class ExaWebSearchProvider extends AbstractWebSearchProvider {
  readonly id = 'exa' as const

  async search(request: WebSearchProviderSearchRequest): Promise<WebSearchProviderResult[]> {
    const payload: Record<string, unknown> = {
      query: request.query,
      numResults: request.maxResults,
      type: 'auto',
      contents: { text: { maxCharacters: 500 } },
    }
    if (request.includeDomains?.length) payload.includeDomains = request.includeDomains
    if (request.excludeDomains?.length) payload.excludeDomains = request.excludeDomains
    if (request.topic === 'news') payload.category = 'news'

    const data = await this.requestJson(
      'https://api.exa.ai/search',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': this.apiKey },
        body: JSON.stringify(payload),
      },
      request.signal
    )
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
}
