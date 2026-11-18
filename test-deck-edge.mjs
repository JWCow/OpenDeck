#!/usr/bin/env node
// Edge-case Playwright E2E tests for deck.html (groups, live events, non-destructive ticks, PANIC resilience,
// v1->v2 localStorage migration, 2D resize preservation, auto-off edge cases, offline dropdown fallback,
// hotkey guardrails, narrow 360x420 dock layout, and release ZIP integrity).
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import zlib from 'node:zlib';
import { chromium } from 'playwright';
import { createFakeObs, PASSWORD } from './test-deck-fake-obs.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DECK_URL = pathToFileURL(join(__dirname, 'deck.html')).href;
const PKG = JSON.parse(fs.readFileSync(join(__dirname, 'package.json'), 'utf8'));

function parseZipEntries(buf) {
  // Locate End of Central Directory (PK\x05\x06)
  let eocdOffset = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  assert.notEqual(eocdOffset, -1, 'ZIP EOCD signature found');
  const totalEntries = buf.readUInt16LE(eocdOffset + 10);
  const cdOffset = buf.readUInt32LE(eocdOffset + 16);
  const entries = [];
  let ptr = cdOffset;
  for (let i = 0; i < totalEntries; i++) {
    assert.equal(buf.readUInt32LE(ptr), 0x02014b50, 'Central directory header signature valid');
    const method = buf.readUInt16LE(ptr + 10);
    const compSize = buf.readUInt32LE(ptr + 20);
    const uncompSize = buf.readUInt32LE(ptr + 24);
    const nameLen = buf.readUInt16LE(ptr + 28);
    const extraLen = buf.readUInt16LE(ptr + 30);
    const commentLen = buf.readUInt16LE(ptr + 32);
    const extAttrs = buf.readUInt32LE(ptr + 38);
    const lfhOffset = buf.readUInt32LE(ptr + 42);
    const name = buf.subarray(ptr + 46, ptr + 46 + nameLen).toString('utf8');
    ptr += 46 + nameLen + extraLen + commentLen;

    assert.equal(buf.readUInt32LE(lfhOffset), 0x04034b50, `LFH signature valid for ${name}`);
    const lfhNameLen = buf.readUInt16LE(lfhOffset + 26);
    const lfhExtraLen = buf.readUInt16LE(lfhOffset + 28);
    const dataStart = lfhOffset + 30 + lfhNameLen + lfhExtraLen;
    const rawComp = buf.subarray(dataStart, dataStart + compSize);
    const data = method === 0 ? rawComp : zlib.inflateRawSync(rawComp);
    assert.equal(data.length, uncompSize, `decompressed size matches for ${name}`);
    entries.push({ name, unixMode: (extAttrs >>> 16) & 0o777, data });
  }
  return entries;
}

console.log('--- OBS Virtual Deck (deck.html) Edge E2E ---');
const { wss, state, broadcast } = createFakeObs(false);
await new Promise((r) => wss.once('listening', r));
const port = wss.address().port;
let browser;

