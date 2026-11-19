# AGENTS.md — OBS Virtual Deck

Guidance for AI coding agents working in this repository.

## Overview

`obs-virtual-deck` (v2.2.0) is a **zero-backend, zero-build** virtual Stream Deck for OBS Studio (`obs-websocket` v5), designed for live streamers, content creators, educators, and presenters to download and load directly via `file://` in an OBS Custom Browser Dock (macOS & Windows) or any browser.

Before changing terminology, onboarding, or connection behavior, read:
- `GLOSSARY.md` — Canonical domain vocabulary (`Deck`, `Page`, `Pad`, `Auto-Import`, `Auto-Off`, `Timed Macro`, `PANIC`, `Telemetry Pad`).
- `docs/adr/0001-read-only-auto-import.md` — Auto-Import must inspect OBS read-only without mutating OBS scenes or filters.
- `docs/adr/0002-port-discovery-without-persisting-passwords.md` — Port auto-discovery (`?port=` and local probing) must never embed or persist plaintext OBS WebSocket passwords in URLs or disk files.
- `docs/adr/0003-single-deck-with-pages.md` — Single exportable `Deck` containing switchable `Pages`.

## File Map

- `deck.html` — Single-page HTML shell (toolbar with `#btn-auto-import`, collapsible `#conn-bar`, `#deck-bar` Page tabs, dynamic `#grid`, right-hand Command Palette `#cmd-palette` with live search and categorized accordions, Edit Selection Bar `#edit-sel-bar` for multi-select, status footer with `#version-badge`, `#pad-dlg` with Duplicate button, `#deck-dlg`, `#import-wiz-dlg`, `#panic-dlg`).
- `deck/deck.css` — Responsive dark theme using CSS grid `--cols` / `--rows`, container queries (`container-type: size`) with proportional typography scaling (`clamp()` / `cqmin`), command palette drawer styling (`#cmd-palette`), multi-selection styles (`.selected`), context subtitles (`.ctx`), red scene pad accents (`#991b1b`), minimum Pad sizing (`minmax(54px, 1fr)`), and internal `.grid` scrolling keeping narrow OBS docks (`360×420`) free of horizontal overflow.
- `deck/obs-ws.js` — `window.Deck` namespace (`Deck.VERSION = '2.2.2'`), `localStorage` persistence (`opendeck_config`) with lossless migration from legacy keys (`obs_virtual_deck_v1` `pads[]`, `obs_virtual_deck_v2`, `obs_deck_config_v2`), visible save-failure warning in status area (`#save-warning`), Page management, batch pad helpers (`Deck.duplicatePad`, `Deck.duplicatePads`, `Deck.movePadsToPage`, `Deck.setPadColors`, `Deck.clearPads`), context subtitle helper (`Deck.getPadContextSubtitle`), red scene color default (`#991b1b`) in Auto-Import, `normalizePad()` / `normalizeStep()` for all 22 action types (+ `none`), stripping legacy local `hotkey` safely while keeping `TriggerHotkeyByName` OBS hotkey action (`hotkey`), pure-JS UTF-8 `sha256Base64()`, `?port=` query parsing + `PROBE_PORTS` (`4455, 4456, 4457, 4458, 4444`) fallback probing, read-only Auto-Import builders (`isStarterDeck`, `buildAutoImportPages`, `applyAutoImport`), `obs-websocket` v5 handshake/RPC/events, and `syncObsState()`.
- `deck/actions.js` — `isPadActive()`, `execAction()`, `onPadClick()`, `autoOffMs` timed-toggle management (`activeAutoOffs`), `runMacro()` / `abortMacro()` (`activeMacros`), `fetchStats()` / `startStatsPolling()` / `formatStatsText()` for Telemetry Pads, `getPadRuntime()`, `getActivePageTicks()`, `runPanic()`, and stubbed `handleKeyDown()` (local dock pad shortcuts removed; OBS hotkeys triggered via `hotkey` / `TriggerHotkeyByName`).
- `deck/ui-pages.js` — Page tab bar rendering (`renderPageBar`), cross-Page drag-and-drop onto `.page-tab`, and shared drag state (`getDragState`, `setDragState`, `clearDragHighlights`).
- `deck/ui-grid.js` — Non-destructive grid rendering (`initGrid`, `renderPad`, `renderGrid`), action tag badges (`TAGS`), fallback labels (`padFallbackLabel`), context subtitles (`.ctx`), drag-and-drop Pad swap & Command Palette drop handling, and in-place tick/stats updates (`updateMacroTicks`, `updateStatsPads`).
- `deck/ui-editor.js` — Dropdown-first Pad Editor (`openPadEditor`, `renderActionFields`, `renderStepList`), quick icon presets, Auto-Label synchronization, Pad Graphic 128×128 upload/fit/removal, modal Duplicate button, and `autoOffMs` controls.
- `deck/ui-palette.js` — Right-hand Command Palette (`renderPalette`, `isSelfContained`) with live search, categorized accordions, live OBS items, drag-and-drop onto pads, and Palette Splitter resizing (`initPaletteResizer`).
- `deck/ui-select.js` — Edit-Mode multi-select manager (`selectedPads: Set<number>`, `clearSelection`, `updateSelectionUi`, `handleSelectionClick`) and `#select-bar` batch actions (Duplicate, Move, Color, Clear, Select All).
- `deck/ui-dialogs.js` — Page & Grid Settings modal (`#deck-dlg`, `openPageDialog`), Auto-Import Wizard (`#import-wiz-dlg`, `openAutoImportWizard`, `onObsConnected`), and PANIC Reset Steps modal (`#panic-dlg`, `openPanicDialog`).
- `deck/snapshots.js` — Automatic IndexedDB layout backups (`Deck.createSnapshot`, `Deck.listSnapshots`, `Deck.restoreSnapshot`, debounced edit auto-saving, pruning to newest 20) and Snapshots dialog.
- `deck/ui-boot.js` — Font Scaler (`initFontScaler`), Dark/Light Theme toggle (`initTheme`), toolbar & WebSocket connection controls, v1/v2/v2.1/v2.2 JSON export/import, layout reset, and initial boot sequence.
- `installers/Install-Windows.bat` & `installers/Install-Mac.command` — Zero-dependency 1-click setup helpers packaged at the root of release ZIPs. They copy `obs-virtual-deck` to `Documents/obs-virtual-deck`, inspect local OBS `obs-websocket/config.json` read-only for `server_enabled` / `server_port` (appending `?port=<server_port>` when detected and reporting WebSocket status without ever reading or embedding `server_password`), and copy the `file:///.../deck.html` URL to clipboard.
- `scripts/lan-helper.mjs` — Zero-dependency HTTP static file server helper for Phone Deck control on the LAN.
- `scripts/build-release.mjs` — Zero-dependency Node.js release packager (`npm run build:release`) outputting `dist/obs-virtual-deck/` (the folder inside the ZIP keeps this name), `dist/opendeck-v<version>.zip`, `dist/opendeck-latest.zip`, and `dist/opendeck.zip`. The old `obs-virtual-deck-*.zip` names were retired in v2.2.2.
- `.github/workflows/release.yml` — GitHub Actions workflow triggered on `v*` tags and `workflow_dispatch`; verifies tag/version parity, runs `npm test`, runs `npm run build:release`, and attaches ZIPs to GitHub Releases.
- `test-deck.mjs`, `test-deck-edge.mjs`, `test-deck-fake-obs.mjs` — Hermetic Playwright E2E test suites and fake `obs-websocket` v5 server (`ws`).

