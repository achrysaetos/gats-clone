import type { WeaponId } from '../../shared/defs.ts';
import type { ZoneView } from '../../shared/protocol.ts';
import { TICK_MS } from './aim.ts';
import { openSpot, type BotArena } from './arena.ts';
import type { Perception, Threat } from './awareness.ts';
import { coverNear, pickCover } from './cover.ts';
import type { Point } from './nav.ts';

export const PERSONALITY_IDS = ['aggressive', 'cautious', 'marksman'] as const;
export type PersonalityId = (typeof PERSONALITY_IDS)[number];

/** How one kind of bot leans. Every threshold a bot fights by comes from here and from WEAPON_BAND. */
export type Personality = {
  /** Scales the weapon's fight band: below 1 fights closer. */
  rangeMul: number;
  /** Breaks off below this share of health while threatened, and comes back only at `healedHp`, so it does not flip at the line. */
  retreatHp: number;
  healedHp: number;
  /** How long it stays out on a peek and tucked in between peeks. */
  peekMs: readonly [number, number];
  hideMs: readonly [number, number];
  /** Odds of fighting from cover when a target is in sight, of flanking a target that went behind cover, and of chasing where it was last seen rather than waiting for it. */
  peekOdds: number;
  flankOdds: number;
  pushOdds: number;
  /** Odds of taking one committed side step after each spell of standing to shoot. */
  sidestepOdds: number;
  /** Scales how long it sticks with an intent before reconsidering. */
  commitMul: number;
};

export const PERSONALITIES: Record<PersonalityId, Personality> = {
  aggressive: { rangeMul: 0.8, retreatHp: 0.25, healedHp: 0.6, peekMs: [1000, 1800], hideMs: [250, 500], peekOdds: 0.35, flankOdds: 0.5, pushOdds: 0.9, sidestepOdds: 0.8, commitMul: 0.8 },
  cautious: { rangeMul: 1, retreatHp: 0.4, healedHp: 0.8, peekMs: [700, 1200], hideMs: [500, 900], peekOdds: 0.9, flankOdds: 0.2, pushOdds: 0.45, sidestepOdds: 0.5, commitMul: 1.2 },
  marksman: { rangeMul: 1.15, retreatHp: 0.35, healedHp: 0.75, peekMs: [900, 1500], hideMs: [400, 800], peekOdds: 0.8, flankOdds: 0.1, pushOdds: 0.3, sidestepOdds: 0.2, commitMul: 1.3 },
};

/** Where each class likes to fight from, in px: inside `min` it backs off, beyond `max` it closes in, and it settles round `ideal`. */
export const WEAPON_BAND: Record<WeaponId, { min: number; ideal: number; max: number }> = {
  pistol: { min: 180, ideal: 340, max: 500 },
  smg: { min: 90, ideal: 240, max: 380 },
  shotgun: { min: 0, ideal: 150, max: 260 },
  assault: { min: 220, ideal: 420, max: 580 },
  sniper: { min: 400, ideal: 700, max: 1000 },
  lmg: { min: 200, ideal: 400, max: 560 },
};

export type Band = { min: number; ideal: number; max: number };
export const bandFor = (weapon: WeaponId, p: Personality): Band => {
  const b = WEAPON_BAND[weapon];
  return { min: b.min * p.rangeMul, ideal: b.ideal * p.rangeMul, max: b.max * p.rangeMul };
};

/** In TDM and DOM an anchor holds ground (an owned zone, or the middle) and a rotator moves to where the fight is (a zone to take, gunfire). */
export type Role = 'anchor' | 'rotate';
export const roleFor = (id: number, team: string | null): Role | null => (team === null ? null : id % 3 === 0 ? 'anchor' : 'rotate');

export type Plan =
  | { k: 'patrol'; goal: Point }
  | { k: 'takePosition'; spot: Point; facing: Point }
  | { k: 'engage'; target: number }
  | { k: 'peekAndHide'; target: number; spot: Point; peek: Point; phase: 'hide' | 'peek'; phaseUntil: number }
  | { k: 'reloadInCover'; spot: Point; threat: Point }
  | { k: 'retreatAndHeal'; spot: Point | null; threat: Point }
  | { k: 'flank'; target: number; via: Point; lastKnown: Point }
  | { k: 'search'; at: Point; giveUpAt: number };

