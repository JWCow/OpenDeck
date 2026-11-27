(() => {
  'use strict';

  const Deck = window.Deck;
  const { $, esc } = Deck;

  const DB_NAME = 'opendeck';
  const DB_VERSION = 1;
  const STORE_NAME = 'snapshots';
  const MAX_SNAPSHOTS = 20;
  const DEFAULT_DEBOUNCE_MS = 2 * 60 * 1000;

  let dbPromise = null;
  let lastTimestamp = 0;
  let debounceTimer = null;
  let isAvailable = true;

  function nextTimestamp() {
    let now = Date.now();
    if (now <= lastTimestamp) {
      now = lastTimestamp + 1;
    }
    lastTimestamp = now;
    return now;
  }

  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (typeof window === 'undefined' || !window.indexedDB) {
        return reject(new Error('IndexedDB unavailable'));
      }
      try {
        const req = window.indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME, { keyPath: 'timestamp' });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error || new Error('Failed to open IndexedDB'));
        req.onblocked = () => reject(new Error('IndexedDB open blocked'));
      } catch (err) {
        reject(err);
      }
    });
    return dbPromise;
  }

  function setSnapshotsAvailable(avail) {
    isAvailable = Boolean(avail);
    Deck.snapshotsAvailable = isAvailable;
    const btn = $('btn-snapshots');
    if (btn) btn.hidden = !isAvailable;
    const dlg = $('snapshots-dlg');
    if (dlg && !isAvailable && dlg.open) dlg.close();
  }

  async function checkAvailability() {
    if (typeof window === 'undefined' || !window.indexedDB) {
      setSnapshotsAvailable(false);
      return false;
    }
    try {
      await openDB();
      setSnapshotsAvailable(true);
      return true;
    } catch {
      setSnapshotsAvailable(false);
      return false;
    }
  }

  function putSnapshot(snapshot) {
    return openDB().then((db) => {
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.put(snapshot);
        const req = store.getAllKeys();
        req.onsuccess = () => {
          const keys = req.result;
          if (keys.length > MAX_SNAPSHOTS) {
            keys.sort((a, b) => Number(a) - Number(b));
            const toDelete = keys.slice(0, keys.length - MAX_SNAPSHOTS);
            for (const k of toDelete) {
              store.delete(k);
            }
          }
        };
        tx.oncomplete = () => resolve(snapshot);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
      });
    });
  }

  async function createSnapshot(description = '') {
    if (!isAvailable) return null;
    const { cfg } = Deck;
    if (!cfg || !Array.isArray(cfg.pages)) return null;

    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }

    const pages = JSON.parse(JSON.stringify(cfg.pages));
    const panicSteps = JSON.parse(JSON.stringify(cfg.panicSteps || []));
    const activePageId = cfg.activePageId;
    const ws = {
      host: cfg.ws?.host || '127.0.0.1',
      port: cfg.ws?.port || 4455,
    };

    const snapshot = {
      timestamp: nextTimestamp(),
      createdAt: new Date().toISOString(),
      description: String(description || ''),
      pageCount: pages.length,
      pages,
      activePageId,
      panicSteps,
      ws,
    };
    if (typeof cfg.fallbackPageId === 'string' && cfg.fallbackPageId) {
      snapshot.fallbackPageId = cfg.fallbackPageId;
    }

    try {
      const saved = await putSnapshot(snapshot);
      return saved;
    } catch (err) {
      console.warn('Failed to save snapshot:', err);
      Deck.setMsg?.('No snapshot was saved');
      return null;
    }
  }

  async function listSnapshots() {
    if (!isAvailable) return [];
    try {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.getAll();
        req.onsuccess = () => {
          const items = req.result || [];
          items.sort((a, b) => Number(b.timestamp) - Number(a.timestamp));
          resolve(items);
        };
        tx.onerror = () => reject(tx.error);
      });
    } catch {
      return [];
    }
  }

  function getSnapshotById(idOrTimestamp) {
    const key = Number(idOrTimestamp) || idOrTimestamp;
    return openDB().then((db) => new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    }));
  }

  function sanitizeSnapshotExport(item) {
    const pages = Array.isArray(item.pages) ? item.pages : [];
    const out = {
      version: 2,
      ws: {
        host: item.ws?.host || '127.0.0.1',
        port: item.ws?.port || 4455,
      },
      activePageId: item.activePageId || pages[0]?.id || 'page-1',
      pages: pages.map((p, idx) => {
        const pg = {
          id: p.id || `page-${idx + 1}`,
          name: p.name || (idx === 0 ? 'Main' : `Page ${idx + 1}`),
          cols: p.cols || 8,
          rows: p.rows || 8,
          pads: (p.pads || []).map(Deck.normalizePad),
        };
        if (p.sceneName) pg.sceneName = String(p.sceneName);
        if (p.fallback) pg.fallback = true;
        if (p.isFallback) pg.isFallback = true;
        return pg;
      }),
      panicSteps: Array.isArray(item.panicSteps)
        ? item.panicSteps.map(Deck.normalizeStep).filter((s) => s.type !== 'none' && s.type !== 'wait')
        : [],
    };
    if (typeof item.fallbackPageId === 'string' && item.fallbackPageId) {
      out.fallbackPageId = item.fallbackPageId;
    }
    return out;
  }

  async function exportSnapshot(idOrTimestamp) {
    if (!isAvailable) return false;
    let item = null;
    try {
      item = await getSnapshotById(idOrTimestamp);
    } catch {
      return false;
    }
    if (!item) return false;
    const out = sanitizeSnapshotExport(item);
    const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `opendeck-snapshot-${item.timestamp}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    return true;
  }

  async function restoreSnapshotPage(idOrTimestamp, pageIndex) {
    if (!isAvailable) return false;
    let item = null;
    try {
      item = await getSnapshotById(idOrTimestamp);
    } catch {
      return false;
    }
    const targetPage = Array.isArray(item?.pages) ? item.pages[Number(pageIndex)] : null;
    if (!targetPage) return false;
    const cloned = JSON.parse(JSON.stringify(targetPage));
    if (typeof Deck.mergePages === 'function') {
      await Deck.mergePages({ version: 2, pages: [cloned] }, `Snapshot (${cloned.name || 'Page'})`);
      return true;
    }
    return false;
  }

  async function restoreSnapshot(idOrTimestamp) {
    if (!isAvailable) return false;
    let item = null;
    try {
      item = await getSnapshotById(idOrTimestamp);
    } catch {
      return false;
    }
    if (!item) return false;

    // Snapshot current layout first
    await createSnapshot('Before Restore');

    // Abort active timers and clear selection
    if (typeof Deck.clearSelection === 'function') Deck.clearSelection();
    if (typeof Deck.abortAllTimers === 'function') Deck.abortAllTimers();

    // Preserve current OBS password
    const currentPassword = typeof Deck.getCurrentPassword === 'function' ? Deck.getCurrentPassword() : '';

    const incomingPages = Array.isArray(item.pages) ? item.pages : [];
    const normalizedPages = incomingPages.map((p, idx) => {
      const pg = {
        id: p.id || `page-${idx + 1}`,
        name: p.name || (idx === 0 ? 'Main' : `Page ${idx + 1}`),
        cols: p.cols || 8,
        rows: p.rows || 8,
        pads: (p.pads || []).map(Deck.normalizePad),
      };
      if (p.sceneName) pg.sceneName = String(p.sceneName);
      if (p.fallback) pg.fallback = true;
      if (p.isFallback) pg.isFallback = true;
      return pg;
    });

    Deck.cfg.pages = normalizedPages;
    Deck.cfg.activePageId = item.activePageId && normalizedPages.some((p) => p.id === item.activePageId)
      ? item.activePageId
      : (normalizedPages[0]?.id || 'page-1');
    if (item.fallbackPageId && normalizedPages.some((p) => p.id === item.fallbackPageId)) {
      Deck.cfg.fallbackPageId = item.fallbackPageId;
    } else {
      delete Deck.cfg.fallbackPageId;
    }
    Deck.cfg.panicSteps = Array.isArray(item.panicSteps)
      ? item.panicSteps.map(Deck.normalizeStep).filter((s) => s.type !== 'none' && s.type !== 'wait')
      : [];

    if (item.ws) {
      Deck.cfg.ws.host = item.ws.host || Deck.cfg.ws.host || '127.0.0.1';
      Deck.cfg.ws.port = item.ws.port || Deck.cfg.ws.port || 4455;
    }
    Deck.cfg.ws.password = currentPassword;

    if (typeof Deck.syncWsInputs === 'function') Deck.syncWsInputs();

    Deck.saveCfg();
    Deck.renderGrid();
    if (Deck.obs && Deck.obs.status === 'ok') {
      await Deck.syncObsState();
    }
    return true;
  }

  function scheduleDebouncedSnapshot() {
    if (!isAvailable) return;
    if (debounceTimer) clearTimeout(debounceTimer);
    const delay = Deck.SNAPSHOT_DEBOUNCE_MS ?? DEFAULT_DEBOUNCE_MS;
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      createSnapshot('Auto-save after edits').catch(() => {});
    }, delay);
  }

  function formatSnapshotTime(ts) {
    try {
      const d = new Date(ts);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' ' + d.toLocaleDateString();
    } catch {
      return String(ts);
    }
  }

  function countConfiguredPads(page) {
    if (!Array.isArray(page?.pads)) return 0;
    let n = 0;
    for (const p of page.pads) {
      if (p && p.type && p.type !== 'none') n++;
    }
    return n;
  }

  async function renderSnapshotsList() {
    const listEl = $('snapshots-list');
    if (!listEl) return;
    const items = await listSnapshots();
    if (!items.length) {
      listEl.innerHTML = '<div class="snapshots-empty">No snapshots recorded yet.</div>';
      return;
    }
    listEl.innerHTML = items.map((s) => {
      const pages = Array.isArray(s.pages) ? s.pages : [];
      const pagesCount = s.pageCount || pages.length || 1;
      const desc = s.description ? ` · ${esc(s.description)}` : '';
      const pagesHtml = pages.length ? `
        <div class="snap-pages">
          ${pages.map((p, idx) => {
            const pName = esc(p.name || (idx === 0 ? 'Main' : `Page ${idx + 1}`));
            const cols = p.cols || 8;
            const rows = p.rows || 8;
            const padCount = countConfiguredPads(p);
            const sceneTag = p.sceneName ? ` · 🔗 ${esc(p.sceneName)}` : '';
            return `
              <div class="snap-page-row">
                <span class="snap-page-info"><strong>${pName}</strong> (${cols}×${rows}, ${padCount} ${padCount === 1 ? 'pad' : 'pads'}${sceneTag})</span>
                <button type="button" class="btn sm btn-snapshot-restore-page" data-id="${s.timestamp}" data-page-idx="${idx}" title="Append this Page onto current Deck">Restore Page</button>
              </div>
            `;
          }).join('')}
        </div>
      ` : '';
      return `
        <div class="snapshot-item" data-id="${s.timestamp}">
          <div class="snapshot-head">
            <div class="snapshot-meta">
              <span class="snapshot-time">${esc(formatSnapshotTime(s.timestamp))}</span>
              <span class="snapshot-details">${pagesCount} ${pagesCount === 1 ? 'Page' : 'Pages'}${desc}</span>
            </div>
            <div class="snapshot-actions">
              <button type="button" class="btn sm btn-snapshot-export" data-id="${s.timestamp}" title="Export snapshot as JSON (passwords omitted)">Export JSON</button>
              <button type="button" class="btn sm on btn-snapshot-restore" data-id="${s.timestamp}">Restore</button>
            </div>
          </div>
          ${pagesHtml}
        </div>
      `;
    }).join('');

    listEl.querySelectorAll('.btn-snapshot-export').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = Number(btn.dataset.id);
        const ok = await exportSnapshot(id);
        Deck.setMsg(ok ? 'Exported snapshot JSON' : 'Failed to export snapshot');
      });
    });

    listEl.querySelectorAll('.btn-snapshot-restore-page').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = Number(btn.dataset.id);
        const pageIdx = Number(btn.dataset.pageIdx);
        btn.disabled = true;
        const ok = await restoreSnapshotPage(id, pageIdx);
        if (ok) {
          $('snapshots-dlg')?.close();
        } else {
          btn.disabled = false;
          Deck.setMsg('Failed to restore Page from snapshot');
        }
      });
    });

    listEl.querySelectorAll('.btn-snapshot-restore').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = Number(btn.dataset.id);
        btn.disabled = true;
        btn.textContent = 'Restoring…';
        const ok = await restoreSnapshot(id);
        if (ok) {
          $('snapshots-dlg')?.close();
          Deck.setMsg('Restored snapshot');
        } else {
          btn.disabled = false;
          btn.textContent = 'Restore';
          Deck.setMsg('Failed to restore snapshot');
        }
      });
    });
  }

  async function openSnapshotsDialog() {
    if (!isAvailable) return;
    const dlg = $('snapshots-dlg');
    if (!dlg) return;
    await renderSnapshotsList();
    dlg.showModal();
  }

  // Hook Deck.saveCfg for debounced snapshots after edits
  const origSaveCfg = Deck.saveCfg;
  Deck.saveCfg = () => {
    const ok = origSaveCfg();
    if (ok) scheduleDebouncedSnapshot();
    return ok;
  };

  Deck.MAX_SNAPSHOTS = MAX_SNAPSHOTS;
  Deck.SNAPSHOT_DB_NAME = DB_NAME;
  Deck.SNAPSHOT_STORE_NAME = STORE_NAME;
  Deck.SNAPSHOT_DEBOUNCE_MS = DEFAULT_DEBOUNCE_MS;
  Deck.snapshotsAvailable = true;
  Deck.setSnapshotsAvailable = setSnapshotsAvailable;
  Deck.createSnapshot = createSnapshot;
  Deck.listSnapshots = listSnapshots;
  Deck.restoreSnapshot = restoreSnapshot;
  Deck.restoreSnapshotPage = restoreSnapshotPage;
  Deck.exportSnapshot = exportSnapshot;
  Deck.scheduleSnapshot = scheduleDebouncedSnapshot;
  Deck.openSnapshotsDialog = openSnapshotsDialog;

  // DOM Event Bindings
  $('btn-snapshots')?.addEventListener('click', openSnapshotsDialog);
  $('snapshots-close')?.addEventListener('click', () => $('snapshots-dlg')?.close());
  $('btn-snapshots-cancel')?.addEventListener('click', () => $('snapshots-dlg')?.close());
  $('btn-snapshot-take')?.addEventListener('click', async () => {
    const btn = $('btn-snapshot-take');
    if (btn) btn.disabled = true;
    await createSnapshot('Manual Snapshot');
    await renderSnapshotsList();
    if (btn) btn.disabled = false;
    Deck.setMsg('Created layout snapshot');
  });

  checkAvailability();
})();
