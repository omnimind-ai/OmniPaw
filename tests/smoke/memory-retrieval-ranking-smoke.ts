import assert from 'node:assert/strict'

import { memorySearchQueries, mergeRetrievalResults, rankMemories } from '../../core/memory/service'
import type { CompanionMemorySearchResult } from '../../shared/types/memory'

const now = Date.now()

const exactLexical = memory('exact-lexical', -12, undefined)
const weakerLexical = memory('weaker-lexical', -2, undefined)
const vectorOnly = memory('vector-only', undefined, 0.9)
const hybrid = memory('hybrid', -4, 0.8)

const merged = mergeRetrievalResults([weakerLexical, hybrid, exactLexical], [vectorOnly, hybrid])
const ranked = rankMemories(merged, 'chat')

assert.equal(ranked[0]?.id, hybrid.id)
assert.equal(ranked.find((item) => item.id === exactLexical.id)?.retrievalSource, 'lexical')
assert.equal(ranked.find((item) => item.id === vectorOnly.id)?.retrievalSource, 'vector')
assert.equal(ranked.find((item) => item.id === hybrid.id)?.retrievalSource, 'hybrid')
assert.ok(
  (ranked.find((item) => item.id === exactLexical.id)?.retrievalScore ?? 0) >
    (ranked.find((item) => item.id === weakerLexical.id)?.retrievalScore ?? 0)
)

const chineseQueries = memorySearchQueries('我最喜欢什么，你还有印象吗？')
assert.equal(chineseQueries.includes('喜欢'), true)
assert.equal(chineseQueries.includes('印象'), true)

console.log('Memory retrieval ranking smoke check passed')

function memory(
  id: string,
  lexicalScore: number | undefined,
  vectorScore: number | undefined
): CompanionMemorySearchResult {
  return {
    id,
    kind: 'preference',
    scope: 'user',
    status: 'active',
    content: id,
    importance: 3,
    confidence: 0.8,
    createdAt: now,
    updatedAt: now,
    lexicalScore,
    vectorScore,
  }
}
