import type { Logger } from '@core/logging'
import type { ProviderManager } from '@core/provider/manager'
import type {
  OmniInferCatalogModel,
  OmniInferCatalogResponse,
  OmniInferDownloadAndActivateRequest,
  OmniInferInstallPhase,
  OmniInferInstallProgress,
  OmniInferLoadModelRequest,
  OmniInferOperationResult,
  OmniInferStatus,
} from '@shared/types/omniinfer'
import type { ProviderModelRef } from '@shared/types/provider'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { platform } from 'node:process'
import { ensureOmniInferRuntime, findInstalledRuntime } from './bootstrapper'
import { fetchOmniInferCatalog, platformFromNodePlatform } from './catalog'
import { downloadFile, fileExists } from './downloader'

const DEFAULT_BASE_URL = 'http://127.0.0.1:9000'
const PROVIDER_ID = 'omniinfer-local'
const PROVIDER_BASE_URL = `${DEFAULT_BASE_URL}/v1`

export interface OmniInferManagerOptions {
  dataRootPath: string
  providerManager: ProviderManager
  logger?: Logger
  fetchImpl?: typeof fetch
  runtimePath?: string
  onChanged?: (status: OmniInferStatus) => void
}

interface OmniInferStatePayload {
  backend?: unknown
  model?: unknown
  model_path?: unknown
  loaded_model?: unknown
  selected_backend?: unknown
}

export class OmniInferManager {
  private readonly dataRootPath: string
  private readonly providerManager: ProviderManager
  private readonly logger?: Logger
  private readonly fetchImpl: typeof fetch
  private readonly onChanged?: (status: OmniInferStatus) => void
  private readonly baseUrl = DEFAULT_BASE_URL
  private readonly modelDir: string
  private readonly installDir: string
  private runtimePath?: string
  private process?: ChildProcessWithoutNullStreams
  private state: OmniInferStatus
  private activeTask?: Promise<OmniInferOperationResult>
  private bootstrapTask?: Promise<string>

  constructor(options: OmniInferManagerOptions) {
    this.dataRootPath = join(options.dataRootPath, 'omniinfer')
    this.providerManager = options.providerManager
    this.logger = options.logger
    this.fetchImpl = options.fetchImpl ?? fetch
    this.onChanged = options.onChanged
    this.modelDir = join(this.dataRootPath, '.local', 'models')
    this.installDir = join(this.dataRootPath, 'runtime', 'OmniInfer')
    this.runtimePath =
      options.runtimePath ?? process.env.OPENOMNICLAW_OMNIINFER_PATH ?? devRuntimePath()
    this.state = {
      state: 'stopped',
      baseUrl: this.baseUrl,
      providerId: PROVIDER_ID,
      modelDir: this.modelDir,
      runtimePath: this.runtimePath,
      progress: idleProgress(),
      updatedAt: Date.now(),
    }
  }

  async status(): Promise<OmniInferStatus> {
    const healthy = await this.health()
    if (healthy) {
      await this.refreshRuntimeState().catch(() => undefined)
      return this.snapshot({ state: 'running' })
    }
    if (this.state.state === 'starting') {
      return this.snapshot()
    }
    const runtimePath = this.runtimePath ?? (await findInstalledRuntime(this.installDir))
    if (runtimePath && runtimePath !== this.runtimePath) {
      this.runtimePath = runtimePath
    }
    return this.snapshot({
      state: this.process ? 'error' : 'stopped',
      runtimePath: this.runtimePath,
    })
  }

  async catalog(): Promise<OmniInferCatalogResponse> {
    await mkdir(this.modelDir, { recursive: true })
    await this.ensureGateway()
    return fetchOmniInferCatalog({
      baseUrl: this.baseUrl,
      platform: platformFromNodePlatform(platform),
      modelDir: this.modelDir,
      fetchImpl: this.fetchImpl,
      fileExists,
    })
  }

  async downloadAndActivate(
    request: OmniInferDownloadAndActivateRequest
  ): Promise<OmniInferOperationResult> {
    if (this.activeTask) {
      return this.activeTask
    }

    this.activeTask = this.runDownloadAndActivate(request).finally(() => {
      this.activeTask = undefined
    })
    return this.activeTask
  }

