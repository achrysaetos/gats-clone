/// <reference types="node" />
// Usage: node scripts/spasm-meter.ts [modes=FFA,TDM] [minutes=3] [seeds=2]
import { WORLD, type ModeId } from '../src/shared/defs.ts';
import { ROTATION } from '../src/shared/maps.ts';
import type { SnapshotWire } from '../src/shared/protocol.ts';
import { addPlayer, step } from '../src/shared/sim.ts';
import { createWorld, rand } from '../src/shared/sim/world.ts';
import { fillSnapshot, makeSnapshotEncoder } from '../src/shared/wire.ts';
import { newBotMemory, randomLoadout, type BotMemory } from '../src/server/bots.ts';
import { wrapAngle } from '../src/server/bot/aim.ts';
import { MIN_TURN_BACK_MS } from '../src/server/bot/motor.ts';
import { thinkBots } from '../src/server/bot/tick.ts';
import { quantile } from './lib/stats.ts';

const modes = (process.argv[2] ?? 'FFA,TDM').split(',').filter(Boolean) as Exclude<ModeId, 'ZOM'>[];
const minutes = Number(process.argv[3] ?? 3);
const seeds = Number(process.argv[4] ?? 2);
const TICK_MS = 1000 / WORLD.tickHz;
const DEG = 180 / Math.PI;
const FLICK_MS = 700;
const WIRE_ANGLE_STEP_DEG = 0.01 * DEG;
const REVERSAL_DEG = 2.5 * WIRE_ANGLE_STEP_DEG;
const SWING_DEG = 30;
const MOVING_PX = 1.5;
const MOVE_REVERSAL_DEG = 120;
const PAUSE_MS = 500;
const CAUSE_TICKS = 3;
const NEAR_GOAL_PX = 300;
const QUICK_MS = MIN_TURN_BACK_MS;

type Track = {
  angle: number | null; lastDelta: number; target: number | null; targetSince: number; awaitingShot: boolean;
  pos: { x: number; y: number } | null; heading: number | null; headingAt: number; lastReversal: number | null; causes: string[][];
};
type Tally = {
  deltas: number[]; calmDeltas: number[]; calmTicks: number; reversals: number; idleTicks: number; idleReversals: number; swings: number; flickPeaks: number[]; firstShotMs: number[];
  aliveTicks: number; moveReversals: number; reversalGaps: number[]; causes: Map<string, number>; quickCauses: Map<string, number>;
};
const emptyTally = (): Tally => ({
  deltas: [], calmDeltas: [], calmTicks: 0, reversals: 0, idleTicks: 0, idleReversals: 0, swings: 0, flickPeaks: [], firstShotMs: [],
  aliveTicks: 0, moveReversals: 0, reversalGaps: [], causes: new Map(), quickCauses: new Map(),
});
const freshTrack = (): Track => ({ angle: null, lastDelta: 0, target: null, targetSince: -Infinity, awaitingShot: false, pos: null, heading: null, headingAt: -Infinity, lastReversal: null, causes: [] });

const targetOf = (mem: BotMemory) => mem.motor.engaged?.id ?? null;
const near = (a: { x: number; y: number }, b: { x: number; y: number }, px: number) => Math.hypot(a.x - b.x, a.y - b.y) < px;

