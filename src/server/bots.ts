import { ARMOR_IDS, COLOR_IDS, GUNS, isPerkId, pickOptions, WEAPON_IDS, WORLD, ZOM, type GunId, type PerkId, type PickOption, type WeaponId } from '../shared/defs.ts';
import { VIEW_ASPECT, viewExtents, type BuildingView, type InputState, type Loadout, type PlayerView, type RunView, type Snapshot } from '../shared/protocol.ts';
import { cellRect } from '../shared/sim/build.ts';
import { circleHitsRect, segmentEntersRectAt } from '../shared/sim/movement.ts';
import { engage, SHARPNESS, TICK_MS, type Engagement } from './bot/aim.ts';
import type { BotArena } from './bot/arena.ts';
import { freshAwareness, perceive, type Awareness } from './bot/awareness.ts';
import { bandFor, nextIntent, PERSONALITIES, PERSONALITY_IDS, roleFor, startIntent, type Intent, type IntentCtx, type PersonalityId } from './bot/intent.ts';
import { ABILITY_RULES, act, freshMotor, HURTING_HP_FRAC, type Motor, type Situation } from './bot/motor.ts';

export { arenaFor } from './bot/arena.ts';

/** One bot's mind: who it is, what it is doing and since when, what it knows, and its body's state. Only that bot's think writes it. */
export type BotMemory = {
  persona: PersonalityId;
  /** Null until the first think, which needs the arena to pick a goal. */
  intent: Intent | null;
  awareness: Awareness;
  motor: Motor;
};

type BotDecision = { input: InputState; pick: { level: number; option: PickOption } | null; mem: BotMemory };

const IDLE_BOT_INPUT: InputState = { up: false, down: false, left: false, right: false, angle: 0, fire: false, shots: 0, reload: false, ability: false, aimDist: 0, use: false };
/** How close on an axis a squad bot's errand must be before it stops pressing toward it. */
const DEAD_ZONE = 30;
const UNDER_FIRE_TICKS = Math.round(500 / TICK_MS);

const pick = <T>(xs: readonly T[], rand: () => number): T => xs[Math.floor(rand() * xs.length)];

/** Perks that do nothing for a bot, which every other perk and every evolution outweighs: bots fire only inside their gun's base range, so long range never helps, and a bolt-action barely spreads, so grip is wasted on it. */
const PERK_WEIGHT: Partial<Record<PerkId, number>> = { longRange: 0 };
const CLASS_PERK_WEIGHT: Partial<Record<WeaponId, Partial<Record<PerkId, number>>>> = { sniper: { grip: 0 } };

function choosePickOption(options: readonly PickOption[], gun: GunId, rand: () => number): PickOption {
  const weight = (o: PickOption) => (isPerkId(o) ? CLASS_PERK_WEIGHT[GUNS[gun].base]?.[o] ?? PERK_WEIGHT[o] ?? 1 : 1);
  let roll = rand() * options.reduce((sum, o) => sum + weight(o), 0);
  return options.find((o) => (roll -= weight(o)) < 0) ?? pick(options, rand);
}

export function newBotMemory(rand: () => number): BotMemory {
  return { persona: pick(PERSONALITY_IDS, rand), intent: null, awareness: freshAwareness(), motor: freshMotor() };
}

export function randomLoadout(rand: () => number): Loadout {
  return { weapon: pick(WEAPON_IDS, rand), armor: pick(ARMOR_IDS, rand), color: pick(COLOR_IDS, rand) };
}

/** Perceive, decide, act: the snapshot becomes what the bot knows, that and its current intent become its next intent, and the intent becomes keys, aim and fire. */
export function botThink(snap: Snapshot, arena: BotArena, mem: BotMemory, rand: () => number): BotDecision {
  const me = snap.players.find((p) => p.id === snap.self.id);
  if (me?.downed && snap.run) {
    const core = snap.run.core;
    const input = { ...IDLE_BOT_INPUT, shots: mem.motor.shots, up: core.y < me.y - DEAD_ZONE, down: core.y > me.y + DEAD_ZONE, left: core.x < me.x - DEAD_ZONE, right: core.x > me.x + DEAD_ZONE };
    return { input, pick: null, mem };
  }
  if (!me || !me.alive) {
    const forgotten = mem.intent ? { ...mem, intent: null, awareness: freshAwareness(), motor: { ...freshMotor(), shots: mem.motor.shots } } : mem;
    return { input: { ...IDLE_BOT_INPUT, shots: mem.motor.shots }, pick: null, mem: forgotten };
  }
  const pending = snap.self.pending;
  const choice = pending ? { level: pending.level, option: choosePickOption(pickOptions(pending, me.gun), me.gun, rand) } : null;
  if (snap.run) return { ...siegeThink(snap, snap.run, me, arena, mem, rand), pick: choice };

  const { awareness, view } = perceive(snap, arena, me, mem.awareness);
  const persona = PERSONALITIES[mem.persona];
  const ctx: IntentCtx = { tick: snap.tick, persona, role: roleFor(me.id, me.team), band: bandFor(view.weapon, persona), arena, rand };
  const intent = nextIntent(mem.intent ?? startIntent({ k: 'patrol', goal: me }, ctx), view, ctx);
  const { input, motor } = act(intent, view, ctx, mem.motor, snap, rand);
  return { input, pick: choice, mem: { ...mem, intent, awareness, motor } };
}

