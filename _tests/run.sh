#!/usr/bin/env bash
# Run every test. Starts the local web server the browser tests need,
# stops it again whatever happens, and exits non-zero if anything failed.
set -u

cd "$(dirname "$0")/.."
ROOT="$PWD"
PORT="${CLPPS_TEST_PORT:-8731}"
export CLPPS_TEST_PORT="$PORT"

if [ ! -d _tests/node_modules/playwright-core ]; then
  echo "Installing playwright-core (one time, ~2MB, no browser download)..."
  ( cd _tests && npm install --silent --no-audit --no-fund ) || {
    echo "npm install failed. The browser tests cannot run without it."; exit 1; }
fi
export NODE_PATH="$ROOT/_tests/node_modules"

# The stamp check first: it is instant, and a stale stamp means somebody's
# browser can pair a new page with an old price list.
echo "== asset version stamps =="
python3 tools/stamp-assets.py --check || { echo; echo "Run: python3 tools/stamp-assets.py"; exit 1; }

SERVER=""
if curl -sf -o /dev/null "http://127.0.0.1:$PORT/pricing.js"; then
  echo "== using the server already on port $PORT =="
else
  python3 -m http.server "$PORT" >/dev/null 2>&1 &
  SERVER=$!
  for _ in $(seq 1 40); do
    curl -sf -o /dev/null "http://127.0.0.1:$PORT/pricing.js" && break
    sleep 0.25
  done
fi
cleanup() { [ -n "$SERVER" ] && kill "$SERVER" 2>/dev/null; }
trap cleanup EXIT INT TERM

if ! curl -sf -o /dev/null "http://127.0.0.1:$PORT/pricing.js"; then
  echo "Could not serve the site on port $PORT."; exit 1
fi

pass=0; fail=0; failed=""
for f in _tests/test-*.js; do
  name="$(basename "$f")"
  echo
  echo "== $name =="
  if out="$(node "$f" 2>&1)"; then
    pass=$((pass+1))
    echo "$out" | tail -1
  else
    fail=$((fail+1)); failed="$failed $name"
    echo "$out" | grep -E '^FAIL|FAILURES|^ ' || echo "$out" | tail -20
  fi
done

echo
echo "================================"
echo "  $pass file(s) passed, $fail failed"
[ -n "$failed" ] && echo "  failing:$failed"
echo "================================"
[ "$fail" -eq 0 ] || exit 1
