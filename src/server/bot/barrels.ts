import { BARREL, WORLD } from '../../shared/defs.ts';
import type { BarrelView } from '../../shared/protocol.ts';
import { segmentEntersRectAt, type Rect } from '../../shared/sim/movement.ts';
import { clearShot, dist, type Point } from './nav.ts';

/** How far from a barrel a bot stays out of its blast: the radius, its own body, and a margin for the bot moving while the fuse burns. */
export const BARREL_SAFE_PX = BARREL.radius + WORLD.playerRadius + 40;
/** An enemy this near a barrel (centre to centre) would take a real hit: at least a third of the damage. */
const BLAST_WORTH_PX = BARREL.radius * (2 / 3);
const FIRING_RANGE_FRAC = 0.9;

/** A barrel as the bot sees it; `lit` once it hisses toward its burst. */
export type SeenBarrel = Point & { id: number; lit: boolean };

export const seenBarrels = (views: readonly BarrelView[] | undefined): SeenBarrel[] => (views ?? []).map(([id, x, y, hp]) => ({ id, x, y, lit: hp === 0 }));

export const barrelBox = (b: Point, grow = 0): Rect => ({ x: b.x - BARREL.size / 2 - grow, y: b.y - BARREL.size / 2 - grow, w: BARREL.size + 2 * grow, h: BARREL.size + 2 * grow });
/** A round does not fly true: a barrel this much wider than it is counts as in the line of fire. */
const AIM_SLACK_PX = 30;

/** `root` and every barrel a burst of it would pass the spark to, one after another. */
export function chainFrom(root: SeenBarrel, barrels: readonly SeenBarrel[]): SeenBarrel[] {
  const out = [root];
  for (let i = 0; i < out.length; i++) {
    for (const b of barrels) if (!out.includes(b) && dist(out[i]!, b) < BARREL.radius + BARREL.size / 2) out.push(b);
  }
  return out;
}

/** Whether a point is clear of every burst in a chain. */
export const safeFrom = (chain: readonly SeenBarrel[], p: Point) => chain.every((b) => dist(b, p) > BARREL_SAFE_PX);

/**
 * The first barrel a bullet from `from` toward `to` meets, if any.
 */
export function barrelOnLine(barrels: readonly SeenBarrel[], from: Point, to: Point, grow = 0): SeenBarrel | null {
  let best: SeenBarrel | null = null, bestT = Infinity;
  for (const b of barrels) {
    const t = segmentEntersRectAt(from.x, from.y, to.x - from.x, to.y - from.y, barrelBox(b, grow));
    if (t !== null && t < bestT) { best = b; bestT = t; }
  }
  return best;
}

/** True when a shot from `me` to `to` would meet a standing barrel whose blast (with its chain) reaches `me`: a bot holds fire rather than set that off. */
export function shotWouldBurnMe(barrels: readonly SeenBarrel[], me: Point, to: Point): boolean {
  const hit = barrelOnLine(barrels.filter((b) => !b.lit), me, to, AIM_SLACK_PX);
  return hit !== null && !safeFrom(chainFrom(hit, barrels), me);
}

/** The barrel a bot at `me` should shoot with a gun reaching `range`, or null: one with an enemy in the blast and nobody on its own side. */
export function barrelToShoot(
  me: Point, barrels: readonly SeenBarrel[], enemies: readonly Point[], allies: readonly Point[], walls: readonly Rect[], range: number,
): SeenBarrel | null {
  if (enemies.length === 0) return null;
  const standing = barrels.filter((b) => !b.lit);
  let best: SeenBarrel | null = null, bestScore = 0;
  for (const root of standing) {
    if (dist(root, me) > range * FIRING_RANGE_FRAC || !clearShot(walls, me, root)) continue;
    // The round must meet this barrel first, not another nearer one.
    if (barrelOnLine(standing, me, root) !== root) continue;
    const chain = chainFrom(root, barrels);
    if (!safeFrom(chain, me) || allies.some((a) => chain.some((b) => dist(b, a) < BARREL.radius))) continue;
    let score = 0;
    for (const e of enemies) {
      const reached = chain.filter((b) => dist(b, e) < BLAST_WORTH_PX && clearShot(walls, b, e));
      if (reached.length) score += 1 - Math.min(...reached.map((b) => dist(b, e))) / BARREL.radius;
    }
    if (score > bestScore) { best = root; bestScore = score; }
  }
  return best;
}
