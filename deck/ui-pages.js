(() => {
  'use strict';

  const Deck = window.Deck;
  const { $ } = Deck;

  let dragIdx = null;
  let dragSourcePageId = '';
  let paletteDragItem = null;
  let justDroppedAt = 0;

  function clearDragHighlights() {
    document.querySelectorAll('.pad.drag-over, .pad.dragging, .page-tab.drag-over').forEach((el) => {
      el.classList.remove('drag-over', 'dragging');
    });
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
      if (d.sceneName) {
        b.dataset.scene = d.sceneName;
        b.innerHTML = `<span class="page-tab-name">${Deck.esc(d.name || 'Page')}</span> <span class="page-tab-scene">${Deck.esc(d.sceneName)}</span>`;
        b.title = `${d.name} (${d.cols}×${d.rows}) — Linked: ${d.sceneName}`;
      } else {
        b.textContent = d.name || 'Page';
        b.title = `${d.name} (${d.cols}×${d.rows})`;
      }
      b.addEventListener('click', () => {
        Deck.clearSelection();
        Deck.setActivePage(d.id);
      });
      b.addEventListener('dragover', (e) => {
        if (!Deck.editMode || dragIdx === null || d.id === Deck.getActivePage().id) return;
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
        if (!Deck.editMode || dragIdx === null) return;
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
    const cfgBtn = $('btn-deck-cfg');
    if (cfgBtn) cfgBtn.textContent = `${active.cols}×${active.rows} ⚙`;
  }

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
