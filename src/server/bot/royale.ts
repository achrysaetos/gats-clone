import { CRATE_TIERS, RING, ZOM } from '../../shared/defs.ts';
import { ringAt, type Circle, type InputState, type PlayerView, type RingView, type RoyaleView, type Snapshot } from '../../shared/protocol.ts';
import type { BotDecision, BotMemory } from '../bots.ts';
import { TICK_MS } from './aim.ts';
import { openSpot, type BotArena } from './arena.ts';
import { coverNear } from './cover.ts';
import { perceive, type Perception } from './awareness.ts';
import { bandFor, nextIntent, PERSONALITIES, startIntent, type Intent, type IntentCtx, type Plan } from './intent.ts';
import { act } from './motor.ts';
import { dist, isOpen, type Point } from './nav.ts';

const LEAVE_MARGIN_MS = 15_000;
const WALK_DETOUR = 1.4;
const EDGE_PX = 120;
const ANCHOR_EDGE_PX = 400;
const ANCHOR_REACH = 0.6;
const REVIVE_REACH_PX = 900;
const REVIVE_STOP_PX = ZOM.reviveRange - 20;
const MATE_DEAD_ZONE = 30;
/** A bot with no squadmate in sight walks back to its squad's marks past this, and a follower this far behind its leader drops a search or flank. */
const PACK_PX = 450;
const FOLLOW_PX = 70;
/** From the ring closing on last lives onward a squad holds cover this close to the middle of its standing members, pulled inside the circle. */
const HOLD_PX = 220;
const HUNT_PX = 2000;
/** A crate's worth is its score over its distance plus this, so a near crate beats a richer one only when the richer one is much farther. */
const LOOT_DIST_PX = 400;
const DROP_WORTH = 150;

const inside = (p: Point, c: Circle, margin: number) => dist(p, c) <= Math.max(c.r - margin, c.r / 2);

function goalCircle(ring: RingView, me: Point, speed: number, now: number): { circle: Circle; urgent: boolean } {
  if (now >= ring.shrinkAt) return { circle: ring.to, urgent: true };
  const walkMs = (Math.max(0, dist(me, ring.to) - ring.to.r + EDGE_PX) / speed) * 1000 * WALK_DETOUR;
  return ring.shrinkAt - now < walkMs + LEAVE_MARGIN_MS ? { circle: ring.to, urgent: true } : { circle: ringAt(ring, now), urgent: false };
}

function inward(at: Point, circle: Circle, arena: BotArena): Point {
  const d = dist(at, circle);
  const reach = Math.max(circle.r - ANCHOR_EDGE_PX, circle.r * ANCHOR_REACH);
  const k = d > reach ? reach / d : 1;
  for (let f = k; f >= 0; f -= 0.1) {
    const p = { x: circle.x + (at.x - circle.x) * f, y: circle.y + (at.y - circle.y) * f };
    if (p.x > 0 && p.y > 0 && p.x < arena.size && p.y < arena.size && isOpen(arena.nav, p)) return p;
  }
  return circle;
}

const nearestOf = (me: Point, xs: readonly PlayerView[]) => xs.reduce<PlayerView | null>((b, p) => (b && dist(b, me) <= dist(p, me) ? b : p), null);
const mean = (xs: readonly number[]) => xs.reduce((s, x) => s + x, 0) / Math.max(1, xs.length);
const short = (from: Point, to: Point, by: number): Point => {
  const d = dist(from, to);
  return d <= by ? from : { x: to.x + ((from.x - to.x) / d) * by, y: to.y + ((from.y - to.y) / d) * by };
};

/** Where the squad heads when nothing in sight needs it: in from the ring, to a knocked squadmate, back to the pack, then to crates or the nearest fight. */
type Pack =
  | { k: 'ring'; at: Point }
  | { k: 'revive'; at: Point }
  | { k: 'gather'; at: Point }
  | { k: 'follow'; at: Point }
  | { k: 'loot'; at: Point }
  | { k: 'hunt'; at: Point }
  | { k: 'hold'; at: Point };

type PackCtx = { snap: Snapshot; royale: RoyaleView; me: PlayerView; view: Perception; arena: BotArena; circle: Circle; now: number };

function bestLoot({ snap, royale, me, circle }: PackCtx): Point | null {
  const crates = snap.crates.map((c) => ({ at: { x: c.x + c.size / 2, y: c.y + c.size / 2 }, score: c.tier === 'drop' ? DROP_WORTH : CRATE_TIERS[c.tier ?? 'loot'].score }));
  const drops = royale.drops.filter((d) => d.landsAt > 0).map((d) => ({ at: d, score: DROP_WORTH }));
  let best: Point | null = null, bestWorth = 0;
  for (const c of [...crates, ...drops]) {
    const worth = inside(c.at, circle, EDGE_PX) ? c.score / (dist(c.at, me) + LOOT_DIST_PX) : 0;
    if (worth > bestWorth) { best = c.at; bestWorth = worth; }
  }
  return best && short(me, best, FOLLOW_PX);
}

