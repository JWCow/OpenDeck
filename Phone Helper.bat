@echo off
title Phone Helper
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js is not installed or not on PATH. Get it from https://nodejs.org & pause & exit /b 1)
echo Starting Phone Deck helper. Open one of the URLs below on your phone ^(same Wi-Fi^).
echo Press Ctrl+C to stop.
echo.
rem Find the real Downloads folder (it may be on another drive).
set "DL=%USERPROFILE%\Downloads"
for /f "usebackq delims=" %%D in (`powershell -NoProfile -Command "(New-Object -ComObject Shell.Application).NameSpace('shell:Downloads').Self.Path"`) do set "DL=%%D"
rem Use your newest exported layout (Export button on the PC deck) as layout.json for the phone.
for /f "delims=" %%F in ('dir /b /o-d "%DL%\obs-virtual-deck*.json" 2^>nul') do (
  copy /y "%DL%\%%F" layout.json >nul
  echo Using exported layout: %%F
  goto :layoutdone
)
echo No exported layout found in %DL% - phone will start with its own layout.
:layoutdone
rem Preferred port stays the same every run so your phone bookmark keeps working.
rem Change 8765 if you like. If it is taken, fall back to any free port.
set PORT=8765
node scripts\lan-helper.mjs
if %errorlevel% equ 1 (
  echo.
  echo Port %PORT% is busy, using any free port instead. The URL above will differ this time.
  echo.
  set PORT=0
  node scripts\lan-helper.mjs
)
pause
