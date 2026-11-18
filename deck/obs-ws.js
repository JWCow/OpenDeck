(() => {
  'use strict';

  const VERSION = '2.0.0';
  const STORAGE_KEY = 'obs_virtual_deck_v2';
  const LEGACY_STORAGE_KEY = 'obs_virtual_deck_v1';
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
  ];
  const AUTO_OFF_TYPES = new Set(['source', 'filter', 'mute', 'studio', 'output', 'media']);

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

  function normalizeHotkeyKey(rawKey) {
    const k = String(rawKey || '').trim();
    if (!k) return '';
    const low = k.toLowerCase();
    if (low === 'control' || low === 'ctrl' || low === 'shift' || low === 'alt' || low === 'option'
      || low === 'meta' || low === 'cmd' || low === 'command' || low === 'win' || low === 'super') {
      return '';
    }
    if (low === ' ' || low === 'space' || low === 'spacebar') return 'Space';
    if (low === 'esc' || low === 'escape') return 'Escape';
    if (low === 'return' || low === 'enter') return 'Enter';
    if (low === 'del' || low === 'delete') return 'Delete';
    if (low === 'bs' || low === 'backspace') return 'Backspace';
    if (low === 'tab') return 'Tab';
    if (low === 'up' || low === 'arrowup') return 'ArrowUp';
    if (low === 'down' || low === 'arrowdown') return 'ArrowDown';
    if (low === 'left' || low === 'arrowleft') return 'ArrowLeft';
    if (low === 'right' || low === 'arrowright') return 'ArrowRight';
    if (low === 'plus' || k === '+') return 'Plus';
    if (/^f([1-9]|1[0-9]|2[0-4])$/i.test(k)) return k.toUpperCase();
    if (k.length === 1) return /[a-z]/i.test(k) ? k.toUpperCase() : k;
    return k.charAt(0).toUpperCase() + k.slice(1);
  }

  function normalizeHotkey(raw) {
    if (typeof raw !== 'string') return '';
    const trimmed = raw.trim();
    if (!trimmed) return '';
    const parts = trimmed.split('+').map((p) => p.trim()).filter(Boolean);
    if (!parts.length) return '';
    const mods = { Ctrl: false, Alt: false, Shift: false, Meta: false };
    let key = '';
    for (const part of parts) {
      const low = part.toLowerCase();
      if (low === 'ctrl' || low === 'control') mods.Ctrl = true;
      else if (low === 'alt' || low === 'option') mods.Alt = true;
      else if (low === 'shift') mods.Shift = true;
      else if (low === 'meta' || low === 'cmd' || low === 'command' || low === 'win' || low === 'super') mods.Meta = true;
      else key = normalizeHotkeyKey(part);
    }
    if (!key) return '';
    const out = [];
    if (mods.Ctrl) out.push('Ctrl');
    if (mods.Alt) out.push('Alt');
    if (mods.Shift) out.push('Shift');
    if (mods.Meta) out.push('Meta');
    out.push(key);
    return out.join('+');
  }

  function hotkeyFromEvent(ev) {
    if (!ev || typeof ev !== 'object') return '';
    let base = '';
    const code = ev.code || '';
    const digit = code.match(/^Digit([0-9])$/);
    const letter = code.match(/^Key([A-Z])$/);
    if (digit) base = digit[1];
    else if (letter) base = letter[1];
    else if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) base = code;
    else if (code === 'Space') base = 'Space';
    else if (ev.key && ev.key !== 'Dead' && ev.key !== 'Unidentified') base = normalizeHotkeyKey(ev.key);
    else return '';
    if (!base) return '';
    const out = [];
    if (ev.ctrlKey) out.push('Ctrl');
    if (ev.altKey) out.push('Alt');
    if (ev.shiftKey) out.push('Shift');
    if (ev.metaKey) out.push('Meta');
    out.push(base);
    return out.join('+');
  }

  function sanitizeAutoOff(raw) {
    if (raw == null || raw === '') return 0;
    const ms = Math.round(Number(raw));
    return Number.isFinite(ms) && ms > 0 ? ms : 0;
  }

  function normalizePadInternal(raw, isStep) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return { type: 'none', label: '', icon: '', color: COLORS[0] };
    }
    if (isStep && raw.type === 'wait') {
      const delay = Number(raw.delayMs);
      return { type: 'wait', delayMs: Number.isFinite(delay) ? Math.max(0, delay) : 0 };
    }
    let type = PAD_TYPES.includes(raw.type) ? raw.type : 'none';
    if (isStep && (type === 'macro' || type === 'panic')) type = 'none';
    const out = isStep
      ? { type }
      : {
          type,
          label: typeof raw.label === 'string' ? raw.label : '',
          icon: typeof raw.icon === 'string' ? raw.icon : '',
          color: typeof raw.color === 'string' && raw.color ? raw.color : COLORS[0],
        };

    if (!isStep && type !== 'none') {
      const hk = normalizeHotkey(raw.hotkey);
      if (hk) out.hotkey = hk;
    }

    if (type === 'scene') {
      if (raw.sceneName) out.sceneName = String(raw.sceneName);
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
      if (out.mode === 'goto' && raw.deckId) out.deckId = String(raw.deckId);
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
    }

    if (!isStep && AUTO_OFF_TYPES.has(type)) {
      const ms = sanitizeAutoOff(raw.autoOffMs);
      if (ms > 0) out.autoOffMs = ms;
    }
    return out;
  }

  function normalizePad(raw) {
    return normalizePadInternal(raw, false);
  }

  function normalizeStep(raw) {
    return normalizePadInternal(raw, true);
  }

  function defaultPads(cols = DEFAULT_COLS, rows = DEFAULT_ROWS, seedPanic = false) {
    const c = clampInt(cols, MIN_COLS, MAX_COLS, DEFAULT_COLS);
    const r = clampInt(rows, MIN_ROWS, MAX_ROWS, DEFAULT_ROWS);
    const total = c * r;
    const pads = Array.from({ length: total }, () => ({ type: 'none', label: '', icon: '', color: COLORS[0] }));
    if (seedPanic && total > 0) {
      pads[total - 1] = { type: 'panic', label: 'PANIC', icon: '🚨', color: '#991b1b' };
    }
    return pads;
  }

  function defaultDecks() {
    return [{
      id: 'deck-1',
      name: 'Main',
      cols: DEFAULT_COLS,
      rows: DEFAULT_ROWS,
      pads: defaultPads(DEFAULT_COLS, DEFAULT_ROWS, true),
    }];
  }

  function uniqueDeckId(existingIds, preferred) {
    let base = String(preferred || '').trim() || 'deck-1';
    if (!existingIds.has(base)) return base;
    let n = existingIds.size + 1;
    while (existingIds.has(`deck-${n}`)) n++;
    return `deck-${n}`;
  }

  function normalizeDeck(raw, idx, usedIds, seedPanicIfMissing) {
    const cols = clampInt(raw?.cols, MIN_COLS, MAX_COLS, DEFAULT_COLS);
    const rows = clampInt(raw?.rows, MIN_ROWS, MAX_ROWS, DEFAULT_ROWS);
    const id = uniqueDeckId(usedIds, raw?.id || `deck-${idx + 1}`);
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
    return { id, name, cols, rows, pads };
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
      ws.password = typeof raw.ws.password === 'string' ? raw.ws.password : fallbackPassword;
    }

    let decks;
    let activeDeckId;
    if (Array.isArray(raw.decks) && raw.decks.length > 0) {
      const usedIds = new Set();
      decks = raw.decks
        .filter((d) => d && typeof d === 'object')
        .map((d, idx) => normalizeDeck(d, idx, usedIds, false));
      if (!decks.length) throw new Error('Invalid layout JSON (empty decks[])');
      activeDeckId = decks.some((d) => d.id === raw.activeDeckId) ? raw.activeDeckId : decks[0].id;
    } else if (Array.isArray(raw.pads)) {
      const usedIds = new Set();
      const single = normalizeDeck({ id: 'deck-1', name: 'Main', cols: 8, rows: 8, pads: raw.pads }, 0, usedIds, false);
      decks = [single];
      activeDeckId = single.id;
    } else {
      throw new Error('Invalid layout JSON (missing decks[] or pads[])');
    }

    const panicSteps = Array.isArray(raw.panicSteps)
      ? raw.panicSteps
          .filter((s) => s && typeof s === 'object')
          .map(normalizeStep)
          .filter((s) => s.type !== 'none' && s.type !== 'wait')
      : [];

    return { version: 2, ws, activeDeckId, decks, panicSteps };
  }

  function loadState() {
    const base = {
      version: 2,
      ws: { host: '127.0.0.1', port: 4455, password: '' },
      activeDeckId: 'deck-1',
      decks: defaultDecks(),
      panicSteps: [],
    };
    try {
      const rawV2 = localStorage.getItem(STORAGE_KEY);
      if (rawV2) return migrateConfig(JSON.parse(rawV2));
      const rawV1 = localStorage.getItem(LEGACY_STORAGE_KEY);
      if (rawV1) {
        const migrated = migrateConfig(JSON.parse(rawV1));
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated)); } catch {}
        return migrated;
      }
    } catch {}
    return base;
  }

  const Deck = {
    VERSION,
    PAD_COUNT: DEFAULT_COLS * DEFAULT_ROWS,
    MIN_COLS,
    MAX_COLS,
    MIN_ROWS,
    MAX_ROWS,
    COLORS,
    PAD_TYPES,
    AUTO_OFF_TYPES,
    $,
    esc,
    normalizeHotkey,
    hotkeyFromEvent,
    normalizePad,
    normalizeStep,
    defaultPads,
    defaultDecks,
    migrateConfig,
    cfg: loadState(),
    editMode: false,
    activeMacros: new Map(),
    activeAutoOffs: new Map(),
    obs: {
      ws: null,
      status: 'bad',
      reqId: 0,
      pending: new Map(),
      reconnectTimer: null,
      manualClose: false,
      scenes: [],
      groups: new Set(),
      inputs: [],
      inputKinds: {},
      mediaInputs: [],
      browserInputs: [],
      programScene: '',
      previewScene: '',
      studioModeEnabled: false,
      itemsByScene: {},
      filtersBySource: {},
      mutes: {},
      volumes: {},
      mediaStates: {},
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
    renderGrid: () => {},
    updateMacroTicks: () => {},
  };

  Deck.saveCfg = () => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(Deck.cfg)); } catch {}
  };

  Deck.exportConfig = () => {
    const { cfg } = Deck;
    return {
      version: 2,
      ws: { host: cfg.ws.host, port: cfg.ws.port },
      activeDeckId: cfg.activeDeckId,
      decks: cfg.decks.map((d) => ({
        id: d.id,
        name: d.name,
        cols: d.cols,
        rows: d.rows,
        pads: d.pads.map(normalizePad),
      })),
      panicSteps: (cfg.panicSteps || []).map(normalizeStep).filter((s) => s.type !== 'none' && s.type !== 'wait'),
    };
  };

  Deck.getActiveDeck = () => {
    const { cfg } = Deck;
    if (!Array.isArray(cfg.decks) || !cfg.decks.length) {
      cfg.decks = defaultDecks();
      cfg.activeDeckId = cfg.decks[0].id;
    }
    let deck = cfg.decks.find((d) => d.id === cfg.activeDeckId);
    if (!deck) {
      deck = cfg.decks[0];
      cfg.activeDeckId = deck.id;
    }
    return deck;
  };

  Deck.getActivePads = () => Deck.getActiveDeck().pads;

  Deck.setActiveDeck = (deckId) => {
    const deck = Deck.cfg.decks.find((d) => d.id === deckId);
    if (!deck) return null;
    Deck.cfg.activeDeckId = deck.id;
    Deck.saveCfg();
    Deck.renderGrid();
    return deck;
  };

  Deck.addDeck = ({ name, cols, rows, switchTo = true } = {}) => {
    const cur = Deck.getActiveDeck();
    const c = clampInt(cols, MIN_COLS, MAX_COLS, cur.cols || DEFAULT_COLS);
    const r = clampInt(rows, MIN_ROWS, MAX_ROWS, cur.rows || DEFAULT_ROWS);
    const usedIds = new Set(Deck.cfg.decks.map((d) => d.id));
    const id = uniqueDeckId(usedIds, `deck-${Deck.cfg.decks.length + 1}`);
    const deckName = typeof name === 'string' && name.trim() ? name.trim() : `Page ${Deck.cfg.decks.length + 1}`;
    const deck = { id, name: deckName, cols: c, rows: r, pads: defaultPads(c, r, false) };
    Deck.cfg.decks.push(deck);
    if (switchTo) Deck.cfg.activeDeckId = id;
    Deck.saveCfg();
    Deck.renderGrid();
    return deck;
  };

  Deck.duplicateDeck = (deckId) => {
    const src = Deck.cfg.decks.find((d) => d.id === deckId) || Deck.getActiveDeck();
    const usedIds = new Set(Deck.cfg.decks.map((d) => d.id));
    const id = uniqueDeckId(usedIds, `${src.id}-copy`);
    const copy = {
      id,
      name: `${src.name} Copy`,
      cols: src.cols,
      rows: src.rows,
      pads: src.pads.map((p) => normalizePad(JSON.parse(JSON.stringify(p)))),
    };
    const at = Deck.cfg.decks.indexOf(src);
    Deck.cfg.decks.splice(at >= 0 ? at + 1 : Deck.cfg.decks.length, 0, copy);
    Deck.cfg.activeDeckId = copy.id;
    Deck.saveCfg();
    Deck.renderGrid();
    return copy;
  };

  Deck.renameDeck = (deckId, name) => {
    const deck = Deck.cfg.decks.find((d) => d.id === deckId);
    if (!deck) return false;
    const trimmed = String(name || '').trim();
    if (!trimmed) return false;
    deck.name = trimmed;
    Deck.saveCfg();
    Deck.renderGrid();
    return true;
  };

  Deck.deleteDeck = (deckId) => {
    const { decks } = Deck.cfg;
    if (decks.length <= 1) return false;
    const idx = decks.findIndex((d) => d.id === deckId);
    if (idx < 0) return false;
    if (typeof Deck.abortDeckTimers === 'function') Deck.abortDeckTimers(deckId);
    decks.splice(idx, 1);
    if (Deck.cfg.activeDeckId === deckId) {
      Deck.cfg.activeDeckId = decks[Math.max(0, idx - 1)].id;
    }
    Deck.saveCfg();
    Deck.renderGrid();
    return true;
  };

  Deck.resizeDeck = (deckId, newCols, newRows) => {
    const deck = Deck.cfg.decks.find((d) => d.id === deckId) || Deck.getActiveDeck();
    const oldCols = clampInt(deck.cols, MIN_COLS, MAX_COLS, DEFAULT_COLS);
    const oldRows = clampInt(deck.rows, MIN_ROWS, MAX_ROWS, DEFAULT_ROWS);
    const cols = clampInt(newCols, MIN_COLS, MAX_COLS, oldCols);
    const rows = clampInt(newRows, MIN_ROWS, MAX_ROWS, oldRows);
    if (cols === oldCols && rows === oldRows && deck.pads.length === cols * rows) return deck;
    if (typeof Deck.abortDeckTimers === 'function') Deck.abortDeckTimers(deck.id);
    const nextPads = defaultPads(cols, rows, false);
    const copyRows = Math.min(oldRows, rows);
    const copyCols = Math.min(oldCols, cols);
    for (let r = 0; r < copyRows; r++) {
      for (let c = 0; c < copyCols; c++) {
        const src = deck.pads[r * oldCols + c];
        if (src) nextPads[r * cols + c] = normalizePad(src);
      }
    }
    deck.cols = cols;
    deck.rows = rows;
    deck.pads = nextPads;
    Deck.saveCfg();
    Deck.renderGrid();
    return deck;
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

  function applyInputList(rawInputs) {
    const { obs } = Deck;
    const list = Array.isArray(rawInputs) ? rawInputs : [];
    obs.inputs = list.map((i) => i.inputName).filter(Boolean);
    obs.inputKinds = {};
    obs.mediaInputs = [];
    obs.browserInputs = [];
    for (const i of list) {
      if (!i?.inputName) continue;
      const kind = String(i.inputKind || '');
      obs.inputKinds[i.inputName] = kind;
      if (/ffmpeg|vlc|media/i.test(kind)) obs.mediaInputs.push(i.inputName);
      if (/browser/i.test(kind)) obs.browserInputs.push(i.inputName);
    }
  }

  async function refreshSceneOrGroupItems(name) {
    const { obs } = Deck;
    const req = obs.groups.has(name) ? 'GetGroupSceneItemList' : 'GetSceneItemList';
    const r = await Deck.obsCall(req, { sceneName: name });
    const items = r.sceneItems || [];
    obs.itemsByScene[name] = items;
    for (const it of items) {
      if (it.isGroup) {
        obs.groups.add(it.sourceName);
        try {
          const gr = await Deck.obsCall('GetGroupSceneItemList', { sceneName: it.sourceName });
          obs.itemsByScene[it.sourceName] = gr.sceneItems || [];
        } catch {}
      }
    }
  }

  Deck.syncObsState = async () => {
    const { obs, cfg } = Deck;
    try {
      const safe = (req, data) => Deck.obsCall(req, data).catch(() => null);
      const [
        sl, il, studioRes, streamRes, recRes, vcamRes, replayRes,
        profRes, collRes, transListRes, curTransRes,
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

      obs.groups = new Set();
      obs.itemsByScene = {};
      for (const s of obs.scenes) {
        try { await refreshSceneOrGroupItems(s); } catch {}
      }

      const filterSources = new Set();
      const muteInputs = new Set();
      const volumeInputs = new Set();
      const mediaTargets = new Set(obs.mediaInputs);
      const collectStep = (st) => {
        if (!st) return;
        if (st.type === 'filter' && st.sourceName) filterSources.add(st.sourceName);
        if (st.type === 'mute' && st.inputName) muteInputs.add(st.inputName);
        if (st.type === 'volume' && st.inputName) volumeInputs.add(st.inputName);
        if (st.type === 'media' && st.inputName) mediaTargets.add(st.inputName);
      };
      for (const d of cfg.decks) {
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
      ]);

      Deck.updateSceneHeader();
      Deck.renderGrid();
    } catch (e) {
      Deck.setMsg(`Sync error: ${e.message}`);
    }
  };

  async function handleObsEvent(type, d) {
    const { obs } = Deck;
    if (type === 'CurrentProgramSceneChanged') {
      obs.programScene = d.sceneName || '';
      Deck.updateSceneHeader();
      Deck.renderGrid();
    } else if (type === 'CurrentPreviewSceneChanged') {
      obs.previewScene = d.sceneName || '';
      Deck.updateSceneHeader();
      Deck.renderGrid();
    } else if (type === 'StudioModeStateChanged') {
      obs.studioModeEnabled = !!d.studioModeEnabled;
      Deck.updateSceneHeader();
      Deck.renderGrid();
    } else if (type === 'SceneListChanged' || type === 'SceneNameChanged' || type === 'InputNameChanged' || type === 'CurrentSceneCollectionChanged') {
      if (type === 'CurrentSceneCollectionChanged' && d.sceneCollectionName) {
        obs.currentCollection = d.sceneCollectionName;
      }
      await Deck.syncObsState();
    } else if (type === 'InputCreated' || type === 'InputRemoved') {
      try {
        const il = await Deck.obsCall('GetInputList');
        applyInputList(il.inputs);
      } catch {}
      Deck.renderGrid();
    } else if (type === 'SceneItemEnableStateChanged') {
      const arr = obs.itemsByScene[d.sceneName];
      if (arr) {
        const it = arr.find((x) => x.sceneItemId === d.sceneItemId);
        if (it) it.sceneItemEnabled = !!d.sceneItemEnabled;
      }
      Deck.renderGrid();
    } else if (type === 'SceneItemCreated' || type === 'SceneItemRemoved') {
      try { await refreshSceneOrGroupItems(d.sceneName); } catch {}
      Deck.renderGrid();
    } else if (type === 'SourceFilterEnableStateChanged') {
      const arr = obs.filtersBySource[d.sourceName];
      if (arr) {
        const f = arr.find((x) => x.filterName === d.filterName);
        if (f) f.filterEnabled = !!d.filterEnabled;
      }
      Deck.renderGrid();
    } else if (type === 'SourceFilterCreated' || type === 'SourceFilterRemoved' || type === 'SourceFilterListReindexed' || type === 'SourceFilterNameChanged') {
      await Deck.refreshFilters(d.sourceName);
      Deck.renderGrid();
    } else if (type === 'InputMuteStateChanged') {
      obs.mutes[d.inputName] = !!d.inputMuted;
      Deck.renderGrid();
    } else if (type === 'InputVolumeChanged') {
      if (d.inputName && typeof d.inputVolumeDb === 'number') obs.volumes[d.inputName] = d.inputVolumeDb;
      Deck.renderGrid();
    } else if (type === 'StreamStateChanged') {
      obs.outputs.stream = !!d.outputActive;
      Deck.renderGrid();
    } else if (type === 'RecordStateChanged') {
      obs.outputs.record = !!d.outputActive;
      if (d.outputState === 'OBS_WEBSOCKET_OUTPUT_PAUSED') obs.outputs.recordPaused = true;
      else if (d.outputState === 'OBS_WEBSOCKET_OUTPUT_RESUMED' || !d.outputActive) obs.outputs.recordPaused = false;
      Deck.renderGrid();
    } else if (type === 'VirtualcamStateChanged') {
      obs.outputs.vcam = !!d.outputActive;
      Deck.renderGrid();
    } else if (type === 'ReplayBufferStateChanged') {
      obs.outputs.replay = !!d.outputActive;
      Deck.renderGrid();
    } else if (type === 'ReplayBufferSaved') {
      if (d.savedReplayPath) Deck.setMsg(`Replay saved: ${d.savedReplayPath}`);
    } else if (type === 'MediaInputPlaybackStarted') {
      if (d.inputName) obs.mediaStates[d.inputName] = 'OBS_MEDIA_STATE_PLAYING';
      Deck.renderGrid();
    } else if (type === 'MediaInputPlaybackEnded') {
      if (d.inputName) obs.mediaStates[d.inputName] = 'OBS_MEDIA_STATE_ENDED';
      Deck.renderGrid();
    } else if (type === 'CurrentProfileChanged') {
      obs.currentProfile = d.profileName || '';
      Deck.renderGrid();
    } else if (type === 'ProfileListChanged') {
      if (Array.isArray(d.profiles)) {
        obs.profiles = d.profiles.map((p) => (typeof p === 'string' ? p : p?.profileName)).filter(Boolean);
      }
      Deck.renderGrid();
    } else if (type === 'SceneCollectionListChanged') {
      if (Array.isArray(d.sceneCollections)) {
        obs.collections = d.sceneCollections.map((c) => (typeof c === 'string' ? c : c?.sceneCollectionName)).filter(Boolean);
      }
      Deck.renderGrid();
    } else if (type === 'CurrentSceneTransitionChanged') {
      obs.currentTransition = d.transitionName || '';
      Deck.renderGrid();
    } else if (type === 'CurrentSceneTransitionDurationChanged') {
      if (typeof d.transitionDuration === 'number') obs.transitionDuration = d.transitionDuration;
    }
  }

  Deck.disconnectObs = (manual = true) => {
    const { obs } = Deck;
    obs.manualClose = manual;
    clearTimeout(obs.reconnectTimer);
    for (const p of obs.pending.values()) { clearTimeout(p.timer); p.reject(new Error('Disconnected')); }
    obs.pending.clear();
    if (obs.ws) { const w = obs.ws; obs.ws = null; try { w.close(); } catch {} }
    if (manual) Deck.setConn('bad', 'Disconnected');
  };

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

  Deck.connectObs = () => {
    const { obs, cfg } = Deck;
    Deck.disconnectObs(false);
    obs.manualClose = false;
    const { host, port, url } = buildWsTarget($('ws-host').value, $('ws-port').value);
    const password = $('ws-pass').value || '';
    $('ws-host').value = host;
    $('ws-port').value = port;
    cfg.ws = { host, port, password };
    Deck.saveCfg();
    Deck.setConn('wait', 'Connecting…');
    let ws;
    try { ws = new WebSocket(url); } catch (e) { Deck.setConn('bad', 'Bad WS URL'); Deck.setMsg(e.message); return; }
    obs.ws = ws;
    ws.onclose = (ev) => {
      if (obs.ws !== ws) return;
      obs.ws = null;
      for (const p of obs.pending.values()) { clearTimeout(p.timer); p.reject(new Error('Closed')); }
      obs.pending.clear();
      if (ev.code === 4009) {
        Deck.setConn('bad', 'Auth Failed');
        Deck.setMsg('OBS WebSocket password rejected');
        $('conn-bar')?.classList.add('open');
        return;
      }
      Deck.setConn('bad', 'Disconnected');
      if (!obs.manualClose) obs.reconnectTimer = setTimeout(Deck.connectObs, 3000);
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
        Deck.setConn('ok', 'Connected');
        Deck.setMsg(`Connected to ${url}`);
        await Deck.syncObsState();
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
