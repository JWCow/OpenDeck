@echo off
setlocal EnableExtensions

set "SRC=%~dp0"
if "%SRC:~-1%"=="\" set "SRC=%SRC:~0,-1%"

if not exist "%SRC%\deck.html" (
  echo [ERROR] Could not find deck.html next to Install-Windows.bat.
  echo Make sure you extracted the entire ZIP folder before running this script.
  pause
  exit /b 1
)
if not exist "%SRC%\deck\" (
  echo [ERROR] Could not find the deck\ folder next to Install-Windows.bat.
  echo Make sure you extracted the entire ZIP folder before running this script.
  pause
  exit /b 1
)

for /f "usebackq delims=" %%D in (`powershell -NoProfile -ExecutionPolicy Bypass -Command "[Environment]::GetFolderPath('MyDocuments')"`) do set "DOCS=%%D"
if not defined DOCS set "DOCS=%USERPROFILE%\Documents"
set "DEST=%DOCS%\obs-virtual-deck"

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$src = [System.IO.Path]::GetFullPath($env:SRC); " ^
  "$dest = [System.IO.Path]::GetFullPath($env:DEST); " ^
  "if ($src.TrimEnd('\') -ine $dest.TrimEnd('\')) { " ^
  "  New-Item -ItemType Directory -Force -Path (Join-Path $dest 'deck') | Out-Null; " ^
  "  Copy-Item -LiteralPath (Join-Path $src 'deck.html') -Destination $dest -Force; " ^
  "  Get-ChildItem -LiteralPath (Join-Path $src 'deck') | Copy-Item -Destination (Join-Path $dest 'deck') -Recurse -Force; " ^
  "  if (Test-Path -LiteralPath (Join-Path $src 'README.md')) { Copy-Item -LiteralPath (Join-Path $src 'README.md') -Destination $dest -Force }; " ^
  "}; " ^
  "$url = (New-Object System.Uri((Join-Path $dest 'deck.html'))).AbsoluteUri; " ^
  "Set-Clipboard -Value $url; " ^
  "Write-Output $url" > "%TEMP%\obs_deck_url.tmp"

if errorlevel 1 (
  echo [ERROR] Installation failed. Try copying the obs-virtual-deck folder manually to Documents.
  if exist "%TEMP%\obs_deck_url.tmp" del "%TEMP%\obs_deck_url.tmp" >nul 2>&1
  pause
  exit /b 1
)

set /p DECK_URL=<"%TEMP%\obs_deck_url.tmp"
del "%TEMP%\obs_deck_url.tmp" >nul 2>&1

echo.
echo ============================================================
echo   OBS Virtual Deck installed to:
echo   %DEST%
echo.
echo   URL copied to your clipboard:
echo   %DECK_URL%
echo ============================================================
echo.
echo Next steps in OBS Studio:
echo   1. Docks -^> Custom Browser Docks... -^> paste the URL (Ctrl+V).
echo   2. Tools -^> WebSocket Server Settings -^> Enable WebSocket server (Port 4455).
echo.
pause
