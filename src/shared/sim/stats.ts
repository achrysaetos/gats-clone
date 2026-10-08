import {
  ABILITY_COOLDOWN_MS, ARMORS, GUN_IDS, LOAD_SPEED_FLOOR, SPRINT, SUPPRESSION, TIER2_OFFER, GUNS, HP_MULTIPLIER, LEVELS, PERK_TIERS, pickOptions, rulesOf, settleRulesOf, WORLD, type AbilityId, type GunId, type GunRules, type PendingPick, type PerkId, type PickOption, type Tier,
} from '../defs.ts';
import { rand, type Life, type PerkOfTier, type Player, type World } from './world.ts';

type PerkMods = {
  spreadMul?: number; pelletSpreadMul?: number; reloadMul?: number; magMul?: number; rangeMul?: number; speedMul?: number;
  maxHpAdd?: number; regenMul?: number; regenDelayMul?: number; viewMul?: number;
  /** Sprint speed, post-sprint settle length, spray bloom build and recovery rate, ability cooldown, all as multipliers. */
  sprintMul?: number; settleMul?: number; bloomBuildMul?: number; bloomRecoverMul?: number; cooldownMul?: number;
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
  marathon: { sprintMul: 1.15, settleMul: 0.5 },
  steadyHands: { bloomBuildMul: 0.6, bloomRecoverMul: 1.6, settleMul: 0.75 },
  secondWind: {}, adrenaline: {}, bloodlust: {}, ninja: {}, demolitions: {}, tracker: {}, brace: {},
  recon: { viewMul: 1.15 },
  overclock: { cooldownMul: 0.7 },
  fastHands: { reloadMul: 0.75 },
  grenade: {}, fragGrenade: {}, gasGrenade: {}, landMine: {}, knife: {}, engineer: {}, dash: {}, flashbang: {}, smokeGrenade: {},
};

/** Tuning for the perks that act on events rather than stats. */
export const PERK_RULES = {
  adrenaline: { speedMul: 1.2, ms: 3000 },
  secondWind: { belowHp: 0.25, speedMul: 1.3, ms: 2000, damageMul: 0.5 },
  bloodlust: { healShare: 0.15 },
  ninja: { revealMul: 0.5 },
  demolitions: { dealtMul: 1.3, radiusMul: 1.3, takenMul: 0.7 },
  tracker: { ms: 4000 },
  brace: { takenMul: 0.4, dealtMul: 1.15 },
} as const;

export const hasPerk = (p: Pick<Player, 'perks'>, perk: PerkId): boolean => Object.values(p.perks).includes(perk);

/** `settleMs`: how long the post-sprint settle takes to ease out once the gun is up (the gun's, after perks). */
type Stats = {
  speed: number; sprintSpeed: number; settleMs: number; maxHp: number; mag: number; range: number; reloadMs: number; regenPerSec: number; regenDelayMs: number;
  viewRadius: number; piercing: boolean; silenced: boolean; shield: boolean; thermal: boolean; ghillie: boolean;
};

/**
 * A bot's rounds leave its gun this much tighter than a person's would (spread, bloom and all), as its hands are already worse than a mouse:
 * a small edge so bots hold their own against people. Humans are unchanged; bot against bot both have it. Tune with `BOT_AIM.errMul` (aim.ts).
 */
export const BOT_SPREAD_MUL = 0.85;

/** Spread of the `sprayShot`th shot of a spray (0 outside one), on the move or `still`, after perks and `suppression`. */
export function spreadFor(gun: GunId, perks: Partial<Record<Tier, PerkId>>, still: boolean, sprayShot = 0, suppression = 0, settle = 0, deployed = false): number {
  const rules = rulesOf(GUNS[gun]);
  if (still && rules.pinpoint && suppression <= SUPPRESSION.breaksPinpoint && settle <= 0.05) return 0;
  const bloomBuild = Object.values(perks).reduce((m, perk) => m * (PERK_MODS[perk].bloomBuildMul ?? 1), 1);
  const planted = still && deployed && rules.deploy ? rules.deploy.spreadMul : 1;
  let spread = (still ? GUNS[gun].spread * planted : GUNS[gun].spread * rules.movingSpreadMul + rules.movingSpreadAdd) * bloomMul(rules, sprayShot, bloomBuild) * settleSpreadMul(settle, settleRulesOf(GUNS[gun]).mul);
  for (const perk of Object.values(perks)) spread *= (PERK_MODS[perk].spreadMul ?? 1) * (GUNS[gun].pellets > 1 ? PERK_MODS[perk].pelletSpreadMul ?? 1 : 1);
  return spread * suppressionMul(suppression);
}

