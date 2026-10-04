import { ABILITY_COOLDOWN_MS, ARMORS, WEAPONS, WORLD, type AbilityId, type ModeId, type PlayerKind } from './defs.ts';
import {
  VIEW_ASPECT, VIEW_PRELOAD_MARGIN, viewExtents, type BulletView, type CrateView, type GameEvent, type InputState, type LeaderRow,
  type Loadout, type MatchView, type PlayerView, type SelfView, type Snapshot, type Team, type ThrownKind, type ThrownView,
  type WallView, type ZoneView,
} from './protocol.ts';
import {
  angleDiff, circleHitsRect, clamp, dist2, MAX_SUBSTEP, moveStep, segmentEntersCircleAt, segmentEntersRectAt, startDash, type Rect,
} from './sim/movement.ts';
import { abilityOf, addScore, effectiveStats, pendingTier, resetProgress } from './sim/stats.ts';
import {
  crateRect, IDLE_INPUT, isEnemy, newId, rand, sameTeam, solidRects, type Bullet, type Crate, type Life, type Player, type Pose,
  type Thrown, type Wall, type World,
} from './sim/world.ts';

const REVEAL_MS = 2000;
const CRATE_RESPAWN_MS = 15000;
const BUILT_WALL_MS = 12000;
const GHILLIE_STILL_MS = 600;
const HIDDEN_REVEAL_DIST = 140;
const ZONE_CAPTURE_MS = 3000;
const ZONE_POINTS_PER_SEC = 5;
const SHIELD_BLOCK = 0.6;
const SHIELD_ARC = Math.PI / 3;
const GAS_RADIUS = 140;
const PRESS_GRACE_MS = 100;
/** Covers the ~330ms p90 view lag measured at 100ms one-way lag with 40ms jitter; a 200ms cap left those shooters at a 10% hit rate. */
export const MAX_REWIND_MS = 350;
const TICK_MS = 1000 / WORLD.tickHz;

const round1 = (v: number) => Math.round(v * 10) / 10;

export type ModeRules = {
  assignTeam(w: World): Team;
  onKill(w: World, killer: Player, victim: Player): void;
  tick(w: World, dtMs: number): void;
  winner(w: World): string | null;
};

const TEAM_NAME = { red: 'Red team', blue: 'Blue team' } as const;

function smallerTeam(w: World): Team {
  let red = 0, blue = 0;
  for (const p of w.players.values()) { if (p.team === 'red') red++; else if (p.team === 'blue') blue++; }
  return red <= blue ? 'red' : 'blue';
}

function teamAtLeast(w: World, target: number): string | null {
  if (w.teamScore.red >= target) return TEAM_NAME.red;
  if (w.teamScore.blue >= target) return TEAM_NAME.blue;
  return null;
}

function tickZones(w: World, dtMs: number) {
  for (const z of w.zones) {
    let red = 0, blue = 0;
    for (const p of w.players.values()) {
      if (p.life.k !== 'alive' || dist2(p.x, p.y, z.x, z.y) > z.r * z.r) continue;
      if (p.team === 'red') red++; else if (p.team === 'blue') blue++;
    }
    const present: Team = red > 0 && blue === 0 ? 'red' : blue > 0 && red === 0 ? 'blue' : null;
    if (present && present !== z.owner) {
      if (z.capturing !== present) { z.capturing = present; z.progress = 0; }
      z.progress += dtMs / ZONE_CAPTURE_MS;
      if (z.progress >= 1) { z.owner = present; z.capturing = null; z.progress = 0; }
    } else if (!present && red + blue === 0) {
      z.progress = Math.max(0, z.progress - dtMs / ZONE_CAPTURE_MS);
      if (z.progress === 0) z.capturing = null;
    }
    if (z.owner) w.teamScore[z.owner] += (ZONE_POINTS_PER_SEC * dtMs) / 1000;
  }
}

export const MODES: Record<ModeId, ModeRules> = {
  FFA: {
    assignTeam: () => null,
    onKill: () => {},
    tick: () => {},
    winner: () => null,
  },
  TDM: {
    assignTeam: smallerTeam,
    onKill: (w, killer) => { if (killer.team) w.teamScore[killer.team] += 1; },
    tick: () => {},
    winner: (w) => teamAtLeast(w, WORLD.tdmWinScore),
  },
  DOM: {
    assignTeam: smallerTeam,
    onKill: () => {},
    tick: tickZones,
    winner: (w) => teamAtLeast(w, WORLD.domWinScore),
  },
};

