import type { InstalledModelRegistry } from '@core/omniinfer/installed-models'
import { OmniInferControlException } from '@core/omniinfer/runtime-client'
import type { OmniInferRuntimeService } from '@core/omniinfer/runtime-service'
import {
  type ChatCompletionChunk,
  type ChatCompletionRequest,
  ProviderError,
} from '../base-provider'
import { OpenAICompatibleProvider, type OpenAICompatibleProviderOptions } from './openai'

export interface OmniInferProviderOptions extends OpenAICompatibleProviderOptions {
  runtimeService: OmniInferRuntimeService
  installedModels: InstalledModelRegistry
}

export class OmniInferProvider extends OpenAICompatibleProvider {
  private readonly runtimeService: OmniInferRuntimeService
  private readonly installedModels: InstalledModelRegistry

  constructor(options: OmniInferProviderOptions) {
    super(options)
    this.runtimeService = options.runtimeService
    this.installedModels = options.installedModels
  }

  override async *streamChat(request: ChatCompletionRequest): AsyncIterable<ChatCompletionChunk> {
    const absolutePath = this.installedModels.resolveModelPath(request.modelId) ?? request.modelId
    const record = this.installedModels
      .list()
      .find(
        (entry) =>
          entry.id === request.modelId || normalizePath(entry.path) === normalizePath(absolutePath)
      )

    try {
      await this.runtimeService.ensureModelLoaded(
        absolutePath,
        record?.contextLength !== undefined ? { contextLength: record.contextLength } : undefined,
        record?.mmprojPath
      )
    } catch (error) {
      throw mapControlError(error)
    }

    yield* super.streamChat({
      ...request,
      modelId: absolutePath,
    })
  }
}

function mapControlError(error: unknown): ProviderError {
  if (error instanceof OmniInferControlException) {
    if (error.code === 'MODEL_NOT_READY' || error.code === 'VALIDATION_ERROR') {
      return new ProviderError(
        {
          code: 'provider_bad_request',
          message: error.message,
          retryable: false,
          providerStatus: error.status,
        },
        error
      )
    }
    if (error.code === 'GATEWAY_UNREACHABLE' || error.code === 'TIMEOUT') {
      return new ProviderError(
        {
          code: 'network',
          message: error.message,
          retryable: true,
          providerStatus: error.status,
        },
        error
      )
    }
  }
  const message = error instanceof Error ? error.message : 'OmniInfer pre-flight failed.'
  return new ProviderError(
    {
      code: 'provider_bad_request',
      message,
      retryable: false,
    },
    error instanceof Error ? error : undefined
  )
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, '/').toLowerCase()
}
