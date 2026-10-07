import { ARMORS, CRATE_TIERS, HP_MULTIPLIER, WORLD, ZOMBIES } from '../defs.ts';
import { INTERP_DELAY_MS, type Hit, type Team } from '../protocol.ts';
import { MODES } from './modes.ts';
import { angleDiff, clamp, dist2, segmentEntersCircleAt, segmentEntersRectAt } from './movement.ts';
import { goDown } from './downed.ts';
import { fall, hurtDowned, openDrop } from './royale.ts';
import { damageZombie } from './run.ts';
import { addScore, effectiveStats, isHunted } from './stats.ts';
import { crateRect, friendly, type Bullet, type Crate, type Player, type Pose, type Shooter, type Wall, type World } from './world.ts';

const CRATE_RESPAWN_MS = 15000;
const SHIELD_BLOCK = 0.33;
const SHIELD_ARC = (40 * Math.PI) / 180;
/** Covers the ~330ms p90 view lag measured at 100ms one-way lag with 40ms jitter; a 200ms cap left those shooters at a 10% hit rate. */
export const MAX_REWIND_MS = 350;
const REWIND_MARGIN_MS = 60;
/** A client sees the world its round trip plus its render delay ago, so it may claim no staler view than that; until a round trip is measured it gets the full cap. */
export const rewindCapFor = (rttMs: number | null): number =>
  rttMs === null ? MAX_REWIND_MS : Math.min(MAX_REWIND_MS, rttMs + INTERP_DELAY_MS + REWIND_MARGIN_MS);
const TICK_MS = 1000 / WORLD.tickHz;
const OWN_BLAST_SHARE = 0.5;
const ASSIST_SHARE = 0.3;

const round1 = (v: number) => Math.round(v * 10) / 10;
const SELF_KILL_CREDIT_MS = 10_000;

/** Who set the damage in motion; `team` is theirs at the time, and still spares teammates after they leave. */
type Culprit = { attacker: Player | null; team: Team; label: string; turret?: Shooter | null };
/** A shield stops only bullets, and only a blast hurts its own attacker. */
type DamageSource = Culprit & { piercing: boolean; via: 'bullet' | 'blast' | 'knife' | 'gas' | 'bite'; fromX: number; fromY: number; hit?: Hit };

export function damagePlayer(w: World, victim: Player, amount: number, src: DamageSource): void {
  if (victim.life.k === 'dead' || w.match.k === 'over') return;
  const a = src.attacker;
  if (a?.id === victim.id ? src.via !== 'blast' : friendly(src.team, victim)) return;
  if (victim.life.k === 'downed') {
    if (w.royale) hurtDowned(w, victim, a?.kind === 'human' ? amount * HP_MULTIPLIER[victim.kind] : amount, a);
    return;
  }
  if (w.run && src.team !== null) return;
  const life = victim.life;
  if (!w.run && w.now < life.shieldUntil) return;
  const before = life.hp;
  const stats = effectiveStats(victim);
  if (stats.shield && src.via === 'bullet') {
    const incoming = Math.atan2(src.fromY - victim.y, src.fromX - victim.x);
    if (angleDiff(incoming, victim.angle) <= SHIELD_ARC) amount *= 1 - SHIELD_BLOCK;
  }
  // A human hits as hard as the victim's health is multiplied, so human duels run at bot pace.
  if (a?.kind === 'human') amount *= HP_MULTIPLIER[victim.kind];
  if (!src.piercing) amount *= 1 - ARMORS[victim.loadout.armor].blockFrac;
  life.hp -= amount;
  life.lastDamageAt = w.now;
  const dealt = before - Math.max(0, life.hp);
  if (a && a.id !== victim.id) life.hits.push({ by: a.id, at: w.now, dealt });
  w.events.push({ e: 'dmg', attacker: a?.id ?? null, victim: victim.id, amount: round1(dealt), x: victim.x, y: victim.y, kind: 'player', ...(src.hit && { hit: src.hit }) });
  if (life.hp <= 0) kill(w, victim, a, src.label);
}

function damageSince(hits: readonly { by: number; at: number; dealt: number }[], since: number): Map<number, number> {
  const by = new Map<number, number>();
  for (const h of hits) if (h.at >= since) by.set(h.by, (by.get(h.by) ?? 0) + h.dealt);
  return by;
}

/**
 * A player finished by their own blast gives the kill to whoever hurt them most lately, so blowing yourself up mid-fight never denies a kill or bounty.
 * Only recent damage counts: an old fight the player has long healed from did not set up this death.
 */
