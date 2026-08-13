import type { ProviderManager, ProviderModelRecord, ProviderRecord } from '@core/provider/manager'
import type { ObservationModelChain, ObservationRun } from '@shared/types/observation'
import type { ProviderModelRef } from '@shared/types/provider'
import type { DesktopObservationSettings } from '@shared/types/settings'
import { createObservationError } from './errors'

export interface ResolvedObservationModel {
  provider: ProviderRecord
  model: ProviderModelRecord
}

export interface ResolvedObservationChain {
  chain: ObservationModelChain
  vision: ResolvedObservationModel
  reaction?: ResolvedObservationModel
}

type ObservationModelOverrides = Pick<ObservationRun, 'visionModelRef' | 'reactionModelRef'>

export class ObservationModelChainResolver {
  constructor(
    private readonly providers: ProviderManager,
    private readonly settings: () => DesktopObservationSettings
  ) {}

  async resolve(overrides: ObservationModelOverrides = {}): Promise<ResolvedObservationChain> {
    const registry = this.providers.loadRegistry().registry
    const settings = registry.settings
    const visionRef = overrides.visionModelRef ?? settings.observationVisionModelRef
    const reactionRef = overrides.reactionModelRef ?? settings.observationReactionModelRef

    const vision = visionRef ? await this.resolveEnabledModel(visionRef) : undefined
    const reaction = reactionRef ? await this.resolveEnabledModel(reactionRef) : undefined

    if (vision && !modelSupports(vision.model, 'image')) {
      throw createObservationError('model_capability', '视觉观察模型需要支持图片输入。', true)
    }
    if (reaction && !modelSupports(reaction.model, 'text')) {
      throw createObservationError(
        'model_capability',
        'Observation reaction 模型需要支持文本输入。',
        true
      )
    }
    if (vision && reaction) {
      return toChain(vision, reaction, 'split')
    }
    if (vision) {
      return toChain(vision, undefined, 'single_multimodal')
    }
    if (reaction?.model && modelSupports(reaction.model, 'image')) {
      return toChain(reaction, undefined, 'single_multimodal')
    }

    const fallbackVision = await this.findVisionFallback()
    if (!fallbackVision) {
      throw createObservationError('no_vision_model', '需要配置支持图片输入的视觉模型。', true)
    }
    return reaction
      ? toChain(fallbackVision, reaction, 'split')
      : toChain(fallbackVision, undefined, 'single_multimodal')
  }

  async assertPolicyBeforeCapture(overrides: ObservationModelOverrides = {}): Promise<void> {
    const settings = this.settings()
    const resolved = await this.resolve(overrides)
    const models = [resolved.vision, resolved.reaction].filter(
      (model): model is ResolvedObservationModel => Boolean(model)
    )
    const external = models.some((item) => isExternalProvider(item.provider))
    if (!settings.allowRemoteProviders && external) {
      throw createObservationError(
        'privacy_policy',
        '当前主动视觉策略禁止使用外部 Provider。',
        true
      )
    }
    const checkedProviderIds = new Set<string>()
    for (const model of models) {
      if (checkedProviderIds.has(model.provider.id)) continue
      checkedProviderIds.add(model.provider.id)
      try {
        await this.providers.createProviderClient(model.provider.id)
      } catch (error) {
        throw createObservationError(
          'provider_failed',
          error instanceof Error
            ? error.message
            : `观察模型 Provider 当前不可用：${model.provider.name}`,
          true
        )
      }
    }
  }

  private async findVisionFallback(): Promise<ResolvedObservationModel | undefined> {
    const registry = this.providers.loadRegistry().registry
    const candidates: ProviderModelRef[] = []
    if (registry.settings.defaultProviderId && registry.settings.defaultModelId) {
      candidates.push({
        providerId: registry.settings.defaultProviderId,
        modelId: registry.settings.defaultModelId,
      })
    }
    candidates.push(...registry.settings.fallbackModelRefs)
    for (const source of registry.sources) {
      for (const model of registry.models.filter((item) => item.providerId === source.id)) {
        candidates.push({ providerId: source.id, modelId: model.id })
      }
    }
    const seen = new Set<string>()
    for (const ref of candidates) {
      const key = `${ref.providerId}:${ref.modelId}`
      if (seen.has(key)) continue
      seen.add(key)
      const resolved = await this.resolveEnabledModel(ref).catch(() => undefined)
      if (resolved && modelSupports(resolved.model, 'image')) {
        return resolved
      }
    }
    return undefined
  }

  private async resolveEnabledModel(ref: ProviderModelRef): Promise<ResolvedObservationModel> {
    const provider = await this.providers.get(ref.providerId)
    const model = provider?.models.find((item) => item.id === ref.modelId && item.enabled !== false)
    if (!provider || provider.enabled === false || !model) {
      throw createObservationError(
        'model_capability',
        `观察模型不可用：${ref.providerId}/${ref.modelId}`,
        true
      )
    }
    return {
      provider: provider as ProviderRecord,
      model: model as ProviderModelRecord,
    }
  }
}

function toChain(
  vision: ResolvedObservationModel,
  reaction: ResolvedObservationModel | undefined,
  mode: ObservationModelChain['mode']
): ResolvedObservationChain {
  const chain: ObservationModelChain = {
    visionModelRef: { providerId: vision.provider.id, modelId: vision.model.id },
    reactionModelRef: reaction
      ? { providerId: reaction.provider.id, modelId: reaction.model.id }
      : undefined,
    mode,
  }
  return { chain, vision, reaction }
}

function modelSupports(model: ProviderModelRecord, input: 'text' | 'image'): boolean {
  const inputs = model.input?.length ? model.input : ['text']
  return inputs.includes(input)
}

function isExternalProvider(provider: ProviderRecord): boolean {
  const baseUrl = provider.baseUrl || ''
  if (!baseUrl) return false
  try {
    const host = new URL(baseUrl).hostname.toLowerCase()
    return host !== 'localhost' && host !== '127.0.0.1' && host !== '::1'
  } catch {
    return true
  }
}
