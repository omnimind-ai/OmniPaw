import assert from 'node:assert/strict'

import { resolveLaunchEffect } from '../../core/role/growth/engine'

const HOUR_MS = 60 * 60 * 1000
const now = 60 * 24 * HOUR_MS
const vitals = {
  affection: 50,
  mood: 'normal' as const,
  moodScore: 0,
}

const oneDayAway = resolveLaunchEffect({
  vitals,
  now,
  lastSeenAt: now - 24 * HOUR_MS,
})
assert.equal(oneDayAway.awayMs, 24 * HOUR_MS)
assert.equal(oneDayAway.moodDelta, 0)
assert.equal(oneDayAway.moodAfter, 'normal')

const twoDaysAway = resolveLaunchEffect({
  vitals,
  now,
  lastSeenAt: now - 48 * HOUR_MS,
})
assert.ok(twoDaysAway.moodDelta < 0)
assert.ok(twoDaysAway.moodDelta >= -8)
assert.equal(twoDaysAway.moodAfter, 'normal')

const longAbsence = resolveLaunchEffect({
  vitals,
  now,
  lastSeenAt: now - 30 * 24 * HOUR_MS,
})
assert.equal(longAbsence.moodDelta, -32)

process.stdout.write('cat pet growth smoke passed\n')
