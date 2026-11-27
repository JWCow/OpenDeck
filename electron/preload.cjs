'use strict';

const { contextBridge, ipcRenderer } = require('electron');

function readVersionArg() {
  const prefix = '--opendeck-version=';
  const hit = process.argv.find((arg) => typeof arg === 'string' && arg.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : '';
}

function subscribe(channel, callback, transform) {
  if (typeof callback !== 'function') return () => {};
  const listener = (_event, value) => callback(transform ? transform(value) : value);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('opendeckDesktop', {
  version: readVersionArg(),
  platform: process.platform,
  getAlwaysOnTop: () => ipcRenderer.invoke('opendeck:get-always-on-top'),
  setAlwaysOnTop: (value) => ipcRenderer.invoke('opendeck:set-always-on-top', Boolean(value)),
  onAlwaysOnTopChange: (callback) => subscribe('opendeck:always-on-top-changed', callback, Boolean),
  getObsPortInfo: () => ipcRenderer.invoke('opendeck:get-obs-port-info'),
  rediscoverObsPort: () => ipcRenderer.invoke('opendeck:rediscover-obs-port'),
  onObsPortChanged: (callback) => subscribe('opendeck:obs-port-changed', callback),
  triggerPanic: () => ipcRenderer.invoke('opendeck:trigger-panic'),
  onTriggerPanic: (callback) => subscribe('opendeck:trigger-panic', callback),
  triggerPad: (target) => ipcRenderer.invoke('opendeck:trigger-pad', target),
  onTriggerPad: (callback) => subscribe('opendeck:trigger-pad', callback),
  onSwitchPage: (callback) => subscribe('opendeck:switch-page', callback),
  updateStatus: (status) => ipcRenderer.send('opendeck:update-status', status),
  getGlobalShortcuts: () => ipcRenderer.invoke('opendeck:get-global-shortcuts'),
  setGlobalShortcuts: (shortcuts) => ipcRenderer.invoke('opendeck:set-global-shortcuts', shortcuts),
  getDesktopPrefs: () => ipcRenderer.invoke('opendeck:get-desktop-prefs'),
  setDesktopPrefs: (prefs) => ipcRenderer.invoke('opendeck:set-desktop-prefs', prefs),
  startPhoneHost: (layoutJson, obsPort) => ipcRenderer.invoke('opendeck:start-phone-host', { layoutJson, obsPort }),
  stopPhoneHost: () => ipcRenderer.invoke('opendeck:stop-phone-host'),
  updatePhoneHostLayout: (layoutJson, obsPort) =>
    ipcRenderer.invoke('opendeck:update-phone-host-layout', { layoutJson, obsPort }),
  getPhoneHostStatus: () => ipcRenderer.invoke('opendeck:get-phone-host-status'),
});
