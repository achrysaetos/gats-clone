import { GUNS, type GunId, type WeaponId } from '../../shared/defs.ts';
import type { ZoneView } from '../../shared/protocol.ts';
import { TICK_MS } from './aim.ts';
import { doorLanes, openSpot, type BotArena } from './arena.ts';
import { BLIND_AT, type Perception, type Threat } from './awareness.ts';
import { sightBlocked } from '../../shared/sim/vision.ts';
import { coverNear, pickCover } from './cover.ts';
import { between, dist, isOpen, nearestOpenPoint, type Point } from './nav.ts';

export const PERSONALITY_IDS = ['aggressive', 'cautious', 'marksman'] as const;
export type PersonalityId = (typeof PERSONALITY_IDS)[number];

export type Personality = {
  rangeMul: number;
  retreatHp: number;
  healedHp: number;
  peekMs: readonly [number, number];
  hideMs: readonly [number, number];
  peekOdds: number;
  flankOdds: number;
  pushOdds: number;
  sidestepOdds: number;
  plantsFromCover: boolean;
  commitMul: number;
};

export const PERSONALITIES: Record<PersonalityId, Personality> = {
  aggressive: { rangeMul: 0.8, retreatHp: 0.1, healedHp: 0.35, peekMs: [1000, 1800], hideMs: [250, 500], peekOdds: 0.2, flankOdds: 0.5, pushOdds: 1, sidestepOdds: 0.8, plantsFromCover: false, commitMul: 0.8 },
  cautious: { rangeMul: 1, retreatHp: 0.2, healedHp: 0.45, peekMs: [700, 1200], hideMs: [500, 900], peekOdds: 0.4, flankOdds: 0.2, pushOdds: 0.85, sidestepOdds: 0.5, plantsFromCover: false, commitMul: 1.2 },
  marksman: { rangeMul: 1.15, retreatHp: 0.15, healedHp: 0.4, peekMs: [900, 1500], hideMs: [400, 800], peekOdds: 0.5, flankOdds: 0.1, pushOdds: 0.7, sidestepOdds: 0.2, plantsFromCover: true, commitMul: 1.3 },
};

const WEAPON_BAND: Record<WeaponId, Omit<Band, 'rushes' | 'hold'>> = {
  pistol: { headOn: 180, ideal: 320, max: 420 },
  smg: { headOn: 90, ideal: 250, max: 330 },
  shotgun: { headOn: 0, ideal: 150, max: 260 },
  assault: { headOn: 220, ideal: 380, max: 480 },
  sniper: { headOn: 420, ideal: 650, max: 840 },
  lmg: { headOn: 200, ideal: 340, max: 450 },
};

/** `hold` is the closest a gun that is not a rusher lets an enemy come before its bot backs off to fight from the band again. */
type Band = { headOn: number; ideal: number; max: number; hold: number; rushes: boolean };
const HOLD_OF_IDEAL = 0.5;
export const bandFor = (gun: GunId, p: Personality): Band => {
  const g = GUNS[gun];
  const b = WEAPON_BAND[g.base];
  const k = p.rangeMul * (g.range / GUNS[g.base].range);
  const rushes = g.pellets >= 5;
  return { headOn: b.headOn * k, ideal: b.ideal * k, max: b.max * k, hold: rushes ? 0 : Math.max(b.headOn, b.ideal * HOLD_OF_IDEAL) * k, rushes };
};

/** A number in [0, 1) that is the same for one bot every time, so a squad fans out the same way each time without spending the random stream. */
export const lane = (id: number, salt = 0): number => {
  const v = Math.sin((id + 1) * 12.9898 + salt * 78.233) * 43758.5453;
  return v - Math.floor(v);
};

type Role = 'anchor' | 'rotate';
export const roleFor = (id: number, team: string | null): Role | null => (team === null ? null : id % 3 === 0 ? 'anchor' : 'rotate');

export type Plan =
  | { k: 'patrol'; goal: Point }
  | { k: 'takePosition'; spot: Point; facing: Point }
  | { k: 'engage'; target: number }
  | { k: 'peekAndHide'; target: number; spot: Point; peek: Point; phase: 'hide' | 'peek'; phaseUntil: number }
  | { k: 'reloadInCover'; spot: Point; threat: Point }
  | { k: 'retreatAndHeal'; spot: Point | null; threat: Point }
  | { k: 'flank'; target: number; via: Point; lastKnown: Point }
  | { k: 'search'; at: Point; giveUpAt: number }
  /** Flashed: blind until it wears off. `spray` fires at where the enemy last was, `fallBack` backs away from it, `hold` stands its ground. */
  | { k: 'blinded'; mode: 'spray' | 'fallBack' | 'hold'; at: Point };

