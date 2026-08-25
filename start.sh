#!/usr/bin/env bash
set -e

echo "Starting Print API on port 3001..."
node server/index.js &
API_PID=$!

cleanup() {
  echo "Shutting down..."
  kill $API_PID 2>/dev/null || true
  exit 0
}
trap cleanup INT TERM

echo "Starting frontend on port 5000..."
npx vite --port 5000 --host 0.0.0.0

cleanup
