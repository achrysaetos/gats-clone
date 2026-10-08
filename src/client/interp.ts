import { WORLD } from '../shared/defs.ts';
import { INTERP_DELAY_MS, type PlayerView, type Snapshot, type ZombieView } from '../shared/protocol.ts';

export const TICK_MS = 1000 / WORLD.tickHz;
export const MAX_EXTRAPOLATE_MS = 100;
const TELEPORT_DIST = 250;
const KEEP_MS = 1000;
const CLOCK_CATCH_UP_RATE = 0.1;
const CLOCK_FALL_BACK_RATE = 0.005;
/**
 * The server's clock can fall behind the wall clock for good: an overloaded server (a throttled CPU, a long pause) drops the
 * ticks it could not run. Arrivals then come later and later against the estimate, and the slow fall-back above would leave
 * the render clock seconds ahead of every snapshot (others frozen at the extrapolation cap, effects released early). When even
 * the earliest arrival of the last `CLOCK_WINDOW_MS` came later than the estimate, it is the server's clock that moved, not
 * jitter, so the estimate falls back to it by `CLOCK_SLOWDOWN_RATE` a tick's worth of real time (snapshots from a slowed
 * server come further apart, so a per-snapshot rate would fall behind the slower it got).
 */
const CLOCK_WINDOW_MS = 500;
const CLOCK_SLOWDOWN_RATE = 0.1;
/** However the estimate falls, the offset drawn with follows it at no more than this many ms per ms: the drawn moment slows down, but never stops or runs backward. */
const CLOCK_SLEW = 0.9;

/** One snapshot's arrival: when it came and the server-clock offset it implied. */
type ClockSample = { at: number; sample: number };
/** A fall-back of the drawn offset in progress: it was `from` at `at` and falls at `CLOCK_SLEW` toward `serverClockOffset`. */
type Slew = { from: number; at: number };
export type SnapBuffer = { snaps: readonly Snapshot[]; serverClockOffset: number | null; clock?: readonly ClockSample[]; slew?: Slew | null };

export const EMPTY_BUFFER: SnapBuffer = { snaps: [], serverClockOffset: null };

const serverTime = (snap: Snapshot) => snap.tick * TICK_MS;

export const newestSnap = (buf: SnapBuffer): Snapshot | null => buf.snaps[buf.snaps.length - 1] ?? null;

export function pushSnap(buf: SnapBuffer, snap: Snapshot, arrivedAt: number): SnapBuffer {
  const newest = newestSnap(buf);
  if (newest && snap.tick <= newest.tick) return buf;
  const sample = serverTime(snap) - arrivedAt;
  const prev = buf.serverClockOffset;
  const lastAt = buf.clock?.at(-1)?.at ?? arrivedAt;
  const clock = [...(buf.clock ?? []), { at: arrivedAt, sample }].filter((c) => c.at >= arrivedAt - CLOCK_WINDOW_MS);
  const earliest = Math.max(...clock.map((c) => c.sample));
  // A burst after a stall arrives all at once: the window must span real time before it can say the server's clock moved.
  const spans = clock[0]!.at <= arrivedAt - CLOCK_WINDOW_MS / 2;
  const serverClockOffset = prev === null ? sample
    : sample > prev ? prev + (sample - prev) * CLOCK_CATCH_UP_RATE
    : spans && earliest < prev ? prev + (earliest - prev) * Math.min(1, CLOCK_SLOWDOWN_RATE * Math.max(1, (arrivedAt - lastAt) / TICK_MS))
    : prev + (sample - prev) * CLOCK_FALL_BACK_RATE;
  const drawn = drawnOffset(buf, arrivedAt);
  const slew = prev !== null && serverClockOffset < drawn ? { from: drawn, at: arrivedAt } : null;
  const snaps = [...buf.snaps, snap].filter((s) => serverTime(s) >= serverTime(snap) - KEEP_MS);
  return { snaps, serverClockOffset, clock, slew };
}

/** The server-clock offset the page draws with at `now`: the estimate, or on the way down to it, slewing. */
function drawnOffset(buf: SnapBuffer, now: number): number {
  const est = buf.serverClockOffset ?? 0;
  return buf.slew ? Math.max(est, buf.slew.from - Math.max(0, now - buf.slew.at) * CLOCK_SLEW) : est;
}

export const renderTime = (buf: SnapBuffer, now: number) => now + drawnOffset(buf, now) - INTERP_DELAY_MS;
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

/**
 * A reload's `[elapsed, total]` ms at fraction `t` of the `span` ms between two snapshots, so the arms move smoothly and finish
 * on the very ms the reload does: counted from the newer snapshot back, or from the older one forward when it finished between them.
 */
export function reloadAt(a: PlayerView['rl'], b: PlayerView['rl'], t: number, span: number): { rl?: [number, number] } {
  if (b) return { rl: [Math.max(0, b[0] - (1 - t) * span), b[1]] };
  if (a && a[0] + t * span < a[1]) return { rl: [a[0] + t * span, a[1]] };
  return {};
}

function interpolateZombies(prev: ZombieView[] | undefined, next: ZombieView[] | undefined, t: number): ZombieView[] | undefined {
  if (!prev || !next) return next;
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
  const players = interpolateById(a.players, b.players, t, (pa, pb, k) => ({ angle: lerpAngle(pa.angle, pb.angle, Math.min(k, 1)), ...reloadAt(pa.rl, pb.rl, k, span) }));
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
