import { GUNS, rulesOf, WORLD, type AbilityId, type GunId } from '../../shared/defs.ts';
import { DEFAULT_VIEW_ASPECT, viewExtents, type CrateView, type InputState, type Snapshot } from '../../shared/protocol.ts';
import { FLASH, GRENADE_FUSE_MS } from '../../shared/sim/abilities.ts';
import { KNIFE_LUNGE, KNIFE_REACH, segmentBlocked, type Rect } from '../../shared/sim/movement.ts';
import { aimAndTrigger, aimSigma, bearingSpin, drift, engage, freshAim, GRENADES, handFor, HANDS, intercept, landingErr, MUZZLE_PX, sharpnessAgainst, TICK_MS, type AimState, type Engagement, type Look } from './aim.ts';
import { doorCentre, takeReplan, type BotArena } from './arena.ts';
import { swingArcAt } from '../../shared/sim/doors.ts';
import { barrelToShoot, seenBarrels, shotWouldBurnMe } from './barrels.ts';
import { hazardState, hazardsOf, propToShoot, seenProps, shotWouldHurtMe } from './props.ts';
import { BLIND_AT, focus, type Perception, type Threat } from './awareness.ts';
import { sightBlocked } from '../../shared/sim/vision.ts';
import { justLost, lane, type Intent, type IntentCtx } from './intent.ts';
import { between, clearShot, dist, findPath, isOpen, walkable, type Point } from './nav.ts';
import { boltCue, DODGE_AT, dangerTo, dodgeLeg, dodgeStyle, nextDodge, weave, type Dodge, type DodgeStyle } from './evade.ts';

export type Motor = {
  route: { goal: Point; points: readonly Point[]; version: number; partial: boolean } | null;
  dir: number | null;
  dirSince: number;
  pace: { lastDir: number | null; lastTurnBackTick: number };
  stance: { step: 0 | 1 | -1; since: number; until: number; heading: number | null; planted: boolean };
  last: Point;
  stuckTicks: number;
  /** Where the bot last made real headway, and when, with its walk left then and whether it has run into anything since; see `CRAWL`. */
  progress: { x: number; y: number; tick: number; left: number; rubbed: boolean };
  /** A sidestep at right angles to the way it wants to go, held until `until`, round something the nav grid does not hold. */
  detour: { side: 1 | -1; until: number } | null;
  /** A squad bot's next step toward its errand, kept a while so two equal ways round a turret never flip it side to side. */
  siegeStep: { to: Point; at: Point; tick: number; kite: boolean } | null;
  /** Where a squad bot is tending, kept so it finishes a job it has started instead of leaving at the threshold that sent it. */
  tending: Point | null;
  engaged: Engagement | null;
  engagedSeen: number;
  aim: AimState | null;
  shots: number;
  /** Burst-tapping (see `tapRhythm`): when the current tap began and until when the trigger is let go. */
  tap?: { since: number | null; pauseUntil: number };
  /** Getting off a long gun's line of fire (see evade.ts): the current leg, or null when nothing worth dodging has it in its sights. */
  dodge?: Dodge | null;
};

export const freshMotor = (): Motor => ({
  route: null, dir: null, dirSince: 0, pace: { lastDir: null, lastTurnBackTick: -Infinity }, stance: { step: 0, since: 0, until: 0, heading: null, planted: true }, last: { x: 0, y: 0 }, stuckTicks: 0, progress: { x: 0, y: 0, tick: 0, left: Infinity, rubbed: false }, detour: null, siegeStep: null, tending: null, engaged: null, engagedSeen: -Infinity, aim: null, shots: 0,
});

/** What a bot weighs when deciding whether its ability helps right now. `threat` is the enemy it is fighting, once its reaction delay has passed. */
export type Situation = {
  threat: { d: number } | null; hurting: boolean; underFire: boolean; onContestedZone: boolean;
  /** An enemy it saw lately but cannot see now (behind a corner or in cover), and how far off he was. */
  lastKnown?: { d: number } | null;
};

/** Lunge plus reach, leaving the target's radius as slack so a strafing target is still caught. */
const KNIFE_REACH_PX = KNIFE_LUNGE + KNIFE_REACH;
const throwRange = (s: Situation) => s.threat !== null && s.threat.d >= 150 && s.threat.d <= 450;

export const ABILITY_RULES: Record<AbilityId, (s: Situation) => boolean> = {
  knife: (s) => s.threat !== null && s.threat.d <= KNIFE_REACH_PX,
  grenade: throwRange,
  fragGrenade: throwRange,
  gasGrenade: throwRange,
  // A flash thrown at the enemy lands past its own reach, so only the target is caught: at a visible enemy, or at the corner or cover an unseen one went to.
  flashbang: (s) => [s.threat, s.lastKnown].some((t) => t && t.d >= FLASH.radius + 20 && t.d <= 480),
  // Smoke is a screen to back off behind: thrown at the enemy's side of a bot that is hurting or under his fire.
  smokeGrenade: (s) => s.threat !== null && s.threat.d >= 120 && (s.hurting || s.underFire),
  landMine: (s) => (s.hurting && s.threat !== null) || s.onContestedZone,
  dash: (s) => s.hurting && s.threat !== null,
  engineer: (s) => s.underFire && s.threat !== null && s.threat.d >= 200 && s.threat.d <= 500,
};

