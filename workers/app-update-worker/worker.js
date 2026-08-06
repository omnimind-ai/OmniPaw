import versionDocument from './version.json' with { type: 'json' }

const VERSION_PATTERN = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/
const RELEASE_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const MAX_CHANGELOG_LINES = 100
const MAX_CHANGELOG_LINE_LENGTH = 2_000
const MAX_DOWNLOADS = 10

const bundledVersionInfo = validateVersionDocument(versionDocument)
const VERSION_METADATA_KEY = 'metadata/version.json'
const MAX_VERSION_METADATA_BYTES = 64 * 1024

export default {
  async fetch(request, env = {}) {
    try {
      return await handleRequest(request, env)
    } catch (error) {
      console.error('Update Worker request failed.', error)
      const status = error instanceof HttpError ? error.status : 500
      return jsonResponse(
        {
          ok: false,
          error: status === 500 ? 'Internal server error.' : errorToMessage(error),
        },
        status
      )
    }
  },
}

export async function handleRequest(request, env = {}) {
  const url = new URL(request.url)
  const pathname = normalizePath(url.pathname)

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: responseHeaders(),
    })
  }

  if (pathname.startsWith('/artifacts/')) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return jsonResponse({ ok: false, error: 'Method not allowed.' }, 405, {
        Allow: 'GET, HEAD, OPTIONS',
      })
    }
    return handleArtifactRequest(request, pathname, env)
  }

  if (request.method !== 'GET') {
    return jsonResponse({ ok: false, error: 'Method not allowed.' }, 405, {
      Allow: 'GET, OPTIONS',
    })
  }

  if (pathname === '/') {
    return jsonResponse({
      ok: true,
      service: 'omnipaw-app-update-worker',
      endpoints: ['/updates', '/artifacts/*'],
    })
  }

  if (pathname === '/updates') {
    return handleUpdateCheck(url, env)
  }

  return jsonResponse({ ok: false, error: 'Route not found.' }, 404)
}

export function compareVersions(leftRaw, rightRaw) {
  const left = parseVersionTuple(leftRaw, 'left version')
  const right = parseVersionTuple(rightRaw, 'right version')

  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return left[index] - right[index]
    }
  }

  return 0
}

async function handleUpdateCheck(url, env) {
  const currentVersion = normalizeVersion(url.searchParams.get('currentVersion'))
  if (!currentVersion) {
    return jsonResponse(
      {
        ok: false,
        error: 'currentVersion must use X.Y.Z format.',
      },
      400
    )
  }

  const versionInfo = await resolveVersionInfo(env)
  const latestVersion = versionInfo.version
  return jsonResponse({
    ok: true,
    currentVersion,
    latestVersion,
    hasUpdate: compareVersions(latestVersion, currentVersion) > 0,
    checkedAt: Date.now(),
    release: versionInfo,
  })
}

async function resolveVersionInfo(env) {
  const bucket = env?.UPDATE_ASSETS
  if (!bucket) {
    return bundledVersionInfo
  }

  const object = await bucket.get(VERSION_METADATA_KEY)
  if (!object) {
    throw new HttpError(503, 'Version metadata is unavailable.')
  }
  if (Number(object.size) > MAX_VERSION_METADATA_BYTES) {
    throw new TypeError('Stored version metadata is too large.')
  }

  const text = await object.text()
  if (new TextEncoder().encode(text).byteLength > MAX_VERSION_METADATA_BYTES) {
    throw new TypeError('Stored version metadata is too large.')
  }
  return validateVersionDocument(JSON.parse(text))
}

async function handleArtifactRequest(request, pathname, env) {
  const bucket = env?.UPDATE_ASSETS
  if (!bucket) {
    return jsonResponse({ ok: false, error: 'Artifact storage is unavailable.' }, 503)
  }

  const key = normalizeArtifactKey(pathname)
  if (!key) {
    return jsonResponse({ ok: false, error: 'Invalid artifact path.' }, 400)
  }

  const storedObject = await bucket.head(key)
  if (!storedObject) {
    return jsonResponse({ ok: false, error: 'Artifact not found.' }, 404)
  }

  const range = parseByteRange(request.headers.get('Range'), storedObject.size)
  if (range === null) {
    return new Response(null, {
      status: 416,
      headers: artifactResponseHeaders(storedObject, key, {
        'Content-Range': `bytes */${storedObject.size}`,
      }),
    })
  }

  const object =
    request.method === 'HEAD'
      ? storedObject
      : await bucket.get(key, range ? { range: { offset: range.start, length: range.length } } : {})
  if (!object) {
    return jsonResponse({ ok: false, error: 'Artifact not found.' }, 404)
  }

  const additionalHeaders = range
    ? {
        'Content-Length': String(range.length),
        'Content-Range': `bytes ${range.start}-${range.end}/${storedObject.size}`,
      }
    : { 'Content-Length': String(storedObject.size) }

  return new Response(request.method === 'HEAD' ? null : object.body, {
    status: range ? 206 : 200,
    headers: artifactResponseHeaders(object, key, additionalHeaders),
  })
}

