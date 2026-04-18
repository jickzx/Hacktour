#!/usr/bin/env bash
# Starts the Hacktour backend and the Expo mobile app together.
# Usage:
#   ./start.sh            # LAN mode — phone must be on same wifi
#   ./start.sh --tunnel   # Public tunnel — phone can be on any network
#
# Tunnel mode uses localtunnel by default (no signup, no auth token needed).
# If NGROK_AUTHTOKEN is set in env or .env, ngrok is used instead.
set -e

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

TUNNEL=false
[[ "${1:-}" == "--tunnel" || "${1:-}" == "-t" ]] && TUNNEL=true

BACKEND_PID=""
MOBILE_PID=""
TUN_PID=""
TUN_LOG=""

cleanup() {
  echo ""
  echo "[start] shutting down…"
  [[ -n "$MOBILE_PID" ]] && kill "$MOBILE_PID" 2>/dev/null || true
  [[ -n "$BACKEND_PID" ]] && kill "$BACKEND_PID" 2>/dev/null || true
  [[ -n "$TUN_PID" ]] && kill "$TUN_PID" 2>/dev/null || true
  [[ -n "$TUN_LOG" ]] && rm -f "$TUN_LOG"
  wait 2>/dev/null || true
}
trap cleanup INT TERM EXIT

check_port() {
  local port=$1 label=$2
  if ss -ltn "sport = :$port" 2>/dev/null | grep -q LISTEN; then
    echo "[start] port $port ($label) is already in use."
    if fuser -k "$port/tcp" 2>/dev/null; then
      echo "[start]   → killed previous listener."
      sleep 1
    else
      echo "[start]   → couldn't free it (likely owned by another user)."
      echo "[start]     run:  sudo fuser -k $port/tcp"
      exit 1
    fi
  fi
}
check_port 3001 backend
check_port 8081 expo

if [ ! -d "backend/node_modules" ]; then
  echo "[start] installing backend deps…"
  (cd backend && npm install)
fi
if [ ! -d "mobile/node_modules" ]; then
  echo "[start] installing mobile deps…"
  (cd mobile && npm install)
fi

echo "[start] launching backend on :3001 …"
(cd backend && npm run dev) &
BACKEND_PID=$!

# Wait for backend to respond
for i in $(seq 1 40); do
  if curl -sf http://localhost:3001/api/health >/dev/null 2>&1; then
    echo "[start] backend is ready."
    break
  fi
  sleep 0.5
done

BACKEND_URL="http://localhost:3001"

if $TUNNEL; then
  # Source .env so NGROK_AUTHTOKEN (if present) is picked up
  if [ -f .env ] && grep -q "^NGROK_AUTHTOKEN=" .env && [ -z "${NGROK_AUTHTOKEN:-}" ]; then
    export "$(grep '^NGROK_AUTHTOKEN=' .env | tail -1)"
  fi

  if [ -n "${NGROK_AUTHTOKEN:-}" ]; then
    # ── ngrok path (requires token) ─────────────────────────────────────────
    check_port 4040 "ngrok web API"
    echo "[start] opening public tunnel via ngrok …"
    TUN_LOG=$(mktemp)
    npx --yes ngrok http 3001 --log=stdout --log-format=json --log-level=info > "$TUN_LOG" 2>&1 &
    TUN_PID=$!
    for i in $(seq 1 60); do
      tunnels=$(curl -sf http://localhost:4040/api/tunnels 2>/dev/null || true)
      if [ -n "$tunnels" ]; then
        url=$(echo "$tunnels" | grep -oE '"public_url":"https://[^"]+"' | head -1 | sed -E 's/.*"(https:[^"]+)".*/\1/')
        if [ -n "$url" ]; then BACKEND_URL="$url"; break; fi
      fi
      if grep -qi "ERR_NGROK\|authtoken\|failed to start tunnel" "$TUN_LOG" 2>/dev/null; then
        echo "[start] ngrok error:"; grep -i "ERR\|authtoken\|failed" "$TUN_LOG" | head -5; exit 1
      fi
      sleep 0.5
    done
    [ "$BACKEND_URL" = "http://localhost:3001" ] && { echo "[start] timed out waiting for ngrok URL. Log:"; tail -20 "$TUN_LOG"; exit 1; }
    echo "[start] ngrok inspector: http://localhost:4040"
  else
    # ── localtunnel path (no signup, no token) ──────────────────────────────
    echo "[start] opening public tunnel via localtunnel (no auth required) …"
    TUN_LOG=$(mktemp)
    npx --yes localtunnel --port 3001 > "$TUN_LOG" 2>&1 &
    TUN_PID=$!
    for i in $(seq 1 60); do
      url=$(grep -oE "https://[a-z0-9-]+\.loca\.lt" "$TUN_LOG" 2>/dev/null | head -1)
      if [ -n "$url" ]; then BACKEND_URL="$url"; break; fi
      sleep 0.5
    done
    [ "$BACKEND_URL" = "http://localhost:3001" ] && { echo "[start] localtunnel failed. Log:"; tail -20 "$TUN_LOG"; exit 1; }
  fi

  echo "[start] backend tunnel: $BACKEND_URL"
fi

export EXPO_PUBLIC_BACKEND_URL="$BACKEND_URL"
echo "[start] EXPO_PUBLIC_BACKEND_URL=$BACKEND_URL"

if $TUNNEL; then
  echo "[start] launching Expo with --tunnel …"
  (cd mobile && EXPO_PUBLIC_BACKEND_URL="$BACKEND_URL" npm run tunnel) &
else
  echo "[start] launching Expo (LAN) …"
  (cd mobile && EXPO_PUBLIC_BACKEND_URL="$BACKEND_URL" npm start) &
fi
MOBILE_PID=$!

wait
