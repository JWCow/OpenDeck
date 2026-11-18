(() => {
  'use strict';

  const Deck = window.Deck;
  const { $, esc, COLORS, PAD_COUNT } = Deck;
  const TAGS = { scene: 'SCN', source: 'SRC', filter: 'FLT', mute: 'AUD', macro: 'MCR', panic: 'PNC' };

  let dragIdx = null;
  let editingIdx = -1;
  let draftPad = null;
  let draftPanic = [];

  function padFallbackLabel(p, i) {
    if (p.type === 'scene') return p.sceneName || '';
    if (p.type === 'source') return p.sourceName || p.sceneName || '';
    if (p.type === 'filter') return p.filterName || p.sourceName || '';
    if (p.type === 'mute') return p.inputName || '';
    if (p.type === 'macro') return 'Macro';
    if (p.type === 'panic') return 'PANIC';
    return Deck.editMode ? `${Math.floor(i / 8) + 1}:${(i % 8) + 1}` : '';
  }

  function macroTickText(macro) {
    if (!macro) return '';
    return macro.endsAt ? `${Math.max(0, (macro.endsAt - Date.now()) / 1000).toFixed(1)}s` : 'RUN';
  }

  Deck.updateMacroTicks = () => {
    for (const [idx, macro] of Deck.activeMacros.entries()) {
      const btn = $('grid').querySelector(`.pad[data-idx="${idx}"]`);
      if (!btn) continue;
      let sub = btn.querySelector('.sub');
      const txt = macroTickText(macro);
      if (!sub && txt) {
        sub = document.createElement('span');
        sub.className = 'sub';
        btn.appendChild(sub);
      }
      if (sub) sub.textContent = txt;
    }
  };

  function initGrid() {
    const grid = $('grid');
    if (grid.children.length === PAD_COUNT) return;
    grid.innerHTML = '';
    for (let i = 0; i < PAD_COUNT; i++) {
      const el = document.createElement('button');
      el.type = 'button';
      el.dataset.idx = i;
      el.addEventListener('click', () => Deck.onPadClick(i));
      el.addEventListener('contextmenu', (e) => { e.preventDefault(); Deck.openPadEditor(i); });
      el.addEventListener('dragstart', () => { dragIdx = i; });
      el.addEventListener('dragover', (e) => { if (Deck.editMode) e.preventDefault(); });
      el.addEventListener('drop', (e) => {
        e.preventDefault();
        if (!Deck.editMode || dragIdx === null || dragIdx === i) return;
        const pads = Deck.cfg.pads;
        [pads[dragIdx], pads[i]] = [pads[i], pads[dragIdx]];
        dragIdx = null;
        Deck.saveCfg();
        Deck.renderGrid();
      });
      grid.appendChild(el);
    }
  }

  Deck.renderGrid = () => {
    initGrid();
    const btns = $('grid').children;
    Deck.cfg.pads.forEach((p, i) => {
      const el = btns[i];
      const macro = Deck.activeMacros.get(i);
      const active = Deck.isPadActive(p);
      el.className = 'pad'
        + (p.type === 'none' ? ' empty' : '')
        + (Deck.editMode ? ' edit-mode' : '')
        + (active ? ' active' : '')
        + (macro ? ' running' : '');
      el.style.background = p.color && p.type !== 'none' ? p.color : '';
      el.draggable = Deck.editMode;
      const rem = macroTickText(macro);
      const lbl = p.label || padFallbackLabel(p, i);
      el.innerHTML = `<i class="led"></i>${TAGS[p.type] ? `<span class="tag">${TAGS[p.type]}</span>` : ''}`
        + `${p.icon ? `<span class="ico">${esc(p.icon)}</span>` : ''}`
        + `<span class="lbl">${esc(lbl)}</span>${rem ? `<span class="sub">${rem}</span>` : ''}`;
    });
  };

  function allSceneTargets() {
    return [...new Set([...Deck.obs.scenes, ...Deck.obs.groups])];
  }

  function allFilterSources() {
    return [...new Set([...Deck.obs.scenes, ...Deck.obs.groups, ...Deck.obs.inputs])];
  }

  function makeCombo(label, value, options, onChange) {
    const wrap = document.createElement('div');
    wrap.className = 'row';
    wrap.innerHTML = `<label>${esc(label)}</label><div class="combo"><input type="text"><select><option value="">Pick OBS…</option></select></div>`;
    const inp = wrap.querySelector('input');
    const sel = wrap.querySelector('select');
    inp.value = value || '';
    const fill = (opts) => {
      sel.innerHTML = '<option value="">Pick OBS…</option>';
      for (const o of [...new Set(opts)]) {
        const opt = document.createElement('option');
        opt.value = o;
        opt.textContent = o;
        if (o === inp.value) opt.selected = true;
        sel.appendChild(opt);
      }
    };
    fill(options);
    inp.addEventListener('input', () => onChange(inp.value));
    sel.addEventListener('change', () => {
      if (sel.value) {
        inp.value = sel.value;
        onChange(sel.value);
      }
    });
    return { el: wrap, inp, sel, fill };
  }

  function makeSelect(label, value, opts, onChange) {
    const wrap = document.createElement('div');
    wrap.className = 'row';
    wrap.innerHTML = `<label>${esc(label)}</label><select></select>`;
    const sel = wrap.querySelector('select');
    for (const [v, t] of opts) {
      const opt = document.createElement('option');
      opt.value = v;
      opt.textContent = t;
      if (v === value) opt.selected = true;
      sel.appendChild(opt);
    }
    sel.addEventListener('change', () => onChange(sel.value));
    return wrap;
  }

  function renderActionFields(container, obj, allowWait) {
    const { obs } = Deck;
    container.innerHTML = '';
    const t = obj.type;
    if (t === 'scene') {
      container.appendChild(makeCombo('Scene Name', obj.sceneName, obs.scenes, (v) => { obj.sceneName = v; }).el);
    } else if (t === 'source') {
      let srcCombo;
      const scCombo = makeCombo('Scene / Group', obj.sceneName, allSceneTargets(), (v) => {
        obj.sceneName = v;
        srcCombo.fill((obs.itemsByScene[v] || []).map((x) => x.sourceName));
      });
      srcCombo = makeCombo(
        'Source Name',
        obj.sourceName,
        (obs.itemsByScene[obj.sceneName] || []).map((x) => x.sourceName),
        (v) => { obj.sourceName = v; }
      );
      container.append(
        scCombo.el,
        srcCombo.el,
        makeSelect('Mode', obj.mode || 'toggle', [
          ['toggle', 'Toggle'], ['show', 'Show'], ['hide', 'Hide'], ['solo', 'Solo (Hide Others)'],
        ], (v) => { obj.mode = v; })
      );
    } else if (t === 'filter') {
      let fltCombo;
      const loadFlts = async (src) => {
        if (!src) return;
        const flts = obs.status === 'ok' ? await Deck.refreshFilters(src) : (obs.filtersBySource[src] || []);
        fltCombo.fill(flts.map((f) => f.filterName));
      };
      const srcCombo = makeCombo('Source / Scene', obj.sourceName, allFilterSources(), (v) => {
        obj.sourceName = v;
        loadFlts(v);
      });
      fltCombo = makeCombo(
        'Filter Name',
        obj.filterName,
        (obs.filtersBySource[obj.sourceName] || []).map((f) => f.filterName),
        (v) => { obj.filterName = v; }
      );
      if (obj.sourceName && obs.status === 'ok') loadFlts(obj.sourceName);
      container.append(
        srcCombo.el,
        fltCombo.el,
        makeSelect('Mode', obj.mode || 'toggle', [
          ['toggle', 'Toggle'], ['enable', 'Enable'], ['disable', 'Disable'],
        ], (v) => { obj.mode = v; })
      );
    } else if (t === 'mute') {
      container.append(
        makeCombo('Input Name', obj.inputName, obs.inputs, (v) => { obj.inputName = v; }).el,
        makeSelect('Mode', obj.mode || 'toggle', [
          ['toggle', 'Toggle'], ['mute', 'Mute'], ['unmute', 'Unmute'],
        ], (v) => { obj.mode = v; })
      );
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
      const types = [['scene', 'Scene'], ['source', 'Source'], ['filter', 'Filter'], ['mute', 'Mute']];
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

  Deck.openPadEditor = (idx) => {
    editingIdx = idx;
    draftPad = JSON.parse(JSON.stringify(Deck.cfg.pads[idx]));
    if (!draftPad.steps) draftPad.steps = [];
    $('dlg-title').textContent = `Edit Pad R${Math.floor(idx / 8) + 1}C${(idx % 8) + 1}`;
    $('f-label').value = draftPad.label || '';
    $('f-icon').value = draftPad.icon || '';
    $('f-type').value = draftPad.type || 'none';
    const sw = $('f-colors');
    sw.innerHTML = '';
    COLORS.forEach((c) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'sw' + ((draftPad.color || COLORS[0]) === c ? ' sel' : '');
      b.style.background = c;
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

  function openPanicDialog() {
    draftPanic = JSON.parse(JSON.stringify(Deck.cfg.panicSteps || []));
    renderStepList($('panic-steps'), draftPanic, false);
    $('panic-dlg').showModal();
  }

  $('f-type').addEventListener('change', drawPadFields);
  $('dlg-close').addEventListener('click', () => $('pad-dlg').close());
  $('btn-pad-cancel').addEventListener('click', () => $('pad-dlg').close());
  $('btn-pad-clear').addEventListener('click', () => {
    Deck.cfg.pads[editingIdx] = { type: 'none', label: '', icon: '', color: COLORS[0] };
    Deck.saveCfg();
    $('pad-dlg').close();
    Deck.renderGrid();
  });
  $('pad-form').addEventListener('submit', () => {
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
    Deck.cfg.pads[editingIdx] = saved;
    Deck.saveCfg();
    Deck.renderGrid();
    if (Deck.obs.status === 'ok') {
      if (saved.type === 'mute' && saved.inputName) Deck.fetchMute(saved.inputName).then(Deck.renderGrid);
      if (saved.type === 'filter' && saved.sourceName) Deck.refreshFilters(saved.sourceName).then(Deck.renderGrid);
      if (saved.type === 'macro') {
        saved.steps.forEach((st) => {
          if (st.type === 'filter' && st.sourceName) Deck.refreshFilters(st.sourceName).then(Deck.renderGrid);
          if (st.type === 'mute' && st.inputName) Deck.fetchMute(st.inputName).then(Deck.renderGrid);
        });
      }
    }
  });

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
    for (const p of Deck.cfg.pads) {
      pullFrom(p);
      (p.steps || []).forEach(pullFrom);
    }
    renderStepList($('panic-steps'), draftPanic, false);
  });
  $('btn-panic-save').addEventListener('click', () => {
    Deck.cfg.panicSteps = draftPanic.map(Deck.normalizePad).filter((s) => s.type !== 'none');
    Deck.saveCfg();
    $('panic-dlg').close();
    Deck.setMsg(`Saved ${Deck.cfg.panicSteps.length} PANIC step(s)`);
  });

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
    const { cfg } = Deck;
    const out = { version: 1, ws: { host: cfg.ws.host, port: cfg.ws.port }, pads: cfg.pads, panicSteps: cfg.panicSteps };
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
      if (!Array.isArray(d.pads)) throw new Error('Invalid layout JSON (missing pads[])');
      const next = Deck.defaultPads();
      for (let i = 0; i < PAD_COUNT; i++) if (d.pads[i]) next[i] = Deck.normalizePad(d.pads[i]);
      Deck.cfg.pads = next;
      Deck.cfg.panicSteps = Array.isArray(d.panicSteps)
        ? d.panicSteps.filter((s) => s && typeof s === 'object').map(Deck.normalizePad)
        : [];
      if (d.ws && typeof d.ws === 'object') {
        Deck.cfg.ws.host = String(d.ws.host || Deck.cfg.ws.host);
        const p = Number(d.ws.port);
        if (p >= 1 && p <= 65535) Deck.cfg.ws.port = p;
      }
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
    if (!confirm('Reset all 64 pads and PANIC steps to starter defaults?')) return;
    Deck.cfg.pads = Deck.defaultPads();
    Deck.cfg.panicSteps = [];
    Deck.saveCfg();
    Deck.renderGrid();
    Deck.setMsg('Deck reset to starter defaults');
  });

  // Boot
  $('ws-host').value = Deck.cfg.ws.host;
  $('ws-port').value = Deck.cfg.ws.port;
  $('ws-pass').value = Deck.cfg.ws.password;
  Deck.renderGrid();
  Deck.connectObs();
})();
