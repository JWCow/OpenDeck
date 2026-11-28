'use strict';

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const {
  app,
  BrowserWindow,
  Menu,
  Tray,
  globalShortcut,
  ipcMain,
  nativeImage,
  net,
  protocol,
  screen,
  session,
  shell,
} = require('electron');

const pkg = require('./package.json');
const { discoverObsPort, isSameObsDiscovery } = require('./obs-discovery.cjs');
const { MIN_WIDTH, MIN_HEIGHT, loadWindowState, trackWindowState } = require('./window-state.cjs');
const { createPhoneHost } = require('./phone-host.cjs');

const RELEASES_URL = 'https://github.com/JWCow/OpenDeck/releases';
const APP_ORIGIN = 'app://opendeck';
const APP_ROOT = app.isPackaged ? path.join(__dirname, 'app') : path.resolve(__dirname, '..');
const OBS_POLL_INTERVAL_MS = 5000;

let mainWindow = null;
let splashWindow = null;
let tray = null;
let stateTracker = null;
let isQuitting = false;
let obsPollTimer = null;
let lastDiscoveredObs = { port: null, enabled: false, source: null };

let obsStatus = {
  connected: false,
  streaming: false,
  recording: false,
  programScene: '',
  activePageId: '',
  pages: [],
};

let desktopPrefs = {
  launchAtLogin: false,
  minimizeToTray: false,
  globalShortcuts: {
    toggleWindow: '',
    panic: '',
    pads: [],
  },
};

const phoneHost = createPhoneHost({ rootDir: APP_ROOT, preferredPort: 8765 });

// Windows Chromium GPU processes can crash (0xC0000005) in Skia Graphite before
// falling back; disabling SkiaGraphite keeps hardware gpu_compositing enabled.
if (process.platform === 'win32') {
  const existing = app.commandLine.getSwitchValue('disable-features');
  const features = existing ? existing.split(',').map((s) => s.trim()).filter(Boolean) : [];
  if (!features.includes('SkiaGraphite')) {
    features.push('SkiaGraphite');
    app.commandLine.appendSwitch('disable-features', features.join(','));
  }
}

// Must be called before app.whenReady().
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    focusMainWindow();
  });
}

function getPrefsFilePath() {
  return path.join(app.getPath('userData'), 'desktop-prefs.json');
}

function normalizeAccelerator(raw) {
  if (typeof raw !== 'string') return '';
  return raw.trim().slice(0, 64);
}

function sanitizeGlobalShortcuts(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const pads = Array.isArray(src.pads)
    ? src.pads
        .slice(0, 16)
        .map((entry) => ({
          accelerator: normalizeAccelerator(entry?.accelerator),
          pageId: typeof entry?.pageId === 'string' ? entry.pageId.slice(0, 80) : '',
          padIdx: Number.isInteger(Number(entry?.padIdx)) && Number(entry.padIdx) >= 0 ? Number(entry.padIdx) : -1,
        }))
        .filter((entry) => entry.accelerator && entry.pageId && entry.padIdx >= 0)
    : [];

  return {
    toggleWindow: normalizeAccelerator(src.toggleWindow),
    panic: normalizeAccelerator(src.panic),
    pads,
  };
}

function sanitizeDesktopPrefs(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  return {
    launchAtLogin: Boolean(src.launchAtLogin),
    minimizeToTray: Boolean(src.minimizeToTray),
    globalShortcuts: sanitizeGlobalShortcuts(src.globalShortcuts),
  };
}

function loadDesktopPrefs() {
  try {
    const parsed = JSON.parse(fs.readFileSync(getPrefsFilePath(), 'utf8'));
    desktopPrefs = sanitizeDesktopPrefs(parsed);
  } catch {
    desktopPrefs = sanitizeDesktopPrefs({});
  }
  return desktopPrefs;
}

function saveDesktopPrefs() {
  try {
    const filePath = getPrefsFilePath();
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(desktopPrefs, null, 2) + '\n', 'utf8');
  } catch {
    // Non-fatal: ignore persistence failures on restricted paths.
  }
}

