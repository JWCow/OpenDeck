# OBS Virtual Deck

A cross-platform virtual control surface for OBS Studio used by live streamers, video creators, educators, and presenters on macOS and Windows.

## Language

**Deck**:
The complete saved control configuration, containing all pages, pad assignments, connection host/port settings, and PANIC reset steps.
_Avoid_: Profile, board, workspace

**Page**:
A single customizable grid tab within the Deck, sized to a chosen column-by-row layout.
_Avoid_: Sub-deck, tab-deck, screen

**Pad**:
An individual clickable or hotkey-triggered button slot at a fixed row and column on a Page.
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
