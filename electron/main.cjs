'use strict';

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const {
  app,
  BrowserWindow,
  Menu,
  Tray,
  ipcMain,
  nativeImage,
  net,
  protocol,
  screen,
  session,
  shell,
} = require('electron');

const pkg = require('./package.json');
const { discoverObsPort } = require('./obs-discovery.cjs');
const { MIN_WIDTH, MIN_HEIGHT, loadWindowState, trackWindowState } = require('./window-state.cjs');

const RELEASES_URL = 'https://github.com/JWCow/OpenDeck/releases';
const APP_ORIGIN = 'app://opendeck';
const APP_ROOT = app.isPackaged ? path.join(__dirname, 'app') : path.resolve(__dirname, '..');

let mainWindow = null;
let tray = null;
let stateTracker = null;

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

function focusMainWindow() {
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
    const trayMenu = Menu.buildFromTemplate([
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
    return discoverObsPort();
  });
}

function createWindow() {
  const initialState = loadWindowState(app, screen);
  const iconPath = resolveAssetPath(
    process.platform === 'win32' ? ['icon.ico', 'icon.png'] : ['icon.png']
  );

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
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (initialState.isMaximized) {
      mainWindow.maximize();
    }
    mainWindow.show();
    refreshMenus();
  });

  mainWindow.on('show', refreshMenus);
  mainWindow.on('hide', refreshMenus);
  mainWindow.on('closed', () => {
    stateTracker = null;
    mainWindow = null;
    refreshMenus();
  });

  const obsInfo = discoverObsPort();
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
    registerAppProtocol();
    setupDownloads();
    registerIpcHandlers();
    createWindow();
    setupTray();
    refreshMenus();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      } else {
        focusMainWindow();
      }
    });
  });

  app.on('before-quit', () => {
    if (stateTracker) stateTracker.saveNow();
    if (tray && !tray.isDestroyed()) {
      tray.destroy();
      tray = null;
    }
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}
