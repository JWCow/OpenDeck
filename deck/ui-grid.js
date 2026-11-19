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
      let holdTimer = null;
      let holdTriggered = false;

      el.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        if (Deck.editMode) return;
        holdTriggered = false;
        const page = Deck.getActivePage();
        const p = page?.pads[i];
        if (!p || !Deck.isOutputStopAction || !Deck.isOutputStopAction(p)) return;

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
          if (Deck.handleSelectionClick(i, e)) return;
          Deck.openPadEditor(i);
          return;
        }
        Deck.onPadClick(i);
      });
      el.addEventListener('contextmenu', (e) => { e.preventDefault(); Deck.openPadEditor(i); });
      el.addEventListener('dragstart', (e) => {
        if (!Deck.editMode) { e.preventDefault(); return; }
        Deck.setDragState({ dragIdx: i, dragSourcePageId: Deck.getActivePage().id });
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
          Deck.setDragState({ paletteDragItem: null, justDroppedAt: Date.now() });
          if (typeof Deck.abortPadTimer === 'function') {
            Deck.abortPadTimer(activePage.id, i);
          }
          if (Deck.isSelfContained(paletteData)) {
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
        Deck.setDragState({ dragIdx: null, dragSourcePageId: '', justDroppedAt: Date.now() });
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
    const isArmed = Boolean(Deck.isPadArmed && Deck.isPadArmed(i, page.id));
    const isFullFace = Boolean(p.image && p.imageFit === 'fill');
    const isDragOver = el.classList.contains('drag-over');
    const isDraggingEl = el.classList.contains('dragging');
    const selectedPads = Deck.getSelectedPads();
    el.className = 'pad'
      + (p.type === 'none' ? ' empty' : '')
      + (p.type === 'stats' ? ' stats-pad' : '')
      + (Deck.editMode ? ' edit-mode' : '')
      + (selectedPads.has(i) ? ' selected' : '')
      + (active ? ' active' : '')
      + (isRunning ? ' running' : '')
      + (isArmed ? ' armed' : '')
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

  Deck.TAGS = TAGS;
  Deck.padFallbackLabel = padFallbackLabel;
  Deck.initGrid = initGrid;
  Deck.renderPad = renderPad;
  Deck.renderGrid = () => {
    const page = Deck.getActivePage();
    Deck.renderPageBar();
    initGrid(page);
    const btns = $('grid').children;
    page.pads.forEach((p, i) => {
      renderPad(p, i, btns[i], page);
    });
    Deck.updateSelectionUi();
  };
})();
