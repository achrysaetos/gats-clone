#!/usr/bin/env bash
# Measures what each GPU-heavy quality knob costs on this machine: one frametime run per row at 2560x1440 and 2x DPR, pinned to
# high with a single knob changed, then medium and low, and prints one line per row. Usage: gpu-matrix.sh <run-dir> [seconds]
set -euo pipefail
RUN="$1"; SECONDS_PER=${2:-20}
HERE="$(cd "$(dirname "$0")" && pwd)"
"$HERE/launch.sh" "$RUN" >/dev/null
rows=(
  "high|"
  "high|glowClamp:0"
  "high|bloomDiv:null"
  "high|glowScale:0.5"
  "high|renderScale:0.75"
  "high|renderScale:0.75,glowScale:0.5"
  "medium|"
  "low|"
)
printf '%-40s %8s %8s %8s %10s\n' row raf_p50 raf_p95 raf_p99 cost_p95
for row in "${rows[@]}"; do
  q=${row%%|*}; knobs=${row#*|}
  QUALITY=$q KNOBS=$knobs DPR=2 node "$HERE/frametime.ts" "$RUN" "$SECONDS_PER" 2560 1440 >/dev/null 2>&1 || true
  log="$RUN/evidence/frametime.log"
  raf=$(grep '^raf interval' "$log" | tail -1); cost=$(grep '^frame cost' "$log" | tail -1)
  pick() { sed -n "s/.* $1=\([0-9.]*\).*/\1/p" <<<"$2"; }
  printf '%-40s %8s %8s %8s %10s\n' "$q ${knobs:-(as is)}" "$(pick p50 "$raf")" "$(pick p95 "$raf")" "$(pick p99 "$raf")" "$(pick p95 "$cost")"
done
"$HERE/cleanup.sh" "$RUN" >/dev/null
