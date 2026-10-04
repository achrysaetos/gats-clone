import { ARMOR_IDS, COLOR_IDS, GUNS, PERK_TIERS, WEAPON_IDS, WORLD, type PerkId, type Tier } from '../shared/defs.ts';
import { VIEW_ASPECT, viewExtents, type InputState, type Loadout, type PlayerView, type Snapshot, type WallView } from '../shared/protocol.ts';
import { segmentEntersRectAt } from '../shared/sim/movement.ts';

export type BotMemory = {
  targetX: number; targetY: number; lastX: number; lastY: number; stuckTicks: number;
  strafe: 1 | -1;
  engaged: Engagement | null;
  shots: number;
};

type Engagement = { id: number; x: number; y: number; bearing: number; acquiredTick: number; fireAtTick: number; aimErrRad: number };

const BOT_AIM = {
  reactionMs: [250, 400],
  baseSigma: 0.03,
  sigmaPerRadPerSec: 0.25,
  unsettledMul: 1.5,
  settleMs: 700,
  errCorrelation: 0.85,
} as const;

const TICK_MS = 1000 / WORLD.tickHz;

type BotDecision = { input: InputState; perk: { tier: Tier; perk: PerkId } | null; mem: BotMemory };

const pick = <T>(xs: readonly T[], rand: () => number): T => xs[Math.floor(rand() * xs.length)];

export function newBotMemory(rand: () => number): BotMemory {
  return { targetX: rand() * WORLD.size, targetY: rand() * WORLD.size, lastX: 0, lastY: 0, stuckTicks: 0, strafe: rand() < 0.5 ? 1 : -1, engaged: null, shots: 0 };
}

export function randomLoadout(rand: () => number): Loadout {
  return { weapon: pick(WEAPON_IDS, rand), armor: pick(ARMOR_IDS, rand), color: pick(COLOR_IDS, rand) };
}

export function botThink(snap: Snapshot, walls: readonly WallView[], mem: BotMemory, rand: () => number): BotDecision {
  const me = snap.players.find((p) => p.id === snap.self.id);
  const tier = snap.self.pendingTier;
  const perk = tier ? { tier, perk: pick<PerkId>(PERK_TIERS[tier], rand) } : null;
  if (!me || !me.alive) {
    return { input: { up: false, down: false, left: false, right: false, angle: 0, fire: false, shots: mem.shots, reload: false, ability: false, aimDist: 0 }, perk, mem };
  }

  let next = { ...mem };
  const moved = Math.hypot(me.x - mem.lastX, me.y - mem.lastY);
  next.stuckTicks = moved < 1 ? mem.stuckTicks + 1 : 0;
  if (next.stuckTicks > 6 || rand() < 0.02) next.strafe = next.strafe === 1 ? -1 : 1;
  const arrived = Math.hypot(me.x - mem.targetX, me.y - mem.targetY) < 80;
  if (arrived || next.stuckTicks > 15) {
    const contested = snap.zones.filter((z) => z.owner !== me.team);
    const zone = contested.length > 0 && rand() < 0.8 ? pick(contested, rand) : null;
    next = zone
      ? { ...next, targetX: zone.x + (rand() - 0.5) * zone.r, targetY: zone.y + (rand() - 0.5) * zone.r, stuckTicks: 0 }
      : { ...next, targetX: rand() * WORLD.size, targetY: rand() * WORLD.size, stuckTicks: 0 };
  }
  next.lastX = me.x;
  next.lastY = me.y;

  const enemy = nearestVisibleEnemy(me, snap.players, walls, snap.self.viewRadius);
  const weapon = GUNS[me.gun];
  const range = weapon.range;
  let goX = next.targetX, goY = next.targetY;
  let angle = Math.atan2(goY - me.y, goX - me.x);
  let fire = false, ability = false, aimDist = 300;
  if (enemy) {
    const d = Math.hypot(enemy.x - me.x, enemy.y - me.y);
    const tracked = mem.engaged?.id === enemy.id ? mem.engaged : null;
    const engaged = engage(tracked, enemy, me, snap.tick, rand);
    const velPerTick = tracked ? { x: enemy.x - tracked.x, y: enemy.y - tracked.y } : { x: 0, y: 0 };
    const flightTicks = (d / weapon.bulletSpeed) * WORLD.tickHz;
    const aimX = enemy.x + velPerTick.x * flightTicks, aimY = enemy.y + velPerTick.y * flightTicks;
    angle = Math.atan2(aimY - me.y, aimX - me.x) + engaged.aimErrRad;
    aimDist = d;
    fire = snap.tick >= engaged.fireAtTick && d < range * 0.95;
    ability = snap.self.ability !== null && d < 350 && rand() < 0.05;
    if (d > range * 0.6) {
      goX = enemy.x; goY = enemy.y;
    } else {
      const toward = Math.atan2(enemy.y - me.y, enemy.x - me.x) + (Math.PI / 2) * next.strafe;
      goX = me.x + Math.cos(toward) * 200; goY = me.y + Math.sin(toward) * 200;
    }
    next.engaged = engaged;
  } else {
    next.engaged = null;
  }
  if (fire) next.shots++;
  const mx = goX - me.x, my = goY - me.y;
  const dead = 30;
  const input: InputState = {
    up: my < -dead, down: my > dead, left: mx < -dead, right: mx > dead,
    angle, fire, shots: next.shots, reload: !enemy && snap.self.ammo < snap.self.mag / 2, ability, aimDist,
  };
  return { input, perk, mem: next };
}

