import { WORLD, type AbilityId } from '../defs.ts';
import { damagePlayer, explode } from './combat.ts';
import { angleDiff, circleHitsRect, clamp, dist2, MAX_SUBSTEP, segmentEntersRectAt, startDash, type Rect } from './movement.ts';
import { isEnemy, newId, solidRects, type Player, type Thrown, type Wall, type World } from './world.ts';

const BUILT_WALL_MS = 12000;
export const GAS_RADIUS = 140;
const GRENADE_FUSE_MS = 900;
export const BLAST_RADIUS = { grenade: 160, fragGrenade: 90 } as const;
const THROW_SPEED = 700;

function throwGrenade(kind: 'grenade' | 'fragGrenade' | 'gasGrenade') {
  return (w: World, p: Player) => {
    const travel = clamp(p.input.aimDist, 60, THROW_SPEED * (GRENADE_FUSE_MS / 1000));
    const speed = travel / (GRENADE_FUSE_MS / 1000);
    w.thrown.push({
      id: newId(w), kind, owner: p.id, x: p.x, y: p.y,
      vx: Math.cos(p.angle) * speed, vy: Math.sin(p.angle) * speed, explodeAt: w.now + GRENADE_FUSE_MS,
    });
    return true;
  };
}

const KNIFE_LUNGE = 90;
const KNIFE_REACH = 70;
const KNIFE_ARC = Math.PI / 3;
const KNIFE_DAMAGE = 75;

const insideWorld = (x: number, y: number) =>
  x >= WORLD.playerRadius && x <= WORLD.size - WORLD.playerRadius && y >= WORLD.playerRadius && y <= WORLD.size - WORLD.playerRadius;

function knifeTarget(w: World, p: Player, solids: readonly Rect[]): Player | null {
  let best: Player | null = null, bestD = Infinity;
  for (const v of w.players.values()) {
    if (v.life.k !== 'alive' || !isEnemy(p, v)) continue;
    const d = Math.sqrt(dist2(p.x, p.y, v.x, v.y));
    if (d > KNIFE_REACH + WORLD.playerRadius || d >= bestD) continue;
    if (d > WORLD.playerRadius && angleDiff(Math.atan2(v.y - p.y, v.x - p.x), p.angle) > KNIFE_ARC) continue;
    if (solids.some((b) => segmentEntersRectAt(p.x, p.y, v.x - p.x, v.y - p.y, b) !== null)) continue;
    best = v;
    bestD = d;
  }
  return best;
}

export const ABILITIES: Record<AbilityId, (w: World, p: Player) => boolean> = {
  grenade: throwGrenade('grenade'),
  fragGrenade: throwGrenade('fragGrenade'),
  gasGrenade: throwGrenade('gasGrenade'),
  landMine: (w, p) => {
    w.thrown.push({ id: newId(w), kind: 'landMine', owner: p.id, x: p.x, y: p.y, armedAt: w.now + 600, expiresAt: w.now + 60000 });
    return true;
  },
  knife: (w, p) => {
    const solids = solidRects(w);
    const steps = Math.ceil(KNIFE_LUNGE / MAX_SUBSTEP);
    const sx = (Math.cos(p.angle) * KNIFE_LUNGE) / steps, sy = (Math.sin(p.angle) * KNIFE_LUNGE) / steps;
    let victim = knifeTarget(w, p, solids);
    for (let i = 0; i < steps && !victim; i++) {
      const nx = p.x + sx, ny = p.y + sy;
      if (!insideWorld(nx, ny) || solids.some((b) => circleHitsRect(nx, ny, WORLD.playerRadius, b))) break;
      p.x = nx;
      p.y = ny;
      victim = knifeTarget(w, p, solids);
    }
    if (victim) damagePlayer(w, victim, KNIFE_DAMAGE, { attacker: p, label: 'Knife', piercing: true, fromX: p.x, fromY: p.y });
    w.events.push({ e: 'slash', x: p.x, y: p.y, angle: p.angle, owner: p.id });
    return true;
  },
  engineer: (w, p) => {
    const cx = p.x + Math.cos(p.angle) * 80, cy = p.y + Math.sin(p.angle) * 80;
    const acrossX = Math.abs(Math.cos(p.angle)) < Math.abs(Math.sin(p.angle));
    const [ww, hh] = acrossX ? [140, 24] : [24, 140];
    const wall: Wall = { x: cx - ww / 2, y: cy - hh / 2, w: ww, h: hh, built: true, expiresAt: w.now + BUILT_WALL_MS };
    const blocked = [...w.players.values()].some((o) => o.life.k === 'alive' && circleHitsRect(o.x, o.y, WORLD.playerRadius, wall));
    if (blocked) return false;
    w.walls.push(wall);
    w.wallsVersion++;
    return true;
  },
  dash: (w, p) => {
    if (p.life.k === 'alive') p.life.dash = startDash(p.input);
    return true;
  },
};

export function tickThrown(w: World, dt: number) {
  const keep: Thrown[] = [];
  for (const t of w.thrown) {
    const owner = w.players.get(t.owner) ?? null;
    switch (t.kind) {
      case 'grenade':
      case 'fragGrenade':
      case 'gasGrenade': {
        const nx = t.x + t.vx * dt, ny = t.y + t.vy * dt;
        if (solidRects(w).some((b) => segmentEntersRectAt(t.x, t.y, nx - t.x, ny - t.y, b) !== null)) { t.vx = 0; t.vy = 0; }
        else { t.x = nx; t.y = ny; }
        if (w.now < t.explodeAt) { keep.push(t); break; }
        if (t.kind === 'grenade') explode(w, t.x, t.y, BLAST_RADIUS.grenade, 80, owner, 'Grenade');
        else if (t.kind === 'fragGrenade') {
          explode(w, t.x, t.y, BLAST_RADIUS.fragGrenade, 40, owner, 'Frag');
          for (let i = 0; i < 16; i++) {
            const a = (i / 16) * Math.PI * 2;
            w.bullets.push({
              id: newId(w), owner: t.owner, x: t.x, y: t.y, vx: Math.cos(a) * 1100, vy: Math.sin(a) * 1100,
              left: 320, damage: 18, piercing: false, label: 'Frag',
            });
          }
        } else {
          w.events.push({ e: 'boom', x: t.x, y: t.y, r: 40 });
          keep.push({ id: t.id, kind: 'gasCloud', owner: t.owner, x: t.x, y: t.y, expiresAt: w.now + 5000 });
        }
        break;
      }
      case 'landMine': {
        if (w.now >= t.expiresAt || !owner) break;
        const tripped = w.now >= t.armedAt && [...w.players.values()].some(
          (p) => p.life.k === 'alive' && isEnemy(owner, p) && dist2(p.x, p.y, t.x, t.y) < (WORLD.playerRadius + 30) ** 2,
        );
        if (tripped) explode(w, t.x, t.y, 130, 90, owner, 'Land mine');
        else keep.push(t);
        break;
      }
      case 'gasCloud': {
        if (w.now >= t.expiresAt) break;
        for (const p of w.players.values()) {
          if (dist2(p.x, p.y, t.x, t.y) < GAS_RADIUS ** 2) {
            damagePlayer(w, p, 14 * dt, { attacker: owner, label: 'Gas', piercing: true, fromX: t.x, fromY: t.y });
          }
        }
        keep.push(t);
        break;
      }
    }
  }
  w.thrown = keep;
}
