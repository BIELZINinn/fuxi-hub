const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('toast', {
  onShow: cb => ipcRenderer.on('toast', (_, p) => cb(p)),
  onClear: cb => ipcRenderer.on('toast-clear', () => cb()),
  empty: () => ipcRenderer.send('toast-empty')
});
