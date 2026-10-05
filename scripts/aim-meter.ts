/// <reference types="node" />
// Usage: node scripts/aim-meter.ts [modes=FFA,TDM] [minutes=3] [seeds=2]
// Measures how bots' guns turn as a client sees them: every bot's angle is read from snapshots sent through the real wire encoder.
import { WORLD, type ModeId } from '../src/shared/defs.ts';
import { ROTATION } from '../src/shared/maps.ts';
import type { SnapshotWire } from '../src/shared/protocol.ts';
import { addPlayer, canRespawn, respawn, setInput, step } from '../src/shared/sim.ts';
import { snapshotFor } from '../src/shared/sim/snapshot.ts';
import { choosePick } from '../src/shared/sim/stats.ts';
import { createWorld, rand } from '../src/shared/sim/world.ts';
import { fillSnapshot, makeSnapshotEncoder } from '../src/shared/wire.ts';
import { botThink, newBotMemory, randomLoadout, type BotMemory } from '../src/server/bots.ts';
import { arenaFor } from '../src/server/bot/arena.ts';

const modes = (process.argv[2] ?? 'FFA,TDM').split(',').filter(Boolean) as Exclude<ModeId, 'ZOM'>[];
const minutes = Number(process.argv[3] ?? 3);
const seeds = Number(process.argv[4] ?? 2);
const TICK_MS = 1000 / WORLD.tickHz;
const DEG = 180 / Math.PI;
/** A deliberate flick: the ticks just after a bot takes or drops a target, long enough to cover a reaction and the turn. */
const FLICK_MS = 700;
/** Two wire quanta (0.01 rad), so rounding alone never reads as a reversal. */
const REVERSAL_DEG = 1.2;
const SWING_DEG = 30;

type Track = { angle: number | null; lastDelta: number; target: number | null; targetSince: number; awaitingShot: boolean };
type Tally = { deltas: number[]; calmDeltas: number[]; calmTicks: number; reversals: number; idleTicks: number; idleReversals: number; swings: number; flickPeaks: number[]; firstShotMs: number[] };
const emptyTally = (): Tally => ({ deltas: [], calmDeltas: [], calmTicks: 0, reversals: 0, idleTicks: 0, idleReversals: 0, swings: 0, flickPeaks: [], firstShotMs: [] });

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const targetOf = (mem: BotMemory) => mem.motor.engaged?.id ?? null;