export type Intent = Plan & { since: number; holdUntil: number };
type IntentKind = Plan['k'];
type Of<K extends IntentKind> = Extract<Intent, { k: K }>;

export type IntentCtx = { tick: number; persona: Personality; role: Role | null; band: Band; arena: BotArena; rand: () => number; home?: { at: Point; r: number; face: Point } };

const MIN_COMMIT_MS: Record<IntentKind, number> = {
  patrol: 0, takePosition: 7000, engage: 1200, peekAndHide: 2500, reloadInCover: 0, retreatAndHeal: 3000, flank: 3500, search: 2500, blinded: 0,
};
const SEARCH_MS = 5000;
const GUNFIRE_PULL_PX = 2500;
const FLANK_MS = 8000;
const STALEMATE_MS = 6000;
const ARRIVED_PX = 60;
const COVER_REACH_PX = 320;
const RETREAT_REACH_PX = 600;
const CORNERED_PX = 220;
const FLEE_FROM_PX = CORNERED_PX + 60;
const OPEN_ESCAPE_PX = 500;
const OUTNUMBERED_BY = 2;
const OUTNUMBERED_HP = 0.5;
/** Mates this near count as backing a bot up when it weighs the odds. */
const BACKUP_PX = 450;
/** Where a squad spreads its errand goals: within this of the spot, fanned by lane to either side of the way in. */
const SPREAD_PX = 180;
const SPREAD_ARC = Math.PI * 0.9;
const ZONE_RING = 0.6;
/** Cover a mate already holds, or is next to, is not taken by a second bot: it picks one this far from every mate. */
const MATE_COVER_PX = 120;
const LOW_AMMO = 0.25;

const ticks = (ms: number) => Math.round(ms / TICK_MS);
const pos = (t: Threat): Point => ({ x: t.p.x, y: t.p.y });

const LOST_GRACE_MS = 500;
export const justLost = (v: Perception) => v.lastSeen !== null && (v.tick - v.lastSeen.seenTick) * TICK_MS < LOST_GRACE_MS;

export function startIntent(plan: Plan, c: IntentCtx): Intent {
  return { ...plan, since: c.tick, holdUntil: c.tick + ticks(MIN_COMMIT_MS[plan.k] * c.persona.commitMul) };
}

function hideFrom(v: Perception, c: IntentCtx, threat: Point): Point | null {
  const threats = v.threats.length ? v.threats.map(pos) : [threat];
  return pickCover(c.arena.cover, c.arena.nav, v.solids, v.me, threats, { reach: RETREAT_REACH_PX, range: 0, peek: false, taken: v.allies })?.spot ?? null;
}

/** A fight near a door is held from beside it: no cover in the door's lane, at either side of it. */
const DOOR_WATCH_PX = 500;

function peekPlan(v: Perception, c: IntentCtx, t: Threat): Plan | null {
  const taken = [...v.allies, ...doorLanes(c.arena, pos(t), DOOR_WATCH_PX)];
  const pick = pickCover(c.arena.cover, c.arena.nav, v.solids, v.me, [pos(t)], { reach: COVER_REACH_PX, range: c.band.ideal, peek: true, taken, takenPx: MATE_COVER_PX });
  if (!pick?.peek) return null;
  const travel = dist(v.me, pick.spot) / v.self.speed * 1000;
  return { k: 'peekAndHide', target: t.p.id, spot: pick.spot, peek: pick.peek, phase: 'hide', phaseUntil: c.tick + ticks(travel + between(c.persona.hideMs, c.rand)) };
}

/** The side of an enemy to flank round: +1 or -1 for the one holding fewer of this bot's mates, or null when they are even or there are none. */
function emptierSide(v: Perception, at: Point): 1 | -1 | null {
  const ux = v.me.x - at.x, uy = v.me.y - at.y;
  const lean = v.allies.reduce((sum, m) => (dist(m, v.me) < BACKUP_PX * 2 ? sum + Math.sign(ux * (m.y - at.y) - uy * (m.x - at.x)) : sum), 0);
  return lean === 0 ? null : lean > 0 ? -1 : 1;
}

