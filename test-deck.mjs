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
const PKG = JSON.parse(fs.readFileSync(join(__dirname, 'package.json'), 'utf8'));

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

  // 1. Open via file:// (zero backend) and verify 8x8 grid, PANIC starter pad & version badge
  await page.goto(DECK_URL);
  await page.waitForSelector('#grid .pad');
  assert.equal(await page.locator('#grid .pad').count(), 64, '8x8 grid has 64 pads');
  assert.match(await page.locator('#grid .pad').nth(63).textContent(), /PANIC/, 'pad 64 seeded as PANIC');
  assert.equal((await page.textContent('#version-badge')).trim(), `v${PKG.version}`, 'version badge matches package.json');

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

  // 4. Dropdown-first Pad Editor: auto-listing scenes, sources, filters + quick icons + XSS escaping
  await page.click('#btn-edit');
  const pad = (i) => page.locator('#grid .pad').nth(i);

  // Pad 0: Switch Scene -> Slides + quick icon chip + hotkey F2
  await pad(0).click();
  await page.selectOption('#f-type', 'scene');
  assert.equal(await page.locator('#f-fields select').first().isVisible(), true, 'dropdown visible by default');
  assert.equal(await page.locator('#f-fields input[type="text"]').first().isVisible(), false, 'manual text input hidden by default');
  const sceneOpts = await page.locator('#f-fields select').first().locator('option').allTextContents();
  assert.ok(sceneOpts.includes('Slides') && sceneOpts.includes('Main Cam'), 'scenes auto-listed');
  await page.locator('#f-fields select').first().selectOption('Slides');
  await page.locator('#f-icons .ico-chip').first().click();
  assert.ok((await page.inputValue('#f-icon')).length > 0, 'quick icon chip populates icon');
  await page.click('#f-hotkey-btn');
  await page.keyboard.press('F2');
  assert.equal((await page.textContent('#f-hotkey-btn')).trim(), 'F2', 'hotkey recorder captured F2');
  await page.fill('#f-label', 'Go Slides');
  await page.click('#pad-form button[type="submit"]');
  assert.equal((await pad(0).locator('.hk').textContent()).trim(), 'F2', 'hotkey badge rendered on pad');

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
  console.log('  ✓ dropdown-first editor + quick icons + hotkey record + XSS escaping');

  // Switch back to Run mode
  await page.click('#btn-edit');

  // 5. Execute Scene switch via hotkey F2 + live event feedback
  await page.keyboard.press('F2');
  await page.waitForFunction(() => document.getElementById('scene-info').textContent === 'Program: Slides');
  assert.ok((await pad(0).getAttribute('class')).includes('active'), 'scene pad active on match via F2');
  broadcast('CurrentProgramSceneChanged', { sceneName: 'Main Cam' });
  state.programScene = 'Main Cam';
  await page.waitForFunction(() => !document.querySelectorAll('#grid .pad')[0].className.includes('active'));
  console.log('  ✓ keyboard shortcut (F2) + live CurrentProgramSceneChanged feedback');

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

  // 10. Re-clicking running macro cancels it + drag swap + Mute pad toggle
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
  await pad(6).dragTo(pad(7));
  assert.equal((await pad(7).textContent()).includes('Mute Mic'), true, 'drag swap moved pad to slot 7');
  await page.click('#btn-edit');
  await pad(7).click();
  await page.waitForFunction(() => document.querySelectorAll('#grid .pad')[7].className.includes('active'));
  assert.equal(state.mutes['Mic/Aux'], true);
  console.log('  ✓ macro re-click cancel + drag swap + mute toggle');

  // 11. Auto-Off timed toggle (autoOffMs): ON -> countdown -> automatic OFF
  // Ensure Blur filter is OFF first (Test 10 macro step 0 enabled Blur before cancel)
  await page.click('#btn-panic');
  await page.waitForFunction(() => !document.querySelectorAll('#grid .pad')[2].className.includes('active'));
  assert.equal(state.filters['Webcam'][0].filterEnabled, false);

  await page.click('#btn-edit');
  await pad(8).click();
  await page.selectOption('#f-type', 'filter');
  await page.locator('#f-fields select').nth(0).selectOption('Webcam');
  await page.waitForFunction(() => [...document.querySelectorAll('#f-fields select')[1].options].some((o) => o.value === 'Blur'));
  await page.locator('#f-fields select').nth(1).selectOption('Blur');
  await page.click('#f-fields .chips button:has-text("3s")');
  assert.equal(await page.inputValue('#f-auto-off'), '3', '3s quick chip updated auto-off input');
  await page.fill('#f-auto-off', '0.5');
  await page.fill('#f-label', 'Flash Blur');
  await page.click('#pad-form button[type="submit"]');
  await page.click('#btn-edit');

  await pad(8).click();
  await page.waitForFunction(() => document.querySelectorAll('#grid .pad')[8].className.includes('running'));
  assert.ok((await pad(8).getAttribute('class')).includes('active'), 'auto-off pad turns active');
  assert.match(await pad(8).locator('.sub').textContent(), /\d+\.\ds/, 'auto-off displays countdown');
  assert.equal(state.filters['Webcam'][0].filterEnabled, true);
  await page.waitForFunction(() => !document.querySelectorAll('#grid .pad')[8].className.includes('running'), null, { timeout: 2500 });
  assert.equal(state.filters['Webcam'][0].filterEnabled, false, 'auto-off automatically disabled filter');
  assert.equal((await pad(8).getAttribute('class')).includes('active'), false, 'auto-off cleared active LED');
  console.log('  ✓ auto-off timed toggle (ON -> countdown -> auto OFF)');

  // 12. Multiple Decks / Pages, Custom Grid Sizing & `page` navigation pad
  await page.click('#btn-deck-add');
  await page.waitForFunction(() => document.querySelectorAll('#deck-tabs .deck-tab').length === 2);
  await page.click('#btn-deck-cfg');
  await page.fill('#d-name', 'Show Controls');
  await page.click('#d-presets button[data-cols="4"][data-rows="3"]');
  await page.click('#deck-form button[type="submit"]');
  await page.waitForFunction(() => document.querySelectorAll('#grid .pad').length === 12);
  assert.equal((await page.textContent('#btn-deck-cfg')).trim(), '4×3 ⚙');
  assert.equal((await page.locator('#deck-tabs .deck-tab.on').textContent()).trim(), 'Show Controls');

  // Configure pad 0 on Page 2 to jump back to Page 1 (Main)
  await page.click('#btn-edit');
  await pad(0).click();
  await page.selectOption('#f-type', 'page');
  await page.locator('#f-fields select').nth(0).selectOption('goto');
  await page.locator('#f-fields select').nth(1).selectOption('deck-1');
  await page.fill('#f-label', 'Back Main');
  await page.click('#pad-form button[type="submit"]');

  // Configure pad 11 on Page 2 as "Next Page"
  await pad(11).click();
  await page.selectOption('#f-type', 'page');
  await page.locator('#f-fields select').nth(0).selectOption('next');
  await page.fill('#f-label', 'Next Pg');
  await page.click('#pad-form button[type="submit"]');
  await page.click('#btn-edit');

  // Clicking pad 0 on Page 2 switches to Page 1 (64 pads)
  await pad(0).click();
  await page.waitForFunction(() => document.querySelectorAll('#grid .pad').length === 64);
  assert.equal((await page.locator('#deck-tabs .deck-tab.on').textContent()).trim(), 'Main');

  // Switch back to Page 2 via tab, duplicate & delete duplicate
  await page.locator('#deck-tabs .deck-tab').nth(1).click();
  await page.waitForFunction(() => document.querySelectorAll('#grid .pad').length === 12);
  await page.click('#btn-deck-dup');
  await page.waitForFunction(() => document.querySelectorAll('#deck-tabs .deck-tab').length === 3);
  await page.click('#btn-deck-cfg');
  await page.click('#btn-deck-del');
  await page.waitForFunction(() => document.querySelectorAll('#deck-tabs .deck-tab').length === 2);
  console.log('  ✓ multi-page decks (add, rename, 4x3 grid resize, page pad, duplicate, delete)');

  // 13. All new OBS WebSocket v5 Actions on Page 2 (12-pad grid)
  await page.locator('#deck-tabs .deck-tab').nth(1).click();
  await page.waitForFunction(() => document.querySelectorAll('#grid .pad').length === 12);
  await page.click('#btn-edit');

  // Slot 1: Studio Mode Toggle
  await pad(1).click();
  await page.selectOption('#f-type', 'studio');
  await page.locator('#f-fields select').nth(0).selectOption('toggle');
  await page.click('#pad-form button[type="submit"]');

  // Slot 2: Studio Preview -> Slides
  await pad(2).click();
  await page.selectOption('#f-type', 'studio');
  await page.locator('#f-fields select').nth(0).selectOption('preview');
  await page.locator('#f-fields select').nth(1).selectOption('Slides');
  await page.click('#pad-form button[type="submit"]');

  // Slot 3: Studio Trigger Transition
  await pad(3).click();
  await page.selectOption('#f-type', 'studio');
  await page.locator('#f-fields select').nth(0).selectOption('transition');
  await page.click('#pad-form button[type="submit"]');

  // Slot 4: Output Stream toggle
  await pad(4).click();
  await page.selectOption('#f-type', 'output');
  await page.locator('#f-fields select').nth(0).selectOption('stream');
  await page.locator('#f-fields select').nth(1).selectOption('toggle');
  await page.click('#pad-form button[type="submit"]');

  // Slot 5: Output Record toggle
  await pad(5).click();
  await page.selectOption('#f-type', 'output');
  await page.locator('#f-fields select').nth(0).selectOption('record');
  await page.click('#pad-form button[type="submit"]');

  // Slot 6: Media Playback (Intro Video, play_pause)
  await pad(6).click();
  await page.selectOption('#f-type', 'media');
  const mediaOpts = await page.locator('#f-fields select').nth(0).locator('option').allTextContents();
  assert.ok(mediaOpts.includes('Intro Video'), 'media inputs filtered & listed');
  await page.locator('#f-fields select').nth(0).selectOption('Intro Video');
  await page.locator('#f-fields select').nth(1).selectOption('play_pause');
  await page.click('#pad-form button[type="submit"]');

  // Slot 7: Browser Source (Alert Overlay, set_url)
  await pad(7).click();
  await page.selectOption('#f-type', 'browser');
  const brOpts = await page.locator('#f-fields select').nth(0).locator('option').allTextContents();
  assert.ok(brOpts.includes('Alert Overlay'), 'browser inputs filtered & listed');
  await page.locator('#f-fields select').nth(0).selectOption('Alert Overlay');
  await page.locator('#f-fields select').nth(1).selectOption('set_url');
  await page.locator('#f-fields input[type="text"]').last().fill('https://example.com/v2');
  await page.click('#pad-form button[type="submit"]');

  // Slot 8: Volume (Mic/Aux, set -12 dB)
  await pad(8).click();
  await page.selectOption('#f-type', 'volume');
  await page.locator('#f-fields select').nth(0).selectOption('Mic/Aux');
  await page.locator('#f-fields select').nth(1).selectOption('set');
  await page.locator('#f-fields input[type="number"]').fill('-12');
  await page.click('#pad-form button[type="submit"]');

  // Slot 9: Transition (Slide, 500ms)
  await pad(9).click();
  await page.selectOption('#f-type', 'transition');
  await page.locator('#f-fields select').nth(0).selectOption('Slide');
  await page.locator('#f-fields input[type="number"]').fill('500');
  await page.click('#pad-form button[type="submit"]');

  // Slot 10: Screenshot (browser download)
  await pad(10).click();
  await page.selectOption('#f-type', 'screenshot');
  await page.click('#pad-form button[type="submit"]');

  await page.click('#btn-edit');

  // Execute Studio Mode: enable -> preview Slides -> transition Cut
  await pad(1).click();
  await page.waitForFunction(() => document.querySelectorAll('#grid .pad')[1].className.includes('active'));
  assert.equal(state.studioModeEnabled, true);
  assert.match(await page.textContent('#scene-info'), /Program: Main Cam \| Preview: Slides/);

  await pad(2).click();
  await page.waitForFunction(() => document.querySelectorAll('#grid .pad')[2].className.includes('active'));
  await pad(3).click();
  await page.waitForFunction(() => document.getElementById('scene-info').textContent.startsWith('Program: Slides'));
  assert.equal(state.programScene, 'Slides');

  // Execute Stream & Record toggles + external live events
  await pad(4).click();
  await page.waitForFunction(() => document.querySelectorAll('#grid .pad')[4].className.includes('active'));
  assert.equal(state.outputs.stream, true);
  await pad(5).click();
  await page.waitForFunction(() => document.querySelectorAll('#grid .pad')[5].className.includes('active'));
  assert.equal(state.outputs.record, true);
  broadcast('StreamStateChanged', { outputActive: false, outputState: 'OBS_WEBSOCKET_OUTPUT_STOPPED' });
  state.outputs.stream = false;
  await page.waitForFunction(() => !document.querySelectorAll('#grid .pad')[4].className.includes('active'));

  // Execute Media play -> pause
  await pad(6).click();
  await page.waitForFunction(() => document.querySelectorAll('#grid .pad')[6].className.includes('active'));
  assert.equal(state.mediaStates['Intro Video'], 'OBS_MEDIA_STATE_PLAYING');
  await pad(6).click();
  await page.waitForFunction(() => !document.querySelectorAll('#grid .pad')[6].className.includes('active'));
  assert.equal(state.mediaStates['Intro Video'], 'OBS_MEDIA_STATE_PAUSED');

  // Execute Browser set_url
  await pad(7).click();
  await page.waitForFunction(() => document.getElementById('msg-info').textContent.includes('Ran:'));
  assert.equal(state.inputSettings['Alert Overlay'].url, 'https://example.com/v2');

  // Execute Volume set -> -12 dB
  await pad(8).click();
  await page.waitForFunction(() => document.querySelectorAll('#grid .pad')[8].className.includes('active'));
  assert.equal(state.volumes['Mic/Aux'], -12);

  // Execute Transition -> Slide 500ms
  await pad(9).click();
  await page.waitForFunction(() => document.querySelectorAll('#grid .pad')[9].className.includes('active'));
  assert.equal(state.currentTransition, 'Slide');
  assert.equal(state.transitionDuration, 500);

  // Execute Screenshot download
  const [shotDl] = await Promise.all([page.waitForEvent('download'), pad(10).click()]);
  assert.match(shotDl.suggestedFilename(), /^screenshot-Slides-.*\.png$/);

  // Exercise remaining actions (vcam, replay, saveReplay, recordPause, browser refresh, profile, collection, SaveSourceScreenshot)
  await page.evaluate(async () => {
    await Deck.execAction({ type: 'output', target: 'vcam', mode: 'start' });
    await Deck.execAction({ type: 'output', target: 'replay', mode: 'start' });
    await Deck.execAction({ type: 'output', target: 'saveReplay' });
    await Deck.execAction({ type: 'output', target: 'recordPause', mode: 'start' });
    await Deck.execAction({ type: 'browser', inputName: 'Alert Overlay', mode: 'refresh' });
    await Deck.execAction({ type: 'volume', inputName: 'Mic/Aux', mode: 'step', volumeDb: 3 });
    await Deck.execAction({ type: 'profile', profileName: 'Streaming 1080p' });
    await Deck.execAction({ type: 'collection', collectionName: 'Podcast' });
    await Deck.execAction({ type: 'screenshot', sourceName: 'Main Cam', imageFormat: 'jpg', savePath: '/tmp/shot.jpg' });
  });
  assert.equal(state.outputs.vcam, true);
  assert.equal(state.outputs.replay, true);
  assert.equal(state.outputs.recordPaused, true);
  assert.equal(state.lastSavedReplay, '/tmp/Replay-2026.mkv');
  assert.ok(state.calls.some((c) => c.requestType === 'PressInputPropertiesButton' && c.requestData.propertyName === 'refreshnocache'));
  assert.equal(state.volumes['Mic/Aux'], -9);
  assert.equal(state.currentProfile, 'Streaming 1080p');
  assert.equal(state.currentCollection, 'Podcast');
  assert.deepEqual(state.savedScreenshots[0], { sourceName: 'Main Cam', imageFormat: 'jpg', imageFilePath: '/tmp/shot.jpg' });
  console.log('  ✓ OBS v5 actions (Studio, Outputs, Media, Browser, Volume, Profile, Collection, Transition, Screenshot)');

  // 14. localStorage persistence + v2 Export/Import + legacy v1 JSON import + invalid import guard
  await page.locator('#deck-tabs .deck-tab').nth(0).click();
  await page.waitForFunction(() => document.querySelectorAll('#grid .pad').length === 64);

  await page.reload();
  await page.waitForSelector('#grid .pad');
  assert.equal((await pad(0).textContent()).includes('Go Slides'), true, 'localStorage persisted v2 decks & pads');
  assert.equal(await page.locator('#deck-tabs .deck-tab').count(), 2, 'localStorage persisted multiple pages');

  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#btn-export')]);
  const exportPath = join(tmpDir, 'deck-export.json');
  await download.saveAs(exportPath);
  const exported = JSON.parse(fs.readFileSync(exportPath, 'utf8'));
  assert.equal(exported.version, 2, 'exported JSON is v2');
  assert.equal(exported.decks.length, 2, 'exported JSON includes both decks');
  assert.equal(exported.decks[0].pads.length, 64);
  assert.equal(exported.decks[1].pads.length, 12);
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
  assert.equal(await page.locator('#deck-tabs .deck-tab').count(), 1, 'reset restored single starter page');

  // Test importing a legacy v1 JSON layout
  const v1Path = join(tmpDir, 'legacy-v1.json');
  const v1Pads = Array.from({ length: 64 }, () => ({ type: 'none', label: '', icon: '', color: '#222733' }));
  v1Pads[0] = { type: 'scene', sceneName: 'BRB', label: 'V1 BRB', icon: '', color: '#1e3a8a' };
  fs.writeFileSync(v1Path, JSON.stringify({ version: 1, ws: { host: '127.0.0.1', port }, pads: v1Pads, panicSteps: [] }));
  await page.setInputFiles('#file-import', v1Path);
  await page.waitForFunction(() => document.querySelectorAll('#grid .pad')[0].textContent.includes('V1 BRB'));

  // Re-import v2 export
  await page.setInputFiles('#file-import', exportPath);
  await page.waitForFunction(() => document.querySelectorAll('#grid .pad')[0].textContent.includes('Go Slides'));
  assert.equal(await page.locator('#deck-tabs .deck-tab').count(), 2, 'v2 import restored multi-page layout');
  console.log('  ✓ v2 localStorage + Export/Import + legacy v1 JSON import + invalid JSON guard');

  // 15. No-auth OBS WebSocket v5 server handshake
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
