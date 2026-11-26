'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_WIDTH = 960;
const DEFAULT_HEIGHT = 720;
const MIN_WIDTH = 360;
const MIN_HEIGHT = 420;

function getStateFilePath(app) {
  return path.join(app.getPath('userData'), 'window-state.json');
}

function boundsIntersectAnyDisplay(bounds, displays) {
  if (
    !Number.isFinite(bounds.x) ||
    !Number.isFinite(bounds.y) ||
    !Number.isFinite(bounds.width) ||
    !Number.isFinite(bounds.height)
  ) {
    return false;
  }

  return displays.some((display) => {
    const wa = display && display.workArea;
    if (!wa) return false;
    const overlapX = Math.min(bounds.x + bounds.width, wa.x + wa.width) - Math.max(bounds.x, wa.x);
    const overlapY = Math.min(bounds.y + bounds.height, wa.y + wa.height) - Math.max(bounds.y, wa.y);
    return overlapX >= 64 && overlapY >= 48;
  });
}

function sanitizeState(raw, screen) {
  const width = Number.isFinite(raw?.width) ? Math.max(MIN_WIDTH, Math.round(raw.width)) : DEFAULT_WIDTH;
  const height = Number.isFinite(raw?.height) ? Math.max(MIN_HEIGHT, Math.round(raw.height)) : DEFAULT_HEIGHT;
  const isMaximized = Boolean(raw?.isMaximized);
  const alwaysOnTop = Boolean(raw?.alwaysOnTop);

  const state = {
    width,
    height,
    isMaximized,
    alwaysOnTop,
  };

  if (Number.isFinite(raw?.x) && Number.isFinite(raw?.y)) {
    const candidate = {
      x: Math.round(raw.x),
      y: Math.round(raw.y),
      width,
      height,
    };
    const displays = screen.getAllDisplays();
    if (boundsIntersectAnyDisplay(candidate, displays)) {
      state.x = candidate.x;
      state.y = candidate.y;
    }
  }

  return state;
}

function loadWindowState(app, screen) {
  try {
    const raw = JSON.parse(fs.readFileSync(getStateFilePath(app), 'utf8'));
    return sanitizeState(raw, screen);
  } catch {
    return sanitizeState({}, screen);
  }
}

function writeWindowState(app, state) {
  try {
    const filePath = getStateFilePath(app);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(state, null, 2) + '\n', 'utf8');
  } catch {
    // Non-fatal: ignore persistence failures on read-only or restricted paths.
  }
}

function trackWindowState(win, initialState, app, screen) {
  const current = { ...initialState };
  let saveTimer = null;

  function captureBounds() {
    if (!win || win.isDestroyed()) return;
    current.isMaximized = win.isMaximized();
    current.alwaysOnTop = win.isAlwaysOnTop();
    if (!current.isMaximized && !win.isMinimized() && !win.isFullScreen()) {
      const b = win.getNormalBounds();
      if (boundsIntersectAnyDisplay(b, screen.getAllDisplays())) {
        current.x = b.x;
        current.y = b.y;
      }
      current.width = Math.max(MIN_WIDTH, b.width);
      current.height = Math.max(MIN_HEIGHT, b.height);
    }
  }

  function saveNow() {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    captureBounds();
    writeWindowState(app, current);
  }

  function scheduleSave() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 250);
  }

  win.on('resize', scheduleSave);
  win.on('move', scheduleSave);
  win.on('maximize', saveNow);
  win.on('unmaximize', saveNow);
  win.on('close', saveNow);

  return {
    saveNow,
    getState: () => ({ ...current }),
  };
}

module.exports = {
  MIN_WIDTH,
  MIN_HEIGHT,
  DEFAULT_WIDTH,
  DEFAULT_HEIGHT,
  loadWindowState,
  trackWindowState,
};