function applyLaunchAtLogin(enabled) {
  try {
    app.setLoginItemSettings({ openAtLogin: Boolean(enabled) });
  } catch {
    // Ignore on platforms/environments where login item settings are unsupported.
  }
}

function sendToRenderer(channel, payload) {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  if (!mainWindow.webContents || mainWindow.webContents.isDestroyed()) return false;
  mainWindow.webContents.send(channel, payload);
  return true;
}

function triggerPanicInRenderer() {
  return sendToRenderer('opendeck:trigger-panic');
}

function triggerPadInRenderer(target) {
  if (!target || typeof target !== 'object') return false;
  const pageId = typeof target.pageId === 'string' ? target.pageId.slice(0, 80) : '';
  const padIdx = Number(target.padIdx);
  if (!pageId || !Number.isInteger(padIdx) || padIdx < 0) return false;
  return sendToRenderer('opendeck:trigger-pad', { pageId, padIdx });
}

function applyGlobalShortcuts(nextShortcuts) {
  const clean = sanitizeGlobalShortcuts(nextShortcuts);
  desktopPrefs.globalShortcuts = clean;
  saveDesktopPrefs();

  const failed = [];
  const registered = [];

  if (!app.isReady()) {
    return { ok: true, shortcuts: clean, registered, failed };
  }

  try {
    globalShortcut.unregisterAll();
  } catch {}

  const seen = new Set();
  const tryRegister = (accel, handler) => {
    if (!accel) return;
    const key = accel.toLowerCase();
    if (seen.has(key)) {
      failed.push(accel);
      return;
    }
    seen.add(key);
    try {
      const ok = globalShortcut.register(accel, handler);
      if (ok) registered.push(accel);
      else failed.push(accel);
    } catch {
      failed.push(accel);
    }
  };

  tryRegister(clean.toggleWindow, () => toggleMainWindowVisibility());
  tryRegister(clean.panic, () => triggerPanicInRenderer());
  for (const padEntry of clean.pads) {
    tryRegister(padEntry.accelerator, () =>
      triggerPadInRenderer({ pageId: padEntry.pageId, padIdx: padEntry.padIdx })
    );
  }

  return {
    ok: failed.length === 0,
    shortcuts: clean,
    registered,
    failed,
  };
}

/**
 * Sanitize one-way OBS/Deck summary pushed by the renderer (no credentials allowed per ADR-0002).
 */
function sanitizeObsStatus(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const pages = Array.isArray(src.pages)
    ? src.pages
        .slice(0, 24)
        .map((p) => ({
          id: typeof p?.id === 'string' ? p.id.slice(0, 80) : '',
          name: typeof p?.name === 'string' ? p.name.slice(0, 80) : 'Page',
        }))
        .filter((p) => p.id)
    : [];

  return {
    connected: Boolean(src.connected),
    streaming: Boolean(src.streaming),
    recording: Boolean(src.recording),
    programScene: typeof src.programScene === 'string' ? src.programScene.slice(0, 120) : '',
    activePageId: typeof src.activePageId === 'string' ? src.activePageId.slice(0, 80) : '',
    pages,
  };
}

function escapeMenuLabel(text) {
  return String(text || '').replace(/&/g, '&&');
}

function formatStatusLabel() {
  if (!obsStatus.connected) return 'OBS: Disconnected';
  const flags = [];
  if (obsStatus.streaming) flags.push('LIVE');
  if (obsStatus.recording) flags.push('REC');
  const state = flags.length ? flags.join(' • ') : 'Connected';
  return obsStatus.programScene ? `OBS: ${state} • ${obsStatus.programScene}` : `OBS: ${state}`;
}

function formatTrayTooltip() {
  if (!obsStatus.connected) return 'OpenDeck — Disconnected';
  const flags = [];
  if (obsStatus.streaming) flags.push('LIVE');
  if (obsStatus.recording) flags.push('REC');
  const state = flags.length ? flags.join(' • ') : 'Connected';
  return obsStatus.programScene ? `OpenDeck — ${state} • ${obsStatus.programScene}` : `OpenDeck — ${state}`;
}

