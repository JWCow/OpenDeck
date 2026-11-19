(() => {
  'use strict';

  const Deck = window.Deck;
  const { $, COLORS } = Deck;

  let selectedPads = new Set();
  let lastSelectedIdx = null;
  let selectMode = false;

  function clearSelection() {
    selectedPads.clear();
    lastSelectedIdx = null;
    updateSelectionUi();
  }

  function updateSelectionUi() {
    const grid = $('grid');
    if (grid) {
      grid.querySelectorAll('.pad').forEach((btn) => {
        const idx = Number(btn.dataset.idx);
        btn.classList.toggle('selected', selectedPads.has(idx));
      });
    }
    const countEl = $('sel-count');
    if (countEl) countEl.textContent = `${selectedPads.size} selected`;
    const selModeBtn = $('btn-sel-mode');
    if (selModeBtn) selModeBtn.classList.toggle('on', selectMode);

    const hasSel = selectedPads.size > 0;
    const dupBtn = $('btn-sel-dup');
    if (dupBtn) dupBtn.disabled = !hasSel;
    const moveSel = $('sel-move-page');
    if (moveSel) {
      moveSel.disabled = !hasSel;
      const curId = Deck.cfg.activePageId;
      moveSel.innerHTML = '<option value="">Move to Page…</option>';
      for (const p of Deck.cfg.pages) {
        if (p.id !== curId) {
          const opt = document.createElement('option');
          opt.value = p.id;
          opt.textContent = p.name || 'Page';
          moveSel.appendChild(opt);
        }
      }
    }
    const colBtn = $('btn-sel-color');
    if (colBtn) colBtn.disabled = !hasSel;
    const clrBtn = $('btn-sel-clear');
    if (clrBtn) clrBtn.disabled = !hasSel;
  }

  function handleSelectionClick(i, e) {
    if (e.ctrlKey || e.metaKey) {
      if (selectedPads.has(i)) selectedPads.delete(i);
      else selectedPads.add(i);
      lastSelectedIdx = i;
      updateSelectionUi();
      return true;
    }
    if (e.shiftKey && lastSelectedIdx !== null) {
      const start = Math.min(lastSelectedIdx, i);
      const end = Math.max(lastSelectedIdx, i);
      for (let k = start; k <= end; k++) selectedPads.add(k);
      updateSelectionUi();
      return true;
    }
    if (selectMode) {
      if (selectedPads.has(i)) selectedPads.delete(i);
      else selectedPads.add(i);
      lastSelectedIdx = i;
      updateSelectionUi();
      return true;
    }
    return false;
  }

  $('btn-sel-mode')?.addEventListener('click', () => {
    selectMode = !selectMode;
    updateSelectionUi();
    Deck.setMsg(selectMode ? 'Select mode: click pads to select / deselect' : 'Select mode off');
  });

  $('btn-sel-all')?.addEventListener('click', () => {
    const page = Deck.getActivePage();
    const nonEmpty = page.pads.map((p, idx) => p && p.type !== 'none' ? idx : -1).filter((idx) => idx >= 0);
    if (selectedPads.size === nonEmpty.length && nonEmpty.length > 0) {
      page.pads.forEach((_, idx) => selectedPads.add(idx));
    } else {
      (nonEmpty.length ? nonEmpty : page.pads.map((_, idx) => idx)).forEach((idx) => selectedPads.add(idx));
    }
    updateSelectionUi();
  });

  $('btn-sel-none')?.addEventListener('click', clearSelection);

  $('btn-sel-dup')?.addEventListener('click', () => {
    if (!selectedPads.size) return;
    const newIndices = Deck.duplicatePads(Array.from(selectedPads));
    if (newIndices && newIndices.length) {
      Deck.setMsg(`Duplicated ${newIndices.length} pad(s)`);
      selectedPads = new Set(newIndices);
      updateSelectionUi();
    } else {
      Deck.setMsg('Page is full — could not duplicate');
    }
  });

  $('sel-move-page')?.addEventListener('change', () => {
    const targetPageId = $('sel-move-page').value;
    if (!targetPageId || !selectedPads.size) return;
    const targetPage = Deck.cfg.pages.find((p) => p.id === targetPageId);
    const moved = Deck.movePadsToPage(Array.from(selectedPads), targetPageId);
    clearSelection();
    Deck.setMsg(`Moved ${moved.length} pad(s) to ${targetPage ? targetPage.name : 'target page'}`);
    $('sel-move-page').value = '';
  });

  const selPop = $('sel-color-pop');
  if (selPop) {
    COLORS.forEach((c) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'sw';
      b.style.background = c;
      b.title = c;
      b.addEventListener('click', () => {
        if (!selectedPads.size) return;
        Deck.setPadColors(Array.from(selectedPads), c);
        selPop.hidden = true;
        Deck.setMsg(`Recolored ${selectedPads.size} pad(s)`);
        updateSelectionUi();
      });
      selPop.appendChild(b);
    });
  }
  $('btn-sel-color')?.addEventListener('click', () => {
    if (selPop) selPop.hidden = !selPop.hidden;
  });

  $('btn-sel-clear')?.addEventListener('click', () => {
    if (!selectedPads.size) return;
    const count = selectedPads.size;
    Deck.clearPads(Array.from(selectedPads));
    clearSelection();
    Deck.setMsg(`Cleared ${count} pad(s)`);
  });

  Deck.getSelectedPads = () => selectedPads;
  Deck.clearSelection = clearSelection;
  Deck.updateSelectionUi = updateSelectionUi;
  Deck.handleSelectionClick = handleSelectionClick;
})();
