import { EventEmitter } from 'node:events'
import { resolve } from 'node:path'
import type { Logger } from '@core/logging'
import type {
  OmniInferBackendDescriptor,
  OmniInferLoadedModel,
  OmniInferModelLoadOptions,
  OmniInferProcessSnapshot,
  OmniInferRuntimeSnapshot,
  OmniInferServerStatus,
} from '@shared/types/omniinfer'
import type { InstalledModelRegistry } from './installed-models'
import type { OmniInferProcessController } from './process-controller'
import {
  OmniInferControlException,
  type OmniInferRuntimeClient,
  type SelectModelPayload,
} from './runtime-client'

const STARTUP_POLL_INTERVAL_MS = 500
const STARTUP_POLL_TIMEOUT_MS = 30_000
const STEADY_POLL_INTERVAL_MS = 10_000
const UNHEALTHY_FAILURE_THRESHOLD = 3

export type OmniInferRuntimeChangeListener = (snapshot: OmniInferRuntimeSnapshot) => void

export interface OmniInferRuntimeServiceOptions {
  client: OmniInferRuntimeClient
  process: OmniInferProcessController
  installedModels: InstalledModelRegistry
  logger?: Logger
  now?: () => number
}

interface PendingLoad {
  path: string
  promise: Promise<void>
}

export class OmniInferRuntimeService {
  private readonly emitter = new EventEmitter()
  private readonly client: OmniInferRuntimeClient
  private readonly process: OmniInferProcessController
  private readonly installedModels: InstalledModelRegistry
  private readonly logger?: Logger
  private readonly now: () => number

  private pollTimer: NodeJS.Timeout | undefined
  private pollGeneration = 0
  private consecutiveFailures = 0
  private startupDeadline = 0
  private currentInterval = STEADY_POLL_INTERVAL_MS
  private processState: OmniInferProcessSnapshot
  private server: OmniInferServerStatus
  private loadedModel: OmniInferLoadedModel | null = null
  private thinking = false
  private backends: OmniInferBackendDescriptor[] = []
  private pendingLoad: PendingLoad | null = null
  private offChange?: () => void
  private offExit?: () => void

  constructor(options: OmniInferRuntimeServiceOptions) {
    this.client = options.client
    this.process = options.process
    this.installedModels = options.installedModels
    this.logger = options.logger
    this.now = options.now ?? Date.now
    this.processState = this.process.getState()
    const baseUrl = this.client.getBaseUrl()
    this.server = {
      online: false,
      baseUrl,
      host: parseHost(baseUrl),
      port: parsePort(baseUrl),
      lastCheckedAt: this.now(),
    }
    this.offChange = this.process.onStateChanged((snapshot) => {
      this.processState = snapshot
      if (snapshot.state === 'running') {
        this.beginStartupPolling()
      } else if (snapshot.state === 'crashed' || snapshot.state === 'stopped') {
        this.stopPolling()
        this.loadedModel = null
        this.server = { ...this.server, online: false, lastCheckedAt: this.now() }
      }
      this.emit()
    })
    this.offExit = this.process.onExit((snapshot) => {
      this.processState = snapshot
      this.stopPolling()
      this.loadedModel = null
      this.server = { ...this.server, online: false, lastCheckedAt: this.now() }
      this.emit()
    })
    this.installedModels.onChanged(() => {
      // No-op; the IPC layer reads installed-models snapshot separately. Future: enrich
      // `loadedModel.id` when the index gains/loses the current path.
      if (this.loadedModel) {
        const id = this.installedModels.resolveModelId(this.loadedModel.path)
        if (id && id !== this.loadedModel.id) {
          this.loadedModel = { ...this.loadedModel, id }
          this.emit()
        }
      }
    })
  }

  getSnapshot(): OmniInferRuntimeSnapshot {
    return {
      process: { ...this.processState },
      server: { ...this.server },
      loadedModel: this.loadedModel ? { ...this.loadedModel } : null,
      thinking: this.thinking,
      backends: this.backends.map((item) => ({ ...item })),
    }
  }

  onChanged(listener: OmniInferRuntimeChangeListener): () => void {
    this.emitter.on('changed', listener)
    return () => {
      this.emitter.off('changed', listener)
    }
  }

