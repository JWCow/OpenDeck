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
  assert.equal(await page.title(), 'OpenDeck - Virtual Deck for OBS Studio', 'page title branded OpenDeck');
  assert.equal((await page.textContent('.brand-title')).trim(), 'OpenDeck', 'brand title is OpenDeck');
  assert.equal((await page.textContent('.brand-sub')).trim(), 'OBS Studio', 'brand subtitle is OBS Studio');

  // Font Scaler: 5 levels (sm, md, lg, xl, xxl) with default xl (+4pt) and persistence
  assert.equal(await page.evaluate(() => document.documentElement.dataset.fontSize), 'xl', 'default font scale is xl (+4pt)');
  await page.click('#btn-font-dec');
  assert.equal(await page.evaluate(() => document.documentElement.dataset.fontSize), 'lg', 'decremented font scale to lg');
  await page.click('#btn-font-dec');
  assert.equal(await page.evaluate(() => document.documentElement.dataset.fontSize), 'md', 'decremented font scale to md');
  await page.click('#btn-font-inc');
  assert.equal(await page.evaluate(() => document.documentElement.dataset.fontSize), 'lg', 'incremented font scale to lg');
  await page.click('#btn-font-inc');
  assert.equal(await page.evaluate(() => document.documentElement.dataset.fontSize), 'xl', 'incremented font scale back to xl');
  assert.equal(await page.evaluate(() => localStorage.getItem('opendeck_font_scale')), 'xl', 'font scale saved in localStorage');

  // Theme Toggle: Dark <-> Light theme, colors, icon toggle & persistence
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark', 'default theme is dark');
  assert.equal((await page.textContent('#btn-theme')).trim(), '☀️', 'dark theme displays sun icon');
  await page.click('#btn-theme');
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'light', 'toggled to light theme');
  assert.equal((await page.textContent('#btn-theme')).trim(), '🌙', 'light theme displays moon icon');
  assert.equal(await page.evaluate(() => localStorage.getItem('opendeck_theme')), 'light', 'theme saved to localStorage');
  const lightBg = await page.evaluate(() => window.getComputedStyle(document.body).backgroundColor);
  assert.equal(lightBg, 'rgb(248, 250, 252)', 'body background updated to light studio slate #f8fafc');
  await page.click('#btn-theme');
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark', 'toggled back to dark theme');
  assert.equal((await page.textContent('#btn-theme')).trim(), '☀️', 'restored sun icon');
  console.log('  ✓ OpenDeck branding + font scaler (A-/A+ 5-level cycling) + dark/light studio theme');

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

  // 3. Correct UTF-8 password -> Connected & state synced + Auto-Import Wizard first-connect prompt
  await page.fill('#ws-pass', PASSWORD);
  await page.click('#btn-ws-connect');
  await page.waitForFunction(() => document.getElementById('conn-text').textContent === 'Connected');
  assert.equal(await page.textContent('#scene-info'), 'Program: Main Cam');
  await page.waitForFunction(() => document.getElementById('import-wiz-dlg').open === true);
  assert.match(await page.textContent('#wiz-summary'), /Read-only scan/);
  await page.click('#btn-wiz-cancel');
  assert.equal(await page.evaluate(() => document.getElementById('import-wiz-dlg').open), false);
  console.log('  ✓ OBS WebSocket v5 SHA-256 auth + initial sync + first-connect Auto-Import prompt');

  // 4. Dropdown-first Pad Editor: auto-listing scenes, sources, filters + quick icons + XSS escaping
  await page.click('#btn-edit');
  const pad = (i) => page.locator('#grid .pad').nth(i);

  // Pad 0: Switch Scene -> Slides + quick icon chip + auto red color + auto-label dropdown sync
  await pad(0).click();
  await page.selectOption('#f-type', 'scene');
  assert.equal(await page.locator('#f-fields select').first().isVisible(), true, 'dropdown visible by default');
  assert.equal(await page.locator('#f-fields input[type="text"]').first().isVisible(), false, 'manual text input hidden by default');
  const sceneOpts = await page.locator('#f-fields select').first().locator('option').allTextContents();
  assert.ok(sceneOpts.includes('Slides') && sceneOpts.includes('Main Cam'), 'scenes auto-listed');

  // Verify Dropdown Auto-Label synchronization
  const sceneSel = page.locator('#f-fields select').first();
  await sceneSel.selectOption('Main Cam');
  assert.equal(await page.inputValue('#f-label'), 'Main Cam', 'selecting Main Cam auto-populates #f-label');
  await sceneSel.selectOption('Slides');
  assert.equal(await page.inputValue('#f-label'), 'Slides', 'changing to Slides updates #f-label');
  // Manual typing preserves custom name on subsequent select changes
  await page.fill('#f-label', 'Custom Nickname');
  await sceneSel.selectOption('BRB');
  assert.equal(await page.inputValue('#f-label'), 'Custom Nickname', 'manual custom nickname preserved');
  // Clearing label allows auto-sync to resume
  await page.fill('#f-label', '');
  await sceneSel.selectOption('Slides');
  assert.equal(await page.inputValue('#f-label'), 'Slides', 'cleared label resumes auto-labeling');

  await page.locator('#f-icons .ico-chip').first().click();
  assert.ok((await page.inputValue('#f-icon')).length > 0, 'quick icon chip populates icon');
  // Verify local hotkey recorder #f-hotkey-btn is omitted
  assert.equal(await page.locator('#f-hotkey-btn').count(), 0, '#f-hotkey-btn omitted from Pad Editor');
  await page.fill('#f-label', 'Go Slides');
  await page.click('#pad-form button[type="submit"]');
  assert.equal(await pad(0).locator('.hk').count(), 0, '.hk badge omitted from pad');
  assert.equal(await page.evaluate(() => document.querySelectorAll('#grid .pad')[0].style.backgroundColor), 'rgb(153, 27, 27)', 'Pad 0 background is red #991b1b');

  // Pad 1: Source Visibility -> Main Cam / Lower Third (toggle)
  await pad(1).click();
  await page.selectOption('#f-type', 'source');
  await page.locator('#f-fields select').nth(0).selectOption('Main Cam');
  const srcOpts = await page.locator('#f-fields select').nth(1).locator('option').allTextContents();
  assert.ok(srcOpts.includes('Lower Third') && srcOpts.includes('Webcam'), 'scene items auto-listed');
  await page.locator('#f-fields select').nth(1).selectOption('Lower Third');
  await page.fill('#f-label', 'Lower 3rd');
  await page.click('#pad-form button[type="submit"]');
  assert.equal((await pad(1).locator('.ctx').textContent()).trim(), 'Main Cam', 'Source pad displays parent scene name in .ctx');

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
  assert.equal((await pad(2).locator('.ctx').textContent()).trim(), 'Webcam', 'Filter pad displays source name in .ctx');

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
  console.log('  ✓ dropdown-first editor + quick icons + context subtitles + XSS escaping');

  // 4b. Custom Pad Graphics: Upload -> 128x128 canvas -> Fit Icon vs Full Face -> hideLabel -> removal
  const testPngBuffer = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAVklEQVR4nO3BAQ0AAADCoPdPbQ43oAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB4DbgIAAE4tE2gAAAAAElFTkSuQmCC',
    'base64'
  );
  const testImgPath = join(tmpDir, 'test-pad-graphic.png');
  fs.writeFileSync(testImgPath, testPngBuffer);

  await pad(15).click();
  await page.selectOption('#f-type', 'scene');
  await page.locator('#f-fields select').first().selectOption('Slides');
  assert.equal(await page.inputValue('#f-label'), 'Slides');
  await page.setInputFiles('#f-image-file', testImgPath);
  await page.waitForFunction(() => !document.getElementById('btn-remove-image').hidden);
  assert.equal(await page.locator('#btn-remove-image').isVisible(), true, 'Remove Image button shown after upload');

  // Fit Icon mode (default)
  await page.selectOption('#f-image-fit', 'icon');
  await page.click('#pad-form button[type="submit"]');
  await page.waitForFunction(() => !document.getElementById('pad-dlg').open);
  assert.equal(await pad(15).locator('.pad-icon-img').count(), 1, 'pad renders <img class="pad-icon-img">');
  assert.ok((await pad(15).locator('.pad-icon-img').getAttribute('src')).startsWith('data:image/'), 'pad-icon-img has data URL');
  assert.equal(await pad(15).locator('.lbl').textContent(), 'Slides', 'label text is Slides');
  assert.equal(await page.evaluate(() => document.querySelectorAll('#grid .pad')[15].querySelector('.lbl')?.style.display !== 'none'), true, 'label not hidden in Fit Icon mode');

  // Full Face mode + Hide Text
  await pad(15).click();
  await page.selectOption('#f-image-fit', 'fill');
  await page.check('#f-image-hidelabel');
  await page.click('#pad-form button[type="submit"]');
  await page.waitForFunction(() => !document.getElementById('pad-dlg').open);
  assert.ok((await pad(15).getAttribute('class')).includes('full-face'), 'pad has .full-face class');
  assert.ok((await pad(15).getAttribute('class')).includes('hide-label'), 'pad has .hide-label class');
  assert.equal(await page.evaluate(() => document.querySelectorAll('#grid .pad')[15].querySelector('.lbl')?.style.display === 'none'), true, 'label hidden when hideLabel is checked');
  assert.equal(await pad(15).locator('.pad-icon-img').count(), 0, 'no separate icon img in Full Face mode');

  // Configure Pad 16 with custom image for export/import verification later
  await pad(16).click();
  await page.selectOption('#f-type', 'scene');
  await page.locator('#f-fields select').first().selectOption('Main Cam');
  await page.setInputFiles('#f-image-file', testImgPath);
  await page.waitForFunction(() => !document.getElementById('btn-remove-image').hidden);
  await page.selectOption('#f-image-fit', 'icon');
  await page.click('#pad-form button[type="submit"]');
  await page.waitForFunction(() => !document.getElementById('pad-dlg').open);
  assert.equal(await pad(16).locator('.pad-icon-img').count(), 1, 'pad 16 has custom icon image');

  // Remove Image on pad 15
  await pad(15).click();
  await page.click('#btn-remove-image');
  assert.equal(await page.locator('#btn-remove-image').isVisible(), false, 'Remove Image hidden after clear');
  await page.uncheck('#f-image-hidelabel');
  await page.click('#pad-form button[type="submit"]');
  await page.waitForFunction(() => !document.getElementById('pad-dlg').open);
  assert.equal(await pad(15).locator('.pad-icon-img').count(), 0, 'pad-icon-img removed from pad');
  assert.equal((await pad(15).getAttribute('class')).includes('full-face'), false, 'full-face class removed');
  console.log('  ✓ custom pad graphics (128x128 canvas downscale, Fit Icon vs Full Face, hideLabel, removal)');

  // Switch back to Run mode
  await page.click('#btn-edit');

  // 5. Execute Scene switch via Pad click + live event feedback
  await pad(0).click();
  await page.waitForFunction(() => document.getElementById('scene-info').textContent === 'Program: Slides');
  assert.ok((await pad(0).getAttribute('class')).includes('active'), 'scene pad active on match');
  broadcast('CurrentProgramSceneChanged', { sceneName: 'Main Cam' });
  state.programScene = 'Main Cam';
  await page.waitForFunction(() => !document.querySelectorAll('#grid .pad')[0].className.includes('active'));
  console.log('  ✓ scene pad red styling + click switch + live CurrentProgramSceneChanged feedback');

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
  // Verify .pad.drag-over highlight on dragover + clean drop without opening #pad-dlg
  await page.evaluate(() => {
    const src = document.querySelectorAll('#grid .pad')[6];
    const dst = document.querySelectorAll('#grid .pad')[7];
    const dt = new DataTransfer();
    src.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }));
    dst.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
  });
  assert.ok((await pad(7).getAttribute('class')).includes('drag-over'), 'dragover adds .pad.drag-over highlight');
  await page.evaluate(() => {
    const dst = document.querySelectorAll('#grid .pad')[7];
    const src = document.querySelectorAll('#grid .pad')[6];
    const dt = new DataTransfer();
    dst.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
    src.dispatchEvent(new DragEvent('dragend', { bubbles: true, cancelable: true, dataTransfer: dt }));
  });
  assert.equal(await page.evaluate(() => document.getElementById('pad-dlg').open), false, 'drop does not open pad editor');
  assert.equal((await pad(7).textContent()).includes('Mute Mic'), true, 'drag swap moved pad to slot 7');
  await page.waitForTimeout(280);
  await page.click('#btn-edit');
  await pad(7).click();
  await page.waitForFunction(() => document.querySelectorAll('#grid .pad')[7].className.includes('active'));
  assert.equal(state.mutes['Mic/Aux'], true);
  console.log('  ✓ macro re-click cancel + drag swap highlight + mute toggle');

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
  assert.equal((await pad(8).locator('.ctx').textContent()).trim(), 'Webcam', 'pad 8 displays context subtitle');
  await page.click('#btn-edit');

  await pad(8).click();
  await page.waitForFunction(() => document.querySelectorAll('#grid .pad')[8].className.includes('running'));
  assert.ok((await pad(8).getAttribute('class')).includes('active'), 'auto-off pad turns active');
  assert.match(await pad(8).locator('.sub').textContent(), /\d+\.\ds/, 'auto-off displays countdown');
  assert.equal(await page.evaluate(() => document.querySelectorAll('#grid .pad')[8].querySelector('.ctx')?.style.display), 'none', '.ctx yields to countdown display');
  assert.equal(state.filters['Webcam'][0].filterEnabled, true);
  await page.waitForFunction(() => !document.querySelectorAll('#grid .pad')[8].className.includes('running'), null, { timeout: 2500 });
  assert.equal(state.filters['Webcam'][0].filterEnabled, false, 'auto-off automatically disabled filter');
  assert.equal((await pad(8).getAttribute('class')).includes('active'), false, 'auto-off cleared active LED');
  assert.equal(await page.evaluate(() => document.querySelectorAll('#grid .pad')[8].querySelector('.ctx')?.style.display), '', '.ctx restored after countdown finishes');
  assert.equal((await pad(8).locator('.ctx').textContent()).trim(), 'Webcam', '.ctx restored as Webcam');
  console.log('  ✓ auto-off timed toggle (ON -> countdown -> auto OFF with context subtitle restore)');

  // 12. Multiple Pages, Custom Grid Sizing, Cross-Page Drag & `page` navigation pad
  await page.click('#btn-deck-add');
  await page.waitForFunction(() => document.querySelectorAll('#deck-tabs .page-tab').length === 2);
  await page.click('#btn-deck-cfg');
  await page.fill('#d-name', 'Show Controls');
  await page.click('#d-presets button[data-cols="4"][data-rows="3"]');
  await page.click('#deck-form button[type="submit"]');
  await page.waitForFunction(() => document.querySelectorAll('#grid .pad').length === 12);
  assert.equal((await page.textContent('#btn-deck-cfg')).trim(), '4×3 ⚙');
  assert.equal((await page.locator('#deck-tabs .page-tab.on').textContent()).trim(), 'Show Controls');

  // Configure pad 0 on Page 2 to jump back to Page 1 (Main)
  await page.click('#btn-edit');
  await pad(0).click();
  await page.selectOption('#f-type', 'page');
  await page.locator('#f-fields select').nth(0).selectOption('goto');
  await page.locator('#f-fields select').nth(1).selectOption('page-1');
  await page.fill('#f-label', 'Back Main');
  await page.click('#pad-form button[type="submit"]');

  // Configure pad 11 on Page 2 as "Next Page"
  await pad(11).click();
  await page.selectOption('#f-type', 'page');
  await page.locator('#f-fields select').nth(0).selectOption('next');
  await page.fill('#f-label', 'Next Pg');
  await page.click('#pad-form button[type="submit"]');

  // Configure pad 10 temporarily and drag it onto Page 1 tab to verify cross-page move
  await pad(10).click();
  await page.selectOption('#f-type', 'chapter');
  await page.fill('#f-label', 'MovedChap');
  await page.click('#pad-form button[type="submit"]');
  await page.evaluate(() => {
    const src = document.querySelectorAll('#grid .pad')[10];
    const tab0 = document.querySelectorAll('#deck-tabs .page-tab')[0];
    const dt = new DataTransfer();
    src.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }));
    tab0.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
  });
  assert.ok((await page.locator('#deck-tabs .page-tab').nth(0).getAttribute('class')).includes('drag-over'), 'page tab shows .drag-over highlight');
  await page.evaluate(() => {
    const src = document.querySelectorAll('#grid .pad')[10];
    const tab0 = document.querySelectorAll('#deck-tabs .page-tab')[0];
    const dt = new DataTransfer();
    tab0.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
    src.dispatchEvent(new DragEvent('dragend', { bubbles: true, cancelable: true, dataTransfer: dt }));
  });
  assert.equal((await pad(10).textContent()).includes('MovedChap'), false, 'moved pad removed from source page');
  assert.equal(await page.evaluate(() => Deck.cfg.pages[0].pads.some((p) => p.label === 'MovedChap')), true, 'moved pad placed on target page');
  await page.waitForTimeout(280);
  await page.click('#btn-edit');

  // Clicking pad 0 on Page 2 switches to Page 1 (64 pads)
  await pad(0).click();
  await page.waitForFunction(() => document.querySelectorAll('#grid .pad').length === 64);
  assert.equal((await page.locator('#deck-tabs .page-tab.on').textContent()).trim(), 'Main');

  // Switch back to Page 2 via tab, duplicate & delete duplicate
  await page.locator('#deck-tabs .page-tab').nth(1).click();
  await page.waitForFunction(() => document.querySelectorAll('#grid .pad').length === 12);
  await page.click('#btn-deck-dup');
  await page.waitForFunction(() => document.querySelectorAll('#deck-tabs .page-tab').length === 3);
  await page.click('#btn-deck-cfg');
  await page.click('#btn-deck-del');
  await page.waitForFunction(() => document.querySelectorAll('#deck-tabs .page-tab').length === 2);
  console.log('  ✓ multi-page deck (add, rename, 4x3 grid resize, cross-page drag, page pad, duplicate, delete)');

  // 13. OBS WebSocket v5 Actions (existing + all 7 new v2.1.0 actions) on Page 2 (12-pad grid)
  await page.locator('#deck-tabs .page-tab').nth(1).click();
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

  // Exercise remaining v2.0 actions (vcam, replay, saveReplay, recordPause, browser refresh, profile, collection, SaveSourceScreenshot)
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

  // 13b. All 7 new v2.1.0 OBS WebSocket v5 actions on a dedicated 4x3 Page
  await page.click('#btn-deck-add');
  await page.waitForFunction(() => document.querySelectorAll('#deck-tabs .page-tab').length === 3);
  await page.click('#btn-edit');

  // Slot 0: Next Scene
  await pad(0).click();
  await page.selectOption('#f-type', 'scene');
  await page.locator('#f-fields select').nth(1).selectOption('next');
  await page.click('#pad-form button[type="submit"]');

  // Slot 1: Prev Scene
  await pad(1).click();
  await page.selectOption('#f-type', 'scene');
  await page.locator('#f-fields select').nth(1).selectOption('prev');
  await page.click('#pad-form button[type="submit"]');

  // Slot 2: Telemetry Stats
  await pad(2).click();
  await page.selectOption('#f-type', 'stats');
  await page.locator('#f-fields select').nth(0).selectOption('all');
  await page.click('#pad-form button[type="submit"]');

  // Slot 3: OBS Hotkey Trigger
  await pad(3).click();
  await page.selectOption('#f-type', 'hotkey');
  const hkOpts = await page.locator('#f-fields select').nth(0).locator('option').allTextContents();
  assert.ok(hkOpts.includes('OBSBasic.StartRecording'), 'hotkeys auto-listed from GetHotkeyList');
  await page.locator('#f-fields select').nth(0).selectOption('OBSBasic.StartRecording');
  await page.click('#pad-form button[type="submit"]');

  // Slot 4: Recording Chapter Marker
  await pad(4).click();
  await page.selectOption('#f-type', 'chapter');
  await page.locator('#f-fields input[type="text"]').first().fill('Boss Fight');
  await page.click('#pad-form button[type="submit"]');

  // Slot 5: Audio Monitor Mode (cycle)
  await pad(5).click();
  await page.selectOption('#f-type', 'monitor');
  await page.locator('#f-fields select').nth(0).selectOption('Mic/Aux');
  await page.locator('#f-fields select').nth(1).selectOption('cycle');
  await page.click('#pad-form button[type="submit"]');

  // Slot 6: Source Transform / PiP (Main Cam / Webcam, toggle_pip)
  await pad(6).click();
  await page.selectOption('#f-type', 'transform');
  await page.locator('#f-fields select').nth(0).selectOption('Main Cam');
  await page.locator('#f-fields select').nth(1).selectOption('Webcam');
  await page.locator('#f-fields select').nth(2).selectOption('toggle_pip');
  await page.click('#pad-form button[type="submit"]');

  // Slot 7: Image Swap (Slide Image, set_file)
  await pad(7).click();
  await page.selectOption('#f-type', 'image');
  const imgOpts = await page.locator('#f-fields select').nth(0).locator('option').allTextContents();
  assert.ok(imgOpts.includes('Slide Image') && imgOpts.includes('Photo Slideshow'), 'image/slideshow inputs filtered & listed');
  await page.locator('#f-fields select').nth(0).selectOption('Slide Image');
  await page.locator('#f-fields select').nth(1).selectOption('set_file');
  await page.locator('#f-fields input[type="text"]').last().fill('/img/slide2.png');
  await page.click('#pad-form button[type="submit"]');

  // Slot 8: Slideshow Next (Photo Slideshow, next)
  await pad(8).click();
  await page.selectOption('#f-type', 'image');
  await page.locator('#f-fields select').nth(0).selectOption('Photo Slideshow');
  await page.locator('#f-fields select').nth(1).selectOption('next');
  await page.click('#pad-form button[type="submit"]');

  await page.click('#btn-edit');

  // Execute Next / Prev Scene
  const beforeScene = state.programScene;
  await pad(0).click();
  await page.waitForFunction((prev) => document.getElementById('scene-info').textContent !== `Program: ${prev}`, beforeScene);
  assert.notEqual(state.programScene, beforeScene, 'next scene stepped forward');
  await pad(1).click();
  await page.waitForFunction((prev) => document.getElementById('scene-info').textContent.startsWith(`Program: ${prev}`), beforeScene);
  assert.equal(state.programScene, beforeScene, 'prev scene stepped back');

  // Execute Telemetry Stats click refresh
  assert.match(await pad(2).locator('.sub').textContent(), /14% · 60fps · 4d/);
  state.stats.cpuUsage = 42.4;
  await pad(2).click();
  await page.waitForFunction(() => document.querySelectorAll('#grid .pad')[2].querySelector('.sub')?.textContent.includes('42%'));

  // Execute Hotkey Trigger
  await pad(3).click();
  await page.waitForFunction(() => document.getElementById('msg-info').textContent.includes('OBSBasic.StartRecording'));
  assert.ok(state.triggeredHotkeys.includes('OBSBasic.StartRecording'));

  // Execute Recording Chapter Marker
  await pad(4).click();
  await page.waitForFunction(() => document.getElementById('msg-info').textContent.includes('Boss Fight'));
  assert.deepEqual(state.chapters[0], { chapterName: 'Boss Fight' });

  // Execute Audio Monitor Mode cycle + external event
  await pad(5).click();
  await page.waitForFunction(() => document.querySelectorAll('#grid .pad')[5].className.includes('active'));
  assert.equal(state.monitors['Mic/Aux'], 'OBS_MONITORING_TYPE_MONITOR_ONLY');
  broadcast('InputAudioMonitorTypeChanged', { inputName: 'Mic/Aux', monitorType: 'OBS_MONITORING_TYPE_NONE' });
  state.monitors['Mic/Aux'] = 'OBS_MONITORING_TYPE_NONE';
  await page.waitForFunction(() => !document.querySelectorAll('#grid .pad')[5].className.includes('active'));

  // Execute Source Transform / PiP toggle -> PiP -> Full Reset
  await pad(6).click();
  await page.waitForFunction(() => document.querySelectorAll('#grid .pad')[6].className.includes('active'));
  assert.ok(state.itemTransforms['Main Cam:1'].scaleX < 0.5, 'toggle_pip shrunk source to PiP');
  await pad(6).click();
  await page.waitForFunction(() => !document.querySelectorAll('#grid .pad')[6].className.includes('active'));
  assert.equal(state.itemTransforms['Main Cam:1'].scaleX, 1, 'second toggle_pip restored full scale');

  // Execute Image Swap & Slideshow Next
  await pad(7).click();
  await page.waitForFunction(() => document.querySelectorAll('#grid .pad')[7].className.includes('active'));
  assert.equal(state.inputSettings['Slide Image'].file, '/img/slide2.png');
  await pad(8).click();
  await page.waitForFunction(() => document.getElementById('msg-info').textContent.includes('Photo Slideshow'));
  assert.ok(state.calls.some((c) => c.requestType === 'TriggerMediaInputAction' && c.requestData.inputName === 'Photo Slideshow' && c.requestData.mediaAction === 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_NEXT'));
  console.log('  ✓ all 7 new v2.1.0 OBS v5 actions (Next/Prev Scene, Stats, Hotkey, Chapter, Monitor, Transform PiP, Image Swap)');

  // 13c. Right-Hand Command Palette: Search, Drag-to-Pad (self-contained, target-specific & live OBS items)
  await page.locator('#deck-tabs .page-tab').nth(0).click();
  await page.waitForFunction(() => document.querySelectorAll('#grid .pad').length === 64);
  await page.click('#btn-edit');
  assert.equal(await page.locator('#palette').isVisible(), true, 'command palette visible in Edit mode');

  // Search filter
  await page.fill('#palette-search', 'Record');
  const visItems = await page.evaluate(() => {
    const items = [...document.querySelectorAll('.palette-item')];
    return items.filter((el) => el.style.display !== 'none').map((el) => el.querySelector('.pal-lbl')?.textContent);
  });
  assert.ok(visItems.some((t) => t && t.includes('Record')), 'search filters matching items');
  assert.ok(!visItems.includes('Scene Transition'), 'search hides non-matching items');
  await page.fill('#palette-search', '');

  // Drag self-contained command (Studio Mode) onto empty slot (pad 12)
  await page.evaluate(() => {
    const it = [...document.querySelectorAll('.palette-item')].find((el) => el.querySelector('.pal-lbl')?.textContent === 'Studio Mode');
    const dst = document.querySelectorAll('#grid .pad')[12];
    const dt = new DataTransfer();
    it.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }));
    dst.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
    dst.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
    it.dispatchEvent(new DragEvent('dragend', { bubbles: true, cancelable: true, dataTransfer: dt }));
  });
  assert.equal(await page.evaluate(() => document.getElementById('pad-dlg').open), false, 'self-contained drop assigns without modal');
  assert.equal(await page.evaluate(() => Deck.getActivePads()[12].type), 'studio', 'pad 12 assigned Studio Mode');

  // Drag target-specific command (Filter Toggle) onto empty slot (pad 13)
  await page.evaluate(() => {
    const it = [...document.querySelectorAll('.palette-item')].find((el) => el.querySelector('.pal-lbl')?.textContent === 'Filter Toggle');
    const dst = document.querySelectorAll('#grid .pad')[13];
    const dt = new DataTransfer();
    it.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }));
    dst.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
    dst.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
    it.dispatchEvent(new DragEvent('dragend', { bubbles: true, cancelable: true, dataTransfer: dt }));
  });
  assert.equal(await page.evaluate(() => document.getElementById('pad-dlg').open), true, 'target-specific drop opens pad editor');
  assert.equal(await page.inputValue('#f-type'), 'filter', 'pad editor pre-selected filter action');
  await page.click('#btn-pad-cancel');

  // Drag live OBS item (Live scene "BRB") onto empty slot (pad 14)
  await page.evaluate(() => {
    const liveCat = document.getElementById('palette-cat-live');
    const it = [...liveCat.querySelectorAll('.palette-item')].find((el) => el.querySelector('.pal-lbl')?.textContent === 'BRB');
    const dst = document.querySelectorAll('#grid .pad')[14];
    const dt = new DataTransfer();
    it.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }));
    dst.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
    dst.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
    it.dispatchEvent(new DragEvent('dragend', { bubbles: true, cancelable: true, dataTransfer: dt }));
  });
  assert.equal(await page.evaluate(() => document.getElementById('pad-dlg').open), false, 'live item drop assigns without modal');
  assert.equal(await page.evaluate(() => Deck.getActivePads()[14].sceneName), 'BRB', 'pad 14 assigned BRB scene');
  assert.equal(await page.evaluate(() => Deck.getActivePads()[14].color), '#991b1b', 'live scene pad assigned red #991b1b');
  console.log('  ✓ command palette (search filter, drag-to-pad self-contained, target-specific & live OBS items)');

  // Palette Splitter: Resizer element, drag-to-resize, double-click snap to 320px & native tooltips
  assert.equal(await page.locator('#palette-resizer').isVisible(), true, 'palette resizer visible in Edit mode');

  // Native hover tooltips
  const palTooltips = await page.evaluate(() => {
    return [...document.querySelectorAll('.palette-item')].map((el) => el.getAttribute('title'));
  });
  assert.ok(palTooltips.length > 5, 'palette items have title tooltips');
  assert.ok(palTooltips.every((t) => t && t.trim().length > 0), 'every palette item has non-empty title tooltip');

  // Drag-resize palette splitter to widen sidebar
  const initialPaletteW = await page.evaluate(() => document.getElementById('palette').getBoundingClientRect().width);
  const resizerBox = await page.locator('#palette-resizer').boundingBox();
  assert.ok(resizerBox, 'palette-resizer has bounding box');
  await page.mouse.move(resizerBox.x + resizerBox.width / 2, resizerBox.y + 120);
  await page.mouse.down();
  await page.mouse.move(resizerBox.x - 70, resizerBox.y + 120);
  await page.mouse.up();
  const draggedW = await page.evaluate(() => document.getElementById('palette').getBoundingClientRect().width);
  assert.ok(draggedW >= initialPaletteW + 50, `palette width increased after drag (was ${initialPaletteW}, now ${draggedW})`);
  assert.equal(await page.evaluate(() => localStorage.getItem('opendeck_palette_w')), String(Math.round(draggedW)), 'palette width saved in localStorage');

  // Double-click resets to default 320px
  await page.locator('#palette-resizer').dblclick();
  const resetPaletteW = await page.evaluate(() => document.getElementById('palette').getBoundingClientRect().width);
  assert.equal(Math.round(resetPaletteW), 320, 'double click snapped palette width back to 320px');
  assert.equal(await page.evaluate(() => localStorage.getItem('opendeck_palette_w')), '320', '320px persisted after double-click snap');
  console.log('  ✓ palette splitter (drag-resize, double-click snap to 320px, native tooltips & persistence)');

  // 13d. Edit-Mode Multi-Select, Batch Actions & Pad Editor Duplicate
  await page.waitForTimeout(280);
  // Ctrl+Click multi-select
  await pad(0).click({ modifiers: ['Control'] });
  await pad(1).click({ modifiers: ['Control'] });
  assert.equal(await page.locator('#grid .pad.selected').count(), 2, '2 pads selected via Ctrl+Click');
  assert.equal(await page.textContent('#sel-count'), '2 selected');

  // Shift+Click range select
  await pad(3).click({ modifiers: ['Shift'] });
  assert.equal(await page.locator('#grid .pad.selected').count(), 4, 'range selected via Shift+Click');

  // Clear selection button
  await page.click('#btn-sel-none');
  assert.equal(await page.locator('#grid .pad.selected').count(), 0, 'Clear Sel cleared selection');

  // Select mode toggle
  await page.click('#btn-sel-mode');
  assert.ok((await page.locator('#btn-sel-mode').getAttribute('class')).includes('on'), 'Select mode on');
  await pad(0).click();
  await pad(1).click();
  assert.equal(await page.locator('#grid .pad.selected').count(), 2, 'Select mode selected pads without modifiers');
  await page.click('#btn-sel-mode'); // toggle off

  // Single Pad Editor Duplicate button
  await page.click('#btn-sel-none');
  await pad(0).click();
  await page.waitForSelector('#pad-dlg[open]');
  await page.click('#btn-pad-dup');
  await page.waitForFunction(() => !document.getElementById('pad-dlg').open);
  assert.match(await page.textContent('#msg-info'), /Duplicated pad to slot/, 'Pad Editor Duplicate cloned pad');

  // Batch Duplicate
  await page.click('#btn-sel-none');
  await pad(12).click({ modifiers: ['Control'] });
  await pad(14).click({ modifiers: ['Control'] });
  await page.click('#btn-sel-dup');
  assert.match(await page.textContent('#msg-info'), /Duplicated 2 pad\(s\)/, 'Batch Duplicate cloned selected pads');

  // Batch Recolor
  await page.click('#btn-sel-color');
  await page.locator('#sel-color-pop .sw[title="#581c87"]').click();
  const recolored = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('#grid .pad.selected')).map((el) => el.style.backgroundColor);
  });
  assert.ok(recolored.length > 0 && recolored.every((c) => c === 'rgb(88, 28, 135)'), 'Batch Recolor applied #581c87 to selected pads');

  // Batch Clear
  await page.click('#btn-sel-clear');
  assert.equal(await page.locator('#grid .pad.selected').count(), 0, 'Batch Clear cleared selected pads');

  // Exit Edit mode clears selection
  await page.click('#btn-edit');
  assert.equal(await page.locator('#palette').isVisible(), false, 'palette hidden in Run mode');
  console.log('  ✓ edit-mode multi-select (Ctrl/Shift/Select mode), batch duplicate/recolor/clear & pad editor duplicate');

  // 13e. Typography & Proportional Sizing check across viewports
  await page.setViewportSize({ width: 1000, height: 700 });
  await page.waitForTimeout(60);
  const desktopTypography = await page.evaluate(() => {
    const padWithLabel = document.querySelector('#grid .pad:not(.empty)');
    const lbl = padWithLabel?.querySelector('.lbl');
    const ico = padWithLabel?.querySelector('.ico');
    const btn = document.querySelector('.bar .btn');
    const tab = document.querySelector('#deck-tabs .page-tab');
    return {
      lblSize: lbl ? parseFloat(window.getComputedStyle(lbl).fontSize) : 0,
      icoSize: ico ? parseFloat(window.getComputedStyle(ico).fontSize) : 0,
      btnSize: btn ? parseFloat(window.getComputedStyle(btn).fontSize) : 0,
      tabSize: tab ? parseFloat(window.getComputedStyle(tab).fontSize) : 0,
      docOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  });
  assert.equal(desktopTypography.docOverflow, false, 'zero horizontal overflow at 1000x700');
  assert.ok(desktopTypography.lblSize >= 13, `pad label scales above 11px on desktop (got ${desktopTypography.lblSize}px)`);
  assert.ok(desktopTypography.icoSize >= 20, `pad icon scales up proportionally on desktop (got ${desktopTypography.icoSize}px)`);
  assert.ok(desktopTypography.btnSize >= 12, `toolbar button font size comfortable (got ${desktopTypography.btnSize}px)`);
  assert.ok(desktopTypography.tabSize >= 12, `page tab font size comfortable (got ${desktopTypography.tabSize}px)`);

  // Narrow dock (360x420) check
  await page.setViewportSize({ width: 360, height: 420 });
  await page.waitForTimeout(60);
  const narrowAudit = await page.evaluate(() => {
    return {
      docOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      bodyOverflow: document.body.scrollWidth > document.body.clientWidth,
    };
  });
  assert.equal(narrowAudit.docOverflow, false, 'zero horizontal overflow at 360x420 narrow dock');
  assert.equal(narrowAudit.bodyOverflow, false, 'body fits within 360px width without overflow');
  await page.setViewportSize({ width: 1280, height: 720 });
  console.log('  ✓ typography & proportional scaling (desktop 1000x700 label >= 13px + narrow 360x420 zero overflow)');

  // Delete temporary 3rd page before export check so Pages = 2
  await page.locator('#deck-tabs .page-tab').nth(2).click();
  await page.waitForFunction(() => document.querySelectorAll('#grid .pad').length === 12);
  await page.click('#btn-deck-cfg');
  await page.click('#btn-deck-del');
  await page.waitForFunction(() => document.querySelectorAll('#deck-tabs .page-tab').length === 2);

  // 14. localStorage persistence + v2.1.0 Export/Import + legacy v1 & v2.0.0 JSON import + Auto-Import Wizard
  await page.locator('#deck-tabs .page-tab').nth(0).click();
  await page.waitForFunction(() => document.querySelectorAll('#grid .pad').length === 64);

  await page.reload();
  await page.waitForSelector('#grid .pad');
  assert.equal((await pad(0).textContent()).includes('Go Slides'), true, 'localStorage persisted v2.1.0 pages & pads');
  assert.equal(await page.locator('#deck-tabs .page-tab').count(), 2, 'localStorage persisted multiple pages');

  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#btn-export')]);
  const exportPath = join(tmpDir, 'deck-export.json');
  await download.saveAs(exportPath);
  const exported = JSON.parse(fs.readFileSync(exportPath, 'utf8'));
  assert.equal(exported.version, 2, 'exported JSON is v2');
  assert.equal(exported.pages.length, 2, 'exported JSON includes both pages');
  assert.equal(exported.pages[0].pads.length, 64);
  assert.equal(exported.pages[1].pads.length, 12);
  assert.equal(exported.ws.password, undefined, 'password is not leaked in exported JSON');
  assert.equal(exported.ws.manualPort, undefined, 'manualPort is not leaked in exported JSON');
  assert.ok(exported.panicSteps.length >= 1, 'panicSteps exported');
  assert.ok(exported.pages[0].pads[16].image, 'exported JSON includes pad.image');
  assert.equal(exported.pages[0].pads[16].imageFit, 'icon');

  const badPath = join(tmpDir, 'bad.json');
  fs.writeFileSync(badPath, '{"notPads":true}');
  await page.setInputFiles('#file-import', badPath);
  await page.waitForFunction(() => document.getElementById('msg-info').textContent.includes('Import error'));
  assert.equal((await pad(0).textContent()).includes('Go Slides'), true, 'invalid import preserves existing deck');

  if (!(await page.locator('#btn-reset-layout').isVisible())) {
    await page.click('#btn-conn-toggle');
  }
  await page.click('#btn-reset-layout');
  assert.equal((await pad(0).textContent()).includes('Go Slides'), false, 'reset cleared pads');
  assert.equal(await page.locator('#deck-tabs .page-tab').count(), 1, 'reset restored single starter page');

  // Test Auto-Import Wizard selective Page generation (uncheck Filters) + verify read-only against OBS
  const callsBeforeWiz = state.calls.length;
  await page.click('#btn-auto-import');
  await page.waitForSelector('#import-wiz-dlg[open]');
  await page.uncheck('#wiz-filters');
  await page.click('#btn-wiz-apply');
  await page.waitForFunction(() => !document.getElementById('import-wiz-dlg').open);
  const tabNames = await page.locator('#deck-tabs .page-tab').allTextContents();
  assert.deepEqual(tabNames, ['Scenes', 'Sources', 'Broadcast'], 'Auto-Import created selected Pages only');
  const broadcastMutes = await page.evaluate(() => {
    const bp = Deck.cfg.pages.find((p) => p.name === 'Broadcast');
    return bp ? bp.pads.filter((p) => p.type === 'mute').map((p) => p.inputName) : [];
  });
  assert.ok(broadcastMutes.includes('Mic/Aux') && broadcastMutes.includes('Desktop Audio'), 'Broadcast includes audio mutes');
  assert.equal(broadcastMutes.includes('Slide Image') || broadcastMutes.includes('Alert Overlay'), false, 'Broadcast excludes non-audio image/browser sources');
  const mutatingCalls = state.calls.slice(callsBeforeWiz).filter((c) => /^(Create|Set|Remove|Press|Trigger)/.test(c.requestType));
  assert.equal(mutatingCalls.length, 0, 'Auto-Import is strictly read-only against OBS');

  // Verify red scene pad styling in Auto-Import + parent context subtitles on sources
  const scenePadColors = await page.evaluate(() => {
    const sp = Deck.cfg.pages.find((p) => p.name === 'Scenes');
    return sp ? sp.pads.filter((p) => p.type === 'scene').map((p) => ({ label: p.label, mode: p.mode, color: p.color })) : [];
  });
  assert.ok(scenePadColors.length > 0, 'Auto-Import generated scene pads');
  for (const sp of scenePadColors) {
    if (sp.mode === 'prev' || sp.mode === 'next') {
      assert.equal(sp.color, '#115e59', 'Prev/Next Scene pads retain teal accent');
    } else {
      assert.equal(sp.color, '#991b1b', `Auto-imported Scene pad "${sp.label}" has red color #991b1b`);
    }
  }

  const sourcePadCtx = await page.evaluate(() => {
    const sp = Deck.cfg.pages.find((p) => p.name === 'Sources');
    return sp ? sp.pads.filter((p) => p.type === 'source').map((p) => ({ label: p.label, sceneName: p.sceneName, ctx: Deck.getPadContextSubtitle(p) })) : [];
  });
  for (const sp of sourcePadCtx) {
    assert.equal(sp.ctx, sp.sceneName, `Source pad "${sp.label}" context subtitle matches parent scene`);
  }

  // Test importing a legacy v1 JSON layout
  const v1Path = join(tmpDir, 'legacy-v1.json');
  const v1Pads = Array.from({ length: 64 }, () => ({ type: 'none', label: '', icon: '', color: '#222733' }));
  v1Pads[0] = { type: 'scene', sceneName: 'BRB', label: 'V1 BRB', icon: '', color: '#1e3a8a' };
  fs.writeFileSync(v1Path, JSON.stringify({ version: 1, ws: { host: '127.0.0.1', port }, pads: v1Pads, panicSteps: [] }));
  await page.setInputFiles('#file-import', v1Path);
  await page.waitForFunction(() => document.querySelectorAll('#grid .pad')[0].textContent.includes('V1 BRB'));

  // Test importing a legacy v2.0.0 JSON layout (decks[], activeDeckId, deckId)
  const v20Path = join(tmpDir, 'legacy-v200.json');
  const d1Pads = Array.from({ length: 12 }, () => ({ type: 'none', label: '', icon: '', color: '#222733' }));
  d1Pads[0] = { type: 'page', mode: 'goto', deckId: 'deck-2', label: 'To D2', icon: '', color: '#222733' };
  const d2Pads = Array.from({ length: 12 }, () => ({ type: 'none', label: '', icon: '', color: '#222733' }));
  d2Pads[0] = { type: 'scene', sceneName: 'Slides', label: 'D2 Slides', icon: '', color: '#1e3a8a' };
  fs.writeFileSync(v20Path, JSON.stringify({
    version: 2,
    ws: { host: '127.0.0.1', port },
    activeDeckId: 'deck-2',
    decks: [
      { id: 'deck-1', name: 'D1', cols: 4, rows: 3, pads: d1Pads },
      { id: 'deck-2', name: 'D2', cols: 4, rows: 3, pads: d2Pads },
    ],
    panicSteps: [],
  }));
  await page.setInputFiles('#file-import', v20Path);
  await page.waitForFunction(() => document.querySelectorAll('#grid .pad')[0].textContent.includes('D2 Slides'));
  assert.equal(await page.evaluate(() => Deck.cfg.pages[0].pads[0].pageId), 'deck-2', 'v2.0.0 deckId migrated to pageId');

  // Test importing a legacy JSON layout with local hotkeys (stripped safely)
  const vLegacyHkPath = join(tmpDir, 'legacy-hotkey.json');
  const lhPads = Array.from({ length: 64 }, () => ({ type: 'none', label: '', icon: '', color: '#222733' }));
  lhPads[0] = { type: 'scene', sceneName: 'BRB', label: 'Legacy HK', hotkey: 'Ctrl+Shift+1', icon: '', color: '#991b1b' };
  fs.writeFileSync(vLegacyHkPath, JSON.stringify({ version: 2, pages: [{ id: 'page-1', name: 'Main', cols: 8, rows: 8, pads: lhPads }], panicSteps: [] }));
  await page.setInputFiles('#file-import', vLegacyHkPath);
  await page.waitForFunction(() => document.querySelectorAll('#grid .pad')[0].textContent.includes('Legacy HK'));
  const importedP0 = await page.evaluate(() => Deck.getActivePads()[0]);
  assert.equal(importedP0.hotkey, undefined, 'legacy hotkey property stripped on import');
  assert.equal(await page.locator('#grid .pad').nth(0).locator('.hk').count(), 0, 'no .hk badge rendered');

  // Re-import v2.1.0 export
  await page.setInputFiles('#file-import', exportPath);
  await page.waitForFunction(() => document.querySelectorAll('#grid .pad')[0].textContent.includes('Go Slides'));
  assert.equal(await page.locator('#deck-tabs .page-tab').count(), 2, 'v2.1.0 import restored multi-page layout');
  assert.equal(await pad(16).locator('.pad-icon-img').count(), 1, 'custom image restored on re-import');
  assert.ok((await pad(16).locator('.pad-icon-img').getAttribute('src')).startsWith('data:image/'), 'restored pad image src is data URL');
  console.log('  ✓ v2.1.0 localStorage + Export/Import + Auto-Import Wizard + v1 & v2.0.0 JSON migration');

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
