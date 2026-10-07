/**
 * Hit-stop: a brief freeze of the drawn world when a big hit or your own kill lands. Render-only: the simulation, the
 * snapshots and your inputs run on the real clock, only what is drawn is held on one instant (`sim`) and then eases
 * back up to the real clock at double speed, so there is no teleport when it lets go.
 */
export const HITSTOP = { killMs: 55, bigMs: 34, maxMs: 60, cooldownMs: 240, catchUp: 2 } as const;

export type StopClock = {
  /** The time the world is drawn at. */
  sim: number;
  /** The real time of the last step. */
  real: number;
  /** The real time the freeze in progress ends; in the past when none is. */
  until: number;
  startedAt: number;
};

export const newClock = (now: number): StopClock => ({ sim: now, real: now, until: -Infinity, startedAt: -Infinity });

/**
 * Asks for a freeze of `ms` from `now`. A freeze already running is extended up to `maxMs` in all; one that just ended
 * is not followed by another within `cooldownMs`, so a held trigger on a low-health target cannot stutter the screen.
 * Returns whether the freeze was taken.
 */
export function requestStop(c: StopClock, now: number, ms: number): boolean {
  const ms2 = Math.min(HITSTOP.maxMs, Math.max(0, ms));
  if (ms2 <= 0) return false;
  if (now < c.until) {
    const end = Math.min(c.startedAt + HITSTOP.maxMs, Math.max(c.until, now + ms2));
    const grew = end > c.until;
    c.until = end;
    return grew;
  }
  if (now - c.until < HITSTOP.cooldownMs) return false;
  c.startedAt = now;
  c.until = now + ms2;
  return true;
}

/** The time to draw at for a frame at real time `now`: held during a freeze, then catching up. */
export function stepClock(c: StopClock, now: number): number {
  const dt = Math.max(0, now - c.real);
  c.real = now;
  if (now < c.until) return c.sim;
  // Only the part of the step after the freeze ended counts toward catching up.
  const after = now - Math.max(c.until, now - dt);
  c.sim = Math.min(now, c.sim + after * HITSTOP.catchUp);
  return c.sim;
}

/** How far the drawn world is behind the real clock right now. */
export const lag = (c: StopClock): number => c.real - c.sim;