export const HURTING_HP_FRAC = 0.4;
const KNIFE_CHASE_PX = 300;
/** A smoke grenade is thrown this far toward the enemy, so the cloud blooms over the bot and the ground between. */
const SMOKE_THROW_PX = 100;
const REACQUIRE_TICKS = Math.round(600 / TICK_MS);
/** Leaving a sprint keeps the gun down for `SPRINT.raiseMs`, so a bot only breaks into one after this long out of any fight (no flicking it on and off at the edge of one). */
const SPRINT_CALM_TICKS = Math.round(3000 / TICK_MS);
const RETREAT_STEP = 240 + WORLD.playerRadius;
const WAYPOINT_PX = 16;
const ARRIVED_PX = 14;
const MIN_HOLD_TICKS = 3;
const HOLD_SLACK = (35 * Math.PI) / 180;
const STUCK_TICKS = 12;
const BLOCKED_TICKS = 3;
const REPLAN_PX = 48;
const NEAR_GOAL_PX = 300;
const MAX_EXPANSIONS = 6000;
/**
 * A bot pressing its keys that has made no headway (see `headway`) within `ticks` is crawling along a wall: the per-tick
 * stuck count misses it, since sliding a pixel along the wall reads as gaining on the waypoint. Its route is
 * then replanned with no search budget, which finds the way round when a far goal outran the budgeted search; and since
 * crates are not in the nav grid, it also sidesteps at right angles for `detourTicks`, alternating sides each time.
 */
const CRAWL = { px: 60, ticks: 30, detourTicks: 24 } as const;
const STAND_MS: readonly [number, number] = [700, 1500];
const STEP_MS: readonly [number, number] = [300, 700];
const UNDER_FIRE_STEP_ODDS = 0.75;
const STRAFE_MS: readonly [number, number] = [450, 1000];
const STRAFE_PX = 120;
/** A strafe leg that would end this near a mate is flipped the other way, so a pair side by side do not pile into one spot. */
const MATE_CLEAR_PX = 90;
/** Mates closer than this push a bot's goal away from them, softly (full push at touching, none at this range). */
const MATE_SPACE_PX = 150;
const MATE_SHOVE_PX = 260;
const MATE_SHOVE_MIN = 0.35;
/** Enemies within this of a bot are a crowd, and each one past the first widens the distance it holds. */
const CROWD_PX = 400;
const CROWD_HOLD = 0.5;
const PEEK_SWAY_PX = 70;
const SWAY_PAUSE_MS: readonly [number, number] = [100, 250];
export const MIN_TURN_BACK_MS = 400;
const MIN_LEG_TICKS = Math.round(MIN_TURN_BACK_MS / TICK_MS);

const crateRect = (c: CrateView): Rect => ({ x: c.x, y: c.y, w: c.size, h: c.size });
const anyKey = (k: Pick<InputState, 'up' | 'down' | 'left' | 'right'>) => k.up || k.down || k.left || k.right;

function retreatHeading(me: Point, away: number, arena: BotArena): number {
  const headings = Array.from({ length: 8 }, (_, i) => (i * Math.PI) / 4)
    .filter((h) => Math.cos(h - away) > 0)
    .sort((a, b) => Math.cos(b - away) - Math.cos(a - away));
  const clear = headings.find((h) => {
    const dx = Math.cos(h) * RETREAT_STEP, dy = Math.sin(h) * RETREAT_STEP;
    const ex = me.x + dx, ey = me.y + dy, r = WORLD.playerRadius;
    if (ex < r || ey < r || ex > arena.size - r || ey > arena.size - r) return false;
    return !segmentBlocked(arena.walls, me.x, me.y, dx, dy) && !segmentBlocked(arena.barrels, me.x, me.y, dx, dy);
  });
  return clear ?? headings[0] ?? away;
}

function awayFrom(me: Point, threat: Point, arena: BotArena, step: number): Point {
  const h = retreatHeading(me, Math.atan2(me.y - threat.y, me.x - threat.x), arena);
  return { x: me.x + Math.cos(h) * step, y: me.y + Math.sin(h) * step };
}

/** The nearest crate centre in sight, in range and in the clear, so a bot with nobody to fight still earns score. */
function crateInSight(me: Point, crates: readonly CrateView[], walls: readonly Rect[], range: number, sight: { halfW: number; halfH: number }): Point | null {
  let best: Point | null = null, bestD = Infinity;
  for (const c of crates) {
    const at = { x: c.x + c.size / 2, y: c.y + c.size / 2 };
    const d = dist(at, me);
    if (d > range || d >= bestD || Math.abs(at.x - me.x) > sight.halfW || Math.abs(at.y - me.y) > sight.halfH) continue;
    if (!clearShot([...walls, ...crates.filter((o) => o.id !== c.id).map(crateRect)], me, at)) continue;
    best = at;
    bestD = d;
  }
  return best;
}

type Steer = { to: Point | null; face: Point | null; reload: boolean; crates: boolean };

const LOOK_HOLD_INSIDE_PX = 150;
const LOOK_AHEAD_PX = 400;

function lookAt(at: Point | null, me: Point, mine: Point, minPx = LOOK_HOLD_INSIDE_PX): { want: number; spin: number; d: number } | null {
  if (!at || dist(at, me) < Math.max(1, minPx)) return null;
  const rx = at.x - me.x, ry = at.y - me.y;
  return { want: Math.atan2(ry, rx), spin: bearingSpin(rx, ry, -mine.x, -mine.y), d: dist(at, me) };
}

function routeAhead(me: Point, route: Motor['route']): Point | null {
  let from = me, left = LOOK_AHEAD_PX;
  for (const p of route?.points ?? []) {
    const d = dist(from, p);
    if (d >= left) return { x: from.x + ((p.x - from.x) * left) / d, y: from.y + ((p.y - from.y) * left) / d };
    left -= d;
    from = p;
  }
  return from === me ? null : from;
}

