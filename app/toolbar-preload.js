const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('toolbar', {
  back: () => ipcRenderer.invoke('nav:back'),
  forward: () => ipcRenderer.invoke('nav:forward'),
  reload: () => ipcRenderer.invoke('nav:reload'),
  go: (input) => ipcRenderer.invoke('nav:go', input),
  onState: (cb) => {
    ipcRenderer.on('nav:state', (_, state) => cb(state));
  },
  onFocus: (cb) => {
    ipcRenderer.on('nav:focus', () => cb());
  },
});
