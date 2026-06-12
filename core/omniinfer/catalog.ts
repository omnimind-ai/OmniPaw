import type {
  OmniInferCatalogModel,
  OmniInferCatalogResponse,
  OmniInferPlatform,
} from '@shared/types/omniinfer'
import { basename } from 'node:path'

interface CatalogOptions {
  baseUrl: string
  platform: OmniInferPlatform
  modelDir: string
  fetchImpl?: typeof fetch
  fileExists?: (path: string) => Promise<boolean>
}

interface RawSupportedModelsResponse {
  system?: string
  best?: unknown
  models?: unknown
  [key: string]: unknown
}

interface RawModelEntry {
  id?: unknown
  name?: unknown
  family?: unknown
  quantization?: unknown
  backend?: unknown
  download?: unknown
  download_url?: unknown
  url?: unknown
  size?: unknown
  size_bytes?: unknown
  input?: unknown
  context_window?: unknown
  contextWindow?: unknown
  recommended?: unknown
  mmproj?: unknown
  vision?: unknown
}

interface RawModelEntryWithContext extends RawModelEntry {
  _path?: string[]
}

export async function fetchOmniInferCatalog(
  options: CatalogOptions
): Promise<OmniInferCatalogResponse> {
  const fetchImpl = options.fetchImpl ?? fetch
  const response = await fetchImpl(
    `${options.baseUrl.replace(/\/+$/, '')}/omni/supported-models/best?system=${options.platform}`,
    { method: 'GET', headers: { Accept: 'application/json' } }
  )
  if (!response.ok) {
    throw new Error(`OmniInfer catalog request failed with HTTP ${response.status}.`)
  }

  const payload = (await response.json()) as RawSupportedModelsResponse
  const models = await normalizeCatalogModels(payload, options)
  return {
    platform: options.platform,
    models,
    fetchedAt: Date.now(),
  }
}

export async function normalizeCatalogModels(
  payload: RawSupportedModelsResponse,
  options: Pick<CatalogOptions, 'modelDir' | 'fileExists'>
): Promise<OmniInferCatalogModel[]> {
  const entries = flattenRawModelEntries(payload)
  const seen = new Set<string>()
  const models: OmniInferCatalogModel[] = []

  for (const entry of entries) {
    const downloadUrl = stringValue(entry.download_url) || stringValue(entry.download)
    if (!downloadUrl) {
      continue
    }

    const context = inferEntryContext(entry)
    const filename = inferFilename(downloadUrl, stringValue(entry.name) || context.name)
    const family = stringValue(entry.family) || context.family || inferFamily(entry, filename)
    const quantization =
      stringValue(entry.quantization) || context.quantization || inferQuantization(filename)
    const id = normalizeModelId(
      stringValue(entry.id) || `${context.name || family}-${quantization || filename}`
    )
    if (!id || seen.has(id)) {
      continue
    }
    seen.add(id)

    const localPath = `${options.modelDir}/${filename}`
    const vision = parseVisionModel(entry)
    const visionLocalPath = vision?.filename ? `${options.modelDir}/${vision.filename}` : undefined
    const installed = options.fileExists ? await options.fileExists(localPath) : false
    const visionInstalled =
      options.fileExists && visionLocalPath ? await options.fileExists(visionLocalPath) : false

    models.push({
      id,
      family,
      name: stringValue(entry.name) || context.name || humanizeModelName(family, quantization),
      quantization,
      backend: stringValue(entry.backend) || context.backend,
      downloadUrl,
      filename,
      sizeBytes: numberValue(entry.size_bytes) ?? parseSizeToBytes(entry.size),
      sizeGiB: bytesToGiB(numberValue(entry.size_bytes) ?? parseSizeToBytes(entry.size)),
      input: parseInput(entry.input, vision?.url),
      contextWindow: numberValue(entry.contextWindow) ?? numberValue(entry.context_window),
      recommended: booleanValue(entry.recommended) ?? true,
      installed,
      localPath,
      visionDownloadUrl: vision?.url,
      visionFilename: vision?.filename,
      visionSizeBytes: vision?.sizeBytes,
      visionInstalled,
      visionLocalPath,
    })
  }

  return models
}

export function platformFromNodePlatform(platform: NodeJS.Platform): OmniInferPlatform {
  if (platform === 'win32') {
    return 'windows'
  }
  if (platform === 'darwin') {
    return 'mac'
  }
  return 'linux'
}

