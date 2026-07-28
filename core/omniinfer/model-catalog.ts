import type {
  ListOmniInferModelCatalogRequest,
  ListOmniInferModelCatalogResponse,
  OmniInferCatalogDownloadFile,
  OmniInferCatalogModel,
  OmniInferCatalogQuantization,
  OmniInferCatalogVisionSpec,
} from '@shared/types/omniinfer'

const OMNICORE_CATALOG_BASE = 'https://omnimind-model.oss-cn-beijing.aliyuncs.com/backend'
const HUGGING_FACE_BASES = ['https://huggingface.co', 'https://hf-mirror.com'] as const
const DEFAULT_HUGGING_FACE_QUERY = 'gguf'
const MAX_HUGGING_FACE_RESULTS = 50

type FetchLike = typeof fetch
type RawCatalog = Record<string, unknown>

interface RawOmniCoreModel {
  tag?: unknown
  quantization?: Record<
    string,
    {
      download?: unknown
      size?: unknown
      backend?: unknown
      required_memory_gib?: unknown
      suitable?: unknown
    }
  >
  context_length?: unknown
  vision?: {
    download?: unknown
    size?: unknown
  }
}

interface RawHuggingFaceSibling {
  rfilename?: unknown
  size?: unknown
}

interface RawHuggingFaceModel {
  modelId?: unknown
  author?: unknown
  downloads?: unknown
  likes?: unknown
  lastModified?: unknown
  tags?: unknown
  siblings?: unknown
}

export interface OmniInferModelCatalogServiceOptions {
  getGatewayBaseUrl?: () => string
  fetchImpl?: FetchLike
  platform?: NodeJS.Platform
}

export class OmniInferModelCatalogService {
  private readonly getGatewayBaseUrl?: () => string
  private readonly fetchImpl: FetchLike
  private readonly platform: NodeJS.Platform

  constructor(options: OmniInferModelCatalogServiceOptions = {}) {
    this.getGatewayBaseUrl = options.getGatewayBaseUrl
    this.fetchImpl = options.fetchImpl ?? fetch
    this.platform = options.platform ?? process.platform
  }

  async list(
    request: ListOmniInferModelCatalogRequest
  ): Promise<ListOmniInferModelCatalogResponse> {
    if (!request || (request.source !== 'omnicore' && request.source !== 'huggingface')) {
      throw new Error('Unknown OmniInfer model catalog source.')
    }
    if (request.source === 'huggingface') {
      const query = request.query?.trim() || DEFAULT_HUGGING_FACE_QUERY
      return {
        source: request.source,
        query,
        models: await this.listHuggingFace(query, request.limit),
      }
    }

    return {
      source: request.source,
      query: request.query?.trim() ?? '',
      models: await this.listOmniCore(),
    }
  }

