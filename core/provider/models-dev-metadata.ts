import type { ProviderModelCandidate } from './base-provider'

export const MODELS_DEV_METADATA_URL = 'https://models.dev/api.json'
export const OPENAI_COMPATIBLE_FALLBACK_CONTEXT_WINDOW = 128000

const MODELS_DEV_CACHE_TTL_MS = 24 * 60 * 60 * 1000

type ProviderModelInput = NonNullable<ProviderModelCandidate['input']>[number]

export interface ProviderModelMetadata {
  input?: ProviderModelCandidate['input']
  supportsTools?: boolean
  supportsReasoning?: boolean
  contextWindow?: number
  maxOutputTokens?: number
}

type ModelsDevMetadataCacheEntry = {
  expiresAt: number
  promise: Promise<Map<string, ProviderModelMetadata>>
}

const modelsDevMetadataCache = new WeakMap<typeof fetch, ModelsDevMetadataCacheEntry>()

export async function loadModelsDevMetadata(
  options: { fetchImpl?: typeof fetch; signal?: AbortSignal; forceRefresh?: boolean } = {}
): Promise<Map<string, ProviderModelMetadata>> {
  const fetchImpl = options.fetchImpl ?? fetch
  const now = Date.now()
  const existing = modelsDevMetadataCache.get(fetchImpl)

  if (!options.forceRefresh && existing && existing.expiresAt > now) {
    return existing.promise
  }

  const promise = fetchImpl(MODELS_DEV_METADATA_URL, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal: options.signal,
  }).then(async (response) => {
    if (!response.ok) {
      throw new Error(`models.dev metadata request failed with HTTP ${response.status}`)
    }
    return parseModelsDevMetadata(await response.json())
  })

  modelsDevMetadataCache.set(fetchImpl, {
    expiresAt: now + MODELS_DEV_CACHE_TTL_MS,
    promise,
  })

  try {
    return await promise
  } catch (error) {
    modelsDevMetadataCache.delete(fetchImpl)
    throw error
  }
}

export function lookupModelMetadata(
  metadata: Map<string, ProviderModelMetadata>,
  modelId: string
): ProviderModelMetadata | undefined {
  for (const key of modelLookupKeys(modelId)) {
    const match = metadata.get(key)
    if (match) {
      return match
    }
  }
  return undefined
}

export function parseProviderModelMetadata(raw: Record<string, unknown>): ProviderModelMetadata {
  const limit = isRecord(raw.limit) ? raw.limit : undefined
  const architecture = isRecord(raw.architecture) ? raw.architecture : undefined

  return stripEmptyMetadata({
    input: parseInputModalities(
      raw.input ?? raw.input_modalities ?? architecture?.input_modalities ?? raw.modalities
    ),
    supportsTools:
      booleanValue(raw.supportsTools) ??
      booleanValue(raw.supports_tools) ??
      booleanValue(raw.tool_call) ??
      supportsParameter(raw.supported_parameters, 'tools'),
    supportsReasoning:
      booleanValue(raw.supportsReasoning) ??
      booleanValue(raw.supports_reasoning) ??
      booleanValue(raw.reasoning),
    contextWindow:
      positiveInteger(raw.contextWindow) ??
      positiveInteger(raw.context_window) ??
      positiveInteger(raw.contextLength) ??
      positiveInteger(raw.context_length) ??
      positiveInteger(raw.maxContextTokens) ??
      positiveInteger(raw.max_context_tokens) ??
      positiveInteger(raw.max_context_length) ??
      positiveInteger(raw.max_model_len) ??
      positiveInteger(limit?.context),
    maxOutputTokens:
      positiveInteger(raw.maxOutputTokens) ??
      positiveInteger(raw.max_output_tokens) ??
      positiveInteger(raw.maxCompletionTokens) ??
      positiveInteger(raw.max_completion_tokens) ??
      positiveInteger(limit?.output),
  })
}

function parseModelsDevMetadata(payload: unknown): Map<string, ProviderModelMetadata> {
  const metadata = new Map<string, ProviderModelMetadata>()
  if (!isRecord(payload)) {
    return metadata
  }

  for (const provider of Object.values(payload)) {
    if (!isRecord(provider) || !isRecord(provider.models)) {
      continue
    }

    for (const [modelKey, model] of Object.entries(provider.models)) {
      if (!isRecord(model)) {
        continue
      }
      const id = stringValue(model.id) || modelKey
      const parsed = parseProviderModelMetadata(model)
      if (!id || !hasMetadata(parsed)) {
        continue
      }
      upsertMetadata(metadata, id, parsed)
    }
  }

  return metadata
}

