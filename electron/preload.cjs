'use strict';

const { contextBridge, ipcRenderer } = require('electron');

function readVersionArg() {
  const prefix = '--opendeck-version=';
  const hit = process.argv.find((arg) => typeof arg === 'string' && arg.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : '';
}

contextBridge.exposeInMainWorld('opendeckDesktop', {
  version: readVersionArg(),
  platform: process.platform,
  getAlwaysOnTop: () => ipcRenderer.invoke('opendeck:get-always-on-top'),
  setAlwaysOnTop: (value) => ipcRenderer.invoke('opendeck:set-always-on-top', Boolean(value)),
  onAlwaysOnTopChange: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, value) => callback(Boolean(value));
    ipcRenderer.on('opendeck:always-on-top-changed', listener);
    return () => ipcRenderer.removeListener('opendeck:always-on-top-changed', listener);
  },
  getObsPortInfo: () => ipcRenderer.invoke('opendeck:get-obs-port-info'),
});
