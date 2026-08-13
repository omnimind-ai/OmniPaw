import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const messagesComposable = readFileSync('src/composables/useMessages.ts', 'utf8')
const createLocalExchange = messagesComposable.match(
  /function createLocalExchange[\s\S]*?\n {2}async function sendMessageStream/
)?.[0]

assert.ok(createLocalExchange, 'createLocalExchange should remain available')
assert.match(createLocalExchange, /const createdUserRecord =/)
assert.match(createLocalExchange, /void resolveRecordMedia\(\[createdUserRecord\]\)/)

process.stdout.write('chat renderer media smoke passed\n')