  async loadModel(request: OmniInferLoadModelRequest): Promise<OmniInferOperationResult> {
    if (this.activeTask) {
      return this.activeTask
    }
    this.activeTask = this.runLoadModel(request).finally(() => {
      this.activeTask = undefined
    })
    return this.activeTask
  }

  async stop(): Promise<OmniInferStatus> {
    if (await this.health()) {
      await this.fetchJson('/omni/shutdown', { method: 'POST' }).catch(() => undefined)
    }
    this.process?.kill()
    this.process = undefined
    return this.snapshot({ state: 'stopped', progress: idleProgress() })
  }

  dispose(): void {
    this.process?.kill()
    this.process = undefined
  }

  private async runDownloadAndActivate(
    request: OmniInferDownloadAndActivateRequest
  ): Promise<OmniInferOperationResult> {
    try {
      this.setProgress('preparing', request.modelId, '准备本地模型')
      const catalog = await this.catalog()
      const model = catalog.models.find((item) => item.id === request.modelId)
      if (!model) {
        throw new Error(`OmniInfer model not found in catalog: ${request.modelId}`)
      }

      await this.downloadCatalogFile(
        model.downloadUrl,
        model.localPath ?? join(this.modelDir, model.filename),
        model.sizeBytes,
        model.id
      )
      if (model.visionDownloadUrl && model.visionLocalPath) {
        await this.downloadCatalogFile(
          model.visionDownloadUrl,
          model.visionLocalPath,
          model.visionSizeBytes,
          model.id
        )
      }

      return await this.runLoadModel(
        {
          modelPath: model.localPath ?? join(this.modelDir, model.filename),
          modelId: model.id,
          backend: model.backend,
          setDefault: request.setDefault !== false,
        },
        model
      )
    } catch (error) {
      return this.failure(error, request.modelId)
    }
  }

  private async runLoadModel(
    request: OmniInferLoadModelRequest,
    catalogModel?: OmniInferCatalogModel
  ): Promise<OmniInferOperationResult> {
    try {
      this.setProgress('starting', request.modelId, '启动 OmniInfer')
      await this.ensureGateway()
      if (request.backend) {
        this.setProgress('selecting-backend', request.modelId, '选择推理后端')
        await this.fetchJson('/omni/backend/select', {
          method: 'POST',
          body: JSON.stringify({ backend: request.backend }),
        })
      }

      this.setProgress('loading-model', request.modelId, '加载模型')
      await this.fetchJson('/omni/model/select', {
        method: 'POST',
        body: JSON.stringify({ model_path: request.modelPath, model: request.modelPath }),
      })
      const modelRef = await this.syncProviderModel({
        modelId: request.modelId ?? modelIdFromPath(request.modelPath),
        modelPath: request.modelPath,
        catalogModel,
        setDefault: request.setDefault !== false,
      })
      await this.refreshRuntimeState().catch(() => undefined)
      this.setProgress('completed', request.modelId, '模型已启用')
      return {
        ok: true,
        status: this.snapshot({
          state: 'running',
          activeModelId: request.modelId,
          activeModelPath: request.modelPath,
          providerModelRef: modelRef,
        }),
        model: catalogModel,
        providerModelRef: modelRef,
      }
    } catch (error) {
      return this.failure(error, request.modelId)
    }
  }

  private async downloadCatalogFile(
    url: string,
    targetPath: string,
    expectedBytes: number | undefined,
    modelId: string
  ): Promise<void> {
    this.setProgress('downloading', modelId, '下载模型')
    await downloadFile({
      url,
      targetPath,
      expectedBytes,
      fetchImpl: this.fetchImpl,
      onProgress: ({ bytesReceived, totalBytes }) => {
        this.setProgress('downloading', modelId, '下载模型', bytesReceived, totalBytes)
      },
    })
  }

