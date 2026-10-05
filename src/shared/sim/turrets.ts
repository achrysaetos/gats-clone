import { BUILDINGS, ZOM } from '../defs.ts';
import { MODES } from './modes.ts';
import { dist2, segmentEntersRectAt, type Rect } from './movement.ts';
import { coverRects, newId, rand, type Turret, type World, type Zombie } from './world.ts';

/** How far out from the cell's center a turret's rounds leave the barrel. */
export const MUZZLE = { sentry: 22, cannon: 28 } as const;

/** The nearest zombie in range that nothing solid hides; the squad's own buildings never block a turret's view. */
function targetOf(zombies: readonly Zombie[], cover: readonly Rect[], x: number, y: number, range: number): Zombie | null {
  const inRange = zombies.map((z) => ({ z, d: dist2(x, y, z.x, z.y) })).filter((c) => c.d <= range * range).sort((a, b) => a.d - b.d);
  return inRange.find(({ z }) => !cover.some((r) => segmentEntersRectAt(x, y, z.x - x, z.y - y, r) !== null))?.z ?? null;
}

function fire(w: World, t: Turret, target: Zombie, x: number, y: number) {
  const def = BUILDINGS[t.kind].turret;
  const aim = Math.atan2(target.y - y, target.x - x);
  const a = aim + (rand(w) - 0.5) * def.spread * 2;
  w.bullets.push({
    id: newId(w), owner: t.owner, team: MODES.ZOM.assignTeam(w), x: x + Math.cos(aim) * MUZZLE[t.kind], y: y + Math.sin(aim) * MUZZLE[t.kind],
    vx: Math.cos(a) * def.bulletSpeed, vy: Math.sin(a) * def.bulletSpeed, left: def.range, damage: def.damage, piercing: false,
    label: BUILDINGS[t.kind].name, gun: null, turret: t.kind, penetrate: 0, passed: [], blast: null,
  });
  w.events.push({ e: 'turret', kind: t.kind, x, y, angle: aim });
}

/** Each loaded turret whose gun has cooled fires one round at its target. */
export function tickTurrets(w: World, dtMs: number) {
  if (w.zombies.length === 0) return;
  const cover = coverRects(w);
  for (const t of w.buildings) {
    if (t.kind === 'wall' || t.ammo < 1 || w.now < t.nextFireAt) continue;
    const def = BUILDINGS[t.kind].turret;
    const x = (t.cx + 0.5) * ZOM.cell, y = (t.cy + 0.5) * ZOM.cell;
    const target = targetOf(w.zombies, cover, x, y, def.range);
    if (!target) continue;
    fire(w, t, target, x, y);
    t.ammo--;
    // Carry the part of the interval that fell between ticks, so a sentry keeps its rate rather than the tick's.
    t.nextFireAt = (w.now - t.nextFireAt < dtMs ? t.nextFireAt : w.now) + def.fireMs;
  }
}
