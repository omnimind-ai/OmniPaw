import type { Logger, LogSink } from '@core/logging'
import type { OpenChatSessionRequest } from '@shared/types/app'
import type { DesktopSettingsConfig, SettingsChangeReason } from '@shared/types/settings'
import type { CoreRuntime } from '../core-runtime'
import type { ShortcutController } from '../shortcut-controller'

export interface IpcHandlerOptions {
  appName: string
  appVersion: string
  appDataPath: string
  logSink: LogSink
  rootLogger: Logger
  ipcLogger: Logger
  platform: NodeJS.Platform
  runtime: CoreRuntime
  shortcutController?: ShortcutController
  onSettingsChanged: (reason: SettingsChangeReason, config: DesktopSettingsConfig) => void
  openChatSession?: (sessionId: string, kind?: OpenChatSessionRequest['kind']) => void
}
