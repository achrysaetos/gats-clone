import { WORLD, type AbilityId } from '../defs.ts';
import { damagePlayer, explode } from './combat.ts';
import { circleHitsRect, clamp, dist2, knifeLunge, segmentEntersRectAt, startDash } from './movement.ts';
import { isEnemy, newId, solidRects, type Player, type Thrown, type Wall, type World } from './world.ts';

const BUILT_WALL_MS = 12000;
export const GAS_RADIUS = 140;
export const GRENADE_FUSE_MS = 900;
export const BLAST_RADIUS = { grenade: 160, fragGrenade: 90 } as const;
const THROW_SPEED = 700;

function throwGrenade(kind: 'grenade' | 'fragGrenade' | 'gasGrenade') {
  return (w: World, p: Player) => {
    const travel = clamp(p.input.aimDist, 60, THROW_SPEED * (GRENADE_FUSE_MS / 1000));
    const speed = travel / (GRENADE_FUSE_MS / 1000);
    w.thrown.push({
      id: newId(w), kind, owner: p.id, team: p.team, x: p.x, y: p.y,
      vx: Math.cos(p.angle) * speed, vy: Math.sin(p.angle) * speed, explodeAt: w.now + GRENADE_FUSE_MS,
    });
    return true;
  };
}

const KNIFE_DAMAGE = 50;
const MAX_MINES = 2;

export const ABILITIES: Record<AbilityId, (w: World, p: Player) => boolean> = {
  grenade: throwGrenade('grenade'),
  fragGrenade: throwGrenade('fragGrenade'),
  gasGrenade: throwGrenade('gasGrenade'),
  landMine: (w, p) => {
    const mines = w.thrown.filter((t) => t.kind === 'landMine' && t.owner === p.id);
    if (mines.length >= MAX_MINES) w.thrown = w.thrown.filter((t) => t !== mines[0]);
    w.thrown.push({ id: newId(w), kind: 'landMine', owner: p.id, team: p.team, x: p.x, y: p.y, armedAt: w.now + 600, expiresAt: w.now + 60000 });
    return true;
  },
  knife: (w, p) => {
    const enemies = [...w.players.values()].filter((v) => v.life.k === 'alive' && isEnemy(p, v));
    const { x, y, victim } = knifeLunge(solidRects(w), p, p.angle, enemies);
    p.x = x;
    p.y = y;
    if (victim) damagePlayer(w, victim, KNIFE_DAMAGE, { attacker: p, team: p.team, label: 'Knife', piercing: true, via: 'knife', fromX: p.x, fromY: p.y });
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
    const by = { attacker: owner, team: t.team };
    switch (t.kind) {
      case 'grenade':
      case 'fragGrenade':
      case 'gasGrenade': {
        const nx = t.x + t.vx * dt, ny = t.y + t.vy * dt;
        if (solidRects(w).some((b) => segmentEntersRectAt(t.x, t.y, nx - t.x, ny - t.y, b) !== null)) { t.vx = 0; t.vy = 0; }
        else { t.x = nx; t.y = ny; }
        if (w.now < t.explodeAt) { keep.push(t); break; }
        if (t.kind === 'grenade') explode(w, t.x, t.y, BLAST_RADIUS.grenade, 80, { ...by, label: 'Grenade' });
        else if (t.kind === 'fragGrenade') {
          explode(w, t.x, t.y, BLAST_RADIUS.fragGrenade, 40, { ...by, label: 'Frag' });
          for (let i = 0; i < 16; i++) {
            const a = (i / 16) * Math.PI * 2;
            w.bullets.push({
              id: newId(w), owner: t.owner, team: t.team, x: t.x, y: t.y, vx: Math.cos(a) * 1100, vy: Math.sin(a) * 1100,
              left: 320, damage: 18, piercing: false, label: 'Frag', gun: null, penetrate: 0, passed: [], blast: null,
            });
          }
        } else {
          w.events.push({ e: 'boom', x: t.x, y: t.y, r: 40 });
          keep.push({ id: t.id, kind: 'gasCloud', owner: t.owner, team: t.team, x: t.x, y: t.y, expiresAt: w.now + 5000 });
        }
        break;
      }
      case 'landMine': {
        if (w.now >= t.expiresAt || owner?.life.k !== 'alive') break;
        const tripped = w.now >= t.armedAt && [...w.players.values()].some(
          (p) => p.life.k === 'alive' && isEnemy(owner, p) && dist2(p.x, p.y, t.x, t.y) < (WORLD.playerRadius + 30) ** 2,
        );
        if (tripped) explode(w, t.x, t.y, 130, 90, { ...by, label: 'Land mine' });
        else keep.push(t);
        break;
      }
      case 'gasCloud': {
        if (w.now >= t.expiresAt) break;
        for (const p of w.players.values()) {
          if (dist2(p.x, p.y, t.x, t.y) < GAS_RADIUS ** 2) {
            damagePlayer(w, p, 14 * dt, { ...by, label: 'Gas', piercing: true, via: 'gas', fromX: t.x, fromY: t.y });
          }
        }
        keep.push(t);
        break;
      }
    }
  }
  w.thrown = keep;
}
