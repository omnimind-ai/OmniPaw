import type { ChatSessionRepo, ProviderRepo } from '@core/db/repos'
import type {
  ProviderCredentialRepository,
  ProviderModelRecord,
  ProviderModelRepository,
  ProviderRecord,
  ProviderRepository,
  SessionProviderOverrideRepository,
} from './manager'
import type { ProviderCredentialRecord } from './credentials'

export class DbProviderRepository implements ProviderRepository {
  constructor(private readonly repo: ProviderRepo) {}

  async list(): Promise<ProviderRecord[]> {
    return this.repo.list().map(toProviderRecord)
  }

  async get(id: string): Promise<ProviderRecord | undefined> {
    const provider = this.repo.get(id)
    return provider ? toProviderRecord(provider) : undefined
  }

  async save(provider: ProviderRecord): Promise<void> {
    this.repo.save({
      ...provider,
      api: provider.api ?? (provider.type === 'omniinfer' ? 'omniinfer' : provider.type === 'ollama' ? 'ollama' : 'openai-chat-completions'),
      models: provider.models?.map(toProviderModel) ?? [],
    })
  }

  async delete(id: string): Promise<void> {
    this.repo.delete(id)
  }
}

export class DbProviderModelRepository implements ProviderModelRepository {
  constructor(private readonly repo: ProviderRepo) {}

  async listByProvider(providerId: string): Promise<ProviderModelRecord[]> {
    return this.repo.listModels(providerId).map((model) => ({
      ...model,
      providerId: model.providerId ?? providerId,
      remoteId: model.remoteId,
      enabled: model.enabled !== false,
      input: model.input ?? ['text'],
      supportsStreaming: model.supportsStreaming !== false,
      supportsTools: model.supportsTools ?? false,
      manual: false,
    }))
  }

  async save(model: ProviderModelRecord): Promise<void> {
    this.repo.saveModel(toProviderModel(model))
  }
}

export class DbProviderCredentialRepository implements ProviderCredentialRepository {
  constructor(private readonly repo: ProviderRepo) {}

  async listByProvider(providerId: string): Promise<ProviderCredentialRecord[]> {
    return this.repo.listCredentials(providerId)
  }
}

export class DbSessionProviderOverrideRepository implements SessionProviderOverrideRepository {
  constructor(private readonly repo: ChatSessionRepo) {}

  async getProviderOverride(sessionId: string): Promise<{ providerId?: string; modelId?: string } | undefined> {
    const session = this.repo.get(sessionId)
    return session
      ? {
          providerId: session.defaultProviderId,
          modelId: session.defaultModelId,
        }
      : undefined
  }
}

function toProviderRecord(provider: import('@shared/types/provider').ProviderConfig): ProviderRecord {
  return {
    ...provider,
    models: provider.models?.map((model) => ({
      ...model,
      providerId: model.providerId ?? provider.id,
      remoteId: model.remoteId,
      enabled: model.enabled !== false,
      input: model.input ?? ['text'],
      supportsStreaming: model.supportsStreaming !== false,
      supportsTools: model.supportsTools ?? false,
    })),
  }
}

function toProviderModel(model: ProviderModelRecord): import('@shared/types/provider').ProviderModel {
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
