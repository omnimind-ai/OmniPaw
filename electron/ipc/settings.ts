import { randomUUID } from 'node:crypto'
import { copyFile, mkdir } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { ConfigValidationError, configError } from '@core/config/schema'
import { resolveOmniPawDataPaths } from '@core/utils/data-paths'
import { BACKGROUND_ASSET_PROTOCOL, IPC_CHANNELS } from '@shared/constants'
import type {
  DesktopAppBackgroundImage,
  DesktopSettingsConfig,
  PickDesktopBackgroundImageResponse,
  SaveDesktopSettingsRequest,
  SettingsOperationError,
} from '@shared/types/settings'
import { BrowserWindow, dialog, nativeImage } from 'electron'
import { registerLoggedIpcHandler } from './common'
import type { IpcHandlerOptions } from './types'

type SettingsIpcResult<T> = { ok: true; value: T } | { ok: false; error: SettingsOperationError }

export function registerSettingsIpcHandlers(options: IpcHandlerOptions): void {
  const runtime = options.runtime

  registerLoggedIpcHandler(options, IPC_CHANNELS.settings.load, () =>
    settingsResult(options, () => runtime.configStore.get())
  )
  registerLoggedIpcHandler(
    options,
    IPC_CHANNELS.settings.save,
    (_event, request: SaveDesktopSettingsRequest | DesktopSettingsConfig) =>
      settingsResult(options, () => {
        const config = isSaveSettingsRequest(request) ? request.config : request
        const saved = runtime.configStore.save(config)
        syncActiveCompanionRoleAppearance(options, saved)
        runtime.catPetManager.emitConfigChanged()
        runtime.cronManager.reloadSettings()
        options.onSettingsChanged('save', saved)
        return saved
      })
  )
  registerLoggedIpcHandler(options, IPC_CHANNELS.settings.reset, () =>
    settingsResult(options, () => {
      const saved = runtime.configStore.reset()
      syncActiveCompanionRoleAppearance(options, saved)
      runtime.catPetManager.emitConfigChanged()
      runtime.cronManager.reloadSettings()
      options.onSettingsChanged('reset', saved)
      return saved
    })
  )
  registerLoggedIpcHandler(options, IPC_CHANNELS.settings.status, () =>
    settingsResult(options, () => runtime.configStore.status())
  )
  registerLoggedIpcHandler(options, IPC_CHANNELS.settings.pickBackgroundImage, (event) =>
    settingsAsyncResult(options, () => pickBackgroundImage(event, options))
  )
}

