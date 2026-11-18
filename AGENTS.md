# AGENTS.md — OBS Virtual Deck (8×8)

Guidance for AI coding agents working in this repository.

## Overview

`obs-virtual-deck` is a **zero-backend, zero-build** 8×8 virtual Stream Deck for OBS Studio (`obs-websocket` v5), designed for students to download and load directly via `file://` in an OBS Custom Browser Dock (Windows & macOS) or a browser.

## File Map

- `deck.html` — Single-page HTML shell (toolbar, collapsible `#conn-bar`, `#grid`, status footer, `#pad-dlg`, `#panic-dlg`).
- `deck/deck.css` — Responsive dark theme; `@media (max-width: 480px), (max-height: 440px)` keeps narrow OBS docks (`360×420`) usable without horizontal overflow.
- `deck/obs-ws.js` — `window.Deck` namespace, `localStorage` persistence (`obs_virtual_deck_v1`), `normalizePad()`, pure-JS UTF-8 `sha256Base64()`, `obs-websocket` v5 handshake/RPC/events, and `syncObsState()`.
- `deck/actions.js` — `isPadActive()`, `execAction()`, `runMacro()` / `abortMacro()`, `runPanic()`, `onPadClick()`.
- `deck/ui.js` — 64-pad grid rendering, drag-and-drop pad swap, Pad Editor & Panic Steps modal, JSON export/import, and boot sequence.
- `test-deck.mjs` — Core Playwright E2E test suite against `file:///.../deck.html`.
- `test-deck-edge.mjs` — Edge-case Playwright E2E suite (URL normalization, OBS groups, stale field cleanup, `delayMs=0`, live events, non-destructive macro ticks, PANIC error resilience, `360×420` overflow check).
- `test-deck-fake-obs.mjs` — Hermetic fake `obs-websocket` v5 server (`ws`) used by both E2E suites.

## Architectural Constraints (Do Not Break)

1. **Zero backend, zero build, `file://` compatible:**
   - Do **not** switch `<script defer src="deck/...">` to `<script type="module">` — Chromium/OBS CEF blocks ES module imports over `file://` due to CORS.
   - Keep `sha256Base64` in `deck/obs-ws.js` pure JS — `crypto.subtle` is unavailable on `file://` and non-HTTPS LAN origins.
   - Keep the script load order in `deck.html`: `obs-ws.js` → `actions.js` → `ui.js` (each attaches to `window.Deck`).
2. **XSS safety:**
   - Escape every OBS-provided name (`sceneName`, `sourceName`, `filterName`, `inputName`) and user-provided `label`/`icon` with `Deck.esc()` before injecting into `innerHTML`.
3. **Non-destructive macro ticks:**
   - `Deck.updateMacroTicks()` updates `.sub` text in place every 200ms rather than calling `Deck.renderGrid()`. Rebuilding pad DOM during a macro breaks click targets and resets animations.
4. **Auth failure handling:**
   - WebSocket close code `4009` must set status `Auth Failed`, open `#conn-bar`, and **must not** schedule auto-reconnect.
5. **Password protection:**
   - JSON export (`#btn-export`) must omit `cfg.ws.password`. Never serialize credentials into exported layouts.
6. **Pad normalization & stale field cleanup:**
   - `Deck.normalizePad()` must strip fields belonging to previous action types when a pad's `type` changes, and macro `wait` steps must preserve `delayMs: 0`.
7. **OBS Groups:**
   - OBS groups behave like nested scenes via `GetGroupSceneItemList` (not `GetSceneItemList`) and also support filters via `GetSourceFilterList`. Preserve `obs.groups` tracking in `syncObsState()` and `execAction()`.
8. **Narrow OBS Dock responsiveness:**
   - Any layout or CSS change must preserve zero horizontal overflow at `360×420`.

## Adding a New Pad Action Type

Keep action definitions consistent across all three runtime files:
1. `deck/obs-ws.js` — allow the new `type` and sanitize its fields in `normalizePad()`.
2. `deck/actions.js` — handle active LED state in `isPadActive()` and execution in `execAction()`.
3. `deck/ui.js` — add its 3-letter badge in `TAGS`, default text in `padFallbackLabel()`, editor inputs in `renderActionFields()`, and (if macro/panic-compatible) `renderStepList()`.

## Verification

No live OBS instance is required. Run both hermetic Playwright E2E suites after any change:

```bash
npm test
```

(`node test-deck.mjs && node test-deck-edge.mjs`)

- Never weaken or skip existing test assertions.
- Add E2E assertions in `test-deck.mjs` or `test-deck-edge.mjs` (and fake server support in `test-deck-fake-obs.mjs` if needed) for any new action type, OBS event, or UI behavior.