  async start(): Promise<OmniInferRuntimeSnapshot> {
    if (this.processState.state === 'not_bundled') {
      this.logger?.info('OmniInfer binary not bundled; skipping start.')
      return this.getSnapshot()
    }
    if (this.processState.state === 'running') {
      return this.getSnapshot()
    }
    try {
      this.processState = await this.process.start()
      this.beginStartupPolling()
    } catch (error) {
      this.logger?.error('Failed to start OmniInfer process.', { error })
      throw error
    }
    return this.getSnapshot()
  }

  async stop(): Promise<OmniInferRuntimeSnapshot> {
    this.stopPolling()
    try {
      this.processState = await this.process.stop({ shutdownTimeoutMs: 3_000 })
    } catch (error) {
      this.logger?.warn('OmniInfer stop encountered an error.', { error })
    }
    this.loadedModel = null
    this.server = { ...this.server, online: false, lastCheckedAt: this.now() }
    this.emit()
    return this.getSnapshot()
  }

  /**
   * Ensure that OmniInfer has loaded the model at `absolutePath`. Concurrent calls for the
   * same path collapse to one /omni/model/select request.
   */
  async ensureModelLoaded(
    absolutePath: string,
    options?: OmniInferModelLoadOptions,
    mmprojPath?: string
  ): Promise<void> {
    const normalized = resolve(absolutePath)
    if (this.loadedModel && samePath(this.loadedModel.path, normalized) && this.loadedModel.ready) {
      return
    }

    if (this.pendingLoad && samePath(this.pendingLoad.path, normalized)) {
      return this.pendingLoad.promise
    }

    const payload: SelectModelPayload = {
      model: normalized,
      mmproj: mmprojPath,
      ctxSize: options?.contextLength,
      launchArgs: options?.launchArgs,
      requestDefaults: options?.requestDefaults,
    }
    const promise = (async () => {
      try {
        await this.client.selectModel(payload)
        // Confirm via health
        await this.refreshHealthOnce()
      } finally {
        if (this.pendingLoad && this.pendingLoad.path === normalized) {
          this.pendingLoad = null
        }
      }
    })()
    this.pendingLoad = { path: normalized, promise }
    return promise
  }

  async selectModelByPath(
    absolutePath: string,
    options?: OmniInferModelLoadOptions,
    mmprojPath?: string
  ): Promise<OmniInferRuntimeSnapshot> {
    await this.ensureModelLoaded(absolutePath, options, mmprojPath)
    return this.getSnapshot()
  }

  async unloadModel(): Promise<OmniInferRuntimeSnapshot> {
    try {
      await this.client.unloadBackend()
    } catch (error) {
      this.logger?.warn('OmniInfer unload backend failed.', { error })
    }
    this.loadedModel = null
    await this.refreshHealthOnce()
    this.emit()
    return this.getSnapshot()
  }

  async setThinking(enabled: boolean): Promise<OmniInferRuntimeSnapshot> {
    await this.client.setThinking(enabled)
    this.thinking = enabled
    this.emit()
    return this.getSnapshot()
  }

  /** Initial sync of thinking + backend list right after the gateway becomes ready. */
  async syncControlPlane(): Promise<void> {
    try {
      const thinking = await this.client.getThinking()
      if (typeof thinking === 'boolean') {
        this.thinking = thinking
      }
    } catch (error) {
      this.logger?.debug?.('OmniInfer get-thinking failed.', { error })
    }
    try {
      this.backends = await this.client.listBackends()
    } catch (error) {
      this.logger?.debug?.('OmniInfer list-backends failed.', { error })
      this.backends = []
    }
    this.emit()
  }

  /** Convenience used by main.ts on quit. */
  async shutdown(): Promise<void> {
    this.stopPolling()
    try {
      await this.client.shutdown()
    } catch (error) {
      this.logger?.debug?.('OmniInfer shutdown control call failed.', { error })
    }
    try {
      this.processState = await this.process.stop({ shutdownTimeoutMs: 2_000 })
    } catch (error) {
      this.logger?.warn('OmniInfer process stop failed during shutdown.', { error })
    }
  }

