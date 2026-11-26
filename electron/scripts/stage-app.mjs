#!/usr/bin/env node
/**
 * Stage the canonical OpenDeck web app files into electron/.staged-app/
 * for electron-builder packaging (mirroring scripts/build-release.mjs's
 * canonical deck.html + deck/ files, excluding untracked skin-*.css,
 * node_modules, and dist).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ELECTRON_DIR = path.resolve(__dirname, '..');
const ROOT_DIR = path.resolve(ELECTRON_DIR, '..');
const STAGE_DIR = path.join(ELECTRON_DIR, '.staged-app');

const CANONICAL_FILES = [
  'deck.html',
  'deck/actions.js',
  'deck/deck.css',
  'deck/obs-ws.js',
  'deck/snapshots.js',
  'deck/ui-boot.js',
  'deck/ui-dialogs.js',
  'deck/ui-editor.js',
  'deck/ui-grid.js',
  'deck/ui-pages.js',
  'deck/ui-palette.js',
  'deck/ui-select.js',
];

function verifyHtmlRefsCovered(deckHtml, stagedSet) {
  const refMatches = deckHtml.matchAll(/(?:src|href)=["'](deck\/[^"']+)["']/g);
  for (const match of refMatches) {
    const ref = match[1];
    if (!stagedSet.has(ref)) {
      throw new Error(`deck.html references '${ref}' which is not in CANONICAL_FILES`);
    }
  }
}

function main() {
  for (const rel of CANONICAL_FILES) {
    const src = path.join(ROOT_DIR, rel);
    if (!fs.existsSync(src)) {
      throw new Error(`Missing required canonical app file: ${rel}`);
    }
  }

  const deckHtml = fs.readFileSync(path.join(ROOT_DIR, 'deck.html'), 'utf8');
  verifyHtmlRefsCovered(deckHtml, new Set(CANONICAL_FILES));

  fs.rmSync(STAGE_DIR, { recursive: true, force: true });
  fs.mkdirSync(STAGE_DIR, { recursive: true });

  for (const rel of CANONICAL_FILES) {
    const src = path.join(ROOT_DIR, rel);
    const dest = path.join(STAGE_DIR, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }

  console.log(`Staged ${CANONICAL_FILES.length} canonical app files into electron/.staged-app/:`);
  for (const rel of CANONICAL_FILES) {
    console.log(`  - ${rel}`);
  }
}

main();