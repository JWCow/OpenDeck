(() => {
  'use strict';

  const Deck = window.Deck;
  const { $ } = Deck;

  const FONT_SCALES = ['sm', 'md', 'lg', 'xl', 'xxl'];
  const DEFAULT_FONT_SCALE = 'xl';

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

  function getCleanViewPref() {
    try {
      return localStorage.getItem('opendeck_clean_view') === '1';
    } catch {}
    return false;
  }

  function applyCleanView(enabled, { persist = true } = {}) {
    const on = Boolean(enabled);
    if (on) document.documentElement.dataset.clean = '1';
    else delete document.documentElement.dataset.clean;
    if (persist) {
      try {
        localStorage.setItem('opendeck_clean_view', on ? '1' : '0');
      } catch {}
    }
    const btn = $('btn-clean-view');
    if (btn) {
      btn.classList.toggle('on', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  }

  function initCleanView() {
    const cleanParam = new URLSearchParams(location.search).get('clean');
    if (cleanParam === '1' || cleanParam === 'true') applyCleanView(true, { persist: false });
    else if (cleanParam === '0' || cleanParam === 'false') applyCleanView(false, { persist: false });
    else applyCleanView(getCleanViewPref(), { persist: false });

    $('btn-clean-view')?.addEventListener('click', () => {
      applyCleanView(document.documentElement.dataset.clean !== '1', { persist: true });
    });
    $('btn-clean-exit')?.addEventListener('click', () => {
      applyCleanView(false, { persist: true });
    });
    $('btn-clean-panic')?.addEventListener('click', Deck.runPanic);
  }

  // Overflow menu: secondary toolbar actions live behind the ⋯ button.
  function setMoreMenu(open) {
    const wsMachine = Deck.machines?.workspace;
    if (wsMachine) {
      wsMachine.send(open ? 'OPEN_POPOVER' : 'CLOSE_POPOVER', { popover: 'more_menu' });
      return;
    }
    const menu = $('more-menu');
    const btn = $('btn-more');
    if (!menu || !btn) return;
    menu.hidden = !open;
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    btn.classList.toggle('on', open);
  }
  Deck.setMoreMenu = setMoreMenu;
  $('btn-more')?.addEventListener('click', (e) => {
    e.stopPropagation();
    setMoreMenu($('more-menu').hidden);
  });
  $('more-menu')?.addEventListener('click', (e) => {
    // Menu items run and close the menu; the text-size and theme controls stay open for repeat taps.
    if (e.target.closest('.menu-item')) setMoreMenu(false);
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.menu-wrap')) setMoreMenu(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || document.querySelector('dialog[open]')) return;
    const ws = Deck.machines?.workspace;
    if (ws?.context?.popover === 'more_menu' || !$('more-menu')?.hidden) {
      setMoreMenu(false);
      $('btn-more')?.focus();
      return;
    }
    if (ws?.context?.popover === 'color_popover') {
      ws.send('CLOSE_POPOVER', { popover: 'color_popover' });
      $('btn-sel-color')?.focus();
      return;
    }
    if (ws?.context?.submode === 'place') {
      Deck.clearArmedPaletteItem?.();
      Deck.setMsg?.('Cancelled command placement');
      return;
    }
    if (Deck.editMode && (ws?.context?.selectActive || Deck.getSelectedPads?.().size > 0)) {
      Deck.clearSelection?.();
      ws?.send('EXIT_SELECT');
      Deck.updateSelectionUi?.();
      Deck.setMsg?.('Selection cleared');
    }
  });

  // Toolbar & WS
  $('btn-conn-toggle').addEventListener('click', () => $('conn-bar').classList.toggle('open'));
  $('btn-ws-connect').addEventListener('click', () => Deck.connectObs({ manual: true }));
  $('btn-ws-disconnect').addEventListener('click', () => Deck.disconnectObs(true));
  $('btn-sync').addEventListener('click', async () => {
    await Deck.syncObsState();
    Deck.renderPalette();
  });
  $('btn-edit').addEventListener('click', () => {
    Deck.machines?.workspace?.send('TOGGLE_EDIT');
    Deck.updateUndoRedoUi?.();
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
  Deck.importLayout = async (d, sourceName = 'layout') => {
    const currentPassword = Deck.getCurrentPassword();
    let snapFailed = false;
    if (typeof Deck.createSnapshot === 'function') {
      try {
        const s = await Deck.createSnapshot('Before Import');
        if (s === null && Deck.snapshotsAvailable) snapFailed = true;
      } catch {
        snapFailed = true;
      }
    }
    Deck.clearSelection();
    if (typeof Deck.abortAllTimers === 'function') Deck.abortAllTimers();
    Deck.cfg = Deck.migrateConfig(d, currentPassword);
    Deck.syncWsInputs();
    Deck.saveCfg();
    Deck.renderGrid();
    Deck.syncPageLockButton?.();
    if (Deck.obs.status === 'ok') await Deck.syncObsState();
    if (snapFailed) {
      Deck.setMsg('No snapshot was saved');
    } else {
      Deck.setMsg(`Imported ${sourceName}`);
    }
  };

  Deck.importFromLink = async (url) => {
    if (!url) return;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json();
      if (d && d.ws) {
        delete d.ws.password;
        // A link such as ?host=192.168.1.12 names the OBS to use here; the exporting PC's 127.0.0.1 must not override it.
        const urlHost = Deck.getUrlHost?.();
        const urlPort = Deck.getUrlPort?.();
        if (urlHost) d.ws.host = urlHost;
        if (urlPort) d.ws.port = urlPort;
      }
      await Deck.importLayout(d, url);
      return d;
    } catch (err) {
      Deck.setMsg(`Import error: ${err.message}`);
      throw err;
    }
  };

  Deck.mergeFromLink = async (url) => {
    if (!url) return;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json();
      return await Deck.mergePages(d, url);
    } catch (err) {
      Deck.setMsg(`Import error: ${err.message}`);
      throw err;
    }
  };

  $('btn-import').addEventListener('click', () => $('file-import').click());
  $('btn-merge-pages')?.addEventListener('click', () => $('file-merge-pages')?.click());
  const importLinkMachine = Deck.createMachine({
    id: 'importLink',
    initial: 'closed',
    context: { error: '' },
    transitions: {
      closed: { OPEN: { target: 'idle', action: (ctx) => { ctx.error = ''; } } },
      idle: {
        INVALID: { target: 'invalid', action: (ctx, p) => { ctx.error = p?.error || ''; } },
        SUBMIT: { target: 'fetching', action: (ctx) => { ctx.error = ''; } },
        CLOSE: 'closed',
      },
      invalid: {
        INPUT: { target: 'idle', action: (ctx) => { ctx.error = ''; } },
        INVALID: { target: 'invalid', action: (ctx, p) => { ctx.error = p?.error || ''; } },
        SUBMIT: { target: 'fetching', action: (ctx) => { ctx.error = ''; } },
        CLOSE: 'closed',
      },
      fetching: {
        SUCCESS: 'closed',
        FAIL: { target: 'error', action: (ctx, p) => { ctx.error = p?.error || ''; } },
        CLOSE: 'closed',
      },
      error: {
        INPUT: { target: 'idle', action: (ctx) => { ctx.error = ''; } },
        INVALID: { target: 'invalid', action: (ctx, p) => { ctx.error = p?.error || ''; } },
        SUBMIT: { target: 'fetching', action: (ctx) => { ctx.error = ''; } },
        CLOSE: 'closed',
      },
    },
  });

  function openImportLinkDialog() {
    const dlg = $('import-link-dlg');
    const urlInput = $('import-link-url');
    const errEl = $('import-link-err');
    const submitBtn = $('btn-import-link-submit');
    if (!dlg || !urlInput) return;
    urlInput.value = '';
    if (errEl) {
      errEl.textContent = '';
      errEl.hidden = true;
    }
    if (submitBtn) submitBtn.disabled = false;
    importLinkMachine.send('OPEN');
    if (!dlg.open) dlg.showModal();
    urlInput.focus();
  }

  $('btn-import-link')?.addEventListener('click', openImportLinkDialog);
  $('import-link-dlg')?.addEventListener('close', () => importLinkMachine.send('CLOSE'));
  $('import-link-close')?.addEventListener('click', () => $('import-link-dlg')?.close());
  $('btn-import-link-cancel')?.addEventListener('click', () => $('import-link-dlg')?.close());
  $('import-link-url')?.addEventListener('input', () => {
    importLinkMachine.send('INPUT');
    const errEl = $('import-link-err');
    if (errEl && !errEl.hidden) {
      errEl.textContent = '';
      errEl.hidden = true;
    }
  });
  $('import-link-dlg')?.addEventListener('click', (e) => {
    const dlg = $('import-link-dlg');
    if (!dlg || e.target !== dlg) return;
    const rect = dlg.getBoundingClientRect();
    const inDialog = (
      e.clientX >= rect.left && e.clientX <= rect.right
      && e.clientY >= rect.top && e.clientY <= rect.bottom
    );
    if (!inDialog) dlg.close();
  });
  $('import-link-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const dlg = $('import-link-dlg');
    const urlInput = $('import-link-url');
    const errEl = $('import-link-err');
    const submitBtn = $('btn-import-link-submit');
    const showErr = (msg) => {
      if (errEl) {
        errEl.textContent = msg;
        errEl.hidden = false;
      }
      urlInput?.focus();
    };
    const raw = String(urlInput?.value || '').trim();
    if (!raw) {
      const msg = 'Please enter a layout JSON URL.';
      importLinkMachine.send('INVALID', { error: msg });
      showErr(msg);
      return;
    }
    const valid = Deck.isValidHttpUrl ? Deck.isValidHttpUrl(raw) : /^https?:\/\//i.test(raw);
    if (!valid) {
      const msg = 'Enter a valid http:// or https:// URL.';
      importLinkMachine.send('INVALID', { error: msg });
      showErr(msg);
      return;
    }
    if (errEl) {
      errEl.textContent = '';
      errEl.hidden = true;
    }
    importLinkMachine.send('SUBMIT');
    if (submitBtn) submitBtn.disabled = true;
    try {
      await Deck.importFromLink(raw);
      importLinkMachine.send('SUCCESS');
      dlg?.close();
    } catch (err) {
      const msg = 'Import failed: ' + (err?.message || 'Unable to load URL');
      importLinkMachine.send('FAIL', { error: msg });
      showErr(msg);
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });
  $('file-import').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const d = JSON.parse(await file.text());
      await Deck.importLayout(d, file.name);
    } catch (err) {
      Deck.setMsg(`Import error: ${err.message}`);
    }
  });
  $('file-merge-pages')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const d = JSON.parse(await file.text());
      await Deck.mergePages(d, file.name);
    } catch (err) {
      Deck.setMsg(`Import error: ${err.message}`);
    }
  });
  $('btn-reset-layout').addEventListener('click', async () => {
    if (!confirm('Reset all Pages, pads, and PANIC steps to starter defaults?')) return;
    let snapFailed = false;
    if (typeof Deck.createSnapshot === 'function') {
      try {
        const s = await Deck.createSnapshot('Before Reset');
        if (s === null && Deck.snapshotsAvailable) snapFailed = true;
      } catch {
        snapFailed = true;
      }
    }
    Deck.clearSelection();
    if (typeof Deck.abortAllTimers === 'function') Deck.abortAllTimers();
    Deck.cfg.pages = Deck.defaultPages();
    Deck.cfg.activePageId = Deck.cfg.pages[0].id;
    Deck.cfg.panicSteps = [];
    Deck.saveCfg();
    Deck.renderGrid();
    Deck.syncPageLockButton?.();
    if (snapFailed) {
      Deck.setMsg('No snapshot was saved');
    } else {
      Deck.setMsg('Deck reset to starter defaults');
    }
  });

  // Desktop App integration (Electron preload bridge; no-op on file:// and Phone Deck)
  function initDesktopBridge() {
    const api = window.opendeckDesktop;
    if (!api) return;

    const aotBtn = $('btn-desktop-aot');
    const redetectBtn = $('btn-desktop-redetect');
    const phoneHostBtn = $('btn-phone-host');
    if (aotBtn) aotBtn.hidden = false;
    if (redetectBtn) redetectBtn.hidden = false;
    if (phoneHostBtn) phoneHostBtn.hidden = false;

    const syncAotUi = (enabled) => {
      const on = Boolean(enabled);
      if (aotBtn) {
        aotBtn.textContent = `Always on Top: ${on ? 'On' : 'Off'}`;
        aotBtn.classList.toggle('on', on);
        aotBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
      }
    };

    api.getAlwaysOnTop?.().then(syncAotUi).catch(() => {});
    api.onAlwaysOnTopChange?.(syncAotUi);

    aotBtn?.addEventListener('click', async () => {
      try {
        const cur = await api.getAlwaysOnTop?.();
        const next = await api.setAlwaysOnTop?.(!cur);
        syncAotUi(next);
      } catch {}
    });

    const applyDiscoveredObsPort = (info, { force = false } = {}) => {
      if (!info || !info.enabled || !info.port) {
        if (force) Deck.setMsg('OBS WebSocket server not enabled in local OBS config');
        return;
      }
      const nextPort = Number(info.port);
      if (!Number.isInteger(nextPort) || nextPort < 1 || nextPort > 65535) return;
      if (!force && Deck.cfg?.ws?.manualPort) return;
      const changed = Number(Deck.cfg?.ws?.port) !== nextPort;
      if (force) delete Deck.cfg.ws.manualPort;
      if (changed || force) {
        Deck.cfg.ws.port = nextPort;
        Deck.syncWsInputs();
        Deck.saveCfg();
      }
      if (Deck.obs.status !== 'ok') {
        Deck.setMsg(`Detected OBS WebSocket on port ${nextPort}`);
        Deck.connectObs({ isBoot: false });
      } else if (force) {
        Deck.setMsg(`OBS WebSocket port: ${nextPort}`);
      }
    };

    redetectBtn?.addEventListener('click', async () => {
      try {
        const info = await api.rediscoverObsPort?.();
        applyDiscoveredObsPort(info, { force: true });
      } catch (err) {
        Deck.setMsg(`Port detection failed: ${err?.message || 'Error'}`);
      }
    });

    api.onObsPortChanged?.((info) => {
      if (Deck.obs.status !== 'ok') {
        applyDiscoveredObsPort(info, { force: false });
      }
    });

    phoneHostBtn?.addEventListener('click', () => {
      Deck.openPhoneHostDialog?.();
    });

    api.onTriggerPanic?.(() => {
      Deck.runPanic?.();
    });

    api.onTriggerPad?.((target) => {
      if (Deck.editMode || !target) return;
      const idx = Number(target.padIdx);
      const pageId = typeof target.pageId === 'string' ? target.pageId : Deck.cfg?.activePageId;
      if (!Number.isInteger(idx) || idx < 0) return;
      Deck.onPadClick?.(idx, pageId);
    });

    api.onSwitchPage?.((payload) => {
      if (payload?.pageId) Deck.setActivePage?.(payload.pageId);
    });

    let lastStatusJson = '';
    const pushDesktopStatus = () => {
      if (typeof api.updateStatus !== 'function') return;
      const payload = {
        connected: Deck.obs.status === 'ok',
        streaming: Boolean(Deck.obs.outputs?.stream),
        recording: Boolean(Deck.obs.outputs?.record),
        programScene: String(Deck.obs.programScene || ''),
        activePageId: String(Deck.cfg?.activePageId || ''),
        pages: (Deck.cfg?.pages || []).map((p) => ({
          id: String(p.id || ''),
          name: String(p.name || 'Page'),
        })),
      };
      const serialized = JSON.stringify(payload);
      if (serialized === lastStatusJson) return;
      lastStatusJson = serialized;
      try {
        api.updateStatus(payload);
      } catch {}
    };

    let phoneSyncTimer = null;
    const schedulePhoneLayoutSync = () => {
      if (typeof Deck.syncPhoneHostLayout !== 'function') return;
      if (phoneSyncTimer) clearTimeout(phoneSyncTimer);
      phoneSyncTimer = setTimeout(() => {
        phoneSyncTimer = null;
        Deck.syncPhoneHostLayout();
      }, 250);
    };

    for (const fnName of ['setConn', 'updateSceneHeader', 'renderGrid', 'renderPageBar']) {
      const orig = Deck[fnName];
      if (typeof orig === 'function') {
        Deck[fnName] = (...args) => {
          const res = orig(...args);
          pushDesktopStatus();
          return res;
        };
      }
    }

    const origSaveCfg = Deck.saveCfg;
    if (typeof origSaveCfg === 'function') {
      Deck.saveCfg = (...args) => {
        const res = origSaveCfg(...args);
        pushDesktopStatus();
        schedulePhoneLayoutSync();
        return res;
      };
    }

    pushDesktopStatus();
  }

  // Phone Deck progressive enhancements: Wake Lock, Haptics, and non-blocking live layout update banner
  function initPhoneUxAndLiveLayoutBanner() {
    let wakeLockSentinel = null;
    const syncWakeLock = async () => {
      if (typeof navigator === 'undefined' || !navigator.wakeLock || typeof navigator.wakeLock.request !== 'function') return;
      const wantLock = Deck.obs.status === 'ok' && document.visibilityState === 'visible';
      if (wantLock && !wakeLockSentinel) {
        try {
          wakeLockSentinel = await navigator.wakeLock.request('screen');
          wakeLockSentinel?.addEventListener?.('release', () => {
            wakeLockSentinel = null;
          });
        } catch {
          wakeLockSentinel = null;
        }
      } else if (!wantLock && wakeLockSentinel) {
        const cur = wakeLockSentinel;
        wakeLockSentinel = null;
        try { await cur.release(); } catch {}
      }
    };

    document.addEventListener('visibilitychange', () => {
      syncWakeLock();
    });
    const origSetConn = Deck.setConn;
    if (typeof origSetConn === 'function') {
      Deck.setConn = (...args) => {
        const res = origSetConn(...args);
        syncWakeLock();
        return res;
      };
    }
    syncWakeLock();

    const triggerHaptic = (pattern) => {
      try {
        if (localStorage.getItem('opendeck_haptics') === '0') return;
      } catch {}
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        try { navigator.vibrate(pattern); } catch {}
      }
    };

    $('grid')?.addEventListener('pointerdown', (e) => {
      if (Deck.editMode) return;
      const padEl = e.target?.closest?.('.pad');
      if (!padEl || padEl.classList.contains('empty')) return;
      triggerHaptic(12);
    });
    $('btn-panic')?.addEventListener('click', () => triggerHaptic([15, 30, 15]));
    $('btn-clean-panic')?.addEventListener('click', () => triggerHaptic([15, 30, 15]));

    // Poll /layout-version over HTTP/HTTPS (Phone Deck LAN host) for live layout updates
    const isHttpOrigin = location.protocol === 'http:' || location.protocol === 'https:';
    const banner = $('layout-update-banner');
    const bannerMachine = Deck.createMachine({
      id: 'layoutBanner',
      initial: (isHttpOrigin && banner) ? 'idle' : 'disabled',
      context: { knownVersion: null, pendingVersion: null, dismissedVersion: null },
      transitions: {
        idle: {
          SET_KNOWN: { target: 'idle', action: (ctx, p) => { ctx.knownVersion = p?.version || null; } },
          UPDATE_FOUND: { target: 'update_available', action: (ctx, p) => { ctx.pendingVersion = p?.version || null; } },
          UNSUPPORTED: 'unsupported',
        },
        update_available: {
          APPLY: 'applying',
          DISMISS: { target: 'dismissed', action: (ctx) => { ctx.dismissedVersion = ctx.pendingVersion; } },
          UPDATE_FOUND: { target: 'update_available', action: (ctx, p) => { ctx.pendingVersion = p?.version || null; } },
          UNSUPPORTED: 'unsupported',
        },
        applying: {
          APPLIED: {
            target: 'idle',
            action: (ctx) => {
              ctx.knownVersion = ctx.pendingVersion || ctx.knownVersion;
              ctx.pendingVersion = null;
            },
          },
          APPLY_FAILED: 'update_available',
          UNSUPPORTED: 'unsupported',
        },
        dismissed: {
          UPDATE_FOUND: { target: 'update_available', action: (ctx, p) => { ctx.pendingVersion = p?.version || null; } },
          UNSUPPORTED: 'unsupported',
        },
        unsupported: {},
        disabled: {},
      },
    });
    if (!isHttpOrigin || !banner) return;

    const textEl = $('layout-update-text');
    const reloadBtn = $('btn-layout-reload');
    const mergeBtn = $('btn-layout-merge');
    const dismissBtn = $('btn-layout-dismiss');
    let pollTimer = null;

    const layoutHref = () => new URL('layout.json', location.href).href;
    const versionHref = () => new URL('layout-version', location.href).href;

    const checkLayoutVersion = async () => {
      if (bannerMachine.matches('unsupported', 'disabled', 'applying') || document.visibilityState === 'hidden') return;
      try {
        const res = await fetch(versionHref(), { cache: 'no-store' });
        if (res.status === 404 || res.status === 405) {
          bannerMachine.send('UNSUPPORTED');
          if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
          return;
        }
        if (!res.ok) return;
        const ct = res.headers.get('content-type') || '';
        if (!ct.includes('json')) {
          bannerMachine.send('UNSUPPORTED');
          if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
          return;
        }
        const data = await res.json();
        if (!data || !data.available || !data.version) return;
        const ctx = bannerMachine.context;
        if (ctx.knownVersion === null) {
          bannerMachine.send('SET_KNOWN', { version: data.version });
          return;
        }
        if (data.version !== ctx.knownVersion && data.version !== ctx.dismissedVersion) {
          bannerMachine.send('UPDATE_FOUND', { version: data.version });
          if (textEl) {
            textEl.textContent = data.source
              ? `Updated Deck layout available (${data.source})`
              : 'Updated Deck layout available';
          }
          banner.hidden = false;
        }
      } catch {}
    };

    reloadBtn?.addEventListener('click', async () => {
      if (!bannerMachine.can('APPLY')) return;
      bannerMachine.send('APPLY');
      if (reloadBtn) reloadBtn.disabled = true;
      try {
        await Deck.importFromLink(layoutHref());
        Deck.syncPageLockButton?.();
        bannerMachine.send('APPLIED');
        banner.hidden = true;
      } catch {
        bannerMachine.send('APPLY_FAILED');
      } finally {
        if (reloadBtn) reloadBtn.disabled = false;
      }
    });

    mergeBtn?.addEventListener('click', async () => {
      if (!bannerMachine.can('APPLY')) return;
      bannerMachine.send('APPLY');
      if (mergeBtn) mergeBtn.disabled = true;
      try {
        await Deck.mergeFromLink(layoutHref());
        Deck.syncPageLockButton?.();
        bannerMachine.send('APPLIED');
        banner.hidden = true;
      } catch {
        bannerMachine.send('APPLY_FAILED');
      } finally {
        if (mergeBtn) mergeBtn.disabled = false;
      }
    });

    dismissBtn?.addEventListener('click', () => {
      bannerMachine.send('DISMISS');
      banner.hidden = true;
    });

    checkLayoutVersion();
    pollTimer = setInterval(checkLayoutVersion, 4000);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') checkLayoutVersion();
    });
  }

  // Boot
  initFontScaler();
  initTheme();
  initCleanView();
  Deck.initPaletteResizer();
  if ($('version-badge') && Deck.VERSION) $('version-badge').textContent = `v${Deck.VERSION}`;
  initDesktopBridge();
  initPhoneUxAndLiveLayoutBanner();
  Deck.syncWsInputs();
  Deck.updateUndoRedoUi?.();
  Deck.renderPalette();
  Deck.renderGrid();
  Deck.syncPageLockButton?.();

  // Phone Deck: ?layout=layout.json loads a layout served by the same helper (same origin only), asks before importing, then drops the param.
  const layoutParam = new URLSearchParams(location.search).get('layout');
  if (layoutParam) {
    const u = new URL(layoutParam, location.href);
    const url = new URL(location.href);
    url.searchParams.delete('layout');
    history.replaceState(null, '', url);
    if (u.origin !== location.origin) Deck.setMsg('Ignored layout link from another site');
    else if (confirm('Load the layout from the computer? This replaces the layout on this device (a Snapshot is saved first).')) {
      Deck.importFromLink(u.href).catch(() => {});
    }
  }
  const mergeParam = new URLSearchParams(location.search).get('merge');
  if (mergeParam) {
    const u = new URL(mergeParam, location.href);
    const url = new URL(location.href);
    url.searchParams.delete('merge');
    history.replaceState(null, '', url);
    if (u.origin !== location.origin) Deck.setMsg('Ignored merge link from another site');
    else if (confirm('Append Pages from this layout onto your current Deck? (A Snapshot is saved first.)')) {
      Deck.mergeFromLink(u.href).catch(() => {});
    }
  }
  Deck.connectObs({ isBoot: true });

  document.addEventListener('keydown', (e) => {
    if (document.querySelector('dialog[open]')) return;
    const tag = e.target?.tagName?.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target?.isContentEditable) return;

    if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      const pages = Deck.cfg?.pages || [];
      if (pages.length > 1) {
        e.preventDefault();
        const curIdx = Math.max(0, pages.findIndex((p) => p.id === Deck.cfg.activePageId));
        const delta = e.key === 'ArrowRight' ? 1 : -1;
        const nextPage = pages[(curIdx + delta + pages.length) % pages.length];
        Deck.clearSelection?.();
        Deck.setActivePage?.(nextPage.id);
      }
      return;
    }

    if (!Deck.editMode) return;
    if (!(e.ctrlKey || e.metaKey)) return;

    if (e.key === 'z' || e.key === 'Z') {
      e.preventDefault();
      if (e.shiftKey) {
        Deck.redo();
      } else {
        Deck.undo();
      }
    } else if ((e.key === 'y' || e.key === 'Y') && !e.shiftKey) {
      e.preventDefault();
      Deck.redo();
    }
  });
})();
