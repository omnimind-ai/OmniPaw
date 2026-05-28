import type { Logger, LogSink } from '@core/logging'
import type { DesktopSettingsConfig, SettingsChangeReason } from '@shared/types/settings'
import type { CoreRuntime } from '../core-runtime'

export interface IpcHandlerOptions {
  appName: string
  appVersion: string
  logSink: LogSink
  rootLogger: Logger
  ipcLogger: Logger
  platform: NodeJS.Platform
  runtime: CoreRuntime
  onSettingsChanged: (reason: SettingsChangeReason, config: DesktopSettingsConfig) => void
  openChatSession?: (sessionId: string, kind?: 'chat' | 'cat' | 'vision') => void
}