function normalizeArtifactKey(pathname) {
  try {
    const key = decodeURIComponent(pathname.replace(/^\/+/, ''))
    const segments = key.split('/')
    if (
      segments[0] !== 'artifacts' ||
      segments.length < 3 ||
      segments.some((segment) => !segment || segment === '.' || segment === '..')
    ) {
      return ''
    }
    return segments.join('/')
  } catch {
    return ''
  }
}

function parseByteRange(header, size) {
  if (!header) {
    return undefined
  }
  if (!Number.isSafeInteger(size) || size < 1) {
    return null
  }

  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!match || (!match[1] && !match[2])) {
    return null
  }

  if (!match[1]) {
    const suffixLength = Number(match[2])
    if (!Number.isSafeInteger(suffixLength) || suffixLength < 1) {
      return null
    }
    const length = Math.min(suffixLength, size)
    return { start: size - length, end: size - 1, length }
  }

  const start = Number(match[1])
  const requestedEnd = match[2] ? Number(match[2]) : size - 1
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(requestedEnd) ||
    start < 0 ||
    requestedEnd < start ||
    start >= size
  ) {
    return null
  }
  const end = Math.min(requestedEnd, size - 1)
  return { start, end, length: end - start + 1 }
}

function artifactResponseHeaders(object, key, additionalHeaders = {}) {
  const headers = new Headers()
  object.writeHttpMetadata?.(headers)
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', inferContentType(key))
  }
  if (object.httpEtag) {
    headers.set('ETag', object.httpEtag)
  }
  headers.set('Accept-Ranges', 'bytes')
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Access-Control-Expose-Headers', 'Accept-Ranges, Content-Length, Content-Range, ETag')
  headers.set(
    'Cache-Control',
    key.endsWith('/latest.yml') ? 'no-store' : 'public, max-age=31536000, immutable'
  )
  headers.set('X-Content-Type-Options', 'nosniff')
  for (const [name, value] of Object.entries(additionalHeaders)) {
    headers.set(name, value)
  }
  return headers
}

function inferContentType(key) {
  if (key.endsWith('.yml') || key.endsWith('.yaml')) return 'text/yaml; charset=utf-8'
  if (key.endsWith('.json')) return 'application/json; charset=utf-8'
  if (key.endsWith('.blockmap')) return 'application/octet-stream'
  if (key.endsWith('.exe')) return 'application/vnd.microsoft.portable-executable'
  return 'application/octet-stream'
}

function validateVersionDocument(input) {
  if (!isRecord(input)) {
    throw new TypeError('version.json must contain a JSON object.')
  }

  const version = normalizeVersion(input.version)
  if (!version) {
    throw new TypeError('version.json version must use X.Y.Z format.')
  }

  const releaseDate = typeof input.release_date === 'string' ? input.release_date.trim() : ''
  if (releaseDate && !RELEASE_DATE_PATTERN.test(releaseDate)) {
    throw new TypeError('version.json release_date must use YYYY-MM-DD format.')
  }

  if (!Array.isArray(input.changelog) || input.changelog.length > MAX_CHANGELOG_LINES) {
    throw new TypeError('version.json changelog must be a short string array.')
  }
  const changelog = input.changelog.map((line) => {
    if (typeof line !== 'string') {
      throw new TypeError('version.json changelog entries must be strings.')
    }
    const trimmed = line.trim()
    if (!trimmed || trimmed.length > MAX_CHANGELOG_LINE_LENGTH) {
      throw new TypeError('version.json contains an invalid changelog entry.')
    }
    return trimmed
  })

  if (!isRecord(input.downloads) || Object.keys(input.downloads).length > MAX_DOWNLOADS) {
    throw new TypeError('version.json downloads must be a small object.')
  }
  const downloads = {}
  for (const [source, candidate] of Object.entries(input.downloads)) {
    if (!/^[a-z0-9_-]+$/i.test(source) || typeof candidate !== 'string') {
      throw new TypeError('version.json contains an invalid download entry.')
    }
    const downloadUrl = new URL(candidate)
    if (downloadUrl.protocol !== 'https:') {
      throw new TypeError('version.json download URLs must use HTTPS.')
    }
    downloads[source] = downloadUrl.toString()
  }

  return Object.freeze({
    version,
    release_date: releaseDate,
    changelog: Object.freeze(changelog),
    downloads: Object.freeze(downloads),
  })
}

function normalizeVersion(value) {
  if (typeof value !== 'string') {
    return ''
  }
  const match = VERSION_PATTERN.exec(value.trim())
  if (!match) {
    return ''
  }
  return match.slice(1).join('.')
}

function parseVersionTuple(value, field) {
  const normalized = normalizeVersion(value)
  if (!normalized) {
    throw new TypeError(`${field} must use X.Y.Z format.`)
  }
  return normalized.split('.').map(Number)
}

function normalizePath(pathname) {
  if (!pathname || pathname === '/') {
    return '/'
  }
  return pathname.replace(/\/+$/, '') || '/'
}

function jsonResponse(body, status = 200, additionalHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: responseHeaders(additionalHeaders),
  })
}

function responseHeaders(additionalHeaders = {}) {
  return {
    'Access-Control-Allow-Headers': 'Content-Type, Range',
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    ...additionalHeaders,
  }
}

function errorToMessage(error) {
  return error instanceof Error ? error.message : String(error)
}

class HttpError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
