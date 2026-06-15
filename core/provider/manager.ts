import type { ConfigStore } from '@core/config/store'
import type { Logger } from '@core/logging'
import type { InstalledModelRegistry } from '@core/omniinfer/installed-models'
import type { OmniInferRuntimeService } from '@core/omniinfer/runtime-service'
import type { ChatError } from '@shared/types/chat'
import type {
  ModelConfig,
  ProviderConfig,
  ProviderDeleteResult,
  ProviderModelRef,
  ProviderPreset,
  ProviderRegistry,
  ProviderRegistryModel,
  ProviderRegistrySettings,
  ProviderRegistrySource,
  ProviderRegistryStatus,
  ProviderType,
  SaveProviderRequest,
} from '@shared/types/provider'
import type { DesktopSettingsConfig } from '@shared/types/settings'
import type { BaseProvider, ProviderModelCandidate } from './base-provider'
import type { ProviderCredentialRecord } from './credentials'
import { resolveCredential } from './credentials'
import { normalizeProviderError } from './errors'
import { OmniInferProvider } from './providers/omniinfer'
import { OpenAICompatibleProvider } from './providers/openai'
import { OpenAICodexProvider } from './providers/openai-codex'
import type { ProviderRegistryStore } from './registry-store'

export type ProviderApi =
  | 'openai-chat-completions'
  | 'openai-responses'
  | 'openai-codex-responses'
  | 'ollama'
  | 'omniinfer'

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
  omniInferModelsDir?: string
}

export interface SessionProviderOverrideRepository {
  getProviderOverride(
    sessionId: string
  ): Promise<{ providerId?: string; modelId?: string } | undefined>
  clearProviderOverrides?(input: {
    providerId: string
    modelIds?: string[]
  }): Promise<number> | number
}

export interface ProviderManagerOptions {
  sessions?: SessionProviderOverrideRepository
  registryStore?: ProviderRegistryStore
  configStore?: ConfigStore
  onConfigSaved?: (config: DesktopSettingsConfig) => void
  onRegistryChanged?: (registry: ProviderRegistry) => void
  logger?: Logger
  omniInferRuntimeService?: OmniInferRuntimeService
  omniInferInstalledModels?: InstalledModelRegistry
}

export interface ProviderTestResult {
  ok: boolean
  error?: ReturnType<typeof normalizeProviderError>
}

interface ProviderRegistryLoadResult {
  registry: ProviderRegistry
  status: ProviderRegistryStatus
}

interface ProviderRegistryMutationResult extends ProviderRegistryLoadResult {
  ok?: boolean
  source?: ProviderRegistrySource
  model?: ProviderRegistryModel
  models?: ProviderRegistryModel[]
  nextSelection?: ProviderModelRef
}

interface UpsertProviderSourceRequest {
  source: Partial<ProviderRegistrySource> & {
    id: string
    name: string
    baseUrl: string
  }
  credential?: {
    type?: string
    label?: string
    value?: string
    envVar?: string
  }
}

interface UpsertProviderModelRequest {
  providerId: string
  model: Partial<ProviderRegistryModel> & {
    id: string
    name: string
  }
}

interface DeleteProviderModelRequest {
  providerId: string
  modelId: string
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
    id: 'openai-codex',
    name: 'OpenAI Codex OAuth',
    type: 'openai-codex',
    api: 'openai-codex-responses',
    baseUrl: 'https://chatgpt.com/backend-api',
    enabled: true,
    credentialRef: 'openai-codex:default',
    authHeader: 'Authorization',
    description: 'ChatGPT/Codex OAuth provider backed by OpenAI Codex Responses.',
    capabilities: {
      listModels: true,
      streaming: true,
      tools: true,
      vision: true,
    },
    compat: {
      maxTokensField: 'max_tokens',
      supportsSystemRole: true,
      supportsDeveloperRole: true,
      supportsJsonMode: false,
      reasoningFormat: 'openai',
    },
    defaultModelId: 'gpt-5.4',
    models: [
      {
        id: 'gpt-5.4',
        name: 'GPT-5.4 Codex',
        enabled: true,
        input: ['text', 'image'],
        supportsStreaming: true,
        supportsTools: true,
        supportsReasoning: true,
        contextWindow: 1_050_000,
        maxOutputTokens: 128_000,
      },
      {
        id: 'gpt-5.3-codex',
        name: 'GPT-5.3 Codex',
        enabled: true,
        input: ['text', 'image'],
        supportsStreaming: true,
        supportsTools: true,
        supportsReasoning: true,
      },
      {
        id: 'gpt-5.3-codex-spark',
        name: 'GPT-5.3 Codex Spark',
        enabled: true,
        input: ['text', 'image'],
        supportsStreaming: true,
        supportsTools: true,
        supportsReasoning: true,
      },
      {
        id: 'gpt-5.2-codex',
        name: 'GPT-5.2 Codex',
        enabled: true,
        input: ['text', 'image'],
        supportsStreaming: true,
        supportsTools: true,
        supportsReasoning: true,
      },
      {
        id: 'gpt-5.1-codex',
        name: 'GPT-5.1 Codex',
        enabled: true,
        input: ['text', 'image'],
        supportsStreaming: true,
        supportsTools: true,
        supportsReasoning: true,
      },
    ],
  },
  {
    id: 'omniinfer-local',
    name: 'OmniInfer Local',
    type: 'omniinfer',
    api: 'omniinfer',
    baseUrl: 'http://127.0.0.1:19157/v1',
    enabled: true,
    description: 'Local OmniInfer-compatible model service.',
    capabilities: {
      listModels: true,
      streaming: true,
      tools: false,
      vision: false,
    },
    models: [
      {
        id: 'local-small-model',
        name: 'Local Small Model',
        enabled: true,
        input: ['text'],
        supportsStreaming: true,
        supportsTools: false,
        supportsReasoning: false,
      },
    ],
  },
]

