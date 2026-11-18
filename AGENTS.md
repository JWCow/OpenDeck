# AGENTS.md — OBS Virtual Deck

Guidance for AI coding agents working in this repository.

## Overview

`obs-virtual-deck` (v2.0.0) is a **zero-backend, zero-build** virtual Stream Deck for OBS Studio (`obs-websocket` v5), designed for students to download and load directly via `file://` in an OBS Custom Browser Dock (Windows & macOS) or a browser.

## File Map

- `deck.html` — Single-page HTML shell (toolbar, collapsible `#conn-bar`, `#deck-bar` page tabs, dynamic `#grid`, status footer with `#version-badge`, `#pad-dlg`, `#deck-dlg`, `#panic-dlg`).
- `deck/deck.css` — Responsive dark theme using CSS grid `--cols` / `--rows` (`minmax(0, 1fr)`); `@media (max-width: 480px), (max-height: 440px)` keeps narrow OBS docks (`360×420`) usable without horizontal overflow.
- `deck/obs-ws.js` — `window.Deck` namespace (`Deck.VERSION = '2.0.0'`), `localStorage` persistence (`obs_virtual_deck_v2` with automatic lossless migration from `obs_virtual_deck_v1`), multi-deck management (`addDeck`, `duplicateDeck`, `renameDeck`, `deleteDeck`, `resizeDeck`), `normalizePad()` / `normalizeStep()` for all 17 types, hotkey normalization (`normalizeHotkey`, `hotkeyFromEvent`), pure-JS UTF-8 `sha256Base64()`, `obs-websocket` v5 handshake/RPC/events, and `syncObsState()`.
- `deck/actions.js` — `isPadActive()`, `execAction()`, `onPadClick()`, `autoOffMs` timed-toggle management (`activeAutoOffs`), `runMacro()` / `abortMacro()` (`activeMacros`), `getPadRuntime()`, `getActiveDeckTicks()`, `runPanic()`, and `handleKeyDown()`.
- `deck/ui.js` — Page tab bar & `#deck-dlg`, non-destructive grid rendering (`initGrid()` + `updateMacroTicks()`), drag-and-drop pad swap, dropdown-first Pad Editor (`makeObsSelect` with offline `✎` toggle & `(saved)` value preservation), hotkey recorder, `autoOffMs` controls, Panic Steps modal, and v1/v2 JSON export/import.
- `installers/Install-Windows.bat` & `installers/Install-Mac.command` — Student-safe 1-click setup helpers packaged at the root of release ZIPs (copy `obs-virtual-deck` to `Documents/obs-virtual-deck` and copy the exact `file:///.../deck.html` URL to clipboard).
- `scripts/build-release.mjs` — Zero-dependency Node.js release packager (`npm run build:release`) outputting `dist/obs-virtual-deck/`, `dist/obs-virtual-deck-v<version>.zip`, `dist/obs-virtual-deck-latest.zip`, and `dist/obs-virtual-deck.zip`.
- `.github/workflows/release.yml` — GitHub Actions workflow triggered on `v*` tags and `workflow_dispatch`; verifies tag/version parity, runs `npm test`, runs `npm run build:release`, and attaches ZIPs to GitHub Releases.
- `test-deck.mjs` — Core Playwright E2E test suite against `file:///.../deck.html`.
- `test-deck-edge.mjs` — Edge-case Playwright E2E suite (URL normalization, OBS groups, stale field cleanup, `delayMs=0`, live events, non-destructive ticks, PANIC error resilience, v1→v2 migration, grid resize preservation, `autoOffMs`, hotkeys, `360×420` overflow check).
- `test-deck-fake-obs.mjs` — Hermetic fake `obs-websocket` v5 server (`ws`) used by both E2E suites.

## Architectural Constraints (Do Not Break)

1. **Zero backend, zero build, `file://` compatible:**
   - Do **not** switch `<script defer src="deck/...">` to `<script type="module">` — Chromium/OBS CEF blocks ES module imports over `file://` due to CORS.
   - Keep `sha256Base64` in `deck/obs-ws.js` pure JS — `crypto.subtle` is unavailable on `file://` and non-HTTPS LAN origins.
   - Keep the script load order in `deck.html`: `obs-ws.js` → `actions.js` → `ui.js` (each attaches to `window.Deck`).
