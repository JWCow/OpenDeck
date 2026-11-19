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

  // 16. Ticket #8: Pads follow scene and input renames
  const ctxRenames = await browser.newContext();
  const pageRenames = await ctxRenames.newPage();
  pageRenames.on('pageerror', (e) => pageErrors.push(e.message));
  try {
    await pageRenames.goto(`${DECK_URL}?port=${port}`);
    await pageRenames.waitForFunction(() => document.getElementById('conn-text')?.textContent === 'Connected');
    if (await pageRenames.evaluate(() => document.getElementById('import-wiz-dlg')?.open)) {
      await pageRenames.click('#btn-wiz-cancel');
    }

    // Verify renameReference and applyRename are not exported on Deck (ticket #8 review)
    const exportedHelpers = await pageRenames.evaluate(() => ({
      renameReference: typeof Deck.renameReference,
      applyRename: typeof Deck.applyRename,
    }));
    assert.equal(exportedHelpers.renameReference, 'undefined', 'renameReference must not be exported on Deck');
    assert.equal(exportedHelpers.applyRename, 'undefined', 'applyRename must not be exported on Deck');

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
    await page12.waitForFunction(() => document.getElementById('conn-text').textContent === 'Connected');
    await page12.waitForTimeout(100);
    if (await page12.evaluate(() => document.getElementById('import-wiz-dlg')?.open)) {
      await page12.click('#btn-wiz-cancel');
    }

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
    await pageUndo.waitForFunction(() => document.getElementById('conn-text').textContent === 'Connected');
    await pageUndo.waitForTimeout(100);
    if (await pageUndo.evaluate(() => document.getElementById('import-wiz-dlg')?.open)) {
      await pageUndo.click('#btn-wiz-cancel');
    }

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
    await pageUndo.click('#btn-panic-cfg');
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

  console.log('\nPASS: all deck edge E2E checks succeeded.');
} finally {
  if (browser) await browser.close();
  wss.close();
}
