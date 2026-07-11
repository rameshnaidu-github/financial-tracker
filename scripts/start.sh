#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PID_FILE="$ROOT_DIR/finance-tracker.pid"
LOG_FILE="$ROOT_DIR/finance-tracker.log"
NODE_DIR="${FINANCE_NODE_DIR:-/Users/rameshchills/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin}"
NODE_BIN="${FINANCE_NODE_BIN:-$NODE_DIR/node}"
PNPM_BIN="${FINANCE_PNPM_BIN:-}"
PORT="${PORT:-4000}"

if [ -z "$PNPM_BIN" ]; then
  if command -v pnpm >/dev/null 2>&1; then
    PNPM_BIN="$(command -v pnpm)"
  else
    PNPM_BIN="/Users/rameshchills/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback/pnpm"
  fi
fi

detect_lan_ip() {
  if [ -n "${FINANCE_LAN_IP:-}" ]; then
    echo "$FINANCE_LAN_IP"
    return
  fi

  LAN_IP="$(ifconfig en0 2>/dev/null | awk '/inet / { print $2; exit }' || true)"
  if [ -n "$LAN_IP" ]; then
    echo "$LAN_IP"
    return
  fi

  ifconfig 2>/dev/null | awk '/inet / && $2 != "127.0.0.1" { print $2; exit }' || true
}

print_urls() {
  echo "Local URL: http://127.0.0.1:$PORT"
  LAN_IP="$(detect_lan_ip)"
  if [ -n "$LAN_IP" ]; then
    echo "LAN URL:   http://$LAN_IP:$PORT"
    echo "Note: use the LAN URL shown here; Wi-Fi IP addresses can change."
  else
    echo "LAN URL:   Could not detect Wi-Fi IP. Check System Settings > Wi-Fi > Details."
  fi
}

health_ok() {
  command -v curl >/dev/null 2>&1 && curl -fsS "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1
}

api_contract_ok() {
  command -v curl >/dev/null 2>&1 &&
    curl -fsS "http://127.0.0.1:$PORT/api/bootstrap" 2>/dev/null | grep -q '"categoryTypes"'
}

listener_pid() {
  lsof -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null | head -n 1 || true
}

stop_process() {
  PID_TO_STOP="$1"
  REASON="$2"

  echo "$REASON"
  echo "Stopping existing Financial Tracker process (PID $PID_TO_STOP)..."
  kill -TERM "$PID_TO_STOP"

  for _ in {1..30}; do
    if ! kill -0 "$PID_TO_STOP" 2>/dev/null; then
      rm -f "$PID_FILE"
      echo "Existing process stopped."
      return 0
    fi
    sleep 1
  done

  echo "The existing app did not stop within 30 seconds."
  echo "I did not force-kill it, because force-kill can skip the shutdown backup."
  exit 1
}

cd "$ROOT_DIR"

if [ -f "$PID_FILE" ]; then
  PID="$(cat "$PID_FILE")"
  if kill -0 "$PID" 2>/dev/null; then
    if health_ok && api_contract_ok; then
      echo "Financial Tracker is already running on port $PORT (PID $PID)."
      print_urls
      exit 0
    fi
    stop_process "$PID" "Existing process is running, but it does not match the current app API. Restarting it."
  else
    rm -f "$PID_FILE"
  fi
fi

if health_ok; then
  RUNNING_PID="$(listener_pid)"
  if api_contract_ok; then
    if [ -n "$RUNNING_PID" ]; then
      echo "$RUNNING_PID" > "$PID_FILE"
      echo "Financial Tracker is already running on port $PORT (PID $RUNNING_PID)."
    else
      echo "Financial Tracker is already running on port $PORT."
    fi
    print_urls
    exit 0
  fi

  if [ -n "$RUNNING_PID" ]; then
    stop_process "$RUNNING_PID" "A stale Financial Tracker process is already using port $PORT. Restarting it."
  else
    echo "Port $PORT is serving health checks but no listener PID was found."
    echo "Please stop the process using that port, then retry."
    exit 1
  fi
fi

if [ ! -x "$PNPM_BIN" ]; then
  echo "Could not find pnpm at: $PNPM_BIN"
  echo "Set FINANCE_PNPM_BIN to your pnpm path, then retry."
  exit 1
fi

if [ ! -x "$NODE_BIN" ]; then
  echo "Could not find node at: $NODE_BIN"
  echo "Set FINANCE_NODE_BIN to your node path, then retry."
  exit 1
fi

if [ "${SKIP_BUILD:-0}" != "1" ]; then
  echo "Building latest app..."
  CI=true PATH="$NODE_DIR:$PATH" "$PNPM_BIN" build
fi

echo "Starting Financial Tracker on port $PORT..."
NODE_NO_WARNINGS=1 PORT="$PORT" PATH="$NODE_DIR:$PATH" nohup "$NODE_BIN" server/index.ts > "$LOG_FILE" 2>&1 &
PID="$!"
echo "$PID" > "$PID_FILE"

STARTED=0
if command -v curl >/dev/null 2>&1; then
  for _ in {1..30}; do
    if curl -fsS "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1; then
      STARTED=1
      break
    fi
    if ! kill -0 "$PID" 2>/dev/null; then
      break
    fi
    sleep 1
  done
else
  sleep 2
  if kill -0 "$PID" 2>/dev/null; then
    STARTED=1
  fi
fi

if [ "$STARTED" != "1" ]; then
  rm -f "$PID_FILE"
  echo "Financial Tracker did not start successfully."
  echo "Recent log output:"
  tail -n 40 "$LOG_FILE" || true
  exit 1
fi

echo "Financial Tracker is running."
print_urls

if command -v tailscale >/dev/null 2>&1; then
  TAILSCALE_IP="$(tailscale ip -4 2>/dev/null | head -n 1 || true)"
  if [ -n "$TAILSCALE_IP" ]; then
    echo "Tailscale URL: http://$TAILSCALE_IP:$PORT"
  fi
fi

echo "PID file: $PID_FILE"
echo "Log file: $LOG_FILE"
