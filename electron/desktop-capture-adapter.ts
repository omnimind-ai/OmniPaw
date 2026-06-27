import { mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import type { DesktopCaptureAdapter } from '@core/observation'
import type {
  ObservationCapturedFrame,
  ObservationCaptureRequest,
  ObservationPermissionState,
  ObservationPermissionStatus,
  ObservationScreenshotRetention,
} from '@shared/types/observation'
import type { UtilityProcess } from 'electron'
import { app, desktopCapturer, screen, shell, systemPreferences, utilityProcess } from 'electron'

export interface ElectronDesktopCaptureAdapterOptions {
  tempDir: string
  thumbnailSize?: {
    width: number
    height: number
  }
}

interface EncodeResponse {
  id: string
  ok: boolean
  png?: Buffer
  dataUrl?: string
  error?: string
}

interface PendingEncode {
  resolve: (response: { png?: Buffer; dataUrl: string }) => void
  reject: (error: Error) => void
}

export class ElectronDesktopCaptureAdapter implements DesktopCaptureAdapter {
  private readonly tempDir: string
  private readonly thumbnailSize: { width: number; height: number }
  private encoderProcess: UtilityProcess | undefined
  private encoderReady: Promise<UtilityProcess> | undefined
  private readonly pendingEncodes = new Map<string, PendingEncode>()
  private disposed = false

  constructor(options: ElectronDesktopCaptureAdapterOptions) {
    this.tempDir = options.tempDir
    this.thumbnailSize = options.thumbnailSize ?? { width: 1024, height: 640 }
  }

  async permissionStatus(): Promise<ObservationPermissionStatus> {
    if (process.platform !== 'darwin') {
      return {
        platform: process.platform,
        screen: 'granted',
        canPrompt: false,
      }
    }

    const status = safeMacScreenStatus()
    return {
      platform: process.platform,
      screen: status,
      canPrompt: false,
      message: status === 'granted' ? undefined : macScreenPermissionMessage(),
    }
  }

  async probeScreenPermission(): Promise<ObservationPermissionStatus> {
    if (process.platform !== 'darwin') {
      return this.permissionStatus()
    }

    try {
      await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: 1, height: 1 },
        fetchWindowIcons: false,
      })
    } catch {
      // Permission probing must fall through to the status check and settings handoff.
    }
    const status = await this.permissionStatus()
    if (status.screen !== 'granted') {
      await openMacScreenRecordingSettings()
    }
    return status
  }

  async capture(request: ObservationCaptureRequest): Promise<ObservationCapturedFrame> {
    const permission = await this.permissionStatus()
    if (permission.screen !== 'granted' && permission.screen !== 'unknown') {
      throw new Error(permission.message || 'Screen capture permission is not granted.')
    }

    const source = await this.resolveSource(request)
    if (!source) {
      throw new Error('No available desktop capture source.')
    }

    const image = source.thumbnail
    if (image.isEmpty()) {
      throw new Error('Desktop capture source returned an empty image.')
    }

    const size = image.getSize()
    const bitmap = image.toBitmap()
    const retention: ObservationScreenshotRetention = request.retention ?? 'ephemeral'
    const persist = retention === 'persist'

    const { png, dataUrl } = await this.encodeOffThread({
      bitmap,
      width: size.width,
      height: size.height,
      encodePng: persist,
    })

    const captureId = crypto.randomUUID()
    const sourceType: 'screen' | 'window' = source.id.startsWith('window:') ? 'window' : 'screen'
    const createdAt = Date.now()

    if (persist && png) {
      await mkdir(this.tempDir, { recursive: true })
      await writeFile(join(this.tempDir, `${captureId}.png`), png)
      await writeFile(
        join(this.tempDir, `${captureId}.json`),
        JSON.stringify(
          {
            captureId,
            scope: request.scope,
            sourceId: source.id,
            sourceType,
            width: size.width,
            height: size.height,
            createdAt,
          },
          null,
          2
        )
      )
    }

    return {
      captureId,
      scope: request.scope,
      sourceId: source.id,
      sourceType,
      mimeType: 'image/png',
      width: size.width,
      height: size.height,
      createdAt,
      retention,
      dataUrl,
    }
  }

  async cleanupCapture(captureId: string): Promise<void> {
    if (!captureId) return
    await Promise.allSettled([
      rm(join(this.tempDir, `${captureId}.png`), { force: true }),
      rm(join(this.tempDir, `${captureId}.json`), { force: true }),
    ])
  }

  async cleanupAll(): Promise<void> {
    const entries = await readdir(this.tempDir).catch(() => [])
    await Promise.allSettled(
      entries
        .filter((entry) => entry.endsWith('.png') || entry.endsWith('.json'))
        .map((entry) => rm(join(this.tempDir, entry), { force: true }))
    )
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    const disposeError = new Error('desktop capture adapter disposed')
    for (const pending of this.pendingEncodes.values()) {
      pending.reject(disposeError)
    }
    this.pendingEncodes.clear()
    if (this.encoderProcess) {
      try {
        this.encoderProcess.kill()
      } catch {
        // Best effort cleanup; ignore.
      }
    }
    this.encoderProcess = undefined
    this.encoderReady = undefined
  }

  private async resolveSource(request: ObservationCaptureRequest) {
    const sources = await desktopCapturer.getSources({
      types: request.scope === 'selected_window' ? ['window'] : ['screen'],
      thumbnailSize: this.thumbnailSize,
      fetchWindowIcons: false,
    })
    if (request.sourceId) {
      return sources.find((source) => source.id === request.sourceId) ?? null
    }

    if (request.scope === 'primary_display') {
      const primaryDisplayId = String(screen.getPrimaryDisplay().id)
      return (
        sources.find((source) => source.display_id === primaryDisplayId) ??
        sources.find((source) => source.id.includes(primaryDisplayId)) ??
        sources[0] ??
        null
      )
    }

    return sources[0] ?? null
  }

  private async ensureEncoder(): Promise<UtilityProcess> {
    if (this.disposed) {
      throw new Error('desktop capture adapter disposed')
    }
    if (this.encoderProcess) {
      return this.encoderProcess
    }
    if (this.encoderReady) {
      return this.encoderReady
    }

    const scriptPath = join(__dirname, 'workers/image-encoder.cjs')
    this.encoderReady = new Promise<UtilityProcess>((resolve, reject) => {
      let child: UtilityProcess
      try {
        child = utilityProcess.fork(scriptPath, [], {
          serviceName: 'omnipaw-image-encoder',
        })
      } catch (error) {
        this.encoderReady = undefined
        reject(error instanceof Error ? error : new Error(String(error)))
        return
      }

      let spawned = false
      child.once('spawn', () => {
        spawned = true
        this.encoderProcess = child
        resolve(child)
      })
      child.on('message', (message: EncodeResponse) => {
        const handler = this.pendingEncodes.get(message.id)
        if (!handler) return
        this.pendingEncodes.delete(message.id)
        if (message.ok && typeof message.dataUrl === 'string') {
          handler.resolve({ png: message.png, dataUrl: message.dataUrl })
        } else {
          handler.reject(new Error(message.error ?? 'image-encoder failed'))
        }
      })
      child.on('exit', (code) => {
        this.encoderProcess = undefined
        this.encoderReady = undefined
        const exitError = new Error(`image-encoder utility process exited with code ${code}`)
        for (const pending of this.pendingEncodes.values()) {
          pending.reject(exitError)
        }
        this.pendingEncodes.clear()
        if (!spawned) {
          reject(exitError)
        }
      })
    })

    try {
      return await this.encoderReady
    } catch (error) {
      this.encoderReady = undefined
      throw error
    }
  }

  private async encodeOffThread(input: {
    bitmap: Buffer
    width: number
    height: number
    encodePng: boolean
  }): Promise<{ png?: Buffer; dataUrl: string }> {
    const child = await this.ensureEncoder()
    const id = crypto.randomUUID()
    return new Promise<{ png?: Buffer; dataUrl: string }>((resolve, reject) => {
      this.pendingEncodes.set(id, { resolve, reject })
      try {
        child.postMessage({
          id,
          bitmap: input.bitmap,
          width: input.width,
          height: input.height,
          encodePng: input.encodePng,
        })
      } catch (error) {
        this.pendingEncodes.delete(id)
        reject(error instanceof Error ? error : new Error(String(error)))
      }
    })
  }
}

