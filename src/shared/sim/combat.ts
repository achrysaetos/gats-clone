import { ARMORS, HP_MULTIPLIER, WORLD } from '../defs.ts';
import { MODES } from './modes.ts';
import { angleDiff, clamp, dist2, segmentEntersCircleAt, segmentEntersRectAt } from './movement.ts';
import { addScore, effectiveStats, isHunted } from './stats.ts';
import { crateRect, sameTeam, type Bullet, type Crate, type Player, type Pose, type Wall, type World } from './world.ts';

const CRATE_RESPAWN_MS = 15000;
const SHIELD_BLOCK = 0.35;
const SHIELD_ARC = (40 * Math.PI) / 180;
/** Covers the ~330ms p90 view lag measured at 100ms one-way lag with 40ms jitter; a 200ms cap left those shooters at a 10% hit rate. */
export const MAX_REWIND_MS = 350;
const TICK_MS = 1000 / WORLD.tickHz;
const OWN_BLAST_SHARE = 0.5;

const round1 = (v: number) => Math.round(v * 10) / 10;

/** A shield stops only bullets, and only a blast hurts its own attacker. */
type DamageSource = { attacker: Player | null; label: string; piercing: boolean; via: 'bullet' | 'blast' | 'knife' | 'gas'; fromX: number; fromY: number };

export function damagePlayer(w: World, victim: Player, amount: number, src: DamageSource): void {
  if (victim.life.k !== 'alive' || w.match.k === 'over') return;
  const a = src.attacker;
  if (a && (a.id === victim.id ? src.via !== 'blast' : sameTeam(a, victim))) return;
  const life = victim.life;
  const before = life.hp + life.armor;
  const stats = effectiveStats(victim);
  if (stats.shield && src.via === 'bullet') {
    const incoming = Math.atan2(src.fromY - victim.y, src.fromX - victim.x);
    if (angleDiff(incoming, victim.angle) <= SHIELD_ARC) amount *= 1 - SHIELD_BLOCK;
  }
  if (!src.piercing && life.armor > 0) {
    const absorbed = Math.min(life.armor, amount * ARMORS[victim.loadout.armor].absorbFrac);
    life.armor -= absorbed;
    amount -= absorbed;
  }
  // A human hits as hard as the victim's health is multiplied, so human duels run at bot pace; armor is not multiplied, so this follows absorption.
  life.hp -= amount * (a?.kind === 'human' ? HP_MULTIPLIER[victim.kind] : 1);
  life.lastDamageAt = w.now;
  const dealt = before - Math.max(0, life.hp) - life.armor;
  w.events.push({ e: 'dmg', attacker: a?.id ?? null, victim: victim.id, amount: round1(dealt), x: victim.x, y: victim.y, kind: 'player' });
  if (life.hp <= 0) kill(w, victim, a, src.label);
}

