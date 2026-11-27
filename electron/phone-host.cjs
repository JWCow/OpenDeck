'use strict';

const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const DEFAULT_PREFERRED_PORT = 8765;

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

function loadQrVendor() {
  const candidates = [
    path.join(__dirname, 'vendor', 'QRCode'),
    path.resolve(__dirname, '..', 'scripts', 'vendor', 'QRCode'),
  ];
  for (const dir of candidates) {
    const indexPath = path.join(dir, 'index.js');
    const eclPath = path.join(dir, 'QRErrorCorrectLevel.js');
    if (fs.existsSync(indexPath) && fs.existsSync(eclPath)) {
      return {
        QRCode: require(indexPath),
        QRErrorCorrectLevel: require(eclPath),
      };
    }
  }
  return null;
}

function getLanAddresses() {
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
  // Home Wi-Fi (192.168.x, then 10.x) first; VPN and virtual adapters last.
  const rank = (ip) => (ip.startsWith('192.168.') ? 0 : ip.startsWith('10.') ? 1 : 2);
  addresses.sort((a, b) => rank(a) - rank(b));
  return addresses.length > 0 ? addresses : ['127.0.0.1'];
}

function parseValidPort(raw, fallback = 4455) {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 && n <= 65535 ? n : fallback;
}

/**
 * Strip any OBS WebSocket password before storing or serving layout JSON (ADR-0002).
 */
function scrubLayoutForPhone(rawLayout) {
  if (rawLayout == null) return null;
  let obj = rawLayout;
  if (typeof rawLayout === 'string') {
    const trimmed = rawLayout.trim();
    if (!trimmed) return null;
    obj = JSON.parse(trimmed);
  }
  if (!obj || typeof obj !== 'object') return null;
  const clone = JSON.parse(JSON.stringify(obj));
  if (clone.ws && typeof clone.ws === 'object') {
    delete clone.ws.password;
  }
  const text = JSON.stringify(clone, null, 2);
  const hash = crypto.createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 16);
  return {
    text,
    etag: `"od-${hash}"`,
    updatedAt: Date.now(),
  };
}

function generateQrSvg(text) {
  const vendor = loadQrVendor();
  if (!vendor || !text) return '';
  const { QRCode, QRErrorCorrectLevel } = vendor;
  const qr = new QRCode(-1, QRErrorCorrectLevel.L);
  qr.addData(String(text));
  qr.make();

  const count = qr.getModuleCount();
  const margin = 2;
  const size = count + margin * 2;
  const parts = [];

  for (let r = 0; r < count; r++) {
    for (let c = 0; c < count; c++) {
      if (qr.isDark(r, c)) {
        parts.push(`M${c + margin},${r + margin}h1v1h-1z`);
      }
    }
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" ` +
    `shape-rendering="crispEdges" role="img" aria-label="Phone Deck QR Code">` +
    `<rect width="${size}" height="${size}" fill="#ffffff"/>` +
    `<path d="${parts.join('')}" fill="#111318"/>` +
    `</svg>`
  );
}

function formatPhoneUrls(addresses, httpPort, obsPort, hasLayout) {
  const extra = hasLayout ? '&layout=layout.json' : '';
  return addresses.map((ip) => `http://${ip}:${httpPort}/deck.html?host=${ip}&port=${obsPort}${extra}`);
}

