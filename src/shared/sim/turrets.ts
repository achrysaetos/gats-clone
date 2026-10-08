import { BASTION_GUN, BUILDINGS, ZOM, ZOMBIES, type TurretDef } from '../defs.ts';
import { MODES } from './modes.ts';
import { dist2, segmentEntersRectAt, type Rect } from './movement.ts';
import { coverRects, newId, rand, type Run, type Shooter, type World, type Zombie } from './world.ts';

const plateTooThick = (def: TurretDef, z: Zombie) => !def.lobbed && ZOMBIES[z.kind].plate > def.damage / 2;

function targetOf(zombies: readonly Zombie[], cover: readonly Rect[], x: number, y: number, def: TurretDef): Zombie | null {
  const rank = (z: Zombie) => (z.kind === def.prefers ? 0 : 1);
  const inRange = zombies.filter((z) => !plateTooThick(def, z)).map((z) => ({ z, d: dist2(x, y, z.x, z.y) })).filter((c) => c.d <= def.range ** 2).sort((a, b) => rank(a.z) - rank(b.z) || a.d - b.d);
  return inRange.find(({ z }) => def.lobbed || !cover.some((r) => segmentEntersRectAt(x, y, z.x - x, z.y - y, r) !== null))?.z ?? null;
}

function leadFor(def: TurretDef, target: Zombie, x: number, y: number) {
  let at = { x: target.x, y: target.y };
  for (let i = 0; i < 3; i++) {
    const flight = Math.max(0, Math.hypot(at.x - x, at.y - y) - def.muzzle) / def.bulletSpeed;
    at = { x: target.x + target.vx * flight, y: target.y + target.vy * flight };
  }
  const d = Math.hypot(at.x - x, at.y - y);
  return d <= def.range ? at : { x: x + ((at.x - x) / d) * def.range, y: y + ((at.y - y) / d) * def.range };
}

function fire(w: World, def: TurretDef, by: { owner: number; label: string; turret: Shooter }, target: Zombie, x: number, y: number) {
  const at = def.lobbed ? leadFor(def, target, x, y) : target;
  const aim = Math.atan2(at.y - y, at.x - x);
  const reach = def.lobbed ? Math.max(0, Math.hypot(at.x - x, at.y - y) - def.muzzle) : def.range;
  for (let i = 0; i < def.pellets; i++) {
    const a = aim + (def.pellets === 1 ? (rand(w) - 0.5) * def.spread * 2 : pelletOffset(i, def.pellets, def.spread));
    w.bullets.push({
      id: newId(w), owner: by.owner, team: MODES.ZOM.assignTeam(w), x: x + Math.cos(aim) * def.muzzle, y: y + Math.sin(aim) * def.muzzle,
      vx: Math.cos(a) * def.bulletSpeed, vy: Math.sin(a) * def.bulletSpeed, range: reach, left: reach, damage: def.damage, piercing: false,
      label: by.label, gun: null, turret: by.turret, lobbed: def.lobbed !== null, penetrate: 0, passed: [], blast: def.lobbed,
    });
  }
  if (by.turret !== 'bastion') w.events.push({ e: 'turret', kind: by.turret, x, y, angle: Math.round(aim * 100) / 100, ...(def.lobbed && { reach: Math.round(reach) }) });
}

const nextShot = (at: number, now: number, dtMs: number, gapMs: number) => (now - at < dtMs ? at : now) + gapMs;


/** A many-pellet turret fires an even fan, so the tracers a client draws from the shot event are where the rounds go. */
export const pelletOffset = (i: number, pellets: number, spread: number): number => (i / (pellets - 1) - 0.5) * spread * 2;
export function tickTurrets(w: World, run: Run, core: { x: number; y: number }, dtMs: number) {
  if (w.zombies.length === 0) return;
  const cover = coverRects(w);
  const near = run.survivors > 0 && w.now >= run.bastionFireAt && targetOf(w.zombies, cover, core.x, core.y, BASTION_GUN);
  if (near) {
    fire(w, BASTION_GUN, { owner: -1, label: 'Bastion', turret: 'bastion' }, near, core.x, core.y);
    run.bastionFireAt = nextShot(run.bastionFireAt, w.now, dtMs, (BASTION_GUN.fireMs * ZOM.survivors) / run.survivors);
  }
  for (const t of w.buildings) {
    if (t.kind === 'wall' || t.ammo < 1 || w.now < t.nextFireAt) continue;
    const def = BUILDINGS[t.kind].turret;
    const x = (t.cx + 0.5) * ZOM.cell, y = (t.cy + 0.5) * ZOM.cell;
    const target = targetOf(w.zombies, cover, x, y, def);
    if (!target) continue;
    fire(w, def, { owner: t.owner, label: BUILDINGS[t.kind].name, turret: t.kind }, target, x, y);
    t.ammo--;
    t.nextFireAt = nextShot(t.nextFireAt, w.now, dtMs, def.fireMs);
  }
}
