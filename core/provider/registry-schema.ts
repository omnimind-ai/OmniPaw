import { redactSensitiveText } from '@core/logging/redaction'
import type {
  ProviderApi,
  ProviderModelRef,
  ProviderRegistry,
  ProviderRegistryErrorCode,
  ProviderRegistryModel,
  ProviderRegistryOperationError,
  ProviderRegistrySettings,
  ProviderRegistrySource,
  ProviderRegistryValidationIssue,
  ProviderRegistryVersion,
  ProviderType,
} from '@shared/types/provider'

export const PROVIDER_REGISTRY_FILE_NAME = 'providers.json'
export const CURRENT_PROVIDER_REGISTRY_VERSION: ProviderRegistryVersion = 1

export const defaultProviderRegistry: ProviderRegistry = {
  version: CURRENT_PROVIDER_REGISTRY_VERSION,
  sources: [],
  models: [],
  settings: {
    fallbackModelRefs: [],
    titleModelRef: undefined,
    embeddingModelRef: undefined,
    observationVisionModelRef: undefined,
    observationReactionModelRef: undefined,
    streaming: true,
  },
}

export interface NormalizeProviderRegistryResult {
  registry: ProviderRegistry
  changed: boolean
}

export class ProviderRegistryValidationError extends Error {
  readonly details: ProviderRegistryOperationError

  constructor(details: ProviderRegistryOperationError) {
    super(details.message)
    this.name = 'ProviderRegistryValidationError'
    this.details = details
  }
}

export function cloneDefaultProviderRegistry(): ProviderRegistry {
  return cloneProviderRegistry(defaultProviderRegistry)
}

export function cloneProviderRegistry(registry: ProviderRegistry): ProviderRegistry {
  return structuredClone(registry)
}

export function normalizeProviderRegistry(raw: unknown): NormalizeProviderRegistryResult {
  const migrated = migrateRegistry(raw)
  const issues: ProviderRegistryValidationIssue[] = []
  const registry = normalizeRegistryShape(migrated, issues)
  validateRegistryShape(registry, issues)

  if (issues.length) {
    throwValidationError('invalid_registry', 'Provider registry is invalid.', issues)
  }

  const normalized = sortRegistry(registry)
  return {
    registry: normalized,
    changed: stableComparable(normalized) !== stableComparable(raw),
  }
}

export function validateProviderRegistry(input: unknown): ProviderRegistry {
  const issues: ProviderRegistryValidationIssue[] = []
  if (!isPlainObject(input)) {
    throwValidationError('invalid_registry', 'Provider registry is invalid.', [
      { path: '', message: 'Registry must be an object.', code: 'invalid_type' },
    ])
  }

  const registry = input as unknown as ProviderRegistry
  validateRegistryShape(registry, issues)
  if (issues.length) {
    throwValidationError('invalid_registry', 'Provider registry is invalid.', issues)
  }
  return sortRegistry(registry)
}

export function serializeProviderRegistry(registry: ProviderRegistry): string {
  return `${JSON.stringify(validateProviderRegistry(registry), null, 2)}\n`
}

export function providerRegistryError(
  code: ProviderRegistryErrorCode,
  message: string,
  options: {
    path?: string
    recoverable?: boolean
    issues?: ProviderRegistryValidationIssue[]
  } = {}
): ProviderRegistryOperationError {
  return {
    code,
    message: redactSecretText(message),
    path: options.path,
    recoverable: options.recoverable ?? false,
    issues: options.issues?.map((issue) => ({
      ...issue,
      message: redactSecretText(issue.message),
    })),
  }
}

function migrateRegistry(raw: unknown): unknown {
  if (raw === undefined || raw === null) {
    return cloneDefaultProviderRegistry()
  }
  if (!isPlainObject(raw)) {
    throwValidationError('invalid_registry', 'Provider registry is invalid.', [
      { path: '', message: 'Registry must be an object.', code: 'invalid_type' },
    ])
  }

  const version = typeof raw.version === 'number' ? raw.version : CURRENT_PROVIDER_REGISTRY_VERSION
  if (version > CURRENT_PROVIDER_REGISTRY_VERSION) {
    throw new ProviderRegistryValidationError(
      providerRegistryError(
        'unsupported_version',
        `Provider registry version ${version} is newer than supported version ${CURRENT_PROVIDER_REGISTRY_VERSION}.`,
        {
          issues: [
            {
              path: 'version',
              message: `Unsupported future Provider registry version ${version}.`,
              code: 'unsupported_version',
            },
          ],
        }
      )
    )
  }

  if (version < CURRENT_PROVIDER_REGISTRY_VERSION) {
    return {
      ...raw,
      version: CURRENT_PROVIDER_REGISTRY_VERSION,
    }
  }

  return raw
}

