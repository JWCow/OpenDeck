# 🎛️ OpenDeck

[![Latest Release](https://img.shields.io/github/v/release/JWCow/obs-virtual-deck?label=Release&color=2563eb)](https://github.com/JWCow/obs-virtual-deck/releases/latest)
[![Download ZIP](https://img.shields.io/badge/Download-opendeck.zip-16a34a?logo=github)](https://github.com/JWCow/obs-virtual-deck/releases/latest/download/opendeck.zip)
[![Platforms](https://img.shields.io/badge/macOS%20%26%20Windows-OBS%2028%2B-334155)](#quick-start)

**Zero-backend virtual Stream Deck for OBS Studio.**  
Drop `deck.html` into an OBS Custom Browser Dock — no plugins, no server, no build step.

**[⬇️ Download the latest opendeck.zip](https://github.com/JWCow/obs-virtual-deck/releases/latest/download/opendeck.zip)** · [All Releases](https://github.com/JWCow/obs-virtual-deck/releases)

<br>

![OpenDeck Live Deck](docs/screenshots/opendeck-dark.png)

<br>

## ✨ Highlights

| | Feature | What it does |
|---|---|---|
| 🪄 | **Auto-Import** | Reads your OBS scenes, sources, filters & audio into ready pages |
| 🎛️ | **23 Actions** | Scenes, PiP, filters, audio, media, streams, stats, hotkeys, HTTP & more |
| 🖼️ | **Custom Icons** | Upload PNG/JPG/WebP/SVG artwork (Fit Icon, Full Face, Hide Text) |
| 📄 | **Pages & Grids** | Switchable tabs from `2×2` to `12×12`, crisp down to `360×420` docks |
| ⏱️ | **Timers & Macros** | Auto-Off countdowns, multi-step macros with abort cleanup, and **⚡ PANIC** |
| 🌓 | **Themes & Sizing** | Dark/Light studio toggle + `A-` / `A+` font scaling |
| 💾 | **Portable JSON** | **Export**, **Import**, or **Import Pages** onto your active deck (passwords stripped) |

<br>

![OpenDeck Edit Mode & Command Palette](docs/screenshots/opendeck-edit.png)

> **✎ Edit Mode:** Drag commands from the right palette onto pads, drag pads across Page tabs, or multi-select to duplicate, recolor, and move in bulk.

<br>

<details>
<summary>📋 <strong>All 23 Action Types</strong></summary>

<br>

| Category | Action | Tag | Capabilities |
|---|---|---|---|
| 🎬 **Scenes** | Switch Scene | `SCN` | Named scene, Next, or Previous |
| | Studio Mode | `STD` | Toggle, load Preview, or Transition *(Auto-Off)* |
| | Scene Transition | `TRN` | Switch transition & duration |
| 🧩 **Sources** | Source Visibility | `SRC` | Toggle, Show, Hide, or Solo *(Auto-Off)* |
| | Transform / PiP | `PIP` | Corner PiP, Center 50%, or Reset |
| | Media Playback | `MED` | Play/Pause, Restart, Stop, Next, Prev *(Auto-Off)* |
| | Image / Slideshow | `IMG` | Swap image path or step slides |
| | Browser Source | `WEB` | Refresh cache or update URL |
| | Take Screenshot | `CAP` | Snapshot source or scene |
| 🎚️ **Filters & Audio** | Filter Control | `FLT` | Toggle, Enable, or Disable *(Auto-Off)* |
| | Input Mute | `MUT` | Toggle, Mute, or Unmute *(Auto-Off)* |
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

## 🚀 Quick Start

**1. 📦 Install** — Download & extract the ZIP (it unpacks to an `obs-virtual-deck` folder), then run the setup helper inside. It copies OpenDeck to `Documents/obs-virtual-deck` and **copies the dock URL to your clipboard**:
- 🪟 **Windows:** `Install-Windows.bat` *(SmartScreen: More info → Run anyway)*
- 🍎 **macOS:** `Install-Mac.command` *(Right-click → Open, or run `bash ~/Downloads/obs-virtual-deck/Install-Mac.command` if you extracted it in Downloads)*

<br>

**2. 🔌 Enable WebSocket** — In OBS: **Tools → WebSocket Server Settings** → check **Enable WebSocket server** (`4455`).

<br>

**3. 🖥️ Add OBS Dock** — **Docks → Custom Browser Docks...** → name it `OpenDeck` → paste the `file:///.../deck.html` URL the installer copied (it also prints it in the installer window) → **Apply**.

<br>

**4. 🔗 Connect** — Click **WS**, enter your password (if set), click **Connect**, and run **🪄 Auto-Import**.

> 💡 *Upgrading from v1/v2.x?* Opening `deck.html` at the same `file://` path migrates your layout automatically. Click **Export** first for a backup.

<br>

## 🖥️ Desktop App (Electron)

Prefer a standalone window instead of an OBS dock? Download the desktop installer (Windows `.exe`, macOS Apple Silicon `arm64` & Intel `x64` `.dmg`/`.zip`, Linux `.AppImage`) from [Releases](https://github.com/JWCow/obs-virtual-deck/releases) or run it from source.

- **Stable storage & tray controls:** Serves the deck from a fixed `app://opendeck/` origin (preserving layouts across updates and Linux AppImage mounts) with window state persistence, Always on Top (`Ctrl/Cmd+Shift+T`), and system tray controls.
- **Auto port discovery (ADR-0002):** Reads OBS `obs-websocket/config.json` read-only for `server_port` on launch and never reads or persists passwords.
- **macOS first launch:** Builds are currently unsigned — Right-click `OpenDeck.app` → **Open** (or run `xattr -cr /Applications/OpenDeck.app`), and allow the **Local Network** prompt on macOS Sequoia so OpenDeck can connect to OBS (`ws://127.0.0.1` or LAN). Building macOS `.dmg`/`.zip` targets locally requires a Mac (CI builds them on `macos-latest`).

<br>

## 📱 Phone Deck

Control OBS from a phone or tablet on the same Wi-Fi. Needs [Node.js](https://nodejs.org) on the OBS computer.

1. **Start OBS first** (WebSocket server enabled), then double-click **Phone Helper.bat** (Windows) or run `node scripts/lan-helper.mjs`.
2. The helper finds the port your running OBS uses, then prints the phone URLs and a **QR code** for your home-network address. Scan it, or type the URL on the phone.
3. **Your layout:** design the deck on the PC and click **Export**. If `obs-virtual-deck*.json` is in your Downloads folder, Phone Helper serves the newest one and the QR link carries it; the phone asks before loading it (a Snapshot is saved first). Otherwise the phone starts with its own layout. Export again and restart the helper to update it.

| Good to know | |
|---|---|
| Port | Uses `8765`; if taken, any free port (the URL changes, so use the one printed). Change it in the `.bat`. |
| Several devices | Any number of phones can open the same link. Each keeps its own layout. |
| OBS detection | Windows only. Elsewhere it uses `4455` or `--obs-port=`. |
| Load a layout by hand | **Import Link** with `http://<ip>:<port>/layout.json`. |
| Password | Never in the link. Type it once on the phone (**WS → Pass**). |

<br>

## 🛠️ Troubleshooting

| Symptom | Fix |
|---|---|
| 🔴 **Disconnected** | Check OBS **Tools → WebSocket Server Settings → Enable WebSocket server** |
| 🔑 **Auth Failed** | Copy password from OBS **Show Connect Info** into **WS → Pass** |
| ⬜ **Blank Dock** | URL must start with `file:///` and point to `deck.html` (macOS: allow Files & Folders access) |
| 🔄 **Missing Items** | Connect to OBS, then click **↻ Sync** |
| 📂 **Layout Reset / Sharing** | Layouts live in browser storage, not the folder — click **Export** (saving `layout.json` in the deck folder also lets `Phone Helper.bat` and external tools read/extend your deck), **Import Pages** to append new tabs onto an active deck, or **Snapshots** to roll back |
| ⌨️ **External App Hotkeys** | For OS hotkeys outside OBS (triggered via `API` / `http` pads), launch optional **Hotkey Bridge.bat** (`127.0.0.1:3905/hotkey`) |

<br>

## 🖥️ Multiple OBS Computers

> 💡 **Tip:** Open one dock per OBS machine (e.g. a gaming PC and a streaming PC) and point each at its own OBS with `?host=` and `?port=` in the dock URL.

| Computer | Dock or Phone URL |
|---|---|
| 🎮 **Gaming PC** (local) | `file:///.../obs-virtual-deck/deck.html?port=4455` |
| 📡 **Streaming PC** (remote) | `file:///.../obs-virtual-deck/deck.html?host=192.168.1.50&port=4455` |

Each dock connects to the OBS in its own URL, but **both share one layout**: the browser keeps a single storage area for every `file://` page, so copying the folder does not separate them. Keep the controls for both machines on separate Pages. Leave the WS host and port fields alone in these docks; typing a host or port there is saved and then overrides the URL in every dock. On Phone Deck, add the same `?host=` and `?port=` to the LAN URL (e.g. `http://192.168.1.50:8765/deck.html?host=192.168.1.50&port=4455`).

<br>

## 🧑‍💻 Docs & Dev

📖 [Glossary](GLOSSARY.md) · [ADRs](docs/adr/) · [Agent Guide](AGENTS.md)

```bash
npm install && npx playwright install chromium
npm run check          # Static syntax, version & PAD_TYPES parity checks
npm test               # Playwright E2E suites (--section=18 for feature subset)
npm run build:release  # Build release ZIPs in dist/
npm --prefix electron install  # Install isolated Electron desktop dependencies
npm run desktop                # Launch the Electron desktop app
npm run build:desktop          # Build desktop installers in electron/dist/
npm run build:desktop:mac      # Build macOS arm64 + x64 .dmg/.zip (requires macOS)
```
