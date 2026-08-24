#!/usr/bin/env bash
# Launch Windows Chrome with a dedicated profile + remote debugging,
# so Pi's chrome-devtools MCP can attach on 127.0.0.1:9222.
set -euo pipefail
CHROME='/mnt/c/Program Files/Google/Chrome/Application/chrome.exe'
PROFILE='/mnt/c/Users/Public/soit-chrome-debug'
PORT=9222

if [[ ! -x "$CHROME" ]]; then
  echo "Chrome not found at $CHROME"
  exit 1
fi

mkdir -p "$PROFILE"
# Separate profile: a normal Chrome already running cannot open 9222.
"$CHROME" \
  --remote-debugging-port="$PORT" \
  --remote-debugging-address=127.0.0.1 \
  --user-data-dir='C:\Users\Public\soit-chrome-debug' \
  --no-first-run \
  --no-default-browser-check \
  'https://ai.explore.poker/chat' &

echo "Chrome debug → http://127.0.0.1:${PORT}"
echo "Then in Pi: /reload   and open Explore in that window."
