(() => {
  'use strict';

  const Deck = window.Deck;
  const { $, esc, COLORS } = Deck;

  const BROADCAST_ICONS = [
    { key: 'camera', label: 'Camera', body: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3.2"/>' },
    { key: 'video', label: 'Video', body: '<rect x="2" y="6" width="14" height="12" rx="2"/><path d="m22 8-6 4 6 4V8z"/>' },
    { key: 'screen', label: 'Screen', body: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>' },
    { key: 'slides', label: 'Slides', body: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M7 20h10M12 16v4M8 9h8M8 12h5"/>' },
    { key: 'mic', label: 'Mic', body: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v5M8 22h8"/>' },
    { key: 'mic-off', label: 'Mic Muted', body: '<path d="m2 2 20 20"/><path d="M15 9.3V5a3 3 0 0 0-5.7-1.3"/><path d="M9 9v2a3 3 0 0 0 5.1 2.1"/><path d="M19 10a7 7 0 0 1-1.1 3.7M5 10a7 7 0 0 0 10.6 6"/><path d="M12 17v5M8 22h8"/>' },
    { key: 'volume', label: 'Audio', body: '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a9.5 9.5 0 0 1 0 14"/>' },
    { key: 'headphones', label: 'Monitor', body: '<path d="M3 14v-2a9 9 0 0 1 18 0v2"/><path d="M21 15a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3v5zM3 15a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3v5z"/>' },
    { key: 'live', label: 'Go Live', body: '<circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none"/><path d="M8.5 8.5a5 5 0 0 0 0 7M15.5 8.5a5 5 0 0 1 0 7M5.2 5.2a9.5 9.5 0 0 0 0 13.6M18.8 5.2a9.5 9.5 0 0 1 0 13.6"/>' },
    { key: 'record', label: 'Record', body: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4" fill="currentColor" stroke="none"/>' },
    { key: 'replay', label: 'Replay', body: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>' },
    { key: 'play', label: 'Play', body: '<polygon points="6 4 20 12 6 20 6 4"/>' },
    { key: 'pause', label: 'Pause', body: '<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>' },
    { key: 'stop', label: 'Stop', body: '<rect x="5" y="5" width="14" height="14" rx="2"/>' },
    { key: 'filter', label: 'Filter / FX', body: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z"/><path d="M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16z"/>' },
    { key: 'pip', label: 'PiP Layout', body: '<rect x="2" y="4" width="20" height="16" rx="2"/><rect x="12" y="11" width="7" height="6" rx="1"/>' },
    { key: 'capture', label: 'Screenshot', body: '<path d="M4 8V6a2 2 0 0 1 2-2h2M20 8V6a2 2 0 0 0-2-2h-2M4 16v2a2 2 0 0 0 2 2h2M20 16v2a2 2 0 0 1-2 2h-2"/><circle cx="12" cy="12" r="3"/>' },
    { key: 'chapter', label: 'Chapter', body: '<path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z"/>' },
    { key: 'stats', label: 'Telemetry', body: '<path d="M3 13h4l2.5-7 4 12 2.5-5H21"/>' },
    { key: 'macro', label: 'Timed Macro', body: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>' },
    { key: 'hotkey', label: 'Hotkey', body: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M7 13h.01M11 13h.01M15 13h.01M8 16h8"/>' },
    { key: 'webhook', label: 'HTTP / API', body: '<path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.5 1.5"/><path d="M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.5-1.5"/>' },
    { key: 'globe', label: 'Browser', body: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a13 13 0 0 1 0 18M12 3a13 13 0 0 0 0 18"/>' },
    { key: 'text', label: 'Text / Title', body: '<path d="M4 6h16M12 6v13M8 19h8"/>' },
    { key: 'image', label: 'Image', body: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="m21 16-5-5-6 6-2.5-2.5L3 19"/>' },
    { key: 'studio', label: 'Studio Mode', body: '<rect x="2" y="5" width="9" height="14" rx="1.5"/><rect x="13" y="5" width="9" height="14" rx="1.5"/>' },
    { key: 'transition', label: 'Transition', body: '<path d="M4 7h11l-3-3M20 17H9l3 3"/>' },
    { key: 'page', label: 'Page', body: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>' },
    { key: 'coffee', label: 'BRB / Break', body: '<path d="M17 8h1a4 4 0 0 1 0 8h-1"/><path d="M3 8h14v7a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5V8z"/><path d="M6 2v2M10 2v2M14 2v2"/>' },
    { key: 'panic', label: 'PANIC', body: '<path d="M12 3 2 20h20L12 3z"/><path d="M12 9v5M12 17h.01"/>' },
  ];

  const BROADCAST_ICON_MAP = Object.create(null);
  for (const item of BROADCAST_ICONS) BROADCAST_ICON_MAP[item.key] = item;

  function renderIconHtml(icon) {
    if (!icon) return '';
    const str = String(icon).trim();
    if (!str) return '';
    if (str.startsWith('svg:')) {
      const entry = BROADCAST_ICON_MAP[str.slice(4)];
      if (entry) {
        return `<span class="ico ico-svg" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${entry.body}</svg></span>`;
      }
    }
    return `<span class="ico">${esc(str)}</span>`;
  }

  function isCustomPadColor(c) {
    if (!c) return false;
    const def = String(COLORS[0] || '#222733').toLowerCase();
    return String(c).trim().toLowerCase() !== def;
  }

  function formatCueSec(ms) {
    const n = Number(ms);
    if (!Number.isFinite(n) || n <= 0) return '';
    const sec = n / 1000;
    return Number.isInteger(sec) ? `${sec}s` : `${Number(sec.toFixed(1))}s`;
  }

  const TAGS = {
    scene: 'SCN',
    source: 'SRC',
    filter: 'FLT',
    mute: 'MUT',
    volume: 'VOL',
    monitor: 'MON',
    studio: 'STD',
    output: 'OUT',
    media: 'MED',
    image: 'IMG',
    browser: 'WEB',
    screenshot: 'CAP',
    transform: 'PIP',
    hotkey: 'KEY',
    chapter: 'CHP',
    stats: 'STS',
    profile: 'PRF',
    collection: 'COL',
    transition: 'TRN',
    page: 'PAG',
    macro: 'MCR',
    http: 'API',
    panic: 'PNC',
    text: 'TXT',
  };

  const OUTPUT_LABELS = {
    stream: 'Stream',
    record: 'Record',
    recordPause: 'Rec Pause',
    vcam: 'Virtual Cam',
    replay: 'Replay',
    saveReplay: 'Save Replay',
  };
  const MONITOR_LABELS = {
    cycle: 'Cycle Monitor',
    OBS_MONITORING_TYPE_NONE: 'Mon Off',
    OBS_MONITORING_TYPE_MONITOR_ONLY: 'Mon Only',
    OBS_MONITORING_TYPE_MONITOR_AND_OUTPUT: 'Mon+Out',
  };
  const TRANSFORM_LABELS = {
    toggle_pip: 'PiP Toggle',
    pip_tr: 'PiP TR',
    pip_br: 'PiP BR',
    pip_tl: 'PiP TL',
    pip_bl: 'PiP BL',
    center_half: 'Half Center',
    full_reset: 'Full Reset',
  };

  function padFallbackLabel(p, i, cols = 8) {
    if (p.type === 'scene') {
      if (p.mode === 'next') return 'Next Scene';
      if (p.mode === 'prev') return 'Prev Scene';
      return p.sceneName || 'Scene';
    }
    if (p.type === 'source') return p.sourceName || p.sceneName || 'Source';
    if (p.type === 'filter') return p.filterName || p.sourceName || 'Filter';
    if (p.type === 'mute') return p.inputName || 'Mute';
    if (p.type === 'volume') {
      const db = p.volumeDb ?? (p.mode === 'step' ? -3 : 0);
      const val = p.mode === 'step' && db > 0 ? `+${db}` : `${db}`;
      return p.inputName ? `${p.inputName} ${val}dB` : `Vol ${val}dB`;
    }
    if (p.type === 'monitor') {
      const m = MONITOR_LABELS[p.monitorType || 'cycle'] || 'Monitor';
      return p.inputName ? `${p.inputName} (${m})` : m;
    }
    if (p.type === 'transform') {
      const pr = TRANSFORM_LABELS[p.preset || 'toggle_pip'] || 'PiP';
      return p.sourceName ? `${p.sourceName} ${pr}` : pr;
    }
    if (p.type === 'image') {
      if (p.mode === 'next') return p.inputName ? `${p.inputName} Next` : 'Next Slide';
      if (p.mode === 'previous') return p.inputName ? `${p.inputName} Prev` : 'Prev Slide';
      if (p.mode === 'restart') return p.inputName ? `${p.inputName} Restart` : 'Restart Slide';
      return p.inputName || 'Image Swap';
    }
    if (p.type === 'hotkey') {
      if (p.mode === 'keys') return Deck.formatHotkeyKeys ? Deck.formatHotkeyKeys(p) : 'OBS Key Sequence';
      return p.hotkeyName || 'OBS Hotkey';
    }
    if (p.type === 'http') {
      if (p.url) {
        try {
          const u = new URL(p.url);
          return `${p.method || 'POST'} ${u.pathname === '/' ? u.host : u.pathname}`;
        } catch {}
      }
      return 'HTTP Request';
    }
    if (p.type === 'chapter') return p.chapterName || 'Chapter';
    if (p.type === 'stats') {
      if (p.mode === 'cpu') return 'CPU';
      if (p.mode === 'fps') return 'FPS';
      if (p.mode === 'dropped') return 'Dropped';
      return 'OBS Stats';
    }
    if (p.type === 'studio') {
      if (p.action === 'preview') return p.sceneName || 'Preview';
      if (p.action === 'transition') return 'Cut / Trans';
      return 'Studio Mode';
    }
    if (p.type === 'output') return OUTPUT_LABELS[p.target] || 'Output';
    if (p.type === 'media') return p.inputName || 'Media';
    if (p.type === 'browser') return p.inputName || 'Browser';
    if (p.type === 'screenshot') return p.sourceName || 'Screenshot';
    if (p.type === 'profile') return p.profileName || 'Profile';
    if (p.type === 'collection') return p.collectionName || 'Collection';
    if (p.type === 'transition') return p.transitionName || 'Transition';
    if (p.type === 'page') {
      if (p.mode === 'next') return 'Next Page';
      if (p.mode === 'prev') return 'Prev Page';
      const pid = p.pageId || p.deckId;
      const target = (Deck.cfg.pages || []).find((d) => d.id === pid);
      return target ? target.name : 'Page';
    }
    if (p.type === 'text') {
      if (p.mode === 'counter') return p.inputName ? `${p.inputName} #` : 'Counter';
      return p.inputName || 'Text';
    }
    if (p.type === 'macro') return 'Macro';
    if (p.type === 'panic') return 'PANIC';
    return Deck.editMode ? `${Math.floor(i / cols) + 1}:${(i % cols) + 1}` : '';
  }

  const tickSpans = new Map();

  function tickText(rt) {
    if (!rt || !rt.running) return '';
    return rt.endsAt ? `${Math.max(0, (rt.endsAt - Date.now()) / 1000).toFixed(1)}s` : 'RUN';
  }

  function computeTickProgress(pageId, t, p) {
    if (!t || !t.endsAt) return 0;
    const now = Date.now();
    const rem = Math.max(0, t.endsAt - now);
    if (rem <= 0) return 0;
    let totalMs = 0;
    if (t.kind === 'autoOff' && p && p.autoOffMs > 0) {
      totalMs = p.autoOffMs;
    } else {
      const spanKey = `${pageId}:${t.idx}:${t.endsAt}`;
      totalMs = tickSpans.get(spanKey) || 0;
      if (!totalMs) {
        totalMs = Math.max(1, rem);
        tickSpans.set(spanKey, totalMs);
      }
    }
    return Math.max(0, Math.min(1, rem / Math.max(1, totalMs)));
  }

  Deck.updateMacroTicks = () => {
    const grid = $('grid');
    if (!grid) return;
    const page = Deck.getActivePage();
    const pageId = page?.id || '';
    const activeTicks = Deck.getActivePageTicks();
    const activeIndices = new Set(activeTicks.map((t) => t.idx));
    const activeSpanKeys = new Set();
    for (const t of activeTicks) {
      if (t.endsAt) activeSpanKeys.add(`${pageId}:${t.idx}:${t.endsAt}`);
      const btn = grid.querySelector(`.pad[data-idx="${t.idx}"]`);
      if (!btn) continue;
      let sub = btn.querySelector('.sub');
      const txt = tickText({ running: true, endsAt: t.endsAt });
      if (!sub && txt) {
        sub = document.createElement('span');
        sub.className = 'sub';
        btn.appendChild(sub);
      }
      if (sub) {
        sub.textContent = txt;
        sub.style.display = txt ? '' : 'none';
      }
      const progEl = btn.querySelector('.pad-prog');
      if (progEl) {
        const p = page?.pads?.[t.idx];
        const prog = computeTickProgress(pageId, t, p);
        progEl.style.setProperty('--prog', prog.toFixed(3));
      }
      const ctx = btn.querySelector('.ctx');
      if (ctx) ctx.style.display = txt ? 'none' : '';
    }
    for (const k of tickSpans.keys()) {
      if (!activeSpanKeys.has(k)) tickSpans.delete(k);
    }
    grid.querySelectorAll('.pad:not(.stats-pad)').forEach((btn) => {
      const idx = Number(btn.dataset.idx);
      if (!activeIndices.has(idx)) {
        btn.classList.remove('running');
        const progEl = btn.querySelector('.pad-prog');
        if (progEl) progEl.style.setProperty('--prog', '0');
        const p = page?.pads?.[idx];
        const readoutTxt = p && isReadoutPad(p) && typeof Deck.getPadReadoutText === 'function' ? Deck.getPadReadoutText(p) : '';
        const sub = btn.querySelector('.sub');
        if (readoutTxt) {
          if (sub) {
            sub.textContent = readoutTxt;
            sub.style.display = '';
            if (readoutTxt === 'PAUSED') sub.classList.add('paused');
            else sub.classList.remove('paused');
          }
          const ctx = btn.querySelector('.ctx');
          if (ctx) ctx.style.display = 'none';
        } else {
          if (sub) sub.remove();
          const ctx = btn.querySelector('.ctx');
          if (ctx && (!p || !p.hideLabel)) ctx.style.display = '';
        }
      }
    });
  };

  function isReadoutPad(p) {
    if (typeof Deck.isReadoutPad === 'function') return Deck.isReadoutPad(p);
    if (!p) return false;
    if (p.type === 'volume' || p.type === 'media' || p.type === 'text') return true;
    if (p.type === 'output' && (p.target === 'stream' || p.target === 'record' || p.target === 'recordPause')) return true;
    return false;
  }

  Deck.updateStatsPads = () => {
    const grid = $('grid');
    const page = Deck.getActivePage();
    if (!grid || !page) return;
    page.pads.forEach((p, i) => {
      if (!p || p.type !== 'stats') return;
      const btn = grid.querySelector(`.pad[data-idx="${i}"]`);
      if (!btn) return;
      let sub = btn.querySelector('.sub');
      const txt = Deck.formatStatsText(p.mode || 'all');
      if (!sub) {
        sub = document.createElement('span');
        sub.className = 'sub';
        btn.appendChild(sub);
      }
      sub.textContent = txt;
    });
  };

  Deck.updateReadoutPads = () => {
    const grid = $('grid');
    const page = Deck.getActivePage();
    if (!grid || !page) return;
    const activeTicks = new Set((Deck.getActivePageTicks ? Deck.getActivePageTicks() : []).map((t) => t.idx));
    page.pads.forEach((p, i) => {
      if (!p || !isReadoutPad(p)) return;
      if (activeTicks.has(i)) return;
      const btn = grid.querySelector(`.pad[data-idx="${i}"]`);
      if (!btn) return;
      let sub = btn.querySelector('.sub');
      const txt = typeof Deck.getPadReadoutText === 'function' ? Deck.getPadReadoutText(p) : '';
      if (!txt) {
        if (sub && !btn.classList.contains('running')) {
          sub.remove();
          const ctx = btn.querySelector('.ctx');
          if (ctx && !p.hideLabel) ctx.style.display = '';
        }
        return;
      }
      if (!sub) {
        sub = document.createElement('span');
        sub.className = 'sub';
        btn.appendChild(sub);
      }
      sub.textContent = txt;
      sub.style.display = '';
      if (txt === 'PAUSED') sub.classList.add('paused');
      else sub.classList.remove('paused');
      const ctx = btn.querySelector('.ctx');
      if (ctx) ctx.style.display = 'none';
    });
  };

  Deck.clearReadoutPads = () => {
    const grid = $('grid');
    const page = Deck.getActivePage();
    if (!grid || !page) return;
    page.pads.forEach((p, i) => {
      if (!p || !isReadoutPad(p)) return;
      const btn = grid.querySelector(`.pad[data-idx="${i}"]`);
      if (!btn) return;
      const sub = btn.querySelector('.sub');
      if (sub && !btn.classList.contains('running')) {
        sub.remove();
        const ctx = btn.querySelector('.ctx');
        if (ctx && !p.hideLabel) ctx.style.display = '';
      }
    });
  };

  let focusedPadIdx = 0;

  function setRovingFocus(grid, nextIdx, moveFocus = false) {
    const btns = grid?.children;
    if (!btns || !btns.length) return;
    const clamped = Math.max(0, Math.min(btns.length - 1, nextIdx));
    focusedPadIdx = clamped;
    for (let k = 0; k < btns.length; k++) {
      btns[k].tabIndex = k === clamped ? 0 : -1;
    }
    if (moveFocus) btns[clamped]?.focus();
  }

  function assignPaletteActionToPad(paletteData, i, activePage) {
    if (!paletteData || !activePage) return;
    const pads = activePage.pads;
    if (i < 0 || i >= pads.length) return;
    Deck.setDragState({ paletteDragItem: null, justDroppedAt: Date.now() });
    if (typeof Deck.clearArmedPaletteItem === 'function') Deck.clearArmedPaletteItem();
    if (typeof Deck.abortPadTimer === 'function') {
      Deck.abortPadTimer(activePage.id, i);
    }
    if (Deck.isSelfContained(paletteData)) {
      Deck.pushHistory(() => {
        const newPad = JSON.parse(JSON.stringify(paletteData));
        delete newPad.isLive;
        if (!newPad.color) {
          newPad.color = newPad.type === 'scene' ? '#991b1b' : COLORS[0];
        }
        pads[i] = Deck.normalizePad(newPad);
        Deck.saveCfg();
        Deck.renderGrid();
        Deck.setMsg(`Assigned ${pads[i].label || pads[i].type} to pad ${i + 1}`);
      });
    } else {
      Deck.openPadEditor(i, activePage.id, paletteData);
    }
  }

  function initGrid(page) {
    const grid = $('grid');
    const total = page.cols * page.rows;
    grid.style.setProperty('--cols', page.cols);
    grid.style.setProperty('--rows', page.rows);
    grid.setAttribute('aria-label', `${page.cols} by ${page.rows} OBS Deck Page`);
    if (grid.children.length === total) {
      setRovingFocus(grid, focusedPadIdx, false);
      return;
    }
    grid.innerHTML = '';
    const clampedFocus = Math.max(0, Math.min(total - 1, focusedPadIdx));
    focusedPadIdx = clampedFocus;
    for (let i = 0; i < total; i++) {
      const el = document.createElement('button');
      el.type = 'button';
      el.dataset.idx = i;
      el.tabIndex = i === clampedFocus ? 0 : -1;
      let holdTimer = null;
      let holdTriggered = false;

      el.addEventListener('focus', () => {
        if (focusedPadIdx !== i) setRovingFocus(grid, i, false);
      });

      el.addEventListener('keydown', (e) => {
        if (document.querySelector('dialog[open]')) return;
        const tag = e.target?.tagName?.toLowerCase();
        if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
        if (Deck.getDragState().dragIdx !== null) return;
        const curPage = Deck.getActivePage();
        const cols = curPage?.cols || page.cols || 8;
        const rows = curPage?.rows || page.rows || 8;
        const maxIdx = cols * rows - 1;
        let target = -1;
        if (e.key === 'ArrowRight') target = i + 1 <= maxIdx ? i + 1 : 0;
        else if (e.key === 'ArrowLeft') target = i - 1 >= 0 ? i - 1 : maxIdx;
        else if (e.key === 'ArrowDown') target = i + cols <= maxIdx ? i + cols : i % cols;
        else if (e.key === 'ArrowUp') target = i - cols >= 0 ? i - cols : (rows - 1) * cols + (i % cols);
        else if (e.key === 'Home') target = i - (i % cols);
        else if (e.key === 'End') target = Math.min(maxIdx, i - (i % cols) + (cols - 1));
        if (target >= 0 && target <= maxIdx) {
          e.preventDefault();
          setRovingFocus(grid, target, true);
        }
      });

      el.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        if (Deck.editMode) return;
        holdTriggered = false;
        const page = Deck.getActivePage();
        const p = page?.pads[i];
        if (!p) return;

        if (p.hold && Deck.HOLD_TYPES && Deck.HOLD_TYPES.has(p.type)) {
          holdTriggered = true;
          Deck.holdPress(i, page.id);
          return;
        }

        if (!Deck.isOutputStopAction || !Deck.isOutputStopAction(p)) return;

        holdTimer = setTimeout(async () => {
          holdTimer = null;
          holdTriggered = true;
          await Deck.onPadClick(i, page.id, { hold: true });
        }, 500);
      });

      const cancelHold = () => {
        if (holdTimer) {
          clearTimeout(holdTimer);
          holdTimer = null;
        }
        const page = Deck.getActivePage();
        const p = page?.pads[i];
        if (p?.hold && Deck.HOLD_TYPES && Deck.HOLD_TYPES.has(p.type)) {
          Deck.releaseHold(page.id, i);
        }
      };

      el.addEventListener('pointerup', cancelHold);
      el.addEventListener('pointercancel', cancelHold);
      el.addEventListener('pointerleave', cancelHold);

      el.addEventListener('click', (e) => {
        if (holdTriggered) {
          holdTriggered = false;
          return;
        }
        cancelHold();
        if (Date.now() - Deck.getDragState().justDroppedAt < 250) return;
        if (Deck.editMode) {
          const armedItem = typeof Deck.getArmedPaletteItem === 'function' ? Deck.getArmedPaletteItem() : null;
          if (armedItem && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
            assignPaletteActionToPad(armedItem, i, Deck.getActivePage());
            return;
          }
          if (Deck.handleSelectionClick(i, e)) return;
          Deck.openPadEditor(i);
          return;
        }
        Deck.onPadClick(i);
      });
      el.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const page = Deck.getActivePage();
        const p = page?.pads[i];
        if (!Deck.editMode && p?.hold && Deck.HOLD_TYPES && Deck.HOLD_TYPES.has(p.type)) {
          return;
        }
        Deck.openPadEditor(i);
      });
      el.addEventListener('dragstart', (e) => {
        if (!Deck.editMode) { e.preventDefault(); return; }
        Deck.setDragState({ dragIdx: i, dragSourcePageId: Deck.getActivePage().id });
        Deck.machines?.workspace?.send('DRAG_START', { kind: 'pad', idx: i });
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', String(i));
        }
        el.classList.add('dragging');
      });
      el.addEventListener('dragend', () => {
        const { dragIdx } = Deck.getDragState();
        if (dragIdx !== null) Deck.setDragState({ justDroppedAt: Date.now() });
        Deck.setDragState({ dragIdx: null, dragSourcePageId: '' });
        Deck.machines?.workspace?.send('DRAG_END');
        Deck.clearDragHighlights();
      });
      el.addEventListener('dragover', (e) => {
        if (!Deck.editMode) return;
        const { dragIdx, paletteDragItem } = Deck.getDragState();
        const isPalette = paletteDragItem !== null;
        if (!isPalette && (dragIdx === null || dragIdx === i)) return;
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = isPalette ? 'copy' : 'move';
        el.classList.add('drag-over');
      });
      el.addEventListener('dragleave', (e) => {
        if (!el.contains(e.relatedTarget)) el.classList.remove('drag-over');
      });
      el.addEventListener('drop', (e) => {
        e.preventDefault();
        Deck.clearDragHighlights();
        Deck.machines?.workspace?.send('DRAG_END');
        if (!Deck.editMode) return;
        const activePage = Deck.getActivePage();
        const pads = activePage.pads;
        if (i >= pads.length) return;

        let { dragIdx, paletteDragItem: paletteData } = Deck.getDragState();
        if (!paletteData && e.dataTransfer) {
          try {
            const json = e.dataTransfer.getData('application/json');
            if (json) {
              const parsed = JSON.parse(json);
              if (parsed?.source === 'palette' && parsed.action) paletteData = parsed.action;
            }
          } catch {}
        }

        if (paletteData) {
          assignPaletteActionToPad(paletteData, i, activePage);
          return;
        }

        if (dragIdx === null || dragIdx === i || dragIdx >= pads.length) return;
        if (typeof Deck.abortPadTimer === 'function') {
          Deck.abortPadTimer(activePage.id, dragIdx);
          Deck.abortPadTimer(activePage.id, i);
        }
        Deck.pushHistory(() => {
          [pads[dragIdx], pads[i]] = [pads[i], pads[dragIdx]];
          Deck.setDragState({ dragIdx: null, dragSourcePageId: '', justDroppedAt: Date.now() });
          Deck.saveCfg();
          Deck.renderGrid();
        });
      });
      grid.appendChild(el);
    }
  }

  function isTogglePad(p) {
    if (!p) return false;
    if (p.type === 'mute' || p.type === 'source' || p.type === 'filter') return true;
    if (p.type === 'output') return (p.target || 'stream') !== 'saveReplay';
    if (p.type === 'studio') return (p.action || 'toggle') !== 'transition';
    return false;
  }

  function renderPad(pOrIdx, i, el, page) {
    let p, idx;
    if (typeof pOrIdx === 'number') {
      idx = pOrIdx;
      page = page || Deck.getActivePage();
      p = page?.pads?.[idx] || { type: 'none' };
      const btns = $('grid')?.children;
      el = el || (btns ? btns[idx] : null);
    } else {
      p = pOrIdx;
      idx = i;
      page = page || Deck.getActivePage();
    }
    if (!el || !page) return;
    i = idx;
    const rt = Deck.getPadRuntime(i, page.id);
    const padState = rt.state || 'idle';
    const active = Deck.isPadActive(p);
    const isRunning = Boolean(rt.running);
    const isArmed = Boolean(Deck.isPadArmed && Deck.isPadArmed(i, page.id));
    const isHeld = Boolean(Deck.isPadHeld && Deck.isPadHeld(i, page.id));
    const isBusy = Boolean(rt.busy);
    const isHoldPad = Boolean(p.hold && Deck.HOLD_TYPES && Deck.HOLD_TYPES.has(p.type));
    const isFullFace = Boolean(p.image && p.imageFit === 'fill');
    const isPreview = Boolean(
      p.type === 'scene'
      && (p.mode || 'named') === 'named'
      && p.sceneName
      && Deck.obs?.studioModeEnabled
      && Deck.obs?.previewScene === p.sceneName
      && Deck.obs?.programScene !== p.sceneName
    );
    const colorStyle = p.colorStyle === 'tint' ? 'tint' : 'solid';
    const hasCustomColor = Boolean(!isFullFace && p.type !== 'none' && isCustomPadColor(p.color));
    const isDragOver = el.classList.contains('drag-over');
    const isDraggingEl = el.classList.contains('dragging');
    const isConfirmed = el.classList.contains('confirmed');
    const selectedPads = Deck.getSelectedPads();
    const isSelected = selectedPads.has(i);
    const hasProg = Boolean(p.type === 'macro' || p.autoOffMs > 0);
    const showMeter = Boolean((p.type === 'mute' || p.type === 'volume') && p.showMeter && p.inputName);
    const alertLvl = (p.type === 'stats' && typeof Deck.getStatsAlertLevel === 'function')
      ? Deck.getStatsAlertLevel(p.mode || 'all')
      : '';
    const ariaPressed = isTogglePad(p) ? (active ? 'true' : 'false') : '';

    let cueText = '';
    let cueKind = '';
    if (!Deck.editMode && p.type !== 'none') {
      if (isArmed) {
        cueText = 'TAP';
        cueKind = 'cue-armed';
      } else if (active && p.type === 'scene' && Deck.obs?.studioModeEnabled) {
        cueText = 'PGM';
        cueKind = 'cue-pgm';
      } else if (isPreview) {
        cueText = 'PVW';
        cueKind = 'cue-pvw';
      } else if (isHoldPad) {
        cueText = 'HOLD';
        cueKind = 'cue-hold';
      } else if (p.autoOffMs > 0 && !isRunning) {
        cueText = formatCueSec(p.autoOffMs);
        cueKind = 'cue-auto';
      }
    }

    const subText = isRunning
      ? tickText(rt)
      : (p.type === 'stats'
        ? Deck.formatStatsText(p.mode || 'all')
        : (isReadoutPad(p) && typeof Deck.getPadReadoutText === 'function' ? Deck.getPadReadoutText(p) : ''));
    const ctxText = (typeof Deck.getPadContextSubtitle === 'function') ? Deck.getPadContextSubtitle(p) : '';
    const lbl = p.label || padFallbackLabel(p, i, page.cols);

    const sig = [
      page.id,
      page.cols,
      i,
      p.type,
      padState,
      active ? 1 : 0,
      isPreview ? 1 : 0,
      ariaPressed,
      isRunning ? 1 : 0,
      isArmed ? 1 : 0,
      isHeld ? 1 : 0,
      isBusy ? 1 : 0,
      isHoldPad ? 1 : 0,
      isFullFace ? 1 : 0,
      isDragOver ? 1 : 0,
      isDraggingEl ? 1 : 0,
      isSelected ? 1 : 0,
      Deck.editMode ? 1 : 0,
      hasProg ? 1 : 0,
      showMeter ? 1 : 0,
      alertLvl,
      hasCustomColor ? p.color : '',
      colorStyle,
      cueText,
      cueKind,
      p.hideLabel ? 1 : 0,
      lbl,
      ctxText,
      p.image || '',
      p.imageFit || '',
      p.icon || '',
      p.type === 'stats' ? (p.mode || 'all') : '',
    ].join('\x1f');

    if (el._padSig === sig) return;
    el._padSig = sig;

    el.className = 'pad'
      + (p.type === 'none' ? ' empty' : ` is-${p.type}`)
      + (p.type === 'stats' ? ' stats-pad' : '')
      + (Deck.editMode ? ' edit-mode' : '')
      + (isSelected ? ' selected' : '')
      + (active ? ' active' : '')
      + (isPreview ? ' preview' : '')
      + (isRunning ? ' running' : '')
      + (isArmed ? ' armed' : '')
      + (isHeld ? ' held' : '')
      + (isBusy ? ' busy' : '')
      + (isHoldPad ? ' hold-pad' : '')
      + (isFullFace ? ' full-face' : '')
      + (hasCustomColor && colorStyle !== 'tint' ? ' has-color' : '')
      + (hasCustomColor && colorStyle === 'tint' ? ' has-tint' : '')
      + (p.hideLabel ? ' hide-label' : '')
      + (alertLvl === 'warn' ? ' warn' : alertLvl === 'crit' ? ' crit' : '')
      + (isDragOver ? ' drag-over' : '')
      + (isDraggingEl ? ' dragging' : '')
      + (isConfirmed ? ' confirmed' : '');
    el.dataset.padState = padState;
    if (isBusy) el.setAttribute('aria-busy', 'true');
    else el.removeAttribute('aria-busy');
    if (ariaPressed) el.setAttribute('aria-pressed', ariaPressed);
    else el.removeAttribute('aria-pressed');
    if (isFullFace) {
      el.style.backgroundColor = (p.type !== 'none' && isCustomPadColor(p.color)) ? p.color : '';
      el.style.backgroundImage = `url("${p.image}")`;
      el.style.backgroundSize = 'cover';
      el.style.backgroundPosition = 'center';
      el.style.removeProperty('--pad-tint');
    } else if (hasCustomColor && colorStyle === 'tint') {
      el.style.backgroundImage = '';
      el.style.backgroundSize = '';
      el.style.backgroundPosition = '';
      el.style.backgroundColor = '';
      el.style.setProperty('--pad-tint', p.color);
    } else if (hasCustomColor) {
      el.style.backgroundImage = '';
      el.style.backgroundSize = '';
      el.style.backgroundPosition = '';
      el.style.backgroundColor = p.color;
      el.style.removeProperty('--pad-tint');
    } else {
      el.style.backgroundImage = '';
      el.style.backgroundSize = '';
      el.style.backgroundPosition = '';
      el.style.backgroundColor = '';
      el.style.removeProperty('--pad-tint');
    }
    el.draggable = Deck.editMode && p.type !== 'none';
    const tipParts = [lbl || `Pad ${i + 1}`];
    if (ctxText) tipParts.push(`[${ctxText}]`);
    if (isPreview) tipParts.push('(Preview)');
    if ((p.type === 'stats' || isReadoutPad(p)) && subText) tipParts.push(`(${subText})`);
    if (TAGS[p.type]) tipParts.push(`[${TAGS[p.type]}]`);
    el.title = tipParts.join(' ');

    let iconHtml = '';
    if (p.image && p.imageFit !== 'fill') {
      iconHtml = `<img class="pad-icon-img" src="${esc(p.image)}" alt="">`;
    } else if (!p.image && p.icon) {
      iconHtml = renderIconHtml(p.icon);
    }

    const cueHtml = cueText ? `<span class="pad-cue ${cueKind}">${esc(cueText)}</span>` : '';
    const lblHtml = `<span class="lbl"${p.hideLabel ? ' style="display:none"' : ''}>${esc(lbl)}</span>`;
    const ctxHtml = ctxText ? `<span class="ctx"${(isRunning || subText || p.hideLabel) ? ' style="display:none"' : ''}>${esc(ctxText)}</span>` : '';
    const progHtml = hasProg ? `<span class="pad-prog" aria-hidden="true" style="--prog:${isRunning && rt.endsAt ? computeTickProgress(page.id, { idx: i, kind: rt.kind, endsAt: rt.endsAt }, p).toFixed(3) : '0'}"></span>` : '';
    const meterHtml = (showMeter && Deck.obs?.status === 'ok') ? '<span class="pad-meter" aria-hidden="true"></span>' : '';

    el.innerHTML = `<i class="led"></i>${TAGS[p.type] ? `<span class="tag">${TAGS[p.type]}</span>` : ''}`
      + cueHtml
      + iconHtml
      + lblHtml
      + ctxHtml
      + `${subText ? `<span class="sub${subText === 'PAUSED' ? ' paused' : ''}">${esc(subText)}</span>` : ''}`
      + progHtml
      + meterHtml;
  }

  const confirmTimers = new Map();
  function flashPadConfirm(idx, pageId) {
    const activeId = Deck.cfg?.activePageId;
    if (pageId && activeId && pageId !== activeId) return;
    const btn = $('grid')?.querySelector(`.pad[data-idx="${idx}"]`);
    if (!btn) return;
    const key = `${activeId || ''}:${idx}`;
    const prev = confirmTimers.get(key);
    if (prev) clearTimeout(prev);
    btn.classList.remove('confirmed');
    void btn.offsetWidth;
    btn.classList.add('confirmed');
    const tid = setTimeout(() => {
      confirmTimers.delete(key);
      btn.classList.remove('confirmed');
    }, 280);
    confirmTimers.set(key, tid);
  }

  let renderFrame = null;
  function scheduleRenderGrid() {
    if (renderFrame !== null) return;
    renderFrame = requestAnimationFrame(() => {
      renderFrame = null;
      Deck.renderGrid();
    });
  }

  function renderGrid() {
    if (renderFrame !== null) {
      cancelAnimationFrame(renderFrame);
      renderFrame = null;
    }
    const page = Deck.getActivePage();
    Deck.renderPageBar();
    initGrid(page);
    const btns = $('grid').children;
    page.pads.forEach((p, i) => {
      renderPad(p, i, btns[i], page);
    });
    if (typeof Deck.updateReadoutPads === 'function') Deck.updateReadoutPads();
    if (typeof Deck.syncMeterSubscription === 'function') Deck.syncMeterSubscription();
    if (typeof Deck.updateMeterPads === 'function') Deck.updateMeterPads();
    if (typeof Deck.applyStatsAlerts === 'function') Deck.applyStatsAlerts();
    Deck.updateSelectionUi();
    if (typeof Deck.updateGuidanceBanner === 'function') Deck.updateGuidanceBanner();
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('pointercancel', () => {
      if (typeof Deck.releaseHold === 'function') Deck.releaseHold();
    });
  }

  Deck.BROADCAST_ICONS = BROADCAST_ICONS;
  Deck.renderIconHtml = renderIconHtml;
  Deck.isCustomPadColor = isCustomPadColor;
  Deck.formatCueSec = formatCueSec;
  Deck.flashPadConfirm = flashPadConfirm;
  Deck.TAGS = TAGS;
  Deck.padFallbackLabel = padFallbackLabel;
  Deck.initGrid = initGrid;
  Deck.renderPad = renderPad;
  Deck.scheduleRenderGrid = scheduleRenderGrid;
  Deck.renderGrid = renderGrid;
})();