function normalizeRegistryShape(
  raw: unknown,
  issues: ProviderRegistryValidationIssue[]
): ProviderRegistry {
  if (!isPlainObject(raw)) {
    issues.push({ path: '', message: 'Registry must be an object.', code: 'invalid_type' })
    return cloneDefaultProviderRegistry()
  }

  const sources = normalizeArray(raw.sources, 'sources', issues, normalizeSourceRecord)
  const models = normalizeArray(raw.models, 'models', issues, normalizeModelRecord)
  const settings = normalizeSettings(raw.settings, issues)

  return {
    version:
      typeof raw.version === 'number'
        ? (raw.version as ProviderRegistryVersion)
        : CURRENT_PROVIDER_REGISTRY_VERSION,
    sources,
    models,
    settings,
  }
}

function normalizeSourceRecord(
  raw: unknown,
  path: string,
  issues: ProviderRegistryValidationIssue[]
): ProviderRegistrySource {
  if (!isPlainObject(raw)) {
    issues.push({ path, message: 'Provider source must be an object.', code: 'invalid_type' })
    return defaultSourceRecord()
  }

  const now = Date.now()
  return {
    id: stringValue(raw.id),
    name: stringValue(raw.name),
    type: stringValue(raw.type) as ProviderType | undefined,
    api: stringValue(raw.api) as ProviderApi | undefined,
    baseUrl: stringValue(raw.baseUrl),
    enabled: typeof raw.enabled === 'boolean' ? raw.enabled : true,
    credentialRef: stringValue(raw.credentialRef) || undefined,
    authHeader: stringValue(raw.authHeader) || undefined,
    apiKey: stringValue(raw.apiKey) || undefined,
    envVar: stringValue(raw.envVar) || stringValue(raw.credentialEnvVar) || undefined,
    headers: normalizeStringRecord(raw.headers, `${path}.headers`, issues),
    extraBody: normalizeRecord(raw.extraBody, `${path}.extraBody`, issues),
    capabilities: normalizeRecord(raw.capabilities, `${path}.capabilities`, issues),
    compat: isPlainObject(raw.compat) ? structuredClone(raw.compat) : undefined,
    omniInferModelsDir: stringValue(raw.omniInferModelsDir) || undefined,
    omniInferInstallDir:
      stringValue(raw.omniInferInstallDir) || stringValue(raw.omniInferBinaryPath) || undefined,
    createdAt: finiteNumber(raw.createdAt) ?? now,
    updatedAt: finiteNumber(raw.updatedAt) ?? now,
  }
}

function normalizeModelRecord(
  raw: unknown,
  path: string,
  issues: ProviderRegistryValidationIssue[]
): ProviderRegistryModel {
  if (!isPlainObject(raw)) {
    issues.push({ path, message: 'Provider model must be an object.', code: 'invalid_type' })
    return defaultModelRecord()
  }

  const now = Date.now()
  return {
    id: stringValue(raw.id),
    providerId: stringValue(raw.providerId) || stringValue(raw.providerSourceId),
    name: stringValue(raw.name),
    remoteId: stringValue(raw.remoteId) || undefined,
    enabled: typeof raw.enabled === 'boolean' ? raw.enabled : true,
    manual: typeof raw.manual === 'boolean' ? raw.manual : undefined,
    input: normalizeInput(raw.input),
    supportsStreaming: typeof raw.supportsStreaming === 'boolean' ? raw.supportsStreaming : true,
    supportsTools: typeof raw.supportsTools === 'boolean' ? raw.supportsTools : false,
    supportsReasoning: typeof raw.supportsReasoning === 'boolean' ? raw.supportsReasoning : false,
    contextWindow: finiteNumber(raw.contextWindow),
    maxOutputTokens: finiteNumber(raw.maxOutputTokens),
    pricing: normalizeOptionalRecord(raw.pricing, `${path}.pricing`, issues),
    capabilities: normalizeRecord(raw.capabilities, `${path}.capabilities`, issues),
    compat: isPlainObject(raw.compat) ? structuredClone(raw.compat) : undefined,
    createdAt: finiteNumber(raw.createdAt) ?? now,
    updatedAt: finiteNumber(raw.updatedAt) ?? now,
  }
}

