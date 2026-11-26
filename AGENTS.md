# AGENTS.md — OBS Virtual Deck

Guidance for AI coding agents working in this repository.

## Overview

`obs-virtual-deck` (OpenDeck) is a **zero-backend, zero-build** virtual Stream Deck for OBS Studio (`obs-websocket` v5) that loads directly via `file://` in an OBS Custom Browser Dock or browser.

Read before changing terminology, onboarding, connection, or review rules:
- `CODING_STANDARDS.md` — Review rules (XSS escaping, DOM tick safety, ADR compliance, narrow dock layout).
- `GLOSSARY.md` — Canonical domain vocabulary (`Deck`, `Page`, `Pad`, `Auto-Import`, `Auto-Off`, `Timed Macro`, `PANIC`, `Telemetry Pad`, `Phone Deck`).
- `docs/adr/0001-read-only-auto-import.md` — Auto-Import inspects OBS read-only (never sends `Create*` mutations).
- `docs/adr/0002-port-discovery-without-persisting-passwords.md` — `?port=` discovery and installers must never embed or persist passwords.
- `docs/adr/0003-single-deck-with-pages.md` — Single exportable `Deck` containing switchable `Pages`.

## Key Modules (`deck/`)

Script load order in `deck.html` (all plain IIFEs attaching to `window.Deck`, no ES modules):
`obs-ws.js` → `actions.js` → `ui-pages.js` → `ui-grid.js` → `ui-editor.js` → `ui-palette.js` → `ui-select.js` → `ui-dialogs.js` → `snapshots.js` → `ui-boot.js`.

- `installers/` (`Install-Windows.bat`, `Install-Mac.command`) — Copy deck to `Documents/obs-virtual-deck`, inspect OBS `obs-websocket/config.json` read-only for `server_port`, copy `file:///.../deck.html` URL.
- `scripts/lan-helper.mjs` & `Phone Helper.bat` — Zero-dep LAN server + QR for Phone Deck.
- `scripts/hotkey-bridge.ps1` & `Hotkey Bridge.bat` — Optional local Windows key-sequence bridge (`127.0.0.1:3905/hotkey`) for external apps via `http` pads.
- `scripts/check.mjs` — Static syntax, version parity, `file://` safety, and `PAD_TYPES` sync checks.
- `scripts/build-release.mjs` — Stages `dist/obs-virtual-deck/` and builds `dist/opendeck-*.zip`.
- `electron/` — Isolated Electron desktop wrapper (`electron/package.json`, `main.cjs`, `preload.cjs`, `obs-discovery.cjs`, `window-state.cjs`, `scripts/stage-app.mjs`) serving `deck.html` from the `app://opendeck/` origin with ADR-0002 read-only port discovery and `electron-builder` packaging.

## Non-Obvious Constraints

1. **`file://`, `app://opendeck/` & LAN safety:** Never use `<script type="module">` (CORS blocked on `file://`) or `crypto.subtle` (unavailable on `file://` and non-HTTPS LAN origins; keep pure-JS `sha256Base64` in `deck/obs-ws.js`). Keep `electron/package.json` isolated from root `devDependencies` so root `npm ci` and `dist/opendeck.zip` stay lean; the desktop app serves `deck.html` over the stable `app://opendeck/` custom protocol origin.
2. **Backwards-compatible migration:** `Deck.migrateConfig()` must losslessly migrate v1 (`pads[]`), v2.0.0 (`decks[]`/`deckId`), and v2.1.0 layouts into v2.2.x (`pages[]`/`pageId`). `Deck.mergePages()` appends imported pages onto the active Deck with deduplicated IDs.
3. **OBS Groups & partial OBSws builds:** OBS groups use `GetGroupSceneItemList` (not `GetSceneItemList`) and support filters/transforms. `syncObsState()` must catch optional calls (`GetStats`, `GetHotkeyList`, `GetVideoSettings`, outputs, profiles, collections, transitions, volumes, media states).
4. **Hotkeys & timers:** Local dock shortcuts are removed; OBS hotkeys execute via `TriggerHotkeyByName` (`mode: 'name'`) or `TriggerHotkeyByKeySequence` (`mode: 'keys'`). Macro/auto-off timers use `${pageId}:${idx}` keys and must clean up on switch, resize, delete, re-click, or `PANIC` (including `macro.cleanupOnAbort` trailing off-steps).

## Verification

Run static checks, hermetic Playwright E2E suites (no live OBS required; `isolateBrowserFromLiveObs` blocks `PROBE_PORTS`), and release packaging:

```bash
npm run check
npm test                 # or: node test-deck-edge.mjs --section=18
npm run build:release
npm run desktop          # Launch Electron desktop app (after npm --prefix electron install)
npm run build:desktop    # Package desktop installers into electron/dist/
```

## Issue Tracker & Triage

- Issues live on GitHub for `JWCow/obs-virtual-deck` (`gh`); see `docs/agents/issue-tracker.md` and `docs/agents/triage-labels.md`.
- Domain doc index: `docs/agents/domain.md`.
