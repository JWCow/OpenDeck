#!/usr/bin/env node
// Hermetic Playwright E2E test for deck.html against a local fake obs-websocket v5 server.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { createFakeObs, PASSWORD } from './test-deck-fake-obs.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DECK_URL = pathToFileURL(join(__dirname, 'deck.html')).href;

console.log('--- OBS Virtual Deck (deck.html) E2E ---');
const { wss, state, broadcast } = createFakeObs();
await new Promise((r) => wss.once('listening', r));
const port = wss.address().port;
const tmpDir = fs.mkdtempSync(join(os.tmpdir(), 'obs-deck-test-'));
let browser;

try {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  page.on('dialog', (d) => d.accept());

  // 1. Open via file:// (zero backend) and verify 8x8 grid + PANIC starter pad
  await page.goto(DECK_URL);
  await page.waitForSelector('#grid .pad');
  assert.equal(await page.locator('#grid .pad').count(), 64, '8x8 grid has 64 pads');
  assert.match(await page.locator('#grid .pad').nth(63).textContent(), /PANIC/, 'pad 64 seeded as PANIC');

  // 2. Wrong password -> 4009 Auth Failed (no tight reconnect loop)
  await page.click('#btn-conn-toggle');
  await page.fill('#ws-host', '127.0.0.1');
  await page.fill('#ws-port', String(port));
  await page.fill('#ws-pass', 'wrong-pass');
  await page.click('#btn-ws-connect');
  await page.waitForFunction(() => document.getElementById('conn-text').textContent === 'Auth Failed');
  const connsAtFail = state.connections;
  await page.waitForTimeout(300);
  assert.equal(state.connections, connsAtFail, 'does not auto-reconnect on 4009 Auth Failed');
  console.log('  ✓ 4009 Auth Failed handled without reconnect loop');

  // 3. Correct UTF-8 password -> Connected & state synced
  await page.fill('#ws-pass', PASSWORD);
  await page.click('#btn-ws-connect');
  await page.waitForFunction(() => document.getElementById('conn-text').textContent === 'Connected');
  assert.equal(await page.textContent('#scene-info'), 'Program: Main Cam');
  console.log('  ✓ OBS WebSocket v5 SHA-256 auth + initial sync');

  // 4. Auto-listing scenes, sources, filters + Pad Editor configuration
  await page.click('#btn-edit');
  const pad = (i) => page.locator('#grid .pad').nth(i);

  // Pad 0: Switch Scene -> Slides
  await pad(0).click();
  await page.selectOption('#f-type', 'scene');
  const sceneOpts = await page.locator('#f-fields select').first().locator('option').allTextContents();
  assert.ok(sceneOpts.includes('Slides') && sceneOpts.includes('Main Cam'), 'scenes auto-listed');
  await page.locator('#f-fields select').first().selectOption('Slides');
  await page.fill('#f-label', 'Go Slides');
  await page.click('#pad-form button[type="submit"]');

  // Pad 1: Source Visibility -> Main Cam / Lower Third (toggle)
  await pad(1).click();
  await page.selectOption('#f-type', 'source');
  await page.locator('#f-fields select').nth(0).selectOption('Main Cam');
  const srcOpts = await page.locator('#f-fields select').nth(1).locator('option').allTextContents();
  assert.ok(srcOpts.includes('Lower Third') && srcOpts.includes('Webcam'), 'scene items auto-listed');
  await page.locator('#f-fields select').nth(1).selectOption('Lower Third');
  await page.fill('#f-label', 'Lower 3rd');
  await page.click('#pad-form button[type="submit"]');

  // Pad 2: Filter Control -> Webcam / Blur (toggle)
  await pad(2).click();
  await page.selectOption('#f-type', 'filter');
  await page.locator('#f-fields select').nth(0).selectOption('Webcam');
  await page.waitForFunction(() => {
    const sel = document.querySelectorAll('#f-fields select')[1];
    return sel && [...sel.options].some((o) => o.value === 'Blur');
  });
  await page.locator('#f-fields select').nth(1).selectOption('Blur');
  await page.fill('#f-label', 'Cam Blur');
  await page.click('#pad-form button[type="submit"]');

  // Pad 3: Source Solo -> Main Cam / Webcam (solo)
  await pad(3).click();
  await page.selectOption('#f-type', 'source');
  await page.locator('#f-fields select').nth(0).selectOption('Main Cam');
  await page.locator('#f-fields select').nth(1).selectOption('Webcam');
  await page.locator('#f-fields select').nth(2).selectOption('solo');
  await page.fill('#f-label', 'Solo Cam');
  await page.click('#pad-form button[type="submit"]');

  // Pad 4: Timed Macro -> Enable Blur -> Wait 400ms -> Switch Scene BRB
  await pad(4).click();
  await page.selectOption('#f-type', 'macro');
  await page.click('#f-fields button:has-text("+ Add Step")');
  await page.locator('#f-fields .step').nth(0).locator('select').nth(1).selectOption('Webcam');
  await page.waitForFunction(() => [...document.querySelectorAll('#f-fields .step')[0].querySelectorAll('select')[2].options].some((o) => o.value === 'Blur'));
  await page.locator('#f-fields .step').nth(0).locator('select').nth(2).selectOption('Blur');
  await page.locator('#f-fields .step').nth(0).locator('select').nth(3).selectOption('enable');
  await page.click('#f-fields button:has-text("+ Add Step")');
  await page.locator('#f-fields .step').nth(1).locator('select').first().selectOption('wait');
  await page.locator('#f-fields .step').nth(1).locator('input[type="number"]').fill('400');
  await page.click('#f-fields button:has-text("+ Add Step")');
  await page.locator('#f-fields .step').nth(2).locator('select').first().selectOption('scene');
  await page.locator('#f-fields .step').nth(2).locator('select').nth(1).selectOption('BRB');
  await page.fill('#f-label', 'Blur->BRB');
  await page.click('#pad-form button[type="submit"]');

  // Pad 5: XSS safety check with malicious scene name
  await pad(5).click();
  await page.selectOption('#f-type', 'scene');
  await page.locator('#f-fields select').first().selectOption('<img src=x onerror="window.__xss=1"> #cam');
  await page.click('#pad-form button[type="submit"]');
  assert.equal(await page.evaluate(() => window.__xss), undefined, 'OBS names are HTML-escaped');
  console.log('  ✓ auto-listing + pad configuration + XSS escaping');

  // Switch back to Run mode
  await page.click('#btn-edit');

  // 5. Execute Scene switch + live event feedback
  await pad(0).click();
  await page.waitForFunction(() => document.getElementById('scene-info').textContent === 'Program: Slides');
  assert.ok((await pad(0).getAttribute('class')).includes('active'), 'scene pad active on match');
  broadcast('CurrentProgramSceneChanged', { sceneName: 'Main Cam' });
  state.programScene = 'Main Cam';
  await page.waitForFunction(() => !document.querySelectorAll('#grid .pad')[0].className.includes('active'));
  console.log('  ✓ scene switch + live CurrentProgramSceneChanged feedback');

  // 6. Source toggle & solo mode
  await pad(1).click();
  await page.waitForFunction(() => document.querySelectorAll('#grid .pad')[1].className.includes('active'));
  assert.equal(state.sceneItems['Main Cam'][1].sceneItemEnabled, true);
  await pad(3).click();
  await page.waitForFunction(() => !document.querySelectorAll('#grid .pad')[1].className.includes('active'));
  assert.equal(state.sceneItems['Main Cam'][1].sceneItemEnabled, false, 'solo disabled sibling source');
  assert.equal(state.sceneItems['Main Cam'][0].sceneItemEnabled, true, 'solo kept target enabled');
  console.log('  ✓ source toggle + solo mode');

  // 7. Filter toggle + external Filter event feedback
  await pad(2).click();
  await page.waitForFunction(() => document.querySelectorAll('#grid .pad')[2].className.includes('active'));
  assert.equal(state.filters['Webcam'][0].filterEnabled, true);
  broadcast('SourceFilterEnableStateChanged', { sourceName: 'Webcam', filterName: 'Blur', filterEnabled: false });
  state.filters['Webcam'][0].filterEnabled = false;
  await page.waitForFunction(() => !document.querySelectorAll('#grid .pad')[2].className.includes('active'));
  console.log('  ✓ filter control (GetSourceFilterList/SetSourceFilterEnabled) + live feedback');

  // 8. Timed Macro completion + PANIC abort & filter reset
  await pad(4).click();
  await page.waitForFunction(() => document.querySelectorAll('#grid .pad')[4].className.includes('running'));
  await page.waitForFunction(() => document.getElementById('scene-info').textContent === 'Program: BRB');
  assert.equal(state.filters['Webcam'][0].filterEnabled, true);
  console.log('  ✓ timed macro executed sequence with delay');

  // Reset scene to Main Cam & Blur off, then test PANIC aborting in-flight macro + disabling Blur
  state.programScene = 'Main Cam';
  broadcast('CurrentProgramSceneChanged', { sceneName: 'Main Cam' });
  await pad(2).click(); // turns Blur off
  await page.waitForFunction(() => !document.querySelectorAll('#grid .pad')[2].className.includes('active'));
  await pad(4).click();
  await page.waitForFunction(() => document.querySelectorAll('#grid .pad')[4].className.includes('running'));
  await page.click('#btn-panic');
  await page.waitForTimeout(550);
  assert.equal(state.programScene, 'Main Cam', 'PANIC aborted timed macro before BRB step');
  assert.equal(state.filters['Webcam'][0].filterEnabled, false, 'PANIC disabled active filter');
  console.log('  ✓ PANIC aborted timed macro & disabled active filter');

  // 9. Configure explicit PANIC steps via Panic modal
  await page.click('#btn-panic-cfg');
  await page.click('#btn-panic-pull');
  await page.click('#btn-panic-save');
  await pad(2).click(); // enable Blur
  await page.waitForFunction(() => document.querySelectorAll('#grid .pad')[2].className.includes('active'));
  await pad(63).click(); // PANIC pad
  await page.waitForFunction(() => !document.querySelectorAll('#grid .pad')[2].className.includes('active'));
  console.log('  ✓ configured PANIC pad executed saved panicSteps');

  // 10. Re-clicking running macro cancels it + Mute pad toggle
  await pad(4).click();
  await page.waitForFunction(() => document.querySelectorAll('#grid .pad')[4].className.includes('running'));
  await pad(4).click();
  await page.waitForFunction(() => !document.querySelectorAll('#grid .pad')[4].className.includes('running'));
  await page.waitForTimeout(500);
  assert.equal(state.programScene, 'Main Cam', 're-click cancelled running macro');

  await page.click('#btn-edit');
  await pad(6).click();
  await page.selectOption('#f-type', 'mute');
  await page.locator('#f-fields select').nth(0).selectOption('Mic/Aux');
  await page.fill('#f-label', 'Mute Mic');
  await page.click('#pad-form button[type="submit"]');
  // Drag-and-drop swap pad 6 -> pad 7 in Edit mode
  await pad(6).dragTo(pad(7));
  assert.equal((await pad(7).textContent()).includes('Mute Mic'), true, 'drag swap moved pad to slot 7');
  await page.click('#btn-edit');
  await pad(7).click();
  await page.waitForFunction(() => document.querySelectorAll('#grid .pad')[7].className.includes('active'));
  assert.equal(state.mutes['Mic/Aux'], true);
  console.log('  ✓ macro re-click cancel + drag swap + mute toggle');

  // 11. localStorage persistence + JSON Export/Import + invalid import safety
  await page.reload();
  await page.waitForSelector('#grid .pad');
  assert.equal((await pad(0).textContent()).includes('Go Slides'), true, 'localStorage persisted pads');

  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#btn-export')]);
  const exportPath = join(tmpDir, 'deck-export.json');
  await download.saveAs(exportPath);
  const exported = JSON.parse(fs.readFileSync(exportPath, 'utf8'));
  assert.equal(exported.pads.length, 64);
  assert.equal(exported.ws.password, undefined, 'password is not leaked in exported JSON');
  assert.ok(exported.panicSteps.length >= 1, 'panicSteps exported');

  const badPath = join(tmpDir, 'bad.json');
  fs.writeFileSync(badPath, '{"notPads":true}');
  await page.setInputFiles('#file-import', badPath);
  await page.waitForFunction(() => document.getElementById('msg-info').textContent.includes('Import error'));
  assert.equal((await pad(0).textContent()).includes('Go Slides'), true, 'invalid import preserves existing deck');

  await page.click('#btn-conn-toggle');
  await page.click('#btn-reset-layout');
  assert.equal((await pad(0).textContent()).includes('Go Slides'), false, 'reset cleared pads');

  await page.setInputFiles('#file-import', exportPath);
  await page.waitForFunction(() => document.querySelectorAll('#grid .pad')[0].textContent.includes('Go Slides'));
  console.log('  ✓ localStorage persistence + JSON export/import + invalid JSON guard');

  // 12. No-auth OBS WebSocket v5 server handshake
  const noAuth = createFakeObs(false);
  await new Promise((r) => noAuth.wss.once('listening', r));
  try {
    await page.fill('#ws-host', '127.0.0.1');
    await page.fill('#ws-port', String(noAuth.wss.address().port));
    await page.fill('#ws-pass', '');
    await page.click('#btn-ws-connect');
    await page.waitForFunction(() => document.getElementById('conn-text').textContent === 'Connected');
    console.log('  ✓ no-auth OBS WebSocket v5 handshake');
  } finally {
    noAuth.wss.close();
  }

  assert.deepEqual(pageErrors, [], `unexpected page errors: ${pageErrors.join('; ')}`);
  console.log('\nPASS: all deck E2E checks succeeded.');
} finally {
  if (browser) await browser.close();
  wss.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
