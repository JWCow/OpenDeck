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
    studio: 'STD',
    output: 'OUT',
    media: 'MED',
    browser: 'WEB',
    screenshot: 'CAP',
    profile: 'PRF',
    collection: 'COL',
    transition: 'TRN',
    page: 'PAG',
    macro: 'MCR',
    panic: 'PNC',
  };

  const ICON_PRESETS = ['🎬', '🎥', '🎙️', '🔇', '🔊', '✨', '📺', '🔴', '📸', '🎵', '🌐', '⚡', '🚨'];
  const OUTPUT_LABELS = {
    stream: 'Stream',
    record: 'Record',
    recordPause: 'Rec Pause',
    vcam: 'Virtual Cam',
    replay: 'Replay',
    saveReplay: 'Save Replay',
  };

  let dragIdx = null;
  let editingIdx = -1;
  let editingDeckId = '';
  let draftPad = null;
  let draftPanic = [];
  let isRecordingHotkey = false;

  function padFallbackLabel(p, i, cols = 8) {
    if (p.type === 'scene') return p.sceneName || 'Scene';
    if (p.type === 'source') return p.sourceName || p.sceneName || 'Source';
    if (p.type === 'filter') return p.filterName || p.sourceName || 'Filter';
    if (p.type === 'mute') return p.inputName || 'Mute';
    if (p.type === 'volume') {
      const db = p.volumeDb ?? (p.mode === 'step' ? -3 : 0);
      const val = p.mode === 'step' && db > 0 ? `+${db}` : `${db}`;
      return p.inputName ? `${p.inputName} ${val}dB` : `Vol ${val}dB`;
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
      const target = Deck.cfg.decks.find((d) => d.id === p.deckId);
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
    for (const t of Deck.getActiveDeckTicks()) {
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

  function renderDeckBar() {
    const tabs = $('deck-tabs');
    if (!tabs) return;
    const active = Deck.getActiveDeck();
    tabs.innerHTML = '';
    for (const d of Deck.cfg.decks) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'deck-tab' + (d.id === active.id ? ' on' : '');
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(d.id === active.id));
      b.dataset.deckId = d.id;
      b.textContent = d.name || 'Page';
      b.title = `${d.name} (${d.cols}×${d.rows})`;
      b.addEventListener('click', () => Deck.setActiveDeck(d.id));
      tabs.appendChild(b);
    }
    const cfgBtn = $('btn-deck-cfg');
    if (cfgBtn) cfgBtn.textContent = `${active.cols}×${active.rows} ⚙`;
  }

  function initGrid(deck) {
    const grid = $('grid');
    const total = deck.cols * deck.rows;
    grid.style.setProperty('--cols', deck.cols);
    grid.style.setProperty('--rows', deck.rows);
    grid.setAttribute('aria-label', `${deck.cols} by ${deck.rows} OBS Deck`);
    if (grid.children.length === total) return;
    grid.innerHTML = '';
    for (let i = 0; i < total; i++) {
      const el = document.createElement('button');
      el.type = 'button';
      el.dataset.idx = i;
      el.addEventListener('click', () => Deck.onPadClick(i));
      el.addEventListener('contextmenu', (e) => { e.preventDefault(); Deck.openPadEditor(i); });
      el.addEventListener('dragstart', () => { dragIdx = i; });
      el.addEventListener('dragend', () => { dragIdx = null; });
      el.addEventListener('dragover', (e) => { if (Deck.editMode) e.preventDefault(); });
      el.addEventListener('drop', (e) => {
        e.preventDefault();
        const pads = Deck.getActivePads();
        if (!Deck.editMode || dragIdx === null || dragIdx === i || dragIdx >= pads.length || i >= pads.length) return;
        [pads[dragIdx], pads[i]] = [pads[i], pads[dragIdx]];
        dragIdx = null;
        Deck.saveCfg();
        Deck.renderGrid();
      });
      grid.appendChild(el);
    }
  }

  Deck.renderGrid = () => {
    const deck = Deck.getActiveDeck();
    renderDeckBar();
    initGrid(deck);
    const btns = $('grid').children;
    deck.pads.forEach((p, i) => {
      const el = btns[i];
      if (!el) return;
      const rt = Deck.getPadRuntime(i, deck.id);
      const active = Deck.isPadActive(p);
      el.className = 'pad'
        + (p.type === 'none' ? ' empty' : '')
        + (Deck.editMode ? ' edit-mode' : '')
        + (active ? ' active' : '')
        + (rt.running ? ' running' : '');
      el.style.background = p.color && p.type !== 'none' ? p.color : '';
      el.draggable = Deck.editMode;
      const rem = tickText(rt);
      const lbl = p.label || padFallbackLabel(p, i, deck.cols);
      const tipParts = [lbl || `Pad ${i + 1}`];
      if (TAGS[p.type]) tipParts.push(`[${TAGS[p.type]}]`);
      if (p.hotkey) tipParts.push(`(${p.hotkey})`);
      el.title = tipParts.join(' ');
      el.innerHTML = `<i class="led"></i>${TAGS[p.type] ? `<span class="tag">${TAGS[p.type]}</span>` : ''}`
        + `${p.icon ? `<span class="ico">${esc(p.icon)}</span>` : ''}`
        + `<span class="lbl">${esc(lbl)}</span>`
        + `${rem ? `<span class="sub">${esc(rem)}</span>` : ''}`
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
      container.appendChild(makeObsSelect('Scene Name', obj.sceneName, obs.scenes, (v) => { obj.sceneName = v; }, 'Select scene…').el);
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
      if (obj.mode === 'goto' && !obj.deckId) obj.deckId = Deck.cfg.decks[0]?.id || '';
      const deckOpts = Deck.cfg.decks.map((d) => [d.id, d.name]);
      const deckRow = makeSelect('Target Page', obj.deckId, deckOpts, (v) => { obj.deckId = v; });
      const syncVis = () => { deckRow.hidden = (obj.mode || 'goto') !== 'goto'; };
      container.append(
        makeSelect('Navigation', obj.mode, [
          ['goto', 'Go to Page'], ['next', 'Next Page'], ['prev', 'Previous Page'],
        ], (v) => { obj.mode = v; syncVis(); }),
        deckRow
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
        ['filter', 'Filter'],
        ['mute', 'Mute'],
        ['studio', 'Studio Mode'],
        ['output', 'Stream / Record / Cam'],
        ['media', 'Media'],
        ['screenshot', 'Screenshot'],
        ['browser', 'Browser Source'],
        ['volume', 'Volume'],
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

  Deck.openPadEditor = (idx, deckId) => {
    const deck = deckId ? (Deck.cfg.decks.find((d) => d.id === deckId) || Deck.getActiveDeck()) : Deck.getActiveDeck();
    if (!deck.pads[idx]) return;
    editingIdx = idx;
    editingDeckId = deck.id;
    isRecordingHotkey = false;
    draftPad = JSON.parse(JSON.stringify(deck.pads[idx]));
    if (!draftPad.steps) draftPad.steps = [];
    const cols = deck.cols || 8;
    $('dlg-title').textContent = `Edit Pad R${Math.floor(idx / cols) + 1}C${(idx % cols) + 1} (${deck.name})`;
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

  function openDeckDialog() {
    const deck = Deck.getActiveDeck();
    $('d-name').value = deck.name || 'Main';
    $('d-cols').value = deck.cols;
    $('d-rows').value = deck.rows;
    $('btn-deck-del').disabled = Deck.cfg.decks.length <= 1;
    syncDeckPresetHighlight();
    $('deck-dlg').showModal();
  }

  function syncDeckPresetHighlight() {
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
    const deck = Deck.cfg.decks.find((d) => d.id === editingDeckId) || Deck.getActiveDeck();
    if (deck.pads[editingIdx]) deck.pads[editingIdx] = { type: 'none', label: '', icon: '', color: COLORS[0] };
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
    const deck = Deck.cfg.decks.find((d) => d.id === editingDeckId) || Deck.getActiveDeck();
    deck.pads[editingIdx] = saved;
    Deck.saveCfg();
    Deck.renderGrid();
    if (Deck.obs.status === 'ok') {
      const syncStep = (st) => {
        if (st.type === 'mute' && st.inputName) Deck.fetchMute(st.inputName).then(Deck.renderGrid);
        if (st.type === 'filter' && st.sourceName) Deck.refreshFilters(st.sourceName).then(Deck.renderGrid);
        if (st.type === 'volume' && st.inputName && Deck.fetchVolume) Deck.fetchVolume(st.inputName).then(Deck.renderGrid);
        if (st.type === 'media' && st.inputName && Deck.fetchMediaState) Deck.fetchMediaState(st.inputName).then(Deck.renderGrid);
      };
      syncStep(saved);
      if (saved.type === 'macro') saved.steps.forEach(syncStep);
    }
  });

  // Page & Grid Settings Dialog
  $('btn-deck-add').addEventListener('click', () => {
    const created = Deck.addDeck({ switchTo: true });
    Deck.setMsg(`Added page "${created.name}" (${created.cols}×${created.rows})`);
  });
  $('btn-deck-dup').addEventListener('click', () => {
    const cur = Deck.getActiveDeck();
    const copy = Deck.duplicateDeck(cur.id);
    if (copy) Deck.setMsg(`Duplicated "${cur.name}" -> "${copy.name}"`);
  });
  $('btn-deck-cfg').addEventListener('click', openDeckDialog);
  $('deck-dlg-close').addEventListener('click', () => $('deck-dlg').close());
  $('btn-deck-cancel').addEventListener('click', () => $('deck-dlg').close());
  $('d-cols').addEventListener('input', syncDeckPresetHighlight);
  $('d-rows').addEventListener('input', syncDeckPresetHighlight);
  $('d-presets').querySelectorAll('button').forEach((b) => {
    b.addEventListener('click', () => {
      $('d-cols').value = b.dataset.cols;
      $('d-rows').value = b.dataset.rows;
      syncDeckPresetHighlight();
    });
  });
  $('btn-deck-dup-dlg').addEventListener('click', () => {
    const cur = Deck.getActiveDeck();
    $('deck-dlg').close();
    const copy = Deck.duplicateDeck(cur.id);
    if (copy) Deck.setMsg(`Duplicated "${cur.name}" -> "${copy.name}"`);
  });
  $('btn-deck-del').addEventListener('click', () => {
    if (Deck.cfg.decks.length <= 1) return;
    const cur = Deck.getActiveDeck();
    if (!confirm(`Delete page "${cur.name}" and its pads?`)) return;
    $('deck-dlg').close();
    Deck.deleteDeck(cur.id);
    Deck.setMsg(`Deleted page "${cur.name}"`);
  });
  $('deck-form').addEventListener('submit', () => {
    const cur = Deck.getActiveDeck();
    const name = $('d-name').value.trim() || cur.name;
    const cols = Number($('d-cols').value) || cur.cols;
    const rows = Number($('d-rows').value) || cur.rows;
    Deck.renameDeck(cur.id, name);
    Deck.resizeDeck(cur.id, cols, rows);
    const updated = Deck.getActiveDeck();
    Deck.setMsg(`Page "${updated.name}" (${updated.cols}×${updated.rows})`);
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
    for (const d of Deck.cfg.decks) {
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
  $('btn-ws-connect').addEventListener('click', Deck.connectObs);
  $('btn-ws-disconnect').addEventListener('click', () => Deck.disconnectObs(true));
  $('btn-sync').addEventListener('click', Deck.syncObsState);
  $('btn-edit').addEventListener('click', () => {
    Deck.editMode = !Deck.editMode;
    $('btn-edit').classList.toggle('on', Deck.editMode);
    Deck.setMsg(Deck.editMode ? 'Edit mode: click pad to configure, drag to swap' : 'Run mode');
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
    if (!confirm('Reset all pages, pads, and PANIC steps to starter defaults?')) return;
    Deck.cfg.decks = [{ id: 'deck-1', name: 'Main', cols: 8, rows: 8, pads: Deck.defaultPads(8, 8, true) }];
    Deck.cfg.activeDeckId = 'deck-1';
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
  Deck.connectObs();
})();
