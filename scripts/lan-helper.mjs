import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

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
  return addresses.length > 0 ? addresses : ['127.0.0.1'];
}

export function formatPhoneUrls(addresses, httpPort, obsPort = 4455) {
  return addresses.map((ip) => `http://${ip}:${httpPort}/deck.html?host=${ip}&port=${obsPort}`);
}

export function createLanHelper({ rootDir, port = 0, obsPort = 4455 } = {}) {
  const resolvedRoot = path.resolve(rootDir || path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));

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
      const phoneUrls = formatPhoneUrls(addresses, actualPort, obsPort);
      resolve({
        server,
        port: actualPort,
        obsPort,
        rootDir: resolvedRoot,
        addresses,
        phoneUrls,
        close: () => new Promise((r) => server.close(r)),
      });
    });
  });
}

function parseCliArgs() {
  const args = process.argv.slice(2);
  let port = process.env.PORT != null ? Number(process.env.PORT) : 8080;
  let obsPort = process.env.OBS_PORT != null ? Number(process.env.OBS_PORT) : 4455;
  let rootDir = null;

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
      if (!Number.isNaN(p)) obsPort = p;
    } else if (arg.startsWith('--dir=')) {
      rootDir = arg.slice(6);
    }
  }

  return { port, obsPort, rootDir };
}

// When run directly from CLI
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  const { port, obsPort, rootDir } = parseCliArgs();
  createLanHelper({ rootDir, port, obsPort })
    .then((helper) => {
      console.log('============================================================');
      console.log('  OpenDeck LAN Helper (Phone Deck)');
      console.log(`  Serving Deck folder: ${helper.rootDir}`);
      console.log(`  HTTP port:           ${helper.port}`);
      console.log(`  OBS WebSocket port:  ${helper.obsPort}`);
      console.log('============================================================\n');
      console.log('Open on your phone or tablet on the same Wi-Fi:\n');
      for (const u of helper.phoneUrls) {
        console.log(`  -> ${u}`);
      }
      console.log('\n(No password is in the link. Enter password once on your device if enabled in OBS.)');
      console.log('Press Ctrl+C to stop.\n');
    })
    .catch((err) => {
      console.error(`[ERROR] Failed to start LAN helper: ${err.message}`);
      process.exit(1);
    });
}