function upsertMetadata(
  metadata: Map<string, ProviderModelMetadata>,
  modelId: string,
  next: ProviderModelMetadata
): void {
  for (const key of modelLookupKeys(modelId)) {
    const current = metadata.get(key)
    metadata.set(key, current ? mergeMetadata(current, next) : next)
  }
}

function mergeMetadata(
  current: ProviderModelMetadata,
  next: ProviderModelMetadata
): ProviderModelMetadata {
  return stripEmptyMetadata({
    input: mergeInput(current.input, next.input),
    supportsTools: mergeBooleanCapability(current.supportsTools, next.supportsTools),
    supportsReasoning: mergeBooleanCapability(current.supportsReasoning, next.supportsReasoning),
    contextWindow: minPositive(current.contextWindow, next.contextWindow),
    maxOutputTokens: minPositive(current.maxOutputTokens, next.maxOutputTokens),
  })
}

function modelLookupKeys(modelId: string): string[] {
  const normalized = normalizeModelId(modelId)
  if (!normalized) {
    return []
  }

  const keys = new Set<string>([normalized])
  const withoutModelsPrefix = normalized.replace(/^models\//, '')
  keys.add(withoutModelsPrefix)

  const slashSegments = withoutModelsPrefix.split('/').filter(Boolean)
  const lastSlashSegment = slashSegments.at(-1)
  if (lastSlashSegment) {
    keys.add(lastSlashSegment)
  }

  return Array.from(keys)
}

function normalizeModelId(value: string): string {
  return value.trim().toLowerCase()
}

function parseInputModalities(value: unknown): ProviderModelCandidate['input'] | undefined {
  const rawInput = isRecord(value) && Array.isArray(value.input) ? value.input : value
  if (!Array.isArray(rawInput)) {
    return undefined
  }

  const normalized = new Set<ProviderModelInput>()
  for (const item of rawInput) {
    const modality = inputModality(item)
    if (modality) {
      normalized.add(modality)
    }
  }

  return normalized.size ? Array.from(normalized) : undefined
}

function inputModality(value: unknown): ProviderModelInput | undefined {
  if (typeof value !== 'string') {
    return undefined
  }
  const normalized = value.trim().toLowerCase()
  if (normalized === 'text') {
    return 'text'
  }
  if (normalized === 'image' || normalized === 'images' || normalized === 'vision') {
    return 'image'
  }
  if (normalized === 'audio') {
    return 'audio'
  }
  if (normalized === 'file' || normalized === 'files' || normalized === 'attachment') {
    return 'file'
  }
  return undefined
}

function supportsParameter(value: unknown, parameter: string): boolean | undefined {
  if (!Array.isArray(value)) {
    return undefined
  }
  return value.some((item) => typeof item === 'string' && item.trim() === parameter)
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

function positiveInteger(value: unknown): number | undefined {
  const number =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim()
        ? Number(value)
        : undefined

  if (typeof number !== 'number' || !Number.isFinite(number) || number <= 0) {
    return undefined
  }
  return Math.floor(number)
}

function minPositive(left: number | undefined, right: number | undefined): number | undefined {
  if (left === undefined) {
    return right
  }
  if (right === undefined) {
    return left
  }
  return Math.min(left, right)
}

function mergeBooleanCapability(
  left: boolean | undefined,
  right: boolean | undefined
): boolean | undefined {
  if (left === true || right === true) {
    return true
  }
  if (left === false || right === false) {
    return false
  }
  return undefined
}

function mergeInput(
  left: ProviderModelCandidate['input'],
  right: ProviderModelCandidate['input']
): ProviderModelCandidate['input'] | undefined {
  if (!left?.length) {
    return right
  }
  if (!right?.length) {
    return left
  }
  return Array.from(new Set([...left, ...right]))
}

function stripEmptyMetadata(metadata: ProviderModelMetadata): ProviderModelMetadata {
  return {
    ...(metadata.input?.length ? { input: metadata.input } : {}),
    ...(metadata.supportsTools !== undefined ? { supportsTools: metadata.supportsTools } : {}),
    ...(metadata.supportsReasoning !== undefined
      ? { supportsReasoning: metadata.supportsReasoning }
      : {}),
    ...(metadata.contextWindow !== undefined ? { contextWindow: metadata.contextWindow } : {}),
    ...(metadata.maxOutputTokens !== undefined
      ? { maxOutputTokens: metadata.maxOutputTokens }
      : {}),
  }
}

function hasMetadata(metadata: ProviderModelMetadata): boolean {
  return (
    Boolean(metadata.input?.length) ||
    metadata.supportsTools !== undefined ||
    metadata.supportsReasoning !== undefined ||
    metadata.contextWindow !== undefined ||
    metadata.maxOutputTokens !== undefined
  )
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
