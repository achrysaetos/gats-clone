import {
  ARMORS, GUN_IDS, LOAD_SPEED_FLOOR, SUPPRESSION, GUNS, HP_MULTIPLIER, LEVELS, PERK_TIERS, pickOptions, rulesOf, WORLD, type AbilityId, type GunId, type GunRules, type PendingPick, type PerkId, type PickOption, type Tier,
} from '../defs.ts';
import type { Life, PerkOfTier, Player, World } from './world.ts';

type PerkMods = {
  spreadMul?: number; pelletSpreadMul?: number; reloadMul?: number; magMul?: number; rangeMul?: number; speedMul?: number;
  maxHpAdd?: number; regenMul?: number; regenDelayMul?: number; viewMul?: number;
  piercing?: true; silenced?: true; shield?: true; thermal?: true; ghillie?: true;
};

const PERK_MODS: Record<PerkId, PerkMods> = {
  optics: { viewMul: 1.3 },
  thermal: { thermal: true },
  ghillie: { ghillie: true },
  piercing: { piercing: true },
  extended: { magMul: 1.5 },
  grip: { spreadMul: 0.6 },
  silencer: { silenced: true },
  lightweight: { speedMul: 1.25 },
  longRange: { rangeMul: 1.4 },
  quickReload: { reloadMul: 0.65 },
  choke: { pelletSpreadMul: 0.75 },
  shield: { shield: true },
  thickSkin: { maxHpAdd: 40 },
  firstAid: { regenMul: 3, regenDelayMul: 0.4 },
  grenade: {}, fragGrenade: {}, gasGrenade: {}, landMine: {}, knife: {}, engineer: {}, dash: {},
};

type Stats = {
  speed: number; maxHp: number; mag: number; range: number; reloadMs: number; regenPerSec: number; regenDelayMs: number;
  viewRadius: number; piercing: boolean; silenced: boolean; shield: boolean; thermal: boolean; ghillie: boolean;
};

/** Spread of the `sprayShot`th shot of a spray (0 outside one), on the move or `still`, after perks and `suppression`. */
export function spreadFor(gun: GunId, perks: Partial<Record<Tier, PerkId>>, still: boolean, sprayShot = 0, suppression = 0): number {
  const rules = rulesOf(GUNS[gun]);
  if (still && rules.pinpoint && suppression <= SUPPRESSION.breaksPinpoint) return 0;
  let spread = (still ? GUNS[gun].spread : GUNS[gun].spread * rules.movingSpreadMul + rules.movingSpreadAdd) * bloomMul(rules, sprayShot);
  for (const perk of Object.values(perks)) spread *= (PERK_MODS[perk].spreadMul ?? 1) * (GUNS[gun].pellets > 1 ? PERK_MODS[perk].pelletSpreadMul ?? 1 : 1);
  return spread * suppressionMul(suppression);
}

/** How much `suppression` (0..1) widens spread. */
export const suppressionMul = (suppression: number): number => 1 + suppression * SUPPRESSION.spread;

function bloomMul({ bloom }: GunRules, sprayShot: number): number {
  return bloom ? Math.min(bloom.maxMul, 1 + bloom.perShot * Math.max(0, sprayShot - bloom.free)) : 1;
}

/** Whether the gun has the still spread, `sinceMoveMs` after the last step (0 while walking). */
export const isSteady = (gun: GunId, sinceMoveMs: number): boolean => sinceMoveMs > 0 && sinceMoveMs >= rulesOf(GUNS[gun]).steadyMs;

export const reloadMsFor = (gun: GunId, perks: Partial<Record<Tier, PerkId>>): number =>
  Object.values(perks).reduce((ms, perk) => ms * (PERK_MODS[perk].reloadMul ?? 1), GUNS[gun].reloadMs);

/** The most any one perk stretches a gun's range. */
export const MAX_RANGE_MUL = Math.max(...Object.values(PERK_MODS).map((m) => m.rangeMul ?? 1));

export const rangeFor = (gun: GunId, perks: Partial<Record<Tier, PerkId>>): number =>
  Object.values(perks).reduce((range, perk) => range * (PERK_MODS[perk].rangeMul ?? 1), GUNS[gun].range);

export const silencedFor = (gun: GunId, perks: Partial<Record<Tier, PerkId>>): boolean =>
  (GUNS[gun].silenced ?? false) || Object.values(perks).some((perk) => PERK_MODS[perk].silenced ?? false);

