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

  let dragIdx = null;
  let dragSourcePageId = '';
  let justDroppedAt = 0;
  let editingIdx = -1;
  let editingPageId = '';
  let draftPad = null;
  let draftPanic = [];
  let isRecordingHotkey = false;
  let promptedAutoImportThisSession = false;

  function clearDragHighlights() {
    document.querySelectorAll('.pad.drag-over, .pad.dragging, .page-tab.drag-over').forEach((el) => {
      el.classList.remove('drag-over', 'dragging');
    });
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
    for (const t of Deck.getActivePageTicks()) {
      const btn = grid.querySelector(`.pad[data-idx="${t.idx}"]`);
      if (!btn) continue;
      let sub = btn.querySelector('.sub');
      const txt = tickText({ running: true, endsAt: t.endsAt });
      if (!sub && txt) {
        sub = document.createElement('span');
        sub.className = 'sub';
        btn.appendChild(sub);
      }
      if (sub) sub.textContent = txt;
    }
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
      b.addEventListener('click', () => Deck.setActivePage(d.id));
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
      el.addEventListener('click', () => {
        if (Date.now() - justDroppedAt < 250) return;
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
        if (!Deck.editMode || dragIdx === null || dragIdx === i) return;
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
        el.classList.add('drag-over');
      });
      el.addEventListener('dragleave', (e) => {
        if (!el.contains(e.relatedTarget)) el.classList.remove('drag-over');
      });
      el.addEventListener('drop', (e) => {
        e.preventDefault();
        clearDragHighlights();
        const activePage = Deck.getActivePage();
        const pads = activePage.pads;
        if (!Deck.editMode || dragIdx === null || dragIdx === i || dragIdx >= pads.length || i >= pads.length) return;
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

  Deck.renderGrid = () => {
    const page = Deck.getActivePage();
    renderPageBar();
    initGrid(page);
    const btns = $('grid').children;
    page.pads.forEach((p, i) => {
      const el = btns[i];
      if (!el) return;
      const rt = Deck.getPadRuntime(i, page.id);
      const active = Deck.isPadActive(p);
      el.className = 'pad'
        + (p.type === 'none' ? ' empty' : '')
        + (p.type === 'stats' ? ' stats-pad' : '')
        + (Deck.editMode ? ' edit-mode' : '')
        + (active ? ' active' : '')
        + (rt.running ? ' running' : '');
      el.style.background = p.color && p.type !== 'none' ? p.color : '';
      el.draggable = Deck.editMode && p.type !== 'none';
      const subText = p.type === 'stats' ? Deck.formatStatsText(p.mode || 'all') : tickText(rt);
      const lbl = p.label || padFallbackLabel(p, i, page.cols);
      const tipParts = [lbl || `Pad ${i + 1}`];
      if (p.type === 'stats' && subText) tipParts.push(`(${subText})`);
      if (TAGS[p.type]) tipParts.push(`[${TAGS[p.type]}]`);
      if (p.hotkey) tipParts.push(`(${p.hotkey})`);
      el.title = tipParts.join(' ');
      el.innerHTML = `<i class="led"></i>${TAGS[p.type] ? `<span class="tag">${TAGS[p.type]}</span>` : ''}`
        + `${p.icon ? `<span class="ico">${esc(p.icon)}</span>` : ''}`
        + `<span class="lbl">${esc(lbl)}</span>`
        + `${subText ? `<span class="sub">${esc(subText)}</span>` : ''}`
        + `${p.hotkey ? `<span class="hk">${esc(p.hotkey)}</span>` : ''}`;
    });
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
      if (!obj.mode) obj.mode = 'named';
      const sceneRow = makeObsSelect('Scene Name', obj.sceneName, obs.scenes, (v) => { obj.sceneName = v; }, 'Select scene…').el;
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
        (v) => { obj.sourceName = v; },
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
        (v) => { obj.sourceName = v; },
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
        (v) => { obj.filterName = v; },
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
        makeObsSelect('Input Name', obj.inputName, obs.inputs, (v) => { obj.inputName = v; }, 'Select audio input…').el,
        makeSelect('Mode', obj.mode || 'toggle', [
          ['toggle', 'Toggle'], ['mute', 'Mute'], ['unmute', 'Unmute'],
        ], (v) => { obj.mode = v; })
      );
      if (!allowWait) container.appendChild(makeAutoOffField(obj));
    } else if (t === 'monitor') {
      if (!obj.monitorType) obj.monitorType = 'cycle';
      container.append(
        makeObsSelect('Audio Input', obj.inputName, obs.inputs, (v) => { obj.inputName = v; }, 'Select audio input…').el,
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
        makeObsSelect('OBS Hotkey', obj.hotkeyName, obs.hotkeys || [], (v) => { obj.hotkeyName = v; }, 'Select OBS hotkey…').el
      );
    } else if (t === 'media') {
      const mediaOpts = obs.mediaInputs?.length ? obs.mediaInputs : obs.inputs;
      container.append(
        makeObsSelect('Media Input', obj.inputName, mediaOpts, (v) => { obj.inputName = v; }, 'Select media source…').el,
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
        makeObsSelect('Image / Slideshow Input', obj.inputName, imageOpts, (v) => { obj.inputName = v; }, 'Select image or slideshow…').el,
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
        makeObsSelect('Source / Scene (blank = Program)', obj.sourceName, allFilterSources(), (v) => { obj.sourceName = v; }, 'Current Program Scene').el,
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
        makeObsSelect('Browser Source', obj.inputName, browserOpts, (v) => { obj.inputName = v; }, 'Select browser source…').el,
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
        makeObsSelect('Audio Input', obj.inputName, obs.inputs, (v) => { obj.inputName = v; }, 'Select input…').el,
        makeSelect('Mode', obj.mode, [
          ['set', 'Set Volume (dB)'], ['step', 'Step Volume (+/- dB)'],
        ], (v) => { obj.mode = v; }),
        dbRow
      );
    } else if (t === 'profile') {
      container.appendChild(makeObsSelect('OBS Profile', obj.profileName, obs.profiles || [], (v) => { obj.profileName = v; }, 'Select profile…').el);
    } else if (t === 'collection') {
      container.appendChild(makeObsSelect('Scene Collection', obj.collectionName, obs.collections || [], (v) => { obj.collectionName = v; }, 'Select collection…').el);
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
        makeObsSelect('Transition', obj.transitionName, obs.transitions || [], (v) => { obj.transitionName = v; }, 'Select transition…').el,
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
        st.type = sel.value;
        if (st.type === 'wait' && st.delayMs == null) st.delayMs = 2000;
        renderActionFields(body, st, allowWait);
      });
      renderActionFields(body, st, allowWait);
      box.append(top, body);
      container.appendChild(box);
    });
  }

  function updateHotkeyUi() {
    const btn = $('f-hotkey-btn');
    if (!btn) return;
    btn.classList.toggle('on', isRecordingHotkey);
    if (isRecordingHotkey) btn.textContent = 'Press any key… (Esc to cancel)';
    else btn.textContent = draftPad?.hotkey || 'None (click to record)';
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

  Deck.openPadEditor = (idx, pageId) => {
    const page = pageId ? (Deck.cfg.pages.find((d) => d.id === pageId) || Deck.getActivePage()) : Deck.getActivePage();
    if (!page.pads[idx]) return;
    editingIdx = idx;
    editingPageId = page.id;
    isRecordingHotkey = false;
    draftPad = JSON.parse(JSON.stringify(page.pads[idx]));
    if (!draftPad.steps) draftPad.steps = [];
    const cols = page.cols || 8;
    $('dlg-title').textContent = `Edit Pad R${Math.floor(idx / cols) + 1}C${(idx % cols) + 1} (${page.name})`;
    $('f-label').value = draftPad.label || '';
    $('f-icon').value = draftPad.icon || '';
    $('f-type').value = draftPad.type || 'none';
    updateHotkeyUi();

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
    if (promptedAutoImportThisSession) return;
    if (!Deck.isStarterDeck()) return;
    if (document.querySelector('dialog[open]')) return;
    if (!Deck.obs.scenes.length && !Deck.obs.inputs.length) return;
    promptedAutoImportThisSession = true;
    openAutoImportWizard();
  };

  $('f-type').addEventListener('change', drawPadFields);
  $('dlg-close').addEventListener('click', () => $('pad-dlg').close());
  $('btn-pad-cancel').addEventListener('click', () => $('pad-dlg').close());
  $('pad-dlg').addEventListener('close', () => { isRecordingHotkey = false; updateHotkeyUi(); });

  $('f-hotkey-btn').addEventListener('click', () => {
    isRecordingHotkey = !isRecordingHotkey;
    updateHotkeyUi();
  });
  $('btn-hotkey-clear').addEventListener('click', () => {
    isRecordingHotkey = false;
    if (draftPad) draftPad.hotkey = '';
    updateHotkeyUi();
  });

  $('btn-pad-clear').addEventListener('click', () => {
    const page = Deck.cfg.pages.find((d) => d.id === editingPageId) || Deck.getActivePage();
    if (page.pads[editingIdx]) page.pads[editingIdx] = { type: 'none', label: '', icon: '', color: COLORS[0] };
    Deck.saveCfg();
    $('pad-dlg').close();
    Deck.renderGrid();
  });

  $('pad-form').addEventListener('submit', () => {
    isRecordingHotkey = false;
    draftPad.label = $('f-label').value.trim();
    draftPad.icon = $('f-icon').value.trim();
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

  // Page & Grid Settings Dialog
  $('btn-deck-add').addEventListener('click', () => {
    const created = Deck.addPage({ switchTo: true });
    Deck.setMsg(`Added Page "${created.name}" (${created.cols}×${created.rows})`);
  });
  $('btn-deck-dup').addEventListener('click', () => {
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
  $('btn-sync').addEventListener('click', Deck.syncObsState);
  $('btn-edit').addEventListener('click', () => {
    Deck.editMode = !Deck.editMode;
    $('btn-edit').classList.toggle('on', Deck.editMode);
    Deck.setMsg(Deck.editMode ? 'Edit mode: click pad to configure, drag to swap or move to Page tab' : 'Run mode');
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

  // Global Keyboard Shortcuts & Hotkey Recorder
  document.addEventListener('keydown', (e) => {
    if (isRecordingHotkey) {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') {
        isRecordingHotkey = false;
        updateHotkeyUi();
        return;
      }
      const hk = Deck.hotkeyFromEvent(e);
      if (!hk) return;
      isRecordingHotkey = false;
      if (draftPad) draftPad.hotkey = hk;
      updateHotkeyUi();
      return;
    }
    if (Deck.handleKeyDown(e)) e.preventDefault();
  }, true);

  // Boot
  if ($('version-badge') && Deck.VERSION) $('version-badge').textContent = `v${Deck.VERSION}`;
  $('ws-host').value = Deck.cfg.ws.host;
  $('ws-port').value = Deck.cfg.ws.port;
  $('ws-pass').value = Deck.cfg.ws.password;
  Deck.renderGrid();
  Deck.connectObs({ isBoot: true });
})();
