/// <reference types="node" />
// Usage: node scripts/aim-assist-bench.ts [shots=20000]
// A thumb aims at an enemy's drawn body with a jittered angle and a rough lead, the enemy runs at full speed across the line,
// and each shot flies along the muzzle curve. Prints the hit rate with and without the touch aim assist per gun and range,
// and how far the assist moved the aim.
import { GUNS, rulesOf, WORLD, type GunId } from '../src/shared/defs.ts';
import { flownAfter, MUZZLE_PX } from '../src/shared/sim/ballistics.ts';
import { assistAngle, type AssistTarget } from '../src/client/aimassist.ts';

const SHOTS = Number(process.argv[2] ?? 20000);
/** Thumb aim: angular error (radians, normal), and how much of the true lead a thumb gives, uniform in [lo, hi]. */
export const THUMB = { sigma: 0.07, lead: [0, 0.6] as const };

let seed = 7;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const normal = () => Math.sqrt(-2 * Math.log(rand() + 1e-12)) * Math.cos(2 * Math.PI * rand());

/** Whether a round fired at `angle` from the origin passes within a body of a target starting at `t` moving at its velocity. */
function hits(gun: GunId, angle: number, t: AssistTarget): boolean {
  const def = GUNS[gun];
  const boost = rulesOf(def).muzzleBoost;
  for (let ms = 0; ms < 2000; ms += 4) {
    const d = MUZZLE_PX + flownAfter(def.bulletSpeed, ms / 1000, 0, boost);
    if (d > def.range) return false;
    const bx = Math.cos(angle) * d, by = Math.sin(angle) * d;
    const tx = t.x + t.vx * ms / 1000, ty = t.y + t.vy * ms / 1000;
    if (Math.hypot(bx - tx, by - ty) <= WORLD.playerRadius) return true;
  }
  return false;
}

export function bench(gun: GunId, d: number, shots: number) {
  let plain = 0, assisted = 0, moved = 0;
  for (let i = 0; i < shots; i++) {
    const dir = rand() < 0.5 ? 1 : -1;
    const t: AssistTarget = { x: d, y: 0, vx: 0, vy: WORLD.baseSpeed * dir };
    const flight = d / GUNS[gun].bulletSpeed;
    const lead = THUMB.lead[0] + rand() * (THUMB.lead[1] - THUMB.lead[0]);
    const aim = Math.atan2(t.vy * flight * lead, d) + normal() * THUMB.sigma;
    const helped = assistAngle(aim, { x: 0, y: 0 }, gun, GUNS[gun].range, [t]);
    moved = Math.max(moved, Math.abs(helped - aim));
    if (hits(gun, aim, t)) plain++;
    if (hits(gun, helped, t)) assisted++;
  }
  return { plain: plain / shots, assisted: assisted / shots, maxMovedDeg: (moved * 180) / Math.PI };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let p = 0, a = 0, n = 0;
  for (const gun of ['pistol', 'smg', 'assault', 'lmg', 'shotgun', 'sniper'] as const) {
    for (const d of [200, 400, 600]) {
      if (d > GUNS[gun].range) continue;
      const r = bench(gun, d, SHOTS / 18);
      p += r.plain; a += r.assisted; n++;
      console.log(`${gun.padEnd(8)} @${String(d).padStart(3)}px  plain ${(r.plain * 100).toFixed(1).padStart(5)}%  assisted ${(r.assisted * 100).toFixed(1).padStart(5)}%  gain ${((r.assisted / r.plain - 1) * 100).toFixed(0).padStart(4)}%  max nudge ${r.maxMovedDeg.toFixed(2)}deg`);
    }
  }
  console.log(`overall: plain ${(p / n * 100).toFixed(1)}%  assisted ${(a / n * 100).toFixed(1)}%  gain ${((a / p - 1) * 100).toFixed(0)}%`);
}
