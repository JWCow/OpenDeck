@echo off
setlocal EnableExtensions

set "SRC=%~dp0"
if "%SRC:~-1%"=="\" set "SRC=%SRC:~0,-1%"

if not exist "%SRC%\deck.html" (
  echo [ERROR] Could not find deck.html next to Install-Windows.bat.
  echo Make sure you extracted the entire ZIP folder before running this script.
  if /i not "%OBS_DECK_NO_PAUSE%"=="1" pause
  exit /b 1
)
if not exist "%SRC%\deck\" (
  echo [ERROR] Could not find the deck\ folder next to Install-Windows.bat.
  echo Make sure you extracted the entire ZIP folder before running this script.
  if /i not "%OBS_DECK_NO_PAUSE%"=="1" pause
  exit /b 1
)

if defined OBS_DECK_DEST (
  set "DEST=%OBS_DECK_DEST%"
) else (
  for /f "usebackq delims=" %%D in (`powershell -NoProfile -ExecutionPolicy Bypass -Command "[Environment]::GetFolderPath('MyDocuments')"`) do set "DOCS=%%D"
  if not defined DOCS set "DOCS=%USERPROFILE%\Documents"
  set "DEST=%DOCS%\obs-virtual-deck"
)

set "INFO_TMP=%TEMP%\obs_deck_info_%RANDOM%.tmp"

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$src = [System.IO.Path]::GetFullPath($env:SRC); " ^
  "$dest = [System.IO.Path]::GetFullPath($env:DEST); " ^
  "if ($src.TrimEnd('\') -ine $dest.TrimEnd('\')) { " ^
  "  New-Item -ItemType Directory -Force -Path (Join-Path $dest 'deck') | Out-Null; " ^
  "  Copy-Item -LiteralPath (Join-Path $src 'deck.html') -Destination $dest -Force; " ^
  "  Get-ChildItem -LiteralPath (Join-Path $src 'deck') | Copy-Item -Destination (Join-Path $dest 'deck') -Recurse -Force; " ^
  "  if (Test-Path -LiteralPath (Join-Path $src 'README.md')) { Copy-Item -LiteralPath (Join-Path $src 'README.md') -Destination $dest -Force }; " ^
  "  if (Test-Path -LiteralPath (Join-Path $src 'scripts')) { " ^
  "    New-Item -ItemType Directory -Force -Path (Join-Path $dest 'scripts') | Out-Null; " ^
  "    Get-ChildItem -LiteralPath (Join-Path $src 'scripts') | Copy-Item -Destination (Join-Path $dest 'scripts') -Recurse -Force; " ^
  "  }; " ^
  "}; " ^
  "$wsFound = $false; $wsEnabled = $false; $wsPort = $null; $wsAuth = $false; $wsListening = $false; " ^
  "$cfgPath = if ($env:APPDATA) { Join-Path $env:APPDATA 'obs-studio\plugin_config\obs-websocket\config.json' } else { '' }; " ^
  "if ($cfgPath -and (Test-Path -LiteralPath $cfgPath)) { " ^
  "  $wsFound = $true; " ^
  "  try { " ^
  "    $cfg = Get-Content -LiteralPath $cfgPath -Raw -Encoding UTF8 | ConvertFrom-Json; " ^
  "    if ($null -ne $cfg.server_enabled) { $wsEnabled = [bool]$cfg.server_enabled }; " ^
  "    if ($null -ne $cfg.auth_required) { $wsAuth = [bool]$cfg.auth_required }; " ^
  "    $p = 0; " ^
  "    if ([int]::TryParse([string]$cfg.server_port, [ref]$p) -and $p -ge 1 -and $p -le 65535) { $wsPort = $p }; " ^
  "    if ($wsEnabled -and -not $wsPort) { $wsPort = 4455 }; " ^
  "  } catch {}; " ^
  "  $probePort = if ($wsPort) { $wsPort } else { 4455 }; " ^
  "  $tcp = New-Object System.Net.Sockets.TcpClient; " ^
  "  try { " ^
  "    $iar = $tcp.BeginConnect('127.0.0.1', $probePort, $null, $null); " ^
  "    if ($iar.AsyncWaitHandle.WaitOne(250, $false)) { $tcp.EndConnect($iar); $wsListening = $true }; " ^
  "  } catch {} finally { $tcp.Dispose() }; " ^
  "}; " ^
  "$url = (New-Object System.Uri((Join-Path $dest 'deck.html'))).AbsoluteUri; " ^
  "if ($wsPort) { $url = $url + '?port=' + $wsPort }; " ^
  "try { Set-Clipboard -Value $url } catch {}; " ^
  "$outPort = if ($wsPort) { $wsPort } else { '4455' }; " ^
  "@(\"DECK_URL=$url\", \"WS_FOUND=$wsFound\", \"WS_ENABLED=$wsEnabled\", \"WS_PORT=$outPort\", \"WS_AUTH=$wsAuth\", \"WS_LISTENING=$wsListening\") | Set-Content -LiteralPath $env:INFO_TMP -Encoding ASCII"

