import type { DesktopSettingsConfig } from '@shared/types/settings'
import type { ConfigStore } from '@core/config/store'
import type {
  ProviderConfig,
  ModelConfig,
  ProviderPreset,
  ProviderType,
  SaveProviderRequest,
} from '@shared/types/provider'
import type { BaseProvider, ProviderModelCandidate } from './base-provider'
import { normalizeProviderError } from './errors'
import type { ProviderCredentialRecord } from './credentials'
import { resolveCredential } from './credentials'
import { OpenAICompatibleProvider } from './providers/openai'

export type ProviderApi = 'openai-chat-completions' | 'openai-responses' | 'ollama' | 'omniinfer'

export interface ProviderCapabilities {
  listModels?: boolean
  streaming?: boolean
  tools?: boolean
  vision?: boolean
}

export interface ProviderCompat {
  maxTokensField?: 'max_tokens' | 'max_completion_tokens'
  supportsSystemRole?: boolean
  supportsDeveloperRole?: boolean
  supportsJsonMode?: boolean
  reasoningFormat?: 'none' | 'openai' | 'deepseek' | 'qwen'
}

export interface ProviderModelRecord {
  id: string
  providerId: string
  name: string
  remoteId?: string
  enabled: boolean
  manual?: boolean
  input?: Array<'text' | 'image' | 'audio' | 'file'>
  supportsStreaming?: boolean
  supportsTools?: boolean
  supportsReasoning?: boolean
  contextWindow?: number
  maxOutputTokens?: number
  compat?: ProviderCompat
  createdAt?: number
  updatedAt?: number
}

export interface ProviderRecord {
  id: string
  name: string
  type?: ProviderType
  api?: ProviderApi
  baseUrl: string
  enabled: boolean
  credentialRef?: string
  authHeader?: string
  envVar?: string
  apiKey?: string
  headers?: Record<string, string>
  extraBody?: Record<string, unknown>
  defaultModelId?: string
  capabilities?: ProviderCapabilities
  compat?: ProviderCompat
  models?: ProviderModelRecord[]
  createdAt?: number
  updatedAt?: number
}

export interface SessionProviderOverrideRepository {
  getProviderOverride(
    sessionId: string
  ): Promise<{ providerId?: string; modelId?: string } | undefined>
}

export interface ProviderManagerOptions {
  sessions?: SessionProviderOverrideRepository
  configStore: ConfigStore
  onConfigSaved?: (config: DesktopSettingsConfig) => void
}

export interface ProviderTestResult {
  ok: boolean
  error?: ReturnType<typeof normalizeProviderError>
}

const providerPresets: ProviderPreset[] = [
  {
    id: 'openai-compatible',
    name: 'OpenAI Compatible',
    type: 'openai-compatible',
    api: 'openai-chat-completions',
    baseUrl: 'https://api.openai.com/v1',
    enabled: true,
    credentialRef: 'openai-compatible:default',
    authHeader: 'Authorization',
    description: 'OpenAI API and compatible services.',
    capabilities: {
      listModels: true,
      streaming: true,
      tools: true,
      vision: true,
    },
    compat: {
      maxTokensField: 'max_tokens',
      supportsSystemRole: true,
      supportsJsonMode: true,
      reasoningFormat: 'none',
    },
    models: [],
  },
  {
    id: 'ollama',
    name: 'Ollama',
    type: 'ollama',
    api: 'ollama',
    baseUrl: 'http://localhost:11434/v1',
    enabled: true,
    description: 'Local Ollama OpenAI-compatible endpoint.',
    capabilities: {
      listModels: true,
      streaming: true,
      tools: false,
      vision: false,
    },
    compat: {
      maxTokensField: 'max_tokens',
      supportsSystemRole: true,
      supportsJsonMode: false,
      reasoningFormat: 'none',
    },
    models: [],
  },
  {
    id: 'omniinfer-local',
    name: 'OmniInfer Local',
    type: 'omniinfer',
    api: 'omniinfer',
    baseUrl: 'http://localhost:11434/v1',
    enabled: true,
    description: 'Local OmniInfer-compatible model service.',
    defaultModelId: 'local-small-model',
    capabilities: {
      listModels: false,
      streaming: true,
      tools: false,
      vision: false,
    },
    models: [
      {
        id: 'local-small-model',
        name: 'Local Small Model',
        remoteId: 'local-small-model',
        enabled: true,
        input: ['text'],
        supportsStreaming: true,
        supportsTools: false,
        supportsReasoning: false,
        contextWindow: 8192,
      },
    ],
  },
]

