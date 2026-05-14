import type { AppInfo } from './app'
import type { CronTask } from './cron'
import type { SendMessageRequest, SendMessageResponse, Session } from './chat'
import type { ProviderConfig } from './provider'
import type { SkillDefinition } from './skill'

export type Unsubscribe = () => void

export interface OpenOmniClawBridge {
  app: {
    getInfo: () => Promise<AppInfo>
  }
  chat: {
    listSessions: () => Promise<Session[]>
    createSession: () => Promise<Session>
    sendMessage: (request: SendMessageRequest) => Promise<SendMessageResponse>
    onToken: (callback: (token: string) => void) => Unsubscribe
    onDone: (callback: () => void) => Unsubscribe
  }
  provider: {
    list: () => Promise<ProviderConfig[]>
  }
  skill: {
    list: () => Promise<SkillDefinition[]>
  }
  cron: {
    list: () => Promise<CronTask[]>
  }
}
