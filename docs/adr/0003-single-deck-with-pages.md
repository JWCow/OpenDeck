# 0003 — Single Deck with Multiple Pages

Status: accepted

The user's configuration is modeled as one exportable **Deck** containing multiple **Pages** (tabs), replacing the earlier two-concept ambiguity between "decks" and "pages".

## Context & Trade-Off
A nested `Workspace → Decks → Pages` hierarchy adds profile-switching power for multi-show studios, but creates extra menus and confusion for everyday streamers and presenters. Standardizing on one Deck with switchable Pages keeps navigation to a single tab bar while still allowing separate setups to be saved and loaded via JSON Export/Import.
