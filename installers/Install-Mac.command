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

DEST_DIR="$HOME/Documents/obs-virtual-deck"
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

DECK_URL="file://$(url_encode_path "$DEST_REAL/deck.html")"
printf '%s' "$DECK_URL" | pbcopy

echo ""
echo "============================================================"
echo "  OBS Virtual Deck installed to:"
echo "  $DEST_DIR"
echo ""
echo "  URL copied to your clipboard:"
echo "  $DECK_URL"
echo "============================================================"
echo ""
echo "Next steps in OBS Studio:"
echo "  1. Docks -> Custom Browser Docks... -> paste the URL (Cmd+V)."
echo "  2. Tools -> WebSocket Server Settings -> Enable WebSocket server (Port 4455)."
echo ""
if [ -t 0 ]; then
  read -r -p "Press Enter to close..."
fi
