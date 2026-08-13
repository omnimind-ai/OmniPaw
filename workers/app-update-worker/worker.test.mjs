import assert from 'node:assert/strict'
import test from 'node:test'

import worker, { compareVersions } from './worker.js'

test('returns an available update for an older client', async () => {
  const response = await worker.fetch(
    new Request('https://updates.example.com/updates?currentVersion=0.0.9')
  )
  const payload = await response.json()

  assert.equal(response.status, 200)
  assert.equal(payload.ok, true)
  assert.equal(payload.currentVersion, '0.0.9')
  assert.equal(payload.latestVersion, '0.2.0')
  assert.equal(payload.hasUpdate, true)
  assert.equal(payload.release.version, '0.2.0')
})

test('reports the current version as up to date', async () => {
  const response = await worker.fetch(
    new Request('https://updates.example.com/updates?currentVersion=v0.2.0')
  )
  const payload = await response.json()

  assert.equal(response.status, 200)
  assert.equal(payload.currentVersion, '0.2.0')
  assert.equal(payload.hasUpdate, false)
})

test('rejects an invalid current version', async () => {
  const response = await worker.fetch(
    new Request('https://updates.example.com/updates?currentVersion=latest')
  )
  const payload = await response.json()

  assert.equal(response.status, 400)
  assert.equal(payload.ok, false)
})

test('compares semantic version components numerically', () => {
  assert.equal(compareVersions('0.10.0', '0.9.9') > 0, true)
  assert.equal(compareVersions('1.0.0', '1.0.0'), 0)
  assert.equal(compareVersions('1.0.0', '2.0.0') < 0, true)
})
