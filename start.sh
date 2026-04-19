#!/usr/bin/env bash
# Starts the Hacktour backend and the Expo mobile app together.
# Usage:
#   ./start.sh            # LAN mode — phone must be on same wifi
#   ./start.sh --tunnel   # Tunnel mode — phone can be on any network
set -e

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

TUNNEL=false
[[ "${1:-}" == "--tunnel" || "${1:-}" == "-t" ]] && TUNNEL=true

BACKEND_PID=""
MOBILE_PID=""
LT_PID=""
LT_LOG=""

get_lan_ip() {
  local ip
  if command -v ip >/dev/null 2>&1; then
    # Linux
    ip=$(ip -4 -o addr show scope global 2>/dev/null | awk '!/docker|br-/ { split($4, parts, "/"); print parts[1]; exit }')
    [ -z "$ip" ] && ip=$(ip -4 -o addr show scope global 2>/dev/null | awk 'NR==1 { split($4, parts, "/"); print parts[1] }')
  else
    # macOS — try common interfaces in order
    for iface in en0 en1 en2 en3; do
      ip=$(ipconfig getifaddr "$iface" 2>/dev/null)
      [ -n "$ip" ] && break
    done
  fi
  printf '%s' "$ip"
}

cleanup() {
  echo ""
  echo "[start] shutting down…"
  [[ -n "$MOBILE_PID" ]] && kill "$MOBILE_PID" 2>/dev/null || true
  [[ -n "$BACKEND_PID" ]] && kill "$BACKEND_PID" 2>/dev/null || true
  [[ -n "$LT_PID" ]] && kill "$LT_PID" 2>/dev/null || true
  [[ -n "$LT_LOG" ]] && rm -f "$LT_LOG"
  wait 2>/dev/null || true
}
trap cleanup INT TERM EXIT

check_port() {
  local port=$1 label=$2
  local pid
  pid=$(lsof -ti "tcp:$port" 2>/dev/null | head -1)
  if [ -n "$pid" ]; then
    echo "[start] port $port ($label) is already in use (pid $pid)."
    if kill "$pid" 2>/dev/null; then
      echo "[start]   → killed previous listener."
      sleep 1
    else
      echo "[start]   → couldn't free it (likely owned by another user)."
      echo "[start]     run:  sudo lsof -ti tcp:$port | xargs kill -9"
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

LAN_IP="$(get_lan_ip)"
if [ -z "$LAN_IP" ]; then
  echo "[start] could not detect a LAN IP for Expo."
  exit 1
fi

BACKEND_URL="http://${LAN_IP}:3001"

if $TUNNEL; then
  echo "[start] opening public tunnel to backend via localtunnel …"
  LT_LOG=$(mktemp)
  ( cd "$ROOT" && npx --yes localtunnel --port 3001 ) >"$LT_LOG" 2>&1 &
  LT_PID=$!
  # Poll stdout for the URL (format: "your url is: https://xxx.loca.lt")
  for i in $(seq 1 60); do
    url=$(grep -oE "https://[a-z0-9-]+\.loca\.lt" "$LT_LOG" 2>/dev/null | head -1)
    if [ -n "$url" ]; then
      BACKEND_URL="$url"
      break
    fi
    sleep 0.5
  done
  if [ -z "$url" ]; then
    echo "[start] failed to establish tunnel. Log:"
    cat "$LT_LOG"
    exit 1
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
