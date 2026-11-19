#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [ ! -f "$SCRIPT_DIR/deck.html" ] || [ ! -d "$SCRIPT_DIR/deck" ]; then
  echo "[ERROR] Could not find deck.html or deck/ next to Install-Mac.command."
  echo "Make sure you extracted the entire ZIP folder before running this script."
  if [ -t 0 ]; then
    read -r -p "Press Enter to close..."
  fi
  exit 1
fi

DEST_DIR="${OBS_DECK_DEST:-$HOME/Documents/obs-virtual-deck}"
SRC_REAL="$(cd "$SCRIPT_DIR" && pwd -P)"
mkdir -p "$DEST_DIR"
DEST_REAL="$(cd "$DEST_DIR" && pwd -P)"

if [ "$SRC_REAL" != "$DEST_REAL" ]; then
  mkdir -p "$DEST_DIR/deck"
  cp -f "$SCRIPT_DIR/deck.html" "$DEST_DIR/deck.html"
  cp -Rf "$SCRIPT_DIR/deck/." "$DEST_DIR/deck/"
  if [ -f "$SCRIPT_DIR/README.md" ]; then
    cp -f "$SCRIPT_DIR/README.md" "$DEST_DIR/README.md"
  fi
  if [ -d "$SCRIPT_DIR/scripts" ]; then
    mkdir -p "$DEST_DIR/scripts"
    cp -Rf "$SCRIPT_DIR/scripts/." "$DEST_DIR/scripts/"
  fi
fi

# Clear quarantine flag on the installed web assets if present
xattr -dr com.apple.quarantine "$DEST_DIR" >/dev/null 2>&1 || true

url_encode_path() {
  local LC_ALL=C
  local str="$1"
  local len=${#str}
  local out=""
  local i ch hex
  for (( i = 0; i < len; i++ )); do
    ch="${str:i:1}"
    case "$ch" in
      [a-zA-Z0-9.~_/-]) out+="$ch" ;;
      *) printf -v hex '%%%02X' "'$ch"
         out+="$hex" ;;
    esac
  done
  printf '%s' "$out"
}

OBS_WS_CFG="${OBS_WS_CONFIG:-$HOME/Library/Application Support/obs-studio/plugin_config/obs-websocket/config.json}"
WS_FOUND="false"
WS_ENABLED="false"
WS_PORT=""
WS_AUTH="false"
WS_LISTENING="false"

has_usable_python3() {
  local py_bin=""
  if command -v python3 >/dev/null 2>&1; then
    py_bin="$(command -v python3)"
  elif [ -x /usr/bin/python3 ]; then
    py_bin="/usr/bin/python3"
  else
    return 1
  fi
  # On macOS, /usr/bin/python3 is a stub that opens an Xcode CLT prompt unless CLT is installed
  if [ "$py_bin" = "/usr/bin/python3" ] && command -v xcode-select >/dev/null 2>&1; then
    xcode-select -p >/dev/null 2>&1 || return 1
  fi
  printf '%s' "$py_bin"
}

if [ -f "$OBS_WS_CFG" ]; then
  WS_FOUND="true"
  PY_BIN=""
  PARSED=""
  if PY_BIN="$(has_usable_python3)"; then
    PARSED="$("$PY_BIN" - "$OBS_WS_CFG" 2>/dev/null <<'PY' || true
import json, sys
try:
    with open(sys.argv[1], 'r', encoding='utf-8-sig') as f:
        cfg = json.load(f)
    enabled = bool(cfg.get('server_enabled', False))
    auth = bool(cfg.get('auth_required', False))
    raw_port = cfg.get('server_port', None)
    port = ''
    if isinstance(raw_port, int) or (isinstance(raw_port, str) and raw_port.isdigit()):
        p = int(raw_port)
        if 1 <= p <= 65535:
            port = str(p)
    if enabled and not port:
        port = '4455'
    print(f"{'true' if enabled else 'false'}|{port}|{'true' if auth else 'false'}")
except Exception:
    pass
