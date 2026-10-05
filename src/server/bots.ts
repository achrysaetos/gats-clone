import { ARMOR_IDS, COLOR_IDS, GUNS, isPerkId, pickOptions, WEAPON_IDS, WORLD, ZOM, type AbilityId, type GunId, type PerkId, type PickOption, type WeaponId } from '../shared/defs.ts';
import { VIEW_ASPECT, viewExtents, type BuildingView, type CrateView, type InputState, type Loadout, type PlayerView, type RunView, type Snapshot, type WallView } from '../shared/protocol.ts';
import { GRENADE_FUSE_MS } from '../shared/sim/abilities.ts';
import { cellRect } from '../shared/sim/build.ts';
import { circleHitsRect, KNIFE_LUNGE, KNIFE_REACH, segmentEntersRectAt, type Rect } from '../shared/sim/movement.ts';

export type BotMemory = {
  targetX: number; targetY: number; lastX: number; lastY: number; stuckTicks: number;
  /** A waypoint round the cover between an idle bot and the shooting it heads for; without it the bot would push into the wall for as long as the marker stays put. */
  detour: { x: number; y: number; untilTick: number } | null;
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
const crateRect = (c: CrateView): Rect => ({ x: c.x, y: c.y, w: c.size, h: c.size });

/**
 * Bots sharpen against a human who has climbed further, indexed by the human's level; a hunted human gets the last row.
 * A fresh player meets the base aim, so the room is beatable on arrival and fights back as they snowball.
 * Bots fight each other at the base row, so a bot that climbs keeps climbing and the room shows abilities and hunted bots.
 */
const SHARPNESS: readonly { aimMul: number; reactionMul: number }[] = [
  { aimMul: 1, reactionMul: 1 },
  { aimMul: 0.55, reactionMul: 0.8 },
  { aimMul: 0.4, reactionMul: 0.7 },
  { aimMul: 0.3, reactionMul: 0.6 },
  { aimMul: 0.2, reactionMul: 0.5 },
  { aimMul: 0.15, reactionMul: 0.45 },
];
const sharpnessAgainst = (target: PlayerView) =>
  target.kind === 'bot' ? SHARPNESS[0]! : SHARPNESS[target.hunted ? SHARPNESS.length - 1 : Math.min(target.level, SHARPNESS.length - 1)]!;

/** What a bot weighs when deciding whether its ability helps right now. `threat` is the enemy it is fighting, once its reaction delay has passed. */
type Situation = { threat: { d: number } | null; hurting: boolean; underFire: boolean; onContestedZone: boolean };

/** Lunge plus reach, leaving the target's radius as slack so a strafing target is still caught. */
const KNIFE_REACH_PX = KNIFE_LUNGE + KNIFE_REACH;
/** Grenades land where they were aimed when the fuse runs out, so bots aim where the target will be then. */
const GRENADE_FUSE_TICKS = Math.round(GRENADE_FUSE_MS / TICK_MS);
const GRENADES: ReadonlySet<AbilityId | null> = new Set(['grenade', 'fragGrenade', 'gasGrenade']);
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
const STUCK_TICKS = 15;
const DETOUR_MARGIN = WORLD.playerRadius + 30;
/** How close on an axis a bot's goal must be before it stops pressing toward it. */
const DEAD_ZONE = 30;
/** Within the dead zone on both axes, which is as close as a bot walks to a waypoint. */
const reached = (me: PlayerView, p: { x: number; y: number }) => Math.abs(p.x - me.x) <= DEAD_ZONE && Math.abs(p.y - me.y) <= DEAD_ZONE;

type BotDecision = { input: InputState; pick: { level: number; option: PickOption } | null; mem: BotMemory };

const IDLE_BOT_INPUT: InputState = { up: false, down: false, left: false, right: false, angle: 0, fire: false, shots: 0, reload: false, ability: false, aimDist: 0, use: false };

const pick = <T>(xs: readonly T[], rand: () => number): T => xs[Math.floor(rand() * xs.length)];

/**
 * Perks that do nothing for a bot, which every other perk and every evolution outweighs.
 * Bots never stand still, so bipod and ghillie never apply; they fire only inside their gun's base range, so long range never helps; a bolt-action barely spreads, so grip is wasted on it.
 */
const PERK_WEIGHT: Partial<Record<PerkId, number>> = { bipod: 0, ghillie: 0, longRange: 0 };
const CLASS_PERK_WEIGHT: Partial<Record<WeaponId, Partial<Record<PerkId, number>>>> = { sniper: { grip: 0 } };

function choosePickOption(options: readonly PickOption[], gun: GunId, rand: () => number): PickOption {
  const weight = (o: PickOption) => (isPerkId(o) ? CLASS_PERK_WEIGHT[GUNS[gun].base]?.[o] ?? PERK_WEIGHT[o] ?? 1 : 1);
  let roll = rand() * options.reduce((sum, o) => sum + weight(o), 0);
  return options.find((o) => (roll -= weight(o)) < 0) ?? pick(options, rand);
}

export function newBotMemory(rand: () => number): BotMemory {
  return { targetX: rand() * WORLD.size, targetY: rand() * WORLD.size, lastX: 0, lastY: 0, stuckTicks: 0, detour: null, strafe: rand() < 0.5 ? 1 : -1, engaged: null, shots: 0, hitTick: -Infinity };
}

export function randomLoadout(rand: () => number): Loadout {
  return { weapon: pick(WEAPON_IDS, rand), armor: pick(ARMOR_IDS, rand), color: pick(COLOR_IDS, rand) };
}

export function botThink(snap: Snapshot, walls: readonly WallView[], mem: BotMemory, rand: () => number): BotDecision {
  const me = snap.players.find((p) => p.id === snap.self.id);
  if (me?.downed && snap.run) {
    const core = snap.run.core;
    const input = { ...IDLE_BOT_INPUT, shots: mem.shots, up: core.y < me.y - DEAD_ZONE, down: core.y > me.y + DEAD_ZONE, left: core.x < me.x - DEAD_ZONE, right: core.x > me.x + DEAD_ZONE };
    return { input, pick: null, mem };
  }
  if (!me || !me.alive) {
    return { input: { ...IDLE_BOT_INPUT, shots: mem.shots }, pick: null, mem };
  }
  const pending = snap.self.pending;
  const choice = pending ? { level: pending.level, option: choosePickOption(pickOptions(pending, me.gun), me.gun, rand) } : null;
  if (snap.run) return { ...siegeThink(snap, snap.run, me, walls, mem, rand), pick: choice };

  let next = { ...mem };
  const moved = Math.hypot(me.x - mem.lastX, me.y - mem.lastY);
  next.stuckTicks = moved < 1 ? mem.stuckTicks + 1 : 0;
  if (next.stuckTicks > 6 || rand() < 0.02) next.strafe = next.strafe === 1 ? -1 : 1;
  const arrived = Math.hypot(me.x - mem.targetX, me.y - mem.targetY) < 80;
  const stuck = next.stuckTicks > STUCK_TICKS;
  if (next.detour && snap.tick >= next.detour.untilTick) next.detour = null;
  if (arrived || stuck) {
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
  const cover = [...walls, ...snap.crates.map(crateRect)];
  const enemy = chooseTarget(me, snap.players, cover, snap.self.viewRadius);
  const weapon = GUNS[me.gun];
  const range = weapon.range;
  const readyAbility = snap.self.abilityReadyIn === 0 ? snap.self.ability : null;
  let goX = next.targetX, goY = next.targetY;
  let angle = Math.atan2(goY - me.y, goX - me.x);
  let fire = false, aimDist = 300;
  let threat: Situation['threat'] = null;
  let throwAt: { x: number; y: number; err: number } | null = null;
  if (enemy) {
    const d = Math.hypot(enemy.x - me.x, enemy.y - me.y);
    const tracked = mem.engaged?.id === enemy.id ? mem.engaged : null;
    const engaged = engage(tracked, enemy, sharpnessAgainst(enemy), me, snap.tick, rand);
    const velPerTick = tracked ? { x: enemy.x - tracked.x, y: enemy.y - tracked.y } : { x: 0, y: 0 };
    const flightTicks = (d / weapon.bulletSpeed) * WORLD.tickHz;
    const aimX = enemy.x + velPerTick.x * flightTicks, aimY = enemy.y + velPerTick.y * flightTicks;
    angle = Math.atan2(aimY - me.y, aimX - me.x) + engaged.aimErrRad;
    aimDist = d;
    const reacted = snap.tick >= engaged.fireAtTick;
    fire = reacted && d < range * 0.95;
    if (reacted) threat = { d };
    throwAt = { x: enemy.x + velPerTick.x * GRENADE_FUSE_TICKS, y: enemy.y + velPerTick.y * GRENADE_FUSE_TICKS, err: engaged.aimErrRad };
    if (d > range * 0.6 || (readyAbility === 'knife' && d < 300)) {
      goX = enemy.x; goY = enemy.y;
    } else {
      const toward = Math.atan2(enemy.y - me.y, enemy.x - me.x) + (Math.PI / 2) * next.strafe;
      goX = me.x + Math.cos(toward) * 200; goY = me.y + Math.sin(toward) * 200;
    }
    next.engaged = engaged;
    next.detour = null;
  } else {
    next.engaged = null;
    // The minimap shows enemies who fired lately, so an idle bot heads for the shooting, the hunted first.
    const heard = snap.minimap.filter((m) => me.team === null || m.team !== me.team);
    const lead = snap.zones.length === 0 ? nearest(me, heard.filter((m) => m.pingAge !== null)) ?? nearest(me, heard) : null;
    if (lead) {
      const atWaypoint = next.detour !== null && reached(me, next.detour);
      if (next.detour && firstBlock(me, lead, cover) === null) next.detour = null;
      else if (stuck || atWaypoint) next.detour = detourToward(me, lead, cover, snap.tick, rand);
    }
    const go = lead && (next.detour ?? lead);
    if (go) { goX = go.x; goY = go.y; }
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
  if (ability && readyAbility === 'dash' && enemy) {
    const away = retreatHeading(me, Math.atan2(me.y - enemy.y, me.x - enemy.x), walls);
    goX = me.x + Math.cos(away) * 200; goY = me.y + Math.sin(away) * 200;
  }
  if (ability && throwAt && GRENADES.has(readyAbility)) {
    angle = Math.atan2(throwAt.y - me.y, throwAt.x - me.x) + throwAt.err;
    aimDist = Math.hypot(throwAt.x - me.x, throwAt.y - me.y);
  }
  if (fire) next.shots++;
  const mx = goX - me.x, my = goY - me.y;
  const input: InputState = {
    up: my < -DEAD_ZONE, down: my > DEAD_ZONE, left: mx < -DEAD_ZONE, right: mx > DEAD_ZONE,
    angle, fire, shots: next.shots, reload: !enemy && !fire && snap.self.ammo < snap.self.mag / 2, ability, aimDist, use: false,
  };
  return { input, pick: choice, mem: next };
}

const gaussian = (rand: () => number) => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

function engage(prev: Engagement | null, enemy: { id: number; x: number; y: number }, sharpness: (typeof SHARPNESS)[number], me: PlayerView, tick: number, rand: () => number): Engagement {
  const bearing = Math.atan2(enemy.y - me.y, enemy.x - me.x);
  const { aimMul, reactionMul } = sharpness;
  const [fastest, slowest] = BOT_AIM.reactionMs.map((ms) => ms * reactionMul);
  const acquiredTick = prev?.acquiredTick ?? tick;
  const fireAtTick = prev?.fireAtTick ?? tick + Math.round((fastest + rand() * (slowest - fastest)) / TICK_MS);
  const angularSpeed = prev ? Math.abs(wrapAngle(bearing - prev.bearing)) * WORLD.tickHz : 0;
  const unsettled = 1 + BOT_AIM.unsettledMul * Math.exp(-((tick - acquiredTick) * TICK_MS) / BOT_AIM.settleMs);
  const sigma = (BOT_AIM.baseSigma + BOT_AIM.sigmaPerRadPerSec * angularSpeed) * unsettled * aimMul;
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

/**
 * The way round the first cover between `me` and `goal`: the corner of it, pushed out by a body width, that is in the clear and shortest to go through.
 * A corner the bot already stands at is skipped, so a bot that reached one moves on to the next. With no such corner it wanders off for a while instead.
 */
function detourToward(me: PlayerView, goal: { x: number; y: number }, cover: readonly Rect[], tick: number, rand: () => number): NonNullable<BotMemory['detour']> {
  const block = firstBlock(me, goal, cover);
  const m = DETOUR_MARGIN, edge = WORLD.playerRadius;
  const corners = block ? [
    { x: block.x - m, y: block.y - m }, { x: block.x + block.w + m, y: block.y - m },
    { x: block.x - m, y: block.y + block.h + m }, { x: block.x + block.w + m, y: block.y + block.h + m },
  ] : [];
  const via = (c: { x: number; y: number }) => Math.hypot(c.x - me.x, c.y - me.y) + Math.hypot(goal.x - c.x, goal.y - c.y);
  const corner = corners
    .filter((c) => c.x >= edge && c.y >= edge && c.x <= WORLD.size - edge && c.y <= WORLD.size - edge
      && !reached(me, c) && firstBlock(me, c, cover) === null)
    .sort((a, b) => via(a) - via(b))[0];
  const to = corner ?? { x: rand() * WORLD.size, y: rand() * WORLD.size };
  const walkTicks = (Math.hypot(to.x - me.x, to.y - me.y) / WORLD.baseSpeed) * WORLD.tickHz;
  return { ...to, untilTick: tick + Math.round(2 * walkTicks) + WORLD.tickHz };
}

function firstBlock(me: PlayerView, to: { x: number; y: number }, cover: readonly Rect[]): Rect | null {
  let block: Rect | null = null, first = Infinity;
  for (const r of cover) {
    const t = segmentEntersRectAt(me.x, me.y, to.x - me.x, to.y - me.y, r);
    if (t !== null && t < first) { first = t; block = r; }
  }
  return block;
}

const nearest = <T extends { x: number; y: number }>(me: PlayerView, xs: readonly T[]): T | null =>
  xs.reduce<T | null>((best, x) => (best && Math.hypot(best.x - me.x, best.y - me.y) <= Math.hypot(x.x - me.x, x.y - me.y) ? best : x), null);

/**
 * The nearest of the most dangerous enemies in sight: hunted first, then the highest-level human, so bots in view of a leading human all turn on it. Among bots only hunted counts, so a climbing bot is not ganged up on before it evolves.
 * Crates block sight like walls, since they stop bullets too.
 */
function chooseTarget(me: PlayerView, players: PlayerView[], cover: readonly Rect[], viewRadius: number): PlayerView | null {
  const sight = viewExtents(viewRadius, VIEW_ASPECT.max);
  const visible = players.filter((p) => p.id !== me.id && p.alive && (me.team === null || p.team !== me.team)
    && Math.abs(p.x - me.x) <= sight.halfW && Math.abs(p.y - me.y) <= sight.halfH
    && !cover.some((r) => segmentEntersRectAt(me.x, me.y, p.x - me.x, p.y - me.y, r) !== null));
  const danger = (p: PlayerView) => (p.hunted ? SHARPNESS.length : p.kind === 'human' ? p.level : 0);
  const top = Math.max(...visible.map(danger));
  return nearest(me, visible.filter((p) => danger(p) === top));
}

/** The nearest crate centre in sight, in range and in the clear, so a bot with nobody to fight still earns score. */
function crateInSight(me: PlayerView, crates: readonly CrateView[], walls: readonly WallView[], range: number, viewRadius: number): { x: number; y: number } | null {
  const sight = viewExtents(viewRadius, VIEW_ASPECT.max);
  const centres = crates.map((c) => ({ id: c.id, x: c.x + c.size / 2, y: c.y + c.size / 2 }));
  const open = centres.filter((c) => Math.abs(c.x - me.x) <= sight.halfW && Math.abs(c.y - me.y) <= sight.halfH
    && Math.hypot(c.x - me.x, c.y - me.y) <= range
    && ![...walls, ...crates.filter((o) => o.id !== c.id).map(crateRect)].some((b) => segmentEntersRectAt(me.x, me.y, c.x - me.x, c.y - me.y, b) !== null));
  return nearest(me, open);
}

export type TeamCounts = { red: number; blue: number };

/**
 * How many bots each team gets so the room holds at least `minPlayers` and both sides are equally strong, a human counting as `botsPerHuman` bots.
 * A team left without its humans gets extra bots rather than playing short against the other side's humans, up to `maxBots` in all.
 */
export function botSeats(humans: TeamCounts, minPlayers: number, botsPerHuman: number, maxBots: number): TeamCounts {
  const gap = (humans.red - humans.blue) * botsPerHuman;
  const total = Math.min(maxBots, Math.max(minPlayers - humans.red - humans.blue, Math.round(Math.abs(gap))));
  const imbalance = (red: number) => Math.abs(humans.red * botsPerHuman + red - humans.blue * botsPerHuman - (total - red));
  const red = Math.max(0, Math.min(total, Math.floor((total - gap) / 2)));
  const best = red + 1 <= total && imbalance(red + 1) < imbalance(red) ? red + 1 : red;
  return { red: best, blue: total - best };
}

const BOT_NAMES = [
  'Kestrel', 'Juno', 'Pike', 'Wren', 'Atlas', 'Moss', 'Echo', 'Rook', 'Sable', 'Quill', 'Bramble', 'Nova',
  'Flint', 'Ivy', 'Onyx', 'Tansy', 'Vale', 'Cobalt', 'Lark', 'Ember', 'Rune', 'Thistle', 'Gale', 'Pip',
];

export function botName(taken: ReadonlySet<string>, rand: () => number): string {
  const free = BOT_NAMES.filter((n) => !taken.has(n));
  return free.length ? pick(free, rand) : `${pick(BOT_NAMES, rand)} ${Math.floor(rand() * 90) + 10}`;
}

type Watch = {
  me: PlayerView;
  core: { x: number; y: number };
  post: { x: number; y: number };
  zombie: { id: number; x: number; y: number; d: number } | null;
  downed: PlayerView | null;
  damagedWall: { x: number; y: number } | null;
  /** The core is worn and the bank can pay to mend it. */
  coreWorn: boolean;
};

type Errand = { x: number; y: number; use: boolean };

/** How far from the core a squad bot will wander, and how close a zombie must be before it stops mending. */
const GUARD_RADIUS = 550;
const POST_RADIUS = 320;
const BUSY_ZOMBIE_PX = 300;
const KITE_PX = 140;

const mendAt = (s: Watch, at: { x: number; y: number }): Errand => ({ ...at, use: Math.hypot(at.x - s.me.x, at.y - s.me.y) <= ZOM.reachPx - 60 });
const hordeFar = (s: Watch) => !s.zombie || s.zombie.d > BUSY_ZOMBIE_PX;

/** A squad bot's errands, first match wins: get a downed squadmate up, mend a wall and then the core while the horde is far, else hold its post by the core. It shoots the nearest zombie through all of them. */
const SIEGE_RULES: readonly ((s: Watch) => Errand | null)[] = [
  (s) => s.downed && { x: s.downed.x, y: s.downed.y, use: Math.hypot(s.downed.x - s.me.x, s.downed.y - s.me.y) <= ZOM.reviveRange - 15 },
  (s) => s.damagedWall && hordeFar(s) ? mendAt(s, s.damagedWall) : null,
  (s) => s.coreWorn && hordeFar(s) ? mendAt(s, s.core) : null,
  (s) => {
    const post = { ...s.post, use: false };
    if (!s.zombie || s.zombie.d > KITE_PX) return post;
    // Back away from the zombie, or sidestep it where backing away would leave the guard ring.
    const away = Math.atan2(s.me.y - s.zombie.y, s.me.x - s.zombie.x);
    const steps = [away, away + Math.PI / 2, away - Math.PI / 2].map((a) => ({ x: s.me.x + Math.cos(a) * 200, y: s.me.y + Math.sin(a) * 200, use: false }));
    return steps.find((p) => Math.hypot(p.x - s.core.x, p.y - s.core.y) <= GUARD_RADIUS) ?? post;
  },
];

/** A bot's post on its own bearing from the core: POST_RADIUS out, or nearer when a squad wall stands in the way, so the walls shelter the bot instead of shutting it out. */
function postFor(core: { x: number; y: number }, bearing: number, buildings: readonly BuildingView[]): { x: number; y: number } {
  const at = (d: number) => ({ x: core.x + Math.cos(bearing) * d, y: core.y + Math.sin(bearing) * d });
  const nearest = ZOM.coreHalf + WORLD.playerRadius + 1;
  for (let d = nearest; d <= POST_RADIUS; d += 5) {
    const { x, y } = at(d);
    if (buildings.some((b) => circleHitsRect(x, y, WORLD.playerRadius, cellRect(b.cx, b.cy)))) return at(Math.max(nearest, d - 5));
  }
  return at(POST_RADIUS);
}

function siegeThink(snap: Snapshot, run: RunView, me: PlayerView, walls: readonly WallView[], mem: BotMemory, rand: () => number): Omit<BotDecision, 'pick'> {
  const sight = viewExtents(snap.self.viewRadius, VIEW_ASPECT.max);
  const zombies = (snap.zombies ?? [])
    .map(([id, , x, y]) => ({ id, x, y, d: Math.hypot(x - me.x, y - me.y) }))
    .filter((z) => Math.abs(z.x - me.x) <= sight.halfW && Math.abs(z.y - me.y) <= sight.halfH
      && !walls.some((r) => segmentEntersRectAt(me.x, me.y, z.x - me.x, z.y - me.y, r) !== null));
  const zombie = zombies.reduce<Watch['zombie']>((best, z) => (best && best.d <= z.d ? best : z), null);
  const down = snap.players.filter((p) => p.downed && p.id !== me.id);
  const downed = nearest(me, down.filter((p) => p.kind === 'human')) ?? nearest(me, down);
  const damaged = (snap.buildings ?? [])
    .filter((b) => b.hp < 10)
    .map((b) => ({ x: (b.cx + 0.5) * ZOM.cell, y: (b.cy + 0.5) * ZOM.cell }))
    .filter((b) => Math.hypot(b.x - run.core.x, b.y - run.core.y) <= GUARD_RADIUS);
  const watch: Watch = { me, core: run.core, post: postFor(run.core, me.id, snap.buildings ?? []), zombie, downed, damagedWall: nearest(me, damaged), coreWorn: run.core.hp < run.core.maxHp && run.scrap > 0 };
  const errand = SIEGE_RULES.reduce<Errand | null>((found, rule) => found ?? rule(watch), null)!;

  const next = { ...mem };
  let angle = Math.atan2(errand.y - me.y, errand.x - me.x), aimDist = 300, fire = false;
  let threat: Situation['threat'] = null;
  if (zombie) {
    // A bot reacts once when the horde comes into sight, then swings from zombie to zombie without waiting again.
    const engaged = engage(mem.engaged, zombie, SHARPNESS[0]!, me, snap.tick, rand);
    angle = Math.atan2(zombie.y - me.y, zombie.x - me.x) + engaged.aimErrRad;
    aimDist = zombie.d;
    const reacted = snap.tick >= engaged.fireAtTick;
    fire = reacted && zombie.d < GUNS[me.gun].range * 0.95;
    if (reacted) threat = { d: zombie.d };
    next.engaged = engaged;
  } else next.engaged = null;
  if (snap.events.some((e) => e.e === 'dmg' && e.kind === 'player' && e.victim === me.id)) next.hitTick = snap.tick;
  const situation: Situation = { threat, hurting: me.hp < me.maxHp * HURTING_HP_FRAC, underFire: snap.tick - next.hitTick <= UNDER_FIRE_TICKS, onContestedZone: false };
  const readyAbility = snap.self.abilityReadyIn === 0 ? snap.self.ability : null;
  const ability = readyAbility !== null && readyAbility !== 'engineer' && ABILITY_RULES[readyAbility](situation);
  if (fire) next.shots++;
  const mx = errand.x - me.x, my = errand.y - me.y;
  const still = errand.use;
  const input: InputState = {
    up: !still && my < -DEAD_ZONE, down: !still && my > DEAD_ZONE, left: !still && mx < -DEAD_ZONE, right: !still && mx > DEAD_ZONE,
    angle, fire, shots: next.shots, reload: !zombie && snap.self.ammo < snap.self.mag / 2, ability, aimDist, use: errand.use,
  };
  return { input, mem: next };
}
