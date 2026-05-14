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

const bridge: OpenOmniClawBridge = {
  app: {
    getInfo: () => ipcRenderer.invoke(IPC_CHANNELS.app.getInfo),
  },
  chat: {
    listSessions: () => ipcRenderer.invoke(IPC_CHANNELS.chat.listSessions),
    createSession: () => ipcRenderer.invoke(IPC_CHANNELS.chat.createSession),
    sendMessage: (request) => ipcRenderer.invoke(IPC_CHANNELS.chat.sendMessage, request),
    onToken: (callback) => createUnsubscriber<string>(IPC_CHANNELS.chat.streamToken, callback),
    onDone: (callback) => {
      const listener = () => callback()
      ipcRenderer.on(IPC_CHANNELS.chat.streamDone, listener)

      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.chat.streamDone, listener)
      }
    },
  },
  provider: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.provider.list),
  },
  skill: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.skill.list),
  },
  cron: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.cron.list),
  },
}

contextBridge.exposeInMainWorld('openOmniClaw', bridge)
