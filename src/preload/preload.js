const { contextBridge, ipcRenderer } = require('electron')

const allowedPanelStates = new Set(['idle', 'preparing', 'running', 'completed'])

function createUnsubscriber(channel, callback) {
  const listener = (_event, payload) => callback(payload)

  ipcRenderer.on(channel, listener)

  return () => {
    ipcRenderer.removeListener(channel, listener)
  }
}

contextBridge.exposeInMainWorld('openOmniClaw', {
  getVersion: () => ipcRenderer.invoke('app:get-version'),
  cat: {
    show: () => ipcRenderer.invoke('cat:show'),
    hide: () => ipcRenderer.invoke('cat:hide'),
    setState: (state) => {
      if (!allowedPanelStates.has(state)) {
        return Promise.resolve({
          ok: false,
          error: 'Invalid cat state',
        })
      }

      return ipcRenderer.invoke('cat:set-state', state)
    },
    onStateChanged: (callback) => {
      if (typeof callback !== 'function') {
        return () => {}
      }

      return createUnsubscriber('cat:status-changed', callback)
    },
    onCommand: (callback) => {
      if (typeof callback !== 'function') {
        return () => {}
      }

      return createUnsubscriber('cat:state-changed', callback)
    },
    reportState: (state) => ipcRenderer.send('cat:renderer-state', state),
    dragStart: () => ipcRenderer.invoke('cat:drag-start'),
    dragMove: (payload) => ipcRenderer.invoke('cat:drag-move', payload),
    dragEnd: () => ipcRenderer.invoke('cat:drag-end'),
  },
})