export class ProviderManager {
  private readonly sessions?: SessionProviderOverrideRepository
  private readonly configStore: ConfigStore
  private readonly onConfigSaved?: (config: DesktopSettingsConfig) => void

  constructor(options: ProviderManagerOptions) {
    this.sessions = options.sessions
    this.configStore = options.configStore
    this.onConfigSaved = options.onConfigSaved
  }

  async list(): Promise<ProviderConfig[]> {
    const providers = await this.listRecords()
    const modelsByProvider = await this.modelsForProviders(providers)

    return providers.map((provider) =>
      sanitizeProvider(provider, modelsByProvider.get(provider.id) ?? provider.models ?? [])
    )
  }

  async listPresets(): Promise<ProviderPreset[]> {
    return providerPresets.map(cloneProviderPreset)
  }

  async createFromPreset(presetId: string): Promise<ProviderConfig> {
    const preset = providerPresets.find((item) => item.id === presetId)
    if (!preset) {
      throw new Error(`Provider preset not found: ${presetId}`)
    }

    const now = Date.now()
    const existingProviders = await this.listRecords()
    const existingModelIds = new Set(
      existingProviders.flatMap((provider) => provider.models?.map((model) => model.id) ?? [])
    )
    const providerId = uniqueProviderId(preset.id, existingProviders)
    const providerName =
      providerId === preset.id
        ? preset.name
        : `${preset.name}_${providerIdSuffix(providerId, preset.id)}`
    const modelIds = new Map<string, string>()
    const models =
      preset.models?.map((model) => {
        const modelId = uniqueModelId(model.id, providerId, existingModelIds)
        modelIds.set(model.id, modelId)
        existingModelIds.add(modelId)

        return {
          ...model,
          id: modelId,
          providerId,
          enabled: model.enabled !== false,
        }
      }) ?? []

    await this.save({
      id: providerId,
      name: providerName,
      type: preset.type,
      api: preset.api,
      baseUrl: preset.baseUrl,
      enabled: preset.enabled !== false,
      credentialRef: preset.credentialRef ? `${providerId}:default` : undefined,
      authHeader: preset.authHeader,
      headers: preset.headers ? { ...preset.headers } : {},
      extraBody: preset.extraBody ? { ...preset.extraBody } : {},
      defaultModelId: preset.defaultModelId ? modelIds.get(preset.defaultModelId) : undefined,
      capabilities: preset.capabilities ? { ...preset.capabilities } : {},
      compat: preset.compat ? { ...preset.compat } : undefined,
      models,
      updatedAt: now,
    })

    const saved = await this.get(providerId)
    if (!saved) {
      throw new Error(`Provider preset was not saved: ${presetId}`)
    }

    return saved
  }

  async get(providerId: string): Promise<ProviderConfig | undefined> {
    const provider = await this.getRecord(providerId)
    if (!provider) {
      return undefined
    }

    return sanitizeProvider(provider, await this.listModels(provider.id))
  }

  async save(provider: ProviderRecord): Promise<void> {
    const config = this.configStore.get()
    upsertProviderInConfig(config, provider)
    this.saveConfig(config)
  }

  async listModels(providerId: string): Promise<ProviderModelRecord[]> {
    return cloneProvider(await this.getRecord(providerId))?.models ?? []
  }

  async resolveDefaultProvider(
    sessionId?: string
  ): Promise<{ provider: ProviderRecord; modelId: string }> {
    const override = sessionId ? await this.sessions?.getProviderOverride(sessionId) : undefined
    const records = await this.listRecords()
    const globalDefaultModelId =
      !override?.providerId && !override?.modelId
        ? this.configStore.get().providers.settings.defaultModelId
        : undefined
    const providerFromGlobalDefault = globalDefaultModelId
      ? records.find(
          (item) =>
            item.enabled &&
            (item.models ?? []).some(
              (model) => model.id === globalDefaultModelId && model.enabled !== false
            )
        )
      : undefined
    const provider =
      (await this.getRecord(override?.providerId ?? '')) ??
      providerFromGlobalDefault ??
      records.find((item) => item.enabled)

    if (!provider) {
      throw new Error('No enabled provider is configured.')
    }

    const modelId =
      override?.modelId ??
      (globalDefaultModelId &&
      (provider.models ?? []).some(
        (model) => model.id === globalDefaultModelId && model.enabled !== false
      )
        ? globalDefaultModelId
        : undefined) ??
      provider.defaultModelId ??
      (await this.listModels(provider.id)).find((model) => model.enabled)?.id
    if (!modelId) {
      throw new Error(`No default model is configured for provider ${provider.id}.`)
    }

    return { provider, modelId }
  }

