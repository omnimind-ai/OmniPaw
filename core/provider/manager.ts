import type { ProviderConfig, ModelConfig, ProviderType } from '@shared/types/provider'
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

export interface ProviderRepository {
  list(): Promise<ProviderRecord[]>
  get(id: string): Promise<ProviderRecord | undefined>
  save(provider: ProviderRecord): Promise<void>
  delete?(id: string): Promise<void>
}

export interface ProviderModelRepository {
  listByProvider(providerId: string): Promise<ProviderModelRecord[]>
  save(model: ProviderModelRecord): Promise<void>
  deleteRemoteModels?(providerId: string, remoteIdsToKeep: string[]): Promise<void>
}

export interface ProviderCredentialRepository {
  listByProvider(providerId: string): Promise<ProviderCredentialRecord[]>
}

export interface SessionProviderOverrideRepository {
  getProviderOverride(sessionId: string): Promise<{ providerId?: string; modelId?: string } | undefined>
}

export interface ProviderManagerOptions {
  providers?: ProviderRepository
  models?: ProviderModelRepository
  credentials?: ProviderCredentialRepository
  sessions?: SessionProviderOverrideRepository
}

export interface ProviderTestResult {
  ok: boolean
  error?: ReturnType<typeof normalizeProviderError>
}

const DEFAULT_PROVIDERS: ProviderRecord[] = [
  {
    id: 'omniinfer-local',
    name: 'OmniInfer Local',
    type: 'omniinfer',
    api: 'omniinfer',
    baseUrl: 'http://localhost:11434/v1',
    enabled: true,
    defaultModelId: 'local-small-model',
    models: [
      {
        id: 'local-small-model',
        providerId: 'omniinfer-local',
        name: 'Local Small Model',
        remoteId: 'local-small-model',
        enabled: true,
        manual: true,
        contextWindow: 8192,
      },
    ],
  },
  {
    id: 'openai-compatible',
    name: 'OpenAI Compatible',
    type: 'openai-compatible',
    api: 'openai-chat-completions',
    baseUrl: 'https://api.openai.com/v1',
    enabled: false,
    models: [],
    capabilities: {
      listModels: true,
      streaming: true,
    },
  },
]

export class ProviderManager {
  private readonly providers?: ProviderRepository
  private readonly models?: ProviderModelRepository
  private readonly credentials?: ProviderCredentialRepository
  private readonly sessions?: SessionProviderOverrideRepository
  private readonly memoryProviders = new Map(DEFAULT_PROVIDERS.map((provider) => [provider.id, cloneRequiredProvider(provider)]))

  constructor(options: ProviderManagerOptions = {}) {
    this.providers = options.providers
    this.models = options.models
    this.credentials = options.credentials
    this.sessions = options.sessions
  }

  async list(): Promise<ProviderConfig[]> {
    const providers = await this.listRecords()
    const modelsByProvider = await this.modelsForProviders(providers)

    return providers.map((provider) => sanitizeProvider(provider, modelsByProvider.get(provider.id) ?? provider.models ?? []))
  }

  async get(providerId: string): Promise<ProviderConfig | undefined> {
    const provider = await this.getRecord(providerId)
    if (!provider) {
      return undefined
    }

    return sanitizeProvider(provider, await this.listModels(provider.id))
  }

  async save(provider: ProviderRecord): Promise<void> {
    if (this.providers) {
      await this.providers.save(provider)
      return
    }

    this.memoryProviders.set(provider.id, cloneRequiredProvider(provider))
  }

  async listModels(providerId: string): Promise<ProviderModelRecord[]> {
    if (this.models) {
      return this.models.listByProvider(providerId)
    }

    return cloneProvider(this.memoryProviders.get(providerId))?.models ?? []
  }

  async resolveDefaultProvider(sessionId?: string): Promise<{ provider: ProviderRecord; modelId: string }> {
    const override = sessionId ? await this.sessions?.getProviderOverride(sessionId) : undefined
    const provider = await this.getRecord(override?.providerId ?? '') ?? (await this.listRecords()).find((item) => item.enabled)

    if (!provider) {
      throw new Error('No enabled provider is configured.')
    }

    const modelId = override?.modelId ?? provider.defaultModelId ?? (await this.listModels(provider.id)).find((model) => model.enabled)?.id
    if (!modelId) {
      throw new Error(`No default model is configured for provider ${provider.id}.`)
    }

    return { provider, modelId }
  }

  async test(providerId: string, modelId?: string, signal?: AbortSignal): Promise<ProviderTestResult> {
    try {
      const provider = await this.createProviderClient(providerId)
      const resolvedModelId = modelId ?? await this.defaultModelId(providerId)
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
    if (!record.capabilities?.listModels && record.api !== 'openai-chat-completions' && record.type !== 'openai-compatible') {
      return this.listModels(providerId)
    }

    const client = await this.createProviderClient(providerId)
    const remoteModels = await client.listModels?.(signal) ?? []
    const existing = await this.listModels(providerId)
    const merged = mergeModels(providerId, existing, remoteModels)

    for (const model of merged) {
      await this.saveModel(model)
    }

    if (this.models?.deleteRemoteModels) {
      await this.models.deleteRemoteModels(providerId, merged.map((model) => model.remoteId ?? model.id))
    }

    return merged
  }

  async createProviderClient(providerId: string): Promise<BaseProvider> {
    const provider = await this.requireRecord(providerId)
    const credentials = await this.credentials?.listByProvider(provider.id)
    const credential = resolveCredential({
      providerId: provider.id,
      credentialRef: provider.credentialRef,
      credentials,
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

    throw new Error(`Provider transport is not implemented for ${provider.api ?? provider.type ?? provider.id}.`)
  }

  private async listRecords(): Promise<ProviderRecord[]> {
    if (this.providers) {
      return this.providers.list()
    }

    return Array.from(this.memoryProviders.values()).map(cloneRequiredProvider)
  }

  private async getRecord(providerId: string): Promise<ProviderRecord | undefined> {
    if (!providerId) {
      return undefined
    }

    if (this.providers) {
      return this.providers.get(providerId)
    }

    return cloneProvider(this.memoryProviders.get(providerId))
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
    return provider.defaultModelId ?? (await this.listModels(providerId)).find((model) => model.enabled)?.id
  }

  private async saveModel(model: ProviderModelRecord): Promise<void> {
    if (this.models) {
      await this.models.save(model)
      return
    }

    const provider = await this.requireRecord(model.providerId)
    const models = provider.models ?? []
    const index = models.findIndex((existing) => existing.id === model.id)
    if (index >= 0) {
      models[index] = model
    } else {
      models.push(model)
    }
    provider.models = models
    this.memoryProviders.set(provider.id, cloneRequiredProvider(provider))
  }

  private async modelsForProviders(providers: ProviderRecord[]): Promise<Map<string, ProviderModelRecord[]>> {
    const result = new Map<string, ProviderModelRecord[]>()
    await Promise.all(providers.map(async (provider) => {
      result.set(provider.id, await this.listModels(provider.id))
    }))
    return result
  }
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
  remoteModels: ProviderModelCandidate[],
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

  const manualRecords = existing.filter((model) => model.manual && !remoteRecords.some((remote) => remote.id === model.id))
  return [...manualRecords, ...remoteRecords]
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
    models: provider.models?.map((model) => ({ ...model, input: model.input ? [...model.input] : undefined })),
  }
}

function cloneRequiredProvider(provider: ProviderRecord): ProviderRecord {
  return cloneProvider(provider) ?? provider
}
