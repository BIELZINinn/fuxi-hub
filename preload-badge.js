const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('badge', { onUpdate: cb => ipcRenderer.on('badge', (_, p) => cb(p)) });
