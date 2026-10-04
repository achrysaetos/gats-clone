import { ABILITY_COOLDOWN_MS, GUNS, WORLD, type PlayerKind } from './defs.ts';
import type { InputState, Loadout, Team } from './protocol.ts';
import { ABILITIES, tickThrown } from './sim/abilities.ts';
import { flyThroughPast, MAX_REWIND_MS, recordPoses, tickBullets } from './sim/combat.ts';
import { MODES, tickMatch } from './sim/modes.ts';
import { clamp, moveStep } from './sim/movement.ts';
import { abilityOf, effectiveStats, freshLife, isHunted, resetProgress } from './sim/stats.ts';
import { IDLE_INPUT, newId, rand, solidRects, spawnPoint, type Bullet, type Player, type World } from './sim/world.ts';

const REVEAL_MS = 2000;
const HUNTED_PING_MS = 2500;
const PRESS_GRACE_MS = 100;

type AddPlayerOpts = { team?: Team; at?: { x: number; y: number }; kind?: PlayerKind };

export function addPlayer(w: World, name: string, loadout: Loadout, opts: AddPlayerOpts = {}): Player {
  const team = opts.team !== undefined ? opts.team : MODES[w.mode].assignTeam(w);
  const p: Player = {
    id: newId(w), name, kind: opts.kind ?? 'bot', loadout, gun: loadout.weapon, team, x: 0, y: 0, angle: 0,
    input: IDLE_INPUT, seq: 0, viewAt: null, rewindCapMs: MAX_REWIND_MS, shotsSeen: 0, life: { k: 'dead', respawnAt: 0 },
    score: 0, level: 0, perks: {}, kills: 0, deaths: 0, lifeKills: 0, revealedUntil: 0, huntedPing: null, abilityReadyAt: 0,
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

export function setInput(w: World, id: number, seq: number, input: InputState, viewAt: number | null = null, rewindCapMs = MAX_REWIND_MS): void {
  const p = w.players.get(id);
  if (!p || seq < p.seq) return;
  p.seq = seq;
  p.input = input;
  p.viewAt = viewAt;
  p.rewindCapMs = rewindCapMs;
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
  const gun = GUNS[p.gun];
  if (pressed) {
    const readyAt = life.burstLeft > 0 && gun.burst ? life.nextFireAt + (life.burstLeft - 1) * gun.burst.gapMs + gun.fireMs : life.nextFireAt;
    life.pressUntil = Math.max(w.now, readyAt) + PRESS_GRACE_MS;
  }
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
    life.reloadUntil = w.now + GUNS[p.gun].reloadMs;
    life.burstLeft = 0;
  }

  const armed = w.match.k === 'playing';
  const bursting = life.burstLeft > 0;
  const wantsShot = bursting || w.now <= life.pressUntil || (gun.auto && inp.fire);
  if (armed && wantsShot && life.reloadUntil === null && life.ammo > 0 && w.now >= life.nextFireAt) {
    if (!bursting) {
      life.pressUntil = -Infinity;
      life.burstLeft = gun.burst?.count ?? 1;
    }
    life.ammo--;
    life.burstLeft = life.ammo > 0 ? life.burstLeft - 1 : 0;
    // Carry the part of the interval that fell between ticks, so a held trigger keeps the gun's rate rather than the tick's.
    const from = w.now - life.nextFireAt < dtMs ? life.nextFireAt : w.now;
    life.nextFireAt = from + (life.burstLeft > 0 && gun.burst ? gun.burst.gapMs : gun.fireMs);
    const muzzle = WORLD.playerRadius + 4;
    const rewindMs = p.viewAt === null ? 0 : clamp(w.now - p.viewAt, 0, p.rewindCapMs);
    for (let i = 0; i < gun.pellets; i++) {
      const a = p.angle + (rand(w) - 0.5) * stats.spread * 2;
      const b: Bullet = {
        id: newId(w), owner: p.id, team: p.team, x: p.x + Math.cos(p.angle) * muzzle, y: p.y + Math.sin(p.angle) * muzzle,
        vx: Math.cos(a) * gun.bulletSpeed, vy: Math.sin(a) * gun.bulletSpeed,
        left: stats.range, damage: gun.damage, piercing: stats.piercing, label: gun.name,
        gun: p.gun, penetrate: gun.penetrate ?? 0, passed: [], blast: gun.blast ?? null,
      };
      if (flyThroughPast(w, b, rewindMs)) w.bullets.push(b);
    }
    if (!stats.silenced) {
      p.revealedUntil = w.now + REVEAL_MS;
      if (isHunted(p)) p.huntedPing = { x: p.x, y: p.y, at: w.now };
    }
    w.events.push({ e: 'shot', x: p.x, y: p.y, angle: p.angle, silenced: stats.silenced, owner: p.id, gun: p.gun });
  }

  const ability = abilityOf(p);
  if (armed && inp.ability && ability && w.now >= p.abilityReadyAt && ABILITIES[ability](w, p)) {
    p.abilityReadyAt = w.now + ABILITY_COOLDOWN_MS[ability];
  }

  if (p.life.k === 'alive' && w.now - p.life.lastDamageAt >= stats.regenDelayMs) {
    p.life.hp = Math.min(stats.maxHp, p.life.hp + stats.regenPerSec * dt);
  }
}

function pingHunted(w: World, p: Player) {
  if (p.life.k !== 'alive' || !isHunted(p)) p.huntedPing = null;
  else if (!p.huntedPing || w.now - p.huntedPing.at >= HUNTED_PING_MS) p.huntedPing = { x: p.x, y: p.y, at: w.now };
}

export function step(w: World, dtMs: number): void {
  w.events = w.queuedEvents;
  w.queuedEvents = [];
  w.now += dtMs;
  w.tick++;
  const dt = dtMs / 1000;
  for (const p of w.players.values()) tickPlayer(w, p, dtMs);
  for (const p of w.players.values()) pingHunted(w, p);
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
