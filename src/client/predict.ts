import type { CrateView, InputState, Snapshot, WallView } from '../shared/protocol.ts';
import { knifeLunge, moveStep, startDash, type Motion, type Rect } from '../shared/sim/movement.ts';
import { lerp } from './interp.ts';

type Point = { x: number; y: number };
export type PredictedAbility = { k: 'dash' } | { k: 'knife'; enemies: readonly Point[] };
export type PendingInput = { seq: number; input: InputState; dtMs: number; ability: PredictedAbility | null };

export type Prediction = {
  pending: PendingInput[];
  afterNewest: Motion | null;
  beforeNewest: Point | null;
  sampledAt: number;
  smoothingCorrection: Point;
};

export const NO_PREDICTION: Prediction = {
  pending: [], afterNewest: null, beforeNewest: null, sampledAt: 0, smoothingCorrection: { x: 0, y: 0 },
};

const MAX_PENDING = 90;
export const SNAP_DIST = 150;
const SMOOTH_MS = 60;

export const solidsOf = (walls: readonly WallView[], crates: readonly CrateView[]): Rect[] => [
  ...walls,
  ...crates.map((c) => ({ x: c.x, y: c.y, w: c.size, h: c.size })),
];

export function predictAbility(pred: Prediction, input: InputState, latest: Snapshot): PredictedAbility | null {
  const { self } = latest;
  const busy = !!pred.afterNewest?.dash || pred.pending.some((p) => p.ability);
  if (!input.ability || latest.match.winner !== null || self.abilityReadyIn > 0 || busy) return null;
  switch (self.ability) {
    case 'dash': return { k: 'dash' };
    case 'knife': {
      const team = latest.players.find((p) => p.id === self.id)?.team ?? null;
      return { k: 'knife', enemies: latest.players.filter((p) => p.alive && p.id !== self.id && (team === null || p.team !== team)) };
    }
    default: return null;
  }
}

function stepInput(solids: readonly Rect[], at: Motion, p: PendingInput, speed: number): Motion {
  const moved = moveStep(solids, at, p.input, speed, p.dtMs);
  switch (p.ability?.k) {
    case 'dash': return moved.dash ? moved : { ...moved, dash: startDash(p.input) };
    case 'knife': {
      const { x, y } = knifeLunge(solids, moved, p.input.angle, p.ability.enemies);
      return { ...moved, x, y };
    }
    case undefined: return moved;
  }
}

const replay = (solids: readonly Rect[], start: Motion, pending: readonly PendingInput[], speed: number): Motion =>
  pending.reduce((at, p) => stepInput(solids, at, p, speed), start);

export function predictInput(pred: Prediction, entry: PendingInput, solids: readonly Rect[], speed: number, now: number): Prediction {
  const pending = [...pred.pending, entry].slice(-MAX_PENDING);
  const was = pred.afterNewest;
  if (!was) return { ...pred, pending };
  return { ...pred, pending, beforeNewest: was, afterNewest: stepInput(solids, was, entry, speed), sampledAt: now };
}

export function reconcile(pred: Prediction, server: Motion | null, ackSeq: number, solids: readonly Rect[], speed: number): Prediction {
  const pending = pred.pending.filter((p) => p.seq > ackSeq);
  if (!server) return { ...NO_PREDICTION, pending };
  const afterNewest = replay(solids, server, pending, speed);
  const was = pred.afterNewest;
  if (!was || !pred.beforeNewest || Math.hypot(afterNewest.x - was.x, afterNewest.y - was.y) > SNAP_DIST) {
    return { pending, afterNewest, beforeNewest: afterNewest, sampledAt: pred.sampledAt, smoothingCorrection: { x: 0, y: 0 } };
  }
  const dx = afterNewest.x - was.x, dy = afterNewest.y - was.y;
  return {
    pending, afterNewest, sampledAt: pred.sampledAt,
    beforeNewest: { x: pred.beforeNewest.x + dx, y: pred.beforeNewest.y + dy },
    smoothingCorrection: { x: pred.smoothingCorrection.x - dx, y: pred.smoothingCorrection.y - dy },
  };
}

export function decayCorrection(pred: Prediction, dtMs: number): Prediction {
  const k = Math.exp(-Math.max(0, dtMs) / SMOOTH_MS);
  const x = pred.smoothingCorrection.x * k, y = pred.smoothingCorrection.y * k;
  return { ...pred, smoothingCorrection: Math.hypot(x, y) < 0.01 ? { x: 0, y: 0 } : { x, y } };
}

export function drawnPosition(pred: Prediction, now: number, stepMs: number): Point | null {
  const { beforeNewest: a, afterNewest: b, smoothingCorrection: c } = pred;
  if (!a || !b) return null;
  const t = Math.min(1, Math.max(0, (now - pred.sampledAt) / stepMs));
  return { x: lerp(a.x, b.x, t) + c.x, y: lerp(a.y, b.y, t) + c.y };
}
