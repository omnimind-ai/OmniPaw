const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('openOmniClaw', {
  getVersion: () => ipcRenderer.invoke('app:get-version'),
})
