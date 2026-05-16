export const APP_NAME = 'OpenOmniClaw'

export const IPC_CHANNELS = {
  app: {
    getInfo: 'app:get-info',
  },
  settings: {
    load: 'settings:load',
    save: 'settings:save',
    reset: 'settings:reset',
    status: 'settings:status',
    changed: 'settings:changed',
  },
  chat: {
    listSessions: 'chat:list-sessions',
    createSession: 'chat:create-session',
    getSession: 'chat:get-session',
    updateSession: 'chat:update-session',
    deleteSession: 'chat:delete-session',
    listMessages: 'chat:list-messages',
    sendMessage: 'chat:send-message',
    abortRun: 'chat:abort-run',
    editMessage: 'chat:edit-message',
    regenerateMessage: 'chat:regenerate-message',
    uploadAttachment: 'chat:upload-attachment',
    getAttachmentPreview: 'chat:get-attachment-preview',
    streamEvent: 'chat:stream-event',
    streamToken: 'chat:stream-token',
    streamDone: 'chat:stream-done',
  },
  provider: {
    list: 'provider:list',
    upsert: 'provider:upsert',
    delete: 'provider:delete',
    test: 'provider:test',
    listModels: 'provider:list-models',
    refreshModels: 'provider:refresh-models',
    setSessionModel: 'provider:set-session-model',
  },
  skill: {
    list: 'skill:list',
  },
  cron: {
    list: 'cron:list',
  },
  tools: {
    list: 'tools:list',
    setEnabled: 'tools:set-enabled',
  },
} as const