function syncObsPoller() {
  if (obsStatus.connected || !mainWindow || mainWindow.isDestroyed()) {
    if (obsPollTimer) {
      clearInterval(obsPollTimer);
      obsPollTimer = null;
    }
    return;
  }
  if (obsPollTimer) return;
  obsPollTimer = setInterval(() => {
    if (obsStatus.connected || !mainWindow || mainWindow.isDestroyed()) {
      syncObsPoller();
      return;
    }
    const next = discoverObsPort();
    if (!isSameObsDiscovery(next, lastDiscoveredObs)) {
      lastDiscoveredObs = next;
      sendToRenderer('opendeck:obs-port-changed', next);
    }
  }, OBS_POLL_INTERVAL_MS);
}

function focusMainWindow() {
  if (splashWindow && !splashWindow.isDestroyed()) {
    if (splashWindow.isMinimized()) splashWindow.restore();
    splashWindow.focus();
    return;
  }
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (!mainWindow.isVisible()) mainWindow.show();
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
}

function toggleMainWindowVisibility() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
    return;
  }
  if (mainWindow.isVisible() && !mainWindow.isMinimized()) {
    mainWindow.hide();
  } else {
    focusMainWindow();
  }
}

function resolveAssetPath(candidates) {
  for (const rel of candidates) {
    const full = path.join(__dirname, 'assets', rel);
    if (fs.existsSync(full)) return full;
  }
  return null;
}

function setAlwaysOnTop(enabled) {
  const next = Boolean(enabled);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setAlwaysOnTop(next);
    mainWindow.webContents.send('opendeck:always-on-top-changed', next);
  }
  if (stateTracker) {
    stateTracker.saveNow();
  }
  refreshMenus();
  return next;
}

function updateDesktopPrefs(partial) {
  const src = partial && typeof partial === 'object' ? partial : {};
  if ('launchAtLogin' in src) {
    desktopPrefs.launchAtLogin = Boolean(src.launchAtLogin);
    applyLaunchAtLogin(desktopPrefs.launchAtLogin);
  }
  if ('minimizeToTray' in src) {
    desktopPrefs.minimizeToTray = Boolean(src.minimizeToTray);
  }
  if ('globalShortcuts' in src) {
    applyGlobalShortcuts(src.globalShortcuts);
  } else {
    saveDesktopPrefs();
  }
  refreshMenus();
  return {
    launchAtLogin: desktopPrefs.launchAtLogin,
    minimizeToTray: desktopPrefs.minimizeToTray,
  };
}

function buildToggleActions() {
  const isOnTop = Boolean(mainWindow && !mainWindow.isDestroyed() && mainWindow.isAlwaysOnTop());
  const isVisible = Boolean(mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible());

  return {
    isOnTop,
    isVisible,
    toggleShowHide: () => toggleMainWindowVisibility(),
    toggleAlwaysOnTop: (checked) => setAlwaysOnTop(checked),
    reloadWindow: () => {
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.reload();
    },
    toggleDevTools: () => {
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.toggleDevTools();
    },
    toggleFullscreen: () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.setFullScreen(!mainWindow.isFullScreen());
      }
    },
    openReleases: () => {
      shell.openExternal(RELEASES_URL).catch(() => {});
    },
  };
}

