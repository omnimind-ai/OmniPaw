import type {
  OmniInferBackendDescriptor,
  OmniInferControlError,
  OmniInferControlErrorCode,
  OmniInferLoadedModel,
  OmniInferModelLoadOptions,
} from '@shared/types/omniinfer'

export const OMNIINFER_DEFAULT_BASE_URL = 'http://127.0.0.1:19157'

export interface OmniInferHealth {
  online: boolean
  loadedModel: OmniInferLoadedModel | null
  backend?: string
  backendReady: boolean
  thinking?: boolean
}

export interface SelectModelPayload {
  model: string
  mmproj?: string
  ctxSize?: number
  launchArgs?: string[]
  requestDefaults?: OmniInferModelLoadOptions['requestDefaults']
}

export interface OmniInferRuntimeClientOptions {
  baseUrl?: string
  fetch?: typeof fetch
  defaultTimeoutMs?: number
}

const DEFAULT_TIMEOUT_MS = 4000

export class OmniInferControlException extends Error {
  readonly code: OmniInferControlErrorCode
  readonly status?: number
  readonly path?: string

  constructor(error: OmniInferControlError) {
    super(error.message)
    this.name = 'OmniInferControlException'
    this.code = error.code
    this.status = error.status
    this.path = error.path
  }

  toJSON(): OmniInferControlError {
    return {
      code: this.code,
      message: this.message,
      status: this.status,
      path: this.path,
    }
  }
}

export class OmniInferRuntimeClient {
  private baseUrl: string
  private readonly fetchImpl: typeof fetch
  private readonly defaultTimeoutMs: number

  constructor(options: OmniInferRuntimeClientOptions = {}) {
    this.baseUrl = normalizeBaseUrl(options.baseUrl)
    this.fetchImpl = options.fetch ?? fetch
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS
  }

  setBaseUrl(url: string): void {
    this.baseUrl = normalizeBaseUrl(url)
  }

  getBaseUrl(): string {
    return this.baseUrl
  }

  async getHealth(): Promise<OmniInferHealth> {
    const raw = await this.requestJson<HealthResponseShape>('/health')
    const omni = raw?.omni ?? {}
    const modelPath = typeof omni.model === 'string' ? omni.model.trim() : ''
    return {
      online: raw?.status === 'ok',
      backend: typeof omni.backend === 'string' ? omni.backend : undefined,
      backendReady: omni.backend_ready === true,
      thinking: omni.thinking === true || omni.thinking === false ? omni.thinking : undefined,
      loadedModel: modelPath
        ? {
            path: modelPath,
            backend: typeof omni.backend === 'string' ? omni.backend : undefined,
            ctxSize: numberOrUndefined(omni.ctx_size),
            runtimeMode: typeof omni.runtime_mode === 'string' ? omni.runtime_mode : undefined,
            backendPort: numberOrUndefined(omni.backend_port),
            ready: omni.backend_ready === true,
          }
        : null,
    }
  }

  async getState(): Promise<unknown> {
    return this.requestJson<unknown>('/omni/state')
  }

  async listBackends(): Promise<OmniInferBackendDescriptor[]> {
    const raw = await this.requestJson<{ data?: Array<{ id?: unknown; selected?: unknown }> }>(
      '/omni/backends'
    )
    const list = Array.isArray(raw?.data) ? raw.data : []
    return list
      .map((item) => ({
        id: typeof item.id === 'string' ? item.id : '',
        selected: item.selected === true,
      }))
      .filter((item) => item.id.length > 0)
  }

  async getSupportedModelsBest(system: 'windows' | 'mac'): Promise<unknown> {
    const params = new URLSearchParams({ system })
    return this.requestJson<unknown>(`/omni/supported-models/best?${params.toString()}`)
  }

