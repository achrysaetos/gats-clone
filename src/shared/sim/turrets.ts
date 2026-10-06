import { BUILDINGS, ZOM, type TurretDef } from '../defs.ts';
import { MODES } from './modes.ts';
import { dist2, segmentEntersRectAt, type Rect } from './movement.ts';
import { coverRects, newId, rand, type Turret, type World, type Zombie } from './world.ts';

/** The nearest zombie in range of the kind the turret prefers, else of any kind, that nothing solid hides; the squad's own buildings never block a turret's view. */
function targetOf(zombies: readonly Zombie[], cover: readonly Rect[], x: number, y: number, def: TurretDef): Zombie | null {
  const rank = (z: Zombie) => (z.kind === def.prefers ? 0 : 1);
  const inRange = zombies.map((z) => ({ z, d: dist2(x, y, z.x, z.y) })).filter((c) => c.d <= def.range ** 2).sort((a, b) => rank(a.z) - rank(b.z) || a.d - b.d);
  return inRange.find(({ z }) => def.lobbed || !cover.some((r) => segmentEntersRectAt(x, y, z.x - x, z.y - y, r) !== null))?.z ?? null;
}

function fire(w: World, t: Turret, target: Zombie, x: number, y: number) {
  const def = BUILDINGS[t.kind].turret;
  const aim = Math.atan2(target.y - y, target.x - x);
  const reach = def.lobbed ? Math.max(0, Math.hypot(target.x - x, target.y - y) - def.muzzle) : def.range;
  for (let i = 0; i < def.pellets; i++) {
    const a = aim + (rand(w) - 0.5) * def.spread * 2;
    w.bullets.push({
      id: newId(w), owner: t.owner, team: MODES.ZOM.assignTeam(w), x: x + Math.cos(aim) * def.muzzle, y: y + Math.sin(aim) * def.muzzle,
      vx: Math.cos(a) * def.bulletSpeed, vy: Math.sin(a) * def.bulletSpeed, left: reach, damage: def.damage, piercing: false,
      label: BUILDINGS[t.kind].name, gun: null, turret: t.kind, penetrate: 0, passed: [], blast: def.lobbed,
    });
  }
  w.events.push({ e: 'turret', kind: t.kind, x, y, angle: Math.round(aim * 100) / 100, ...(def.lobbed && { reach: Math.round(reach) }) });
}

/** Each loaded turret whose gun has cooled fires one round at its target. */
export function tickTurrets(w: World, dtMs: number) {
  if (w.zombies.length === 0) return;
  const cover = coverRects(w);
  for (const t of w.buildings) {
    if (t.kind === 'wall' || t.ammo < 1 || w.now < t.nextFireAt) continue;
    const def = BUILDINGS[t.kind].turret;
    const x = (t.cx + 0.5) * ZOM.cell, y = (t.cy + 0.5) * ZOM.cell;
    const target = targetOf(w.zombies, cover, x, y, def);
    if (!target) continue;
    fire(w, t, target, x, y);
    t.ammo--;
    // Carry the part of the interval that fell between ticks, so a sentry keeps its rate rather than the tick's.
    t.nextFireAt = (w.now - t.nextFireAt < dtMs ? t.nextFireAt : w.now) + def.fireMs;
  }
}
