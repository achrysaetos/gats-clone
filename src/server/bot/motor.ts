import { GUNS, WORLD, type AbilityId } from '../../shared/defs.ts';
import { VIEW_ASPECT, viewExtents, type CrateView, type InputState, type Snapshot } from '../../shared/protocol.ts';
import { GRENADE_FUSE_MS } from '../../shared/sim/abilities.ts';
import { KNIFE_LUNGE, KNIFE_REACH, segmentEntersRectAt, type Rect } from '../../shared/sim/movement.ts';
import { engage, sharpnessAgainst, TICK_MS, type Engagement } from './aim.ts';
import type { BotArena } from './arena.ts';
import type { Perception, Threat } from './awareness.ts';
import type { Intent, IntentCtx } from './intent.ts';
import { clearShot, findPath, isOpen, walkable, type Point } from './nav.ts';

/**
 * How a bot's body carries out its intent between thinks: the route it is walking, the 8-way key direction it holds and since when,
 * its stand-or-step rhythm in a fight, and its aim on the enemy it tracks.
 */
export type Motor = {
  route: { goal: Point; points: readonly Point[]; version: number } | null;
  /** The octant held, 0 = right, counting clockwise in screen space, or null while standing. */
  dir: number | null;
  dirSince: number;
  stance: { step: 0 | 1 | -1; until: number };
  last: Point;
  stuckTicks: number;
  engaged: Engagement | null;
  /** Last tick the tracked enemy was in sight; a target that stays hidden longer than REACQUIRE costs a fresh reaction. */
  engagedSeen: number;
  shots: number;
};

export const freshMotor = (): Motor => ({
  route: null, dir: null, dirSince: 0, stance: { step: 0, until: 0 }, last: { x: 0, y: 0 }, stuckTicks: 0, engaged: null, engagedSeen: -Infinity, shots: 0,
});

/** What a bot weighs when deciding whether its ability helps right now. `threat` is the enemy it is fighting, once its reaction delay has passed. */
export type Situation = { threat: { d: number } | null; hurting: boolean; underFire: boolean; onContestedZone: boolean };

/** Lunge plus reach, leaving the target's radius as slack so a strafing target is still caught. */
const KNIFE_REACH_PX = KNIFE_LUNGE + KNIFE_REACH;
/** Grenades land where they were aimed when the fuse runs out, so bots aim where the target will be then. */
const GRENADE_FUSE_TICKS = Math.round(GRENADE_FUSE_MS / TICK_MS);
const GRENADES: ReadonlySet<AbilityId | null> = new Set(['grenade', 'fragGrenade', 'gasGrenade']);
const throwRange = (s: Situation) => s.threat !== null && s.threat.d >= 150 && s.threat.d <= 450;

export const ABILITY_RULES: Record<AbilityId, (s: Situation) => boolean> = {
  knife: (s) => s.threat !== null && s.threat.d <= KNIFE_REACH_PX,
  grenade: throwRange,
  fragGrenade: throwRange,
  gasGrenade: throwRange,
  landMine: (s) => (s.hurting && s.threat !== null) || s.onContestedZone,
  dash: (s) => s.hurting && s.threat !== null,
  engineer: (s) => s.underFire && s.threat !== null && s.threat.d >= 200 && s.threat.d <= 500,
};

export const HURTING_HP_FRAC = 0.4;
const KNIFE_CHASE_PX = 300;
const REACQUIRE_TICKS = Math.round(600 / TICK_MS);
const RETREAT_STEP = 240 + WORLD.playerRadius;
const BACKOFF_STEP = 160;
/** A waypoint counts as reached this close, and a goal this close means stand still. */
const WAYPOINT_PX = 16;
const ARRIVED_PX = 14;
/** Movement keys change direction only after this long, or when the way to go leaves the held direction by more than HOLD_SLACK. */
const MIN_HOLD_TICKS = 3;
const HOLD_SLACK = (35 * Math.PI) / 180;
const STUCK_TICKS = 12;
const REPLAN_PX = 48;
/** In range a bot stands to shoot for a while, then by its personality's odds takes one committed step to the side. */
const STAND_MS: readonly [number, number] = [700, 1500];
const STEP_MS: readonly [number, number] = [300, 700];
/** Shot at in the open, any bot takes a step at least this often, as a person under fire does. */
const UNDER_FIRE_STEP_ODDS = 0.75;

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const between = (r: readonly [number, number], rand: () => number) => r[0] + rand() * (r[1] - r[0]);
const crateRect = (c: CrateView): Rect => ({ x: c.x, y: c.y, w: c.size, h: c.size });

