import type { Snapshot } from '../shared/protocol.ts';
import { lerp, lerpAngle, sampleAt, TICK_MS } from './interp.ts';

/**
 * A ring of the decoded full snapshots the client has received, kept so a moment can be replayed through the normal world
 * renderer. Snapshots share their rarely changing parts (crates, leaderboard, match) with their neighbours, so the cost is
 * the per-tick lists; the ring is capped both by age and by an estimate of those lists' size, whichever bites first.
 */
export const REPLAY = { keepMs: 6000, maxWeight: 70_000 } as const;

export type ReplayBuffer = { frames: Snapshot[]; weight: number; keepMs: number; maxWeight: number };

export const createReplayBuffer = (keepMs: number = REPLAY.keepMs, maxWeight: number = REPLAY.maxWeight): ReplayBuffer =>
  ({ frames: [], weight: 0, keepMs, maxWeight });

export const serverMs = (snap: Snapshot): number => snap.tick * TICK_MS;

/** A rough count of what a snapshot holds that is not shared with the one before it. */
export const snapWeight = (snap: Snapshot): number =>
  8 + snap.players.length * 6 + snap.bullets.length * 2 + snap.thrown.length * 2 + (snap.zombies?.length ?? 0) * 3 + snap.events.length * 3 + snap.minimap.length;

/** Adds a snapshot (older or repeated ticks are ignored) and drops what the caps no longer allow. The newest is always kept. */
export function recordFrame(buf: ReplayBuffer, snap: Snapshot): void {
  const last = buf.frames[buf.frames.length - 1];
  if (last && snap.tick <= last.tick) {
    // A new round restarts the tick count: nothing before it belongs to this timeline.
    if (snap.tick < last.tick - 1) { buf.frames.length = 0; buf.weight = 0; } else return;
  }
  buf.frames.push(snap);
  buf.weight += snapWeight(snap);
  const oldest = serverMs(snap) - buf.keepMs;
  let drop = 0;
  while (drop < buf.frames.length - 1 && (serverMs(buf.frames[drop]!) < oldest || buf.weight > buf.maxWeight)) buf.weight -= snapWeight(buf.frames[drop++]!);
  if (drop) buf.frames.splice(0, drop);
}

/** The frames from `fromMs` to `toMs` of server time, with one frame of margin on each side so the ends can be interpolated. */
export function clipOf(buf: ReplayBuffer, fromMs: number, toMs: number): Snapshot[] {
  const f = buf.frames;
  let a = f.findIndex((s) => serverMs(s) >= fromMs);
  if (a === -1) return [];
  a = Math.max(0, a - 1);
  let b = f.length - 1;
  while (b > a && serverMs(f[b - 1]!) >= toMs) b--;
  return f.slice(a, b + 1);
}

/** The world as it stood `at` ms of server time into a clip, with `self` read from the frame being drawn rather than the clip's last. */
export function frameAt(clip: readonly Snapshot[], at: number): Snapshot | null {
  if (!clip.length) return null;
  let b = clip.findIndex((s) => serverMs(s) > at);
  if (b === -1) b = clip.length - 1;
  const pair = clip.slice(Math.max(0, b - 1), b + 1);
  const snap = sampleAt(pair, at);
  const [from, to] = pair.length === 2 ? pair : [undefined, undefined];
  if (!snap || !from || !to) return snap;
  // Live, your own body is drawn from prediction; in a replay it is just another body, interpolated like the rest.
  const id = to.self.id, a = from.players.find((p) => p.id === id), z = to.players.find((p) => p.id === id);
  if (!a || !z) return snap;
  const k = Math.min(1, Math.max(0, (at - serverMs(from)) / (serverMs(to) - serverMs(from))));
  return { ...snap, players: snap.players.map((p) => (p.id === id ? { ...z, x: lerp(a.x, z.x, k), y: lerp(a.y, z.y, k), angle: lerpAngle(a.angle, z.angle, k) } : p)) };
}

export const clipSpanMs = (clip: readonly Snapshot[]): number => (clip.length < 2 ? 0 : serverMs(clip[clip.length - 1]!) - serverMs(clip[0]!));
