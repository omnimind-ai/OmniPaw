import { mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import type { DesktopCaptureAdapter } from '@core/observation'
import type {
  ObservationCapturedFrame,
  ObservationCaptureRequest,
  ObservationPermissionState,
  ObservationPermissionStatus,
} from '@shared/types/observation'
import { app, desktopCapturer, screen, shell, systemPreferences } from 'electron'

export interface ElectronDesktopCaptureAdapterOptions {
  tempDir: string
  thumbnailSize?: {
    width: number
    height: number
  }
}

export class ElectronDesktopCaptureAdapter implements DesktopCaptureAdapter {
  private readonly tempDir: string
  private readonly thumbnailSize: { width: number; height: number }

  constructor(options: ElectronDesktopCaptureAdapterOptions) {
    this.tempDir = options.tempDir
    this.thumbnailSize = options.thumbnailSize ?? { width: 1440, height: 900 }
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

    const png = image.toPNG()
    const dataUrl = image.toDataURL()
    const captureId = crypto.randomUUID()
    await mkdir(this.tempDir, { recursive: true })
    await writeFile(join(this.tempDir, `${captureId}.png`), png)
    await writeFile(
      join(this.tempDir, `${captureId}.json`),
      JSON.stringify(
        {
          captureId,
          scope: request.scope,
          sourceId: source.id,
          sourceType: source.id.startsWith('window:') ? 'window' : 'screen',
          width: image.getSize().width,
          height: image.getSize().height,
          createdAt: Date.now(),
        },
        null,
        2
      )
    )

    return {
      captureId,
      scope: request.scope,
      sourceId: source.id,
      sourceType: source.id.startsWith('window:') ? 'window' : 'screen',
      mimeType: 'image/png',
      width: image.getSize().width,
      height: image.getSize().height,
      createdAt: Date.now(),
      retention: 'ephemeral',
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
    ? `开发模式下请授权 ${bundlePath}，而不是查找 OpenOmniClaw。`
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