function createPhoneHost({ rootDir, preferredPort = DEFAULT_PREFERRED_PORT } = {}) {
  const resolvedRoot = path.resolve(rootDir);
  let state = 'stopped'; // 'stopped' | 'starting' | 'running' | 'stopping'
  let pendingTransition = null;
  let server = null;
  let actualPort = 0;
  let currentObsPort = 4455;
  let currentLayout = null;
  let addresses = [];

  function handleRequest(req, res) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { 'Content-Type': 'text/plain' });
      res.end('Method Not Allowed');
      return;
    }

    const rawUrl = req.url || '';
    let decodedUrl = '';
    try {
      decodedUrl = decodeURIComponent(rawUrl);
    } catch {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('Bad Request');
      return;
    }

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

    let reqPath;
    try {
      const parsed = new URL(rawUrl, 'http://127.0.0.1');
      reqPath = decodeURIComponent(parsed.pathname);
    } catch {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('Bad Request');
      return;
    }

    if (reqPath === '/layout-version') {
      const payload = JSON.stringify({
        available: Boolean(currentLayout),
        version: currentLayout ? currentLayout.etag : null,
        updatedAt: currentLayout ? currentLayout.updatedAt : null,
      });
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(payload, 'utf8'),
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache',
      });
      if (req.method === 'HEAD') {
        res.end();
      } else {
        res.end(payload);
      }
      return;
    }

    if (reqPath === '/layout.json' && currentLayout) {
      const ifNoneMatch = req.headers['if-none-match'];
      if (ifNoneMatch && ifNoneMatch === currentLayout.etag) {
        res.writeHead(304, {
          ETag: currentLayout.etag,
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-cache',
        });
        res.end();
        return;
      }
      const bytes = Buffer.from(currentLayout.text, 'utf8');
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': bytes.length,
        ETag: currentLayout.etag,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache',
      });
      if (req.method === 'HEAD') {
        res.end();
      } else {
        res.end(bytes);
      }
      return;
    }

    if (reqPath === '/' || reqPath === '') reqPath = '/deck.html';

    const safeRelative = path.normalize(reqPath).replace(/^[/\\]+/, '');
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

    fs.createReadStream(fullPath).pipe(res);
  }

  function getStatus() {
    if (state !== 'running' || !server || !server.listening) {
      return {
        state,
        running: false,
        port: 0,
        obsPort: currentObsPort,
        addresses: [],
        urls: [],
        primaryUrl: '',
        qrSvg: '',
        layoutVersion: currentLayout ? currentLayout.etag : null,
      };
    }
    const hasLayout = Boolean(currentLayout);
    const urls = formatPhoneUrls(addresses, actualPort, currentObsPort, hasLayout);
    const primaryUrl = urls[0] || '';
    return {
      state,
      running: true,
      port: actualPort,
      obsPort: currentObsPort,
      addresses: [...addresses],
      urls,
      primaryUrl,
      qrSvg: primaryUrl ? generateQrSvg(primaryUrl) : '',
      layoutVersion: currentLayout ? currentLayout.etag : null,
    };
  }

  function listenOnPort(portToTry) {
    return new Promise((resolve, reject) => {
      const srv = http.createServer(handleRequest);
      srv.once('error', (err) => {
        try {
          srv.close();
        } catch {}
        reject(err);
      });
      srv.listen(portToTry, '0.0.0.0', () => {
        resolve(srv);
      });
    });
  }

  async function start(layoutJson, obsPort) {
    if (pendingTransition) {
      await pendingTransition.catch(() => {});
    }
    if (obsPort != null) {
      currentObsPort = parseValidPort(obsPort, currentObsPort);
    }
    if (layoutJson !== undefined) {
      currentLayout = scrubLayoutForPhone(layoutJson);
    }
    addresses = getLanAddresses();

    if (state === 'running' && server && server.listening) {
      return getStatus();
    }

    state = 'starting';
    pendingTransition = (async () => {
      try {
        try {
          server = await listenOnPort(preferredPort);
        } catch (err) {
          if (preferredPort !== 0 && (err.code === 'EADDRINUSE' || err.code === 'EACCES')) {
            server = await listenOnPort(0);
          } else {
            throw err;
          }
        }
        actualPort = server.address().port;
        state = 'running';
        return getStatus();
      } catch (err) {
        server = null;
        actualPort = 0;
        state = 'stopped';
        throw err;
      } finally {
        pendingTransition = null;
      }
    })();
    return pendingTransition;
  }

  async function stop() {
    if (pendingTransition) {
      await pendingTransition.catch(() => {});
    }
    if (state === 'stopped' || !server) {
      state = 'stopped';
      actualPort = 0;
      return getStatus();
    }
    state = 'stopping';
    const closing = server;
    server = null;
    actualPort = 0;
    pendingTransition = new Promise((resolve) => {
      try {
        closing.close(() => {
          state = 'stopped';
          pendingTransition = null;
          resolve(getStatus());
        });
      } catch {
        state = 'stopped';
        pendingTransition = null;
        resolve(getStatus());
      }
    });
    return pendingTransition;
  }

  function updateLayout(layoutJson, obsPort) {
    if (obsPort != null) {
      currentObsPort = parseValidPort(obsPort, currentObsPort);
    }
    if (layoutJson !== undefined) {
      currentLayout = scrubLayoutForPhone(layoutJson);
    }
    return getStatus();
  }

  return {
    start,
    stop,
    updateLayout,
    getStatus,
  };
}

module.exports = {
  createPhoneHost,
  generateQrSvg,
  scrubLayoutForPhone,
  getLanAddresses,
};
