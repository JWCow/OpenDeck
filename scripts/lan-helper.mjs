import crypto from 'node:crypto';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execFile } from 'node:child_process';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

export function getLanAddresses() {
  const nets = os.networkInterfaces();
  const addresses = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      const family = typeof net.family === 'string' ? net.family : (net.family === 4 ? 'IPv4' : 'IPv6');
      if (family === 'IPv4' && !net.internal) {
        addresses.push(net.address);
      }
    }
  }
  // Home Wi-Fi (192.168.x, then 10.x) first; VPN and virtual adapters last, so the QR code points at the right one.
  const rank = (ip) => (ip.startsWith('192.168.') ? 0 : ip.startsWith('10.') ? 1 : 2);
  addresses.sort((a, b) => rank(a) - rank(b));
  return addresses.length > 0 ? addresses : ['127.0.0.1'];
}

// True when something on this port answers like obs-websocket (HTTP upgrade to the obswebsocket.json protocol).
export function probeObsPort(port, timeoutMs = 800) {
  return new Promise((resolve) => {
    const req = http.request({
      host: '127.0.0.1',
      port,
      headers: {
        Connection: 'Upgrade',
        Upgrade: 'websocket',
        'Sec-WebSocket-Version': '13',
        'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==',
        'Sec-WebSocket-Protocol': 'obswebsocket.json',
      },
      timeout: timeoutMs,
    });
    const done = (ok) => { req.destroy(); resolve(ok); };
    req.on('upgrade', (res, socket) => { socket.destroy(); resolve(/obswebsocket/.test(res.headers['sec-websocket-protocol'] || '')); });
    req.on('response', () => done(false));
    req.on('timeout', () => done(false));
    req.on('error', () => resolve(false));
    req.end();
  });
}

// Finds the OBS WebSocket port: listening ports of a running OBS (Windows), else the default 4455. Returns { port, found }.
export async function detectObsPort(defaultPort = 4455) {
  let candidates = [];
  if (process.platform === 'win32') {
    const ps = "Get-Process obs64*,obs32* -ErrorAction SilentlyContinue | ForEach-Object { Get-NetTCPConnection -OwningProcess $_.Id -State Listen -ErrorAction SilentlyContinue } | ForEach-Object { $_.LocalPort }";
    candidates = await new Promise((resolve) => {
      execFile('powershell', ['-NoProfile', '-Command', ps], { timeout: 8000 }, (err, out) => {
        resolve(err ? [] : [...new Set(String(out).split(/\s+/).filter(Boolean).map(Number))]);
      });
    });
  }
  if (!candidates.includes(defaultPort)) candidates.push(defaultPort);
  for (const c of candidates) {
    if (await probeObsPort(c)) return { port: c, found: true };
  }
  return { port: defaultPort, found: false };
}

export function formatPhoneUrls(addresses, httpPort, obsPort = 4455, layout = '') {
  const extra = layout ? `&layout=${encodeURIComponent(layout)}` : '';
  return addresses.map((ip) => `http://${ip}:${httpPort}/deck.html?host=${ip}&port=${obsPort}${extra}`);
}

function scrubLayoutText(rawText) {
  let text = rawText;
  try {
    const parsed = JSON.parse(rawText);
    if (parsed && typeof parsed === 'object') {
      if (parsed.ws && typeof parsed.ws === 'object') {
        delete parsed.ws.password;
      }
      text = JSON.stringify(parsed, null, 2);
    }
  } catch {
    return null;
  }
  const hash = crypto.createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 16);
  return {
    text,
    etag: `"od-${hash}"`,
  };
}