export function effectiveStats(p: Player): Stats {
  const weapon = GUNS[p.gun];
  const armor = ARMORS[p.loadout.armor];
  const s: Stats = {
    speed: WORLD.baseSpeed * Math.max(LOAD_SPEED_FLOOR, weapon.moveMul * armor.speedMul),
    maxHp: WORLD.baseHp,
    mag: weapon.mag,
    range: rangeFor(p.gun, p.perks),
    reloadMs: reloadMsFor(p.gun, p.perks),
    regenPerSec: WORLD.regenPerSec,
    regenDelayMs: WORLD.regenDelayMs,
    viewRadius: WORLD.viewRadius * rulesOf(weapon).viewMul,
    piercing: false, silenced: silencedFor(p.gun, p.perks), shield: false, thermal: false, ghillie: false,
  };
  for (const perk of Object.values(p.perks)) {
    const m = PERK_MODS[perk];
    s.mag = Math.floor(s.mag * (m.magMul ?? 1));
    s.speed *= m.speedMul ?? 1;
    s.maxHp += m.maxHpAdd ?? 0;
    s.regenPerSec *= m.regenMul ?? 1;
    s.regenDelayMs *= m.regenDelayMul ?? 1;
    s.viewRadius *= m.viewMul ?? 1;
    s.piercing ||= m.piercing ?? false;
    s.shield ||= m.shield ?? false;
    s.thermal ||= m.thermal ?? false;
    s.ghillie ||= m.ghillie ?? false;
  }
  s.maxHp *= HP_MULTIPLIER[p.kind];
  s.regenPerSec *= HP_MULTIPLIER[p.kind];
  return s;
}

export function freshLife(p: Player, now: number): Extract<Life, { k: 'alive' }> {
  const s = effectiveStats(p);
  return {
    k: 'alive', hp: s.maxHp, ammo: s.mag, reloadUntil: null, nextFireAt: 0, burstLeft: 0, spray: 0, firedAt: -Infinity, spin: 0,
    lastDamageAt: -Infinity, lastMoveAt: now, shieldUntil: now + WORLD.spawnShieldMs, dash: null, pressUntil: -Infinity, hits: [],
    suppression: 0, suppressedAt: -Infinity,
  };
}

export function levelForScore(score: number): number {
  let level = 0;
  LEVELS.forEach((l, i) => { if (score >= l.score) level = i; });
  return level;
}

/** The lowest reached level whose pick is still open: a perk tier left empty, or an evolution the gun has not made. */
export function pendingPick(p: Player): PendingPick | null {
  let evolves = 0;
  for (let level = 1; level <= p.level; level++) {
    const pick = LEVELS[level]?.pick;
    if (!pick) continue;
    if (pick.k === 'perk' ? !p.perks[pick.tier] : GUNS[p.gun].stage < ++evolves) return { level, ...pick };
  }
  return null;
}

/** The hunt is a PvP pressure valve; a co-op squad has no one to hunt its own. */
export const isHunted = (w: World, p: Player): boolean => w.mode !== 'ZOM' && GUNS[p.gun].stage === 2;

export function abilityOf(p: Player): AbilityId | null {
  return p.perks[3] ?? null;
}

export function resetProgress(p: Player) {
  p.score = 0;
  p.level = 0;
  p.perks = {};
  p.gun = p.loadout.weapon;
  p.abilityReadyAt = 0;
}

/** An attachment the gun in hand cannot use, like a silencer on a silenced gun, is taken off so the tier-1 pick opens again on the gun's own menu. */
function reopenUselessAttachment(p: Player) {
  const attachment = p.perks[1];
  if (attachment && !pickOptions({ k: 'perk', tier: 1 }, p.gun).includes(attachment)) delete p.perks[1];
}

/** Applies `option` only when `level` is the pending pick and `option` is one of its options, so a repeated or stale pick changes nothing. */
export function choosePick(w: World, id: number, level: number, option: PickOption): boolean {
  const p = w.players.get(id);
  const pending = p && pendingPick(p);
  if (!p || p.life.k !== 'alive' || w.match.k === 'over' || pending?.level !== level || !pickOptions(pending, p.gun).includes(option)) return false;
  if (pending.k === 'perk') {
    if (!isPerkOfTier(pending.tier, option)) return false;
    const before = effectiveStats(p).maxHp;
    setPerk(p.perks, pending.tier, option);
    p.life.hp *= effectiveStats(p).maxHp / before;
    return true;
  }
  const gun = GUN_IDS.find((g) => g === option);
  if (!gun) return false;
  const oldMag = effectiveStats(p).mag;
  p.gun = gun;
  reopenUselessAttachment(p);
  p.life.ammo = Math.round((effectiveStats(p).mag * p.life.ammo) / oldMag);
  p.life.burstLeft = 0;
  p.life.spray = 0;
  p.life.spin = 0;
  if (isHunted(w, p)) w.queuedEvents.push({ e: 'hunted', id: p.id, name: p.name });
  return true;
}

function isPerkOfTier<T extends Tier>(tier: T, option: PickOption): option is PerkOfTier<T> {
  return PERK_TIERS[tier].some((candidate) => candidate === option);
}

function setPerk<T extends Tier>(perks: { [K in T]?: PerkOfTier<K> }, tier: T, perk: PerkOfTier<T>) {
  perks[tier] = perk;
}

function catchUpMul(w: World, p: Player): number {
  const others = [...w.players.values()].filter((o) => o.id !== p.id && o.life.k === 'alive');
  if (others.length === 0) return 1;
  const average = others.reduce((sum, o) => sum + o.level, 0) / others.length;
  return p.level < average ? WORLD.catchUpMul : 1;
}

export function addScore(w: World, p: Player, amount: number) {
  if (p.life.k !== 'alive') return;
  p.score += Math.round(amount * catchUpMul(w, p));
  p.level = Math.max(p.level, levelForScore(p.score));
}