PY
)"
  fi

  if [ -n "$PARSED" ]; then
    IFS='|' read -r WS_ENABLED WS_PORT WS_AUTH <<< "$PARSED"
  else
    # Lightweight shell JSON fallback (explicitly ignores server_password)
    COMPACT="$(tr -d '\r\n' < "$OBS_WS_CFG" 2>/dev/null || true)"
    if printf '%s' "$COMPACT" | grep -qE '"server_enabled"[[:space:]]*:[[:space:]]*true'; then
      WS_ENABLED="true"
    fi
    if printf '%s' "$COMPACT" | grep -qE '"auth_required"[[:space:]]*:[[:space:]]*true'; then
      WS_AUTH="true"
    fi
    RAW_PORT="$(printf '%s' "$COMPACT" | sed -nE 's/.*"server_port"[[:space:]]*:[[:space:]]*([0-9]+).*/\1/p' | head -n 1)"
    if [ -n "$RAW_PORT" ] && [ "$RAW_PORT" -ge 1 ] 2>/dev/null && [ "$RAW_PORT" -le 65535 ] 2>/dev/null; then
      WS_PORT="$RAW_PORT"
    elif [ "$WS_ENABLED" = "true" ]; then
      WS_PORT="4455"
    fi
  fi

  PROBE_PORT="${WS_PORT:-4455}"
  if command -v nc >/dev/null 2>&1; then
    if nc -z -G 1 127.0.0.1 "$PROBE_PORT" >/dev/null 2>&1 || nc -z -w 1 127.0.0.1 "$PROBE_PORT" >/dev/null 2>&1; then
      WS_LISTENING="true"
    fi
  fi
fi

DECK_URL="file://$(url_encode_path "$DEST_REAL/deck.html")"
if [ -n "$WS_PORT" ]; then
  DECK_URL="${DECK_URL}?port=${WS_PORT}"
fi

if command -v pbcopy >/dev/null 2>&1; then
  printf '%s' "$DECK_URL" | pbcopy
fi

DISPLAY_PORT="${WS_PORT:-4455}"

echo ""
echo "============================================================"
echo "  OBS Virtual Deck installed to:"
echo "  $DEST_DIR"
echo ""
echo "  URL copied to your clipboard:"
echo "  $DECK_URL"
echo ""
if [ "$WS_FOUND" = "true" ]; then
  if [ "$WS_ENABLED" = "true" ]; then
    if [ "$WS_LISTENING" = "true" ]; then
      echo "  OBS WebSocket: ENABLED and listening on port $DISPLAY_PORT."
    else
      echo "  OBS WebSocket: ENABLED in OBS config (port $DISPLAY_PORT; start OBS to connect)."
    fi
    if [ "$WS_AUTH" = "true" ]; then
      echo "  Authentication: Enabled in OBS (enter your password in the WS bar)."
    fi
  else
    echo "  OBS WebSocket: NOT YET ENABLED (configured port: $DISPLAY_PORT)."
  fi
else
  echo "  OBS WebSocket: Config not found yet (OBS Studio may not have saved settings)."
fi
echo "============================================================"
echo ""
echo "Next steps in OBS Studio:"
echo "  1. Docks -> Custom Browser Docks... -> paste the URL (Cmd+V)."
if [ "$WS_FOUND" = "true" ] && [ "$WS_ENABLED" = "true" ]; then
  echo "  2. OBS WebSocket is already enabled on port $DISPLAY_PORT - open the dock and click Connect!"
else
  echo "  2. Tools -> WebSocket Server Settings -> Enable WebSocket server (Port $DISPLAY_PORT)."
fi
echo ""
echo "Phone Deck (LAN Control):"
echo "  To control OBS from a phone or tablet on the same Wi-Fi:"
echo "  node \"$DEST_DIR/scripts/lan-helper.mjs\" --obs-port=\"$DISPLAY_PORT\""
if [ "${OBS_DECK_START_LAN:-0}" = "1" ]; then
  node "$DEST_DIR/scripts/lan-helper.mjs" --obs-port="$DISPLAY_PORT" &
fi
echo ""
if [ -t 0 ]; then
  read -r -p "Press Enter to close..."
fi