/** Every intent carries when it began and the tick before which ordinary rules may not replace it; only startIntent builds one. */
export type Intent = Plan & { since: number; holdUntil: number };
export type IntentKind = Plan['k'];
type Of<K extends IntentKind> = Extract<Intent, { k: K }>;

export type IntentCtx = { tick: number; persona: Personality; role: Role | null; band: Band; arena: BotArena; rand: () => number };

const MIN_COMMIT_MS: Record<IntentKind, number> = {
  patrol: 0, takePosition: 7000, engage: 1200, peekAndHide: 2500, reloadInCover: 0, retreatAndHeal: 3000, flank: 3500, search: 2500,
};
const SEARCH_MS = 9000;
const FLANK_MS = 8000;
/** A peek duel still going after this long is a stalemate, which a bot may break by going round. */
const STALEMATE_MS = 6000;
const ARRIVED_PX = 60;
const COVER_REACH_PX = 320;
const RETREAT_REACH_PX = 600;
/** An enemy this close is fought rather than run from, since turning away only gives it a back to shoot. */
const CORNERED_PX = 220;
/** With no cover in reach, a bot only runs from an enemy this far off, which it can hope to break sight with. */
const OPEN_ESCAPE_PX = 500;
/** Two more enemies in sight than teammates make a fight worth leaving at this much health, not just at the personality's line. */
const OUTNUMBERED_HP = 0.65;
const LOW_AMMO = 0.25;

const ticks = (ms: number) => Math.round(ms / TICK_MS);
const between = (r: readonly [number, number], rand: () => number) => r[0] + rand() * (r[1] - r[0]);
const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const pos = (t: Threat): Point => ({ x: t.p.x, y: t.p.y });

export function startIntent(plan: Plan, c: IntentCtx): Intent {
  return { ...plan, since: c.tick, holdUntil: c.tick + ticks(MIN_COMMIT_MS[plan.k] * c.persona.commitMul) };
}

/** The spot furthest from the threat among cover hiding the bot from every enemy in sight, or a step straight away when there is none. */
function hideFrom(v: Perception, c: IntentCtx, threat: Point): Point | null {
  const threats = v.threats.length ? v.threats.map(pos) : [threat];
  return pickCover(c.arena.cover, c.arena.nav, v.solids, v.me, threats, { reach: RETREAT_REACH_PX, range: 0, peek: false, taken: v.allies })?.spot ?? null;
}

function peekPlan(v: Perception, c: IntentCtx, t: Threat): Plan | null {
  const pick = pickCover(c.arena.cover, c.arena.nav, v.solids, v.me, [pos(t)], { reach: COVER_REACH_PX, range: c.band.ideal, peek: true, taken: v.allies });
  if (!pick?.peek) return null;
  const travel = dist(v.me, pick.spot) / v.self.speed * 1000;
  return { k: 'peekAndHide', target: t.p.id, spot: pick.spot, peek: pick.peek, phase: 'hide', phaseUntil: c.tick + ticks(travel + between(c.persona.hideMs, c.rand)) };
}

/** A point beside the target's last known spot, a quarter turn round from the bot, so the bot comes at it from a new angle. */
function flankPlan(v: Perception, c: IntentCtx, target: number, at: Point): Plan {
  const from = Math.atan2(v.me.y - at.y, v.me.x - at.x);
  const side = c.rand() < 0.5 ? 1 : -1;
  const a = from + side * (Math.PI / 2);
  const via = openSpot(c.arena, c.rand, { at: { x: at.x + Math.cos(a) * c.band.ideal, y: at.y + Math.sin(a) * c.band.ideal }, r: 120 });
  return { k: 'flank', target, via, lastKnown: at };
}

const searchPlan = (c: IntentCtx, at: Point): Plan => ({ k: 'search', at, giveUpAt: c.tick + ticks(SEARCH_MS) });

function zoneToHold(v: Perception, c: IntentCtx): ZoneView | null {
  const owned = v.zones.filter((z) => z.owner === v.team), open = v.zones.filter((z) => z.owner !== v.team);
  const pool = c.role === 'anchor' ? (owned.length ? owned : v.zones) : open.length ? open : owned;
  return pool.reduce<ZoneView | null>((best, z) => (best && dist(best, v.me) <= dist(z, v.me) ? best : z), null);
}