function flattenRawModelEntries(payload: RawSupportedModelsResponse): RawModelEntryWithContext[] {
  const roots = [payload.best, payload.models, payload]
  const entries: RawModelEntryWithContext[] = []
  for (const root of roots) {
    collectEntries(root, entries, [])
  }
  return entries
}

function collectEntries(
  value: unknown,
  entries: RawModelEntryWithContext[],
  path: string[]
): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectEntries(item, entries, path)
    }
    return
  }
  if (!isRecord(value)) {
    return
  }
  if (stringValue(value.download) || stringValue(value.download_url) || stringValue(value.url)) {
    entries.push({ ...value, _path: path })
    return
  }
  for (const [key, nested] of Object.entries(value)) {
    collectEntries(nested, entries, [...path, key])
  }
}

function inferEntryContext(entry: RawModelEntryWithContext): {
  backend?: string
  family?: string
  name?: string
  quantization?: string
} {
  const path = entry._path ?? []
  const quantizationIndex = path.lastIndexOf('quantization')
  const quantization =
    quantizationIndex >= 0 ? path[quantizationIndex + 1] : path[path.length - 1]
  const beforeQuantization =
    quantizationIndex >= 0 ? path.slice(0, quantizationIndex) : path.slice(0, -1)
  const backend = beforeQuantization.length >= 3 ? beforeQuantization[0] : undefined
  const offset = backend ? 1 : 0
  return {
    backend,
    family: beforeQuantization[offset],
    name: beforeQuantization[offset + 1],
    quantization,
  }
}

function parseVisionModel(entry: RawModelEntry):
  | {
      url: string
      filename: string
      sizeBytes?: number
    }
  | undefined {
  const raw = entry.mmproj ?? entry.vision
  if (!isRecord(raw)) {
    const url = stringValue(raw)
    return url ? { url, filename: inferFilename(url, 'mmproj.gguf') } : undefined
  }
  const url = stringValue(raw.download_url) || stringValue(raw.download) || stringValue(raw.url)
  if (!url) {
    return undefined
  }
  return {
    url,
    filename: inferFilename(url, stringValue(raw.name) || 'mmproj.gguf'),
    sizeBytes: numberValue(raw.size_bytes) ?? parseSizeToBytes(raw.size),
  }
}

function parseInput(value: unknown, visionUrl?: string): Array<'text' | 'image'> {
  const input = Array.isArray(value) ? value.map(stringValue).filter(Boolean) : []
  const result: Array<'text' | 'image'> = ['text']
  if (visionUrl || input.includes('image') || input.includes('vision')) {
    result.push('image')
  }
  return result
}

function inferFilename(url: string, fallback?: string): string {
  try {
    const parsed = new URL(url)
    const name = basename(parsed.pathname)
    if (name) {
      return name
    }
  } catch {
    const name = basename(url.split('?')[0] ?? '')
    if (name) {
      return name
    }
  }
  return sanitizeFilename(fallback || 'model.gguf')
}

function inferFamily(entry: RawModelEntry, filename: string): string {
  const name = stringValue(entry.name) || stringValue(entry.id) || filename
  return name.split(/[-_\s]+/).filter(Boolean).slice(0, 2).join('-') || 'omniinfer'
}

function inferQuantization(filename: string): string | undefined {
  return filename.match(/\b(Q[0-9A-Z_]+)\b/i)?.[1]?.toUpperCase()
}

function humanizeModelName(family: string, quantization?: string): string {
  return [family, quantization].filter(Boolean).join(' ')
}

function normalizeModelId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function sanitizeFilename(value: string): string {
  return value.replace(/[\\/:\0]/g, '-')
}

function parseSizeToBytes(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.round(value * 1024 ** 3)
  }
  if (typeof value !== 'string') {
    return undefined
  }
  const match = value.trim().match(/^([\d.]+)\s*([kmgt]?i?b|[kmgt])?$/i)
  if (!match) {
    return undefined
  }
  const amount = Number(match[1])
  if (!Number.isFinite(amount)) {
    return undefined
  }
  const unit = (match[2] || 'b').toLowerCase()
  const multiplier = unit.startsWith('t')
    ? 1024 ** 4
    : unit.startsWith('g')
      ? 1024 ** 3
      : unit.startsWith('m')
        ? 1024 ** 2
        : unit.startsWith('k')
          ? 1024
          : 1
  return Math.round(amount * multiplier)
}

function bytesToGiB(bytes: number | undefined): number | undefined {
  return bytes === undefined ? undefined : Math.round((bytes / 1024 ** 3) * 10) / 10
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}
