import { GUNS, rulesOf, type GunId } from '../shared/defs.ts';
import { intercept, MUZZLE_PX } from '../shared/sim/ballistics.ts';

type Point = { x: number; y: number };
export type AssistTarget = Point & { vx: number; vy: number };

/**
 * Touch aim gets a light pull toward where a round would meet the enemy nearest the thumb's aim, led by the same intercept the
 * bots use. Only an enemy whose meeting point lies within `coneDeg` of the aim is considered. The aim turns toward it by
 * `2 * pull * fade` of the gap, where `fade` runs from 1 on target to 0 at the cone's edge, so the nudge peaks at about 1.8
 * degrees mid-cone and never passes `maxDeg`: the thumb still does the aiming. `scripts/aim-assist-bench.ts` measures it at
 * about 20% more hits for a thumb that leads poorly.
 */
export const ASSIST = { coneDeg: 7, pull: 0.52, maxDeg: 2.5 } as const;

const DEG = Math.PI / 180;
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** The touch aim angle nudged toward the best target's meeting point, or `angle` unchanged when none is close enough. */
export function assistAngle(angle: number, me: Point, gun: GunId, range: number, targets: readonly AssistTarget[]): number {
  const def = GUNS[gun];
  let best: number | null = null;
  for (const t of targets) {
    if (Math.hypot(t.x - me.x, t.y - me.y) > range) continue;
    const meet = intercept(me, t, def.bulletSpeed, rulesOf(def).muzzleBoost, MUZZLE_PX);
    const off = wrap(Math.atan2(meet.y - me.y, meet.x - me.x) - angle);
    if (Math.abs(off) <= ASSIST.coneDeg * DEG && (best === null || Math.abs(off) < Math.abs(best))) best = off;
  }
  if (best === null) return angle;
  const fade = 1 - Math.abs(best) / (ASSIST.coneDeg * DEG);
  const nudge = Math.max(-ASSIST.maxDeg * DEG, Math.min(ASSIST.maxDeg * DEG, best * ASSIST.pull * fade * 2));
  return wrap(angle + nudge);
}
