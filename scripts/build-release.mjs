import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DIST_DIR = path.join(ROOT, 'dist');
const STAGE_ROOT = path.join(DIST_DIR, 'obs-virtual-deck');

const IGNORED_NAMES = new Set(['.DS_Store', 'Thumbs.db']);

// Precompute CRC-32 table
const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  CRC_TABLE[i] = c >>> 0;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function dosDateTime(date = new Date()) {
  const year = Math.max(1980, date.getFullYear());
  const dosTime =
    ((date.getHours() & 0x1f) << 11) |
    ((date.getMinutes() & 0x3f) << 5) |
    ((date.getSeconds() >> 1) & 0x1f);
  const dosDate =
    (((year - 1980) & 0x7f) << 9) |
    (((date.getMonth() + 1) & 0x0f) << 5) |
    (date.getDate() & 0x1f);
  return { dosTime, dosDate };
}

function buildZip(entries) {
  const { dosTime, dosDate } = dosDateTime();
  const localChunks = [];
  const centralChunks = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.zipPath, 'utf8');
    const raw = entry.data;
    const crc = crc32(raw);
    const compressed = zlib.deflateRawSync(raw, { level: 9 });
    const useStore = compressed.length >= raw.length;
    const method = useStore ? 0 : 8;
    const payload = useStore ? raw : compressed;
    const flags = 0x0800; // UTF-8 filename

    // Local file header (30 bytes + filename)
    const lfh = Buffer.alloc(30);
    lfh.writeUInt32LE(0x04034b50, 0);
    lfh.writeUInt16LE(20, 4); // version needed: 2.0
    lfh.writeUInt16LE(flags, 6);
    lfh.writeUInt16LE(method, 8);
    lfh.writeUInt16LE(dosTime, 10);
    lfh.writeUInt16LE(dosDate, 12);
    lfh.writeUInt32LE(crc, 14);
    lfh.writeUInt32LE(payload.length, 18);
    lfh.writeUInt32LE(raw.length, 22);
    lfh.writeUInt16LE(nameBuf.length, 26);
    lfh.writeUInt16LE(0, 28);

    localChunks.push(lfh, nameBuf, payload);

    // Central directory header (46 bytes + filename)
    const unixMode = (entry.executable ? 0o100755 : 0o100644) << 16;
    const cdh = Buffer.alloc(46);
    cdh.writeUInt32LE(0x02014b50, 0);
    cdh.writeUInt16LE((3 << 8) | 20, 4); // made by UNIX (3), spec 2.0
    cdh.writeUInt16LE(20, 6);
    cdh.writeUInt16LE(flags, 8);
    cdh.writeUInt16LE(method, 10);
    cdh.writeUInt16LE(dosTime, 12);
    cdh.writeUInt16LE(dosDate, 14);
    cdh.writeUInt32LE(crc, 16);
    cdh.writeUInt32LE(payload.length, 20);
    cdh.writeUInt32LE(raw.length, 24);
    cdh.writeUInt16LE(nameBuf.length, 28);
    cdh.writeUInt16LE(0, 30);
    cdh.writeUInt16LE(0, 32);
    cdh.writeUInt16LE(0, 34);
    cdh.writeUInt16LE(0, 36);
    cdh.writeUInt32LE(unixMode >>> 0, 38);
    cdh.writeUInt32LE(offset >>> 0, 42);

    centralChunks.push(cdh, nameBuf);
    offset += lfh.length + nameBuf.length + payload.length;
  }

  const centralDir = Buffer.concat(centralChunks);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDir.length, 12);
  eocd.writeUInt32LE(offset >>> 0, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localChunks, centralDir, eocd]);
}

