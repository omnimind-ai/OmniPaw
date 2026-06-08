export const localMemoryEmbeddingProvider = 'local'
export const localMemoryEmbeddingModel = 'hashing-char-gram-v1'
export const localMemoryEmbeddingDimension = 256

export function memoryEmbeddingText(input: {
  kind?: string
  subject?: string
  content?: string
}): string {
  return [input.kind, input.subject, input.content].filter(Boolean).join('\n')
}

export function localTextEmbedding(text: string): number[] {
  const vector = new Array<number>(localMemoryEmbeddingDimension).fill(0)
  for (const token of embeddingTokens(text)) {
    const hash = hashToken(token)
    const index = hash % localMemoryEmbeddingDimension
    vector[index] += hash & 1 ? 1 : -1
  }
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0))
  if (!norm) {
    return vector
  }
  return vector.map((value) => Number((value / norm).toFixed(6)))
}

export function embeddingCosine(left: number[], right: number[]): number {
  const length = Math.min(left.length, right.length)
  if (!length) {
    return 0
  }
  let dot = 0
  let leftNorm = 0
  let rightNorm = 0
  for (let index = 0; index < length; index += 1) {
    const leftValue = left[index] ?? 0
    const rightValue = right[index] ?? 0
    dot += leftValue * rightValue
    leftNorm += leftValue * leftValue
    rightNorm += rightValue * rightValue
  }
  if (!leftNorm || !rightNorm) {
    return 0
  }
  return dot / Math.sqrt(leftNorm * rightNorm)
}

export function hashEmbeddingText(text: string): string {
  return String(hashToken(text)).padStart(10, '0')
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

function hashToken(token: string): number {
  let hash = 2166136261
  for (let index = 0; index < token.length; index += 1) {
    hash ^= token.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}
