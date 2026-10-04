import { ARMORS, WORLD } from '../defs.ts';
import { MODES } from './modes.ts';
import { angleDiff, circleHitsRect, dist2, segmentEntersCircleAt, segmentEntersRectAt } from './movement.ts';
import { addScore, effectiveStats, isHunted } from './stats.ts';
import { crateRect, sameTeam, type Bullet, type Crate, type Player, type Pose, type Wall, type World } from './world.ts';

const CRATE_RESPAWN_MS = 15000;
const SHIELD_BLOCK = 0.6;
const SHIELD_ARC = Math.PI / 3;
/** Covers the ~330ms p90 view lag measured at 100ms one-way lag with 40ms jitter; a 200ms cap left those shooters at a 10% hit rate. */
export const MAX_REWIND_MS = 350;
const TICK_MS = 1000 / WORLD.tickHz;

const round1 = (v: number) => Math.round(v * 10) / 10;

type DamageSource = { attacker: Player | null; label: string; piercing: boolean; fromX: number; fromY: number };

export function damagePlayer(w: World, victim: Player, amount: number, src: DamageSource): void {
  if (victim.life.k !== 'alive') return;
  const a = src.attacker;
  if (a && (a.id === victim.id || sameTeam(a, victim))) return;
  const life = victim.life;
  const before = life.hp + life.armor;
  const stats = effectiveStats(victim);
  if (stats.shield) {
    const incoming = Math.atan2(src.fromY - victim.y, src.fromX - victim.x);
    if (angleDiff(incoming, victim.angle) <= SHIELD_ARC) amount *= 1 - SHIELD_BLOCK;
  }
  if (!src.piercing && life.armor > 0) {
    const absorbed = Math.min(life.armor, amount * ARMORS[victim.loadout.armor].absorbFrac);
    life.armor -= absorbed;
    amount -= absorbed;
  }
  life.hp -= amount;
  life.lastDamageAt = w.now;
  const dealt = before - Math.max(0, life.hp) - life.armor;
  w.events.push({ e: 'dmg', attacker: a?.id ?? null, victim: victim.id, amount: round1(dealt), x: victim.x, y: victim.y, kind: 'player' });
  if (life.hp <= 0) kill(w, victim, a, src.label);
}

function kill(w: World, victim: Player, killer: Player | null, label: string) {
  const bounty = killer !== null && isHunted(victim);
  victim.life = { k: 'dead', respawnAt: w.now + WORLD.respawnMs };
  victim.deaths++;
  w.lifeRecords.push({ id: victim.id, name: victim.name, kills: victim.lifeKills, score: victim.score, died: true });
  w.events.push({ e: 'kill', killer: killer?.name ?? '', victim: victim.name, killerId: killer?.id ?? null, victimId: victim.id, weapon: label, bounty });
  if (!killer) return;
  killer.kills++;
  killer.lifeKills++;
  addScore(w, killer, WORLD.killScore + (bounty ? WORLD.bountyScore : 0));
  if (w.match.k === 'playing') MODES[w.mode].onKill(w, killer, victim);
}

function damageCrate(w: World, c: Crate, amount: number, attacker: Player | null) {
  if (c.respawnAt !== null) return;
  const dealt = Math.min(c.hp, amount);
  c.hp -= amount;
  const h = c.size / 2;
  w.events.push({ e: 'dmg', attacker: attacker?.id ?? null, victim: c.id, amount: round1(dealt), x: c.x + h, y: c.y + h, kind: 'crate' });
  if (c.hp > 0) return;
  c.respawnAt = w.now + CRATE_RESPAWN_MS;
  w.events.push({ e: 'boom', x: c.x + h, y: c.y + h, r: c.size });
  if (attacker) addScore(w, attacker, WORLD.crateScore);
}

export function explode(w: World, x: number, y: number, radius: number, maxDamage: number, owner: Player | null, label: string) {
  w.events.push({ e: 'boom', x, y, r: radius });
  for (const p of w.players.values()) {
    const d = Math.sqrt(dist2(p.x, p.y, x, y));
    if (d > radius + WORLD.playerRadius) continue;
    const dmg = maxDamage * (1 - Math.max(0, d - WORLD.playerRadius) / radius);
    damagePlayer(w, p, dmg, { attacker: owner, label, piercing: false, fromX: x, fromY: y });
  }
  for (const c of w.crates) {
    if (circleHitsRect(x, y, radius, crateRect(c))) damageCrate(w, c, maxDamage, owner);
  }
}

