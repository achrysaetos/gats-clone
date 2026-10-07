/**
 * Hitstop holds the drawn world still for a beat when your shot lands, then lets it catch back up.
 * Only drawing slows: the sim, the inputs and your own movement run on.
 */
export const HITSTOP = { hitMs: 40, killMs: 80, hitGapMs: 300, catchUp: 0.5, maxLagMs: 100 } as const;

/** The latest stop: when it began, how long it holds, and how far behind the world already was then. */
export type Hitstop = { at: number; ms: number; base: number } | null;

export const NO_HITSTOP: Hitstop = null;

/** How many ms the drawn world lags the clock at `now`. */
export function stopLag(stop: Hitstop, now: number): number {
  if (!stop) return 0;
  const t = now - stop.at;
  if (t < 0) return stop.base;
  if (t <= stop.ms) return Math.min(HITSTOP.maxLagMs, stop.base + t);
  return Math.max(0, Math.min(HITSTOP.maxLagMs, stop.base + stop.ms) - (t - stop.ms) * HITSTOP.catchUp);
}

/** A kill always stops; a hit stops only if no stop began within the gap, so a held SMG never turns into slow motion. */
export function addStop(stop: Hitstop, now: number, kind: 'hit' | 'kill'): Hitstop {
  if (kind === 'hit' && stop && now - stop.at < HITSTOP.hitGapMs) return stop;
  return { at: now, ms: kind === 'kill' ? HITSTOP.killMs : HITSTOP.hitMs, base: stopLag(stop, now) };
}

type Landed = { kind: string; victim?: number | null; by?: number | null };

/** Your round landing on someone stops for a hit, and your kill for a kill; everything else, yours on yourself included, never stops. */
export function stopFor(fx: Landed, myId: number): 'hit' | 'kill' | null {
  if (fx.by !== myId || fx.victim === null || fx.victim === undefined || fx.victim === myId) return null;
  return fx.kind === 'death' ? 'kill' : fx.kind === 'impact' ? 'hit' : null;
}
