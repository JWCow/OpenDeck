(() => {
  'use strict';

  const Deck = window.Deck;
  const { $, esc } = Deck;

  const DEFAULT_PALETTE_W = 320;
  const MIN_PALETTE_W = 260;
  const MAX_PALETTE_W = 550;

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

  function createPaletteItemEl(it) {
    const el = document.createElement('div');
    el.className = 'palette-item';
    el.draggable = true;
    el.title = it.label || '';
    el.innerHTML = `<span class="pal-ico">${esc(it.icon || '⚡')}</span>`
      + `<span class="pal-lbl">${esc(it.label)}</span>`
      + `<span class="pal-tag">${esc(it.tag || 'ACT')}</span>`;

    el.addEventListener('dragstart', (e) => {
      Deck.setDragState({ paletteDragItem: it.action });
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'copy';
        e.dataTransfer.setData('application/json', JSON.stringify({ source: 'palette', action: it.action }));
        e.dataTransfer.setData('text/plain', `palette:${it.action.type}`);
      }
    });
    el.addEventListener('dragend', () => {
      Deck.setDragState({ paletteDragItem: null });
      Deck.clearDragHighlights();
    });
    return el;
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

  Deck.isSelfContained = isSelfContained;
  Deck.initPaletteResizer = initPaletteResizer;
  Deck.renderPalette = renderPalette;
})();