  private async syncProviderModel(input: {
    modelId: string
    modelPath: string
    catalogModel?: OmniInferCatalogModel
    setDefault: boolean
  }): Promise<ProviderModelRef> {
    this.setProgress('syncing-provider', input.modelId, '写入 Provider 配置')
    await this.providerManager.upsertSource({
      source: {
        id: PROVIDER_ID,
        name: 'OmniInfer Local',
        type: 'omniinfer',
        api: 'omniinfer',
        baseUrl: PROVIDER_BASE_URL,
        enabled: true,
        capabilities: {
          listModels: true,
          streaming: true,
          tools: false,
          vision: input.catalogModel?.input.includes('image') ?? false,
        },
        compat: {
          maxTokensField: 'max_tokens',
          supportsSystemRole: true,
          supportsJsonMode: false,
          reasoningFormat: 'none',
        },
      },
    })
    await this.providerManager.upsertModel({
      providerId: PROVIDER_ID,
      model: {
        id: input.modelId,
        name: input.catalogModel?.name ?? input.modelId,
        remoteId: input.modelPath,
        enabled: true,
        manual: false,
        input: input.catalogModel?.input ?? ['text'],
        supportsStreaming: true,
        supportsTools: false,
        supportsReasoning: false,
        contextWindow: input.catalogModel?.contextWindow,
      },
    })
    const ref = { providerId: PROVIDER_ID, modelId: input.modelId }
    if (input.setDefault) {
      await this.providerManager.setDefaultModel(ref)
    }
    return ref
  }

  private async ensureGateway(): Promise<void> {
    if (await this.health()) {
      this.snapshot({ state: 'running' })
      return
    }
    if (!this.runtimePath) {
      this.runtimePath = await this.bootstrapRuntime()
      if (await this.health()) {
        this.snapshot({ state: 'running', runtimePath: this.runtimePath })
        return
      }
    }
    await mkdir(this.dataRootPath, { recursive: true })
    this.snapshot({ state: 'starting', runtimePath: this.runtimePath })
    const command = buildServeCommand(this.runtimePath)
    this.process = spawn(command.command, command.args, {
      cwd: this.dataRootPath,
      env: {
        ...process.env,
        OMNIINFER_SERVE_DIRECT: '1',
        OMNIINFER_HOST: '127.0.0.1',
        OMNIINFER_PORT: '9000',
        OMNIINFER_MODEL_DIR: this.modelDir,
      },
      stdio: 'pipe',
    })
    this.process.stdout.on('data', (chunk: Buffer) => {
      this.logger?.debug('OmniInfer stdout.', { chunk: chunk.toString('utf8').trim() })
    })
    this.process.stderr.on('data', (chunk: Buffer) => {
      this.logger?.debug('OmniInfer stderr.', { chunk: chunk.toString('utf8').trim() })
    })
    this.process.once('exit', (code, signal) => {
      this.logger?.warn('OmniInfer process exited.', { code, signal })
      this.process = undefined
      this.snapshot({ state: 'stopped' })
    })
    await this.waitForHealth()
  }

  private async bootstrapRuntime(): Promise<string> {
    if (!this.bootstrapTask) {
      this.snapshot({ state: 'starting' })
      this.setProgress('installing-runtime', undefined, '安装 OmniInfer')
      this.bootstrapTask = ensureOmniInferRuntime({
        installDir: this.installDir,
        fetchImpl: this.fetchImpl,
        logger: this.logger,
      })
        .then((result) => {
          this.logger?.info('OmniInfer runtime is ready.', {
            runtimePath: result.runtimePath,
            installed: result.installed,
          })
          return result.runtimePath
        })
        .finally(() => {
          this.bootstrapTask = undefined
        })
    }
    return this.bootstrapTask
  }

  private async waitForHealth(): Promise<void> {
    const startedAt = Date.now()
    while (Date.now() - startedAt < 30_000) {
      if (await this.health()) {
        this.snapshot({ state: 'running', pid: this.process?.pid })
        return
      }
      await delay(500)
    }
    throw new Error('OmniInfer did not become healthy within 30 seconds.')
  }

  private async health(): Promise<boolean> {
    try {
      const response = await this.fetchImpl(`${this.baseUrl}/health`, { method: 'GET' })
      return response.ok
    } catch {
      return false
    }
  }