function collectDir(srcDir, zipPrefix, out) {
  const items = fs.readdirSync(srcDir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
  for (const item of items) {
    if (IGNORED_NAMES.has(item.name)) continue;
    const full = path.join(srcDir, item.name);
    const rel = `${zipPrefix}/${item.name}`;
    if (item.isDirectory()) {
      collectDir(full, rel, out);
    } else if (item.isFile()) {
      out.push({
        zipPath: rel,
        data: fs.readFileSync(full),
        executable: false,
      });
    }
  }
}

function main() {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const version = pkg.version;
  if (!version) throw new Error('Missing version in package.json');

  const requiredFiles = [
    'deck.html',
    'deck/snapshots.js',
    'scripts/lan-helper.mjs',
    'scripts/vendor/qrcode-terminal.cjs',
    'Phone Helper.bat',
    'README.md',
    'installers/Install-Windows.bat',
    'installers/Install-Mac.command',
  ];
  for (const rel of requiredFiles) {
    if (!fs.existsSync(path.join(ROOT, rel))) {
      throw new Error(`Missing required release file: ${rel}`);
    }
  }
  if (!fs.existsSync(path.join(ROOT, 'deck'))) {
    throw new Error('Missing required release directory: deck/');
  }

  fs.rmSync(DIST_DIR, { recursive: true, force: true });
  fs.mkdirSync(STAGE_ROOT, { recursive: true });

  const entries = [
    {
      zipPath: 'obs-virtual-deck/deck.html',
      data: fs.readFileSync(path.join(ROOT, 'deck.html')),
      executable: false,
    },
  ];

  collectDir(path.join(ROOT, 'deck'), 'obs-virtual-deck/deck', entries);

  entries.push({
    zipPath: 'obs-virtual-deck/README.md',
    data: fs.readFileSync(path.join(ROOT, 'README.md')),
    executable: false,
  });

  const winBat = fs
    .readFileSync(path.join(ROOT, 'installers/Install-Windows.bat'), 'utf8')
    .replace(/\r?\n/g, '\r\n');
  entries.push({
    zipPath: 'obs-virtual-deck/Install-Windows.bat',
    data: Buffer.from(winBat, 'utf8'),
    executable: false,
  });

  const macCmd = fs
    .readFileSync(path.join(ROOT, 'installers/Install-Mac.command'), 'utf8')
    .replace(/\r?\n/g, '\n');
  entries.push({
    zipPath: 'obs-virtual-deck/Install-Mac.command',
    data: Buffer.from(macCmd, 'utf8'),
    executable: true,
  });

  entries.push({
    zipPath: 'obs-virtual-deck/scripts/lan-helper.mjs',
    data: fs.readFileSync(path.join(ROOT, 'scripts/lan-helper.mjs')),
    executable: false,
  });

  // QR code library (optional at runtime, but ship it so the helper prints a QR)
  collectDir(path.join(ROOT, 'scripts/vendor'), 'obs-virtual-deck/scripts/vendor', entries);

  const phoneBat = fs
    .readFileSync(path.join(ROOT, 'Phone Helper.bat'), 'utf8')
    .replace(/\r?\n/g, '\r\n');
  entries.push({
    zipPath: 'obs-virtual-deck/Phone Helper.bat',
    data: Buffer.from(phoneBat, 'utf8'),
    executable: false,
  });

  // Write staged folder
  for (const entry of entries) {
    const dest = path.join(DIST_DIR, entry.zipPath);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, entry.data, { mode: entry.executable ? 0o755 : 0o644 });
  }

  // Write ZIPs
  const zipBuffer = buildZip(entries);
  const zipNames = [
    `opendeck-v${version}.zip`,
    'opendeck-latest.zip',
    'opendeck.zip',
    `obs-virtual-deck-v${version}.zip`,
    'obs-virtual-deck-latest.zip',
    'obs-virtual-deck.zip',
  ];
  for (const name of zipNames) {
    fs.writeFileSync(path.join(DIST_DIR, name), zipBuffer);
  }

  console.log(`Built OpenDeck (obs-virtual-deck) v${version} release (${entries.length} files, ${zipBuffer.length} bytes ZIP):`);
  for (const entry of entries) {
    console.log(`  - ${entry.zipPath}${entry.executable ? ' (executable)' : ''}`);
  }
  for (const name of zipNames) {
    console.log(`  -> dist/${name}`);
  }
}

main();
