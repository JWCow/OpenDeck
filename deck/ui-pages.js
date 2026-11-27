(() => {
  'use strict';

  const Deck = window.Deck;
  const { $ } = Deck;

  let dragIdx = null;
  let dragSourcePageId = '';
  let dragPageId = '';
  let paletteDragItem = null;
  let justDroppedAt = 0;

  function clearDragHighlights() {
    document.querySelectorAll('.pad.drag-over, .pad.dragging, .page-tab.drag-over, .page-tab.dragging').forEach((el) => {
      el.classList.remove('drag-over', 'dragging');
    });
  }

  function movePage(pageId, delta) {
    const pages = Deck.cfg?.pages;
    if (!Array.isArray(pages) || pages.length < 2) return false;
    const fromIdx = pages.findIndex((p) => p.id === pageId);
    if (fromIdx < 0) return false;
    const toIdx = Math.max(0, Math.min(pages.length - 1, fromIdx + Number(delta || 0)));
    if (toIdx === fromIdx) return false;
    Deck.pushHistory(() => {
      const [moved] = pages.splice(fromIdx, 1);
      pages.splice(toIdx, 0, moved);
      Deck.saveCfg();
      Deck.renderPageBar();
    });
    return true;
  }

  function syncPageLockButton() {
    const lockBtn = $('btn-page-lock');
    if (!lockBtn) return;
    const hasLinked = (Deck.cfg?.pages || []).some((p) => Boolean(p.sceneName));
    const locked = typeof Deck.isPageLocked === 'function' ? Boolean(Deck.isPageLocked()) : false;
    lockBtn.hidden = !hasLinked && !locked;
    lockBtn.classList.toggle('on', locked);
    lockBtn.setAttribute('aria-pressed', locked ? 'true' : 'false');
    lockBtn.title = locked
      ? 'Page locked (Scene-Linked auto-switching paused) — click to unlock'
      : 'Lock current Page (pause Scene-Linked auto-switching)';
  }

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
      b.draggable = Boolean(Deck.editMode);
      if (d.sceneName) {
        b.dataset.scene = d.sceneName;
        b.innerHTML = `<span class="page-tab-name">${Deck.esc(d.name || 'Page')}</span> <span class="page-tab-scene">${Deck.esc(d.sceneName)}</span>`;
        b.title = `${d.name} (${d.cols}×${d.rows}) — Linked: ${d.sceneName}`;
      } else {
        b.textContent = d.name || 'Page';
        b.title = `${d.name} (${d.cols}×${d.rows})`;
      }
      b.addEventListener('click', () => {
        if (Date.now() - justDroppedAt < 250) return;
        Deck.clearSelection();
        Deck.setActivePage(d.id);
      });
      b.addEventListener('dragstart', (e) => {
        if (!Deck.editMode) { e.preventDefault(); return; }
        dragPageId = d.id;
        dragIdx = null;
        dragSourcePageId = '';
        b.classList.add('dragging');
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/opendeck-page', d.id);
        }
      });
      b.addEventListener('dragend', () => {
        if (dragPageId) justDroppedAt = Date.now();
        dragPageId = '';
        clearDragHighlights();
      });
      b.addEventListener('dragover', (e) => {
        if (!Deck.editMode) return;
        const isPageDrag = Boolean(dragPageId && dragPageId !== d.id);
        const isPadDrag = dragIdx !== null && d.id !== Deck.getActivePage().id;
        if (!isPageDrag && !isPadDrag) return;
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
        if (!Deck.editMode) return;
        if (dragPageId && dragPageId !== d.id) {
          const srcId = dragPageId;
          dragPageId = '';
          justDroppedAt = Date.now();
          const pages = Deck.cfg.pages;
          const fromIdx = pages.findIndex((p) => p.id === srcId);
          const toIdx = pages.findIndex((p) => p.id === d.id);
          if (fromIdx >= 0 && toIdx >= 0 && fromIdx !== toIdx) {
            Deck.pushHistory(() => {
              const [moved] = pages.splice(fromIdx, 1);
              pages.splice(toIdx, 0, moved);
              Deck.saveCfg();
              Deck.renderPageBar();
            });
          }
          return;
        }
        if (dragIdx === null) return;
        const from = dragIdx;
        const srcPageId = dragSourcePageId;
        dragIdx = null;
        dragSourcePageId = '';
        justDroppedAt = Date.now();
        Deck.pushHistory(() => {
          Deck.movePadToPage(from, d.id, srcPageId);
        });
      });
      tabs.appendChild(b);
    }
    syncPageLockButton();
    const cfgBtn = $('btn-deck-cfg');
    if (cfgBtn) cfgBtn.textContent = `${active.cols}×${active.rows} ⚙`;
  }

  $('btn-page-lock')?.addEventListener('click', () => {
    const cur = typeof Deck.isPageLocked === 'function' ? Boolean(Deck.isPageLocked()) : false;
    const next = !cur;
    if (typeof Deck.setPageLock === 'function') Deck.setPageLock(next);
    syncPageLockButton();
    Deck.setMsg?.(next ? 'Page locked — auto-switching paused' : 'Page unlocked — auto-switching active');
  });

  const MAX_HISTORY = 50;
  const undoStack = [];
  let redoStack = [];

  function cloneLayoutState() {
    return {
      activePageId: Deck.cfg.activePageId,
      pages: JSON.parse(JSON.stringify(Deck.cfg.pages)),
      panicSteps: JSON.parse(JSON.stringify(Deck.cfg.panicSteps || [])),
    };
  }

  function updateUndoRedoUi() {
    const undoBtn = $('btn-undo');
    if (undoBtn) undoBtn.disabled = undoStack.length === 0;
    const redoBtn = $('btn-redo');
    if (redoBtn) redoBtn.disabled = redoStack.length === 0;
  }

  function applyLayoutState(targetState) {
    const oldPages = Deck.cfg.pages || [];
    const newPages = targetState.pages || [];
    const oldPagesMap = new Map(oldPages.map((p) => [p.id, JSON.stringify(p)]));
    const newPagesMap = new Map(newPages.map((p) => [p.id, JSON.stringify(p)]));
    const affected = new Set();
    for (const [id, json] of oldPagesMap) {
      if (newPagesMap.get(id) !== json) affected.add(id);
    }
    for (const id of newPagesMap.keys()) {
      if (!oldPagesMap.has(id)) affected.add(id);
    }
    for (const pid of affected) {
      if (typeof Deck.abortPageTimers === 'function') {
        Deck.abortPageTimers(pid);
      }
    }

    Deck.cfg.pages = JSON.parse(JSON.stringify(newPages));
    Deck.cfg.panicSteps = JSON.parse(JSON.stringify(targetState.panicSteps || []));
    if (newPages.some((p) => p.id === targetState.activePageId)) {
      Deck.cfg.activePageId = targetState.activePageId;
    } else if (newPages.length > 0) {
      Deck.cfg.activePageId = newPages[0].id;
    }
    Deck.saveCfg();
    Deck.renderPageBar();
    Deck.renderGrid();
    Deck.clearSelection();
    updateUndoRedoUi();
  }

  function pushHistory(actionFn) {
    if (typeof actionFn === 'function') {
      const before = cloneLayoutState();
      const res = actionFn();
      if (res && typeof res.then === 'function') {
        return res.then((val) => {
          const after = cloneLayoutState();
          if (JSON.stringify(before) !== JSON.stringify(after)) {
            undoStack.push(before);
            if (undoStack.length > MAX_HISTORY) undoStack.shift();
            redoStack = [];
            updateUndoRedoUi();
          }
          return val;
        });
      }
      const after = cloneLayoutState();
      if (JSON.stringify(before) !== JSON.stringify(after)) {
        undoStack.push(before);
        if (undoStack.length > MAX_HISTORY) undoStack.shift();
        redoStack = [];
        updateUndoRedoUi();
      }
      return res;
    }
    const before = cloneLayoutState();
    undoStack.push(before);
    if (undoStack.length > MAX_HISTORY) undoStack.shift();
    redoStack = [];
    updateUndoRedoUi();
  }

  function undo() {
    if (!Deck.editMode || undoStack.length === 0) return false;
    const current = cloneLayoutState();
    const prev = undoStack.pop();
    redoStack.push(current);
    if (redoStack.length > MAX_HISTORY) redoStack.shift();
    applyLayoutState(prev);
    Deck.setMsg('Undone');
    return true;
  }

  function redo() {
    if (!Deck.editMode || redoStack.length === 0) return false;
    const current = cloneLayoutState();
    const next = redoStack.pop();
    undoStack.push(current);
    if (undoStack.length > MAX_HISTORY) undoStack.shift();
    applyLayoutState(next);
    Deck.setMsg('Redone');
    return true;
  }

  Deck.clearDragHighlights = clearDragHighlights;
  Deck.renderPageBar = renderPageBar;
  Deck.movePage = movePage;
  Deck.syncPageLockButton = syncPageLockButton;
  Deck.getDragState = () => ({ dragIdx, dragSourcePageId, paletteDragItem, justDroppedAt });
  Deck.setDragState = (patch) => {
    if ('dragIdx' in patch) dragIdx = patch.dragIdx;
    if ('dragSourcePageId' in patch) dragSourcePageId = patch.dragSourcePageId;
    if ('paletteDragItem' in patch) paletteDragItem = patch.paletteDragItem;
    if ('justDroppedAt' in patch) justDroppedAt = patch.justDroppedAt;
  };
  Deck.pushHistory = pushHistory;
  Deck.undo = undo;
  Deck.redo = redo;
  Deck.updateUndoRedoUi = updateUndoRedoUi;
})();
