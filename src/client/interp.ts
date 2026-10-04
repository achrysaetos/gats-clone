import { WORLD } from '../shared/defs.ts';
import { INTERP_DELAY_MS, type Snapshot, type ZombieView } from '../shared/protocol.ts';

export const TICK_MS = 1000 / WORLD.tickHz;
export const MAX_EXTRAPOLATE_MS = 100;
const TELEPORT_DIST = 250;
const KEEP_MS = 1000;
const CLOCK_CATCH_UP_RATE = 0.1;
const CLOCK_FALL_BACK_RATE = 0.005;

export type SnapBuffer = { snaps: readonly Snapshot[]; serverClockOffset: number | null };

export const EMPTY_BUFFER: SnapBuffer = { snaps: [], serverClockOffset: null };

const serverTime = (snap: Snapshot) => snap.tick * TICK_MS;

export const newestSnap = (buf: SnapBuffer): Snapshot | null => buf.snaps[buf.snaps.length - 1] ?? null;

export function pushSnap(buf: SnapBuffer, snap: Snapshot, arrivedAt: number): SnapBuffer {
  const newest = newestSnap(buf);
  if (newest && snap.tick <= newest.tick) return buf;
  const sample = serverTime(snap) - arrivedAt;
  const prev = buf.serverClockOffset;
  const serverClockOffset = prev === null
    ? sample
    : prev + (sample - prev) * (sample > prev ? CLOCK_CATCH_UP_RATE : CLOCK_FALL_BACK_RATE);
  const snaps = [...buf.snaps, snap].filter((s) => serverTime(s) >= serverTime(snap) - KEEP_MS);
  return { snaps, serverClockOffset };
}

export const renderTime = (buf: SnapBuffer, now: number) => now + (buf.serverClockOffset ?? 0) - INTERP_DELAY_MS;
/** The server's clock right now, not delayed for interpolation, or null before the first snapshot. */
export const serverNow = (buf: SnapBuffer, now: number): number | null => (buf.serverClockOffset === null ? null : now + buf.serverClockOffset);

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function lerpAngle(a: number, b: number, t: number): number {
  const TAU = Math.PI * 2;
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return a + d * t;
}

type Positioned = { id: number; x: number; y: number };

function interpolateById<T extends Positioned>(
  prev: readonly T[], next: readonly T[], t: number, extra?: (a: T, b: T, t: number) => Partial<T>,
): T[] {
  const before = new Map(prev.map((e) => [e.id, e]));
  return next.map((b) => {
    const a = before.get(b.id);
    if (!a || Math.hypot(b.x - a.x, b.y - a.y) > TELEPORT_DIST) return b;
    return { ...b, x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), ...extra?.(a, b, t) };
  });
}

function interpolateZombies(prev: readonly ZombieView[] | undefined, next: readonly ZombieView[] | undefined, t: number): ZombieView[] | undefined {
  if (!prev || !next) return next as ZombieView[] | undefined;
  const before = new Map(prev.map((z) => [z[0], z]));
  return next.map((z) => {
    const a = before.get(z[0]);
    return a ? [z[0], z[1], lerp(a[2], z[2], t), lerp(a[3], z[3], t), z[4]] : z;
  });
}

export function sampleAt(snaps: readonly Snapshot[], at: number): Snapshot | null {
  const newest = snaps[snaps.length - 1];
  if (!newest) return null;
  let i = snaps.findIndex((s) => serverTime(s) > at);
  if (i === 0) return withSelf(newest, snaps[0]!.players, snaps[0]!);
  if (i === -1) i = snaps.length - 1;
  const a = snaps[i - 1];
  const b = snaps[i]!;
  if (!a) return newest;
  const span = serverTime(b) - serverTime(a);
  const t = Math.min((at - serverTime(a)) / span, 1 + MAX_EXTRAPOLATE_MS / span);
  const players = interpolateById(a.players, b.players, t, (pa, pb, k) => ({ angle: lerpAngle(pa.angle, pb.angle, Math.min(k, 1)) }));
  return {
    ...withSelf(newest, players, b),
    bullets: interpolateById(a.bullets, b.bullets, t),
    thrown: interpolateById(a.thrown, b.thrown, Math.min(t, 1)),
    zombies: interpolateZombies(a.zombies, b.zombies, t),
  };
}

function withSelf(newest: Snapshot, others: Snapshot['players'], at: Snapshot): Snapshot {
  const self = newest.players.find((p) => p.id === newest.self.id);
  const players = others.filter((p) => p.id !== newest.self.id);
  return { ...newest, bullets: at.bullets, thrown: at.thrown, zombies: at.zombies, players: self ? [...players, self] : players };
}