function normalizeSettings(
  raw: unknown,
  issues: ProviderRegistryValidationIssue[]
): ProviderRegistrySettings {
  if (raw === undefined || raw === null) {
    return cloneProviderRegistry(defaultProviderRegistry).settings
  }
  if (!isPlainObject(raw)) {
    issues.push({ path: 'settings', message: 'Settings must be an object.', code: 'invalid_type' })
    return cloneProviderRegistry(defaultProviderRegistry).settings
  }

  return {
    defaultProviderId: stringValue(raw.defaultProviderId) || undefined,
    defaultModelId: stringValue(raw.defaultModelId) || undefined,
    fallbackModelRefs: normalizeModelRefs(
      raw.fallbackModelRefs,
      'settings.fallbackModelRefs',
      issues
    ),
    titleModelRef: normalizeOptionalModelRef(raw.titleModelRef, 'settings.titleModelRef', issues),
    embeddingModelRef: normalizeOptionalModelRef(
      raw.embeddingModelRef,
      'settings.embeddingModelRef',
      issues
    ),
    observationVisionModelRef: normalizeOptionalModelRef(
      raw.observationVisionModelRef,
      'settings.observationVisionModelRef',
      issues
    ),
    observationReactionModelRef: normalizeOptionalModelRef(
      raw.observationReactionModelRef,
      'settings.observationReactionModelRef',
      issues
    ),
    streaming: typeof raw.streaming === 'boolean' ? raw.streaming : true,
  }
}

function validateRegistryShape(
  registry: ProviderRegistry,
  issues: ProviderRegistryValidationIssue[]
): void {
  if (registry.version !== CURRENT_PROVIDER_REGISTRY_VERSION) {
    issues.push({
      path: 'version',
      message: `Registry version must be ${CURRENT_PROVIDER_REGISTRY_VERSION}.`,
      code: 'invalid_version',
    })
  }
  if (!Array.isArray(registry.sources)) {
    issues.push({ path: 'sources', message: 'Sources must be an array.', code: 'invalid_type' })
    return
  }
  if (!Array.isArray(registry.models)) {
    issues.push({ path: 'models', message: 'Models must be an array.', code: 'invalid_type' })
    return
  }

  const sourceIds = new Set<string>()
  for (const [index, source] of registry.sources.entries()) {
    const path = `sources.${index}`
    validateSource(source, path, issues)
    if (sourceIds.has(source.id)) {
      issues.push({ path: `${path}.id`, message: 'Source ID must be unique.', code: 'duplicate' })
    }
    sourceIds.add(source.id)
  }

  const modelKeys = new Set<string>()
  const enabledModelKeys = new Set<string>()
  const modelInputs = new Map<string, ProviderRegistryModel['input']>()
  for (const [index, model] of registry.models.entries()) {
    const path = `models.${index}`
    validateModel(model, path, issues)
    if (!sourceIds.has(model.providerId)) {
      issues.push({
        path: `${path}.providerId`,
        message: 'Model must reference an existing provider source.',
        code: 'missing_reference',
      })
    }

    const key = modelKey(model.providerId, model.id)
    if (modelKeys.has(key)) {
      issues.push({
        path: `${path}.id`,
        message: 'Model ID must be unique within its provider source.',
        code: 'duplicate',
      })
    }
    modelKeys.add(key)
    modelInputs.set(key, model.input)
    if (model.enabled !== false) {
      enabledModelKeys.add(key)
    }
  }

  validateSettings(registry.settings, sourceIds, enabledModelKeys, modelInputs, issues)
}

