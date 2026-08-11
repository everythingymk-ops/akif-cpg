#!/bin/bash
# Double-click to run Akif CPG from the static bundle in ./out — no npm, no
# dev server. Rebuild the bundle with: npm run export:static
cd "$(dirname "$0")" || exit 1

if [ ! -f "out/index.html" ]; then
  echo "Static bundle not found. Build it first:"
  echo "  npm run export:static"
  echo
  read -r -p "Press Enter to close..."
  exit 1
fi

PORT=4173
while lsof -ti :$PORT >/dev/null 2>&1; do
  PORT=$((PORT + 1))
done

python3 -m http.server "$PORT" --directory out >/dev/null 2>&1 &
SERVER_PID=$!
trap 'kill $SERVER_PID 2>/dev/null' EXIT

sleep 1
open "http://localhost:$PORT/"

echo "Akif CPG — Pricing Architect"
echo "Running at http://localhost:$PORT"
echo
echo "Close this window (or press Ctrl+C) to stop."
wait $SERVER_PID
