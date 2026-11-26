#!/usr/bin/env node
/**
 * Generate OpenDeck desktop icons from the canonical 4-pad brand mark
 * (matching deck.html favicon and artifact/desktop-shim.js).
 *
 * Outputs:
 *   electron/assets/icon.png           (1024x1024 RGBA PNG)
 *   electron/assets/icon.ico           (16, 32, 48, 256 multi-resolution Windows ICO)
 *   electron/assets/tray.png           (32x32 RGBA PNG)
 *   electron/assets/trayTemplate.png   (18x18 monochrome black + alpha PNG for macOS)
 *   electron/assets/trayTemplate@2x.png(36x36 monochrome black + alpha PNG for macOS Retina)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = path.resolve(__dirname, '..', 'assets');

// Normalized geometry from the 256x256 icon in artifact/desktop-shim.js
const BG_COLOR = [11, 12, 15]; // #0b0c0f
const PADS = [
  { x: 40 / 256, y: 40 / 256, w: 80 / 256, h: 80 / 256, r: 20 / 256, color: [236, 238, 242], alpha: 1.0 },
  { x: 136 / 256, y: 40 / 256, w: 80 / 256, h: 80 / 256, r: 20 / 256, color: [236, 238, 242], alpha: 0.3 },
  { x: 40 / 256, y: 136 / 256, w: 80 / 256, h: 80 / 256, r: 20 / 256, color: [236, 238, 242], alpha: 0.3 },
  { x: 136 / 256, y: 136 / 256, w: 80 / 256, h: 80 / 256, r: 20 / 256, color: [255, 77, 61], alpha: 1.0 },
];
const BG_RADIUS = 56 / 256;

// Normalized geometry from deck.html SVG brand mark (viewBox="0 0 22 22") for macOS template icon
const TEMPLATE_PADS = [
  { x: 1 / 22, y: 1 / 22, w: 9 / 22, h: 9 / 22, r: 2.5 / 22, alpha: 1.0 },
  { x: 12 / 22, y: 1 / 22, w: 9 / 22, h: 9 / 22, r: 2.5 / 22, alpha: 0.3 },
  { x: 1 / 22, y: 12 / 22, w: 9 / 22, h: 9 / 22, r: 2.5 / 22, alpha: 0.3 },
  { x: 12 / 22, y: 12 / 22, w: 9 / 22, h: 9 / 22, r: 2.5 / 22, alpha: 1.0 },
];

// Precompute CRC-32 table for PNG chunks
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

/** Signed distance to an axis-aligned rounded rectangle (negative = inside). */
function sdRoundedRect(px, py, rx, ry, rw, rh, radius) {
  const cx = rx + rw * 0.5;
  const cy = ry + rh * 0.5;
  const hw = rw * 0.5 - radius;
  const hh = rh * 0.5 - radius;
  const dx = Math.abs(px - cx) - hw;
  const dy = Math.abs(py - cy) - hh;
  const outside = Math.hypot(Math.max(dx, 0), Math.max(dy, 0));
  const inside = Math.min(Math.max(dx, dy), 0);
  return outside + inside - radius;
}

function covFromSdf(d, halfPixel) {
  if (d <= -halfPixel) return 1;
  if (d >= halfPixel) return 0;
  return 0.5 - d / (2 * halfPixel);
}

/** Render the full-color OpenDeck mark at size x size with NxN supersampling. */
function renderIconRgba(size, samplesPerAxis = 4) {
  const rgba = Buffer.alloc(size * size * 4);
  const invSize = 1 / size;
  const invSamples = 1 / samplesPerAxis;
  const totalSamples = samplesPerAxis * samplesPerAxis;
  const halfPixel = 0.5 * invSize;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let bgCovSum = 0;
      let rSum = 0;
      let gSum = 0;
      let bSum = 0;

      for (let sy = 0; sy < samplesPerAxis; sy++) {
        const ny = (y + (sy + 0.5) * invSamples) * invSize;
        for (let sx = 0; sx < samplesPerAxis; sx++) {
          const nx = (x + (sx + 0.5) * invSamples) * invSize;

          const bgCov = covFromSdf(sdRoundedRect(nx, ny, 0, 0, 1, 1, BG_RADIUS), halfPixel);
          if (bgCov <= 0) continue;

          bgCovSum += bgCov;
          let r = BG_COLOR[0];
          let g = BG_COLOR[1];
          let b = BG_COLOR[2];

          for (let p = 0; p < PADS.length; p++) {
            const pad = PADS[p];
            if (nx < pad.x - halfPixel || nx > pad.x + pad.w + halfPixel) continue;
            if (ny < pad.y - halfPixel || ny > pad.y + pad.h + halfPixel) continue;
            const padCov = covFromSdf(sdRoundedRect(nx, ny, pad.x, pad.y, pad.w, pad.h, pad.r), halfPixel);
            if (padCov > 0) {
              const a = pad.alpha * padCov;
              r += (pad.color[0] - r) * a;
              g += (pad.color[1] - g) * a;
              b += (pad.color[2] - b) * a;
            }
          }

          rSum += r * bgCov;
          gSum += g * bgCov;
          bSum += b * bgCov;
        }
      }

      if (bgCovSum > 0) {
        const idx = (y * size + x) * 4;
        rgba[idx] = Math.round(rSum / bgCovSum);
        rgba[idx + 1] = Math.round(gSum / bgCovSum);
        rgba[idx + 2] = Math.round(bSum / bgCovSum);
        rgba[idx + 3] = Math.round((bgCovSum / totalSamples) * 255);
      }
    }
  }
  return rgba;
}