/** The 8-way heading closest to `away` whose step is free of walls and the world edge, so a retreat or dash does not end against cover. */
function retreatHeading(me: Point, away: number, arena: BotArena): number {
  const headings = Array.from({ length: 8 }, (_, i) => (i * Math.PI) / 4)
    .filter((h) => Math.cos(h - away) > 0)
    .sort((a, b) => Math.cos(b - away) - Math.cos(a - away));
  const clear = headings.find((h) => {
    const dx = Math.cos(h) * RETREAT_STEP, dy = Math.sin(h) * RETREAT_STEP;
    const ex = me.x + dx, ey = me.y + dy, r = WORLD.playerRadius;
    if (ex < r || ey < r || ex > arena.size - r || ey > arena.size - r) return false;
    return !arena.walls.some((w) => segmentEntersRectAt(me.x, me.y, dx, dy, w) !== null);
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

/** Where the intent wants the body and the eyes this tick. */
function steer(intent: Intent, v: Perception, c: IntentCtx, m: Motor, readyAbility: AbilityId | null): { steer: Steer; stance: Motor['stance'] } {
  const me = v.me;
  const idle = (to: Point | null, face: Point | null): Steer => ({ to, face, reload: false, crates: true });
  switch (intent.k) {
    case 'patrol': return { steer: idle(intent.goal, null), stance: m.stance };
    case 'takePosition': return { steer: idle(intent.spot, intent.facing), stance: m.stance };
    case 'search': return { steer: { to: intent.at, face: intent.at, reload: false, crates: false }, stance: m.stance };
    case 'flank': return { steer: { to: intent.via, face: intent.lastKnown, reload: false, crates: false }, stance: m.stance };
    case 'peekAndHide': {
      const t = v.threats.find((x) => x.p.id === intent.target) ?? v.threats[0];
      const face = t ? t.p : v.lastSeen ?? intent.peek;
      const reload = intent.phase === 'hide' && !t && v.self.ammo < v.self.mag;
      return { steer: { to: intent.phase === 'hide' ? intent.spot : intent.peek, face, reload, crates: false }, stance: m.stance };
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
      const t = v.threats.find((x) => x.p.id === intent.target) ?? v.threats[0];
      if (!t) return { steer: { to: v.lastSeen, face: v.lastSeen, reload: false, crates: false }, stance: m.stance };
      const fight = (to: Point | null): Steer => ({ to, face: t.p, reload: false, crates: false });
      if ((readyAbility === 'knife' && t.d < KNIFE_CHASE_PX) || t.d > c.band.max || (v.weapon === 'shotgun' && t.d > c.band.ideal)) {
        return { steer: fight(t.p), stance: m.stance };
      }
      if (t.d < c.band.min) return { steer: fight(awayFrom(me, t.p, c.arena, BACKOFF_STEP)), stance: m.stance };
      let stance = m.stance;
      if (v.tick >= stance.until) {
        const odds = v.underFire ? Math.max(UNDER_FIRE_STEP_ODDS, c.persona.sidestepOdds) : c.persona.sidestepOdds;
        const step = stance.step === 0 && c.rand() < odds ? (c.rand() < 0.5 ? 1 : -1) : 0;
        stance = { step, until: v.tick + Math.round(between(step === 0 ? STAND_MS : STEP_MS, c.rand) / TICK_MS) };
      }
      if (stance.step === 0) return { steer: fight(null), stance };
      const a = Math.atan2(t.p.y - me.y, t.p.x - me.x) + (stance.step * Math.PI) / 2;
      return { steer: fight({ x: me.x + Math.cos(a) * 120, y: me.y + Math.sin(a) * 120 }), stance };
    }
  }
}

/** The next point to walk toward on the way to `to`, replanning when the goal moved, the walls changed or the bot is stuck. */
function nextWaypoint(m: Motor, me: Point, to: Point, arena: BotArena): { at: Point; route: Motor['route']; replanned: boolean } {
  let route = m.route;
  const stale = !route || route.version !== arena.version || dist(route.goal, to) > REPLAN_PX || m.stuckTicks > STUCK_TICKS;
  if (stale) {
    const points = isOpen(arena.nav, me) || walkable(arena.nav, me, to) ? findPath(arena.nav, me, to) : null;
    route = { goal: to, points: points ?? [to], version: arena.version };
  }
  let points = route!.points;
  while (points.length > 1 && dist(me, points[0]!) < WAYPOINT_PX) points = points.slice(1);
  return { at: points[0]!, route: { ...route!, points }, replanned: stale };
}

/** Turns a way to go into held 8-way keys that change only after a minimum hold or a real change of course, like a hand on a keyboard. */
function keysToward(m: Motor, me: Point, at: Point | null, tick: number): { keys: Pick<InputState, 'up' | 'down' | 'left' | 'right'>; dir: number | null; dirSince: number } {
  const none = { up: false, down: false, left: false, right: false };
  if (!at || dist(me, at) < ARRIVED_PX) return { keys: none, dir: null, dirSince: tick };
  const want = Math.atan2(at.y - me.y, at.x - me.x);
  const octant = ((Math.round(want / (Math.PI / 4)) % 8) + 8) % 8;
  let dir = octant, dirSince = tick;
  if (m.dir !== null) {
    const off = Math.abs(Math.atan2(Math.sin(want - (m.dir * Math.PI) / 4), Math.cos(want - (m.dir * Math.PI) / 4)));
    if (off < HOLD_SLACK || (tick - m.dirSince < MIN_HOLD_TICKS && off < Math.PI / 2)) { dir = m.dir; dirSince = m.dirSince; }
  }
  const a = (dir * Math.PI) / 4, cx = Math.cos(a), cy = Math.sin(a);
  return { keys: { up: cy < -0.38, down: cy > 0.38, left: cx < -0.38, right: cx > 0.38 }, dir, dirSince: dir === m.dir ? dirSince : tick };
}

/** Turns the intent into this tick's input: walk the route, hold or step, aim and fire through the aim model, reload and use the ability. */
export function act(intent: Intent, v: Perception, c: IntentCtx, m: Motor, snap: Snapshot, rand: () => number): { input: InputState; motor: Motor } {
  const me = v.me;
  const readyAbility = snap.self.abilityReadyIn === 0 ? snap.self.ability : null;
  const { steer: s, stance } = steer(intent, v, c, m, readyAbility);
  const way = s.to ? nextWaypoint(m, me, s.to, c.arena) : { at: null, route: m.route, replanned: false };
  const drive = keysToward(m, me, way.at, v.tick);
  const moved = dist(me, m.last);
  const pressing = drive.dir !== null;
  const gun = GUNS[me.gun];

  const t: Threat | undefined = (intent.k === 'engage' || intent.k === 'peekAndHide' || intent.k === 'flank') ? v.threats.find((x) => x.p.id === intent.target) ?? v.threats[0] : v.threats[0];
  // Tucked behind cover the bot keeps its aim on where the target was, so stepping back out costs no fresh reaction; anywhere else a lost target does.
  const held = (id: number) => m.engaged?.id === id && (v.tick - m.engagedSeen <= REACQUIRE_TICKS || (intent.k === 'peekAndHide' && intent.target === id));
  let engaged = t ? null : m.engaged && held(m.engaged.id) ? m.engaged : null;
  let angle = s.face ? Math.atan2(s.face.y - me.y, s.face.x - me.x) : way.at ? Math.atan2(way.at.y - me.y, way.at.x - me.x) : me.angle;
  let aimDist = s.face ? Math.max(1, dist(me, s.face)) : 300;
  let fire = false;
  let threat: Situation['threat'] = null;
  let throwAt: { x: number; y: number; err: number } | null = null;
  if (t) {
    const tracked = held(t.p.id) ? m.engaged : null;
    engaged = engage(tracked, t.p, sharpnessAgainst(t.p), me, v.tick, rand);
    const vel = tracked ? { x: t.p.x - tracked.x, y: t.p.y - tracked.y } : { x: 0, y: 0 };
    const flightTicks = (t.d / gun.bulletSpeed) * WORLD.tickHz;
    angle = Math.atan2(t.p.y + vel.y * flightTicks - me.y, t.p.x + vel.x * flightTicks - me.x) + engaged.aimErrRad;
    aimDist = t.d;
    const reacted = v.tick >= engaged.fireAtTick;
    fire = reacted && t.d < gun.range * 0.95;
    if (reacted) threat = { d: t.d };
    throwAt = { x: t.p.x + vel.x * GRENADE_FUSE_TICKS, y: t.p.y + vel.y * GRENADE_FUSE_TICKS, err: engaged.aimErrRad };
  } else if (s.crates && snap.self.ammo >= snap.self.mag / 2 && !snap.self.reloading) {
    const crate = crateInSight(me, snap.crates, c.arena.walls, gun.range * 0.95, viewExtents(snap.self.viewRadius, VIEW_ASPECT.max));
    if (crate) {
      angle = Math.atan2(crate.y - me.y, crate.x - me.x);
      aimDist = dist(crate, me);
      fire = true;
    }
  }

  const situation: Situation = {
    threat, hurting: v.hpFrac < HURTING_HP_FRAC, underFire: v.underFire,
    onContestedZone: v.zones.some((z) => z.owner !== me.team && dist(z, me) < z.r),
  };
  const ability = readyAbility !== null && ABILITY_RULES[readyAbility](situation);
  let keys = drive.keys;
  if (ability && readyAbility === 'dash' && t) {
    const away = awayFrom(me, t.p, c.arena, RETREAT_STEP);
    keys = keysToward({ ...m, dir: null }, me, away, v.tick).keys;
  }
  if (ability && throwAt && GRENADES.has(readyAbility)) {
    angle = Math.atan2(throwAt.y - me.y, throwAt.x - me.x) + throwAt.err;
    aimDist = Math.hypot(throwAt.x - me.x, throwAt.y - me.y);
  }
  const shots = m.shots + (fire ? 1 : 0);
  const reload = !fire && snap.self.ammo < snap.self.mag && !snap.self.reloading && (s.reload || (!t && snap.self.ammo < snap.self.mag / 2));
  return {
    input: { ...keys, angle, fire, shots, reload, ability, aimDist, use: false },
    motor: {
      route: way.route, dir: drive.dir, dirSince: drive.dirSince, stance, last: { x: me.x, y: me.y },
      stuckTicks: pressing && moved < 1 && !way.replanned ? m.stuckTicks + 1 : 0, engaged, engagedSeen: t ? v.tick : m.engagedSeen, shots,
    },
  };
}