## Architectural Constraints (Do Not Break)

1. **Zero backend, zero build, `file://` compatible:**
   - Do **not** switch `<script defer src="deck/...">` to `<script type="module">` — Chromium/OBS CEF blocks ES module imports over `file://` due to CORS.
   - Keep `sha256Base64` in `deck/obs-ws.js` pure JS — `crypto.subtle` is unavailable on `file://` and non-HTTPS LAN origins.
   - Keep the script load order in `deck.html`: `obs-ws.js` → `actions.js` → `ui-pages.js` → `ui-grid.js` → `ui-editor.js` → `ui-palette.js` → `ui-select.js` → `ui-dialogs.js` → `snapshots.js` → `ui-boot.js` (each attaches to `window.Deck`).
2. **XSS safety:**
   - Escape every OBS-provided name (`sceneName`, `sourceName`, `filterName`, `inputName`, `hotkeyName`, `profileName`, `collectionName`, `transitionName`) and user-provided `label`/`icon`/`hotkey`/`chapterName`/`filePath` with `Deck.esc()` before injecting into `innerHTML`.
3. **Non-destructive ticks & stats updates:**
   - `Deck.updateMacroTicks()` and `Deck.updateStatsPads()` update `.sub` text in place rather than calling `Deck.renderGrid()`, and `initGrid()` only rebuilds DOM slots when `cols * rows` changes. Rebuilding pad DOM during a macro or countdown breaks click targets and resets animations.
4. **Auth failure & Port Auto-Discovery hygiene (ADR-0002):**
   - WebSocket close code `4009` must set status `Auth Failed`, open `#conn-bar`, and **must not** schedule auto-reconnect or continue port probing.
   - `?port=` URL discovery and `Install-Windows.bat` / `Install-Mac.command` must **never** read, log, write to disk, or embed `server_password` in URLs.
   - JSON export (`Deck.exportConfig()` / `#btn-export`) must omit `cfg.ws.password` (and `manualPort`).