/** Where a bot with nothing in sight goes next: a zone its role cares about, a lead, a held middle, or a walk. */
function idlePlan(v: Perception, c: IntentCtx): Plan {
  const centre = { x: c.arena.size / 2, y: c.arena.size / 2 };
  const zone = zoneToHold(v, c);
  if (zone) return { k: 'takePosition', spot: openSpot(c.arena, c.rand, { at: zone, r: zone.r * 0.6 }), facing: centre };
  if (v.lead && c.role !== 'anchor') return searchPlan(c, v.lead);
  if (c.role === 'anchor' || (v.weapon === 'sniper' && c.persona.rangeMul > 1)) {
    const spots = coverNear(c.arena.cover, openSpot(c.arena, c.rand, { at: centre, r: c.arena.size / 4 }), 300);
    const spot = spots.length ? spots[Math.floor(c.rand() * spots.length)]! : openSpot(c.arena, c.rand, { at: centre, r: c.arena.size / 4 });
    return { k: 'takePosition', spot, facing: v.lead ?? centre };
  }
  return { k: 'patrol', goal: openSpot(c.arena, c.rand, c.rand() < 0.5 ? { at: centre, r: c.arena.size / 3 } : undefined) };
}

/** What a fight that went quiet turns into: a flank, a push on where they were, or a wait in cover. */
function lostSight(v: Perception, c: IntentCtx, target: number): Plan {
  const last = v.lastSeen;
  if (!last) return idlePlan(v, c);
  if (c.rand() < c.persona.flankOdds) return flankPlan(v, c, target, last);
  if (c.rand() < c.persona.pushOdds) return searchPlan(c, last);
  const spot = pickCover(c.arena.cover, c.arena.nav, v.solids, v.me, [last], { reach: COVER_REACH_PX, range: c.band.ideal, peek: false })?.spot ?? v.me;
  return { k: 'takePosition', spot, facing: last };
}

/** Low or outnumbered while threatened, unless the one enemy in sight is worse off, which is a kill to finish rather than a fight to leave. */
const losing = (v: Perception, p: Personality) => {
  const lone = v.threats.length === 1 ? v.threats[0]!.p : null;
  if (lone && lone.hp / lone.maxHp < v.hpFrac) return false;
  return (v.threats.length > 0 || v.underFire) && (v.hpFrac < p.retreatHp || (v.threats.length >= v.allies.length + 2 && v.hpFrac < OUTNUMBERED_HP));
};

/** Checked every think, in order, whatever the commitment: a losing fight, a retreat caught up with or found in its hiding spot, an empty gun in a fight, and an enemy walking into view. */
const INTERRUPTS: readonly ((cur: Intent, v: Perception, c: IntentCtx) => Plan | null)[] = [
  (cur, v, c) => {
    const near = v.threats[0];
    if (cur.k === 'retreatAndHeal' || !losing(v, c.persona) || (near && near.d < CORNERED_PX)) return null;
    const threat = near ? pos(near) : v.lastSeen ?? v.me;
    const spot = hideFrom(v, c, threat);
    if (!spot && near && near.d < OPEN_ESCAPE_PX) return null;
    return { k: 'retreatAndHeal', spot, threat };
  },
  (cur, v, c) => {
    const near = v.threats[0];
    if (cur.k !== 'retreatAndHeal' || !near) return null;
    if (near.d < CORNERED_PX) return { k: 'engage', target: near.p.id };
    if (!cur.spot || dist(v.me, cur.spot) > ARRIVED_PX) return null;
    const spot = hideFrom(v, c, pos(near));
    return spot && dist(spot, cur.spot) > ARRIVED_PX ? { k: 'retreatAndHeal', spot, threat: pos(near) } : null;
  },
  (cur, v, c) => {
    if (cur.k === 'reloadInCover' || cur.k === 'retreatAndHeal' || v.self.reloading) return null;
    const fighting = v.threats.length > 0 || (v.lastSeen !== null && v.tick - v.lastSeen.seenTick < ticks(3000));
    if (!fighting || v.self.ammo > v.self.mag * LOW_AMMO) return null;
    const near = v.threats[0];
    if (near && near.d < CORNERED_PX && v.self.ammo > 0) return null;
    const threat = near ? pos(near) : v.lastSeen!;
    const spot = hideFrom(v, c, threat);
    return spot ? { k: 'reloadInCover', spot, threat } : null;
  },
  (cur, v) => {
    const calm = cur.k === 'patrol' || cur.k === 'takePosition' || cur.k === 'search' || cur.k === 'flank';
    const t = v.threats[0];
    if (!calm || !t) return null;
    if (cur.k === 'takePosition' && v.zones.length > 0 && t.d > 400) return null;
    return { k: 'engage', target: t.p.id };
  },
];