function spawnPoint(w: World, team: Team): { x: number; y: number } {
  const s = WORLD.size, r = WORLD.playerRadius;
  const [lo, hi] = team === 'red' ? [0.05, 0.3] : team === 'blue' ? [0.7, 0.95] : [0.05, 0.95];
  const solids = solidRects(w);
  for (let i = 0; i < 200; i++) {
    const x = s * (lo + rand(w) * (hi - lo));
    const y = s * (0.05 + rand(w) * 0.9);
    if (solids.some((b) => circleHitsRect(x, y, r + 10, b))) continue;
    const tooClose = [...w.players.values()].some((p) => p.life.k === 'alive' && (team === null || p.team !== team) && dist2(p.x, p.y, x, y) < 400 * 400);
    if (tooClose && i < 150) continue;
    return { x, y };
  }
  return { x: s / 2, y: s / 2 };
}

export type AddPlayerOpts = { team?: Team; at?: { x: number; y: number }; kind?: PlayerKind };

function freshLife(p: Player, now: number): Life {
  const s = effectiveStats(p);
  return {
    k: 'alive', hp: s.maxHp, armor: s.maxArmor, ammo: s.mag, reloadUntil: null, nextFireAt: 0,
    lastDamageAt: -Infinity, lastMoveAt: now, dash: null, pressUntil: -Infinity,
  };
}

export function addPlayer(w: World, name: string, loadout: Loadout, opts: AddPlayerOpts = {}): Player {
  const team = opts.team !== undefined ? opts.team : MODES[w.mode].assignTeam(w);
  const p: Player = {
    id: newId(w), name, kind: opts.kind ?? 'bot', loadout, team, x: 0, y: 0, angle: 0,
    input: IDLE_INPUT, seq: 0, viewAt: null, shotsSeen: 0, life: { k: 'dead', respawnAt: 0 },
    score: 0, level: 0, perks: {}, kills: 0, deaths: 0, lifeKills: 0, revealedUntil: 0, abilityReadyAt: 0,
  };
  w.players.set(p.id, p);
  spawn(w, p, loadout, opts.at);
  return p;
}

function spawn(w: World, p: Player, loadout: Loadout, at?: { x: number; y: number }) {
  p.loadout = loadout;
  resetProgress(p);
  p.lifeKills = 0;
  const pos = at ?? spawnPoint(w, p.team);
  p.x = pos.x;
  p.y = pos.y;
  p.life = freshLife(p, w.now);
}

export function removePlayer(w: World, id: number): void {
  const p = w.players.get(id);
  if (!p) return;
  if (p.life.k === 'alive') w.lifeRecords.push({ id, name: p.name, kills: p.lifeKills, score: p.score, died: false });
  w.players.delete(id);
}

export function setInput(w: World, id: number, seq: number, input: InputState, viewAt: number | null = null): void {
  const p = w.players.get(id);
  if (!p || seq < p.seq) return;
  p.seq = seq;
  p.input = input;
  p.viewAt = viewAt;
}

export function canRespawn(w: World, id: number): boolean {
  const p = w.players.get(id);
  return !!p && p.life.k === 'dead' && w.now >= p.life.respawnAt;
}

export function respawn(w: World, id: number, loadout: Loadout): boolean {
  const p = w.players.get(id);
  if (!p || !canRespawn(w, id)) return false;
  spawn(w, p, loadout);
  return true;
}

export type DamageSource = { attacker: Player | null; label: string; piercing: boolean; fromX: number; fromY: number };

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
  victim.life = { k: 'dead', respawnAt: w.now + WORLD.respawnMs };
  victim.deaths++;
  w.lifeRecords.push({ id: victim.id, name: victim.name, kills: victim.lifeKills, score: victim.score, died: true });
  w.events.push({ e: 'kill', killer: killer?.name ?? '', victim: victim.name, killerId: killer?.id ?? null, victimId: victim.id, weapon: label });
  if (!killer) return;
  killer.kills++;
  killer.lifeKills++;
  addScore(killer, WORLD.killScore);
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
  if (attacker) addScore(attacker, WORLD.crateScore);
}