/** A planted LMG is an easy target up close, where strafing wins, so it settles in only once the fight is past half its reach. */
function plants(v: Perception, c: IntentCtx, d: number, fromCover: boolean): boolean {
  if (c.persona.plantsFromCover && fromCover && d >= c.band.ideal) return true;
  const gun = GUNS[v.me.gun];
  const { plant } = rulesOf(gun);
  return plant === 'always' || (plant === 'atRange' && d >= gun.range / 2);
}

/**
 * Burst-tapping: an assault-class gun's bloom starts after its first few rounds, so its bot lets go after that many and takes the gun back to
 * rest before it fires again, instead of holding a spray that drifts off the target (from `TAP_FROM_PX` out; closer, the cone swallows any bloom). A rusher or a machine gun hoses.
 */
export const TAP_FROM_PX = 280;
export function tapRhythm(gun: GunId, rushes: boolean): { windowMs: number; pauseMs: number } | null {
  const def = GUNS[gun];
  const { bloom } = rulesOf(def);
  if (!bloom || bloom.free > 4 || rushes) return null;
  const perRound = def.burst ? ((def.burst.count - 1) * def.burst.gapMs + def.fireMs) / def.burst.count : def.fireMs;
  return { windowMs: bloom.free * perRound - 1, pauseMs: bloom.settleMs + 0.6 * bloom.recoverMs };
}

function nextStance(m: Motor, v: Perception, c: IntentCtx, planted: boolean, legMs: readonly [number, number] = STRAFE_MS): Motor['stance'] {
  const age = v.tick - m.stance.since;
  if (planted === m.stance.planted ? v.tick < m.stance.until : age < MIN_LEG_TICKS) return m.stance;
  const legFor = (step: Motor['stance']['step'], ms: readonly [number, number]) => ({ step, since: v.tick, until: v.tick + Math.max(MIN_LEG_TICKS, Math.round(between(ms, c.rand) / TICK_MS)), heading: null, planted });
  if (!planted) return legFor(m.stance.step === 0 ? (c.rand() < 0.5 ? 1 : -1) : (-m.stance.step as 1 | -1), legMs);
  const odds = v.underFire ? Math.max(UNDER_FIRE_STEP_ODDS, c.persona.sidestepOdds) : c.persona.sidestepOdds;
  const step = m.stance.step === 0 && c.rand() < odds ? (c.rand() < 0.5 ? 1 : -1) : 0;
  return legFor(step, step === 0 ? STAND_MS : STEP_MS);
}

/** A strafe leg's heading round `at`: closing in (45 degrees off head-on), side on (90), or backing off (135, back and sideways). */
type Leg = 'in' | 'side' | 'out';
const LEG_ANGLE: Record<Leg, number> = { in: Math.PI / 4, side: Math.PI / 2, out: (3 * Math.PI) / 4 };

function legHeading(me: Point, at: Point, step: 1 | -1, leg: Leg): number {
  const a = Math.atan2(at.y - me.y, at.x - me.x) + step * LEG_ANGLE[leg];
  return Math.round(a / (Math.PI / 4)) * (Math.PI / 4);
}

function legPoint(me: Point, heading: number, arena: BotArena, mates: readonly Point[] = []): Point | null {
  const p = { x: me.x + Math.cos(heading) * STRAFE_PX, y: me.y + Math.sin(heading) * STRAFE_PX };
  return isOpen(arena.nav, p) && walkable(arena.nav, me, p) && !mates.some((m) => dist(m, p) < MATE_CLEAR_PX && dist(m, p) < dist(m, me)) ? p : null;
}

/** Which way the mates crowding a bot would have it step: the sum of their pushes, each strongest when touching, or null when none is near. */
function shove(me: Point, mates: readonly Point[], id: number): Point | null {
  let x = 0, y = 0;
  for (const m of mates) {
    const d = dist(m, me);
    if (d >= MATE_SPACE_PX) continue;
    // Two bots on one pixel part along each one's own lane, so they do not both pick the same way.
    const [ux, uy] = d < 1 ? [Math.cos(lane(id, 2) * Math.PI * 2), Math.sin(lane(id, 2) * Math.PI * 2)] : [(me.x - m.x) / d, (me.y - m.y) / d];
    const k = 1 - d / MATE_SPACE_PX;
    x += ux * k; y += uy * k;
  }
  const len = Math.hypot(x, y);
  return len === 0 ? null : { x: x / Math.max(1, len), y: y / Math.max(1, len) };
}