/** A goal a squad shares (where gunfire was, where a foe was lost) is a ring each bot takes its own bit of, so they do not arrive in one file. */
function spreadGoal(v: Perception, c: IntentCtx, at: Point): Point {
  if (v.team === null || dist(v.me, at) < SPREAD_PX * 2) return at;
  const a = Math.atan2(v.me.y - at.y, v.me.x - at.x) + (lane(v.me.id) - 0.5) * SPREAD_ARC;
  const r = Math.min(SPREAD_PX, c.band.ideal * 0.6);
  const p = { x: at.x + Math.cos(a) * r, y: at.y + Math.sin(a) * r };
  return isOpen(c.arena.nav, p) ? p : nearestOpenPoint(c.arena.nav, p, 200) ?? at;
}

function flankPlan(v: Perception, c: IntentCtx, target: number, at: Point): Plan {
  const from = Math.atan2(v.me.y - at.y, v.me.x - at.x);
  const side = emptierSide(v, at) ?? (c.rand() < 0.5 ? 1 : -1);
  const a = from + side * (Math.PI / 2);
  const via = openSpot(c.arena, c.rand, { at: { x: at.x + Math.cos(a) * c.band.ideal, y: at.y + Math.sin(a) * c.band.ideal }, r: 120 });
  return { k: 'flank', target, via, lastKnown: at };
}

const searchPlan = (v: Perception, c: IntentCtx, lead: Point): Plan => {
  const at = spreadGoal(v, c, lead);
  return { k: 'search', at, giveUpAt: c.tick + ticks(SEARCH_MS + (dist(v.me, at) / v.self.speed) * 1000) };
};

function zoneToHold(v: Perception, c: IntentCtx): ZoneView | null {
  const owned = v.zones.filter((z) => z.owner === v.team), open = v.zones.filter((z) => z.owner !== v.team);
  const pool = c.role === 'anchor' ? (owned.length ? owned : v.zones) : open.length ? open : owned;
  return pool.reduce<ZoneView | null>((best, z) => (best && dist(best, v.me) <= dist(z, v.me) ? best : z), null);
}

function idlePlan(v: Perception, c: IntentCtx): Plan {
  if (c.home) {
    const spots = coverNear(c.arena.cover, c.home.at, c.home.r);
    return spots.length ? { k: 'takePosition', spot: spots[Math.floor(c.rand() * spots.length)]!, facing: c.home.face } : { k: 'patrol', goal: openSpot(c.arena, c.rand, c.home) };
  }
  const centre = { x: c.arena.size / 2, y: c.arena.size / 2 };
  const zone = zoneToHold(v, c);
  // Each bot holds its own stretch of the zone's ring (DOM pressure is spread round the point, not piled on it).
  if (zone) {
    const a = lane(v.me.id, 1) * Math.PI * 2, r = zone.r * ZONE_RING;
    return { k: 'takePosition', spot: openSpot(c.arena, c.rand, { at: { x: zone.x + Math.cos(a) * r, y: zone.y + Math.sin(a) * r }, r: 50 }), facing: centre };
  }
  if (v.lead && c.role !== 'anchor') return searchPlan(v, c, v.lead);
  if (c.role === 'anchor' || (v.weapon === 'sniper' && c.persona.rangeMul > 1)) {
    const free = (ps: readonly Point[]) => { const apart = ps.filter((q) => v.allies.every((m) => dist(m, q) >= MATE_COVER_PX)); return apart.length ? apart : ps; };
    const spots = free(coverNear(c.arena.cover, openSpot(c.arena, c.rand, { at: centre, r: c.arena.size / 4 }), 300));
    const spot = spots.length ? spots[Math.floor(c.rand() * spots.length)]! : openSpot(c.arena, c.rand, { at: centre, r: c.arena.size / 4 });
    return { k: 'takePosition', spot, facing: v.lead ?? centre };
  }
  return { k: 'patrol', goal: openSpot(c.arena, c.rand, c.rand() < 0.5 ? { at: centre, r: c.arena.size / 3 } : undefined) };
}

function lostSight(v: Perception, c: IntentCtx, target: number): Plan {
  const last = v.lastSeen;
  if (!last) return idlePlan(v, c);
  // It lost him in smoke: he is still there, but pushing into a cloud is walking blind, so it holds and waits for him to come out.
  if (sightBlocked(v.smokes, v.me.x, v.me.y, last.x, last.y)) return { k: 'takePosition', spot: v.me, facing: last };
  if (c.rand() < c.persona.flankOdds) return flankPlan(v, c, target, last);
  if (c.rand() < c.persona.pushOdds) return searchPlan(v, c, last);
  const taken = [...v.allies, ...doorLanes(c.arena, last, DOOR_WATCH_PX)];
  const spot = pickCover(c.arena.cover, c.arena.nav, v.solids, v.me, [last], { reach: COVER_REACH_PX, range: c.band.ideal, peek: false, taken, takenPx: MATE_COVER_PX })?.spot ?? v.me;
  return { k: 'takePosition', spot, facing: last };
}

