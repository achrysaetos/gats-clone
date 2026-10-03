import type { CrateView, InputState, WallView } from '../shared/protocol.ts';
import { moveStep, type Rect } from '../shared/sim.ts';
import { lerp } from './interp.ts';

export type PendingInput = { seq: number; input: InputState; dtMs: number };
type Point = { x: number; y: number };

/**
 * The local player's movement, run ahead of the server. `pos` is where the player stands once the newest sent input
 * has played out, `from` where it stood when that input was sampled; drawing walks from one to the other.
 * `offset` is a recent correction still being smoothed away.
 */
export type Prediction = {
  pending: PendingInput[];
  pos: Point | null;
  from: Point | null;
  sampledAt: number;
  offset: Point;
};

export const NO_PREDICTION: Prediction = { pending: [], pos: null, from: null, sampledAt: 0, offset: { x: 0, y: 0 } };

/** Three seconds of inputs; the server acks far sooner, so overflow only happens while it is not answering. */
const MAX_PENDING = 90;
/** A correction this large is a respawn or teleport, not a misprediction, so it is not smoothed. */
export const SNAP_DIST = 150;
const SMOOTH_MS = 60;

export const solidsOf = (walls: readonly WallView[], crates: readonly CrateView[]): Rect[] => [
  ...walls,
  ...crates.map((c) => ({ x: c.x, y: c.y, w: c.size, h: c.size })),
];

const replay = (solids: readonly Rect[], start: Point, pending: readonly PendingInput[], speed: number): Point =>
  pending.reduce((at, p) => moveStep(solids, at.x, at.y, p.input, speed, p.dtMs), start);

/** Records an input as it is sent and moves the predicted player by it right away. */
export function predictInput(pred: Prediction, entry: PendingInput, solids: readonly Rect[], speed: number, now: number): Prediction {
  const pending = [...pred.pending, entry].slice(-MAX_PENDING);
  if (!pred.pos) return { ...pred, pending };
  return { ...pred, pending, from: pred.pos, pos: moveStep(solids, pred.pos.x, pred.pos.y, entry.input, speed, entry.dtMs), sampledAt: now };
}

/**
 * Rebuilds the prediction from the server's authoritative position: drops inputs the server has applied, replays the
 * rest, and moves any difference into `offset` so the drawn player does not jump.
 */
export function reconcile(pred: Prediction, server: Point | null, ackSeq: number, solids: readonly Rect[], speed: number): Prediction {
  const pending = pred.pending.filter((p) => p.seq > ackSeq);
  if (!server) return { ...NO_PREDICTION, pending };
  const pos = replay(solids, server, pending, speed);
  if (!pred.pos || !pred.from || Math.hypot(pos.x - pred.pos.x, pos.y - pred.pos.y) > SNAP_DIST) {
    return { pending, pos, from: pos, sampledAt: pred.sampledAt, offset: { x: 0, y: 0 } };
  }
  const dx = pos.x - pred.pos.x, dy = pos.y - pred.pos.y;
  return {
    pending, pos, sampledAt: pred.sampledAt,
    from: { x: pred.from.x + dx, y: pred.from.y + dy },
    offset: { x: pred.offset.x - dx, y: pred.offset.y - dy },
  };
}

export function decayOffset(pred: Prediction, dtMs: number): Prediction {
  const k = Math.exp(-Math.max(0, dtMs) / SMOOTH_MS);
  const x = pred.offset.x * k, y = pred.offset.y * k;
  return { ...pred, offset: Math.hypot(x, y) < 0.01 ? { x: 0, y: 0 } : { x, y } };
}

/** Where to draw the local player at `now`, given inputs are sampled every `stepMs`. */
export function drawnPosition(pred: Prediction, now: number, stepMs: number): Point | null {
  if (!pred.pos || !pred.from) return null;
  const t = Math.min(1, Math.max(0, (now - pred.sampledAt) / stepMs));
  return { x: lerp(pred.from.x, pred.pos.x, t) + pred.offset.x, y: lerp(pred.from.y, pred.pos.y, t) + pred.offset.y };
}