5. **Read-Only Auto-Import (ADR-0001):**
   - `buildAutoImportPages()` / Auto-Import Wizard must only read `Deck.obs` state and create Deck Pages/Pads—never send `CreateInput`, `CreateScene`, or `CreateSourceFilter` mutations to OBS.
6. **Pad normalization, v1 & v2.0.0/v2.1.0→v2.2.0 migration, & stale field cleanup:**
   - `Deck.normalizePad()` must strip fields belonging to previous action types when a pad's `type` changes, sanitize `autoOffMs`, safely strip legacy local `hotkey` properties without error, and preserve macro `wait` steps with `delayMs: 0`.
   - `Deck.migrateConfig()` must continue to migrate v1 (`pads[]`), v2.0.0 (`decks[]` / `activeDeckId` / `deckId`), and v2.1.0 layouts losslessly into v2.2.0 (`pages[]` / `activePageId` / `pageId`).
7. **OBS Groups & optional sync resilience:**
   - OBS groups behave like nested scenes via `GetGroupSceneItemList` (not `GetSceneItemList`) and support filters via `GetSourceFilterList` and transforms via `GetSceneItemTransform` / `SetSceneItemTransform`.
   - `syncObsState()` must treat optional OBS v5 state calls (`GetStudioModeEnabled`, `GetStats`, `GetVideoSettings`, `GetHotkeyList`, `GetInputAudioMonitorType`, outputs, profiles, collections, transitions, volumes, media states) as safe/catchable so older OBS builds or partial mocks still sync cleanly.
8. **Timer & Hotkey safety:**
   - Timer keys in `activeMacros` and `activeAutoOffs` are scoped by `${pageId}:${idx}`. Switching, resizing, moving pads across Pages, or deleting Pages must clean up affected timers, and `PANIC` must abort all running timers across all Pages.
   - Local dock pad shortcuts are removed; OBS hotkeys are executed through OBS Studio's `TriggerHotkeyByName` API via the `KEY` action.
9. **Narrow OBS Dock responsiveness:**
   - Preserve zero horizontal overflow (`scrollWidth <= clientWidth` on `documentElement`) at `360×420` across all grid sizes up to `12×10` while keeping Pads comfortably clickable (`>= 44px`–`54px`).

## Adding or Modifying a Pad Action Type

Current `v2.2.0` action types (`22` + `none`):
`none`, `scene` (`named` / `next` / `prev`), `source`, `filter`, `mute`, `volume`, `monitor`, `studio`, `output`, `media`, `image`, `browser`, `screenshot`, `transform`, `hotkey` (OBS Hotkey), `chapter`, `stats`, `profile`, `collection`, `transition`, `page`, `macro`, `panic`.

Keep action definitions consistent across all three runtime files:
1. `deck/obs-ws.js` — allow the `type` in `PAD_TYPES` and sanitize its fields in `normalizePad()` (and `normalizeStep()` if step-compatible).
2. `deck/actions.js` — handle active LED state in `isPadActive()` and execution in `execAction()`.
3. `deck/ui-grid.js` & `deck/ui-editor.js` — add its 3-letter badge in `TAGS` and default text in `padFallbackLabel()` (`deck/ui-grid.js`), editor inputs in `renderActionFields()` and (if macro/panic-compatible) `renderStepList()` (`deck/ui-editor.js`), plus an `<option>` in `deck.html`.

## Versioning & Release Packaging

- Keep `Deck.VERSION` in `deck/obs-ws.js`, `#version-badge` fallback in `deck.html`, and `version` in `package.json` synchronized.
- `npm run build:release` generates clean user ZIPs (`dist/obs-virtual-deck-v<version>.zip`, `dist/obs-virtual-deck-latest.zip`, `dist/obs-virtual-deck.zip`) containing only `deck.html`, `deck/*`, `scripts/lan-helper.mjs`, `README.md`, `Install-Windows.bat`, and `Install-Mac.command` (with UNIX `0755` executable mode in the ZIP) — never `node_modules`, `test-*`, or `.git`.
- `.github/workflows/release.yml` enforces tag/version matching on `v*` tags, runs `npm test`, runs `npm run build:release`, and publishes the ZIP assets to GitHub Releases.

## Verification

No live OBS instance is required. Run both hermetic Playwright E2E suites and verify the release build after any change:

```bash
npm test
npm run build:release
```

- Never weaken or skip existing test assertions.
- Add E2E assertions in `test-deck.mjs` or `test-deck-edge.mjs` (and fake server support in `test-deck-fake-obs.mjs` if needed) for any new action type, OBS event, installer behavior, or UI feature.

## Agent skills

### Issue tracker

Issues live in GitHub Issues for `JWCow/obs-virtual-deck` (via `gh`). See `docs/agents/issue-tracker.md`.

### Triage labels

Default canonical labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: root `GLOSSARY.md` + `docs/adr/`. See `docs/agents/domain.md`.