function creditFor(w: World, victim: Player, killer: Player | null): Player | null {
  if (killer?.id !== victim.id) return killer;
  if (victim.life.k !== 'alive') return null;
  let top: Player | null = null, most = 0;
  for (const [id, dealt] of damageSince(victim.life.hits, w.now - SELF_KILL_CREDIT_MS)) {
    const p = w.players.get(id);
    if (p && dealt > most) { top = p; most = dealt; }
  }
  return top;
}

export function kill(w: World, victim: Player, killer: Player | null, label: string) {
  if (w.run) { goDown(w, victim); return; }
  const credited = creditFor(w, victim, killer);
  const named = credited ?? killer;
  const bounty = credited !== null && isHunted(w, victim);
  const assisters = assistersOf(w, victim, credited);
  const knock = w.royale ? fall(w, w.royale, victim, named) : (die(w, victim, w.now + WORLD.respawnMs), false);
  w.events.push({
    e: 'kill', killer: named?.name ?? '', victim: victim.name, killerId: named?.id ?? null, victimId: victim.id, weapon: label, bounty,
    assisters: assisters.map((p) => p.id), ...(knock && { knock: true as const }),
  });
  for (const p of assisters) addScore(w, p, WORLD.assistScore);
  if (!credited) return;
  credited.kills++;
  credited.lifeKills++;
  addScore(w, credited, WORLD.killScore + (bounty ? WORLD.bountyScore : 0));
  MODES[w.mode].onKill(w, credited, victim);
}

export function die(w: World, victim: Player, respawnAt: number) {
  victim.life = { k: 'dead', respawnAt };
  victim.deaths++;
  w.lifeRecords.push({ id: victim.id, name: victim.name, kills: victim.lifeKills, score: victim.score, died: true });
}

function assistersOf(w: World, victim: Player, killer: Player | null): Player[] {
  if (victim.life.k !== 'alive') return [];
  const enough = ASSIST_SHARE * effectiveStats(victim).maxHp;
  return [...damageSince(victim.life.hits, -Infinity)]
    .filter(([id, dealt]) => id !== killer?.id && dealt >= enough)
    .flatMap(([id]) => {
      const p = w.players.get(id);
      return p?.life.k === 'alive' ? [p] : [];
    });
}

function damageCrate(w: World, c: Crate, amount: number, attacker: Player | null, hit?: Hit) {
  if (c.respawnAt !== null) return;
  const dealt = Math.min(c.hp, amount);
  c.hp -= amount;
  const h = c.size / 2;
  w.events.push({ e: 'dmg', attacker: attacker?.id ?? null, victim: c.id, amount: round1(dealt), x: c.x + h, y: c.y + h, kind: 'crate', ...(hit && { hit }) });
  if (c.hp > 0) return;
  c.respawnAt = w.royale ? Infinity : w.now + CRATE_RESPAWN_MS;
  w.events.push({ e: 'boom', x: c.x + h, y: c.y + h, r: c.size });
  if (!attacker) return;
  addScore(w, attacker, c.tier ? CRATE_TIERS[c.tier].score : WORLD.crateScore);
  if (c.tier === 'drop') openDrop(w, attacker);
}

/** What a moving bullet or blast is judged against: live positions, or the rewound world a lagged shooter saw. */
type View = { poseOf: (p: Player) => Pose | undefined; walls: readonly Wall[] };
const liveView = (w: World): View => ({ poseOf: (p) => p, walls: w.walls });

const sheltered = (walls: readonly Wall[], x: number, y: number, tx: number, ty: number) =>
  walls.some((wall) => segmentEntersRectAt(x, y, tx - x, ty - y, wall) !== null);

export function explode(w: World, x: number, y: number, radius: number, maxDamage: number, by: Culprit, view: View = liveView(w)) {
  w.events.push({ e: 'boom', x, y, r: radius });
  for (const p of w.players.values()) {
    const at = view.poseOf(p);
    if (!at) continue;
    const d = Math.sqrt(dist2(at.x, at.y, x, y));
    if (d > radius + WORLD.playerRadius || sheltered(view.walls, x, y, at.x, at.y)) continue;
    const dmg = maxDamage * (1 - Math.max(0, d - WORLD.playerRadius) / radius) * (p === by.attacker ? OWN_BLAST_SHARE : 1);
    damagePlayer(w, p, dmg, { ...by, piercing: false, via: 'blast', fromX: x, fromY: y });
  }
  for (const c of w.crates) {
    const r = crateRect(c);
    const nx = clamp(x, r.x, r.x + r.w), ny = clamp(y, r.y, r.y + r.h);
    const d = Math.sqrt(dist2(x, y, nx, ny));
    if (d >= radius || sheltered(view.walls, x, y, nx, ny)) continue;
    damageCrate(w, c, maxDamage * (1 - d / radius), by.attacker);
  }
  for (const z of w.zombies) {
    const r = ZOMBIES[z.kind].radius;
    const d = Math.sqrt(dist2(z.x, z.y, x, y));
    if (d > radius + r || sheltered(view.walls, x, y, z.x, z.y)) continue;
    damageZombie(w, z, maxDamage * (1 - Math.max(0, d - r) / radius), by.attacker, by.turret ?? 'blast');
  }
}