function refreshMenus() {
  const actions = buildToggleActions();

  const windowSubmenu = [
    {
      label: actions.isVisible ? 'Hide OpenDeck' : 'Show OpenDeck',
      click: actions.toggleShowHide,
    },
    {
      label: 'Always on Top',
      type: 'checkbox',
      checked: actions.isOnTop,
      accelerator: 'CmdOrCtrl+Shift+T',
      click: (item) => actions.toggleAlwaysOnTop(item.checked),
    },
    {
      label: 'Minimize to Tray',
      type: 'checkbox',
      checked: desktopPrefs.minimizeToTray,
      click: (item) => updateDesktopPrefs({ minimizeToTray: item.checked }),
    },
    {
      label: 'Launch at Login',
      type: 'checkbox',
      checked: desktopPrefs.launchAtLogin,
      click: (item) => updateDesktopPrefs({ launchAtLogin: item.checked }),
    },
    { type: 'separator' },
    {
      label: 'Reload',
      accelerator: 'CmdOrCtrl+R',
      click: actions.reloadWindow,
    },
    {
      label: 'Toggle DevTools',
      accelerator: 'F12',
      click: actions.toggleDevTools,
    },
    {
      label: 'Fullscreen',
      accelerator: 'F11',
      click: actions.toggleFullscreen,
    },
    { type: 'separator' },
    {
      label: 'Open GitHub Releases',
      click: actions.openReleases,
    },
  ];

  if (process.platform !== 'darwin') {
    windowSubmenu.push({ type: 'separator' }, { role: 'quit', label: 'Quit' });
  }

  const appMenuTemplate = [
    ...(process.platform === 'darwin'
      ? [
          {
            label: pkg.productName || 'OpenDeck',
            submenu: [
              { role: 'about' },
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit' },
            ],
          },
        ]
      : []),
    { label: 'File', submenu: windowSubmenu },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        {
          label: 'Always on Top',
          type: 'checkbox',
          checked: actions.isOnTop,
          click: (item) => actions.toggleAlwaysOnTop(item.checked),
        },
        {
          label: 'Reload',
          click: actions.reloadWindow,
        },
        {
          label: 'Toggle DevTools',
          click: actions.toggleDevTools,
        },
        { role: 'togglefullscreen' },
      ],
    },
    ...(process.platform === 'darwin' ? [{ role: 'windowMenu' }] : []),
    {
      label: 'Help',
      submenu: [
        {
          label: 'Open GitHub Releases',
          click: actions.openReleases,
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(appMenuTemplate));

  if (tray && !tray.isDestroyed()) {
    tray.setToolTip(formatTrayTooltip());
    if (process.platform === 'darwin' && typeof tray.setTitle === 'function') {
      const macTitle = obsStatus.streaming ? ' LIVE' : obsStatus.recording ? ' REC' : '';
      tray.setTitle(macTitle);
    }

    const pageItems = obsStatus.pages.length
      ? obsStatus.pages.map((p) => ({
          label: escapeMenuLabel(p.name),
          type: 'radio',
          checked: p.id === obsStatus.activePageId,
          click: () => sendToRenderer('opendeck:switch-page', { pageId: p.id }),
        }))
      : [{ label: 'No Pages', enabled: false }];

    const hostStatus = phoneHost.getStatus();
    const phoneHostItems = hostStatus.running
      ? [
          { label: `Phone Deck: ${escapeMenuLabel(hostStatus.primaryUrl)}`, enabled: false },
          {
            label: 'Stop Phone Deck Host',
            click: () => {
              phoneHost.stop().then(() => refreshMenus()).catch(() => {});
            },
          },
          { type: 'separator' },
        ]
      : [];

    const trayMenu = Menu.buildFromTemplate([
      { label: escapeMenuLabel(formatStatusLabel()), enabled: false },
      { type: 'separator' },
      {
        label: actions.isVisible ? 'Hide OpenDeck' : 'Show OpenDeck',
        click: actions.toggleShowHide,
      },
      {
        label: 'Always on Top',
        type: 'checkbox',
        checked: actions.isOnTop,
        click: (item) => actions.toggleAlwaysOnTop(item.checked),
      },
      {
        label: 'Trigger PANIC',
        enabled: obsStatus.connected,
        click: () => triggerPanicInRenderer(),
      },
      {
        label: 'Switch Page',
        submenu: pageItems,
      },
      { type: 'separator' },
      ...phoneHostItems,
      {
        label: 'Minimize to Tray',
        type: 'checkbox',
        checked: desktopPrefs.minimizeToTray,
        click: (item) => updateDesktopPrefs({ minimizeToTray: item.checked }),
      },
      {
        label: 'Launch at Login',
        type: 'checkbox',
        checked: desktopPrefs.launchAtLogin,
        click: (item) => updateDesktopPrefs({ launchAtLogin: item.checked }),
      },
      { type: 'separator' },
      { label: 'Reload', click: actions.reloadWindow },
      { label: 'Toggle DevTools', click: actions.toggleDevTools },
      { label: 'Fullscreen', click: actions.toggleFullscreen },
      { type: 'separator' },
      { label: 'Open GitHub Releases', click: actions.openReleases },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() },
    ]);
    tray.setContextMenu(trayMenu);
  }
}

