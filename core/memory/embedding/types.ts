export interface MemoryEmbeddingMetadata {
  provider: string
  model: string
  dimension: number
}

export interface MemoryEmbeddingResult extends MemoryEmbeddingMetadata {
  contentHash: string
  vector: number[]
}

export interface MemoryEmbeddingProvider {
  readonly id: string
  isAvailable(): Promise<boolean>
  embedText(text: string): Promise<MemoryEmbeddingResult>
  embedTexts(texts: string[]): Promise<MemoryEmbeddingResult[]>
}

export function memoryEmbeddingText(input: {
  kind?: string
  subject?: string
  content?: string
}): string {
  return [input.kind, input.subject, input.content].filter(Boolean).join('\n')
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
  return String(hashEmbeddingToken(text)).padStart(10, '0')
}

export function hashEmbeddingToken(token: string): number {
  let hash = 2166136261
  for (let index = 0; index < token.length; index += 1) {
    hash ^= token.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

export function normalizeEmbeddingVector(vector: number[]): number[] {
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0))
  if (!norm) {
    return vector.map((value) => Number(value.toFixed(6)))
  }
  return vector.map((value) => Number((value / norm).toFixed(6)))
}
