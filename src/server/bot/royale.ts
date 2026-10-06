import { COLOR_IDS, ZOM } from '../../shared/defs.ts';
import { ringAt, type Circle, type InputState, type PlayerView, type RingView, type RoyaleView, type Snapshot } from '../../shared/protocol.ts';
import type { BotDecision, BotMemory } from '../bots.ts';
import { TICK_MS } from './aim.ts';
import { openSpot, type BotArena } from './arena.ts';
import { perceive } from './awareness.ts';
import { bandFor, nextIntent, PERSONALITIES, startIntent, type Intent, type IntentCtx } from './intent.ts';
import { act } from './motor.ts';
import { dist, isOpen, type Point } from './nav.ts';

/** A bot sets off for the next circle while the wait left still covers its walk there by this much. */
const SPARE_MS = 15_000;
/** Walking takes longer than the straight line says. */
const DETOUR = 1.4;
const EDGE_PX = 120;
/** How far out from the circle's centre a squad's anchor may sit: this far in from the edge, or this share of the radius on a small circle. */
const ANCHOR_EDGE_PX = 400;
const ANCHOR_REACH = 0.6;
/** A bot holds cover this close to its squad's anchor; any plan of its own that goes farther is dropped. */
const HOME_R = 220;
const REVIVE_REACH_PX = 900;
const REVIVE_STOP_PX = ZOM.reviveRange - 20;
const MATE_DEAD_ZONE = 30;
const DROP_ODDS = 0.5;
const DROP_REACH_PX = 1800;

const inside = (p: Point, c: Circle, margin: number) => dist(p, c) <= Math.max(c.r - margin, c.r / 2);

/** The circle to stand in: the current one, or the next once the wait left runs short of the walk there. `urgent` while the next one is the goal. */
function goalCircle(ring: RingView, me: Point, speed: number, now: number): { circle: Circle; urgent: boolean } {
  if (now >= ring.shrinkAt) return { circle: ring.to, urgent: true };
  const walkMs = (Math.max(0, dist(me, ring.to) - ring.to.r + EDGE_PX) / speed) * 1000 * DETOUR;
  return ring.shrinkAt - now < walkMs + SPARE_MS ? { circle: ring.to, urgent: true } : { circle: ringAt(ring, now), urgent: false };
}

/**
 * Where the squad gathers: the centre of its standing members pulled inside the goal circle, so every squadmate works out the same point from the minimap.
 * Some squads go for a supply drop in the circle instead, the same squads every time for the same drop.
 */
function anchorFor(snap: Snapshot, royale: RoyaleView, me: PlayerView, circle: Circle, arena: BotArena): Point {
  const team = me.team!;
  const mates = [me, ...snap.minimap.filter((m) => m.team === team && m.pingAge === null)];
  const at = { x: mates.reduce((s, m) => s + m.x, 0) / mates.length, y: mates.reduce((s, m) => s + m.y, 0) / mates.length };
  const squad = COLOR_IDS.indexOf(team);
  const drop = royale.drops.find((d) => inside(d, circle, 0) && dist(d, at) < DROP_REACH_PX && ((squad * 7 + royale.ring.phase * 3 + Math.floor(d.x + d.y)) % 10) / 10 < DROP_ODDS);
  if (drop) return drop;
  const d = dist(at, circle);
  const reach = Math.max(circle.r - ANCHOR_EDGE_PX, circle.r * ANCHOR_REACH);
  const k = d > reach ? reach / d : 1;
  for (let f = k; f >= 0; f -= 0.1) {
    const p = { x: circle.x + (at.x - circle.x) * f, y: circle.y + (at.y - circle.y) * f };
    if (p.x > 0 && p.y > 0 && p.x < arena.size && p.y < arena.size && isOpen(arena.nav, p)) return p;
  }
  return circle;
}

const goalOf = (i: Intent): Point | null => {
  switch (i.k) {
    case 'patrol': return i.goal;
    case 'takePosition': case 'peekAndHide': case 'reloadInCover': case 'retreatAndHeal': return i.spot;
    case 'search': case 'flank': case 'engage': return null;
  }
};

