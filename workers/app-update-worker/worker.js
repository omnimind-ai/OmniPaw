import versionDocument from './version.json' with { type: 'json' }

const VERSION_PATTERN = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/
const RELEASE_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const MAX_CHANGELOG_LINES = 100
const MAX_CHANGELOG_LINE_LENGTH = 2_000
const MAX_DOWNLOADS = 10

const versionInfo = validateVersionDocument(versionDocument)

export default {
  fetch(request) {
    return handleRequest(request)
  },
}

export function handleRequest(request) {
  const url = new URL(request.url)
  const pathname = normalizePath(url.pathname)

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: responseHeaders(),
    })
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
      endpoints: ['/updates'],
    })
  }

  if (pathname === '/updates') {
    return handleUpdateCheck(url)
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

function handleUpdateCheck(url) {
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
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    ...additionalHeaders,
  }
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