export class ProviderManager {
  private readonly sessions?: SessionProviderOverrideRepository
  private readonly registryStore?: ProviderRegistryStore
  private readonly configStore?: ConfigStore
  private readonly onConfigSaved?: (config: DesktopSettingsConfig) => void
  private readonly onRegistryChanged?: (registry: ProviderRegistry) => void
  private readonly logger?: Logger
  private readonly omniInferRuntimeService?: OmniInferRuntimeService
  private readonly omniInferInstalledModels?: InstalledModelRegistry

  constructor(options: ProviderManagerOptions) {
    if (!options.registryStore && !options.configStore) {
      throw new Error('ProviderManager requires a provider registry store or config store.')
    }
    this.sessions = options.sessions
    this.registryStore = options.registryStore
    this.configStore = options.configStore
    this.onConfigSaved = options.onConfigSaved
    this.onRegistryChanged = options.onRegistryChanged
    this.logger = options.logger
    this.omniInferRuntimeService = options.omniInferRuntimeService
    this.omniInferInstalledModels = options.omniInferInstalledModels
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

  loadRegistry(): ProviderRegistryLoadResult {
    const registry = this.requireRegistryStore().load()
    return this.registryResult(registry)
  }

  registryStatus(): ProviderRegistryStatus {
    return this.requireRegistryStore().status()
  }

  async createFromPreset(presetId: string): Promise<ProviderConfig> {
    this.logger?.info('Creating provider from preset.', { presetId })
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
        const modelId = this.registryStore
          ? model.id
          : uniqueModelId(model.id, providerId, existingModelIds)
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
      defaultModelId: this.registryStore
        ? undefined
        : preset.defaultModelId
          ? modelIds.get(preset.defaultModelId)
          : undefined,
      capabilities: preset.capabilities ? { ...preset.capabilities } : {},
      compat: preset.compat ? { ...preset.compat } : undefined,
      models,
      updatedAt: now,
    })

    const saved = await this.get(providerId)
    if (!saved) {
      throw new Error(`Provider preset was not saved: ${presetId}`)
    }

    this.logger?.info('Provider preset created.', { presetId, providerId })
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
    if (this.registryStore) {
      const registry = this.registryStore.get()
      const next = upsertProviderInRegistry(registry, provider)
      this.saveRegistry(next)
      this.logger?.debug('Provider saved.', {
        providerId: provider.id,
        enabled: provider.enabled,
        modelCount: provider.models?.length ?? 0,
      })
      this.syncOmniInferGatewayUrl(provider)
      this.syncOmniInferModelsDir(provider)
      return
    }

