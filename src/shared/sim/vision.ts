import { SMOKE } from './abilities.ts';
import type { Thrown } from './world.ts';

/** A smoke cloud as it is right now: a circle that blooms, then thins. */
export type Smoke = { x: number; y: number; r: number };

/** How far a cloud has bloomed and thinned, 0.35..1 of `SMOKE.radius`, by its age and the time it has left. */
export function smokeRadius(now: number, bornAt: number, expiresAt: number): number {
  const bloom = Math.min(1, 0.35 + (0.65 * Math.max(0, now - bornAt)) / SMOKE.bloomMs);
  const thin = 0.4 + 0.6 * Math.min(1, Math.max(0, expiresAt - now) / SMOKE.thinMs);
  return SMOKE.radius * bloom * thin;
}

/**
 * Whether smoke stops `from` seeing `to`. A line that crosses a cloud is blocked, so an enemy inside or behind one is hidden;
 * a viewer standing in a cloud sees only `SMOKE.sightPx` around them. Bullets are not affected: only sight is.
 */
export function sightBlocked(clouds: readonly Smoke[], ax: number, ay: number, bx: number, by: number): boolean {
  const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
  for (const c of clouds) {
    if ((ax - c.x) ** 2 + (ay - c.y) ** 2 < c.r * c.r) {
      if (len2 > SMOKE.sightPx * SMOKE.sightPx) return true;
      continue;
    }
    const t = len2 === 0 ? 0 : Math.min(1, Math.max(0, ((c.x - ax) * dx + (c.y - ay) * dy) / len2));
    const px = ax + dx * t - c.x, py = ay + dy * t - c.y;
    if (px * px + py * py < c.r * c.r) return true;
  }
  return false;
}

/** The smoke clouds in the world, as they are at `now`. */
export const smokeDisks = (thrown: readonly Thrown[], now: number): Smoke[] =>
  thrown.flatMap((t) => (t.kind === 'smokeCloud' ? [{ x: t.x, y: t.y, r: smokeRadius(now, t.bornAt, t.expiresAt) }] : []));
