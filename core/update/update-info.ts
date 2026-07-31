import type { UpdateCheckResult, UpdateInfo } from '@shared/types/update'

const VERSION_PATTERN = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/
const RELEASE_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const MAX_CHANGELOG_LINES = 100
const MAX_CHANGELOG_LINE_LENGTH = 2_000
const MAX_DOWNLOADS = 10

type VersionTuple = readonly [major: number, minor: number, patch: number]

export function parseUpdateInfoDocument(input: unknown): UpdateInfo {
  if (!isRecord(input)) {
    throw new Error('Update information must be a JSON object.')
  }

  const version = parseVersionText(input.version, 'version')
  const releaseDate = parseReleaseDate(input.release_date)
  const changelog = parseChangelog(input.changelog)
  const downloads = parseDownloads(input.downloads)

  return {
    version,
    releaseDate,
    changelog,
    downloads,
  }
}

export function isVersionNewer(currentVersion: string, latestVersion: string): boolean {
  const current = parseVersionTuple(currentVersion, 'current version')
  const latest = parseVersionTuple(latestVersion, 'latest version')

  for (let index = 0; index < current.length; index += 1) {
    if (latest[index] !== current[index]) {
      return latest[index] > current[index]
    }
  }

  return false
}

export function parseUpdateCheckResponseDocument(
  input: unknown,
  currentVersion: string
): UpdateCheckResult {
  if (!isRecord(input) || input.ok !== true) {
    throw new Error('Update check response must be a successful JSON object.')
  }

  const normalizedCurrentVersion = parseVersionText(currentVersion, 'current version')
  const responseCurrentVersion = parseVersionText(input.currentVersion, 'response currentVersion')
  if (responseCurrentVersion !== normalizedCurrentVersion) {
    throw new Error('Update check response currentVersion does not match the request.')
  }

  const updateInfo = parseUpdateInfoDocument(input.release)
  const responseLatestVersion = parseVersionText(input.latestVersion, 'response latestVersion')
  if (responseLatestVersion !== updateInfo.version) {
    throw new Error('Update check response latestVersion does not match the release document.')
  }

  const hasUpdate = isVersionNewer(normalizedCurrentVersion, updateInfo.version)
  if (typeof input.hasUpdate !== 'boolean' || input.hasUpdate !== hasUpdate) {
    throw new Error('Update check response hasUpdate is inconsistent with its versions.')
  }

  return {
    ...updateInfo,
    currentVersion: normalizedCurrentVersion,
    hasUpdate,
  }
}

function parseVersionText(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    throw new Error(`Update information ${field} must be a string.`)
  }

  const trimmed = value.trim()
  parseVersionTuple(trimmed, field)
  return trimmed.replace(/^v/, '')
}

function parseVersionTuple(value: string, field: string): VersionTuple {
  const match = VERSION_PATTERN.exec(value.trim())
  if (!match) {
    throw new Error(`Update information ${field} must use X.Y.Z format.`)
  }

  const tuple = match.slice(1).map(Number)
  if (tuple.some((part) => !Number.isSafeInteger(part))) {
    throw new Error(`Update information ${field} contains an unsupported number.`)
  }

  return tuple as unknown as VersionTuple
}

function parseReleaseDate(value: unknown): string {
  if (value === undefined || value === null || value === '') {
    return ''
  }
  if (typeof value !== 'string' || !RELEASE_DATE_PATTERN.test(value.trim())) {
    throw new Error('Update information release_date must use YYYY-MM-DD format.')
  }
  return value.trim()
}

function parseChangelog(value: unknown): string[] {
  if (value === undefined || value === null) {
    return []
  }
  if (!Array.isArray(value) || value.length > MAX_CHANGELOG_LINES) {
    throw new Error('Update information changelog must be a short string array.')
  }

  return value.map((line) => {
    if (typeof line !== 'string') {
      throw new Error('Update information changelog entries must be strings.')
    }
    const trimmed = line.trim()
    if (!trimmed || trimmed.length > MAX_CHANGELOG_LINE_LENGTH) {
      throw new Error('Update information contains an invalid changelog entry.')
    }
    return trimmed
  })
}

function parseDownloads(value: unknown): Record<string, string> {
  if (value === undefined || value === null) {
    return {}
  }
  if (!isRecord(value) || Object.keys(value).length > MAX_DOWNLOADS) {
    throw new Error('Update information downloads must be a small object.')
  }

  const downloads: Record<string, string> = {}
  for (const [source, candidate] of Object.entries(value)) {
    if (!/^[a-z0-9_-]+$/i.test(source) || typeof candidate !== 'string') {
      throw new Error('Update information contains an invalid download entry.')
    }

    const url = new URL(candidate)
    if (url.protocol !== 'https:') {
      throw new Error('Update download URLs must use HTTPS.')
    }
    downloads[source] = url.toString()
  }

  return downloads
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
