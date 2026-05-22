import { registerAppIpcHandlers } from './app'
import { registerChatIpcHandlers } from './chat'
import { registerCronIpcHandlers } from './cron'
import { registerLoggingIpcHandlers } from './logging'
import { registerMcpIpcHandlers } from './mcp'
import { registerPersonaIpcHandlers } from './persona'
import { registerProviderIpcHandlers } from './provider'
import { registerSettingsIpcHandlers } from './settings'
import { registerSkillIpcHandlers } from './skill'
import { registerToolIpcHandlers } from './tools'
import type { IpcHandlerOptions } from './types'

export function registerIpcHandlers(options: IpcHandlerOptions): void {
  registerLoggingIpcHandlers(options)
  registerAppIpcHandlers(options)
  registerSettingsIpcHandlers(options)
  registerChatIpcHandlers(options)
  registerProviderIpcHandlers(options)
  registerPersonaIpcHandlers(options)
  registerSkillIpcHandlers(options)
  registerCronIpcHandlers(options)
  registerToolIpcHandlers(options)
  registerMcpIpcHandlers(options)
}

export type { IpcHandlerOptions }