function steer(intent: Intent, v: Perception, c: IntentCtx, m: Motor, readyAbility: AbilityId | null, dodge: Dodge | null, danger: Point | null): { steer: Steer; stance: Motor['stance']; dodge?: Dodge | null } {
  const me = v.me;
  const idle = (to: Point | null, face: Point | null): Steer => ({ to, face, reload: false, crates: true });
  switch (intent.k) {
    case 'patrol': return { steer: idle(intent.goal, null), stance: m.stance };
    case 'takePosition': return { steer: idle(intent.spot, intent.facing), stance: m.stance };
    case 'search': return { steer: { to: intent.at, face: intent.at, reload: false, crates: false }, stance: m.stance };
    case 'blinded': {
      const to = intent.mode === 'fallBack' ? awayFrom(me, intent.at, c.arena, RETREAT_STEP) : null;
      return { steer: { to, face: intent.mode === 'hold' ? null : intent.at, reload: v.self.ammo < v.self.mag / 2 && intent.mode !== 'spray', crates: false }, stance: m.stance };
    }
    case 'flank': return { steer: { to: intent.via, face: intent.lastKnown, reload: false, crates: false }, stance: m.stance };
    case 'peekAndHide': {
      const t = focus(v, intent.target);
      const face = t ? t.p : v.lastSeen ?? intent.peek;
      const reload = intent.phase === 'hide' && !t && v.self.ammo < v.self.mag;
      const peeking = (to: Point, stance: Motor['stance']) => ({ steer: { to, face, reload, crates: false }, stance });
      if (intent.phase === 'hide') return peeking(intent.spot, m.stance);
      const crossMs = (PEEK_SWAY_PX / v.self.speed) * 1000;
      const stance = nextStance(m, v, c, plants(v, c, t?.d ?? 0, true), [crossMs + SWAY_PAUSE_MS[0], crossMs + SWAY_PAUSE_MS[1]]);
      if (stance.step === 0) return peeking(intent.peek, stance);
      const out = Math.atan2(intent.peek.y - intent.spot.y, intent.peek.x - intent.spot.x);
      const wide = { x: intent.peek.x + Math.cos(out) * PEEK_SWAY_PX, y: intent.peek.y + Math.sin(out) * PEEK_SWAY_PX };
      return peeking(stance.step === 1 && isOpen(c.arena.nav, wide) ? wide : intent.peek, stance);
    }
    case 'reloadInCover': {
      const safe = v.threats.length === 0 || dist(me, intent.spot) < WAYPOINT_PX * 2;
      return { steer: { to: intent.spot, face: intent.threat, reload: safe || v.self.ammo === 0, crates: false }, stance: m.stance };
    }
    case 'retreatAndHeal': {
      const to = intent.spot ?? awayFrom(me, intent.threat, c.arena, RETREAT_STEP);
      return { steer: { to, face: v.threats[0]?.p ?? intent.threat, reload: v.threats.length === 0 && v.self.ammo < v.self.mag, crates: false }, stance: m.stance };
    }
    case 'engage': {
      const t = focus(v, intent.target);
      if (!t) {
        const leg = justLost(v) && m.stance.heading !== null ? legPoint(me, m.stance.heading, c.arena) : null;
        return { steer: { to: leg ?? (justLost(v) ? null : v.lastSeen), face: v.lastSeen, reload: false, crates: false }, stance: m.stance };
      }
      const fight = (to: Point | null): Steer => ({ to, face: t.p, reload: false, crates: false });
      if (readyAbility === 'knife' && t.d < KNIFE_CHASE_PX) return { steer: fight(t.p), stance: m.stance };
      const closing = t.d > c.band.max || (c.band.rushes && t.d > c.band.ideal);
      // It holds its gun's range: with an enemy inside it (more of them, further out) it backs off while it fires, rather than trading at arm's length.
      const crowd = v.threats.filter((x) => x.d < CROWD_PX).length;
      const backing = !c.band.rushes && t.d < c.band.hold * (1 + CROWD_HOLD * Math.min(2, Math.max(0, crowd - 1)));
      const leg: Leg = closing ? 'in' : backing ? 'out' : 'side';
      // In a long gun's sights (or a planted gun between its own shots): it runs its dodge legs across his line instead of its usual strafe.
      if (dodge && (danger || !closing && !backing)) {
        const from = closing || backing || !danger ? t.p : danger;
        const run = dodgeLeg(me, from, dodge, leg, c.arena, v.solids, v.tick);
        const stance = { ...m.stance, step: run.to ? run.dodge.side : 0, heading: run.heading, planted: dodge.stop } as Motor['stance'];
        return { steer: fight(run.to ?? (closing && !dodge.stop ? t.p : null)), stance, dodge: run.dodge };
      }
      const stance = nextStance(m, v, c, !closing && !backing && plants(v, c, t.d, false));
      const step = stance.step;
      if (step === 0) return { steer: fight(null), stance };
      let heading = stance.heading ?? legHeading(me, t.p, step, leg);
      if (backing && Math.cos(heading - Math.atan2(t.p.y - me.y, t.p.x - me.x)) > 0.2) heading = legHeading(me, t.p, step, 'out');
      const ahead = legPoint(me, heading, c.arena, v.allies);
      if (ahead) return { steer: fight(ahead), stance: { ...stance, heading } };
      const back = step === 1 ? -1 : 1;
      const turned = legHeading(me, t.p, back, leg);
      const until = v.tick + Math.round(between(STRAFE_MS, c.rand) / TICK_MS);
      return { steer: fight(legPoint(me, turned, c.arena, v.allies) ?? (closing ? t.p : null)), stance: { ...stance, step: back, heading: turned, since: v.tick, until } };
    }
  }
}

/** Intents that travel, which weave under long-range fire (see `weave`); cover, a retreat and a peek go straight. */
const WEAVES = new Set<Intent['k']>(['patrol', 'takePosition', 'search', 'flank', 'engage']);

/** Intents that wander or travel, which a mate's shadow may bend; a held spot, cover or a retreat is never moved off. */
const SPACED = new Set<Intent['k']>(['patrol', 'takePosition', 'search', 'flank', 'engage']);

/**
 * Soft separation: a bot with mates inside `MATE_SPACE_PX` steers a step away from them, so a squad does not stack in a
 * doorway or on one line of travel. Only as a bend of where it is already going (or a step apart when it stands still),
 * and only onto ground it can walk to; at a spot it is holding it stays put.
 */
