import { ConfigValidationError, configError } from '@core/config/schema'
import { IPC_CHANNELS } from '@shared/constants'
import type {
  DesktopSettingsConfig,
  SaveDesktopSettingsRequest,
  SettingsOperationError,
} from '@shared/types/settings'
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
        runtime.cronManager.reloadSettings()
        options.onSettingsChanged('save', saved)
        return saved
      })
  )
  registerLoggedIpcHandler(options, IPC_CHANNELS.settings.reset, () =>
    settingsResult(options, () => {
      const saved = runtime.configStore.reset()
      runtime.cronManager.reloadSettings()
      options.onSettingsChanged('reset', saved)
      return saved
    })
  )
  registerLoggedIpcHandler(options, IPC_CHANNELS.settings.status, () =>
    settingsResult(options, () => runtime.configStore.status())
  )
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

function isSaveSettingsRequest(
  value: SaveDesktopSettingsRequest | DesktopSettingsConfig
): value is SaveDesktopSettingsRequest {
  return Boolean(value && typeof value === 'object' && 'config' in value)
}
