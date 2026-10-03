#!/usr/bin/env bash
# Usage: cleanup.sh <run-dir>   Stops only the server this run started. Keeps <run-dir>/evidence.
set -uo pipefail
RUN="${1:?usage: cleanup.sh <run-dir>}"
if [[ -f "$RUN/pid" ]]; then
  PID="$(cat "$RUN/pid")"
  kill "$PID" 2>/dev/null && for _ in $(seq 1 25); do kill -0 "$PID" 2>/dev/null || break; sleep 0.2; done
  kill -0 "$PID" 2>/dev/null && kill -9 "$PID"
fi
rm -rf "$RUN/data" "$RUN/pid" "$RUN/port"
echo "stopped; evidence kept in $RUN/evidence"
