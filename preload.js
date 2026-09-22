// preload.js — Pont sécurisé exposé au renderer (index.html)
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('loyerpay', {
  getDeviceId: () => ipcRenderer.invoke('get-device-id'),
  storeGet: (key) => ipcRenderer.invoke('store-get', key),
  storeSet: (key, value) => ipcRenderer.invoke('store-set', key, value),
  openExternal: (url) => ipcRenderer.invoke('open-external', url)
});
