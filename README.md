# OBS Virtual Deck

A zero-backend, single-folder **virtual Stream Deck** for **OBS Studio** (`obs-websocket` v5).  
Download the ZIP, load `deck.html` into an **OBS Custom Browser Dock** (or any browser), and control scenes, sources, media, browsers, filters, audio, recording/streaming, Studio Mode, timed toggles, and macros—with **no Node.js, no Python, no plugins, and no build step required**.

---

## Download Latest Version (ZIP)

**[⬇️ Download obs-virtual-deck.zip (Latest Release)](https://github.com/JWCow/obs-virtual-deck/releases/latest/download/obs-virtual-deck.zip)**

- The link above **always downloads the newest release ZIP** in one click (no extra `node_modules` or test files inside).
- You can also browse all versions and release notes on the **[Releases page](https://github.com/JWCow/obs-virtual-deck/releases)**.

> **Upgrading from v1?** Your existing 8×8 pad layout and PANIC steps migrate **automatically and losslessly** to v2 the first time you open the new version at the same `file://` path. (You can also click **Export** first to save a backup `.json` file.)

---

## What’s New in v2.0.0

- **Multiple Pages / Decks:** Organize buttons across separate tabs (e.g., *Main*, *Audio*, *Media*) using the page bar (`+` add, `⎘` duplicate, `8×8 ⚙` rename/resize/delete), plus a **Switch Page / Deck (`PAG`)** pad action.
- **Custom Grid Sizes per Page:** Pick quick presets (`3×2`, `4×3`, `5×3`, `6×4`, `8×4`, `8×8`) or any custom size from `2×2` up to `12×10`—resizing preserves pads in their row/column positions and fits narrow OBS docks (`360×420`+).
- **Auto-Off Timed Toggles:** Set an optional **Auto-off after (sec)** timer (e.g. `3s`, `5s`, `10s`, `30s`, or custom) on `Source`, `Filter`, `Mute`, `Studio Mode`, `Stream/Record/Cam`, or `Media` pads. Clicking turns it ON with a live countdown, then automatically toggles it back OFF; clicking again cancels early.
- **Keyboard Shortcuts:** Bind any key or combo (like `F1`, `1`, `Ctrl+Shift+1`, `Alt+M`) to a pad. Shortcuts fire anywhere in the dock (ignored while typing in inputs or dialogs).
- **Dropdown-First Pad Editor:** Clean OBS dropdowns auto-populated via `↻ Sync`, 1-click quick emoji icons, and a subtle `✎` button when you want to type a name offline. Saved values stay intact even while disconnected.
- **Full OBS Studio Control (16 Action Types):**
  - **Scenes & Studio:** **Switch Scene (`SCN`)**, **Studio Mode (`STD`)** (toggle, preview scene, trigger transition), **Scene Transition (`TRN`)** (with optional duration).
  - **Sources & Media:** **Source Visibility (`SRC`)** (Toggle / Show / Hide / Solo), **Media Playback (`MED`)** (Play/Pause, Restart, Stop, Next, Previous), **Browser Source (`WEB`)** (Refresh Cache or Update URL), **Take Screenshot (`CAP`)** (quick download or save to path on OBS host).
  - **Filters & Audio:** **Filter Control (`FLT`)** (Toggle / Enable / Disable on sources, scenes, or groups), **Input Mute (`MUT`)**, **Input Volume (`VOL`)** (set exact dB or step `+ / - dB`).
  - **Recording & Streaming:** **Stream / Record / Virtual Cam / Replay Buffer (`OUT`)** (plus **Save Replay Buffer**), **Switch Profile (`PRF`)**, **Scene Collection (`COL`)**.
  - **Navigation & Automation:** **Switch Page / Deck (`PAG`)**, **Timed Macro (`MCR`)** (multi-step sequences with `Wait (ms)` and live countdown), **PANIC Reset (`PNC`)**.

---

## Requirements

- **OBS Studio 28.0 or newer** (Windows or macOS) — `obs-websocket` v5 is built in.
- No extra software is needed to **use** the deck. *(Node.js is only needed if you want to run the automated developer tests or build release ZIPs.)*

---

## Student Setup Guide (Windows & macOS)

### 1. Download & Install

1. Download **[obs-virtual-deck.zip](https://github.com/JWCow/obs-virtual-deck/releases/latest/download/obs-virtual-deck.zip)** and **unzip it completely** first (on Windows, right-click the ZIP → **Extract All…**; on macOS, double-click the ZIP).
2. Inside the extracted `obs-virtual-deck` folder, choose either the **1-Click Helper** or **Manual Setup**:

#### Option A: 1-Click Setup Helper (Recommended)

- **Windows:** Double-click **`Install-Windows.bat`**.
  - It copies `obs-virtual-deck` into your `Documents\obs-virtual-deck` folder, copies the exact `file:///.../deck.html` URL to your clipboard, and prints the next two OBS steps.
  - *Windows SmartScreen note:* Because this is a lightweight open-source batch script rather than a paid code-signed `.exe`, Windows may show *"Windows protected your PC"*. Click **More info → Run anyway** (you can open `Install-Windows.bat` in Notepad first to inspect every line).
- **macOS:** Double-click **`Install-Mac.command`**.
  - It copies `obs-virtual-deck` into `~/Documents/obs-virtual-deck`, clears the browser download quarantine flag on the copied HTML/JS files, and copies the exact `file:///.../deck.html` URL to your clipboard.
  - *macOS Gatekeeper note:* On newer macOS versions, double-clicking a script downloaded from the internet may trigger Gatekeeper (*"cannot be opened because the developer cannot be verified"*). Either **Control-click (right-click) → Open** (or allow it in **System Settings → Privacy & Security → Open Anyway**), **or** open Terminal and run:
    ```bash
    bash ~/Downloads/obs-virtual-deck/Install-Mac.command
    ```

#### Option B: Manual Folder Placement

Unzip/move the `obs-virtual-deck` folder into a **permanent location** you will not move or delete later (making sure `deck.html` is directly inside `obs-virtual-deck/`, not nested in an extra subfolder):
- **Windows:** `C:\Users\<YourName>\Documents\obs-virtual-deck\deck.html`
- **macOS:** `/Users/<YourName>/Documents/obs-virtual-deck/deck.html`

> **Tip:** Avoid moving the folder after you set up your OBS dock. Your saved deck pages and pads are stored in OBS’s browser `localStorage` per file path. (Always use **Export** to back up your layout as `.json` before moving.)

---

### 2. Enable OBS WebSocket Server

1. Open **OBS Studio**.
2. In the top menu bar, open **`Tools` → `WebSocket Server Settings`**.
3. Check **`Enable WebSocket server`**.
4. Leave **Server Port** as **`4455`** (default).
5. **Authentication:**
   - Either **uncheck** `Enable Authentication` for quick local use on a trusted machine, **or**
   - Keep it checked and click **`Show Connect Info`** to copy your **Server Password**.
6. Click **`Apply`** then **`OK`**.

---

### 3. Add as a Custom Browser Dock in OBS Studio

1. In OBS Studio, click **`Docks` → `Custom Browser Docks...`** in the top menu.
2. Under **Dock Name**, type: `OBS Virtual Deck`
3. Under **URL**, paste the `file:///...` URL copied by the setup helper (or enter it manually):
   - **Windows example:**
     ```text
     file:///C:/Users/YourName/Documents/obs-virtual-deck/deck.html
     ```
     *Manual tip on Windows:* drag `deck.html` onto an open Chrome or Edge tab, then copy the `file:///...` address from the address bar.
   - **macOS example:**
     ```text
     file:///Users/YourName/Documents/obs-virtual-deck/deck.html
     ```
     *Manual tip on macOS:* in Finder, select `deck.html`, hold **`Option (⌥)`**, right-click → **`Copy "deck.html" as Pathname`**, then add `file://` in front (starting with `file:///Users/...`).
4. Click **`Apply`**, then **`Close`**.
5. Drag the **OBS Virtual Deck** floating window onto the side or bottom of OBS to dock it.

> **Spaces in folder names:** If your path contains spaces, replace each space with `%20` (the setup helper scripts handle this automatically).

#### Alternative: Run in a Web Browser (Separate Window or Second Monitor)

Double-click `deck.html` directly to open it in Chrome, Edge, Safari, or Firefox, or bookmark its `file:///...` URL.

---

### 4. Connect the Deck to OBS

1. If the status pill in the top-left says `Disconnected` (red):
   - Click **`WS`** in the top bar (it opens automatically if auth fails).
   - **Host:** `127.0.0.1` *(or your OBS PC’s LAN IP if controlling OBS from another device on the same network)*.
   - **Port:** `4455`
   - **Pass:** leave blank if OBS Authentication is disabled, or paste your OBS WebSocket password.
   - Click **`Connect`**.
2. The pill turns green (**`Connected`**) and automatically syncs your OBS scenes, sources, groups, filters, audio inputs, media/browser sources, outputs, profiles, collections, and transitions.
3. Click **`WS`** again to collapse the connection bar and give the grid more room.

---

## Using & Configuring the Deck

### Pages & Grid Sizes

- Use the page bar below the toolbar to **switch tabs**, click **`+`** to add a page, **`⎘`** to duplicate the current page, or **`8×8 ⚙`** to open **Page & Grid Settings**.
- Inside **Page & Grid Settings**, rename the page, pick a grid preset (`3×2`, `4×3`, `5×3`, `6×4`, `8×4`, `8×8`) or custom **Columns (2–12) × Rows (2–10)**, or delete extra pages.

### Configuring Pads (`✎ Edit` Mode)

- Click **`✎ Edit`** in the top bar (or **right-click** any pad at any time, or click any **empty** pad).
- In the **Edit Pad** dialog:
  - **Label & Icon:** set custom text and pick from **Quick Icons** (or type any emoji).
  - **Color:** choose a color swatch to group pads visually.
  - **Keyboard Shortcut:** click the shortcut button and press any key or combo (e.g. `F1`, `Ctrl+Shift+1`); press `Escape` to cancel recording or **Clear** to remove it.
  - **Action:** pick from grouped action types and select your OBS target from the dropdowns (click **`✎`** beside a dropdown to enter a custom name offline).
  - **Auto-off after (sec):** available on toggleable actions (`Source`, `Filter`, `Mute`, `Studio Mode`, `Stream/Record/Cam`, `Media`)—automatically turns the action back off when the countdown finishes.
- While **`✎ Edit`** is active, **drag and drop** any pad onto another pad to swap their positions.
- Click **`✎ Edit`** again to return to **Run mode**.

> **Added or renamed something in OBS?** Click **`↻ Sync`** in the top bar to refresh all OBS dropdown lists.

### Timed Macros

Choose **`Timed Macro`** to run multiple steps in sequence:
1. Click **`+ Add Step`** and chain actions (Scene, Source, Filter, Mute, Volume, Studio Mode, Output, Media, Browser, Transition, Page, or **`Wait (ms)`**).
2. Example: *Enable `Blur` filter → Wait `3000` ms → Disable `Blur` filter*.
3. In Run mode, clicking the pad pulses amber and shows a live countdown (`2.4s`). Clicking it again mid-run **cancels** immediately.

### ⚡ PANIC Button & `⚙ Panic` Setup

- By default, the bottom-right pad of the starter page and the **`⚡ PANIC`** toolbar button trigger a PANIC reset.
- Pressing PANIC **immediately aborts all running timed macros and auto-off timers across every page**, then:
  - Runs your custom **PANIC Reset Steps** (configured via **`⚙ Panic`**), **or**
  - If no custom steps are configured, automatically **disables every active filter** referenced anywhere on your deck.
- Inside **`⚙ Panic`**, click **`Add Deck Filters (Off)`** to auto-populate disable steps for every filter used across all pages.

### Export, Import & Reset

- **`Export`**: downloads `obs-virtual-deck.json` containing all pages, grid sizes, pads, PANIC steps, and host/port (your WebSocket password is **stripped** for safety).
- **`Import`**: loads either a v2 `.json` layout or a legacy v1 `.json` layout (automatically migrated).
- **`Reset Deck`** (inside the `WS` bar): resets all pages and PANIC steps back to the starter layout.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| Pill stays red (`Disconnected`) | Confirm OBS is running, `Tools → WebSocket Server Settings → Enable WebSocket server` is checked, and Port is `4455`. |
| Pill says `Auth Failed` | Password does not match OBS `Show Connect Info`. Re-enter the password in `WS` and click **`Connect`**. |
| OBS Dock is blank / white | Verify the URL starts with **`file:///`** (three slashes), points directly to **`deck.html`**, and encodes spaces as `%20`. On **macOS**, check `System Settings → Privacy & Security → Files and Folders` so OBS Studio can read `Documents`/`Downloads`. |
| Dropdown is empty or missing a new OBS item | Connect first, then click **`↻ Sync`**. |
| Layout vanished after moving the folder | `localStorage` is tied to the exact file path. Move the folder back, click **`Export`**, then **`Import`** at the new path. |
| Pad shows an error in the bottom bar | Usually a renamed/deleted OBS scene, source, input, or filter. Click **`↻ Sync`** and update the pad. |

---

## Project Structure

```text
obs-virtual-deck/
├── deck.html                  # Main entry point (load this in OBS Custom Browser Dock)
├── deck/
│   ├── deck.css               # Dark responsive grid (--cols × --rows), status LEDs, modals
│   ├── obs-ws.js              # obs-websocket v5 client, pure-JS SHA-256 auth, v2 state & v1 migration
│   ├── actions.js             # Pad execution (16 action types), auto-off timers, macros, hotkeys, PANIC
│   └── ui.js                  # Page tabs, grid rendering, dropdown-first editors, export/import
├── installers/
│   ├── Install-Windows.bat    # Windows 1-click installer + clipboard URL helper
│   └── Install-Mac.command    # macOS 1-click installer + clipboard URL helper
├── scripts/
│   └── build-release.mjs      # Builds dist/obs-virtual-deck*.zip (zero external deps)
├── .github/workflows/
│   └── release.yml            # CI test + build + GitHub Release attachment on v* tags
├── test-deck.mjs              # Playwright E2E suite (auth, actions, v2 features, export/import)
├── test-deck-edge.mjs         # Playwright edge-case E2E suite (groups, timers, resize, 360×420 dock)
├── test-deck-fake-obs.mjs     # Hermetic fake obs-websocket v5 server for tests
├── package.json               # Dev dependencies, test & release scripts (not needed to run the deck)
├── AGENTS.md                  # Guidelines for AI coding agents
└── README.md                  # This guide
```

---

## Development, Testing & Releases

Students do **not** need Node.js to use the deck. If you are modifying the code:

```bash
npm install
npx playwright install chromium   # if Chromium is not already installed
npm test                          # run both hermetic Playwright E2E suites
npm run build:release             # build student-ready ZIPs in dist/
```

Tagging `vX.Y.Z` (matching `package.json` and `Deck.VERSION`) triggers `.github/workflows/release.yml` to run `npm test`, build the release ZIPs, and publish `obs-virtual-deck.zip`, `obs-virtual-deck-latest.zip`, and `obs-virtual-deck-vX.Y.Z.zip` to GitHub Releases.