  dispose(): void {
    this.stopPolling()
    this.offChange?.()
    this.offExit?.()
    this.emitter.removeAllListeners()
  }

  private beginStartupPolling(): void {
    this.stopPolling()
    this.consecutiveFailures = 0
    this.startupDeadline = this.now() + STARTUP_POLL_TIMEOUT_MS
    this.currentInterval = STARTUP_POLL_INTERVAL_MS
    this.scheduleNextPoll()
  }

  private scheduleNextPoll(): void {
    this.pollGeneration += 1
    const generation = this.pollGeneration
    this.pollTimer = setTimeout(() => {
      void this.pollHealth(generation)
    }, this.currentInterval)
  }

  private stopPolling(): void {
    if (this.pollTimer) {
      clearTimeout(this.pollTimer)
      this.pollTimer = undefined
    }
    this.pollGeneration += 1
  }

  private async pollHealth(generation: number): Promise<void> {
    if (generation !== this.pollGeneration) return
    await this.refreshHealthOnce()
    if (this.server.online) {
      if (this.currentInterval === STARTUP_POLL_INTERVAL_MS) {
        await this.syncControlPlane()
      }
      this.currentInterval = STEADY_POLL_INTERVAL_MS
      this.consecutiveFailures = 0
    } else {
      this.consecutiveFailures += 1
      if (this.processState.state === 'starting' && this.now() > this.startupDeadline) {
        this.transitionToUnhealthy()
      }
      if (
        this.processState.state === 'running' &&
        this.consecutiveFailures >= UNHEALTHY_FAILURE_THRESHOLD
      ) {
        this.transitionToUnhealthy()
      }
    }
    if (generation === this.pollGeneration) {
      this.scheduleNextPoll()
    }
  }

  private async refreshHealthOnce(): Promise<void> {
    const baseUrl = this.client.getBaseUrl()
    try {
      const health = await this.client.getHealth()
      this.server = {
        online: health.online,
        baseUrl,
        host: parseHost(baseUrl),
        port: parsePort(baseUrl),
        lastCheckedAt: this.now(),
      }
      const previousModelPath = this.loadedModel?.path
      if (health.loadedModel) {
        const id = this.installedModels.resolveModelId(health.loadedModel.path)
        if (!id) {
          // Auto-register path that wasn't seen via scan.
          const record = this.installedModels.registerManualPath(health.loadedModel.path)
          health.loadedModel.id = record.id
        } else {
          health.loadedModel.id = id
        }
        this.loadedModel = health.loadedModel
      } else {
        this.loadedModel = null
      }
      if (typeof health.thinking === 'boolean') {
        this.thinking = health.thinking
      }
      if (previousModelPath !== this.loadedModel?.path) {
        this.emit()
      } else {
        // Server status changed at minimum
        this.emit()
      }
    } catch (error) {
      this.server = {
        ...this.server,
        online: false,
        lastCheckedAt: this.now(),
      }
      if (!(error instanceof OmniInferControlException)) {
        this.logger?.debug?.('OmniInfer health request failed.', { error })
      }
      this.emit()
    }
  }

  private transitionToUnhealthy(): void {
    if (this.processState.state === 'unhealthy') return
    this.processState = {
      ...this.processState,
      previousState: this.processState.state,
      state: 'unhealthy',
      lastUpdatedAt: this.now(),
    }
    this.emit()
  }

  private emit(): void {
    this.emitter.emit('changed', this.getSnapshot())
  }
}

function samePath(a: string, b: string): boolean {
  return a.replace(/\\/g, '/').toLowerCase() === b.replace(/\\/g, '/').toLowerCase()
}

function parseHost(baseUrl: string): string {
  try {
    return new URL(baseUrl).hostname || '127.0.0.1'
  } catch {
    return '127.0.0.1'
  }
}

function parsePort(baseUrl: string): number {
  try {
    const parsed = new URL(baseUrl)
    if (parsed.port) return Number.parseInt(parsed.port, 10)
    return parsed.protocol === 'https:' ? 443 : 80
  } catch {
    return 19157
  }
}
