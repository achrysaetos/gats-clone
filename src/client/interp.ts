import type { Snapshot } from '../shared/protocol.ts';

export type TimedSnap = { snap: Snapshot; at: number };
export type SnapPair = { prev: TimedSnap | null; next: TimedSnap | null };

export const EMPTY_PAIR: SnapPair = { prev: null, next: null };

// Beyond this distance between snapshots an entity has respawned or teleported; sliding would draw it crossing the map.
export const TELEPORT_DIST = 250;

export const pushSnap = (pair: SnapPair, snap: Snapshot, at: number): SnapPair => ({ prev: pair.next, next: { snap, at } });

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Fraction from prev to next to draw at `now`. Rendering trails the newest snapshot by one arrival interval,
 * so the frame between two arrivals walks from prev to next and holds at next if the following one is late.
 */
export function renderAlpha(pair: SnapPair, now: number): number {
  if (!pair.prev || !pair.next) return 1;
  const span = pair.next.at - pair.prev.at;
  if (span <= 0) return 1;
  return clamp((now - pair.next.at) / span, 0, 1);
}

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function lerpAngle(a: number, b: number, t: number): number {
  const TAU = Math.PI * 2;
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return a + d * t;
}

type Positioned = { id: number; x: number; y: number };

export function interpolateById<T extends Positioned>(
  prev: readonly T[], next: readonly T[], t: number, extra?: (a: T, b: T, t: number) => Partial<T>,
): T[] {
  const before = new Map(prev.map((e) => [e.id, e]));
  return next.map((b) => {
    const a = before.get(b.id);
    if (!a || Math.hypot(b.x - a.x, b.y - a.y) > TELEPORT_DIST) return b;
    return { ...b, x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), ...extra?.(a, b, t) };
  });
}

/** Entity lists for one rendered frame; non-moving lists (crates, zones) come straight from the newest snapshot. */
export function interpolateSnap(pair: SnapPair, now: number): Snapshot | null {
  if (!pair.next) return null;
  const next = pair.next.snap;
  if (!pair.prev) return next;
  const prev = pair.prev.snap;
  const t = renderAlpha(pair, now);
  return {
    ...next,
    players: interpolateById(prev.players, next.players, t, (a, b, k) => ({ angle: lerpAngle(a.angle, b.angle, k) })),
    bullets: interpolateById(prev.bullets, next.bullets, t),
    thrown: interpolateById(prev.thrown, next.thrown, t),
  };
}
