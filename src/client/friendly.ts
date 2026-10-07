import type { Badge } from '../shared/defs.ts';

const DAY_MS = 86_400_000;

/** The join anniversary: today is the day of the year `firstSeen` fell on, at least a year on. */
export function isAnniversary(firstSeen: number | undefined, now: number): boolean {
  if (!firstSeen || now - firstSeen < 360 * DAY_MS) return false;
  const a = new Date(firstSeen), b = new Date(now);
  return a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** The Centurion badge's first tier is the 100th lifetime kill. */
export const isCenturion = (b: Badge): boolean => b.track === 'kills' && b.tier === 0;