function play(mode: Exclude<ModeId, 'ZOM'>, map: (typeof ROTATION)['FFA'][number], seed: number, t: Tally) {
  const w = createWorld(mode, seed, map);
  w.mapChangeAt = Infinity;
  const r = () => rand(w);
  const mems = new Map<number, BotMemory>();
  for (let i = 0; i < WORLD.minPlayers; i++) mems.set(addPlayer(w, `bot${i}`, randomLoadout(r)).id, newBotMemory(r));
  const wires = new Map([...mems.keys()].map((id) => [id, { encode: makeSnapshotEncoder(), last: null as ReturnType<typeof fillSnapshot> }]));
  const tracks = new Map<number, Track>([...mems.keys()].map((id) => [id, { angle: null, lastDelta: 0, target: null, targetSince: -Infinity, awaitingShot: false }]));
  const flickPeak = new Map<number, number>();
  for (let tick = 0; tick < (minutes * 60_000) / TICK_MS; tick++) {
    if (w.match.k === 'over') break;
    const arena = arenaFor(w);
    for (const [id, mem] of mems) {
      const snap = snapshotFor(w, id);
      const wire = wires.get(id)!;
      const sent = fillSnapshot(JSON.parse(wire.encode(snap)) as SnapshotWire, wire.last);
      wire.last = sent;
      const me = sent?.players.find((p) => p.id === id);
      const tr = tracks.get(id)!;
      if (!me || !me.alive) tr.angle = null;
      else {
        if (tr.angle !== null) {
          const d = wrap(me.angle - tr.angle) * DEG;
          const ad = Math.abs(d);
          t.deltas.push(ad);
          if (w.now - tr.targetSince < FLICK_MS) flickPeak.set(id, Math.max(flickPeak.get(id) ?? 0, ad));
          else {
            const peak = flickPeak.get(id);
            if (peak !== undefined) { t.flickPeaks.push(peak); flickPeak.delete(id); }
            t.calmDeltas.push(ad);
            t.calmTicks++;
            if (ad > SWING_DEG) t.swings++;
            const reversed = ad >= REVERSAL_DEG && Math.abs(tr.lastDelta) >= REVERSAL_DEG && Math.sign(d) !== Math.sign(tr.lastDelta);
            if (reversed) t.reversals++;
            if (tr.target === null) { t.idleTicks++; if (reversed) t.idleReversals++; }
          }
          tr.lastDelta = d;
        }
        tr.angle = me.angle;
      }
      const d = botThink(snap, arena, mem, r);
      mems.set(id, d.mem);
      const target = targetOf(d.mem);
      if (target !== tr.target) { tr.target = target; tr.targetSince = w.now; tr.awaitingShot = target !== null; }
      setInput(w, id, w.tick, d.input);
      if (d.pick) choosePick(w, id, d.pick.level, d.pick.option);
      if (canRespawn(w, id)) respawn(w, id, randomLoadout(r));
    }
    step(w, TICK_MS);
    for (const e of w.events) {
      const tr = e.e === 'shot' ? tracks.get(e.owner) : undefined;
      if (!tr?.awaitingShot) continue;
      t.firstShotMs.push(w.now - tr.targetSince);
      tr.awaitingShot = false;
    }
  }
}

const quantile = (xs: number[], q: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))]! : NaN;
};
const f1 = (x: number) => x.toFixed(1);

function report(label: string, t: Tally) {
  const calmSec = (t.calmTicks * TICK_MS) / 1000;
  console.log([
    `  ${label.padEnd(12)}`,
    `per-tick deg p50 ${f1(quantile(t.deltas, 0.5))} p95 ${f1(quantile(t.deltas, 0.95))} p99 ${f1(quantile(t.deltas, 0.99))}`,
    `max ${Math.round(quantile(t.deltas, 1) * WORLD.tickHz)} deg/s`,
    `calm p99 ${f1(quantile(t.calmDeltas, 0.99))} max ${Math.round(quantile(t.calmDeltas, 1) * WORLD.tickHz)} deg/s`,
    `calm swings >${SWING_DEG}deg ${t.swings}`,
    `calm reversals ${(t.reversals / Math.max(1e-9, calmSec)).toFixed(2)}/s (idle ${(t.idleReversals / Math.max(1e-9, (t.idleTicks * TICK_MS) / 1000)).toFixed(2)}/s, ${Math.round((100 * t.idleTicks) / Math.max(1, t.calmTicks))}% of calm time)`,
    `new target to first shot p50 ${Math.round(quantile(t.firstShotMs, 0.5))}ms p90 ${Math.round(quantile(t.firstShotMs, 0.9))}ms`,
    `flick peak p50 ${Math.round(quantile(t.flickPeaks, 0.5) * WORLD.tickHz)} p95 ${Math.round(quantile(t.flickPeaks, 0.95) * WORLD.tickHz)} deg/s`,
  ].join('  '));
}

for (const mode of modes) {
  console.log(`${mode}, ${WORLD.minPlayers} bots, ${minutes} min x ${seeds} seeds per map`);
  const all = emptyTally();
  for (const map of ROTATION[mode]) {
    const t = emptyTally();
    for (let seed = 1; seed <= seeds; seed++) play(mode, map, seed, t);
    report(map, t);
    for (const k of Object.keys(t) as (keyof Tally)[]) {
      const v = t[k];
      if (Array.isArray(v)) (all[k] as number[]).push(...v); else (all[k] as number) += v;
    }
  }
  report('all', all);
}
