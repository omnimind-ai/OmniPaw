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
  assert.equal(payload.latestVersion, '0.1.1')
  assert.equal(payload.hasUpdate, true)
  assert.equal(payload.release.version, '0.1.1')
})

test('reports the current version as up to date', async () => {
  const response = await worker.fetch(
    new Request('https://updates.example.com/updates?currentVersion=v0.1.1')
  )
  const payload = await response.json()

  assert.equal(response.status, 200)
  assert.equal(payload.currentVersion, '0.1.1')
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

test('reads release metadata from R2 when the binding is configured', async () => {
  const bucket = createMockBucket({
    'metadata/version.json': JSON.stringify({
      version: '0.2.0',
      release_date: '2026-08-04',
      changelog: ['R2 metadata'],
      downloads: {
        github: 'https://github.com/Saramanda9988/OpenOmniClaw-electron/releases/latest',
      },
    }),
  })
  const response = await worker.fetch(
    new Request('https://updates.example.com/updates?currentVersion=0.1.1'),
    { UPDATE_ASSETS: bucket }
  )
  const payload = await response.json()

  assert.equal(response.status, 200)
  assert.equal(payload.latestVersion, '0.2.0')
  assert.equal(payload.release.changelog[0], 'R2 metadata')
})

test('serves updater artifacts with immutable caching', async () => {
  const bucket = createMockBucket({
    'artifacts/stable/windows/x64/slim/OmniPaw-0.2.0-windows-x64.exe': {
      body: Uint8Array.from([10, 20, 30, 40, 50]),
      contentType: 'application/vnd.microsoft.portable-executable',
    },
  })
  const response = await worker.fetch(
    new Request(
      'https://updates.example.com/artifacts/stable/windows/x64/slim/OmniPaw-0.2.0-windows-x64.exe'
    ),
    { UPDATE_ASSETS: bucket }
  )

  assert.equal(response.status, 200)
  assert.deepEqual(
    new Uint8Array(await response.arrayBuffer()),
    Uint8Array.from([10, 20, 30, 40, 50])
  )
  assert.equal(response.headers.get('Accept-Ranges'), 'bytes')
  assert.match(response.headers.get('Cache-Control'), /immutable/)
})

test('serves a single byte range for differential downloads', async () => {
  const bucket = createMockBucket({
    'artifacts/stable/windows/x64/full/OmniPaw-0.2.0.exe.blockmap': Uint8Array.from([
      10, 20, 30, 40, 50,
    ]),
  })
  const response = await worker.fetch(
    new Request(
      'https://updates.example.com/artifacts/stable/windows/x64/full/OmniPaw-0.2.0.exe.blockmap',
      { headers: { Range: 'bytes=1-3' } }
    ),
    { UPDATE_ASSETS: bucket }
  )

  assert.equal(response.status, 206)
  assert.equal(response.headers.get('Content-Range'), 'bytes 1-3/5')
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), Uint8Array.from([20, 30, 40]))
})

test('returns headers without a response body for artifact HEAD requests', async () => {
  const bucket = createMockBucket({
    'artifacts/stable/windows/x64/slim/latest.yml': 'version: 0.2.0\n',
  })
  const response = await worker.fetch(
    new Request('https://updates.example.com/artifacts/stable/windows/x64/slim/latest.yml', {
      method: 'HEAD',
    }),
    { UPDATE_ASSETS: bucket }
  )

  assert.equal(response.status, 200)
  assert.equal(response.headers.get('Content-Length'), '15')
  assert.equal(response.headers.get('Cache-Control'), 'no-store')
  assert.equal(await response.text(), '')
})

function createMockBucket(entries) {
  const objects = new Map(
    Object.entries(entries).map(([key, value]) => [key, normalizeMockValue(value)])
  )

  return {
    async head(key) {
      const object = objects.get(key)
      return object ? createMockObject(object) : null
    },
    async get(key, options = {}) {
      const object = objects.get(key)
      if (!object) return null
      const range = options.range
      const body = range
        ? object.body.slice(range.offset, range.offset + range.length)
        : object.body.slice()
      return createMockObject(object, body)
    },
  }
}

function normalizeMockValue(value) {
  if (typeof value === 'object' && value && 'body' in value) {
    return {
      body: toBytes(value.body),
      contentType: value.contentType,
    }
  }
  return { body: toBytes(value), contentType: undefined }
}

function createMockObject(stored, body = stored.body) {
  return {
    body,
    size: stored.body.byteLength,
    httpEtag: '"test-etag"',
    async text() {
      return new TextDecoder().decode(body)
    },
    writeHttpMetadata(headers) {
      if (stored.contentType) {
        headers.set('Content-Type', stored.contentType)
      }
    },
  }
}

function toBytes(value) {
  return value instanceof Uint8Array ? value : new TextEncoder().encode(value)
}
