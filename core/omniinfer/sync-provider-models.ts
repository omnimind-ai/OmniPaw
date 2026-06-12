import type { Logger } from '@core/logging'
import type { ProviderManager, ProviderModelRecord } from '@core/provider/manager'
import type { InstalledModelRecord } from '@shared/types/omniinfer'
import type { InstalledModelRegistry } from './installed-models'

const OMNIINFER_PROVIDER_ID = 'omniinfer-local'

export interface SyncOmniInferProviderModelsOptions {
  providers: ProviderManager
  installedModels: InstalledModelRegistry
  providerId?: string
  logger?: Logger
}

/**
 * Mirror the installed-models index into the `omniinfer-local` (or specified) provider's model
 * list. Preserves user-overridden fields (`enabled`, `displayName`, `compat`).
 */
export async function syncOmniInferProviderModels(
  options: SyncOmniInferProviderModelsOptions
): Promise<void> {
  const providerId = options.providerId ?? OMNIINFER_PROVIDER_ID
  const provider = await options.providers.get(providerId)
  if (!provider) {
    options.logger?.debug?.('Skipping OmniInfer model sync; provider not registered.', {
      providerId,
    })
    return
  }

  const installed = options.installedModels.list().filter((record) => !record.missing)
  const existingModels = await options.providers.listModels(providerId)
  const existingById = new Map(existingModels.map((model) => [model.id, model]))
  const nextModels: ProviderModelRecord[] = installed.map((record) =>
    mergeRecord(providerId, record, existingById.get(record.id))
  )

  // Preserve manual models that aren't yet covered by index (rare; defensive).
  for (const model of existingModels) {
    if (!nextModels.some((next) => next.id === model.id)) {
      // If a model was manually added through the provider UI and isn't installed, keep it.
      if (model.manual) {
        nextModels.push(model)
      }
    }
  }

  await options.providers.save({
    id: provider.id,
    name: provider.name,
    type: provider.type,
    api: provider.api,
    baseUrl: provider.baseUrl,
    enabled: provider.enabled,
    credentialRef: provider.credentialRef,
    authHeader: provider.authHeader,
    headers: provider.headers,
    extraBody: provider.extraBody,
    defaultModelId: provider.defaultModelId ?? nextModels.find((m) => m.enabled)?.id,
    capabilities: provider.capabilities,
    models: nextModels,
    updatedAt: Date.now(),
  })

  options.logger?.debug?.('OmniInfer provider models synchronized.', {
    providerId,
    count: nextModels.length,
  })
}

function mergeRecord(
  providerId: string,
  record: InstalledModelRecord,
  existing: ProviderModelRecord | undefined
): ProviderModelRecord {
  const input: ProviderModelRecord['input'] = record.supportsVision ? ['text', 'image'] : ['text']
  return {
    id: record.id,
    providerId,
    name: existing?.name ?? record.displayName ?? record.name,
    remoteId: record.path,
    enabled: existing?.enabled ?? true,
    manual: existing?.manual,
    input: existing?.input ?? input,
    supportsStreaming: existing?.supportsStreaming ?? true,
    supportsTools: existing?.supportsTools ?? false,
    supportsReasoning: existing?.supportsReasoning ?? record.supportsThinking ?? false,
    contextWindow: existing?.contextWindow ?? record.contextLength,
    maxOutputTokens: existing?.maxOutputTokens,
    compat: existing?.compat,
    createdAt: existing?.createdAt ?? Date.now(),
    updatedAt: Date.now(),
  }
}