function causesOf(a: BotMemory, b: BotMemory, tick: number, me: { x: number; y: number }): string[] {
  const out: string[] = [];
  const ai = a.intent, bi = b.intent;
  if (ai && bi && bi.since !== ai.since) out.push(`intent ${ai.k}->${bi.k}`);
  if (ai?.k === 'peekAndHide' && bi?.k === 'peekAndHide' && ai.phase !== bi.phase) out.push(`peek phase ${ai.phase}->${bi.phase}`);
  const sa = a.motor.stance, sb = b.motor.stance;
  if (sa.step !== sb.step && bi) {
    const ended = sa.until <= tick ? 'ended' : 'cut short';
    out.push(bi.k === 'peekAndHide' ? `peek sway ${ended}` : `${bi.k} strafe leg ${ended}`);
  }
  if (b.motor.stuckTicks >= 3 || a.motor.stuckTicks >= 3) out.push('wall slide');
  const ra = a.motor.route, rb = b.motor.route;
  if (rb && (!ra || !near(ra.goal, rb.goal, 1))) out.push(`${bi?.k} goal moved${near(me, rb.goal, NEAR_GOAL_PX) ? ' near goal' : ''}${rb.partial ? ' (partial route)' : ''}`);
  else if (rb && ra && rb !== ra && rb.points.length > ra.points.length) out.push(`${bi?.k} replan${rb.partial ? ' (partial route)' : ''}`);
  else if (rb && ra && rb.points.length < ra.points.length) out.push('next waypoint');
  return out;
}

