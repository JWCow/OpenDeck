(() => {
  'use strict';

  const Deck = window.Deck;
  const { $, esc, COLORS } = Deck;

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
    panic: 'PNC',
  };

  const ICON_PRESETS = [
    '🎬', '🎥', '🎙️', '🔇', '🔊', '🎧', '✨', '📺', '🔴', '📸',
    '🎵', '🖼️', '🌐', '📐', '🔖', '📊', '⌨️', '⚡', '🚨',
  ];
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

  const PALETTE_CATEGORIES = [
    {
      id: 'cat-broadcast',
      title: 'Broadcast & Outputs',
      items: [
        { label: 'Stream', icon: '📡', tag: 'OUT', action: { type: 'output', target: 'stream', mode: 'toggle', label: 'Stream', icon: '📡' } },
        { label: 'Record', icon: '🔴', tag: 'OUT', action: { type: 'output', target: 'record', mode: 'toggle', label: 'Record', icon: '🔴' } },
        { label: 'Record Pause', icon: '⏸️', tag: 'OUT', action: { type: 'output', target: 'recordPause', mode: 'toggle', label: 'Rec Pause', icon: '⏸️' } },
        { label: 'Chapter Marker', icon: '🔖', tag: 'CHP', action: { type: 'chapter', label: 'Chapter', icon: '🔖' } },
        { label: 'Virtual Cam', icon: '🎥', tag: 'OUT', action: { type: 'output', target: 'vcam', mode: 'toggle', label: 'Virtual Cam', icon: '🎥' } },
        { label: 'Replay Buffer', icon: '🔄', tag: 'OUT', action: { type: 'output', target: 'replay', mode: 'toggle', label: 'Replay Buffer', icon: '🔄' } },
        { label: 'Replay Buffer Save', icon: '💾', tag: 'OUT', action: { type: 'output', target: 'saveReplay', label: 'Save Replay', icon: '💾' } },
        { label: 'Studio Mode', icon: '🎛️', tag: 'STD', action: { type: 'studio', action: 'toggle', label: 'Studio Mode', icon: '🎛️' } },
        { label: 'Snapshot', icon: '📸', tag: 'CAP', action: { type: 'screenshot', label: 'Snapshot', icon: '📸' } },
        { label: 'OBS Stats', icon: '📊', tag: 'STS', action: { type: 'stats', mode: 'all', label: 'OBS Stats', icon: '📊' } },
        { label: 'PANIC', icon: '⚡', tag: 'PNC', action: { type: 'panic', label: 'PANIC', icon: '⚡', color: '#7f1d1d' } },
      ],
    },
    {
      id: 'cat-scenes',
      title: 'Scenes & Sources',
      items: [
        { label: 'Scene', icon: '🎬', tag: 'SCN', action: { type: 'scene', mode: 'named', label: 'Scene', icon: '🎬', color: '#991b1b' } },
        { label: 'Prev Scene', icon: '⏮️', tag: 'SCN', action: { type: 'scene', mode: 'prev', label: 'Prev Scene', icon: '⏮️', color: '#115e59' } },
        { label: 'Next Scene', icon: '⏭️', tag: 'SCN', action: { type: 'scene', mode: 'next', label: 'Next Scene', icon: '⏭️', color: '#115e59' } },
        { label: 'Source Visibility', icon: '📺', tag: 'SRC', action: { type: 'source', mode: 'toggle', label: 'Source', icon: '📺' } },
        { label: 'Source Transform', icon: '📐', tag: 'PIP', action: { type: 'transform', preset: 'toggle_pip', label: 'PiP', icon: '📐' } },
      ],
    },
    {
      id: 'cat-audio',
      title: 'Filters & Audio',
      items: [
        { label: 'Filter Toggle', icon: '✨', tag: 'FLT', action: { type: 'filter', mode: 'toggle', label: 'Filter', icon: '✨' } },
        { label: 'Input Mute', icon: '🔇', tag: 'MUT', action: { type: 'mute', mode: 'toggle', label: 'Mute', icon: '🔇' } },
        { label: 'Input Volume', icon: '🔊', tag: 'VOL', action: { type: 'volume', mode: 'step', volumeDb: -3, label: 'Volume', icon: '🔊' } },
        { label: 'Audio Monitor', icon: '🎧', tag: 'MON', action: { type: 'monitor', monitorType: 'cycle', label: 'Monitor', icon: '🎧' } },
      ],
    },
    {
      id: 'cat-media',
      title: 'Media & Tools',
      items: [
        { label: 'Media Source Control', icon: '🎵', tag: 'MED', action: { type: 'media', mediaAction: 'play_pause', label: 'Media', icon: '🎵' } },
        { label: 'Browser Source', icon: '🌐', tag: 'WEB', action: { type: 'browser', mode: 'refresh', label: 'Browser Source', icon: '🌐' } },
        { label: 'Image Swap', icon: '🖼️', tag: 'IMG', action: { type: 'image', mode: 'set_file', label: 'Image Swap', icon: '🖼️' } },
        { label: 'Scene Transition', icon: '✂️', tag: 'TRN', action: { type: 'transition', label: 'Transition', icon: '✂️' } },
        { label: 'Profile', icon: '👤', tag: 'PRF', action: { type: 'profile', label: 'Profile', icon: '👤' } },
        { label: 'Scene Collection', icon: '📁', tag: 'COL', action: { type: 'collection', label: 'Collection', icon: '📁' } },
        { label: 'OBS Hotkey', icon: '⌨️', tag: 'KEY', action: { type: 'hotkey', label: 'Hotkey', icon: '⌨️' } },
        { label: 'Go to Page', icon: '📄', tag: 'PAG', action: { type: 'page', mode: 'goto', label: 'Go to Page', icon: '📄' } },
        { label: 'Timed Macro', icon: '⏱️', tag: 'MCR', action: { type: 'macro', label: 'Timed Macro', icon: '⏱️', steps: [] } },
      ],
    },
  ];

  let dragIdx = null;
  let dragSourcePageId = '';
  let paletteDragItem = null;
  let justDroppedAt = 0;
  let editingIdx = -1;
  let editingPageId = '';
  let draftPad = null;
  let draftPanic = [];
  let promptedAutoImportThisSession = false;

  // Edit-Mode Multi-Select State
  let selectedPads = new Set();
  let lastSelectedIdx = null;
  let selectMode = false;

  // OpenDeck v2.2.1 State & Utilities
  const FONT_SCALES = ['sm', 'md', 'lg', 'xl', 'xxl'];
  const DEFAULT_FONT_SCALE = 'xl';
  const DEFAULT_PALETTE_W = 320;
  const MIN_PALETTE_W = 260;
  const MAX_PALETTE_W = 550;

  let labelTouched = false;
  let prevTargetName = '';

  function getFontScale() {
    try {
      const saved = localStorage.getItem('opendeck_font_scale');
      if (FONT_SCALES.includes(saved)) return saved;
    } catch {}
    return DEFAULT_FONT_SCALE;
  }

  function setFontScale(scale) {
    if (!FONT_SCALES.includes(scale)) scale = DEFAULT_FONT_SCALE;
    document.documentElement.dataset.fontSize = scale;
    try {
      localStorage.setItem('opendeck_font_scale', scale);
    } catch {}
  }

  function initFontScaler() {
    setFontScale(getFontScale());
    $('btn-font-dec')?.addEventListener('click', () => {
      const cur = document.documentElement.dataset.fontSize || DEFAULT_FONT_SCALE;
      const idx = FONT_SCALES.indexOf(cur);
      if (idx > 0) setFontScale(FONT_SCALES[idx - 1]);
    });
    $('btn-font-inc')?.addEventListener('click', () => {
      const cur = document.documentElement.dataset.fontSize || DEFAULT_FONT_SCALE;
      const idx = FONT_SCALES.indexOf(cur);
      if (idx < FONT_SCALES.length - 1) setFontScale(FONT_SCALES[idx + 1]);
    });
  }

  function getTheme() {
    try {
      const saved = localStorage.getItem('opendeck_theme');
      if (saved === 'light' || saved === 'dark') return saved;
    } catch {}
    return 'dark';
  }

  function applyTheme(theme) {
    const t = (theme === 'light') ? 'light' : 'dark';
    document.documentElement.dataset.theme = t;
    try {
      localStorage.setItem('opendeck_theme', t);
    } catch {}
    const btn = $('btn-theme');
    if (btn) {
      btn.textContent = (t === 'light') ? '🌙' : '☀️';
      btn.title = (t === 'light') ? 'Switch to Dark Theme' : 'Switch to Light Theme';
    }
  }

  function initTheme() {
    applyTheme(getTheme());
    $('btn-theme')?.addEventListener('click', () => {
      const cur = document.documentElement.dataset.theme || 'dark';
      applyTheme(cur === 'light' ? 'dark' : 'light');
    });
  }

  function setPaletteWidth(w, save = true) {
    const palette = $('palette');
    if (!palette) return;
    const clamped = Math.max(MIN_PALETTE_W, Math.min(MAX_PALETTE_W, Math.round(w)));
    palette.style.width = `${clamped}px`;
    palette.style.setProperty('--palette-w', `${clamped}px`);
    if (save) {
      try {
        localStorage.setItem('opendeck_palette_w', String(clamped));
      } catch {}
    }
  }

  function initPaletteResizer() {
    const resizer = $('palette-resizer');
    const palette = $('palette');
    if (!resizer || !palette) return;

    try {
      const saved = parseInt(localStorage.getItem('opendeck_palette_w'), 10);
      if (Number.isFinite(saved) && saved >= MIN_PALETTE_W && saved <= MAX_PALETTE_W) {
        setPaletteWidth(saved, false);
      }
    } catch {}

    let isDragging = false;
    let startX = 0;
    let startW = 0;

    resizer.addEventListener('mousedown', (e) => {
      e.preventDefault();
      isDragging = true;
      startX = e.clientX;
      startW = palette.getBoundingClientRect().width || DEFAULT_PALETTE_W;
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';

      const onMouseMove = (ev) => {
        if (!isDragging) return;
        const delta = startX - ev.clientX;
        setPaletteWidth(startW + delta, false);
      };

      const onMouseUp = () => {
        if (!isDragging) return;
        isDragging = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
        const curW = palette.getBoundingClientRect().width;
        setPaletteWidth(curW, true);
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    });

    resizer.addEventListener('dblclick', () => {
      setPaletteWidth(DEFAULT_PALETTE_W, true);
    });
  }

  function maybeAutoSyncLabel(newTargetName) {
    const lblInput = $('f-label');
    if (!lblInput) return;
    const currentVal = lblInput.value.trim();
    if (!labelTouched || !currentVal || currentVal === prevTargetName) {
      if (newTargetName) {
        lblInput.value = newTargetName;
        if (draftPad) draftPad.label = newTargetName;
      }
    }
    prevTargetName = newTargetName || '';
  }

  function isSelfContained(act) {
    if (!act) return false;
    if (act.isLive) return true;
    if (act.type === 'output') return true;
    if (act.type === 'chapter') return true;
    if (act.type === 'studio' && (act.action === 'toggle' || act.action === 'transition')) return true;
    if (act.type === 'screenshot') return true;
    if (act.type === 'stats') return true;
    if (act.type === 'scene' && (act.mode === 'next' || act.mode === 'prev')) return true;
    if (act.type === 'panic') return true;
    return false;
  }

  function clearDragHighlights() {
    document.querySelectorAll('.pad.drag-over, .pad.dragging, .page-tab.drag-over').forEach((el) => {
      el.classList.remove('drag-over', 'dragging');
    });
  }

  function clearSelection() {
    selectedPads.clear();
    lastSelectedIdx = null;
    updateSelectionUi();
  }

  function updateSelectionUi() {
    const grid = $('grid');
    if (grid) {
      grid.querySelectorAll('.pad').forEach((btn) => {
        const idx = Number(btn.dataset.idx);
        btn.classList.toggle('selected', selectedPads.has(idx));
      });
    }
    const countEl = $('sel-count');
    if (countEl) countEl.textContent = `${selectedPads.size} selected`;
    const selModeBtn = $('btn-sel-mode');
    if (selModeBtn) selModeBtn.classList.toggle('on', selectMode);

    const hasSel = selectedPads.size > 0;
    const dupBtn = $('btn-sel-dup');
    if (dupBtn) dupBtn.disabled = !hasSel;
    const moveSel = $('sel-move-page');
    if (moveSel) {
      moveSel.disabled = !hasSel;
      const curId = Deck.cfg.activePageId;
      moveSel.innerHTML = '<option value="">Move to Page…</option>';
      for (const p of Deck.cfg.pages) {
        if (p.id !== curId) {
          const opt = document.createElement('option');
          opt.value = p.id;
          opt.textContent = p.name || 'Page';
          moveSel.appendChild(opt);
        }
      }
    }
    const colBtn = $('btn-sel-color');
    if (colBtn) colBtn.disabled = !hasSel;
    const clrBtn = $('btn-sel-clear');
    if (clrBtn) clrBtn.disabled = !hasSel;
  }

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
    if (p.type === 'hotkey') return p.hotkeyName || 'OBS Hotkey';
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
    if (p.type === 'macro') return 'Macro';
    if (p.type === 'panic') return 'PANIC';
    return Deck.editMode ? `${Math.floor(i / cols) + 1}:${(i % cols) + 1}` : '';
  }

  function tickText(rt) {
    if (!rt || !rt.running) return '';
    return rt.endsAt ? `${Math.max(0, (rt.endsAt - Date.now()) / 1000).toFixed(1)}s` : 'RUN';
  }

  Deck.updateMacroTicks = () => {
    const grid = $('grid');
    if (!grid) return;
    const activeTicks = Deck.getActivePageTicks();
    const activeIndices = new Set(activeTicks.map((t) => t.idx));
    for (const t of activeTicks) {
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
      const ctx = btn.querySelector('.ctx');
      if (ctx) ctx.style.display = txt ? 'none' : '';
    }
    grid.querySelectorAll('.pad:not(.stats-pad)').forEach((btn) => {
      const idx = Number(btn.dataset.idx);
      if (!activeIndices.has(idx)) {
        const sub = btn.querySelector('.sub');
        if (sub) sub.remove();
        const ctx = btn.querySelector('.ctx');
        if (ctx) ctx.style.display = '';
        btn.classList.remove('running');
      }
    });
  };

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

  function renderPageBar() {
    const tabs = $('deck-tabs');
    if (!tabs) return;
    const active = Deck.getActivePage();
    tabs.innerHTML = '';
    for (const d of Deck.cfg.pages) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'page-tab' + (d.id === active.id ? ' on' : '');
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(d.id === active.id));
      b.dataset.pageId = d.id;
      b.textContent = d.name || 'Page';
      b.title = `${d.name} (${d.cols}×${d.rows})`;
      b.addEventListener('click', () => {
        clearSelection();
        Deck.setActivePage(d.id);
      });
      b.addEventListener('dragover', (e) => {
        if (!Deck.editMode || dragIdx === null || d.id === Deck.getActivePage().id) return;
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
        b.classList.add('drag-over');
      });
      b.addEventListener('dragleave', (e) => {
        if (!b.contains(e.relatedTarget)) b.classList.remove('drag-over');
      });
      b.addEventListener('drop', (e) => {
        e.preventDefault();
        clearDragHighlights();
        if (!Deck.editMode || dragIdx === null) return;
        const from = dragIdx;
        const srcPageId = dragSourcePageId;
        dragIdx = null;
        dragSourcePageId = '';
        justDroppedAt = Date.now();
        Deck.movePadToPage(from, d.id, srcPageId);
      });
      tabs.appendChild(b);
    }
    const cfgBtn = $('btn-deck-cfg');
    if (cfgBtn) cfgBtn.textContent = `${active.cols}×${active.rows} ⚙`;
  }

  function initGrid(page) {
    const grid = $('grid');
    const total = page.cols * page.rows;
    grid.style.setProperty('--cols', page.cols);
    grid.style.setProperty('--rows', page.rows);
    grid.setAttribute('aria-label', `${page.cols} by ${page.rows} OBS Deck Page`);
    if (grid.children.length === total) return;
    grid.innerHTML = '';
    for (let i = 0; i < total; i++) {
      const el = document.createElement('button');
      el.type = 'button';
      el.dataset.idx = i;
      el.addEventListener('click', (e) => {
        if (Date.now() - justDroppedAt < 250) return;
        if (Deck.editMode) {
          if (e.ctrlKey || e.metaKey) {
            if (selectedPads.has(i)) selectedPads.delete(i);
            else selectedPads.add(i);
            lastSelectedIdx = i;
            updateSelectionUi();
            return;
          }
          if (e.shiftKey && lastSelectedIdx !== null) {
            const start = Math.min(lastSelectedIdx, i);
            const end = Math.max(lastSelectedIdx, i);
            for (let k = start; k <= end; k++) selectedPads.add(k);
            updateSelectionUi();
            return;
          }
          if (selectMode) {
            if (selectedPads.has(i)) selectedPads.delete(i);
            else selectedPads.add(i);
            lastSelectedIdx = i;
            updateSelectionUi();
            return;
          }
          Deck.openPadEditor(i);
          return;
        }
        Deck.onPadClick(i);
      });
      el.addEventListener('contextmenu', (e) => { e.preventDefault(); Deck.openPadEditor(i); });
      el.addEventListener('dragstart', (e) => {
        if (!Deck.editMode) { e.preventDefault(); return; }
        dragIdx = i;
        dragSourcePageId = Deck.getActivePage().id;
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', String(i));
        }
        el.classList.add('dragging');
      });
      el.addEventListener('dragend', () => {
        if (dragIdx !== null) justDroppedAt = Date.now();
        dragIdx = null;
        dragSourcePageId = '';
        clearDragHighlights();
      });
      el.addEventListener('dragover', (e) => {
        if (!Deck.editMode) return;
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
        clearDragHighlights();
        if (!Deck.editMode) return;
        const activePage = Deck.getActivePage();
        const pads = activePage.pads;
        if (i >= pads.length) return;

        let paletteData = paletteDragItem;
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
          paletteDragItem = null;
          justDroppedAt = Date.now();
          if (typeof Deck.abortPadTimer === 'function') {
            Deck.abortPadTimer(activePage.id, i);
          }
          if (isSelfContained(paletteData)) {
            const newPad = JSON.parse(JSON.stringify(paletteData));
            delete newPad.isLive;
            if (!newPad.color) {
              newPad.color = newPad.type === 'scene' ? '#991b1b' : COLORS[0];
            }
            pads[i] = Deck.normalizePad(newPad);
            Deck.saveCfg();
            Deck.renderGrid();
            Deck.setMsg(`Assigned ${pads[i].label || pads[i].type} to pad ${i + 1}`);
          } else {
            Deck.openPadEditor(i, activePage.id, paletteData);
          }
          return;
        }

        if (dragIdx === null || dragIdx === i || dragIdx >= pads.length) return;
        if (typeof Deck.abortPadTimer === 'function') {
          Deck.abortPadTimer(activePage.id, dragIdx);
          Deck.abortPadTimer(activePage.id, i);
        }
        [pads[dragIdx], pads[i]] = [pads[i], pads[dragIdx]];
        dragIdx = null;
        dragSourcePageId = '';
        justDroppedAt = Date.now();
        Deck.saveCfg();
        Deck.renderGrid();
      });
      grid.appendChild(el);
    }
  }

  function renderPad(p, i, el, page) {
    if (!el) return;
    const rt = Deck.getPadRuntime(i, page.id);
    const active = Deck.isPadActive(p);
    const isRunning = Boolean(rt.running);
    const isFullFace = Boolean(p.image && p.imageFit === 'fill');
    const isDragOver = el.classList.contains('drag-over');
    const isDraggingEl = el.classList.contains('dragging');
    el.className = 'pad'
      + (p.type === 'none' ? ' empty' : '')
      + (p.type === 'stats' ? ' stats-pad' : '')
      + (Deck.editMode ? ' edit-mode' : '')
      + (selectedPads.has(i) ? ' selected' : '')
      + (active ? ' active' : '')
      + (isRunning ? ' running' : '')
      + (isFullFace ? ' full-face' : '')
      + (p.hideLabel ? ' hide-label' : '')
      + (isDragOver ? ' drag-over' : '')
      + (isDraggingEl ? ' dragging' : '');
    if (isFullFace) {
      el.style.backgroundColor = p.color && p.type !== 'none' ? p.color : '';
      el.style.backgroundImage = `url("${p.image}")`;
      el.style.backgroundSize = 'cover';
      el.style.backgroundPosition = 'center';
    } else {
      el.style.backgroundImage = '';
      el.style.backgroundSize = '';
      el.style.backgroundPosition = '';
      el.style.background = p.color && p.type !== 'none' ? p.color : '';
    }
    el.draggable = Deck.editMode && p.type !== 'none';
    const subText = p.type === 'stats' ? Deck.formatStatsText(p.mode || 'all') : tickText(rt);
    const ctxText = (typeof Deck.getPadContextSubtitle === 'function') ? Deck.getPadContextSubtitle(p) : '';
    const lbl = p.label || padFallbackLabel(p, i, page.cols);
    const tipParts = [lbl || `Pad ${i + 1}`];
    if (ctxText) tipParts.push(`[${ctxText}]`);
    if (p.type === 'stats' && subText) tipParts.push(`(${subText})`);
    if (TAGS[p.type]) tipParts.push(`[${TAGS[p.type]}]`);
    el.title = tipParts.join(' ');

    let iconHtml = '';
    if (p.image && p.imageFit !== 'fill') {
      iconHtml = `<img class="pad-icon-img" src="${esc(p.image)}" alt="">`;
    } else if (!p.image && p.icon) {
      iconHtml = `<span class="ico">${esc(p.icon)}</span>`;
    }

    const lblHtml = `<span class="lbl"${p.hideLabel ? ' style="display:none"' : ''}>${esc(lbl)}</span>`;
    const ctxHtml = ctxText ? `<span class="ctx"${(isRunning || p.hideLabel) ? ' style="display:none"' : ''}>${esc(ctxText)}</span>` : '';

    el.innerHTML = `<i class="led"></i>${TAGS[p.type] ? `<span class="tag">${TAGS[p.type]}</span>` : ''}`
      + iconHtml
      + lblHtml
      + ctxHtml
      + `${subText ? `<span class="sub">${esc(subText)}</span>` : ''}`;
  }
  Deck.renderPad = renderPad;

  Deck.renderGrid = () => {
    const page = Deck.getActivePage();
    renderPageBar();
    initGrid(page);
    const btns = $('grid').children;
    page.pads.forEach((p, i) => {
      renderPad(p, i, btns[i], page);
    });
    updateSelectionUi();
  };

  function allSceneTargets() {
    return [...new Set([...Deck.obs.scenes, ...Deck.obs.groups])];
  }

  function allFilterSources() {
    return [...new Set([...Deck.obs.scenes, ...Deck.obs.groups, ...Deck.obs.inputs])];
  }

  function makeObsSelect(label, value, options, onChange, emptyText = 'Select…') {
    const wrap = document.createElement('div');
    wrap.className = 'row';
    const lblEl = document.createElement('label');
    lblEl.textContent = label;
    const box = document.createElement('div');
    box.className = 'obs-pick';

    const sel = document.createElement('select');
    const inp = document.createElement('input');
    inp.type = 'text';
    inp.placeholder = `Type ${label.toLowerCase()}…`;
    inp.value = value || '';
    inp.hidden = true;

    const tog = document.createElement('button');
    tog.type = 'button';
    tog.className = 'btn sm custom-btn';
    tog.title = 'Enter custom name manually (offline fallback)';
    tog.textContent = '✎';

    let currentOpts = [];
    let manualMode = false;

    const fill = (opts, keepVal = inp.value) => {
      currentOpts = [...new Set((opts || []).filter(Boolean))];
      sel.innerHTML = '';
      const blank = document.createElement('option');
      blank.value = '';
      blank.textContent = currentOpts.length
        ? emptyText
        : (Deck.obs.status === 'ok' ? `(No ${label.toLowerCase()} found)` : 'Connect OBS or click ✎…');
      sel.appendChild(blank);

      for (const o of currentOpts) {
        const opt = document.createElement('option');
        opt.value = o;
        opt.textContent = o;
        if (o === keepVal) opt.selected = true;
        sel.appendChild(opt);
      }
      if (keepVal && !currentOpts.includes(keepVal)) {
        const savedOpt = document.createElement('option');
        savedOpt.value = keepVal;
        savedOpt.textContent = `${keepVal} (saved)`;
        savedOpt.selected = true;
        sel.appendChild(savedOpt);
      }
    };

    fill(options, value || '');

    sel.addEventListener('change', () => {
      inp.value = sel.value;
      onChange(sel.value);
    });
    inp.addEventListener('input', () => onChange(inp.value));
    tog.addEventListener('click', () => {
      manualMode = !manualMode;
      tog.classList.toggle('on', manualMode);
      if (manualMode) {
        inp.value = sel.value || inp.value;
        sel.hidden = true;
        inp.hidden = false;
        inp.focus();
      } else {
        fill(currentOpts, inp.value);
        inp.hidden = true;
        sel.hidden = false;
      }
    });

    box.append(sel, inp, tog);
    wrap.append(lblEl, box);
    return { el: wrap, sel, inp, fill };
  }

  function makeSelect(label, value, opts, onChange) {
    const wrap = document.createElement('div');
    wrap.className = 'row';
    const lblEl = document.createElement('label');
    lblEl.textContent = label;
    const sel = document.createElement('select');
    for (const [v, t] of opts) {
      const opt = document.createElement('option');
      opt.value = v;
      opt.textContent = t;
      if (v === value) opt.selected = true;
      sel.appendChild(opt);
    }
    sel.addEventListener('change', () => onChange(sel.value));
    wrap.append(lblEl, sel);
    return wrap;
  }

  function makeTextInput(label, value, placeholder, onChange) {
    const wrap = document.createElement('div');
    wrap.className = 'row';
    const lblEl = document.createElement('label');
    lblEl.textContent = label;
    const inp = document.createElement('input');
    inp.type = 'text';
    inp.value = value || '';
    inp.placeholder = placeholder || '';
    inp.addEventListener('input', () => onChange(inp.value));
    wrap.append(lblEl, inp);
    return wrap;
  }

  function makeAutoOffField(obj) {
    const wrap = document.createElement('div');
    wrap.className = 'row';
    const lbl = document.createElement('label');
    lbl.textContent = 'Auto-off after (sec) — 0 = stay toggled';
    const box = document.createElement('div');
    box.className = 'auto-off-wrap';
    const inp = document.createElement('input');
    inp.id = 'f-auto-off';
    inp.type = 'number';
    inp.min = '0';
    inp.step = 'any';
    inp.placeholder = '0';
    inp.value = obj.autoOffMs > 0 ? String(obj.autoOffMs / 1000) : '0';

    const setSec = (sec) => {
      const n = Number(sec);
      const ms = Number.isFinite(n) && n > 0 ? Math.round(n * 1000) : 0;
      if (ms > 0) obj.autoOffMs = ms;
      else delete obj.autoOffMs;
      inp.value = ms > 0 ? String(ms / 1000) : '0';
    };

    inp.addEventListener('input', () => {
      const n = Number(inp.value);
      if (Number.isFinite(n) && n > 0) obj.autoOffMs = Math.round(n * 1000);
      else delete obj.autoOffMs;
    });

    const chips = document.createElement('div');
    chips.className = 'chips';
    for (const s of [0, 3, 5, 10, 30]) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn sm';
      b.textContent = s === 0 ? 'Off' : `${s}s`;
      b.addEventListener('click', () => setSec(s));
      chips.appendChild(b);
    }

    box.append(inp, chips);
    wrap.append(lbl, box);
    return wrap;
  }

  function renderActionFields(container, obj, allowWait) {
    const { obs } = Deck;
    container.innerHTML = '';
    const t = obj.type;

    if (t === 'scene') {
      if (!['named', 'next', 'prev'].includes(obj.mode)) obj.mode = 'named';
      const sceneRow = makeObsSelect('Scene Name', obj.sceneName, obs.scenes, (v) => { obj.sceneName = v; if (!allowWait) maybeAutoSyncLabel(v); }, 'Select scene…').el;
      const syncVis = () => { sceneRow.hidden = (obj.mode || 'named') !== 'named'; };
      container.append(
        sceneRow,
        makeSelect('Target Mode', obj.mode, [
          ['named', 'Named Scene'],
          ['next', 'Next Scene'],
          ['prev', 'Previous Scene'],
        ], (v) => { obj.mode = v; syncVis(); })
      );
      syncVis();
    } else if (t === 'source') {
      let srcPick;
      const scPick = makeObsSelect('Scene / Group', obj.sceneName, allSceneTargets(), (v) => {
        obj.sceneName = v;
        srcPick.fill((obs.itemsByScene[v] || []).map((x) => x.sourceName), obj.sourceName);
      }, 'Select scene or group…');
      srcPick = makeObsSelect(
        'Source Name',
        obj.sourceName,
        (obs.itemsByScene[obj.sceneName] || []).map((x) => x.sourceName),
        (v) => { obj.sourceName = v; if (!allowWait) maybeAutoSyncLabel(v); },
        'Select source…'
      );
      container.append(
        scPick.el,
        srcPick.el,
        makeSelect('Mode', obj.mode || 'toggle', [
          ['toggle', 'Toggle'], ['show', 'Show'], ['hide', 'Hide'], ['solo', 'Solo (Hide Others)'],
        ], (v) => { obj.mode = v; })
      );
      if (!allowWait) container.appendChild(makeAutoOffField(obj));
    } else if (t === 'transform') {
      if (!obj.preset) obj.preset = 'toggle_pip';
      let srcPick;
      const scPick = makeObsSelect('Scene / Group', obj.sceneName, allSceneTargets(), (v) => {
        obj.sceneName = v;
        srcPick.fill((obs.itemsByScene[v] || []).map((x) => x.sourceName), obj.sourceName);
      }, 'Select scene or group…');
      srcPick = makeObsSelect(
        'Source Name',
        obj.sourceName,
        (obs.itemsByScene[obj.sceneName] || []).map((x) => x.sourceName),
        (v) => { obj.sourceName = v; if (!allowWait) maybeAutoSyncLabel(v); },
        'Select source…'
      );
      container.append(
        scPick.el,
        srcPick.el,
        makeSelect('Transform Preset', obj.preset, [
          ['toggle_pip', 'Toggle PiP ↔ Full'],
          ['pip_br', 'PiP Bottom-Right'],
          ['pip_tr', 'PiP Top-Right'],
          ['pip_bl', 'PiP Bottom-Left'],
          ['pip_tl', 'PiP Top-Left'],
          ['center_half', 'Center Half (50%)'],
          ['full_reset', 'Full Screen Reset'],
        ], (v) => { obj.preset = v; })
      );
    } else if (t === 'filter') {
      let fltPick;
      const loadFlts = async (src) => {
        if (!src) return;
        const flts = obs.status === 'ok' ? await Deck.refreshFilters(src) : (obs.filtersBySource[src] || []);
        fltPick.fill(flts.map((f) => f.filterName), obj.filterName);
      };
      const srcPick = makeObsSelect('Source / Scene', obj.sourceName, allFilterSources(), (v) => {
        obj.sourceName = v;
        loadFlts(v);
      }, 'Select source or scene…');
      fltPick = makeObsSelect(
        'Filter Name',
        obj.filterName,
        (obs.filtersBySource[obj.sourceName] || []).map((f) => f.filterName),
        (v) => { obj.filterName = v; if (!allowWait) maybeAutoSyncLabel(v); },
        'Select filter…'
      );
      if (obj.sourceName && obs.status === 'ok') loadFlts(obj.sourceName);
      container.append(
        srcPick.el,
        fltPick.el,
        makeSelect('Mode', obj.mode || 'toggle', [
          ['toggle', 'Toggle'], ['enable', 'Enable'], ['disable', 'Disable'],
        ], (v) => { obj.mode = v; })
      );
      if (!allowWait) container.appendChild(makeAutoOffField(obj));
    } else if (t === 'mute') {
      container.append(
        makeObsSelect('Input Name', obj.inputName, obs.inputs, (v) => { obj.inputName = v; if (!allowWait) maybeAutoSyncLabel(v); }, 'Select audio input…').el,
        makeSelect('Mode', obj.mode || 'toggle', [
          ['toggle', 'Toggle'], ['mute', 'Mute'], ['unmute', 'Unmute'],
        ], (v) => { obj.mode = v; })
      );
      if (!allowWait) container.appendChild(makeAutoOffField(obj));
    } else if (t === 'monitor') {
      if (!obj.monitorType) obj.monitorType = 'cycle';
      container.append(
        makeObsSelect('Audio Input', obj.inputName, obs.inputs, (v) => { obj.inputName = v; if (!allowWait) maybeAutoSyncLabel(v); }, 'Select audio input…').el,
        makeSelect('Monitor Mode', obj.monitorType, [
          ['cycle', 'Cycle (Off → Mon Only → Both)'],
          ['OBS_MONITORING_TYPE_NONE', 'Monitor Off'],
          ['OBS_MONITORING_TYPE_MONITOR_ONLY', 'Monitor Only (Mute Output)'],
          ['OBS_MONITORING_TYPE_MONITOR_AND_OUTPUT', 'Monitor and Output'],
        ], (v) => { obj.monitorType = v; })
      );
    } else if (t === 'studio') {
      if (!obj.action) obj.action = 'toggle';
      const sceneRow = makeObsSelect('Preview Scene', obj.sceneName, obs.scenes, (v) => { obj.sceneName = v; }, 'Select preview scene…').el;
      const autoRow = !allowWait ? makeAutoOffField(obj) : null;
      const syncVis = () => {
        const act = obj.action || 'toggle';
        sceneRow.hidden = act !== 'preview';
        if (autoRow) autoRow.hidden = !['toggle', 'enable', 'disable'].includes(act);
      };
      container.append(
        makeSelect('Studio Action', obj.action, [
          ['toggle', 'Toggle Studio Mode'],
          ['enable', 'Enable Studio Mode'],
          ['disable', 'Disable Studio Mode'],
          ['preview', 'Set Preview Scene'],
          ['transition', 'Trigger Transition (Cut)'],
        ], (v) => { obj.action = v; syncVis(); }),
        sceneRow
      );
      if (autoRow) container.appendChild(autoRow);
      syncVis();
    } else if (t === 'output') {
      if (!obj.target) obj.target = 'stream';
      if (!obj.mode) obj.mode = 'toggle';
      const modeRow = makeSelect('Mode', obj.mode, [
        ['toggle', 'Toggle'], ['start', 'Start'], ['stop', 'Stop'],
      ], (v) => { obj.mode = v; });
      const autoRow = !allowWait ? makeAutoOffField(obj) : null;
      const syncVis = () => {
        const isSave = obj.target === 'saveReplay';
        modeRow.hidden = isSave;
        if (autoRow) autoRow.hidden = isSave;
      };
      container.append(
        makeSelect('OBS Output', obj.target, [
          ['stream', 'Stream'],
          ['record', 'Record'],
          ['recordPause', 'Record Pause'],
          ['vcam', 'Virtual Camera'],
          ['replay', 'Replay Buffer'],
          ['saveReplay', 'Save Replay Buffer'],
        ], (v) => { obj.target = v; syncVis(); }),
        modeRow
      );
      if (autoRow) container.appendChild(autoRow);
      syncVis();
    } else if (t === 'chapter') {
      container.appendChild(
        makeTextInput('Chapter Name (optional)', obj.chapterName || '', 'Leave blank for default OBS chapter name', (v) => { obj.chapterName = v; })
      );
    } else if (t === 'stats') {
      if (!obj.mode) obj.mode = 'all';
      container.appendChild(
        makeSelect('Telemetry Metric', obj.mode, [
          ['all', 'All (CPU · FPS · Dropped)'],
          ['cpu', 'CPU Usage (%)'],
          ['fps', 'Active FPS'],
          ['dropped', 'Dropped / Skipped Frames'],
        ], (v) => { obj.mode = v; })
      );
    } else if (t === 'hotkey') {
      container.appendChild(
        makeObsSelect('OBS Hotkey', obj.hotkeyName, obs.hotkeys || [], (v) => { obj.hotkeyName = v; if (!allowWait) maybeAutoSyncLabel(v); }, 'Select OBS hotkey…').el
      );
    } else if (t === 'media') {
      const mediaOpts = obs.mediaInputs?.length ? obs.mediaInputs : obs.inputs;
      container.append(
        makeObsSelect('Media Input', obj.inputName, mediaOpts, (v) => { obj.inputName = v; if (!allowWait) maybeAutoSyncLabel(v); }, 'Select media source…').el,
        makeSelect('Playback Action', obj.mediaAction || 'play_pause', [
          ['play_pause', 'Play / Pause'],
          ['play', 'Play'],
          ['pause', 'Pause'],
          ['stop', 'Stop'],
          ['restart', 'Restart'],
          ['next', 'Next'],
          ['previous', 'Previous'],
        ], (v) => { obj.mediaAction = v; })
      );
      if (!allowWait) container.appendChild(makeAutoOffField(obj));
    } else if (t === 'image') {
      if (!obj.mode) obj.mode = 'set_file';
      const imageOpts = obs.imageInputs?.length ? obs.imageInputs : obs.inputs;
      const fileRow = makeTextInput('Image File Path', obj.filePath || '', 'C:/path/to/slide.png', (v) => { obj.filePath = v; });
      const syncVis = () => { fileRow.hidden = (obj.mode || 'set_file') !== 'set_file'; };
      container.append(
        makeObsSelect('Image / Slideshow Input', obj.inputName, imageOpts, (v) => { obj.inputName = v; if (!allowWait) maybeAutoSyncLabel(v); }, 'Select image or slideshow…').el,
        makeSelect('Mode', obj.mode, [
          ['set_file', 'Set Image File'],
          ['next', 'Slideshow: Next'],
          ['previous', 'Slideshow: Previous'],
          ['restart', 'Slideshow: Restart'],
        ], (v) => { obj.mode = v; syncVis(); }),
        fileRow
      );
      syncVis();
    } else if (t === 'screenshot') {
      container.append(
        makeObsSelect('Source / Scene (blank = Program)', obj.sourceName, allFilterSources(), (v) => { obj.sourceName = v; if (!allowWait) maybeAutoSyncLabel(v); }, 'Current Program Scene').el,
        makeSelect('Image Format', obj.imageFormat || 'png', [
          ['png', 'PNG'], ['jpg', 'JPEG'], ['webp', 'WebP'],
        ], (v) => { obj.imageFormat = v; }),
        makeTextInput('Save Path on OBS PC (blank = download)', obj.savePath || '', 'Leave blank to download in browser', (v) => { obj.savePath = v; })
      );
    } else if (t === 'browser') {
      const browserOpts = obs.browserInputs?.length ? obs.browserInputs : obs.inputs;
      const urlRow = makeTextInput('URL', obj.url || '', 'https://example.com', (v) => { obj.url = v; });
      const syncVis = () => { urlRow.hidden = (obj.mode || 'refresh') !== 'set_url'; };
      container.append(
        makeObsSelect('Browser Source', obj.inputName, browserOpts, (v) => { obj.inputName = v; if (!allowWait) maybeAutoSyncLabel(v); }, 'Select browser source…').el,
        makeSelect('Mode', obj.mode || 'refresh', [
          ['refresh', 'Refresh Cache'], ['set_url', 'Update URL'],
        ], (v) => { obj.mode = v; syncVis(); }),
        urlRow
      );
      syncVis();
    } else if (t === 'volume') {
      if (!obj.mode) obj.mode = 'set';
      if (obj.volumeDb == null) obj.volumeDb = obj.mode === 'step' ? -3 : 0;
      const dbRow = document.createElement('div');
      dbRow.className = 'row';
      dbRow.innerHTML = `<label>Volume (dB, -100 to +26)</label><input type="number" min="-100" max="26" step="any">`;
      const dbInp = dbRow.querySelector('input');
      dbInp.value = String(obj.volumeDb);
      dbInp.addEventListener('input', () => {
        const n = Number(dbInp.value);
        if (Number.isFinite(n)) obj.volumeDb = Math.max(-100, Math.min(26, n));
      });
      container.append(
        makeObsSelect('Audio Input', obj.inputName, obs.inputs, (v) => { obj.inputName = v; if (!allowWait) maybeAutoSyncLabel(v); }, 'Select input…').el,
        makeSelect('Mode', obj.mode, [
          ['set', 'Set Volume (dB)'], ['step', 'Step Volume (+/- dB)'],
        ], (v) => { obj.mode = v; }),
        dbRow
      );
    } else if (t === 'profile') {
      container.appendChild(makeObsSelect('OBS Profile', obj.profileName, obs.profiles || [], (v) => { obj.profileName = v; if (!allowWait) maybeAutoSyncLabel(v); }, 'Select profile…').el);
    } else if (t === 'collection') {
      container.appendChild(makeObsSelect('Scene Collection', obj.collectionName, obs.collections || [], (v) => { obj.collectionName = v; if (!allowWait) maybeAutoSyncLabel(v); }, 'Select collection…').el);
    } else if (t === 'transition') {
      const durRow = document.createElement('div');
      durRow.className = 'row';
      durRow.innerHTML = `<label>Duration (ms, optional)</label><input type="number" min="0" max="20000" step="50" placeholder="Keep current">`;
      const durInp = durRow.querySelector('input');
      if (obj.durationMs != null && obj.durationMs !== '') durInp.value = String(obj.durationMs);
      durInp.addEventListener('input', () => {
        if (durInp.value === '') { delete obj.durationMs; return; }
        const n = Number(durInp.value);
        if (Number.isFinite(n) && n >= 0) obj.durationMs = Math.round(n);
      });
      container.append(
        makeObsSelect('Transition', obj.transitionName, obs.transitions || [], (v) => { obj.transitionName = v; if (!allowWait) maybeAutoSyncLabel(v); }, 'Select transition…').el,
        durRow
      );
    } else if (t === 'page') {
      if (!obj.mode) obj.mode = 'goto';
      if (obj.mode === 'goto' && !obj.pageId) obj.pageId = obj.deckId || Deck.cfg.pages[0]?.id || '';
      const pageOpts = Deck.cfg.pages.map((d) => [d.id, d.name]);
      const pageRow = makeSelect('Target Page', obj.pageId, pageOpts, (v) => { obj.pageId = v; });
      const syncVis = () => { pageRow.hidden = (obj.mode || 'goto') !== 'goto'; };
      container.append(
        makeSelect('Navigation', obj.mode, [
          ['goto', 'Go to Page'], ['next', 'Next Page'], ['prev', 'Previous Page'],
        ], (v) => { obj.mode = v; syncVis(); }),
        pageRow
      );
      syncVis();
    } else if (t === 'wait' && allowWait) {
      const row = document.createElement('div');
      row.className = 'row';
      const val = obj.delayMs != null ? Number(obj.delayMs) : 1000;
      row.innerHTML = `<label>Delay (ms)</label><input type="number" min="0" step="100" value="${Number.isFinite(val) ? val : 1000}">`;
      row.querySelector('input').addEventListener('input', (e) => {
        const n = Number(e.target.value);
        obj.delayMs = Number.isFinite(n) ? Math.max(0, n) : 0;
      });
      container.appendChild(row);
    }
  }

  function renderStepList(container, steps, allowWait) {
    container.innerHTML = '';
    steps.forEach((st, idx) => {
      const box = document.createElement('div');
      box.className = 'step';
      const top = document.createElement('div');
      top.className = 'step-top';
      const sel = document.createElement('select');
      const types = [
        ['scene', 'Scene'],
        ['source', 'Source'],
        ['transform', 'Source Transform / PiP'],
        ['filter', 'Filter'],
        ['mute', 'Mute'],
        ['volume', 'Volume'],
        ['monitor', 'Audio Monitor'],
        ['studio', 'Studio Mode'],
        ['output', 'Stream / Record / Cam'],
        ['chapter', 'Recording Chapter'],
        ['media', 'Media'],
        ['image', 'Image / Slideshow'],
        ['browser', 'Browser Source'],
        ['screenshot', 'Screenshot'],
        ['hotkey', 'OBS Hotkey'],
        ['transition', 'Transition'],
        ['profile', 'Profile'],
        ['collection', 'Collection'],
        ['page', 'Switch Page'],
      ];
      if (allowWait) types.push(['wait', 'Wait (ms)']);
      for (const [v, t] of types) {
        const o = document.createElement('option');
        o.value = v;
        o.textContent = t;
        if (v === st.type) o.selected = true;
        sel.appendChild(o);
      }
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'btn sm';
      del.textContent = '✕';
      del.addEventListener('click', () => { steps.splice(idx, 1); renderStepList(container, steps, allowWait); });
      top.append(sel, del);
      const body = document.createElement('div');
      body.className = 'frm';
      sel.addEventListener('change', () => {
        const nextType = sel.value;
        for (const k of Object.keys(st)) {
          if (k !== 'type') delete st[k];
        }
        st.type = nextType;
        if (st.type === 'wait') st.delayMs = 2000;
        renderActionFields(body, st, allowWait);
      });
      renderActionFields(body, st, allowWait);
      box.append(top, body);
      container.appendChild(box);
    });
  }

  function drawPadFields() {
    const f = $('f-fields');
    f.innerHTML = '';
    draftPad.type = $('f-type').value;
    if (draftPad.type === 'macro') {
      const list = document.createElement('div');
      list.className = 'steps';
      const add = document.createElement('button');
      add.type = 'button';
      add.className = 'btn sm';
      add.textContent = '+ Add Step';
      add.addEventListener('click', () => {
        draftPad.steps.push({ type: 'filter', mode: 'enable' });
        renderStepList(list, draftPad.steps, true);
      });
      renderStepList(list, draftPad.steps, true);
      f.append(list, add);
    } else if (draftPad.type === 'panic') {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn sm';
      btn.textContent = 'Configure PANIC Steps…';
      btn.addEventListener('click', openPanicDialog);
      f.appendChild(btn);
    } else {
      renderActionFields(f, draftPad, false);
    }
  }

  Deck.openPadEditor = (idx, pageId, prefillAction) => {
    const page = pageId ? (Deck.cfg.pages.find((d) => d.id === pageId) || Deck.getActivePage()) : Deck.getActivePage();
    if (!page.pads[idx]) return;
    editingIdx = idx;
    editingPageId = page.id;
    draftPad = JSON.parse(JSON.stringify(page.pads[idx]));

    if (prefillAction) {
      Object.assign(draftPad, JSON.parse(JSON.stringify(prefillAction)));
      if (draftPad.type === 'scene' && (!draftPad.color || draftPad.color === COLORS[0] || draftPad.color === '#222733')) {
        draftPad.color = '#991b1b';
      }
    }

    if (!draftPad.steps) draftPad.steps = [];
    const cols = page.cols || 8;
    $('dlg-title').textContent = `Edit Pad R${Math.floor(idx / cols) + 1}C${(idx % cols) + 1} (${page.name})`;
    $('f-label').value = draftPad.label || '';
    $('f-icon').value = draftPad.icon || '';
    $('f-type').value = draftPad.type || 'none';

    // Auto-Label tracking state
    const currentTarget = draftPad.sceneName || draftPad.sourceName || draftPad.filterName || draftPad.inputName || draftPad.hotkeyName || '';
    prevTargetName = currentTarget;
    labelTouched = Boolean(draftPad.label && currentTarget && draftPad.label !== currentTarget);

    // Custom Pad Graphics state
    if ($('f-image-file')) $('f-image-file').value = '';
    if ($('btn-remove-image')) $('btn-remove-image').hidden = !draftPad.image;
    if ($('f-image-fit')) $('f-image-fit').value = draftPad.imageFit === 'fill' ? 'fill' : 'icon';
    if ($('f-image-hidelabel')) $('f-image-hidelabel').checked = Boolean(draftPad.hideLabel);

    const icoBox = $('f-icons');
    if (icoBox && !icoBox.children.length) {
      for (const emo of ICON_PRESETS) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'ico-chip';
        b.textContent = emo;
        b.title = `Use ${emo}`;
        b.addEventListener('click', () => { $('f-icon').value = emo; });
        icoBox.appendChild(b);
      }
    }

    const sw = $('f-colors');
    sw.innerHTML = '';
    COLORS.forEach((c) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'sw' + ((draftPad.color || COLORS[0]) === c ? ' sel' : '');
      b.style.background = c;
      b.title = c;
      b.addEventListener('click', () => {
        draftPad.color = c;
        sw.querySelectorAll('.sw').forEach((x) => x.classList.remove('sel'));
        b.classList.add('sel');
      });
      sw.appendChild(b);
    });
    drawPadFields();
    $('pad-dlg').showModal();
  };

  function openPageDialog() {
    const page = Deck.getActivePage();
    $('d-name').value = page.name || 'Main';
    $('d-cols').value = page.cols;
    $('d-rows').value = page.rows;
    $('btn-deck-del').disabled = Deck.cfg.pages.length <= 1;
    syncPagePresetHighlight();
    $('deck-dlg').showModal();
  }

  function syncPagePresetHighlight() {
    const c = Number($('d-cols').value);
    const r = Number($('d-rows').value);
    $('d-presets').querySelectorAll('button').forEach((b) => {
      b.classList.toggle('on', Number(b.dataset.cols) === c && Number(b.dataset.rows) === r);
    });
  }

  function openPanicDialog() {
    draftPanic = JSON.parse(JSON.stringify(Deck.cfg.panicSteps || []));
    renderStepList($('panic-steps'), draftPanic, false);
    $('panic-dlg').showModal();
  }

  function syncAutoImportState() {
    const connected = Deck.obs.status === 'ok';
    const anyChecked = $('wiz-scenes').checked
      || $('wiz-sources').checked
      || $('wiz-filters').checked
      || $('wiz-broadcast').checked;
    const isStarter = Deck.isStarterDeck();
    const rep = $('wiz-replace');
    if (rep) {
      rep.disabled = !isStarter;
      if (!isStarter) rep.checked = false;
    }
    const summary = $('wiz-summary');
    if (summary) {
      if (connected) {
        const { obs } = Deck;
        const filterCount = Object.values(obs.filtersBySource || {}).reduce((acc, arr) => acc + (arr?.length || 0), 0);
        summary.textContent = `Connected to OBS (${obs.scenes.length} scene(s), ${obs.inputs.length} input(s), ${filterCount} filter(s)). Read-only scan — OBS will not be modified.`;
      } else {
        summary.textContent = 'Connect to OBS Studio first to scan your scenes, sources, filters, and audio inputs (read-only).';
      }
    }
    const applyBtn = $('btn-wiz-apply');
    if (applyBtn) applyBtn.disabled = !connected || !anyChecked;
  }

  function openAutoImportWizard() {
    const dlg = $('import-wiz-dlg');
    if (!dlg) return;
    $('wiz-scenes').checked = true;
    $('wiz-sources').checked = true;
    $('wiz-filters').checked = true;
    $('wiz-broadcast').checked = true;
    $('wiz-replace').checked = Deck.isStarterDeck();
    syncAutoImportState();
    if (!dlg.open) dlg.showModal();
  }

  Deck.onObsConnected = () => {
    renderPalette();
    if (promptedAutoImportThisSession) return;
    if (!Deck.isStarterDeck()) return;
    if (document.querySelector('dialog[open]')) return;
    if (!Deck.obs.scenes.length && !Deck.obs.inputs.length) return;
    promptedAutoImportThisSession = true;
    openAutoImportWizard();
  };

  // Command Palette Builder & Filter
  function createPaletteItemEl(it) {
    const el = document.createElement('div');
    el.className = 'palette-item';
    el.draggable = true;
    el.title = it.label || '';
    el.innerHTML = `<span class="pal-ico">${esc(it.icon || '⚡')}</span>`
      + `<span class="pal-lbl">${esc(it.label)}</span>`
      + `<span class="pal-tag">${esc(it.tag || 'ACT')}</span>`;

    el.addEventListener('dragstart', (e) => {
      paletteDragItem = it.action;
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'copy';
        e.dataTransfer.setData('application/json', JSON.stringify({ source: 'palette', action: it.action }));
        e.dataTransfer.setData('text/plain', `palette:${it.action.type}`);
      }
    });
    el.addEventListener('dragend', () => {
      paletteDragItem = null;
      clearDragHighlights();
    });
    return el;
  }

  function renderPalette() {
    const container = $('palette-list');
    if (!container) return;
    container.innerHTML = '';

    for (const cat of PALETTE_CATEGORIES) {
      const details = document.createElement('details');
      details.className = 'palette-cat';
      details.id = cat.id;
      details.open = true;

      const sum = document.createElement('summary');
      sum.textContent = cat.title;
      details.appendChild(sum);

      const itemsWrap = document.createElement('div');
      itemsWrap.className = 'palette-items';
      for (const it of cat.items) {
        itemsWrap.appendChild(createPaletteItemEl(it));
      }
      details.appendChild(itemsWrap);
      container.appendChild(details);
    }

    // Category 5: Live OBS Items (if connected)
    const liveCat = document.createElement('details');
    liveCat.className = 'palette-cat';
    liveCat.id = 'palette-cat-live';
    liveCat.open = true;

    const liveSum = document.createElement('summary');
    liveSum.textContent = 'Live OBS Items';
    liveCat.appendChild(liveSum);

    const liveWrap = document.createElement('div');
    liveWrap.className = 'palette-items';

    if (Deck.obs.status === 'ok') {
      const { obs } = Deck;
      let hasLive = false;

      // Live Scenes
      (obs.scenes || []).forEach((sc) => {
        hasLive = true;
        liveWrap.appendChild(createPaletteItemEl({
          label: sc,
          icon: '🎬',
          tag: 'SCN',
          action: { type: 'scene', mode: 'named', sceneName: sc, label: sc, icon: '🎬', color: '#991b1b', isLive: true },
        }));
      });

      // Live Sources
      for (const [scName, items] of Object.entries(obs.itemsByScene || {})) {
        (items || []).forEach((it) => {
          hasLive = true;
          liveWrap.appendChild(createPaletteItemEl({
            label: `${it.sourceName} (${scName})`,
            icon: '📺',
            tag: 'SRC',
            action: { type: 'source', sceneName: scName, sourceName: it.sourceName, mode: 'toggle', label: it.sourceName, icon: '📺', isLive: true },
          }));
        });
      }

      // Live Filters
      for (const [srcName, flts] of Object.entries(obs.filtersBySource || {})) {
        (flts || []).forEach((f) => {
          hasLive = true;
          liveWrap.appendChild(createPaletteItemEl({
            label: `${f.filterName} (${srcName})`,
            icon: '✨',
            tag: 'FLT',
            action: { type: 'filter', sourceName: srcName, filterName: f.filterName, mode: 'toggle', label: f.filterName, icon: '✨', isLive: true },
          }));
        });
      }

      // Live Inputs (Mute)
      (obs.inputs || []).forEach((inp) => {
        hasLive = true;
        liveWrap.appendChild(createPaletteItemEl({
          label: inp,
          icon: '🎙️',
          tag: 'MUT',
          action: { type: 'mute', inputName: inp, mode: 'toggle', label: inp, icon: '🎙️', isLive: true },
        }));
      });

      if (!hasLive) {
        const hint = document.createElement('div');
        hint.className = 'palette-hint';
        hint.textContent = 'No scenes or sources found in OBS.';
        liveWrap.appendChild(hint);
      }
    } else {
      const hint = document.createElement('div');
      hint.className = 'palette-hint';
      hint.textContent = 'Connect OBS to see live items';
      liveWrap.appendChild(hint);
    }
    liveCat.appendChild(liveWrap);
    container.appendChild(liveCat);

    filterPalette();
  }

  function filterPalette() {
    const q = ($('palette-search')?.value || '').trim().toLowerCase();
    const cats = document.querySelectorAll('.palette-cat');
    cats.forEach((cat) => {
      let catMatches = 0;
      const items = cat.querySelectorAll('.palette-item');
      items.forEach((item) => {
        const text = (item.textContent || '').toLowerCase();
        const matches = !q || text.includes(q);
        item.style.display = matches ? 'flex' : 'none';
        if (matches) catMatches++;
      });
      cat.style.display = (!items.length || catMatches > 0) ? '' : 'none';
      if (q && catMatches > 0) cat.open = true;
    });
  }

  Deck.renderPalette = renderPalette;

  $('palette-search')?.addEventListener('input', filterPalette);
  $('palette-close')?.addEventListener('click', () => {
    const pal = $('palette');
    if (!pal) return;
    pal.classList.remove('open');
    pal.classList.add('collapsed');
  });
  $('btn-palette')?.addEventListener('click', () => {
    const pal = $('palette');
    if (!pal) return;
    if (window.innerWidth <= 600) {
      pal.classList.toggle('open');
    } else {
      pal.classList.toggle('collapsed');
    }
  });

  // Pad Editor Events
  $('f-type').addEventListener('change', () => {
    if ($('f-type').value === 'scene') {
      if (!draftPad.color || draftPad.color === COLORS[0] || draftPad.color === '#222733') {
        draftPad.color = '#991b1b';
        const swBox = $('f-colors');
        if (swBox) {
          swBox.querySelectorAll('.sw').forEach((b) => {
            b.classList.toggle('sel', b.title === '#991b1b');
          });
        }
      }
    }
    drawPadFields();
  });

  $('f-label')?.addEventListener('input', () => {
    labelTouched = Boolean($('f-label').value.trim());
  });

  $('btn-upload-image')?.addEventListener('click', () => {
    $('f-image-file')?.click();
  });

  $('f-image-file')?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');
        const size = Math.min(img.width, img.height);
        const sx = (img.width - size) / 2;
        const sy = (img.height - size) / 2;
        ctx.drawImage(img, sx, sy, size, size, 0, 0, 128, 128);
        let dataUrl = '';
        try {
          dataUrl = canvas.toDataURL('image/webp', 0.85);
          if (!dataUrl || !dataUrl.startsWith('data:image/webp')) {
            dataUrl = canvas.toDataURL('image/png');
          }
        } catch {
          dataUrl = canvas.toDataURL('image/png');
        }
        if (draftPad) {
          draftPad.image = dataUrl;
          if (!draftPad.imageFit) {
            draftPad.imageFit = $('f-image-fit')?.value || 'icon';
          }
        }
        if ($('btn-remove-image')) $('btn-remove-image').hidden = false;
        e.target.value = '';
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  });

  $('btn-remove-image')?.addEventListener('click', () => {
    if (draftPad) {
      delete draftPad.image;
      delete draftPad.imageFit;
    }
    if ($('btn-remove-image')) $('btn-remove-image').hidden = true;
    if ($('f-image-file')) $('f-image-file').value = '';
  });

  $('f-image-fit')?.addEventListener('change', (e) => {
    if (draftPad) {
      draftPad.imageFit = e.target.value;
    }
  });

  $('f-image-hidelabel')?.addEventListener('change', (e) => {
    if (draftPad) {
      draftPad.hideLabel = e.target.checked;
    }
  });

  $('dlg-close').addEventListener('click', () => $('pad-dlg').close());
  $('btn-pad-cancel').addEventListener('click', () => $('pad-dlg').close());

  $('btn-pad-clear').addEventListener('click', () => {
    const page = Deck.cfg.pages.find((d) => d.id === editingPageId) || Deck.getActivePage();
    if (page.pads[editingIdx]) page.pads[editingIdx] = { type: 'none', label: '', icon: '', color: COLORS[0] };
    Deck.saveCfg();
    $('pad-dlg').close();
    Deck.renderGrid();
  });

  $('btn-pad-dup').addEventListener('click', () => {
    const dstIdx = Deck.duplicatePad(editingIdx, editingPageId, editingPageId);
    if (dstIdx >= 0) {
      $('pad-dlg').close();
      Deck.setMsg(`Duplicated pad to slot ${dstIdx + 1}`);
      Deck.renderGrid();
    } else {
      Deck.setMsg('Page is full — cannot duplicate');
    }
  });

  $('pad-form').addEventListener('submit', () => {
    draftPad.label = $('f-label').value.trim();
    draftPad.icon = $('f-icon').value.trim();
    if ($('f-image-fit')) draftPad.imageFit = $('f-image-fit').value;
    if ($('f-image-hidelabel')) draftPad.hideLabel = $('f-image-hidelabel').checked;
    if (!draftPad.image) {
      delete draftPad.image;
      delete draftPad.imageFit;
    }
    const saved = Deck.normalizePad(draftPad);
    if (saved.type === 'macro') {
      saved.steps = (draftPad.steps || []).map((st) => (
        st.type === 'wait'
          ? { type: 'wait', delayMs: Math.max(0, Number(st.delayMs) || 0) }
          : Deck.normalizePad(st)
      ));
    }
    const page = Deck.cfg.pages.find((d) => d.id === editingPageId) || Deck.getActivePage();
    page.pads[editingIdx] = saved;
    Deck.saveCfg();
    Deck.renderGrid();
    if (Deck.obs.status === 'ok') {
      const syncStep = (st) => {
        if (st.type === 'mute' && st.inputName) Deck.fetchMute(st.inputName).then(Deck.renderGrid);
        if (st.type === 'filter' && st.sourceName) Deck.refreshFilters(st.sourceName).then(Deck.renderGrid);
        if (st.type === 'volume' && st.inputName && Deck.fetchVolume) Deck.fetchVolume(st.inputName).then(Deck.renderGrid);
        if (st.type === 'media' && st.inputName && Deck.fetchMediaState) Deck.fetchMediaState(st.inputName).then(Deck.renderGrid);
        if (st.type === 'monitor' && st.inputName && Deck.fetchMonitorType) Deck.fetchMonitorType(st.inputName).then(Deck.renderGrid);
        if (st.type === 'stats' && Deck.fetchStats) Deck.fetchStats();
      };
      syncStep(saved);
      if (saved.type === 'macro') saved.steps.forEach(syncStep);
    }
  });

  // Edit Selection Bar Events
  $('btn-sel-mode')?.addEventListener('click', () => {
    selectMode = !selectMode;
    updateSelectionUi();
    Deck.setMsg(selectMode ? 'Select mode: click pads to select / deselect' : 'Select mode off');
  });

  $('btn-sel-all')?.addEventListener('click', () => {
    const page = Deck.getActivePage();
    const nonEmpty = page.pads.map((p, idx) => p && p.type !== 'none' ? idx : -1).filter((idx) => idx >= 0);
    if (selectedPads.size === nonEmpty.length && nonEmpty.length > 0) {
      page.pads.forEach((_, idx) => selectedPads.add(idx));
    } else {
      (nonEmpty.length ? nonEmpty : page.pads.map((_, idx) => idx)).forEach((idx) => selectedPads.add(idx));
    }
    updateSelectionUi();
  });

  $('btn-sel-none')?.addEventListener('click', clearSelection);

  $('btn-sel-dup')?.addEventListener('click', () => {
    if (!selectedPads.size) return;
    const newIndices = Deck.duplicatePads(Array.from(selectedPads));
    if (newIndices && newIndices.length) {
      Deck.setMsg(`Duplicated ${newIndices.length} pad(s)`);
      selectedPads = new Set(newIndices);
      updateSelectionUi();
    } else {
      Deck.setMsg('Page is full — could not duplicate');
    }
  });

  $('sel-move-page')?.addEventListener('change', () => {
    const targetPageId = $('sel-move-page').value;
    if (!targetPageId || !selectedPads.size) return;
    const targetPage = Deck.cfg.pages.find((p) => p.id === targetPageId);
    const moved = Deck.movePadsToPage(Array.from(selectedPads), targetPageId);
    clearSelection();
    Deck.setMsg(`Moved ${moved.length} pad(s) to ${targetPage ? targetPage.name : 'target page'}`);
    $('sel-move-page').value = '';
  });

  const selPop = $('sel-color-pop');
  if (selPop) {
    COLORS.forEach((c) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'sw';
      b.style.background = c;
      b.title = c;
      b.addEventListener('click', () => {
        if (!selectedPads.size) return;
        Deck.setPadColors(Array.from(selectedPads), c);
        selPop.hidden = true;
        Deck.setMsg(`Recolored ${selectedPads.size} pad(s)`);
        updateSelectionUi();
      });
      selPop.appendChild(b);
    });
  }
  $('btn-sel-color')?.addEventListener('click', () => {
    if (selPop) selPop.hidden = !selPop.hidden;
  });

  $('btn-sel-clear')?.addEventListener('click', () => {
    if (!selectedPads.size) return;
    const count = selectedPads.size;
    Deck.clearPads(Array.from(selectedPads));
    clearSelection();
    Deck.setMsg(`Cleared ${count} pad(s)`);
  });

  // Page & Grid Settings Dialog
  $('btn-deck-add').addEventListener('click', () => {
    clearSelection();
    const created = Deck.addPage({ switchTo: true });
    Deck.setMsg(`Added Page "${created.name}" (${created.cols}×${created.rows})`);
  });
  $('btn-deck-dup').addEventListener('click', () => {
    clearSelection();
    const cur = Deck.getActivePage();
    const copy = Deck.duplicatePage(cur.id);
    if (copy) Deck.setMsg(`Duplicated "${cur.name}" -> "${copy.name}"`);
  });
  $('btn-deck-cfg').addEventListener('click', openPageDialog);
  $('deck-dlg-close').addEventListener('click', () => $('deck-dlg').close());
  $('btn-deck-cancel').addEventListener('click', () => $('deck-dlg').close());
  $('d-cols').addEventListener('input', syncPagePresetHighlight);
  $('d-rows').addEventListener('input', syncPagePresetHighlight);
  $('d-presets').querySelectorAll('button').forEach((b) => {
    b.addEventListener('click', () => {
      $('d-cols').value = b.dataset.cols;
      $('d-rows').value = b.dataset.rows;
      syncPagePresetHighlight();
    });
  });
  $('btn-deck-dup-dlg').addEventListener('click', () => {
    const cur = Deck.getActivePage();
    $('deck-dlg').close();
    const copy = Deck.duplicatePage(cur.id);
    if (copy) Deck.setMsg(`Duplicated "${cur.name}" -> "${copy.name}"`);
  });
  $('btn-deck-del').addEventListener('click', () => {
    if (Deck.cfg.pages.length <= 1) return;
    const cur = Deck.getActivePage();
    if (!confirm(`Delete Page "${cur.name}" and its pads?`)) return;
    $('deck-dlg').close();
    Deck.deletePage(cur.id);
    Deck.setMsg(`Deleted Page "${cur.name}"`);
  });
  $('deck-form').addEventListener('submit', () => {
    const cur = Deck.getActivePage();
    const name = $('d-name').value.trim() || cur.name;
    const cols = Number($('d-cols').value) || cur.cols;
    const rows = Number($('d-rows').value) || cur.rows;
    Deck.renamePage(cur.id, name);
    Deck.resizePage(cur.id, cols, rows);
    const updated = Deck.getActivePage();
    Deck.setMsg(`Page "${updated.name}" (${updated.cols}×${updated.rows})`);
  });

  // Auto-Import Wizard Dialog
  $('btn-auto-import').addEventListener('click', openAutoImportWizard);
  $('import-wiz-close').addEventListener('click', () => $('import-wiz-dlg').close());
  $('btn-wiz-cancel').addEventListener('click', () => $('import-wiz-dlg').close());
  ['wiz-scenes', 'wiz-sources', 'wiz-filters', 'wiz-broadcast'].forEach((id) => {
    $(id).addEventListener('change', syncAutoImportState);
  });
  $('import-wiz-form').addEventListener('submit', () => {
    const pages = Deck.buildAutoImportPages({
      scenes: $('wiz-scenes').checked,
      sources: $('wiz-sources').checked,
      filters: $('wiz-filters').checked,
      broadcast: $('wiz-broadcast').checked,
    });
    if (!pages.length) {
      Deck.setMsg('No items found in OBS for selected categories');
      return;
    }
    Deck.applyAutoImport(pages, { replaceEmptyStarter: $('wiz-replace').checked });
  });

  // PANIC Dialog
  $('btn-panic-cfg').addEventListener('click', openPanicDialog);
  $('panic-close').addEventListener('click', () => $('panic-dlg').close());
  $('btn-panic-add').addEventListener('click', () => {
    draftPanic.push({ type: 'filter', mode: 'disable' });
    renderStepList($('panic-steps'), draftPanic, false);
  });
  $('btn-panic-pull').addEventListener('click', () => {
    const pullFrom = (st) => {
      if (st.type === 'filter' && st.sourceName && st.filterName
        && !draftPanic.some((s) => s.type === 'filter' && s.sourceName === st.sourceName && s.filterName === st.filterName)) {
        draftPanic.push({ type: 'filter', sourceName: st.sourceName, filterName: st.filterName, mode: 'disable' });
      }
    };
    for (const d of Deck.cfg.pages) {
      for (const p of d.pads) {
        pullFrom(p);
        (p.steps || []).forEach(pullFrom);
      }
    }
    renderStepList($('panic-steps'), draftPanic, false);
  });
  $('btn-panic-save').addEventListener('click', () => {
    Deck.cfg.panicSteps = draftPanic.map(Deck.normalizePad).filter((s) => s.type !== 'none');
    Deck.saveCfg();
    $('panic-dlg').close();
    Deck.setMsg(`Saved ${Deck.cfg.panicSteps.length} PANIC step(s)`);
  });

  // Toolbar & WS
  $('btn-conn-toggle').addEventListener('click', () => $('conn-bar').classList.toggle('open'));
  $('btn-ws-connect').addEventListener('click', () => Deck.connectObs({ manual: true }));
  $('btn-ws-disconnect').addEventListener('click', () => Deck.disconnectObs(true));
  $('btn-sync').addEventListener('click', async () => {
    await Deck.syncObsState();
    renderPalette();
  });
  $('btn-edit').addEventListener('click', () => {
    Deck.editMode = !Deck.editMode;
    $('btn-edit').classList.toggle('on', Deck.editMode);
    document.body.classList.toggle('edit-mode', Deck.editMode);
    if (!Deck.editMode) {
      clearSelection();
      const pal = $('palette');
      if (pal) pal.classList.remove('open');
    }
    Deck.setMsg(Deck.editMode ? 'Edit mode: drag commands from palette, click pad to configure' : 'Run mode');
    Deck.renderGrid();
  });
  $('btn-panic').addEventListener('click', Deck.runPanic);

  $('btn-export').addEventListener('click', () => {
    const out = Deck.exportConfig();
    const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'obs-virtual-deck.json';
    a.click();
    URL.revokeObjectURL(a.href);
    Deck.setMsg('Exported obs-virtual-deck.json');
  });
  $('btn-import').addEventListener('click', () => $('file-import').click());
  $('file-import').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const d = JSON.parse(await file.text());
      clearSelection();
      Deck.cfg = Deck.migrateConfig(d);
      $('ws-host').value = Deck.cfg.ws.host;
      $('ws-port').value = Deck.cfg.ws.port;
      Deck.saveCfg();
      Deck.renderGrid();
      if (Deck.obs.status === 'ok') await Deck.syncObsState();
      Deck.setMsg(`Imported ${file.name}`);
    } catch (err) {
      Deck.setMsg(`Import error: ${err.message}`);
    }
  });
  $('btn-reset-layout').addEventListener('click', () => {
    if (!confirm('Reset all Pages, pads, and PANIC steps to starter defaults?')) return;
    clearSelection();
    for (const p of Deck.cfg.pages) {
      if (typeof Deck.abortPageTimers === 'function') Deck.abortPageTimers(p.id);
    }
    Deck.cfg.pages = Deck.defaultPages();
    Deck.cfg.activePageId = Deck.cfg.pages[0].id;
    Deck.cfg.panicSteps = [];
    Deck.saveCfg();
    Deck.renderGrid();
    Deck.setMsg('Deck reset to starter defaults');
  });

  // Boot
  initFontScaler();
  initTheme();
  initPaletteResizer();
  if ($('version-badge') && Deck.VERSION) $('version-badge').textContent = `v${Deck.VERSION}`;
  $('ws-host').value = Deck.cfg.ws.host;
  $('ws-port').value = Deck.cfg.ws.port;
  $('ws-pass').value = Deck.cfg.ws.password;
  renderPalette();
  Deck.renderGrid();
  Deck.connectObs({ isBoot: true });
})();
