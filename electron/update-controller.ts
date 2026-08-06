import type { Logger } from '@core/logging'
import type { AppUpdateState, UpdateCheckResult } from '@shared/types/update'
import { NsisUpdater } from 'electron-updater'

import { checkForUpdates as checkReleaseInformation } from './update-checker'

const DEFAULT_UPDATE_ARTIFACTS_URL =
  'https://omnipaw-app-update-worker.dx390264.workers.dev/artifacts/stable'

export interface AppUpdateControllerOptions {
  currentVersion: string
  isPackaged: boolean
  omniInferPackaged: boolean
  platform: NodeJS.Platform
  arch: string
  logger: Logger
  onStateChanged?: (state: AppUpdateState) => void
}

export class AppUpdateController {
  private readonly logger: Logger
  private readonly onStateChanged?: (state: AppUpdateState) => void
  private readonly updater?: NsisUpdater
  private state: AppUpdateState
  private releaseInformation?: UpdateCheckResult
  private checkPromise?: Promise<UpdateCheckResult>
  private downloadPromise?: Promise<AppUpdateState>

  constructor(private readonly options: AppUpdateControllerOptions) {
    this.logger = options.logger
    this.onStateChanged = options.onStateChanged
    const supported = options.isPackaged && options.platform === 'win32' && options.arch === 'x64'
    this.state = {
      supported,
      phase: 'idle',
      currentVersion: options.currentVersion,
    }

    if (!supported) {
      return
    }

    try {
      const feedUrl = resolveUpdateFeedUrl(options.arch, options.omniInferPackaged)
      const updater = new NsisUpdater({
        provider: 'generic',
        url: feedUrl,
        useMultipleRangeRequest: false,
      })
      updater.autoDownload = false
      updater.autoInstallOnAppQuit = false
      updater.disableDifferentialDownload = false
      updater.logger = createUpdaterLogger(this.logger)
      updater.on('download-progress', (progress) => {
        this.updateState({
          phase: 'downloading',
          progress: {
            percent: clampPercentage(progress.percent),
            transferred: normalizeByteCount(progress.transferred),
            total: normalizeByteCount(progress.total),
            bytesPerSecond: normalizeByteCount(progress.bytesPerSecond),
          },
          error: undefined,
        })
      })
      updater.on('update-downloaded', (event) => {
        this.logger.info('Application update downloaded.', { version: event.version })
        this.updateState({
          phase: 'downloaded',
          availableVersion: normalizeVersion(event.version),
          progress: this.state.progress
            ? { ...this.state.progress, percent: 100, transferred: this.state.progress.total }
            : undefined,
          error: undefined,
        })
      })
      updater.on('error', (error) => {
        this.setError(error)
      })
      this.updater = updater

      this.logger.info('Application updater initialized.', {
        feedUrl,
        variant: options.omniInferPackaged ? 'full' : 'slim',
        arch: options.arch,
      })
    } catch (error) {
      this.state = {
        ...this.state,
        supported: false,
        phase: 'error',
        error: errorToMessage(error),
      }
      this.logger.error('Application updater initialization failed.', { error })
    }
  }

  getState(): AppUpdateState {
    return cloneState(this.state)
  }

  async checkForUpdates(): Promise<UpdateCheckResult> {
    if (this.checkPromise) {
      return this.checkPromise
    }

    const promise = this.performCheck()
    this.checkPromise = promise
    try {
      return await promise
    } finally {
      this.checkPromise = undefined
    }
  }

  async downloadUpdate(): Promise<AppUpdateState> {
    if (this.downloadPromise) {
      return this.downloadPromise
    }

    const promise = this.performDownload()
    this.downloadPromise = promise
    try {
      return await promise
    } finally {
      this.downloadPromise = undefined
    }
  }

  restartToInstallUpdate(): void {
    if (!this.updater || this.state.phase !== 'downloaded') {
      throw new Error('No downloaded application update is ready to install.')
    }

    this.logger.info('Restarting application to install update.', {
      version: this.state.availableVersion,
    })
    this.updateState({ phase: 'installing', error: undefined })
    this.updater.quitAndInstall(false, true)
  }

  destroy(): void {
    this.updater?.removeAllListeners()
  }