function play(mode: Exclude<ModeId, 'ZOM'>, map: (typeof ROTATION)['FFA'][number], seed: number, t: Tally) {
  const w = createWorld(mode, seed, map);
  w.mapChangeAt = Infinity;
  const r = () => rand(w);
  const mems = new Map<number, BotMemory>();
  for (let i = 0; i < WORLD.minPlayers; i++) mems.set(addPlayer(w, `bot${i}`, randomLoadout(r)).id, newBotMemory(r));
  const wires = new Map([...mems.keys()].map((id) => [id, { encode: makeSnapshotEncoder(), last: null as ReturnType<typeof fillSnapshot> }]));
  const tracks = new Map<number, Track>([...mems.keys()].map((id) => [id, freshTrack()]));
  const flickPeak = new Map<number, number>();
  for (let tick = 0; tick < (minutes * 60_000) / TICK_MS; tick++) {
    if (w.match.k === 'over') break;
    thinkBots(w, mems, r, { onDecision(id, snap, mem, decision) {
      const wire = wires.get(id)!;
      const sent = fillSnapshot(JSON.parse(wire.encode(snap)) as SnapshotWire, wire.last);
      wire.last = sent;
      const me = sent?.players.find((p) => p.id === id);
      const tr = tracks.get(id)!;
      if (!me || !me.alive) tracks.set(id, { ...freshTrack(), target: tr.target, targetSince: tr.targetSince });
      else {
        t.aliveTicks++;
        if (tr.angle !== null) {
          const d = wrapAngle(me.angle - tr.angle) * DEG;
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
        if (tr.pos && Math.hypot(me.x - tr.pos.x, me.y - tr.pos.y) >= MOVING_PX) {
          const heading = Math.atan2(me.y - tr.pos.y, me.x - tr.pos.x);
          if (tr.heading !== null && w.now - tr.headingAt <= PAUSE_MS && Math.abs(wrapAngle(heading - tr.heading)) * DEG > MOVE_REVERSAL_DEG) {
            t.moveReversals++;
            const cause = tr.causes.flat()[0] ?? 'other (body contact or a key change with no brain change)';
            t.causes.set(cause, (t.causes.get(cause) ?? 0) + 1);
            if (tr.lastReversal !== null) {
              t.reversalGaps.push(w.now - tr.lastReversal);
              if (w.now - tr.lastReversal < QUICK_MS) t.quickCauses.set(cause, (t.quickCauses.get(cause) ?? 0) + 1);
            }
            tr.lastReversal = w.now;
          }
          tr.heading = heading;
          tr.headingAt = w.now;
        }
        tr.pos = { x: me.x, y: me.y };
      }
      const now = tracks.get(id)!;
      if (me?.alive) now.causes = [causesOf(mem, decision.mem, snap.tick, me), ...now.causes].slice(0, CAUSE_TICKS);
      const target = targetOf(decision.mem);
      if (target !== now.target) { now.target = target; now.targetSince = w.now; now.awaitingShot = target !== null; }
    } });
    step(w, TICK_MS);
    for (const e of w.events) {
      const tr = e.e === 'shot' ? tracks.get(e.owner) : undefined;
      if (!tr?.awaitingShot) continue;
      t.firstShotMs.push(w.now - tr.targetSince);
      tr.awaitingShot = false;
    }
  }
}

const f1 = (x: number) => x.toFixed(1);

function report(label: string, t: Tally) {
  const calmSec = (t.calmTicks * TICK_MS) / 1000;
  const aliveSec = (t.aliveTicks * TICK_MS) / 1000;
  console.log([
    `  ${label.padEnd(12)} aim`,
    `per-tick deg p50 ${f1(quantile(t.deltas, 0.5))} p95 ${f1(quantile(t.deltas, 0.95))} p99 ${f1(quantile(t.deltas, 0.99))}`,
    `max ${Math.round(quantile(t.deltas, 1) * WORLD.tickHz)} deg/s`,
    `calm p99 ${f1(quantile(t.calmDeltas, 0.99))} max ${Math.round(quantile(t.calmDeltas, 1) * WORLD.tickHz)} deg/s`,
    `calm swings >${SWING_DEG}deg ${t.swings}`,
    `calm reversals ${(t.reversals / Math.max(1e-9, calmSec)).toFixed(2)}/s (idle ${(t.idleReversals / Math.max(1e-9, (t.idleTicks * TICK_MS) / 1000)).toFixed(2)}/s, ${Math.round((100 * t.idleTicks) / Math.max(1, t.calmTicks))}% of calm time)`,
    `new target to first shot p50 ${Math.round(quantile(t.firstShotMs, 0.5))}ms p90 ${Math.round(quantile(t.firstShotMs, 0.9))}ms`,
    `flick peak p50 ${Math.round(quantile(t.flickPeaks, 0.5) * WORLD.tickHz)} p95 ${Math.round(quantile(t.flickPeaks, 0.95) * WORLD.tickHz)} deg/s`,
  ].join('  '));
  console.log([
    `  ${''.padEnd(12)} move`,
    `reversals ${(t.moveReversals / Math.max(1e-9, aliveSec)).toFixed(2)}/s per bot`,
    `gap between reversals p1 ${Math.round(quantile(t.reversalGaps, 0.01))}ms p5 ${Math.round(quantile(t.reversalGaps, 0.05))}ms p50 ${Math.round(quantile(t.reversalGaps, 0.5))}ms`,
    `under ${QUICK_MS}ms ${(100 * t.reversalGaps.filter((g) => g < QUICK_MS).length / Math.max(1, t.reversalGaps.length)).toFixed(1)}%`,
  ].join('  '));
}

function reportCauses(causes: Map<string, number>) {
  const total = [...causes.values()].reduce((a, b) => a + b, 0);
  for (const [cause, n] of [...causes].sort((a, b) => b[1] - a[1]).slice(0, 14)) console.log(`    ${((100 * n) / total).toFixed(1).padStart(5)}% ${String(n).padStart(5)}  ${cause}`);
}

const merge = (into: Tally, t: Tally) => {
  for (const k of Object.keys(t) as (keyof Tally)[]) {
    const v = t[k];
    if (v instanceof Map) for (const [c, n] of v) (into[k] as Map<string, number>).set(c, ((into[k] as Map<string, number>).get(c) ?? 0) + n);
    else if (Array.isArray(v)) for (const x of v) (into[k] as number[]).push(x);
    else (into[k] as number) += v;
  }
};

for (const mode of modes) {
  console.log(`${mode}, ${WORLD.minPlayers} bots, ${minutes} min x ${seeds} seeds per map`);
  const all = emptyTally();
  for (const map of ROTATION[mode]) {
    const t = emptyTally();
    for (let seed = 1; seed <= seeds; seed++) play(mode, map, seed, t);
    report(map, t);
    merge(all, t);
  }
  report('all', all);
  console.log('  movement reversals by cause:');
  reportCauses(all.causes);
  console.log(`  reversals within ${QUICK_MS}ms of the last, by cause:`);
  reportCauses(all.quickCauses);
}
