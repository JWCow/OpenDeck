# OBS Virtual Deck (8×8)

A zero-backend, single-folder **8×8 virtual Stream Deck** for **OBS Studio** (`obs-websocket` v5).  
Download the folder, drop `deck.html` into an **OBS Custom Browser Dock** (or open it in Chrome/Edge), and control scenes, sources, filters, audio mutes, and timed macros—with **no Node.js, no Python, no plugins, and no build step required**.

---

## Features

- **64-pad 8×8 grid** that scales cleanly from a full browser window down to a narrow OBS side dock (`360×420`+).
- **Zero backend (`file://` ready):** runs directly from your Downloads or Documents folder using pure HTML, CSS, and vanilla JS (including pure-JS SHA-256 authentication for `obs-websocket` v5).
- **Auto-discovery (`↻ Sync`):** automatically populates dropdowns with your OBS scenes, groups, scene sources, filters, and audio inputs.
- **Live state LEDs:** green active indicator stays in sync with OBS (even when you switch scenes or toggle sources/filters directly inside OBS).
- **6 pad action types:**
  - **Switch Scene (`SCN`)** — switch the live Program scene.
  - **Source Visibility (`SRC`)** — `Toggle`, `Show`, `Hide`, or **`Solo (Hide Others)`** (shows the target source and hides all other items in that scene or OBS group).
  - **Filter Control (`FLT`)** — `Toggle`, `Enable`, or `Disable` any filter on a source, scene, or group.
  - **Input Mute (`AUD`)** — `Toggle`, `Mute`, or `Unmute` any audio input (green LED = muted).
  - **Timed Macro (`MCR`)** — chain Scene, Source, Filter, Mute, and `Wait (ms)` steps with a live countdown; click again mid-run to cancel.
  - **PANIC Reset (`PNC`)** — abort all running macros and reset filters/sources to a safe state.
- **Drag-and-drop layout editing:** swap pads in `✎ Edit` mode, customize icons/emojis, labels, and pad colors.
- **Shareable JSON Export / Import:** back up or share your deck layout (`Export` **never** includes your OBS WebSocket password).

---

## Requirements

- **OBS Studio 28.0 or newer** (Windows or macOS) — `obs-websocket` v5 is built in.
- No extra software is needed to **use** the deck. *(Node.js is only needed if you want to run the automated developer test suite.)*

---

## Student Setup Guide (Windows & macOS)

### 1. Download the Deck

1. On GitHub, click the green **`<> Code`** button → **`Download ZIP`**.
2. Unzip the file into a **permanent folder** you won't move or delete later.
   - GitHub names the extracted folder `obs-virtual-deck-main` — rename it to `obs-virtual-deck` (and make sure `deck.html` is directly inside that folder, not nested inside another `obs-virtual-deck-main` subfolder):
   - **Windows:** `C:\Users\<YourName>\Documents\obs-virtual-deck\deck.html`
   - **macOS:** `/Users/<YourName>/Documents/obs-virtual-deck/deck.html`

> **Tip:** Avoid moving the folder after you set up your OBS dock. Your saved pad layout is stored in OBS's browser `localStorage` per file path. (You can always use **Export** to back up your layout as a `.json` file first.)

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
3. Under **URL**, enter the `file:///` path to `deck.html` inside your unzipped folder:
   - **Windows example:**
     ```text
     file:///C:/Users/YourName/Documents/obs-virtual-deck/deck.html
     ```
     *Easy way on Windows:* drag `deck.html` onto an open Chrome or Edge tab, then copy the `file:///...` address from the browser's address bar.
   - **macOS example:**
     ```text
     file:///Users/YourName/Documents/obs-virtual-deck/deck.html
     ```
     *Easy way on macOS:* in Finder, select `deck.html`, hold **`Option (⌥)`**, right-click → **`Copy "deck.html" as Pathname`**, then add `file://` in front of it (so it starts with `file:///Users/...`).
4. Click **`Apply`**, then **`Close`**.
5. A new **OBS Virtual Deck** floating window will appear—drag its title bar onto the side or bottom of OBS to dock it into your workspace.

> **Spaces in folder names:** If your path contains spaces (for example `My Folder`), replace each space with `%20`, or place `obs-virtual-deck` in a path without spaces.

#### Alternative: Run in a Web Browser (Second Screen / Laptop)

You can also open `deck.html` directly in **Google Chrome** or **Microsoft Edge** (`Ctrl+O` / `Cmd+O` → select `deck.html`).  
Note that OBS Custom Browser Docks and Chrome/Edge each have their own `localStorage`, so use **`Export`** and **`Import`** if you want to copy a layout between them.

---

### 4. Connect to OBS

1. In the deck's top toolbar, click **`WS`**.
2. Verify:
   - **Host:** `127.0.0.1` *(or `localhost`)*
   - **Port:** `4455`
   - **Pass:** enter your OBS WebSocket password *(leave blank if authentication is disabled)*