  private async performCheck(): Promise<UpdateCheckResult> {
    const activePhase = this.state.phase
    if (
      activePhase !== 'downloading' &&
      activePhase !== 'downloaded' &&
      activePhase !== 'installing'
    ) {
      this.updateState({ phase: 'checking', error: undefined })
    }

    try {
      const result = await checkReleaseInformation(this.options.currentVersion)
      this.releaseInformation = result
      const preserveActivePhase =
        this.state.phase === 'downloading' ||
        this.state.phase === 'downloaded' ||
        this.state.phase === 'installing'
      this.updateState({
        phase: preserveActivePhase ? this.state.phase : result.hasUpdate ? 'available' : 'idle',
        availableVersion: result.hasUpdate ? result.version : undefined,
        checkedAt: Date.now(),
        progress: preserveActivePhase ? this.state.progress : undefined,
        error: undefined,
      })
      return result
    } catch (error) {
      if (
        this.state.phase !== 'downloading' &&
        this.state.phase !== 'downloaded' &&
        this.state.phase !== 'installing'
      ) {
        this.setError(error)
      }
      throw error
    }
  }

  private async performDownload(): Promise<AppUpdateState> {
    if (!this.updater || !this.state.supported) {
      throw new Error('Automatic application updates are unavailable on this platform or build.')
    }

    const releaseInformation = this.releaseInformation ?? (await this.checkForUpdates())
    if (!releaseInformation.hasUpdate) {
      throw new Error('No newer application version is available.')
    }

    this.updateState({
      phase: 'downloading',
      availableVersion: releaseInformation.version,
      progress: {
        percent: 0,
        transferred: 0,
        total: 0,
        bytesPerSecond: 0,
      },
      error: undefined,
    })

    try {
      const updaterResult = await this.updater.checkForUpdates()
      const updaterVersion = normalizeVersion(updaterResult?.updateInfo.version)
      if (!updaterVersion || updaterVersion !== normalizeVersion(releaseInformation.version)) {
        throw new Error('Update metadata version does not match the published release information.')
      }

      await this.updater.downloadUpdate()
      if (this.state.phase !== 'downloaded') {
        this.updateState({ phase: 'downloaded', error: undefined })
      }
      return this.getState()
    } catch (error) {
      this.setError(error)
      throw error
    }
  }

  private setError(error: unknown): void {
    const message = errorToMessage(error)
    this.logger.error('Application update operation failed.', { error })
    this.updateState({ phase: 'error', error: message, progress: undefined })
  }

  private updateState(patch: Partial<AppUpdateState>): void {
    this.state = {
      ...this.state,
      ...patch,
    }
    this.onStateChanged?.(this.getState())
  }
}

function resolveUpdateFeedUrl(arch: string, omniInferPackaged: boolean): string {
  const override = process.env.OMNIPAW_UPDATE_FEED_URL?.trim()
  if (override) {
    return normalizeHttpsUrl(override)
  }

  const baseUrl = process.env.OMNIPAW_UPDATE_ARTIFACTS_URL?.trim() || DEFAULT_UPDATE_ARTIFACTS_URL
  const variant = omniInferPackaged ? 'full' : 'slim'
  return normalizeHttpsUrl(`${baseUrl.replace(/\/+$/, '')}/windows/${arch}/${variant}`)
}

function normalizeHttpsUrl(value: string): string {
  const url = new URL(value)
  if (url.protocol !== 'https:') {
    throw new Error('Application update feed must use HTTPS.')
  }
  return url.toString().replace(/\/$/, '')
}

function normalizeVersion(value: unknown): string {
  return typeof value === 'string' ? value.trim().replace(/^v/i, '') : ''
}

function normalizeByteCount(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.round(value) : 0
}

function clampPercentage(value: number): number {
  return Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0
}

function errorToMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.trim().slice(0, 500) || 'Application update operation failed.'
}

function cloneState(state: AppUpdateState): AppUpdateState {
  return {
    ...state,
    progress: state.progress ? { ...state.progress } : undefined,
  }
}

function createUpdaterLogger(logger: Logger) {
  return {
    info(message?: unknown) {
      logger.info(String(message ?? ''))
    },
    warn(message?: unknown) {
      logger.warn(String(message ?? ''))
    },
    error(message?: unknown) {
      logger.error(String(message ?? ''))
    },
    debug(message?: unknown) {
      logger.debug(String(message ?? ''))
    },
  }
}