function validateSource(
  source: ProviderRegistrySource,
  path: string,
  issues: ProviderRegistryValidationIssue[]
): void {
  if (!source.id) {
    issues.push({ path: `${path}.id`, message: 'Source ID is required.', code: 'required' })
  }
  if (!source.name) {
    issues.push({ path: `${path}.name`, message: 'Source name is required.', code: 'required' })
  }
  if (!source.baseUrl) {
    issues.push({
      path: `${path}.baseUrl`,
      message: 'Source base URL is required.',
      code: 'required',
    })
  }
  if (source.type && !isKnownProviderType(source.type)) {
    issues.push({ path: `${path}.type`, message: 'Source type is invalid.', code: 'invalid_enum' })
  }
  if (source.api && !isKnownProviderApi(source.api)) {
    issues.push({ path: `${path}.api`, message: 'Source API is invalid.', code: 'invalid_enum' })
  }
  if (typeof source.enabled !== 'boolean') {
    issues.push({
      path: `${path}.enabled`,
      message: 'Source enabled state must be boolean.',
      code: 'invalid_type',
    })
  }
}

function validateModel(
  model: ProviderRegistryModel,
  path: string,
  issues: ProviderRegistryValidationIssue[]
): void {
  if (!model.id) {
    issues.push({ path: `${path}.id`, message: 'Model ID is required.', code: 'required' })
  }
  if (!model.providerId) {
    issues.push({
      path: `${path}.providerId`,
      message: 'Provider source ID is required.',
      code: 'required',
    })
  }
  if (!model.name) {
    issues.push({ path: `${path}.name`, message: 'Model name is required.', code: 'required' })
  }
  if (typeof model.enabled !== 'boolean') {
    issues.push({
      path: `${path}.enabled`,
      message: 'Model enabled state must be boolean.',
      code: 'invalid_type',
    })
  }
  if (!Array.isArray(model.input)) {
    issues.push({
      path: `${path}.input`,
      message: 'Model input must be an array.',
      code: 'invalid_type',
    })
  }
}

function validateSettings(
  settings: ProviderRegistrySettings,
  sourceIds: Set<string>,
  enabledModelKeys: Set<string>,
  modelInputs: Map<string, ProviderRegistryModel['input']>,
  issues: ProviderRegistryValidationIssue[]
): void {
  if (Boolean(settings.defaultProviderId) !== Boolean(settings.defaultModelId)) {
    issues.push({
      path: 'settings.defaultModelId',
      message: 'Default model must include both provider ID and model ID.',
      code: 'missing_reference',
    })
  }
  if (
    settings.defaultProviderId &&
    settings.defaultModelId &&
    (!sourceIds.has(settings.defaultProviderId) ||
      !enabledModelKeys.has(modelKey(settings.defaultProviderId, settings.defaultModelId)))
  ) {
    issues.push({
      path: 'settings.defaultModelId',
      message: 'Default model must reference an enabled provider model.',
      code: 'missing_reference',
    })
  }
  if (!Array.isArray(settings.fallbackModelRefs)) {
    issues.push({
      path: 'settings.fallbackModelRefs',
      message: 'Fallback models must be an array.',
      code: 'invalid_type',
    })
    return
  }

  const fallbackKeys = new Set<string>()
  const defaultKey =
    settings.defaultProviderId && settings.defaultModelId
      ? modelKey(settings.defaultProviderId, settings.defaultModelId)
      : undefined
  for (const [index, ref] of settings.fallbackModelRefs.entries()) {
    const path = `settings.fallbackModelRefs.${index}`
    const key = modelKey(ref.providerId, ref.modelId)
    if (!sourceIds.has(ref.providerId) || !enabledModelKeys.has(key)) {
      issues.push({
        path,
        message: 'Fallback model must reference an enabled provider model.',
        code: 'missing_reference',
      })
    }
    if (fallbackKeys.has(key)) {
      issues.push({ path, message: 'Fallback model references must be unique.', code: 'duplicate' })
    }
    if (key === defaultKey) {
      issues.push({
        path,
        message: 'Fallback models cannot duplicate the default model.',
        code: 'duplicate',
      })
    }
    fallbackKeys.add(key)
  }
  if (settings.titleModelRef) {
    validateOptionalModelRef(
      settings.titleModelRef,
      'settings.titleModelRef',
      'Title summary model must reference an enabled provider model.',
      sourceIds,
      enabledModelKeys,
      issues
    )
  }
  if (settings.embeddingModelRef) {
    validateOptionalModelRef(
      settings.embeddingModelRef,
      'settings.embeddingModelRef',
      'Embedding model must reference an enabled provider model.',
      sourceIds,
      enabledModelKeys,
      issues
    )
    validateModelRefInput(
      settings.embeddingModelRef,
      'settings.embeddingModelRef',
      'text',
      modelInputs,
      issues
    )
  }
  if (settings.observationVisionModelRef) {
    validateOptionalModelRef(
      settings.observationVisionModelRef,
      'settings.observationVisionModelRef',
      'Observation vision model must reference an enabled provider model.',
      sourceIds,
      enabledModelKeys,
      issues
    )
    validateModelRefInput(
      settings.observationVisionModelRef,
      'settings.observationVisionModelRef',
      'image',
      modelInputs,
      issues
    )
  }
  if (settings.observationReactionModelRef) {
    validateOptionalModelRef(
      settings.observationReactionModelRef,
      'settings.observationReactionModelRef',
      'Observation reaction model must reference an enabled provider model.',
      sourceIds,
      enabledModelKeys,
      issues
    )
    validateModelRefInput(
      settings.observationReactionModelRef,
      'settings.observationReactionModelRef',
      'text',
      modelInputs,
      issues
    )
  }
  if (typeof settings.streaming !== 'boolean') {
    issues.push({
      path: 'settings.streaming',
      message: 'Streaming setting must be boolean.',
      code: 'invalid_type',
    })
  }
}

