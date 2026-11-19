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

  // Toolbar & WS
  $('btn-conn-toggle').addEventListener('click', () => $('conn-bar').classList.toggle('open'));
  $('btn-ws-connect').addEventListener('click', () => Deck.connectObs({ manual: true }));
  $('btn-ws-disconnect').addEventListener('click', () => Deck.disconnectObs(true));
  $('btn-sync').addEventListener('click', async () => {
    await Deck.syncObsState();
    Deck.renderPalette();
  });
  $('btn-edit').addEventListener('click', () => {
    Deck.editMode = !Deck.editMode;
    $('btn-edit').classList.toggle('on', Deck.editMode);
    document.body.classList.toggle('edit-mode', Deck.editMode);
    if (!Deck.editMode) {
      Deck.clearSelection();
      const pal = $('palette');
      if (pal) pal.classList.remove('open');
    }
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
  $('btn-import').addEventListener('click', () => $('file-import').click());
  $('file-import').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const d = JSON.parse(await file.text());
      Deck.clearSelection();
      Deck.cfg = Deck.migrateConfig(d);
      $('ws-host').value = Deck.cfg.ws.host;
      $('ws-port').value = Deck.cfg.ws.port;
      Deck.saveCfg();
      Deck.renderGrid();
      if (Deck.obs.status === 'ok') await Deck.syncObsState();
      Deck.setMsg(`Imported ${file.name}`);
    } catch (err) {
      Deck.setMsg(`Import error: ${err.message}`);
    }
  });
  $('btn-reset-layout').addEventListener('click', () => {
    if (!confirm('Reset all Pages, pads, and PANIC steps to starter defaults?')) return;
    Deck.clearSelection();
    for (const p of Deck.cfg.pages) {
      if (typeof Deck.abortPageTimers === 'function') Deck.abortPageTimers(p.id);
    }
    Deck.cfg.pages = Deck.defaultPages();
    Deck.cfg.activePageId = Deck.cfg.pages[0].id;
    Deck.cfg.panicSteps = [];
    Deck.saveCfg();
    Deck.renderGrid();
    Deck.setMsg('Deck reset to starter defaults');
  });

  // Boot
  initFontScaler();
  initTheme();
  Deck.initPaletteResizer();
  if ($('version-badge') && Deck.VERSION) $('version-badge').textContent = `v${Deck.VERSION}`;
  $('ws-host').value = Deck.cfg.ws.host;
  $('ws-port').value = Deck.cfg.ws.port;
  $('ws-pass').value = Deck.cfg.ws.password;
  Deck.renderPalette();
  Deck.renderGrid();
  Deck.connectObs({ isBoot: true });
})();