const nearest = <T extends { x: number; y: number }>(me: PlayerView, xs: readonly T[]): T | null =>
  xs.reduce<T | null>((best, x) => (best && Math.hypot(best.x - me.x, best.y - me.y) <= Math.hypot(x.x - me.x, x.y - me.y) ? best : x), null);

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
  if (free.length) return pick(free, rand);
  for (;;) {
    const name = `${pick(BOT_NAMES, rand)} ${Math.floor(rand() * 90) + 10}`;
    if (!taken.has(name)) return name;
  }
}

type Watch = {
  me: PlayerView;
  core: { x: number; y: number };
  post: { x: number; y: number };
  zombie: { id: number; x: number; y: number; d: number } | null;
  downed: PlayerView | null;
  /** The nearest building that is worn, or a turret short of ammo. */
  wornBuilding: { x: number; y: number } | null;
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

/** A squad bot's errands, first match wins: get a downed squadmate up, mend a building or reload a turret and then mend the core while the horde is far, else hold its post by the core. It shoots the nearest zombie through all of them. */
const SIEGE_RULES: readonly ((s: Watch) => Errand | null)[] = [
  (s) => s.downed && { x: s.downed.x, y: s.downed.y, use: Math.hypot(s.downed.x - s.me.x, s.downed.y - s.me.y) <= ZOM.reviveRange - 15 },
  (s) => s.wornBuilding && hordeFar(s) ? mendAt(s, s.wornBuilding) : null,
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

function siegeThink(snap: Snapshot, run: RunView, me: PlayerView, arena: BotArena, mem: BotMemory, rand: () => number): Omit<BotDecision, 'pick'> {
  const walls = arena.walls;
  const sight = viewExtents(snap.self.viewRadius, VIEW_ASPECT.max);
  const zombies = (snap.zombies ?? [])
    .map(([id, , x, y]) => ({ id, x, y, d: Math.hypot(x - me.x, y - me.y) }))
    .filter((z) => Math.abs(z.x - me.x) <= sight.halfW && Math.abs(z.y - me.y) <= sight.halfH
      && !walls.some((r) => segmentEntersRectAt(me.x, me.y, z.x - me.x, z.y - me.y, r) !== null));
  const zombie = zombies.reduce<Watch['zombie']>((best, z) => (best && best.d <= z.d ? best : z), null);
  const down = snap.players.filter((p) => p.downed && p.id !== me.id);
  const downed = nearest(me, down.filter((p) => p.kind === 'human')) ?? nearest(me, down);
  const worn = (snap.buildings ?? [])
    .filter((b) => b.hp < 10 || (b.kind !== 'wall' && b.ammo < 10 && run.scrap > 0))
    .map((b) => ({ x: (b.cx + 0.5) * ZOM.cell, y: (b.cy + 0.5) * ZOM.cell }))
    .filter((b) => Math.hypot(b.x - run.core.x, b.y - run.core.y) <= GUARD_RADIUS);
  const watch: Watch = { me, core: run.core, post: postFor(run.core, me.id, snap.buildings ?? []), zombie, downed, wornBuilding: nearest(me, worn), coreWorn: run.core.hp < run.core.maxHp && run.scrap > 0 };
  const errand = SIEGE_RULES.reduce<Errand | null>((found, rule) => found ?? rule(watch), null)!;

  let angle = Math.atan2(errand.y - me.y, errand.x - me.x), aimDist = 300, fire = false;
  let threat: Situation['threat'] = null;
  let engaged: Engagement | null = null;
  if (zombie) {
    // A bot reacts once when the horde comes into sight, then swings from zombie to zombie without waiting again.
    engaged = engage(mem.motor.engaged, zombie, SHARPNESS[0]!, me, snap.tick, rand);
    angle = Math.atan2(zombie.y - me.y, zombie.x - me.x) + engaged.aimErrRad;
    aimDist = zombie.d;
    const reacted = snap.tick >= engaged.fireAtTick;
    fire = reacted && zombie.d < GUNS[me.gun].range * 0.95;
    if (reacted) threat = { d: zombie.d };
  }
  const hitTick = snap.events.some((e) => e.e === 'dmg' && e.kind === 'player' && e.victim === me.id) ? snap.tick : mem.awareness.hitTick;
  const situation: Situation = { threat, hurting: me.hp < me.maxHp * HURTING_HP_FRAC, underFire: snap.tick - hitTick <= UNDER_FIRE_TICKS, onContestedZone: false };
  const readyAbility = snap.self.abilityReadyIn === 0 ? snap.self.ability : null;
  const ability = readyAbility !== null && readyAbility !== 'engineer' && ABILITY_RULES[readyAbility](situation);
  const shots = mem.motor.shots + (fire ? 1 : 0);
  const mx = errand.x - me.x, my = errand.y - me.y;
  const still = errand.use;
  const input: InputState = {
    up: !still && my < -DEAD_ZONE, down: !still && my > DEAD_ZONE, left: !still && mx < -DEAD_ZONE, right: !still && mx > DEAD_ZONE,
    angle, fire, shots, reload: !zombie && snap.self.ammo < snap.self.mag / 2, ability, aimDist, use: errand.use,
  };
  const next = { ...mem, awareness: { ...mem.awareness, hitTick }, motor: { ...mem.motor, engaged, shots } };
  return { input, mem: next };
}