function findNewestLayoutCandidate({ resolvedRoot, layoutFile, watchDownloads, downloadsDir }) {
  const candidates = [];

  const localLayout = layoutFile ? path.resolve(layoutFile) : path.join(resolvedRoot, 'layout.json');
  try {
    const st = fs.statSync(localLayout);
    if (st.isFile()) {
      candidates.push({ filePath: localLayout, mtimeMs: st.mtimeMs });
    }
  } catch {}

  const dlDir = downloadsDir ? path.resolve(downloadsDir) : (watchDownloads ? path.join(os.homedir(), 'Downloads') : null);
  if (dlDir) {
    try {
      for (const entry of fs.readdirSync(dlDir, { withFileTypes: true })) {
        if (!entry.isFile()) continue;
        if (!/^obs-virtual-deck.*\.json$/i.test(entry.name)) continue;
        const full = path.join(dlDir, entry.name);
        try {
          const st = fs.statSync(full);
          if (st.isFile()) {
            candidates.push({ filePath: full, mtimeMs: st.mtimeMs });
          }
        } catch {}
      }
    } catch {}
  }

  if (!candidates.length) return null;
  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return candidates[0];
}

export function resolveDynamicLayout(options) {
  const hit = findNewestLayoutCandidate(options);
  if (!hit) {
    return { available: false, version: null, source: null, updatedAt: null };
  }
  try {
    const raw = fs.readFileSync(hit.filePath, 'utf8');
    const scrubbed = scrubLayoutText(raw);
    if (!scrubbed) {
      return { available: false, version: null, source: null, updatedAt: null };
    }
    return {
      available: true,
      version: scrubbed.etag,
      etag: scrubbed.etag,
      text: scrubbed.text,
      source: path.basename(hit.filePath),
      updatedAt: Math.round(hit.mtimeMs),
    };
  } catch {
    return { available: false, version: null, source: null, updatedAt: null };
  }
}

export function createLanHelper({
  rootDir,
  port = 0,
  obsPort = 4455,
  layoutFile = null,
  watchDownloads = false,
  downloadsDir = null,
} = {}) {
  const resolvedRoot = path.resolve(rootDir || path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
  const layoutOpts = { resolvedRoot, layoutFile, watchDownloads, downloadsDir };

  const server = http.createServer((req, res) => {
    // Zero-backend file server: only GET and HEAD
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { 'Content-Type': 'text/plain' });
      res.end('Method Not Allowed');
      return;
    }

    let rawUrl = req.url || '';
    let decodedUrl = '';
    try {
      decodedUrl = decodeURIComponent(rawUrl);
    } catch {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('Bad Request');
      return;
    }

    // Refuse path traversal (..), null bytes, backslashes, and encoded dot segments
    if (
      rawUrl.includes('\0') ||
      decodedUrl.includes('\0') ||
      rawUrl.includes('..') ||
      decodedUrl.includes('..') ||
      rawUrl.includes('\\') ||
      decodedUrl.includes('\\')
    ) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('Forbidden');
      return;
    }

    let filePath;
    try {
      const parsed = new URL(rawUrl, 'http://127.0.0.1');
      filePath = decodeURIComponent(parsed.pathname);
    } catch {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('Bad Request');
      return;
    }

    if (filePath === '/layout-version') {
      const info = resolveDynamicLayout(layoutOpts);
      const body = JSON.stringify({
        available: info.available,
        version: info.version,
        source: info.source,
        updatedAt: info.updatedAt,
      });
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(body, 'utf8'),
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache',
      });
      if (req.method === 'HEAD') res.end();
      else res.end(body);
      return;
    }

    if (filePath === '/layout.json') {
      const info = resolveDynamicLayout(layoutOpts);
      if (!info.available) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
        return;
      }
      if (req.headers['if-none-match'] === info.etag) {
        res.writeHead(304, {
          ETag: info.etag,
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-cache',
        });
        res.end();
        return;
      }
      const bytes = Buffer.from(info.text, 'utf8');
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': bytes.length,
        ETag: info.etag,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache',
      });
      if (req.method === 'HEAD') res.end();
      else res.end(bytes);
      return;
    }

    if (filePath === '/' || filePath === '') filePath = '/deck.html';

    const safeRelative = path.normalize(filePath).replace(/^[\/\\]+/, '');
    const fullPath = path.resolve(resolvedRoot, safeRelative);
    const rel = path.relative(resolvedRoot, fullPath);

    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('Forbidden');
      return;
    }

    let stat;
    try {
      if (fs.existsSync(fullPath)) {
        const real = fs.realpathSync(fullPath);
        const realRoot = fs.realpathSync(resolvedRoot);
        const relReal = path.relative(realRoot, real);
        if (relReal.startsWith('..') || path.isAbsolute(relReal)) {
          res.writeHead(403, { 'Content-Type': 'text/plain' });
          res.end('Forbidden');
          return;
        }
      }
      stat = fs.statSync(fullPath);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
      return;
    }

    if (!stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
      return;
    }

    const ext = path.extname(fullPath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': stat.size,
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache',
    });

    if (req.method === 'HEAD') {
      res.end();
      return;
    }

    const stream = fs.createReadStream(fullPath);
    stream.pipe(res);
  });

  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(port, () => {
      const actualPort = server.address().port;
      const addresses = getLanAddresses();
      const layoutInfo = resolveDynamicLayout(layoutOpts);
      const phoneUrls = formatPhoneUrls(addresses, actualPort, obsPort, layoutInfo.available ? 'layout.json' : '');
      resolve({
        server,
        port: actualPort,
        obsPort,
        rootDir: resolvedRoot,
        addresses,
        phoneUrls,
        getLayoutInfo: () => {
          const info = resolveDynamicLayout(layoutOpts);
          return {
            available: info.available,
            version: info.version,
            source: info.source,
            updatedAt: info.updatedAt,
          };
        },
        close: () => new Promise((r) => server.close(r)),
      });
    });
  });
}

