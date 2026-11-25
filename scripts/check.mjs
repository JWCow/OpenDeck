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

function fail(msg) {
  console.error(`CHECK FAILED: ${msg}`);
  process.exit(1);
}

// 1. JS syntax checks (deck/*.js, scripts/*.mjs, test-*.mjs)
const jsFiles = [
  ...listFiles(path.join(ROOT, 'deck'), '.js'),
  ...listFiles(path.join(ROOT, 'scripts'), '.mjs'),
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

// 5. Optional PowerShell syntax check when pwsh/powershell is installed
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

console.log(`CHECK OK: ${jsFiles.length} JS/MJS files, ${padTypes.length} PAD_TYPES in sync, version ${pkg.version}, file:// safe.`);
