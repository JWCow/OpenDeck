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
      b.textContent = d.name || 'Page';
      b.title = `${d.name} (${d.cols}×${d.rows})`;
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
        Deck.movePadToPage(from, d.id, srcPageId);
      });
      tabs.appendChild(b);
    }
    const cfgBtn = $('btn-deck-cfg');
    if (cfgBtn) cfgBtn.textContent = `${active.cols}×${active.rows} ⚙`;
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
})();
