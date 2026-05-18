import { createRequire } from 'node:module'

import { IPC_CHANNELS } from '@shared/constants'
import type { OpenOmniClawBridge, Unsubscribe } from '@shared/types/bridge'

const require = createRequire(import.meta.url)
const { contextBridge, ipcRenderer } = require('electron') as typeof import('electron')

function createUnsubscriber<T>(channel: string, callback: (payload: T) => void): Unsubscribe {
  const listener = (_event: Electron.IpcRendererEvent, payload: T) => callback(payload)

  ipcRenderer.on(channel, listener)

  return () => {
    ipcRenderer.removeListener(channel, listener)
  }
}

async function invokeSettings<T>(channel: string, payload?: unknown): Promise<T> {
  const response = arguments.length >= 2
    ? await ipcRenderer.invoke(channel, payload)
    : await ipcRenderer.invoke(channel)

  if (response?.ok === false) {
    const error = new Error(response.error?.message || 'Settings operation failed.') as Error & {
      details?: unknown
    }
    error.name = 'SettingsOperationError'
    error.details = response.error
    throw error
  }

  return response?.ok === true ? response.value as T : response as T
}

async function invokeMcp<T>(channel: string, payload?: unknown): Promise<T> {
  const response = arguments.length >= 2
    ? await ipcRenderer.invoke(channel, payload)
    : await ipcRenderer.invoke(channel)

  if (response?.ok === false) {
    const error = new Error(response.error?.message || 'MCP operation failed.') as Error & {
      details?: unknown
    }
    error.name = 'McpOperationError'
    error.details = response.error
    throw error
  }

  return response?.ok === true ? response.value as T : response as T
}

async function invokeSkill<T>(channel: string, payload?: unknown): Promise<T> {
  const response = arguments.length >= 2
    ? await ipcRenderer.invoke(channel, payload)
    : await ipcRenderer.invoke(channel)

  if (response?.ok === false) {
    const error = new Error(response.error?.message || 'Skill operation failed.') as Error & {
      details?: unknown
    }
    error.name = 'SkillOperationError'
    error.details = response.error
    throw error
  }

  return response?.ok === true ? response.value as T : response as T
}

