# OpenDeck

A cross-platform virtual control surface for OBS Studio used by live streamers, video creators, educators, and presenters on macOS and Windows.

## Language

**Deck**:
The complete saved control configuration, containing all pages, pad assignments, connection host/port settings, and PANIC reset steps.
_Avoid_: Profile, board, workspace

**Page**:
A single customizable grid tab within the Deck, sized to a chosen column-by-row layout.
_Avoid_: Sub-deck, tab-deck, screen

**Pad**:
An individual clickable button slot at a fixed row and column on a Page.
_Avoid_: Key, tile, widget

**Auto-Import**:
A read-only setup flow that inspects the connected OBS Studio scene collection and populates Pads or Pages automatically without modifying OBS itself.
_Avoid_: OBS preset generator, scene syncer

**Auto-Off**:
A timed toggle behavior on a Pad that turns a target ON, displays a countdown, and automatically reverts it OFF after a set duration unless cancelled early.
_Avoid_: Auto-hide macro, self-destruct timer

**Timed Macro**:
An ordered sequence of OBS actions and wait intervals bound to a single Pad, cancellable mid-run by re-clicking the Pad or triggering PANIC.
_Avoid_: Multi-action, routine, script

**PANIC**:
An emergency reset action that immediately aborts all active Auto-Off timers and Timed Macros and runs configured recovery steps (or disables active Deck-controlled filters).
_Avoid_: Stop all, kill switch

**Telemetry Pad**:
A read-only status Pad that displays live OBS performance metrics such as CPU usage or dropped frames.
_Avoid_: Stat widget, monitor key

**Palette Splitter**:
The draggable vertical divider between the Page grid and the Command Palette that lets streamers expand or contract the palette width to view full names.
_Avoid_: Sidebar resizer, gutter, separator

**Font Scale**:
A stepped root typography multiplier (`sm`, `md`, `lg`, `xl`, `xxl`) that scales all pads, labels, dialogs, and controls proportionally across display resolutions.
_Avoid_: Text zoom, font size hack

**Theme**:
The visual appearance mode (`dark` or `light`) applied across the OpenDeck surface with high-contrast active pad tally states.
_Avoid_: Skin, dark mode switcher

**Pad Graphic**:
A custom image file uploaded and downscaled client-side to a 128×128 data URL, rendered on a Pad in either Fit Icon or Full Face mode.
_Avoid_: Button picture, tile background

**Auto-Label**:
The automatic synchronization of a Pad's Label to match the name of the selected target Scene, Source, Filter, or Audio Input in the Pad Editor.
_Avoid_: Auto-namer, default title sync

**Hold Pad**:
A Pad whose action stays on only while it is pressed and turns back off when released, such as a cough button or push-to-talk.
_Avoid_: Momentary key, push button

**Scene-Linked Page**:
A Page that comes to the front automatically when its chosen OBS scene goes live on program.
_Avoid_: Auto-page, scene profile

**Live Readout**:
A live value shown on a Pad alongside its on/off state, such as elapsed stream or recording time, or an input's volume level.
_Avoid_: Pad stats, overlay text

**Undo History**:
An in-memory stack of up to 50 previous layout states recorded during Edit Mode that allows reverting and replaying layout changes step-by-step without affecting OBS or surviving a page reload.
_Avoid_: Change log, edit history, revision stack