/** The one transition table: what each intent becomes once its commitment is up, or null to carry on. */
const RULES: { [K in IntentKind]: (cur: Of<K>, v: Perception, c: IntentCtx) => Plan | null } = {
  patrol: (cur, v, c) => {
    const next = idlePlan(v, c);
    return next.k !== 'patrol' || dist(v.me, cur.goal) < ARRIVED_PX ? next : null;
  },
  takePosition: (_cur, v, c) => idlePlan(v, c),
  engage: (cur, v, c) => {
    const t = v.threats[0];
    if (!t) return lostSight(v, c, cur.target);
    if (v.weapon === 'shotgun' || t.d < c.band.min * 0.7 || c.rand() >= c.persona.peekOdds) return null;
    return peekPlan(v, c, t);
  },
  peekAndHide: (cur, v, c) => {
    const t = v.threats.find((x) => x.p.id === cur.target) ?? v.threats[0];
    if (t && t.d < c.band.min * 0.7) return { k: 'engage', target: t.p.id };
    const at = t ? pos(t) : v.lastSeen;
    if (at && v.tick - cur.since === ticks(STALEMATE_MS) && c.rand() < c.persona.flankOdds) return flankPlan(v, c, cur.target, at);
    if (t || (v.lastSeen && v.tick - v.lastSeen.seenTick < ticks(2500))) return null;
    return lostSight(v, c, cur.target);
  },
  reloadInCover: (_cur, v, c) => {
    if (v.self.reloading || v.self.ammo < v.self.mag * 0.9) return null;
    const t = v.threats[0];
    return t ? { k: 'engage', target: t.p.id } : v.lastSeen ? searchPlan(c, v.lastSeen) : idlePlan(v, c);
  },
  retreatAndHeal: (cur, v, c) => {
    if (v.hpFrac >= c.persona.healedHp) return v.lastSeen && c.rand() < c.persona.pushOdds ? searchPlan(c, v.lastSeen) : idlePlan(v, c);
    if (!v.underFire) return null;
    const threat = v.threats[0] ? pos(v.threats[0]) : cur.threat;
    return { k: 'retreatAndHeal', spot: hideFrom(v, c, threat), threat };
  },
  flank: (cur, v, c) => {
    if (v.tick - cur.since > ticks(FLANK_MS) || dist(v.me, cur.via) < ARRIVED_PX) return searchPlan(c, cur.lastKnown);
    return null;
  },
  search: (cur, v, c) => {
    if (v.lead && dist(v.lead, cur.at) > 300 && v.lead.tick === v.tick) return searchPlan(c, v.lead);
    return dist(v.me, cur.at) < ARRIVED_PX * 1.5 || v.tick > cur.giveUpAt ? idlePlan(v, c) : null;
  },
};

/** Changes inside an intent that are not transitions: a peek's hide and peek phases taking turns. */
function tend(cur: Intent, v: Perception, c: IntentCtx): Intent {
  if (cur.k !== 'peekAndHide' || v.tick < cur.phaseUntil) return cur;
  // Out on a peek that nobody is answering, a bot keeps shooting until it is shot at or loses sight.
  if (cur.phase === 'peek' && !v.underFire && v.threats.some((t) => t.p.id === cur.target)) return cur;
  const phase = cur.phase === 'hide' ? 'peek' : 'hide';
  const ms = between(phase === 'peek' ? c.persona.peekMs : c.persona.hideMs, c.rand);
  return { ...cur, phase, phaseUntil: v.tick + ticks(ms) };
}

/**
 * The single transition function. Interrupts first; then, once the current intent's commitment is up, its row in RULES.
 * Returns `cur` unchanged when nothing fires, so a bot sticks with what it is doing.
 */
export function nextIntent(cur: Intent, v: Perception, c: IntentCtx): Intent {
  for (const rule of INTERRUPTS) {
    const plan = rule(cur, v, c);
    if (plan) return startIntent(plan, c);
  }
  if (c.tick < cur.holdUntil) return tend(cur, v, c);
  const plan = (RULES[cur.k] as (cur: Intent, v: Perception, c: IntentCtx) => Plan | null)(cur, v, c);
  return plan ? startIntent(plan, c) : tend(cur, v, c);
}
