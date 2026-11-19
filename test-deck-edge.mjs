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

  // 1c. obs_deck_config_v2 -> opendeck_config backward-compatible migration & pad image field defaults
  await page.evaluate((p) => {
    const pads = Array.from({ length: 64 }, () => ({ type: 'none', label: '', icon: '', color: '#222733' }));
    pads[0] = { type: 'scene', sceneName: 'Slides', label: 'Legacy V2 Scene', icon: '📺', color: '#991b1b' };
    localStorage.removeItem('opendeck_config');
    localStorage.removeItem('obs_virtual_deck_v2');
    localStorage.setItem('obs_deck_config_v2', JSON.stringify({
      version: 2,
      ws: { host: '127.0.0.1', port: p, password: '' },
      pages: [{ id: 'page-1', name: 'Main', cols: 8, rows: 8, pads }],
      panicSteps: [],
    }));
  }, port);
  await page.reload();
  await page.waitForSelector('#grid .pad');
  const migratedOpenDeck = await page.evaluate(() => JSON.parse(localStorage.getItem('opendeck_config') || 'null'));
  assert.ok(migratedOpenDeck, 'migrated to opendeck_config storage key');
  assert.equal(migratedOpenDeck.pages[0].pads[0].label, 'Legacy V2 Scene');
  assert.equal(migratedOpenDeck.pages[0].pads[0].image, undefined);
  assert.equal(migratedOpenDeck.pages[0].pads[0].imageFit, undefined);
  assert.equal(Boolean(migratedOpenDeck.pages[0].pads[0].hideLabel), false);
  assert.ok((await page.locator('#grid .pad').nth(0).textContent()).includes('Legacy V2 Scene'));

  // Reset back to clean defaults before continuing
  await page.evaluate(() => {
    localStorage.removeItem('obs_virtual_deck_v1');
    localStorage.removeItem('obs_virtual_deck_v2');
    localStorage.removeItem('obs_deck_config_v2');
    localStorage.removeItem('opendeck_config');
  });
  await page.reload();
  await page.waitForSelector('#grid .pad');
  console.log('  ✓ v1, v2.0.0 & v2.2.0 -> OpenDeck v2.2.1 lossless localStorage migration');

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

  // 8. Removal of local hotkey UI, red scene pad default & OBS Hotkey action execution
  await page.click('#btn-edit');
  await pad(6).click();
  await page.selectOption('#f-type', 'scene');
  await page.locator('#f-fields select').first().selectOption('BRB');
  // Verify local hotkey recorder #f-hotkey-btn is omitted
  assert.equal(await page.locator('#f-hotkey-btn').count(), 0, '#f-hotkey-btn omitted from Pad Editor');
  assert.equal(await page.evaluate(() => document.querySelectorAll('#grid .pad')[6].querySelector('.hk')), null, 'no .hk badge on pad');
  await page.click('#pad-form button[type="submit"]');
  assert.equal(await page.evaluate(() => document.querySelectorAll('#grid .pad')[6].style.backgroundColor), 'rgb(153, 27, 27)', 'pad 6 is red #991b1b');

  // Verify dock-level hotkeys are removed in Run mode
  await page.click('#btn-edit');
  state.programScene = 'Main Cam';
  broadcast('CurrentProgramSceneChanged', { sceneName: 'Main Cam' });
  await page.waitForFunction(() => document.getElementById('scene-info').textContent === 'Program: Main Cam');
  await page.keyboard.press('Control+Shift+Digit1');
  await page.waitForTimeout(100);
  assert.equal(state.programScene, 'Main Cam', 'local keyboard hotkeys disabled');

  // Verify OBS-native Hotkey action still triggers TriggerHotkeyByName
  await page.evaluate(async () => {
    await Deck.execAction({ type: 'hotkey', hotkeyName: 'OBSBasic.StartRecording' });
  });
  assert.ok(state.triggeredHotkeys.includes('OBSBasic.StartRecording'), 'OBS Hotkey action type works');
  console.log('  ✓ local hotkey UI removal + red scene default + OBS Hotkey action execution');

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

  // 12b. Font Scaler & Palette Splitter bounds clamping, and theme persistence across reloads
  await page.evaluate(() => {
    localStorage.removeItem('opendeck_font_scale');
    for (let i = 0; i < 6; i++) document.getElementById('btn-font-dec')?.click();
  });
  assert.equal(await page.evaluate(() => document.documentElement.dataset.fontSize), 'sm', 'font scale clamped at sm minimum');
  await page.evaluate(() => {
    for (let i = 0; i < 6; i++) document.getElementById('btn-font-inc')?.click();
  });
  assert.equal(await page.evaluate(() => document.documentElement.dataset.fontSize), 'xxl', 'font scale clamped at xxl maximum');

  // Theme persistence across page reload
  await page.evaluate(() => {
    localStorage.setItem('opendeck_theme', 'light');
  });
  await page.reload();
  await page.waitForSelector('#grid .pad');
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'light', 'light theme restored on reload from localStorage');
  assert.equal((await page.textContent('#btn-theme')).trim(), '🌙', 'moon button shown on light theme reload');

  // Palette width clamping on startup
  await page.evaluate(() => {
    localStorage.setItem('opendeck_palette_w', '9999');
  });
  await page.reload();
  await page.waitForSelector('#grid .pad');
  const clampedPaletteMax = await page.evaluate(() => parseInt(document.getElementById('palette')?.style.width || '0', 10));
  assert.ok(clampedPaletteMax <= 550, 'palette width loaded from storage clamps at 550px');
  // Reset back to dark theme & default font size
  await page.evaluate(() => {
    localStorage.removeItem('opendeck_theme');
    localStorage.removeItem('opendeck_font_scale');
    localStorage.removeItem('opendeck_palette_w');
    document.documentElement.dataset.theme = 'dark';
    document.documentElement.dataset.fontSize = 'xl';
  });
  console.log('  ✓ font scaler & palette width bounds clamping + theme persistence');

  assert.deepEqual(pageErrors, [], `unexpected page errors: ${pageErrors.join('; ')}`);

  // 13. Release build check: npm run build:release produces clean valid ZIPs for OpenDeck v2.2.1
  assert.equal(PKG.version, '2.2.1', 'package.json version is 2.2.1');
  execFileSync(process.execPath, [join(__dirname, 'scripts', 'build-release.mjs')], { cwd: __dirname, stdio: 'pipe' });
  const zipPath = join(__dirname, 'dist', 'obs-virtual-deck.zip');
  const latestZipPath = join(__dirname, 'dist', 'obs-virtual-deck-latest.zip');
  const verZipPath = join(__dirname, 'dist', `obs-virtual-deck-v${PKG.version}.zip`);
  const opendeckZipPath = join(__dirname, 'dist', 'opendeck.zip');
  const opendeckLatestZipPath = join(__dirname, 'dist', 'opendeck-latest.zip');
  const opendeckVerZipPath = join(__dirname, 'dist', `opendeck-v${PKG.version}.zip`);
  assert.ok(fs.existsSync(zipPath), 'dist/obs-virtual-deck.zip exists');
  assert.ok(fs.existsSync(latestZipPath), 'dist/obs-virtual-deck-latest.zip exists');
  assert.ok(fs.existsSync(verZipPath), `dist/obs-virtual-deck-v${PKG.version}.zip exists`);
  assert.ok(fs.existsSync(opendeckZipPath), 'dist/opendeck.zip exists');
  assert.ok(fs.existsSync(opendeckLatestZipPath), 'dist/opendeck-latest.zip exists');
  assert.ok(fs.existsSync(opendeckVerZipPath), `dist/opendeck-v${PKG.version}.zip exists`);

  const entries = parseZipEntries(fs.readFileSync(zipPath));
  const names = entries.map((e) => e.name);
  const expectedFiles = [
    'obs-virtual-deck/deck.html',
    'obs-virtual-deck/deck/deck.css',
    'obs-virtual-deck/deck/obs-ws.js',
    'obs-virtual-deck/deck/actions.js',
    'obs-virtual-deck/deck/ui-pages.js',
    'obs-virtual-deck/deck/ui-grid.js',
    'obs-virtual-deck/deck/ui-editor.js',
    'obs-virtual-deck/deck/ui-palette.js',
    'obs-virtual-deck/deck/ui-select.js',
    'obs-virtual-deck/deck/ui-dialogs.js',
    'obs-virtual-deck/deck/ui-boot.js',
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

  // 15. Fake OBS server seam: request log (read & clear), on-demand events, slideshow settings, and close with code & reason
  const seamObs = createFakeObs(false);
  await new Promise((r) => seamObs.wss.once('listening', r));
  const seamPort = seamObs.wss.address().port;
  try {
    assert.deepEqual(seamObs.state.inputSettings['Photo Slideshow'], {
      files: [{ value: '/img/slide1.png', hidden: false, selected: false }],
    }, 'slideshow input settings seeded');

    const ctxSeam = await browser.newContext();
    const pageSeam = await ctxSeam.newPage();
    pageSeam.on('pageerror', (e) => pageErrors.push(e.message));
    await pageSeam.goto(`${DECK_URL}?port=${seamPort}`);
    await pageSeam.waitForFunction(() => document.getElementById('conn-text').textContent === 'Connected');

    // Read and clear ordered request log
    assert.ok(seamObs.state.calls.some((c) => c.requestType === 'GetSceneList'), 'request log recorded initial GetSceneList');
    seamObs.state.calls.length = 0;
    assert.equal(seamObs.state.calls.length, 0, 'request log cleared');

    await pageSeam.evaluate(() => Deck.obsCall('SetCurrentProgramScene', { sceneName: 'BRB' }));
    assert.deepEqual(seamObs.state.calls, [
      { requestType: 'SetCurrentProgramScene', requestData: { sceneName: 'BRB' } },
    ], 'ordered request log recorded exact requestType and requestData');

    // Emit on-demand events and observe state sync / Deck response
    seamObs.state.calls.length = 0;
    seamObs.broadcast('SceneNameChanged', { oldSceneName: 'BRB', sceneName: 'Break Room' });
    assert.equal(seamObs.state.scenes.includes('Break Room'), true, 'fake server updated scene name on SceneNameChanged');
    assert.equal(seamObs.state.scenes.includes('BRB'), false, 'old scene name replaced');
    await pageSeam.waitForFunction(() => document.getElementById('scene-info').textContent === 'Program: Break Room');
    assert.ok(seamObs.state.calls.some((c) => c.requestType === 'GetSceneList'), 'SceneNameChanged triggered GetSceneList');

    seamObs.broadcast('InputNameChanged', { oldInputName: 'Mic/Aux', inputName: 'Host Mic' });
    assert.equal(seamObs.state.inputs.includes('Host Mic'), true, 'fake server updated input name on InputNameChanged');
    await pageSeam.waitForFunction(() => Deck.obs.inputs.includes('Host Mic'));

    seamObs.broadcast('SceneRemoved', { sceneName: 'Slides' });
    assert.equal(seamObs.state.scenes.includes('Slides'), false, 'fake server removed scene on SceneRemoved');

    seamObs.broadcast('MediaInputActionTriggered', {
      inputName: 'Intro Video',
      mediaAction: 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PLAY',
    });
    assert.equal(seamObs.state.mediaStates['Intro Video'], 'OBS_MEDIA_STATE_PLAYING', 'fake server updated media state on MediaInputActionTriggered');

    seamObs.broadcast('InputVolumeChanged', { inputName: 'Host Mic', inputVolumeDb: -18, inputVolumeMul: 0.125 });
    await pageSeam.waitForFunction(() => Deck.obs.volumes['Host Mic'] === -18);

    // Close connection with chosen close code and reason
    const closedEvent = pageSeam.evaluate(() => new Promise((resolve) => {
      Deck.obs.ws.addEventListener('close', (ev) => resolve({ code: ev.code, reason: ev.reason }), { once: true });
    }));
    seamObs.closeAll(4009, 'Custom close reason');
    const closeInfo = await closedEvent;
    assert.deepEqual(closeInfo, { code: 4009, reason: 'Custom close reason' }, 'closed with chosen code and reason');
    await pageSeam.waitForFunction(() => document.getElementById('conn-text').textContent === 'Auth Failed');

    await ctxSeam.close();
    console.log('  ✓ fake OBS server seam (request log, on-demand events, slideshow settings & close with code/reason)');
  } finally {
    seamObs.wss.close();
  }

  // 16. Output stop protection and in-flight guard (#5)
  const outObs = createFakeObs(false);
  await new Promise((r) => outObs.wss.once('listening', r));
  const outPort = outObs.wss.address().port;
  try {
    const ctxOut = await browser.newContext();
    const pageOut = await ctxOut.newPage();
    pageOut.on('pageerror', (e) => pageErrors.push(e.message));
    await pageOut.goto(`${DECK_URL}?port=${outPort}`);
    await pageOut.waitForFunction(() => document.getElementById('conn-text').textContent === 'Connected');
    await pageOut.waitForTimeout(100);
    if (await pageOut.evaluate(() => document.getElementById('import-wiz-dlg')?.open)) {
      await pageOut.click('#btn-wiz-cancel');
    }

    // Configure pads for testing:
    // Slot 0: Stream toggle
    // Slot 1: Record toggle
    // Slot 2: Virtual Cam toggle
    // Slot 3: Replay Buffer toggle
    // Slot 4: Stream stop
    // Slot 5: Macro with wait and stop
    // Slot 6: PANIC pad
    await pageOut.evaluate(() => {
      const page = Deck.getActivePage();
      page.pads[0] = { type: 'output', target: 'stream', mode: 'toggle', label: 'Stream' };
      page.pads[1] = { type: 'output', target: 'record', mode: 'toggle', label: 'Record' };
      page.pads[2] = { type: 'output', target: 'vcam', mode: 'toggle', label: 'Virtual Cam' };
      page.pads[3] = { type: 'output', target: 'replay', mode: 'toggle', label: 'Replay Buffer' };
      page.pads[4] = { type: 'output', target: 'stream', mode: 'stop', label: 'Stop Stream' };
      page.pads[5] = {
        type: 'macro',
        label: 'Stream Macro',
        steps: [
          { type: 'wait', delayMs: 1500 },
          { type: 'output', target: 'stream', mode: 'stop' },
        ],
      };
      page.pads[6] = { type: 'panic', label: 'PANIC' };
      Deck.saveCfg();
      Deck.renderGrid();
    });

    const padEl = (idx) => pageOut.locator('#grid .pad').nth(idx);

    // AC 4: A double-tap on an idle output Pad sends exactly one request
    outObs.state.calls.length = 0;
    await Promise.all([
      padEl(0).click(),
      padEl(0).click(),
    ]);
    await pageOut.waitForFunction(() => document.querySelectorAll('#grid .pad')[0].className.includes('active'));
    assert.equal(outObs.state.outputs.stream, true, 'stream started');
    const streamStartCalls = outObs.state.calls.filter((c) => c.requestType === 'ToggleStream' || c.requestType === 'StartStream');
    assert.equal(streamStartCalls.length, 1, 'double-tap on idle output Pad sends exactly one request');

    // AC 1: A single tap on a live Stream Pad sends no stop request and shows the armed state
    outObs.state.calls.length = 0;
    await padEl(0).click();
    assert.equal(outObs.state.calls.filter((c) => c.requestType === 'ToggleStream' || c.requestType === 'StopStream').length, 0, 'single tap sends no stop request');
    assert.ok((await padEl(0).getAttribute('class')).includes('armed'), 'pad shows armed state class');
    const armedMsg = await pageOut.textContent('#msg-info');
    assert.match(armedMsg, /armed/i, 'footer message shows armed confirmation warning');

    // AC 3: The armed state expires on its own
    await pageOut.waitForTimeout(2100);
    assert.equal((await padEl(0).getAttribute('class')).includes('armed'), false, 'armed state expired after ~2 seconds');
    assert.equal(outObs.state.outputs.stream, true, 'output stream still running after armed state expires');
    assert.equal(outObs.state.calls.filter((c) => c.requestType === 'ToggleStream' || c.requestType === 'StopStream').length, 0, 'no stop request sent on expiration');

    // AC 2: A second tap within the window sends the stop request
    outObs.state.calls.length = 0;
    await padEl(0).click(); // tap 1: arms
    assert.ok((await padEl(0).getAttribute('class')).includes('armed'), 'pad armed on first tap');
    assert.equal(outObs.state.calls.filter((c) => c.requestType === 'ToggleStream' || c.requestType === 'StopStream').length, 0, 'no stop sent yet');
    await padEl(0).click(); // tap 2: confirms stop
    await pageOut.waitForFunction(() => !document.querySelectorAll('#grid .pad')[0].className.includes('active'));
    assert.equal(outObs.state.outputs.stream, false, 'second tap stopped the stream');
    assert.equal(outObs.state.calls.filter((c) => c.requestType === 'ToggleStream' || c.requestType === 'StopStream').length, 1, 'stop request sent on second tap');
    assert.equal((await padEl(0).getAttribute('class')).includes('armed'), false, 'armed state cleared on stop');

    // AC 2 (hold): A hold sends the stop request
    await padEl(0).click(); // start stream again
    await pageOut.waitForFunction(() => document.querySelectorAll('#grid .pad')[0].className.includes('active'));
    assert.equal(outObs.state.outputs.stream, true, 'stream running for hold test');
    outObs.state.calls.length = 0;
    await padEl(0).click({ delay: 650 }); // press and hold
    await pageOut.waitForFunction(() => !document.querySelectorAll('#grid .pad')[0].className.includes('active'));
    assert.equal(outObs.state.outputs.stream, false, 'hold stopped the stream');
    assert.equal(outObs.state.calls.filter((c) => c.requestType === 'ToggleStream' || c.requestType === 'StopStream').length, 1, 'hold sent stop request');
    assert.equal((await padEl(0).getAttribute('class')).includes('armed'), false, 'armed state cleared after hold stop');

    // Stop protection also applies to Record, Virtual Cam, Replay Buffer, and mode: stop
    // Record toggle
    await padEl(1).click(); // start record
    await pageOut.waitForFunction(() => document.querySelectorAll('#grid .pad')[1].className.includes('active'));
    assert.equal(outObs.state.outputs.record, true);
    outObs.state.calls.length = 0;
    await padEl(1).click(); // tap 1: arm
    assert.equal(outObs.state.calls.filter((c) => c.requestType === 'ToggleRecord' || c.requestType === 'StopRecord').length, 0);
    assert.ok((await padEl(1).getAttribute('class')).includes('armed'), 'record pad armed');
    await padEl(1).click(); // tap 2: stop
    await pageOut.waitForFunction(() => !document.querySelectorAll('#grid .pad')[1].className.includes('active'));
    assert.equal(outObs.state.outputs.record, false, 'record stopped on second tap');

    // Virtual Cam toggle
    await padEl(2).click(); // start vcam
    await pageOut.waitForFunction(() => document.querySelectorAll('#grid .pad')[2].className.includes('active'));
    assert.equal(outObs.state.outputs.vcam, true);
    outObs.state.calls.length = 0;
    await padEl(2).click(); // tap 1: arm
    assert.equal(outObs.state.calls.filter((c) => c.requestType === 'ToggleVirtualCam' || c.requestType === 'StopVirtualCam').length, 0);
    assert.ok((await padEl(2).getAttribute('class')).includes('armed'), 'vcam pad armed');
    await padEl(2).click(); // tap 2: stop
    await pageOut.waitForFunction(() => !document.querySelectorAll('#grid .pad')[2].className.includes('active'));
    assert.equal(outObs.state.outputs.vcam, false, 'vcam stopped on second tap');

    // Replay Buffer toggle
    await padEl(3).click(); // start replay
    await pageOut.waitForFunction(() => document.querySelectorAll('#grid .pad')[3].className.includes('active'));
    assert.equal(outObs.state.outputs.replay, true);
    outObs.state.calls.length = 0;
    await padEl(3).click(); // tap 1: arm
    assert.equal(outObs.state.calls.filter((c) => c.requestType === 'ToggleReplayBuffer' || c.requestType === 'StopReplayBuffer').length, 0);
    assert.ok((await padEl(3).getAttribute('class')).includes('armed'), 'replay pad armed');
    await padEl(3).click(); // tap 2: stop
    await pageOut.waitForFunction(() => !document.querySelectorAll('#grid .pad')[3].className.includes('active'));
    assert.equal(outObs.state.outputs.replay, false, 'replay stopped on second tap');

    // Mode: 'stop' pad
    await padEl(0).click(); // start stream
    await pageOut.waitForFunction(() => document.querySelectorAll('#grid .pad')[0].className.includes('active'));
    assert.equal(outObs.state.outputs.stream, true);
    outObs.state.calls.length = 0;
    await padEl(4).click(); // tap 1: arm stop pad
    assert.equal(outObs.state.calls.filter((c) => c.requestType === 'StopStream').length, 0);
    assert.ok((await padEl(4).getAttribute('class')).includes('armed'), 'mode:stop pad armed');
    await padEl(4).click(); // tap 2: stop stream
    await pageOut.waitForFunction(() => !document.querySelectorAll('#grid .pad')[0].className.includes('active'));
    assert.equal(outObs.state.outputs.stream, false, 'mode:stop pad stopped stream on second tap');

    // AC 5: Tapping a running Timed Macro still cancels it; PANIC always runs
    await padEl(5).click(); // start macro (1.5s wait step)
    await pageOut.waitForFunction(() => document.querySelectorAll('#grid .pad')[5].className.includes('running'));
    await padEl(5).click(); // cancel macro
    await pageOut.waitForFunction(() => !document.querySelectorAll('#grid .pad')[5].className.includes('running'));
    assert.match(await pageOut.textContent('#msg-info'), /Cancelled macro/);

    await padEl(6).click(); // PANIC always runs
    assert.match(await pageOut.textContent('#msg-info'), /PANIC executed/);

    // AC 6: Stop steps inside Timed Macros and PANIC run without confirmation
    // Test PANIC stop step
    await padEl(0).click(); // start stream
    await pageOut.waitForFunction(() => document.querySelectorAll('#grid .pad')[0].className.includes('active'));
    assert.equal(outObs.state.outputs.stream, true);
    await pageOut.evaluate(() => {
      Deck.cfg.panicSteps = [{ type: 'output', target: 'stream', mode: 'stop' }];
    });
    outObs.state.calls.length = 0;
    await padEl(6).click(); // trigger PANIC
    await pageOut.waitForFunction(() => !document.querySelectorAll('#grid .pad')[0].className.includes('active'));
    assert.equal(outObs.state.outputs.stream, false, 'PANIC stopped stream without confirmation');
    assert.ok(outObs.state.calls.some((c) => c.requestType === 'StopStream'), 'StopStream executed by PANIC');

    // Test Timed Macro stop step without confirmation
    await padEl(0).click(); // start stream
    await pageOut.waitForFunction(() => document.querySelectorAll('#grid .pad')[0].className.includes('active'));
    assert.equal(outObs.state.outputs.stream, true);
    await pageOut.evaluate(() => {
      Deck.cfg.pages[0].pads[5] = {
        type: 'macro',
        label: 'Instant Stop Macro',
        steps: [{ type: 'output', target: 'stream', mode: 'stop' }],
      };
      Deck.renderGrid();
    });
    outObs.state.calls.length = 0;
    await padEl(5).click(); // run macro
    await pageOut.waitForFunction(() => !document.querySelectorAll('#grid .pad')[0].className.includes('active'));
    assert.equal(outObs.state.outputs.stream, false, 'Timed Macro stop step stopped stream without confirmation');
    assert.ok(outObs.state.calls.some((c) => c.requestType === 'StopStream'), 'StopStream executed by Timed Macro');

    await ctxOut.close();
    console.log('  ✓ output stop protection and in-flight guard (#5)');
  } finally {
    outObs.wss.close();
  }

  console.log('\nPASS: all deck edge E2E checks succeeded.');
} finally {
  if (browser) await browser.close();
  wss.close();
}
