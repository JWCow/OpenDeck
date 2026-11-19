(() => {
  'use strict';

  const Deck = window.Deck;
  const { $, COLORS } = Deck;

  const ICON_PRESETS = [
    '🎬', '🎥', '🎙️', '🔇', '🔊', '🎧', '✨', '📺', '🔴', '📸',
    '🎵', '🖼️', '🌐', '📐', '🔖', '📊', '⌨️', '⚡', '🚨',
  ];

  let editingIdx = -1;
  let editingPageId = '';
  let draftPad = null;
  let labelTouched = false;
  let prevTargetName = '';

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
      btn.addEventListener('click', () => Deck.openPanicDialog());
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

  Deck.renderActionFields = renderActionFields;
  Deck.renderStepList = renderStepList;
})();
