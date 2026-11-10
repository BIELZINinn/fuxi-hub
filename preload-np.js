const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('np', { onUpdate: cb => ipcRenderer.on('np', (_, p) => cb(p)), cmd: c => ipcRenderer.invoke('np-cmd', c), hover: on => ipcRenderer.send('np-hover', !!on) });
