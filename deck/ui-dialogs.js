(() => {
  'use strict';

  const Deck = window.Deck;
  const { $ } = Deck;

  let draftPanic = [];
  let promptedAutoImportThisSession = false;

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

  function syncAutoImportState() {
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

    const summary = $('wiz-summary');
    if (summary) {
      if (isStarterMode) {
        summary.textContent = connected
          ? 'Applies a Starter Layout with broadcast pads and slots filled from OBS Studio (read-only).'
          : 'Applies a Starter Layout with marked empty pads ready to customize.';
      } else {
        if (connected) {
          const { obs } = Deck;
          const filterCount = Object.values(obs.filtersBySource || {}).reduce((acc, arr) => acc + (arr?.length || 0), 0);
          summary.textContent = `Connected to OBS (${obs.scenes.length} scene(s), ${obs.inputs.length} input(s), ${filterCount} filter(s)). Read-only scan — OBS will not be modified.`;
        } else {
          summary.textContent = 'Connect to OBS Studio first to scan your scenes, sources, filters, and audio inputs (read-only).';
        }
      }
    }
    const applyBtn = $('btn-wiz-apply');
    if (applyBtn) {
      applyBtn.disabled = isStarterMode ? false : (!connected || !anyChecked);
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
    syncAutoImportState();
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
    if (el) el.addEventListener('change', syncAutoImportState);
  });
  if ($('wiz-starter-layout')) {
    $('wiz-starter-layout').addEventListener('change', () => {
      if ($('wiz-mode-starter')) $('wiz-mode-starter').checked = true;
      syncAutoImportState();
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
    const pages = Deck.buildAutoImportPages({
      scenes: $('wiz-scenes').checked,
      sources: $('wiz-sources').checked,
      filters: $('wiz-filters').checked,
      broadcast: $('wiz-broadcast').checked,
    });
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

  // Phone Deck Host Dialog (Desktop App only)
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
    const copyBtn = $('btn-phone-copy');

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
      const qrOk = renderQrSvgSafely(qrEl, status.qrSvg);
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
    if (!api?.startPhoneHost || !dlg) return;
    if ($('phone-host-status')) $('phone-host-status').textContent = 'Starting local Phone Deck host…';
    if ($('phone-host-qr')) $('phone-host-qr').hidden = true;
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

  Deck.openPageDialog = openPageDialog;
  Deck.openPanicDialog = openPanicDialog;
  Deck.openAutoImportWizard = openAutoImportWizard;
  Deck.openPhoneHostDialog = openPhoneHostDialog;
  Deck.syncPhoneHostLayout = syncPhoneHostLayout;
})();
