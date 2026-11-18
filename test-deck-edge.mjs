#!/usr/bin/env node
// Edge-case Playwright E2E tests for deck.html (groups, live events, non-destructive ticks, PANIC resilience, narrow dock).
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { createFakeObs } from './test-deck-fake-obs.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DECK_URL = pathToFileURL(join(__dirname, 'deck.html')).href;

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

  // 1. ws://host:port normalization + no-auth connect
  await page.click('#btn-conn-toggle');
  await page.fill('#ws-host', `ws://127.0.0.1:${port}`);
  await page.fill('#ws-port', '9999');
  await page.click('#btn-ws-connect');
  await page.waitForFunction(() => document.getElementById('conn-text').textContent === 'Connected');
  assert.equal(await page.inputValue('#ws-host'), '127.0.0.1');
  assert.equal(await page.inputValue('#ws-port'), String(port));
  console.log('  ✓ ws://host:port normalization');

  const pad = (i) => page.locator('#grid .pad').nth(i);
  await page.click('#btn-edit');

  // 2. OBS Group source toggle & filter on group + new mute pad immediate active state
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

  // 3. Stale field cleanup on type switch + delayMs=0 preserved
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
  // Set wait to 1500ms so we can test 200ms ticks cleanly without macro completing
  await page.locator('#f-fields .step').nth(1).locator('input[type="number"]').fill('1500');
  await page.click('#pad-form button[type="submit"]');
  await page.click('#btn-edit');

  // Execute group source + group filter + live events (SceneItemCreated on group, SourceFilterCreated, SceneListChanged)
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

  // 4. Macro 200ms tick updates .sub in place without destroying pad DOM, and PANIC fallback disables macro filter
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

  // 5. Configured PANIC steps continue past a failing step
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
  console.log('  ✓ non-destructive macro ticks, macro-filter PANIC fallback & error resilience');

  // 6. Narrow OBS dock viewport (360x420) fits without horizontal overflow
  await page.setViewportSize({ width: 360, height: 420 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  assert.equal(overflow, false, 'no horizontal overflow at 360x420 OBS dock size');
  console.log('  ✓ narrow OBS dock viewport (360x420) layout check');

  assert.deepEqual(pageErrors, [], `unexpected page errors: ${pageErrors.join('; ')}`);
  console.log('\nPASS: all deck edge E2E checks succeeded.');
} finally {
  if (browser) await browser.close();
  wss.close();
}