  private async listOmniCore(): Promise<OmniInferCatalogModel[]> {
    const system = this.platform === 'darwin' ? 'mac' : 'windows'
    const gatewayBaseUrl = normalizeGatewayBaseUrl(this.getGatewayBaseUrl?.() ?? '')
    const urls = [
      gatewayBaseUrl ? `${gatewayBaseUrl}/omni/supported-models/best?system=${system}` : undefined,
      `${OMNICORE_CATALOG_BASE}/${system}/model_list.json`,
    ].filter((url): url is string => Boolean(url))

    let lastError: unknown
    for (const url of urls) {
      try {
        const raw = await fetchJson(this.fetchImpl, url)
        return parseOmniCoreCatalog(extractCatalogPayload(raw))
      } catch (error) {
        lastError = error
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error('Unable to load the OmniCore model catalog.')
  }

  private async listHuggingFace(
    query: string,
    requestedLimit?: number
  ): Promise<OmniInferCatalogModel[]> {
    const limit = normalizeLimit(requestedLimit)
    let lastError: unknown

    for (const base of HUGGING_FACE_BASES) {
      try {
        const url = new URL(`${base}/api/models`)
        url.searchParams.set('search', query)
        url.searchParams.set('filter', 'gguf')
        url.searchParams.set('sort', 'downloads')
        url.searchParams.set('direction', '-1')
        url.searchParams.set('limit', String(limit))
        url.searchParams.set('full', 'true')
        const raw = await fetchJson(this.fetchImpl, url.toString())
        if (!Array.isArray(raw)) {
          throw new Error('Hugging Face returned an invalid model list.')
        }
        return raw
          .map((item) => parseHuggingFaceModel(item, base))
          .filter((item): item is OmniInferCatalogModel => Boolean(item))
      } catch (error) {
        lastError = error
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error('Unable to load the Hugging Face model catalog.')
  }
}

export function parseOmniCoreCatalog(raw: RawCatalog): OmniInferCatalogModel[] {
  const models: OmniInferCatalogModel[] = []

  for (const [firstKey, firstValue] of Object.entries(raw)) {
    if (isModelMap(firstValue)) {
      collectOmniCoreModels(models, firstKey, firstValue)
      continue
    }
    if (!isRecord(firstValue)) continue
    for (const [provider, providerModels] of Object.entries(firstValue)) {
      if (isModelMap(providerModels)) {
        collectOmniCoreModels(models, provider, providerModels, firstKey)
      }
    }
  }

  return models.sort((left, right) => {
    const provider = left.provider.localeCompare(right.provider)
    return provider || left.name.localeCompare(right.name)
  })
}

function collectOmniCoreModels(
  target: OmniInferCatalogModel[],
  provider: string,
  models: Record<string, RawOmniCoreModel>,
  fallbackBackend = ''
): void {
  for (const [name, model] of Object.entries(models)) {
    const quantizations = parseOmniCoreQuantizations(model.quantization, fallbackBackend)
    if (!quantizations.length) continue
    const tags = Array.isArray(model.tag)
      ? model.tag.filter((tag): tag is string => typeof tag === 'string')
      : []
    const backend =
      quantizations.find((quantization) => quantization.backend)?.backend ?? fallbackBackend
    target.push({
      id: safeId(name),
      source: 'omnicore',
      runtime: normalizeRuntimeId(backend),
      backend,
      provider,
      name,
      tags,
      quantizations,
      contextLength: finiteNumber(model.context_length),
      vision: parseVisionSpec(model.vision),
    })
  }
}

function parseOmniCoreQuantizations(
  raw: RawOmniCoreModel['quantization'],
  fallbackBackend: string
): OmniInferCatalogQuantization[] {
  if (!raw) return []
  const options: OmniInferCatalogQuantization[] = []

  for (const [id, value] of Object.entries(raw)) {
    const urls = normalizeDownloadUrls(value?.download)
    const sizeGiB = finiteNumber(value?.size)
    if (!urls.length || sizeGiB === undefined) continue
    const files = urls.map((download, index) => ({
      download,
      sizeGiB: urls.length === 1 ? sizeGiB : undefined,
      filename: filenameFromUrl(download, index),
    }))
    options.push({
      id: safeId(id),
      label: id,
      download: urls[0],
      sizeGiB,
      filename: files[0]?.filename,
      files: files.length > 1 ? files : undefined,
      backend:
        typeof value.backend === 'string' && value.backend.trim()
          ? value.backend.trim()
          : fallbackBackend,
      requiredMemoryGiB: finiteNumber(value.required_memory_gib),
      suitable: typeof value.suitable === 'boolean' ? value.suitable : undefined,
    })
  }

  return options.sort((left, right) => left.sizeGiB - right.sizeGiB)
}

function parseVisionSpec(raw: RawOmniCoreModel['vision']): OmniInferCatalogVisionSpec | undefined {
  if (!raw || typeof raw.download !== 'string') return undefined
  const sizeGiB = finiteNumber(raw.size)
  if (sizeGiB === undefined) return undefined
  return {
    download: raw.download,
    sizeGiB,
    filename: mmprojFilename(raw.download),
  }
}

function parseHuggingFaceModel(raw: unknown, downloadBase: string): OmniInferCatalogModel | null {
  if (!isRecord(raw)) return null
  const record = raw as RawHuggingFaceModel
  const repoId = typeof record.modelId === 'string' ? record.modelId.trim() : ''
  if (!repoId) return null
  const siblings = Array.isArray(record.siblings)
    ? record.siblings.filter(isRecord).map((item) => item as RawHuggingFaceSibling)
    : []
  const quantizations = parseHuggingFaceQuantizations(repoId, siblings, downloadBase)
  if (!quantizations.length) return null
  const rawTags = Array.isArray(record.tags)
    ? record.tags.filter((tag): tag is string => typeof tag === 'string')
    : []
  const tags = inferHuggingFaceTags(rawTags)
  const mmproj = siblings.find((item) => {
    const filename = typeof item.rfilename === 'string' ? item.rfilename.toLowerCase() : ''
    return filename.endsWith('.gguf') && filename.includes('mmproj')
  })
  const mmprojPath = typeof mmproj?.rfilename === 'string' ? mmproj.rfilename : ''

  return {
    id: `hf-${safeId(repoId)}`,
    source: 'huggingface',
    runtime: 'llama.cpp',
    backend: 'llama.cpp-cpu',
    provider:
      typeof record.author === 'string' && record.author.trim()
        ? record.author.trim()
        : repoId.split('/')[0] || 'huggingface',
    name: repoId.split('/').pop() || repoId,
    tags,
    quantizations,
    repoId,
    downloads: finiteNumber(record.downloads),
    likes: finiteNumber(record.likes),
    lastModified: typeof record.lastModified === 'string' ? record.lastModified : undefined,
    vision: mmprojPath
      ? {
          download: huggingFaceDownloadUrl(downloadBase, repoId, mmprojPath),
          sizeGiB: bytesToGiB(finiteNumber(mmproj?.size) ?? 0),
          filename: mmprojFilename(mmprojPath),
        }
      : undefined,
  }
}

function parseHuggingFaceQuantizations(
  repoId: string,
  siblings: RawHuggingFaceSibling[],
  base: string
): OmniInferCatalogQuantization[] {
  const modelFiles = siblings
    .map((item) => ({
      path: typeof item.rfilename === 'string' ? item.rfilename : '',
      sizeBytes: finiteNumber(item.size) ?? 0,
    }))
    .filter(
      ({ path }) => path.toLowerCase().endsWith('.gguf') && !path.toLowerCase().includes('mmproj')
    )
  const grouped = new Map<string, Array<{ path: string; sizeBytes: number }>>()

  for (const file of modelFiles) {
    const split = file.path.match(/^(.*)-\d{5}-of-\d{5}\.gguf$/i)
    const key = split?.[1] ?? file.path.replace(/\.gguf$/i, '')
    const group = grouped.get(key) ?? []
    group.push(file)
    grouped.set(key, group)
  }

  return Array.from(grouped.entries())
    .map(([key, group]) => {
      const sorted = [...group].sort((left, right) => left.path.localeCompare(right.path))
      const files: OmniInferCatalogDownloadFile[] = sorted.map((file) => ({
        download: huggingFaceDownloadUrl(base, repoId, file.path),
        sizeGiB: bytesToGiB(file.sizeBytes),
        filename: filenameFromPath(file.path),
      }))
      const label = quantizationLabel(key)
      return {
        id: safeId(`${repoId}-${label}`),
        label,
        download: files[0].download,
        sizeGiB: files.reduce((sum, file) => sum + (file.sizeGiB ?? 0), 0),
        filename: files[0].filename,
        files: files.length > 1 ? files : undefined,
        backend: 'llama.cpp-cpu',
      }
    })
    .sort((left, right) => left.sizeGiB - right.sizeGiB)
}

function isModelMap(value: unknown): value is Record<string, RawOmniCoreModel> {
  if (!isRecord(value)) return false
  return Object.values(value).some(
    (item) => isRecord(item) && isRecord((item as RawOmniCoreModel).quantization)
  )
}

function extractCatalogPayload(raw: unknown): RawCatalog {
  if (!isRecord(raw)) return {}
  return isRecord(raw.data) ? raw.data : raw
}

function normalizeGatewayBaseUrl(raw: string): string {
  const value = raw.trim().replace(/\/+$/, '')
  return value.endsWith('/v1') ? value.slice(0, -3).replace(/\/+$/, '') : value
}

function normalizeLimit(limit?: number): number {
  if (!Number.isFinite(limit)) return 20
  return Math.max(1, Math.min(MAX_HUGGING_FACE_RESULTS, Math.trunc(limit ?? 20)))
}

async function fetchJson(fetchImpl: FetchLike, url: string): Promise<unknown> {
  const response = await fetchImpl(url, {
    method: 'GET',
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      'User-Agent': 'OmniPaw/1.0',
    },
  })
  if (!response.ok) {
    throw new Error(`Model catalog request failed with HTTP ${response.status}.`)
  }
  return response.json()
}

function normalizeDownloadUrls(value: unknown): string[] {
  if (typeof value === 'string' && value.trim()) return [value.trim()]
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim()))
}

function normalizeRuntimeId(value: string): string {
  const normalized = value.trim().toLowerCase()
  if (normalized.startsWith('llama.cpp')) return 'llama.cpp'
  if (normalized.startsWith('vllm')) return 'vllm'
  return normalized
}

function safeId(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'model'
  )
}

