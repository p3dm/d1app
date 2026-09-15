const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('androidRemote', {
  startHost: (settings) => ipcRenderer.invoke('host:start', settings),
  stopHost: () => ipcRenderer.invoke('host:stop'),
  openViewer: (invite) => ipcRenderer.invoke('viewer:open', invite),
  onHostLog: (listener) => ipcRenderer.on('host:log', (_event, text) => listener(text))
})
