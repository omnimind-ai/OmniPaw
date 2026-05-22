import { type ProviderManager, ProviderSelectionError } from '@core/provider/manager'
import type { ChatSession } from '@shared/types/chat'
import type { ProviderConfig, ProviderModel } from '@shared/types/provider'

export async function resolveProviderAndModel(
  providers: ProviderManager,
  session: ChatSession,
  providerId?: string,
  modelId?: string
): Promise<{ provider: ProviderConfig; model: ProviderModel; fallbackReason?: string }> {
  if (providerId) {
    return resolveSelectedProviderAndModel(providers, providerId, modelId)
  }

  if (session.defaultProviderId) {
    return resolveSelectedProviderAndModel(
      providers,
      session.defaultProviderId,
      session.defaultModelId
    )
  }

  const resolved = await providers.resolveDefaultProvider()
  const provider = await providers.get(resolved.provider.id)
  if (!provider) {
    throw new ProviderSelectionError({
      code: 'not_found',
      message: `Provider is not enabled or does not exist: ${resolved.provider.id}.`,
      retryable: false,
    })
  }
  const model = provider.models.find(
    (item) => item.id === resolved.modelId && item.enabled !== false
  )
  if (!model) {
    throw new ProviderSelectionError({
      code: 'validation',
      message: `No enabled model is configured for provider ${provider.id}.`,
      retryable: false,
    })
  }

  return { provider, model, fallbackReason: resolved.fallbackReason }
}

export async function resolveSelectedProviderAndModel(
  providers: ProviderManager,
  providerId: string,
  modelId?: string
): Promise<{ provider: ProviderConfig; model: ProviderModel }> {
  const provider = await providers.get(providerId)
  if (!provider || provider.enabled === false) {
    throw new ProviderSelectionError({
      code: 'not_found',
      message: `Provider is not enabled or does not exist: ${providerId}.`,
      retryable: false,
    })
  }

  const model =
    provider.models.find((item) => item.id === modelId && item.enabled !== false) ??
    (modelId ? undefined : provider.models.find((item) => item.enabled !== false))
  if (!model) {
    throw new ProviderSelectionError({
      code: 'validation',
      message: modelId
        ? `Provider model is not enabled or does not exist: ${providerId}/${modelId}.`
        : `No enabled model is configured for provider ${provider.id}.`,
      retryable: false,
    })
  }

  return { provider, model }
}
