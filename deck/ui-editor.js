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

  function makeHoldField(obj, onChange) {
    const wrap = document.createElement('div');
    wrap.className = 'row';
    wrap.id = 'f-hold-row';
    const lbl = document.createElement('label');
    lbl.className = 'chk-label';
    const inp = document.createElement('input');
    inp.id = 'f-hold';
    inp.type = 'checkbox';
    inp.checked = Boolean(obj.hold);
    inp.addEventListener('change', () => {
      if (inp.checked) {
        obj.hold = true;
        delete obj.autoOffMs;
      } else {
        delete obj.hold;
      }
      if (onChange) onChange();
    });
    lbl.append(inp, document.createTextNode(' Hold (momentary / push to talk)'));
    wrap.appendChild(lbl);
    return wrap;
  }

  function makeMeterField(obj, onChange) {
    const wrap = document.createElement('div');
    wrap.className = 'row';
    const lbl = document.createElement('label');
    lbl.className = 'chk-label';
    const inp = document.createElement('input');
    inp.type = 'checkbox';
    inp.checked = Boolean(obj.showMeter);
    inp.addEventListener('change', () => {
      if (inp.checked) obj.showMeter = true;
      else delete obj.showMeter;
      if (onChange) onChange();
    });
    lbl.append(inp, document.createTextNode(' Show live audio peak meter'));
    wrap.appendChild(lbl);
    return wrap;
  }

  function makeAutoOffField(obj, onChange) {
    const wrap = document.createElement('div');
    wrap.className = 'row';
    wrap.id = 'f-auto-off-row';
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
      if (ms > 0) {
        obj.autoOffMs = ms;
        delete obj.hold;
      } else {
        delete obj.autoOffMs;
      }
      inp.value = ms > 0 ? String(ms / 1000) : '0';
      if (onChange) onChange();
    };

    inp.addEventListener('input', () => {
      const n = Number(inp.value);
      if (Number.isFinite(n) && n > 0) {
        obj.autoOffMs = Math.round(n * 1000);
        delete obj.hold;
      } else {
        delete obj.autoOffMs;
      }
      if (onChange) onChange();
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

  function attachHoldAndAutoOff(container, obj) {
    let holdRow, autoOffRow;
    const sync = () => {
      if (obj.hold) {
        holdRow.hidden = false;
        autoOffRow.hidden = true;
        const inp = autoOffRow.querySelector('#f-auto-off');
        if (inp) inp.value = '0';
      } else if (obj.autoOffMs > 0) {
        holdRow.hidden = true;
        autoOffRow.hidden = false;
        const chk = holdRow.querySelector('#f-hold');
        if (chk) chk.checked = false;
      } else {
        holdRow.hidden = false;
        autoOffRow.hidden = false;
        const chk = holdRow.querySelector('#f-hold');
        if (chk) chk.checked = false;
      }
    };
    holdRow = makeHoldField(obj, sync);
    autoOffRow = makeAutoOffField(obj, sync);
    container.append(holdRow, autoOffRow);
    sync();
  }

  function renderActionFields(container, obj, allowWait) {
    const { obs } = Deck;
    [...container.children].forEach((ch) => {
      if (!ch.classList.contains('step-type-row')) ch.remove();
    });
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
      if (!allowWait) container.appendChild(makeAutoOffField(obj));
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
      if (!allowWait) attachHoldAndAutoOff(container, obj);
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
      if (!allowWait) attachHoldAndAutoOff(container, obj);
    } else if (t === 'mute') {
      container.append(
        makeObsSelect('Input Name', obj.inputName, obs.inputs, (v) => { obj.inputName = v; if (!allowWait) maybeAutoSyncLabel(v); }, 'Select audio input…').el,
        makeSelect('Mode', obj.mode || 'toggle', [
          ['toggle', 'Toggle'], ['mute', 'Mute'], ['unmute', 'Unmute'],
        ], (v) => { obj.mode = v; })
      );
      if (!allowWait) {
        container.appendChild(makeMeterField(obj));
        attachHoldAndAutoOff(container, obj);
      }
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
          ['stream', 'Stream Bitrate & Congestion'],
          ['mem', 'Memory & Frame Time'],
        ], (v) => { obj.mode = v; })
      );
    } else if (t === 'hotkey') {
      if (obj.mode !== 'keys') obj.mode = 'name';
      if (!obj.keyModifiers || typeof obj.keyModifiers !== 'object') {
        obj.keyModifiers = { control: false, alt: false, shift: false, command: false };
      }
      const nameRow = makeObsSelect('OBS Hotkey', obj.hotkeyName, obs.hotkeys || [], (v) => { obj.hotkeyName = v; if (!allowWait) maybeAutoSyncLabel(v); }, 'Select OBS hotkey…').el;
      const modeRow = makeSelect('Hotkey Mode', obj.mode, [
        ['name', 'Named OBS Hotkey'],
        ['keys', 'Key Sequence (TriggerHotkeyByKeySequence)'],
      ], (v) => {
        obj.mode = v;
        syncVis();
      });

      const keysWrap = document.createElement('div');
      keysWrap.className = 'frm step-row-full';
      const keyListId = 'obs-key-id-presets';
      let dl = document.getElementById(keyListId);
      if (!dl) {
        dl = document.createElement('datalist');
        dl.id = keyListId;
        const commonKeys = [
          'OBS_KEY_F1', 'OBS_KEY_F2', 'OBS_KEY_F3', 'OBS_KEY_F4', 'OBS_KEY_F5', 'OBS_KEY_F6',
          'OBS_KEY_F7', 'OBS_KEY_F8', 'OBS_KEY_F9', 'OBS_KEY_F10', 'OBS_KEY_F11', 'OBS_KEY_F12',
          'OBS_KEY_1', 'OBS_KEY_2', 'OBS_KEY_3', 'OBS_KEY_4', 'OBS_KEY_5', 'OBS_KEY_6',
          'OBS_KEY_7', 'OBS_KEY_8', 'OBS_KEY_9', 'OBS_KEY_0',
          'OBS_KEY_SPACE', 'OBS_KEY_ESCAPE', 'OBS_KEY_RETURN', 'OBS_KEY_TAB',
        ];
        for (const k of commonKeys) {
          const opt = document.createElement('option');
          opt.value = k;
          dl.appendChild(opt);
        }
        document.body.appendChild(dl);
      }
      const keyRow = makeTextInput('OBS Key ID', obj.keyId || '', 'OBS_KEY_F7', (v) => {
        obj.keyId = v.trim();
        if (!allowWait && Deck.formatHotkeyKeys) maybeAutoSyncLabel(Deck.formatHotkeyKeys(obj));
      });
      const keyInput = keyRow.querySelector('input');
      if (keyInput) keyInput.setAttribute('list', keyListId);

      const modRow = document.createElement('div');
      modRow.className = 'row';
      const modTitle = document.createElement('label');
      modTitle.textContent = 'Modifiers';
      const modBox = document.createElement('div');
      modBox.className = 'hotkey-mods';
      for (const [k, text] of [['control', 'Ctrl'], ['alt', 'Alt'], ['shift', 'Shift'], ['command', 'Cmd']]) {
        const lbl = document.createElement('label');
        lbl.className = 'chk-label';
        const chk = document.createElement('input');
        chk.type = 'checkbox';
        chk.dataset.mod = k;
        chk.checked = Boolean(obj.keyModifiers[k]);
        chk.addEventListener('change', () => {
          obj.keyModifiers[k] = chk.checked;
          if (!allowWait && obj.keyId && Deck.formatHotkeyKeys) maybeAutoSyncLabel(Deck.formatHotkeyKeys(obj));
        });
        lbl.append(chk, document.createTextNode(` ${text}`));
        modBox.appendChild(lbl);
      }
      modRow.append(modTitle, modBox);
      keysWrap.append(keyRow, modRow);

      const syncVis = () => {
        const isKeys = obj.mode === 'keys';
        nameRow.hidden = isKeys;
        keysWrap.hidden = !isKeys;
      };
      container.append(nameRow, modeRow, keysWrap);
      syncVis();
    } else if (t === 'http') {
      if (!['GET', 'POST', 'PUT'].includes(String(obj.method || '').toUpperCase())) obj.method = 'POST';
      const urlRow = makeTextInput('URL (http:// or https://)', obj.url || '', 'http://127.0.0.1:3905/hotkey', (v) => {
        obj.url = v.trim();
      });
      const ctRow = makeTextInput('Content-Type (optional)', obj.contentType || '', 'application/json', (v) => {
        if (v.trim()) obj.contentType = v.trim();
        else delete obj.contentType;
      });
      const bodyRow = document.createElement('div');
      bodyRow.className = 'row';
      const bodyLbl = document.createElement('label');
      bodyLbl.textContent = 'Body (optional, JSON or text)';
      const bodyInp = document.createElement('textarea');
      bodyInp.rows = 3;
      bodyInp.placeholder = '{"key":"1","ctrl":true,"alt":true,"shift":true}';
      bodyInp.value = obj.body || '';
      bodyInp.addEventListener('input', () => {
        if (bodyInp.value) obj.body = bodyInp.value;
        else delete obj.body;
      });
      bodyRow.append(bodyLbl, bodyInp);

      const syncVis = () => {
        const isGet = (obj.method || 'POST') === 'GET';
        ctRow.hidden = isGet;
        bodyRow.hidden = isGet;
      };
      container.append(
        makeSelect('HTTP Method', obj.method, [
          ['POST', 'POST'],
          ['GET', 'GET'],
          ['PUT', 'PUT'],
        ], (v) => { obj.method = v; syncVis(); }),
        urlRow,
        ctRow,
        bodyRow
      );
      syncVis();
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
    } else if (t === 'text') {
      if (!['set', 'cycle', 'counter'].includes(obj.mode)) obj.mode = 'set';
      const textOpts = obs.textInputs?.length ? obs.textInputs : obs.inputs;

      const textRow = document.createElement('div');
      textRow.className = 'row';
      const textLbl = document.createElement('label');
      textLbl.textContent = 'Text Content';
      const textInp = document.createElement('textarea');
      textInp.rows = 2;
      textInp.placeholder = 'Lower third or ticker text (blank clears)';
      textInp.value = obj.text || '';
      textInp.addEventListener('input', () => { obj.text = textInp.value; });
      textRow.append(textLbl, textInp);

      const presetsRow = document.createElement('div');
      presetsRow.className = 'row';
      const presetsLbl = document.createElement('label');
      presetsLbl.textContent = 'Preset Lines (one per line)';
      const presetsInp = document.createElement('textarea');
      presetsInp.rows = 3;
      presetsInp.placeholder = 'Topic 1: Intro\nTopic 2: Demo\nTopic 3: Q&A';
      presetsInp.value = Array.isArray(obj.presets) ? obj.presets.join('\n') : (obj.presets || '');
      presetsInp.addEventListener('input', () => {
        obj.presets = presetsInp.value.split(/\r?\n/).filter((s) => s.length > 0);
      });
      presetsRow.append(presetsLbl, presetsInp);

      const counterWrap = document.createElement('div');
      counterWrap.className = 'frm step-row-full';

      const deltaRow = document.createElement('div');
      deltaRow.className = 'row';
      const deltaLbl = document.createElement('label');
      deltaLbl.textContent = 'Step Delta (0 = Reset to 0)';
      const deltaInp = document.createElement('input');
      deltaInp.type = 'number';
      deltaInp.step = 'any';
      deltaInp.value = String(Number.isFinite(Number(obj.delta)) ? Number(obj.delta) : 1);
      deltaInp.addEventListener('input', () => {
        const n = Number(deltaInp.value);
        if (Number.isFinite(n)) obj.delta = n;
      });
      deltaRow.append(deltaLbl, deltaInp);

      const tplRow = makeTextInput('Template ({{n}} = value)', obj.template || '', 'Score: {{n}}', (v) => {
        if (v) obj.template = v;
        else delete obj.template;
      });

      const curRow = document.createElement('div');
      curRow.className = 'row';
      const curLbl = document.createElement('label');
      curLbl.textContent = 'Current Value';
      const curBox = document.createElement('div');
      curBox.className = 'auto-off-wrap';
      const curInp = document.createElement('input');
      curInp.type = 'number';
      curInp.step = 'any';
      curInp.value = String(Number.isFinite(Number(obj.counterVal)) ? Number(obj.counterVal) : 0);
      curInp.addEventListener('input', () => {
        const n = Number(curInp.value);
        if (Number.isFinite(n)) obj.counterVal = n;
      });
      const resetBtn = document.createElement('button');
      resetBtn.type = 'button';
      resetBtn.className = 'btn sm';
      resetBtn.textContent = 'Reset (0)';
      resetBtn.addEventListener('click', () => {
        obj.counterVal = 0;
        curInp.value = '0';
        curInp.dispatchEvent(new Event('input', { bubbles: true }));
      });
      curBox.append(curInp, resetBtn);
      curRow.append(curLbl, curBox);

      counterWrap.append(deltaRow, tplRow, curRow);

      const syncVis = () => {
        const m = obj.mode || 'set';
        textRow.hidden = m !== 'set';
        presetsRow.hidden = m !== 'cycle';
        counterWrap.hidden = m !== 'counter';
      };

      container.append(
        makeObsSelect('Text Source', obj.inputName, textOpts, (v) => { obj.inputName = v; if (!allowWait) maybeAutoSyncLabel(v); }, 'Select text source…').el,
        makeSelect('Mode', obj.mode, [
          ['set', 'Set Text'],
          ['cycle', 'Cycle Presets'],
          ['counter', 'Counter (+/- or Reset)'],
        ], (v) => { obj.mode = v; syncVis(); }),
        textRow,
        presetsRow,
        counterWrap
      );
      if (!allowWait) container.appendChild(makeAutoOffField(obj));
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
      if (!allowWait) {
        container.appendChild(makeMeterField(obj));
        attachHoldAndAutoOff(container, obj);
      }
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
    } else if (t === 'wait_event' && allowWait) {
      const evTypes = Deck.WAIT_EVENT_TYPES || ['MediaInputPlaybackEnded', 'SceneTransitionEnded', 'CurrentProgramSceneChanged'];
      if (!evTypes.includes(obj.eventType)) obj.eventType = evTypes[0];
      const timeoutVal = Number.isFinite(Number(obj.timeoutMs)) ? Number(obj.timeoutMs) : 15000;
      obj.timeoutMs = timeoutVal;

      const targetOptsFor = (evType) => {
        if (evType === 'SceneTransitionEnded') return obs.transitions || [];
        if (evType === 'CurrentProgramSceneChanged') return obs.scenes || [];
        return obs.mediaInputs?.length ? obs.mediaInputs : (obs.inputs || []);
      };

      const targetPick = makeObsSelect(
        'Target Name (blank = any)',
        obj.targetName || '',
        targetOptsFor(obj.eventType),
        (v) => {
          if (v) obj.targetName = v;
          else delete obj.targetName;
        },
        'Any matching target'
      );

      const evSel = makeSelect('OBS Event', obj.eventType, [
        ['MediaInputPlaybackEnded', 'Media Playback Ended'],
        ['SceneTransitionEnded', 'Scene Transition Ended'],
        ['CurrentProgramSceneChanged', 'Program Scene Changed'],
      ], (v) => {
        obj.eventType = v;
        targetPick.fill(targetOptsFor(v), obj.targetName || '');
      });

      const timeoutRow = document.createElement('div');
      timeoutRow.className = 'row';
      const tLbl = document.createElement('label');
      tLbl.textContent = 'Timeout Fallback (ms)';
      const tInp = document.createElement('input');
      tInp.type = 'number';
      tInp.min = '0';
      tInp.step = '500';
      tInp.value = String(timeoutVal);
      tInp.addEventListener('input', () => {
        const n = Number(tInp.value);
        obj.timeoutMs = Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
      });
      timeoutRow.append(tLbl, tInp);

      container.append(evSel, targetPick.el, timeoutRow);
    }
  }

  const STEP_TYPES = [
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
    ['text', 'Text / Counter'],
    ['browser', 'Browser Source'],
    ['screenshot', 'Screenshot'],
    ['hotkey', 'OBS Hotkey'],
    ['http', 'HTTP / Webhook'],
    ['transition', 'Transition'],
    ['profile', 'Profile'],
    ['collection', 'Collection'],
    ['page', 'Switch Page'],
  ];

  const STEP_KIND_LABELS = {
    scene: 'Scene',
    source: 'Source',
    transform: 'Transform',
    filter: 'Filter',
    mute: 'Mute',
    volume: 'Volume',
    monitor: 'Monitor',
    studio: 'Studio',
    output: 'Output',
    chapter: 'Chapter',
    media: 'Media',
    image: 'Image',
    text: 'Text',
    browser: 'Browser',
    screenshot: 'Screenshot',
    hotkey: 'Hotkey',
    http: 'HTTP',
    transition: 'Transition',
    profile: 'Profile',
    collection: 'Collection',
    page: 'Page',
    wait: 'Wait',
    wait_event: 'Wait Event',
  };

  const MODE_LABELS = {
    toggle: 'Toggle',
    enable: 'Enable',
    disable: 'Disable',
    show: 'Show',
    hide: 'Hide',
    solo: 'Solo',
    mute: 'Mute',
    unmute: 'Unmute',
    start: 'Start',
    stop: 'Stop',
  };

  const expandedSteps = new WeakSet();
  const containerStepState = new WeakMap();

  function describeStep(st) {
    const t = st.type || 'scene';
    const kind = STEP_KIND_LABELS[t] || t;
    const mode = MODE_LABELS[st.mode || 'toggle'] || 'Toggle';

    if (t === 'wait') {
      const ms = Math.max(0, Number(st.delayMs ?? 1000) || 0);
      return { kind, target: `${ms}ms` };
    }
    if (t === 'wait_event') {
      const evLabels = {
        MediaInputPlaybackEnded: 'Media End',
        SceneTransitionEnded: 'Transition End',
        CurrentProgramSceneChanged: 'Scene Change',
      };
      const evLbl = evLabels[st.eventType || 'MediaInputPlaybackEnded'] || (st.eventType || 'Event');
      const ms = Math.max(0, Number.isFinite(Number(st.timeoutMs)) ? Number(st.timeoutMs) : 15000);
      const tgt = st.targetName ? `${evLbl} · ${st.targetName}` : evLbl;
      return { kind, target: `${tgt} (${ms}ms max)` };
    }
    if (t === 'scene') {
      if (st.mode === 'next') return { kind, target: 'Next Scene' };
      if (st.mode === 'prev') return { kind, target: 'Previous Scene' };
      return { kind, target: st.sceneName || 'Select scene…' };
    }
    if (t === 'source') {
      const target = st.sourceName
        ? `${mode} ${st.sourceName}${st.sceneName ? ` (${st.sceneName})` : ''}`
        : (st.sceneName ? `${mode} in ${st.sceneName}` : `${mode} — select source…`);
      return { kind, target };
    }
    if (t === 'transform') {
      const presets = {
        toggle_pip: 'Toggle PiP',
        pip_br: 'PiP Bottom-Right',
        pip_tr: 'PiP Top-Right',
        pip_bl: 'PiP Bottom-Left',
        pip_tl: 'PiP Top-Left',
        center_half: 'Center Half',
        full_reset: 'Full Reset',
      };
      const preset = presets[st.preset || 'toggle_pip'] || st.preset || 'Toggle PiP';
      return { kind, target: st.sourceName ? `${preset} · ${st.sourceName}` : preset };
    }
    if (t === 'filter') {
      let target = `${mode} — select filter…`;
      if (st.filterName && st.sourceName) target = `${mode} ${st.filterName} on ${st.sourceName}`;
      else if (st.sourceName) target = `${mode} on ${st.sourceName}`;
      else if (st.filterName) target = `${mode} ${st.filterName}`;
      return { kind, target };
    }
    if (t === 'mute') {
      return { kind, target: st.inputName ? `${mode} ${st.inputName}` : `${mode} — select input…` };
    }
    if (t === 'volume') {
      const db = st.volumeDb != null ? `${st.volumeDb} dB` : '0 dB';
      const verb = st.mode === 'step' ? 'Step' : 'Set';
      return { kind, target: st.inputName ? `${verb} ${st.inputName} (${db})` : 'Select input…' };
    }
    if (t === 'monitor') {
      const monLabels = {
        cycle: 'Cycle',
        OBS_MONITORING_TYPE_NONE: 'Off',
        OBS_MONITORING_TYPE_MONITOR_ONLY: 'Monitor Only',
        OBS_MONITORING_TYPE_MONITOR_AND_OUTPUT: 'Monitor + Output',
      };
      const mon = monLabels[st.monitorType || 'cycle'] || 'Cycle';
      return { kind, target: st.inputName ? `${mon} · ${st.inputName}` : `${mon} — select input…` };
    }
    if (t === 'studio') {
      const actLabels = {
        toggle: 'Toggle Studio Mode',
        enable: 'Enable Studio Mode',
        disable: 'Disable Studio Mode',
        preview: `Preview ${st.sceneName || '…'}`,
        transition: 'Trigger Transition',
      };
      return { kind, target: actLabels[st.action || 'toggle'] || 'Studio Mode' };
    }
    if (t === 'output') {
      const targets = {
        stream: 'Stream',
        record: 'Record',
        recordPause: 'Record Pause',
        vcam: 'Virtual Cam',
        replay: 'Replay Buffer',
        saveReplay: 'Save Replay',
      };
      const outName = targets[st.target || 'stream'] || 'Stream';
      return { kind, target: st.target === 'saveReplay' ? outName : `${outName} (${mode})` };
    }
    if (t === 'chapter') {
      return { kind, target: st.chapterName ? `Marker "${st.chapterName}"` : 'Default Chapter Marker' };
    }
    if (t === 'media') {
      const acts = {
        play_pause: 'Play/Pause',
        play: 'Play',
        pause: 'Pause',
        stop: 'Stop',
        restart: 'Restart',
        next: 'Next',
        previous: 'Previous',
      };
      const act = acts[st.mediaAction || 'play_pause'] || 'Play/Pause';
      return { kind, target: st.inputName ? `${act} ${st.inputName}` : `${act} — select media…` };
    }
    if (t === 'image') {
      const acts = { set_file: 'Set File', next: 'Next Slide', previous: 'Prev Slide', restart: 'Restart' };
      const act = acts[st.mode || 'set_file'] || 'Set File';
      return { kind, target: st.inputName ? `${act} · ${st.inputName}` : act };
    }
    if (t === 'text') {
      const m = st.mode || 'set';
      if (m === 'cycle') {
        const cnt = Array.isArray(st.presets) ? st.presets.length : 0;
        return { kind, target: `Cycle (${cnt}) · ${st.inputName || 'select text…'}` };
      }
      if (m === 'counter') {
        const d = Number.isFinite(Number(st.delta)) ? Number(st.delta) : 1;
        const stepTxt = d === 0 ? 'Reset' : (d > 0 ? `+${d}` : `${d}`);
        return { kind, target: `Counter (${stepTxt}) · ${st.inputName || 'select text…'}` };
      }
      return { kind, target: st.inputName ? `Set · ${st.inputName}` : 'Set — select text…' };
    }
    if (t === 'browser') {
      const act = st.mode === 'set_url' ? 'Set URL' : 'Refresh Cache';
      return { kind, target: st.inputName ? `${act} · ${st.inputName}` : act };
    }
    if (t === 'screenshot') {
      return { kind, target: st.sourceName || 'Program Scene' };
    }
    if (t === 'hotkey') {
      const target = st.mode === 'keys'
        ? (Deck.formatHotkeyKeys ? Deck.formatHotkeyKeys(st) : (st.keyId || 'Key Sequence'))
        : (st.hotkeyName || 'Select hotkey…');
      return { kind, target };
    }
    if (t === 'http') {
      const method = st.method || 'POST';
      return { kind, target: st.url ? `${method} ${st.url}` : `${method} — enter URL…` };
    }
    if (t === 'transition') {
      if (!st.transitionName) return { kind, target: 'Select transition…' };
      const dur = st.durationMs != null && st.durationMs !== '' ? ` (${st.durationMs}ms)` : '';
      return { kind, target: `${st.transitionName}${dur}` };
    }
    if (t === 'profile') return { kind, target: st.profileName || 'Select profile…' };
    if (t === 'collection') return { kind, target: st.collectionName || 'Select collection…' };
    if (t === 'page') {
      if (st.mode === 'next') return { kind, target: 'Next Page' };
      if (st.mode === 'prev') return { kind, target: 'Previous Page' };
      const pg = (Deck.cfg?.pages || []).find((p) => p.id === st.pageId);
      return { kind, target: pg ? pg.name : 'Select page…' };
    }
    return { kind, target: 'Configure step…' };
  }

  function formatMacroMeta(steps) {
    const n = steps.length;
    const countText = `${n} ${n === 1 ? 'step' : 'steps'}`;
    const totalMs = steps.reduce((acc, s) => (
      s.type === 'wait' ? acc + Math.max(0, Number(s.delayMs ?? 1000) || 0) : acc
    ), 0);
    if (totalMs <= 0) return countText;
    const waitText = totalMs >= 1000
      ? `${(totalMs / 1000).toFixed(totalMs % 1000 === 0 ? 0 : 1)}s`
      : `${totalMs}ms`;
    return `${countText} · ${waitText} wait`;
  }

  function makeStepButton(cls, text, title, onClick) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `btn sm step-btn ${cls}`;
    b.textContent = text;
    b.title = title;
    b.setAttribute('aria-label', title);
    b.addEventListener('click', onClick);
    return b;
  }

  function renderStepList(container, steps, allowWait, onStepsChange) {
    let state = containerStepState.get(container);
    if (!state || state.steps !== steps) {
      if (steps.length <= 2) {
        steps.forEach((st) => expandedSteps.add(st));
      }
      state = { steps, len: steps.length, onChange: onStepsChange || null };
      containerStepState.set(container, state);
    } else {
      if (onStepsChange) state.onChange = onStepsChange;
      if (steps.length === state.len + 1) {
        expandedSteps.add(steps[steps.length - 1]);
      }
      state.len = steps.length;
    }

    const notifyChange = () => {
      if (state.onChange) state.onChange();
    };

    container.innerHTML = '';
    if (!steps.length) {
      const empty = document.createElement('div');
      empty.className = 'steps-empty';
      empty.textContent = allowWait
        ? 'No steps yet. Click + Add Step to build this Timed Macro.'
        : 'No PANIC steps configured. Click + Step or Add Deck Filters (Off).';
      container.appendChild(empty);
      return;
    }

    steps.forEach((st, idx) => {
      const isExpanded = expandedSteps.has(st);
      const box = document.createElement('div');
      box.className = 'step'
        + (isExpanded ? '' : ' collapsed')
        + ((st.type === 'wait' || st.type === 'wait_event') ? ' step-wait' : '');

      const top = document.createElement('div');
      top.className = 'step-top';

      const numEl = document.createElement('span');
      numEl.className = 'step-num';
      numEl.textContent = `#${idx + 1}`;

      const summaryEl = document.createElement('span');
      summaryEl.className = 'step-summary';
      const kindEl = document.createElement('span');
      kindEl.className = 'step-summary-kind';
      const targetEl = document.createElement('span');
      targetEl.className = 'step-summary-target';
      summaryEl.append(kindEl, document.createTextNode(' · '), targetEl);

      const updateSummary = () => {
        const { kind, target } = describeStep(st);
        kindEl.textContent = kind;
        targetEl.textContent = target;
        box.classList.toggle('step-wait', st.type === 'wait' || st.type === 'wait_event');
      };
      updateSummary();

      const actionsEl = document.createElement('div');
      actionsEl.className = 'step-actions';

      const upBtn = makeStepButton('step-up', '↑', 'Move step up', () => {
        if (idx <= 0) return;
        const [item] = steps.splice(idx, 1);
        steps.splice(idx - 1, 0, item);
        renderStepList(container, steps, allowWait, state.onChange);
        notifyChange();
      });
      upBtn.disabled = idx === 0;

      const downBtn = makeStepButton('step-down', '↓', 'Move step down', () => {
        if (idx >= steps.length - 1) return;
        const [item] = steps.splice(idx, 1);
        steps.splice(idx + 1, 0, item);
        renderStepList(container, steps, allowWait, state.onChange);
        notifyChange();
      });
      downBtn.disabled = idx === steps.length - 1;

      const togBtn = document.createElement('button');
      togBtn.type = 'button';
      togBtn.className = 'btn sm step-btn step-toggle';
      const chev = document.createElement('span');
      chev.className = 'step-chevron';
      chev.setAttribute('aria-hidden', 'true');
      chev.textContent = '▾';
      togBtn.appendChild(chev);

      const syncExpandedUi = (expanded) => {
        box.classList.toggle('collapsed', !expanded);
        togBtn.setAttribute('aria-expanded', String(expanded));
        const label = expanded ? 'Collapse step' : 'Expand step';
        togBtn.title = label;
        togBtn.setAttribute('aria-label', label);
      };
      syncExpandedUi(isExpanded);

      const toggleExpanded = () => {
        const next = !expandedSteps.has(st);
        if (next) expandedSteps.add(st);
        else expandedSteps.delete(st);
        syncExpandedUi(next);
      };
      togBtn.addEventListener('click', toggleExpanded);
      top.addEventListener('click', (e) => {
        if (!e.target.closest('.step-actions')) toggleExpanded();
      });

      const delBtn = makeStepButton('step-del', '✕', 'Delete step', () => {
        steps.splice(idx, 1);
        renderStepList(container, steps, allowWait, state.onChange);
        notifyChange();
      });

      actionsEl.append(upBtn, downBtn, togBtn, delBtn);
      top.append(numEl, summaryEl, actionsEl);

      const body = document.createElement('div');
      body.className = 'step-body frm';

      const typeRow = document.createElement('div');
      typeRow.className = 'row step-type-row';
      const typeLbl = document.createElement('label');
      typeLbl.textContent = 'Step Action';
      const sel = document.createElement('select');
      const types = allowWait
        ? [...STEP_TYPES, ['wait', 'Wait (ms)'], ['wait_event', 'Wait for OBS Event']]
        : STEP_TYPES;
      for (const [v, t] of types) {
        const o = document.createElement('option');
        o.value = v;
        o.textContent = t;
        if (v === st.type) o.selected = true;
        sel.appendChild(o);
      }
      typeRow.append(typeLbl, sel);
      body.appendChild(typeRow);

      sel.addEventListener('change', () => {
        const nextType = sel.value;
        for (const k of Object.keys(st)) {
          if (k !== 'type') delete st[k];
        }
        st.type = nextType;
        if (st.type === 'wait') st.delayMs = 2000;
        if (st.type === 'wait_event') {
          st.eventType = 'MediaInputPlaybackEnded';
          st.timeoutMs = 15000;
        }
        renderActionFields(body, st, allowWait);
        updateSummary();
        notifyChange();
      });
      renderActionFields(body, st, allowWait);

      const syncLive = () => {
        updateSummary();
        notifyChange();
      };
      body.addEventListener('input', syncLive);
      body.addEventListener('change', syncLive);

      box.append(top, body);
      container.appendChild(box);
    });
  }

  function updatePadPreview() {
    const previewEl = $('pad-preview');
    if (!previewEl || !draftPad) return;
    const esc = Deck.esc;
    const page = Deck.cfg.pages.find((d) => d.id === editingPageId) || Deck.getActivePage();
    const cols = page?.cols || 8;
    const idx = editingIdx >= 0 ? editingIdx : 0;

    const previewPad = {
      ...draftPad,
      type: $('f-type') ? $('f-type').value : (draftPad.type || 'none'),
      label: $('f-label') ? $('f-label').value.trim() : (draftPad.label || ''),
      icon: $('f-icon') ? $('f-icon').value.trim() : (draftPad.icon || ''),
      imageFit: $('f-image-fit') ? $('f-image-fit').value : (draftPad.imageFit || 'icon'),
      hideLabel: $('f-image-hidelabel') ? $('f-image-hidelabel').checked : Boolean(draftPad.hideLabel),
    };

    const isFullFace = Boolean(previewPad.image && previewPad.imageFit === 'fill');
    const isHoldPad = Boolean(previewPad.hold && Deck.HOLD_TYPES && Deck.HOLD_TYPES.has(previewPad.type));
    const hasColor = Boolean(!isFullFace && previewPad.color && previewPad.type !== 'none');
    const lbl = previewPad.label || (Deck.padFallbackLabel ? Deck.padFallbackLabel(previewPad, idx, cols) : '');
    const ctxText = Deck.getPadContextSubtitle ? Deck.getPadContextSubtitle(previewPad) : '';
    const tag = Deck.TAGS?.[previewPad.type] || '';

    previewEl.className = 'pad'
      + (previewPad.type === 'none' ? ' empty' : ` is-${previewPad.type}`)
      + (previewPad.type === 'stats' ? ' stats-pad' : '')
      + (isHoldPad ? ' hold-pad' : '')
      + (isFullFace ? ' full-face' : '')
      + (hasColor ? ' has-color' : '')
      + (previewPad.hideLabel ? ' hide-label' : '');

    if (isFullFace && String(previewPad.image).startsWith('data:image/')) {
      previewEl.style.backgroundColor = previewPad.color && previewPad.type !== 'none' ? previewPad.color : '';
      previewEl.style.backgroundImage = `url("${previewPad.image}")`;
      previewEl.style.backgroundSize = 'cover';
      previewEl.style.backgroundPosition = 'center';
    } else {
      previewEl.style.backgroundImage = '';
      previewEl.style.backgroundSize = '';
      previewEl.style.backgroundPosition = '';
      previewEl.style.backgroundColor = previewPad.color && previewPad.type !== 'none' ? previewPad.color : '';
    }

    let iconHtml = '';
    if (previewPad.image && previewPad.imageFit !== 'fill') {
      iconHtml = `<img class="pad-icon-img" src="${esc(previewPad.image)}" alt="">`;
    } else if (!previewPad.image && previewPad.icon) {
      iconHtml = `<span class="ico">${esc(previewPad.icon)}</span>`;
    }
    const lblHtml = `<span class="lbl"${previewPad.hideLabel ? ' style="display:none"' : ''}>${esc(lbl)}</span>`;
    const ctxHtml = ctxText ? `<span class="ctx"${previewPad.hideLabel ? ' style="display:none"' : ''}>${esc(ctxText)}</span>` : '';

    previewEl.innerHTML = `<i class="led"></i>${tag ? `<span class="tag">${esc(tag)}</span>` : ''}`
      + iconHtml
      + lblHtml
      + ctxHtml;
  }

  function drawPadFields() {
    const f = $('f-fields');
    f.innerHTML = '';
    draftPad.type = $('f-type').value;
    const padDlg = $('pad-dlg');
    if (padDlg) padDlg.classList.toggle('macro-wide', draftPad.type === 'macro');
    if (!Deck.HOLD_TYPES.has(draftPad.type)) delete draftPad.hold;
    if (!Deck.AUTO_OFF_TYPES.has(draftPad.type)) delete draftPad.autoOffMs;
    if (draftPad.type === 'macro') {
      const toolbar = document.createElement('div');
      toolbar.className = 'macro-toolbar';

      const cleanupLbl = document.createElement('label');
      cleanupLbl.className = 'chk-label';
      const cleanupChk = document.createElement('input');
      cleanupChk.type = 'checkbox';
      cleanupChk.id = 'f-macro-cleanup';
      cleanupChk.checked = Boolean(draftPad.cleanupOnAbort);
      cleanupChk.addEventListener('change', () => {
        if (cleanupChk.checked) draftPad.cleanupOnAbort = true;
        else delete draftPad.cleanupOnAbort;
      });
      cleanupLbl.append(cleanupChk, document.createTextNode(' Run trailing cleanup steps if aborted or PANIC'));

      const meta = document.createElement('span');
      meta.className = 'macro-meta';
      const syncMeta = () => { meta.textContent = formatMacroMeta(draftPad.steps); };
      syncMeta();

      const add = document.createElement('button');
      add.type = 'button';
      add.className = 'btn sm';
      add.textContent = '+ Add Step';

      toolbar.append(cleanupLbl, meta, add);

      const list = document.createElement('div');
      list.className = 'steps';

      add.addEventListener('click', () => {
        draftPad.steps.push({ type: 'filter', mode: 'enable' });
        renderStepList(list, draftPad.steps, true, syncMeta);
        syncMeta();
        list.scrollTop = list.scrollHeight;
      });
      renderStepList(list, draftPad.steps, true, syncMeta);
      f.append(toolbar, list);
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
    updatePadPreview();
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
        b.addEventListener('click', () => {
          $('f-icon').value = emo;
          updatePadPreview();
        });
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
        updatePadPreview();
      });
      sw.appendChild(b);
    });
    const clrCol = document.createElement('button');
    clrCol.type = 'button';
    clrCol.id = 'btn-color-clear';
    clrCol.className = 'btn sm';
    clrCol.textContent = 'Clear Color';
    clrCol.title = 'Reset pad color to default';
    clrCol.addEventListener('click', () => {
      draftPad.color = COLORS[0];
      sw.querySelectorAll('.sw').forEach((x) => x.classList.toggle('sel', x.title === COLORS[0]));
      updatePadPreview();
    });
    sw.appendChild(clrCol);

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
    updatePadPreview();
  });
  $('f-icon')?.addEventListener('input', updatePadPreview);
  $('f-fields')?.addEventListener('input', updatePadPreview);
  $('f-fields')?.addEventListener('change', updatePadPreview);

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
        updatePadPreview();
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
    updatePadPreview();
  });

  $('f-image-fit')?.addEventListener('change', (e) => {
    if (draftPad) {
      draftPad.imageFit = e.target.value;
    }
    updatePadPreview();
  });

  $('f-image-hidelabel')?.addEventListener('change', (e) => {
    if (draftPad) {
      draftPad.hideLabel = e.target.checked;
    }
    updatePadPreview();
  });

  $('dlg-close').addEventListener('click', () => $('pad-dlg').close());
  $('btn-pad-cancel').addEventListener('click', () => $('pad-dlg').close());

  $('btn-pad-clear').addEventListener('click', () => {
    Deck.pushHistory(() => {
      const page = Deck.cfg.pages.find((d) => d.id === editingPageId) || Deck.getActivePage();
      if (page.pads[editingIdx]) page.pads[editingIdx] = { type: 'none', label: '', icon: '', color: COLORS[0] };
      Deck.saveCfg();
      Deck.renderGrid();
    });
    $('pad-dlg').close();
  });

  $('btn-pad-dup').addEventListener('click', () => {
    Deck.pushHistory(() => {
      const dstIdx = Deck.duplicatePad(editingIdx, editingPageId, editingPageId);
      if (dstIdx >= 0) {
        $('pad-dlg').close();
        Deck.setMsg(`Duplicated pad to slot ${dstIdx + 1}`);
        Deck.renderGrid();
      } else {
        Deck.setMsg('Page is full — cannot duplicate');
      }
    });
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
      saved.steps = (draftPad.steps || []).map(Deck.normalizeStep).filter((st) => st.type !== 'none');
    }
    const page = Deck.cfg.pages.find((d) => d.id === editingPageId) || Deck.getActivePage();
    Deck.pushHistory(() => {
      page.pads[editingIdx] = saved;
      Deck.saveCfg();
      Deck.renderGrid();
    });
    if (Deck.obs.status === 'ok') {
      const syncStep = (st) => {
        if (st.type === 'mute' && st.inputName) Deck.fetchMute(st.inputName).then(Deck.renderGrid);
        if (st.type === 'filter' && st.sourceName) Deck.refreshFilters(st.sourceName).then(Deck.renderGrid);
        if (st.type === 'volume' && st.inputName && Deck.fetchVolume) Deck.fetchVolume(st.inputName).then(Deck.renderGrid);
        if (st.type === 'media' && st.inputName && Deck.fetchMediaState) Deck.fetchMediaState(st.inputName).then(Deck.renderGrid);
        if (st.type === 'monitor' && st.inputName && Deck.fetchMonitorType) Deck.fetchMonitorType(st.inputName).then(Deck.renderGrid);
        if (st.type === 'text' && st.inputName && Deck.fetchTextSettings) Deck.fetchTextSettings(st.inputName).then(Deck.renderGrid);
        if (st.type === 'stats' && Deck.fetchStats) Deck.fetchStats();
      };
      syncStep(saved);
      if (saved.type === 'macro') saved.steps.forEach(syncStep);
    }
  });

  Deck.renderActionFields = renderActionFields;
  Deck.renderStepList = renderStepList;
})();
