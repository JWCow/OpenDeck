# <img src="electron/assets/icon.png" width="32" height="32" align="absmiddle" alt="OpenDeck" /> OpenDeck

[![Latest Release](https://img.shields.io/github/v/release/JWCow/OpenDeck?label=Release&color=2563eb)](https://github.com/JWCow/OpenDeck/releases/latest)
[![Download ZIP](https://img.shields.io/badge/Download-opendeck.zip-16a34a?logo=github)](https://github.com/JWCow/OpenDeck/releases/latest/download/opendeck.zip)
[![Platforms](https://img.shields.io/badge/Windows%20%C2%B7%20macOS%20%C2%B7%20Linux%20%C2%B7%20Phone-OBS%2028%2B-334155)](#quick-start-obs-custom-browser-dock)

**Virtual Stream Deck for OBS Studio (`obs-websocket` v5) — zero-backend UI v2.**  
Run it three ways with the exact same Deck, Pages, and Pads:

- 🖥️ **[Desktop App](#%EF%B8%8F-desktop-app-electron)** — Standalone Electron app for **Windows** (`.exe`), **macOS** (`arm64`/`x64` `.dmg`/`.zip`), and **Linux** (`.AppImage`) with tray controls & Always on Top
- 🔌 **[OBS Browser Dock](#quick-start-obs-custom-browser-dock)** — Drop `deck.html` from [`opendeck.zip`](https://github.com/JWCow/OpenDeck/releases/latest/download/opendeck.zip) into an OBS Custom Browser Dock (no plugins, no server)
- 📱 **[Phone / Tablet Deck](#-phone-deck)** — Control OBS from any phone on Wi-Fi via `Phone Helper` + QR code

**[⬇️ All Desktop & Dock Downloads](https://github.com/JWCow/OpenDeck/releases)** · **[⬇️ Latest opendeck.zip](https://github.com/JWCow/OpenDeck/releases/latest/download/opendeck.zip)**

<br>

![OpenDeck Live Deck (Dark Studio)](docs/screenshots/opendeck-dark.png)

<br>

## ✨ Highlights

| | Feature | What it does |
|---|---|---|
| ✨ | **UI v2 & State-First Pads** | Compact `Edit` / `⋯` / `PANIC` header with high-contrast tally states |
| 🖥️ | **Standalone Desktop App** | Windows, macOS & Linux app with `app://opendeck/` storage, tray & Always on Top |
| 🪄 | **Auto-Import (Read-Only)** | Reads your OBS scenes, sources, filters & audio into ready Pages |
| 🎛️ | **23 Actions & Hold Pads** | Scenes, PiP, filters, audio, media, streams, stats, hotkeys, HTTP & Hold-to-Run |
| 🖼️ | **Custom Icons** | Upload PNG/JPG/WebP/SVG artwork (Fit Icon, Full Face, Hide Text) |
| 📄 | **Pages, Linked Scenes & Undo** | `2×2` to `12×12` grids, Scene-Linked Pages, Undo/Redo, crisp down to `360×420` |
| ⏱️ | **Timers & Macros** | Auto-Off countdowns, multi-step Timed Macros with abort cleanup, and **PANIC** |
| 🌓 | **Themes, Sizing & Clean View** | Dark/Light Studio toggle, `A-` / `A+` font scaling & **Clean View** (`?clean=1`) |
| 💾 | **Portable JSON & Snapshots** | **Export Deck**, **Import Pages…**, **Import from Link…** & IndexedDB **Snapshots…** |

<br>

![OpenDeck Edit Mode & Command Palette](docs/screenshots/opendeck-edit.png)

> **Edit Mode:** Click **Edit** to drag commands from the right palette onto Pads, drag Pads across Page tabs, reorder Pages, or multi-select to duplicate, recolor, and move in bulk.

<br>

![OpenDeck Light Studio & More Menu](docs/screenshots/opendeck-light.png)

> **Light Studio & `⋯` Menu:** Switch between Dark/Light Studio themes, adjust `A-`/`A+` text size, enable **Clean View** (`?clean=1`), or manage **Connection…**, **Auto-Import…**, **Snapshots…**, and **Export Deck** from `⋯`.

<br>

<details>
<summary>📋 <strong>All 23 Action Types</strong></summary>

<br>

| Category | Action | Tag | Capabilities |
|---|---|---|---|
| 🎬 **Scenes** | Switch Scene | `SCN` | Named scene, Next, or Previous |
| | Studio Mode | `STD` | Toggle, load Preview, or Transition *(Auto-Off)* |
| | Scene Transition | `TRN` | Switch transition & duration |
| 🧩 **Sources** | Source Visibility | `SRC` | Toggle, Show, Hide, Solo *(Auto-Off, Hold)* |
| | Transform / PiP | `PIP` | Corner PiP, Center 50%, or Reset |
| | Media Playback | `MED` | Play/Pause, Restart, Stop, Next, Prev *(Auto-Off)* |
| | Image / Slideshow | `IMG` | Swap image path or step slides |
| | Browser Source | `WEB` | Refresh cache or update URL |
| | Take Screenshot | `CAP` | Snapshot source or scene |
| 🎚️ **Filters & Audio** | Filter Control | `FLT` | Toggle, Enable, or Disable *(Auto-Off, Hold)* |
| | Input Mute | `MUT` | Toggle, Mute, or Unmute *(Auto-Off, Hold)* |
| | Input Volume | `VOL` | Set dB or step `+/- dB` |
| | Audio Monitor | `MON` | Off / Monitor Only / Monitor & Output |
| 📡 **Broadcast** | Stream / Record / Cam | `OUT` | Stream, Record, Pause, VCam, Replay *(Auto-Off)* |
| | Recording Chapter | `CHP` | Insert chapter marker |
| | Telemetry Stats | `STS` | Live CPU %, FPS & dropped frames |
| | OBS Hotkey | `KEY` | Trigger OBS hotkey by name or key sequence |
| | Profile / Collection | `PRF` / `COL` | Switch OBS Profile or Scene Collection |
| ⚡ **Automation** | Switch Page | `PAG` | Jump to Page or Next / Prev |
| | Timed Macro | `MCR` | Multi-step sequence with `Wait (ms)` & abort cleanup |
| | HTTP / Webhook | `API` | `GET`/`POST`/`PUT` webhook or local bridge call |
| | PANIC Reset | `PNC` | Abort timers & run recovery steps |

</details>

<br>

## 🖥️ Desktop App (Electron)

Prefer a standalone window instead of an OBS dock? Download the desktop installer (**Windows** `.exe`, **macOS** Apple Silicon `arm64` & Intel `x64` `.dmg`/`.zip`, **Linux** `.AppImage`) from [Releases](https://github.com/JWCow/OpenDeck/releases) or run it from source.

![OpenDeck Standalone Desktop App](docs/screenshots/opendeck-desktop.png)

- **Stable storage & tray controls:** Serves the Deck from a fixed `app://opendeck/` origin (preserving layouts across updates and Linux AppImage mounts) with window state persistence, Always on Top (`Ctrl/Cmd+Shift+T`), and system tray controls.
- **Auto port discovery (ADR-0002):** Reads OBS `obs-websocket/config.json` read-only for `server_port` on launch and never reads or persists passwords.
- **Windows download choice & first launch:** Use **`OpenDeck.Setup.<version>.exe`** (recommended) for daily use — it installs once and opens right away, whereas the portable **`OpenDeck.<version>.exe`** re-extracts into `%TEMP%` on every launch. Until Windows code signing is active, Windows SmartScreen or third-party antivirus (e.g., Avast AutoSandbox) may briefly scan or prompt on first launch (`More info` → `Run anyway`, or allow the installed binary).
- **macOS first launch:** Builds are currently unsigned — Right-click `OpenDeck.app` → **Open** (or run `xattr -cr /Applications/OpenDeck.app`), and allow the **Local Network** prompt on macOS Sequoia so OpenDeck can connect to OBS (`ws://127.0.0.1` or LAN). Building macOS `.dmg`/`.zip` targets locally requires a Mac (CI builds them on `macos-latest`).

<br>

## 🚀 Quick Start (OBS Custom Browser Dock)

**1. 📦 Install** — Download & extract [`opendeck.zip`](https://github.com/JWCow/OpenDeck/releases/latest/download/opendeck.zip) (it unpacks to an `obs-virtual-deck` folder), then run the setup helper inside. It copies OpenDeck to `Documents/obs-virtual-deck` and **copies the dock URL to your clipboard**:
- 🪟 **Windows:** `Install-Windows.bat` *(SmartScreen: More info → Run anyway)*
- 🍎 **macOS:** `Install-Mac.command` *(Right-click → Open, or run `bash ~/Downloads/obs-virtual-deck/Install-Mac.command` if extracted in Downloads)*

<br>

**2. 🔌 Enable WebSocket** — In OBS: **Tools → WebSocket Server Settings** → check **Enable WebSocket server** (`4455`).

<br>

**3. 🖥️ Add OBS Dock** — **Docks → Custom Browser Docks...** → name it `OpenDeck` → paste the `file:///.../deck.html` URL the installer copied (it also prints it in the installer window) → **Apply**.

<br>

**4. 🔗 Connect** — Open **⋯ → Connection…**, enter your password in **Pass** (if set), click **Connect**, and run **⋯ → Auto-Import…** *(the Desktop App and installers auto-detect your OBS port via ADR-0002 without storing passwords)*.

> 💡 *Upgrading from v1/v2.x?* Opening `deck.html` at the same `file://` path migrates your layout automatically. Click **⋯ → Export Deck** first for a backup.

<br>

## 📱 Phone Deck

Control OBS from a phone or tablet on the same Wi-Fi. Needs [Node.js](https://nodejs.org) on the OBS computer.

![OpenDeck Phone Deck Touch View](docs/screenshots/opendeck-phone.png)

1. **Start OBS first** (WebSocket server enabled), then double-click **Phone Helper.bat** (Windows) or run `node scripts/lan-helper.mjs`.
2. The helper finds the port your running OBS uses, then prints the phone URLs and a **QR code** for your home-network address. Scan it, or type the URL on the phone.
3. **Your layout:** design the Deck on the PC and click **⋯ → Export Deck**. If `obs-virtual-deck*.json` is in your Downloads folder, Phone Helper serves the newest one and the QR link carries it; the phone asks before loading it (a Snapshot is saved first). Otherwise the phone starts with its own layout. Export again and restart the helper to update it.

| Good to know | |
|---|---|
| Port | Uses `8765`; if taken, any free port (the URL changes, so use the one printed). Change it in the `.bat`. |
| Several devices | Any number of phones can open the same link. Each keeps its own layout. |
| OBS detection | Windows only. Elsewhere it uses `4455` or `--obs-port=`. |
| Load a layout by hand | **⋯ → Import from Link…** with `http://<ip>:<port>/layout.json`. |
| Password | Never in the link. Type it once on the phone (**⋯ → Connection… → Pass**). |

<br>

## 🛠️ Troubleshooting

| Symptom | Fix |
|---|---|
| 🔴 **Disconnected** | Check OBS **Tools → WebSocket Server Settings → Enable WebSocket server** |
| 🔑 **Auth Failed** | Copy password from OBS **Show Connect Info** into **⋯ → Connection… → Pass** |
| ⬜ **Blank Dock** | URL must start with `file:///` and point to `deck.html` (macOS: allow Files & Folders access) |
| 🔄 **Missing Items** | Connect to OBS, then click **⋯ → Sync with OBS** |
| 📂 **Layout Reset / Sharing** | Layouts live in browser storage, not the folder — click **⋯ → Export Deck** (saving `layout.json` in the deck folder also lets `Phone Helper.bat` and external tools read/extend your deck), **⋯ → Import Pages…** to append new Pages onto an active Deck, or **⋯ → Snapshots…** to roll back |
| ⌨️ **External App Hotkeys** | For OS hotkeys outside OBS (triggered via `API` / `http` pads), launch optional **Hotkey Bridge.bat** (`127.0.0.1:3905/hotkey`) |

<br>

## 🖥️ Multiple OBS Computers

> 💡 **Tip:** Open one dock per OBS machine (e.g. a gaming PC and a streaming PC) and point each at its own OBS with `?host=` and `?port=` in the dock URL.

| Computer | Dock or Phone URL |
|---|---|
| 🎮 **Gaming PC** (local) | `file:///.../obs-virtual-deck/deck.html?port=4455` |
| 📡 **Streaming PC** (remote) | `file:///.../obs-virtual-deck/deck.html?host=192.168.1.50&port=4455` |

Each dock connects to the OBS in its own URL, but **both share one layout**: the browser keeps a single storage area for every `file://` page, so copying the folder does not separate them. Keep the controls for both machines on separate Pages. Leave the **Host** and **Port** fields in **⋯ → Connection…** alone in these docks; typing a host or port there is saved and then overrides the URL in every dock. On Phone Deck, add the same `?host=` and `?port=` to the LAN URL (e.g. `http://192.168.1.50:8765/deck.html?host=192.168.1.50&port=4455`).

<br>

## 🧑‍💻 Docs & Dev

📖 [Glossary](GLOSSARY.md) · [ADRs](docs/adr/) · [Agent Guide](AGENTS.md)

```bash
npm install && npx playwright install chromium
npm run check                  # Static syntax, version & PAD_TYPES parity checks
npm test                       # Playwright E2E suites (--section=18 for feature subset)
npm run build:release          # Build release ZIPs in dist/
npm --prefix electron install  # Install isolated Electron desktop dependencies
npm run desktop                # Launch the Electron desktop app
npm run build:desktop          # Build desktop installers in electron/dist/
npm run build:desktop:mac      # Build macOS arm64 + x64 .dmg/.zip (requires macOS)
```

<br>

## 🔐 Security, Code Signing & Privacy

- **Code signing status:** Desktop installers (Windows `.exe`, macOS `.dmg`/`.zip`, Linux `.AppImage`) are currently **unsigned** (built directly by GitHub Actions from tagged releases). See the [Desktop App](#%EF%B8%8F-desktop-app-electron) notes above for first-launch SmartScreen / Gatekeeper steps.
- **Privacy:** OpenDeck is 100% local and zero-backend. It collects no analytics or telemetry and communicates only with your local/LAN OBS Studio (`obs-websocket`) instance and any URLs you explicitly configure in `API` / `http` pads.
- **License:** Open-source software licensed under the [MIT License](LICENSE).
