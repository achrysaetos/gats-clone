import {
  ARMORS, GUN_IDS, GUNS, HP_MULTIPLIER, LEVELS, PERK_TIERS, pickOptions, WORLD, type AbilityId, type GunId, type PendingPick, type PerkId, type PickOption, type Tier,
} from '../defs.ts';
import type { Life, PerkOfTier, Player, World } from './world.ts';

type PerkMods = {
  spreadMul?: number; stillSpreadMul?: number; magMul?: number; rangeMul?: number; speedMul?: number;
  maxHpAdd?: number; regenMul?: number; regenDelayMul?: number; viewMul?: number;
  piercing?: true; silenced?: true; shield?: true; thermal?: true; ghillie?: true;
};

const PERK_MODS: Record<PerkId, PerkMods> = {
  bipod: { stillSpreadMul: 0.5 },
  optics: { viewMul: 1.3 },
  thermal: { thermal: true },
  ghillie: { ghillie: true },
  piercing: { piercing: true },
  extended: { magMul: 1.5 },
  grip: { spreadMul: 0.6 },
  silencer: { silenced: true },
  lightweight: { speedMul: 1.1 },
  longRange: { rangeMul: 1.4 },
  shield: { shield: true },
  thickSkin: { maxHpAdd: 40 },
  firstAid: { regenMul: 3, regenDelayMul: 0.4 },
  grenade: {}, fragGrenade: {}, gasGrenade: {}, landMine: {}, knife: {}, engineer: {}, dash: {},
};

type Stats = {
  speed: number; maxHp: number; maxArmor: number; mag: number; range: number; spread: number; regenPerSec: number; regenDelayMs: number;
  viewRadius: number; piercing: boolean; silenced: boolean; shield: boolean; thermal: boolean; ghillie: boolean;
};

/** Spread after Grip and Bipod; the client's reticle reads the same numbers. */
export function spreadFor(gun: GunId, perks: Partial<Record<Tier, PerkId>>, still: boolean): number {
  let spread = GUNS[gun].spread;
  for (const perk of Object.values(perks)) spread *= (PERK_MODS[perk].spreadMul ?? 1) * (still ? PERK_MODS[perk].stillSpreadMul ?? 1 : 1);
  return spread;
}

export function effectiveStats(p: Player, still = false): Stats {
  const weapon = GUNS[p.gun];
  const armor = ARMORS[p.loadout.armor];
  const s: Stats = {
    speed: WORLD.baseSpeed * weapon.moveMul * armor.speedMul,
    maxHp: WORLD.baseHp,
    maxArmor: armor.points,
    mag: weapon.mag,
    range: weapon.range,
    spread: spreadFor(p.gun, p.perks, still),
    regenPerSec: WORLD.regenPerSec,
    regenDelayMs: WORLD.regenDelayMs,
    viewRadius: WORLD.viewRadius,
    piercing: false, silenced: weapon.silenced ?? false, shield: false, thermal: false, ghillie: false,
  };
  for (const perk of Object.values(p.perks)) {
    const m = PERK_MODS[perk];
    s.mag = Math.round(s.mag * (m.magMul ?? 1));
    s.range *= m.rangeMul ?? 1;
    s.speed *= m.speedMul ?? 1;
    s.maxHp += m.maxHpAdd ?? 0;
    s.regenPerSec *= m.regenMul ?? 1;
    s.regenDelayMs *= m.regenDelayMul ?? 1;
    s.viewRadius *= m.viewMul ?? 1;
    s.piercing ||= m.piercing ?? false;
    s.silenced ||= m.silenced ?? false;
    s.shield ||= m.shield ?? false;
    s.thermal ||= m.thermal ?? false;
    s.ghillie ||= m.ghillie ?? false;
  }
  s.maxHp *= HP_MULTIPLIER[p.kind];
  s.regenPerSec *= HP_MULTIPLIER[p.kind];
  return s;
}

export function freshLife(p: Player, now: number): Life {
  const s = effectiveStats(p);
  return {
    k: 'alive', hp: s.maxHp, armor: s.maxArmor, ammo: s.mag, reloadUntil: null, nextFireAt: 0, burstLeft: 0,
    lastDamageAt: -Infinity, lastMoveAt: now, dash: null, pressUntil: -Infinity, damageBy: new Map(),
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

export const isHunted = (p: Player): boolean => GUNS[p.gun].stage === 2;

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

/** Applies `option` only when `level` is the pending pick and `option` is one of its options, so a repeated or stale pick changes nothing. */
export function choosePick(w: World, id: number, level: number, option: PickOption): boolean {
  const p = w.players.get(id);
  const pending = p && pendingPick(p);
  if (!p || p.life.k !== 'alive' || pending?.level !== level || !pickOptions(pending, p.gun).includes(option)) return false;
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
  p.life.ammo = Math.round((effectiveStats(p).mag * p.life.ammo) / oldMag);
  p.life.burstLeft = 0;
  if (isHunted(p)) w.queuedEvents.push({ e: 'hunted', id: p.id, name: p.name });
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
