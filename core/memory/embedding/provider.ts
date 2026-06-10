import type { Logger } from '@core/logging'
import type { ProviderManager, ProviderModelRecord, ProviderRecord } from '@core/provider/manager'
import {
  hashEmbeddingText,
  type MemoryEmbeddingProvider,
  type MemoryEmbeddingResult,
  normalizeEmbeddingVector,
} from './types'

export interface ProviderMemoryEmbeddingProviderOptions {
  providers: ProviderManager
  logger?: Logger
}

interface ProviderEmbeddingSelection {
  provider: ProviderRecord
  model: ProviderModelRecord
}

export class ProviderMemoryEmbeddingUnavailableError extends Error {
  constructor(message = 'Provider embedding model is not configured.') {
    super(message)
    this.name = 'ProviderMemoryEmbeddingUnavailableError'
  }
}

export class ProviderMemoryEmbeddingProvider implements MemoryEmbeddingProvider {
  readonly id = 'provider'

  constructor(private readonly options: ProviderMemoryEmbeddingProviderOptions) {}

  async isAvailable(): Promise<boolean> {
    return Boolean(await this.resolveSelection().catch(() => undefined))
  }

  async embedText(text: string): Promise<MemoryEmbeddingResult> {
    return (await this.embedTexts([text]))[0] ?? this.unavailable()
  }

  async embedTexts(texts: string[]): Promise<MemoryEmbeddingResult[]> {
    const normalizedTexts = texts.map((text) => text ?? '')
    if (!normalizedTexts.length) {
      return []
    }

    const selection = await this.requireSelection()
    const client = await this.options.providers.createProviderClient(selection.provider.id)
    if (!client.embedTexts) {
      throw new Error(`Provider does not support text embeddings: ${selection.provider.id}`)
    }

    const response = await client.embedTexts({
      modelId: selection.model.remoteId || selection.model.id,
      input: normalizedTexts,
    })
    if (response.embeddings.length !== normalizedTexts.length) {
      throw new Error('Provider returned an embedding count that does not match the input count.')
    }

    return response.embeddings.map((vector, index) => ({
      provider: selection.provider.id,
      model: selection.model.id,
      dimension: vector.length,
      contentHash: hashEmbeddingText(normalizedTexts[index] ?? ''),
      vector: normalizeEmbeddingVector(vector),
    }))
  }

  private async requireSelection(): Promise<ProviderEmbeddingSelection> {
    const selection = await this.resolveSelection()
    if (!selection) {
      return this.unavailable()
    }
    return selection
  }

  private async resolveSelection(): Promise<ProviderEmbeddingSelection | undefined> {
    try {
      return await this.options.providers.resolveEmbeddingProvider()
    } catch (error) {
      this.options.logger?.warn('Memory embedding provider selection failed.', {
        errorCode: error instanceof Error ? 'embedding_selection_failed' : 'unknown',
      })
      return undefined
    }
  }

  private unavailable(): never {
    throw new ProviderMemoryEmbeddingUnavailableError()
  }
}