const nearestOf = (me: Point, xs: readonly PlayerView[]) => xs.reduce<PlayerView | null>((b, p) => (b && dist(b, me) <= dist(p, me) ? b : p), null);

/** A knocked bot crawls toward the nearest squadmate still standing, or else the middle of the ring, where a revive is likeliest. */
export function crawlThink(snap: Snapshot, royale: RoyaleView, me: PlayerView, mem: BotMemory): Omit<BotDecision, 'pick'> {
  const mate = nearestOf(me, snap.players.filter((p) => p.id !== me.id && p.team === me.team && p.alive));
  const to = mate ?? ringAt(royale.ring, snap.tick * TICK_MS);
  const near = dist(me, to) < REVIVE_STOP_PX;
  const input: InputState = {
    up: !near && to.y < me.y - MATE_DEAD_ZONE, down: !near && to.y > me.y + MATE_DEAD_ZONE, left: !near && to.x < me.x - MATE_DEAD_ZONE, right: !near && to.x > me.x + MATE_DEAD_ZONE,
    angle: me.angle, fire: false, shots: mem.motor.shots, reload: false, ability: false, aimDist: 0, use: false,
  };
  return { input, mem };
}

/**
 * The versus brain, held to the squad: idle bots hold cover round the squad's anchor inside the ring, any plan that strays out of the ring or far from the anchor is dropped,
 * a bot caught outside walks back in whatever it is fighting, and a knocked squadmate in reach is revived once nobody standing is in sight.
 */
export function royaleThink(snap: Snapshot, royale: RoyaleView, me: PlayerView, arena: BotArena, mem: BotMemory, rand: () => number): Omit<BotDecision, 'pick'> {
  const now = snap.tick * TICK_MS;
  const { awareness, view } = perceive(snap, arena, me, mem.awareness);
  const persona = PERSONALITIES[mem.persona];
  const { circle, urgent } = goalCircle(royale.ring, me, snap.self.speed, now);
  const home = { at: anchorFor(snap, royale, me, circle, arena), r: HOME_R, face: { x: circle.x, y: circle.y } };
  const ctx: IntentCtx = { tick: snap.tick, persona, role: null, band: bandFor(view.me.gun, persona), arena, rand, home };
  const current = ringAt(royale.ring, now);
  const outside = !inside(me, circle, EDGE_PX) && (urgent || dist(me, current) > current.r);
  const fighting = view.threats.some((t) => t.p.alive);
  const downed = nearestOf(me, snap.players.filter((p) => p.id !== me.id && p.team === me.team && p.downed && dist(p, me) < REVIVE_REACH_PX));
  const prev = mem.intent ?? startIntent({ k: 'patrol', goal: home.at }, ctx);
  const walkTo = (goal: Point, slack: number) => (prev.k === 'patrol' && dist(prev.goal, goal) < slack ? prev : startIntent({ k: 'patrol', goal }, ctx));
  let intent: Intent;
  if (outside) intent = walkTo(home.at, 60);
  else if (downed && !fighting) intent = walkTo(downed, 30);
  else {
    intent = nextIntent(prev, view, ctx);
    // Squads that hunt leads and flank across the map wipe each other out long before the last circles, so a bot fights from its squad's cover.
    const goal = goalOf(intent);
    const strays = intent.k === 'search' || intent.k === 'flank' || (goal !== null && (!inside(goal, circle, EDGE_PX) || dist(goal, home.at) > HOME_R));
    if (strays) intent = startIntent({ k: 'patrol', goal: openSpot(arena, rand, home) }, ctx);
  }
  const { input, motor } = act(intent, view, ctx, mem.motor, snap);
  const reviving = !outside && !fighting && downed !== null && dist(me, downed) <= REVIVE_STOP_PX;
  return {
    input: reviving ? { ...input, up: false, down: false, left: false, right: false, use: true } : input,
    mem: { ...mem, intent, awareness, motor },
  };
}
