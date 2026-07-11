#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PID_FILE="$ROOT_DIR/finance-tracker.pid"
BACKUP_DIR="$ROOT_DIR/backups"
PORT="${PORT:-4000}"

cd "$ROOT_DIR"

if [ ! -f "$PID_FILE" ]; then
  PID="$(lsof -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null | head -n 1 || true)"
  if [ -z "$PID" ]; then
    echo "No finance-tracker.pid file found, and nothing is listening on port $PORT."
    echo "If the app is running in a foreground Terminal, press Ctrl+C there."
    exit 0
  fi
  echo "$PID" > "$PID_FILE"
else
  PID="$(cat "$PID_FILE")"
fi

if ! kill -0 "$PID" 2>/dev/null; then
  echo "Stored PID $PID is not running. Removing stale PID file."
  rm -f "$PID_FILE"
  exit 0
fi

echo "Stopping Financial Tracker (PID $PID)..."
kill -TERM "$PID"

for _ in {1..30}; do
  if ! kill -0 "$PID" 2>/dev/null; then
    rm -f "$PID_FILE"
    echo "Financial Tracker stopped."
    LATEST_BACKUP="$(ls -t "$BACKUP_DIR"/finance-*.db 2>/dev/null | head -n 1 || true)"
    if [ -n "$LATEST_BACKUP" ]; then
      echo "Latest backup: $LATEST_BACKUP"
    fi
    exit 0
  fi
  sleep 1
done

echo "The app did not stop within 30 seconds."
echo "I did not force-kill it, because force-kill can skip the shutdown backup."
exit 1
