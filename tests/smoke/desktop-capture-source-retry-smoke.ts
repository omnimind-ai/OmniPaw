import assert from 'node:assert/strict'

import { retryNonEmptyResult } from '../../electron/desktop-capture-source-retry'

const waits: number[] = []
let attempts = 0
const recovered = await retryNonEmptyResult(
  async () => {
    attempts += 1
    return attempts < 3 ? [] : ['screen:1']
  },
  {
    delaysMs: [100, 200, 400],
    wait: async (delayMs) => {
      waits.push(delayMs)
    },
  }
)

assert.deepEqual(recovered, ['screen:1'])
assert.equal(attempts, 3)
assert.deepEqual(waits, [100, 200])

attempts = 0
const exhausted = await retryNonEmptyResult(
  async () => {
    attempts += 1
    return []
  },
  {
    delaysMs: [50, 100],
    wait: async () => {},
  }
)

assert.deepEqual(exhausted, [])
assert.equal(attempts, 3)

attempts = 0
await assert.rejects(
  () =>
    retryNonEmptyResult(
      async () => {
        attempts += 1
        throw new Error('capture permission denied')
      },
      { delaysMs: [50], wait: async () => {} }
    ),
  /capture permission denied/
)
assert.equal(attempts, 1)

console.log('Desktop capture source retry smoke check passed')