const losing = (v: Perception, p: Personality) => {
  const lone = v.threats.length === 1 ? v.threats[0]!.p : null;
  const finishableLone = lone !== null && lone.hp / lone.maxHp < v.hpFrac;
  const backup = v.allies.filter((m) => dist(m, v.me) < BACKUP_PX).length;
  const outnumbered = v.threats.length >= backup + OUTNUMBERED_BY;
  return !finishableLone && (v.threats.length > 0 || v.underFire) && (v.hpFrac < p.retreatHp || (outnumbered && v.hpFrac < OUTNUMBERED_HP));
};

type Interrupt = (cur: Intent, v: Perception, c: IntentCtx) => Plan | null;

const fleeLosingFight: Interrupt = (cur, v, c) => {
  const near = v.threats[0];
  if (cur.k === 'retreatAndHeal' || !losing(v, c.persona) || (near && near.d < FLEE_FROM_PX)) return null;
  const threat = near ? pos(near) : v.lastSeen ?? v.me;
  const spot = hideFrom(v, c, threat);
  if (!spot && near && near.d < OPEN_ESCAPE_PX) return null;
  return { k: 'retreatAndHeal', spot, threat };
};

const turnOnPursuerOrRehide: Interrupt = (cur, v, c) => {
  const near = v.threats[0];
  if (cur.k !== 'retreatAndHeal' || !near) return null;
  if (near.d < CORNERED_PX) return { k: 'engage', target: near.p.id };
  if (!cur.spot || dist(v.me, cur.spot) > ARRIVED_PX) return null;
  const spot = hideFrom(v, c, pos(near));
  return spot && dist(spot, cur.spot) > ARRIVED_PX ? { k: 'retreatAndHeal', spot, threat: pos(near) } : null;
};

const reloadWhenDry: Interrupt = (cur, v, c) => {
  if (cur.k === 'reloadInCover' || cur.k === 'retreatAndHeal' || v.self.reloading || v.self.ammo > v.self.mag * LOW_AMMO) return null;
  const near = v.threats[0];
  const recent = v.lastSeen !== null && v.tick - v.lastSeen.seenTick < ticks(3000) ? v.lastSeen : null;
  const threat = near ? pos(near) : recent;
  if (!threat || (near && near.d < CORNERED_PX && v.self.ammo > 0)) return null;
  const spot = hideFrom(v, c, threat);
  return spot ? { k: 'reloadInCover', spot, threat } : null;
};

const engageOnSight: Interrupt = (cur, v) => {
  const calm = cur.k === 'patrol' || cur.k === 'takePosition' || cur.k === 'search' || cur.k === 'flank';
  const t = v.threats[0];
  if (!calm || !t) return null;
  if (cur.k === 'takePosition' && v.zones.length > 0 && t.d > 400) return null;
  return { k: 'engage', target: t.p.id };
};

const investigateGunfire: Interrupt = (cur, v, c) => {
  const idle = cur.k === 'patrol' || (cur.k === 'takePosition' && v.zones.length === 0);
  if (!idle || c.role === 'anchor' || !v.lead || v.lead.tick !== v.tick || dist(v.lead, v.me) > GUNFIRE_PULL_PX) return null;
  if (cur.k === 'takePosition' && dist(v.lead, cur.facing) < GUNFIRE_PULL_PX / 3) return null;
  return searchPlan(v, c, v.lead);
};

/** Flashed: what a person does with a white screen, by temperament: the aggressive spray where the enemy was, the careful back off, anyone with nothing to go on stands still. */
const goBlind: Interrupt = (cur, v, c) => {
  if (v.flash <= BLIND_AT || cur.k === 'blinded') return null;
  const known = v.lastSeen && v.tick - v.lastSeen.seenTick < ticks(4000) ? v.lastSeen : null;
  if (!known) return { k: 'blinded', mode: 'hold', at: v.me };
  const spray = c.rand() < (c.persona.pushOdds >= 1 ? 0.7 : c.persona.peekOdds >= 0.5 ? 0.15 : 0.35);
  return { k: 'blinded', mode: spray ? 'spray' : 'fallBack', at: known };
};