function kill(w: World, victim: Player, killer: Player | null, label: string) {
  const credited = killer?.id === victim.id ? null : killer;
  const bounty = credited !== null && isHunted(victim);
  victim.life = { k: 'dead', respawnAt: w.now + WORLD.respawnMs };
  victim.deaths++;
  w.lifeRecords.push({ id: victim.id, name: victim.name, kills: victim.lifeKills, score: victim.score, died: true });
  w.events.push({ e: 'kill', killer: killer?.name ?? '', victim: victim.name, killerId: killer?.id ?? null, victimId: victim.id, weapon: label, bounty });
  if (!credited) return;
  credited.kills++;
  credited.lifeKills++;
  addScore(w, credited, WORLD.killScore + (bounty ? WORLD.bountyScore : 0));
  MODES[w.mode].onKill(w, credited, victim);
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

/** What a moving bullet or blast is judged against: live positions, or the rewound world a lagged shooter saw. */
type View = { poseOf: (p: Player) => Pose | undefined; walls: readonly Wall[] };
const liveView = (w: World): View => ({ poseOf: (p) => p, walls: w.walls });

const sheltered = (walls: readonly Wall[], x: number, y: number, tx: number, ty: number) =>
  walls.some((wall) => segmentEntersRectAt(x, y, tx - x, ty - y, wall) !== null);

export function explode(w: World, x: number, y: number, radius: number, maxDamage: number, owner: Player | null, label: string, view: View = liveView(w)) {
  w.events.push({ e: 'boom', x, y, r: radius });
  for (const p of w.players.values()) {
    const at = view.poseOf(p);
    if (!at) continue;
    const d = Math.sqrt(dist2(at.x, at.y, x, y));
    if (d > radius + WORLD.playerRadius || sheltered(view.walls, x, y, at.x, at.y)) continue;
    const dmg = maxDamage * (1 - Math.max(0, d - WORLD.playerRadius) / radius) * (p === owner ? OWN_BLAST_SHARE : 1);
    damagePlayer(w, p, dmg, { attacker: owner, label, piercing: false, via: 'blast', fromX: x, fromY: y });
  }
  for (const c of w.crates) {
    const r = crateRect(c);
    const nx = clamp(x, r.x, r.x + r.w), ny = clamp(y, r.y, r.y + r.h);
    const d = Math.sqrt(dist2(x, y, nx, ny));
    if (d >= radius || sheltered(view.walls, x, y, nx, ny)) continue;
    damageCrate(w, c, maxDamage * (1 - d / radius), owner);
  }
}

type BulletHit = { t: number | null; victim: Player | null; apply: (x: number, y: number) => void };

/** Backs the blast off the surface it struck, so the wall it hit does not shelter the side the bullet came from. */
const BLAST_STANDOFF = 2;

function stopBullet(w: World, b: Bullet, x: number, y: number, owner: Player | null, view: View): false {
  if (!b.blast) return false;
  const speed = Math.hypot(b.vx, b.vy);
  const bx = x - (b.vx / speed) * BLAST_STANDOFF, by = y - (b.vy / speed) * BLAST_STANDOFF;
  explode(w, bx, by, b.blast.radius, b.blast.damage, owner, b.label, view);
  return false;
}

function moveBullet(w: World, b: Bullet, dt: number, view: View): boolean {
  const speed = Math.hypot(b.vx, b.vy);
  const travel = Math.min(b.left, speed * dt);
  const dx = (b.vx / speed) * travel, dy = (b.vy / speed) * travel;
  const owner = w.players.get(b.owner) ?? null;
  const candidates: BulletHit[] = [
    ...view.walls.map((wall) => ({ t: segmentEntersRectAt(b.x, b.y, dx, dy, wall), victim: null, apply: (x: number, y: number) => { w.events.push({ e: 'impact', x, y }); } })),
    ...w.crates.filter((c) => c.respawnAt === null).map((c) => ({
      t: segmentEntersRectAt(b.x, b.y, dx, dy, crateRect(c)), victim: null, apply: () => damageCrate(w, c, b.damage, owner),
    })),
    ...[...w.players.values()]
      .filter((p) => p.id !== b.owner && p.life.k === 'alive' && !(owner && sameTeam(owner, p)) && !b.passed.includes(p.id))
      .flatMap((p) => {
        const at = view.poseOf(p);
        return at ? [{
          t: segmentEntersCircleAt(b.x, b.y, dx, dy, at.x, at.y, WORLD.playerRadius),
          victim: p,
          apply: () => damagePlayer(w, p, b.damage, { attacker: owner, label: b.label, piercing: b.piercing, via: 'bullet', fromX: b.x, fromY: b.y }),
        }] : [];
      }),
  ];
  const hits = candidates.filter((c): c is BulletHit & { t: number } => c.t !== null).sort((a, c) => a.t - c.t);
  for (const hit of hits) {
    const x = b.x + dx * hit.t, y = b.y + dy * hit.t;
    hit.apply(x, y);
    if (!hit.victim || b.penetrate === 0) return stopBullet(w, b, x, y, owner, view);
    b.penetrate--;
    b.passed.push(hit.victim.id);
  }
  b.x += dx;
  b.y += dy;
  b.left -= travel;
  return b.left > 0.5 || stopBullet(w, b, b.x, b.y, owner, view);
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
    if (!moveBullet(w, b, dtMs / 1000, { poseOf: (p) => poses.get(p.id), walls })) return false;
  }
  return true;
}

export function tickBullets(w: World, dt: number) {
  w.bullets = w.bullets.filter((b) => moveBullet(w, b, dt, liveView(w)));
}

export function recordPoses(w: World) {
  const poses = new Map<number, Pose>();
  for (const p of w.players.values()) if (p.life.k === 'alive') poses.set(p.id, { x: p.x, y: p.y });
  w.history.push({ at: w.now, poses, walls: w.walls });
  while (w.history.length > 2 && w.history[1]!.at <= w.now - MAX_REWIND_MS) w.history.shift();
}