function spaced(intent: Intent, me: Point & { id: number }, at: Point | null, to: Point | null, mates: readonly Point[], arena: BotArena): Point | null {
  if (!SPACED.has(intent.k) || mates.length === 0) return at;
  if (to && at && intent.k !== 'engage' && dist(me, to) < MATE_SPACE_PX) return at;
  if (intent.k !== 'engage' && doorTurn(me, at, mates, arena)) return me;
  const push = shove(me, mates, me.id);
  if (!push || (!at && Math.hypot(push.x, push.y) < MATE_SHOVE_MIN)) return at;
  const base = at ?? me;
  const k = Math.hypot(push.x, push.y);
  const bent = { x: base.x + push.x * MATE_SHOVE_PX, y: base.y + push.y * MATE_SHOVE_PX };
  return k > 0 && isOpen(arena.nav, bent) && walkable(arena.nav, me, bent) ? bent : at;
}

/** How far past a swing leaf's reach a spot it moves out of its sweep lands. */
const SWING_CLEAR_PX = 16;

/**
 * A spot to make for is never in the sweep of a swing door that stands open: a body there stops the leaf where it touches
 * it (leaves never crush), so a bot parked there holds the door half open and whoever pushed it is left pressing into the
 * leaf. The spot moves just out of the sweep, straight back from the door or else away from the hinge, onto open ground.
 */
function clearOfSwings(to: Point, doors: Snapshot['doors'], arena: BotArena): Point {
  const r = WORLD.playerRadius;
  for (const [i, open, sign] of doors ?? []) {
    const d = arena.doors[i];
    const h = d && open > 0 ? swingArcAt(d, sign, to, r) : null;
    if (!d || !h) continue;
    const reach = h.len + r + SWING_CLEAR_PX;
    const ux = d.axis === 'h' ? 1 : 0, uy = 1 - ux, nx = uy * sign, ny = ux * sign;
    const along = (to.x - h.x) * ux + (to.y - h.y) * uy, back = (to.x - h.x) * nx + (to.y - h.y) * ny;
    const k = Math.hypot(to.x - h.x, to.y - h.y) || 1, push = Math.sqrt(Math.max(0, reach * reach - along * along)) - back;
    const out = [{ x: to.x + nx * push, y: to.y + ny * push }, { x: h.x + ((to.x - h.x) / k) * reach, y: h.y + ((to.y - h.y) / k) * reach }]
      .find((p) => p.x > r && p.y > r && p.x < arena.size - r && p.y < arena.size - r && isOpen(arena.nav, p));
    if (out) return out;
  }
  return to;
}

const DOOR_QUEUE_PX = 150;
const DOOR_CLEAR_PX = 110;
const LEVEL_PX = 8;

/** Whether `c` lies close to the straight way from `a` to `b` (and not behind `a`). */
function onTheWay(a: Point, b: Point, c: Point): boolean {
  const dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy;
  if (len2 < 1) return false;
  const t = ((c.x - a.x) * dx + (c.y - a.y) * dy) / len2;
  return t > 0 && dist(c, { x: a.x + dx * Math.min(1, t), y: a.y + dy * Math.min(1, t) }) < DOOR_QUEUE_PX * 0.5;
}

/**
 * Clearing a room: a bot heading through a door a mate is already at the door of waits its turn instead of stacking in the
 * doorway behind him. Once it is itself in the doorway it carries on, so nobody stalls there.
 */
function doorTurn(me: Point, at: Point | null, mates: readonly Point[], arena: BotArena): boolean {
  if (!at) return false;
  for (const d of arena.doors) {
    const c = doorCentre(d), mine = dist(me, c);
    if (!onTheWay(me, at, c) || mine < DOOR_CLEAR_PX || mine > DOOR_QUEUE_PX * 3) continue;
    // Whoever is nearer the door goes first; level, the one standing further west (then north) does, so two never both wait.
    const first = (m: Point) => { const dm = dist(m, c); return dm < mine - LEVEL_PX || (dm <= mine + LEVEL_PX && (m.x < me.x || (m.x === me.x && m.y < me.y))); };
    if (mates.some((m) => dist(m, c) < DOOR_QUEUE_PX && first(m))) return true;
  }
  return false;
}

function plan(arena: BotArena, me: Point, to: Point, budget = MAX_EXPANSIONS): NonNullable<Motor['route']> {
  const found = findPath(arena.nav, me, to, budget);
  const last = found?.[found.length - 1];
  return { goal: to, points: found ?? [to], version: arena.version, partial: last !== undefined && dist(last, to) > WAYPOINT_PX };
}

function nextWaypoint(m: Motor, me: Point, to: Point, arena: BotArena, tick: number, crawling = false): { at: Point; route: Motor['route']; replanned: boolean } {
  const old = m.route;
  if (crawling) {
    const route = plan(arena, me, to, Infinity);
    const points = route.partial ? route.points : [...route.points.slice(0, -1), to];
    return { at: points[0]!, route: { ...route, points }, replanned: true };
  }
  const wallsMoved = old !== null && old.version !== arena.version && !walkable(arena.nav, me, old.points[0] ?? to);
  const partEnded = old !== null && old.partial && dist(me, old.points[old.points.length - 1]!) < WAYPOINT_PX * 2;
  const wanted = !old || wallsMoved || partEnded || dist(old.goal, to) > REPLAN_PX || m.stuckTicks > STUCK_TICKS;
  const fresh = wanted && (!old || takeReplan(arena, tick));
  const route = fresh || !old ? plan(arena, me, to) : { ...old, version: arena.version };
  const tail = route.partial ? route.points : [...route.points.slice(0, -1), to];
  let points = dist(me, to) < NEAR_GOAL_PX && walkable(arena.nav, me, to) ? [to] : tail;
  while (points.length > 1 && dist(me, points[0]!) < WAYPOINT_PX) points = points.slice(1);
  return { at: points[0]!, route: { ...route, points }, replanned: fresh };
}

