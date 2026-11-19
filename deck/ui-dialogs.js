(() => {
  'use strict';

  const Deck = window.Deck;
  const { $ } = Deck;

  let draftPanic = [];
  let promptedAutoImportThisSession = false;

  function syncPagePresetHighlight() {
    const c = Number($('d-cols').value);
    const r = Number($('d-rows').value);
    $('d-presets').querySelectorAll('button').forEach((b) => {
      b.classList.toggle('on', Number(b.dataset.cols) === c && Number(b.dataset.rows) === r);
    });
  }

  function openPageDialog() {
    const page = Deck.getActivePage();
    $('d-name').value = page.name || 'Main';
    $('d-cols').value = page.cols;
    $('d-rows').value = page.rows;
    $('btn-deck-del').disabled = Deck.cfg.pages.length <= 1;
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
  $('d-cols').addEventListener('input', syncPagePresetHighlight);
  $('d-rows').addEventListener('input', syncPagePresetHighlight);
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
  $('btn-deck-del').addEventListener('click', () => {
    if (Deck.cfg.pages.length <= 1) return;
    const cur = Deck.getActivePage();
    if (!confirm(`Delete Page "${cur.name}" and its pads?`)) return;
    $('deck-dlg').close();
    Deck.pushHistory(() => {
      Deck.deletePage(cur.id);
      Deck.setMsg(`Deleted Page "${cur.name}"`);
    });
  });
  $('deck-form').addEventListener('submit', () => {
    const cur = Deck.getActivePage();
    const name = $('d-name').value.trim() || cur.name;
    const cols = Number($('d-cols').value) || cur.cols;
    const rows = Number($('d-rows').value) || cur.rows;
    Deck.pushHistory(() => {
      Deck.renamePage(cur.id, name);
      Deck.resizePage(cur.id, cols, rows);
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
  $('import-wiz-form').addEventListener('submit', () => {
    if ($('wiz-mode-starter')?.checked) {
      const selected = $('wiz-starter-layout')?.value || 'Solo Streamer';
      Deck.applyStarterLayout(selected, { replaceEmptyStarter: $('wiz-replace').checked });
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
      return;
    }
    Deck.applyAutoImport(pages, { replaceEmptyStarter: $('wiz-replace').checked });
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

  Deck.openPageDialog = openPageDialog;
  Deck.openPanicDialog = openPanicDialog;
  Deck.openAutoImportWizard = openAutoImportWizard;
})();
