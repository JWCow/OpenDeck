@echo off
title OpenDeck Hotkey Bridge
cd /d "%~dp0"
echo Starting OpenDeck Local Windows Hotkey Bridge on http://127.0.0.1:3905/ ...
echo Press Ctrl+C to stop.
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\hotkey-bridge.ps1"
pause