const bridge: OpenOmniClawBridge = {
  app: {
    getInfo: () => ipcRenderer.invoke(IPC_CHANNELS.app.getInfo),
  },
  settings: {
    load: () => invokeSettings(IPC_CHANNELS.settings.load),
    save: (request) => invokeSettings(IPC_CHANNELS.settings.save, request),
    reset: () => invokeSettings(IPC_CHANNELS.settings.reset),
    status: () => invokeSettings(IPC_CHANNELS.settings.status),
    onChanged: (callback) => createUnsubscriber(IPC_CHANNELS.settings.changed, callback),
  },
  chat: {
    listSessions: () => ipcRenderer.invoke(IPC_CHANNELS.chat.listSessions),
    createSession: () => ipcRenderer.invoke(IPC_CHANNELS.chat.createSession),
    getSession: (sessionId) => ipcRenderer.invoke(IPC_CHANNELS.chat.getSession, sessionId),
    updateSession: (...args) => {
      const request =
        args.length === 2 && typeof args[0] === 'string'
          ? { sessionId: args[0], ...(args[1] as object) }
          : args[0]
      return ipcRenderer.invoke(IPC_CHANNELS.chat.updateSession, request)
    },
    deleteSession: (request) => ipcRenderer.invoke(IPC_CHANNELS.chat.deleteSession, request),
    listMessages: (request) => ipcRenderer.invoke(IPC_CHANNELS.chat.listMessages, request),
    sendMessage: (request) => ipcRenderer.invoke(IPC_CHANNELS.chat.sendMessage, request),
    abortRun: (...args) => {
      const request =
        args.length >= 2 && typeof args[0] === 'string'
          ? { runId: args[0], reason: args[1] as string | undefined }
          : args[0]
      return ipcRenderer.invoke(IPC_CHANNELS.chat.abortRun, request)
    },
    editMessage: (...args) => {
      const request =
        args.length >= 3 && typeof args[0] === 'string'
          ? { sessionId: args[0], messageId: args[1] as string, parts: args[2] }
          : args[0]
      return ipcRenderer.invoke(IPC_CHANNELS.chat.editMessage, request)
    },
    regenerateMessage: (...args) => {
      const request =
        args.length >= 2 && typeof args[0] === 'string'
          ? {
              sessionId: args[0],
              messageId: args[1] as string,
              providerId: args[2] as string | undefined,
              modelId: args[3] as string | undefined,
            }
          : args[0]
      return ipcRenderer.invoke(IPC_CHANNELS.chat.regenerateMessage, request)
    },
    uploadAttachment: (request) => ipcRenderer.invoke(IPC_CHANNELS.chat.uploadAttachment, request),
    getAttachmentPreview: (request) =>
      ipcRenderer.invoke(IPC_CHANNELS.chat.getAttachmentPreview, request),
    onStreamEvent: (callback) => createUnsubscriber(IPC_CHANNELS.chat.streamEvent, callback),
    onToken: (callback) => createUnsubscriber<string>(IPC_CHANNELS.chat.streamToken, callback),
    onDone: (callback) => {
      const listener = () => callback()
      ipcRenderer.on(IPC_CHANNELS.chat.streamDone, listener)

      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.chat.streamDone, listener)
      }
    },
  },
  attachment: {
    upload: (request) =>
      ipcRenderer
        .invoke(IPC_CHANNELS.chat.uploadAttachment, request)
        .then((response) => response?.attachment ?? response),
    getPreviewUrl: (request) =>
      ipcRenderer.invoke(IPC_CHANNELS.chat.getAttachmentPreview, request).then((response) => response),
  },
  provider: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.provider.list),
    listPresets: () => ipcRenderer.invoke(IPC_CHANNELS.provider.listPresets),
    createFromPreset: (request) => ipcRenderer.invoke(IPC_CHANNELS.provider.createFromPreset, request),
    upsert: (request) => ipcRenderer.invoke(IPC_CHANNELS.provider.upsert, request),
    delete: (request) => ipcRenderer.invoke(IPC_CHANNELS.provider.delete, request),
    test: (...args) => {
      const request =
        typeof args[0] === 'string' ? { providerId: args[0], modelId: args[1] as string | undefined } : args[0]
      return ipcRenderer.invoke(IPC_CHANNELS.provider.test, request)
    },
    listModels: (providerId) => ipcRenderer.invoke(IPC_CHANNELS.provider.listModels, providerId),
    refreshModels: (request) => ipcRenderer.invoke(IPC_CHANNELS.provider.refreshModels, request),
    setSessionModel: (request) => ipcRenderer.invoke(IPC_CHANNELS.provider.setSessionModel, request),
  },
  skill: {
    list: () => invokeSkill(IPC_CHANNELS.skill.list),
    refresh: () => invokeSkill(IPC_CHANNELS.skill.refresh),
    setEnabled: (request) => invokeSkill(IPC_CHANNELS.skill.setEnabled, request),
    onChanged: (callback) => createUnsubscriber(IPC_CHANNELS.skill.changed, callback),
  },
  cron: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.cron.list),
  },
  tools: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.tools.list),
    setEnabled: (request) => ipcRenderer.invoke(IPC_CHANNELS.tools.setEnabled, request),
  },
  mcp: {
    listServers: () => invokeMcp(IPC_CHANNELS.mcp.listServers),
    saveServer: (request) => invokeMcp(IPC_CHANNELS.mcp.saveServer, request),
    deleteServer: (request) => invokeMcp(IPC_CHANNELS.mcp.deleteServer, request),
    setServerEnabled: (request) => invokeMcp(IPC_CHANNELS.mcp.setServerEnabled, request),
    refreshServer: (request) => invokeMcp(IPC_CHANNELS.mcp.refreshServer, request),
    listTools: () => invokeMcp(IPC_CHANNELS.mcp.listTools),
    onChanged: (callback) => createUnsubscriber(IPC_CHANNELS.mcp.changed, callback),
  },
}

contextBridge.exposeInMainWorld('openOmniClaw', bridge)
