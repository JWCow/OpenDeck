// Builds the Claude desktop-app (artifact) version of the deck into dist/artifact/.
// Publish dist/artifact/ as the artifact's files (index.html + deck/*).
// The page runs in Claude's installed-app window: WebSocket is swapped for a
// PowerShell bridge (needs "full-access") and downloads are saved to ~/Downloads.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.dirname(here);
const out = path.join(repo, 'dist', 'artifact');

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'deck'), { recursive: true });
for (const f of fs.readdirSync(path.join(repo, 'deck'))) {
  if (/\.(js|css)$/.test(f) && !f.startsWith('skin-')) fs.copyFileSync(path.join(repo, 'deck', f), path.join(out, 'deck', f));
}

const ps1 = fs.readFileSync(path.join(here, 'bridge.ps1'), 'utf8');
const shim = fs.readFileSync(path.join(here, 'desktop-shim.js'), 'utf8');
fs.writeFileSync(path.join(out, 'deck', 'desktop-app.js'), 'var BRIDGE_PS1 = ' + JSON.stringify(ps1) + ';\n' + shim);

let html = fs.readFileSync(path.join(repo, 'deck.html'), 'utf8');
const title = /<title>[^<]*<\/title>/;
const obsWs = '<script defer src="deck/obs-ws.js"></script>';
if (!title.test(html) || !html.includes(obsWs)) throw new Error('deck.html markers missing');
html = html
  .replace(title, '<title>OpenDeck</title>\n<script type="application/json" id="claude-artifacts-manifest">{"permissions": ["full-access"]}</script>')
  .replace(obsWs, '<script defer src="deck/desktop-app.js"></script>\n' + obsWs);
fs.writeFileSync(path.join(out, 'index.html'), html);
console.log('Built ' + out);