try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  page.on('dialog', (d) => d.accept());

  await page.goto(DECK_URL);
  await page.waitForSelector('#grid .pad');

  // 1a. v1 -> v2.1.0 localStorage migration (all 64 pads & panicSteps survive intact)
  await page.evaluate((p) => {
    const pads = Array.from({ length: 64 }, () => ({ type: 'none', label: '', icon: '', color: '#222733' }));
    pads[0] = { type: 'scene', sceneName: 'Slides', label: 'Migrated Slides', icon: '📺', color: '#1e3a8a' };
    pads[10] = { type: 'filter', sourceName: 'Webcam', filterName: 'Blur', mode: 'toggle', label: 'Migrated Blur', icon: '', color: '#581c87' };
    pads[63] = { type: 'panic', label: 'PANIC', icon: '🚨', color: '#991b1b' };
    localStorage.removeItem('obs_virtual_deck_v2');
    localStorage.setItem('obs_virtual_deck_v1', JSON.stringify({
      ws: { host: '127.0.0.1', port: p, password: '' },
      pads,
      panicSteps: [{ type: 'filter', sourceName: 'Webcam', filterName: 'Blur', mode: 'disable' }],
    }));
  }, port);
  await page.reload();
  await page.waitForSelector('#grid .pad');
  const migrated = await page.evaluate(() => JSON.parse(localStorage.getItem('obs_virtual_deck_v2') || 'null'));
  assert.equal(migrated?.version, 2, 'migrated to v2 storage key');
  assert.equal(migrated.pages.length, 1);
  assert.equal(migrated.activePageId, 'page-1');
  assert.equal(migrated.pages[0].pads.length, 64);
  assert.equal(migrated.pages[0].pads[0].label, 'Migrated Slides');
  assert.equal(migrated.pages[0].pads[10].filterName, 'Blur');
  assert.equal(migrated.pages[0].pads[63].type, 'panic');
  assert.equal(migrated.panicSteps.length, 1);
  assert.ok((await page.locator('#grid .pad').nth(0).textContent()).includes('Migrated Slides'));

  // 1b. v2.0.0 (decks[], activeDeckId, deckId) -> v2.1.0 (pages[], activePageId, pageId) migration
  await page.evaluate((p) => {
    const d1 = Array.from({ length: 12 }, () => ({ type: 'none', label: '', icon: '', color: '#222733' }));
    d1[0] = { type: 'page', mode: 'goto', deckId: 'deck-2', label: 'Jump D2', icon: '', color: '#222733' };
    const d2 = Array.from({ length: 12 }, () => ({ type: 'none', label: '', icon: '', color: '#222733' }));
    d2[1] = { type: 'scene', sceneName: 'BRB', label: 'D2 BRB', icon: '', color: '#1e3a8a' };
    localStorage.removeItem('obs_virtual_deck_v1');
    localStorage.setItem('obs_virtual_deck_v2', JSON.stringify({
      version: 2,
      ws: { host: '127.0.0.1', port: p, password: '' },
      activeDeckId: 'deck-2',
      decks: [
        { id: 'deck-1', name: 'Main', cols: 4, rows: 3, pads: d1 },
        { id: 'deck-2', name: 'Sub', cols: 4, rows: 3, pads: d2 },
      ],
      panicSteps: [],
    }));
  }, port);
  await page.reload();
  await page.waitForSelector('#grid .pad');
  const migratedV20 = await page.evaluate(() => JSON.parse(localStorage.getItem('obs_virtual_deck_v2') || 'null'));
  assert.equal(migratedV20.decks, undefined, 'legacy decks[] replaced by pages[]');
  assert.equal(migratedV20.activePageId, 'deck-2', 'activeDeckId migrated to activePageId');
  assert.equal(migratedV20.pages.length, 2);
  assert.equal(migratedV20.pages[0].pads[0].pageId, 'deck-2', 'page pad deckId migrated to pageId');
  assert.ok((await page.locator('#grid .pad').nth(1).textContent()).includes('D2 BRB'));

  // Reset back to clean defaults before continuing
  await page.evaluate(() => {
    localStorage.removeItem('obs_virtual_deck_v1');
    localStorage.removeItem('obs_virtual_deck_v2');
  });
  await page.reload();
  await page.waitForSelector('#grid .pad');
  console.log('  ✓ v1 & v2.0.0 (decks[]) -> v2.1.0 (pages[]) lossless localStorage migration');

  // 2. ws://host:port normalization + no-auth connect + dismiss auto-import prompt
  await page.click('#btn-conn-toggle');
  await page.fill('#ws-host', `ws://127.0.0.1:${port}`);
  await page.fill('#ws-port', '9999');
  await page.click('#btn-ws-connect');
  await page.waitForFunction(() => document.getElementById('conn-text').textContent === 'Connected');
  assert.equal(await page.inputValue('#ws-host'), '127.0.0.1');
  assert.equal(await page.inputValue('#ws-port'), String(port));
  await page.waitForTimeout(80);
  if (await page.evaluate(() => document.getElementById('import-wiz-dlg').open)) {
    await page.click('#btn-wiz-cancel');
  }
  console.log('  ✓ ws://host:port normalization');

  const pad = (i) => page.locator('#grid .pad').nth(i);
  await page.click('#btn-edit');

  // 3. OBS Group source toggle & filter on group + new mute pad immediate active state
  await pad(0).click();
  await page.selectOption('#f-type', 'source');
  await page.locator('#f-fields select').nth(0).selectOption('Cam Group');
  await page.locator('#f-fields select').nth(1).selectOption('Ring Light Overlay');
  await page.click('#pad-form button[type="submit"]');

  await pad(1).click();
  await page.selectOption('#f-type', 'filter');
  await page.locator('#f-fields select').nth(0).selectOption('Cam Group');
  await page.waitForFunction(() => [...document.querySelectorAll('#f-fields select')[1].options].some((o) => o.value === 'Group Vignette'));
  await page.locator('#f-fields select').nth(1).selectOption('Group Vignette');
  await page.click('#pad-form button[type="submit"]');

  await pad(2).click();
  await page.selectOption('#f-type', 'mute');
  await page.locator('#f-fields select').nth(0).selectOption('Desktop Audio');
  await page.click('#pad-form button[type="submit"]');
  await page.waitForFunction(() => document.querySelectorAll('#grid .pad')[2].className.includes('active'), null, { timeout: 3000 });

  // 4. Stale field cleanup on type switch + delayMs=0 preserved
  await pad(3).click();
  await page.selectOption('#f-type', 'scene');
  await page.locator('#f-fields select').first().selectOption('BRB');
  await page.click('#pad-form button[type="submit"]');
  await pad(3).click();
  await page.selectOption('#f-type', 'mute');
  await page.locator('#f-fields select').first().selectOption('Mic/Aux');
  await page.click('#pad-form button[type="submit"]');
  const p3txt = await pad(3).textContent();
  assert.ok(p3txt.includes('Mic/Aux') && !p3txt.includes('BRB'), 'stale sceneName cleared on type change');

  await pad(4).click();
  await page.selectOption('#f-type', 'macro');
  await page.click('#f-fields button:has-text("+ Add Step")');
  await page.locator('#f-fields .step').nth(0).locator('select').first().selectOption('filter');
  await page.locator('#f-fields .step').nth(0).locator('select').nth(1).selectOption('Webcam');
  await page.waitForFunction(() => [...document.querySelectorAll('#f-fields .step')[0].querySelectorAll('select')[2].options].some((o) => o.value === 'Blur'));
  await page.locator('#f-fields .step').nth(0).locator('select').nth(2).selectOption('Blur');
  await page.locator('#f-fields .step').nth(0).locator('select').nth(3).selectOption('enable');
  await page.click('#f-fields button:has-text("+ Add Step")');
  await page.locator('#f-fields .step').nth(1).locator('select').first().selectOption('wait');
  await page.locator('#f-fields .step').nth(1).locator('input[type="number"]').fill('0');
  await page.click('#pad-form button[type="submit"]');
  await pad(4).click();
  assert.equal(await page.locator('#f-fields .step').nth(1).locator('input[type="number"]').inputValue(), '0', 'delayMs=0 preserved');
  await page.locator('#f-fields .step').nth(1).locator('input[type="number"]').fill('1500');
  await page.click('#pad-form button[type="submit"]');
  await page.click('#btn-edit');

  // Execute group source + group filter + live events
  await pad(0).click();
  await page.waitForFunction(() => document.querySelectorAll('#grid .pad')[0].className.includes('active'));
  assert.equal(state.groupItems['Cam Group'][0].sceneItemEnabled, true);
  await pad(1).click();
  await page.waitForFunction(() => document.querySelectorAll('#grid .pad')[1].className.includes('active'));
  assert.equal(state.filters['Cam Group'][0].filterEnabled, true);

  state.groupItems['Cam Group'][0].sceneItemEnabled = false;
  broadcast('SceneItemCreated', { sceneName: 'Cam Group' });
  await page.waitForFunction(() => !document.querySelectorAll('#grid .pad')[0].className.includes('active'));

  state.filters['Cam Group'][0].filterEnabled = false;
  broadcast('SourceFilterCreated', { sourceName: 'Cam Group' });
  await page.waitForFunction(() => !document.querySelectorAll('#grid .pad')[1].className.includes('active'));

  state.programScene = 'Slides';
  broadcast('SceneListChanged', {});
  await page.waitForFunction(() => document.getElementById('scene-info').textContent === 'Program: Slides');
  console.log('  ✓ OBS groups, new mute sync, stale field cleanup, delay=0 & live events');

  // 5. Macro 200ms tick updates .sub in place without destroying pad DOM, and PANIC fallback disables macro filter
  await pad(4).click();
  await page.waitForFunction(() => /\d+\.\ds/.test(document.querySelector('#grid .pad[data-idx="4"] .sub')?.textContent || ''));
  await page.evaluate(() => { window.__pad0Ref = document.querySelectorAll('#grid .pad')[0]; });
  const tickBefore = await pad(4).locator('.sub').textContent();
  await page.waitForTimeout(300);
  const sameDom = await page.evaluate(() => document.querySelectorAll('#grid .pad')[0] === window.__pad0Ref);
  const tickAfter = await pad(4).locator('.sub').textContent();
  assert.equal(sameDom, true, '200ms macro tick did not destroy pad DOM');
  assert.notEqual(tickAfter, tickBefore, 'macro countdown updated in place');

  await page.click('#btn-panic');
  await page.waitForFunction(() => !document.querySelectorAll('#grid .pad')[4].className.includes('running'));
  assert.equal(state.filters['Webcam'][0].filterEnabled, false, 'PANIC fallback disabled macro-enabled filter');

  // 6. Configured PANIC steps continue past a failing step
  await page.evaluate(() => {
    Deck.cfg.panicSteps = [
      { type: 'filter', sourceName: 'MissingSrc', filterName: 'MissingFlt', mode: 'disable' },
      { type: 'filter', sourceName: 'Cam Group', filterName: 'Group Vignette', mode: 'disable' },
    ];
  });
  await pad(1).click();
  await page.waitForFunction(() => document.querySelectorAll('#grid .pad')[1].className.includes('active'));
  await page.click('#btn-panic');
  await page.waitForFunction(() => !document.querySelectorAll('#grid .pad')[1].className.includes('active'));
  assert.match(await page.textContent('#msg-info'), /1 error\(s\)/);
  // Restore empty panicSteps for subsequent fallback checks
  await page.evaluate(() => { Deck.cfg.panicSteps = []; Deck.saveCfg(); });
  console.log('  ✓ non-destructive macro ticks, macro-filter PANIC fallback & error resilience');

  // 7. Auto-Off edge cases: non-destructive tick, manual re-click cancel, and PANIC abort
  await page.click('#btn-edit');
  await pad(5).click();
  await page.selectOption('#f-type', 'filter');
  await page.locator('#f-fields select').nth(0).selectOption('Webcam');
  await page.waitForFunction(() => [...document.querySelectorAll('#f-fields select')[1].options].some((o) => o.value === 'Blur'));
  await page.locator('#f-fields select').nth(1).selectOption('Blur');
  await page.fill('#f-auto-off', '0.7');
  await page.fill('#f-label', 'AutoBlur');
  await page.click('#pad-form button[type="submit"]');
  await page.click('#btn-edit');

  // 7a. Non-destructive tick + manual re-click cancels early without firing twice later
  await pad(5).click();
  await page.waitForFunction(() => document.querySelectorAll('#grid .pad')[5].className.includes('running'));
  await page.evaluate(() => { window.__pad5Ref = document.querySelectorAll('#grid .pad')[5]; });
  await page.waitForTimeout(260);
  assert.equal(await page.evaluate(() => document.querySelectorAll('#grid .pad')[5] === window.__pad5Ref), true, 'auto-off tick preserves pad DOM');
  const callsBeforeCancel = state.calls.length;
  await pad(5).click(); // manual re-click cancel
  await page.waitForFunction(() => !document.querySelectorAll('#grid .pad')[5].className.includes('running'));
  assert.equal(state.filters['Webcam'][0].filterEnabled, false, 'manual re-click turned filter off immediately');
  const callsAtCancel = state.calls.length;
  assert.ok(callsAtCancel > callsBeforeCancel);
  await page.waitForTimeout(600);
  const extraBlurCalls = state.calls.slice(callsAtCancel).filter((c) => c.requestType === 'SetSourceFilterEnabled');
  assert.equal(extraBlurCalls.length, 0, 'cancelled auto-off timer does not fire after original expiry');

  // 7b. PANIC aborts in-flight auto-off timer & disables filter
  await pad(5).click();
  await page.waitForFunction(() => document.querySelectorAll('#grid .pad')[5].className.includes('running'));
  assert.equal(state.filters['Webcam'][0].filterEnabled, true);
  await page.click('#btn-panic');
  await page.waitForFunction(() => !document.querySelectorAll('#grid .pad')[5].className.includes('running'));
  assert.equal(state.filters['Webcam'][0].filterEnabled, false, 'PANIC disabled active auto-off filter');
  console.log('  ✓ auto-off non-destructive ticks, re-click early cancel & PANIC abort');

  // 8. Hotkey guardrails: Ctrl+Shift+1 works in Run mode, ignored in inputs/dialogs/Edit mode, Esc cancels recording safely
  await page.click('#btn-edit');
  await pad(6).click();
  await page.selectOption('#f-type', 'scene');
  await page.locator('#f-fields select').first().selectOption('BRB');
  // Test Escape while recording hotkey does NOT close #pad-dlg
  await page.click('#f-hotkey-btn');
  assert.match(await page.textContent('#f-hotkey-btn'), /Press any key/);
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(() => document.getElementById('pad-dlg').open), true, 'Esc during hotkey record keeps dialog open');
  assert.match(await page.textContent('#f-hotkey-btn'), /None/);
  // Record Ctrl+Shift+1
  await page.click('#f-hotkey-btn');
  await page.keyboard.press('Control+Shift+Digit1');
  assert.equal((await page.textContent('#f-hotkey-btn')).trim(), 'Ctrl+Shift+1');
  await page.click('#pad-form button[type="submit"]');

  // Ignored in Edit mode
  state.programScene = 'Main Cam';
  broadcast('CurrentProgramSceneChanged', { sceneName: 'Main Cam' });
  await page.waitForFunction(() => document.getElementById('scene-info').textContent === 'Program: Main Cam');
  await page.keyboard.press('Control+Shift+Digit1');
  await page.waitForTimeout(100);
  assert.equal(state.programScene, 'Main Cam', 'hotkey ignored in Edit mode');

  // Ignored when input focused in Run mode
  await page.click('#btn-edit');
  await page.focus('#ws-host');
  await page.keyboard.press('Control+Shift+Digit1');
  await page.waitForTimeout(100);
  assert.equal(state.programScene, 'Main Cam', 'hotkey ignored when input focused');

  // Ignored when a dialog is open
  await page.click('#btn-deck-cfg');
  await page.keyboard.press('Control+Shift+Digit1');
  await page.waitForTimeout(100);
  assert.equal(state.programScene, 'Main Cam', 'hotkey ignored when dialog open');
  await page.click('#btn-deck-cancel');

  // Fires in Run mode when focus is not in an input
  await page.evaluate(() => document.activeElement?.blur?.());
  await page.keyboard.press('Control+Shift+Digit1');
  await page.waitForFunction(() => document.getElementById('scene-info').textContent === 'Program: BRB');
  console.log('  ✓ hotkey guardrails (Ctrl+Shift+1, Esc record cancel, edit/input/dialog ignore)');

  // 9. Offline Dropdown "(saved)" preservation & manual `✎` fallback
  await page.click('#btn-ws-disconnect');
  await page.waitForFunction(() => document.getElementById('conn-text').textContent === 'Disconnected');
  await page.click('#btn-edit');
  await pad(6).click();
  await page.click('#f-fields .custom-btn');
  assert.equal(await page.locator('#f-fields input[type="text"]').first().isVisible(), true, 'manual input visible after clicking ✎');
  await page.locator('#f-fields input[type="text"]').first().fill('Offline Custom Scene');
  await page.click('#pad-form button[type="submit"]');
  // Re-open offline: dropdown preserves saved value as "(saved)" without wiping it on save
  await pad(6).click();
  const savedOptText = await page.locator('#f-fields select').first().locator('option:checked').textContent();
  assert.equal(savedOptText, 'Offline Custom Scene (saved)');
  await page.click('#pad-form button[type="submit"]');
  assert.ok((await pad(6).textContent()).includes('Offline Custom Scene'), 'offline saved value preserved on re-save');
  await page.click('#btn-edit');
  console.log('  ✓ offline dropdown "(saved)" preservation & manual ✎ fallback');

  // 10. Grid resize 2D (row, col) coordinate preservation & bounds clamping
  await page.evaluate(() => {
    const d = Deck.getActivePage();
    // Place pad at (row 1, col 1) = idx 9 in 8x8, and (row 6, col 6) = idx 54
    d.pads[9] = Deck.normalizePad({ type: 'scene', sceneName: 'Slides', label: 'R2C2' });
    d.pads[54] = Deck.normalizePad({ type: 'scene', sceneName: 'BRB', label: 'DroppedPad' });
    Deck.saveCfg();
    Deck.resizePage(d.id, 4, 3);
  });
  await page.waitForFunction(() => document.querySelectorAll('#grid .pad').length === 12);
  // In 4x3, (row 1, col 1) is index 1*4 + 1 = 5
  assert.ok((await pad(5).textContent()).includes('R2C2'), '2D (row 1, col 1) mapped to index 5 in 4x3');
  assert.equal(await page.evaluate(() => Deck.getActivePads().some((p) => p.label === 'DroppedPad')), false, 'out-of-bounds pad dropped cleanly');
  // Clamp bounds (1x1 -> 2x2, 99x99 -> 12x10)
  const clampedMin = await page.evaluate(() => { const d = Deck.resizePage(Deck.getActivePage().id, 1, 1); return [d.cols, d.rows]; });
  assert.deepEqual(clampedMin, [2, 2]);
  const clampedMax = await page.evaluate(() => { const d = Deck.resizePage(Deck.getActivePage().id, 99, 99); return [d.cols, d.rows]; });
  assert.deepEqual(clampedMax, [12, 10]);
  console.log('  ✓ grid resize 2D coordinate preservation & bounds clamping (2..12 x 2..10)');

  // 11. Narrow OBS dock viewport (360x420) fits without horizontal overflow + pads stay >= 54x54px
  await page.click('#btn-deck-add');
  await page.click('#btn-deck-add');
  await page.click('#btn-deck-add');
  await page.locator('#deck-tabs .page-tab').nth(0).click();
  await page.waitForFunction(() => document.querySelectorAll('#grid .pad').length === 120);
  await page.setViewportSize({ width: 360, height: 420 });
  const layoutAudit = await page.evaluate(() => {
    const pads = [...document.querySelectorAll('#grid .pad')].map((el) => el.getBoundingClientRect());
    return {
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      minW: Math.min(...pads.map((r) => r.width)),
      minH: Math.min(...pads.map((r) => r.height)),
    };
  });
  assert.equal(layoutAudit.overflow, false, 'no horizontal overflow at 360x420 OBS dock size with 4 tabs & 12x10 grid');
  assert.ok(layoutAudit.minW >= 54 && layoutAudit.minH >= 54, `pads remain >= 54x54px (got ${layoutAudit.minW}x${layoutAudit.minH})`);
  console.log('  ✓ narrow OBS dock viewport (360x420) layout & min 54x54 pad size check');

  // 12. OBS Group Transform / PiP + ?port= query param + port auto-discovery probe + 4009 auth stop
  await page.click('#btn-ws-connect');
  await page.waitForFunction(() => document.getElementById('conn-text').textContent === 'Connected');
  await page.evaluate(async () => {
    await Deck.execAction({ type: 'transform', sceneName: 'Cam Group', sourceName: 'Ring Light Overlay', preset: 'pip_tl' });
  });
  assert.ok(state.itemTransforms['Cam Group:11'].scaleX < 0.5, 'transform PiP works inside OBS Groups');

  const deadSrv = net.createServer();
  await new Promise((r) => deadSrv.listen(0, '127.0.0.1', r));
  const deadPort = deadSrv.address().port;
  await new Promise((r) => deadSrv.close(r));

  const probedPort = await page.evaluate(async ([dp, lp]) => Deck.probeObsPorts('127.0.0.1', [dp, lp], 300), [deadPort, port]);
  assert.equal(probedPort, port, 'probeObsPorts skips dead port and finds live OBS port');

  const ctxUrl = await browser.newContext();
  const pageUrl = await ctxUrl.newPage();
  pageUrl.on('pageerror', (e) => pageErrors.push(e.message));
  await pageUrl.goto(`${DECK_URL}?port=${port}&password=do-not-read`);
  await pageUrl.waitForFunction(() => document.getElementById('conn-text').textContent === 'Connected');
  assert.equal(await pageUrl.inputValue('#ws-port'), String(port), '?port= query param applied on boot');
  assert.equal(await pageUrl.inputValue('#ws-pass'), '', 'password query param is ignored');
  await ctxUrl.close();

  const authObs = createFakeObs(true);
  await new Promise((r) => authObs.wss.once('listening', r));
  const authPort = authObs.wss.address().port;
  try {
    const ctxAuth = await browser.newContext();
    const pageAuth = await ctxAuth.newPage();
    pageAuth.on('pageerror', (e) => pageErrors.push(e.message));
    await pageAuth.goto(`${DECK_URL}?port=${authPort}`);
    await pageAuth.waitForFunction(() => document.getElementById('conn-text').textContent === 'Auth Failed');
    const connsOnAuthFail = authObs.state.connections;
    await pageAuth.waitForTimeout(300);
    assert.equal(authObs.state.connections, connsOnAuthFail, '4009 Auth Failed stops without probing or reconnecting');
    await ctxAuth.close();
  } finally {
    authObs.wss.close();
  }
  console.log('  ✓ Group PiP transform + ?port= query param + probeObsPorts + 4009 stops cleanly');

  assert.deepEqual(pageErrors, [], `unexpected page errors: ${pageErrors.join('; ')}`);

  // 13. Release build check: npm run build:release produces clean valid ZIPs for v2.1.0
  assert.equal(PKG.version, '2.1.0', 'package.json version is 2.1.0');
  execFileSync(process.execPath, [join(__dirname, 'scripts', 'build-release.mjs')], { cwd: __dirname, stdio: 'pipe' });
  const zipPath = join(__dirname, 'dist', 'obs-virtual-deck.zip');
  const latestZipPath = join(__dirname, 'dist', 'obs-virtual-deck-latest.zip');
  const verZipPath = join(__dirname, 'dist', `obs-virtual-deck-v${PKG.version}.zip`);
  assert.ok(fs.existsSync(zipPath), 'dist/obs-virtual-deck.zip exists');
  assert.ok(fs.existsSync(latestZipPath), 'dist/obs-virtual-deck-latest.zip exists');
  assert.ok(fs.existsSync(verZipPath), `dist/obs-virtual-deck-v${PKG.version}.zip exists`);

  const entries = parseZipEntries(fs.readFileSync(zipPath));
  const names = entries.map((e) => e.name);
  const expectedFiles = [
    'obs-virtual-deck/deck.html',
    'obs-virtual-deck/deck/deck.css',
    'obs-virtual-deck/deck/obs-ws.js',
    'obs-virtual-deck/deck/actions.js',
    'obs-virtual-deck/deck/ui.js',
    'obs-virtual-deck/README.md',
    'obs-virtual-deck/Install-Windows.bat',
    'obs-virtual-deck/Install-Mac.command',
  ];
  for (const f of expectedFiles) {
    assert.ok(names.includes(f), `release ZIP contains ${f}`);
  }
  for (const n of names) {
    assert.ok(!/node_modules|test-deck|\.git\/|\/dist\//.test(n), `no dev/test files leaked in ZIP (${n})`);
  }
  const macEntry = entries.find((e) => e.name === 'obs-virtual-deck/Install-Mac.command');
  assert.equal(macEntry.unixMode, 0o755, 'Install-Mac.command has executable 0755 mode');
  assert.equal(macEntry.data.toString('utf8').includes('\r\n'), false, 'Install-Mac.command uses LF line endings');
  const winEntry = entries.find((e) => e.name === 'obs-virtual-deck/Install-Windows.bat');
  assert.equal(winEntry.data.toString('utf8').includes('\r\n'), true, 'Install-Windows.bat uses CRLF line endings');
  console.log(`  ✓ release ZIP build verified (v${PKG.version}, ${entries.length} clean files, valid PKZIP, zero leaked tests/node_modules)`);

  // 14. Install-Windows.bat port detection against mock config.json (verifies ?port=4459 & NO password)
  if (process.platform === 'win32') {
    const mockRoot = fs.mkdtempSync(join(os.tmpdir(), 'obs-deck-win-install-'));
    try {
      const mockAppData = join(mockRoot, 'appdata');
      const mockCfgDir = join(mockAppData, 'obs-studio', 'plugin_config', 'obs-websocket');
      const mockDest = join(mockRoot, 'dest');
      fs.mkdirSync(mockCfgDir, { recursive: true });
      fs.writeFileSync(join(mockCfgDir, 'config.json'), JSON.stringify({
        server_enabled: true,
        server_port: 4459,
        auth_required: true,
        server_password: 'super-secret-password-never-leak',
      }));
      const builtBat = join(__dirname, 'dist', 'obs-virtual-deck', 'Install-Windows.bat');
      const out = execFileSync('cmd.exe', ['/c', builtBat], {
        cwd: join(__dirname, 'dist', 'obs-virtual-deck'),
        env: {
          ...process.env,
          OBS_DECK_NO_PAUSE: '1',
          OBS_DECK_DEST: mockDest,
          APPDATA: mockAppData,
        },
        encoding: 'utf8',
      });
      assert.match(out, /deck\.html\?port=4459/, 'Install-Windows.bat appended ?port=4459 from mock config.json');
      assert.equal(out.includes('super-secret-password-never-leak'), false, 'Install-Windows.bat never leaks server_password');
      assert.equal(/pass(word)?=/i.test(out), false, 'Install-Windows.bat URL has no password query param');
      assert.ok(fs.existsSync(join(mockDest, 'deck.html')), 'Install-Windows.bat copied deck.html to dest');
      console.log('  ✓ Install-Windows.bat mock config.json ?port=4459 detection & zero-password check');
    } finally {
      fs.rmSync(mockRoot, { recursive: true, force: true });
    }
  }

  console.log('\nPASS: all deck edge E2E checks succeeded.');
} finally {
  if (browser) await browser.close();
  wss.close();
}