/**
 * Real headway since `m.progress`: its walk left shrank by `CRAWL.px` (or grew by it: a fresh, longer route starts the count
 * again), or, so long as it has not run into anything since, it got `CRAWL.px` away (a strafe or a dodge goes nowhere along
 * its route). Sliding to and fro along a wall or a half-open door leaf covers ground too, but it rubs, and gets no nearer.
 */
const headway = (m: Motor, me: Point, left: number) =>
  Math.abs(m.progress.left - left) > CRAWL.px || (!m.progress.rubbed && dist(me, m.progress) > CRAWL.px);

/** How far the bot still has to walk along its route; Infinity with none. */
function routeLeft(me: Point, route: Motor['route']): number {
  if (!route?.points.length) return Infinity;
  let left = dist(me, route.points[0]!);
  for (let i = 1; i < route.points.length; i++) left += dist(route.points[i - 1]!, route.points[i]!);
  return left;
}

const sidestepOctant = (stuckTicks: number) =>
  stuckTicks < 2 * BLOCKED_TICKS ? 0 : Math.floor((stuckTicks - 2 * BLOCKED_TICKS) / MIN_LEG_TICKS) % 2 ? -1 : 1;

type Drive = { keys: Pick<InputState, 'up' | 'down' | 'left' | 'right'>; dir: number | null; dirSince: number; pace: Motor['pace'] };

const octantGap = (a: number, b: number) => Math.min((a - b + 8) % 8, (b - a + 8) % 8);

function keysToward(m: Motor, me: Point, at: Point | null, tick: number): Drive {
  const none = { up: false, down: false, left: false, right: false };
  if (!at || dist(me, at) < ARRIVED_PX) return { keys: none, dir: null, dirSince: tick, pace: m.pace };
  const want = Math.atan2(at.y - me.y, at.x - me.x);
  const octant = ((Math.round(want / (Math.PI / 4)) % 8) + 8) % 8;
  const off = m.dir === null ? Infinity : Math.abs(Math.atan2(Math.sin(want - (m.dir * Math.PI) / 4), Math.cos(want - (m.dir * Math.PI) / 4)));
  const blocked = m.stuckTicks >= BLOCKED_TICKS;
  const hold = !blocked && m.dir !== null && (off < HOLD_SLACK || (tick - m.dirSince < MIN_HOLD_TICKS && off < Math.PI / 2));
  const detour = m.detour && tick < m.detour.until ? m.detour.side * 2 : 0;
  const dir = detour ? (octant + detour + 8) % 8 : hold && m.dir !== null ? m.dir : (octant + sidestepOctant(m.stuckTicks) + 8) % 8;
  const turnsBack = m.pace.lastDir !== null && octantGap(dir, m.pace.lastDir) >= 3;
  if (turnsBack && tick - m.pace.lastTurnBackTick < MIN_LEG_TICKS) return { keys: none, dir: null, dirSince: tick, pace: m.pace };
  const a = (dir * Math.PI) / 4, cx = Math.cos(a), cy = Math.sin(a);
  return {
    keys: { up: cy < -0.38, down: cy > 0.38, left: cx < -0.38, right: cx > 0.38 }, dir, dirSince: hold ? m.dirSince : tick,
    pace: { lastDir: dir, lastTurnBackTick: turnsBack ? tick : m.pace.lastTurnBackTick },
  };
}