function setupTray() {
  const candidates =
    process.platform === 'darwin'
      ? ['trayTemplate.png', 'tray.png', 'icon.png']
      : ['tray.png', 'icon.png'];
  const trayPath = resolveAssetPath(candidates);
  if (!trayPath) return;

  let icon = nativeImage.createFromPath(trayPath);
  if (icon.isEmpty()) return;

  if (process.platform === 'darwin') {
    if (path.basename(trayPath) === 'trayTemplate.png') {
      icon.setTemplateImage(true);
    } else {
      icon = icon.resize({ width: 18, height: 18 });
    }
  }

  tray = new Tray(icon);
  tray.setToolTip('OpenDeck');
  tray.on('click', () => toggleMainWindowVisibility());
  refreshMenus();
}

function registerAppProtocol() {
  protocol.handle('app', async (request) => {
    try {
      const parsed = new URL(request.url);
      if (parsed.hostname !== 'opendeck') {
        return new Response('Not Found', { status: 404 });
      }

      const decodedPath = decodeURIComponent(parsed.pathname || '/');
      const relPath = decodedPath.replace(/^\/+/, '') || 'deck.html';
      const resolved = path.resolve(APP_ROOT, relPath);
      const relCheck = path.relative(APP_ROOT, resolved);

      if (relCheck.startsWith('..') || path.isAbsolute(relCheck)) {
        return new Response('Forbidden', { status: 403 });
      }

      let stat;
      try {
        stat = await fs.promises.stat(resolved);
      } catch {
        return new Response('Not Found', { status: 404 });
      }

      if (!stat.isFile()) {
        return new Response('Not Found', { status: 404 });
      }

      return net.fetch(pathToFileURL(resolved).toString());
    } catch {
      return new Response('Bad Request', { status: 400 });
    }
  });
}

