import { registerAppIpcHandlers } from './app'
import { registerCatAppearanceIpcHandlers } from './cat-appearance'
import { registerChatIpcHandlers } from './chat'
import { registerCronIpcHandlers } from './cron'
import { registerLoggingIpcHandlers } from './logging'
import { registerMcpIpcHandlers } from './mcp'
import { registerMemoryIpcHandlers } from './memory'
import { registerObservationIpcHandlers } from './observation'
import { registerOmniInferIpcHandlers } from './omniinfer'
import { registerPersonaIpcHandlers } from './persona'
import { registerProviderIpcHandlers } from './provider'
import { registerSettingsIpcHandlers } from './settings'
import { registerShortcutIpcHandlers } from './shortcuts'
import { registerSkillIpcHandlers } from './skill'
import { registerTavernIpcHandlers } from './tavern'
import { registerTerminalProcessIpcHandlers } from './terminal-process'
import { registerToolIpcHandlers } from './tools'
import type { IpcHandlerOptions } from './types'
import { registerWindowIpcHandlers } from './window'
import { registerWorkspaceIpcHandlers } from './workspace'

export function registerIpcHandlers(options: IpcHandlerOptions): void {
  registerLoggingIpcHandlers(options)
  registerAppIpcHandlers(options)
  registerWindowIpcHandlers(options)
  registerCatAppearanceIpcHandlers(options)
  registerSettingsIpcHandlers(options)
  registerShortcutIpcHandlers(options)
  registerMemoryIpcHandlers(options)
  registerChatIpcHandlers(options)
  registerProviderIpcHandlers(options)
  registerObservationIpcHandlers(options)
  registerPersonaIpcHandlers(options)
  registerTavernIpcHandlers(options)
  registerSkillIpcHandlers(options)
  registerCronIpcHandlers(options)
  registerToolIpcHandlers(options)
  registerWorkspaceIpcHandlers(options)
  registerTerminalProcessIpcHandlers(options)
  registerMcpIpcHandlers(options)
  registerOmniInferIpcHandlers(options)
}

export type { IpcHandlerOptions }
