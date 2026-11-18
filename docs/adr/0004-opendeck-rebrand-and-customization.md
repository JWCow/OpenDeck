# 4. OpenDeck Rebrand, Client-Side Graphics, and Adaptive Surface

Date: 2026-11-18

## Status

Accepted

## Context

The software has grown from a simple OBS deck into a feature-rich, multi-page broadcast surface. In v2.2.1:
1. The project requires a distinctive, professional open-source name: **OpenDeck**.
2. Streamers on high-resolution displays need readable typography (+4pt), while users on compact laptop screens need density.
3. Complex OBS scene collections produce long item names that truncate in fixed-width sidebars.
4. Creators want custom button graphics (Stream Deck icon packs), but OpenDeck operates with zero backend over `file://` where localStorage is bounded to ~5MB.

## Decision

1. **Rebrand to OpenDeck**: Update title, headers, and docs to "OpenDeck", maintaining full lossless backward compatibility with previous `obs_deck_config_v2` storage keys.
2. **Client-Side Canvas Downsampling**: Custom uploaded images are resized and cropped client-side using an in-memory 128×128 `<canvas>` into a WebP/PNG data URL (~6–12 KB), stored directly in `pad.image`. This preserves zero-backend portability, enables JSON export/import of entire icon packs, and prevents quota exhaustion.
3. **Stepped Root Font Scaling**: Provide a top-bar `A-` / `A+` control that toggles `document.documentElement.dataset.fontSize` across 5 discrete levels (`sm` to `xxl`), scaling all elements proportionally without CSS layout breakage.
4. **Palette Splitter**: Implement a left-edge drag divider on `#palette` clamped between 260px and 550px with double-click reset to 320px and localStorage persistence.

## Consequences

- OpenDeck remains 100% portable with zero runtime build tools, dependencies, or server processes.
- Decks containing custom graphics can be exported and shared as single JSON files.
- Streamers can adapt the surface to any dock or monitor size seamlessly.