  async selectModel(payload: SelectModelPayload): Promise<void> {
    const body: Record<string, unknown> = { model: payload.model }
    if (payload.mmproj) {
      body.mmproj = payload.mmproj
    }
    if (typeof payload.ctxSize === 'number') {
      body.ctx_size = payload.ctxSize
    }
    if (payload.launchArgs && payload.launchArgs.length > 0) {
      body.launch_args = payload.launchArgs
    }
    if (payload.requestDefaults) {
      const defaults: Record<string, number> = {}
      const { maxTokens, temperature, topP, topK, repeatPenalty } = payload.requestDefaults
      if (typeof maxTokens === 'number') defaults.max_tokens = maxTokens
      if (typeof temperature === 'number') defaults.temperature = temperature
      if (typeof topP === 'number') defaults.top_p = topP
      if (typeof topK === 'number') defaults.top_k = topK
      if (typeof repeatPenalty === 'number') defaults.repeat_penalty = repeatPenalty
      if (Object.keys(defaults).length > 0) {
        body.request_defaults = defaults
      }
    }
    await this.requestJson('/omni/model/select', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  }

  async unloadBackend(): Promise<void> {
    await this.requestJson('/omni/backend/stop', {
      method: 'POST',
      body: '{}',
    })
  }

  async shutdown(): Promise<void> {
    try {
      await this.requestJson('/omni/shutdown', {
        method: 'POST',
        body: '{}',
      })
    } catch (error) {
      if (error instanceof OmniInferControlException && error.code === 'GATEWAY_UNREACHABLE') {
        return
      }
      throw error
    }
  }

  async getThinking(): Promise<boolean | undefined> {
    const raw = await this.requestJson<{ enabled?: unknown }>('/omni/thinking')
    return typeof raw?.enabled === 'boolean' ? raw.enabled : undefined
  }

  async setThinking(enabled: boolean): Promise<void> {
    await this.requestJson('/omni/thinking/select', {
      method: 'POST',
      body: JSON.stringify({ enabled }),
    })
  }

  private async requestJson<T>(path: string, init?: RequestInit, timeoutMs?: number): Promise<T> {
    const url = this.url(path)
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs ?? this.defaultTimeoutMs)
    let response: Response
    try {
      const headers = new Headers(init?.headers || {})
      if (init?.body && !headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json')
      }
      response = await this.fetchImpl(url, {
        ...init,
        headers,
        signal: controller.signal,
      })
    } catch (error) {
      if (
        (error instanceof DOMException && error.name === 'AbortError') ||
        (typeof error === 'object' &&
          error !== null &&
          (error as { name?: string }).name === 'AbortError')
      ) {
        throw new OmniInferControlException({
          code: 'TIMEOUT',
          message: `OmniInfer request timed out: ${path}`,
          path,
        })
      }
      throw new OmniInferControlException({
        code: 'GATEWAY_UNREACHABLE',
        message: error instanceof Error ? error.message : 'OmniInfer gateway is not reachable.',
        path,
      })
    } finally {
      clearTimeout(timer)
    }

    const raw = await response.text()
    if (!response.ok) {
      const code: OmniInferControlErrorCode =
        response.status === 409
          ? 'MODEL_NOT_READY'
          : response.status >= 500
            ? 'GATEWAY_UNREACHABLE'
            : 'VALIDATION_ERROR'
      throw new OmniInferControlException({
        code,
        message: parseErrorMessage(raw) ?? `OmniInfer ${response.status} ${path}`,
        status: response.status,
        path,
      })
    }

    if (!raw.trim()) {
      return {} as T
    }

    try {
      return JSON.parse(raw) as T
    } catch {
      throw new OmniInferControlException({
        code: 'INTERNAL_ERROR',
        message: 'OmniInfer returned malformed JSON.',
        status: response.status,
        path,
      })
    }
  }

  private url(path: string): string {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`
    return `${this.baseUrl}${normalizedPath}`
  }
}

interface HealthResponseShape {
  status?: unknown
  omni?: {
    backend?: unknown
    model?: unknown
    backend_ready?: unknown
    ctx_size?: unknown
    runtime_mode?: unknown
    backend_port?: unknown
    thinking?: unknown
  }
}

function normalizeBaseUrl(raw: string | undefined): string {
  const trimmed = (raw ?? OMNIINFER_DEFAULT_BASE_URL).trim().replace(/\/+$/, '')
  if (!trimmed) {
    return OMNIINFER_DEFAULT_BASE_URL
  }
  if (trimmed.toLowerCase().endsWith('/v1')) {
    return trimmed.slice(0, -3).replace(/\/+$/, '') || OMNIINFER_DEFAULT_BASE_URL
  }
  return trimmed
}

function numberOrUndefined(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : undefined
}

function parseErrorMessage(body: string): string | null {
  const trimmed = body.trim()
  if (!trimmed) return null
  try {
    const json = JSON.parse(trimmed) as {
      message?: unknown
      error?: { message?: unknown } | unknown
    }
    if (typeof json.message === 'string' && json.message.trim()) {
      return json.message.trim()
    }
    if (json.error && typeof json.error === 'object') {
      const m = (json.error as { message?: unknown }).message
      if (typeof m === 'string' && m.trim()) return m.trim()
    }
  } catch {
    return trimmed
  }
  return null
}
