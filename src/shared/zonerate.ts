/** A lone soldier's time to take a neutral DOM zone (or to turn a held one neutral). */
export const ZONE_CAPTURE_MS = 3000;
/** Each soldier past the first adds half the lone rate, up to this many times it, so a squad on the point is quicker but a blob is not. */
export const ZONE_RATE_CAP = 2.5;

/**
 * How many times the lone rate `n` teammates alone on a zone capture, neutralise or drain at: 1, 1.5, 2, then 2.5 for four or more.
 * An empty zone (n = 0) lets a stranded capture bleed off at the lone rate. Shared so the client draws the same speed the sim runs.
 */
export const zoneRate = (n: number): number => (n <= 0 ? 1 : Math.min(ZONE_RATE_CAP, 1 + 0.5 * (n - 1)));