type BulletHit = { t: number | null; victim: Player | null; apply: (x: number, y: number) => void };

function stopBullet(w: World, b: Bullet, x: number, y: number, owner: Player | null): false {
  if (b.blast) explode(w, x, y, b.blast.radius, b.blast.damage, owner, b.label);
  return false;
}

function moveBullet(w: World, b: Bullet, dt: number, poseOf: (p: Player) => Pose | undefined, walls: readonly Wall[]): boolean {
  const speed = Math.hypot(b.vx, b.vy);
  const travel = Math.min(b.left, speed * dt);
  const dx = (b.vx / speed) * travel, dy = (b.vy / speed) * travel;
  const owner = w.players.get(b.owner) ?? null;
  const candidates: BulletHit[] = [
    ...walls.map((wall) => ({ t: segmentEntersRectAt(b.x, b.y, dx, dy, wall), victim: null, apply: (x: number, y: number) => { w.events.push({ e: 'impact', x, y }); } })),
    ...w.crates.filter((c) => c.respawnAt === null).map((c) => ({
      t: segmentEntersRectAt(b.x, b.y, dx, dy, crateRect(c)), victim: null, apply: () => damageCrate(w, c, b.damage, owner),
    })),
    ...[...w.players.values()]
      .filter((p) => p.id !== b.owner && p.life.k === 'alive' && !(owner && sameTeam(owner, p)) && !b.passed.includes(p.id))
      .flatMap((p) => {
        const at = poseOf(p);
        return at ? [{
          t: segmentEntersCircleAt(b.x, b.y, dx, dy, at.x, at.y, WORLD.playerRadius),
          victim: p,
          apply: () => damagePlayer(w, p, b.damage, { attacker: owner, label: b.label, piercing: b.piercing, fromX: b.x, fromY: b.y }),
        }] : [];
      }),
  ];
  const hits = candidates.filter((c): c is BulletHit & { t: number } => c.t !== null).sort((a, c) => a.t - c.t);
  for (const hit of hits) {
    const x = b.x + dx * hit.t, y = b.y + dy * hit.t;
    hit.apply(x, y);
    if (!hit.victim || b.penetrate === 0) return stopBullet(w, b, x, y, owner);
    b.penetrate--;
    b.passed.push(hit.victim.id);
  }
  b.x += dx;
  b.y += dy;
  b.left -= travel;
  return b.left > 0.5 || stopBullet(w, b, b.x, b.y, owner);
}

function posesAt(w: World, at: number): ReadonlyMap<number, Pose> {
  const h = w.history;
  const next = h.findIndex((f) => f.at >= at);
  if (next === -1) return h[h.length - 1]?.poses ?? new Map([...w.players.values()].map((p) => [p.id, { x: p.x, y: p.y }]));
  const b = h[next]!;
  const a = h[next - 1];
  if (!a) return b.poses;
  const k = (at - a.at) / (b.at - a.at);
  const poses = new Map<number, Pose>();
  for (const [id, pb] of b.poses) {
    const pa = a.poses.get(id);
    poses.set(id, pa ? { x: pa.x + (pb.x - pa.x) * k, y: pa.y + (pb.y - pa.y) * k } : pb);
  }
  return poses;
}

/** Any wall that stood during the rewound window blocks, so a rewound shot never passes where cover existed. */
export function flyThroughPast(w: World, b: Bullet, rewindMs: number): boolean {
  const from = w.now - rewindMs;
  const walls = [...new Set([...w.history.filter((f) => f.at >= from - TICK_MS).flatMap((f) => f.walls), ...w.walls])];
  for (let t = from; t < w.now;) {
    const dtMs = Math.min(TICK_MS, w.now - t);
    t += dtMs;
    const poses = posesAt(w, t);
    if (!moveBullet(w, b, dtMs / 1000, (p) => poses.get(p.id), walls)) return false;
  }
  return true;
}

export function tickBullets(w: World, dt: number) {
  w.bullets = w.bullets.filter((b) => moveBullet(w, b, dt, (p) => p, w.walls));
}

export function recordPoses(w: World) {
  const poses = new Map<number, Pose>();
  for (const p of w.players.values()) if (p.life.k === 'alive') poses.set(p.id, { x: p.x, y: p.y });
  w.history.push({ at: w.now, poses, walls: w.walls });
  while (w.history.length > 2 && w.history[1]!.at <= w.now - MAX_REWIND_MS) w.history.shift();
}
