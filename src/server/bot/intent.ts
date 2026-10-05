import type { WeaponId } from '../../shared/defs.ts';
import type { ZoneView } from '../../shared/protocol.ts';
import { TICK_MS } from './aim.ts';
import { openSpot, type BotArena } from './arena.ts';
import type { Perception, Threat } from './awareness.ts';
import { coverNear, pickCover } from './cover.ts';
import type { Point } from './nav.ts';

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

const WEAPON_BAND: Record<WeaponId, Band> = {
  pistol: { headOn: 180, ideal: 320, max: 420 },
  smg: { headOn: 90, ideal: 250, max: 330 },
  shotgun: { headOn: 0, ideal: 150, max: 260 },
  assault: { headOn: 220, ideal: 380, max: 480 },
  sniper: { headOn: 420, ideal: 650, max: 840 },
  lmg: { headOn: 200, ideal: 340, max: 450 },
};

type Band = { headOn: number; ideal: number; max: number };
export const bandFor = (weapon: WeaponId, p: Personality): Band => {
  const b = WEAPON_BAND[weapon];
  return { headOn: b.headOn * p.rangeMul, ideal: b.ideal * p.rangeMul, max: b.max * p.rangeMul };
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
  | { k: 'search'; at: Point; giveUpAt: number };

export type Intent = Plan & { since: number; holdUntil: number };
type IntentKind = Plan['k'];
type Of<K extends IntentKind> = Extract<Intent, { k: K }>;

export type IntentCtx = { tick: number; persona: Personality; role: Role | null; band: Band; arena: BotArena; rand: () => number };

const MIN_COMMIT_MS: Record<IntentKind, number> = {
  patrol: 0, takePosition: 7000, engage: 1200, peekAndHide: 2500, reloadInCover: 0, retreatAndHeal: 3000, flank: 3500, search: 2500,
};
const SEARCH_MS = 5000;
const GUNFIRE_PULL_PX = 2500;
const FLANK_MS = 8000;
const STALEMATE_MS = 6000;
const ARRIVED_PX = 60;
const COVER_REACH_PX = 320;
const RETREAT_REACH_PX = 600;
const CORNERED_PX = 220;
const OPEN_ESCAPE_PX = 500;
const OUTNUMBERED_BY = 2;
const OUTNUMBERED_HP = 0.3;
const LOW_AMMO = 0.25;

const ticks = (ms: number) => Math.round(ms / TICK_MS);
const between = (r: readonly [number, number], rand: () => number) => r[0] + rand() * (r[1] - r[0]);
const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const pos = (t: Threat): Point => ({ x: t.p.x, y: t.p.y });

export function startIntent(plan: Plan, c: IntentCtx): Intent {
  return { ...plan, since: c.tick, holdUntil: c.tick + ticks(MIN_COMMIT_MS[plan.k] * c.persona.commitMul) };
}

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

function flankPlan(v: Perception, c: IntentCtx, target: number, at: Point): Plan {
  const from = Math.atan2(v.me.y - at.y, v.me.x - at.x);
  const side = c.rand() < 0.5 ? 1 : -1;
  const a = from + side * (Math.PI / 2);
  const via = openSpot(c.arena, c.rand, { at: { x: at.x + Math.cos(a) * c.band.ideal, y: at.y + Math.sin(a) * c.band.ideal }, r: 120 });
  return { k: 'flank', target, via, lastKnown: at };
}

const searchPlan = (v: Perception, c: IntentCtx, at: Point): Plan => ({ k: 'search', at, giveUpAt: c.tick + ticks(SEARCH_MS + (dist(v.me, at) / v.self.speed) * 1000) });

function zoneToHold(v: Perception, c: IntentCtx): ZoneView | null {
  const owned = v.zones.filter((z) => z.owner === v.team), open = v.zones.filter((z) => z.owner !== v.team);
  const pool = c.role === 'anchor' ? (owned.length ? owned : v.zones) : open.length ? open : owned;
  return pool.reduce<ZoneView | null>((best, z) => (best && dist(best, v.me) <= dist(z, v.me) ? best : z), null);
}

function idlePlan(v: Perception, c: IntentCtx): Plan {
  const centre = { x: c.arena.size / 2, y: c.arena.size / 2 };
  const zone = zoneToHold(v, c);
  if (zone) return { k: 'takePosition', spot: openSpot(c.arena, c.rand, { at: zone, r: zone.r * 0.6 }), facing: centre };
  if (v.lead && c.role !== 'anchor') return searchPlan(v, c, v.lead);
  if (c.role === 'anchor' || (v.weapon === 'sniper' && c.persona.rangeMul > 1)) {
    const spots = coverNear(c.arena.cover, openSpot(c.arena, c.rand, { at: centre, r: c.arena.size / 4 }), 300);
    const spot = spots.length ? spots[Math.floor(c.rand() * spots.length)]! : openSpot(c.arena, c.rand, { at: centre, r: c.arena.size / 4 });
    return { k: 'takePosition', spot, facing: v.lead ?? centre };
  }
  return { k: 'patrol', goal: openSpot(c.arena, c.rand, c.rand() < 0.5 ? { at: centre, r: c.arena.size / 3 } : undefined) };
}

function lostSight(v: Perception, c: IntentCtx, target: number): Plan {
  const last = v.lastSeen;
  if (!last) return idlePlan(v, c);
  if (c.rand() < c.persona.flankOdds) return flankPlan(v, c, target, last);
  if (c.rand() < c.persona.pushOdds) return searchPlan(v, c, last);
  const spot = pickCover(c.arena.cover, c.arena.nav, v.solids, v.me, [last], { reach: COVER_REACH_PX, range: c.band.ideal, peek: false })?.spot ?? v.me;
  return { k: 'takePosition', spot, facing: last };
}

const losing = (v: Perception, p: Personality) => {
  const lone = v.threats.length === 1 ? v.threats[0]!.p : null;
  const finishableLone = lone !== null && lone.hp / lone.maxHp < v.hpFrac;
  const outnumbered = v.threats.length >= v.allies.length + OUTNUMBERED_BY;
  return !finishableLone && (v.threats.length > 0 || v.underFire) && (v.hpFrac < p.retreatHp || (outnumbered && v.hpFrac < OUTNUMBERED_HP));
};

type Interrupt = (cur: Intent, v: Perception, c: IntentCtx) => Plan | null;

const fleeLosingFight: Interrupt = (cur, v, c) => {
  const near = v.threats[0];
  if (cur.k === 'retreatAndHeal' || !losing(v, c.persona) || (near && near.d < CORNERED_PX)) return null;
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

const INTERRUPTS: readonly Interrupt[] = [fleeLosingFight, turnOnPursuerOrRehide, reloadWhenDry, engageOnSight, investigateGunfire];

const RULES: { [K in IntentKind]: (cur: Of<K>, v: Perception, c: IntentCtx) => Plan | null } = {
  patrol: (cur, v, c) => {
    const next = idlePlan(v, c);
    return next.k !== 'patrol' || dist(v.me, cur.goal) < ARRIVED_PX ? next : null;
  },
  takePosition: (_cur, v, c) => idlePlan(v, c),
  engage: (cur, v, c) => {
    const t = v.threats[0];
    if (!t) return lostSight(v, c, cur.target);
    if (v.weapon === 'shotgun' || t.d < c.band.headOn * 0.7 || c.rand() >= c.persona.peekOdds) return null;
    return peekPlan(v, c, t);
  },
  peekAndHide: (cur, v, c) => {
    const t = v.threats.find((x) => x.p.id === cur.target) ?? v.threats[0];
    if (t && t.d < c.band.headOn * 0.7) return { k: 'engage', target: t.p.id };
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