function explode(w: World, x: number, y: number, radius: number, maxDamage: number, owner: Player | null, label: string) {
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

function tickThrown(w: World, dt: number) {
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

function consumePresses(p: Player): boolean {
  const pressed = p.input.shots > p.shotsSeen;
  p.shotsSeen = Math.max(p.shotsSeen, p.input.shots);
  return pressed;
}

function tickPlayer(w: World, p: Player, dtMs: number) {
  const pressed = consumePresses(p);
  const life = p.life;
  if (life.k !== 'alive') return;
  if (pressed) life.pressUntil = w.now + PRESS_GRACE_MS;
  const dt = dtMs / 1000;
  const inp = p.input;
  p.angle = inp.angle;
  const moving = inp.right !== inp.left || inp.down !== inp.up || life.dash !== null;
  if (moving) life.lastMoveAt = w.now;
  const stats = effectiveStats(p, !moving);
  if (moving) {
    const m = moveStep(solidRects(w), { x: p.x, y: p.y, dash: life.dash }, inp, stats.speed, dtMs);
    p.x = m.x;
    p.y = m.y;
    life.dash = m.dash;
  }

  if (life.reloadUntil !== null && w.now >= life.reloadUntil) { life.ammo = stats.mag; life.reloadUntil = null; }
  if (life.reloadUntil === null && (life.ammo <= 0 || (inp.reload && life.ammo < stats.mag))) {
    life.reloadUntil = w.now + WEAPONS[p.loadout.weapon].reloadMs;
  }

  const weapon = WEAPONS[p.loadout.weapon];
  const armed = w.match.k === 'playing';
  const wantsShot = w.now <= life.pressUntil || (weapon.auto && inp.fire);
  if (armed && wantsShot && life.reloadUntil === null && life.ammo > 0 && w.now >= life.nextFireAt) {
    life.pressUntil = -Infinity;
    life.ammo--;
    life.nextFireAt = w.now + weapon.fireMs;
    const muzzle = WORLD.playerRadius + 4;
    const rewindMs = p.viewAt === null ? 0 : clamp(w.now - p.viewAt, 0, MAX_REWIND_MS);
    for (let i = 0; i < weapon.pellets; i++) {
      const a = p.angle + (rand(w) - 0.5) * stats.spread * 2;
      const b: Bullet = {
        id: newId(w), owner: p.id, x: p.x + Math.cos(p.angle) * muzzle, y: p.y + Math.sin(p.angle) * muzzle,
        vx: Math.cos(a) * weapon.bulletSpeed, vy: Math.sin(a) * weapon.bulletSpeed,
        left: stats.range, damage: weapon.damage, piercing: stats.piercing, label: weapon.name,
      };
      if (flyThroughPast(w, b, rewindMs)) w.bullets.push(b);
    }
    if (!stats.silenced) p.revealedUntil = w.now + REVEAL_MS;
    w.events.push({ e: 'shot', x: p.x, y: p.y, angle: p.angle, silenced: stats.silenced, owner: p.id });
  }

  const ability = abilityOf(p);
  if (armed && inp.ability && ability && w.now >= p.abilityReadyAt && ABILITIES[ability](w, p)) {
    p.abilityReadyAt = w.now + ABILITY_COOLDOWN_MS[ability];
  }

  if (p.life.k === 'alive' && w.now - p.life.lastDamageAt >= WORLD.regenDelayMs) {
    p.life.hp = Math.min(stats.maxHp, p.life.hp + stats.regenPerSec * dt);
  }
}

type BulletHit = { t: number | null; apply: (x: number, y: number) => void };

function moveBullet(w: World, b: Bullet, dt: number, poseOf: (p: Player) => Pose | undefined, walls: readonly Wall[]): boolean {
  const speed = Math.hypot(b.vx, b.vy);
  const travel = Math.min(b.left, speed * dt);
  const dx = (b.vx / speed) * travel, dy = (b.vy / speed) * travel;
  const owner = w.players.get(b.owner) ?? null;
  const candidates: BulletHit[] = [
    ...walls.map((wall) => ({ t: segmentEntersRectAt(b.x, b.y, dx, dy, wall), apply: (x: number, y: number) => { w.events.push({ e: 'impact', x, y }); } })),
    ...w.crates.filter((c) => c.respawnAt === null).map((c) => ({
      t: segmentEntersRectAt(b.x, b.y, dx, dy, crateRect(c)), apply: () => damageCrate(w, c, b.damage, owner),
    })),
    ...[...w.players.values()]
      .filter((p) => p.id !== b.owner && p.life.k === 'alive' && !(owner && sameTeam(owner, p)))
      .flatMap((p) => {
        const at = poseOf(p);
        return at ? [{
          t: segmentEntersCircleAt(b.x, b.y, dx, dy, at.x, at.y, WORLD.playerRadius),
          apply: () => damagePlayer(w, p, b.damage, { attacker: owner, label: b.label, piercing: b.piercing, fromX: b.x, fromY: b.y }),
        }] : [];
      }),
  ];
  let hit: { t: number; apply: BulletHit['apply'] } | null = null;
  for (const c of candidates) if (c.t !== null && (!hit || c.t < hit.t)) hit = { t: c.t, apply: c.apply };
  if (hit) {
    hit.apply(b.x + dx * hit.t, b.y + dy * hit.t);
    return false;
  }
  b.x += dx;
  b.y += dy;
  b.left -= travel;
  return b.left > 0.5;
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
function flyThroughPast(w: World, b: Bullet, rewindMs: number): boolean {
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

function tickBullets(w: World, dt: number) {
  w.bullets = w.bullets.filter((b) => moveBullet(w, b, dt, (p) => p, w.walls));
}

function recordPoses(w: World) {
  const poses = new Map<number, Pose>();
  for (const p of w.players.values()) if (p.life.k === 'alive') poses.set(p.id, { x: p.x, y: p.y });
  w.history.push({ at: w.now, poses, walls: w.walls });
  while (w.history.length > 2 && w.history[1]!.at <= w.now - MAX_REWIND_MS) w.history.shift();
}

function tickMatch(w: World, dtMs: number) {
  const rules = MODES[w.mode];
  if (w.match.k === 'over') {
    if (w.now < w.match.restartAt) return;
    w.match = { k: 'playing' };
    w.teamScore = { red: 0, blue: 0 };
    for (const z of w.zones) { z.owner = null; z.capturing = null; z.progress = 0; }
    for (const p of w.players.values()) { resetProgress(p); p.kills = 0; p.deaths = 0; }
    return;
  }
  rules.tick(w, dtMs);
  const winner = rules.winner(w);
  if (winner) w.match = { k: 'over', winner, restartAt: w.now + WORLD.roundRestartMs };
}

export function step(w: World, dtMs: number): void {
  w.events = [];
  w.now += dtMs;
  w.tick++;
  const dt = dtMs / 1000;
  for (const p of w.players.values()) tickPlayer(w, p, dtMs);
  tickBullets(w, dt);
  tickThrown(w, dt);
  for (const c of w.crates) {
    if (c.respawnAt !== null && w.now >= c.respawnAt) { c.respawnAt = null; c.hp = WORLD.crateHp; }
  }
  const wallCount = w.walls.length;
  w.walls = w.walls.filter((wall) => w.now < wall.expiresAt);
  if (w.walls.length !== wallCount) w.wallsVersion++;
  tickMatch(w, dtMs);
  recordPoses(w);
}

export function wallViews(w: World): WallView[] {
  return w.walls.map(({ x, y, w: ww, h, built }) => ({ x, y, w: ww, h, built }));
}

function isHidden(w: World, p: Player): boolean {
  return p.life.k === 'alive' && effectiveStats(p).ghillie && w.now - p.life.lastMoveAt >= GHILLIE_STILL_MS && w.now >= p.revealedUntil;
}

function playerView(w: World, p: Player): PlayerView {
  const life = p.life;
  const stats = effectiveStats(p);
  const alive = life.k === 'alive';
  return {
    id: p.id, name: p.name, x: p.x, y: p.y, angle: p.angle,
    hp: alive ? Math.ceil(life.hp) : 0, maxHp: stats.maxHp,
    armor: alive ? Math.ceil(life.armor) : 0, maxArmor: stats.maxArmor,
    color: p.loadout.color, weapon: p.loadout.weapon, team: p.team,
    alive, hidden: isHidden(w, p), shield: stats.shield, dashing: alive && life.dash !== null,
    score: p.score, level: p.level, armorTier: p.loadout.armor,
  };
}

function selfView(w: World, p: Player): SelfView {
  const life = p.life;
  const stats = effectiveStats(p);
  const ability = abilityOf(p);
  return {
    id: p.id,
    ammo: life.k === 'alive' ? life.ammo : 0,
    mag: stats.mag,
    speed: stats.speed,
    reloading: life.k === 'alive' && life.reloadUntil !== null,
    reloadFrac: life.k === 'alive' && life.reloadUntil !== null
      ? Math.min(1, Math.max(0, 1 - (life.reloadUntil - w.now) / WEAPONS[p.loadout.weapon].reloadMs))
      : 0,
    perks: { ...p.perks },
    pendingTier: pendingTier(p),
    ability,
    abilityReadyIn: ability ? Math.max(0, p.abilityReadyAt - w.now) : 0,
    alive: life.k === 'alive',
    dash: life.k === 'alive' ? life.dash : null,
    respawnIn: life.k === 'dead' ? Math.max(0, life.respawnAt - w.now) : 0,
    kills: p.kills,
    deaths: p.deaths,
    viewRadius: stats.viewRadius,
  };
}

function leaderboard(w: World): LeaderRow[] {
  return [...w.players.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map((p) => ({ id: p.id, name: p.name, score: p.score, team: p.team }));
}

function matchView(w: World): MatchView {
  return {
    mode: w.mode,
    teamScore: { red: Math.floor(w.teamScore.red), blue: Math.floor(w.teamScore.blue) },
    winner: w.match.k === 'over' ? w.match.winner : null,
    restartIn: w.match.k === 'over' ? Math.max(0, w.match.restartAt - w.now) : 0,
  };
}

const THROWN_RADIUS: Record<ThrownKind, number> = { grenade: 10, fragGrenade: 10, gasGrenade: 10, landMine: 14, gasCloud: GAS_RADIUS };

export function snapshotFor(w: World, id: number, events: readonly GameEvent[] = w.events, aspect: number = VIEW_ASPECT.max): Snapshot {
  const me = w.players.get(id);
  if (!me) throw new Error(`no player ${id}`);
  const stats = effectiveStats(me);
  const visible = viewExtents(stats.viewRadius, aspect);
  const halfW = visible.halfW + VIEW_PRELOAD_MARGIN, halfH = visible.halfH + VIEW_PRELOAD_MARGIN;
  const inView = (x: number, y: number, pad = 0) => Math.abs(x - me.x) <= halfW + pad && Math.abs(y - me.y) <= halfH + pad;

  const players: PlayerView[] = [];
  for (const p of w.players.values()) {
    if (p.id !== me.id) {
      if (p.life.k !== 'alive' || !inView(p.x, p.y, WORLD.playerRadius)) continue;
      const seesHidden = !isEnemy(me, p) || stats.thermal || dist2(p.x, p.y, me.x, me.y) < HIDDEN_REVEAL_DIST ** 2;
      if (isHidden(w, p) && !seesHidden) continue;
    }
    players.push(playerView(w, p));
  }
  const bullets: BulletView[] = w.bullets
    .filter((b) => inView(b.x, b.y, 100))
    .map((b) => ({ id: b.id, x: b.x, y: b.y, vx: b.vx, vy: b.vy, owner: b.owner }));
  const crates: CrateView[] = w.crates
    .filter((c) => c.respawnAt === null && inView(c.x, c.y, c.size))
    .map((c) => ({ id: c.id, x: c.x, y: c.y, hp: c.hp, size: c.size }));
  const thrown: ThrownView[] = w.thrown
    .filter((t) => inView(t.x, t.y, THROWN_RADIUS[t.kind]))
    .filter((t) => {
      if (t.kind !== 'landMine' || t.owner === me.id || stats.thermal) return true;
      const owner = w.players.get(t.owner);
      return !!owner && !isEnemy(me, owner);
    })
    .map((t) => ({ id: t.id, kind: t.kind, x: t.x, y: t.y, r: THROWN_RADIUS[t.kind], owner: t.owner }));
  const zones: ZoneView[] = w.zones.map((z) => ({ id: z.id, x: z.x, y: z.y, r: z.r, owner: z.owner, capturing: z.capturing, progress: z.progress }));
  const minimap = [...w.players.values()]
    .filter((p) => p.id !== me.id && p.life.k === 'alive' && (sameTeam(me, p) || w.now < p.revealedUntil))
    .map((p) => ({ x: p.x, y: p.y, team: p.team }));
  const visibleEvents = events.filter((e) => e.e === 'kill' || inView(e.x, e.y, 300));

  return {
    t: 'snap', tick: w.tick, ackSeq: me.seq, self: selfView(w, me),
    players, bullets, crates, thrown, zones, minimap, leaderboard: leaderboard(w), match: matchView(w), events: visibleEvents,
  };
}