function parseCliArgs() {
  const args = process.argv.slice(2);
  let port = process.env.PORT != null ? Number(process.env.PORT) : 8080;
  let obsPort = process.env.OBS_PORT != null ? Number(process.env.OBS_PORT) : 4455;
  let obsPortExplicit = process.env.OBS_PORT != null;
  let rootDir = null;
  let downloadsDir = null;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--port=')) {
      const p = Number(arg.slice(7));
      if (!Number.isNaN(p)) port = p;
    } else if (arg === '-p' && args[i + 1]) {
      const p = Number(args[++i]);
      if (!Number.isNaN(p)) port = p;
    } else if (arg.startsWith('--obs-port=')) {
      const p = Number(arg.slice(11));
      if (!Number.isNaN(p)) { obsPort = p; obsPortExplicit = true; }
    } else if (arg.startsWith('--dir=')) {
      rootDir = arg.slice(6);
    } else if (arg.startsWith('--downloads-dir=')) {
      downloadsDir = arg.slice(16);
    }
  }

  return { port, obsPort, obsPortExplicit, rootDir, downloadsDir };
}

// When run directly from CLI
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  const { port, obsPort: configuredObsPort, obsPortExplicit, rootDir, downloadsDir } = parseCliArgs();
  let obsPort = configuredObsPort;
  let obsNote = '';
  if (!obsPortExplicit) {
    const det = await detectObsPort(configuredObsPort);
    obsPort = det.port;
    obsNote = det.found ? ' (detected from running OBS)' : ' (OBS not found: start OBS and enable Tools > WebSocket Server Settings; using the default)';
  }
  createLanHelper({ rootDir, port, obsPort, watchDownloads: true, downloadsDir })
    .then((helper) => {
      console.log('============================================================');
      console.log('  OpenDeck LAN Helper (Phone Deck)');
      console.log(`  Serving Deck folder: ${helper.rootDir}`);
      console.log(`  HTTP port:           ${helper.port}`);
      console.log(`  OBS WebSocket port:  ${helper.obsPort}${obsNote}`);
      console.log('============================================================\n');
      console.log('Open on your phone or tablet on the same Wi-Fi:\n');
      for (const u of helper.phoneUrls) {
        console.log(`  -> ${u}`);
      }
      try {
        const qr = createRequire(import.meta.url)('./vendor/qrcode-terminal.cjs');
        const first = helper.phoneUrls[0];
        console.log(`
Scan with your phone camera (${first}):`);
        qr.generate(first, { small: true });
      } catch {
        // QR is optional: ignore when the vendor files are not installed
      }
      console.log('\n(No password is in the link. Enter password once on your device if enabled in OBS.)');
      console.log('Press Ctrl+C to stop.\n');
    })
    .catch((err) => {
      console.error(`[ERROR] Failed to start LAN helper: ${err.message}`);
      process.exit(1);
    });
}
