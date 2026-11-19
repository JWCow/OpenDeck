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
    delete ws.password;

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

    try {
      const saved = await putSnapshot(snapshot);
      return saved;
    } catch (err) {
      console.warn('Failed to save snapshot:', err);
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

  async function restoreSnapshot(idOrTimestamp) {
    if (!isAvailable) return false;
    const key = Number(idOrTimestamp) || idOrTimestamp;
    let item = null;
    try {
      const db = await openDB();
      item = await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(key);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    } catch {
      return false;
    }
    if (!item) return false;

    // Snapshot current layout first
    await createSnapshot('Before Restore');

    // Abort active timers and clear selection
    if (typeof Deck.clearSelection === 'function') Deck.clearSelection();
    const pageIds = new Set((Deck.cfg?.pages || []).map((p) => p.id));
    if (Deck.activeMacros) {
      for (const k of Deck.activeMacros.keys()) pageIds.add(k.split(':')[0]);
    }
    if (Deck.activeAutoOffs) {
      for (const k of Deck.activeAutoOffs.keys()) pageIds.add(k.split(':')[0]);
    }
    for (const pid of pageIds) {
      if (typeof Deck.abortPageTimers === 'function') Deck.abortPageTimers(pid);
    }

    // Preserve current OBS password
    const currentPassword = (Deck.cfg?.ws?.password) || ($('ws-pass') ? $('ws-pass').value : '') || '';

    const incomingPages = Array.isArray(item.pages) ? item.pages : [];
    const normalizedPages = incomingPages.map((p, idx) => {
      return {
        id: p.id || `page-${idx + 1}`,
        name: p.name || (idx === 0 ? 'Main' : `Page ${idx + 1}`),
        cols: p.cols || 8,
        rows: p.rows || 8,
        pads: (p.pads || []).map(Deck.normalizePad),
      };
    });

    Deck.cfg.pages = normalizedPages;
    Deck.cfg.activePageId = item.activePageId && normalizedPages.some((p) => p.id === item.activePageId)
      ? item.activePageId
      : (normalizedPages[0]?.id || 'page-1');
    Deck.cfg.panicSteps = Array.isArray(item.panicSteps)
      ? item.panicSteps.map(Deck.normalizeStep).filter((s) => s.type !== 'none' && s.type !== 'wait')
      : [];

    if (item.ws) {
      Deck.cfg.ws.host = item.ws.host || Deck.cfg.ws.host || '127.0.0.1';
      Deck.cfg.ws.port = item.ws.port || Deck.cfg.ws.port || 4455;
    }
    Deck.cfg.ws.password = currentPassword;

    if ($('ws-host')) $('ws-host').value = Deck.cfg.ws.host;
    if ($('ws-port')) $('ws-port').value = Deck.cfg.ws.port;
    if ($('ws-pass')) $('ws-pass').value = Deck.cfg.ws.password;

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

  async function renderSnapshotsList() {
    const listEl = $('snapshots-list');
    if (!listEl) return;
    const items = await listSnapshots();
    if (!items.length) {
      listEl.innerHTML = '<div style="padding:16px;text-align:center;color:var(--muted);font-size:12px">No snapshots recorded yet.</div>';
      return;
    }
    listEl.innerHTML = items.map((s) => {
      const pagesCount = s.pageCount || (s.pages ? s.pages.length : 1);
      const desc = s.description ? ` · ${esc(s.description)}` : '';
      return `
        <div class="snapshot-item" data-id="${s.timestamp}">
          <div class="snapshot-meta">
            <span class="snapshot-time">${esc(formatSnapshotTime(s.timestamp))}</span>
            <span class="snapshot-details">${pagesCount} ${pagesCount === 1 ? 'Page' : 'Pages'}${desc}</span>
          </div>
          <button type="button" class="btn sm on btn-snapshot-restore" data-id="${s.timestamp}">Restore</button>
        </div>
      `;
    }).join('');

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