function validateModelRefInput(
  ref: ProviderModelRef,
  path: string,
  requiredInput: 'text' | 'image',
  modelInputs: Map<string, ProviderRegistryModel['input']>,
  issues: ProviderRegistryValidationIssue[]
): void {
  const input = modelInputs.get(modelKey(ref.providerId, ref.modelId)) ?? ['text']
  if (!input.includes(requiredInput)) {
    issues.push({
      path,
      message: `Model must support ${requiredInput} input.`,
      code: 'invalid_capability',
    })
  }
}

function validateOptionalModelRef(
  ref: ProviderModelRef,
  path: string,
  message: string,
  sourceIds: Set<string>,
  enabledModelKeys: Set<string>,
  issues: ProviderRegistryValidationIssue[]
): void {
  const key = modelKey(ref.providerId, ref.modelId)
  if (!sourceIds.has(ref.providerId) || !enabledModelKeys.has(key)) {
    issues.push({
      path,
      message,
      code: 'missing_reference',
    })
  }
}

function normalizeArray<T>(
  raw: unknown,
  path: string,
  issues: ProviderRegistryValidationIssue[],
  normalizer: (item: unknown, path: string, issues: ProviderRegistryValidationIssue[]) => T
): T[] {
  if (raw === undefined || raw === null) {
    return []
  }
  if (!Array.isArray(raw)) {
    issues.push({ path, message: 'Value must be an array.', code: 'invalid_type' })
    return []
  }
  return raw.map((item, index) => normalizer(item, `${path}.${index}`, issues))
}

function normalizeModelRefs(
  raw: unknown,
  path: string,
  issues: ProviderRegistryValidationIssue[]
): ProviderModelRef[] {
  if (raw === undefined || raw === null) {
    return []
  }
  if (!Array.isArray(raw)) {
    issues.push({ path, message: 'Value must be an array.', code: 'invalid_type' })
    return []
  }
  const refs: ProviderModelRef[] = []
  for (const [index, item] of raw.entries()) {
    if (!isPlainObject(item)) {
      issues.push({
        path: `${path}.${index}`,
        message: 'Model reference must be an object.',
        code: 'invalid_type',
      })
      continue
    }
    refs.push({
      providerId: stringValue(item.providerId),
      modelId: stringValue(item.modelId),
    })
  }
  return refs
}

function normalizeOptionalModelRef(
  raw: unknown,
  path: string,
  issues: ProviderRegistryValidationIssue[]
): ProviderModelRef | undefined {
  if (raw === undefined || raw === null) {
    return undefined
  }
  const refs = normalizeModelRefs([raw], path, issues)
  return refs[0]
}

function sortRegistry(registry: ProviderRegistry): ProviderRegistry {
  return {
    ...registry,
    sources: registry.sources.map(cloneSource),
    models: registry.models.map(cloneModel),
    settings: {
      ...registry.settings,
      fallbackModelRefs: registry.settings.fallbackModelRefs.map((ref) => ({ ...ref })),
      titleModelRef: registry.settings.titleModelRef
        ? { ...registry.settings.titleModelRef }
        : undefined,
      observationVisionModelRef: registry.settings.observationVisionModelRef
        ? { ...registry.settings.observationVisionModelRef }
        : undefined,
      observationReactionModelRef: registry.settings.observationReactionModelRef
        ? { ...registry.settings.observationReactionModelRef }
        : undefined,
    },
  }
}