    const config = this.requireConfigStore().get()
    upsertProviderInConfig(config, provider)
    this.saveConfig(config)
    this.logger?.debug('Provider saved.', {
      providerId: provider.id,
      enabled: provider.enabled,
      modelCount: provider.models?.length ?? 0,
    })
    this.syncOmniInferGatewayUrl(provider)
    this.syncOmniInferModelsDir(provider)
  }

  private syncOmniInferGatewayUrl(provider: ProviderRecord): void {
    if (!this.omniInferRuntimeService) return
    if (provider.api !== 'omniinfer' && provider.type !== 'omniinfer') return
    if (!provider.baseUrl) return
    this.omniInferRuntimeService.setBaseUrl(provider.baseUrl)
  }

  private syncOmniInferModelsDir(provider: ProviderRecord): void {
    if (!this.omniInferRuntimeService) return
    if (provider.api !== 'omniinfer' && provider.type !== 'omniinfer') return
    const dir = provider.omniInferModelsDir?.trim()
    if (!dir) return
    this.omniInferRuntimeService.setModelsDir(dir)
  }

  async listModels(providerId: string): Promise<ProviderModelRecord[]> {
    if (this.registryStore) {
      return this.registryStore
        .get()
        .models.filter((model) => model.providerId === providerId)
        .map(registryModelToRecord)
    }

    return cloneProvider(await this.getRecord(providerId))?.models ?? []
  }

  async resolveDefaultProvider(
    sessionId?: string
  ): Promise<{ provider: ProviderRecord; modelId: string; fallbackReason?: string }> {
    if (this.registryStore) {
      const override = sessionId ? await this.sessions?.getProviderOverride(sessionId) : undefined
      return this.resolveRegistrySelection({
        providerId: override?.providerId,
        modelId: override?.modelId,
      })
    }

    const override = sessionId ? await this.sessions?.getProviderOverride(sessionId) : undefined
    const records = await this.listRecords()
    const globalDefaultModelId =
      !override?.providerId && !override?.modelId
        ? this.requireConfigStore().get().providers.settings.defaultModelId
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

  async resolveTitleProvider(
    sessionId?: string
  ): Promise<{ provider: ProviderRecord; modelId: string; fallbackReason?: string }> {
    if (this.registryStore) {
      const registry = this.registryStore.get()
      const titleModelRef = registry.settings.titleModelRef
      if (titleModelRef) {
        const explicit = resolveRegistrySelection(
          registry,
          titleModelRef.providerId,
          titleModelRef.modelId
        )
        if (explicit) {
          return explicit
        }
      }
    }

    const resolved = await this.resolveDefaultProvider(sessionId)
    return {
      ...resolved,
      fallbackReason: resolved.fallbackReason ?? 'default_model_for_title_summary',
    }
  }

  async upsertSource(
    request: UpsertProviderSourceRequest
  ): Promise<ProviderRegistryMutationResult> {
    const registry = this.requireRegistryStore().get()
    const existingModels = registry.models
      .filter((model) => model.providerId === request.source.id)
      .map(registryModelToRecord)
    const credential = request.credential
    const credentialRef =
      credential && (credential.value || credential.envVar)
        ? (request.source.credentialRef ?? `${request.source.id}:default`)
        : request.source.credentialRef
    const next = upsertProviderInRegistry(registry, {
      id: request.source.id,
      name: request.source.name,
      type: request.source.type,
      api: request.source.api,
      baseUrl: request.source.baseUrl,
      enabled: request.source.enabled !== false,
      credentialRef,
      authHeader: request.source.authHeader,
      envVar: credential?.envVar ?? request.source.envVar,
      apiKey: credential?.value ?? request.source.apiKey,
      headers: request.source.headers,
      extraBody: request.source.extraBody,
      capabilities: request.source.capabilities,
      compat: request.source.compat,
      models: existingModels,
      createdAt: request.source.createdAt,
      updatedAt: Date.now(),
    })
    const saved = this.saveRegistry(next)
    return this.registryResult(saved, {
      ok: true,
      source: sanitizeRegistry(saved).sources.find((source) => source.id === request.source.id),
    })
  }

  async upsertModel(request: UpsertProviderModelRequest): Promise<ProviderRegistryMutationResult> {
    const registry = this.requireRegistryStore().get()
    if (!registry.sources.some((source) => source.id === request.providerId)) {
      throw new ProviderSelectionError({
        code: 'not_found',
        message: `Provider not found: ${request.providerId}`,
        retryable: false,
      })
    }

    const existing = registry.models.find(
      (model) => model.providerId === request.providerId && model.id === request.model.id
    )
    const nextModel = recordToRegistryModel(
      {
        id: request.model.id,
        providerId: request.providerId,
        name: request.model.name,
        remoteId: request.model.remoteId,
        enabled: request.model.enabled !== false,
        manual: request.model.manual,
        input: request.model.input,
        supportsStreaming: request.model.supportsStreaming,
        supportsTools: request.model.supportsTools,
        supportsReasoning: request.model.supportsReasoning,
        contextWindow: request.model.contextWindow,
        maxOutputTokens: request.model.maxOutputTokens,
        compat: request.model.compat,
        createdAt: request.model.createdAt,
        updatedAt: Date.now(),
      },
      request.providerId,
      existing
    )
    nextModel.capabilities = request.model.capabilities ?? existing?.capabilities ?? {}
    const next = cleanupRegistryReferences({
      ...registry,
      models: existing
        ? registry.models.map((model) =>
            model.providerId === request.providerId && model.id === request.model.id
              ? nextModel
              : model
          )
        : [...registry.models, nextModel],
    })
    const saved = this.saveRegistry(next)
    return this.registryResult(saved, {
      ok: true,
      model: sanitizeRegistry(saved).models.find(
        (model) => model.providerId === request.providerId && model.id === request.model.id
      ),
    })
  }

  async setDefaultModel(
    selection: Partial<ProviderModelRef> | undefined
  ): Promise<ProviderRegistryMutationResult> {
    const registry = this.requireRegistryStore().get()
    const nextSettings = { ...registry.settings }
    if (!selection?.providerId || !selection.modelId) {
      delete nextSettings.defaultProviderId
      delete nextSettings.defaultModelId
      return this.registryResult(this.saveRegistry({ ...registry, settings: nextSettings }), {
        ok: true,
      })
    }

    const selectedRef: ProviderModelRef = {
      providerId: selection.providerId,
      modelId: selection.modelId,
    }
    const model = findEnabledRegistryModel(registry, selectedRef.providerId, selectedRef.modelId)
    if (!model) {
      throw new ProviderSelectionError({
        code: 'validation',
        message: `Default model is not enabled or does not exist: ${selectedRef.providerId}/${selectedRef.modelId}.`,
        retryable: false,
      })
    }
    nextSettings.defaultProviderId = selectedRef.providerId
    nextSettings.defaultModelId = selectedRef.modelId
    nextSettings.fallbackModelRefs = nextSettings.fallbackModelRefs.filter(
      (ref) => !sameModelRef(ref, selectedRef)
    )
    return this.registryResult(this.saveRegistry({ ...registry, settings: nextSettings }), {
      ok: true,
    })
  }

  async setFallbackModels(
    request: ProviderModelRef[] | { models: ProviderModelRef[] }
  ): Promise<ProviderRegistryMutationResult> {
    const models = Array.isArray(request) ? request : request.models
    const registry = this.requireRegistryStore().get()
    const defaultRef = registry.settings.defaultProviderId
      ? {
          providerId: registry.settings.defaultProviderId,
          modelId: registry.settings.defaultModelId ?? '',
        }
      : undefined
    const normalized: ProviderModelRef[] = []
    for (const ref of models) {
      if (defaultRef && sameModelRef(ref, defaultRef)) {
        continue
      }
      if (!findEnabledRegistryModel(registry, ref.providerId, ref.modelId)) {
        throw new ProviderSelectionError({
          code: 'validation',
          message: `Fallback model is not enabled or does not exist: ${ref.providerId}/${ref.modelId}.`,
          retryable: false,
        })
      }
      if (!normalized.some((item) => sameModelRef(item, ref))) {
        normalized.push({ ...ref })
      }
    }
    return this.registryResult(
      this.saveRegistry({
        ...registry,
        settings: {
          ...registry.settings,
          fallbackModelRefs: normalized,
        },
      }),
      { ok: true }
    )
  }

  async setTitleModel(
    selection: Partial<ProviderModelRef> | undefined
  ): Promise<ProviderRegistryMutationResult> {
    const registry = this.requireRegistryStore().get()
    const nextSettings = { ...registry.settings }
    if (!selection?.providerId || !selection.modelId) {
      delete nextSettings.titleModelRef
      return this.registryResult(this.saveRegistry({ ...registry, settings: nextSettings }), {
        ok: true,
      })
    }

    const selectedRef: ProviderModelRef = {
      providerId: selection.providerId,
      modelId: selection.modelId,
    }
    const model = findEnabledRegistryModel(registry, selectedRef.providerId, selectedRef.modelId)
    if (!model) {
      throw new ProviderSelectionError({
        code: 'validation',
        message: `Title summary model is not enabled or does not exist: ${selectedRef.providerId}/${selectedRef.modelId}.`,
        retryable: false,
      })
    }
    nextSettings.titleModelRef = selectedRef
    return this.registryResult(this.saveRegistry({ ...registry, settings: nextSettings }), {
      ok: true,
    })
  }

  async setEmbeddingModel(
    selection: Partial<ProviderModelRef> | undefined
  ): Promise<ProviderRegistryMutationResult> {
    const registry = this.requireRegistryStore().get()
    const nextSettings = { ...registry.settings }
    nextSettings.embeddingModelRef = this.normalizeOptionalEnabledModelRefWithInput(
      registry,
      selection,
      'Embedding model',
      'text'
    )
    return this.registryResult(this.saveRegistry({ ...registry, settings: nextSettings }), {
      ok: true,
    })
  }

  async setObservationModels(
    request: Pick<
      ProviderRegistrySettings,
      'observationVisionModelRef' | 'observationReactionModelRef'
    >
  ): Promise<ProviderRegistryMutationResult> {
    const registry = this.requireRegistryStore().get()
    const nextSettings = { ...registry.settings }
    nextSettings.observationVisionModelRef = this.normalizeOptionalEnabledModelRefWithInput(
      registry,
      request.observationVisionModelRef,
      'Observation vision model',
      'image'
    )
    nextSettings.observationReactionModelRef = this.normalizeOptionalEnabledModelRefWithInput(
      registry,
      request.observationReactionModelRef,
      'Observation reaction model',
      'text'
    )
    return this.registryResult(this.saveRegistry({ ...registry, settings: nextSettings }), {
      ok: true,
    })
  }

  async test(
    providerId: string,
    modelId?: string,
    signal?: AbortSignal
  ): Promise<ProviderTestResult> {
    const startedAt = Date.now()
    try {
      const provider = await this.createProviderClient(providerId)
      const resolvedModelId = modelId ?? (await this.defaultModelId(providerId))
      await provider.test?.(resolvedModelId, signal)
      this.logger?.info('Provider test succeeded.', {
        providerId,
        modelId: resolvedModelId,
        durationMs: Date.now() - startedAt,
      })
      return { ok: true }
    } catch (error) {
      const normalized = normalizeProviderError(error)
      this.logger?.warn('Provider test failed.', {
        providerId,
        modelId,
        durationMs: Date.now() - startedAt,
        errorCode: normalized.code,
        retryable: normalized.retryable,
        error: safeProviderError(normalized),
      })
      return {
        ok: false,
        error: normalized,
      }
    }
  }

  async refreshModels(providerId: string, signal?: AbortSignal): Promise<ProviderModelRecord[]> {
    const startedAt = Date.now()
    const record = await this.requireRecord(providerId)
    if (
      !record.capabilities?.listModels &&
      record.api !== 'openai-chat-completions' &&
      record.api !== 'openai-codex-responses' &&
      record.type !== 'openai-codex' &&
      record.type !== 'openai-compatible'
    ) {
      this.logger?.debug('Provider model refresh skipped.', { providerId, reason: 'unsupported' })
      return this.listModels(providerId)
    }

    try {
      const client = await this.createProviderClient(providerId)
      const remoteModels = (await client.listModels?.(signal)) ?? []
      const merged = mergeModels(providerId, await this.listModels(providerId), remoteModels)
      this.replaceProviderModels(providerId, merged)
      this.logger?.info('Provider models refreshed.', {
        providerId,
        remoteModelCount: remoteModels.length,
        modelCount: merged.length,
        durationMs: Date.now() - startedAt,
      })

      return merged
    } catch (error) {
      const normalized = normalizeProviderError(error)
      this.logger?.warn('Provider model refresh failed.', {
        providerId,
        durationMs: Date.now() - startedAt,
        errorCode: normalized.code,
        retryable: normalized.retryable,
        error: safeProviderError(normalized),
      })
      throw error
    }
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

    const saved = await this.get(request.provider.id)
    this.logger?.info('Provider upserted.', {
      providerId: request.provider.id,
      enabled: request.provider.enabled !== false,
      modelCount: request.provider.models?.length ?? 0,
    })
    return saved
  }

  async delete(providerId: string): Promise<void> {
    if (this.registryStore) {
      const registry = this.registryStore.get()
      const exists = registry.sources.some((source) => source.id === providerId)
      if (!exists) {
        return
      }
      const removedModelIds = registry.models
        .filter((model) => model.providerId === providerId)
        .map((model) => model.id)
      const nextRegistry = cleanupRegistryReferences({
        ...registry,
        sources: registry.sources.filter((source) => source.id !== providerId),
        models: registry.models.filter((model) => model.providerId !== providerId),
      })
      this.saveRegistry(nextRegistry)
      await this.sessions?.clearProviderOverrides?.({ providerId, modelIds: removedModelIds })
      this.logger?.info('Provider deleted.', {
        providerId,
        removedModelCount: removedModelIds.length,
      })
      return
    }

    const config = this.requireConfigStore().get()
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
    this.logger?.info('Provider deleted.', { providerId })
  }

  async deleteWithSelection(providerId: string): Promise<ProviderDeleteResult> {
    if (!this.registryStore) {
      await this.delete(providerId)
      const next = await this.resolveDefaultProvider().catch(() => undefined)
      return {
        deleted: true,
        nextSelection: next ? { providerId: next.provider.id, modelId: next.modelId } : undefined,
      }
    }

    const before = this.registryStore.get()
    const deleted = before.sources.some((source) => source.id === providerId)
    await this.delete(providerId)
    const after = this.registryStore.get()
    return {
      deleted,
      nextSelection: findFirstEnabledSelection(after),
    }
  }

  async deleteSource(
    request: { providerId: string } | string
  ): Promise<ProviderRegistryMutationResult> {
    const providerId = typeof request === 'string' ? request : request.providerId
    const before = this.requireRegistryStore().get()
    const deleted = before.sources.some((source) => source.id === providerId)
    const removedModelIds = before.models
      .filter((model) => model.providerId === providerId)
      .map((model) => model.id)
    if (!deleted) {
      return this.registryResult(before, {
        ok: true,
        nextSelection: findFirstEnabledSelection(before),
      })
    }

    const next = cleanupRegistryReferences({
      ...before,
      sources: before.sources.filter((source) => source.id !== providerId),
      models: before.models.filter((model) => model.providerId !== providerId),
    })
    const saved = this.saveRegistry(next)
    await this.sessions?.clearProviderOverrides?.({ providerId, modelIds: removedModelIds })
    return this.registryResult(saved, {
      ok: true,
      nextSelection: findFirstEnabledSelection(saved),
    })
  }

  async deleteModel(request: DeleteProviderModelRequest): Promise<ProviderRegistryMutationResult> {
    const registry = this.requireRegistryStore().get()
    const next = cleanupRegistryReferences({
      ...registry,
      models: registry.models.filter(
        (model) => !(model.providerId === request.providerId && model.id === request.modelId)
      ),
    })
    const saved = this.saveRegistry(next)
    await this.sessions?.clearProviderOverrides?.({
      providerId: request.providerId,
      modelIds: [request.modelId],
    })
    return this.registryResult(saved, {
      ok: true,
      nextSelection: findFirstEnabledSelection(saved),
    })
  }

  async resolveEmbeddingProvider(): Promise<
    { provider: ProviderRecord; model: ProviderModelRecord } | undefined
  > {
    if (!this.registryStore) {
      return undefined
    }

    const registry = this.registryStore.get()
    const ref = registry.settings.embeddingModelRef
    if (!ref) {
      return undefined
    }

    const resolved = resolveRegistrySelection(registry, ref.providerId, ref.modelId)
    if (!resolved) {
      return undefined
    }

    const model = resolved.provider.models?.find(
      (item) => item.id === resolved.modelId && item.enabled !== false
    )
    return model ? { provider: resolved.provider, model } : undefined
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

    if (provider.api === 'omniinfer' || provider.type === 'omniinfer') {
      if (!this.omniInferRuntimeService || !this.omniInferInstalledModels) {
        throw new Error(
          'OmniInfer provider is not available: runtime service has not been initialized.'
        )
      }
      this.logger?.debug('Creating provider client.', {
        providerId: provider.id,
        api: provider.api,
        type: provider.type,
        kind: 'omniinfer',
      })
      this.omniInferRuntimeService.setBaseUrl(provider.baseUrl)
      this.syncOmniInferModelsDir(provider)
      return new OmniInferProvider({
        id: provider.id,
        baseUrl: provider.baseUrl,
        apiKey: credential?.value,
        authHeader: provider.authHeader,
        headers: provider.headers,
        extraBody: provider.extraBody,
        maxTokensField: provider.compat?.maxTokensField,
        runtimeService: this.omniInferRuntimeService,
        installedModels: this.omniInferInstalledModels,
      })
    }

    if (provider.api === 'openai-codex-responses' || provider.type === 'openai-codex') {
      this.logger?.debug('Creating provider client.', {
        providerId: provider.id,
        api: provider.api,
        type: provider.type,
        hasCredential: Boolean(credential?.value || provider.credentialRef),
      })
      return new OpenAICodexProvider({
        id: provider.id,
        baseUrl: provider.baseUrl,
        apiKey: credential?.value,
        authHeader: provider.authHeader,
        headers: provider.headers,
        extraBody: provider.extraBody,
        credentialProfileId: provider.credentialRef,
      })
    }

    if (provider.api === 'openai-chat-completions' || provider.type === 'openai-compatible') {
      this.logger?.debug('Creating provider client.', {
        providerId: provider.id,
        api: provider.api,
        type: provider.type,
        hasCredential: Boolean(credential?.value),
      })
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

    this.logger?.warn('Provider transport is unsupported.', {
      providerId: provider.id,
      api: provider.api,
      type: provider.type,
    })
    throw new Error(
      `Provider transport is not implemented for ${provider.api ?? provider.type ?? provider.id}.`
    )
  }

  private async listRecords(): Promise<ProviderRecord[]> {
    if (this.registryStore) {
      return registryToProviderRecords(this.registryStore.get())
    }

    return configToProviderRecords(this.requireConfigStore().get())
  }

  private async getRecord(providerId: string): Promise<ProviderRecord | undefined> {
    if (!providerId) {
      return undefined
    }

    if (this.registryStore) {
      return registryToProviderRecords(this.registryStore.get()).find(
        (provider) => provider.id === providerId
      )
    }

    return configToProviderRecords(this.requireConfigStore().get()).find(
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
    if (this.registryStore) {
      const registry = this.registryStore.get()
      if (
        registry.settings.defaultProviderId === providerId &&
        registry.settings.defaultModelId &&
        findEnabledRegistryModel(registry, providerId, registry.settings.defaultModelId)
      ) {
        return registry.settings.defaultModelId
      }

      return registry.models.find(
        (model) => model.providerId === providerId && model.enabled !== false
      )?.id
    }

    const provider = await this.requireRecord(providerId)
    return (
      provider.defaultModelId ??
      (await this.listModels(providerId)).find((model) => model.enabled)?.id
    )
  }

  private replaceProviderModels(providerId: string, models: ProviderModelRecord[]): void {
    if (this.registryStore) {
      const registry = this.registryStore.get()
      const nextRegistry = cleanupRegistryReferences({
        ...registry,
        models: [
          ...registry.models.filter((model) => model.providerId !== providerId),
          ...models.map((model) => recordToRegistryModel(model, providerId)),
        ],
      })
      this.saveRegistry(nextRegistry)
      return
    }

    const config = this.requireConfigStore().get()
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
    const saved = this.requireConfigStore().save(config)
    this.onConfigSaved?.(saved)
    return saved
  }

  private saveRegistry(registry: ProviderRegistry): ProviderRegistry {
    if (!this.registryStore) {
      throw new Error('Provider registry store is not configured.')
    }
    const saved = this.registryStore.save(cleanupRegistryReferences(registry))
    this.onRegistryChanged?.(saved)
    return saved
  }

  private registryResult(
    registry: ProviderRegistry,
    extra: Omit<ProviderRegistryMutationResult, 'registry' | 'status'> = {}
  ): ProviderRegistryMutationResult {
    return {
      registry: sanitizeRegistry(registry),
      status: this.requireRegistryStore().status(),
      ...extra,
    }
  }

  private requireRegistryStore(): ProviderRegistryStore {
    if (!this.registryStore) {
      throw new Error('Provider registry store is not configured.')
    }
    return this.registryStore
  }

  private requireConfigStore(): ConfigStore {
    if (!this.configStore) {
      throw new Error('Provider config store is not configured.')
    }
    return this.configStore
  }

  private resolveRegistrySelection(selection: { providerId?: string; modelId?: string }): {
    provider: ProviderRecord
    modelId: string
    fallbackReason?: string
  } {
    if (!this.registryStore) {
      throw new Error('Provider registry store is not configured.')
    }

    const registry = this.registryStore.get()
    if (selection.providerId) {
      const explicit = resolveRegistrySelection(registry, selection.providerId, selection.modelId)
      if (explicit) {
        return explicit
      }
      throw new ProviderSelectionError({
        code: 'not_found',
        message: selection.modelId
          ? `Provider model is not enabled or does not exist: ${selection.providerId}/${selection.modelId}.`
          : `Provider is not enabled or does not exist: ${selection.providerId}.`,
        retryable: false,
      })
    }

    const defaultProviderId = registry.settings.defaultProviderId
    const defaultModelId = registry.settings.defaultModelId
    if (defaultProviderId && defaultModelId) {
      const explicit = resolveRegistrySelection(registry, defaultProviderId, defaultModelId)
      if (explicit) {
        return explicit
      }
    }

    const fallback = findFirstEnabledSelection(registry)
    if (!fallback) {
      throw new ProviderSelectionError({
        code: 'not_found',
        message: 'No enabled provider model is configured.',
        retryable: false,
      })
    }

    const resolved = resolveRegistrySelection(registry, fallback.providerId, fallback.modelId)
    if (!resolved) {
      throw new ProviderSelectionError({
        code: 'validation',
        message: 'No enabled provider model is available.',
        retryable: false,
      })
    }
    return {
      ...resolved,
      fallbackReason: 'first_enabled_provider_model',
    }
  }

  private normalizeOptionalEnabledModelRefWithInput(
    registry: ProviderRegistry,
    selection: Partial<ProviderModelRef> | undefined,
    label: string,
    requiredInput: 'text' | 'image'
  ): ProviderModelRef | undefined {
    if (!selection?.providerId || !selection.modelId) {
      return undefined
    }

    const selectedRef = {
      providerId: selection.providerId,
      modelId: selection.modelId,
    }
    const model = findEnabledRegistryModel(registry, selectedRef.providerId, selectedRef.modelId)
    if (!model) {
      throw new ProviderSelectionError({
        code: 'validation',
        message: `${label} is not enabled or does not exist: ${selectedRef.providerId}/${selectedRef.modelId}.`,
        retryable: false,
      })
    }
    const inputs = model.input?.length ? model.input : ['text']
    if (!inputs.includes(requiredInput)) {
      throw new ProviderSelectionError({
        code: 'validation',
        message: `${label} must support ${requiredInput} input: ${selectedRef.providerId}/${selectedRef.modelId}.`,
        retryable: false,
      })
    }
    return selectedRef
  }
}

export class ProviderSelectionError extends Error {
  readonly chatError: ChatError

  constructor(chatError: ChatError) {
    super(chatError.message)
    this.name = 'ProviderSelectionError'
    this.chatError = chatError
  }
}

function safeProviderError(error: ReturnType<typeof normalizeProviderError>) {
  return {
    code: error.code,
    message: error.message,
    retryable: error.retryable,
    providerStatus: error.providerStatus,
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
    omniInferModelsDir: source.omniInferModelsDir,
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

function registryToProviderRecords(registry: ProviderRegistry): ProviderRecord[] {
  return registry.sources.map((source) => {
    const defaultModelId =
      registry.settings.defaultProviderId === source.id
        ? registry.settings.defaultModelId
        : undefined

    return {
      id: source.id,
      name: source.name,
      type: source.type,
      api: source.api,
      baseUrl: source.baseUrl,
      enabled: source.enabled,
      credentialRef: source.credentialRef,
      authHeader: source.authHeader,
      envVar: source.envVar,
      apiKey: source.apiKey,
      headers: source.headers,
      extraBody: source.extraBody,
      defaultModelId,
      capabilities: source.capabilities,
      compat: source.compat,
      omniInferModelsDir: source.omniInferModelsDir,
      models: registry.models
        .filter((model) => model.providerId === source.id)
        .map(registryModelToRecord),
      createdAt: source.createdAt,
      updatedAt: source.updatedAt,
    }
  })
}

function registryModelToRecord(model: ProviderRegistryModel): ProviderModelRecord {
  return {
    id: model.id,
    providerId: model.providerId,
    name: model.name,
    remoteId: model.remoteId ?? model.id,
    enabled: model.enabled !== false,
    manual: model.manual,
    input: model.input,
    supportsStreaming: model.supportsStreaming,
    supportsTools: model.supportsTools,
    supportsReasoning: model.supportsReasoning,
    contextWindow: model.contextWindow,
    maxOutputTokens: model.maxOutputTokens,
    compat: model.compat,
    createdAt: model.createdAt,
    updatedAt: model.updatedAt,
  }
}

function recordToRegistryModel(
  model: ProviderModelRecord,
  providerId: string,
  existing?: ProviderRegistryModel
): ProviderRegistryModel {
  const now = Date.now()
  return {
    id: model.id,
    providerId,
    name: model.name,
    remoteId: model.remoteId ?? model.id,
    enabled: model.enabled !== false,
    manual: model.manual ?? existing?.manual,
    input: model.input ?? existing?.input ?? ['text'],
    supportsStreaming: model.supportsStreaming ?? existing?.supportsStreaming ?? true,
    supportsTools: model.supportsTools ?? existing?.supportsTools ?? false,
    supportsReasoning: model.supportsReasoning ?? existing?.supportsReasoning ?? false,
    contextWindow: model.contextWindow ?? existing?.contextWindow,
    maxOutputTokens: model.maxOutputTokens ?? existing?.maxOutputTokens,
    capabilities: existing?.capabilities ?? {},
    compat: model.compat ?? existing?.compat,
    createdAt: model.createdAt ?? existing?.createdAt ?? now,
    updatedAt: model.updatedAt ?? now,
  }
}

function upsertProviderInRegistry(
  registry: ProviderRegistry,
  provider: ProviderRecord
): ProviderRegistry {
  const now = Date.now()
  const existingSource = registry.sources.find((source) => source.id === provider.id)
  const source: ProviderRegistrySource = {
    id: provider.id,
    name: provider.name,
    type: provider.type ?? legacyTypeFromApi(provider.api),
    api: provider.api ?? apiFromLegacyType(provider.type),
    baseUrl: provider.baseUrl,
    enabled: provider.enabled,
    credentialRef: provider.credentialRef,
    authHeader: provider.authHeader,
    apiKey: provider.apiKey ?? existingSource?.apiKey,
    envVar: provider.envVar ?? existingSource?.envVar,
    headers: provider.headers ?? existingSource?.headers ?? {},
    extraBody: provider.extraBody ?? existingSource?.extraBody ?? {},
    capabilities: provider.capabilities ?? existingSource?.capabilities ?? {},
    compat: provider.compat ?? existingSource?.compat,
    omniInferModelsDir: provider.omniInferModelsDir ?? existingSource?.omniInferModelsDir,
    createdAt: provider.createdAt ?? existingSource?.createdAt ?? now,
    updatedAt: provider.updatedAt ?? now,
  }
  const sources = registry.sources.some((item) => item.id === provider.id)
    ? registry.sources.map((item) => (item.id === provider.id ? source : item))
    : [...registry.sources, source]
  const existingModelsById = new Map(
    registry.models
      .filter((model) => model.providerId === provider.id)
      .map((model) => [model.id, model])
  )
  const nextModelsForProvider = (provider.models ?? []).map((model) =>
    recordToRegistryModel(model, provider.id, existingModelsById.get(model.id))
  )

  return cleanupRegistryReferences({
    ...registry,
    sources,
    models: [
      ...registry.models.filter((model) => model.providerId !== provider.id),
      ...nextModelsForProvider,
    ],
  })
}

function cleanupRegistryReferences(registry: ProviderRegistry): ProviderRegistry {
  const enabledModelRefs = new Set(
    registry.models
      .filter((model) => {
        const source = registry.sources.find((item) => item.id === model.providerId)
        return source?.enabled !== false && model.enabled !== false
      })
      .map((model) => modelRefKey({ providerId: model.providerId, modelId: model.id }))
  )
  const defaultRef =
    registry.settings.defaultProviderId && registry.settings.defaultModelId
      ? {
          providerId: registry.settings.defaultProviderId,
          modelId: registry.settings.defaultModelId,
        }
      : undefined
  const defaultIsValid = defaultRef && enabledModelRefs.has(modelRefKey(defaultRef))
  const nextSettings = {
    ...registry.settings,
    defaultProviderId: defaultIsValid ? defaultRef.providerId : undefined,
    defaultModelId: defaultIsValid ? defaultRef.modelId : undefined,
    fallbackModelRefs: registry.settings.fallbackModelRefs.filter((ref, index, refs) => {
      if (!enabledModelRefs.has(modelRefKey(ref))) {
        return false
      }
      if (defaultIsValid && defaultRef && sameModelRef(ref, defaultRef)) {
        return false
      }
      return refs.findIndex((item) => sameModelRef(item, ref)) === index
    }),
    titleModelRef:
      registry.settings.titleModelRef &&
      enabledModelRefs.has(modelRefKey(registry.settings.titleModelRef))
        ? { ...registry.settings.titleModelRef }
        : undefined,
    embeddingModelRef:
      registry.settings.embeddingModelRef &&
      enabledModelRefs.has(modelRefKey(registry.settings.embeddingModelRef))
        ? { ...registry.settings.embeddingModelRef }
        : undefined,
    observationVisionModelRef:
      registry.settings.observationVisionModelRef &&
      enabledModelRefs.has(modelRefKey(registry.settings.observationVisionModelRef))
        ? { ...registry.settings.observationVisionModelRef }
        : undefined,
    observationReactionModelRef:
      registry.settings.observationReactionModelRef &&
      enabledModelRefs.has(modelRefKey(registry.settings.observationReactionModelRef))
        ? { ...registry.settings.observationReactionModelRef }
        : undefined,
  }

  return {
    ...registry,
    sources: registry.sources.map((source) => ({ ...source })),
    models: registry.models.map((model) => ({ ...model })),
    settings: nextSettings,
  }
}

function resolveRegistrySelection(
  registry: ProviderRegistry,
  providerId: string,
  modelId?: string
): { provider: ProviderRecord; modelId: string } | undefined {
  const provider = registryToProviderRecords(registry).find(
    (item) => item.id === providerId && item.enabled !== false
  )
  if (!provider) {
    return undefined
  }

  const model =
    provider.models?.find((item) => item.id === modelId && item.enabled !== false) ??
    (modelId ? undefined : provider.models?.find((item) => item.enabled !== false))
  if (!model) {
    return undefined
  }

  return { provider, modelId: model.id }
}

function findEnabledRegistryModel(
  registry: ProviderRegistry,
  providerId: string,
  modelId: string
): ProviderRegistryModel | undefined {
  const source = registry.sources.find((item) => item.id === providerId && item.enabled !== false)
  if (!source) {
    return undefined
  }
  return registry.models.find(
    (model) => model.providerId === providerId && model.id === modelId && model.enabled !== false
  )
}

function findFirstEnabledSelection(registry: ProviderRegistry): ProviderModelRef | undefined {
  for (const source of registry.sources) {
    if (source.enabled === false) {
      continue
    }
    const model = registry.models.find(
      (item) => item.providerId === source.id && item.enabled !== false
    )
    if (model) {
      return { providerId: source.id, modelId: model.id }
    }
  }
  return undefined
}

function sameModelRef(left: ProviderModelRef, right: ProviderModelRef): boolean {
  return left.providerId === right.providerId && left.modelId === right.modelId
}

function modelRefKey(ref: ProviderModelRef): string {
  return `${ref.providerId}\u0000${ref.modelId}`
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

function sanitizeRegistry(registry: ProviderRegistry): ProviderRegistry {
  return {
    ...registry,
    sources: registry.sources.map((source) => {
      const { apiKey: _apiKey, envVar: _envVar, ...safeSource } = source
      return { ...safeSource }
    }),
    models: registry.models.map((model) => ({ ...model })),
    settings: {
      ...registry.settings,
      fallbackModelRefs: registry.settings.fallbackModelRefs.map((ref) => ({ ...ref })),
      titleModelRef: registry.settings.titleModelRef
        ? { ...registry.settings.titleModelRef }
        : undefined,
      embeddingModelRef: registry.settings.embeddingModelRef
        ? { ...registry.settings.embeddingModelRef }
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
  if (api === 'openai-codex-responses') {
    return 'openai-codex'
  }
  if (api === 'omniinfer') {
    return 'omniinfer'
  }
  if (api === 'ollama') {
    return 'ollama'
  }
  return 'openai-compatible'
}

function apiFromLegacyType(type?: ProviderType): ProviderApi {
  if (type === 'openai-codex') {
    return 'openai-codex-responses'
  }
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
      maxOutputTokens: current?.maxOutputTokens ?? remote.maxOutputTokens,
      supportsStreaming: current?.supportsStreaming ?? true,
      supportsTools: Boolean(current?.supportsTools || remote.supportsTools),
      supportsReasoning: Boolean(current?.supportsReasoning || remote.supportsReasoning),
      input: mergeModelInput(current?.input, remote.input),
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

function mergeModelInput(
  current: ProviderModelRecord['input'],
  remote: ProviderModelCandidate['input']
): ProviderModelRecord['input'] {
  const values = [...(current ?? []), ...(remote ?? [])]
  return values.length ? Array.from(new Set(values)) : ['text']
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
    omniInferModelsDir: provider.omniInferModelsDir ?? existing?.omniInferModelsDir,
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

  pruneProviderModelReferences(config, provider.id)
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