function setupDownloads() {
  session.defaultSession.on('will-download', (_event, item) => {
    const rawName = path.basename(item.getFilename() || 'obs-virtual-deck.json');
    const safeName = rawName.replace(/[\\/:*?"<>|]/g, '_') || 'obs-virtual-deck.json';
    const defaultPath = path.join(app.getPath('downloads'), safeName);
    item.setSaveDialogOptions({
      title: 'Save OpenDeck File',
      defaultPath,
    });
  });
}

function registerIpcHandlers() {
  ipcMain.handle('opendeck:get-always-on-top', () => {
    return Boolean(mainWindow && !mainWindow.isDestroyed() && mainWindow.isAlwaysOnTop());
  });

  ipcMain.handle('opendeck:set-always-on-top', (_event, value) => {
    return setAlwaysOnTop(Boolean(value));
  });

  ipcMain.handle('opendeck:get-obs-port-info', () => {
    lastDiscoveredObs = discoverObsPort();
    return lastDiscoveredObs;
  });

  ipcMain.handle('opendeck:rediscover-obs-port', () => {
    lastDiscoveredObs = discoverObsPort();
    return lastDiscoveredObs;
  });

  ipcMain.handle('opendeck:trigger-panic', () => {
    return triggerPanicInRenderer();
  });

  ipcMain.handle('opendeck:trigger-pad', (_event, target) => {
    return triggerPadInRenderer(target);
  });

  ipcMain.on('opendeck:update-status', (_event, rawStatus) => {
    obsStatus = sanitizeObsStatus(rawStatus);
    syncObsPoller();
    refreshMenus();
  });

  ipcMain.handle('opendeck:get-global-shortcuts', () => {
    return { ...desktopPrefs.globalShortcuts, pads: desktopPrefs.globalShortcuts.pads.map((p) => ({ ...p })) };
  });

  ipcMain.handle('opendeck:set-global-shortcuts', (_event, nextShortcuts) => {
    return applyGlobalShortcuts(nextShortcuts);
  });

  ipcMain.handle('opendeck:get-desktop-prefs', () => {
    return {
      launchAtLogin: desktopPrefs.launchAtLogin,
      minimizeToTray: desktopPrefs.minimizeToTray,
    };
  });

  ipcMain.handle('opendeck:set-desktop-prefs', (_event, partial) => {
    return updateDesktopPrefs(partial);
  });

  ipcMain.handle('opendeck:start-phone-host', async (_event, payload) => {
    const status = await phoneHost.start(payload?.layoutJson, payload?.obsPort);
    refreshMenus();
    return status;
  });

  ipcMain.handle('opendeck:stop-phone-host', async () => {
    const status = await phoneHost.stop();
    refreshMenus();
    return status;
  });

  ipcMain.handle('opendeck:update-phone-host-layout', (_event, payload) => {
    return phoneHost.updateLayout(payload?.layoutJson, payload?.obsPort);
  });

  ipcMain.handle('opendeck:get-phone-host-status', () => {
    return phoneHost.getStatus();
  });
}

function closeSplashWindow() {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.close();
  }
  splashWindow = null;
}

function createSplashWindow(iconPath) {
  if (splashWindow && !splashWindow.isDestroyed()) return;

  const safeVersion = String(pkg.version || '').replace(/[^0-9A-Za-z._-]/g, '');
  const splashHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body {
    width: 100%; height: 100%; overflow: hidden;
    background: #0b0c0f; color: #f3f4f6;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    user-select: none; -webkit-app-region: drag;
  }
  .wrap {
    width: 100%; height: 100%;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 10px; border: 1px solid #22252e; border-radius: 10px;
  }
  .title { font-size: 16px; font-weight: 700; letter-spacing: 0.2px; }
  .ver { font-size: 11px; color: #8e96a8; }
  .status { font-size: 12px; color: #a8b0c0; margin-top: 2px; }
  .bar {
    width: 140px; height: 3px; border-radius: 2px;
    background: #1c2029; overflow: hidden; margin-top: 4px;
  }
  .bar::after {
    content: ""; display: block; width: 45%; height: 100%;
    background: #ff4d3d; border-radius: 2px;
    animation: slide 1.1s ease-in-out infinite;
  }
  @keyframes slide {
    0% { transform: translateX(-100%); }
    100% { transform: translateX(240%); }
  }
</style>
</head>
<body>
  <div class="wrap">
    <svg width="36" height="36" viewBox="0 0 22 22" aria-hidden="true">
      <rect x="1" y="1" width="9" height="9" rx="2.5" fill="#f3f4f6"/>
      <rect x="12" y="1" width="9" height="9" rx="2.5" fill="#f3f4f6" opacity=".3"/>
      <rect x="1" y="12" width="9" height="9" rx="2.5" fill="#f3f4f6" opacity=".3"/>
      <rect x="12" y="12" width="9" height="9" rx="2.5" fill="#ff4d3d"/>
    </svg>
    <div class="title">OpenDeck</div>
    ${safeVersion ? `<div class="ver">v${safeVersion}</div>` : ''}
    <div class="status">Starting OpenDeck…</div>
    <div class="bar"></div>
  </div>
</body>
</html>`;

  const splashOptions = {
    width: 300,
    height: 190,
    frame: false,
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    skipTaskbar: false,
    center: true,
    backgroundColor: '#0b0c0f',
    show: true,
    title: 'OpenDeck',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  };
  if (iconPath) {
    splashOptions.icon = iconPath;
  }

  splashWindow = new BrowserWindow(splashOptions);
  splashWindow.setMenuBarVisibility(false);
  splashWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  splashWindow.webContents.on('will-navigate', (event) => {
    event.preventDefault();
  });
  splashWindow.on('closed', () => {
    splashWindow = null;
  });
  splashWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(splashHtml)}`);
}

function createWindow() {
  const initialState = loadWindowState(app, screen);
  const iconPath = resolveAssetPath(
    process.platform === 'win32' ? ['icon.ico', 'icon.png'] : ['icon.png']
  );

  createSplashWindow(iconPath);

  const windowOptions = {
    width: initialState.width,
    height: initialState.height,
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    title: 'OpenDeck',
    backgroundColor: '#0b0c0f',
    show: false,
    alwaysOnTop: Boolean(initialState.alwaysOnTop),
    autoHideMenuBar: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.cjs'),
      additionalArguments: [`--opendeck-version=${pkg.version}`],
    },
  };

  if (Number.isFinite(initialState.x) && Number.isFinite(initialState.y)) {
    windowOptions.x = initialState.x;
    windowOptions.y = initialState.y;
  }
  if (iconPath) {
    windowOptions.icon = iconPath;
  }

  mainWindow = new BrowserWindow(windowOptions);
  stateTracker = trackWindowState(mainWindow, initialState, app, screen);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
        shell.openExternal(parsed.toString()).catch(() => {});
      }
    } catch {
      // Ignore invalid URLs.
    }
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, targetUrl) => {
    try {
      const parsed = new URL(targetUrl);
      if (parsed.origin !== APP_ORIGIN) {
        event.preventDefault();
      }
    } catch {
      event.preventDefault();
    }
  });

  mainWindow.once('ready-to-show', () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      closeSplashWindow();
      return;
    }
    if (initialState.isMaximized) {
      mainWindow.maximize();
    }
    mainWindow.show();
    closeSplashWindow();
    refreshMenus();
    syncObsPoller();
  });

  mainWindow.webContents.once('did-fail-load', () => {
    closeSplashWindow();
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
      mainWindow.show();
    }
  });

  mainWindow.on('minimize', (event) => {
    if (!isQuitting && desktopPrefs.minimizeToTray && tray && !tray.isDestroyed()) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('show', refreshMenus);
  mainWindow.on('hide', refreshMenus);
  mainWindow.on('closed', () => {
    closeSplashWindow();
    stateTracker = null;
    mainWindow = null;
    syncObsPoller();
    refreshMenus();
  });

  const obsInfo = discoverObsPort();
  lastDiscoveredObs = obsInfo;
  const startUrl = new URL(`${APP_ORIGIN}/deck.html`);
  if (obsInfo.enabled && obsInfo.port) {
    startUrl.searchParams.set('port', String(obsInfo.port));
  }
  mainWindow.loadURL(startUrl.toString());
}

if (gotSingleInstanceLock) {
  app.whenReady().then(() => {
    app.setAppUserModelId('com.jwcow.opendeck');
    if (process.platform === 'darwin' && !app.isPackaged && app.dock && typeof app.dock.setIcon === 'function') {
      const dockIconPath = resolveAssetPath(['icon.png']);
      if (dockIconPath) app.dock.setIcon(dockIconPath);
    }
    loadDesktopPrefs();
    applyLaunchAtLogin(desktopPrefs.launchAtLogin);
    registerAppProtocol();
    setupDownloads();
    registerIpcHandlers();
    createWindow();
    setupTray();
    applyGlobalShortcuts(desktopPrefs.globalShortcuts);
    refreshMenus();

    app.on('activate', () => {
      if (!mainWindow || mainWindow.isDestroyed()) {
        createWindow();
      } else {
        focusMainWindow();
      }
    });
  });

  app.on('before-quit', () => {
    isQuitting = true;
    closeSplashWindow();
    if (obsPollTimer) {
      clearInterval(obsPollTimer);
      obsPollTimer = null;
    }
    phoneHost.stop().catch(() => {});
    if (stateTracker) stateTracker.saveNow();
    if (tray && !tray.isDestroyed()) {
      tray.destroy();
      tray = null;
    }
  });

  app.on('will-quit', () => {
    try {
      globalShortcut.unregisterAll();
    } catch {}
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}