function safeMacScreenStatus(): ObservationPermissionState {
  try {
    const status = systemPreferences.getMediaAccessStatus('screen' as never)
    if (
      status === 'granted' ||
      status === 'denied' ||
      status === 'not-determined' ||
      status === 'restricted' ||
      status === 'unknown'
    ) {
      return status
    }
    return 'unknown'
  } catch {
    return 'unknown'
  }
}

function macScreenPermissionMessage(): string {
  const appName = app.getName() || 'Electron'
  const bundlePath = currentMacBundlePath()
  const devHint = bundlePath
    ? `开发模式下请授权 ${bundlePath}，而不是查找 OmniPaw。`
    : '开发模式下可能需要授权 Electron、Terminal、iTerm 或 VS Code。'
  return `macOS 需要在系统设置 > 隐私与安全性 > 屏幕与系统音频录制中为 ${appName} 开启权限。${devHint}`
}

function currentMacBundlePath(): string | undefined {
  try {
    const exePath = app.getPath('exe')
    const marker = '.app/Contents/MacOS/'
    const markerIndex = exePath.indexOf(marker)
    if (markerIndex === -1) {
      return exePath || undefined
    }
    return exePath.slice(0, markerIndex + '.app'.length)
  } catch {
    return undefined
  }
}

async function openMacScreenRecordingSettings(): Promise<void> {
  await shell.openExternal(
    'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture'
  )
}