  private async refreshRuntimeState(): Promise<void> {
    const payload = (await this.fetchJson('/omni/state')) as OmniInferStatePayload
    const modelPath =
      stringValue(payload.model_path) ||
      stringValue(payload.loaded_model) ||
      stringValue(payload.model)
    this.snapshot({
      backend: parseBackend(payload.selected_backend ?? payload.backend),
      activeModelPath: modelPath || this.state.activeModelPath,
    })
  }

  private async fetchJson(path: string, init?: RequestInit): Promise<unknown> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        Accept: 'application/json',
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...init?.headers,
      },
    })
    if (!response.ok) {
      const text = await response.text().catch(() => '')
      throw new Error(`OmniInfer request ${path} failed with HTTP ${response.status}: ${text}`)
    }
    const text = await response.text()
    return text ? JSON.parse(text) : undefined
  }

  private setProgress(
    phase: OmniInferInstallPhase,
    modelId?: string,
    label?: string,
    bytesReceived?: number,
    totalBytes?: number
  ): void {
    const percent =
      bytesReceived !== undefined && totalBytes
        ? Math.min(100, Math.round((bytesReceived / totalBytes) * 100))
        : undefined
    this.snapshot({
      progress: {
        phase,
        modelId,
        label,
        bytesReceived,
        totalBytes,
        percent,
        updatedAt: Date.now(),
      },
    })
  }

  private failure(error: unknown, modelId?: string): OmniInferOperationResult {
    const message = error instanceof Error ? error.message : String(error)
    this.logger?.warn('OmniInfer operation failed.', { modelId, error: message })
    const status = this.snapshot({
      state: this.process ? 'error' : 'unavailable',
      lastError: message,
      progress: {
        phase: 'failed',
        modelId,
        label: '操作失败',
        error: message,
        updatedAt: Date.now(),
      },
    })
    return {
      ok: false,
      status,
      error: {
        code: 'omniinfer_operation_failed',
        message,
        recoverable: true,
      },
    }
  }

  private snapshot(patch: Partial<OmniInferStatus> = {}): OmniInferStatus {
    this.state = {
      ...this.state,
      ...patch,
      progress: patch.progress ?? this.state.progress,
      updatedAt: Date.now(),
    }
    const next = cloneStatus(this.state)
    this.onChanged?.(next)
    return next
  }
}

function idleProgress(): OmniInferInstallProgress {
  return { phase: 'idle', updatedAt: Date.now() }
}

function cloneStatus(status: OmniInferStatus): OmniInferStatus {
  return {
    ...status,
    backend: status.backend ? { ...status.backend } : undefined,
    providerModelRef: status.providerModelRef ? { ...status.providerModelRef } : undefined,
    progress: { ...status.progress },
  }
}

function parseBackend(value: unknown): OmniInferStatus['backend'] {
  if (typeof value === 'string') {
    return { id: value, name: value, selected: true }
  }
  if (!isRecord(value)) {
    return undefined
  }
  const id = stringValue(value.id) || stringValue(value.name)
  return id
    ? {
        id,
        name: stringValue(value.name) || id,
        installed: booleanValue(value.installed),
        compatible: booleanValue(value.compatible),
        selected: true,
        path: stringValue(value.path),
      }
    : undefined
}

function modelIdFromPath(path: string): string {
  return path
    .split(/[\\/]/)
    .pop()
    ?.replace(/\.gguf$/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'omniinfer-model'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function devRuntimePath(): string | undefined {
  const sibling = join(process.cwd(), '..', 'OmniInfer', 'omniinfer.py')
  return existsSync(sibling) ? sibling : undefined
}

function buildServeCommand(runtimePath: string): { command: string; args: string[] } {
  const serveArgs = ['serve', '--host', '127.0.0.1', '--port', '9000', '--window-mode', 'hidden']
  if (extname(runtimePath).toLowerCase() === '.py') {
    const python =
      process.env.OPENOMNICLAW_OMNIINFER_PYTHON ?? (platform === 'win32' ? 'python' : 'python3')
    return { command: python, args: [runtimePath, ...serveArgs] }
  }
  return { command: runtimePath, args: serveArgs }
}