3. Click **`Connect`**.
4. The status pill should turn green (**`Connected`**), and the bottom bar will display `Program: <your active scene>`.
5. Click **`WS`** again to hide the connection bar and give the 8×8 grid more room.

---

## Using & Configuring the Deck

### Configuring Pads (`✎ Edit` Mode)

- Click **`✎ Edit`** in the top bar (or **right-click** any pad at any time, or click any **empty** pad).
- In the **Edit Pad** dialog:
  - **Label:** short name displayed on the pad (defaults to the scene/source/filter name if blank).
  - **Icon:** optional emoji or short symbol (e.g. `🎥`, `🎙️`, `🌫️`, `🎬`).
  - **Color:** pick a background color swatch to group pads visually.
  - **Action:** choose an action type and pick targets from the **`Pick OBS…`** dropdowns (or type names manually if offline).
- While **`✎ Edit`** is active, **drag and drop** any pad onto another pad to swap their positions.
- Click **`✎ Edit`** again to return to **Run mode**.

> **Added or renamed something in OBS?** Click **`↻ Sync`** in the top bar to refresh the scene, source, and filter lists.

### Timed Macros

Choose **`Timed Macro`** to run multiple steps in sequence:
1. Click **`+ Add Step`** and pick `Scene`, `Source`, `Filter`, `Mute`, or `Wait (ms)`.
2. Example: *Enable `Blur` filter → Wait `3000` ms → Disable `Blur` filter*.
3. In Run mode, clicking the pad pulses amber and shows a live countdown (`2.4s`).
4. Clicking a running macro pad a second time **cancels** it immediately.

### ⚡ PANIC Button & `⚙ Panic` Setup

- By default, pad **64** (bottom-right, `R8C8`) and the **`⚡ PANIC`** toolbar button trigger a PANIC reset.
- Pressing PANIC **immediately aborts all running timed macros**, then:
  - Runs your custom **PANIC Reset Steps** (configured via **`⚙ Panic`**), **or**
  - If no custom steps are configured, automatically **disables every active filter** referenced anywhere on your deck.
- Inside **`⚙ Panic`**, click **`Add Deck Filters (Off)`** to auto-populate disable steps for every filter used on your pads, then customize or add scene/mute resets as needed.

### Export, Import & Reset

- **`Export`**: downloads `obs-virtual-deck.json` containing all 64 pads, PANIC steps, and host/port (your WebSocket password is **stripped** for safety).
- **`Import`**: loads an exported `.json` layout file.
- **`Reset Deck`** (inside the `WS` bar): resets all 64 pads and PANIC steps back to the starter layout.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| Pill stays red (`Disconnected`) | Confirm OBS is running, `Tools → WebSocket Server Settings → Enable WebSocket server` is checked, and Port is `4455`. |
| Pill says `Auth Failed` | Password does not match OBS `Show Connect Info`. Re-enter the password in `WS` and click **`Connect`**. |
| OBS Dock is blank / white | Check that the URL starts with **`file:///`** (three slashes), points directly to **`deck.html`** (watch out for nested `obs-virtual-deck-main` folders), and encodes any spaces as `%20`. On **macOS**, also check `System Settings → Privacy & Security → Files and Folders` so OBS Studio can read `Documents`/`Downloads`. |
| `Pick OBS…` dropdown is empty or missing a new scene | Connect first, then click **`↻ Sync`**. |
| Layout vanished after moving the folder | `localStorage` is tied to the exact file path. Move the folder back, click **`Export`**, then **`Import`** at the new path. |
| Pad shows an error in the bottom bar | Usually a renamed/deleted OBS scene, source, or filter. Click **`↻ Sync`** and update the pad. |

---

## Project Structure

```text
obs-virtual-deck/
├── deck.html                 # Main entry point (load this in OBS Custom Browser Dock)
├── deck/
│   ├── deck.css              # Dark responsive 8×8 grid, status LEDs, modals
│   ├── obs-ws.js             # obs-websocket v5 client, pure-JS SHA-256 auth, state & localStorage
│   ├── actions.js            # Pad execution (scene/source/filter/mute), timed macros, PANIC reset
│   └── ui.js                 # Grid rendering, drag-swap, pad/panic editors, export/import
├── test-deck.mjs             # Playwright E2E suite (auth, actions, macros, PANIC, export/import)
├── test-deck-edge.mjs        # Playwright edge-case E2E suite (groups, live events, ticks, 360×420 dock)
├── test-deck-fake-obs.mjs    # Hermetic fake obs-websocket v5 server for tests
├── package.json              # Dev dependencies & test script only (not needed to run the deck)
├── AGENTS.md                 # Guidelines for AI coding agents
└── README.md                 # This guide
```

---

## Development & Running Tests

Students do **not** need Node.js to use the deck. If you are modifying the code and want to run the automated E2E tests (which spin up a fake `obs-websocket` v5 server and drive `deck.html` in headless Chromium):

```bash
npm install
npx playwright install chromium   # if Chromium is not already installed
npm test
```
