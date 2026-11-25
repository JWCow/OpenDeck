# Coding Standards — OBS Virtual Deck

Judgement rules for code reviews in this repository (mechanical syntax, version parity, `file://` module checks, and `PAD_TYPES` sync are enforced by `npm run check`).

## Security & Privacy
- **Escape every dynamic string in HTML.** All OBS-provided names (`sceneName`, `sourceName`, `filterName`, `inputName`, `hotkeyName`, `profileName`, `collectionName`, `transitionName`) and user-provided fields (`label`, `icon`, `hotkey`, `chapterName`, `filePath`, `url`) must pass through `Deck.esc()` before injecting into `innerHTML`.
- **Validate URLs for `http` actions.** Only allow `http:` and `https:` schemes in `normalizePad()` / `normalizeStep()` and `execAction()`; reject `javascript:`, `file:`, and `data:`.
- **Respect ADR-0001 and ADR-0002.** Auto-Import must remain read-only toward OBS (`Create*` requests forbidden). Passwords must never be logged, written into URLs, or included in exported JSON layouts.

## Architecture & DOM Behavior
- **Stay zero-backend and `file://` compatible.** Attach modules to `window.Deck` as plain IIFEs in the `deck.html` script order; never rely on ES modules or Web Crypto (`crypto.subtle`).
- **Keep tick and telemetry updates non-destructive.** `updateMacroTicks()` and `updateStatsPads()` must update `.sub` text in place rather than rebuilding `#grid`, and `initGrid()` should rebuild slots only when `cols * rows` changes.
- **Clean up stale fields and scoped timers.** `normalizePad()` must drop fields belonging to previous action types when `type` changes, preserve macro `wait` steps with `delayMs: 0`, and scope timers by `${pageId}:${idx}` so Page switches, resizes, deletions, and `PANIC` leave no orphan timers.
- **Keep narrow docks usable.** Changes to layout or pad styling must preserve `scrollWidth <= clientWidth` at `360×420` across grids up to `12×12` while keeping pads tappable (`>= 44px`).

## Verification
- Run `npm run check`, `npm test`, and `npm run build:release` before finishing a change, and never weaken or skip existing assertions.
- Enable the local pre-commit hook with `git config core.hooksPath .githooks`.
