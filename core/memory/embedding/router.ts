import type { Logger } from '@core/logging'
import type { ProviderManager } from '@core/provider/manager'
import { LocalHashingMemoryEmbeddingProvider, localMemoryEmbeddingProvider } from './local'
import {
  ProviderMemoryEmbeddingProvider,
  ProviderMemoryEmbeddingUnavailableError,
} from './provider'
import type { MemoryEmbeddingProvider, MemoryEmbeddingResult } from './types'

export interface MemoryEmbeddingProviderOptions {
  providers?: ProviderManager
  logger?: Logger
}

export function createMemoryEmbeddingProvider(
  options: MemoryEmbeddingProviderOptions = {}
): MemoryEmbeddingProvider {
  const fallback = new LocalHashingMemoryEmbeddingProvider()
  if (!options.providers) {
    return fallback
  }

  return new RoutedMemoryEmbeddingProvider({
    primary: new ProviderMemoryEmbeddingProvider({
      providers: options.providers,
      logger: options.logger,
    }),
    fallback,
    logger: options.logger,
  })
}

class RoutedMemoryEmbeddingProvider implements MemoryEmbeddingProvider {
  readonly id = 'routed'

  constructor(
    private readonly options: {
      primary: MemoryEmbeddingProvider
      fallback: MemoryEmbeddingProvider
      logger?: Logger
    }
  ) {}

  async isAvailable(): Promise<boolean> {
    return true
  }

  async embedText(text: string): Promise<MemoryEmbeddingResult> {
    return (await this.embedTexts([text]))[0] ?? this.options.fallback.embedText(text)
  }

  async embedTexts(texts: string[]): Promise<MemoryEmbeddingResult[]> {
    if (await this.options.primary.isAvailable()) {
      try {
        return await this.options.primary.embedTexts(texts)
      } catch (error) {
        if (!(error instanceof ProviderMemoryEmbeddingUnavailableError)) {
          this.options.logger?.warn('Memory embedding provider fell back to local embeddings.', {
            provider: this.options.primary.id,
            fallbackProvider: localMemoryEmbeddingProvider,
            errorCode: error instanceof Error ? 'embedding_provider_failed' : 'unknown',
          })
        }
      }
    }

    return this.options.fallback.embedTexts(texts)
  }
}
