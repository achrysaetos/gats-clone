import { ARMOR_IDS, COLOR_IDS, GUNS, isPerkId, pickOptions, WEAPON_IDS, type GunId, type PerkId, type PickOption, type WeaponId } from '../shared/defs.ts';
import type { InputState, Loadout, Snapshot } from '../shared/protocol.ts';
import type { BotArena } from './bot/arena.ts';
import { freshAwareness, perceive, type Awareness } from './bot/awareness.ts';
import { bandFor, nextIntent, PERSONALITIES, PERSONALITY_IDS, roleFor, startIntent, type Intent, type IntentCtx, type PersonalityId } from './bot/intent.ts';
import { act, freshMotor, type Motor } from './bot/motor.ts';
import { DEAD_ZONE, siegeThink } from './bot/siege.ts';

export type BotMemory = {
  persona: PersonalityId;
  intent: Intent | null;
  awareness: Awareness;
  motor: Motor;
};

export type BotDecision = { input: InputState; pick: { level: number; option: PickOption } | null; mem: BotMemory };

const IDLE_BOT_INPUT: InputState = { up: false, down: false, left: false, right: false, angle: 0, fire: false, shots: 0, reload: false, ability: false, aimDist: 0, use: false };

const pick = <T>(xs: readonly T[], rand: () => number): T => xs[Math.floor(rand() * xs.length)];

const PERK_WEIGHT: Partial<Record<PerkId, number>> = { ghillie: 0, longRange: 0, quickReload: 1.5, choke: 2 };
const CLASS_PERK_WEIGHT: Partial<Record<WeaponId, Partial<Record<PerkId, number>>>> = { lmg: { quickReload: 2 } };

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
  const { input, motor } = act(intent, view, ctx, mem.motor, snap);
  return { input, pick: choice, mem: { ...mem, intent, awareness, motor } };
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
  if (free.length) return pick(free, rand);
  for (;;) {
    const name = `${pick(BOT_NAMES, rand)} ${Math.floor(rand() * 90) + 10}`;
    if (!taken.has(name)) return name;
  }
}