function filenameFromUrl(url: string, index: number): string {
  try {
    const parsed = new URL(url)
    const filePath = parsed.searchParams.get('FilePath')
    return filenameFromPath(filePath || parsed.pathname) || `model-${index + 1}.gguf`
  } catch {
    return `model-${index + 1}.gguf`
  }
}

function filenameFromPath(path: string): string {
  const value = path.split('/').pop() || path
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function mmprojFilename(path: string): string {
  const filename = filenameFromPath(path)
  return filename.toLowerCase().startsWith('mmproj') ? filename : `mmproj-${filename}`
}

function huggingFaceDownloadUrl(base: string, repoId: string, filename: string): string {
  const path = filename
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/')
  return `${base}/${repoId}/resolve/main/${path}`
}

function quantizationLabel(path: string): string {
  const name = filenameFromPath(path).replace(/\.gguf$/i, '')
  const parts = name.split(/[-. ]+/).filter(Boolean)
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const part = parts[index].toUpperCase()
    if (
      part.startsWith('Q') ||
      part.startsWith('IQ') ||
      part === 'BF16' ||
      part === 'F16' ||
      part === 'F32'
    ) {
      return parts.slice(index).join('-')
    }
  }
  return name
}

function inferHuggingFaceTags(tags: string[]): string[] {
  const normalized = tags.map((tag) => tag.toLowerCase())
  const result: string[] = []
  if (normalized.includes('vision') || normalized.includes('image-text-to-text')) {
    result.push('vision')
  }
  if (normalized.includes('text-generation') || normalized.includes('conversational')) {
    result.push('thinking')
  }
  return result
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function bytesToGiB(value: number): number {
  return value > 0 ? value / 1024 / 1024 / 1024 : 0
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