if errorlevel 1 (
  echo [ERROR] Installation failed. Try copying the obs-virtual-deck folder manually to Documents.
  if exist "%INFO_TMP%" del "%INFO_TMP%" >nul 2>&1
  if /i not "%OBS_DECK_NO_PAUSE%"=="1" pause
  exit /b 1
)

for /f "usebackq tokens=1,* delims==" %%A in ("%INFO_TMP%") do set "%%A=%%B"
del "%INFO_TMP%" >nul 2>&1

echo.
echo ============================================================
echo   OBS Virtual Deck installed to:
echo   %DEST%
echo.
echo   URL copied to your clipboard:
echo   %DECK_URL%
echo.
if /i "%WS_FOUND%"=="True" (
  if /i "%WS_ENABLED%"=="True" (
    if /i "%WS_LISTENING%"=="True" (
      echo   OBS WebSocket: ENABLED and listening on port %WS_PORT%.
    ) else (
      echo   OBS WebSocket: ENABLED in OBS config ^(port %WS_PORT%; start OBS to connect^).
    )
    if /i "%WS_AUTH%"=="True" (
      echo   Authentication: Enabled in OBS ^(enter your password in the WS bar^).
    )
  ) else (
    echo   OBS WebSocket: NOT YET ENABLED ^(configured port: %WS_PORT%^).
  )
) else (
  echo   OBS WebSocket: Config not found yet ^(OBS Studio may not have saved settings^).
)
echo ============================================================
echo.
echo Next steps in OBS Studio:
echo   1. Docks -^> Custom Browser Docks... -^> paste the URL ^(Ctrl+V^).
if /i "%WS_FOUND%"=="True" (
  if /i "%WS_ENABLED%"=="True" (
    echo   2. OBS WebSocket is already enabled on port %WS_PORT% - open the dock and click Connect!
  ) else (
    echo   2. Tools -^> WebSocket Server Settings -^> check "Enable WebSocket server" ^(Port %WS_PORT%^).
  )
) else (
  echo   2. Tools -^> WebSocket Server Settings -^> Enable WebSocket server ^(Port 4455^).
)
echo.
echo Phone Deck (LAN Control):
echo   To control OBS from your phone or tablet on Wi-Fi:
echo   node "%DEST%\scripts\lan-helper.mjs" --obs-port=%WS_PORT%
where node >nul 2>&1
if not errorlevel 1 (
  if /i "%OBS_DECK_START_LAN%"=="1" (
    start "OpenDeck Phone Helper" node "%DEST%\scripts\lan-helper.mjs" --obs-port=%WS_PORT%
  )
)
echo.
if /i not "%OBS_DECK_NO_PAUSE%"=="1" pause
