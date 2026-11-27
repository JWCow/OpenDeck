#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function listFiles(dir, ext) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isFile() && d.name.endsWith(ext))
    .map((d) => path.join(dir, d.name))
    .sort();
}

function listOptionalFiles(dir, ext) {
  return fs.existsSync(dir) ? listFiles(dir, ext) : [];
}

function fail(msg) {
  console.error(`CHECK FAILED: ${msg}`);
  process.exit(1);
}

// 1. JS syntax checks (deck/*.js, scripts/*.mjs, test-*.mjs)
const jsFiles = [
  ...listFiles(path.join(ROOT, 'deck'), '.js'),
  ...listFiles(path.join(ROOT, 'scripts'), '.mjs'),
  ...listOptionalFiles(path.join(ROOT, 'electron'), '.cjs'),
  ...listOptionalFiles(path.join(ROOT, 'electron', 'scripts'), '.mjs'),
  ...fs
    .readdirSync(ROOT)
    .filter((n) => n.startsWith('test-') && n.endsWith('.mjs'))
    .sort()
    .map((n) => path.join(ROOT, n)),
];

for (const file of jsFiles) {
  execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
}

// 2. Version parity across package.json, deck/obs-ws.js, and deck.html
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const obsWsSrc = fs.readFileSync(path.join(ROOT, 'deck', 'obs-ws.js'), 'utf8');
const deckHtml = fs.readFileSync(path.join(ROOT, 'deck.html'), 'utf8');
const uiGridSrc = fs.readFileSync(path.join(ROOT, 'deck', 'ui-grid.js'), 'utf8');

const verMatch = obsWsSrc.match(/const\s+VERSION\s*=\s*'([^']+)'/);
if (!verMatch || verMatch[1] !== pkg.version) {
  fail(`VERSION mismatch: package.json=${pkg.version} vs deck/obs-ws.js=${verMatch?.[1]}`);
}
const badgeMatch = deckHtml.match(/id="version-badge"[^>]*>v([^<]+)</);
if (!badgeMatch || badgeMatch[1] !== pkg.version) {
  fail(`#version-badge mismatch: package.json=${pkg.version} vs deck.html=${badgeMatch?.[1]}`);
}
const electronPkgPath = path.join(ROOT, 'electron', 'package.json');
if (fs.existsSync(electronPkgPath)) {
  const electronPkg = JSON.parse(fs.readFileSync(electronPkgPath, 'utf8'));
  if (electronPkg.version !== pkg.version) {
    fail(`version mismatch: package.json=${pkg.version} vs electron/package.json=${electronPkg.version}`);
  }
}
const rootLockPath = path.join(ROOT, 'package-lock.json');
if (fs.existsSync(rootLockPath)) {
  const rootLock = JSON.parse(fs.readFileSync(rootLockPath, 'utf8'));
  if (rootLock.version !== pkg.version) {
    fail(`version mismatch: package.json=${pkg.version} vs package-lock.json=${rootLock.version}`);
  }
  if (rootLock.packages?.['']?.version !== pkg.version) {
    fail(`version mismatch: package.json=${pkg.version} vs package-lock.json packages[''].version=${rootLock.packages?.['']?.version}`);
  }
}
const electronLockPath = path.join(ROOT, 'electron', 'package-lock.json');
if (fs.existsSync(electronLockPath)) {
  const electronLock = JSON.parse(fs.readFileSync(electronLockPath, 'utf8'));
  if (electronLock.version !== pkg.version) {
    fail(`version mismatch: package.json=${pkg.version} vs electron/package-lock.json=${electronLock.version}`);
  }
  if (electronLock.packages?.['']?.version !== pkg.version) {
    fail(`version mismatch: package.json=${pkg.version} vs electron/package-lock.json packages[''].version=${electronLock.packages?.['']?.version}`);
  }
  if (electronLock.packages?.['..'] && electronLock.packages['..'].version !== pkg.version) {
    fail(`version mismatch: package.json=${pkg.version} vs electron/package-lock.json packages['..'].version=${electronLock.packages['..'].version}`);
  }
}

