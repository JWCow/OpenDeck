#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SEMVER_RE = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;

function detectEol(text) {
  return text.includes('\r\n') ? '\r\n' : '\n';
}

function serializeJsonLike(rawText, obj) {
  const eol = detectEol(rawText);
  const trailingNewline = rawText.endsWith('\n') ? eol : '';
  return JSON.stringify(obj, null, 2).replace(/\n/g, eol) + trailingNewline;
}

function writeIfChanged(filePath, nextContent, dryRun) {
  const prev = fs.readFileSync(filePath, 'utf8');
  if (prev === nextContent) return false;
  if (!dryRun) {
    fs.writeFileSync(filePath, nextContent, 'utf8');
  }
  return true;
}

export function bumpVersion(nextVersion, { dryRun = false, rootDir } = {}) {
  if (!SEMVER_RE.test(String(nextVersion || ''))) {
    throw new Error(`Invalid semver "${nextVersion}". Expected X.Y.Z or X.Y.Z-prerelease.`);
  }

  const ROOT = path.resolve(rootDir || path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
  const updated = [];

  // 1. package.json
  const pkgPath = path.join(ROOT, 'package.json');
  const pkgRaw = fs.readFileSync(pkgPath, 'utf8');
  const pkgObj = JSON.parse(pkgRaw);
  pkgObj.version = nextVersion;
  if (writeIfChanged(pkgPath, serializeJsonLike(pkgRaw, pkgObj), dryRun)) {
    updated.push('package.json');
  }

  // 2. package-lock.json
  const lockPath = path.join(ROOT, 'package-lock.json');
  if (fs.existsSync(lockPath)) {
    const lockRaw = fs.readFileSync(lockPath, 'utf8');
    const lockObj = JSON.parse(lockRaw);
    lockObj.version = nextVersion;
    if (lockObj.packages && typeof lockObj.packages[''] === 'object') {
      lockObj.packages[''].version = nextVersion;
    }
    if (writeIfChanged(lockPath, serializeJsonLike(lockRaw, lockObj), dryRun)) {
      updated.push('package-lock.json');
    }
  }

  // 3. electron/package.json
  const ePkgPath = path.join(ROOT, 'electron', 'package.json');
  if (fs.existsSync(ePkgPath)) {
    const ePkgRaw = fs.readFileSync(ePkgPath, 'utf8');
    const ePkgObj = JSON.parse(ePkgRaw);
    ePkgObj.version = nextVersion;
    if (writeIfChanged(ePkgPath, serializeJsonLike(ePkgRaw, ePkgObj), dryRun)) {
      updated.push('electron/package.json');
    }
  }

  // 4. electron/package-lock.json (only root, packages[''], and packages['..'] — never touch deps)
  const eLockPath = path.join(ROOT, 'electron', 'package-lock.json');
  if (fs.existsSync(eLockPath)) {
    const eLockRaw = fs.readFileSync(eLockPath, 'utf8');
    const eLockObj = JSON.parse(eLockRaw);
    eLockObj.version = nextVersion;
    if (eLockObj.packages && typeof eLockObj.packages[''] === 'object') {
      eLockObj.packages[''].version = nextVersion;
    }
    if (eLockObj.packages && typeof eLockObj.packages['..'] === 'object') {
      eLockObj.packages['..'].version = nextVersion;
    }
    if (writeIfChanged(eLockPath, serializeJsonLike(eLockRaw, eLockObj), dryRun)) {
      updated.push('electron/package-lock.json');
    }
  }

  // 5. deck/obs-ws.js
  const obsWsPath = path.join(ROOT, 'deck', 'obs-ws.js');
  const obsWsRaw = fs.readFileSync(obsWsPath, 'utf8');
  const obsWsRe = /(const\s+VERSION\s*=\s*')([^']+)(';)/;
  if (!obsWsRe.test(obsWsRaw)) {
    throw new Error('Could not locate VERSION constant in deck/obs-ws.js');
  }
  const obsWsNext = obsWsRaw.replace(obsWsRe, `$1${nextVersion}$3`);
  if (writeIfChanged(obsWsPath, obsWsNext, dryRun)) {
    updated.push('deck/obs-ws.js');
  }

  // 6. deck.html
  const htmlPath = path.join(ROOT, 'deck.html');
  const htmlRaw = fs.readFileSync(htmlPath, 'utf8');
  const badgeRe = /(id="version-badge"[^>]*>v)([^<]+)(<)/;
  if (!badgeRe.test(htmlRaw)) {
    throw new Error('Could not locate #version-badge in deck.html');
  }
  const htmlNext = htmlRaw.replace(badgeRe, `$1${nextVersion}$3`);
  if (writeIfChanged(htmlPath, htmlNext, dryRun)) {
    updated.push('deck.html');
  }

  return { version: nextVersion, dryRun, updated };
}

function parseCliArgs(argv) {
  let version = '';
  let dryRun = false;
  for (const arg of argv) {
    if (arg === '--dry-run' || arg === '-n') dryRun = true;
    else if (!arg.startsWith('-') && !version) version = arg;
  }
  return { version, dryRun };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  const { version, dryRun } = parseCliArgs(process.argv.slice(2));
  if (!version) {
    console.error('Usage: node scripts/bump-version.mjs <semver> [--dry-run]');
    process.exit(1);
  }
  try {
    const res = bumpVersion(version, { dryRun });
    const prefix = res.dryRun ? '[dry-run] ' : '';
    if (res.updated.length) {
      console.log(`${prefix}Updated version to ${res.version} in: ${res.updated.join(', ')}`);
    } else {
      console.log(`${prefix}All version fields already at ${res.version}.`);
    }
  } catch (err) {
    console.error(`ERROR: ${err.message}`);
    process.exit(1);
  }
}
