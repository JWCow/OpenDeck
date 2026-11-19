(() => {
  'use strict';

  const VERSION = '2.2.1';
  const STORAGE_KEY = 'opendeck_config';
  const LEGACY_STORAGE_KEYS = ['obs_virtual_deck_v2', 'obs_deck_config_v2', 'obs_virtual_deck_v1'];
  let initialSaveFailed = false;
  const PROBE_PORTS = [4455, 4456, 4457, 4458, 4444];
  const MIN_COLS = 2;
  const MAX_COLS = 12;
  const MIN_ROWS = 2;
  const MAX_ROWS = 10;
  const DEFAULT_COLS = 8;
  const DEFAULT_ROWS = 8;
  const COLORS = ['#222733', '#1e3a8a', '#115e59', '#166534', '#854d0e', '#991b1b', '#581c87', '#831843'];
  const PAD_TYPES = [
    'none', 'scene', 'source', 'filter', 'mute', 'macro', 'panic',
    'page', 'studio', 'output', 'media', 'screenshot', 'browser', 'volume',
    'profile', 'collection', 'transition',
    'stats', 'hotkey', 'chapter', 'monitor', 'transform', 'image',
  ];
  const AUTO_OFF_TYPES = new Set(['source', 'filter', 'mute', 'studio', 'output', 'media']);
  const HOLD_TYPES = new Set(['mute', 'source', 'filter']);
  const MONITOR_TYPES = [
    'OBS_MONITORING_TYPE_NONE',
    'OBS_MONITORING_TYPE_MONITOR_ONLY',
    'OBS_MONITORING_TYPE_MONITOR_AND_OUTPUT',
  ];
  const TRANSFORM_PRESETS = ['toggle_pip', 'pip_tr', 'pip_br', 'pip_tl', 'pip_bl', 'center_half', 'full_reset'];

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));

  // Pure-JS UTF-8 SHA-256 -> Base64 (works on file:// and non-HTTPS LAN URLs)
  function sha256Base64(str) {
    const bytes = new TextEncoder().encode(str);
    const K = [
      0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
      0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
      0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
      0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
      0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
      0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
      0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
      0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
    ];
    const H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    const bitLen = bytes.length * 8;
    const padLen = ((bytes.length + 8) >> 6) + 1;
    const buf = new Uint8Array(padLen * 64);
    buf.set(bytes);
    buf[bytes.length] = 0x80;
    const dv = new DataView(buf.buffer);
    dv.setUint32(buf.length - 8, Math.floor(bitLen / 0x100000000), false);
    dv.setUint32(buf.length - 4, bitLen >>> 0, false);
    const w = new Int32Array(64);
    const rotr = (x, n) => (x >>> n) | (x << (32 - n));
    for (let o = 0; o < buf.length; o += 64) {
      for (let i = 0; i < 16; i++) w[i] = dv.getInt32(o + i * 4, false);
      for (let i = 16; i < 64; i++) {
        const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
        const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
      }
      let [a, b, c, d, e, f, g, h] = H;
      for (let i = 0; i < 64; i++) {
        const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
        const ch = (e & f) ^ ((~e) & g);
        const t1 = (h + S1 + ch + K[i] + w[i]) | 0;
        const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
        const maj = (a & b) ^ (a & c) ^ (b & c);
        const t2 = (S0 + maj) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0;
        d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
      H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
    }
    const out = new Uint8Array(32);
    const odv = new DataView(out.buffer);
    H.forEach((v, i) => odv.setInt32(i * 4, v, false));
    let bin = '';
    for (const b of out) bin += String.fromCharCode(b);
    return btoa(bin);
  }

  function clampInt(val, min, max, fallback) {
    const n = Math.round(Number(val));
    if (!Number.isFinite(n) || n < 1) return fallback;
    return Math.max(min, Math.min(max, n));
  }

  function parseValidPort(raw) {
    if (raw == null || raw === '') return null;
    const n = Number(raw);
    return Number.isInteger(n) && n >= 1 && n <= 65535 ? n : null;
  }

  function parseValidHost(raw) {
    if (raw == null) return null;
    const str = String(raw).trim();
    if (!str) return null;
    const clean = str.replace(/\/.*$/, '').trim();
    return clean || null;
  }

  function getUrlPort() {
    try {
      if (typeof location === 'undefined' || !location.search) return null;
      return parseValidPort(new URLSearchParams(location.search).get('port'));
    } catch {
      return null;
    }
  }

  function getUrlHost() {
    try {
      if (typeof location === 'undefined' || !location.search) return null;
      return parseValidHost(new URLSearchParams(location.search).get('host'));
    } catch {
      return null;
    }
  }

  function isLocalHost(h) {
    if (!h) return true;
    const clean = String(h).trim().toLowerCase().replace(/^\[|\]$/g, '');
    return clean === '127.0.0.1' || clean === 'localhost' || clean === '::1' || clean === '0.0.0.0' || clean.startsWith('127.');
  }

  function getPadContextSubtitle(pad) {
    if (!pad || pad.type === 'none') return '';
    if (pad.type === 'filter') return pad.sourceName || '';
    if (pad.type === 'source' || pad.type === 'transform') return pad.sceneName || '';
    if (pad.type === 'volume' || pad.type === 'monitor') {
      return (pad.label && pad.label !== pad.inputName) ? (pad.inputName || '') : '';
    }
    return '';
  }

  function sanitizeAutoOff(raw) {
    if (raw == null || raw === '') return 0;
    const ms = Math.round(Number(raw));
    return Number.isFinite(ms) && ms > 0 ? ms : 0;
  }

  function emptyPad() {
    return { type: 'none', label: '', icon: '', color: COLORS[0] };
  }

  function normalizePadInternal(raw, isStep) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return isStep ? { type: 'none' } : emptyPad();
    }
    if (isStep && raw.type === 'wait') {
      const delay = Number(raw.delayMs);
      return { type: 'wait', delayMs: Number.isFinite(delay) ? Math.max(0, delay) : 0 };
    }
    let type = PAD_TYPES.includes(raw.type) ? raw.type : 'none';
    if (isStep && (type === 'macro' || type === 'panic' || type === 'stats')) type = 'none';
    const out = isStep
      ? { type }
      : {
          type,
          label: typeof raw.label === 'string' ? raw.label : '',
          icon: typeof raw.icon === 'string' ? raw.icon : '',
          color: typeof raw.color === 'string' && raw.color ? raw.color : COLORS[0],
        };

    if (type === 'scene') {
      out.mode = ['named', 'next', 'prev'].includes(raw.mode) ? raw.mode : 'named';
      if (out.mode === 'named' && raw.sceneName) out.sceneName = String(raw.sceneName);
    } else if (type === 'source') {
      if (raw.sceneName) out.sceneName = String(raw.sceneName);
      if (raw.sourceName) out.sourceName = String(raw.sourceName);
      if (['toggle', 'show', 'hide', 'solo'].includes(raw.mode)) out.mode = raw.mode;
    } else if (type === 'filter') {
      if (raw.sourceName) out.sourceName = String(raw.sourceName);
      if (raw.filterName) out.filterName = String(raw.filterName);
      if (['toggle', 'enable', 'disable'].includes(raw.mode)) out.mode = raw.mode;
    } else if (type === 'mute') {
      if (raw.inputName) out.inputName = String(raw.inputName);
      if (['toggle', 'mute', 'unmute'].includes(raw.mode)) out.mode = raw.mode;
    } else if (type === 'macro') {
      out.steps = Array.isArray(raw.steps)
        ? raw.steps.filter((s) => s && typeof s === 'object').map((s) => normalizePadInternal(s, true)).filter((s) => s.type !== 'none')
        : [];
    } else if (type === 'page') {
      out.mode = ['goto', 'next', 'prev'].includes(raw.mode) ? raw.mode : 'goto';
      const pid = raw.pageId || raw.deckId;
      if (out.mode === 'goto' && pid) out.pageId = String(pid);
    } else if (type === 'studio') {
      out.action = ['toggle', 'enable', 'disable', 'preview', 'transition'].includes(raw.action) ? raw.action : 'toggle';
      if (out.action === 'preview' && raw.sceneName) out.sceneName = String(raw.sceneName);
    } else if (type === 'output') {
      out.target = ['stream', 'record', 'recordPause', 'vcam', 'replay', 'saveReplay'].includes(raw.target)
        ? raw.target
        : 'stream';
      if (out.target !== 'saveReplay') {
        out.mode = ['toggle', 'start', 'stop'].includes(raw.mode) ? raw.mode : 'toggle';
      }
    } else if (type === 'media') {
      if (raw.inputName) out.inputName = String(raw.inputName);
      out.mediaAction = ['play_pause', 'play', 'pause', 'stop', 'restart', 'next', 'previous'].includes(raw.mediaAction)
        ? raw.mediaAction
        : 'play_pause';
    } else if (type === 'screenshot') {
      if (raw.sourceName) out.sourceName = String(raw.sourceName);
      out.imageFormat = ['png', 'jpg', 'webp'].includes(raw.imageFormat) ? raw.imageFormat : 'png';
      if (raw.savePath) out.savePath = String(raw.savePath);
    } else if (type === 'browser') {
      if (raw.inputName) out.inputName = String(raw.inputName);
      out.mode = ['refresh', 'set_url'].includes(raw.mode) ? raw.mode : 'refresh';
      if (out.mode === 'set_url' && raw.url) out.url = String(raw.url);
    } else if (type === 'volume') {
      if (raw.inputName) out.inputName = String(raw.inputName);
      out.mode = ['set', 'step'].includes(raw.mode) ? raw.mode : 'step';
      const db = Number(raw.volumeDb);
      const defDb = out.mode === 'step' ? -3 : 0;
      out.volumeDb = Number.isFinite(db) ? Math.max(-100, Math.min(26, db)) : defDb;
    } else if (type === 'profile') {
      if (raw.profileName) out.profileName = String(raw.profileName);
    } else if (type === 'collection') {
      if (raw.collectionName) out.collectionName = String(raw.collectionName);
    } else if (type === 'transition') {
      if (raw.transitionName) out.transitionName = String(raw.transitionName);
      if (raw.durationMs !== '' && raw.durationMs != null) {
        const dur = Number(raw.durationMs);
        if (Number.isFinite(dur) && dur >= 0) out.durationMs = Math.round(dur);
      }
    } else if (type === 'stats') {
      out.mode = ['cpu', 'dropped', 'fps', 'all'].includes(raw.mode) ? raw.mode : 'all';
    } else if (type === 'hotkey') {
      if (raw.hotkeyName) out.hotkeyName = String(raw.hotkeyName);
    } else if (type === 'chapter') {
      if (raw.chapterName) out.chapterName = String(raw.chapterName);
    } else if (type === 'monitor') {
      if (raw.inputName) out.inputName = String(raw.inputName);
      out.monitorType = ['cycle', ...MONITOR_TYPES].includes(raw.monitorType) ? raw.monitorType : 'cycle';
    } else if (type === 'transform') {
      if (raw.sceneName) out.sceneName = String(raw.sceneName);
      if (raw.sourceName) out.sourceName = String(raw.sourceName);
      out.preset = TRANSFORM_PRESETS.includes(raw.preset) ? raw.preset : 'toggle_pip';
    } else if (type === 'image') {
      if (raw.inputName) out.inputName = String(raw.inputName);
      out.mode = ['set_file', 'next', 'previous', 'restart'].includes(raw.mode) ? raw.mode : 'set_file';
      if (out.mode === 'set_file' && raw.filePath) out.filePath = String(raw.filePath);
    }

    if (!isStep) {
      if (typeof raw.image === 'string' && raw.image.trim()) {
        out.image = raw.image;
        out.imageFit = raw.imageFit === 'fill' ? 'fill' : 'icon';
      }
      if (Boolean(raw.hideLabel)) {
        out.hideLabel = true;
      }
    }

    if (!isStep && AUTO_OFF_TYPES.has(type)) {
      const ms = sanitizeAutoOff(raw.autoOffMs);
      if (ms > 0) out.autoOffMs = ms;
    }
    if (!isStep && HOLD_TYPES.has(type) && Boolean(raw.hold) && !(out.autoOffMs > 0)) {
      out.hold = true;
    }
    return out;
  }

  function normalizePad(raw) {
    return normalizePadInternal(raw, false);
  }

  function normalizeStep(raw) {
    return normalizePadInternal(raw, true);
  }

  function renameReference(item, kind, oldName, newName) {
    if (!item || typeof item !== 'object' || !oldName || !newName || oldName === newName) return false;
    let changed = false;
    if (kind === 'scene') {
      if (['scene', 'source', 'transform', 'studio'].includes(item.type)) {
        if (item.sceneName === oldName) {
          item.sceneName = newName;
          changed = true;
        }
      }
      if (['source', 'filter', 'screenshot', 'transform'].includes(item.type)) {
        if (item.sourceName === oldName) {
          item.sourceName = newName;
          changed = true;
        }
      }
    } else if (kind === 'input') {
      if (['source', 'filter', 'screenshot', 'transform'].includes(item.type)) {
        if (item.sourceName === oldName) {
          item.sourceName = newName;
          changed = true;
        }
      } else if (['mute', 'volume', 'monitor', 'media', 'image', 'browser'].includes(item.type)) {
        if (item.inputName === oldName) {
          item.inputName = newName;
          changed = true;
        }
      }
    }
    if (Array.isArray(item.steps)) {
      for (const step of item.steps) {
        if (renameReference(step, kind, oldName, newName)) {
          changed = true;
        }
      }
    }
    if (changed && item.label === oldName) {
      item.label = newName;
    }
    return changed;
  }

  function applyRename(kind, oldName, newName) {
    if (!oldName || !newName || oldName === newName) return false;
    let changed = false;
    const { cfg } = Deck;
    for (const page of (cfg.pages || [])) {
      if (kind === 'scene' && page.sceneName === oldName) {
        page.sceneName = newName;
        changed = true;
      }
      for (const pad of (page.pads || [])) {
        if (renameReference(pad, kind, oldName, newName)) {
          changed = true;
        }
      }
    }
    for (const step of (cfg.panicSteps || [])) {
      if (renameReference(step, kind, oldName, newName)) {
        changed = true;
      }
    }
    if (changed) {
      Deck.saveCfg();
      if (kind === 'scene' && typeof Deck.renderPageBar === 'function') {
        Deck.renderPageBar();
      }
    }
    return changed;
  }

  function defaultPads(cols = DEFAULT_COLS, rows = DEFAULT_ROWS, seedPanic = false) {
    const c = clampInt(cols, MIN_COLS, MAX_COLS, DEFAULT_COLS);
    const r = clampInt(rows, MIN_ROWS, MAX_ROWS, DEFAULT_ROWS);
    const total = c * r;
    const pads = Array.from({ length: total }, emptyPad);
    if (seedPanic && total > 0) {
      pads[total - 1] = { type: 'panic', label: 'PANIC', icon: '🚨', color: '#991b1b' };
    }
    return pads;
  }

  function defaultPages() {
    return [{
      id: 'page-1',
      name: 'Main',
      cols: DEFAULT_COLS,
      rows: DEFAULT_ROWS,
      pads: defaultPads(DEFAULT_COLS, DEFAULT_ROWS, true),
    }];
  }

  function uniquePageId(existingIds, preferred) {
    const base = String(preferred || '').trim() || 'page-1';
    if (!existingIds.has(base)) return base;
    let n = existingIds.size + 1;
    while (existingIds.has(`page-${n}`)) n++;
    return `page-${n}`;
  }

  function normalizePage(raw, idx, usedIds, seedPanicIfMissing = false, usedScenes = null) {
    const cols = clampInt(raw?.cols, MIN_COLS, MAX_COLS, DEFAULT_COLS);
    const rows = clampInt(raw?.rows, MIN_ROWS, MAX_ROWS, DEFAULT_ROWS);
    const id = uniquePageId(usedIds, raw?.id || `page-${idx + 1}`);
    usedIds.add(id);
    const name = typeof raw?.name === 'string' && raw.name.trim()
      ? raw.name.trim()
      : (idx === 0 ? 'Main' : `Page ${idx + 1}`);
    const total = cols * rows;
    const pads = defaultPads(cols, rows, seedPanicIfMissing);
    if (Array.isArray(raw?.pads)) {
      const limit = Math.min(total, raw.pads.length);
      for (let i = 0; i < limit; i++) {
        if (raw.pads[i]) pads[i] = normalizePad(raw.pads[i]);
      }
    }
    const page = { id, name, cols, rows, pads };
    if (typeof raw?.sceneName === 'string' && raw.sceneName.trim()) {
      const sc = raw.sceneName.trim();
      if (!usedScenes || !usedScenes.has(sc)) {
        page.sceneName = sc;
        if (usedScenes) usedScenes.add(sc);
      }
    }
    return page;
  }

  function migrateConfig(raw, fallbackPassword = '') {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new Error('Invalid layout JSON');
    }
    const ws = { host: '127.0.0.1', port: 4455, password: fallbackPassword };
    if (raw.ws && typeof raw.ws === 'object') {
      const port = Number(raw.ws.port);
      ws.host = String(raw.ws.host || '127.0.0.1');
      ws.port = port >= 1 && port <= 65535 ? port : 4455;
      ws.password = (typeof raw.ws.password === 'string' && raw.ws.password) ? raw.ws.password : fallbackPassword;
      if (raw.ws.manualPort) ws.manualPort = true;
      if (raw.ws.manualHost) ws.manualHost = true;
    }

    let pages;
    let activePageId;
    const sourcePages = Array.isArray(raw.pages) && raw.pages.length > 0
      ? raw.pages
      : (Array.isArray(raw.decks) && raw.decks.length > 0 ? raw.decks : null);

    if (sourcePages) {
      const usedIds = new Set();
      const usedScenes = new Set();
      pages = sourcePages
        .filter((d) => d && typeof d === 'object')
        .map((d, idx) => normalizePage(d, idx, usedIds, false, usedScenes));
      if (!pages.length) throw new Error('Invalid layout JSON (empty pages[])');
      const rawActiveId = raw.activePageId || raw.activeDeckId;
      activePageId = pages.some((d) => d.id === rawActiveId) ? rawActiveId : pages[0].id;
    } else if (Array.isArray(raw.pads)) {
      const usedIds = new Set();
      const usedScenes = new Set();
      const single = normalizePage({ id: 'page-1', name: 'Main', cols: 8, rows: 8, pads: raw.pads }, 0, usedIds, false, usedScenes);
      pages = [single];
      activePageId = single.id;
    } else {
      throw new Error('Invalid layout JSON (missing pages[] or pads[])');
    }

    const panicSteps = Array.isArray(raw.panicSteps)
      ? raw.panicSteps
          .filter((s) => s && typeof s === 'object')
          .map(normalizeStep)
          .filter((s) => s.type !== 'none' && s.type !== 'wait')
      : [];

    return { version: 2, ws, activePageId, pages, panicSteps };
  }

  function loadState() {
    const base = {
      version: 2,
      ws: { host: '127.0.0.1', port: 4455, password: '' },
      activePageId: 'page-1',
      pages: defaultPages(),
      panicSteps: [],
    };
    let state = base;
    try {
      const rawCanonical = localStorage.getItem(STORAGE_KEY);
      if (rawCanonical) {
        state = migrateConfig(JSON.parse(rawCanonical));
        for (const k of LEGACY_STORAGE_KEYS) {
          try { localStorage.removeItem(k); } catch {}
        }
      } else {
        let rawLegacy = null;
        for (const k of LEGACY_STORAGE_KEYS) {
          const raw = localStorage.getItem(k);
          if (raw) {
            rawLegacy = raw;
            break;
          }
        }
        if (rawLegacy) {
          state = migrateConfig(JSON.parse(rawLegacy));
          try {
            const json = JSON.stringify(state);
            localStorage.setItem(STORAGE_KEY, json);
            for (const k of LEGACY_STORAGE_KEYS) {
              try { localStorage.removeItem(k); } catch {}
            }
          } catch {
            initialSaveFailed = true;
          }
        }
      }
    } catch {}

    const urlHost = getUrlHost();
    if (urlHost && !state.ws.manualHost) {
      state.ws.host = urlHost;
    }
    const urlPort = getUrlPort();
    if (urlPort && !state.ws.manualPort) {
      state.ws.port = urlPort;
    }
    return state;
  }

  function smartSceneIcon(name) {
    const n = String(name || '');
    if (/brb|away|break|pause/i.test(n)) return '☕';
    if (/end|outro|bye/i.test(n)) return '👋';
    if (/start|intro|soon/i.test(n)) return '🚀';
    if (/slide|deck|screen|present/i.test(n)) return '🖥️';
    if (/game|play/i.test(n)) return '🎮';
    if (/cam|talk|chat|face|main/i.test(n)) return '🎥';
    return '🎬';
  }

  function smartSourceIcon(name, kind) {
    const s = `${name || ''} ${kind || ''}`;
    if (/mic|audio|sound|wasapi|coreaudio|pulse/i.test(s)) return '🎙️';
    if (/cam|video|dshow|avfoundation|v4l2/i.test(s)) return '📷';
    if (/browser|web/i.test(s)) return '🌐';
    if (/image|photo|logo|slideshow/i.test(s)) return '🖼️';
    if (/text|title|lower|gdi|ft2/i.test(s)) return '🔤';
    if (/media|ffmpeg|vlc/i.test(s)) return '🎞️';
    if (/display|window|screen|monitor|capture/i.test(s)) return '🖥️';
    return '🧩';
  }

  function pickAutoImportDims(itemCount) {
    if (itemCount <= 11) return { cols: 4, rows: 3 };
    if (itemCount <= 23) return { cols: 6, rows: 4 };
    if (itemCount <= 31) return { cols: 8, rows: 4 };
    return { cols: 8, rows: 8 };
  }

  function packAutoImportPage(id, name, items) {
    const list = items.slice(0, 63);
    const { cols, rows } = pickAutoImportDims(list.length);
    const pads = defaultPads(cols, rows, true);
    for (let i = 0; i < list.length; i++) {
      pads[i] = normalizePad(list[i]);
    }
    return { id, name, cols, rows, pads };
  }

  function packAutoImportPages(baseId, baseName, items) {
    if (!Array.isArray(items) || !items.length) return [];
    const pages = [];
    const CHUNK_SIZE = 63;
    for (let offset = 0, pageNum = 1; offset < items.length; offset += CHUNK_SIZE, pageNum++) {
      const chunk = items.slice(offset, offset + CHUNK_SIZE);
      const id = pageNum === 1 ? baseId : `${baseId}-${pageNum}`;
      const name = pageNum === 1 ? baseName : `${baseName} ${pageNum}`;
      pages.push(packAutoImportPage(id, name, chunk));
    }
    return pages;
  }

  const Deck = {
    VERSION,
    PROBE_PORTS,
    PAD_COUNT: DEFAULT_COLS * DEFAULT_ROWS,
    MIN_COLS,
    MAX_COLS,
    MIN_ROWS,
    MAX_ROWS,
    COLORS,
    PAD_TYPES,
    AUTO_OFF_TYPES,
    HOLD_TYPES,
    MONITOR_TYPES,
    TRANSFORM_PRESETS,
    $,
    esc,
    getUrlPort,
    getUrlHost,
    getPadContextSubtitle,
    normalizePad,
    normalizeStep,
    defaultPads,
    defaultPages,
    migrateConfig,
    cfg: loadState(),
    editMode: false,
    activeMacros: new Map(),
    activeAutoOffs: new Map(),
    obs: {
      ws: null,
      status: 'bad',
      reqId: 0,
      connectGen: 0,
      hasProbedOnBoot: false,
      pending: new Map(),
      reconnectTimer: null,
      reconnectCountdown: null,
      retryCount: 0,
      statsTimer: null,
      readoutTimer: null,
      streamStatus: null,
      recordStatus: null,
      mediaStatus: {},
      manualClose: false,
      activeSync: null,
      queuedSync: null,
      scenes: [],
      groups: new Set(),
      inputs: [],
      inputKinds: {},
      mediaInputs: [],
      browserInputs: [],
      imageInputs: [],
      hotkeys: [],
      programScene: '',
      previewScene: '',
      studioModeEnabled: false,
      itemsByScene: {},
      filtersBySource: {},
      mutes: {},
      volumes: {},
      monitors: {},
      mediaStates: {},
      imageFiles: {},
      transforms: {},
      videoSettings: { baseWidth: 1920, baseHeight: 1080 },
      stats: {
        cpuUsage: 0,
        memoryUsage: 0,
        activeFps: 0,
        renderSkippedFrames: 0,
        outputSkippedFrames: 0,
      },
      outputs: {
        stream: false,
        record: false,
        recordPaused: false,
        vcam: false,
        replay: false,
      },
      profiles: [],
      currentProfile: '',
      collections: [],
      currentCollection: '',
      transitions: [],
      currentTransition: '',
      transitionDuration: 300,
      lastScreenshot: '',
    },
    STORAGE_KEY,
    hasSaveWarning: initialSaveFailed,
    setSaveWarning: (show) => {
      Deck.hasSaveWarning = Boolean(show);
      const warnEl = $('save-warning');
      const statusEl = document.querySelector('.status');
      const msgEl = $('msg-info');
      if (show) {
        if (warnEl) {
          warnEl.hidden = false;
          warnEl.textContent = '⚠️ Save failed: Export layout and use fewer or smaller Pad Graphics';
        }
        if (statusEl) statusEl.classList.add('save-failed');
        if (msgEl) msgEl.textContent = 'Save failed: Export layout and use fewer or smaller Pad Graphics';
      } else {
        if (warnEl) {
          warnEl.hidden = true;
          warnEl.textContent = '';
        }
        if (statusEl) statusEl.classList.remove('save-failed');
        if (msgEl && msgEl.textContent.includes('Save failed')) {
          msgEl.textContent = 'Ready';
        }
      }
    },
    renderGrid: () => {},
    scheduleRenderGrid: () => Deck.renderGrid(),
    updateMacroTicks: () => {},
    updateStatsPads: () => Deck.renderGrid(),
  };

  Deck.saveCfg = () => {
    let ok = false;
    try {
      const json = JSON.stringify(Deck.cfg);
      localStorage.setItem(STORAGE_KEY, json);
      ok = true;
      for (const k of LEGACY_STORAGE_KEYS) {
        try { localStorage.removeItem(k); } catch {}
      }
    } catch {}
    Deck.setSaveWarning(!ok);
    Deck.syncStatsPolling();
    Deck.syncReadoutPolling();
    return ok;
  };

  if (initialSaveFailed) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => Deck.setSaveWarning(true), { once: true });
    } else {
      setTimeout(() => Deck.setSaveWarning(true), 0);
    }
  }

  Deck.exportConfig = () => {
    const { cfg } = Deck;
    return {
      version: 2,
      ws: { host: cfg.ws.host, port: cfg.ws.port },
      activePageId: cfg.activePageId,
      pages: cfg.pages.map((d) => {
        const out = {
          id: d.id,
          name: d.name,
          cols: d.cols,
          rows: d.rows,
          pads: d.pads.map(normalizePad),
        };
        if (d.sceneName) out.sceneName = d.sceneName;
        return out;
      }),
      panicSteps: (cfg.panicSteps || []).map(normalizeStep).filter((s) => s.type !== 'none' && s.type !== 'wait'),
    };
  };

  Deck.getActivePage = () => {
    const { cfg } = Deck;
    if (!Array.isArray(cfg.pages) || !cfg.pages.length) {
      cfg.pages = defaultPages();
      cfg.activePageId = cfg.pages[0].id;
    }
    let page = cfg.pages.find((d) => d.id === cfg.activePageId);
    if (!page) {
      page = cfg.pages[0];
      cfg.activePageId = page.id;
    }
    return page;
  };

  Deck.getActivePads = () => Deck.getActivePage().pads;

  Deck.setActivePage = (pageId) => {
    const page = Deck.cfg.pages.find((d) => d.id === pageId);
    if (!page) return null;
    const oldPageId = Deck.cfg.activePageId;
    if (page.id !== oldPageId) {
      if (typeof Deck.releaseHold === 'function') Deck.releaseHold(oldPageId);
    }
    Deck.cfg.activePageId = page.id;
    Deck.saveCfg();
    Deck.renderGrid();
    return page;
  };

  Deck.addPage = ({ name, cols, rows, switchTo = true } = {}) => {
    const cur = Deck.getActivePage();
    const c = clampInt(cols, MIN_COLS, MAX_COLS, cur.cols || DEFAULT_COLS);
    const r = clampInt(rows, MIN_ROWS, MAX_ROWS, cur.rows || DEFAULT_ROWS);
    const usedIds = new Set(Deck.cfg.pages.map((d) => d.id));
    const id = uniquePageId(usedIds, `page-${Deck.cfg.pages.length + 1}`);
    const pageName = typeof name === 'string' && name.trim() ? name.trim() : `Page ${Deck.cfg.pages.length + 1}`;
    const page = { id, name: pageName, cols: c, rows: r, pads: defaultPads(c, r, false) };
    Deck.cfg.pages.push(page);
    if (switchTo) Deck.cfg.activePageId = id;
    Deck.saveCfg();
    Deck.renderGrid();
    return page;
  };

  Deck.duplicatePage = (pageId) => {
    const src = Deck.cfg.pages.find((d) => d.id === pageId) || Deck.getActivePage();
    const usedIds = new Set(Deck.cfg.pages.map((d) => d.id));
    const id = uniquePageId(usedIds, `${src.id}-copy`);
    const copy = {
      id,
      name: `${src.name} Copy`,
      cols: src.cols,
      rows: src.rows,
      pads: src.pads.map((p) => normalizePad(JSON.parse(JSON.stringify(p)))),
    };
    const at = Deck.cfg.pages.indexOf(src);
    Deck.cfg.pages.splice(at >= 0 ? at + 1 : Deck.cfg.pages.length, 0, copy);
    Deck.cfg.activePageId = copy.id;
    Deck.saveCfg();
    Deck.renderGrid();
    return copy;
  };

  Deck.renamePage = (pageId, name) => {
    const page = Deck.cfg.pages.find((d) => d.id === pageId);
    if (!page) return false;
    const trimmed = String(name || '').trim();
    if (!trimmed) return false;
    page.name = trimmed;
    Deck.saveCfg();
    Deck.renderGrid();
    return true;
  };

  Deck.setPageScene = (pageId, sceneName) => {
    const page = Deck.cfg.pages.find((d) => d.id === pageId);
    if (!page) return false;
    const trimmed = String(sceneName || '').trim();
    if (trimmed) {
      const other = Deck.cfg.pages.find((p) => p.id !== pageId && p.sceneName === trimmed);
      if (other) return false;
      page.sceneName = trimmed;
    } else {
      delete page.sceneName;
    }
    Deck.saveCfg();
    Deck.renderGrid();
    return true;
  };

  Deck.deletePage = async (pageId) => {
    const { pages } = Deck.cfg;
    if (pages.length <= 1) return false;
    const idx = pages.findIndex((d) => d.id === pageId);
    if (idx < 0) return false;
    let snapFailed = false;
    if (typeof Deck.createSnapshot === 'function') {
      try {
        const s = await Deck.createSnapshot('Before Delete Page');
        if (s === null && Deck.snapshotsAvailable) snapFailed = true;
      } catch {
        snapFailed = true;
      }
    }
    if (typeof Deck.abortPageTimers === 'function') Deck.abortPageTimers(pageId);
    pages.splice(idx, 1);
    if (Deck.cfg.activePageId === pageId) {
      Deck.cfg.activePageId = pages[Math.max(0, idx - 1)].id;
    }
    Deck.saveCfg();
    Deck.renderGrid();
    if (snapFailed) {
      Deck.setMsg('No snapshot was saved');
    }
    return true;
  };

  Deck.resizePage = (pageId, newCols, newRows) => {
    const page = Deck.cfg.pages.find((d) => d.id === pageId) || Deck.getActivePage();
    const oldCols = clampInt(page.cols, MIN_COLS, MAX_COLS, DEFAULT_COLS);
    const oldRows = clampInt(page.rows, MIN_ROWS, MAX_ROWS, DEFAULT_ROWS);
    const cols = clampInt(newCols, MIN_COLS, MAX_COLS, oldCols);
    const rows = clampInt(newRows, MIN_ROWS, MAX_ROWS, oldRows);
    if (cols === oldCols && rows === oldRows && page.pads.length === cols * rows) return page;
    if (typeof Deck.abortPageTimers === 'function') Deck.abortPageTimers(page.id);
    const nextPads = defaultPads(cols, rows, false);
    const copyRows = Math.min(oldRows, rows);
    const copyCols = Math.min(oldCols, cols);
    for (let r = 0; r < copyRows; r++) {
      for (let c = 0; c < copyCols; c++) {
        const src = page.pads[r * oldCols + c];
        if (src) nextPads[r * cols + c] = normalizePad(src);
      }
    }
    page.cols = cols;
    page.rows = rows;
    page.pads = nextPads;
    Deck.saveCfg();
    Deck.renderGrid();
    return page;
  };

  Deck.movePadToPage = (fromIdx, targetPageId, sourcePageId) => {
    const srcPage = sourcePageId
      ? Deck.cfg.pages.find((d) => d.id === sourcePageId)
      : Deck.getActivePage();
    const dstPage = Deck.cfg.pages.find((d) => d.id === targetPageId);
    if (!srcPage || !dstPage || srcPage.id === dstPage.id) return false;
    if (fromIdx < 0 || fromIdx >= srcPage.pads.length) return false;
    const pad = srcPage.pads[fromIdx];
    if (!pad || pad.type === 'none') return false;
    let dstIdx = dstPage.pads.findIndex((p) => !p || p.type === 'none');
    if (dstIdx < 0 && dstPage.rows < MAX_ROWS) {
      Deck.resizePage(dstPage.id, dstPage.cols, dstPage.rows + 1);
      dstIdx = dstPage.pads.findIndex((p) => !p || p.type === 'none');
    }
    if (dstIdx < 0) {
      Deck.setMsg(`Page "${dstPage.name}" is full`);
      return false;
    }
    if (typeof Deck.abortPadTimer === 'function') {
      Deck.abortPadTimer(srcPage.id, fromIdx);
      Deck.abortPadTimer(dstPage.id, dstIdx);
    }
    dstPage.pads[dstIdx] = normalizePad(JSON.parse(JSON.stringify(pad)));
    srcPage.pads[fromIdx] = emptyPad();
    Deck.saveCfg();
    Deck.renderGrid();
    Deck.setMsg(`Moved pad to "${dstPage.name}"`);
    return true;
  };

  Deck.duplicatePad = (fromIdx, targetPageId, sourcePageId) => {
    const srcPage = sourcePageId
      ? Deck.cfg.pages.find((d) => d.id === sourcePageId)
      : Deck.getActivePage();
    const dstPage = targetPageId
      ? Deck.cfg.pages.find((d) => d.id === targetPageId)
      : Deck.getActivePage();
    if (!srcPage || !dstPage) return -1;
    if (fromIdx < 0 || fromIdx >= srcPage.pads.length) return -1;
    const pad = srcPage.pads[fromIdx];
    if (!pad || pad.type === 'none') return -1;
    let dstIdx = dstPage.pads.findIndex((p) => !p || p.type === 'none');
    if (dstIdx < 0 && dstPage.rows < MAX_ROWS) {
      Deck.resizePage(dstPage.id, dstPage.cols, dstPage.rows + 1);
      dstIdx = dstPage.pads.findIndex((p) => !p || p.type === 'none');
    }
    if (dstIdx < 0) {
      Deck.setMsg(`Page "${dstPage.name}" is full`);
      return -1;
    }
    if (typeof Deck.abortPadTimer === 'function') Deck.abortPadTimer(dstPage.id, dstIdx);
    dstPage.pads[dstIdx] = normalizePad(JSON.parse(JSON.stringify(pad)));
    Deck.saveCfg();
    Deck.renderGrid();
    Deck.setMsg(`Duplicated "${pad.label || pad.type}" to "${dstPage.name}"`);
    return dstIdx;
  };

  Deck.duplicatePads = (fromIndices, targetPageId, sourcePageId) => {
    if (!Array.isArray(fromIndices) || !fromIndices.length) return [];
    const srcPage = sourcePageId
      ? Deck.cfg.pages.find((d) => d.id === sourcePageId)
      : Deck.getActivePage();
    const dstPage = targetPageId
      ? Deck.cfg.pages.find((d) => d.id === targetPageId)
      : Deck.getActivePage();
    if (!srcPage || !dstPage) return [];
    const validIndices = fromIndices.filter((i) => (
      Number.isInteger(i) && i >= 0 && i < srcPage.pads.length && srcPage.pads[i] && srcPage.pads[i].type !== 'none'
    ));
    if (!validIndices.length) return [];
    const created = [];
    for (const fromIdx of validIndices) {
      let dstIdx = dstPage.pads.findIndex((p) => !p || p.type === 'none');
      if (dstIdx < 0 && dstPage.rows < MAX_ROWS) {
        Deck.resizePage(dstPage.id, dstPage.cols, dstPage.rows + 1);
        dstIdx = dstPage.pads.findIndex((p) => !p || p.type === 'none');
      }
      if (dstIdx < 0) break;
      const pad = srcPage.pads[fromIdx];
      if (typeof Deck.abortPadTimer === 'function') Deck.abortPadTimer(dstPage.id, dstIdx);
      dstPage.pads[dstIdx] = normalizePad(JSON.parse(JSON.stringify(pad)));
      created.push(dstIdx);
    }
    if (created.length > 0) {
      Deck.saveCfg();
      Deck.renderGrid();
      Deck.setMsg(`Duplicated ${created.length} pad(s) to "${dstPage.name}"`);
    } else {
      Deck.setMsg(`Page "${dstPage.name}" is full`);
    }
    return created;
  };

  Deck.movePadsToPage = (fromIndices, targetPageId, sourcePageId) => {
    if (!Array.isArray(fromIndices) || !fromIndices.length) return [];
    const srcPage = sourcePageId
      ? Deck.cfg.pages.find((d) => d.id === sourcePageId)
      : Deck.getActivePage();
    const dstPage = Deck.cfg.pages.find((d) => d.id === targetPageId);
    if (!srcPage || !dstPage || srcPage.id === dstPage.id) return [];
    const validIndices = fromIndices.filter((i) => (
      Number.isInteger(i) && i >= 0 && i < srcPage.pads.length && srcPage.pads[i] && srcPage.pads[i].type !== 'none'
    ));
    if (!validIndices.length) return [];
    const moved = [];
    for (const fromIdx of validIndices) {
      let dstIdx = dstPage.pads.findIndex((p) => !p || p.type === 'none');
      if (dstIdx < 0 && dstPage.rows < MAX_ROWS) {
        Deck.resizePage(dstPage.id, dstPage.cols, dstPage.rows + 1);
        dstIdx = dstPage.pads.findIndex((p) => !p || p.type === 'none');
      }
      if (dstIdx < 0) break;
      const pad = srcPage.pads[fromIdx];
      if (typeof Deck.abortPadTimer === 'function') {
        Deck.abortPadTimer(srcPage.id, fromIdx);
        Deck.abortPadTimer(dstPage.id, dstIdx);
      }
      dstPage.pads[dstIdx] = normalizePad(JSON.parse(JSON.stringify(pad)));
      srcPage.pads[fromIdx] = emptyPad();
      moved.push(dstIdx);
    }
    if (moved.length > 0) {
      Deck.saveCfg();
      Deck.renderGrid();
      Deck.setMsg(`Moved ${moved.length} pad(s) to "${dstPage.name}"`);
    } else {
      Deck.setMsg(`Page "${dstPage.name}" is full`);
    }
    return moved;
  };

  Deck.setPadColors = (indices, color, pageId) => {
    const page = pageId
      ? Deck.cfg.pages.find((d) => d.id === pageId)
      : Deck.getActivePage();
    if (!page || !Array.isArray(indices) || !color) return false;
    let count = 0;
    for (const idx of indices) {
      if (idx >= 0 && idx < page.pads.length) {
        const p = page.pads[idx];
        if (p && p.type !== 'none') {
          p.color = color;
          count++;
        }
      }
    }
    Deck.saveCfg();
    Deck.renderGrid();
    Deck.setMsg(`Updated color for ${count} pad(s)`);
    return true;
  };

  Deck.clearPads = (indices, pageId) => {
    const page = pageId
      ? Deck.cfg.pages.find((d) => d.id === pageId)
      : Deck.getActivePage();
    if (!page || !Array.isArray(indices)) return false;
    let count = 0;
    for (const idx of indices) {
      if (idx >= 0 && idx < page.pads.length) {
        if (typeof Deck.abortPadTimer === 'function') Deck.abortPadTimer(page.id, idx);
        page.pads[idx] = emptyPad();
        count++;
      }
    }
    Deck.saveCfg();
    Deck.renderGrid();
    Deck.setMsg(`Cleared ${count} pad(s)`);
    return true;
  };

  Deck.isStarterDeck = () => {
    const pages = Deck.cfg.pages || [];
    if (pages.length !== 1) return false;
    const configured = (pages[0].pads || []).filter((p) => p && p.type !== 'none');
    return configured.length === 1 && configured[0].type === 'panic';
  };

  Deck.buildAutoImportPages = (opts = {}) => {
    const { obs } = Deck;
    const cfgOpts = {
      scenes: opts.scenes !== false,
      sources: opts.sources !== false,
      filters: opts.filters !== false,
      broadcast: opts.broadcast !== false,
    };
    const pages = [];

    if (cfgOpts.scenes) {
      const items = obs.scenes.map((sceneName) => ({
        type: 'scene',
        mode: 'named',
        sceneName,
        label: sceneName,
        icon: smartSceneIcon(sceneName),
        color: '#991b1b',
      }));
      if (obs.scenes.length > 1) {
        items.push(
          { type: 'scene', mode: 'prev', label: 'Prev Scene', icon: '⏮️', color: '#115e59' },
          { type: 'scene', mode: 'next', label: 'Next Scene', icon: '⏭️', color: '#115e59' }
        );
      }
      if (items.length) pages.push(...packAutoImportPages('page-scenes', 'Scenes', items));
    }

    if (cfgOpts.sources) {
      const items = [];
      const seen = new Set();
      const targets = [...new Set([...obs.scenes, ...obs.groups])];
      for (const sceneName of targets) {
        for (const it of (obs.itemsByScene[sceneName] || [])) {
          if (!it?.sourceName) continue;
          const key = `${sceneName}\0${it.sourceName}`;
          if (seen.has(key)) continue;
          seen.add(key);
          items.push({
            type: 'source',
            sceneName,
            sourceName: it.sourceName,
            mode: 'toggle',
            label: it.sourceName,
            icon: smartSourceIcon(it.sourceName, obs.inputKinds[it.sourceName]),
            color: '#115e59',
          });
        }
      }
      if (items.length) pages.push(...packAutoImportPages('page-sources', 'Sources', items));
    }

    if (cfgOpts.filters) {
      const items = [];
      const seen = new Set();
      for (const [sourceName, flts] of Object.entries(obs.filtersBySource || {})) {
        for (const f of (flts || [])) {
          if (!f?.filterName) continue;
          const key = `${sourceName}\0${f.filterName}`;
          if (seen.has(key)) continue;
          seen.add(key);
          items.push({
            type: 'filter',
            sourceName,
            filterName: f.filterName,
            mode: 'toggle',
            label: f.filterName,
            icon: '✨',
            color: '#581c87',
          });
        }
      }
      if (items.length) pages.push(...packAutoImportPages('page-filters', 'Filters', items));
    }

    if (cfgOpts.broadcast) {
      const items = [];
      const nonAudioKindRe = /^(image_source|slideshow(_v2)?|browser_source|color_source|text_|window_capture|monitor_capture|display_capture)/i;
      const allInputs = obs.inputs || [];
      const audioCandidates = allInputs.filter((inp) => (
        typeof obs.mutes[inp] === 'boolean' && !nonAudioKindRe.test(obs.inputKinds[inp] || '')
      ));
      const fallbackCandidates = audioCandidates.length
        ? audioCandidates
        : allInputs.filter((inp) => !nonAudioKindRe.test(obs.inputKinds[inp] || ''));
      const muteTargets = (fallbackCandidates.length ? fallbackCandidates : allInputs).slice(0, 6);
      for (const inputName of muteTargets) {
        items.push({
          type: 'mute',
          inputName,
          mode: 'toggle',
          label: inputName,
          icon: '🎙️',
          color: '#854d0e',
        });
      }
      items.push(
        { type: 'output', target: 'stream', mode: 'toggle', label: 'Stream', icon: '📡', color: '#991b1b' },
        { type: 'output', target: 'record', mode: 'toggle', label: 'Record', icon: '🔴', color: '#991b1b' },
        { type: 'chapter', label: 'Chapter', icon: '🔖', color: '#854d0e' },
        { type: 'studio', action: 'toggle', label: 'Studio Mode', icon: '🎬', color: '#581c87' },
        { type: 'output', target: 'vcam', mode: 'toggle', label: 'Virtual Cam', icon: '📹', color: '#166534' },
        { type: 'screenshot', imageFormat: 'png', label: 'Snapshot', icon: '📸', color: '#115e59' },
        { type: 'stats', mode: 'all', label: 'OBS Stats', icon: '📊', color: '#222733' }
      );
      pages.push(...packAutoImportPages('page-broadcast', 'Broadcast', items));
    }

    return pages;
  };

  Deck.applyAutoImport = async (pages, { replaceEmptyStarter = true, skipSnapshot = false } = {}) => {
    const incoming = Array.isArray(pages) ? pages.filter((p) => p && typeof p === 'object') : [];
    if (!incoming.length) return [];
    const replace = replaceEmptyStarter && Deck.isStarterDeck();
    const usedIds = replace ? new Set() : new Set(Deck.cfg.pages.map((d) => d.id));
    const normalized = incoming.map((p, idx) => normalizePage(p, idx, usedIds, false));
    let snapFailed = false;
    if (replace) {
      if (!skipSnapshot && typeof Deck.createSnapshot === 'function') {
        try {
          const s = await Deck.createSnapshot('Before Auto-Import');
          if (s === null && Deck.snapshotsAvailable) snapFailed = true;
        } catch {
          snapFailed = true;
        }
      }
      if (typeof Deck.abortAllTimers === 'function') {
        Deck.abortAllTimers();
      } else if (typeof Deck.abortPageTimers === 'function') {
        for (const old of Deck.cfg.pages) Deck.abortPageTimers(old.id);
      }
      Deck.cfg.pages = normalized;
    } else {
      Deck.cfg.pages.push(...normalized);
    }
    Deck.cfg.activePageId = normalized[0].id;
    Deck.saveCfg();
    Deck.renderGrid();
    if (snapFailed) {
      Deck.setMsg('No snapshot was saved');
    }
    if (Deck.obs.status === 'ok') {
      const mutesToSync = new Set();
      const monitorsToSync = new Set();
      for (const page of normalized) {
        for (const p of page.pads) {
          if (p.type === 'mute' && p.inputName) mutesToSync.add(p.inputName);
          if (p.type === 'monitor' && p.inputName) monitorsToSync.add(p.inputName);
        }
      }
      if (mutesToSync.size || monitorsToSync.size) {
        Promise.all([
          ...[...mutesToSync].map(Deck.fetchMute),
          ...[...monitorsToSync].map(Deck.fetchMonitorType),
        ]).then(() => Deck.renderGrid());
      }
    }
    const padCount = normalized.reduce((sum, p) => sum + (p.pads || []).filter((pad) => pad && pad.type !== 'none').length, 0);
    Deck.setMsg(`Auto-Imported ${padCount} pad(s) across ${normalized.length} page(s)`);
    return normalized;
  };

  const STARTER_LAYOUTS = [
    {
      id: 'solo-streamer',
      name: 'Solo Streamer',
      cols: 4,
      rows: 3,
      pads: [
        {
          slot: 'scene',
          match: /cam|main|talk|chat|face/i,
          fallbackIndex: 0,
          label: 'Main Scene',
          icon: '🎥',
        },
        {
          slot: 'scene',
          match: /game|play|screen|desktop|slide/i,
          fallbackIndex: 1,
          label: 'Game / Screen',
          icon: '🎮',
        },
        {
          slot: 'scene',
          match: /brb|break|away|pause/i,
          fallbackIndex: 2,
          label: 'BRB Scene',
          icon: '☕',
        },
        {
          type: 'output',
          target: 'stream',
          mode: 'toggle',
          label: 'Stream',
          icon: '📡',
          color: '#991b1b',
        },
        {
          slot: 'mute',
          match: /mic|aux|input/i,
          fallbackIndex: 0,
          label: 'Mic Mute',
          icon: '🎙️',
        },
        {
          slot: 'mute',
          match: /desktop|game|audio|music/i,
          fallbackIndex: 1,
          label: 'Desktop Audio',
          icon: '🔊',
        },
        {
          slot: 'source',
          match: /webcam|cam|overlay|alert|face/i,
          label: 'Webcam / Source',
          icon: '📷',
        },
        {
          type: 'output',
          target: 'record',
          mode: 'toggle',
          label: 'Record',
          icon: '🔴',
          color: '#991b1b',
        },
        {
          type: 'chapter',
          label: 'Chapter',
          icon: '🔖',
          color: '#854d0e',
        },
        {
          type: 'stats',
          mode: 'all',
          label: 'OBS Stats',
          icon: '📊',
          color: '#222733',
        },
        {
          type: 'studio',
          action: 'toggle',
          label: 'Studio Mode',
          icon: '🎬',
          color: '#581c87',
        },
        {
          type: 'panic',
          label: 'PANIC',
          icon: '🚨',
          color: '#991b1b',
        },
      ],
    },
    {
      id: 'talk-slides',
      name: 'Talk + Slides',
      cols: 4,
      rows: 3,
      pads: [
        {
          slot: 'scene',
          match: /speaker|talk|cam|face|main/i,
          fallbackIndex: 0,
          label: 'Speaker Scene',
          icon: '🎥',
        },
        {
          slot: 'scene',
          match: /slide|deck|present/i,
          fallbackIndex: 1,
          label: 'Slides Scene',
          icon: '🖥️',
        },
        {
          slot: 'scene',
          match: /brb|break|intro|start/i,
          fallbackIndex: 2,
          label: 'BRB / Intro',
          icon: '☕',
        },
        {
          type: 'output',
          target: 'stream',
          mode: 'toggle',
          label: 'Stream',
          icon: '📡',
          color: '#991b1b',
        },
        {
          slot: 'mute',
          match: /mic|aux|input/i,
          fallbackIndex: 0,
          label: 'Mic Mute',
          icon: '🎙️',
        },
        {
          slot: 'source',
          match: /slide|present|deck|image|pdf/i,
          label: 'Slide Source',
          icon: '🖼️',
        },
        {
          type: 'studio',
          action: 'toggle',
          label: 'Studio Mode',
          icon: '🎬',
          color: '#581c87',
        },
        {
          type: 'output',
          target: 'record',
          mode: 'toggle',
          label: 'Record',
          icon: '🔴',
          color: '#991b1b',
        },
        {
          type: 'chapter',
          label: 'Chapter',
          icon: '🔖',
          color: '#854d0e',
        },
        {
          type: 'stats',
          mode: 'all',
          label: 'OBS Stats',
          icon: '📊',
          color: '#222733',
        },
        {
          type: 'scene',
          mode: 'next',
          label: 'Next Scene',
          icon: '⏭️',
          color: '#115e59',
        },
        {
          type: 'panic',
          label: 'PANIC',
          icon: '🚨',
          color: '#991b1b',
        },
      ],
    },
    {
      id: 'podcast-interview',
      name: 'Podcast/Interview',
      cols: 4,
      rows: 3,
      pads: [
        {
          slot: 'scene',
          match: /host|main|cam|talk/i,
          fallbackIndex: 0,
          label: 'Host Scene',
          icon: '🎥',
        },
        {
          slot: 'scene',
          match: /guest|split|side|interview|slides/i,
          fallbackIndex: 1,
          label: 'Guest Scene',
          icon: '👥',
        },
        {
          slot: 'scene',
          match: /both|wide|all|group|brb/i,
          fallbackIndex: 2,
          label: 'Wide / Both',
          icon: '🎬',
        },
        {
          type: 'output',
          target: 'stream',
          mode: 'toggle',
          label: 'Stream',
          icon: '📡',
          color: '#991b1b',
        },
        {
          slot: 'mute',
          match: /host|mic|aux|input/i,
          fallbackIndex: 0,
          label: 'Host Mic',
          icon: '🎙️',
        },
        {
          slot: 'mute',
          match: /guest|aux|discord|desktop|audio/i,
          fallbackIndex: 1,
          label: 'Guest Audio',
          icon: '🎧',
        },
        {
          slot: 'media',
          match: /media|video|intro|sound|music/i,
          label: 'Soundboard / Media',
          icon: '🎞️',
        },
        {
          type: 'output',
          target: 'record',
          mode: 'toggle',
          label: 'Record',
          icon: '🔴',
          color: '#991b1b',
        },
        {
          type: 'chapter',
          label: 'Chapter',
          icon: '🔖',
          color: '#854d0e',
        },
        {
          type: 'stats',
          mode: 'all',
          label: 'OBS Stats',
          icon: '📊',
          color: '#222733',
        },
        {
          type: 'output',
          target: 'vcam',
          mode: 'toggle',
          label: 'Virtual Cam',
          icon: '📹',
          color: '#166534',
        },
        {
          type: 'panic',
          label: 'PANIC',
          icon: '🚨',
          color: '#991b1b',
        },
      ],
    },
  ];

  function pickCleanItem(list, match, fallbackIndex) {
    if (!Array.isArray(list) || !list.length) return null;
    const clean = list.filter((s) => typeof s === 'string' && !s.startsWith('<'));
    if (match) {
      const foundClean = clean.find((s) => match.test(s));
      if (foundClean) return foundClean;
      const foundAny = list.find((s) => typeof s === 'string' && match.test(s));
      if (foundAny) return foundAny;
    }
    if (fallbackIndex != null) {
      if (clean[fallbackIndex]) return clean[fallbackIndex];
      if (list[fallbackIndex]) return list[fallbackIndex];
    }
    return null;
  }

  function resolveStarterPad(def, obs) {
    if (!def.slot) {
      return normalizePad(JSON.parse(JSON.stringify(def)));
    }
    const connected = obs && obs.status === 'ok';
    const emptySlotPad = () => ({
      type: 'none',
      label: def.label || '',
      icon: def.icon || '',
      color: COLORS[0],
    });

    if (!connected) {
      return emptySlotPad();
    }

    if (def.slot === 'scene') {
      const found = pickCleanItem(obs.scenes || [], def.match, def.fallbackIndex);
      if (found) {
        return normalizePad({
          type: 'scene',
          mode: 'named',
          sceneName: found,
          label: found,
          icon: smartSceneIcon(found),
          color: '#991b1b',
        });
      }
      return emptySlotPad();
    }

    if (def.slot === 'mute') {
      const nonAudioKindRe = /^(image_source|slideshow(_v2)?|browser_source|color_source|text_|window_capture|monitor_capture|display_capture)/i;
      const allInputs = obs.inputs || [];
      const audioCandidates = allInputs.filter((inp) => (
        typeof obs.mutes[inp] === 'boolean' && !nonAudioKindRe.test(obs.inputKinds[inp] || '')
      ));
      const candidates = audioCandidates.length ? audioCandidates : allInputs;
      const found = pickCleanItem(candidates, def.match, def.fallbackIndex);
      if (found) {
        return normalizePad({
          type: 'mute',
          inputName: found,
          mode: 'toggle',
          label: found,
          icon: def.icon || '🎙️',
          color: '#854d0e',
        });
      }
      return emptySlotPad();
    }

    if (def.slot === 'source') {
      const targets = [...new Set([...(obs.scenes || []), ...(obs.groups || [])])];
      let foundScene = '';
      let foundSource = '';
      for (const sc of targets) {
        const items = obs.itemsByScene[sc] || [];
        const item = def.match
          ? items.find((it) => it?.sourceName && def.match.test(it.sourceName))
          : items[0];
        if (item && item.sourceName) {
          foundScene = sc;
          foundSource = item.sourceName;
          break;
        }
      }
      if (foundSource) {
        return normalizePad({
          type: 'source',
          sceneName: foundScene,
          sourceName: foundSource,
          mode: 'toggle',
          label: foundSource,
          icon: smartSourceIcon(foundSource, obs.inputKinds[foundSource]),
          color: '#115e59',
        });
      }
      return emptySlotPad();
    }

    if (def.slot === 'media') {
      const mediaList = obs.mediaInputs || [];
      let found = def.match ? mediaList.find((m) => def.match.test(m)) : mediaList[0];
      if (found) {
        return normalizePad({
          type: 'media',
          inputName: found,
          mediaAction: 'play_pause',
          label: found,
          icon: '🎞️',
          color: '#166534',
        });
      }
      return emptySlotPad();
    }

    return emptySlotPad();
  }

  function buildStarterLayoutPage(nameOrId, obs = Deck.obs) {
    const tpl = STARTER_LAYOUTS.find((t) => t.id === nameOrId || t.name === nameOrId) || STARTER_LAYOUTS[0];
    if (!tpl) return null;
    const total = tpl.cols * tpl.rows;
    const pads = Array.from({ length: total }, emptyPad);
    for (let i = 0; i < tpl.pads.length && i < total; i++) {
      pads[i] = resolveStarterPad(tpl.pads[i], obs);
    }
    return {
      id: `page-${tpl.id}`,
      name: tpl.name,
      cols: tpl.cols,
      rows: tpl.rows,
      pads,
    };
  }

  Deck.STARTER_LAYOUTS = STARTER_LAYOUTS;
  Deck.buildStarterLayoutPage = buildStarterLayoutPage;
  Deck.applyStarterLayout = async (templateName, { replaceEmptyStarter = true } = {}) => {
    const page = buildStarterLayoutPage(templateName);
    if (!page) return [];
    let snapFailed = false;
    if (typeof Deck.createSnapshot === 'function') {
      try {
        const s = await Deck.createSnapshot('Before Starter Layout');
        if (s === null && Deck.snapshotsAvailable) snapFailed = true;
      } catch {
        snapFailed = true;
      }
    }
    const res = await Deck.applyAutoImport([page], { replaceEmptyStarter, skipSnapshot: true });
    if (snapFailed) {
      Deck.setMsg('No snapshot was saved');
    }
    return res;
  };

  Deck.getCurrentPassword = () => (Deck.cfg?.ws?.password) || ($('ws-pass') ? $('ws-pass').value : '') || '';

  Deck.syncWsInputs = () => {
    if (!Deck.cfg?.ws) return;
    if ($('ws-host')) $('ws-host').value = Deck.cfg.ws.host ?? '';
    if ($('ws-port')) $('ws-port').value = Deck.cfg.ws.port ?? '';
    if ($('ws-pass')) $('ws-pass').value = Deck.cfg.ws.password ?? '';
  };

  Deck.setMsg = (txt) => {
    const el = $('msg-info');
    if (el) el.textContent = txt;
  };

  Deck.updateSceneHeader = () => {
    const el = $('scene-info');
    if (!el) return;
    const { programScene, previewScene, studioModeEnabled } = Deck.obs;
    el.textContent = studioModeEnabled && previewScene
      ? `Program: ${programScene || '—'} | Preview: ${previewScene}`
      : `Program: ${programScene || '—'}`;
  };

  Deck.setConn = (cls, txt) => {
    Deck.obs.status = cls;
    const pill = $('conn-pill');
    const text = $('conn-text');
    if (pill) pill.className = `pill ${cls}`;
    if (text) text.textContent = txt;
  };

  Deck.obsCall = (requestType, requestData) => {
    const { obs } = Deck;
    if (!obs.ws || obs.ws.readyState !== 1) return Promise.reject(new Error('Not connected to OBS'));
    const requestId = String(++obs.reqId);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        obs.pending.delete(requestId);
        reject(new Error(`Timeout: ${requestType}`));
      }, 5000);
      obs.pending.set(requestId, { resolve, reject, timer, requestType });
      obs.ws.send(JSON.stringify({ op: 6, d: { requestType, requestId, requestData } }));
    });
  };

  Deck.refreshFilters = async (sourceName) => {
    if (!sourceName) return [];
    try {
      const r = await Deck.obsCall('GetSourceFilterList', { sourceName });
      Deck.obs.filtersBySource[sourceName] = r.filters || [];
    } catch {
      Deck.obs.filtersBySource[sourceName] = Deck.obs.filtersBySource[sourceName] || [];
    }
    return Deck.obs.filtersBySource[sourceName];
  };

  Deck.fetchMute = async (inputName) => {
    if (!inputName) return false;
    try {
      const r = await Deck.obsCall('GetInputMute', { inputName });
      Deck.obs.mutes[inputName] = !!r.inputMuted;
    } catch {}
    return !!Deck.obs.mutes[inputName];
  };

  Deck.fetchVolume = async (inputName) => {
    if (!inputName) return 0;
    try {
      const r = await Deck.obsCall('GetInputVolume', { inputName });
      if (typeof r.inputVolumeDb === 'number') Deck.obs.volumes[inputName] = r.inputVolumeDb;
    } catch {}
    return typeof Deck.obs.volumes[inputName] === 'number' ? Deck.obs.volumes[inputName] : 0;
  };

  Deck.fetchMediaState = async (inputName) => {
    if (!inputName) return '';
    try {
      const r = await Deck.obsCall('GetMediaInputStatus', { inputName });
      if (r.mediaState) Deck.obs.mediaStates[inputName] = r.mediaState;
    } catch {}
    return Deck.obs.mediaStates[inputName] || '';
  };

  Deck.fetchMonitorType = async (inputName) => {
    if (!inputName) return 'OBS_MONITORING_TYPE_NONE';
    try {
      const r = await Deck.obsCall('GetInputAudioMonitorType', { inputName });
      if (r.monitorType) Deck.obs.monitors[inputName] = r.monitorType;
    } catch {}
    return Deck.obs.monitors[inputName] || 'OBS_MONITORING_TYPE_NONE';
  };

  Deck.formatStatsText = (mode = 'all') => {
    const s = Deck.obs.stats || {};
    const cpu = Number(s.cpuUsage || 0);
    const fps = Number(s.activeFps || 0);
    const dropped = Number(s.renderSkippedFrames || 0) + Number(s.outputSkippedFrames || 0);
    if (mode === 'cpu') return `${cpu.toFixed(1)}% CPU`;
    if (mode === 'fps') return `${fps.toFixed(1)} FPS`;
    if (mode === 'dropped') return `${dropped} drop`;
    return `${cpu.toFixed(0)}% · ${fps.toFixed(0)}fps · ${dropped}d`;
  };

  Deck.fetchStats = async () => {
    try {
      const r = await Deck.obsCall('GetStats');
      Deck.obs.stats = {
        cpuUsage: Number(r.cpuUsage) || 0,
        memoryUsage: Number(r.memoryUsage) || 0,
        activeFps: Number(r.activeFps) || 0,
        renderSkippedFrames: Number(r.renderSkippedFrames) || 0,
        outputSkippedFrames: Number(r.outputSkippedFrames) || 0,
      };
      if (typeof Deck.updateStatsPads === 'function') Deck.updateStatsPads();
      else Deck.renderGrid();
    } catch {}
    return Deck.obs.stats;
  };

  Deck.syncStatsPolling = () => {
    const { obs } = Deck;
    const connected = Boolean(obs.ws && obs.ws.readyState === 1 && obs.status === 'ok');
    const needsStats = connected && Deck.getActivePads().some((p) => p && p.type === 'stats');
    if (needsStats) {
      if (!obs.statsTimer) {
        obs.statsTimer = setInterval(() => {
          const stillConnected = Boolean(obs.ws && obs.ws.readyState === 1 && obs.status === 'ok');
          if (stillConnected && Deck.getActivePads().some((p) => p && p.type === 'stats')) {
            Deck.fetchStats();
          } else {
            Deck.syncStatsPolling();
          }
        }, 2000);
      }
    } else if (obs.statsTimer) {
      clearInterval(obs.statsTimer);
      obs.statsTimer = null;
    }
  };

  function formatTimecode(timecode, durationMs) {
    if (typeof timecode === 'string' && timecode.trim()) {
      return timecode.trim().replace(/\.\d+$/, '');
    }
    if (typeof durationMs === 'number' && Number.isFinite(durationMs) && durationMs >= 0) {
      const totalSec = Math.floor(durationMs / 1000);
      const sec = totalSec % 60;
      const min = Math.floor(totalSec / 60) % 60;
      const hr = Math.floor(totalSec / 3600);
      const pad = (n) => String(n).padStart(2, '0');
      return `${pad(hr)}:${pad(min)}:${pad(sec)}`;
    }
    return '';
  }

  function formatMediaTimeLeft(durationMs, cursorMs, timecode) {
    if (typeof timecode === 'string' && timecode.trim()) {
      return timecode.trim().replace(/\.\d+$/, '');
    }
    if (typeof durationMs === 'number' && Number.isFinite(durationMs) && durationMs >= 0) {
      const cur = typeof cursorMs === 'number' && Number.isFinite(cursorMs) ? cursorMs : 0;
      const remainingMs = Math.max(0, durationMs - cur);
      const totalSec = Math.floor(remainingMs / 1000);
      const sec = totalSec % 60;
      const min = Math.floor(totalSec / 60) % 60;
      const hr = Math.floor(totalSec / 3600);
      const pad = (n) => String(n).padStart(2, '0');
      if (hr > 0) return `${pad(hr)}:${pad(min)}:${pad(sec)}`;
      return `${pad(min)}:${pad(sec)}`;
    }
    return '';
  }

  function isReadoutPad(p) {
    if (!p) return false;
    if (p.type === 'volume') return true;
    if (p.type === 'media') return true;
    if (p.type === 'output' && (p.target === 'stream' || p.target === 'record' || p.target === 'recordPause')) return true;
    return false;
  }

  function needsReadoutPolling(p) {
    if (!p) return false;
    if (p.type === 'media') return true;
    if (p.type === 'output' && (p.target === 'stream' || p.target === 'record' || p.target === 'recordPause')) return true;
    return false;
  }

  Deck.isReadoutPad = isReadoutPad;

  Deck.getPadReadoutText = (p) => {
    if (!p) return '';
    const { obs } = Deck;
    const connected = Boolean(obs.ws && obs.ws.readyState === 1 && obs.status === 'ok');
    if (!connected) return '';

    if (p.type === 'volume' && p.inputName) {
      const cur = obs.volumes?.[p.inputName];
      if (typeof cur === 'number' && Number.isFinite(cur)) {
        const dbVal = Math.round(cur * 10) / 10;
        return `${dbVal} dB`;
      }
      return '';
    }

    if (p.type === 'output' && p.target === 'stream') {
      if (!obs.outputs.stream) return '';
      const st = obs.streamStatus;
      if (!st) return '00:00:00';
      return formatTimecode(st.outputTimecode, st.outputDuration) || '00:00:00';
    }

    if (p.type === 'output' && (p.target === 'record' || p.target === 'recordPause')) {
      if (!obs.outputs.record) return '';
      if (obs.outputs.recordPaused || obs.recordStatus?.outputPaused) return 'PAUSED';
      const st = obs.recordStatus;
      if (!st) return '00:00:00';
      return formatTimecode(st.outputTimecode, st.outputDuration) || '00:00:00';
    }

    if (p.type === 'media' && p.inputName) {
      const st = obs.mediaStatus?.[p.inputName];
      const state = st?.mediaState || obs.mediaStates?.[p.inputName];
      if (!state || state === 'OBS_MEDIA_STATE_STOPPED' || state === 'OBS_MEDIA_STATE_ENDED') return '';
      if (st) {
        return formatMediaTimeLeft(st.mediaDuration, st.mediaCursor, st.mediaTimecode);
      }
      return '';
    }

    return '';
  };

  Deck.fetchReadouts = async () => {
    const { obs } = Deck;
    const connected = Boolean(obs.ws && obs.ws.readyState === 1 && obs.status === 'ok');
    if (!connected) return;
    const activePads = Deck.getActivePads();
    const hasStream = activePads.some((p) => p && p.type === 'output' && p.target === 'stream');
    const hasRecord = activePads.some((p) => p && p.type === 'output' && (p.target === 'record' || p.target === 'recordPause'));
    const mediaInputs = [...new Set(activePads.filter((p) => p && p.type === 'media' && p.inputName).map((p) => p.inputName))];

    const calls = [];
    if (hasStream) {
      calls.push(Deck.obsCall('GetStreamStatus').then((r) => {
        obs.streamStatus = r;
        if (typeof r.outputActive === 'boolean') obs.outputs.stream = r.outputActive;
      }).catch(() => {}));
    }
    if (hasRecord) {
      calls.push(Deck.obsCall('GetRecordStatus').then((r) => {
        obs.recordStatus = r;
        if (typeof r.outputActive === 'boolean') obs.outputs.record = r.outputActive;
        if (typeof r.outputPaused === 'boolean') obs.outputs.recordPaused = r.outputPaused;
      }).catch(() => {}));
    }
    for (const name of mediaInputs) {
      calls.push(Deck.obsCall('GetMediaInputStatus', { inputName: name }).then((r) => {
        obs.mediaStatus = obs.mediaStatus || {};
        obs.mediaStatus[name] = r;
        if (r.mediaState) obs.mediaStates[name] = r.mediaState;
      }).catch(() => {}));
    }

    if (calls.length > 0) {
      await Promise.all(calls);
    }
    if (typeof Deck.updateReadoutPads === 'function') {
      Deck.updateReadoutPads();
    }
  };

  Deck.syncReadoutPolling = () => {
    const { obs } = Deck;
    const connected = Boolean(obs.ws && obs.ws.readyState === 1 && obs.status === 'ok');
    const needsPolling = connected && Deck.getActivePads().some(needsReadoutPolling);
    if (connected) {
      const missingVolumes = Deck.getActivePads()
        .filter((p) => p && p.type === 'volume' && p.inputName && typeof obs.volumes[p.inputName] !== 'number')
        .map((p) => p.inputName);
      if (missingVolumes.length > 0) {
        Promise.all([...new Set(missingVolumes)].map(Deck.fetchVolume)).then(() => {
          if (typeof Deck.updateReadoutPads === 'function') Deck.updateReadoutPads();
        });
      }
    }
    if (needsPolling) {
      if (!obs.readoutTimer) {
        Deck.fetchReadouts();
        obs.readoutTimer = setInterval(() => {
          const stillConnected = Boolean(obs.ws && obs.ws.readyState === 1 && obs.status === 'ok');
          if (stillConnected && Deck.getActivePads().some(needsReadoutPolling)) {
            Deck.fetchReadouts();
          } else {
            Deck.syncReadoutPolling();
          }
        }, 1000);
      }
    } else if (obs.readoutTimer) {
      clearInterval(obs.readoutTimer);
      obs.readoutTimer = null;
    }
  };

  function applyInputList(rawInputs) {
    const { obs } = Deck;
    const list = Array.isArray(rawInputs) ? rawInputs : [];
    obs.inputs = list.map((i) => i.inputName).filter(Boolean);
    obs.inputKinds = {};
    obs.mediaInputs = [];
    obs.browserInputs = [];
    obs.imageInputs = [];
    for (const i of list) {
      if (!i?.inputName) continue;
      const kind = String(i.inputKind || '');
      obs.inputKinds[i.inputName] = kind;
      if (/ffmpeg|vlc|media/i.test(kind)) obs.mediaInputs.push(i.inputName);
      if (/browser/i.test(kind)) obs.browserInputs.push(i.inputName);
      if (kind === 'image_source' || kind === 'slideshow' || kind === 'slideshow_v2' || /image_source|slideshow/i.test(kind)) {
        obs.imageInputs.push(i.inputName);
      }
    }
  }

  async function refreshSceneOrGroupItems(name) {
    const { obs } = Deck;
    const req = obs.groups.has(name) ? 'GetGroupSceneItemList' : 'GetSceneItemList';
    const r = await Deck.obsCall(req, { sceneName: name });
    const items = r.sceneItems || [];
    obs.itemsByScene[name] = items;
    const groupItems = items.filter((it) => it.isGroup);
    if (groupItems.length) {
      await Promise.all(groupItems.map(async (it) => {
        obs.groups.add(it.sourceName);
        try {
          const gr = await Deck.obsCall('GetGroupSceneItemList', { sceneName: it.sourceName });
          obs.itemsByScene[it.sourceName] = gr.sceneItems || [];
        } catch {}
      }));
    }
  }

  async function performSync() {
    const { obs, cfg } = Deck;
    try {
      const safe = (req, data) => Deck.obsCall(req, data).catch(() => null);
      const [
        sl, il, studioRes, streamRes, recRes, vcamRes, replayRes,
        profRes, collRes, transListRes, curTransRes, hkRes, videoRes, statsRes,
      ] = await Promise.all([
        Deck.obsCall('GetSceneList'),
        Deck.obsCall('GetInputList'),
        safe('GetStudioModeEnabled'),
        safe('GetStreamStatus'),
        safe('GetRecordStatus'),
        safe('GetVirtualCamStatus'),
        safe('GetReplayBufferStatus'),
        safe('GetProfileList'),
        safe('GetSceneCollectionList'),
        safe('GetSceneTransitionList'),
        safe('GetCurrentSceneTransition'),
        safe('GetHotkeyList'),
        safe('GetVideoSettings'),
        safe('GetStats'),
      ]);

      obs.scenes = (sl.scenes || []).map((s) => s.sceneName).reverse();
      obs.programScene = sl.currentProgramSceneName || '';
      obs.previewScene = sl.currentPreviewSceneName || '';
      applyInputList(il.inputs);

      if (studioRes) obs.studioModeEnabled = !!studioRes.studioModeEnabled;
      if (streamRes) obs.outputs.stream = !!streamRes.outputActive;
      if (recRes) {
        obs.outputs.record = !!recRes.outputActive;
        obs.outputs.recordPaused = !!recRes.outputPaused;
      }
      if (vcamRes) obs.outputs.vcam = !!vcamRes.outputActive;
      if (replayRes) obs.outputs.replay = !!replayRes.outputActive;
      if (profRes) {
        obs.currentProfile = profRes.currentProfileName || '';
        obs.profiles = (profRes.profiles || []).map((p) => (typeof p === 'string' ? p : p?.profileName)).filter(Boolean);
      }
      if (collRes) {
        obs.currentCollection = collRes.currentSceneCollectionName || '';
        obs.collections = (collRes.sceneCollections || []).map((c) => (typeof c === 'string' ? c : c?.sceneCollectionName)).filter(Boolean);
      }
      if (transListRes) {
        obs.currentTransition = transListRes.currentSceneTransitionName || obs.currentTransition;
        obs.transitions = (transListRes.transitions || [])
          .map((t) => (typeof t === 'string' ? t : t?.transitionName))
          .filter(Boolean);
      }
      if (curTransRes) {
        if (curTransRes.transitionName) obs.currentTransition = curTransRes.transitionName;
        if (typeof curTransRes.transitionDuration === 'number') obs.transitionDuration = curTransRes.transitionDuration;
      }
      if (hkRes && Array.isArray(hkRes.hotkeys)) {
        obs.hotkeys = hkRes.hotkeys.filter(Boolean);
      }
      if (videoRes) {
        obs.videoSettings = {
          baseWidth: Number(videoRes.baseWidth) || 1920,
          baseHeight: Number(videoRes.baseHeight) || 1080,
        };
      }
      if (statsRes) {
        obs.stats = {
          cpuUsage: Number(statsRes.cpuUsage) || 0,
          memoryUsage: Number(statsRes.memoryUsage) || 0,
          activeFps: Number(statsRes.activeFps) || 0,
          renderSkippedFrames: Number(statsRes.renderSkippedFrames) || 0,
          outputSkippedFrames: Number(statsRes.outputSkippedFrames) || 0,
        };
      }

      obs.groups = new Set();
      obs.itemsByScene = {};
      await Promise.all(obs.scenes.map((s) => refreshSceneOrGroupItems(s).catch(() => {})));

      const filterSources = new Set([...obs.scenes, ...obs.groups, ...obs.inputs]);
      for (const list of Object.values(obs.itemsByScene)) {
        for (const it of list) if (it?.sourceName) filterSources.add(it.sourceName);
      }
      const muteInputs = new Set(obs.inputs);
      const volumeInputs = new Set();
      const monitorInputs = new Set();
      const mediaTargets = new Set(obs.mediaInputs);
      const collectStep = (st) => {
        if (!st) return;
        if (st.type === 'filter' && st.sourceName) filterSources.add(st.sourceName);
        if (st.type === 'mute' && st.inputName) muteInputs.add(st.inputName);
        if (st.type === 'volume' && st.inputName) volumeInputs.add(st.inputName);
        if (st.type === 'media' && st.inputName) mediaTargets.add(st.inputName);
        if (st.type === 'monitor' && st.inputName) monitorInputs.add(st.inputName);
      };
      for (const d of cfg.pages) {
        for (const p of d.pads) {
          collectStep(p);
          (p.steps || []).forEach(collectStep);
        }
      }
      (cfg.panicSteps || []).forEach(collectStep);

      await Promise.all([
        ...[...filterSources].map(Deck.refreshFilters),
        ...[...muteInputs].map(Deck.fetchMute),
        ...[...volumeInputs].map(Deck.fetchVolume),
        ...[...mediaTargets].map(Deck.fetchMediaState),
        ...[...monitorInputs].map(Deck.fetchMonitorType),
      ]);

      if (typeof Deck.syncTransforms === 'function') {
        try { await Deck.syncTransforms(); } catch {}
      }

      Deck.updateSceneHeader();
      Deck.scheduleRenderGrid();
      Deck.syncStatsPolling();
      Deck.syncReadoutPolling();
      if (typeof Deck.updateReadoutPads === 'function') Deck.updateReadoutPads();
    } catch (e) {
      Deck.setMsg(`Sync error: ${e.message}`);
    }
  }

  Deck.syncObsState = () => {
    const { obs } = Deck;
    if (obs.activeSync) {
      if (!obs.queuedSync) {
        obs.queuedSync = obs.activeSync
          .catch(() => {})
          .then(() => {
            obs.queuedSync = null;
            if (!obs.ws || obs.ws.readyState !== 1) return;
            return Deck.syncObsState();
          });
      }
      return obs.queuedSync;
    }
    obs.activeSync = performSync().finally(() => {
      obs.activeSync = null;
    });
    return obs.activeSync;
  };

  function syncSceneLinkedPage(sceneName) {
    if (Deck.editMode || !sceneName) return false;
    const linked = (Deck.cfg.pages || []).find((p) => p.sceneName && p.sceneName === sceneName);
    if (linked && Deck.cfg.activePageId !== linked.id) {
      Deck.setActivePage(linked.id);
      return true;
    }
    return false;
  }
  Deck.syncSceneLinkedPage = syncSceneLinkedPage;

  async function handleObsEvent(type, d) {
    const { obs } = Deck;
    if (type === 'CurrentProgramSceneChanged') {
      obs.programScene = d.sceneName || '';
      syncSceneLinkedPage(obs.programScene);
      Deck.updateSceneHeader();
      Deck.scheduleRenderGrid();
    } else if (type === 'CurrentPreviewSceneChanged') {
      obs.previewScene = d.sceneName || '';
      Deck.updateSceneHeader();
      Deck.scheduleRenderGrid();
    } else if (type === 'StudioModeStateChanged') {
      obs.studioModeEnabled = !!d.studioModeEnabled;
      Deck.updateSceneHeader();
      Deck.scheduleRenderGrid();
    } else if (type === 'SceneNameChanged') {
      const oldName = d.oldSceneName;
      const newName = d.sceneName;
      if (oldName && newName && oldName !== newName) {
        if (obs.programScene === oldName) obs.programScene = newName;
        if (obs.previewScene === oldName) obs.previewScene = newName;
        applyRename('scene', oldName, newName);
      }
      await Deck.syncObsState();
    } else if (type === 'SceneRemoved') {
      const removedScene = d.sceneName;
      if (removedScene) {
        const clearedPages = [];
        for (const page of (Deck.cfg.pages || [])) {
          if (page.sceneName === removedScene) {
            delete page.sceneName;
            clearedPages.push(page.name);
          }
        }
        if (clearedPages.length) {
          Deck.saveCfg();
          Deck.renderGrid();
          Deck.setMsg(`Cleared scene link on Page "${clearedPages.join(', ')}": scene "${removedScene}" removed`);
        }
      }
      await Deck.syncObsState();
    } else if (type === 'InputNameChanged') {
      const oldName = d.oldInputName;
      const newName = d.inputName;
      if (oldName && newName && oldName !== newName) {
        applyRename('input', oldName, newName);
      }
      await Deck.syncObsState();
    } else if (type === 'SceneListChanged' || type === 'CurrentSceneCollectionChanged') {
      if (type === 'CurrentSceneCollectionChanged' && d.sceneCollectionName) {
        obs.currentCollection = d.sceneCollectionName;
      }
      await Deck.syncObsState();
    } else if (type === 'InputCreated' || type === 'InputRemoved') {
      try {
        const il = await Deck.obsCall('GetInputList');
        applyInputList(il.inputs);
      } catch {}
      Deck.scheduleRenderGrid();
    } else if (type === 'SceneItemEnableStateChanged') {
      const arr = obs.itemsByScene[d.sceneName];
      if (arr) {
        const it = arr.find((x) => x.sceneItemId === d.sceneItemId);
        if (it) it.sceneItemEnabled = !!d.sceneItemEnabled;
      }
      Deck.scheduleRenderGrid();
    } else if (type === 'SceneItemCreated' || type === 'SceneItemRemoved') {
      try { await refreshSceneOrGroupItems(d.sceneName); } catch {}
      Deck.scheduleRenderGrid();
    } else if (type === 'SourceFilterEnableStateChanged') {
      const arr = obs.filtersBySource[d.sourceName];
      if (arr) {
        const f = arr.find((x) => x.filterName === d.filterName);
        if (f) f.filterEnabled = !!d.filterEnabled;
      }
      Deck.scheduleRenderGrid();
    } else if (type === 'SourceFilterCreated' || type === 'SourceFilterRemoved' || type === 'SourceFilterListReindexed' || type === 'SourceFilterNameChanged') {
      await Deck.refreshFilters(d.sourceName);
      Deck.scheduleRenderGrid();
    } else if (type === 'InputMuteStateChanged') {
      obs.mutes[d.inputName] = !!d.inputMuted;
      Deck.scheduleRenderGrid();
    } else if (type === 'InputVolumeChanged') {
      if (d.inputName && typeof d.inputVolumeDb === 'number') obs.volumes[d.inputName] = d.inputVolumeDb;
      if (typeof Deck.updateReadoutPads === 'function') Deck.updateReadoutPads();
      Deck.scheduleRenderGrid();
    } else if (type === 'InputAudioMonitorTypeChanged') {
      if (d.inputName && d.monitorType) obs.monitors[d.inputName] = d.monitorType;
      Deck.scheduleRenderGrid();
    } else if (type === 'StreamStateChanged') {
      obs.outputs.stream = !!d.outputActive;
      if (!d.outputActive) obs.streamStatus = null;
      else if (typeof Deck.fetchReadouts === 'function') Deck.fetchReadouts();
      if (typeof Deck.updateReadoutPads === 'function') Deck.updateReadoutPads();
      Deck.scheduleRenderGrid();
    } else if (type === 'RecordStateChanged') {
      obs.outputs.record = !!d.outputActive;
      if (d.outputState === 'OBS_WEBSOCKET_OUTPUT_PAUSED') obs.outputs.recordPaused = true;
      else if (d.outputState === 'OBS_WEBSOCKET_OUTPUT_RESUMED' || !d.outputActive) obs.outputs.recordPaused = false;
      if (!d.outputActive) obs.recordStatus = null;
      else if (typeof Deck.fetchReadouts === 'function') Deck.fetchReadouts();
      if (typeof Deck.updateReadoutPads === 'function') Deck.updateReadoutPads();
      Deck.scheduleRenderGrid();
    } else if (type === 'VirtualcamStateChanged') {
      obs.outputs.vcam = !!d.outputActive;
      Deck.scheduleRenderGrid();
    } else if (type === 'ReplayBufferStateChanged') {
      obs.outputs.replay = !!d.outputActive;
      Deck.scheduleRenderGrid();
    } else if (type === 'ReplayBufferSaved') {
      if (d.savedReplayPath) Deck.setMsg(`Replay saved: ${d.savedReplayPath}`);
    } else if (type === 'MediaInputPlaybackStarted') {
      if (d.inputName) obs.mediaStates[d.inputName] = 'OBS_MEDIA_STATE_PLAYING';
      if (typeof Deck.fetchReadouts === 'function') Deck.fetchReadouts();
      if (typeof Deck.updateReadoutPads === 'function') Deck.updateReadoutPads();
      Deck.scheduleRenderGrid();
    } else if (type === 'MediaInputPlaybackEnded') {
      if (d.inputName) {
        obs.mediaStates[d.inputName] = 'OBS_MEDIA_STATE_ENDED';
        if (obs.mediaStatus) delete obs.mediaStatus[d.inputName];
      }
      if (typeof Deck.updateReadoutPads === 'function') Deck.updateReadoutPads();
      Deck.scheduleRenderGrid();
    } else if (type === 'MediaInputActionTriggered') {
      if (d.inputName) {
        if (d.mediaAction === 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PLAY' || d.mediaAction === 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_RESTART' || d.mediaAction === 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_NEXT' || d.mediaAction === 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PREVIOUS') {
          obs.mediaStates[d.inputName] = 'OBS_MEDIA_STATE_PLAYING';
        } else if (d.mediaAction === 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PAUSE') {
          obs.mediaStates[d.inputName] = 'OBS_MEDIA_STATE_PAUSED';
        } else if (d.mediaAction === 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_STOP') {
          obs.mediaStates[d.inputName] = 'OBS_MEDIA_STATE_STOPPED';
        }
      }
      Deck.scheduleRenderGrid();
    } else if (type === 'SceneItemTransformChanged') {
      if (typeof Deck.syncTransforms === 'function') {
        Deck.syncTransforms();
      }
    } else if (type === 'CurrentProfileChanged') {
      obs.currentProfile = d.profileName || '';
      Deck.scheduleRenderGrid();
    } else if (type === 'ProfileListChanged') {
      if (Array.isArray(d.profiles)) {
        obs.profiles = d.profiles.map((p) => (typeof p === 'string' ? p : p?.profileName)).filter(Boolean);
      }
      Deck.scheduleRenderGrid();
    } else if (type === 'SceneCollectionListChanged') {
      if (Array.isArray(d.sceneCollections)) {
        obs.collections = d.sceneCollections.map((c) => (typeof c === 'string' ? c : c?.sceneCollectionName)).filter(Boolean);
      }
      Deck.scheduleRenderGrid();
    } else if (type === 'CurrentSceneTransitionChanged') {
      obs.currentTransition = d.transitionName || '';
      Deck.scheduleRenderGrid();
    } else if (type === 'CurrentSceneTransitionDurationChanged') {
      if (typeof d.transitionDuration === 'number') obs.transitionDuration = d.transitionDuration;
    }
  }

  function probeSinglePort(host, port, timeoutMs = 450) {
    return new Promise((resolve) => {
      let settled = false;
      let timer = null;
      let ws = null;
      const done = (ok) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (ws) {
          ws.onopen = ws.onmessage = ws.onerror = ws.onclose = null;
          try { ws.close(); } catch {}
        }
        resolve(ok);
      };
      timer = setTimeout(() => done(false), timeoutMs);
      try {
        ws = new WebSocket(`ws://${host}:${port}`);
      } catch {
        done(false);
        return;
      }
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.op === 0) done(true);
        } catch {}
      };
      ws.onerror = () => done(false);
      ws.onclose = () => done(false);
    });
  }

  Deck.probeObsPorts = async (host = '127.0.0.1', ports = Deck.PROBE_PORTS, timeoutMs = 450) => {
    const cleanHost = String(host || '127.0.0.1').trim() || '127.0.0.1';
    const list = (Array.isArray(ports) ? ports : Deck.PROBE_PORTS)
      .map(parseValidPort)
      .filter((p) => p !== null);
    if (!list.length) return null;
    const results = await Promise.all(list.map((p) => probeSinglePort(cleanHost, p, timeoutMs)));
    const idx = results.findIndex(Boolean);
    return idx >= 0 ? list[idx] : null;
  };

  const CLOSE_CODES = {
    1000: { name: 'Normal Closure' },
    1001: { name: 'Going Away' },
    1002: { name: 'Protocol Error', unrecoverable: true },
    1003: { name: 'Unsupported Data', unrecoverable: true },
    1005: { name: 'No Status' },
    1006: { name: 'Abnormal Closure' },
    1008: { name: 'Policy Violation', unrecoverable: true },
    4000: { name: 'Unknown Reason' },
    4002: { name: 'Message Decode Error', unrecoverable: true },
    4003: { name: 'Missing Data Field', unrecoverable: true },
    4004: { name: 'Invalid Data Field Type', unrecoverable: true },
    4005: { name: 'Invalid Data Field Value', unrecoverable: true },
    4006: { name: 'Unknown OpCode', unrecoverable: true },
    4009: { name: 'Auth Failed', unrecoverable: true },
    4010: { name: 'Unsupported RPC Version', unrecoverable: true },
    4011: { name: 'Session Invalidated', unrecoverable: true },
  };

  Deck.disconnectObs = (manual = true) => {
    const { obs } = Deck;
    if (typeof Deck.releaseHold === 'function') {
      try { Deck.releaseHold(); } catch {}
    }
    obs.manualClose = manual;
    clearTimeout(obs.reconnectTimer);
    obs.reconnectTimer = null;
    if (obs.reconnectCountdown) {
      clearInterval(obs.reconnectCountdown);
      obs.reconnectCountdown = null;
    }
    if (obs.statsTimer) {
      clearInterval(obs.statsTimer);
      obs.statsTimer = null;
    }
    if (obs.readoutTimer) {
      clearInterval(obs.readoutTimer);
      obs.readoutTimer = null;
    }
    obs.streamStatus = null;
    obs.recordStatus = null;
    obs.mediaStatus = {};
    if (typeof Deck.clearReadoutPads === 'function') Deck.clearReadoutPads();
    obs.activeSync = null;
    obs.queuedSync = null;
    for (const p of obs.pending.values()) { clearTimeout(p.timer); p.reject(new Error('Disconnected')); }
    obs.pending.clear();
    if (obs.ws) { const w = obs.ws; obs.ws = null; try { w.close(); } catch {} }
    if (manual) {
      obs.retryCount = 0;
      Deck.setConn('bad', 'Disconnected');
      Deck.setMsg('Disconnected');
    }
  };

  function scheduleReconnect(ev) {
    const { obs, cfg } = Deck;
    clearTimeout(obs.reconnectTimer);
    obs.reconnectTimer = null;
    if (obs.reconnectCountdown) {
      clearInterval(obs.reconnectCountdown);
      obs.reconnectCountdown = null;
    }
    const attempt = obs.retryCount || 0;
    const delaySec = Math.min(3 * Math.pow(2, attempt), 30);
    obs.retryCount = attempt + 1;

    const code = ev?.code;
    const codeStr = code ? ` (${code})` : '';
    const entry = code ? CLOSE_CODES[code] : null;
    const reasonText = ev?.reason || entry?.name || (code ? `Code ${code}` : 'Connection dropped');
    let remaining = delaySec;

    const host = obs.currentHost || cfg?.ws?.host || '';
    const isNonLocal = host && !isLocalHost(host);
    const lanNote = isNonLocal ? ' · OBS WebSocket must be reachable on the LAN' : '';

    const updateStatus = () => {
      Deck.setConn('bad', `Retry in ${remaining}s`);
      Deck.setMsg(`Disconnected: ${reasonText}${codeStr}${lanNote} · Retrying in ${remaining}s…`);
    };

    updateStatus();
    obs.reconnectCountdown = setInterval(() => {
      remaining -= 1;
      if (remaining > 0) {
        updateStatus();
      } else {
        clearInterval(obs.reconnectCountdown);
        obs.reconnectCountdown = null;
      }
    }, 1000);

    obs.reconnectTimer = setTimeout(() => {
      if (obs.reconnectCountdown) {
        clearInterval(obs.reconnectCountdown);
        obs.reconnectCountdown = null;
      }
      obs.reconnectTimer = null;
      Deck.connectObs({ isBoot: false });
    }, delaySec * 1000);
  }

  function buildWsTarget(rawHostInput, rawPortInput) {
    let raw = (rawHostInput || '127.0.0.1').trim();
    let proto = 'ws';
    const mProto = raw.match(/^(wss?):\/\//i);
    if (mProto) {
      proto = mProto[1].toLowerCase();
      raw = raw.slice(mProto[0].length);
    }
    raw = raw.replace(/\/.*$/, '');
    let port = Number(rawPortInput);
    if (!(port >= 1 && port <= 65535)) port = 4455;
    let host = raw || '127.0.0.1';
    const bracketPort = host.match(/^(\[[^\]]+\]):(\d+)$/);
    const hostPort = host.match(/^([^:]+):(\d+)$/);
    if (bracketPort) {
      host = bracketPort[1];
      port = Number(bracketPort[2]) || port;
    } else if (hostPort) {
      host = hostPort[1];
      port = Number(hostPort[2]) || port;
    } else if (host.includes(':') && !host.startsWith('[')) {
      host = `[${host}]`;
    }
    return { proto, host, port, url: `${proto}://${host}:${port}` };
  }

  Deck.connectObs = (opts = {}) => {
    const { obs, cfg } = Deck;
    const isBoot = Boolean(opts && typeof opts === 'object' && opts.isBoot === true);
    const myGen = ++obs.connectGen;
    Deck.disconnectObs(false);
    obs.manualClose = false;

    const rawHost = $('ws-host') ? $('ws-host').value : cfg.ws.host;
    const rawPort = $('ws-port') ? $('ws-port').value : cfg.ws.port;
    const { host, port, url } = buildWsTarget(rawHost, rawPort);
    const password = ($('ws-pass') ? $('ws-pass').value : cfg.ws.password) || '';
    if ($('ws-host')) $('ws-host').value = host;
    if ($('ws-port')) $('ws-port').value = port;

    obs.currentHost = host;

    const urlHost = getUrlHost();
    const urlPort = getUrlPort();
    const isManual = !isBoot && (opts?.manual === true || (typeof Event !== 'undefined' && opts instanceof Event));
    const keepManualPort = Boolean(cfg.ws.manualPort) || (isManual && port !== (urlPort || 4455));
    const keepManualHost = Boolean(cfg.ws.manualHost) || (isManual && host !== (urlHost || '127.0.0.1'));
    cfg.ws = { host, port, password };
    if (keepManualPort) cfg.ws.manualPort = true;
    if (keepManualHost) cfg.ws.manualHost = true;
    Deck.saveCfg();
    Deck.setConn('wait', 'Connecting…');

    let ws;
    try { ws = new WebSocket(url); } catch (e) { Deck.setConn('bad', 'Bad WS URL'); Deck.setMsg(e.message); return; }
    obs.ws = ws;
    let opened = false;
    ws.onopen = () => { opened = true; };

    ws.onclose = async (ev) => {
      if (obs.ws !== ws) return;
      if (typeof Deck.releaseHold === 'function') {
        try { Deck.releaseHold(); } catch {}
      }
      obs.ws = null;
      obs.activeSync = null;
      obs.queuedSync = null;
      if (obs.statsTimer) {
        clearInterval(obs.statsTimer);
        obs.statsTimer = null;
      }
      if (obs.readoutTimer) {
        clearInterval(obs.readoutTimer);
        obs.readoutTimer = null;
      }
      obs.streamStatus = null;
      obs.recordStatus = null;
      obs.mediaStatus = {};
      if (typeof Deck.clearReadoutPads === 'function') Deck.clearReadoutPads();
      for (const p of obs.pending.values()) { clearTimeout(p.timer); p.reject(new Error('Closed')); }
      obs.pending.clear();
      if (obs.manualClose) return;

      if (ev.code === 4009) {
        Deck.setConn('bad', 'Auth Failed');
        Deck.setMsg('OBS WebSocket password rejected');
        $('conn-bar')?.classList.add('open');
        return;
      }

      const closeEntry = CLOSE_CODES[ev.code];
      if (closeEntry?.unrecoverable) {
        const name = closeEntry.name;
        const isNonLocal = host && !isLocalHost(host);
        const lanNote = isNonLocal ? ' · OBS WebSocket must be reachable on the LAN' : '';
        const detail = ev.reason ? `${ev.reason} (${ev.code})` : `${name} (${ev.code})`;
        Deck.setConn('bad', name);
        Deck.setMsg(`${detail}${lanNote} — retries stopped`);
        return;
      }

      if (!opened && isBoot && !obs.hasProbedOnBoot
        && isLocalHost(host) && port === 4455 && !cfg.ws.manualPort && !cfg.ws.manualHost && !urlPort && !urlHost) {
        obs.hasProbedOnBoot = true;
        Deck.setConn('wait', 'Scanning OBS ports…');
        Deck.setMsg('Probing local OBS WebSocket ports…');
        const candidates = Deck.PROBE_PORTS.filter((p) => p !== port);
        const foundPort = await Deck.probeObsPorts(host, candidates);
        if (obs.manualClose || obs.connectGen !== myGen) return;
        if (foundPort) {
          cfg.ws.port = foundPort;
          if ($('ws-port')) $('ws-port').value = foundPort;
          Deck.saveCfg();
          Deck.setMsg(`Found OBS WebSocket on port ${foundPort}`);
          Deck.connectObs({ isBoot: false });
          return;
        }
        scheduleReconnect({ code: 1006, reason: 'No OBS WebSocket found on ports 4455–4458, 4444' });
        return;
      }

      scheduleReconnect(ev);
    };

    ws.onmessage = async (ev) => {
      if (obs.ws !== ws) return;
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      if (msg.op === 0) {
        const d = { rpcVersion: 1, eventSubscriptions: 2047 };
        if (msg.d?.authentication) {
          const { challenge, salt } = msg.d.authentication;
          d.authentication = sha256Base64(sha256Base64(password + salt) + challenge);
        }
        ws.send(JSON.stringify({ op: 1, d }));
      } else if (msg.op === 2) {
        obs.retryCount = 0;
        Deck.setConn('ok', 'Connected');
        Deck.setMsg(`Connected to ${url}`);
        await Deck.syncObsState();
        if (typeof Deck.applyPendingHoldRestores === 'function') {
          await Deck.applyPendingHoldRestores();
        }
        syncSceneLinkedPage(obs.programScene);
        if (typeof Deck.onObsConnected === 'function') Deck.onObsConnected();
      } else if (msg.op === 5) {
        await handleObsEvent(msg.d?.eventType, msg.d?.eventData || {});
      } else if (msg.op === 7) {
        const p = obs.pending.get(msg.d?.requestId);
        if (!p) return;
        obs.pending.delete(msg.d.requestId);
        clearTimeout(p.timer);
        if (msg.d.requestStatus?.result) p.resolve(msg.d.responseData || {});
        else p.reject(new Error(`${p.requestType}: ${msg.d.requestStatus?.comment || msg.d.requestStatus?.code}`));
      }
    };
  };

  window.Deck = Deck;
})();
