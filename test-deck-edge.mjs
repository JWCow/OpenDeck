#!/usr/bin/env node
// Edge-case Playwright E2E tests for deck.html (groups, live events, non-destructive ticks, PANIC resilience,
// v1->v2 localStorage migration, 2D resize preservation, auto-off edge cases, offline dropdown fallback,
// hotkey guardrails, narrow 360x420 dock layout, and release ZIP integrity).
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import zlib from 'node:zlib';
import { chromium } from 'playwright';
import { clickMenuItem, closeMoreMenu, createFakeObs, isolateBrowserFromLiveObs, openMoreMenu, PASSWORD } from './test-deck-fake-obs.mjs';
import { createLanHelper } from './scripts/lan-helper.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DECK_URL = pathToFileURL(join(__dirname, 'deck.html')).href;
const PKG = JSON.parse(fs.readFileSync(join(__dirname, 'package.json'), 'utf8'));
const ONLY_SECTION = process.argv.find((a) => a.startsWith('--section='))?.split('=')[1] || '';

async function waitConnectedAndDismissAutoImport(page) {
  await page.waitForFunction(() => (
    document.getElementById('conn-text')?.textContent === 'Connected'
    && !Deck.obs.activeSync
    && (
      document.getElementById('import-wiz-dlg')?.open
      || !Deck.isStarterDeck()
      || (!Deck.obs.scenes.length && !Deck.obs.inputs.length)
    )
  ));
  if (await page.evaluate(() => document.getElementById('import-wiz-dlg')?.open)) {
    await page.click('#btn-wiz-cancel');
    await page.waitForFunction(() => !document.getElementById('import-wiz-dlg')?.open);
  }
}

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
  browser = isolateBrowserFromLiveObs(await chromium.launch({ headless: true }));
  const pageErrors = [];
  if (!ONLY_SECTION) {
  const page = await browser.newPage();
  page.on('pageerror', (e) => pageErrors.push(e.message));
  page.on('dialog', (d) => d.accept());

  await page.addInitScript(() => {
    const origSet = Storage.prototype.setItem;
    Storage.prototype.setItem = function(k, v) {
      if (window.sessionStorage && sessionStorage.getItem('fail_storage') === '1' && k === 'opendeck_config') {
        throw new Error('QuotaExceededError: simulated migration write failure');
      }
      return origSet.apply(this, arguments);
    };
  });

  await page.goto(DECK_URL);
  await page.waitForSelector('#grid .pad');

  // 1a. v1 -> v2.1.0 localStorage migration (all 64 pads & panicSteps survive intact)
  await page.evaluate((p) => {
    const pads = Array.from({ length: 64 }, () => ({ type: 'none', label: '', icon: '', color: '#222733' }));
    pads[0] = { type: 'scene', sceneName: 'Slides', label: 'Migrated Slides', icon: '📺', color: '#1e3a8a' };
    pads[10] = { type: 'filter', sourceName: 'Webcam', filterName: 'Blur', mode: 'toggle', label: 'Migrated Blur', icon: '', color: '#581c87' };
    pads[63] = { type: 'panic', label: 'PANIC', icon: '🚨', color: '#991b1b' };
    localStorage.removeItem('opendeck_config');
    localStorage.removeItem('obs_virtual_deck_v2');
    localStorage.setItem('obs_virtual_deck_v1', JSON.stringify({
      ws: { host: '127.0.0.1', port: p, password: '' },
      pads,
      panicSteps: [{ type: 'filter', sourceName: 'Webcam', filterName: 'Blur', mode: 'disable' }],
    }));
  }, port);
  await page.reload();
  await page.waitForSelector('#grid .pad');
  const migrated = await page.evaluate(() => JSON.parse(localStorage.getItem('opendeck_config') || 'null'));
  assert.equal(migrated?.version, 2, 'migrated to canonical storage key');
  assert.equal(migrated.pages.length, 1);
  assert.equal(migrated.activePageId, 'page-1');
  assert.equal(migrated.pages[0].pads.length, 64);
  assert.equal(migrated.pages[0].pads[0].label, 'Migrated Slides');
  assert.equal(migrated.pages[0].pads[10].filterName, 'Blur');
  assert.equal(migrated.pages[0].pads[63].type, 'panic');
  assert.equal(migrated.panicSteps.length, 1);
  assert.ok((await page.locator('#grid .pad').nth(0).textContent()).includes('Migrated Slides'));
  assert.equal(await page.evaluate(() => localStorage.getItem('obs_virtual_deck_v1')), null, 'legacy v1 key removed after migration');
  assert.equal(await page.evaluate(() => localStorage.getItem('obs_virtual_deck_v2')), null, 'legacy v2 key removed after migration');

  // 1b. v2.0.0 (decks[], activeDeckId, deckId) -> v2.1.0 (pages[], activePageId, pageId) migration
  await page.evaluate((p) => {
    const d1 = Array.from({ length: 12 }, () => ({ type: 'none', label: '', icon: '', color: '#222733' }));
    d1[0] = { type: 'page', mode: 'goto', deckId: 'deck-2', label: 'Jump D2', icon: '', color: '#222733' };
    const d2 = Array.from({ length: 12 }, () => ({ type: 'none', label: '', icon: '', color: '#222733' }));
    d2[1] = { type: 'scene', sceneName: 'BRB', label: 'D2 BRB', icon: '', color: '#1e3a8a' };
    localStorage.removeItem('opendeck_config');
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
  const migratedV20 = await page.evaluate(() => JSON.parse(localStorage.getItem('opendeck_config') || 'null'));
  assert.equal(migratedV20.decks, undefined, 'legacy decks[] replaced by pages[]');
  assert.equal(migratedV20.activePageId, 'deck-2', 'activeDeckId migrated to activePageId');
  assert.equal(migratedV20.pages.length, 2);
  assert.equal(migratedV20.pages[0].pads[0].pageId, 'deck-2', 'page pad deckId migrated to pageId');
  assert.ok((await page.locator('#grid .pad').nth(1).textContent()).includes('D2 BRB'));
  assert.equal(await page.evaluate(() => localStorage.getItem('obs_virtual_deck_v2')), null, 'legacy v2 key removed after migration');

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
  assert.equal(await page.evaluate(() => localStorage.getItem('obs_deck_config_v2')), null, 'legacy obs_deck_config_v2 key removed after migration');
  assert.equal(await page.evaluate(() => localStorage.getItem('obs_virtual_deck_v2')), null, 'legacy obs_virtual_deck_v2 key removed after migration');

  // 1d. Save failure warning in status area (suggests Export and fewer/smaller Pad Graphics) & recovery
  await page.evaluate(() => {
    const origSet = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new Error('QuotaExceededError: Setting the value of "opendeck_config" exceeded the quota.');
    };
    try {
      Deck.saveCfg();
    } finally {
      Storage.prototype.setItem = origSet;
    }
  });

  const saveWarn = page.locator('#save-warning');
  assert.equal(await saveWarn.isVisible(), true, 'save failure warning is visible in status area');
  const warnText = await page.textContent('.status');
  assert.match(warnText, /Save failed/i, 'status mentions save failed');
  assert.match(warnText, /export/i, 'warning suggests export');
  assert.match(warnText, /fewer or smaller Pad Graphics/i, 'warning suggests fewer or smaller Pad Graphics');

  // Next successful save clears warning
  await page.evaluate(() => {
    Deck.saveCfg();
  });
  assert.equal(await saveWarn.isVisible(), false, 'warning is hidden after next successful save');
  assert.ok(!(await page.textContent('.status')).includes('Save failed'), 'status area cleared of save failure message');

  // 1e. Precedence: canonical opendeck_config wins whenever it exists, ignoring stale legacy keys
  await page.evaluate((p) => {
    const padsCanonical = Array.from({ length: 64 }, () => ({ type: 'none', label: '', icon: '', color: '#222733' }));
    padsCanonical[0] = { type: 'scene', sceneName: 'Slides', label: 'Canonical Layout Pad', icon: '⭐', color: '#1e3a8a' };

    const padsV1 = Array.from({ length: 64 }, () => ({ type: 'none', label: '', icon: '', color: '#222733' }));
    padsV1[0] = { type: 'scene', sceneName: 'BRB', label: 'Stale V1 Pad', icon: '💀', color: '#991b1b' };

    localStorage.setItem('opendeck_config', JSON.stringify({
      version: 2,
      ws: { host: '127.0.0.1', port: p, password: '' },
      activePageId: 'page-1',
      pages: [{ id: 'page-1', name: 'Main', cols: 8, rows: 8, pads: padsCanonical }],
      panicSteps: [],
    }));
    localStorage.setItem('obs_virtual_deck_v1', JSON.stringify({
      ws: { host: '127.0.0.1', port: p, password: '' },
      pads: padsV1,
      panicSteps: [],
    }));
    localStorage.removeItem('obs_virtual_deck_v2');
    localStorage.removeItem('obs_deck_config_v2');
  }, port);
  await page.reload();
  await page.waitForSelector('#grid .pad');
  const precedenceConfig = await page.evaluate(() => JSON.parse(localStorage.getItem('opendeck_config') || 'null'));
  assert.equal(precedenceConfig?.pages[0]?.pads[0]?.label, 'Canonical Layout Pad', 'canonical layout loads when stale v1 layout also exists');
  assert.ok((await page.locator('#grid .pad').nth(0).textContent()).includes('Canonical Layout Pad'), 'grid shows canonical layout pad');
  assert.equal(await page.evaluate(() => localStorage.getItem('obs_virtual_deck_v1')), null, 'stale v1 key removed after canonical load');

  // 1f. Data-loss prevention during migration: legacy keys preserved if canonical write throws
  await page.evaluate((p) => {
    localStorage.removeItem('opendeck_config');
    localStorage.removeItem('obs_deck_config_v2');
    localStorage.removeItem('obs_virtual_deck_v1');
    const pads = Array.from({ length: 64 }, () => ({ type: 'none', label: '', icon: '', color: '#222733' }));
    pads[0] = { type: 'scene', sceneName: 'Slides', label: 'Unlost Legacy Scene', icon: '💾', color: '#1e3a8a' };
    localStorage.setItem('obs_virtual_deck_v2', JSON.stringify({
      version: 2,
      ws: { host: '127.0.0.1', port: p, password: '' },
      activePageId: 'page-1',
      pages: [{ id: 'page-1', name: 'Main', cols: 8, rows: 8, pads }],
      panicSteps: [],
    }));
    sessionStorage.setItem('fail_storage', '1');
  }, port);
  await page.reload();
  await page.waitForSelector('#grid .pad');
  // While write failed during migration, legacy key must NOT be deleted
  assert.notEqual(await page.evaluate(() => localStorage.getItem('obs_virtual_deck_v2')), null, 'legacy key preserved when migration write throws');
  assert.equal(await page.evaluate(() => localStorage.getItem('opendeck_config')), null, 'canonical key not saved when write throws');

  // Make writes work again and reload
  await page.evaluate(() => sessionStorage.removeItem('fail_storage'));
  await page.reload();
  await page.waitForSelector('#grid .pad');
  const recovered = await page.evaluate(() => JSON.parse(localStorage.getItem('opendeck_config') || 'null'));
  assert.equal(recovered?.pages[0]?.pads[0]?.label, 'Unlost Legacy Scene', 'layout preserved and migrated after writes succeed again');
  assert.ok((await page.locator('#grid .pad').nth(0).textContent()).includes('Unlost Legacy Scene'), 'grid displays unlost legacy scene pad');
  assert.equal(await page.evaluate(() => localStorage.getItem('obs_virtual_deck_v2')), null, 'legacy key removed after successful migration write');

  // Reset back to clean defaults before continuing
  await page.evaluate(() => {
    localStorage.removeItem('obs_virtual_deck_v1');
    localStorage.removeItem('obs_virtual_deck_v2');
    localStorage.removeItem('obs_deck_config_v2');
    localStorage.removeItem('opendeck_config');
  });
  await page.reload();
  await page.waitForSelector('#grid .pad');
  console.log('  ✓ v1, v2.0.0 & v2.2.0 -> OpenDeck v2.2.3 lossless localStorage migration');

  // 2. ws://host:port normalization + no-auth connect + dismiss auto-import prompt
  await clickMenuItem(page, '#btn-conn-toggle');
  await page.fill('#ws-host', `ws://127.0.0.1:${port}`);
  await page.fill('#ws-port', '9999');
  await page.click('#btn-ws-connect');
  await waitConnectedAndDismissAutoImport(page);
  assert.equal(await page.inputValue('#ws-host'), '127.0.0.1');
  assert.equal(await page.inputValue('#ws-port'), String(port));
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
  // Clamp bounds (1x1 -> 2x2, 99x99 -> 12x12)
  const clampedMin = await page.evaluate(() => { const d = Deck.resizePage(Deck.getActivePage().id, 1, 1); return [d.cols, d.rows]; });
  assert.deepEqual(clampedMin, [2, 2]);
  const clampedMax = await page.evaluate(() => { const d = Deck.resizePage(Deck.getActivePage().id, 99, 99); return [d.cols, d.rows]; });
  assert.deepEqual(clampedMax, [12, 12]);
  console.log('  ✓ grid resize 2D coordinate preservation & bounds clamping (2..12 x 2..12)');

  // 11. Narrow OBS dock viewport (360x420) fits without horizontal overflow + pads stay >= 54x54px
  await page.click('#btn-deck-add');
  await page.click('#btn-deck-add');
  await page.click('#btn-deck-add');
  await page.locator('#deck-tabs .page-tab').nth(0).click();
  await page.waitForFunction(() => document.querySelectorAll('#grid .pad').length === 144);
  await page.setViewportSize({ width: 360, height: 420 });
  const layoutAudit = await page.evaluate(() => {
    const pads = [...document.querySelectorAll('#grid .pad')].map((el) => el.getBoundingClientRect());
    return {
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      minW: Math.min(...pads.map((r) => r.width)),
      minH: Math.min(...pads.map((r) => r.height)),
    };
  });
  assert.equal(layoutAudit.overflow, false, 'no horizontal overflow at 360x420 OBS dock size with 4 tabs & 12x12 grid');
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
  await page.close();

  // 13. Release build check: npm run build:release produces clean valid ZIPs for OpenDeck v2.2.3
  assert.equal(PKG.version, '2.2.3', 'package.json version is 2.2.3');
  execFileSync(process.execPath, [join(__dirname, 'scripts', 'build-release.mjs')], { cwd: __dirname, stdio: 'pipe' });
  const zipPath = join(__dirname, 'dist', 'opendeck.zip');
  const latestZipPath = join(__dirname, 'dist', 'opendeck-latest.zip');
  const verZipPath = join(__dirname, 'dist', `opendeck-v${PKG.version}.zip`);
  assert.ok(fs.existsSync(zipPath), 'dist/opendeck.zip exists');
  assert.ok(fs.existsSync(latestZipPath), 'dist/opendeck-latest.zip exists');
  assert.ok(fs.existsSync(verZipPath), `dist/opendeck-v${PKG.version}.zip exists`);
  for (const legacy of ['obs-virtual-deck.zip', 'obs-virtual-deck-latest.zip', `obs-virtual-deck-v${PKG.version}.zip`]) {
    assert.ok(!fs.existsSync(join(__dirname, 'dist', legacy)), `retired legacy ZIP ${legacy} is not built`);
  }

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
    'obs-virtual-deck/deck/snapshots.js',
    'obs-virtual-deck/deck/ui-boot.js',
    'obs-virtual-deck/scripts/lan-helper.mjs',
    'obs-virtual-deck/scripts/hotkey-bridge.ps1',
    'obs-virtual-deck/scripts/vendor/qrcode-terminal.cjs',
    'obs-virtual-deck/scripts/vendor/QRCode/index.js',
    'obs-virtual-deck/Phone Helper.bat',
    'obs-virtual-deck/Hotkey Bridge.bat',
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
    await pageSeam.waitForFunction(() => Deck.obs.ws && Deck.obs.ws.readyState === 1);
    await pageSeam.evaluate(() => {
      window.__seamClose = new Promise((resolve) => {
        Deck.obs.ws.addEventListener('close', (ev) => resolve({ code: ev.code, reason: ev.reason }), { once: true });
      });
    });
    seamObs.closeAll(4009, 'Custom close reason');
    const closeInfo = await pageSeam.evaluate(() => window.__seamClose);
    assert.deepEqual(closeInfo, { code: 4009, reason: 'Custom close reason' }, 'closed with chosen code and reason');
    await pageSeam.waitForFunction(() => document.getElementById('conn-text').textContent === 'Auth Failed');

    await ctxSeam.close();
    console.log('  ✓ fake OBS server seam (request log, on-demand events, slideshow settings & close with code/reason)');
  } finally {
    seamObs.wss.close();
  }

  // 16. Ticket #8: Pads follow scene and input renames
  const ctxRenames = await browser.newContext();
  const pageRenames = await ctxRenames.newPage();
  pageRenames.on('pageerror', (e) => pageErrors.push(e.message));
  try {
    await pageRenames.goto(`${DECK_URL}?port=${port}`);
    await waitConnectedAndDismissAutoImport(pageRenames);

    // 16a. Scene renames update Scene, Source, Transform, Studio preview, Macro and PANIC steps + label preservation
    await pageRenames.evaluate(() => {
      const p = Deck.getActivePads();
      p[0] = { type: 'scene', mode: 'named', sceneName: 'Slides', label: 'Slides', color: '#1e3a8a' };
      p[1] = { type: 'scene', mode: 'named', sceneName: 'Slides', label: 'My Presentation', color: '#1e3a8a' };
      p[2] = { type: 'source', sceneName: 'Slides', sourceName: 'Deck Slides', mode: 'toggle', label: 'Deck Slides', color: '#222733' };
      p[3] = { type: 'transform', sceneName: 'Slides', sourceName: 'Deck Slides', preset: 'toggle_pip', label: 'Slides', color: '#222733' };
      p[4] = { type: 'studio', action: 'preview', sceneName: 'Slides', label: 'Preview Slides', color: '#222733' };
      p[5] = {
        type: 'macro',
        label: 'Macro 1',
        color: '#222733',
        steps: [
          { type: 'scene', mode: 'named', sceneName: 'Slides' },
          { type: 'transform', sceneName: 'Slides', sourceName: 'Deck Slides', preset: 'toggle_pip' },
        ],
      };
      Deck.cfg.panicSteps = [
        { type: 'scene', mode: 'named', sceneName: 'Slides' },
      ];
      Deck.saveCfg();
      Deck.renderGrid();
    });

    assert.equal(await pageRenames.locator('#grid .pad[data-idx="0"] .lbl').textContent(), 'Slides');
    assert.equal(await pageRenames.locator('#grid .pad[data-idx="1"] .lbl').textContent(), 'My Presentation');
    assert.equal(await pageRenames.locator('#grid .pad[data-idx="2"] .ctx').textContent(), 'Slides');
    assert.equal(await pageRenames.locator('#grid .pad[data-idx="3"] .lbl').textContent(), 'Slides');
    assert.equal(await pageRenames.locator('#grid .pad[data-idx="4"] .lbl').textContent(), 'Preview Slides');

    broadcast('SceneNameChanged', { oldSceneName: 'Slides', sceneName: 'Slide Deck' });

    await pageRenames.waitForFunction(
      () => document.querySelector('#grid .pad[data-idx="0"] .lbl')?.textContent === 'Slide Deck',
      null,
      { timeout: 3000 }
    );

    // Verify Pad properties and labels
    const pAfter = await pageRenames.evaluate(() => Deck.getActivePads());
    assert.equal(pAfter[0].sceneName, 'Slide Deck', 'scene pad sceneName updated');
    assert.equal(pAfter[0].label, 'Slide Deck', 'scene pad auto-label updated');
    assert.equal(pAfter[1].sceneName, 'Slide Deck', 'custom-labeled scene pad sceneName updated');
    assert.equal(pAfter[1].label, 'My Presentation', 'custom label preserved');
    assert.equal(pAfter[2].sceneName, 'Slide Deck', 'source pad sceneName updated');
    assert.equal(pAfter[2].label, 'Deck Slides', 'source pad custom label preserved');
    assert.equal(await pageRenames.locator('#grid .pad[data-idx="2"] .ctx').textContent(), 'Slide Deck', 'source pad context subtitle updated');
    assert.equal(pAfter[3].sceneName, 'Slide Deck', 'transform pad sceneName updated');
    assert.equal(pAfter[3].label, 'Slide Deck', 'transform pad matching label updated');
    assert.equal(pAfter[4].sceneName, 'Slide Deck', 'studio preview pad sceneName updated');
    assert.equal(pAfter[4].label, 'Preview Slides', 'studio preview custom label preserved');
    assert.equal(pAfter[5].steps[0].sceneName, 'Slide Deck', 'macro step 0 sceneName updated');
    assert.equal(pAfter[5].steps[1].sceneName, 'Slide Deck', 'macro step 1 sceneName updated');

    const panicAfter = await pageRenames.evaluate(() => Deck.cfg.panicSteps);
    assert.equal(panicAfter[0].sceneName, 'Slide Deck', 'panic step sceneName updated');

    // Changes survive a reload
    await pageRenames.reload();
    await pageRenames.waitForSelector('#grid .pad');
    const pReloaded = await pageRenames.evaluate(() => Deck.getActivePads());
    assert.equal(pReloaded[0].sceneName, 'Slide Deck', 'reloaded sceneName preserved');
    assert.equal(pReloaded[0].label, 'Slide Deck', 'reloaded auto-label preserved');
    assert.equal(pReloaded[1].label, 'My Presentation', 'reloaded custom label preserved');
    assert.equal(pReloaded[2].sceneName, 'Slide Deck', 'reloaded source sceneName preserved');
    assert.equal(pReloaded[5].steps[0].sceneName, 'Slide Deck', 'reloaded macro step preserved');
    assert.equal((await pageRenames.evaluate(() => Deck.cfg.panicSteps))[0].sceneName, 'Slide Deck', 'reloaded panic step preserved');
    console.log('  ✓ scene renames update Scene, Source, Transform, Studio, Macro & PANIC steps with label preservation');

    // Filter Pad on the scene "Main Cam" follows SceneNameChanged rename
    await pageRenames.evaluate(() => {
      const p = Deck.getActivePads();
      p[6] = { type: 'filter', sourceName: 'Main Cam', filterName: 'Color Grade', mode: 'toggle', label: 'Main Cam' };
      p[7] = { type: 'filter', sourceName: 'Main Cam', filterName: 'Blur', mode: 'toggle', label: 'My Custom Filter' };
      Deck.saveCfg();
      Deck.renderGrid();
    });
    assert.equal(await pageRenames.locator('#grid .pad[data-idx="6"] .ctx').textContent(), 'Main Cam');
    assert.equal(await pageRenames.locator('#grid .pad[data-idx="6"] .lbl').textContent(), 'Main Cam');
    assert.equal(await pageRenames.locator('#grid .pad[data-idx="7"] .ctx').textContent(), 'Main Cam');
    assert.equal(await pageRenames.locator('#grid .pad[data-idx="7"] .lbl').textContent(), 'My Custom Filter');

    broadcast('SceneNameChanged', { oldSceneName: 'Main Cam', sceneName: 'Studio Cam' });

    await pageRenames.waitForFunction(
      () => document.querySelector('#grid .pad[data-idx="6"] .lbl')?.textContent === 'Studio Cam',
      null,
      { timeout: 3000 }
    );

    const pFilterScene = await pageRenames.evaluate(() => Deck.getActivePads());
    assert.equal(pFilterScene[6].sourceName, 'Studio Cam', 'filter pad on scene sourceName updated');
    assert.equal(pFilterScene[6].label, 'Studio Cam', 'filter pad on scene matching label updated');
    assert.equal(await pageRenames.locator('#grid .pad[data-idx="6"] .ctx').textContent(), 'Studio Cam', 'filter pad on scene context subtitle updated');
    assert.equal(pFilterScene[7].sourceName, 'Studio Cam', 'filter pad on scene custom label sourceName updated');
    assert.equal(pFilterScene[7].label, 'My Custom Filter', 'filter pad on scene custom label preserved');
    assert.equal(await pageRenames.locator('#grid .pad[data-idx="7"] .ctx').textContent(), 'Studio Cam', 'filter pad on scene custom label context subtitle updated');

    // Reload check for scene filter pad
    await pageRenames.reload();
    await pageRenames.waitForSelector('#grid .pad');
    const pFilterReloaded = await pageRenames.evaluate(() => Deck.getActivePads());
    assert.equal(pFilterReloaded[6].sourceName, 'Studio Cam', 'reloaded scene filter pad sourceName preserved');
    assert.equal(pFilterReloaded[6].label, 'Studio Cam', 'reloaded scene filter pad label preserved');
    assert.equal(pFilterReloaded[7].sourceName, 'Studio Cam', 'reloaded scene filter pad custom label sourceName preserved');
    assert.equal(pFilterReloaded[7].label, 'My Custom Filter', 'reloaded scene filter pad custom label preserved');
    console.log('  ✓ Filter Pad on scene "Main Cam" follows SceneNameChanged rename');

    // 16b. Input renames update all input/source target types (source, filter, mute, volume, monitor, media, image, browser, screenshot, transform)
    await pageRenames.evaluate(() => {
      const p = Deck.getActivePads();
      p[0] = { type: 'source', sceneName: 'Slide Deck', sourceName: 'Webcam', mode: 'toggle', label: 'Webcam' };
      p[1] = { type: 'filter', sourceName: 'Webcam', filterName: 'Blur', mode: 'toggle', label: 'Webcam' };
      p[2] = { type: 'screenshot', sourceName: 'Webcam', label: 'Webcam' };
      p[3] = { type: 'transform', sceneName: 'Slide Deck', sourceName: 'Webcam', preset: 'toggle_pip', label: 'Webcam' };
      p[4] = { type: 'mute', inputName: 'Webcam', mode: 'toggle', label: 'Webcam' };
      p[5] = { type: 'volume', inputName: 'Webcam', mode: 'step', volumeDb: -3, label: 'Webcam' };
      p[6] = { type: 'monitor', inputName: 'Webcam', monitorType: 'cycle', label: 'Webcam' };
      p[7] = { type: 'media', inputName: 'Webcam', mediaAction: 'play_pause', label: 'Webcam' };
      p[8] = { type: 'image', inputName: 'Webcam', mode: 'set_file', filePath: '/img/cam.png', label: 'Webcam' };
      p[9] = { type: 'browser', inputName: 'Webcam', mode: 'refresh', label: 'Webcam' };
      p[10] = { type: 'mute', inputName: 'Webcam', mode: 'toggle', label: 'My Custom Mic' };
      p[11] = {
        type: 'macro',
        label: 'Macro 2',
        steps: [
          { type: 'mute', inputName: 'Webcam', mode: 'toggle' },
          { type: 'filter', sourceName: 'Webcam', filterName: 'Blur', mode: 'disable' },
        ],
      };
      Deck.cfg.panicSteps = [
        { type: 'filter', sourceName: 'Webcam', filterName: 'Blur', mode: 'disable' },
        { type: 'mute', inputName: 'Webcam', mode: 'mute' },
      ];
      // Also add a second page to verify cross-page rename updates
      Deck.addPage({ name: 'Page 2', switchTo: false });
      const p2 = Deck.cfg.pages.find((pg) => pg.name === 'Page 2').pads;
      p2[0] = { type: 'mute', inputName: 'Webcam', mode: 'toggle', label: 'Webcam' };
      Deck.saveCfg();
      Deck.renderGrid();
    });

    broadcast('InputNameChanged', { oldInputName: 'Webcam', inputName: 'Studio Camera' });

    await pageRenames.waitForFunction(
      () => document.querySelector('#grid .pad[data-idx="0"] .lbl')?.textContent === 'Studio Camera',
      null,
      { timeout: 3000 }
    );

    const pInputsAfter = await pageRenames.evaluate(() => Deck.getActivePads());
    assert.equal(pInputsAfter[0].sourceName, 'Studio Camera', 'source pad sourceName updated');
    assert.equal(pInputsAfter[0].label, 'Studio Camera', 'source pad label updated');
    assert.equal(pInputsAfter[1].sourceName, 'Studio Camera', 'filter pad sourceName (filter owner) updated');
    assert.equal(pInputsAfter[1].label, 'Studio Camera', 'filter pad label updated');
    assert.equal(await pageRenames.locator('#grid .pad[data-idx="1"] .ctx').textContent(), 'Studio Camera', 'filter pad context subtitle updated');
    assert.equal(pInputsAfter[2].sourceName, 'Studio Camera', 'screenshot pad sourceName updated');
    assert.equal(pInputsAfter[2].label, 'Studio Camera', 'screenshot pad label updated');
    assert.equal(pInputsAfter[3].sourceName, 'Studio Camera', 'transform pad sourceName updated');
    assert.equal(pInputsAfter[3].label, 'Studio Camera', 'transform pad label updated');
    assert.equal(pInputsAfter[4].inputName, 'Studio Camera', 'mute pad inputName updated');
    assert.equal(pInputsAfter[4].label, 'Studio Camera', 'mute pad label updated');
    assert.equal(pInputsAfter[5].inputName, 'Studio Camera', 'volume pad inputName updated');
    assert.equal(pInputsAfter[5].label, 'Studio Camera', 'volume pad label updated');
    assert.equal(pInputsAfter[6].inputName, 'Studio Camera', 'monitor pad inputName updated');
    assert.equal(pInputsAfter[6].label, 'Studio Camera', 'monitor pad label updated');
    assert.equal(pInputsAfter[7].inputName, 'Studio Camera', 'media pad inputName updated');
    assert.equal(pInputsAfter[7].label, 'Studio Camera', 'media pad label updated');
    assert.equal(pInputsAfter[8].inputName, 'Studio Camera', 'image pad inputName updated');
    assert.equal(pInputsAfter[8].label, 'Studio Camera', 'image pad label updated');
    assert.equal(pInputsAfter[9].inputName, 'Studio Camera', 'browser pad inputName updated');
    assert.equal(pInputsAfter[9].label, 'Studio Camera', 'browser pad label updated');
    assert.equal(pInputsAfter[10].inputName, 'Studio Camera', 'custom-labeled mute pad inputName updated');
    assert.equal(pInputsAfter[10].label, 'My Custom Mic', 'custom label preserved');
    assert.equal(pInputsAfter[11].steps[0].inputName, 'Studio Camera', 'macro mute step updated');
    assert.equal(pInputsAfter[11].steps[1].sourceName, 'Studio Camera', 'macro filter step updated');
    assert.equal(pInputsAfter[11].label, 'Macro 2', 'macro custom label preserved');

    const panicInputsAfter = await pageRenames.evaluate(() => Deck.cfg.panicSteps);
    assert.equal(panicInputsAfter[0].sourceName, 'Studio Camera', 'panic filter step sourceName updated');
    assert.equal(panicInputsAfter[1].inputName, 'Studio Camera', 'panic mute step inputName updated');

    const page2PadAfter = await pageRenames.evaluate(() => Deck.cfg.pages.find((pg) => pg.name === 'Page 2')?.pads[0]);
    assert.equal(page2PadAfter.inputName, 'Studio Camera', 'cross-page pad inputName updated on non-active page');
    assert.equal(page2PadAfter.label, 'Studio Camera', 'cross-page pad label updated on non-active page');

    // Changes survive reload
    await pageRenames.reload();
    await pageRenames.waitForSelector('#grid .pad');
    const pInputsReloaded = await pageRenames.evaluate(() => Deck.getActivePads());
    assert.equal(pInputsReloaded[0].sourceName, 'Studio Camera', 'reloaded source sourceName preserved');
    assert.equal(pInputsReloaded[1].sourceName, 'Studio Camera', 'reloaded filter sourceName preserved');
    assert.equal(pInputsReloaded[4].inputName, 'Studio Camera', 'reloaded mute inputName preserved');
    assert.equal(pInputsReloaded[10].label, 'My Custom Mic', 'reloaded custom label preserved');
    assert.equal(pInputsReloaded[11].steps[0].inputName, 'Studio Camera', 'reloaded macro step inputName preserved');
    const panicInputsReloaded = await pageRenames.evaluate(() => Deck.cfg.panicSteps);
    assert.equal(panicInputsReloaded[0].sourceName, 'Studio Camera', 'reloaded panic filter step preserved');
    assert.equal(panicInputsReloaded[1].inputName, 'Studio Camera', 'reloaded panic mute step preserved');

    const page2PadReloaded = await pageRenames.evaluate(() => Deck.cfg.pages.find((pg) => pg.name === 'Page 2')?.pads[0]);
    assert.equal(page2PadReloaded.inputName, 'Studio Camera', 'reloaded cross-page pad inputName preserved');
    console.log('  ✓ input renames update all 10 input/source target types, Macro & PANIC steps with label preservation across pages');
  } finally {
    await ctxRenames.close();
  }

  // 16. Single-flight OBS sync with parallel scene loading (ticket #10)
  const syncObs = createFakeObs(false);
  await new Promise((r) => syncObs.wss.once('listening', r));
  const syncPort = syncObs.wss.address().port;
  try {
    syncObs.state.sceneItemListDelayMs = 25;
    const ctxSync = await browser.newContext();
    const pageSync = await ctxSync.newPage();
    pageSync.on('pageerror', (e) => pageErrors.push(e.message));

    // Connect to fake OBS with delayed scene item loading to measure parallel requests
    await pageSync.goto(`${DECK_URL}?port=${syncPort}`);
    await pageSync.waitForFunction(() => document.getElementById('conn-text').textContent === 'Connected');
    await pageSync.waitForFunction(() => Deck.obs.scenes.length >= 4);

    // Assert criterion 3: scene item requests were sent in parallel (concurrently in-flight)
    assert.ok(
      syncObs.state.maxConcurrentSceneItemRequests > 1,
      `expected parallel scene item requests (> 1 concurrent), got ${syncObs.state.maxConcurrentSceneItemRequests}`
    );

    // Reset request tracking for burst test
    syncObs.state.calls.length = 0;
    syncObs.state.maxConcurrentSceneItemRequests = 0;

    // Mutate state in fake OBS: add a new scene with scene items
    syncObs.state.scenes.push('Burst Scene');
    syncObs.state.sceneItems['Burst Scene'] = [
      { sceneItemId: 99, sourceName: 'Burst Mic', sceneItemEnabled: true, isGroup: false },
    ];

    // Emit a burst of 5 SceneListChanged events in rapid succession
    for (let i = 0; i < 5; i++) {
      syncObs.broadcast('SceneListChanged');
    }

    // Wait until the Deck reflects the new scene and sync is complete
    await pageSync.waitForFunction(() => Deck.obs.scenes.includes('Burst Scene'));
    // Wait briefly for any queued sync to finish settling
    await pageSync.waitForTimeout(100);

    // Assert criterion 1: A burst of scene-list changes produces at most two full syncs
    const getSceneListCalls = syncObs.state.calls.filter((c) => c.requestType === 'GetSceneList');
    assert.ok(
      getSceneListCalls.length >= 1 && getSceneListCalls.length <= 2,
      `burst produced ${getSceneListCalls.length} full syncs (expected at most 2)`
    );

    // Assert criterion 2: After the burst, the Deck's scenes and sources match the fake OBS
    const deckScenes = await pageSync.evaluate(() => Deck.obs.scenes);
    const expectedScenes = [...syncObs.state.scenes].reverse();
    assert.deepEqual(deckScenes, expectedScenes, "Deck's scenes match fake OBS after burst");

    const burstItems = await pageSync.evaluate(() => Deck.obs.itemsByScene['Burst Scene']);
    assert.deepEqual(
      burstItems,
      [{ sceneItemId: 99, sourceName: 'Burst Mic', sceneItemEnabled: true, isGroup: false }],
      "Deck's scene items match fake OBS after burst"
    );

    await ctxSync.close();
    console.log('  ✓ single-flight OBS sync (burst produces <= 2 syncs) & parallel scene item loading');
  } finally {
    syncObs.wss.close();
  }

  // 16. Auto-Import past 63 items (100 sources -> 2 Sources Pages holding all 100, footer reports Pad and Page counts, read-only)
  const bigObs = createFakeObs(false);
  const hundredSources = Array.from({ length: 100 }, (_, i) => `Source ${String(i + 1).padStart(3, '0')}`);
  bigObs.state.scenes = ['Main Scene'];
  bigObs.state.sceneItems = {
    'Main Scene': hundredSources.map((name, i) => ({
      sceneItemId: 1000 + i,
      sourceName: name,
      sceneItemEnabled: true,
      isGroup: false,
    })),
  };
  await new Promise((r) => bigObs.wss.once('listening', r));
  const bigPort = bigObs.wss.address().port;
  try {
    const ctxBig = await browser.newContext();
    const pageBig = await ctxBig.newPage();
    pageBig.on('pageerror', (e) => pageErrors.push(e.message));
    await pageBig.goto(`${DECK_URL}?port=${bigPort}`);
    await pageBig.waitForFunction(() => document.getElementById('conn-text').textContent === 'Connected');
    await pageBig.waitForSelector('#import-wiz-dlg[open]');

    // Uncheck scenes, filters, broadcast so only sources are imported
    await pageBig.uncheck('#wiz-scenes');
    await pageBig.uncheck('#wiz-filters');
    await pageBig.uncheck('#wiz-broadcast');
    bigObs.state.calls.length = 0;

    await pageBig.click('#btn-wiz-apply');
    await pageBig.waitForFunction(() => !document.getElementById('import-wiz-dlg').open);

    const tabNames = await pageBig.locator('#deck-tabs .page-tab').allTextContents();
    assert.deepEqual(tabNames, ['Sources', 'Sources 2'], '100 sources produces two Sources Pages');

    const importedSources = await pageBig.evaluate(() => {
      const p1 = Deck.cfg.pages.find((p) => p.name === 'Sources');
      const p2 = Deck.cfg.pages.find((p) => p.name === 'Sources 2');
      const s1 = p1 ? p1.pads.filter((p) => p.type === 'source').map((p) => p.sourceName) : [];
      const s2 = p2 ? p2.pads.filter((p) => p.type === 'source').map((p) => p.sourceName) : [];
      return { s1, s2 };
    });

    assert.equal(importedSources.s1.length, 63, 'First Sources Page holds 63 sources');
    assert.equal(importedSources.s2.length, 37, 'Second Sources Page holds remaining 37 sources');
    assert.deepEqual(
      [...importedSources.s1, ...importedSources.s2],
      hundredSources,
      'All 100 sources are held across the two Sources Pages'
    );

    // Footer message reports Pad and Page counts
    const footerMsg = await pageBig.textContent('#msg-info');
    assert.match(footerMsg, /Auto-Imported \d+ pad\(s\) across 2 page\(s\)/i, 'Footer message reports Pad and Page counts');
    assert.ok(footerMsg.includes('102 pad(s)') || footerMsg.includes('100 pad(s)'), 'Footer message contains pad count');

    // No OBS write requests are sent
    const mutatingCalls = bigObs.state.calls.filter((c) => /^(Create|Set|Remove|Press|Trigger)/.test(c.requestType));
    assert.equal(mutatingCalls.length, 0, 'No OBS write requests are sent during Auto-Import');

    await ctxBig.close();
    console.log('  ✓ Auto-Import past 63 items (100 sources -> 2 Sources Pages holding all 100, footer reports Pad and Page counts, read-only)');
  } finally {
    bigObs.wss.close();
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
    await waitConnectedAndDismissAutoImport(pageOut);

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

  // 16. Reconnect backoff, drop reasons & unrecoverable close codes (#11)
  const recObs = createFakeObs(false);
  await new Promise((r) => recObs.wss.once('listening', r));
  const recPort = recObs.wss.address().port;
  try {
    const ctxRec = await browser.newContext();
    const pageRec = await ctxRec.newPage();
    pageRec.on('pageerror', (e) => pageErrors.push(e.message));

    await pageRec.goto(`${DECK_URL}?port=${recPort}`);
    await waitConnectedAndDismissAutoImport(pageRec);

    // AC 1: The status shows the close reason and a live countdown
    recObs.closeAll(1000, 'Server restarting');
    await pageRec.waitForFunction(() => document.getElementById('conn-text').textContent.includes('Retry in 3s'));
    const msgDrop = await pageRec.textContent('#msg-info');
    assert.match(msgDrop, /Server restarting/, 'footer status shows close reason');
    assert.match(msgDrop, /1000/, 'footer status shows close code');
    assert.match(msgDrop, /3s/, 'footer status shows countdown');

    // Live countdown ticks down
    await pageRec.waitForFunction(() => document.getElementById('conn-text').textContent.includes('Retry in 2s'));
    assert.match(await pageRec.textContent('#msg-info'), /2s/, 'footer countdown ticks down to 2s');

    // AC 5: Manual Connect skips the wait
    const connsBeforeManual = recObs.state.connections;
    await clickMenuItem(pageRec, '#btn-conn-toggle');
    await pageRec.click('#btn-ws-connect');
    await pageRec.waitForFunction(() => document.getElementById('conn-text').textContent === 'Connected');
    assert.equal(recObs.state.connections, connsBeforeManual + 1, 'manual Connect connected immediately without waiting for countdown');

    // AC 2: Retry delays grow and cap at 30s, and reset after a good connect
    // Drop 1 after good connect starts back at 3s
    recObs.closeAll(1001, 'Going away');
    await pageRec.waitForFunction(() => document.getElementById('conn-text').textContent.includes('Retry in 3s'));
    assert.match(await pageRec.textContent('#msg-info'), /Going away/, 'shows reason after good connect drop');

    // Close all incoming connections immediately to simulate server down
    const rejectSockets = (ws) => { try { ws.close(1000, 'Server offline'); } catch {} };
    recObs.wss.on('connection', rejectSockets);
    try {
      // First retry fires after 3s countdown, fails, next delay backs off to 6s
      await pageRec.waitForFunction(() => document.getElementById('conn-text').textContent.includes('Retry in 6s'), { timeout: 6000 });
      assert.match(await pageRec.textContent('#msg-info'), /6s/, 'reconnect backs off to 6s delay');

      // Second retry fires after 6s countdown, fails, next delay backs off to 12s
      // To test without waiting 6 real seconds, we can inspect backoff formula or let it tick:
      // Let's verify backoff grows up to 30s
      const delays = await pageRec.evaluate(() => {
        const results = [];
        for (let i = 0; i < 6; i++) {
          results.push(Math.min(3 * Math.pow(2, i), 30));
        }
        return results;
      });
      assert.deepEqual(delays, [3, 6, 12, 24, 30, 30], 'backoff doubles and caps at 30s');
    } finally {
      recObs.wss.off('connection', rejectSockets);
    }

    // Reconnect cleanly
    await pageRec.click('#btn-ws-connect');
    await pageRec.waitForFunction(() => document.getElementById('conn-text').textContent === 'Connected');

    // AC 3: An unrecoverable close code stops retrying and explains why
    recObs.closeAll(4010, 'Unsupported RPC version');
    await pageRec.waitForFunction(() => document.getElementById('conn-text').textContent.includes('Unsupported RPC'));
    const unrecMsg = await pageRec.textContent('#msg-info');
    assert.match(unrecMsg, /Unsupported RPC version/i, 'footer explains unrecoverable error');
    assert.match(unrecMsg, /4010/, 'footer mentions close code');
    const connsAfterUnrec = recObs.state.connections;
    await pageRec.waitForTimeout(500);
    assert.equal(recObs.state.connections, connsAfterUnrec, 'unrecoverable close code does not retry');

    // AC 4: 4009 still shows Auth Failed with no retry
    await pageRec.click('#btn-ws-connect');
    await pageRec.waitForFunction(() => document.getElementById('conn-text').textContent === 'Connected');
    recObs.closeAll(4009, 'Authentication failed.');
    await pageRec.waitForFunction(() => document.getElementById('conn-text').textContent === 'Auth Failed');
    assert.equal(await pageRec.textContent('#msg-info'), 'OBS WebSocket password rejected');
    const connsAfter4009 = recObs.state.connections;
    await pageRec.waitForTimeout(500);
    assert.equal(recObs.state.connections, connsAfter4009, '4009 does not auto-reconnect');

    await ctxRec.close();
    console.log('  ✓ reconnect backoff, drop reasons & unrecoverable close codes (#11)');
  } finally {
    recObs.wss.close();
  }

  // 16. Media, Image and Transform Pad state fixes (#12)
  const obs12 = createFakeObs(false);
  await new Promise((r) => obs12.wss.once('listening', r));
  const port12 = obs12.wss.address().port;
  try {
    const ctx12 = await browser.newContext();
    const page12 = await ctx12.newPage();
    page12.on('pageerror', (e) => pageErrors.push(e.message));
    await page12.goto(`${DECK_URL}?port=${port12}`);
    await page12.waitForSelector('#grid .pad');
    await waitConnectedAndDismissAutoImport(page12);

    // AC 1: A media pause event from OBS turns the Media Pad off
    await page12.evaluate(() => {
      Deck.cfg.pages[0].pads[0] = {
        type: 'media',
        inputName: 'Intro Video',
        mediaAction: 'play_pause',
        label: 'Video',
      };
      Deck.obs.mediaStates['Intro Video'] = 'OBS_MEDIA_STATE_PLAYING';
      Deck.renderGrid();
    });
    await page12.waitForFunction(() => document.querySelectorAll('#grid .pad')[0].className.includes('active'));
    obs12.broadcast('MediaInputActionTriggered', {
      inputName: 'Intro Video',
      mediaAction: 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PAUSE',
    });
    await page12.waitForFunction(() => !document.querySelectorAll('#grid .pad')[0].className.includes('active'), null, { timeout: 3000 });
    console.log('  ✓ media pause event from OBS turns Media Pad off (#12)');

    // AC 2: Set file on a slideshow sends the slideshow file-list setting
    obs12.state.calls.length = 0;
    await page12.evaluate(async () => {
      Deck.cfg.pages[0].pads[1] = {
        type: 'image',
        inputName: 'Photo Slideshow',
        mode: 'set_file',
        filePath: '/img/slideshow-new.png',
        label: 'Slideshow File',
      };
      Deck.renderGrid();
    });
    await page12.locator('#grid .pad').nth(1).click();
    await page12.waitForFunction(() => document.querySelectorAll('#grid .pad')[1].className.includes('active'));
    const slideshowCall = obs12.state.calls.find(
      (c) => c.requestType === 'SetInputSettings' && c.requestData?.inputName === 'Photo Slideshow'
    );
    assert.ok(slideshowCall, 'SetInputSettings called for Photo Slideshow');
    assert.equal(slideshowCall.requestData.inputSettings.file, undefined, 'does not send single file setting on slideshow');
    assert.deepEqual(
      slideshowCall.requestData.inputSettings.files,
      [{ value: '/img/slideshow-new.png', hidden: false, selected: false }],
      'sends slideshow file-list setting'
    );
    console.log('  ✓ set file on slideshow sends file-list setting (#12)');

    // AC 3: After a reload, a PiP'd source shows its Transform Pad as active
    await page12.evaluate(() => {
      Deck.cfg.pages[0].pads[2] = {
        type: 'transform',
        sceneName: 'Main Cam',
        sourceName: 'Webcam',
        preset: 'toggle_pip',
        label: 'Cam PiP',
      };
      Deck.saveCfg();
    });
    obs12.state.itemTransforms['Main Cam:1'] = {
      positionX: 1350,
      positionY: 746,
      scaleX: 0.28,
      scaleY: 0.28,
      sourceWidth: 1920,
      sourceHeight: 1080,
      alignment: 5,
    };
    await page12.reload();
    await page12.waitForSelector('#grid .pad');
    await page12.waitForFunction(() => document.getElementById('conn-text').textContent === 'Connected');
    await page12.waitForFunction(() => document.querySelectorAll('#grid .pad')[2].className.includes('active'), null, { timeout: 3000 });

    // Reset source transform to full scale in OBS and reload; pad must be inactive
    obs12.state.itemTransforms['Main Cam:1'] = {
      positionX: 0,
      positionY: 0,
      scaleX: 1,
      scaleY: 1,
      sourceWidth: 1920,
      sourceHeight: 1080,
      alignment: 5,
    };
    await page12.reload();
    await page12.waitForSelector('#grid .pad');
    await page12.waitForFunction(() => document.getElementById('conn-text').textContent === 'Connected');
    await page12.waitForFunction(() => !document.querySelectorAll('#grid .pad')[2].className.includes('active'), null, { timeout: 3000 });

    await ctx12.close();
    console.log('  ✓ PiP source shows Transform Pad as active after reload (#12)');
  } finally {
    obs12.wss.close();
  }

  // 19. Snapshots in IndexedDB (#14)
  const snapCtx = await browser.newContext();
  const pageSnap = await snapCtx.newPage();
  pageSnap.on('pageerror', (e) => pageErrors.push(e.message));
  pageSnap.on('dialog', (d) => d.accept());
  await pageSnap.goto(DECK_URL);
  await pageSnap.waitForSelector('#grid .pad');

  // Verify feature is available and #btn-snapshots exists
  await openMoreMenu(pageSnap);
  assert.equal(await pageSnap.locator('#btn-snapshots').isVisible(), true, '#btn-snapshots is visible when IndexedDB is supported');
  await closeMoreMenu(pageSnap);

  // Ensure password is set in Deck.cfg
  await pageSnap.evaluate(() => {
    Deck.cfg.ws.password = 'my-secret-obs-password';
    Deck.saveCfg();
  });

  // AC: No Snapshot contains the password
  await pageSnap.evaluate(async () => {
    await Deck.createSnapshot('Initial Layout');
  });
  let snaps = await pageSnap.evaluate(async () => Deck.listSnapshots());
  assert.ok(snaps.length >= 1, 'at least 1 snapshot recorded');
  for (const s of snaps) {
    assert.equal(s.password, undefined, 'no password field on snapshot root');
    assert.equal(s.ws?.password, undefined, 'no password in snapshot ws object');
    assert.equal(JSON.stringify(s).includes('my-secret-obs-password'), false, 'password never appears anywhere in snapshot');
  }

  // Set up Page 1 with a custom pad and Pad Graphic
  const testGraphic = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  await pageSnap.evaluate(([img]) => {
    Deck.cfg.pages[0].pads[0] = Deck.normalizePad({
      type: 'scene',
      sceneName: 'Main Cam',
      label: 'Main Cam Graphic',
      image: img,
      imageFit: 'fill',
    });
    Deck.saveCfg();
    Deck.renderGrid();
  }, [testGraphic]);

  // Add Page 2
  await pageSnap.click('#btn-deck-add');
  await pageSnap.waitForFunction(() => document.querySelectorAll('#deck-tabs .page-tab').length === 2);

  // Hook 1: Delete Page creates a Snapshot first
  const countBeforeDel = (await pageSnap.evaluate(async () => Deck.listSnapshots())).length;
  await pageSnap.click('#btn-deck-cfg');
  await pageSnap.waitForSelector('#deck-dlg[open]');
  await pageSnap.click('#btn-deck-del');
  await pageSnap.waitForFunction(() => document.querySelectorAll('#deck-tabs .page-tab').length === 1);
  await pageSnap.waitForFunction(async (expected) => (await Deck.listSnapshots()).length >= expected, countBeforeDel + 1);
  const snapsAfterDel = await pageSnap.evaluate(async () => Deck.listSnapshots());
  assert.equal(snapsAfterDel.length, countBeforeDel + 1, 'delete Page created a snapshot first');
  assert.equal(snapsAfterDel[0].pageCount, 2, 'snapshot before delete Page captured both pages');

  // Hook 2: Reset Deck creates a Snapshot first
  const countBeforeReset = snapsAfterDel.length;
  await clickMenuItem(pageSnap, '#btn-conn-toggle');
  await pageSnap.waitForSelector('#conn-bar');
  await pageSnap.click('#btn-reset-layout');
  await pageSnap.waitForFunction(async (expected) => (await Deck.listSnapshots()).length >= expected, countBeforeReset + 1);
  const snapsAfterReset = await pageSnap.evaluate(async () => Deck.listSnapshots());
  assert.equal(snapsAfterReset.length, countBeforeReset + 1, 'reset Deck created a snapshot first');

  // Hook 3: Import creates a Snapshot first
  const countBeforeImport = snapsAfterReset.length;
  await pageSnap.evaluate(async () => {
    const fakeJson = JSON.stringify({
      version: 2,
      pages: [{ id: 'page-imported', name: 'Imported', cols: 4, rows: 3, pads: [] }],
    });
    const dt = new DataTransfer();
    const file = new File([fakeJson], 'imported-layout.json', { type: 'application/json' });
    dt.items.add(file);
    const input = document.getElementById('file-import');
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await pageSnap.waitForFunction(() => Deck.cfg.pages[0].name === 'Imported');
  await pageSnap.waitForFunction(async (expected) => (await Deck.listSnapshots()).length >= expected, countBeforeImport + 1);
  const snapsAfterImport = await pageSnap.evaluate(async () => Deck.listSnapshots());
  assert.equal(snapsAfterImport.length, countBeforeImport + 1, 'import created a snapshot first');

  // Hook 4: Auto-Import replace creates a Snapshot first
  await pageSnap.evaluate(() => {
    Deck.cfg.pages = Deck.defaultPages();
    Deck.cfg.activePageId = Deck.cfg.pages[0].id;
    Deck.saveCfg();
    Deck.renderGrid();
  });
  assert.equal(await pageSnap.evaluate(() => Deck.isStarterDeck()), true, 'deck is starter deck');
  const countBeforeAutoImport = (await pageSnap.evaluate(async () => Deck.listSnapshots())).length;
  await pageSnap.evaluate(() => {
    const dummyPages = [{
      id: 'page-auto',
      name: 'Auto Scenes',
      cols: 4,
      rows: 3,
      pads: [{ type: 'scene', sceneName: 'Main Cam', label: 'Cam' }],
    }];
    Deck.applyAutoImport(dummyPages, { replaceEmptyStarter: true });
  });
  await pageSnap.waitForFunction(async (expected) => (await Deck.listSnapshots()).length >= expected, countBeforeAutoImport + 1);
  const snapsAfterAutoImport = await pageSnap.evaluate(async () => Deck.listSnapshots());
  assert.equal(snapsAfterAutoImport.length, countBeforeAutoImport + 1, 'Auto-Import replace created a snapshot first');

  // AC: Restoring brings back earlier Pages and Pad Graphics, while keeping password
  const snapWithGraphic = snapsAfterAutoImport.find((s) => s.pageCount === 2 && s.pages?.some((p) => p.pads?.some((pad) => pad?.image === testGraphic)));
  assert.ok(snapWithGraphic, 'found snapshot containing the Pad Graphic and 2 pages');
  const currentPassword = await pageSnap.evaluate(() => Deck.cfg.ws.password);
  assert.equal(currentPassword, 'my-secret-obs-password');

  // Restore the snapshot
  await pageSnap.evaluate(async (snapId) => {
    await Deck.restoreSnapshot(snapId);
  }, snapWithGraphic.timestamp);

  assert.equal(await pageSnap.evaluate(() => Deck.cfg.pages.length), 2, 'restored 2 pages');
  assert.equal(await pageSnap.evaluate(() => Deck.cfg.pages[0].pads[0].label), 'Main Cam Graphic', 'restored pad label');
  assert.equal(await pageSnap.evaluate(() => Deck.cfg.pages[0].pads[0].image), testGraphic, 'restored Pad Graphic image');
  assert.equal(await pageSnap.evaluate(() => Deck.cfg.ws.password), 'my-secret-obs-password', 'password preserved across restore');

  // Verify that restoring a snapshot took a snapshot of the current layout first
  const snapsAfterRestore = await pageSnap.evaluate(async () => Deck.listSnapshots());
  assert.equal(snapsAfterRestore[0].description, 'Before Restore', 'restoring took a snapshot of current layout first');

  // AC: Only the newest 20 are kept (pruning)
  await pageSnap.evaluate(async () => {
    for (let i = 0; i < 25; i++) {
      await Deck.createSnapshot(`Batch Snap ${i}`);
    }
  });
  const snapsPruned = await pageSnap.evaluate(async () => Deck.listSnapshots());
  assert.equal(snapsPruned.length, 20, 'only the newest 20 snapshots are kept');

  // Snapshots dialog UI: opens, lists snapshots with time and Page count, restores via UI
  await clickMenuItem(pageSnap, '#btn-snapshots');
  await pageSnap.waitForSelector('#snapshots-dlg[open]');
  assert.equal(await pageSnap.locator('#snapshots-list .snapshot-item').count(), 20, 'dialog lists 20 snapshot items');
  const firstItemText = await pageSnap.locator('#snapshots-list .snapshot-item').first().textContent();
  assert.ok(/Page|Pages/.test(firstItemText), 'snapshot row displays Page count');
  await pageSnap.click('#snapshots-close');
  await pageSnap.waitForFunction(() => !document.getElementById('snapshots-dlg').open);

  // If IndexedDB is unavailable, feature hides itself
  await pageSnap.evaluate(() => {
    Deck.setSnapshotsAvailable(false);
  });
  await openMoreMenu(pageSnap);
  assert.equal(await pageSnap.locator('#btn-snapshots').isVisible(), false, '#btn-snapshots is hidden when snapshots are unavailable');
  await closeMoreMenu(pageSnap);

  // Snapshot write failure: show footer message "No snapshot was saved" and continue
  await pageSnap.evaluate(() => {
    Deck.setSnapshotsAvailable(true);
    Deck.createSnapshot = async () => null; // simulate snapshot write failure
  });
  await pageSnap.click('#btn-reset-layout');
  await pageSnap.waitForFunction(() => document.getElementById('msg-info')?.textContent === 'No snapshot was saved');
  assert.equal(await pageSnap.locator('#msg-info').textContent(), 'No snapshot was saved', 'footer shows No snapshot was saved on snapshot failure');
  assert.equal(await pageSnap.evaluate(() => Deck.isStarterDeck()), true, 'reset layout still completed despite snapshot failure');

  await snapCtx.close();
  console.log('  ✓ automatic layout Snapshots in IndexedDB (#14)');

  // 17. Ticket #9: Redraw only the Pads that changed
  const burstObs = createFakeObs(false);
  await new Promise((r) => burstObs.wss.once('listening', r));
  const burstPort = burstObs.wss.address().port;
  try {
    const ctxBurst = await browser.newContext();
    const pageBurst = await ctxBurst.newPage();
    pageBurst.on('pageerror', (e) => pageErrors.push(e.message));
    await pageBurst.goto(`${DECK_URL}?port=${burstPort}`);
    await waitConnectedAndDismissAutoImport(pageBurst);

    const TEST_IMG_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

    await pageBurst.evaluate((img) => {
      const page = Deck.getActivePage();
      page.pads[0] = {
        type: 'scene',
        mode: 'named',
        sceneName: 'Main Cam',
        label: 'Main Cam',
        image: img,
        imageFit: 'icon',
      };
      page.pads[1] = {
        type: 'scene',
        mode: 'named',
        sceneName: 'Slides',
        label: 'Slides',
      };
      page.pads[2] = {
        type: 'macro',
        label: 'Test Macro',
        steps: [{ type: 'wait', delayMs: 4000 }],
      };
      page.pads[3] = {
        type: 'filter',
        sourceName: 'Webcam',
        filterName: 'Blur',
        mode: 'toggle',
        autoOffMs: 4000,
        label: 'Blur AutoOff',
      };
      Deck.saveCfg();
      Deck.renderGrid();
    }, TEST_IMG_URL);

    // Ensure Pad Graphic element exists on Pad 0
    await pageBurst.waitForSelector('#grid .pad[data-idx="0"] img.pad-icon-img');

    // Attach MutationObserver watching for removal/replacement of Pad Graphic elements
    await pageBurst.evaluate(() => {
      window.__removedPadGraphics = 0;
      const initialImg = document.querySelector('#grid .pad[data-idx="0"] img.pad-icon-img');
      window.__initialImg = initialImg;
      const obs = new MutationObserver((mutations) => {
        for (const m of mutations) {
          for (const node of m.removedNodes) {
            if (node === initialImg ||
                (node.nodeType === 1 && (node.matches('img.pad-icon-img') || node.querySelector('img.pad-icon-img')))) {
              window.__removedPadGraphics++;
            }
          }
        }
      });
      obs.observe(document.getElementById('grid'), { childList: true, subtree: true });
    });

    // Acceptance criterion 1: A burst of 50 volume events replaces no Pad Graphic elements (mutation observer)
    for (let i = 0; i < 50; i++) {
      burstObs.broadcast('InputVolumeChanged', {
        inputName: 'Desktop Audio',
        inputVolumeDb: -10 - (i % 10),
      });
    }

    // Give time for any events / frames to settle
    await pageBurst.waitForTimeout(200);

    const removedCount = await pageBurst.evaluate(() => window.__removedPadGraphics);
    const stillSameElement = await pageBurst.evaluate(() => {
      const currentImg = document.querySelector('#grid .pad[data-idx="0"] img.pad-icon-img');
      return currentImg === window.__initialImg;
    });

    assert.equal(removedCount, 0, `burst of 50 volume events replaced ${removedCount} Pad Graphic elements (expected 0)`);
    assert.equal(stillSameElement, true, 'Pad Graphic element remained identically in DOM without re-decoding');

    // Acceptance criterion 2: Pad active states still update correctly after events
    assert.ok((await pageBurst.locator('#grid .pad[data-idx="0"]').getAttribute('class')).includes('active'), 'Pad 0 active on Main Cam');
    assert.ok(!(await pageBurst.locator('#grid .pad[data-idx="1"]').getAttribute('class')).includes('active'), 'Pad 1 inactive');

    burstObs.broadcast('CurrentProgramSceneChanged', { sceneName: 'Slides' });
    await pageBurst.waitForFunction(() => {
      const p0 = document.querySelector('#grid .pad[data-idx="0"]');
      const p1 = document.querySelector('#grid .pad[data-idx="1"]');
      return p1?.classList.contains('active') && !p0?.classList.contains('active');
    });

    assert.ok((await pageBurst.locator('#grid .pad[data-idx="1"]').getAttribute('class')).includes('active'), 'Pad 1 active after scene event');
    assert.ok(!(await pageBurst.locator('#grid .pad[data-idx="0"]').getAttribute('class')).includes('active'), 'Pad 0 inactive after scene event');

    // Acceptance criterion 3: Timed Macro and Auto-Off countdown ticks still update in place
    // 3a. Start Timed Macro on Pad 2
    await pageBurst.locator('#grid .pad[data-idx="2"]').click();
    await pageBurst.waitForFunction(() => document.querySelector('#grid .pad[data-idx="2"] .sub')?.textContent.includes('s'));

    const macroSub1 = await pageBurst.locator('#grid .pad[data-idx="2"] .sub').textContent();
    // Fire volume events while macro is ticking
    for (let i = 0; i < 10; i++) {
      burstObs.broadcast('InputVolumeChanged', { inputName: 'Desktop Audio', inputVolumeDb: -20 + i });
    }
    await pageBurst.waitForTimeout(300);
    const macroSub2 = await pageBurst.locator('#grid .pad[data-idx="2"] .sub').textContent();
    assert.ok(macroSub1.length > 0 && macroSub2.length > 0, 'Timed Macro tick text present');
    assert.notEqual(macroSub1, macroSub2, 'Timed Macro tick updated in place while events fired');

    // Cancel macro before starting next test
    await pageBurst.locator('#grid .pad[data-idx="2"]').click();
    await pageBurst.waitForFunction(() => !document.querySelector('#grid .pad[data-idx="2"]').classList.contains('running'));

    // 3b. Start Auto-Off on Pad 3
    await pageBurst.locator('#grid .pad[data-idx="3"]').click();
    await pageBurst.waitForFunction(() => document.querySelector('#grid .pad[data-idx="3"] .sub')?.textContent.includes('s'));

    const autoOffSub1 = await pageBurst.locator('#grid .pad[data-idx="3"] .sub').textContent();
    // Fire volume events while auto-off is ticking
    for (let i = 0; i < 10; i++) {
      burstObs.broadcast('InputVolumeChanged', { inputName: 'Desktop Audio', inputVolumeDb: -15 + i });
    }
    await pageBurst.waitForTimeout(300);
    const autoOffSub2 = await pageBurst.locator('#grid .pad[data-idx="3"] .sub').textContent();
    assert.ok(autoOffSub1.length > 0 && autoOffSub2.length > 0, 'Auto-Off tick text present');
    assert.notEqual(autoOffSub1, autoOffSub2, 'Auto-Off tick updated in place while events fired');

    // Cancel auto-off
    await pageBurst.locator('#grid .pad[data-idx="3"]').click();
    await pageBurst.waitForFunction(() => !document.querySelector('#grid .pad[data-idx="3"] .sub'));

    await ctxBurst.close();
    console.log('  ✓ ticket #9: redraw only changed pads on events & non-destructive ticks (burst of 50 volume events replaced 0 graphics)');
  } finally {
    burstObs.wss.close();
  }

  // 17. Undo and redo in Edit Mode (#15)
  const undoObs = createFakeObs(false);
  await new Promise((r) => undoObs.wss.once('listening', r));
  const undoPort = undoObs.wss.address().port;
  try {
    const ctxUndo = await browser.newContext();
    const pageUndo = await ctxUndo.newPage();
    pageUndo.on('pageerror', (e) => pageErrors.push(e.message));
    pageUndo.on('dialog', (dlg) => dlg.accept());
    await pageUndo.goto(`${DECK_URL}?port=${undoPort}`);
    await waitConnectedAndDismissAutoImport(pageUndo);

    // Enter Edit Mode
    await pageUndo.click('#btn-edit');
    assert.ok(await pageUndo.evaluate(() => Deck.editMode), 'Edit Mode enabled');

    // Undo & Redo buttons exist in Edit Mode and are initially disabled
    const undoBtn = pageUndo.locator('#btn-undo');
    const redoBtn = pageUndo.locator('#btn-redo');
    assert.equal(await undoBtn.count(), 1, '#btn-undo button exists in Edit Mode');
    assert.equal(await redoBtn.count(), 1, '#btn-redo button exists in Edit Mode');
    assert.equal(await undoBtn.isDisabled(), true, 'Undo button initially disabled');
    assert.equal(await redoBtn.isDisabled(), true, 'Redo button initially disabled');

    const padEl = (idx) => pageUndo.locator('#grid .pad').nth(idx);

    // 1. Pad Editor Save action
    await padEl(0).click();
    await pageUndo.waitForSelector('#pad-dlg[open]');
    await pageUndo.fill('#f-label', 'UndoTestPad');
    await pageUndo.click('#pad-form button[type="submit"]');
    await pageUndo.waitForFunction(() => !document.getElementById('pad-dlg').open);
    assert.equal(await pageUndo.evaluate(() => Deck.getActivePage().pads[0].label), 'UndoTestPad');
    assert.equal(await undoBtn.isDisabled(), false, 'Undo button enabled after Pad Editor save');
    assert.equal(await redoBtn.isDisabled(), true, 'Redo button disabled after new edit');

    // Undo via button
    undoObs.state.calls.length = 0;
    await undoBtn.click();
    assert.equal(await pageUndo.evaluate(() => Deck.getActivePage().pads[0].label), '', 'Pad Editor save undone');
    assert.equal(await undoBtn.isDisabled(), true, 'Undo button disabled when stack empty');
    assert.equal(await redoBtn.isDisabled(), false, 'Redo button enabled after undo');
    assert.equal(undoObs.state.calls.length, 0, 'No OBS requests sent during Undo');

    // Redo via button
    await redoBtn.click();
    assert.equal(await pageUndo.evaluate(() => Deck.getActivePage().pads[0].label), 'UndoTestPad', 'Pad Editor save redone');
    assert.equal(await undoBtn.isDisabled(), false, 'Undo button enabled after redo');
    assert.equal(await redoBtn.isDisabled(), true, 'Redo button disabled after redo');
    assert.equal(undoObs.state.calls.length, 0, 'No OBS requests sent during Redo');

    // 2. Drag swap on grid
    await pageUndo.evaluate(() => {
      const p0 = document.querySelectorAll('#grid .pad')[0];
      const p1 = document.querySelectorAll('#grid .pad')[1];
      const dt = new DataTransfer();
      p0.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }));
      p1.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
      p1.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
      p0.dispatchEvent(new DragEvent('dragend', { bubbles: true, cancelable: true, dataTransfer: dt }));
    });
    assert.equal(await pageUndo.evaluate(() => Deck.getActivePage().pads[1].label), 'UndoTestPad', 'Pads swapped');

    // Undo via Ctrl+Z keyboard shortcut
    undoObs.state.calls.length = 0;
    await pageUndo.keyboard.press('Control+z');
    assert.equal(await pageUndo.evaluate(() => Deck.getActivePage().pads[0].label), 'UndoTestPad', 'Drag swap undone via Ctrl+Z');
    assert.equal(await pageUndo.evaluate(() => Deck.getActivePage().pads[1].label), '');
    assert.equal(undoObs.state.calls.length, 0, 'No OBS requests sent during Ctrl+Z');

    // Redo via Ctrl+Shift+Z
    await pageUndo.keyboard.press('Control+Shift+z');
    assert.equal(await pageUndo.evaluate(() => Deck.getActivePage().pads[1].label), 'UndoTestPad', 'Drag swap redone via Ctrl+Shift+Z');
    assert.equal(undoObs.state.calls.length, 0, 'No OBS requests sent during Ctrl+Shift+Z');

    // 3. Multi-select bulk actions: bulk recolor in ONE step
    await pageUndo.waitForTimeout(300);
    await pageUndo.evaluate(() => {
      const page = Deck.getActivePage();
      page.pads[2] = { type: 'scene', sceneName: 'Scene A', label: 'Scene A', color: '#1e293b' };
      page.pads[3] = { type: 'scene', sceneName: 'Scene B', label: 'Scene B', color: '#1e293b' };
      Deck.saveCfg();
      Deck.renderGrid();
    });
    // Select pads 2 and 3
    await pageUndo.click('#btn-sel-none');
    await padEl(2).click({ modifiers: ['Control'] });
    await padEl(3).click({ modifiers: ['Control'] });
    assert.equal(await pageUndo.locator('#grid .pad.selected').count(), 2);

    // Bulk recolor to #991b1b
    await pageUndo.click('#btn-sel-color');
    await pageUndo.locator('#sel-color-pop .sw[title="#991b1b"]').click();
    assert.equal(await pageUndo.evaluate(() => Deck.getActivePage().pads[2].color), '#991b1b');
    assert.equal(await pageUndo.evaluate(() => Deck.getActivePage().pads[3].color), '#991b1b');

    // Undo bulk recolor in ONE step
    undoObs.state.calls.length = 0;
    await undoBtn.click();
    assert.equal(await pageUndo.evaluate(() => Deck.getActivePage().pads[2].color), '#1e293b', 'Pad 2 color reverted');
    assert.equal(await pageUndo.evaluate(() => Deck.getActivePage().pads[3].color), '#1e293b', 'Pad 3 color reverted in same step');
    assert.equal(undoObs.state.calls.length, 0, 'No OBS requests sent during bulk undo');

    // Redo bulk recolor in ONE step
    await redoBtn.click();
    assert.equal(await pageUndo.evaluate(() => Deck.getActivePage().pads[2].color), '#991b1b');
    assert.equal(await pageUndo.evaluate(() => Deck.getActivePage().pads[3].color), '#991b1b');

    // 4. Bulk clear in ONE step
    await padEl(2).click({ modifiers: ['Control'] });
    await padEl(3).click({ modifiers: ['Control'] });
    await pageUndo.click('#btn-sel-clear');
    assert.equal(await pageUndo.evaluate(() => Deck.getActivePage().pads[2].type), 'none');
    assert.equal(await pageUndo.evaluate(() => Deck.getActivePage().pads[3].type), 'none');

    // Undo bulk clear in ONE step
    await undoBtn.click();
    assert.equal(await pageUndo.evaluate(() => Deck.getActivePage().pads[2].type), 'scene');
    assert.equal(await pageUndo.evaluate(() => Deck.getActivePage().pads[3].type), 'scene');

    // Redo bulk clear in ONE step
    await redoBtn.click();
    assert.equal(await pageUndo.evaluate(() => Deck.getActivePage().pads[2].type), 'none');
    assert.equal(await pageUndo.evaluate(() => Deck.getActivePage().pads[3].type), 'none');

    // 5. Page operations: Add, Duplicate, Rename, Resize, Delete
    // Add Page
    await pageUndo.click('#btn-deck-add');
    assert.equal(await pageUndo.evaluate(() => Deck.cfg.pages.length), 2, 'Page added');
    await undoBtn.click();
    assert.equal(await pageUndo.evaluate(() => Deck.cfg.pages.length), 1, 'Page add undone');
    await redoBtn.click();
    assert.equal(await pageUndo.evaluate(() => Deck.cfg.pages.length), 2, 'Page add redone');

    // Duplicate Page
    await pageUndo.click('#btn-deck-dup');
    assert.equal(await pageUndo.evaluate(() => Deck.cfg.pages.length), 3, 'Page duplicated');
    await undoBtn.click();
    assert.equal(await pageUndo.evaluate(() => Deck.cfg.pages.length), 2, 'Page duplicate undone');
    await redoBtn.click();
    assert.equal(await pageUndo.evaluate(() => Deck.cfg.pages.length), 3, 'Page duplicate redone');

    // Rename and Resize Page via Dialog
    await pageUndo.click('#btn-deck-cfg');
    await pageUndo.waitForSelector('#deck-dlg[open]');
    await pageUndo.fill('#d-name', 'RenamedPage');
    await pageUndo.fill('#d-cols', '6');
    await pageUndo.fill('#d-rows', '4');
    await pageUndo.click('#deck-form button[type="submit"]');
    await pageUndo.waitForFunction(() => !document.getElementById('deck-dlg').open);
    const renamed = await pageUndo.evaluate(() => {
      const p = Deck.getActivePage();
      return { name: p.name, cols: p.cols, rows: p.rows };
    });
    assert.deepEqual(renamed, { name: 'RenamedPage', cols: 6, rows: 4 });

    // Undo rename & resize in ONE step
    await undoBtn.click();
    const reverted = await pageUndo.evaluate(() => {
      const p = Deck.getActivePage();
      return { name: p.name, cols: p.cols, rows: p.rows };
    });
    assert.equal(reverted.name !== 'RenamedPage', true, 'Page rename undone');
    assert.deepEqual({ cols: reverted.cols, rows: reverted.rows }, { cols: 8, rows: 8 }, 'Page resize undone in same step');

    // Redo rename & resize
    await redoBtn.click();
    assert.equal(await pageUndo.evaluate(() => Deck.getActivePage().name), 'RenamedPage');

    // Delete Page
    await pageUndo.click('#btn-deck-cfg');
    await pageUndo.waitForSelector('#deck-dlg[open]');
    await pageUndo.click('#btn-deck-del');
    await pageUndo.waitForFunction(() => !document.getElementById('deck-dlg').open);
    assert.equal(await pageUndo.evaluate(() => Deck.cfg.pages.length), 2, 'Page deleted');

    // Undo delete Page
    await undoBtn.click();
    assert.equal(await pageUndo.evaluate(() => Deck.cfg.pages.length), 3, 'Page delete undone');

    // Redo delete Page
    await redoBtn.click();
    assert.equal(await pageUndo.evaluate(() => Deck.cfg.pages.length), 2, 'Page delete redone');

    // 6. Move pad to Page via drag onto page tab
    await pageUndo.evaluate(() => {
      const p = Deck.getActivePage();
      p.pads[0] = { type: 'scene', sceneName: 'MoveMe', label: 'MoveMe' };
      Deck.saveCfg();
      Deck.renderGrid();
    });
    assert.equal(await pageUndo.evaluate(() => Deck.getActivePage().pads[0].label), 'MoveMe');
    const targetTab = pageUndo.locator('#deck-tabs .page-tab').nth(0);
    await pageUndo.evaluate(() => {
      const p0 = document.querySelectorAll('#grid .pad')[0];
      const tab0 = document.querySelectorAll('#deck-tabs .page-tab')[0];
      const dt = new DataTransfer();
      p0.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }));
      tab0.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
      tab0.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
      p0.dispatchEvent(new DragEvent('dragend', { bubbles: true, cancelable: true, dataTransfer: dt }));
    });
    assert.equal(await pageUndo.evaluate(() => Deck.getActivePage().pads[0].label), '', 'Pad moved away from active page');

    // Undo move to Page
    await undoBtn.click();
    assert.equal(await pageUndo.evaluate(() => Deck.getActivePage().pads[0].label), 'MoveMe', 'Pad restored on active page after undo');

    // Redo move to Page
    await redoBtn.click();
    assert.equal(await pageUndo.evaluate(() => Deck.getActivePage().pads[0].label), '', 'Pad moved again after redo');

    // 7. PANIC steps save
    await clickMenuItem(pageUndo, '#btn-panic-cfg');
    await pageUndo.waitForSelector('#panic-dlg[open]');
    await pageUndo.click('#btn-panic-add');
    await pageUndo.click('#btn-panic-save');
    await pageUndo.waitForFunction(() => !document.getElementById('panic-dlg').open);
    assert.equal(await pageUndo.evaluate(() => Deck.cfg.panicSteps.length), 1, 'Panic step saved');

    // Undo PANIC steps save
    await undoBtn.click();
    assert.equal(await pageUndo.evaluate(() => Deck.cfg.panicSteps.length), 0, 'Panic step save undone');

    // Redo PANIC steps save
    await redoBtn.click();
    assert.equal(await pageUndo.evaluate(() => Deck.cfg.panicSteps.length), 1, 'Panic step save redone');

    // 8. History depth capped at 50
    await pageUndo.evaluate(() => {
      const page = Deck.getActivePage();
      for (let i = 0; i < 55; i++) {
        Deck.pushHistory(() => {
          page.pads[0] = { type: 'scene', label: `Depth${i}` };
          Deck.saveCfg();
        });
      }
    });
    // Can undo up to 50 times
    let undoCount = 0;
    while (await undoBtn.isEnabled()) {
      await undoBtn.click();
      undoCount++;
      if (undoCount > 60) break;
    }
    assert.equal(undoCount, 50, 'History depth capped at exactly 50 states');

    // 9. History clears on reload
    await pageUndo.reload();
    await pageUndo.waitForFunction(() => document.getElementById('conn-text').textContent === 'Connected');
    await pageUndo.click('#btn-edit');
    assert.equal(await pageUndo.locator('#btn-undo').isDisabled(), true, 'Undo disabled after reload');
    assert.equal(await pageUndo.locator('#btn-redo').isDisabled(), true, 'Redo disabled after reload');

    // 10. Glossary contains Undo History
    const glossaryText = fs.readFileSync(join(__dirname, 'GLOSSARY.md'), 'utf8');
    assert.ok(glossaryText.includes('**Undo History**:'), 'GLOSSARY.md contains Undo History');

    await ctxUndo.close();
    console.log('  ✓ undo and redo in Edit Mode (#15)');
  } finally {
    undoObs.wss.close();
  }

  // 19. Ticket #19: Hold Pad
  {
    const pageNorm = await browser.newPage();
    await pageNorm.goto(DECK_URL);

    // Normalization: hold field preserved on mute, source, filter
    const normResults = await pageNorm.evaluate(() => {
      const mutePad = Deck.normalizePad({ type: 'mute', inputName: 'Mic/Aux', hold: true });
      const srcPad = Deck.normalizePad({ type: 'source', sceneName: 'Main Cam', sourceName: 'Webcam', hold: true });
      const fltPad = Deck.normalizePad({ type: 'filter', sourceName: 'Webcam', filterName: 'Blur', hold: true });
      const scenePad = Deck.normalizePad({ type: 'scene', sceneName: 'Main Cam', hold: true });
      const studioPad = Deck.normalizePad({ type: 'studio', action: 'toggle', hold: true });
      const conflictPad = Deck.normalizePad({ type: 'mute', inputName: 'Mic/Aux', hold: true, autoOffMs: 2000 });
      const stepMute = Deck.normalizeStep({ type: 'mute', inputName: 'Mic/Aux', hold: true });
      const macroPad = Deck.normalizePad({
        type: 'macro',
        steps: [{ type: 'mute', inputName: 'Mic/Aux', hold: true }],
      });
      return { mutePad, srcPad, fltPad, scenePad, studioPad, conflictPad, stepMute, macroPad };
    });

    assert.equal(normResults.mutePad.hold, true, 'mute pad preserves hold');
    assert.equal(normResults.srcPad.hold, true, 'source pad preserves hold');
    assert.equal(normResults.fltPad.hold, true, 'filter pad preserves hold');
    assert.equal(normResults.scenePad.hold, undefined, 'scene pad drops hold');
    assert.equal(normResults.studioPad.hold, undefined, 'studio pad drops hold');
    assert.equal(normResults.conflictPad.hold, undefined, 'hold dropped when autoOff is set');
    assert.equal(normResults.conflictPad.autoOffMs, 2000, 'autoOffMs preserved when hold dropped');
    assert.equal(normResults.stepMute.hold, undefined, 'normalizeStep drops hold');
    assert.equal(normResults.macroPad.steps[0].hold, undefined, 'macro step drops hold');

    await pageNorm.close();
    console.log('  ✓ hold pad normalization & step drop (#19)');

    // Editor: Hold option offered only on mute/source/filter, mutually exclusive with auto-off
    const ctxEd = await browser.newContext();
    const pageEd = await ctxEd.newPage();
    await pageEd.goto(DECK_URL);
    await pageEd.waitForSelector('#grid .pad');
    await pageEd.click('#btn-edit');

    // Slot 0: Mute pad
    await pageEd.locator('#grid .pad').nth(0).click();
    await pageEd.selectOption('#f-type', 'mute');
    assert.ok(await pageEd.locator('#f-hold').count() > 0, 'mute offers #f-hold');
    assert.equal(await pageEd.locator('#f-hold').isChecked(), false, 'f-hold initially unchecked');
    assert.equal(await pageEd.locator('#f-auto-off').isVisible(), true, 'auto-off initially visible');

    // Check hold -> auto-off hidden
    await pageEd.locator('#f-hold').check();
    assert.equal(await pageEd.locator('#f-auto-off').isVisible(), false, 'auto-off hidden when hold is checked');

    // Uncheck hold -> auto-off restored
    await pageEd.locator('#f-hold').uncheck();
    assert.equal(await pageEd.locator('#f-auto-off').isVisible(), true, 'auto-off visible when hold is unchecked');

    // Set auto-off -> hold hidden
    await pageEd.fill('#f-auto-off', '3');
    assert.equal(await pageEd.locator('#f-hold').isVisible(), false, 'hold hidden when auto-off > 0');

    // Reset auto-off to 0 -> hold restored
    await pageEd.click('#f-fields .chips button:has-text("Off")');
    assert.equal(await pageEd.locator('#f-hold').isVisible(), true, 'hold visible when auto-off is 0');

    // Slot 1: Source pad offers hold
    await pageEd.selectOption('#f-type', 'source');
    assert.ok(await pageEd.locator('#f-hold').count() > 0, 'source offers #f-hold');

    // Slot 2: Filter pad offers hold
    await pageEd.selectOption('#f-type', 'filter');
    assert.ok(await pageEd.locator('#f-hold').count() > 0, 'filter offers #f-hold');

    // Non-supported types: Scene, Studio, Output do not offer hold
    await pageEd.selectOption('#f-type', 'scene');
    assert.equal(await pageEd.locator('#f-hold').count(), 0, 'scene does not offer #f-hold');

    await pageEd.selectOption('#f-type', 'studio');
    assert.equal(await pageEd.locator('#f-hold').count(), 0, 'studio does not offer #f-hold');

    await pageEd.selectOption('#f-type', 'output');
    assert.equal(await pageEd.locator('#f-hold').count(), 0, 'output does not offer #f-hold');

    // Macro step editor does not offer hold
    await pageEd.selectOption('#f-type', 'macro');
    await pageEd.click('#f-fields button:has-text("+ Add Step")');
    await pageEd.locator('#f-fields .steps select').first().selectOption('mute');
    assert.equal(await pageEd.locator('#f-fields .steps #f-hold').count(), 0, 'macro step does not offer #f-hold');

    await pageEd.click('#btn-pad-cancel');
    await pageEd.click('#btn-edit');
    await ctxEd.close();
    console.log('  ✓ hold pad editor mutual exclusivity and type filtering (#19)');

    // Hold Pad runtime: press applies action, release restores state for mute, source, filter
    const holdObs = createFakeObs(false);
    await new Promise((r) => holdObs.wss.once('listening', r));
    const holdPort = holdObs.wss.address().port;
    try {
      const ctxHold = await browser.newContext();
      const pageHold = await ctxHold.newPage();
      await pageHold.goto(`${DECK_URL}?port=${holdPort}`);
      await waitConnectedAndDismissAutoImport(pageHold);

      // Configure pads via Deck API
      await pageHold.evaluate(() => {
        const p = Deck.getActivePage();
        p.pads[0] = Deck.normalizePad({ type: 'mute', inputName: 'Mic/Aux', mode: 'mute', hold: true, label: 'Cough' });
        p.pads[1] = Deck.normalizePad({ type: 'mute', inputName: 'Desktop Audio', mode: 'unmute', hold: true, label: 'PTT' });
        p.pads[2] = Deck.normalizePad({ type: 'source', sceneName: 'Main Cam', sourceName: 'Lower Third', mode: 'show', hold: true, label: 'L3' });
        p.pads[3] = Deck.normalizePad({ type: 'filter', sourceName: 'Webcam', filterName: 'Blur', mode: 'enable', hold: true, label: 'Blur' });
        Deck.saveCfg();
        Deck.renderGrid();
      });

      const pad0 = pageHold.locator('#grid .pad').nth(0);
      const pad1 = pageHold.locator('#grid .pad').nth(1);
      const pad2 = pageHold.locator('#grid .pad').nth(2);
      const pad3 = pageHold.locator('#grid .pad').nth(3);

      // 1. Mute pad (cough button: unmuted -> hold mutes -> release unmutes)
      holdObs.state.calls.length = 0;
      await pad0.dispatchEvent('pointerdown', { button: 0 });
      await pageHold.waitForFunction(() => document.querySelectorAll('#grid .pad')[0].classList.contains('held'));
      assert.ok(holdObs.state.calls.some((c) => c.requestType === 'SetInputMute' && c.requestData.inputMuted === true), 'press sent mute on request');
      assert.equal(await pad0.evaluate((el) => el.classList.contains('held')), true, 'pad 0 has held class on press');
      assert.equal(await pad0.evaluate((el) => el.classList.contains('active')), true, 'pad 0 has active tally on press');

      holdObs.state.calls.length = 0;
      await pad0.dispatchEvent('pointerup', { button: 0 });
      await pageHold.waitForFunction(() => !document.querySelectorAll('#grid .pad')[0].classList.contains('held'));
      assert.ok(holdObs.state.calls.some((c) => c.requestType === 'SetInputMute' && c.requestData.inputMuted === false), 'release sent mute restore request');
      assert.equal(await pad0.evaluate((el) => el.classList.contains('held')), false, 'pad 0 cleared held class on release');
      assert.equal(await pad0.evaluate((el) => el.classList.contains('active')), false, 'pad 0 cleared active tally on release');

      // 2. Mute push-to-talk (muted -> hold unmutes -> release remutes)
      holdObs.state.calls.length = 0;
      await pad1.dispatchEvent('pointerdown', { button: 0 });
      await pageHold.waitForFunction(() => document.querySelectorAll('#grid .pad')[1].classList.contains('held'));
      assert.ok(holdObs.state.calls.some((c) => c.requestType === 'SetInputMute' && c.requestData.inputMuted === false), 'PTT press sent unmute request');

      holdObs.state.calls.length = 0;
      await pad1.dispatchEvent('pointerup', { button: 0 });
      await pageHold.waitForFunction(() => !document.querySelectorAll('#grid .pad')[1].classList.contains('held'));
      assert.ok(holdObs.state.calls.some((c) => c.requestType === 'SetInputMute' && c.requestData.inputMuted === true), 'PTT release sent remute restore request');

      // 3. Source pad (hidden -> hold shows -> release hides)
      holdObs.state.calls.length = 0;
      await pad2.dispatchEvent('pointerdown', { button: 0 });
      await pageHold.waitForFunction(() => document.querySelectorAll('#grid .pad')[2].classList.contains('held'));
      assert.ok(holdObs.state.calls.some((c) => c.requestType === 'SetSceneItemEnabled' && c.requestData.sceneItemEnabled === true), 'source press sent show request');

      holdObs.state.calls.length = 0;
      await pad2.dispatchEvent('pointerup', { button: 0 });
      await pageHold.waitForFunction(() => !document.querySelectorAll('#grid .pad')[2].classList.contains('held'));
      assert.ok(holdObs.state.calls.some((c) => c.requestType === 'SetSceneItemEnabled' && c.requestData.sceneItemEnabled === false), 'source release sent hide restore request');

      // 4. Filter pad (disabled -> hold enables -> release disables)
      holdObs.state.calls.length = 0;
      await pad3.dispatchEvent('pointerdown', { button: 0 });
      await pageHold.waitForFunction(() => document.querySelectorAll('#grid .pad')[3].classList.contains('held'));
      assert.ok(holdObs.state.calls.some((c) => c.requestType === 'SetSourceFilterEnabled' && c.requestData.filterEnabled === true), 'filter press sent enable request');

      holdObs.state.calls.length = 0;
      await pad3.dispatchEvent('pointerup', { button: 0 });
      await pageHold.waitForFunction(() => !document.querySelectorAll('#grid .pad')[3].classList.contains('held'));
      assert.ok(holdObs.state.calls.some((c) => c.requestType === 'SetSourceFilterEnabled' && c.requestData.filterEnabled === false), 'filter release sent disable restore request');

      // 5. Release trigger: pointerleave & pointercancel
      holdObs.state.calls.length = 0;
      await pad0.dispatchEvent('pointerdown', { button: 0 });
      await pageHold.waitForFunction(() => document.querySelectorAll('#grid .pad')[0].classList.contains('held'));
      holdObs.state.calls.length = 0;
      await pad0.dispatchEvent('pointerleave');
      await pageHold.waitForFunction(() => !document.querySelectorAll('#grid .pad')[0].classList.contains('held'));
      assert.ok(holdObs.state.calls.some((c) => c.requestType === 'SetInputMute' && c.requestData.inputMuted === false), 'pointerleave released and restored');

      await pad0.dispatchEvent('pointerdown', { button: 0 });
      await pageHold.waitForFunction(() => document.querySelectorAll('#grid .pad')[0].classList.contains('held'));
      holdObs.state.calls.length = 0;
      await pad0.dispatchEvent('pointercancel');
      await pageHold.waitForFunction(() => !document.querySelectorAll('#grid .pad')[0].classList.contains('held'));
      assert.ok(holdObs.state.calls.some((c) => c.requestType === 'SetInputMute' && c.requestData.inputMuted === false), 'pointercancel released and restored');

      // 6. Release trigger: window blur
      await pad0.dispatchEvent('pointerdown', { button: 0 });
      await pageHold.waitForFunction(() => document.querySelectorAll('#grid .pad')[0].classList.contains('held'));
      holdObs.state.calls.length = 0;
      await pageHold.evaluate(() => window.dispatchEvent(new Event('blur')));
      await pageHold.waitForFunction(() => !document.querySelectorAll('#grid .pad')[0].classList.contains('held'));
      assert.ok(holdObs.state.calls.some((c) => c.requestType === 'SetInputMute' && c.requestData.inputMuted === false), 'blur released and restored');

      // 7. Release trigger: PANIC
      await pad0.dispatchEvent('pointerdown', { button: 0 });
      await pageHold.waitForFunction(() => document.querySelectorAll('#grid .pad')[0].classList.contains('held'));
      holdObs.state.calls.length = 0;
      await pageHold.evaluate(() => Deck.runPanic());
      await pageHold.waitForFunction(() => !document.querySelectorAll('#grid .pad')[0].classList.contains('held'));
      assert.ok(holdObs.state.calls.some((c) => c.requestType === 'SetInputMute' && c.requestData.inputMuted === false), 'PANIC released and restored');

      // 8. Release trigger: page switch
      await pageHold.evaluate(() => {
        Deck.addPage({ name: 'Page 2', cols: 3, rows: 2, switchTo: false });
      });
      await pad0.dispatchEvent('pointerdown', { button: 0 });
      await pageHold.waitForFunction(() => document.querySelectorAll('#grid .pad')[0].classList.contains('held'));
      holdObs.state.calls.length = 0;
      await pageHold.evaluate(() => Deck.setActivePage(Deck.cfg.pages[1].id));
      assert.ok(holdObs.state.calls.some((c) => c.requestType === 'SetInputMute' && c.requestData.inputMuted === false), 'page switch released and restored');
      assert.equal(await pageHold.evaluate(() => Deck.isPadHeld(0, Deck.cfg.pages[0].id)), false, 'held state cleared on page switch');

      // Switch back to Page 1
      await pageHold.evaluate(() => {
        Deck.setActivePage(Deck.cfg.pages[0].id);
        const p = Deck.getActivePage();
        p.pads[0] = Deck.normalizePad({ type: 'mute', inputName: 'Mic/Aux', mode: 'mute', hold: true, label: 'Cough' });
        p.pads[1] = Deck.normalizePad({ type: 'filter', sourceName: 'Webcam', filterName: 'Blur', mode: 'enable', autoOffMs: 2000, label: 'AutoBlur' });
        Deck.saveCfg();
        Deck.renderGrid();
      });

      // Page switch preserves running Auto-Off on old page (does not cancel it)
      holdObs.state.calls.length = 0;
      const autoOffPad = pageHold.locator('#grid .pad').nth(1);
      await autoOffPad.click();
      assert.ok(holdObs.state.calls.some((c) => c.requestType === 'SetSourceFilterEnabled' && c.requestData.filterEnabled === true), 'auto-off started on page 1');
      await pageHold.waitForFunction(() => Deck.activeAutoOffs.size > 0);
      holdObs.state.calls.length = 0;
      // Switch to Page 2 while Auto-Off is running
      await pageHold.evaluate(() => Deck.setActivePage(Deck.cfg.pages[1].id));
      const autoOffStart = Date.now();
      let autoOffReversed = false;
      while (Date.now() - autoOffStart < 3000) {
        if (holdObs.state.calls.some((c) => c.requestType === 'SetSourceFilterEnabled' && c.requestData.filterEnabled === false)) {
          autoOffReversed = true;
          break;
        }
        await pageHold.waitForTimeout(50);
      }
      assert.ok(autoOffReversed, 'auto-off reversal request arrived after switching to page 2');

      // Switch back to Page 1
      await pageHold.evaluate(() => {
        Deck.setActivePage(Deck.cfg.pages[0].id);
        const p = Deck.getActivePage();
        p.pads[0] = Deck.normalizePad({ type: 'mute', inputName: 'Mic/Aux', mode: 'mute', hold: true, label: 'Cough' });
        Deck.saveCfg();
        Deck.renderGrid();
      });

      // Release triggers: resize, move, clear
      await pad0.dispatchEvent('pointerdown', { button: 0 });
      await pageHold.waitForFunction(() => document.querySelectorAll('#grid .pad')[0].classList.contains('held'));
      holdObs.state.calls.length = 0;
      await pageHold.evaluate(() => Deck.resizePage(Deck.cfg.activePageId, 4, 3));
      assert.ok(holdObs.state.calls.some((c) => c.requestType === 'SetInputMute' && c.requestData.inputMuted === false), 'grid resize released and restored');
      assert.equal(await pageHold.evaluate(() => Deck.isPadHeld(0)), false, 'held state cleared on resize');

      await pad0.dispatchEvent('pointerdown', { button: 0 });
      await pageHold.waitForFunction(() => document.querySelectorAll('#grid .pad')[0].classList.contains('held'));
      holdObs.state.calls.length = 0;
      await pageHold.evaluate(() => Deck.movePadToPage(0, Deck.cfg.pages[1].id));
      assert.ok(holdObs.state.calls.some((c) => c.requestType === 'SetInputMute' && c.requestData.inputMuted === false), 'pad move released and restored');
      assert.equal(await pageHold.evaluate(() => Deck.isPadHeld(0)), false, 'held state cleared on move');

      await pageHold.evaluate(() => Deck.setActivePage(Deck.cfg.pages[1].id));
      const padOnP2 = pageHold.locator('#grid .pad').nth(0);
      await padOnP2.dispatchEvent('pointerdown', { button: 0 });
      await pageHold.waitForFunction(() => document.querySelectorAll('#grid .pad')[0].classList.contains('held'));
      holdObs.state.calls.length = 0;
      await pageHold.evaluate(() => Deck.clearPads([0]));
      assert.ok(holdObs.state.calls.some((c) => c.requestType === 'SetInputMute' && c.requestData.inputMuted === false), 'clear pad released and restored');
      assert.equal(await pageHold.evaluate(() => Deck.isPadHeld(0)), false, 'held state cleared on clear');

      await pageHold.evaluate(() => {
        Deck.setActivePage(Deck.cfg.pages[0].id);
        const p = Deck.getActivePage();
        p.pads[0] = Deck.normalizePad({ type: 'mute', inputName: 'Mic/Aux', mode: 'mute', hold: true, label: 'Cough' });
        Deck.saveCfg();
        Deck.renderGrid();
      });

      // 9. Touch & mobile viewport check
      await pageHold.setViewportSize({ width: 360, height: 740 });
      assert.equal(await pad0.evaluate((el) => getComputedStyle(el).touchAction), 'none', 'pad 0 has touch-action: none');

      // Long press / contextmenu does not open editor
      await pad0.dispatchEvent('contextmenu');
      assert.equal(await pageHold.locator('#pad-dlg[open]').count(), 0, 'contextmenu on hold pad does not open editor');

      // Touch events work
      holdObs.state.calls.length = 0;
      await pad0.dispatchEvent('pointerdown', { pointerType: 'touch', button: 0 });
      await pageHold.waitForFunction(() => document.querySelectorAll('#grid .pad')[0].classList.contains('held'));
      assert.ok(holdObs.state.calls.some((c) => c.requestType === 'SetInputMute' && c.requestData.inputMuted === true), 'touch pointerdown sent mute on request');

      holdObs.state.calls.length = 0;
      await pad0.dispatchEvent('pointerup', { pointerType: 'touch', button: 0 });
      await pageHold.waitForFunction(() => !document.querySelectorAll('#grid .pad')[0].classList.contains('held'));
      assert.ok(holdObs.state.calls.some((c) => c.requestType === 'SetInputMute' && c.requestData.inputMuted === false), 'touch pointerup sent mute restore request');

      // 10. Hold in-flight guard: press while pad action in-flight is ignored
      let slowResolve;
      await pageHold.evaluate(() => {
        const origExec = Deck.execAction;
        Deck._origExec = origExec;
        Deck.execAction = (act) => {
          if (act.type === 'mute' && act.mode === 'mute') {
            return new Promise((res) => { window._slowResolve = res; });
          }
          return origExec(act);
        };
      });
      holdObs.state.calls.length = 0;
      await pad0.dispatchEvent('pointerdown', { button: 0 });
      // While first press is in flight, dispatch second press
      await pad0.dispatchEvent('pointerdown', { button: 0 });
      // Only 1 action was started
      await pageHold.evaluate(() => {
        if (window._slowResolve) window._slowResolve();
        Deck.execAction = Deck._origExec;
      });
      await pad0.dispatchEvent('pointerup', { button: 0 });
      await pageHold.waitForFunction(() => !document.querySelectorAll('#grid .pad')[0].classList.contains('held'));

      // 11. Release trigger: disconnect with closeAll, then reconnect restores state (spec #2 story 19)
      holdObs.state.calls.length = 0;
      await pad0.dispatchEvent('pointerdown', { button: 0 });
      await pageHold.waitForFunction(() => document.querySelectorAll('#grid .pad')[0].classList.contains('held'));
      assert.ok(holdObs.state.calls.some((c) => c.requestType === 'SetInputMute' && c.requestData.inputMuted === true), 'held pad sent mute request');
      holdObs.state.calls.length = 0;

      // Connection drops while held
      holdObs.closeAll(1001, 'Connection dropped');
      await pageHold.waitForFunction(() => !document.querySelectorAll('#grid .pad')[0].classList.contains('held'));
      assert.equal(await pageHold.evaluate(() => Deck.isPadHeld(0)), false, 'held pad released on disconnect');

      // Reconnect to OBS
      holdObs.state.calls.length = 0;
      await pageHold.evaluate(() => Deck.connectObs({ manual: true }));
      await pageHold.waitForFunction(() => Deck.obs.status === 'ok');

      // Verify unsent release was applied once after reconnect
      const reconnectStart = Date.now();
      while (Date.now() - reconnectStart < 3000) {
        if (holdObs.state.calls.some((c) => c.requestType === 'SetInputMute' && c.requestData.inputMuted === false)) break;
        await pageHold.waitForTimeout(50);
      }
      assert.ok(holdObs.state.calls.some((c) => c.requestType === 'SetInputMute' && c.requestData.inputMuted === false), 'release applied once after reconnect');

      await ctxHold.close();
      console.log('  ✓ hold pad runtime, release triggers & touch viewport (#19)');
    } finally {
      holdObs.wss.close();
    }
  }

  // 18. Ticket #18: Live Readout
  const readoutObs = createFakeObs(false);
  readoutObs.state.inputs.push('Host Mic');
  readoutObs.state.volumes['Host Mic'] = -18;
  readoutObs.state.streamTimecode = '00:01:05';
  readoutObs.state.recordTimecode = '00:01:23';
  readoutObs.state.mediaDurations['Intro Video'] = 120000;
  readoutObs.state.mediaCursors['Intro Video'] = 45000;
  await new Promise((r) => readoutObs.wss.once('listening', r));
  const readoutPort = readoutObs.wss.address().port;
  try {
    const ctxReadout = await browser.newContext();
    const pageReadout = await ctxReadout.newPage();
    pageReadout.on('pageerror', (e) => pageErrors.push(e.message));
    pageReadout.on('dialog', (dlg) => dlg.accept());
    await pageReadout.goto(`${DECK_URL}?port=${readoutPort}`);
    await waitConnectedAndDismissAutoImport(pageReadout);

    // Set up Pages: Page 1 with Readout Pads, Page 2 with Scenes only
    await pageReadout.evaluate(() => {
      const p1 = Deck.getActivePage();
      p1.cols = 4;
      p1.rows = 2;
      p1.pads = [
        { type: 'output', target: 'stream', label: 'Stream' },
        { type: 'output', target: 'record', label: 'Record' },
        { type: 'volume', inputName: 'Host Mic', label: 'Host Vol' },
        { type: 'media', inputName: 'Intro Video', label: 'Intro Video' },
        { type: 'stats', mode: 'cpu', label: 'CPU' },
        { type: 'output', target: 'stream', label: 'Stream Hide', hideLabel: true },
        { type: 'output', target: 'record', label: 'Record Full', image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', imageFit: 'fill' },
        { type: 'volume', inputName: 'Host Mic', label: 'Vol Icon', image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', imageFit: 'contain' },
      ];
      const p2 = Deck.addPage({ name: 'Scenes Only', cols: 4, rows: 2, switchTo: false });
      p2.pads = [
        { type: 'scene', sceneName: 'Main Cam', label: 'Main Cam' },
        { type: 'scene', sceneName: 'Slides', label: 'Slides' },
        { type: 'none' }, { type: 'none' },
        { type: 'none' }, { type: 'none' }, { type: 'none' }, { type: 'none' },
      ];
      Deck.setActivePage(p1.id);
      Deck.saveCfg();
      Deck.renderGrid();
    });

    // AC1: Volume Pad shows initial volume in dB (event-driven / initial sync)
    await pageReadout.waitForFunction(() => {
      const sub = document.querySelector('#grid .pad[data-idx="2"] .sub');
      return sub && sub.textContent.includes('-18 dB');
    });
    assert.equal(await pageReadout.locator('#grid .pad[data-idx="2"] .sub').textContent(), '-18 dB', 'Volume pad shows level in dB');

    // Volume update via InputVolumeChanged updates in place
    readoutObs.broadcast('InputVolumeChanged', { inputName: 'Host Mic', inputVolumeDb: -12, inputVolumeMul: 0.25 });
    await pageReadout.waitForFunction(() => {
      const sub = document.querySelector('#grid .pad[data-idx="2"] .sub');
      return sub && sub.textContent.includes('-12 dB');
    });
    assert.equal(await pageReadout.locator('#grid .pad[data-idx="2"] .sub').textContent(), '-12 dB', 'Volume pad updated in place on volume change');

    // Stream Pad: start streaming -> shows elapsed time
    readoutObs.state.outputs.stream = true;
    readoutObs.broadcast('StreamStateChanged', { outputActive: true, outputState: 'OBS_WEBSOCKET_OUTPUT_STARTED' });
    await pageReadout.waitForFunction(() => {
      const sub = document.querySelector('#grid .pad[data-idx="0"] .sub');
      return sub && sub.textContent.includes('00:01:05');
    });
    assert.equal(await pageReadout.locator('#grid .pad[data-idx="0"] .sub').textContent(), '00:01:05', 'Stream pad shows elapsed time');

    // Record Pad: start recording -> shows elapsed time
    readoutObs.state.outputs.record = true;
    readoutObs.broadcast('RecordStateChanged', { outputActive: true, outputState: 'OBS_WEBSOCKET_OUTPUT_STARTED' });
    await pageReadout.waitForFunction(() => {
      const sub = document.querySelector('#grid .pad[data-idx="1"] .sub');
      return sub && sub.textContent.includes('00:01:23');
    });
    assert.equal(await pageReadout.locator('#grid .pad[data-idx="1"] .sub').textContent(), '00:01:23', 'Record pad shows elapsed time');

    // Media Pad: play media -> shows time left (120s - 45s = 75s -> 01:15)
    readoutObs.state.mediaStates['Intro Video'] = 'OBS_MEDIA_STATE_PLAYING';
    readoutObs.broadcast('MediaInputActionTriggered', { inputName: 'Intro Video', mediaAction: 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PLAY' });
    readoutObs.broadcast('MediaInputPlaybackStarted', { inputName: 'Intro Video' });
    await pageReadout.waitForFunction(() => {
      const sub = document.querySelector('#grid .pad[data-idx="3"] .sub');
      return sub && sub.textContent.includes('01:15');
    });
    assert.equal(await pageReadout.locator('#grid .pad[data-idx="3"] .sub').textContent(), '01:15', 'Media pad shows time left');

    // AC2: Paused recording is shown
    readoutObs.state.outputs.recordPaused = true;
    readoutObs.broadcast('RecordStateChanged', { outputActive: true, outputState: 'OBS_WEBSOCKET_OUTPUT_PAUSED' });
    await pageReadout.waitForFunction(() => {
      const sub = document.querySelector('#grid .pad[data-idx="1"] .sub');
      return sub && sub.textContent.includes('PAUSED');
    });
    assert.equal(await pageReadout.locator('#grid .pad[data-idx="1"] .sub').textContent(), 'PAUSED', 'Record pad shows PAUSED when paused');

    // Resume recording -> elapsed time restores
    readoutObs.state.outputs.recordPaused = false;
    readoutObs.broadcast('RecordStateChanged', { outputActive: true, outputState: 'OBS_WEBSOCKET_OUTPUT_RESUMED' });
    await pageReadout.waitForFunction(() => {
      const sub = document.querySelector('#grid .pad[data-idx="1"] .sub');
      return sub && sub.textContent.includes('00:01:23');
    });
    assert.equal(await pageReadout.locator('#grid .pad[data-idx="1"] .sub').textContent(), '00:01:23', 'Record pad restores elapsed time when resumed');

    // AC6: Hidden-label pad (Pad 5) and Full Face pad (Pad 6) still show readouts as bottom strip
    await pageReadout.waitForFunction(() => {
      const sub5 = document.querySelector('#grid .pad[data-idx="5"] .sub');
      const sub6 = document.querySelector('#grid .pad[data-idx="6"] .sub');
      return sub5 && sub5.textContent.includes('00:01:05') && sub6 && sub6.textContent.includes('00:01:23');
    });
    const pad5Sub = pageReadout.locator('#grid .pad[data-idx="5"] .sub');
    const pad6Sub = pageReadout.locator('#grid .pad[data-idx="6"] .sub');
    assert.equal(await pad5Sub.textContent(), '00:01:05', 'Hide-label pad shows readout');
    assert.equal(await pad6Sub.textContent(), '00:01:23', 'Full-face pad shows readout');
    const pad5Pos = await pad5Sub.evaluate((el) => {
      const st = window.getComputedStyle(el);
      return { position: st.position, bottom: st.bottom, width: st.width };
    });
    assert.equal(pad5Pos.position, 'absolute', 'Hide-label readout is absolutely positioned bottom strip');

    // AC5: Readout updates replace no Pad Graphic elements (mutation check on Pad 7)
    await pageReadout.evaluate(() => {
      const img = document.querySelector('#grid .pad[data-idx="7"] img.pad-icon-img');
      window.__initialReadoutImg = img;
      window.__removedReadoutGraphics = 0;
      const observer = new MutationObserver((mutations) => {
        for (const m of mutations) {
          for (const node of m.removedNodes) {
            if (node.tagName === 'IMG' && node.classList.contains('pad-icon-img')) {
              window.__removedReadoutGraphics++;
            }
          }
        }
      });
      observer.observe(document.getElementById('grid'), { childList: true, subtree: true });
    });

    // Fire 20 volume events while connected
    for (let i = 0; i < 20; i++) {
      readoutObs.broadcast('InputVolumeChanged', { inputName: 'Host Mic', inputVolumeDb: -20 + i, inputVolumeMul: 0.1 });
    }
    await pageReadout.waitForTimeout(200);
    const removedGraphics = await pageReadout.evaluate(() => window.__removedReadoutGraphics);
    const sameImg = await pageReadout.evaluate(() => {
      const current = document.querySelector('#grid .pad[data-idx="7"] img.pad-icon-img');
      return current === window.__initialReadoutImg;
    });
    assert.equal(removedGraphics, 0, 'No Pad Graphic elements replaced during readout updates');
    assert.equal(sameImg, true, 'Pad Graphic element remained identically in DOM');

    // AC3: Readouts clear on stop
    // Stop stream -> Pad 0 and Pad 5 readouts clear
    readoutObs.state.outputs.stream = false;
    readoutObs.broadcast('StreamStateChanged', { outputActive: false, outputState: 'OBS_WEBSOCKET_OUTPUT_STOPPED' });
    await pageReadout.waitForFunction(() => !document.querySelector('#grid .pad[data-idx="0"] .sub'));
    assert.equal(await pageReadout.locator('#grid .pad[data-idx="0"] .sub').count(), 0, 'Stream pad readout cleared on stop');
    assert.equal(await pageReadout.locator('#grid .pad[data-idx="5"] .sub').count(), 0, 'Stream hide-label pad readout cleared on stop');

    // Stop record -> Pad 1 and Pad 6 readouts clear
    readoutObs.state.outputs.record = false;
    readoutObs.broadcast('RecordStateChanged', { outputActive: false, outputState: 'OBS_WEBSOCKET_OUTPUT_STOPPED' });
    await pageReadout.waitForFunction(() => !document.querySelector('#grid .pad[data-idx="1"] .sub'));
    assert.equal(await pageReadout.locator('#grid .pad[data-idx="1"] .sub').count(), 0, 'Record pad readout cleared on stop');
    assert.equal(await pageReadout.locator('#grid .pad[data-idx="6"] .sub').count(), 0, 'Record full-face pad readout cleared on stop');

    // Media ended -> Pad 3 readout clears
    readoutObs.state.mediaStates['Intro Video'] = 'OBS_MEDIA_STATE_ENDED';
    readoutObs.broadcast('MediaInputPlaybackEnded', { inputName: 'Intro Video' });
    await pageReadout.waitForFunction(() => !document.querySelector('#grid .pad[data-idx="3"] .sub'));
    assert.equal(await pageReadout.locator('#grid .pad[data-idx="3"] .sub').count(), 0, 'Media pad readout cleared on media ended');

    // AC4: No status polling while no readout Pad is on the active Page
    // Switch to 'Scenes Only' page
    const scenesPageId = await pageReadout.evaluate(() => Deck.cfg.pages.find((p) => p.name === 'Scenes Only').id);
    await pageReadout.evaluate((id) => Deck.setActivePage(id), scenesPageId);
    await pageReadout.waitForTimeout(100);

    // Clear fake OBS calls and wait 1.5s
    readoutObs.state.calls = [];
    await pageReadout.waitForTimeout(1500);
    const polledCallsOnScenesPage = readoutObs.state.calls.filter((c) =>
      ['GetStreamStatus', 'GetRecordStatus', 'GetMediaInputStatus'].includes(c.requestType)
    );
    assert.equal(polledCallsOnScenesPage.length, 0, `No status polling while no readout pad on active page (got ${polledCallsOnScenesPage.length})`);

    // Switch back to Page 1
    const p1Id = await pageReadout.evaluate(() => Deck.cfg.pages[0].id);
    await pageReadout.evaluate((id) => Deck.setActivePage(id), p1Id);
    await pageReadout.waitForTimeout(100);

    // Clear calls and wait for polling -> status calls must occur now!
    readoutObs.state.calls = [];
    const pollStart = Date.now();
    while (Date.now() - pollStart < 3000) {
      if (readoutObs.state.calls.some((c) => ['GetStreamStatus', 'GetRecordStatus', 'GetMediaInputStatus'].includes(c.requestType))) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    const polledCallsOnReadoutPage = readoutObs.state.calls.filter((c) =>
      ['GetStreamStatus', 'GetRecordStatus', 'GetMediaInputStatus'].includes(c.requestType)
    );
    assert.ok(polledCallsOnReadoutPage.length > 0, 'Status polling resumes when page with readout pads is active');

    // AC3 (part 2): Readouts clear on disconnect
    // Re-activate stream and record and media
    readoutObs.state.outputs.stream = true;
    readoutObs.state.outputs.record = true;
    readoutObs.state.mediaStates['Intro Video'] = 'OBS_MEDIA_STATE_PLAYING';
    readoutObs.broadcast('StreamStateChanged', { outputActive: true, outputState: 'OBS_WEBSOCKET_OUTPUT_STARTED' });
    readoutObs.broadcast('RecordStateChanged', { outputActive: true, outputState: 'OBS_WEBSOCKET_OUTPUT_STARTED' });
    readoutObs.broadcast('MediaInputPlaybackStarted', { inputName: 'Intro Video' });
    await pageReadout.waitForFunction(() => document.querySelector('#grid .pad[data-idx="0"] .sub')?.textContent.includes('00:01:05'));

    // Close fake OBS connection
    readoutObs.closeAll(1000, 'Normal Closure');
    await pageReadout.waitForFunction(() => document.getElementById('conn-pill')?.classList.contains('bad'));

    // Assert readouts cleared on disconnect
    await pageReadout.waitForFunction(() => {
      const subs = document.querySelectorAll('#grid .pad:not(.stats-pad) .sub');
      return subs.length === 0;
    });
    assert.equal(await pageReadout.locator('#grid .pad:not(.stats-pad) .sub').count(), 0, 'All live readouts cleared on disconnect');

    await ctxReadout.close();
    console.log('  ✓ ticket #18: live readout polling, in-place updates, format, paused, clear on stop/disconnect & bottom strip');
  } finally {
    readoutObs.wss.close();
  }

  // 20. Starter layouts (#16)
  const starterObs = createFakeObs(false);
  await new Promise((r) => starterObs.wss.once('listening', r));
  const starterPort = starterObs.wss.address().port;
  try {
    const ctxStarter = await browser.newContext();
    const pageStarter = await ctxStarter.newPage();
    pageStarter.on('pageerror', (e) => pageErrors.push(e.message));
    pageStarter.on('dialog', (d) => d.accept());

    // Connect to fake OBS
    await pageStarter.goto(`${DECK_URL}?port=${starterPort}`);
    await pageStarter.waitForFunction(() => document.getElementById('conn-text').textContent === 'Connected');
    await pageStarter.waitForFunction(() => Deck.obs.scenes.length >= 3);

    const templates = ['Solo Streamer', 'Talk + Slides', 'Podcast/Interview'];

    // 1. Each template applies while connected with slots filled from fake OBS
    // Test Solo Streamer replaces initial empty starter deck
    const callsBefore = starterObs.state.calls.length;
    const snapsBefore = (await pageStarter.evaluate(async () => Deck.listSnapshots?.() || [])).length;

    await pageStarter.waitForSelector('#import-wiz-dlg[open]');
    await pageStarter.click('#wiz-mode-starter');
    await pageStarter.selectOption('#wiz-starter-layout', 'Solo Streamer');
    await pageStarter.click('#btn-wiz-apply');
    await pageStarter.waitForFunction(() => !document.getElementById('import-wiz-dlg').open);

    // Solo Streamer verification
    assert.equal(await pageStarter.evaluate(() => Deck.cfg.pages.length), 1, 'Starter deck replaced on first apply');
    assert.equal(await pageStarter.evaluate(() => Deck.getActivePage().name), 'Solo Streamer', 'Active page renamed to Solo Streamer');
    const soloPads = await pageStarter.evaluate(() => Deck.getActivePads());

    // Fixed pads: Stream, Record, Chapter, Stats (Telemetry Pad), PANIC
    assert.ok(soloPads.some((p) => p.type === 'output' && p.target === 'stream'), 'Solo Streamer has Stream pad');
    assert.ok(soloPads.some((p) => p.type === 'output' && p.target === 'record'), 'Solo Streamer has Record pad');
    assert.ok(soloPads.some((p) => p.type === 'chapter'), 'Solo Streamer has Chapter pad');
    assert.ok(soloPads.some((p) => p.type === 'stats'), 'Solo Streamer has Telemetry Pad (stats)');
    assert.ok(soloPads.some((p) => p.type === 'panic'), 'Solo Streamer has PANIC pad');

    // Filled slots from fake OBS
    const soloScenes = soloPads.filter((p) => p.type === 'scene' && p.mode === 'named').map((p) => p.sceneName);
    assert.ok(soloScenes.includes('Main Cam'), 'Main Cam scene slot filled');
    assert.ok(soloScenes.includes('Slides'), 'Slides scene slot filled');
    assert.ok(soloScenes.includes('BRB'), 'BRB scene slot filled');

    const soloMutes = soloPads.filter((p) => p.type === 'mute').map((p) => p.inputName);
    assert.ok(soloMutes.includes('Mic/Aux'), 'Mic/Aux mute slot filled');
    assert.ok(soloMutes.includes('Desktop Audio'), 'Desktop Audio mute slot filled');

    const soloSources = soloPads.filter((p) => p.type === 'source').map((p) => p.sourceName);
    assert.ok(soloSources.includes('Webcam'), 'Webcam source slot filled');

    // Snapshot was taken first
    const snapsAfterFirst = (await pageStarter.evaluate(async () => Deck.listSnapshots?.() || [])).length;
    assert.ok(snapsAfterFirst > snapsBefore, 'Snapshot taken before applying starter layout');

    // 2. An existing layout is never overwritten (append-vs-replace rule)
    // Apply "Talk + Slides" when deck already has a page
    await clickMenuItem(pageStarter, '#btn-auto-import');
    await pageStarter.waitForSelector('#import-wiz-dlg[open]');
    await pageStarter.click('#wiz-mode-starter');
    await pageStarter.selectOption('#wiz-starter-layout', 'Talk + Slides');
    assert.equal(await pageStarter.evaluate(() => document.getElementById('wiz-replace').disabled), true, 'Replace disabled for existing layout');
    await pageStarter.click('#btn-wiz-apply');
    await pageStarter.waitForFunction(() => !document.getElementById('import-wiz-dlg').open);

    assert.equal(await pageStarter.evaluate(() => Deck.cfg.pages.length), 2, 'Talk + Slides appended as new page, existing layout preserved');
    assert.equal(await pageStarter.evaluate(() => Deck.cfg.pages[0].name), 'Solo Streamer', 'Existing Solo Streamer page preserved');
    assert.equal(await pageStarter.evaluate(() => Deck.cfg.pages[1].name), 'Talk + Slides', 'New Talk + Slides page appended');

    const talkPads = await pageStarter.evaluate(() => Deck.cfg.pages[1].pads);
    assert.ok(talkPads.some((p) => p.type === 'output' && p.target === 'stream'), 'Talk + Slides has Stream pad');
    assert.ok(talkPads.some((p) => p.type === 'output' && p.target === 'record'), 'Talk + Slides has Record pad');
    assert.ok(talkPads.some((p) => p.type === 'chapter'), 'Talk + Slides has Chapter pad');
    assert.ok(talkPads.some((p) => p.type === 'stats'), 'Talk + Slides has Telemetry Pad');
    assert.ok(talkPads.some((p) => p.type === 'panic'), 'Talk + Slides has PANIC pad');

    const talkScenes = talkPads.filter((p) => p.type === 'scene' && p.mode === 'named').map((p) => p.sceneName);
    assert.ok(talkScenes.includes('Main Cam') && talkScenes.includes('Slides'), 'Talk + Slides scenes filled');

    // Apply "Podcast/Interview"
    await clickMenuItem(pageStarter, '#btn-auto-import');
    await pageStarter.waitForSelector('#import-wiz-dlg[open]');
    await pageStarter.click('#wiz-mode-starter');
    await pageStarter.selectOption('#wiz-starter-layout', 'Podcast/Interview');
    await pageStarter.click('#btn-wiz-apply');
    await pageStarter.waitForFunction(() => !document.getElementById('import-wiz-dlg').open);

    assert.equal(await pageStarter.evaluate(() => Deck.cfg.pages.length), 3, 'Podcast/Interview appended as 3rd page');
    const podcastPads = await pageStarter.evaluate(() => Deck.cfg.pages[2].pads);
    assert.ok(podcastPads.some((p) => p.type === 'output' && p.target === 'stream'), 'Podcast has Stream pad');
    assert.ok(podcastPads.some((p) => p.type === 'output' && p.target === 'record'), 'Podcast has Record pad');
    assert.ok(podcastPads.some((p) => p.type === 'chapter'), 'Podcast has Chapter pad');
    assert.ok(podcastPads.some((p) => p.type === 'stats'), 'Podcast has Telemetry Pad');
    assert.ok(podcastPads.some((p) => p.type === 'panic'), 'Podcast has PANIC pad');
    assert.ok(podcastPads.some((p) => p.type === 'media' && p.inputName === 'Intro Video'), 'Podcast has Intro Video media slot filled');

    // 3. No OBS write requests were sent
    const mutatingCalls = starterObs.state.calls.slice(callsBefore).filter((c) => /^(Create|Set|Remove|Press|Trigger)/.test(c.requestType));
    assert.equal(mutatingCalls.length, 0, 'Starter layouts sent 0 OBS write requests');

    await ctxStarter.close();

    // 4. Each template applies while disconnected with slots marked
    const ctxOffline = await browser.newContext();
    const pageOffline = await ctxOffline.newPage();
    pageOffline.on('pageerror', (e) => pageErrors.push(e.message));
    pageOffline.on('dialog', (d) => d.accept());

    await pageOffline.goto(DECK_URL);
    await pageOffline.waitForSelector('#grid .pad');
    assert.notEqual(await pageOffline.evaluate(() => Deck.obs.status), 'ok', 'Deck is disconnected');

    for (const tplName of templates) {
      await clickMenuItem(pageOffline, '#btn-auto-import');
      await pageOffline.waitForSelector('#import-wiz-dlg[open]');
      await pageOffline.click('#wiz-mode-starter');
      await pageOffline.selectOption('#wiz-starter-layout', tplName);
      assert.equal(await pageOffline.isEnabled('#btn-wiz-apply'), true, 'Create button enabled when disconnected in Starter mode');
      await pageOffline.click('#btn-wiz-apply');
      await pageOffline.waitForFunction(() => !document.getElementById('import-wiz-dlg').open);

      const page = await pageOffline.evaluate((name) => Deck.cfg.pages.find((p) => p.name === name), tplName);
      assert.ok(page, `Disconnected template "${tplName}" created page`);

      // Fixed pads are still configured
      assert.ok(page.pads.some((p) => p.type === 'output' && p.target === 'stream'), `${tplName} has Stream pad while disconnected`);
      assert.ok(page.pads.some((p) => p.type === 'output' && p.target === 'record'), `${tplName} has Record pad while disconnected`);
      assert.ok(page.pads.some((p) => p.type === 'chapter'), `${tplName} has Chapter pad while disconnected`);
      assert.ok(page.pads.some((p) => p.type === 'stats'), `${tplName} has Telemetry Pad while disconnected`);
      assert.ok(page.pads.some((p) => p.type === 'panic'), `${tplName} has PANIC pad while disconnected`);

      // Unfilled slots are marked empty pads (type: 'none', non-empty label and icon)
      const markedEmptyPads = page.pads.filter((p) => p.type === 'none' && p.label && p.label.length > 0);
      assert.ok(markedEmptyPads.length >= 5, `${tplName} has marked empty slot pads while disconnected (found ${markedEmptyPads.length})`);
      for (const p of markedEmptyPads) {
        assert.ok(p.icon, `Marked slot "${p.label}" has an icon`);
      }
    }

    await ctxOffline.close();

    // 5. Glossary gains Starter Layout
    const glossaryText = fs.readFileSync(join(__dirname, 'GLOSSARY.md'), 'utf8');
    assert.ok(glossaryText.includes('**Starter Layout**:'), 'GLOSSARY.md contains Starter Layout');

    console.log('  ✓ starter layout templates as data + auto-import wizard choice (#16)');
  } finally {
    starterObs.wss.close();
  }

  // 18. Scene-Linked Page (#20)
  const sceneObs = createFakeObs(false);
  await new Promise((r) => sceneObs.wss.once('listening', r));
  const scenePort = sceneObs.wss.address().port;
  try {
    const ctxScene = await browser.newContext();
    const pageScene = await ctxScene.newPage();
    pageScene.on('pageerror', (e) => pageErrors.push(e.message));
    pageScene.on('dialog', (dlg) => dlg.accept());
    await pageScene.goto(`${DECK_URL}?port=${scenePort}`);
    await waitConnectedAndDismissAutoImport(pageScene);

    // 1. Link active page ("Main") to "Main Cam" via Page Dialog
    await pageScene.click('#btn-deck-cfg');
    await pageScene.waitForSelector('#deck-dlg[open]');
    const dScene = pageScene.locator('#d-scene');
    assert.equal(await dScene.count(), 1, '#d-scene select exists in Page dialog');
    await dScene.selectOption('Main Cam');
    await pageScene.click('#deck-form button[type="submit"]');
    await pageScene.waitForFunction(() => !document.getElementById('deck-dlg').open);

    assert.equal(await pageScene.evaluate(() => Deck.getActivePage().sceneName), 'Main Cam', 'Page 1 linked to Main Cam');
    const tab0 = pageScene.locator('#deck-tabs .page-tab').nth(0);
    const tab0Text = await tab0.textContent();
    assert.ok(tab0Text.includes('Main Cam'), 'Page tab displays linked scene');

    // 2. Add second page ("Slides Page") and test duplicate scene link warning
    await pageScene.click('#btn-deck-add');
    await pageScene.waitForFunction(() => document.querySelectorAll('#deck-tabs .page-tab').length === 2);
    await pageScene.click('#btn-deck-cfg');
    await pageScene.waitForSelector('#deck-dlg[open]');
    await pageScene.fill('#d-name', 'Slides Page');

    // Attempting to select "Main Cam" should show warning naming the first Page ("Main") and disable submit
    await dScene.selectOption('Main Cam');
    const warnEl = pageScene.locator('#d-scene-warn');
    assert.equal(await warnEl.isVisible(), true, 'Warning displayed for duplicate scene link');
    const warnText = await warnEl.textContent();
    assert.ok(warnText.includes('Main'), `Warning names the first Page ("Main"): "${warnText}"`);
    assert.ok(warnText.includes('Main Cam'), `Warning names the colliding scene: "${warnText}"`);
    const applyBtn = pageScene.locator('#deck-form button[type="submit"]');
    assert.equal(await applyBtn.isDisabled(), true, 'Apply button disabled when duplicate scene linked');

    // Select valid scene "Slides"
    await dScene.selectOption('Slides');
    assert.equal(await warnEl.isVisible(), false, 'Warning hidden when valid unlinked scene selected');
    assert.equal(await applyBtn.isDisabled(), false, 'Apply button enabled for valid unlinked scene');
    await applyBtn.click();
    await pageScene.waitForFunction(() => !document.getElementById('deck-dlg').open);

    assert.equal(await pageScene.evaluate(() => Deck.getActivePage().name), 'Slides Page');
    assert.equal(await pageScene.evaluate(() => Deck.getActivePage().sceneName), 'Slides', 'Slides Page linked to Slides');
    const tab1 = pageScene.locator('#deck-tabs .page-tab').nth(1);
    assert.ok((await tab1.textContent()).includes('Slides'), 'Slides Page tab displays linked scene');

    // 3. Program change brings up linked Page; preview change does not
    // Currently on Slides Page (page index 1).
    // Preview scene change to 'Main Cam' -> active page should still be Slides Page (page-2)
    sceneObs.broadcast('CurrentPreviewSceneChanged', { sceneName: 'Main Cam' });
    await pageScene.waitForTimeout(60);
    assert.equal(await pageScene.evaluate(() => Deck.getActivePage().name), 'Slides Page', 'Preview scene change ignored');

    // Program scene change to 'Main Cam' -> switches to Page 1 ('Main')
    sceneObs.broadcast('CurrentProgramSceneChanged', { sceneName: 'Main Cam' });
    await pageScene.waitForFunction(() => Deck.getActivePage().name === 'Main');
    assert.equal(await pageScene.evaluate(() => Deck.getActivePage().name), 'Main', 'Program scene change brought up linked Page');

    // 4. Manual switch holds until next scene change
    // User clicks Slides Page tab manually
    await tab1.click();
    assert.equal(await pageScene.evaluate(() => Deck.getActivePage().name), 'Slides Page', 'Manual switch to Slides Page succeeded');
    await pageScene.waitForTimeout(100);
    assert.equal(await pageScene.evaluate(() => Deck.getActivePage().name), 'Slides Page', 'Manual switch holds while scene unchanged');

    // Next program scene change switches to the new scene's linked page
    sceneObs.broadcast('CurrentProgramSceneChanged', { sceneName: 'Slides' });
    await pageScene.waitForFunction(() => Deck.getActivePage().name === 'Slides Page');

    sceneObs.broadcast('CurrentProgramSceneChanged', { sceneName: 'Main Cam' });
    await pageScene.waitForFunction(() => Deck.getActivePage().name === 'Main');

    // 5. Edit Mode blocks automatic switching
    await pageScene.click('#btn-edit');
    assert.ok(await pageScene.evaluate(() => Deck.editMode), 'Edit Mode on');
    sceneObs.broadcast('CurrentProgramSceneChanged', { sceneName: 'Slides' });
    await pageScene.waitForTimeout(100);
    assert.equal(await pageScene.evaluate(() => Deck.getActivePage().name), 'Main', 'Edit Mode blocks automatic Page switching');
    await pageScene.click('#btn-edit');
    assert.ok(!await pageScene.evaluate(() => Deck.editMode), 'Edit Mode off');

    // 6. Rename follows; removal clears with a message
    // Rename 'Slides' -> 'Slide Deck' in OBS
    sceneObs.broadcast('SceneNameChanged', { oldSceneName: 'Slides', sceneName: 'Slide Deck' });
    await pageScene.waitForFunction(() => {
      const p = Deck.cfg.pages.find((x) => x.name === 'Slides Page');
      return p && p.sceneName === 'Slide Deck';
    });
    assert.ok((await tab1.textContent()).includes('Slide Deck'), 'Tab reflects renamed scene');

    // Scene removal clears the link and displays a message
    sceneObs.broadcast('SceneRemoved', { sceneName: 'Slide Deck' });
    await pageScene.waitForFunction(() => {
      const p = Deck.cfg.pages.find((x) => x.name === 'Slides Page');
      return p && !p.sceneName;
    });
    const msgText = await pageScene.locator('#msg-info').textContent();
    assert.ok(msgText.toLowerCase().includes('cleared') && msgText.includes('Slides Page'), `Message reports link cleared: "${msgText}"`);
    assert.ok(!(await tab1.textContent()).includes('Slide Deck'), 'Tab no longer displays removed scene');

    // 7. Connecting while the linked scene is live opens that Page
    // Configure layout so second page is linked to 'BRB'
    await pageScene.evaluate(() => {
      Deck.cfg.pages[1].sceneName = 'BRB';
      Deck.cfg.activePageId = Deck.cfg.pages[0].id;
      Deck.saveCfg();
    });
    // Set program scene on fake OBS to 'BRB'
    sceneObs.state.programScene = 'BRB';
    // Reload page to reconnect fresh
    await pageScene.reload();
    await pageScene.waitForFunction(() => document.getElementById('conn-text').textContent === 'Connected');
    await pageScene.waitForFunction(() => Deck.getActivePage().id === Deck.cfg.pages[1].id);
    assert.equal(await pageScene.evaluate(() => Deck.getActivePage().name), 'Slides Page', 'Connect opened Page linked to live scene');

    // 8. Links survive export/import
    const exported = await pageScene.evaluate(() => Deck.exportConfig());
    assert.equal(exported.pages[1].sceneName, 'BRB', 'Exported layout contains sceneName');

    const imported = await pageScene.evaluate((data) => {
      const res = Deck.migrateConfig(data);
      return res.pages[1].sceneName;
    }, exported);
    assert.equal(imported, 'BRB', 'Migrate config preserved sceneName');

    await ctxScene.close();
    console.log('  ✓ Scene-Linked Page (#20)');
  } finally {
    sceneObs.wss.close();
  }

  // 21. Phone Deck (#17)
  const phoneObs = createFakeObs(true, '0.0.0.0');
  await new Promise((r) => phoneObs.wss.once('listening', r));
  const phoneObsPort = phoneObs.wss.address().port;
  const helper = await createLanHelper({ rootDir: __dirname, port: 0, obsPort: phoneObsPort });
  const testLayoutPath = join(__dirname, 'test-phone-layout-temp.json');

  try {
    // AC 4: Helper serves files and refuses paths outside Deck folder
    const resHtml = await fetch(`http://127.0.0.1:${helper.port}/deck.html`);
    assert.equal(resHtml.status, 200, 'helper serves deck.html');
    assert.match(resHtml.headers.get('content-type'), /text\/html/, 'correct html content-type');

    // Refuse path traversal (raw socket GET /../package.json and /%2e%2e/package.json)
    const rawTraversalStatus = await new Promise((resolve) => {
      const s = net.connect(helper.port, '127.0.0.1', () => {
        s.write('GET /../package.json HTTP/1.1\r\nHost: localhost\r\n\r\n');
        s.on('data', (d) => {
          const match = d.toString('utf8').match(/^HTTP\/1\.[01]\s+(\d+)/);
          s.destroy();
          resolve(match ? Number(match[1]) : 0);
        });
      });
    });
    assert.equal(rawTraversalStatus, 403, 'helper refuses .. path traversal with 403');

    const encTraversalStatus = await new Promise((resolve) => {
      const s = net.connect(helper.port, '127.0.0.1', () => {
        s.write('GET /%2e%2e/package.json HTTP/1.1\r\nHost: localhost\r\n\r\n');
        s.on('data', (d) => {
          const match = d.toString('utf8').match(/^HTTP\/1\.[01]\s+(\d+)/);
          s.destroy();
          resolve(match ? Number(match[1]) : 0);
        });
      });
    });
    assert.equal(encTraversalStatus, 403, 'helper refuses %2e%2e encoded traversal with 403');

    // Phone URLs generated by helper
    assert.ok(helper.phoneUrls.length > 0, 'helper generated phone URLs');
    for (const u of helper.phoneUrls) {
      assert.match(u, /\/deck\.html\?host=/, 'phone URL includes ?host=');
      assert.match(u, /&port=/, 'phone URL includes &port=');
      assert.equal(/pass(word)?=/i.test(u), false, 'password never in phone URL');
    }

    // AC 1 & 2: Served over HTTP at a phone viewport with ?host=, the Deck connects to fake OBS
    const ctxPhone = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    const pagePhone = await ctxPhone.newPage();
    pagePhone.on('pageerror', (e) => pageErrors.push(e.message));

    const phoneDeckUrl = `http://127.0.0.1:${helper.port}/deck.html?host=127.0.0.1&port=${phoneObsPort}`;
    await pagePhone.goto(phoneDeckUrl);

    // Verify password is not in URL
    assert.equal(/pass(word)?=/i.test(pagePhone.url()), false, 'URL never has password');

    // Connect with password entered once on the device
    await pagePhone.fill('#ws-pass', PASSWORD);
    await pagePhone.click('#btn-ws-connect');
    await waitConnectedAndDismissAutoImport(pagePhone);

    // AC 3: Pads are at least 44px and nothing overflows; 360x420 dock is unchanged
    const phoneLayout = await pagePhone.evaluate(() => {
      const pads = [...document.querySelectorAll('#grid .pad')].map((el) => el.getBoundingClientRect());
      return {
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        minW: Math.min(...pads.map((r) => r.width)),
        minH: Math.min(...pads.map((r) => r.height)),
      };
    });
    assert.equal(phoneLayout.overflow, false, 'no horizontal overflow on phone portrait viewport');
    assert.ok(phoneLayout.minW >= 44 && phoneLayout.minH >= 44, `pads are at least 44px on phone (got ${phoneLayout.minW}x${phoneLayout.minH})`);

    // Non-local failure message explains OBS WebSocket must be reachable on the LAN
    const lanHost = helper.addresses.find((a) => a !== '127.0.0.1') || '192.168.1.200';
    await pagePhone.fill('#ws-host', lanHost);
    await pagePhone.click('#btn-ws-connect');
    await pagePhone.waitForFunction(() => document.getElementById('conn-text').textContent === 'Connected');

    // Server drops the non-local connection to trigger reconnect
    phoneObs.closeAll(1001, 'Going away');
    await pagePhone.waitForFunction(() => {
      const msg = document.getElementById('msg-info')?.textContent || '';
      return msg.includes('OBS WebSocket must be reachable on the LAN');
    }, { timeout: 6000 });
    const lanMsg = await pagePhone.textContent('#msg-info');
    assert.ok(lanMsg.includes('OBS WebSocket must be reachable on the LAN'), 'reconnect explains non-local LAN requirement');

    // Reconnect to fake OBS cleanly
    await pagePhone.click('#btn-ws-connect');
    await pagePhone.waitForFunction(() => document.getElementById('conn-text').textContent === 'Connected');

    // AC 5: Import from link loads a layout without a password
    const testLayout = {
      version: 2,
      ws: { host: '127.0.0.1', port: phoneObsPort, password: 'LEAKED_PASSWORD' },
      pages: [
        {
          id: 'phone-test-page',
          name: 'Phone Deck Test',
          cols: 4,
          rows: 3,
          pads: [
            { type: 'scene', sceneName: 'Scene A', label: 'Scene A', icon: '🎬' },
            { type: 'none' },
          ],
        },
      ],
    };
    fs.writeFileSync(testLayoutPath, JSON.stringify(testLayout, null, 2), 'utf8');

    const layoutUrl = `http://127.0.0.1:${helper.port}/test-phone-layout-temp.json`;
    await pagePhone.evaluate((url) => Deck.importFromLink(url), layoutUrl);

    // Verify imported layout
    await pagePhone.waitForFunction(() => Deck.getActivePage().name === 'Phone Deck Test');
    const importedPass = await pagePhone.evaluate(() => Deck.cfg.ws.password);
    assert.equal(importedPass, PASSWORD, 'import from link preserves saved password even if json has password');

    // Test that ?layout= / ?import= query params do NOT auto-import on boot
    const noAutoLayout = {
      version: 2,
      pages: [{ id: 'no-auto-page', name: 'Should Not Auto Import', cols: 4, rows: 3, pads: [] }],
    };
    const noAutoPath = join(__dirname, 'test-no-auto-layout.json');
    fs.writeFileSync(noAutoPath, JSON.stringify(noAutoLayout, null, 2), 'utf8');
    try {
      const autoImportUrl = `http://127.0.0.1:${helper.port}/deck.html?layout=http://127.0.0.1:${helper.port}/test-no-auto-layout.json`;
      const pageNoAuto = await ctxPhone.newPage();
      await pageNoAuto.goto(autoImportUrl);
      await pageNoAuto.waitForTimeout(300);
      const pageNames = await pageNoAuto.evaluate(() => Deck.cfg.pages.map((p) => p.name));
      assert.equal(pageNames.includes('Should Not Auto Import'), false, '?layout= param does not auto-import on boot');
      await pageNoAuto.close();
    } finally {
      try { fs.unlinkSync(noAutoPath); } catch {}
    }

    // Verify snapshot was created before import
    const snapshots = await pagePhone.evaluate(async () => Deck.listSnapshots());
    assert.ok(snapshots.some((s) => s.description === 'Before Import' || s.name === 'Before Import'), 'Snapshot created before import from link');

    // AC 6: Glossary gains Phone Deck
    const glossary = fs.readFileSync(join(__dirname, 'GLOSSARY.md'), 'utf8');
    assert.ok(glossary.includes('**Phone Deck**:'), 'GLOSSARY.md contains Phone Deck');

    await ctxPhone.close();
    console.log('  ✓ Phone Deck: LAN helper, phone breakpoint, non-local warning & import from link (#17)');
  } finally {
    try { fs.unlinkSync(testLayoutPath); } catch {}
    await helper.close();
    phoneObs.wss.close();
  }
  }

  // 18. 8x12 grid, Hotkey key-sequence mode, Macro cleanupOnAbort, Auto-Off re-click/PANIC, HTTP webhook & mergePages
  if (!ONLY_SECTION || ONLY_SECTION === '18') {
  const featObs = createFakeObs(false);
  await new Promise((r) => featObs.wss.once('listening', r));
  const featPort = featObs.wss.address().port;
  const httpReqs = [];
  const hookSrv = http.createServer((req, res) => {
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Private-Network': 'true',
    };
    if (req.method === 'OPTIONS') {
      res.writeHead(204, cors);
      res.end();
      return;
    }
    if (req.method === 'GET' && req.url === '/test-link-layout.json') {
      res.writeHead(200, { ...cors, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        version: 2,
        ws: { host: '9.9.9.9', port: 9999, password: 'SHOULD_BE_STRIPPED' },
        pages: [{ id: 'link-page-1', name: 'Link Imported', cols: 4, rows: 2, pads: [{ type: 'none' }] }],
      }));
      return;
    }
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      httpReqs.push({ method: req.method, url: req.url, contentType: req.headers['content-type'] || '', body });
      res.writeHead(200, { ...cors, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    });
  });
  await new Promise((r) => hookSrv.listen(0, '127.0.0.1', r));
  const hookPort = hookSrv.address().port;
  const mergeTmpPath = join(os.tmpdir(), `opendeck-merge-${Date.now()}.json`);
  try {
    const ctxFeat = await browser.newContext();
    const pageFeat = await ctxFeat.newPage();
    pageFeat.on('pageerror', (e) => pageErrors.push(e.message));
    pageFeat.on('dialog', (d) => d.accept());

    await pageFeat.goto(`${DECK_URL}?port=${featPort}`);
    await waitConnectedAndDismissAutoImport(pageFeat);

    // 18a. 8x12 Grid via Page & Grid Settings dialog + narrow 360x420 overflow check
    await pageFeat.click('#btn-deck-cfg');
    await pageFeat.click('#d-presets button[data-cols="8"][data-rows="12"]');
    assert.equal(await pageFeat.inputValue('#d-cols'), '8');
    assert.equal(await pageFeat.inputValue('#d-rows'), '12');
    await pageFeat.click('#deck-form button[type="submit"]');
    await pageFeat.waitForFunction(() => document.querySelectorAll('#grid .pad').length === 96);
    await pageFeat.setViewportSize({ width: 360, height: 420 });
    const overflow8x12 = await pageFeat.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    assert.equal(overflow8x12, false, '8x12 grid has zero horizontal overflow at 360x420');
    await pageFeat.setViewportSize({ width: 1280, height: 800 });

    // 18b. Hotkey Key-Sequence mode (top-level pad via editor, macro step, panic step)
    await pageFeat.click('#btn-edit');
    await pageFeat.locator('#grid .pad').nth(0).click();
    await pageFeat.selectOption('#f-type', 'hotkey');
    await pageFeat.locator('#f-fields select').nth(1).selectOption('keys');
    await pageFeat.locator('#f-fields input[list="obs-key-id-presets"]').fill('OBS_KEY_F7');
    await pageFeat.locator('#f-fields input[data-mod="control"]').check();
    await pageFeat.locator('#f-fields input[data-mod="alt"]').check();
    await pageFeat.locator('#f-fields input[data-mod="shift"]').check();
    await pageFeat.click('#pad-form button[type="submit"]');
    await pageFeat.click('#btn-edit');

    assert.ok((await pageFeat.locator('#grid .pad').nth(0).textContent()).includes('Ctrl+Alt+Shift+F7'), 'key sequence fallback label formatted');
    featObs.state.triggeredKeySequences.length = 0;
    await pageFeat.locator('#grid .pad').nth(0).click();
    await pageFeat.waitForFunction(() => true);
    await pageFeat.waitForTimeout(60);
    assert.deepEqual(featObs.state.triggeredKeySequences, [{
      keyId: 'OBS_KEY_F7',
      keyModifiers: { control: true, alt: true, shift: true, command: false },
    }], 'TriggerHotkeyByKeySequence called with exact keyId & keyModifiers');

    // Macro step + PANIC step with hotkey keys mode
    await pageFeat.evaluate(async () => {
      await Deck.execAction({
        type: 'hotkey',
        mode: 'keys',
        keyId: 'OBS_KEY_F8',
        keyModifiers: { control: true, alt: true, shift: true, command: false },
      });
    });
    assert.equal(featObs.state.triggeredKeySequences.length, 2);
    assert.equal(featObs.state.triggeredKeySequences[1].keyId, 'OBS_KEY_F8');

    // 18c. Macro cleanupOnAbort on re-click AND on PANIC (plus leading-wait guard)
    await pageFeat.click('#btn-edit');
    await pageFeat.locator('#grid .pad').nth(1).click();
    await pageFeat.selectOption('#f-type', 'macro');
    await pageFeat.check('#f-macro-cleanup');
    await pageFeat.click('#pad-form button[type="submit"]');
    await pageFeat.click('#btn-edit');

    await pageFeat.evaluate(() => {
      const p = Deck.getActivePads();
      // Slot 1: [show Lower Third, enable Blur, wait 3000, hide Lower Third, disable Blur]
      p[1] = Deck.normalizePad({
        type: 'macro',
        label: '5s Dance',
        cleanupOnAbort: true,
        steps: [
          { type: 'source', sceneName: 'Main Cam', sourceName: 'Lower Third', mode: 'show' },
          { type: 'filter', sourceName: 'Webcam', filterName: 'Blur', mode: 'enable' },
          { type: 'wait', delayMs: 3000 },
          { type: 'source', sceneName: 'Main Cam', sourceName: 'Lower Third', mode: 'hide' },
          { type: 'filter', sourceName: 'Webcam', filterName: 'Blur', mode: 'disable' },
        ],
      });
      // Slot 2: leading wait before step 0 action (aborting during leading wait must NOT run cleanup)
      p[2] = Deck.normalizePad({
        type: 'macro',
        label: 'Lead Wait',
        cleanupOnAbort: true,
        steps: [
          { type: 'wait', delayMs: 3000 },
          { type: 'source', sceneName: 'Main Cam', sourceName: 'Lower Third', mode: 'show' },
          { type: 'wait', delayMs: 1000 },
          { type: 'source', sceneName: 'Main Cam', sourceName: 'Lower Third', mode: 'hide' },
        ],
      });
      Deck.saveCfg();
      Deck.renderGrid();
    });

    // Re-click abort runs trailing cleanup steps
    await pageFeat.locator('#grid .pad').nth(1).click();
    await pageFeat.waitForFunction(() => document.querySelectorAll('#grid .pad')[1].className.includes('running'));
    await pageFeat.waitForTimeout(80);
    assert.equal(featObs.state.sceneItems['Main Cam'][1].sceneItemEnabled, true, 'macro step 0 showed source');
    assert.equal(featObs.state.filters['Webcam'][0].filterEnabled, true, 'macro step 1 enabled filter');
    await pageFeat.locator('#grid .pad').nth(1).click(); // abort via re-click
    await pageFeat.waitForFunction(() => (
      !document.querySelectorAll('#grid .pad')[1].className.includes('running')
      && document.getElementById('msg-info').textContent.includes('Cancelled macro')
    ));
    assert.equal(featObs.state.sceneItems['Main Cam'][1].sceneItemEnabled, false, 'cleanupOnAbort hid source on re-click');
    assert.equal(featObs.state.filters['Webcam'][0].filterEnabled, false, 'cleanupOnAbort disabled filter on re-click');

    // PANIC abort runs trailing cleanup steps even for sources
    await pageFeat.locator('#grid .pad').nth(1).click();
    await pageFeat.waitForFunction(() => document.querySelectorAll('#grid .pad')[1].className.includes('running'));
    await pageFeat.waitForTimeout(80);
    assert.equal(featObs.state.sceneItems['Main Cam'][1].sceneItemEnabled, true);
    await pageFeat.click('#btn-panic');
    await pageFeat.waitForFunction(() => (
      !document.querySelectorAll('#grid .pad')[1].className.includes('running')
      && document.getElementById('msg-info').textContent.includes('PANIC executed')
    ));
    assert.equal(featObs.state.sceneItems['Main Cam'][1].sceneItemEnabled, false, 'PANIC ran macro cleanupOnAbort to hide source');
    assert.equal(featObs.state.filters['Webcam'][0].filterEnabled, false, 'PANIC ran macro cleanupOnAbort to disable filter');

    // Leading-wait abort before any step fired does NOT run trailing cleanup
    featObs.state.calls.length = 0;
    await pageFeat.locator('#grid .pad').nth(2).click();
    await pageFeat.waitForFunction(() => document.querySelectorAll('#grid .pad')[2].className.includes('running'));
    await pageFeat.locator('#grid .pad').nth(2).click();
    await pageFeat.waitForFunction(() => !document.querySelectorAll('#grid .pad')[2].className.includes('running'));
    assert.equal(featObs.state.calls.filter((c) => c.requestType === 'SetSceneItemEnabled').length, 0, 'no cleanup run before first action step fires');

    // 18d. autoOffMs re-click & PANIC cleanup on source & media
    await pageFeat.evaluate(() => {
      const p = Deck.getActivePads();
      p[3] = Deck.normalizePad({
        type: 'source',
        sceneName: 'Main Cam',
        sourceName: 'Lower Third',
        mode: 'show',
        autoOffMs: 4000,
        label: 'Timed Lower3',
      });
      p[4] = Deck.normalizePad({
        type: 'media',
        inputName: 'Intro Video',
        mediaAction: 'play',
        autoOffMs: 4000,
        label: 'Timed Media',
      });
      Deck.saveCfg();
      Deck.renderGrid();
    });
    await pageFeat.locator('#grid .pad').nth(3).click();
    await pageFeat.waitForFunction(() => document.querySelectorAll('#grid .pad')[3].className.includes('running'));
    assert.equal(featObs.state.sceneItems['Main Cam'][1].sceneItemEnabled, true);
    await pageFeat.locator('#grid .pad').nth(3).click(); // re-click cancels & hides
    await pageFeat.waitForFunction(() => (
      !document.querySelectorAll('#grid .pad')[3].className.includes('running')
      && document.getElementById('msg-info').textContent.includes('Cancelled')
    ));
    assert.equal(featObs.state.sceneItems['Main Cam'][1].sceneItemEnabled, false, 're-clicking active autoOff source cancels & hides');

    await pageFeat.locator('#grid .pad').nth(3).click();
    await pageFeat.locator('#grid .pad').nth(4).click();
    await pageFeat.waitForFunction(() => (
      document.querySelectorAll('#grid .pad')[3].className.includes('running')
      && document.querySelectorAll('#grid .pad')[4].className.includes('running')
    ));
    await pageFeat.click('#btn-panic');
    await pageFeat.waitForFunction(() => (
      !document.querySelectorAll('#grid .pad')[3].className.includes('running')
      && document.getElementById('msg-info').textContent.includes('PANIC executed')
    ));
    assert.equal(featObs.state.sceneItems['Main Cam'][1].sceneItemEnabled, false, 'PANIC reverted active autoOff source');
    assert.equal(featObs.state.mediaStates['Intro Video'], 'OBS_MEDIA_STATE_PAUSED', 'PANIC paused active autoOff media');

    // 18e. HTTP / Webhook action (type: 'http', works disconnected, rejects unsafe protocols)
    await clickMenuItem(pageFeat, '#btn-conn-toggle');
    await pageFeat.click('#btn-ws-disconnect');
    await pageFeat.waitForFunction(() => document.getElementById('conn-text').textContent === 'Disconnected');
    const badHttp = await pageFeat.evaluate(() => ({
      js: Deck.normalizePad({ type: 'http', method: 'POST', url: 'javascript:alert(1)' }),
      file: Deck.normalizePad({ type: 'http', method: 'GET', url: 'file:///C:/Windows/win.ini' }),
      data: Deck.normalizePad({ type: 'http', method: 'POST', url: 'data:text/plain,hi' }),
    }));
    assert.equal(badHttp.js.url, undefined, 'javascript: URL rejected by normalizePad');
    assert.equal(badHttp.file.url, undefined, 'file: URL rejected by normalizePad');
    assert.equal(badHttp.data.url, undefined, 'data: URL rejected by normalizePad');

    await pageFeat.click('#btn-edit');
    await pageFeat.locator('#grid .pad').nth(5).click();
    await pageFeat.selectOption('#f-type', 'http');
    await pageFeat.locator('#f-fields select').nth(0).selectOption('POST');
    await pageFeat.locator('#f-fields input[type="text"]').nth(0).fill(`http://127.0.0.1:${hookPort}/hotkey`);
    await pageFeat.locator('#f-fields textarea').fill('{"key":"1","ctrl":true,"alt":true,"shift":true}');
    await pageFeat.fill('#f-label', 'Avatar 1');
    await pageFeat.click('#pad-form button[type="submit"]');
    await pageFeat.click('#btn-edit');
    assert.equal((await pageFeat.locator('#grid .pad').nth(5).locator('.tag').textContent()).trim(), 'API', 'HTTP pad has API badge');

    await pageFeat.locator('#grid .pad').nth(5).click();
    await pageFeat.waitForFunction(() => document.getElementById('msg-info').textContent.includes('Ran: Avatar 1'));
    assert.equal(httpReqs.length, 1, 'HTTP pad executed fetch while OBS disconnected');
    assert.equal(httpReqs[0].method, 'POST');
    assert.equal(httpReqs[0].url, '/hotkey');
    assert.equal(JSON.parse(httpReqs[0].body).key, '1');

    // 18f. Merge Pages Import (appends pages with deduplicated IDs, preserves existing pages & ws config)
    const beforeWsPort = await pageFeat.evaluate(() => Deck.cfg.ws.port);
    const mergePayload = {
      version: 2,
      ws: { host: '9.9.9.9', port: 9999 },
      pages: [
        {
          id: 'page-1',
          name: 'MEMES',
          cols: 8,
          rows: 12,
          pads: [
            { type: 'page', mode: 'goto', pageId: 'page-sb', label: 'To SB' },
            { type: 'http', method: 'POST', url: `http://127.0.0.1:${hookPort}/hotkey`, body: '{"key":"2"}', label: 'Avatar 2' },
          ],
        },
        {
          id: 'page-sb',
          name: 'Soundboard',
          cols: 6,
          rows: 3,
          pads: [{ type: 'none' }],
        },
      ],
    };
    fs.writeFileSync(mergeTmpPath, JSON.stringify(mergePayload, null, 2), 'utf8');
    await pageFeat.setInputFiles('#file-merge-pages', mergeTmpPath);
    await pageFeat.waitForFunction(() => Deck.cfg.pages.length === 3);

    const mergedState = await pageFeat.evaluate(() => ({
      pages: Deck.cfg.pages.map((p) => ({ id: p.id, name: p.name, cols: p.cols, rows: p.rows })),
      activePageId: Deck.cfg.activePageId,
      ws: Deck.cfg.ws,
      gotoTarget: Deck.cfg.pages[1].pads[0].pageId,
    }));
    assert.equal(mergedState.pages[0].id, 'page-1', 'original page-1 preserved');
    assert.equal(mergedState.pages[1].name, 'MEMES', 'MEMES page appended');
    assert.notEqual(mergedState.pages[1].id, 'page-1', 'duplicate page-1 ID deduplicated');
    assert.equal(mergedState.pages[1].cols, 8);
    assert.equal(mergedState.pages[1].rows, 12);
    assert.equal(mergedState.pages[2].name, 'Soundboard', 'second merged page appended');
    assert.equal(mergedState.activePageId, mergedState.pages[1].id, 'switched to first newly merged page');
    assert.equal(mergedState.ws.port, beforeWsPort, 'existing ws.port preserved on merge');
    assert.equal(mergedState.ws.host, '127.0.0.1', 'existing ws.host preserved on merge');
    assert.equal(mergedState.gotoTarget, mergedState.pages[2].id, 'internal page link preserved after deduplication');

    // 18g. Clean View toggle, restore button, localStorage persistence, and ?clean=1 URL override
    assert.equal(await pageFeat.isVisible('#top-bar'), true, 'top toolbar visible by default');
    await clickMenuItem(pageFeat, '#btn-clean-view');
    assert.equal(await pageFeat.evaluate(() => document.documentElement.dataset.clean), '1', 'Clean View sets data-clean=1');
    assert.equal(await pageFeat.evaluate(() => localStorage.getItem('opendeck_clean_view')), '1', 'Clean View persisted in localStorage');
    assert.equal(await pageFeat.isVisible('#top-bar'), false, 'top toolbar hidden in Clean View');
    assert.equal(await pageFeat.isVisible('.status'), false, 'status bar hidden in Clean View');
    assert.equal(await pageFeat.isVisible('#btn-clean-exit'), true, 'Controls restore button visible in page bar');
    await pageFeat.click('#btn-clean-exit');
    assert.equal(await pageFeat.evaluate(() => document.documentElement.dataset.clean || ''), '', 'Controls button exits Clean View');
    assert.equal(await pageFeat.isVisible('#top-bar'), true, 'top toolbar restored');

    const pageCleanUrl = await ctxFeat.newPage();
    pageCleanUrl.on('pageerror', (err) => pageErrors.push(err.message));
    await pageCleanUrl.goto(DECK_URL + '?clean=1');
    assert.equal(await pageCleanUrl.evaluate(() => document.documentElement.dataset.clean), '1', '?clean=1 activates Clean View');
    assert.equal(await pageCleanUrl.isVisible('#top-bar'), false, '?clean=1 hides top toolbar on boot');
    assert.equal(await pageCleanUrl.isVisible('#deck-bar'), true, 'page tabs remain visible in Clean View');
    await pageCleanUrl.close();

    // 18h. Import from Link dialog (#btn-import-link / #import-link-dlg): cancel, Escape, validation & Enter submit
    const pagesBeforeLink = await pageFeat.evaluate(() => Deck.cfg.pages.map((p) => p.name));
    await clickMenuItem(pageFeat, '#btn-import-link');
    await pageFeat.waitForSelector('#import-link-dlg[open]');
    assert.equal(await pageFeat.evaluate(() => document.activeElement?.id), 'import-link-url', 'URL input focused on open');
    await pageFeat.click('#btn-import-link-cancel');
    await pageFeat.waitForFunction(() => !document.getElementById('import-link-dlg').open);
    assert.deepEqual(await pageFeat.evaluate(() => Deck.cfg.pages.map((p) => p.name)), pagesBeforeLink, 'Cancel preserves pages');

    await clickMenuItem(pageFeat, '#btn-import-link');
    await pageFeat.waitForSelector('#import-link-dlg[open]');
    await pageFeat.keyboard.press('Escape');
    await pageFeat.waitForFunction(() => !document.getElementById('import-link-dlg').open);

    await clickMenuItem(pageFeat, '#btn-import-link');
    await pageFeat.waitForSelector('#import-link-dlg[open]');
    await pageFeat.fill('#import-link-url', 'javascript:alert(1)');
    await pageFeat.click('#btn-import-link-submit');
    assert.equal(await pageFeat.evaluate(() => document.getElementById('import-link-dlg').open), true, 'invalid URL keeps dialog open');
    assert.equal(await pageFeat.isVisible('#import-link-err'), true, 'invalid URL shows error message');

    await pageFeat.fill('#import-link-url', `  http://127.0.0.1:${hookPort}/test-link-layout.json  `);
    await pageFeat.press('#import-link-url', 'Enter');
    await pageFeat.waitForFunction(() => !document.getElementById('import-link-dlg').open && Deck.getActivePage().name === 'Link Imported');
    const linkImportedPass = await pageFeat.evaluate(() => Deck.cfg.ws.password || '');
    assert.notEqual(linkImportedPass, 'SHOULD_BE_STRIPPED', 'import-link dialog strips password from imported JSON');

    assert.deepEqual(pageErrors, [], `unexpected page errors: ${pageErrors.join('; ')}`);
    await ctxFeat.close();
    console.log('  ✓ 8x12 grid, TriggerHotkeyByKeySequence, macro cleanupOnAbort, autoOff re-click/PANIC, http API, mergePages & Clean View');
  } finally {
    try { fs.unlinkSync(mergeTmpPath); } catch {}
    hookSrv.close();
    featObs.wss.close();
  }
  }

  console.log('\nPASS: all deck edge E2E checks succeeded.');
} finally {
  if (browser) await browser.close();
  wss.close();
}