  async test(
    providerId: string,
    modelId?: string,
    signal?: AbortSignal
  ): Promise<ProviderTestResult> {
    try {
      const provider = await this.createProviderClient(providerId)
      const resolvedModelId = modelId ?? (await this.defaultModelId(providerId))
      await provider.test?.(resolvedModelId, signal)
      return { ok: true }
    } catch (error) {
      return {
        ok: false,
        error: normalizeProviderError(error),
      }
    }
  }

  async refreshModels(providerId: string, signal?: AbortSignal): Promise<ProviderModelRecord[]> {
    const record = await this.requireRecord(providerId)
    if (
      !record.capabilities?.listModels &&
      record.api !== 'openai-chat-completions' &&
      record.type !== 'openai-compatible'
    ) {
      return this.listModels(providerId)
    }

    const client = await this.createProviderClient(providerId)
    const remoteModels = (await client.listModels?.(signal)) ?? []
    const merged = mergeModels(providerId, await this.listModels(providerId), remoteModels)
    this.replaceProviderModels(providerId, merged)

    return merged
  }

  async upsert(request: SaveProviderRequest): Promise<ProviderConfig | undefined> {
    const now = Date.now()
    const credential = request.credential
    const credentialRef =
      credential && (credential.value || credential.envVar)
        ? (request.provider.credentialRef ?? `${request.provider.id}:default`)
        : request.provider.credentialRef

    await this.save({
      ...request.provider,
      models:
        request.provider.models?.map((model) => ({
          ...model,
          providerId: model.providerId ?? request.provider.id,
          enabled: model.enabled !== false,
        })) ?? [],
      credentialRef,
      apiKey: credential?.value,
      envVar: credential?.envVar,
      enabled: request.provider.enabled !== false,
      createdAt: request.provider.createdAt ?? now,
      updatedAt: now,
    })

    return this.get(request.provider.id)
  }

  async delete(providerId: string): Promise<void> {
    const config = this.configStore.get()
    config.providers.sources = config.providers.sources.filter((source) => source.id !== providerId)
    config.providers.models = config.providers.models.filter(
      (model) => model.providerSourceId !== providerId
    )
    if (
      !config.providers.models.some(
        (model) => model.id === config.providers.settings.defaultModelId && model.enabled !== false
      )
    ) {
      config.providers.settings.defaultModelId =
        config.providers.models.find((model) => model.enabled !== false)?.id ?? ''
    }
    config.providers.settings.fallbackModelIds = config.providers.settings.fallbackModelIds.filter(
      (modelId) =>
        config.providers.models.some((model) => model.id === modelId && model.enabled !== false)
    )
    this.saveConfig(config)
  }

  async createProviderClient(providerId: string): Promise<BaseProvider> {
    const provider = await this.requireRecord(providerId)
    const credential = resolveCredential({
      providerId: provider.id,
      credentialRef: provider.credentialRef,
      credentials: providerToCredentials(provider),
      envVar: provider.envVar,
      apiKey: provider.apiKey,
    })

    if (provider.api === 'openai-chat-completions' || provider.type === 'openai-compatible') {
      return new OpenAICompatibleProvider({
        id: provider.id,
        baseUrl: provider.baseUrl,
        apiKey: credential?.value,
        authHeader: provider.authHeader,
        headers: provider.headers,
        extraBody: provider.extraBody,
        maxTokensField: provider.compat?.maxTokensField,
      })
    }

    throw new Error(
      `Provider transport is not implemented for ${provider.api ?? provider.type ?? provider.id}.`
    )
  }

  private async listRecords(): Promise<ProviderRecord[]> {
    return configToProviderRecords(this.configStore.get())
  }

  private async getRecord(providerId: string): Promise<ProviderRecord | undefined> {
    if (!providerId) {
      return undefined
    }

    return configToProviderRecords(this.configStore.get()).find(
      (provider) => provider.id === providerId
    )
  }

