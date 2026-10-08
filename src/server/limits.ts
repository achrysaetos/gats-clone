import { WORLD } from '../shared/defs.ts';

export const LIMITS = {
  humansPerRoom: 16,
  minPlayers: WORLD.minPlayers as number,
  socketsPerIp: 8,
  joinTimeoutMs: 10_000,
  heartbeatMs: 10_000,
  rttPingMs: 2_000,
  /** A socket whose unsent backlog tops this many bytes (a stalled tab, a dead link) is skipped, not queued to: it always gets the latest snapshot, never a queue of stale ones. */
  maxBufferedBytes: 64 * 1024,
  /** A socket whose backlog stays over the cap this long is closed, and its player leaves. */
  stallMs: 8_000,
  messagesPerSec: 60,
  messageBurst: 120,
  authPerMin: 10,
  /** Private zombies squads: how many may run at once, how fast one address may open them, and how long one may sit without humans. */
  squadRooms: 20,
  squadsPerMin: 6,
  squadIdleMs: 30_000,
  /** Private shooting ranges (one player each): how many may run at once, how fast one address may open them, and how long one may sit empty. */
  rangeRooms: 40,
  rangeIdleMs: 30_000,
  sessionMs: 30 * 24 * 60 * 60 * 1000,
  /** A room's faults (a throwing tick, a message handler that throws) are logged at most once per this many ms, with a count of the ones held back. */
  faultLogMs: 10_000,
  /** A room whose tick has thrown on every tick for this long is closed (its players are let go) and a fresh one takes its place. */
  faultyRoomMs: 5_000,
};
export type Limits = typeof LIMITS;

/**
 * Logs a fault the first time it happens under `key`, then at most once per `everyMs` with how many were held back meanwhile:
 * a fault that repeats every tick or every message would otherwise flood the log (and the disk) with the same trace.
 */
export function makeFaultLog(everyMs: number, log: (...args: unknown[]) => void = (...args) => console.error(...args)) {
  const seen = new Map<string, { at: number; held: number }>();
  return (key: string, err: unknown, now = Date.now()): void => {
    const s = seen.get(key);
    if (s && now - s.at < everyMs) { s.held++; return; }
    log(`fault in ${key}${s?.held ? ` (${s.held} more since the last report)` : ''}:`, err);
    seen.set(key, { at: now, held: 0 });
  };
}

type Bucket = { tokens: number; at: number };

export function makeTokenBucket(perSec: number, burst: number) {
  const b: Bucket = { tokens: burst, at: -Infinity };
  return (now: number): boolean => {
    b.tokens = Math.min(burst, b.tokens + ((now - b.at) / 1000) * perSec);
    b.at = now;
    if (b.tokens < 1) return false;
    b.tokens -= 1;
    return true;
  };
}

export function makeKeyedLimiter(perSec: number, burst: number) {
  const buckets = new Map<string, { take: (now: number) => boolean; fullAt: number }>();
  return (key: string, now: number): boolean => {
    for (const [k, v] of buckets) if (v.fullAt <= now) buckets.delete(k);
    const entry = buckets.get(key) ?? { take: makeTokenBucket(perSec, burst), fullAt: 0 };
    buckets.set(key, entry);
    const ok = entry.take(now);
    entry.fullAt = now + (burst / perSec) * 1000;
    return ok;
  };
}