const INTERRUPTS: readonly Interrupt[] = [goBlind, fleeLosingFight, turnOnPursuerOrRehide, reloadWhenDry, engageOnSight, investigateGunfire];

const RULES: { [K in IntentKind]: (cur: Of<K>, v: Perception, c: IntentCtx) => Plan | null } = {
  patrol: (cur, v, c) => {
    const next = idlePlan(v, c);
    return next.k !== 'patrol' || dist(v.me, cur.goal) < ARRIVED_PX ? next : null;
  },
  takePosition: (_cur, v, c) => idlePlan(v, c),
  engage: (cur, v, c) => {
    const t = v.threats[0];
    if (!t) return justLost(v) ? null : lostSight(v, c, cur.target);
    if (c.band.rushes || t.d < c.band.headOn * 0.7 || c.rand() >= c.persona.peekOdds) return null;
    return peekPlan(v, c, t);
  },
  peekAndHide: (cur, v, c) => {
    const t = v.threats.find((x) => x.p.id === cur.target) ?? v.threats[0];
    if (t && t.d < c.band.headOn * 0.7) return { k: 'engage', target: t.p.id };
    // A mate got to this cover first: it takes another bit of the wall rather than standing on his shoulder.
    const crowded = v.allies.some((m) => dist(m, cur.spot) < MATE_COVER_PX * 0.75 && dist(m, cur.spot) < dist(v.me, cur.spot));
    if (crowded && t) return peekPlan(v, c, t);
    const at = t ? pos(t) : v.lastSeen;
    if (at && v.tick - cur.since === ticks(STALEMATE_MS) && c.rand() < c.persona.flankOdds) return flankPlan(v, c, cur.target, at);
    if (t || (v.lastSeen && v.tick - v.lastSeen.seenTick < ticks(2500))) return null;
    return lostSight(v, c, cur.target);
  },
  reloadInCover: (_cur, v, c) => {
    if (v.self.reloading || v.self.ammo < v.self.mag * 0.9) return null;
    const t = v.threats[0];
    return t ? { k: 'engage', target: t.p.id } : v.lastSeen ? searchPlan(v, c, v.lastSeen) : idlePlan(v, c);
  },
  retreatAndHeal: (cur, v, c) => {
    if (v.hpFrac >= c.persona.healedHp) return v.lastSeen && c.rand() < c.persona.pushOdds ? searchPlan(v, c, v.lastSeen) : idlePlan(v, c);
    if (!v.underFire) return null;
    const threat = v.threats[0] ? pos(v.threats[0]) : cur.threat;
    return { k: 'retreatAndHeal', spot: hideFrom(v, c, threat), threat };
  },
  flank: (cur, v, c) => {
    if (v.tick - cur.since > ticks(FLANK_MS) || dist(v.me, cur.via) < ARRIVED_PX) return searchPlan(v, c, cur.lastKnown);
    return null;
  },
  blinded: (cur, v, c) => {
    if (v.flash > BLIND_AT) return null;
    return cur.mode === 'spray' ? searchPlan(v, c, cur.at) : idlePlan(v, c);
  },
  search: (cur, v, c) => {
    if (v.lead && dist(v.lead, cur.at) > 300 && v.lead.tick === v.tick) return searchPlan(v, c, v.lead);
    return dist(v.me, cur.at) < ARRIVED_PX * 1.5 || v.tick > cur.giveUpAt ? idlePlan(v, c) : null;
  },
};

function advancePeekPhase(cur: Intent, v: Perception, c: IntentCtx): Intent {
  if (cur.k !== 'peekAndHide' || v.tick < cur.phaseUntil) return cur;
  const unansweredPeek = cur.phase === 'peek' && !v.underFire && v.threats.some((t) => t.p.id === cur.target);
  if (unansweredPeek) return cur;
  const phase = cur.phase === 'hide' ? 'peek' : 'hide';
  const ms = between(phase === 'peek' ? c.persona.peekMs : c.persona.hideMs, c.rand);
  return { ...cur, phase, phaseUntil: v.tick + ticks(ms) };
}

export function nextIntent(cur: Intent, v: Perception, c: IntentCtx): Intent {
  for (const rule of INTERRUPTS) {
    const plan = rule(cur, v, c);
    if (plan) return startIntent(plan, c);
  }
  if (c.tick < cur.holdUntil) return advancePeekPhase(cur, v, c);
  const plan = (RULES[cur.k] as (cur: Intent, v: Perception, c: IntentCtx) => Plan | null)(cur, v, c);
  return plan ? startIntent(plan, c) : advancePeekPhase(cur, v, c);
}