2. **XSS safety:**
   - Escape every OBS-provided name (`sceneName`, `sourceName`, `filterName`, `inputName`, `profileName`, `collectionName`, `transitionName`) and user-provided `label`/`icon`/`hotkey` with `Deck.esc()` before injecting into `innerHTML`.
3. **Non-destructive macro & auto-off ticks:**
   - `Deck.updateMacroTicks()` updates `.sub` text in place every 200ms rather than calling `Deck.renderGrid()`, and `initGrid()` only rebuilds DOM slots when `cols * rows` changes. Rebuilding pad DOM during a macro or auto-off countdown breaks click targets and resets animations.
4. **Auth failure handling:**
   - WebSocket close code `4009` must set status `Auth Failed`, open `#conn-bar`, and **must not** schedule auto-reconnect.
5. **Password protection:**
   - JSON export (`Deck.exportConfig()` / `#btn-export`) must omit `cfg.ws.password`. Never serialize credentials into exported layouts.
6. **Pad normalization, v1→v2 migration & stale field cleanup:**
   - `Deck.normalizePad()` must strip fields belonging to previous action types when a pad's `type` changes, sanitize `autoOffMs` and `hotkey`, and preserve macro `wait` steps with `delayMs: 0`.
   - `obs_virtual_deck_v1` in `localStorage` and v1 exported JSON layouts must continue to migrate losslessly into v2 `decks[0]` via `Deck.migrateConfig()`.
7. **OBS Groups & optional sync resilience:**
   - OBS groups behave like nested scenes via `GetGroupSceneItemList` (not `GetSceneItemList`) and also support filters via `GetSourceFilterList`.
   - `syncObsState()` must treat newer OBS v5 state calls (Studio Mode, outputs, profiles, collections, transitions, volumes, media states) as optional/safe so older OBS builds or partial mocks still sync cleanly.
8. **Timer & Hotkey safety:**
   - Timer keys in `activeMacros` and `activeAutoOffs` are scoped by `${deckId}:${idx}`. Switching, resizing, or deleting decks must clean up affected timers, and `PANIC` must abort all running timers across all decks.
   - `Deck.handleKeyDown()` must ignore `ev.repeat`, `Deck.editMode`, open `<dialog>` elements, and editable targets (`INPUT`, `TEXTAREA`, `SELECT`, `contentEditable`).
9. **Narrow OBS Dock responsiveness:**
   - Any layout or CSS change must preserve zero horizontal overflow at `360×420` even with multiple page tabs and large grids (`12×10`).

## Adding a New Pad Action Type

Keep action definitions consistent across all three runtime files:
1. `deck/obs-ws.js` — allow the new `type` and sanitize its fields in `normalizePad()` (and `normalizeStep()` if step-compatible).
2. `deck/actions.js` — handle active LED state in `isPadActive()` and execution in `execAction()`.
3. `deck/ui.js` — add its 3-letter badge in `TAGS`, default text in `padFallbackLabel()`, editor inputs in `renderActionFields()`, and (if macro/panic-compatible) `renderStepList()`, plus an `<option>` in `deck.html`.

## Versioning & Release Packaging

- Keep `Deck.VERSION` in `deck/obs-ws.js`, `#version-badge` fallback in `deck.html`, and `version` in `package.json` synchronized.
- `npm run build:release` generates clean student ZIPs (`dist/obs-virtual-deck-v<version>.zip`, `dist/obs-virtual-deck-latest.zip`, `dist/obs-virtual-deck.zip`) containing only `deck.html`, `deck/*`, `README.md`, `Install-Windows.bat`, and `Install-Mac.command` (with UNIX `0755` executable mode in the ZIP) — never `node_modules`, `test-*`, or `.git`.
- `.github/workflows/release.yml` enforces tag/version matching on `v*` tags, runs `npm test`, runs `npm run build:release`, and publishes the ZIP assets to GitHub Releases.

## Verification

No live OBS instance is required. Run both hermetic Playwright E2E suites and verify the release build after any change:

```bash
npm test
npm run build:release
```

- Never weaken or skip existing test assertions.
- Add E2E assertions in `test-deck.mjs` or `test-deck-edge.mjs` (and fake server support in `test-deck-fake-obs.mjs` if needed) for any new action type, OBS event, or UI behavior.
