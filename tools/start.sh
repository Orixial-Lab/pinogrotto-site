#!/bin/sh
# Start the local test server: tools/start.sh [database-file]
# Serves public/ and runs functions/api on Node 22+, with D1 emulated on SQLite.
cd "$(dirname "$0")/.."
cp 'functions/api/[[path]].js' tools/.fn.mjs
[ -f tools/.pid ] && kill "$(cat tools/.pid)" 2>/dev/null
sleep 0.3
DB_FILE="${1:-:memory:}" nohup node tools/devserver.mjs > tools/.dev.log 2>&1 &
echo $! > tools/.pid
echo "PinoGrotto running on http://localhost:8788 (signed in as a test Steward)"
