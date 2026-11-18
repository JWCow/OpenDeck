# OBS Virtual Deck

[![Latest Release](https://img.shields.io/github/v/release/JWCow/obs-virtual-deck?label=Latest%20Release&color=2563eb)](https://github.com/JWCow/obs-virtual-deck/releases/latest)
[![Download ZIP](https://img.shields.io/badge/Download-obs--virtual--deck.zip-16a34a?logo=github)](https://github.com/JWCow/obs-virtual-deck/releases/latest/download/obs-virtual-deck.zip)
[![Version](https://img.shields.io/badge/Version-v2.1.0-7c3aed)](https://github.com/JWCow/obs-virtual-deck/releases)
[![Platforms](https://img.shields.io/badge/Platforms-macOS%20%26%20Windows-334155)](#quick-start-macos--windows)
[![Zero Backend](https://img.shields.io/badge/Architecture-Zero%20Backend%20(file%3A%2F%2F)-0f766e)](#project-structure)

An open-source, zero-backend **virtual Stream Deck** for **OBS Studio** (`obs-websocket` v5), built for **live streamers, content creators, educators, and presenters** on **macOS and Windows**.

Download the ZIP, load `deck.html` into an **OBS Custom Browser Dock** (or any modern browser), and control scenes, sources, PiP transforms, audio monitoring, filters, media, images, recording chapters, live telemetry, timed toggles, and macros—with **no Node.js, no Python, no OBS plugins, and no build step required**.

---

## Download Latest Version (ZIP)

**[⬇️ Download obs-virtual-deck.zip (Latest Release)](https://github.com/JWCow/obs-virtual-deck/releases/latest/download/obs-virtual-deck.zip)**

- Always downloads the newest release ZIP in one click (no `node_modules` or test files included).
- Browse all versions, changelogs, and release assets on the **[Releases page](https://github.com/JWCow/obs-virtual-deck/releases)**.

> **Upgrading from v1 or v2.0.0?** Your existing layout, pages, pads, and PANIC steps migrate **automatically and losslessly** to v2.1.0 the first time you open the updated `deck.html` at the same `file://` path. *(Tip: click **Export** first if you want a backup `.json` file.)*

---

## Features & OBS Actions

### Workflow & Usability
- **🪄 Read-Only Auto-Import Wizard:** On first connect (or anytime via **`🪄 Auto-Import`**), inspect your live OBS Studio scene collection and generate ready-to-use **Pages** for *Scenes*, *Sources & Overlays*, *Filters*, and *Audio, Broadcast & Telemetry*—strictly read-only, without mutating your OBS scenes.
- **📄 Single Deck with Multiple Pages:** Organize Pads across switchable Page tabs (`+ Page` add, `⎘` duplicate, `8×8 ⚙` rename/resize/delete) plus a **Switch Page (`PAG`)** Pad action.
- **📐 Custom Grid Sizes & Readable Narrow Docks:** Choose quick presets (`3×2`, `4×3`, `5×3`, `6×4`, `8×4`, `8×8`) or any custom grid from `2×2` up to `12×10`. Resizing preserves existing Pads in place, and minimum Pad dimensions keep buttons comfortably clickable inside narrow OBS docks (`360×420`+).
- **🧲 Drag-to-Rearrange & Cross-Page Moves:** In **`✎ Edit`** mode, drag any Pad onto another slot to swap, or drag it onto a **Page tab** to move it to that Page.
- **⏱️ Auto-Off Timed Toggles:** Add an optional **Auto-off after (sec)** timer (`3s`, `5s`, `10s`, `30s`, or custom) to toggleable actions (`Source`, `Filter`, `Mute`, `Studio Mode`, `Stream/Record/Cam`, `Media`). Clicking turns it ON with a live countdown, then automatically turns it OFF; clicking again cancels early.
- **⌨️ Keyboard Shortcuts:** Bind any key or shortcut combo (e.g., `F1`, `1`, `Ctrl+Shift+1`, `Alt+M`) to any Pad. Shortcuts work globally in the dock and pause automatically while typing in inputs or dialogs.
- **🔌 Port Auto-Discovery (Credential-Safe):** The Windows and macOS setup helpers inspect your local OBS `obs-websocket` config for `server_enabled` / `server_port`, pass `?port=<port>` in the dock URL, and never embed or write your WebSocket password. The Deck also probes common local ports (`4455–4458`, `4444`) if the default port does not respond.
- **🎛️ Dropdown-First Pad Editor:** Clean OBS dropdowns populated via **`↻ Sync`**, 1-click quick emoji icons, color swatches, and an offline **`✎`** toggle for typing names while disconnected.

### 22 OBS Studio Action Types

| Category | Action Type | Tag | Capabilities |
|---|---|---|---|
| **Scenes & Studio** | **Switch Scene** | `SCN` | Switch to a named scene, or step **Next Scene** / **Previous Scene** |
| | **Studio Mode** | `STD` | Toggle Studio Mode, load Preview scene, or Trigger Transition *(supports Auto-Off)* |
| | **Scene Transition** | `TRN` | Switch active transition and optionally set transition duration |
| **Sources & Media** | **Source Visibility** | `SRC` | Toggle, Show, Hide, or Solo sources across scenes and OBS Groups *(supports Auto-Off)* |
| | **Source Transform / PiP** | `PIP` | Toggle PiP or apply corner PiP (`Top-Right`, `Bottom-Right`, `Top-Left`, `Bottom-Left`), `Center 50%`, or `Full Reset` (adapts to canvas resolution) |
| | **Media Playback** | `MED` | Play/Pause, Restart, Stop, Next, or Previous on media sources *(supports Auto-Off)* |
| | **Image / Slideshow** | `IMG` | Quick-swap an Image Source file path or control Slideshow (`Next`, `Previous`, `Restart`) |
| | **Browser Source** | `WEB` | Refresh Browser Source cache (`refreshnocache`) or update Browser Source URL |
| | **Take Screenshot** | `CAP` | Capture a source/scene snapshot (download in browser or save to OBS host path) |
| **Filters & Audio** | **Filter Control** | `FLT` | Toggle, Enable, or Disable filters on sources, scenes, or OBS Groups *(supports Auto-Off)* |
| | **Input Mute** | `MUT` | Toggle, Mute, or Unmute audio inputs *(supports Auto-Off)* |
| | **Input Volume** | `VOL` | Set exact volume (dB) or step volume up/down (`+/- dB`) |
| | **Audio Monitor Mode** | `MON` | Cycle or set `Monitor Off`, `Monitor Only`, or `Monitor & Output` with live state sync |
| **Recording, Streaming & Telemetry** | **Stream / Record / Cam** | `OUT` | Toggle/Start/Stop Stream, Record, Record Pause, Virtual Cam, Replay Buffer, or Save Replay *(supports Auto-Off)* |
| | **Recording Chapter** | `CHP` | Insert a named or timestamped Recording Chapter marker (`CreateRecordChapter`) |
| | **Telemetry Stats** | `STS` | Live read-only OBS stats (`CPU %`, `Dropped Frames`, `FPS`, or `All`) polled while active |
| | **OBS Hotkey** | `KEY` | Trigger any registered OBS hotkey (`GetHotkeyList` → `TriggerHotkeyByName`) |
| | **Switch Profile** | `PRF` | Switch OBS Studio Profile |
| | **Scene Collection** | `COL` | Switch OBS Scene Collection |
| **Pages & Automation** | **Switch Page** | `PAG` | Jump to a specific Page or step Next / Previous Page |
| | **Timed Macro** | `MCR` | Multi-step action sequences with `Wait (ms)` steps and live countdown (re-click to cancel) |
| | **PANIC Reset** | `PNC` | Immediately abort all active Auto-Off timers and Timed Macros, then run recovery steps |

---

## Requirements

- **OBS Studio 28.0 or newer** (macOS or Windows) — `obs-websocket` v5 is built in.
- No extra runtime or backend is needed to **use** the Deck. *(Node.js is only required if you run the developer test suite or build release ZIPs.)*

---

## Quick Start (macOS & Windows)

### 1. Download & Install

1. Download **[obs-virtual-deck.zip](https://github.com/JWCow/obs-virtual-deck/releases/latest/download/obs-virtual-deck.zip)** and **extract the entire ZIP** first (Windows: right-click → **Extract All…**; macOS: double-click the ZIP).
2. Inside the extracted `obs-virtual-deck` folder, run the 1-Click Setup Helper for your OS (or place the folder manually):

#### Option A: 1-Click Setup Helper (Recommended)

- **Windows:** Double-click **`Install-Windows.bat`**.
  - Copies `obs-virtual-deck` to `Documents\obs-virtual-deck`.
  - Inspects `%APPDATA%\obs-studio\plugin_config\obs-websocket\config.json` (read-only) to detect your OBS WebSocket port (`?port=<port>`) and reports whether OBS WebSocket is already enabled or still needs enabling—without ever reading or embedding your password.
  - Copies the exact `file:///.../deck.html` URL to your clipboard.
  - *Windows SmartScreen note:* Because this is an open-source `.bat` script rather than a paid code-signed `.exe`, Windows may show *"Windows protected your PC"*. Click **More info → Run anyway** (you can open `Install-Windows.bat` in Notepad first to inspect every line).
- **macOS:** Double-click **`Install-Mac.command`**.
  - Copies `obs-virtual-deck` to `~/Documents/obs-virtual-deck` and clears the macOS download quarantine attribute (`xattr`) on the installed assets.
  - Inspects `~/Library/Application Support/obs-studio/plugin_config/obs-websocket/config.json` (read-only) to detect your OBS WebSocket port (`?port=<port>`) and reports whether OBS WebSocket is already enabled—without ever embedding your password.
  - Copies the exact `file:///.../deck.html` URL to your clipboard.
  - *macOS Gatekeeper note:* On recent macOS versions, double-clicking a downloaded `.command` script may prompt Gatekeeper (*"cannot be opened because the developer cannot be verified"*). Either **Control-click (right-click) → Open** (or allow via **System Settings → Privacy & Security → Open Anyway**), **or** run in Terminal:
    ```bash
    bash ~/Downloads/obs-virtual-deck/Install-Mac.command
    ```

#### Option B: Manual Folder Placement

Move the extracted `obs-virtual-deck` folder into a **permanent location** you will not rename or move later (ensuring `deck.html` sits directly inside `obs-virtual-deck/`):
- **Windows:** `C:\Users\<YourName>\Documents\obs-virtual-deck\deck.html`
- **macOS:** `/Users/<YourName>/Documents/obs-virtual-deck/deck.html`

> **Tip:** Avoid moving the folder after setting up your OBS dock. Your saved Deck configuration lives in OBS’s browser `localStorage` keyed by file path. Always click **Export** to back up your `.json` layout before moving folders.

---

### 2. Enable OBS WebSocket Server *(if not already enabled)*

If the setup helper reported that OBS WebSocket is not enabled yet:
1. Open **OBS Studio** and go to **`Tools` → `WebSocket Server Settings`**.
2. Check **`Enable WebSocket server`** (default port **`4455`**).
3. **Authentication:** either leave `Enable Authentication` unchecked for local use on a trusted machine, or keep it checked and click **`Show Connect Info`** to copy your **Server Password**.
4. Click **`Apply`** then **`OK`**.

---

### 3. Add as a Custom Browser Dock in OBS Studio

1. In OBS Studio, open **`Docks` → `Custom Browser Docks...`**.
2. Set **Dock Name** to: `OBS Virtual Deck`
3. Under **URL**, paste the `file:///...` URL copied by the setup helper (or enter it manually):
   - **Windows example:** `file:///C:/Users/YourName/Documents/obs-virtual-deck/deck.html`
   - **macOS example:** `file:///Users/YourName/Documents/obs-virtual-deck/deck.html`
4. Click **`Apply`**, then **`Close`**, and dock the floating **OBS Virtual Deck** panel onto any edge of OBS.

> **Spaces in paths:** Encode spaces as `%20` if entering manually (the setup helpers handle this automatically).
> **Separate monitor / browser option:** You can also open `deck.html` directly in Chrome, Edge, Safari, or Firefox.

---

### 4. Connect & Auto-Import

1. If the status pill says `Disconnected` (red), click **`WS`**, verify **Host** (`127.0.0.1` or your OBS machine’s LAN IP), **Port** (auto-filled from `?port=` or auto-probed), and **Pass** (if authentication is enabled in OBS), then click **`Connect`**.
2. Once **`Connected`** (green), new users are greeted once with the **🪄 Auto-Import Wizard**—pick which categories to import (*Scenes*, *Sources & Overlays*, *Filters*, *Audio, Broadcast & Telemetry*) and click **Create Pages** for an instant working layout.
3. Click **`WS`** again to collapse the connection bar and maximize grid space.

---

## Using & Configuring the Deck

### Pages & Grid Sizing
- Use the Page bar to switch tabs, click **`+ Page`** to add a Page, **`⎘`** to duplicate the active Page, or **`8×8 ⚙`** to open **Page & Grid Settings** (rename, choose presets or custom **Cols 2–12 × Rows 2–10**, or delete extra Pages).

### Configuring & Rearranging Pads (`✎ Edit` Mode)
- Click **`✎ Edit`** (or **right-click** any Pad, or click any **empty** Pad) to open the **Edit Pad** dialog:
  - Set **Label**, **Quick Icons**, **Color**, and **Keyboard Shortcut**.
  - Pick an **Action** and select targets from the live OBS dropdowns (or click **`✎`** beside a dropdown to type a custom name offline).
  - Configure **Auto-off after (sec)** on toggleable actions.
- While **`✎ Edit`** is active:
  - **Drag a Pad onto another Pad** to swap positions.
  - **Drag a Pad onto a Page tab** to move it to the first available slot on that Page.
- Click **`✎ Edit`** again to return to **Run mode**, and click **`↻ Sync`** whenever you add or rename scenes, sources, filters, or hotkeys in OBS.

### Timed Macros & ⚡ PANIC
- **Timed Macro (`MCR`):** Chain multiple OBS steps and **`Wait (ms)`** intervals on one Pad. Clicking runs the sequence with a live countdown; clicking again mid-run cancels it.
- **PANIC (`⚡ PANIC` / `PNC`):** Immediately aborts every running Auto-Off timer and Timed Macro across all Pages, then runs your custom **PANIC Reset Steps** (configured in **`⚙ Panic`**) or automatically disables every active Deck-controlled filter.

### Export, Import & Reset
- **`Export`**: downloads `obs-virtual-deck.json` with all Pages, Pads, PANIC steps, and host/port (**passwords are always stripped**).
- **`Import`**: restores v1, v2.0.0, or v2.1.0 `.json` Deck backups.
- **`Reset Deck`** (inside `WS`): resets all Pages and PANIC steps back to the starter layout.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| Pill stays red (`Disconnected`) | Confirm OBS is running and `Tools → WebSocket Server Settings → Enable WebSocket server` is checked. If you use a custom port, check `WS` or pass `?port=<port>` in the dock URL. |
| Pill says `Auth Failed` | Your OBS WebSocket password does not match `Show Connect Info`. Enter the correct password in `WS` and click **`Connect`**. |
| OBS Dock is blank / white | Ensure the URL starts with **`file:///`** (three slashes), points directly to **`deck.html`**, and encodes spaces as `%20`. On **macOS**, check `System Settings → Privacy & Security → Files and Folders` so OBS Studio can access `Documents`/`Downloads`. |
| Dropdown is empty or missing a new OBS item | Connect to OBS first, then click **`↻ Sync`**. |
| Telemetry Pad shows `--` | Connect to OBS; `GetStats` polls automatically every 2 seconds while connected on a Page with a Telemetry Pad (or click the Pad to refresh immediately). |
| Layout vanished after moving the folder | `localStorage` is tied to the exact file path. Move the folder back, click **`Export`**, then **`Import`** at the new location. |
| Pad shows an error in the status bar | The target scene, source, input, or filter may have been renamed or deleted in OBS. Click **`↻ Sync`** and update the Pad. |

---

## Documentation & Links

- **[GLOSSARY.md](GLOSSARY.md)** — Canonical domain terminology (`Deck`, `Page`, `Pad`, `Auto-Import`, `Auto-Off`, `Timed Macro`, `PANIC`, `Telemetry Pad`).
- **[Architecture Decision Records (`docs/adr/`)](docs/adr/)** — Design decisions behind [read-only Auto-Import](docs/adr/0001-read-only-auto-import.md), [password-free port discovery](docs/adr/0002-port-discovery-without-persisting-passwords.md), and [single Deck with Pages](docs/adr/0003-single-deck-with-pages.md).
- **[GitHub Releases](https://github.com/JWCow/obs-virtual-deck/releases)** — Version history and downloadable release ZIPs.

---

## Project Structure

```text
obs-virtual-deck/
├── deck.html                  # Main entry point (load this in OBS Custom Browser Dock)
├── deck/
│   ├── deck.css               # Dark responsive grid (--cols × --rows), min pad sizing, modals
│   ├── obs-ws.js              # obs-websocket v5 client, SHA-256 auth, port discovery, Pages & Auto-Import
│   ├── actions.js             # Pad execution (22 action types), auto-off timers, macros, hotkeys, PANIC
│   └── ui.js                  # Page tabs, drag-and-drop, Auto-Import Wizard, dropdown editors, export/import
├── installers/
│   ├── Install-Windows.bat    # Windows 1-click installer + OBS port auto-discovery + clipboard URL
│   └── Install-Mac.command    # macOS 1-click installer + quarantine fix + OBS port auto-discovery
├── docs/adr/                  # Architecture Decision Records
├── scripts/
│   └── build-release.mjs      # Builds dist/obs-virtual-deck*.zip (zero external deps)
├── .github/workflows/
│   └── release.yml            # CI test + build + GitHub Release attachment on v* tags
├── test-deck.mjs              # Playwright E2E suite (auth, actions, Pages, Auto-Import, export/import)
├── test-deck-edge.mjs         # Playwright edge-case E2E suite (groups, timers, resize, 360×420 dock, ZIP)
├── test-deck-fake-obs.mjs     # Hermetic fake obs-websocket v5 server for tests
├── package.json               # Dev dependencies, test & release scripts (not needed to run the deck)
├── GLOSSARY.md                # Canonical project glossary
├── AGENTS.md                  # Guidelines for AI coding agents
└── README.md                  # This guide
```

---

## Development, Testing & Releases

End users do **not** need Node.js to run OBS Virtual Deck. For contributors modifying the codebase:

```bash
npm install
npx playwright install chromium   # if Chromium is not already installed
npm test                          # run both hermetic Playwright E2E suites
npm run build:release             # build release ZIPs in dist/
```

Tagging `vX.Y.Z` (matching `package.json` and `Deck.VERSION`) triggers `.github/workflows/release.yml` to verify version parity, run `npm test`, run `npm run build:release`, and publish `obs-virtual-deck.zip`, `obs-virtual-deck-latest.zip`, and `obs-virtual-deck-vX.Y.Z.zip` to GitHub Releases.