function syncActiveCompanionRoleAppearance(
  options: IpcHandlerOptions,
  config: DesktopSettingsConfig
): void {
  const activeRole =
    config.app.companionRoles.find((role) => role.id === config.app.activeCompanionRoleId) ??
    config.app.companionRoles[0]
  const packId = activeRole?.appearancePackId?.trim()
  if (!packId) {
    return
  }

  try {
    options.runtime.catAppearanceManager.setActive({
      packId,
      layoutOverride: activeRole?.appearanceLayoutOverride,
    })
  } catch (error) {
    options.ipcLogger.warn('Failed to sync active companion role appearance.', {
      packId,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

function settingsResult<T>(options: IpcHandlerOptions, operation: () => T): SettingsIpcResult<T> {
  try {
    return {
      ok: true,
      value: operation(),
    }
  } catch (error) {
    if (error instanceof ConfigValidationError) {
      options.ipcLogger.warn('Settings operation failed.', {
        errorCode: error.details.code,
        recoverable: error.details.recoverable,
      })
      return {
        ok: false,
        error: error.details,
      }
    }
    options.ipcLogger.error('Settings operation failed unexpectedly.', { error })
    return {
      ok: false,
      error: configError(
        'config_io_error',
        error instanceof Error ? error.message : 'Settings operation failed.',
        {
          path: options.runtime.configStore.status().path,
          recoverable: options.runtime.configStore.status().recoverable,
        }
      ),
    }
  }
}

async function settingsAsyncResult<T>(
  options: IpcHandlerOptions,
  operation: () => Promise<T>
): Promise<SettingsIpcResult<T>> {
  try {
    return {
      ok: true,
      value: await operation(),
    }
  } catch (error) {
    if (error instanceof ConfigValidationError) {
      options.ipcLogger.warn('Settings operation failed.', {
        errorCode: error.details.code,
        recoverable: error.details.recoverable,
      })
      return {
        ok: false,
        error: error.details,
      }
    }
    options.ipcLogger.error('Settings operation failed unexpectedly.', { error })
    return {
      ok: false,
      error: configError(
        'config_io_error',
        error instanceof Error ? error.message : 'Settings operation failed.',
        {
          path: options.runtime.configStore.status().path,
          recoverable: options.runtime.configStore.status().recoverable,
        }
      ),
    }
  }
}

async function pickBackgroundImage(
  event: Electron.IpcMainInvokeEvent,
  ipcOptions: IpcHandlerOptions
): Promise<PickDesktopBackgroundImageResponse> {
  const parent = BrowserWindow.fromWebContents(event.sender) ?? undefined
  const options: Electron.OpenDialogOptions = {
    title: '选择背景图片',
    properties: ['openFile'],
    filters: [
      {
        name: 'Images',
        extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'],
      },
    ],
  }
  const result = parent
    ? await dialog.showOpenDialog(parent, options)
    : await dialog.showOpenDialog(options)

  if (result.canceled || !result.filePaths[0]) {
    return { canceled: true }
  }

  return {
    canceled: false,
    image: await resolveBackgroundImage(result.filePaths[0], ipcOptions),
  }
}

async function resolveBackgroundImage(
  filePath: string,
  ipcOptions: IpcHandlerOptions
): Promise<DesktopAppBackgroundImage> {
  const image = nativeImage.createFromPath(filePath)
  const size = image.getSize()
  if (image.isEmpty() || size.width < 1 || size.height < 1) {
    throw new ConfigValidationError(
      configError('invalid_config', 'Selected background file is not a readable image.', {
        recoverable: true,
        issues: [
          {
            path: 'app.background.image',
            message: 'Selected background file is not a readable image.',
            code: 'invalid_image',
          },
        ],
      })
    )
  }

  const mimeType = imageMimeType(filePath)
  const storedPath = await copyBackgroundImage(filePath, ipcOptions)

  return {
    path: storedPath,
    url: buildBackgroundAssetUrl(storedPath),
    width: size.width,
    height: size.height,
    aspectRatio: Math.round((size.width / size.height) * 1_000_000) / 1_000_000,
    mimeType,
  }
}

async function copyBackgroundImage(
  filePath: string,
  ipcOptions: IpcHandlerOptions
): Promise<string> {
  const directory = resolveOmniPawDataPaths({
    appDataPath: ipcOptions.appDataPath,
  }).backgroundImages
  await mkdir(directory, { recursive: true })

  const ext = normalizedImageExtension(filePath)
  const fileName = `${Date.now()}-${randomUUID()}${ext}`
  const targetPath = join(directory, fileName)
  await copyFile(filePath, targetPath)
  return targetPath
}

function buildBackgroundAssetUrl(storedPath: string): string {
  const url = new URL(`${BACKGROUND_ASSET_PROTOCOL}://asset/`)
  url.pathname = `/${encodeURIComponent(storedPath.split(/[\\/]/).pop() ?? '')}`
  return url.toString()
}

function normalizedImageExtension(filePath: string): string {
  const ext = extname(filePath).toLowerCase()
  return ext === '.jpg' || ext === '.jpeg' || ext === '.webp' || ext === '.gif' || ext === '.png'
    ? ext
    : '.png'
}

function imageMimeType(filePath: string): string {
  switch (extname(filePath).toLowerCase()) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.webp':
      return 'image/webp'
    case '.gif':
      return 'image/gif'
    default:
      return 'image/png'
  }
}

function isSaveSettingsRequest(
  value: SaveDesktopSettingsRequest | DesktopSettingsConfig
): value is SaveDesktopSettingsRequest {
  return Boolean(value && typeof value === 'object' && 'config' in value)
}