/**
 * How much the post-sprint settle widens spread, `settle` being the share (0..1) still to ease out: `mul` (the gun's, see `settleRulesOf`) at 1,
 * easing out quadratically to 1 at 0. A share above 1 is the gun still coming up, and counts as 1.
 */
export const settleSpreadMul = (settle: number, mul: number = SPRINT.settleMul): number => 1 + (mul - 1) * Math.max(0, Math.min(1, settle)) ** 2;

/**
 * The post-sprint clock, `left` ms of it to run: the gun comes up over its first `raiseMs`, then the spread settles over the last `settleMs`.
 * Returns how long the gun is still down and the settle's share (0..1) still to ease out.
 */
export const postSprint = (left: number, settleMs: number): { raiseLeft: number; settle: number } =>
  ({ raiseLeft: Math.max(0, left - settleMs), settle: settleMs > 0 ? Math.max(0, Math.min(1, left / settleMs)) : 0 });

/** How fast spray bloom recovers, as a multiplier (Steady Hands). */
export const bloomRecoverMul = (perks: Partial<Record<Tier, PerkId>>): number => Object.values(perks).reduce((m, perk) => m * (PERK_MODS[perk].bloomRecoverMul ?? 1), 1);

/** How much `suppression` (0..1) widens spread. */
export const suppressionMul = (suppression: number): number => 1 + suppression * SUPPRESSION.spread;

function bloomMul({ bloom }: GunRules, sprayShot: number, build = 1): number {
  return bloom ? Math.min(bloom.maxMul, 1 + bloom.perShot * build * Math.max(0, sprayShot - bloom.free)) : 1;
}

/** Whether the gun has the still spread, `sinceMoveMs` after the last step (0 while walking). */
export const isSteady = (gun: GunId, sinceMoveMs: number): boolean => sinceMoveMs > 0 && sinceMoveMs >= rulesOf(GUNS[gun]).steadyMs;

/** Whether a gun with a `deploy` is planted, `sinceMoveMs` after the last step (0 while walking). */
export const isDeployed = (gun: GunId, sinceMoveMs: number): boolean => {
  const { deploy } = rulesOf(GUNS[gun]);
  return deploy !== null && sinceMoveMs > 0 && sinceMoveMs >= deploy.ms;
};

/** How much of its damage a round of `gun` keeps after flying `flownPx` (`GunRules.falloff`): 1 out to the fade's start, then down to its floor. */
export function falloffMul(gun: GunId, flownPx: number): number {
  const { falloff } = rulesOf(GUNS[gun]);
  if (!falloff || flownPx <= falloff.startPx) return 1;
  const k = Math.min(1, (flownPx - falloff.startPx) / Math.max(1, falloff.endPx - falloff.startPx));
  return 1 - (1 - falloff.minMul) * k;
}

export const reloadMsFor = (gun: GunId, perks: Partial<Record<Tier, PerkId>>): number =>
  Object.values(perks).reduce((ms, perk) => ms * (PERK_MODS[perk].reloadMul ?? 1), GUNS[gun].reloadMs);

/** The most any one perk stretches a gun's range. */
export const MAX_RANGE_MUL = Math.max(...Object.values(PERK_MODS).map((m) => m.rangeMul ?? 1));

export const rangeFor = (gun: GunId, perks: Partial<Record<Tier, PerkId>>): number =>
  Object.values(perks).reduce((range, perk) => range * (PERK_MODS[perk].rangeMul ?? 1), GUNS[gun].range);

export const silencedFor = (gun: GunId, perks: Partial<Record<Tier, PerkId>>): boolean =>
  (GUNS[gun].silenced ?? false) || Object.values(perks).some((perk) => PERK_MODS[perk].silenced ?? false);

/** Ability cooldown after perks (Overclock). */
export const abilityCooldownMs = (ability: AbilityId, perks: Partial<Record<Tier, PerkId>>): number =>
  Object.values(perks).reduce((ms, perk) => ms * (PERK_MODS[perk].cooldownMul ?? 1), ABILITY_COOLDOWN_MS[ability]);

/** The speed boost Adrenaline (after a kill) and Second Wind (under 25% health) are giving `p` now. */
export function rushMul(w: Pick<World, 'now'>, p: Player): number {
  const life = p.life;
  if (life.k !== 'alive') return 1;
  return (w.now < life.rushUntil ? PERK_RULES.adrenaline.speedMul : 1) * (w.now < life.windUntil ? PERK_RULES.secondWind.speedMul : 1);
}

/** Whether `input` sprints: held, moving and not firing. A press this tick also ends it (see `tickPlayer`). */
export const sprintWanted = (i: { sprint?: boolean; fire?: boolean; up?: boolean; down?: boolean; left?: boolean; right?: boolean }): boolean =>
  i.sprint === true && !i.fire && (!!i.right !== !!i.left || !!i.down !== !!i.up);