  private async requireRecord(providerId: string): Promise<ProviderRecord> {
    const provider = await this.getRecord(providerId)
    if (!provider) {
      throw new Error(`Provider not found: ${providerId}`)
    }

    return provider
  }

  private async defaultModelId(providerId: string): Promise<string | undefined> {
    const provider = await this.requireRecord(providerId)
    return (
      provider.defaultModelId ??
      (await this.listModels(providerId)).find((model) => model.enabled)?.id
    )
  }

  private replaceProviderModels(providerId: string, models: ProviderModelRecord[]): void {
    const config = this.configStore.get()
    config.providers.models = config.providers.models.filter(
      (model) => model.providerSourceId !== providerId
    )
    for (const model of models) {
      upsertModelInConfig(config, model)
    }
    pruneProviderModelReferences(config, providerId)
    this.saveConfig(config)
  }

  private async modelsForProviders(
    providers: ProviderRecord[]
  ): Promise<Map<string, ProviderModelRecord[]>> {
    const result = new Map<string, ProviderModelRecord[]>()
    await Promise.all(
      providers.map(async (provider) => {
        result.set(provider.id, await this.listModels(provider.id))
      })
    )
    return result
  }

  private saveConfig(config: DesktopSettingsConfig): DesktopSettingsConfig {
    const saved = this.configStore.save(config)
    this.onConfigSaved?.(saved)
    return saved
  }
}

export function configToProviderRecords(config: DesktopSettingsConfig): ProviderRecord[] {
  return config.providers.sources.map((source) => ({
    id: source.id,
    name: source.name,
    type: source.type,
    api: source.api,
    baseUrl: source.baseUrl,
    enabled: source.enabled,
    credentialRef: source.credentialRef,
    authHeader: source.authHeader,
    envVar: source.credentialEnvVar,
    apiKey: source.apiKey,
    headers: source.headers,
    extraBody: source.extraBody,
    defaultModelId: source.defaultModelId,
    capabilities: source.capabilities,
    compat: source.compat,
    models: config.providers.models
      .filter((model) => model.providerSourceId === source.id)
      .map((model) => ({
        id: model.id,
        providerId: source.id,
        name: model.name,
        remoteId: model.remoteId ?? model.id,
        enabled: model.enabled !== false,
        input: model.input,
        supportsStreaming: model.supportsStreaming,
        supportsTools: model.supportsTools,
        supportsReasoning: model.supportsReasoning,
        contextWindow: model.contextWindow,
        maxOutputTokens: model.maxOutputTokens,
        compat: model.compat,
        createdAt: model.createdAt,
        updatedAt: model.updatedAt,
      })),
    createdAt: source.createdAt,
    updatedAt: source.updatedAt,
  }))
}

function providerToCredentials(provider: ProviderRecord): ProviderCredentialRecord[] {
  if (!provider.apiKey && !provider.envVar) {
    return []
  }

  return [
    {
      id: provider.credentialRef ?? `${provider.id}:default`,
      providerId: provider.id,
      type: provider.envVar ? 'env' : 'api-key',
      value: provider.apiKey,
      envVar: provider.envVar,
      createdAt: provider.createdAt,
      updatedAt: provider.updatedAt,
    },
  ]
}

function sanitizeProvider(provider: ProviderRecord, models: ProviderModelRecord[]): ProviderConfig {
  return {
    id: provider.id,
    name: provider.name,
    type: provider.type ?? legacyTypeFromApi(provider.api),
    api: provider.api ?? apiFromLegacyType(provider.type),
    baseUrl: provider.baseUrl,
    enabled: provider.enabled,
    credentialRef: provider.credentialRef,
    authHeader: provider.authHeader,
    headers: provider.headers ? { ...provider.headers } : undefined,
    extraBody: provider.extraBody ? { ...provider.extraBody } : undefined,
    defaultModelId: provider.defaultModelId,
    capabilities: provider.capabilities ? { ...provider.capabilities } : undefined,
    createdAt: provider.createdAt,
    updatedAt: provider.updatedAt,
    models: models.map(toLegacyModel),
  }
}

