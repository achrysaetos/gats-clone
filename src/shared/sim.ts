import { ABILITY_COOLDOWN_MS, WEAPONS, WORLD, type PlayerKind } from './defs.ts';
import {
  VIEW_ASPECT, VIEW_PRELOAD_MARGIN, viewExtents, type BulletView, type CrateView, type GameEvent, type InputState, type LeaderRow,
  type Loadout, type MatchView, type PlayerView, type SelfView, type Snapshot, type Team, type ThrownKind, type ThrownView,
  type WallView, type ZoneView,
} from './protocol.ts';
import { ABILITIES, GAS_RADIUS, tickThrown } from './sim/abilities.ts';
import { flyThroughPast, MAX_REWIND_MS, recordPoses, tickBullets } from './sim/combat.ts';
import { MODES, tickMatch } from './sim/modes.ts';
import { circleHitsRect, clamp, dist2, moveStep } from './sim/movement.ts';
import { abilityOf, effectiveStats, pendingTier, resetProgress } from './sim/stats.ts';
import { IDLE_INPUT, isEnemy, newId, rand, sameTeam, solidRects, type Bullet, type Life, type Player, type World } from './sim/world.ts';

const REVEAL_MS = 2000;
const GHILLIE_STILL_MS = 600;
const HIDDEN_REVEAL_DIST = 140;
const PRESS_GRACE_MS = 100;

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
