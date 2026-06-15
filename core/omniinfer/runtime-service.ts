import { EventEmitter } from 'node:events'
import { isAbsolute, resolve } from 'node:path'
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

type HealthProbeResult = 'online' | 'offline' | 'stale'

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
  private healthProbeGeneration = 0

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
        this.loadedModel = null
        this.server = { ...this.server, online: false, lastCheckedAt: this.now() }
        this.switchToSteadyPolling()
      }
      this.emit()
    })
    this.offExit = this.process.onExit((snapshot) => {
      this.processState = snapshot
      this.loadedModel = null
      this.server = { ...this.server, online: false, lastCheckedAt: this.now() }
      this.switchToSteadyPolling()
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

    // Always probe the gateway at steady cadence so externally-managed instances are detected
    // even when this controller has no binary to spawn.
    this.switchToSteadyPolling()
  }

  getSnapshot(): OmniInferRuntimeSnapshot {
    return {
      process: { ...this.processState },
      server: { ...this.server },
      loadedModel: this.loadedModel ? { ...this.loadedModel } : null,
      thinking: this.thinking,
      backends: this.backends.map((item) => ({ ...item })),
      externallyManaged:
        this.server.online &&
        this.processState.state !== 'running' &&
        this.processState.state !== 'starting' &&
        this.processState.state !== 'unhealthy',
    }
  }

  onChanged(listener: OmniInferRuntimeChangeListener): () => void {
    this.emitter.on('changed', listener)
    return () => {
      this.emitter.off('changed', listener)
    }
  }

  /**
   * Repoint the installed-models registry at a different directory and trigger a scan. Used
   * when the user pins an externally-managed OmniInfer's models directory (e.g.
   * `D:\omniinfer\OmniInfer\.local\models\`) from the provider settings UI. No-op when the
   * directory is unchanged or empty.
   */
  setModelsDir(dir: string): void {
    const trimmed = dir.trim()
    if (!trimmed) return
    const previous = this.installedModels.getModelsDir()
    if (samePath(previous, trimmed)) return
    this.installedModels.setModelsDir(trimmed)
    this.process.setModelsDir?.(trimmed)
    this.processState = this.process.getState()
    this.logger?.info('OmniInfer models directory updated.', { from: previous, to: trimmed })
    void this.installedModels.scan().catch((error) => {
      this.logger?.warn('OmniInfer models directory scan failed.', { error, dir: trimmed })
    })
    this.emit()
  }

  /**
   * Let a provider setting point at a user-installed OmniInfer directory. Bundled builds
   * initialize this from the app resources locator, so this is mainly for external installs.
   */
  setInstallDir(installDir: string | undefined): void {
    const trimmed = installDir?.trim()
    const previous = this.processState.installDir
    if (sameOptionalPath(previous, trimmed)) return
    this.process.setInstallDir?.(trimmed || undefined)
    this.processState = this.process.getState()
    this.logger?.info('OmniInfer install directory updated.', { from: previous, to: trimmed })
    this.emit()
  }

  /**
   * Point the runtime control plane at a new gateway URL and immediately re-probe.
   *
   * Accepts either a gateway base URL (`http://host:port`) or the provider's OpenAI-compatible
   * URL with a `/v1` suffix; the client strips it. No-op when the URL is unchanged.
   */
  setBaseUrl(url: string): void {
    const previous = this.client.getBaseUrl()
    this.client.setBaseUrl(url)
    const next = this.client.getBaseUrl()
    if (previous === next) return
    this.logger?.info('OmniInfer gateway base URL updated.', { from: previous, to: next })
    this.server = {
      ...this.server,
      baseUrl: next,
      host: parseHost(next),
      port: parsePort(next),
      lastCheckedAt: this.now(),
    }
    this.process.setEndpoint?.({ host: this.server.host, port: this.server.port })
    this.loadedModel = null
    this.switchToSteadyPolling()
    this.emit()
  }

  async start(): Promise<OmniInferRuntimeSnapshot> {
    if (this.processState.state === 'not_bundled') {
      this.logger?.info('OmniInfer install directory is not configured; skipping start.')
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
    try {
      this.processState = await this.process.stop({ shutdownTimeoutMs: 3_000 })
    } catch (error) {
      this.logger?.warn('OmniInfer stop encountered an error.', { error })
    }
    this.loadedModel = null
    this.server = { ...this.server, online: false, lastCheckedAt: this.now() }
    this.switchToSteadyPolling()
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
    const managedProcessRunning =
      Boolean(this.processState.pid) &&
      (this.processState.state === 'running' ||
        this.processState.state === 'starting' ||
        this.processState.state === 'unhealthy')
    if (managedProcessRunning) {
      try {
        this.processState = await this.process.stop({ shutdownTimeoutMs: 2_000 })
      } catch (error) {
        this.logger?.warn('OmniInfer process stop failed during shutdown.', { error })
      }
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
    this.firePollNow()
  }

  private switchToSteadyPolling(): void {
    this.stopPolling()
    this.consecutiveFailures = 0
    this.currentInterval = STEADY_POLL_INTERVAL_MS
    this.firePollNow()
  }

  /**
   * Fire one health probe immediately, then let pollHealth() schedule the next tick. This
   * avoids the dead window where the UI shows "offline" for the full poll interval after
   * boot, baseUrl changes, or a process transition.
   */
  private firePollNow(): void {
    this.pollGeneration += 1
    const generation = this.pollGeneration
    void this.pollHealth(generation)
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
    const wasOnline = this.server.online
    const result = await this.refreshHealthOnce()
    if (generation !== this.pollGeneration) return
    if (result === 'online') {
      if (!wasOnline) {
        await this.syncControlPlane()
      }
      this.currentInterval = STEADY_POLL_INTERVAL_MS
      this.consecutiveFailures = 0
    } else if (result === 'offline') {
      this.consecutiveFailures += 1
      if (!this.server.online || this.consecutiveFailures >= UNHEALTHY_FAILURE_THRESHOLD) {
        this.markServerOffline()
      }
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

  private async refreshHealthOnce(): Promise<HealthProbeResult> {
    const healthGeneration = ++this.healthProbeGeneration
    const baseUrl = this.client.getBaseUrl()
    try {
      const health = await this.client.getHealth()
      if (healthGeneration !== this.healthProbeGeneration || baseUrl !== this.client.getBaseUrl()) {
        return 'stale'
      }
      if (!health.online) {
        return 'offline'
      }
      this.server = {
        online: health.online,
        baseUrl,
        host: parseHost(baseUrl),
        port: parsePort(baseUrl),
        lastCheckedAt: this.now(),
      }
      const previousModelPath = this.loadedModel?.path
      if (health.loadedModel) {
        const installedModel = this.findInstalledModelByHealthPath(health.loadedModel.path)
        if (installedModel) {
          health.loadedModel.id = installedModel.id
          health.loadedModel.path = installedModel.path
        } else {
          // Auto-register absolute paths that weren't seen via scan. Some OmniInfer versions
          // report model paths relative to their models directory; keep those as display-only.
          if (isAbsolute(health.loadedModel.path)) {
            const record = this.installedModels.registerManualPath(health.loadedModel.path)
            health.loadedModel.id = record.id
          }
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
      return 'online'
    } catch (error) {
      if (healthGeneration !== this.healthProbeGeneration || baseUrl !== this.client.getBaseUrl()) {
        return 'stale'
      }
      if (!(error instanceof OmniInferControlException)) {
        this.logger?.debug?.('OmniInfer health request failed.', { error })
      }
      return 'offline'
    }
  }

  private markServerOffline(): void {
    const baseUrl = this.client.getBaseUrl()
    const next: OmniInferServerStatus = {
      ...this.server,
      online: false,
      baseUrl,
      host: parseHost(baseUrl),
      port: parsePort(baseUrl),
      lastCheckedAt: this.now(),
    }
    if (
      this.server.online !== next.online ||
      this.server.baseUrl !== next.baseUrl ||
      this.server.lastCheckedAt !== next.lastCheckedAt
    ) {
      this.server = next
      this.emit()
    }
  }

  private findInstalledModelByHealthPath(path: string) {
    const directId = this.installedModels.resolveModelId(path)
    const records = this.installedModels.list()
    if (directId) {
      return records.find((record) => record.id === directId)
    }

    const normalizedPath = normalizePath(path)
    const filename = normalizedPath.split('/').pop()
    return records.find((record) => {
      const recordPath = normalizePath(record.path)
      return (
        normalizePath(record.name) === normalizedPath ||
        recordPath.endsWith(`/${normalizedPath}`) ||
        (filename ? recordPath.endsWith(`/${filename}`) : false)
      )
    })
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
  return normalizePath(a) === normalizePath(b)
}

function sameOptionalPath(a: string | undefined, b: string | undefined): boolean {
  if (!a && !b) return true
  if (!a || !b) return false
  return samePath(a, b)
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, '/').toLowerCase()
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