const gaussian = (rand: () => number) => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

function engage(prev: Engagement | null, enemy: PlayerView, me: PlayerView, tick: number, rand: () => number): Engagement {
  const bearing = Math.atan2(enemy.y - me.y, enemy.x - me.x);
  const [fastest, slowest] = BOT_AIM.reactionMs;
  const acquiredTick = prev?.acquiredTick ?? tick;
  const fireAtTick = prev?.fireAtTick ?? tick + Math.round((fastest + rand() * (slowest - fastest)) / TICK_MS);
  const angularSpeed = prev ? Math.abs(wrapAngle(bearing - prev.bearing)) * WORLD.tickHz : 0;
  const unsettled = 1 + BOT_AIM.unsettledMul * Math.exp(-((tick - acquiredTick) * TICK_MS) / BOT_AIM.settleMs);
  const sigma = (BOT_AIM.baseSigma + BOT_AIM.sigmaPerRadPerSec * angularSpeed) * unsettled;
  const rho = BOT_AIM.errCorrelation;
  const aimErrRad = prev ? prev.aimErrRad * rho + Math.sqrt(1 - rho * rho) * sigma * gaussian(rand) : sigma * gaussian(rand);
  return { id: enemy.id, x: enemy.x, y: enemy.y, bearing, acquiredTick, fireAtTick, aimErrRad };
}

function nearestVisibleEnemy(me: PlayerView, players: PlayerView[], walls: readonly WallView[], viewRadius: number): PlayerView | null {
  const sight = viewExtents(viewRadius, VIEW_ASPECT.max);
  let best: PlayerView | null = null, bestD = Infinity;
  for (const p of players) {
    if (p.id === me.id || !p.alive || (me.team !== null && p.team === me.team)) continue;
    if (Math.abs(p.x - me.x) > sight.halfW || Math.abs(p.y - me.y) > sight.halfH) continue;
    if (walls.some((w) => segmentEntersRectAt(me.x, me.y, p.x - me.x, p.y - me.y, w) !== null)) continue;
    const d = Math.hypot(p.x - me.x, p.y - me.y);
    if (d < bestD) { best = p; bestD = d; }
  }
  return best;
}

const BOT_NAMES = [
  'Kestrel', 'Juno', 'Pike', 'Wren', 'Atlas', 'Moss', 'Echo', 'Rook', 'Sable', 'Quill', 'Bramble', 'Nova',
  'Flint', 'Ivy', 'Onyx', 'Tansy', 'Vale', 'Cobalt', 'Lark', 'Ember', 'Rune', 'Thistle', 'Gale', 'Pip',
];

export function botName(taken: ReadonlySet<string>, rand: () => number): string {
  const free = BOT_NAMES.filter((n) => !taken.has(n));
  return free.length ? pick(free, rand) : `${pick(BOT_NAMES, rand)} ${Math.floor(rand() * 90) + 10}`;
}
