# 0001 — Read-Only Auto-Import Instead of Mutating OBS Scenes

Status: accepted

We keep Auto-Import strictly read-only—reading existing OBS scenes, sources, filters, and audio inputs to populate Deck Pages—rather than calling `CreateInput` or `CreateSourceFilter` inside OBS.

## Context & Trade-Off
Everyday OBS users want instant one-click setup when opening the Deck for the first time, without risk of corrupting or cluttering their carefully arranged OBS Scene Collection. Mutating OBS directly is hard to undo cleanly if a user disconnects or dislikes a starter pack; reading existing items gives 100% safe onboarding and leaves OBS Studio as the single source of truth for scene authoring.