export function act(intent: Intent, v: Perception, c: IntentCtx, m: Motor, snap: Snapshot): { input: InputState; motor: Motor } {
  const me = v.me;
  const readyAbility = snap.self.abilityReadyIn === 0 ? snap.self.ability : null;
  const fighting = intent.k === 'engage' ? focus(v, intent.target) : undefined;
  const danger = dangerTo(v, m.engaged);
  // Out of a fight (on its way somewhere, the shooter maybe out of sight) any gun just weaves; in one, it dodges the way its gun fights.
  const style: DodgeStyle = fighting ? dodgeStyle(me.gun, c.band.rushes && fighting.d > c.band.ideal) : { k: 'zigzag' };
  // A slow plant-to-aim gun in a fight moves off its spot after each shot whatever it faces; anyone else dodges only a gun worth dodging.
  const dodging = (danger !== null && danger.w * c.persona.evasion >= DODGE_AT) || (style.k === 'plant' && fighting !== undefined && plants(v, c, fighting.d, false));
  const fired = snap.events.some((e) => e.e === 'shot' && e.owner === me.id);
  const dangerAt = danger && danger.w * c.persona.evasion >= DODGE_AT ? danger : null;
  const cue = dangerAt && v.shotAt?.owner === dangerAt.id ? boltCue(v.shotAt, me) : null;
  const dodgeNow = dodging ? nextDodge(m.dodge ?? null, v.tick, c, style, fired, v.self.reloading, cue) : null;
  const steered = steer(intent, v, c, m, readyAbility, dodgeNow, dangerAt);
  const { steer: s, stance } = steered;
  const dodge = steered.dodge !== undefined ? steered.dodge : dodgeNow;
  const crawling = m.dir !== null && v.tick - m.progress.tick > CRAWL.ticks;
  // Out of an open swing door's sweep, whether making for a spot or standing still (see `clearOfSwings`).
  const off = clearOfSwings(s.to ?? me, snap.doors, c.arena);
  const to = s.to ? off : off !== me ? off : null;
  const routed = to ? nextWaypoint(m, me, to, c.arena, v.tick, crawling) : { at: null, route: m.route, replanned: false };
  const bent = spaced(intent, me, routed.at, to, v.allies, c.arena);
  // On its way somewhere with a long gun shooting at it from afar: it zig-zags there rather than walking his lane.
  const weaving = dodge && dangerAt && bent && WEAVES.has(intent.k) && !(intent.k === 'engage' && fighting);
  const way = { ...routed, at: weaving ? weave(me, bent, dodge, c.arena, v.solids) : bent };
  const detour = crawling ? { side: (m.detour?.side === 1 ? -1 : 1) as 1 | -1, until: v.tick + CRAWL.detourTicks } : m.detour;
  const drive = keysToward({ ...m, detour }, me, way.at, v.tick);
  const gained = way.at ? dist(m.last, way.at) - dist(me, way.at) : 0;
  const pressing = drive.dir !== null;
  const left = routeLeft(me, way.route);
  const gun = GUNS[me.gun];

  const t: Threat | undefined = intent.k === 'engage' || intent.k === 'peekAndHide' || intent.k === 'flank' ? focus(v, intent.target) : v.threats[0];
  const aimSurvivesCover = (id: number) => intent.k === 'peekAndHide' && intent.target === id;
  const held = (id: number) => m.engaged?.id === id && (v.tick - m.engagedSeen <= REACQUIRE_TICKS || aimSurvivesCover(id));
  let engaged = t ? null : m.engaged && held(m.engaged.id) ? m.engaged : null;
  const before = m.aim ?? freshAim(me.angle);
  const mine = m.aim ? { x: (me.x - m.last.x) * WORLD.tickHz, y: (me.y - m.last.y) * WORLD.tickHz } : { x: 0, y: 0 };
  const idle = lookAt(s.face ?? v.lastSeen ?? v.lead ?? routeAhead(me, way.route), me, mine);
  let look: Look = { ...(idle ?? { want: before.want, spin: 0, d: 300 }), hand: HANDS.calm, err: before.err };
  const barrels = seenBarrels(snap.barrels);
  const props = seenProps(snap.props);
  let wantsFire = false;
  let threat: Situation['threat'] = null;
  let throwAt: { x: number; y: number; err: number } | null = null;
  if (t) {
    const tracked = held(t.p.id) ? m.engaged : null;
    const sharp = sharpnessAgainst(t.p);
    engaged = engage(tracked, t.p, sharp, v.tick, c.rand, v.flash);
    if (v.tick >= engaged.noticeAtTick) {
      const sigma = aimSigma(engaged, me, sharp, v.tick, v.flash);
      const err = v.tick === engaged.noticeAtTick ? landingErr(sigma, c.rand) : drift(before.err, sigma, TICK_MS, c.rand);
      const meet = intercept(me, { x: t.p.x, y: t.p.y, vx: engaged.vx, vy: engaged.vy }, gun.bulletSpeed, rulesOf(gun).muzzleBoost, MUZZLE_PX, engaged.leadMul);
      const rx = meet.x - me.x, ry = meet.y - me.y;
      look = { want: Math.atan2(ry, rx) + err, spin: bearingSpin(rx, ry, engaged.vx - mine.x, engaged.vy - mine.y), hand: handFor(sharp), d: t.d, err };
      wantsFire = t.d < gun.range * 0.95;
      const shot = barrelToShoot(me, barrels, v.threats.map((x) => x.p), v.allies, c.arena.walls, gun.range)
        ?? propToShoot(me, props, v.threats.map((x) => x.p), v.allies, c.arena.walls, gun.range);
      if (shot) {
        const bx = shot.x - me.x, by = shot.y - me.y;
        look = { want: Math.atan2(by, bx) + err, spin: bearingSpin(bx, by, -mine.x, -mine.y), hand: handFor(sharp), d: Math.hypot(bx, by), err };
        wantsFire = true;
      } else if (wantsFire && (shotWouldBurnMe(barrels, me, t.p) || shotWouldHurtMe(props, me, t.p))) wantsFire = false;
      threat = { d: t.d };
      const fuse = GRENADE_FUSE_MS / 1000;
      throwAt = { x: t.p.x + engaged.vx * fuse, y: t.p.y + engaged.vy * fuse, err };
    }
  } else if (s.crates && snap.self.ammo >= snap.self.mag / 2 && !snap.self.reloading) {
    const crate = crateInSight(me, snap.crates, [...c.arena.walls, ...c.arena.barrels], gun.range * 0.95, viewExtents(snap.self.viewRadius, DEFAULT_VIEW_ASPECT));
    if (crate) {
      look = { ...look, ...lookAt(crate, me, mine, 0) };
      wantsFire = true;
    }
  }

  // Blind or half-blind, it still has a trigger: it rakes the spot the enemy was last in, with an error that only a flash gives.
  if (!t && intent.k === 'blinded' && intent.mode === 'spray') {
    const err = drift(before.err, 0.3, TICK_MS, c.rand);
    const at = lookAt(intent.at, me, mine, 1);
    if (at) look = { ...at, want: at.want + err, hand: HANDS.calm, err };
    wantsFire = !!at && snap.self.ammo > 0;
  }
  // An enemy it cannot see but has just lost behind cover: a flash there is the way to push him.
  const lostFor = v.lastSeen && !t ? (v.tick - v.lastSeen.seenTick) * TICK_MS : Infinity;
  const lastKnown = v.lastSeen && !t && lostFor < 2500 && intent.k !== 'blinded' && !sightBlocked(v.smokes, me.x, me.y, v.lastSeen.x, v.lastSeen.y) ? { d: dist(v.lastSeen, me) } : null;
  if (lastKnown && v.lastSeen) throwAt = { x: v.lastSeen.x, y: v.lastSeen.y, err: drift(before.err, 0.08, TICK_MS, c.rand) };
  const situation: Situation = {
    lastKnown,
    threat, hurting: v.hpFrac < HURTING_HP_FRAC, underFire: v.underFire,
    onContestedZone: v.zones.some((z) => z.owner !== me.team && dist(z, me) < z.r),
  };
  const wanted = readyAbility !== null && ABILITY_RULES[readyAbility](situation) ? readyAbility : null;
  let keys = drive.keys;
  if (wanted === 'dash' && t) {
    const away = awayFrom(me, t.p, c.arena, RETREAT_STEP);
    keys = keysToward({ ...m, dir: null, stuckTicks: 0, pace: { lastDir: null, lastTurnBackTick: -Infinity } }, me, away, v.tick).keys;
  }
  // Fire and gas: out of a slick or cloud it stands in, and held at the edge of one on its way.
  const hazard = hazardState(hazardsOf(snap.thrown, me.id), me, way.at);
  if (hazard.k === 'in') keys = keysToward({ ...m, dir: null, stuckTicks: 0, pace: { lastDir: null, lastTurnBackTick: -Infinity } }, me, awayFrom(me, hazard.h, c.arena, RETREAT_STEP), v.tick).keys;
  else if (hazard.k === 'entering') keys = { up: false, down: false, left: false, right: false };
  if (wanted === 'smokeGrenade' && t) {
    look = { ...look, want: Math.atan2(t.p.y - me.y, t.p.x - me.x), spin: 0, d: SMOKE_THROW_PX };
  } else if (throwAt && GRENADES.has(wanted)) {
    look = { ...look, want: Math.atan2(throwAt.y - me.y, throwAt.x - me.x) + throwAt.err, spin: 0, d: Math.hypot(throwAt.x - me.x, throwAt.y - me.y) };
  }
  // A flashbang it has noticed in the air: it turns its back on it instead of watching it go off, and holds its fire while it does.
  const turnAway = v.incomingFlash !== null && v.flash <= BLIND_AT;
  if (v.incomingFlash && turnAway) {
    look = { want: Math.atan2(me.y - v.incomingFlash.y, me.x - v.incomingFlash.x), spin: 0, hand: HANDS.flick, d: 300, err: 0 };
    wantsFire = false;
  }
  // A planted gun moving off its spot between shots lets go of the trigger: its next round waits until it has stopped again.
  if (style.k === 'plant' && dodge && !dodge.stop && anyKey(keys)) wantsFire = false;
  const rhythm = tapRhythm(me.gun, c.band.rushes);
  // Up close the cone is wider than any bloom, so it only taps once the fight is far enough for the spread to matter.
  const resting = rhythm !== null && t !== undefined && t.d >= TAP_FROM_PX && v.tick < (m.tap?.pauseUntil ?? -Infinity);
  const { aim, fire, ability, shots } = aimAndTrigger(before, look, wantsFire && !resting, turnAway && wanted !== null ? null : wanted, m.shots);
  const tap = rhythm === null ? undefined
    : !fire ? { since: null, pauseUntil: m.tap?.pauseUntil ?? -Infinity }
      : (v.tick - (m.tap?.since ?? v.tick)) * TICK_MS >= rhythm.windowMs ? { since: null, pauseUntil: v.tick + Math.round(rhythm.pauseMs / TICK_MS) }
        : { since: m.tap?.since ?? v.tick, pauseUntil: m.tap?.pauseUntil ?? -Infinity };
  const angle = aim.angle, aimDist = Math.max(1, look.d);
  const reload = !fire && snap.self.ammo < snap.self.mag && !snap.self.reloading && (s.reload || (!t && snap.self.ammo < snap.self.mag / 2));
  // A bot sprints only to travel: with no enemy in sight (or its fight just ended) or when running to cover to heal. Anything else, it walks, so it can fire.
  const travelling = keys.up || keys.down || keys.left || keys.right;
  const calm = v.tick - m.engagedSeen > SPRINT_CALM_TICKS;
  const sprint = travelling && !fire && !wantsFire && wanted === null && (intent.k === 'retreatAndHeal' || (!t && engaged === null && v.threats.length === 0 && calm));
  return {
    input: { ...keys, angle, fire, shots, reload, ability, aimDist, use: false, sprint },
    motor: {
      route: way.route, dir: drive.dir, dirSince: drive.dirSince, pace: drive.pace, stance, last: { x: me.x, y: me.y },
      stuckTicks: pressing && gained < 1 && !way.replanned ? m.stuckTicks + 1 : 0,
      progress: !pressing || crawling || headway(m, me, left) ? { x: me.x, y: me.y, tick: v.tick, left, rubbed: false } : { ...m.progress, rubbed: m.progress.rubbed || m.stuckTicks >= BLOCKED_TICKS }, detour, siegeStep: null, tending: null, engaged, engagedSeen: t ? v.tick : m.engagedSeen, aim, shots, ...(tap && { tap }),
      ...((dodge || m.dodge) && { dodge }),
    },
  };
}