function packFor(c: PackCtx, outside: boolean, downed: PlayerView | null): Pack {
  const { snap, me, view, circle } = c;
  if (outside) return { k: 'ring', at: inward(me, circle, c.arena) };
  if (downed && !view.threats.some((t) => t.p.alive)) return { k: 'revive', at: downed };
  const team = me.team!;
  const marks = [me, ...snap.minimap.filter((m) => m.team === team && m.pingAge === null)];
  const centroid = { x: mean(marks.map((m) => m.x)), y: mean(marks.map((m) => m.y)) };
  const mates = snap.players.filter((p) => p.id !== me.id && p.team === team && p.alive);
  if (!mates.length && dist(me, centroid) > PACK_PX) return { k: 'gather', at: centroid };
  const { ring, redeploys } = c.royale;
  const closingOnLastLives = RING[ring.phase + 1]?.lives === 'last' && c.now >= ring.shrinkAt;
  if (!redeploys || closingOnLastLives) return { k: 'hold', at: inward(centroid, circle, c.arena) };
  const leader = [me, ...mates].reduce((a, b) => (b.id < a.id ? b : a));
  if (leader.id !== me.id) return { k: 'follow', at: short(me, leader, FOLLOW_PX) };
  const mine = mean(snap.leaderboard.filter((r) => r.team === team).map((r) => r.score));
  const theirs = mean(snap.leaderboard.filter((r) => r.team !== team).map((r) => r.score));
  const lead = view.lead && dist(view.lead, me) < HUNT_PX && inside(view.lead, circle, EDGE_PX) ? view.lead : null;
  if (lead && mine >= theirs) return { k: 'hunt', at: lead };
  const loot = bestLoot(c);
  return loot ? { k: 'loot', at: loot } : lead ? { k: 'hunt', at: lead } : { k: 'loot', at: inward(circle, circle, c.arena) };
}

const goalOf = (i: Intent): Point | null => {
  switch (i.k) {
    case 'patrol': return i.goal;
    case 'takePosition': case 'peekAndHide': case 'reloadInCover': case 'retreatAndHeal': return i.spot;
    case 'search': return i.at;
    case 'flank': return i.via;
    case 'engage': return null;
  }
};

/** The pack's goal replaces what the versus brain chose when it idles, leaves the circle, strays from the leader, or chases a sound while the squad loots. */
function strays(intent: Intent, pack: Pack, me: Point, circle: Circle): boolean {
  const goal = goalOf(intent);
  if (goal && !inside(goal, circle, EDGE_PX)) return true;
  if (pack.k === 'hold') return intent.k === 'search' || intent.k === 'flank' || (goal !== null && dist(goal, pack.at) > HOLD_PX);
  switch (intent.k) {
    case 'patrol': case 'takePosition': return true;
    case 'search': case 'flank': return pack.k === 'loot' || pack.k === 'gather' || (pack.k === 'follow' && dist(me, pack.at) > PACK_PX);
    default: return false;
  }
}

function holdAt(at: Point, circle: Circle, arena: BotArena, rand: () => number): Plan {
  const spots = coverNear(arena.cover, at, HOLD_PX);
  return spots.length ? { k: 'takePosition', spot: spots[Math.floor(rand() * spots.length)]!, facing: circle } : { k: 'patrol', goal: openSpot(arena, rand, { at, r: HOLD_PX }) };
}

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

export function royaleThink(snap: Snapshot, royale: RoyaleView, me: PlayerView, arena: BotArena, mem: BotMemory, rand: () => number): Omit<BotDecision, 'pick'> {
  const now = snap.tick * TICK_MS;
  const { awareness, view } = perceive(snap, arena, me, mem.awareness);
  const persona = PERSONALITIES[mem.persona];
  const { circle, urgent } = goalCircle(royale.ring, me, snap.self.speed, now);
  const ctx: IntentCtx = { tick: snap.tick, persona, role: null, band: bandFor(view.me.gun, persona), arena, rand };
  const current = ringAt(royale.ring, now);
  const outside = !inside(me, circle, EDGE_PX) && (urgent || dist(me, current) > current.r);
  const downed = nearestOf(me, snap.players.filter((p) => p.id !== me.id && p.team === me.team && p.downed && dist(p, me) < REVIVE_REACH_PX));
  const pack = packFor({ snap, royale, me, view, arena, circle, now }, outside, downed);
  const prev = mem.intent ?? startIntent({ k: 'patrol', goal: pack.at }, ctx);
  const walkTo = (goal: Point, slack: number) => (prev.k === 'patrol' && dist(prev.goal, goal) < slack ? prev : startIntent({ k: 'patrol', goal }, ctx));
  let intent: Intent;
  if (pack.k === 'ring') intent = walkTo(pack.at, 60);
  else if (pack.k === 'revive') intent = walkTo(pack.at, 30);
  else {
    intent = nextIntent(prev, view, ctx);
    if (strays(intent, pack, me, circle)) intent = pack.k === 'hold' ? startIntent(holdAt(pack.at, circle, arena, rand), ctx) : walkTo(pack.at, 60);
  }
  const { input, motor } = act(intent, view, ctx, mem.motor, snap);
  const reviving = pack.k === 'revive' && dist(me, pack.at) <= REVIVE_STOP_PX;
  return {
    input: reviving ? { ...input, up: false, down: false, left: false, right: false, use: true } : input,
    mem: { ...mem, intent, awareness, motor },
  };
}
