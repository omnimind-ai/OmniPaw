export const APP_NAME = 'OpenOmniClaw'

export const IPC_CHANNELS = {
  app: {
    getInfo: 'app:get-info',
  },
  chat: {
    listSessions: 'chat:list-sessions',
    createSession: 'chat:create-session',
    sendMessage: 'chat:send-message',
    streamToken: 'chat:stream-token',
    streamDone: 'chat:stream-done',
  },
  provider: {
    list: 'provider:list',
  },
  skill: {
    list: 'skill:list',
  },
  cron: {
    list: 'cron:list',
  },
} as const