// 3. file:// compatibility checks
if (/<script[^>]+type\s*=\s*["']module["']/i.test(deckHtml)) {
  fail('deck.html must not use <script type="module"> (blocked by file:// CORS)');
}
for (const file of listFiles(path.join(ROOT, 'deck'), '.js')) {
  const src = fs.readFileSync(file, 'utf8');
  if (src.includes('crypto.subtle')) {
    fail(`${path.relative(ROOT, file)} must not use crypto.subtle (unavailable on file://)`);
  }
}

// 4. PAD_TYPES parity across deck/obs-ws.js, deck/ui-grid.js (TAGS), and deck.html (#f-type)
const padTypesBlock = obsWsSrc.match(/const\s+PAD_TYPES\s*=\s*\[([\s\S]*?)\];/);
if (!padTypesBlock) fail('Could not locate PAD_TYPES in deck/obs-ws.js');
const padTypes = [...padTypesBlock[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);

const tagsBlock = uiGridSrc.match(/const\s+TAGS\s*=\s*\{([\s\S]*?)\};/);
if (!tagsBlock) fail('Could not locate TAGS in deck/ui-grid.js');
const tagKeys = new Set([...tagsBlock[1].matchAll(/^\s*([a-z]+)\s*:/gm)].map((m) => m[1]));

const selectBlock = deckHtml.match(/<select\s+id="f-type">([\s\S]*?)<\/select>/);
if (!selectBlock) fail('Could not locate <select id="f-type"> in deck.html');
const optionValues = new Set([...selectBlock[1].matchAll(/<option\s+value="([^"]+)"/g)].map((m) => m[1]));

for (const type of padTypes) {
  if (!optionValues.has(type)) {
    fail(`PAD_TYPES entry '${type}' is missing <option value="${type}"> in deck.html`);
  }
  if (type !== 'none' && !tagKeys.has(type)) {
    fail(`PAD_TYPES entry '${type}' is missing from TAGS in deck/ui-grid.js`);
  }
}
for (const opt of optionValues) {
  if (!padTypes.includes(opt)) {
    fail(`deck.html #f-type option '${opt}' is missing from PAD_TYPES in deck/obs-ws.js`);
  }
}

// 5. Zero orphan assets in deck/ and stage-app.mjs CANONICAL_FILES parity
const deckDir = path.join(ROOT, 'deck');
const deckFiles = [
  ...listFiles(deckDir, '.js'),
  ...listFiles(deckDir, '.css'),
]
  .map((f) => path.relative(ROOT, f).replace(/\\/g, '/'))
  .sort();

const htmlDeckRefs = new Set(
  [...deckHtml.matchAll(/(?:src|href)=["'](deck\/[^"']+)["']/g)].map((m) => m[1])
);
for (const rel of deckFiles) {
  if (!htmlDeckRefs.has(rel)) {
    fail(`Orphan asset '${rel}' in deck/ is not referenced in deck.html`);
  }
}
for (const ref of htmlDeckRefs) {
  if (!deckFiles.includes(ref)) {
    fail(`deck.html references missing deck asset '${ref}'`);
  }
}

const stageAppPath = path.join(ROOT, 'electron', 'scripts', 'stage-app.mjs');
if (fs.existsSync(stageAppPath)) {
  const stageSrc = fs.readFileSync(stageAppPath, 'utf8');
  const canonMatch = stageSrc.match(/const\s+CANONICAL_FILES\s*=\s*\[([\s\S]*?)\];/);
  if (!canonMatch) fail('Could not locate CANONICAL_FILES in electron/scripts/stage-app.mjs');
  const stagedFiles = [...canonMatch[1].matchAll(/['"]([^'"]+)['"]/g)].map((m) => m[1]).sort();
  const expectedCanonical = ['deck.html', ...deckFiles].sort();
  for (const rel of expectedCanonical) {
    if (!stagedFiles.includes(rel)) {
      fail(`electron/scripts/stage-app.mjs CANONICAL_FILES is missing '${rel}'`);
    }
  }
  for (const rel of stagedFiles) {
    if (!expectedCanonical.includes(rel)) {
      fail(`electron/scripts/stage-app.mjs CANONICAL_FILES has unexpected entry '${rel}'`);
    }
  }
}

// 6. ADR-0001 read-only Auto-Import check (buildAutoImportPages must not issue Create* requests)
function extractArrowFnBody(src, anchor) {
  const idx = src.indexOf(anchor);
  if (idx < 0) return null;
  const arrowIdx = src.indexOf('=>', idx);
  const openIdx = arrowIdx >= 0 ? src.indexOf('{', arrowIdx) : -1;
  if (openIdx < 0) return null;
  let depth = 0;
  let quote = '';
  let inLineComment = false;
  let inBlockComment = false;
  for (let i = openIdx; i < src.length; i++) {
    const ch = src[i];
    const next = src[i + 1];
    if (inLineComment) {
      if (ch === '\n') inLineComment = false;
      continue;
    }
    if (inBlockComment) {
      if (ch === '*' && next === '/') { inBlockComment = false; i++; }
      continue;
    }
    if (quote) {
      if (ch === '\\') { i++; continue; }
      if (ch === quote) quote = '';
      continue;
    }
    if (ch === '/' && next === '/') { inLineComment = true; i++; continue; }
    if (ch === '/' && next === '*') { inBlockComment = true; i++; continue; }
    if (ch === "'" || ch === '"' || ch === '`') { quote = ch; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return src.slice(openIdx, i + 1);
    }
  }
  return null;
}

const autoImportBody = extractArrowFnBody(obsWsSrc, 'Deck.buildAutoImportPages');
if (!autoImportBody) {
  fail('Could not locate Deck.buildAutoImportPages body in deck/obs-ws.js');
}
const createReqMatch = autoImportBody.match(/['"`]Create[A-Z][A-Za-z0-9_]*['"`]/);
if (createReqMatch) {
  fail(`ADR-0001 violation: Deck.buildAutoImportPages contains forbidden OBS mutation ${createReqMatch[0]}`);
}

// 7. Optional PowerShell syntax check when pwsh/powershell is installed
const psScript = path.join(ROOT, 'scripts', 'hotkey-bridge.ps1');
if (fs.existsSync(psScript)) {
  for (const shell of ['pwsh', 'powershell']) {
    try {
      execFileSync(
        shell,
        [
          '-NoProfile',
          '-Command',
          `$err=$null; [System.Management.Automation.Language.Parser]::ParseFile('${psScript.replace(/'/g, "''")}', [ref]$null, [ref]$err); if ($err.Count) { $err | ForEach-Object { Write-Error $_ }; exit 1 }`,
        ],
        { stdio: 'pipe' }
      );
      break;
    } catch (err) {
      if (err.code === 'ENOENT') continue;
      fail(`PowerShell syntax check failed for scripts/hotkey-bridge.ps1: ${err.stderr?.toString() || err.message}`);
    }
  }
}

console.log(`CHECK OK: ${jsFiles.length} JS/MJS/CJS files, ${padTypes.length} PAD_TYPES in sync, version ${pkg.version}, file:// safe.`);
