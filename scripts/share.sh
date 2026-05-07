#!/usr/bin/env bash
set -uo pipefail

NGROK_DOMAIN="${NGROK_DOMAIN:-think-basin-scouring.ngrok-free.dev}"
VITE_PORT="${VITE_PORT:-5173}"
NGROK_BIN="${NGROK_BIN:-$HOME/bin/ngrok}"

if ! [[ -x "$NGROK_BIN" ]]; then
  if command -v ngrok >/dev/null 2>&1; then
    NGROK_BIN=$(command -v ngrok)
  else
    echo "ngrok not found at $NGROK_BIN or on PATH" >&2
    exit 1
  fi
fi

if ! systemctl --user is-active --quiet bnb-api.service; then
  echo "warning: bnb-api.service is not running; DailyTrades will error" >&2
fi

cd "$(dirname "$0")/.."

VITE_PID=""
NGROK_PID=""

cleanup() {
  echo
  echo "shutting down"
  [[ -n "$VITE_PID"  ]] && kill -TERM "$VITE_PID"  2>/dev/null || true
  [[ -n "$NGROK_PID" ]] && kill -TERM "$NGROK_PID" 2>/dev/null || true
  wait 2>/dev/null || true
}
trap cleanup INT TERM EXIT

echo "starting vite on :$VITE_PORT"
npm run dev >/tmp/bnb-share-vite.log 2>&1 &
VITE_PID=$!

for _ in {1..40}; do
  if curl -sf "http://localhost:$VITE_PORT" >/dev/null 2>&1; then break; fi
  sleep 0.25
done

if ! kill -0 "$VITE_PID" 2>/dev/null; then
  echo "vite failed to start; see /tmp/bnb-share-vite.log" >&2
  exit 1
fi

echo "starting ngrok tunnel"
"$NGROK_BIN" http --url="$NGROK_DOMAIN" "$VITE_PORT" --log=stdout --log-level=warn >/tmp/bnb-share-ngrok.log 2>&1 &
NGROK_PID=$!

sleep 1.5
if ! kill -0 "$NGROK_PID" 2>/dev/null; then
  echo "ngrok failed to start; see /tmp/bnb-share-ngrok.log" >&2
  exit 1
fi

cat <<EOF

  ready: https://$NGROK_DOMAIN/bnb_wallet_app/

  vite log:  tail -f /tmp/bnb-share-vite.log
  ngrok log: tail -f /tmp/bnb-share-ngrok.log

  Ctrl+C to stop both.

EOF

wait
