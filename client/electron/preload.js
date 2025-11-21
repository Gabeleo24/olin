const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  // Expose safe APIs here
  // example:
  // sendNotification: (title, body) => ipcRenderer.send('notify', { title, body }),
  platform: process.platform
});