function toLegacyModel(model: ProviderModelRecord): ModelConfig {
  return {
    id: model.id,
    providerId: model.providerId,
    name: model.name,
    remoteId: model.remoteId ?? model.id,
    enabled: model.enabled,
    input: model.input ?? ['text'],
    supportsStreaming: model.supportsStreaming ?? true,
    supportsTools: model.supportsTools ?? false,
    supportsReasoning: model.supportsReasoning,
    contextWindow: model.contextWindow,
    maxOutputTokens: model.maxOutputTokens,
    compat: model.compat,
  }
}

function legacyTypeFromApi(api?: ProviderApi): ProviderType {
  if (api === 'omniinfer') {
    return 'omniinfer'
  }
  if (api === 'ollama') {
    return 'ollama'
  }
  return 'openai-compatible'
}

function apiFromLegacyType(type?: ProviderType): ProviderApi {
  if (type === 'omniinfer') {
    return 'omniinfer'
  }
  if (type === 'ollama') {
    return 'ollama'
  }
  return 'openai-chat-completions'
}

function mergeModels(
  providerId: string,
  existing: ProviderModelRecord[],
  remoteModels: ProviderModelCandidate[]
): ProviderModelRecord[] {
  const existingByRemoteId = new Map(existing.map((model) => [model.remoteId ?? model.id, model]))
  const remoteRecords = remoteModels.map((remote) => {
    const current = existingByRemoteId.get(remote.id)
    return {
      ...current,
      id: current?.id ?? remote.id,
      providerId,
      name: current?.name ?? remote.name ?? remote.id,
      remoteId: remote.id,
      enabled: current?.enabled ?? true,
      manual: current?.manual ?? false,
      contextWindow: current?.contextWindow ?? remote.contextWindow,
      supportsStreaming: current?.supportsStreaming ?? true,
      input: current?.input ?? ['text'],
    } satisfies ProviderModelRecord
  })

  const localRecords = existing
    .filter((model) => !remoteRecords.some((remote) => remote.id === model.id))
    .map((model) => ({
      ...model,
      manual: model.manual ?? true,
    }))

  return [...localRecords, ...remoteRecords]
}

function upsertProviderInConfig(config: DesktopSettingsConfig, provider: ProviderRecord): void {
  const now = Date.now()
  const existingIndex = config.providers.sources.findIndex((source) => source.id === provider.id)
  const existing = existingIndex >= 0 ? config.providers.sources[existingIndex] : undefined
  const nextModelIds = new Set((provider.models ?? []).map((model) => model.id))
  const source = {
    id: provider.id,
    type: provider.type ?? legacyTypeFromApi(provider.api),
    api: provider.api ?? apiFromLegacyType(provider.type),
    name: provider.name,
    baseUrl: provider.baseUrl,
    enabled: provider.enabled,
    credentialRef: provider.credentialRef,
    authHeader: provider.authHeader,
    apiKey: provider.apiKey ?? existing?.apiKey,
    credentialEnvVar: provider.envVar ?? existing?.credentialEnvVar,
    headers: provider.headers ?? {},
    extraBody: provider.extraBody ?? {},
    defaultModelId: provider.defaultModelId,
    capabilities: provider.capabilities ?? {},
    compat: provider.compat,
    createdAt: provider.createdAt ?? existing?.createdAt ?? now,
    updatedAt: provider.updatedAt ?? now,
  }

  if (existingIndex >= 0) {
    config.providers.sources[existingIndex] = source
  } else {
    config.providers.sources.push(source)
  }

  for (const model of provider.models ?? []) {
    upsertModelInConfig(config, {
      ...model,
      providerId: provider.id,
    })
  }

  config.providers.models = config.providers.models.filter(
    (model) => model.providerSourceId !== provider.id || nextModelIds.has(model.id)
  )

  if (
    source.defaultModelId &&
    !config.providers.models.some((model) => model.id === source.defaultModelId)
  ) {
    source.defaultModelId = undefined
  }
  if (
    config.providers.settings.defaultModelId &&
    !config.providers.models.some(
      (model) => model.id === config.providers.settings.defaultModelId && model.enabled !== false
    )
  ) {
    config.providers.settings.defaultModelId =
      config.providers.models.find((model) => model.enabled !== false)?.id ?? ''
  }
}

