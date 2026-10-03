import type { CrateView, InputState, WallView } from '../shared/protocol.ts';
import { moveStep, type Rect } from '../shared/sim.ts';
import { lerp } from './interp.ts';

export type PendingInput = { seq: number; input: InputState; dtMs: number };
type Point = { x: number; y: number };

export type Prediction = {
  pending: PendingInput[];
  afterNewest: Point | null;
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

const replay = (solids: readonly Rect[], start: Point, pending: readonly PendingInput[], speed: number): Point =>
  pending.reduce((at, p) => moveStep(solids, at.x, at.y, p.input, speed, p.dtMs), start);

export function predictInput(pred: Prediction, entry: PendingInput, solids: readonly Rect[], speed: number, now: number): Prediction {
  const pending = [...pred.pending, entry].slice(-MAX_PENDING);
  const was = pred.afterNewest;
  if (!was) return { ...pred, pending };
  return { ...pred, pending, beforeNewest: was, afterNewest: moveStep(solids, was.x, was.y, entry.input, speed, entry.dtMs), sampledAt: now };
}

export function reconcile(pred: Prediction, server: Point | null, ackSeq: number, solids: readonly Rect[], speed: number): Prediction {
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