function defaultSourceRecord(): ProviderRegistrySource {
  const now = Date.now()
  return {
    id: '',
    name: '',
    type: 'openai-compatible',
    api: 'openai-chat-completions',
    baseUrl: '',
    enabled: true,
    headers: {},
    extraBody: {},
    capabilities: {},
    createdAt: now,
    updatedAt: now,
  }
}

function defaultModelRecord(): ProviderRegistryModel {
  const now = Date.now()
  return {
    id: '',
    providerId: '',
    name: '',
    enabled: true,
    input: ['text'],
    supportsStreaming: true,
    supportsTools: false,
    supportsReasoning: false,
    capabilities: {},
    createdAt: now,
    updatedAt: now,
  }
}

function cloneSource(source: ProviderRegistrySource): ProviderRegistrySource {
  return {
    ...source,
    headers: source.headers ? { ...source.headers } : undefined,
    extraBody: source.extraBody ? { ...source.extraBody } : undefined,
    capabilities: source.capabilities ? { ...source.capabilities } : undefined,
    compat: source.compat ? { ...source.compat } : undefined,
  }
}

function cloneModel(model: ProviderRegistryModel): ProviderRegistryModel {
  return {
    ...model,
    input: model.input ? [...model.input] : undefined,
    capabilities: model.capabilities ? { ...model.capabilities } : undefined,
    compat: model.compat ? { ...model.compat } : undefined,
    pricing: model.pricing ? { ...model.pricing } : undefined,
  }
}

function normalizeRecord(
  value: unknown,
  path: string,
  issues: ProviderRegistryValidationIssue[]
): Record<string, unknown> {
  if (value === undefined || value === null) {
    return {}
  }
  if (!isPlainObject(value)) {
    issues.push({ path, message: 'Value must be an object.', code: 'invalid_type' })
    return {}
  }
  return structuredClone(value)
}

function normalizeOptionalRecord(
  value: unknown,
  path: string,
  issues: ProviderRegistryValidationIssue[]
): Record<string, unknown> | undefined {
  if (value === undefined || value === null) {
    return undefined
  }
  return normalizeRecord(value, path, issues)
}

function normalizeStringRecord(
  value: unknown,
  path: string,
  issues: ProviderRegistryValidationIssue[]
): Record<string, string> {
  if (value === undefined || value === null) {
    return {}
  }
  if (!isPlainObject(value)) {
    issues.push({ path, message: 'Value must be an object.', code: 'invalid_type' })
    return {}
  }
  const result: Record<string, string> = {}
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === 'string') {
      result[key] = item
    } else {
      issues.push({
        path: `${path}.${key}`,
        message: 'Header values must be strings.',
        code: 'invalid_type',
      })
    }
  }
  return result
}

function normalizeInput(value: unknown): ProviderRegistryModel['input'] {
  return Array.isArray(value) &&
    value.every(
      (item) => item === 'text' || item === 'image' || item === 'audio' || item === 'file'
    )
    ? value
    : ['text']
}

function modelKey(providerId: string, modelId: string): string {
  return `${providerId}\u0000${modelId}`
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isKnownProviderType(value: string): value is ProviderType {
  return (
    value === 'openai-compatible' ||
    value === 'openai-codex' ||
    value === 'ollama' ||
    value === 'omniinfer'
  )
}

function isKnownProviderApi(value: string): value is ProviderApi {
  return (
    value === 'openai-chat-completions' ||
    value === 'openai-responses' ||
    value === 'openai-codex-responses' ||
    value === 'ollama' ||
    value === 'omniinfer'
  )
}

function redactSecretText(text: string): string {
  return redactSensitiveText(text)
}

function stableComparable(value: unknown): string {
  return JSON.stringify(value)
}

function throwValidationError(
  code: ProviderRegistryErrorCode,
  message: string,
  issues: ProviderRegistryValidationIssue[]
): never {
  throw new ProviderRegistryValidationError(
    providerRegistryError(code, message, { issues, recoverable: false })
  )
}
