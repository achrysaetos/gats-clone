import { ARMOR_IDS, COLOR_IDS, GUNS, pickOptions, WEAPON_IDS, WORLD, type AbilityId, type PickOption } from '../shared/defs.ts';
import { VIEW_ASPECT, viewExtents, type InputState, type Loadout, type CrateView, type PlayerView, type Snapshot, type WallView } from '../shared/protocol.ts';
import { segmentEntersRectAt } from '../shared/sim/movement.ts';

export type BotMemory = {
  targetX: number; targetY: number; lastX: number; lastY: number; stuckTicks: number;
  strafe: 1 | -1;
  engaged: Engagement | null;
  shots: number;
  hitTick: number;
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

/** What a bot weighs when deciding whether its ability helps right now. `threat` is the enemy it is fighting, once its reaction delay has passed. */
type Situation = { threat: { d: number } | null; hurting: boolean; underFire: boolean; onContestedZone: boolean };

/** Knife lunge (90) plus knife reach (70) from sim/movement.ts, short of the target's radius so a strafing target is still caught. */
const KNIFE_REACH_PX = 160;
const throwRange = (s: Situation) => s.threat !== null && s.threat.d >= 150 && s.threat.d <= 450;

const ABILITY_RULES: Record<AbilityId, (s: Situation) => boolean> = {
  knife: (s) => s.threat !== null && s.threat.d <= KNIFE_REACH_PX,
  grenade: throwRange,
  fragGrenade: throwRange,
  gasGrenade: throwRange,
  landMine: (s) => (s.hurting && s.threat !== null) || s.onContestedZone,
  dash: (s) => s.hurting && s.threat !== null,
  engineer: (s) => s.underFire && s.threat !== null && s.threat.d >= 200 && s.threat.d <= 500,
};

const HURTING_HP_FRAC = 0.4;
const UNDER_FIRE_TICKS = Math.round(500 / TICK_MS);
const RETREAT_CLEARANCE = 240 + WORLD.playerRadius;

type BotDecision = { input: InputState; pick: { level: number; option: PickOption } | null; mem: BotMemory };

const pick = <T>(xs: readonly T[], rand: () => number): T => xs[Math.floor(rand() * xs.length)];

export function newBotMemory(rand: () => number): BotMemory {
  return { targetX: rand() * WORLD.size, targetY: rand() * WORLD.size, lastX: 0, lastY: 0, stuckTicks: 0, strafe: rand() < 0.5 ? 1 : -1, engaged: null, shots: 0, hitTick: -Infinity };
}

export function randomLoadout(rand: () => number): Loadout {
  return { weapon: pick(WEAPON_IDS, rand), armor: pick(ARMOR_IDS, rand), color: pick(COLOR_IDS, rand) };
}

export function botThink(snap: Snapshot, walls: readonly WallView[], mem: BotMemory, rand: () => number): BotDecision {
  const me = snap.players.find((p) => p.id === snap.self.id);
  if (!me || !me.alive) {
    return { input: { up: false, down: false, left: false, right: false, angle: 0, fire: false, shots: mem.shots, reload: false, ability: false, aimDist: 0 }, pick: null, mem };
  }
  const pending = snap.self.pending;
  const choice = pending ? { level: pending.level, option: pick(pickOptions(pending, me.gun), rand) } : null;

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

  if (snap.events.some((e) => e.e === 'dmg' && e.kind === 'player' && e.victim === me.id)) next.hitTick = snap.tick;
  const hurting = me.hp < me.maxHp * HURTING_HP_FRAC;
  const enemy = chooseTarget(me, snap.players, walls, snap.self.viewRadius);
  const weapon = GUNS[me.gun];
  const range = weapon.range;
  const readyAbility = snap.self.abilityReadyIn === 0 ? snap.self.ability : null;
  let goX = next.targetX, goY = next.targetY;
  let angle = Math.atan2(goY - me.y, goX - me.x);
  let fire = false, aimDist = 300;
  let threat: Situation['threat'] = null;
  if (enemy) {
    const d = Math.hypot(enemy.x - me.x, enemy.y - me.y);
    const tracked = mem.engaged?.id === enemy.id ? mem.engaged : null;
    const engaged = engage(tracked, enemy, me, snap.tick, rand);
    const velPerTick = tracked ? { x: enemy.x - tracked.x, y: enemy.y - tracked.y } : { x: 0, y: 0 };
    const flightTicks = (d / weapon.bulletSpeed) * WORLD.tickHz;
    const aimX = enemy.x + velPerTick.x * flightTicks, aimY = enemy.y + velPerTick.y * flightTicks;
    angle = Math.atan2(aimY - me.y, aimX - me.x) + engaged.aimErrRad;
    aimDist = d;
    const reacted = snap.tick >= engaged.fireAtTick;
    fire = reacted && d < range * 0.95;
    if (reacted) threat = { d };
    if (hurting) {
      const away = retreatHeading(me, Math.atan2(me.y - enemy.y, me.x - enemy.x), walls);
      goX = me.x + Math.cos(away) * 200; goY = me.y + Math.sin(away) * 200;
    } else if (d > range * 0.6 || (readyAbility === 'knife' && d < 300)) {
      goX = enemy.x; goY = enemy.y;
    } else {
      const toward = Math.atan2(enemy.y - me.y, enemy.x - me.x) + (Math.PI / 2) * next.strafe;
      goX = me.x + Math.cos(toward) * 200; goY = me.y + Math.sin(toward) * 200;
    }
    next.engaged = engaged;
  } else {
    next.engaged = null;
    const bounty = snap.zones.length === 0 ? nearest(me, snap.minimap.filter((m) => m.hunted)) : null;
    if (bounty) { goX = bounty.x; goY = bounty.y; }
    const crate = snap.self.ammo >= snap.self.mag / 2 && !snap.self.reloading ? crateInSight(me, snap.crates, walls, range * 0.95, snap.self.viewRadius) : null;
    if (crate) {
      angle = Math.atan2(crate.y - me.y, crate.x - me.x);
      aimDist = Math.hypot(crate.x - me.x, crate.y - me.y);
      fire = true;
    }
  }
  const situation: Situation = {
    threat, hurting,
    underFire: snap.tick - next.hitTick <= UNDER_FIRE_TICKS,
    onContestedZone: snap.zones.some((z) => z.owner !== me.team && Math.hypot(z.x - me.x, z.y - me.y) < z.r),
  };
  const ability = readyAbility !== null && ABILITY_RULES[readyAbility](situation);
  if (fire) next.shots++;
  const mx = goX - me.x, my = goY - me.y;
  const dead = 30;
  const input: InputState = {
    up: my < -dead, down: my > dead, left: mx < -dead, right: mx > dead,
    angle, fire, shots: next.shots, reload: !enemy && !fire && snap.self.ammo < snap.self.mag / 2, ability, aimDist,
  };
  return { input, pick: choice, mem: next };
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

/** The 8-way heading closest to `away` whose dash-length path is free of walls and the world edge, so a retreat or dash does not end against cover. */
function retreatHeading(me: PlayerView, away: number, walls: readonly WallView[]): number {
  const headings = Array.from({ length: 8 }, (_, i) => (i * Math.PI) / 4)
    .filter((h) => Math.cos(h - away) > 0)
    .sort((a, b) => Math.cos(b - away) - Math.cos(a - away));
  const clear = headings.find((h) => {
    const dx = Math.cos(h) * RETREAT_CLEARANCE, dy = Math.sin(h) * RETREAT_CLEARANCE;
    const ex = me.x + dx, ey = me.y + dy;
    if (ex < WORLD.playerRadius || ey < WORLD.playerRadius || ex > WORLD.size - WORLD.playerRadius || ey > WORLD.size - WORLD.playerRadius) return false;
    return !walls.some((w) => segmentEntersRectAt(me.x, me.y, dx, dy, w) !== null);
  });
  return clear ?? headings[0] ?? away;
}

const nearest = <T extends { x: number; y: number }>(me: PlayerView, xs: readonly T[]): T | null =>
  xs.reduce<T | null>((best, x) => (best && Math.hypot(best.x - me.x, best.y - me.y) <= Math.hypot(x.x - me.x, x.y - me.y) ? best : x), null);

/** The nearest hunted enemy in sight, for the bounty, else the nearest enemy in sight. */
function chooseTarget(me: PlayerView, players: PlayerView[], walls: readonly WallView[], viewRadius: number): PlayerView | null {
  const sight = viewExtents(viewRadius, VIEW_ASPECT.max);
  const visible = players.filter((p) => p.id !== me.id && p.alive && (me.team === null || p.team !== me.team)
    && Math.abs(p.x - me.x) <= sight.halfW && Math.abs(p.y - me.y) <= sight.halfH
    && !walls.some((w) => segmentEntersRectAt(me.x, me.y, p.x - me.x, p.y - me.y, w) !== null));
  return nearest(me, visible.filter((p) => p.hunted)) ?? nearest(me, visible);
}

/** The nearest crate centre in sight, in range and in the clear, so a bot with nobody to fight still earns score. */
function crateInSight(me: PlayerView, crates: readonly CrateView[], walls: readonly WallView[], range: number, viewRadius: number): { x: number; y: number } | null {
  const sight = viewExtents(viewRadius, VIEW_ASPECT.max);
  const rect = (c: CrateView) => ({ x: c.x, y: c.y, w: c.size, h: c.size });
  const centres = crates.map((c) => ({ id: c.id, x: c.x + c.size / 2, y: c.y + c.size / 2 }));
  const open = centres.filter((c) => Math.abs(c.x - me.x) <= sight.halfW && Math.abs(c.y - me.y) <= sight.halfH
    && Math.hypot(c.x - me.x, c.y - me.y) <= range
    && ![...walls, ...crates.filter((o) => o.id !== c.id).map(rect)].some((b) => segmentEntersRectAt(me.x, me.y, c.x - me.x, c.y - me.y, b) !== null));
  return nearest(me, open);
}

const BOT_NAMES = [
  'Kestrel', 'Juno', 'Pike', 'Wren', 'Atlas', 'Moss', 'Echo', 'Rook', 'Sable', 'Quill', 'Bramble', 'Nova',
  'Flint', 'Ivy', 'Onyx', 'Tansy', 'Vale', 'Cobalt', 'Lark', 'Ember', 'Rune', 'Thistle', 'Gale', 'Pip',
];

export function botName(taken: ReadonlySet<string>, rand: () => number): string {
  const free = BOT_NAMES.filter((n) => !taken.has(n));
  return free.length ? pick(free, rand) : `${pick(BOT_NAMES, rand)} ${Math.floor(rand() * 90) + 10}`;
}
