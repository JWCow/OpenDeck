import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { createLanHelper } from './scripts/lan-helper.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { discoverObsPort, isSameObsDiscovery, parseValidPort } = require('./electron/obs-discovery.cjs');
const { createPhoneHost, generateQrSvg, scrubLayoutForPhone } = require('./electron/phone-host.cjs');

async function rawGetStatus(port, rawRequestPath) {
  return new Promise((resolve, reject) => {
    const sock = net.connect(port, '127.0.0.1', () => {
      sock.write(`GET ${rawRequestPath} HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n`);
    });
    let buf = '';
    sock.on('data', (chunk) => {
      buf += chunk.toString('utf8');
      const m = buf.match(/^HTTP\/1\.[01]\s+(\d+)/);
      if (m) {
        sock.destroy();
        resolve(Number(m[1]));
      }
    });
    sock.on('error', reject);
  });
}

async function testObsDiscovery() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opendeck-obs-disc-'));
  const prevEnv = process.env.OBS_WS_CONFIG;
  try {
    const cfgPath = path.join(tmpDir, 'config.json');
    fs.writeFileSync(
      cfgPath,
      JSON.stringify({
        server_enabled: true,
        server_port: 4466,
        auth_required: true,
        server_password: 'TOP_SECRET_PASSWORD',
      }),
      'utf8'
    );
    process.env.OBS_WS_CONFIG = cfgPath;
    const info = discoverObsPort();
    assert.equal(info.enabled, true, 'discovers server_enabled');
    assert.equal(info.port, 4466, 'discovers server_port');
    assert.equal(info.source, cfgPath, 'reports config source path');
    assert.equal('password' in info, false, 'never returns password key');
    assert.equal(JSON.stringify(info).includes('TOP_SECRET_PASSWORD'), false, 'never leaks password value');

    const badCfgPath = path.join(tmpDir, 'bad.json');
    fs.writeFileSync(badCfgPath, '{not-valid-json', 'utf8');
    process.env.OBS_WS_CONFIG = badCfgPath;
    const fallback = discoverObsPort();
    assert.notEqual(fallback.source, badCfgPath, 'ignores malformed config file');

    assert.equal(parseValidPort(4455), 4455);
    assert.equal(parseValidPort('65535'), 65535);
    assert.equal(parseValidPort(0), null);
    assert.equal(parseValidPort('70000'), null);
    assert.equal(
      isSameObsDiscovery(
        { port: 4455, enabled: true, source: 'a' },
        { port: 4455, enabled: true, source: 'a' }
      ),
      true
    );
    assert.equal(
      isSameObsDiscovery(
        { port: 4455, enabled: true, source: 'a' },
        { port: 4456, enabled: true, source: 'a' }
      ),
      false
    );
    console.log('  ✓ electron/obs-discovery.cjs read-only port discovery & ADR-0002 password isolation');
  } finally {
    if (prevEnv === undefined) delete process.env.OBS_WS_CONFIG;
    else process.env.OBS_WS_CONFIG = prevEnv;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

async function testPhoneHost() {
  const scrubbed = scrubLayoutForPhone({
    version: 2,
    ws: { host: '127.0.0.1', port: 4455, password: 'LEAKED_PASSWORD' },
    pages: [{ id: 'p1', name: 'Main', cols: 4, rows: 3, pads: [] }],
  });
  assert.ok(scrubbed, 'scrubLayoutForPhone returns result');
  assert.equal(JSON.parse(scrubbed.text).ws.password, undefined, 'scrubs ws.password');
  assert.match(scrubbed.etag, /^"od-[0-9a-f]{16}"$/, 'computes deterministic ETag');

  const svg = generateQrSvg('http://192.168.1.50:8765/deck.html?host=192.168.1.50&port=4455');
  assert.match(svg, /^<svg /, 'generates SVG root');
  assert.match(svg, /<path /, 'generates QR module path');
  assert.equal(/<script/i.test(svg), false, 'QR SVG contains no script');

  const host = createPhoneHost({ rootDir: __dirname, preferredPort: 0 });
  try {
    const st = await host.start(
      {
        version: 2,
        ws: { host: '127.0.0.1', port: 4455, password: 'PHONE_HOST_SECRET' },
        pages: [{ id: 'main', name: 'Main', cols: 4, rows: 3, pads: [] }],
      },
      4466
    );
    assert.equal(st.running, true, 'phone host starts');
    assert.ok(st.port > 0, 'binds to ephemeral port');
    assert.equal(st.obsPort, 4466, 'tracks OBS port');
    assert.equal(/pass(word)?=/i.test(st.primaryUrl), false, 'primaryUrl omits password');
    assert.equal(st.qrSvg.includes('PHONE_HOST_SECRET'), false, 'QR SVG omits password');

    const resHtml = await fetch(`http://127.0.0.1:${st.port}/deck.html`);
    assert.equal(resHtml.status, 200, 'serves deck.html');

    const resLayout = await fetch(`http://127.0.0.1:${st.port}/layout.json`);
    assert.equal(resLayout.status, 200, 'serves /layout.json');
    const etag1 = resLayout.headers.get('etag');
    assert.equal(etag1, st.layoutVersion, 'ETag matches layoutVersion');
    const layoutBody = await resLayout.json();
    assert.equal(layoutBody.ws.password, undefined, 'served /layout.json strips ws.password');

    const res304 = await fetch(`http://127.0.0.1:${st.port}/layout.json`, {
      headers: { 'If-None-Match': etag1 },
    });
    assert.equal(res304.status, 304, 'returns 304 on matching If-None-Match');

    const ver1 = await (await fetch(`http://127.0.0.1:${st.port}/layout-version`)).json();
    assert.equal(ver1.available, true);
    assert.equal(ver1.version, etag1);

    const updated = host.updateLayout({
      version: 2,
      ws: { host: '127.0.0.1', port: 4455, password: 'NEW_SECRET' },
      pages: [{ id: 'main', name: 'Updated', cols: 4, rows: 3, pads: [] }],
    });
    assert.notEqual(updated.layoutVersion, etag1, 'updateLayout rotates ETag');
    const ver2 = await (await fetch(`http://127.0.0.1:${st.port}/layout-version`)).json();
    assert.equal(ver2.version, updated.layoutVersion);

    const resPost = await fetch(`http://127.0.0.1:${st.port}/layout.json`, { method: 'POST' });
    assert.equal(resPost.status, 405, 'rejects POST with 405');
    assert.equal(await rawGetStatus(st.port, '/../package.json'), 403, 'blocks .. traversal');
    assert.equal(await rawGetStatus(st.port, '/%2e%2e/package.json'), 403, 'blocks encoded traversal');
    assert.equal(await rawGetStatus(st.port, '/..\\package.json'), 403, 'blocks backslash traversal');

    const stopped = await host.stop();
    assert.equal(stopped.running, false, 'phone host stops cleanly');
    console.log('  ✓ electron/phone-host.cjs layout scrubbing, ETag/304, QR SVG & traversal guard');
  } finally {
    await host.stop();
  }
}

async function testLanHelper() {
  const tmpDl = fs.mkdtempSync(path.join(os.tmpdir(), 'opendeck-lan-dl-'));
  let helper = null;
  try {
    const firstFile = path.join(tmpDl, 'obs-virtual-deck (1).json');
    fs.writeFileSync(
      firstFile,
      JSON.stringify({
        version: 2,
        ws: { host: '127.0.0.1', port: 4455, password: 'LAN_SECRET_PASSWORD' },
        pages: [{ id: 'p1', name: 'First', cols: 4, rows: 3, pads: [] }],
      }),
      'utf8'
    );

    helper = await createLanHelper({
      rootDir: __dirname,
      port: 0,
      obsPort: 4455,
      downloadsDir: tmpDl,
    });

    const res1 = await fetch(`http://127.0.0.1:${helper.port}/layout.json`);
    assert.equal(res1.status, 200, 'lan-helper serves dynamic Downloads layout');
    const etag1 = res1.headers.get('etag');
    assert.ok(etag1, 'lan-helper sets ETag');
    const body1 = await res1.json();
    assert.equal(body1.ws.password, undefined, 'lan-helper strips ws.password from served layout');
    assert.equal(body1.pages[0].name, 'First');

    const res304 = await fetch(`http://127.0.0.1:${helper.port}/layout.json`, {
      headers: { 'If-None-Match': etag1 },
    });
    assert.equal(res304.status, 304, 'lan-helper honors If-None-Match');

    const ver1 = await (await fetch(`http://127.0.0.1:${helper.port}/layout-version`)).json();
    assert.equal(ver1.available, true);
    assert.equal(ver1.version, etag1);
    assert.equal(ver1.source, 'obs-virtual-deck (1).json');

    await new Promise((r) => setTimeout(r, 25));
    const secondFile = path.join(tmpDl, 'obs-virtual-deck (2).json');
    fs.writeFileSync(
      secondFile,
      JSON.stringify({
        version: 2,
        ws: { host: '127.0.0.1', port: 4455 },
        pages: [{ id: 'p2', name: 'Second', cols: 4, rows: 3, pads: [] }],
      }),
      'utf8'
    );

    const ver2 = await (await fetch(`http://127.0.0.1:${helper.port}/layout-version`)).json();
    assert.notEqual(ver2.version, etag1, 'lan-helper detects newer layout export without restart');
    assert.equal(ver2.source, 'obs-virtual-deck (2).json');

    const res2 = await fetch(`http://127.0.0.1:${helper.port}/layout.json`);
    const body2 = await res2.json();
    assert.equal(body2.pages[0].name, 'Second');

    assert.equal(await rawGetStatus(helper.port, '/../package.json'), 403, 'lan-helper blocks .. traversal');
    assert.equal(await rawGetStatus(helper.port, '/%2e%2e/package.json'), 403, 'lan-helper blocks %2e%2e traversal');
    console.log('  ✓ scripts/lan-helper.mjs dynamic Downloads layout, ETag/304 & /layout-version');
  } finally {
    if (helper) await helper.close();
    fs.rmSync(tmpDl, { recursive: true, force: true });
  }
}

async function main() {
  console.log('Running OpenDeck platform unit & HTTP checks...');
  await testObsDiscovery();
  await testPhoneHost();
  await testLanHelper();
  console.log('PASS: all platform checks succeeded.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