function upsertModelInConfig(config: DesktopSettingsConfig, model: ProviderModelRecord): void {
  const now = Date.now()
  const existingIndex = config.providers.models.findIndex((item) => item.id === model.id)
  const existing = existingIndex >= 0 ? config.providers.models[existingIndex] : undefined
  const next = {
    id: model.id,
    name: model.name,
    providerSourceId: model.providerId,
    remoteId: model.remoteId ?? model.id,
    enabled: model.enabled,
    input: model.input ?? ['text'],
    supportsStreaming: model.supportsStreaming ?? true,
    supportsTools: model.supportsTools ?? false,
    supportsReasoning: model.supportsReasoning ?? false,
    contextWindow: model.contextWindow,
    maxOutputTokens: model.maxOutputTokens,
    capabilities: existing?.capabilities ?? {},
    compat: model.compat,
    createdAt: model.createdAt ?? existing?.createdAt ?? now,
    updatedAt: model.updatedAt ?? now,
  }

  if (existingIndex >= 0) {
    config.providers.models[existingIndex] = next
  } else {
    config.providers.models.push(next)
  }

  const source = config.providers.sources.find((item) => item.id === model.providerId)
  if (source && !source.defaultModelId) {
    source.defaultModelId = model.id
  }
  if (!config.providers.settings.defaultModelId && model.enabled !== false) {
    config.providers.settings.defaultModelId = model.id
  }
}

function pruneProviderModelReferences(config: DesktopSettingsConfig, providerId: string): void {
  const source = config.providers.sources.find((item) => item.id === providerId)
  if (
    source?.defaultModelId &&
    !config.providers.models.some((model) => model.id === source.defaultModelId)
  ) {
    source.defaultModelId = config.providers.models.find(
      (model) => model.providerSourceId === providerId && model.enabled !== false
    )?.id
  }

  if (
    config.providers.settings.defaultModelId &&
    !config.providers.models.some(
      (model) => model.id === config.providers.settings.defaultModelId && model.enabled !== false
    )
  ) {
    config.providers.settings.defaultModelId =
      config.providers.models.find((model) => model.enabled !== false)?.id ?? ''
  }

  config.providers.settings.fallbackModelIds = config.providers.settings.fallbackModelIds.filter(
    (modelId) =>
      config.providers.models.some((model) => model.id === modelId && model.enabled !== false)
  )
}

function cloneProvider(provider: ProviderRecord | undefined): ProviderRecord | undefined {
  if (!provider) {
    return undefined
  }

  return {
    ...provider,
    headers: provider.headers ? { ...provider.headers } : undefined,
    extraBody: provider.extraBody ? { ...provider.extraBody } : undefined,
    capabilities: provider.capabilities ? { ...provider.capabilities } : undefined,
    compat: provider.compat ? { ...provider.compat } : undefined,
    models: provider.models?.map((model) => ({
      ...model,
      input: model.input ? [...model.input] : undefined,
    })),
  }
}

function cloneProviderPreset(preset: ProviderPreset): ProviderPreset {
  return {
    ...preset,
    headers: preset.headers ? { ...preset.headers } : undefined,
    extraBody: preset.extraBody ? { ...preset.extraBody } : undefined,
    capabilities: preset.capabilities ? { ...preset.capabilities } : undefined,
    compat: preset.compat ? { ...preset.compat } : undefined,
    models: preset.models?.map((model) => ({
      ...model,
      input: model.input ? [...model.input] : undefined,
      pricing: model.pricing ? { ...model.pricing } : undefined,
      compat: model.compat ? { ...model.compat } : undefined,
      capabilities: model.capabilities ? { ...model.capabilities } : undefined,
    })),
  }
}

function uniqueProviderId(baseId: string, providers: ProviderRecord[]): string {
  const existingIds = new Set(providers.map((provider) => provider.id))
  return uniqueSuffixedId(baseId, existingIds)
}

function uniqueModelId(baseId: string, providerId: string, existingIds: Set<string>): string {
  if (
    !existingIds.has(baseId) &&
    providerId ===
      providerPresets.find((preset) => preset.models?.some((model) => model.id === baseId))?.id
  ) {
    return baseId
  }

  return uniqueSuffixedId(`${providerId}:${baseId}`, existingIds)
}

function uniqueSuffixedId(baseId: string, existingIds: Set<string>): string {
  if (!existingIds.has(baseId)) {
    return baseId
  }

  let index = 1
  while (existingIds.has(`${baseId}_${index}`)) {
    index += 1
  }
  return `${baseId}_${index}`
}

function providerIdSuffix(providerId: string, baseId: string): string {
  return providerId.startsWith(`${baseId}_`) ? providerId.slice(baseId.length + 1) : providerId
}
