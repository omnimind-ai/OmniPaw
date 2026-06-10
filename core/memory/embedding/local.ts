import {
  hashEmbeddingText,
  hashEmbeddingToken,
  type MemoryEmbeddingProvider,
  type MemoryEmbeddingResult,
} from './types'

export const localMemoryEmbeddingProvider = 'local'
export const localMemoryEmbeddingModel = 'hashing-char-gram-v1'
export const localMemoryEmbeddingDimension = 256

export function localTextEmbedding(text: string): number[] {
  const vector = new Array<number>(localMemoryEmbeddingDimension).fill(0)
  for (const token of embeddingTokens(text)) {
    const hash = hashEmbeddingToken(token)
    const index = hash % localMemoryEmbeddingDimension
    vector[index] += hash & 1 ? 1 : -1
  }
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0))
  if (!norm) {
    return vector
  }
  return vector.map((value) => Number((value / norm).toFixed(6)))
}

export function localMemoryEmbedding(text: string): MemoryEmbeddingResult {
  const vector = localTextEmbedding(text)
  return {
    provider: localMemoryEmbeddingProvider,
    model: localMemoryEmbeddingModel,
    dimension: localMemoryEmbeddingDimension,
    contentHash: hashEmbeddingText(text),
    vector,
  }
}

export class LocalHashingMemoryEmbeddingProvider implements MemoryEmbeddingProvider {
  readonly id = localMemoryEmbeddingProvider

  async isAvailable(): Promise<boolean> {
    return true
  }

  async embedText(text: string): Promise<MemoryEmbeddingResult> {
    return localMemoryEmbedding(text)
  }

  async embedTexts(texts: string[]): Promise<MemoryEmbeddingResult[]> {
    return texts.map((text) => localMemoryEmbedding(text ?? ''))
  }
}

function embeddingTokens(text: string): string[] {
  const normalized = text.toLowerCase().normalize('NFKC')
  const tokens: string[] = []
  for (const word of normalized.match(/[\p{L}\p{N}_]+/gu) ?? []) {
    if (isAsciiWord(word)) {
      tokens.push(word)
      for (let size = 3; size <= Math.min(5, word.length); size += 1) {
        for (let index = 0; index <= word.length - size; index += 1) {
          tokens.push(word.slice(index, index + size))
        }
      }
      continue
    }

    const compact = word.replace(/\s+/g, '')
    tokens.push(compact)
    for (const size of [2, 3]) {
      if (compact.length < size) {
        continue
      }
      for (let index = 0; index <= compact.length - size; index += 1) {
        tokens.push(compact.slice(index, index + size))
      }
    }
  }
  return [...new Set(tokens.filter((token) => token.length >= 2))]
}

function isAsciiWord(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    if (value.charCodeAt(index) > 127) {
      return false
    }
  }
  return true
}
