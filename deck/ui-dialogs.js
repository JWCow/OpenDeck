(() => {
  'use strict';

  const Deck = window.Deck;
  const { $, esc } = Deck;

  let draftPanic = [];
  let promptedAutoImportThisSession = false;
  let wizSelectedScenes = new Set();
  let padClipboard = null;

  const phoneHostMachine = Deck.createMachine({
    id: 'phoneHost',
    initial: (typeof window !== 'undefined' && window.opendeckDesktop?.startPhoneHost) ? 'stopped' : 'unavailable',
    context: { port: 0, obsPort: 4455, primaryUrl: '', lastError: '' },
    transitions: {
      unavailable: {},
      stopped: {
        START: { target: 'starting', action: (ctx) => { ctx.lastError = ''; } },
        SYNC_STATUS: {
          target: 'running',
          guard: (_ctx, payload) => Boolean(payload?.running),
          action: (ctx, payload) => {
            ctx.port = Number(payload.port) || 0;
            ctx.obsPort = Number(payload.obsPort) || 4455;
            ctx.primaryUrl = String(payload.primaryUrl || '');
          },
        },
      },
      starting: {
        STARTED: {
          target: 'running',
          action: (ctx, payload) => {
            ctx.port = Number(payload?.port) || 0;
            ctx.obsPort = Number(payload?.obsPort) || 4455;
            ctx.primaryUrl = String(payload?.primaryUrl || '');
            ctx.lastError = '';
          },
        },
        STOPPED: {
          target: 'stopped',
          action: (ctx) => { ctx.port = 0; ctx.primaryUrl = ''; },
        },
        FAIL: {
          target: 'error',
          action: (ctx, payload) => { ctx.lastError = String(payload?.error || 'Error'); },
        },
      },
      running: {
        STOP: 'stopping',
        SYNC_STATUS: {
          target: 'running',
          action: (ctx, payload) => {
            ctx.port = Number(payload?.port) || ctx.port;
            ctx.obsPort = Number(payload?.obsPort) || ctx.obsPort;
            ctx.primaryUrl = String(payload?.primaryUrl || ctx.primaryUrl);
          },
        },
        STOPPED: {
          target: 'stopped',
          action: (ctx) => { ctx.port = 0; ctx.primaryUrl = ''; },
        },
      },
      stopping: {
        STOPPED: {
          target: 'stopped',
          action: (ctx) => { ctx.port = 0; ctx.primaryUrl = ''; ctx.lastError = ''; },
        },
        FAIL: {
          target: 'error',
          action: (ctx, payload) => { ctx.lastError = String(payload?.error || 'Error'); },
        },
      },
      error: {
        START: { target: 'starting', action: (ctx) => { ctx.lastError = ''; } },
        STOPPED: { target: 'stopped', action: (ctx) => { ctx.port = 0; ctx.primaryUrl = ''; } },
      },
    },
  });

  function syncPageOrderButtons() {
    const pages = Deck.cfg?.pages || [];
    const cur = Deck.getActivePage();
    const idx = pages.findIndex((p) => p.id === cur.id);
    const leftBtn = $('btn-page-left');
    const rightBtn = $('btn-page-right');
    if (leftBtn) leftBtn.disabled = idx <= 0;
    if (rightBtn) rightBtn.disabled = idx < 0 || idx >= pages.length - 1;
  }

  function syncPagePresetHighlight() {
    const c = Number($('d-cols').value);
    const r = Number($('d-rows').value);
    $('d-presets').querySelectorAll('button').forEach((b) => {
      b.classList.toggle('on', Number(b.dataset.cols) === c && Number(b.dataset.rows) === r);
    });
  }

  function syncSceneWarning() {
    const cur = Deck.getActivePage();
    const selScene = $('d-scene')?.value.trim() || '';
    const warnEl = $('d-scene-warn');
    const applyBtn = $('deck-dlg')?.querySelector('button[type="submit"]');
    if (!selScene) {
      if (warnEl) { warnEl.hidden = true; warnEl.textContent = ''; }
      if (applyBtn) applyBtn.disabled = false;
      return null;
    }
    const other = (Deck.cfg.pages || []).find((p) => p.id !== cur.id && p.sceneName === selScene);
    if (other) {
      if (warnEl) {
        warnEl.hidden = false;
        warnEl.textContent = `Scene "${selScene}" is already linked to Page "${other.name}"`;
      }
      if (applyBtn) applyBtn.disabled = true;
      return other;
    } else {
      if (warnEl) { warnEl.hidden = true; warnEl.textContent = ''; }
      if (applyBtn) applyBtn.disabled = false;
      return null;
    }
  }

  function openPageDialog() {
    const page = Deck.getActivePage();
    $('d-name').value = page.name || 'Main';
    $('d-cols').value = page.cols;
    $('d-rows').value = page.rows;
    if ($('d-fallback')) $('d-fallback').checked = Boolean(page.isFallback);
    $('btn-deck-del').disabled = Deck.cfg.pages.length <= 1;
    syncPageOrderButtons();

    const sel = $('d-scene');
    if (sel) {
      sel.innerHTML = '<option value="">None</option>';
      const scenes = Deck.obs.scenes || [];
      const curScene = page.sceneName || '';
      let hasCur = false;
      for (const s of scenes) {
        const opt = document.createElement('option');
        opt.value = s;
        opt.textContent = s;
        if (s === curScene) {
          opt.selected = true;
          hasCur = true;
        }
        sel.appendChild(opt);
      }
      if (curScene && !hasCur) {
        const opt = document.createElement('option');
        opt.value = curScene;
        opt.textContent = `${curScene} (saved)`;
        opt.selected = true;
        sel.appendChild(opt);
      }
      if (!curScene) {
        sel.value = '';
      }
    }
    syncSceneWarning();
    syncPagePresetHighlight();
    $('deck-dlg').showModal();
  }

  function openPanicDialog() {
    draftPanic = JSON.parse(JSON.stringify(Deck.cfg.panicSteps || []));
    Deck.renderStepList($('panic-steps'), draftPanic, false);
    $('panic-dlg').showModal();
  }

  function renderWizSceneList() {
    const wrap = $('wiz-scene-filter');
    const list = $('wiz-scene-list');
    const countEl = $('wiz-scenes-count');
    const searchInput = $('wiz-scene-search');
    if (!wrap || !list) return;
    const isStarterMode = Boolean($('wiz-mode-starter')?.checked);
    const connected = Deck.obs.status === 'ok';
    const scenes = Deck.obs.scenes || [];
    const needScenes = Boolean($('wiz-scenes')?.checked || $('wiz-sources')?.checked || $('wiz-filters')?.checked);
    if (isStarterMode || !connected || !scenes.length || !needScenes) {
      wrap.hidden = true;
      return;
    }
    wrap.hidden = false;
    const query = String(searchInput?.value || '').trim().toLowerCase();
    const filtered = query ? scenes.filter((s) => s.toLowerCase().includes(query)) : scenes;
    if (countEl) {
      countEl.textContent = `(${wizSelectedScenes.size}/${scenes.length})`;
    }
    list.innerHTML = '';
    if (!filtered.length) {
      list.innerHTML = '<div class="wiz-scene-empty">No OBS scenes match your filter.</div>';
      return;
    }
    for (const sName of filtered) {
      const lbl = document.createElement('label');
      lbl.className = 'wiz-scene-item';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.value = sName;
      cb.checked = wizSelectedScenes.has(sName);
      cb.addEventListener('change', () => {
        if (cb.checked) wizSelectedScenes.add(sName);
        else wizSelectedScenes.delete(sName);
        if (countEl) countEl.textContent = `(${wizSelectedScenes.size}/${scenes.length})`;
        syncAutoImportState(false);
      });
      const txt = document.createElement('span');
      txt.textContent = sName;
      const itemCount = (Deck.obs.itemsByScene?.[sName] || []).length;
      const meta = document.createElement('span');
      meta.className = 'wiz-scene-meta';
      meta.textContent = `${itemCount} src`;
      lbl.appendChild(cb);
      lbl.appendChild(txt);
      lbl.appendChild(meta);
      list.appendChild(lbl);
    }
  }

  function getAutoImportOptions() {
    const hasScenes = (Deck.obs.scenes || []).length > 0;
    const opts = {
      scenes: Boolean($('wiz-scenes')?.checked),
      sources: Boolean($('wiz-sources')?.checked),
      filters: Boolean($('wiz-filters')?.checked),
      broadcast: Boolean($('wiz-broadcast')?.checked),
    };
    if (hasScenes) {
      opts.selectedScenes = [...wizSelectedScenes];
    }
    return opts;
  }

  function syncAutoImportState(reRenderScenes = true) {
    const connected = Deck.obs.status === 'ok';
    const isStarterMode = Boolean($('wiz-mode-starter')?.checked);
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
    const starterRow = $('wiz-starter-row');
    const checksGroup = $('wiz-checks-group');
    if (starterRow) starterRow.style.display = isStarterMode ? '' : 'none';
    if (checksGroup) checksGroup.style.display = isStarterMode ? 'none' : '';
    if (reRenderScenes) renderWizSceneList();

    const summary = $('wiz-summary');
    const previewEl = $('wiz-preview-count');
    let plannedPages = 0;
    let plannedPads = 0;

    if (summary) {
      if (isStarterMode) {
        summary.textContent = connected
          ? 'Applies a Starter Layout with broadcast pads and slots filled from OBS Studio (read-only).'
          : 'Applies a Starter Layout with marked empty pads ready to customize.';
      } else if (connected) {
        const { obs } = Deck;
        const filterCount = Object.values(obs.filtersBySource || {}).reduce((acc, arr) => acc + (arr?.length || 0), 0);
        summary.textContent = `Connected to OBS (${obs.scenes.length} scene(s), ${obs.inputs.length} input(s), ${filterCount} filter(s)). Read-only scan — OBS will not be modified.`;
      } else {
        summary.textContent = 'Connect to OBS Studio first to scan your scenes, sources, filters, and audio inputs (read-only).';
      }
    }

    if (!isStarterMode && connected && anyChecked) {
      const previewPages = Deck.buildAutoImportPages(getAutoImportOptions());
      plannedPages = previewPages.length;
      plannedPads = previewPages.reduce((acc, pg) => acc + (pg.pads || []).filter((p) => p && p.type !== 'none').length, 0);
      if (previewEl) {
        previewEl.hidden = false;
        previewEl.textContent = plannedPages > 0
          ? `Preview: Will create ${plannedPages} Page${plannedPages === 1 ? '' : 's'} (${plannedPads} pad${plannedPads === 1 ? '' : 's'})`
          : 'No items match the currently selected scenes and categories.';
      }
    } else if (previewEl) {
      previewEl.hidden = true;
      previewEl.textContent = '';
    }

    const applyBtn = $('btn-wiz-apply');
    if (applyBtn) {
      if (isStarterMode) {
        applyBtn.disabled = false;
        applyBtn.textContent = 'Create Pages';
      } else {
        applyBtn.disabled = !connected || !anyChecked || plannedPages === 0;
        applyBtn.textContent = plannedPages > 0
          ? `Create ${plannedPages} Page${plannedPages === 1 ? '' : 's'}`
          : 'Create Pages';
      }
    }
  }

  function openAutoImportWizard() {
    const dlg = $('import-wiz-dlg');
    if (!dlg) return;
    if ($('wiz-mode-categories')) $('wiz-mode-categories').checked = true;
    if ($('wiz-mode-starter')) $('wiz-mode-starter').checked = false;
    $('wiz-scenes').checked = true;
    $('wiz-sources').checked = true;
    $('wiz-filters').checked = true;
    $('wiz-broadcast').checked = true;
    $('wiz-replace').checked = Deck.isStarterDeck();
    wizSelectedScenes = new Set(Deck.obs.scenes || []);
    if ($('wiz-scene-search')) $('wiz-scene-search').value = '';
    syncAutoImportState(true);
    if (!dlg.open) dlg.showModal();
  }

  Deck.onObsConnected = () => {
    Deck.renderPalette();
    if (promptedAutoImportThisSession) return;
    if (!Deck.isStarterDeck()) return;
    if (document.querySelector('dialog[open]')) return;
    if (!Deck.obs.scenes.length && !Deck.obs.inputs.length) return;
    promptedAutoImportThisSession = true;
    openAutoImportWizard();
  };

  // Page & Grid Settings Dialog
  $('btn-deck-add').addEventListener('click', () => {
    Deck.clearSelection();
    Deck.pushHistory(() => {
      const created = Deck.addPage({ switchTo: true });
      Deck.setMsg(`Added Page "${created.name}" (${created.cols}×${created.rows})`);
    });
  });
  $('btn-deck-dup').addEventListener('click', () => {
    Deck.clearSelection();
    const cur = Deck.getActivePage();
    Deck.pushHistory(() => {
      const copy = Deck.duplicatePage(cur.id);
      if (copy) Deck.setMsg(`Duplicated "${cur.name}" -> "${copy.name}"`);
    });
  });
  $('btn-deck-cfg').addEventListener('click', openPageDialog);
  $('deck-dlg-close').addEventListener('click', () => $('deck-dlg').close());
  $('btn-deck-cancel').addEventListener('click', () => $('deck-dlg').close());
  $('btn-page-left')?.addEventListener('click', () => {
    const cur = Deck.getActivePage();
    if (Deck.movePage?.(cur.id, -1)) syncPageOrderButtons();
  });
  $('btn-page-right')?.addEventListener('click', () => {
    const cur = Deck.getActivePage();
    if (Deck.movePage?.(cur.id, 1)) syncPageOrderButtons();
  });
  $('d-cols').addEventListener('input', syncPagePresetHighlight);
  $('d-rows').addEventListener('input', syncPagePresetHighlight);
  $('d-scene')?.addEventListener('change', syncSceneWarning);
  $('d-scene')?.addEventListener('input', syncSceneWarning);
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
    Deck.pushHistory(() => {
      const copy = Deck.duplicatePage(cur.id);
      if (copy) Deck.setMsg(`Duplicated "${cur.name}" -> "${copy.name}"`);
    });
  });
  $('btn-deck-del').addEventListener('click', async () => {
    if (Deck.cfg.pages.length <= 1) return;
    const cur = Deck.getActivePage();
    if (!confirm(`Delete Page "${cur.name}" and its pads?`)) return;
    await Deck.pushHistory(async () => {
      await Deck.deletePage(cur.id);
      if ($('msg-info')?.textContent !== 'No snapshot was saved') {
        Deck.setMsg(`Deleted Page "${cur.name}"`);
      }
    });
    $('deck-dlg').close();
  });
  $('deck-form').addEventListener('submit', (e) => {
    const cur = Deck.getActivePage();
    const selScene = $('d-scene')?.value.trim() || '';
    if (selScene) {
      const other = (Deck.cfg.pages || []).find((p) => p.id !== cur.id && p.sceneName === selScene);
      if (other) {
        if (e) e.preventDefault();
        return;
      }
    }
    const name = $('d-name').value.trim() || cur.name;
    const cols = Number($('d-cols').value) || cur.cols;
    const rows = Number($('d-rows').value) || cur.rows;
    const wantFallback = Boolean($('d-fallback')?.checked);
    const wasFallback = Boolean(cur.isFallback);
    Deck.pushHistory(() => {
      Deck.renamePage(cur.id, name);
      Deck.resizePage(cur.id, cols, rows);
      Deck.setPageScene(cur.id, selScene);
      if (wantFallback) {
        Deck.setFallbackPage?.(cur.id);
      } else if (wasFallback) {
        Deck.setFallbackPage?.(null);
      }
      Deck.syncPageLockButton?.();
      const updated = Deck.getActivePage();
      Deck.setMsg(`Page "${updated.name}" (${updated.cols}×${updated.rows})`);
    });
  });

  // Auto-Import Wizard Dialog
  $('btn-auto-import').addEventListener('click', openAutoImportWizard);
  $('import-wiz-close').addEventListener('click', () => $('import-wiz-dlg').close());
  $('btn-wiz-cancel').addEventListener('click', () => $('import-wiz-dlg').close());
  ['wiz-scenes', 'wiz-sources', 'wiz-filters', 'wiz-broadcast', 'wiz-mode-categories', 'wiz-mode-starter'].forEach((id) => {
    const el = $(id);
    if (el) el.addEventListener('change', () => syncAutoImportState(true));
  });
  $('wiz-scene-search')?.addEventListener('input', () => renderWizSceneList());
  $('btn-wiz-scenes-all')?.addEventListener('click', () => {
    wizSelectedScenes = new Set(Deck.obs.scenes || []);
    syncAutoImportState(true);
  });
  $('btn-wiz-scenes-none')?.addEventListener('click', () => {
    wizSelectedScenes = new Set();
    syncAutoImportState(true);
  });
  if ($('wiz-starter-layout')) {
    $('wiz-starter-layout').addEventListener('change', () => {
      if ($('wiz-mode-starter')) $('wiz-mode-starter').checked = true;
      syncAutoImportState(true);
    });
  }
  $('import-wiz-form').addEventListener('submit', async (e) => {
    if (e) e.preventDefault();
    if ($('wiz-mode-starter')?.checked) {
      const selected = $('wiz-starter-layout')?.value || 'Solo Streamer';
      await Deck.applyStarterLayout(selected, { replaceEmptyStarter: $('wiz-replace').checked });
      $('import-wiz-dlg').close();
      return;
    }
    const pages = Deck.buildAutoImportPages(getAutoImportOptions());
    if (!pages.length) {
      Deck.setMsg('No items found in OBS for selected categories');
      $('import-wiz-dlg').close();
      return;
    }
    await Deck.applyAutoImport(pages, { replaceEmptyStarter: $('wiz-replace').checked });
    $('import-wiz-dlg').close();
  });

  // PANIC Dialog
  $('btn-panic-cfg').addEventListener('click', openPanicDialog);
  $('panic-close').addEventListener('click', () => $('panic-dlg').close());
  $('btn-panic-add').addEventListener('click', () => {
    draftPanic.push({ type: 'filter', mode: 'disable' });
    Deck.renderStepList($('panic-steps'), draftPanic, false);
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
    Deck.renderStepList($('panic-steps'), draftPanic, false);
  });
  $('btn-panic-save').addEventListener('click', () => {
    Deck.pushHistory(() => {
      Deck.cfg.panicSteps = draftPanic.map(Deck.normalizePad).filter((s) => s.type !== 'none');
      Deck.saveCfg();
    });
    $('panic-dlg').close();
    Deck.setMsg(`Saved ${Deck.cfg.panicSteps.length} PANIC step(s)`);
  });

  // Pure-JS Offline QR Code SVG generator (ISO/IEC 18004 Byte Mode, EC Level L, Versions 1-10)
  const QR_GF_EXP = new Uint8Array(512);
  const QR_GF_LOG = new Uint8Array(256);
  (() => {
    let x = 1;
    for (let i = 0; i < 255; i++) {
      QR_GF_EXP[i] = x;
      QR_GF_LOG[x] = i;
      x <<= 1;
      if (x & 0x100) x ^= 0x11d;
    }
    for (let i = 255; i < 512; i++) QR_GF_EXP[i] = QR_GF_EXP[i - 255];
  })();

  // EC Level L RS block tables: [totalCodewords, dataCodewords, ecPerBlock, [[count, total, data], ...]]
  const QR_VERSIONS_L = [
    null,
    { cap: 17, blocks: [[1, 26, 19]], align: [] },
    { cap: 32, blocks: [[1, 44, 34]], align: [6, 18] },
    { cap: 53, blocks: [[1, 70, 55]], align: [6, 22] },
    { cap: 78, blocks: [[1, 100, 80]], align: [6, 26] },
    { cap: 106, blocks: [[1, 134, 108]], align: [6, 30] },
    { cap: 134, blocks: [[2, 86, 68]], align: [6, 34] },
    { cap: 154, blocks: [[2, 98, 78]], align: [6, 22, 38] },
    { cap: 192, blocks: [[2, 121, 97]], align: [6, 24, 42] },
    { cap: 230, blocks: [[2, 146, 116]], align: [6, 26, 46] },
    { cap: 271, blocks: [[2, 86, 68], [2, 87, 69]], align: [6, 28, 50] },
  ];

  function qrPolyMul(a, b) {
    const out = new Uint8Array(a.length + b.length - 1);
    for (let i = 0; i < a.length; i++) {
      if (!a[i]) continue;
      const la = QR_GF_LOG[a[i]];
      for (let j = 0; j < b.length; j++) {
        if (!b[j]) continue;
        out[i + j] ^= QR_GF_EXP[la + QR_GF_LOG[b[j]]];
      }
    }
    return out;
  }

  function qrRsRemainder(data, ecLen) {
    let gen = new Uint8Array([1]);
    for (let i = 0; i < ecLen; i++) {
      gen = qrPolyMul(gen, new Uint8Array([1, QR_GF_EXP[i]]));
    }
    const msg = new Uint8Array(data.length + ecLen);
    msg.set(data, 0);
    for (let i = 0; i < data.length; i++) {
      const coef = msg[i];
      if (!coef) continue;
      const lc = QR_GF_LOG[coef];
      for (let j = 0; j < gen.length; j++) {
        if (!gen[j]) continue;
        msg[i + j] ^= QR_GF_EXP[lc + QR_GF_LOG[gen[j]]];
      }
    }
    return msg.slice(data.length);
  }

  function qrBchFormat(mask) {
    // EC Level L = 01
    const data = (1 << 3) | (mask & 7);
    let rem = data << 10;
    const poly = 0x537;
    for (let i = 14; i >= 10; i--) {
      if ((rem >>> i) & 1) rem ^= poly << (i - 10);
    }
    return ((data << 10) | rem) ^ 0x5412;
  }

  function qrBchVersion(ver) {
    let rem = ver << 12;
    const poly = 0x1f25;
    for (let i = 17; i >= 12; i--) {
      if ((rem >>> i) & 1) rem ^= poly << (i - 12);
    }
    return (ver << 12) | rem;
  }

  function generateClientQrSvg(text) {
    const str = String(text || '');
    if (!str) return '';
    const utf8 = typeof TextEncoder !== 'undefined'
      ? new TextEncoder().encode(str)
      : Uint8Array.from(str, (c) => c.charCodeAt(0) & 0xff);

    let ver = 0;
    for (let v = 1; v < QR_VERSIONS_L.length; v++) {
      const cap = QR_VERSIONS_L[v].cap;
      if (utf8.length <= cap) { ver = v; break; }
    }
    if (!ver) return '';

    const spec = QR_VERSIONS_L[ver];
    const totalDataCw = spec.blocks.reduce((sum, [cnt, , dc]) => sum + cnt * dc, 0);
    const bits = [];
    const pushBits = (val, len) => {
      for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1);
    };
    pushBits(0b0100, 4); // Byte mode
    pushBits(utf8.length, ver <= 9 ? 8 : 16);
    for (const b of utf8) pushBits(b, 8);
    const maxBits = totalDataCw * 8;
    const term = Math.min(4, maxBits - bits.length);
    for (let i = 0; i < term; i++) bits.push(0);
    while (bits.length % 8 !== 0) bits.push(0);
    const dataCw = new Uint8Array(totalDataCw);
    let cwIdx = 0;
    for (let i = 0; i < bits.length; i += 8) {
      let byte = 0;
      for (let j = 0; j < 8; j++) byte = (byte << 1) | bits[i + j];
      dataCw[cwIdx++] = byte;
    }
    const padBytes = [0xec, 0x11];
    let padIdx = 0;
    while (cwIdx < totalDataCw) {
      dataCw[cwIdx++] = padBytes[padIdx];
      padIdx ^= 1;
    }

    // Split into RS blocks & interleave
    const dataBlocks = [];
    const ecBlocks = [];
    let offset = 0;
    let maxDc = 0;
    let maxEc = 0;
    for (const [cnt, total, dc] of spec.blocks) {
      const ecLen = total - dc;
      maxDc = Math.max(maxDc, dc);
      maxEc = Math.max(maxEc, ecLen);
      for (let b = 0; b < cnt; b++) {
        const slice = dataCw.slice(offset, offset + dc);
        offset += dc;
        dataBlocks.push(slice);
        ecBlocks.push(qrRsRemainder(slice, ecLen));
      }
    }
    const finalBytes = [];
    for (let i = 0; i < maxDc; i++) {
      for (const blk of dataBlocks) if (i < blk.length) finalBytes.push(blk[i]);
    }
    for (let i = 0; i < maxEc; i++) {
      for (const blk of ecBlocks) if (i < blk.length) finalBytes.push(blk[i]);
    }

    const size = ver * 4 + 17;
    const grid = Array.from({ length: size }, () => new Int8Array(size)); // 0=unset, 1=light, 2=dark
    const isFunc = Array.from({ length: size }, () => new Uint8Array(size));

    const setMod = (r, c, dark, fn = false) => {
      if (r < 0 || c < 0 || r >= size || c >= size) return;
      grid[r][c] = dark ? 2 : 1;
      if (fn) isFunc[r][c] = 1;
    };

    const drawFinder = (r0, c0) => {
      for (let dr = -1; dr <= 7; dr++) {
        for (let dc = -1; dc <= 7; dc++) {
          const r = r0 + dr;
          const c = c0 + dc;
          if (r < 0 || c < 0 || r >= size || c >= size) continue;
          const inBox = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6;
          const dark = inBox && (
            dr === 0 || dr === 6 || dc === 0 || dc === 6
            || (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4)
          );
          setMod(r, c, dark, true);
        }
      }
    };
    drawFinder(0, 0);
    drawFinder(0, size - 7);
    drawFinder(size - 7, 0);

    for (let i = 8; i < size - 8; i++) {
      setMod(6, i, i % 2 === 0, true);
      setMod(i, 6, i % 2 === 0, true);
    }

    if (spec.align.length) {
      for (const ar of spec.align) {
        for (const ac of spec.align) {
          if (isFunc[ar][ac]) continue;
          for (let dr = -2; dr <= 2; dr++) {
            for (let dc = -2; dc <= 2; dc++) {
              const dark = Math.max(Math.abs(dr), Math.abs(dc)) !== 1;
              setMod(ar + dr, ac + dc, dark, true);
            }
          }
        }
      }
    }

    // Reserve format areas + dark module
    for (let i = 0; i <= 8; i++) {
      if (i !== 6) {
        isFunc[8][i] = 1;
        isFunc[i][8] = 1;
      }
      if (i < 8) {
        isFunc[8][size - 1 - i] = 1;
        isFunc[size - 1 - i][8] = 1;
      }
    }
    setMod(size - 8, 8, true, true);

    if (ver >= 7) {
      const vBits = qrBchVersion(ver);
      for (let i = 0; i < 18; i++) {
        const dark = Boolean((vBits >>> i) & 1);
        const r = Math.floor(i / 3);
        const c = size - 11 + (i % 3);
        setMod(r, c, dark, true);
        setMod(c, r, dark, true);
      }
    }

    // Place data bits (zig-zag upward/downward)
    let bitIdx = 0;
    const totalBits = finalBytes.length * 8;
    let upward = true;
    for (let col = size - 1; col >= 1; col -= 2) {
      if (col === 6) col = 5;
      for (let step = 0; step < size; step++) {
        const r = upward ? (size - 1 - step) : step;
        for (let dx = 0; dx < 2; dx++) {
          const c = col - dx;
          if (isFunc[r][c]) continue;
          const dark = bitIdx < totalBits
            ? Boolean((finalBytes[bitIdx >> 3] >>> (7 - (bitIdx & 7))) & 1)
            : false;
          bitIdx++;
          grid[r][c] = dark ? 2 : 1;
        }
      }
      upward = !upward;
    }

    const maskFn = [
      (r, c) => (r + c) % 2 === 0,
      (r) => r % 2 === 0,
      (_r, c) => c % 3 === 0,
      (r, c) => (r + c) % 3 === 0,
      (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
      (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
      (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
      (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
    ];

    const applyMaskAndScore = (m) => {
      const mat = Array.from({ length: size }, (_, r) => {
        const row = new Uint8Array(size);
        for (let c = 0; c < size; c++) {
          let dark = grid[r][c] === 2;
          if (!isFunc[r][c] && maskFn[m](r, c)) dark = !dark;
          row[c] = dark ? 1 : 0;
        }
        return row;
      });
      const fmt = qrBchFormat(m);
      for (let i = 0; i < 15; i++) {
        const bit = (fmt >>> i) & 1;
        if (i < 6) mat[i][8] = bit;
        else if (i < 8) mat[i + 1][8] = bit;
        else mat[size - 15 + i][8] = bit;

        if (i < 8) mat[8][size - 1 - i] = bit;
        else if (i < 9) mat[8][15 - i] = bit;
        else mat[8][14 - i] = bit;
      }
      mat[size - 8][8] = 1;

      let penalty = 0;
      let darkCount = 0;
      for (let r = 0; r < size; r++) {
        let runColor = -1;
        let runLen = 0;
        for (let c = 0; c < size; c++) {
          const v = mat[r][c];
          if (v) darkCount++;
          if (v === runColor) {
            runLen++;
          } else {
            if (runLen >= 5) penalty += 3 + (runLen - 5);
            runColor = v;
            runLen = 1;
          }
          if (r < size - 1 && c < size - 1) {
            if (v === mat[r][c + 1] && v === mat[r + 1][c] && v === mat[r + 1][c + 1]) penalty += 3;
          }
        }
        if (runLen >= 5) penalty += 3 + (runLen - 5);
      }
      for (let c = 0; c < size; c++) {
        let runColor = -1;
        let runLen = 0;
        for (let r = 0; r < size; r++) {
          const v = mat[r][c];
          if (v === runColor) runLen++;
          else {
            if (runLen >= 5) penalty += 3 + (runLen - 5);
            runColor = v;
            runLen = 1;
          }
        }
        if (runLen >= 5) penalty += 3 + (runLen - 5);
      }
      const pct = Math.abs((darkCount * 100) / (size * size) - 50);
      penalty += Math.floor(pct / 5) * 10;
      return { mat, penalty };
    };

    let best = null;
    for (let m = 0; m < 8; m++) {
      const cand = applyMaskAndScore(m);
      if (!best || cand.penalty < best.penalty) best = cand;
    }

    const margin = 2;
    const vb = size + margin * 2;
    const parts = [];
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (best.mat[r][c]) parts.push(`M${c + margin},${r + margin}h1v1h-1z`);
      }
    }
    return (
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vb} ${vb}" `
      + 'shape-rendering="crispEdges" role="img" aria-label="Phone Deck QR Code">'
      + `<rect width="${vb}" height="${vb}" fill="#ffffff"/>`
      + `<path d="${parts.join('')}" fill="#111318"/>`
      + '</svg>'
    );
  }

  // Phone Deck Host Dialog (Desktop App + Browser/LAN + OBS Dock file://)
  function renderQrSvgSafely(container, svgStr) {
    if (!container) return false;
    container.replaceChildren();
    if (typeof svgStr !== 'string') return false;
    const trimmed = svgStr.trim();
    if (!trimmed.startsWith('<svg ') || !trimmed.endsWith('</svg>')) return false;
    try {
      const doc = new DOMParser().parseFromString(trimmed, 'image/svg+xml');
      const root = doc.documentElement;
      if (!root || root.tagName.toLowerCase() !== 'svg' || doc.querySelector('parsererror')) {
        return false;
      }
      const allowed = new Set(['svg', 'rect', 'path']);
      const allEls = [root, ...root.querySelectorAll('*')];
      for (const el of allEls) {
        if (!allowed.has(el.tagName.toLowerCase())) return false;
        for (const attr of el.attributes) {
          if (attr.name.toLowerCase().startsWith('on')) return false;
        }
      }
      container.appendChild(document.importNode(root, true));
      return true;
    } catch {
      return false;
    }
  }

  function applyPhoneHostState(status) {
    const isRunning = Boolean(status?.running);
    if (isRunning) {
      phoneHostMachine.send(phoneHostMachine.state === 'starting' ? 'STARTED' : 'SYNC_STATUS', status);
    } else if (phoneHostMachine.state !== 'unavailable') {
      phoneHostMachine.send('STOPPED', status);
    }
    const statusEl = $('phone-host-status');
    const qrEl = $('phone-host-qr');
    const urlEl = $('phone-host-url');
    const toggleBtn = $('btn-phone-toggle');
    const exportBtn = $('btn-phone-export');
    const copyBtn = $('btn-phone-copy');
    const lanFields = $('phone-lan-fields');
    const stepsEl = $('phone-host-steps');

    if (lanFields) lanFields.hidden = true;
    if (stepsEl) stepsEl.hidden = true;
    if (toggleBtn) toggleBtn.hidden = false;
    if (exportBtn) exportBtn.hidden = true;

    if (isRunning) {
      const extraIps = Array.isArray(status.urls) && status.urls.length > 1
        ? ` (${status.urls.length} network addresses available)`
        : '';
      if (statusEl) {
        statusEl.textContent = `Serving Phone Deck on port ${status.port} (OBS WebSocket port ${status.obsPort})${extraIps}`;
      }
      const primaryUrl = String(status.primaryUrl || '');
      if (urlEl) {
        if ('value' in urlEl) urlEl.value = primaryUrl;
        else urlEl.textContent = primaryUrl;
      }
      const qrOk = renderQrSvgSafely(qrEl, status.qrSvg || generateClientQrSvg(primaryUrl));
      if (qrEl) qrEl.hidden = !qrOk;
      if (toggleBtn) toggleBtn.textContent = 'Stop Host';
      if (copyBtn) copyBtn.disabled = !primaryUrl;
    } else {
      if (statusEl) statusEl.textContent = 'Phone Deck host is stopped.';
      if (urlEl) {
        if ('value' in urlEl) urlEl.value = '';
        else urlEl.textContent = '';
      }
      if (qrEl) {
        qrEl.replaceChildren();
        qrEl.hidden = true;
      }
      if (toggleBtn) toggleBtn.textContent = 'Start Host';
      if (copyBtn) copyBtn.disabled = true;
    }
  }

  function isLocalLoopbackHost(h) {
    const s = String(h || '').trim().toLowerCase();
    return !s || s === 'localhost' || s === '127.0.0.1' || s === '::1' || s === '0.0.0.0';
  }

  function buildBrowserPhoneUrl() {
    const isHttp = location.protocol === 'http:' || location.protocol === 'https:';
    const rawHost = String($('phone-lan-host')?.value || '').trim();
    const obsPort = Number(Deck.cfg?.ws?.port) || 4455;
    if (!rawHost) return '';
    const safeHost = rawHost.replace(/^https?:\/\//i, '').replace(/[/?#].*$/, '').trim();
    if (!safeHost) return '';

    if (isHttp) {
      const proto = location.protocol;
      const portPart = location.port ? `:${location.port}` : '';
      const pathPart = location.pathname && location.pathname !== '/' ? location.pathname : '/deck.html';
      const obsHost = safeHost.split(':')[0] || safeHost;
      const hostWithPort = safeHost.includes(':') ? safeHost : `${safeHost}${portPart}`;
      return `${proto}//${hostWithPort}${pathPart}?host=${encodeURIComponent(obsHost)}&port=${obsPort}`;
    }

    const helperPortRaw = Number($('phone-http-port')?.value) || 8765;
    const helperPort = (helperPortRaw >= 1 && helperPortRaw <= 65535) ? helperPortRaw : 8765;
    const obsHost = safeHost.split(':')[0] || safeHost;
    return `http://${obsHost}:${helperPort}/deck.html?host=${encodeURIComponent(obsHost)}&port=${obsPort}`;
  }

  function refreshBrowserPhoneDialog() {
    const isHttp = location.protocol === 'http:' || location.protocol === 'https:';
    const statusEl = $('phone-host-status');
    const qrEl = $('phone-host-qr');
    const urlEl = $('phone-host-url');
    const copyBtn = $('btn-phone-copy');
    const hintEl = $('phone-host-hint');
    const rawHost = String($('phone-lan-host')?.value || '').trim();
    try {
      if (rawHost && !isLocalLoopbackHost(rawHost)) {
        localStorage.setItem('opendeck_phone_lan_host', rawHost);
      }
    } catch {}

    const phoneUrl = buildBrowserPhoneUrl();
    if (urlEl) {
      if ('value' in urlEl) urlEl.value = phoneUrl;
      else urlEl.textContent = phoneUrl;
    }
    if (copyBtn) copyBtn.disabled = !phoneUrl;

    if (phoneUrl) {
      const qrSvg = generateClientQrSvg(phoneUrl);
      const qrOk = renderQrSvgSafely(qrEl, qrSvg);
      if (qrEl) qrEl.hidden = !qrOk;
    } else if (qrEl) {
      qrEl.replaceChildren();
      qrEl.hidden = true;
    }

    if (isHttp) {
      if (isLocalLoopbackHost(rawHost)) {
        if (statusEl) statusEl.textContent = 'Enter your computer\'s Wi-Fi IP below so your phone can reach this server.';
      } else {
        if (statusEl) statusEl.textContent = `Scan with your phone camera (OBS WebSocket port ${Number(Deck.cfg?.ws?.port) || 4455}).`;
      }
      if (hintEl) hintEl.textContent = 'Connect your phone to the same Wi-Fi and scan the QR code. Passwords are never included in URLs.';
    } else {
      if (statusEl) {
        statusEl.textContent = phoneUrl
          ? `Phone Helper QR ready (OBS WebSocket port ${Number(Deck.cfg?.ws?.port) || 4455}).`
          : 'Run Phone Helper or the OpenDeck Desktop App to connect your phone over Wi-Fi.';
      }
      if (hintEl) hintEl.textContent = 'Passwords are never embedded in Phone Deck links or QR codes.';
    }
  }

  async function startDesktopPhoneHost() {
    const api = window.opendeckDesktop;
    if (!api?.startPhoneHost) return null;
    if (!phoneHostMachine.can('START') && phoneHostMachine.state !== 'running') return null;
    phoneHostMachine.send('START');
    const obsPort = Number(Deck.cfg?.ws?.port) || 4455;
    const layoutJson = JSON.stringify(Deck.exportConfig());
    try {
      const status = await api.startPhoneHost(layoutJson, obsPort);
      applyPhoneHostState(status);
      return status;
    } catch (err) {
      phoneHostMachine.send('FAIL', { error: err?.message || 'Error' });
      throw err;
    }
  }

  async function openPhoneHostDialog() {
    const api = window.opendeckDesktop;
    const dlg = $('phone-host-dlg');
    if (!dlg) return;

    if (api?.startPhoneHost) {
      if ($('phone-host-status')) $('phone-host-status').textContent = 'Starting local Phone Deck host…';
      if ($('phone-host-qr')) $('phone-host-qr').hidden = true;
      if ($('phone-lan-fields')) $('phone-lan-fields').hidden = true;
      if ($('phone-host-steps')) $('phone-host-steps').hidden = true;
      if ($('btn-phone-toggle')) $('btn-phone-toggle').hidden = false;
      if ($('btn-phone-export')) $('btn-phone-export').hidden = true;
      if (!dlg.open) dlg.showModal();
      try {
        const current = await api.getPhoneHostStatus?.();
        if (current?.running) {
          const obsPort = Number(Deck.cfg?.ws?.port) || 4455;
          const updated = await api.updatePhoneHostLayout?.(JSON.stringify(Deck.exportConfig()), obsPort);
          applyPhoneHostState(updated || current);
        } else {
          await startDesktopPhoneHost();
        }
      } catch (err) {
        phoneHostMachine.send('FAIL', { error: err?.message || 'Error' });
        if ($('phone-host-status')) $('phone-host-status').textContent = `Unable to start Phone Deck host: ${err?.message || 'Error'}`;
      }
      return;
    }

    // Browser / LAN or OBS Custom Browser Dock (file://) mode
    const isHttp = location.protocol === 'http:' || location.protocol === 'https:';
    const lanFields = $('phone-lan-fields');
    const portWrap = $('phone-http-port-wrap');
    const stepsEl = $('phone-host-steps');
    const toggleBtn = $('btn-phone-toggle');
    const exportBtn = $('btn-phone-export');
    const hostInput = $('phone-lan-host');

    if (lanFields) lanFields.hidden = false;
    if (portWrap) portWrap.hidden = isHttp;
    if (stepsEl) stepsEl.hidden = isHttp;
    if (toggleBtn) toggleBtn.hidden = true;
    if (exportBtn) exportBtn.hidden = false;

    if (hostInput) {
      let savedHost = '';
      try { savedHost = localStorage.getItem('opendeck_phone_lan_host') || ''; } catch {}
      if (isHttp && !isLocalLoopbackHost(location.hostname)) {
        hostInput.value = location.hostname;
      } else if (savedHost) {
        hostInput.value = savedHost;
      } else if (isHttp) {
        hostInput.value = location.hostname;
      } else {
        hostInput.value = '';
      }
    }

    refreshBrowserPhoneDialog();
    if (!dlg.open) dlg.showModal();
  }

  async function syncPhoneHostLayout() {
    const api = window.opendeckDesktop;
    if (phoneHostMachine.state !== 'running' || !api?.updatePhoneHostLayout) return;
    try {
      const obsPort = Number(Deck.cfg?.ws?.port) || 4455;
      const status = await api.updatePhoneHostLayout(JSON.stringify(Deck.exportConfig()), obsPort);
      if (!status?.running) phoneHostMachine.send('STOPPED');
      else phoneHostMachine.send('SYNC_STATUS', status);
      if ($('phone-host-dlg')?.open) applyPhoneHostState(status);
    } catch {}
  }

  $('phone-host-close')?.addEventListener('click', () => $('phone-host-dlg')?.close());
  $('btn-phone-done')?.addEventListener('click', () => $('phone-host-dlg')?.close());
  $('phone-lan-host')?.addEventListener('input', refreshBrowserPhoneDialog);
  $('phone-http-port')?.addEventListener('input', refreshBrowserPhoneDialog);
  $('btn-phone-export')?.addEventListener('click', () => {
    $('btn-export')?.click();
  });
  $('btn-phone-toggle')?.addEventListener('click', async () => {
    const api = window.opendeckDesktop;
    if (!api) return;
    const toggleBtn = $('btn-phone-toggle');
    if (toggleBtn) toggleBtn.disabled = true;
    try {
      if (phoneHostMachine.state === 'running') {
        phoneHostMachine.send('STOP');
        const status = await api.stopPhoneHost?.();
        applyPhoneHostState(status);
      } else {
        await startDesktopPhoneHost();
      }
    } catch (err) {
      phoneHostMachine.send('FAIL', { error: err?.message || 'Error' });
      if ($('phone-host-status')) $('phone-host-status').textContent = `Phone Deck host error: ${err?.message || 'Error'}`;
    } finally {
      if (toggleBtn) toggleBtn.disabled = false;
    }
  });
  $('btn-phone-copy')?.addEventListener('click', async () => {
    const urlEl = $('phone-host-url');
    const url = String(urlEl && ('value' in urlEl ? urlEl.value : urlEl.textContent) || '').trim();
    if (!url) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else if (urlEl && typeof urlEl.select === 'function') {
        urlEl.select();
        document.execCommand?.('copy');
      }
      Deck.setMsg('Copied Phone Deck URL');
    } catch {
      Deck.setMsg('Select and copy the URL manually');
    }
  });

  // Helper: Download exported Pages JSON
  function downloadPagesJson(pageIds, filename = 'opendeck-pages.json') {
    const out = Deck.exportPagesConfig?.(pageIds);
    if (!out) return false;
    const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
    Deck.setMsg(`Exported ${out.pages.length} Page${out.pages.length === 1 ? '' : 's'} to ${filename}`);
    return true;
  }

  // Bulk Page Manager Modal
  const pmSelected = new Set();

  function getPagePadCount(page) {
    return (page?.pads || []).filter((p) => p && p.type !== 'none').length;
  }

  function getFilteredPages() {
    const query = String($('pm-search')?.value || '').trim().toLowerCase();
    const pages = Deck.cfg?.pages || [];
    if (!query) return pages;
    return pages.filter((p) => (
      String(p.name || '').toLowerCase().includes(query)
      || String(p.sceneName || '').toLowerCase().includes(query)
    ));
  }

  function renderPagesManagerList() {
    const list = $('pm-list');
    const summary = $('pm-summary');
    const delBtn = $('pm-del-selected');
    const expBtn = $('pm-export-selected');
    const guardEl = $('pm-guard-hint');
    if (!list) return;

    const allPages = Deck.cfg?.pages || [];
    const validIds = new Set(allPages.map((p) => p.id));
    for (const id of [...pmSelected]) {
      if (!validIds.has(id)) pmSelected.delete(id);
    }

    const filtered = getFilteredPages();
    const activeId = Deck.cfg?.activePageId;

    if (summary) {
      const selPart = pmSelected.size > 0 ? ` · ${pmSelected.size} selected` : '';
      summary.textContent = `${allPages.length} page${allPages.length === 1 ? '' : 's'}${selPart}`;
    }

    const wouldDeleteAll = pmSelected.size > 0 && pmSelected.size >= allPages.length;
    if (guardEl) guardEl.hidden = !wouldDeleteAll;
    if (delBtn) {
      delBtn.disabled = pmSelected.size === 0 || wouldDeleteAll;
      delBtn.textContent = pmSelected.size > 0 ? `Delete Selected (${pmSelected.size})` : 'Delete Selected';
    }
    if (expBtn) {
      expBtn.disabled = pmSelected.size === 0;
      expBtn.textContent = pmSelected.size > 0 ? `Export Selected (${pmSelected.size})` : 'Export Selected';
    }

    list.innerHTML = '';
    if (!filtered.length) {
      list.innerHTML = '<div class="pm-empty">No pages match your search.</div>';
      return;
    }

    for (const p of filtered) {
      const padCount = getPagePadCount(p);
      const isCurrent = p.id === activeId;
      const row = document.createElement('div');
      row.className = 'pm-row' + (pmSelected.has(p.id) ? ' selected' : '') + (isCurrent ? ' current' : '');
      row.setAttribute('role', 'listitem');
      row.dataset.pageId = p.id;

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = 'pm-chk';
      cb.checked = pmSelected.has(p.id);
      cb.setAttribute('aria-label', `Select Page ${p.name || 'Page'}`);
      cb.addEventListener('change', () => {
        if (cb.checked) pmSelected.add(p.id);
        else pmSelected.delete(p.id);
        renderPagesManagerList();
      });

      const info = document.createElement('button');
      info.type = 'button';
      info.className = 'pm-info';
      info.title = `Switch to Page "${p.name || 'Page'}"`;
      const metaParts = [];
      if (isCurrent) metaParts.push('Active');
      if (p.sceneName) metaParts.push(`Scene: ${p.sceneName}`);
      metaParts.push(`${p.cols}×${p.rows}`);
      metaParts.push(padCount === 0 ? 'Empty' : `${padCount} pad${padCount === 1 ? '' : 's'}`);
      info.innerHTML = `<span class="pm-name">${esc(p.name || 'Page')}</span>`
        + `<span class="pm-meta">${esc(metaParts.join(' · '))}</span>`;
      info.addEventListener('click', () => {
        Deck.clearSelection?.();
        Deck.setActivePage?.(p.id);
        $('pages-mgr-dlg')?.close();
      });

      row.appendChild(cb);
      row.appendChild(info);
      list.appendChild(row);
    }
  }

  function openPagesManager() {
    const dlg = $('pages-mgr-dlg');
    if (!dlg) return;
    pmSelected.clear();
    if ($('pm-search')) $('pm-search').value = '';
    renderPagesManagerList();
    if (!dlg.open) dlg.showModal();
    $('pm-search')?.focus();
  }

  $('pages-mgr-close')?.addEventListener('click', () => $('pages-mgr-dlg')?.close());
  $('pm-done')?.addEventListener('click', () => $('pages-mgr-dlg')?.close());
  $('pm-search')?.addEventListener('input', renderPagesManagerList);
  $('pm-sel-all')?.addEventListener('click', () => {
    for (const p of getFilteredPages()) pmSelected.add(p.id);
    renderPagesManagerList();
  });
  $('pm-sel-empty')?.addEventListener('click', () => {
    pmSelected.clear();
    const emptyPages = (Deck.cfg?.pages || []).filter((p) => getPagePadCount(p) === 0);
    for (const p of emptyPages) pmSelected.add(p.id);
    if (!emptyPages.length) {
      Deck.setMsg('No empty Pages found');
    }
    renderPagesManagerList();
  });
  $('pm-sel-none')?.addEventListener('click', () => {
    pmSelected.clear();
    renderPagesManagerList();
  });
  $('pm-export-selected')?.addEventListener('click', () => {
    if (!pmSelected.size) return;
    downloadPagesJson([...pmSelected], 'opendeck-pages.json');
  });
  $('pm-del-selected')?.addEventListener('click', async () => {
    const ids = [...pmSelected];
    if (!ids.length || ids.length >= (Deck.cfg?.pages?.length || 1)) return;
    const msg = ids.length === 1
      ? 'Delete 1 selected Page and its pads? (A Layout Snapshot will be saved first.)'
      : `Delete ${ids.length} selected Pages and their pads? (A Layout Snapshot will be saved first.)`;
    if (!confirm(msg)) return;
    let deleted = 0;
    await Deck.pushHistory(async () => {
      deleted = await Deck.deletePages(ids);
    });
    pmSelected.clear();
    renderPagesManagerList();
    if (deleted > 0 && $('msg-info')?.textContent !== 'No snapshot was saved') {
      Deck.setMsg(`Deleted ${deleted} Page${deleted === 1 ? '' : 's'}`);
    }
  });

  // Quick Page & Pad Search Switcher (Ctrl+K)
  let qsItems = [];
  let qsActiveIdx = 0;

  function padSearchHaystack(p, fallbackLabel) {
    return [
      p.label,
      fallbackLabel,
      p.type,
      Deck.TAGS?.[p.type],
      p.sceneName,
      p.sourceName,
      p.filterName,
      p.inputName,
      p.hotkeyName,
      p.profileName,
      p.collectionName,
      p.transitionName,
      p.url,
    ].filter(Boolean).join(' ').toLowerCase();
  }

  function buildQuickSearchItems(query) {
    const q = String(query || '').trim().toLowerCase();
    const pages = Deck.cfg?.pages || [];
    const pageMatches = [];
    const padMatches = [];

    for (const pg of pages) {
      const pgName = String(pg.name || 'Page');
      const pgScene = String(pg.sceneName || '');
      const pgHay = `${pgName} ${pgScene}`.toLowerCase();
      if (!q || pgHay.includes(q)) {
        pageMatches.push({
          kind: 'page',
          pageId: pg.id,
          title: pgName,
          meta: [pgScene ? `Scene: ${pgScene}` : '', `${pg.cols}×${pg.rows}`, `${getPagePadCount(pg)} pads`].filter(Boolean).join(' · '),
          isActive: pg.id === Deck.cfg?.activePageId,
        });
      }

      const pads = pg.pads || [];
      for (let i = 0; i < pads.length; i++) {
        const p = pads[i];
        if (!p || p.type === 'none') continue;
        const fallback = Deck.padFallbackLabel ? Deck.padFallbackLabel(p, i, pg.cols) : p.type;
        const label = p.label || fallback || `Pad ${i + 1}`;
        if (!q || padSearchHaystack(p, fallback).includes(q) || pgName.toLowerCase().includes(q)) {
          const ctx = typeof Deck.getPadContextSubtitle === 'function' ? Deck.getPadContextSubtitle(p) : '';
          padMatches.push({
            kind: 'pad',
            pageId: pg.id,
            pageName: pgName,
            padIdx: i,
            icon: p.icon || '',
            tag: Deck.TAGS?.[p.type] || p.type.toUpperCase(),
            title: label,
            meta: [pgName, ctx || '', `Slot ${i + 1}`].filter(Boolean).join(' · '),
          });
        }
      }
    }

    const combined = [];
    const maxPages = q ? 25 : 15;
    const maxPads = q ? 35 : 20;
    for (const it of pageMatches.slice(0, maxPages)) combined.push(it);
    for (const it of padMatches.slice(0, maxPads)) combined.push(it);
    return combined;
  }

  function activateQuickSearchItem(item) {
    if (!item) return;
    $('quick-search-dlg')?.close();
    if (item.kind === 'page') {
      Deck.clearSelection?.();
      Deck.setActivePage?.(item.pageId);
      Deck.setMsg(`Switched to Page "${item.title}"`);
    } else if (item.kind === 'pad') {
      Deck.clearSelection?.();
      if (typeof Deck.locatePad === 'function') {
        Deck.locatePad(item.padIdx, item.pageId);
      } else {
        Deck.setActivePage?.(item.pageId);
      }
      Deck.setMsg(`Located "${item.title}" on "${item.pageName}"`);
    }
  }

  function syncQuickSearchHighlight() {
    const box = $('qs-results');
    if (!box) return;
    const rows = box.querySelectorAll('.qs-item');
    rows.forEach((el, idx) => {
      const on = idx === qsActiveIdx;
      el.classList.toggle('active', on);
      el.setAttribute('aria-selected', on ? 'true' : 'false');
      if (on && typeof el.scrollIntoView === 'function') {
        el.scrollIntoView({ block: 'nearest' });
      }
    });
  }

  function renderQuickSearchResults() {
    const box = $('qs-results');
    if (!box) return;
    qsItems = buildQuickSearchItems($('qs-input')?.value || '');
    qsActiveIdx = 0;
    box.innerHTML = '';

    if (!qsItems.length) {
      box.innerHTML = '<div class="qs-empty">No matching Pages or Pads.</div>';
      return;
    }

    let lastKind = '';
    qsItems.forEach((item, idx) => {
      if (item.kind !== lastKind) {
        lastKind = item.kind;
        const head = document.createElement('div');
        head.className = 'qs-group-head';
        head.textContent = item.kind === 'page' ? 'Pages' : 'Pads';
        box.appendChild(head);
      }
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'qs-item' + (idx === qsActiveIdx ? ' active' : '');
      btn.setAttribute('role', 'option');
      btn.setAttribute('aria-selected', idx === qsActiveIdx ? 'true' : 'false');
      btn.dataset.qsIdx = String(idx);
      const badge = item.kind === 'page'
        ? (item.isActive ? '<span class="qs-kind qs-kind-active">CURRENT</span>' : '<span class="qs-kind">PAGE</span>')
        : `<span class="qs-kind">${esc(item.tag)}</span>`;
      btn.innerHTML = `${badge}<span class="qs-item-main"><span class="qs-title">${esc(item.title)}</span><span class="qs-meta">${esc(item.meta)}</span></span>`;
      btn.addEventListener('mouseenter', () => {
        qsActiveIdx = idx;
        syncQuickSearchHighlight();
      });
      btn.addEventListener('click', () => activateQuickSearchItem(item));
      box.appendChild(btn);
    });
  }

  function openQuickSearch() {
    const dlg = $('quick-search-dlg');
    const inp = $('qs-input');
    if (!dlg || !inp) return;
    closeContextMenu();
    inp.value = '';
    renderQuickSearchResults();
    if (!dlg.open) dlg.showModal();
    inp.focus();
  }

  $('qs-close')?.addEventListener('click', () => $('quick-search-dlg')?.close());
  $('qs-input')?.addEventListener('input', renderQuickSearchResults);
  $('qs-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      if (!qsItems.length) return;
      e.preventDefault();
      qsActiveIdx = (qsActiveIdx + 1) % qsItems.length;
      syncQuickSearchHighlight();
    } else if (e.key === 'ArrowUp') {
      if (!qsItems.length) return;
      e.preventDefault();
      qsActiveIdx = (qsActiveIdx - 1 + qsItems.length) % qsItems.length;
      syncQuickSearchHighlight();
    } else if (e.key === 'Enter') {
      if (!qsItems.length) return;
      e.preventDefault();
      activateQuickSearchItem(qsItems[qsActiveIdx]);
    }
  });
  $('quick-search-dlg')?.addEventListener('click', (e) => {
    const dlg = $('quick-search-dlg');
    if (!dlg || e.target !== dlg) return;
    const rect = dlg.getBoundingClientRect();
    if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) {
      dlg.close();
    }
  });

  // Pad Clipboard helpers (Copy / Paste / Paste Style across Pages)
  function copyPad(idx, pageId) {
    const page = pageId
      ? (Deck.cfg?.pages || []).find((p) => p.id === pageId)
      : Deck.getActivePage();
    if (!page || idx < 0 || idx >= page.pads.length) return false;
    const pad = page.pads[idx];
    if (!pad || pad.type === 'none') return false;
    padClipboard = Deck.normalizePad(JSON.parse(JSON.stringify(pad)));
    const lbl = pad.label || Deck.padFallbackLabel?.(pad, idx, page.cols) || pad.type;
    Deck.setMsg(`Copied "${lbl}"`);
    return true;
  }

  function pastePad(idx, pageId, { styleOnly = false } = {}) {
    if (!padClipboard) return false;
    const page = pageId
      ? (Deck.cfg?.pages || []).find((p) => p.id === pageId)
      : Deck.getActivePage();
    if (!page || idx < 0 || idx >= page.pads.length) return false;
    const target = page.pads[idx];
    if (styleOnly && (!target || target.type === 'none')) return false;

    Deck.pushHistory(() => {
      if (styleOnly) {
        const next = JSON.parse(JSON.stringify(target));
        const styleKeys = ['icon', 'color', 'colorStyle', 'image', 'imageFit', 'hideLabel'];
        for (const k of styleKeys) {
          if (padClipboard[k] !== undefined && padClipboard[k] !== '') next[k] = padClipboard[k];
          else delete next[k];
        }
        page.pads[idx] = Deck.normalizePad(next);
        Deck.saveCfg();
        Deck.renderGrid();
        Deck.setMsg('Pasted pad style');
      } else {
        if (typeof Deck.abortPadTimer === 'function') Deck.abortPadTimer(page.id, idx);
        page.pads[idx] = Deck.normalizePad(JSON.parse(JSON.stringify(padClipboard)));
        Deck.saveCfg();
        Deck.renderGrid();
        const lbl = padClipboard.label || Deck.padFallbackLabel?.(padClipboard, idx, page.cols) || padClipboard.type;
        Deck.setMsg(`Pasted "${lbl}"`);
      }
    });
    return true;
  }

  // Floating Right-Click Context Menu (Pads & Page Tabs)
  function closeContextMenu() {
    const menu = $('ctx-menu');
    if (menu) {
      menu.hidden = true;
      menu.innerHTML = '';
    }
    const ws = Deck.machines?.workspace;
    if (ws?.context?.popover === 'context_menu') {
      ws.send('CLOSE_POPOVER', { popover: 'context_menu' });
    }
  }

  function positionContextMenu(menu, clientX, clientY) {
    menu.hidden = false;
    menu.style.left = '0px';
    menu.style.top = '0px';
    const rect = menu.getBoundingClientRect();
    const pad = 8;
    const vw = window.innerWidth || 800;
    const vh = window.innerHeight || 600;
    const x = Math.max(pad, Math.min(clientX, vw - rect.width - pad));
    const y = Math.max(pad, Math.min(clientY, vh - rect.height - pad));
    menu.style.left = `${Math.round(x)}px`;
    menu.style.top = `${Math.round(y)}px`;
  }

  function addCtxButton(container, { id, label, action, danger = false, disabled = false, hint = '', onClick }) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'ctx-item' + (danger ? ' ctx-item-danger' : '');
    b.setAttribute('role', 'menuitem');
    if (id) b.id = id;
    if (action) b.dataset.ctxAction = action;
    b.disabled = Boolean(disabled);
    b.innerHTML = `<span class="ctx-lbl">${esc(label)}</span>` + (hint ? `<span class="ctx-hint">${esc(hint)}</span>` : '');
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      if (disabled) return;
      onClick?.();
    });
    container.appendChild(b);
    return b;
  }

  function addCtxSep(container) {
    const sep = document.createElement('div');
    sep.className = 'ctx-sep';
    sep.setAttribute('role', 'separator');
    container.appendChild(sep);
  }

  function openPadContextMenu(idx, event) {
    const menu = $('ctx-menu');
    const page = Deck.getActivePage();
    if (!menu || !page || idx < 0 || idx >= page.pads.length) return;
    const p = page.pads[idx] || { type: 'none' };
    const isConfigured = p.type !== 'none';
    const hasClip = Boolean(padClipboard);
    const otherPages = (Deck.cfg?.pages || []).filter((d) => d.id !== page.id);

    Deck.machines?.workspace?.send('OPEN_POPOVER', { popover: 'context_menu' });
    menu.innerHTML = '';

    const padTitle = isConfigured
      ? (p.label || Deck.padFallbackLabel?.(p, idx, page.cols) || `Pad ${idx + 1}`)
      : `Empty Slot ${idx + 1}`;
    const header = document.createElement('div');
    header.className = 'ctx-head';
    header.textContent = padTitle;
    menu.appendChild(header);

    addCtxButton(menu, {
      id: 'ctx-pad-edit',
      label: isConfigured ? 'Edit Pad…' : 'Configure Pad…',
      action: 'edit',
      onClick: () => {
        closeContextMenu();
        Deck.openPadEditor(idx, page.id);
      },
    });

    if (isConfigured) {
      addCtxButton(menu, {
        id: 'ctx-pad-run',
        label: 'Run Pad',
        action: 'run',
        onClick: () => {
          closeContextMenu();
          Deck.onPadClick?.(idx, page.id);
        },
      });
    }

    if (isConfigured || hasClip) addCtxSep(menu);

    if (isConfigured) {
      addCtxButton(menu, {
        id: 'ctx-pad-dup',
        label: 'Duplicate to Empty Slot',
        action: 'dup',
        onClick: () => {
          closeContextMenu();
          Deck.pushHistory(() => {
            const dstIdx = Deck.duplicatePad(idx, page.id, page.id);
            if (dstIdx >= 0) Deck.locatePad?.(dstIdx, page.id);
          });
        },
      });
      addCtxButton(menu, {
        id: 'ctx-pad-copy',
        label: 'Copy Pad',
        action: 'copy',
        onClick: () => {
          closeContextMenu();
          copyPad(idx, page.id);
        },
      });
    }

    if (hasClip) {
      addCtxButton(menu, {
        id: 'ctx-pad-paste',
        label: isConfigured ? 'Paste Pad (Replace)' : 'Paste Pad',
        action: 'paste',
        onClick: () => {
          closeContextMenu();
          pastePad(idx, page.id, { styleOnly: false });
        },
      });
      if (isConfigured) {
        addCtxButton(menu, {
          id: 'ctx-pad-paste-style',
          label: 'Paste Style Only',
          action: 'paste-style',
          onClick: () => {
            closeContextMenu();
            pastePad(idx, page.id, { styleOnly: true });
          },
        });
      }
    }

    if (isConfigured && otherPages.length > 0) {
      const subWrap = document.createElement('div');
      subWrap.className = 'ctx-sub-list';
      subWrap.hidden = true;
      for (const dst of otherPages) {
        addCtxButton(subWrap, {
          label: dst.name || 'Page',
          action: 'move-page',
          onClick: () => {
            closeContextMenu();
            Deck.pushHistory(() => {
              Deck.movePadToPage(idx, dst.id, page.id);
            });
          },
        });
      }
      addCtxButton(menu, {
        id: 'ctx-pad-move',
        label: 'Move to Page',
        hint: '▸',
        action: 'move-toggle',
        onClick: () => {
          subWrap.hidden = !subWrap.hidden;
          const rect = menu.getBoundingClientRect();
          positionContextMenu(menu, rect.left, rect.top);
        },
      });
      menu.appendChild(subWrap);
    }

    if (isConfigured) {
      addCtxSep(menu);
      addCtxButton(menu, {
        id: 'ctx-pad-clear',
        label: 'Clear Pad',
        action: 'clear',
        danger: true,
        onClick: () => {
          closeContextMenu();
          if (typeof Deck.abortPadTimer === 'function') Deck.abortPadTimer(page.id, idx);
          Deck.pushHistory(() => {
            page.pads[idx] = Deck.normalizePad({ type: 'none' });
            Deck.saveCfg();
            Deck.renderGrid();
            Deck.setMsg(`Cleared slot ${idx + 1}`);
          });
        },
      });
    }

    const pt = getEventPoint(event, event?.currentTarget);
    positionContextMenu(menu, pt.x, pt.y);
  }

  function openPageContextMenu(pageId, event) {
    const menu = $('ctx-menu');
    const page = (Deck.cfg?.pages || []).find((p) => p.id === pageId);
    if (!menu || !page) return;
    const isLastPage = (Deck.cfg?.pages?.length || 0) <= 1;

    Deck.machines?.workspace?.send('OPEN_POPOVER', { popover: 'context_menu' });
    menu.innerHTML = '';

    const header = document.createElement('div');
    header.className = 'ctx-head';
    header.textContent = page.name || 'Page';
    menu.appendChild(header);

    addCtxButton(menu, {
      id: 'ctx-page-settings',
      label: 'Page & Grid Settings…',
      action: 'page-settings',
      onClick: () => {
        closeContextMenu();
        if (Deck.cfg.activePageId !== page.id) Deck.setActivePage(page.id);
        openPageDialog();
      },
    });
    addCtxButton(menu, {
      id: 'ctx-page-dup',
      label: 'Duplicate Page',
      action: 'page-dup',
      onClick: () => {
        closeContextMenu();
        Deck.clearSelection?.();
        Deck.pushHistory(() => {
          const copy = Deck.duplicatePage(page.id);
          if (copy) Deck.setMsg(`Duplicated "${page.name}" -> "${copy.name}"`);
        });
      },
    });
    addCtxButton(menu, {
      id: 'ctx-page-export',
      label: 'Export This Page',
      action: 'page-export',
      onClick: () => {
        closeContextMenu();
        const slug = String(page.name || 'page').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'page';
        downloadPagesJson([page.id], `opendeck-${slug}.json`);
      },
    });
    addCtxButton(menu, {
      id: 'ctx-page-manage',
      label: 'Manage All Pages…',
      action: 'page-manage',
      onClick: () => {
        closeContextMenu();
        openPagesManager();
      },
    });
    addCtxSep(menu);
    addCtxButton(menu, {
      id: 'ctx-page-del',
      label: 'Delete Page',
      action: 'page-del',
      danger: true,
      disabled: isLastPage,
      onClick: async () => {
        closeContextMenu();
        if ((Deck.cfg?.pages?.length || 0) <= 1) return;
        if (!confirm(`Delete Page "${page.name}" and its pads?`)) return;
        await Deck.pushHistory(async () => {
          await Deck.deletePage(page.id);
          if ($('msg-info')?.textContent !== 'No snapshot was saved') {
            Deck.setMsg(`Deleted Page "${page.name}"`);
          }
        });
      },
    });

    const pt = getEventPoint(event, event?.currentTarget);
    positionContextMenu(menu, pt.x, pt.y);
  }

  function getEventPoint(e, targetEl) {
    if (e && (e.clientX || e.clientY)) return { x: e.clientX, y: e.clientY };
    const rect = targetEl?.getBoundingClientRect?.();
    if (rect) return { x: rect.left + rect.width * 0.5, y: rect.top + rect.height * 0.5 };
    return { x: 24, y: 24 };
  }

  document.addEventListener('click', (e) => {
    if (!e.target?.closest?.('#ctx-menu')) closeContextMenu();
  });
  window.addEventListener('resize', closeContextMenu);
  $('deck-tabs')?.addEventListener('scroll', closeContextMenu, { passive: true });

  Deck.generateQrSvg = generateClientQrSvg;
  Deck.openPageDialog = openPageDialog;
  Deck.openPanicDialog = openPanicDialog;
  Deck.openAutoImportWizard = openAutoImportWizard;
  Deck.openPhoneHostDialog = openPhoneHostDialog;
  Deck.syncPhoneHostLayout = syncPhoneHostLayout;
  Deck.openPagesManager = openPagesManager;
  Deck.openQuickSearch = openQuickSearch;
  Deck.openPadContextMenu = openPadContextMenu;
  Deck.openPageContextMenu = openPageContextMenu;
  Deck.closeContextMenu = closeContextMenu;
  Deck.copyPad = copyPad;
  Deck.pastePad = pastePad;
  Deck.getPadClipboard = () => (padClipboard ? JSON.parse(JSON.stringify(padClipboard)) : null);
})();
