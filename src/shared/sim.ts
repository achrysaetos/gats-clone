import { ABILITY_COOLDOWN_MS, WEAPONS, WORLD, type PlayerKind } from './defs.ts';
import type { InputState, Loadout, Team } from './protocol.ts';
import { ABILITIES, tickThrown } from './sim/abilities.ts';
import { flyThroughPast, MAX_REWIND_MS, recordPoses, tickBullets } from './sim/combat.ts';
import { MODES, tickMatch } from './sim/modes.ts';
import { clamp, moveStep } from './sim/movement.ts';
import { abilityOf, effectiveStats, resetProgress } from './sim/stats.ts';
import { IDLE_INPUT, newId, rand, solidRects, spawnPoint, type Bullet, type Life, type Player, type World } from './sim/world.ts';

const REVEAL_MS = 2000;
const PRESS_GRACE_MS = 100;

type AddPlayerOpts = { team?: Team; at?: { x: number; y: number }; kind?: PlayerKind };

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
