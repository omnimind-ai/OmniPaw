import type { WebSearchProvider } from '@shared/types/web-search'
import type { BaseWebSearchProvider, WebSearchProviderClientOptions } from './base-provider'
import { BaiduWebSearchProvider } from './providers/baidu'
import { BochaWebSearchProvider } from './providers/bocha'
import { BraveWebSearchProvider } from './providers/brave'
import { ExaWebSearchProvider } from './providers/exa'
import { FirecrawlWebSearchProvider } from './providers/firecrawl'
import { TavilyWebSearchProvider } from './providers/tavily'

type WebSearchProviderFactory = (options: WebSearchProviderClientOptions) => BaseWebSearchProvider

const providerFactories = {
  tavily: (options) => new TavilyWebSearchProvider(options),
  bocha: (options) => new BochaWebSearchProvider(options),
  brave: (options) => new BraveWebSearchProvider(options),
  firecrawl: (options) => new FirecrawlWebSearchProvider(options),
  baidu: (options) => new BaiduWebSearchProvider(options),
  exa: (options) => new ExaWebSearchProvider(options),
} satisfies Record<WebSearchProvider, WebSearchProviderFactory>

export class WebSearchProviderRegistry {
  create(
    provider: WebSearchProvider,
    options: WebSearchProviderClientOptions
  ): BaseWebSearchProvider {
    return providerFactories[provider](options)
  }

  list(): WebSearchProvider[] {
    return Object.keys(providerFactories) as WebSearchProvider[]
  }
}

export const defaultWebSearchProviderRegistry = new WebSearchProviderRegistry()
