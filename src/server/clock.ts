/** Longest a timer may fire late before the schedule forgets the debt instead of paying it back. */
export const MAX_LATE_MS = 250;
/** Most ticks run per timer callback; a slow server then yields to the socket work between batches instead of spiralling. */
export const MAX_CATCH_UP = 4;

/**
 * How many ticks are due at `now` for a fixed-rate schedule whose next tick is `nextAt`, and where the schedule stands afterwards.
 * A late timer catches up, but never by more than `MAX_CATCH_UP` ticks at once; what is still owed after that is dropped (game time
 * slows down) rather than carried, since carrying it made an overloaded server run ever longer batches and starve its sockets.
 */
export function planTicks(now: number, nextAt: number, tickMs: number): { ticks: number; nextAt: number } {
  if (now - nextAt > MAX_LATE_MS) return { ticks: 1, nextAt: now + tickMs };
  const owed = now >= nextAt ? Math.floor((now - nextAt) / tickMs) + 1 : 0;
  const ticks = Math.min(owed, MAX_CATCH_UP);
  const after = nextAt + owed * tickMs;
  return { ticks, nextAt: owed > ticks ? now + tickMs : after };
}