/** Render the monochrome #000000 + alpha macOS template mark at size x size. */
function renderTemplateRgba(size, samplesPerAxis = 8) {
  const rgba = Buffer.alloc(size * size * 4);
  const invSize = 1 / size;
  const invSamples = 1 / samplesPerAxis;
  const totalSamples = samplesPerAxis * samplesPerAxis;
  const halfPixel = 0.5 * invSize;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let alphaSum = 0;

      for (let sy = 0; sy < samplesPerAxis; sy++) {
        const ny = (y + (sy + 0.5) * invSamples) * invSize;
        for (let sx = 0; sx < samplesPerAxis; sx++) {
          const nx = (x + (sx + 0.5) * invSamples) * invSize;
          for (let p = 0; p < TEMPLATE_PADS.length; p++) {
            const pad = TEMPLATE_PADS[p];
            if (nx < pad.x - halfPixel || nx > pad.x + pad.w + halfPixel) continue;
            if (ny < pad.y - halfPixel || ny > pad.y + pad.h + halfPixel) continue;
            const cov = covFromSdf(sdRoundedRect(nx, ny, pad.x, pad.y, pad.w, pad.h, pad.r), halfPixel);
            if (cov > 0) {
              alphaSum += pad.alpha * cov;
              break; // pads are disjoint
            }
          }
        }
      }

      if (alphaSum > 0) {
        const idx = (y * size + x) * 4;
        // RGB stays #000000 (0, 0, 0) for macOS template images; only alpha varies.
        rgba[idx + 3] = Math.min(255, Math.round((alphaSum / totalSamples) * 255));
      }
    }
  }
  return rgba;
}

function pngChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcInput = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([lenBuf, crcInput, crcBuf]);
}

function encodePng(width, height, rgba) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowOut = y * (stride + 1);
    raw[rowOut] = 0; // filter type 0 (None)
    rgba.copy(raw, rowOut + 1, y * stride, (y + 1) * stride);
  }
  const compressed = zlib.deflateSync(raw, { level: 9 });

  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function encodeIco(pngEntries) {
  const count = pngEntries.length;
  const headerSize = 6;
  const dirSize = 16 * count;
  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type 1 = ICO
  header.writeUInt16LE(count, 4);

  const dir = Buffer.alloc(dirSize);
  let offset = headerSize + dirSize;
  const payloads = [];

  for (let i = 0; i < count; i++) {
    const { size, png } = pngEntries[i];
    const base = i * 16;
    dir[base] = size >= 256 ? 0 : size;
    dir[base + 1] = size >= 256 ? 0 : size;
    dir[base + 2] = 0; // color count
    dir[base + 3] = 0; // reserved
    dir.writeUInt16LE(1, base + 4); // planes
    dir.writeUInt16LE(32, base + 6); // bits per pixel
    dir.writeUInt32LE(png.length, base + 8);
    dir.writeUInt32LE(offset, base + 12);
    offset += png.length;
    payloads.push(png);
  }

  return Buffer.concat([header, dir, ...payloads]);
}

function main() {
  fs.mkdirSync(ASSETS_DIR, { recursive: true });

  const icon1024 = encodePng(1024, 1024, renderIconRgba(1024, 3));
  const tray32 = encodePng(32, 32, renderIconRgba(32, 8));
  const trayTemplate18 = encodePng(18, 18, renderTemplateRgba(18, 8));
  const trayTemplate36 = encodePng(36, 36, renderTemplateRgba(36, 8));

  const icoSizes = [16, 32, 48, 256];
  const icoEntries = icoSizes.map((size) => ({
    size,
    png: size === 32 ? tray32 : encodePng(size, size, renderIconRgba(size, size <= 48 ? 8 : 4)),
  }));
  const iconIco = encodeIco(icoEntries);

  const outputs = [
    ['icon.png', icon1024, '1024x1024 RGBA'],
    ['icon.ico', iconIco, `sizes ${icoSizes.join(',')}`],
    ['tray.png', tray32, '32x32 RGBA'],
    ['trayTemplate.png', trayTemplate18, '18x18 template RGBA'],
    ['trayTemplate@2x.png', trayTemplate36, '36x36 template RGBA'],
  ];

  for (const [name, buf, desc] of outputs) {
    const outPath = path.join(ASSETS_DIR, name);
    fs.writeFileSync(outPath, buf);
    console.log(`Generated electron/assets/${name} (${buf.length} bytes, ${desc})`);
  }
}

main();