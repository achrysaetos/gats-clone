#!/usr/bin/env bash
# Usage: doctor.sh <run-dir>   Read-only: is the instance this run started worth driving?
set -uo pipefail
RUN="${1:?usage: doctor.sh <run-dir>}"
REPO="$(cd "$(dirname "$0")/../../../.." && pwd)"
fail=0
check() { if eval "$2"; then echo "ok   $1"; else echo "FAIL $1"; fail=1; fi; }
PID="$(cat "$RUN/pid" 2>/dev/null)"; PORT="$(cat "$RUN/port" 2>/dev/null)"
check "run dir has pid and port" '[[ -n "$PID" && -n "$PORT" ]]'
check "server process $PID alive" 'kill -0 "$PID" 2>/dev/null'
check "port $PORT owned by pid $PID" 'lsof -nP -iTCP:"$PORT" -sTCP:LISTEN -t 2>/dev/null | grep -qx "$PID"'
check "four rooms (ffa, tdm, dom, br) answer" 'curl -fs "http://localhost:$PORT/api/servers" | grep -q "\"br\""'
check "client bundle served" 'curl -fs "http://localhost:$PORT/game.js" -o /dev/null'
check "bundle newer than client source" '[[ -z "$(find "$REPO/src" -newer "$REPO/public/game.js" -name "*.ts" | head -1)" ]]'
exit $fail