export function effectiveStats(p: Player): Stats {
  const weapon = GUNS[p.gun];
  const armor = ARMORS[p.loadout.armor];
  const s: Stats = {
    speed: WORLD.baseSpeed * Math.max(LOAD_SPEED_FLOOR, weapon.moveMul * armor.speedMul),
    sprintSpeed: 0,
    settleMs: settleRulesOf(weapon).ms,
    maxHp: WORLD.baseHp,
    mag: weapon.mag,
    range: rangeFor(p.gun, p.perks),
    reloadMs: reloadMsFor(p.gun, p.perks),
    regenPerSec: WORLD.regenPerSec,
    regenDelayMs: WORLD.regenDelayMs,
    viewRadius: WORLD.viewRadius * rulesOf(weapon).viewMul,
    piercing: false, silenced: silencedFor(p.gun, p.perks), shield: false, thermal: false, ghillie: false,
  };
  let sprintMul = 1 + (SPRINT.speedMul - 1) * rulesOf(weapon).sprintMul;
  for (const perk of Object.values(p.perks)) {
    const m = PERK_MODS[perk];
    s.mag = Math.floor(s.mag * (m.magMul ?? 1));
    s.speed *= m.speedMul ?? 1;
    sprintMul *= m.sprintMul ?? 1;
    s.settleMs *= m.settleMul ?? 1;
    s.maxHp += m.maxHpAdd ?? 0;
    s.regenPerSec *= m.regenMul ?? 1;
    s.regenDelayMs *= m.regenDelayMul ?? 1;
    s.viewRadius *= m.viewMul ?? 1;
    s.piercing ||= m.piercing ?? false;
    s.shield ||= m.shield ?? false;
    s.thermal ||= m.thermal ?? false;
    s.ghillie ||= m.ghillie ?? false;
  }
  s.sprintSpeed = s.speed * sprintMul;
  s.maxHp *= HP_MULTIPLIER[p.kind];
  s.regenPerSec *= HP_MULTIPLIER[p.kind];
  return s;
}

export function freshLife(p: Player, now: number): Extract<Life, { k: 'alive' }> {
  const s = effectiveStats(p);
  return {
    k: 'alive', hp: s.maxHp, ammo: s.mag, reloadUntil: null, nextFireAt: 0, burstLeft: 0, spray: 0, firedAt: -Infinity, spin: 0,
    lastDamageAt: -Infinity, lastMoveAt: now, shieldUntil: now + WORLD.spawnShieldMs, dash: null, knock: null, pressUntil: -Infinity, hits: [],
    suppression: 0, suppressedAt: -Infinity, golden: false,
    sprint: false, settleLeft: 0, raiseUntil: -Infinity, rushUntil: -Infinity, windUntil: -Infinity, windUsed: false, tracks: {},
  };
}

export function levelForScore(score: number): number {
  let level = 0;
  LEVELS.forEach((l, i) => { if (score >= l.score) level = i; });
  return level;
}

/** The lowest reached level whose pick is still open: a perk tier left empty, or an evolution the gun has not made. */
export function pendingPick(p: Player): PendingPick | null {
  // A gun evolve never waits behind a perk left unchosen: the new gun is offered first, then the perks in ladder order.
  let evolves = 0, perk: PendingPick | null = null;
  for (let level = 1; level <= p.level; level++) {
    const pick = LEVELS[level]?.pick;
    if (!pick) continue;
    if (pick.k === 'evolve') { if (GUNS[p.gun].stage < ++evolves) return { level, ...pick }; }
    else if (!p.perks[pick.tier]) perk ??= { level, ...pick, ...(pick.tier === 2 && p.tier2Offer.length > 0 && { offer: p.tier2Offer }) };
  }
  return perk;
}

/** The hunt is a PvP pressure valve; a co-op squad has no one to hunt its own. */
export const isHunted = (w: World, p: Player): boolean => w.mode !== 'ZOM' && w.mode !== 'RNG' && GUNS[p.gun].stage === 2;

export function abilityOf(p: Player): AbilityId | null {
  return p.perks[3] ?? null;
}

/** `TIER2_OFFER` of the tier-2 pool, drawn with the world's rng so a replay offers the same perks, listed in pool order. */
export function drawTier2Offer(w: World): PerkId[] {
  const pool = [...PERK_TIERS[2]] as PerkId[];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand(w) * (i + 1));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  const keep = new Set(pool.slice(0, TIER2_OFFER));
  return PERK_TIERS[2].filter((perk) => keep.has(perk));
}

export function resetProgress(p: Player, w: World) {
  p.tier2Offer = drawTier2Offer(w);
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
  p.life.ammo = hasPerk(p, 'fastHands') ? effectiveStats(p).mag : Math.round((effectiveStats(p).mag * p.life.ammo) / oldMag);
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