type BulletHit = { t: number | null; victim: { id: number } | null; apply: (x: number, y: number) => void };

/** Backs the blast off the surface it struck, so the wall it hit does not shelter the side the bullet came from. */
const BLAST_STANDOFF = 2;

function stopBullet(w: World, b: Bullet, x: number, y: number, owner: Player | null, view: View): false {
  if (!b.blast) return false;
  const speed = Math.hypot(b.vx, b.vy);
  const bx = x - (b.vx / speed) * BLAST_STANDOFF, by = y - (b.vy / speed) * BLAST_STANDOFF;
  explode(w, bx, by, b.blast.radius, b.blast.damage, { attacker: owner, team: b.team, label: b.label, turret: b.turret }, view);
  return false;
}

function moveBullet(w: World, b: Bullet, dt: number, view: View): boolean {
  const speed = Math.hypot(b.vx, b.vy);
  const travel = Math.min(b.left, speed * dt);
  const dx = (b.vx / speed) * travel, dy = (b.vy / speed) * travel;
  const owner = w.players.get(b.owner) ?? null;
  const dir = Math.atan2(b.vy, b.vx);
  const candidates: BulletHit[] = [
    ...view.walls.map((wall) => ({ t: segmentEntersRectAt(b.x, b.y, dx, dy, wall), victim: null, apply: (x: number, y: number) => { w.events.push({ e: 'impact', x, y, dir }); } })),
    ...w.crates.filter((c) => c.respawnAt === null).map((c) => ({
      t: segmentEntersRectAt(b.x, b.y, dx, dy, crateRect(c)), victim: null, apply: (x: number, y: number) => damageCrate(w, c, b.damage, owner, { x, y, dir }),
    })),
    ...[...w.players.values()]
      .filter((p) => p.id !== b.owner && (p.life.k === 'alive' || (p.life.k === 'downed' && w.royale !== null)) && !friendly(b.team, p) && !b.passed.includes(p.id))
      .flatMap((p) => {
        const at = view.poseOf(p);
        return at ? [{
          t: segmentEntersCircleAt(b.x, b.y, dx, dy, at.x, at.y, WORLD.playerRadius),
          victim: p,
          apply: (x: number, y: number) => damagePlayer(w, p, b.damage, { attacker: owner, team: b.team, label: b.label, piercing: b.piercing, via: 'bullet', fromX: b.x, fromY: b.y, hit: { x, y, dir } }),
        }] : [];
      }),
    // Zombies are judged where they stand now, even for a rewound shot: they are slow, and they keep no pose history.
    ...w.zombies
      .filter((z) => !b.passed.includes(z.id) && Math.abs(z.x - b.x - dx / 2) <= Math.abs(dx) / 2 + ZOMBIES[z.kind].radius && Math.abs(z.y - b.y - dy / 2) <= Math.abs(dy) / 2 + ZOMBIES[z.kind].radius)
      .map((z) => ({
        t: segmentEntersCircleAt(b.x, b.y, dx, dy, z.x, z.y, ZOMBIES[z.kind].radius), victim: z,
        apply: (x: number, y: number) => damageZombie(w, z, b.piercing ? b.damage : Math.max(1, b.damage - ZOMBIES[z.kind].plate), owner, b.turret ?? 'hit', { x, y, dir }),
      })),
  ];
  const hits = b.lobbed ? [] : candidates.filter((c): c is BulletHit & { t: number } => c.t !== null).sort((a, c) => a.t - c.t);
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
  for (const p of w.players.values()) if (p.life.k !== 'dead') poses.set(p.id, { x: p.x, y: p.y });
  w.history.push({ at: w.now, poses, walls: w.walls });
  while (w.history.length > 2 && w.history[1]!.at <= w.now - MAX_REWIND_MS) w.history.shift();
}
