import { WORLD } from '../../shared/defs.ts';
import { MAPS } from '../../shared/maps.ts';
import type { WallView } from '../../shared/protocol.ts';
import { circleHitsRect, type Rect } from '../../shared/sim/movement.ts';
import { trainAt, type TrainDef } from '../../shared/sim/train.ts';
import { crateRect, type Crate, type Wall, type World } from '../../shared/sim/world.ts';
import { wallViews } from '../../shared/sim/snapshot.ts';
import { coverIndex, type CoverIndex } from './cover.ts';
import { isOpen, navGrid, withSolids, type NavGrid, type Point } from './nav.ts';

export type BotArena = {
  size: number;
  /** Changes whenever `nav` does: walls went up or down, or a hazard came or went. */
  version: number;
  walls: readonly WallView[];
  /** Ground no bot sets foot on: burning fuel, and the train's lane while its signals flash and it passes. `nav` is closed over them. */
  hazards: readonly Rect[];
  nav: NavGrid;
  cover: CoverIndex;
  replans: { tick: number; left: number };
};

const REPLANS_PER_TICK = 3;

export function takeReplan(a: BotArena, tick: number): boolean {
  if (a.replans.tick !== tick) a.replans = { tick, left: REPLANS_PER_TICK };
  if (a.replans.left <= 0) return false;
  a.replans.left--;
  return true;
}

type Layout = { walls: readonly Wall[]; crates: readonly Crate[]; nav: NavGrid; cover: CoverIndex };

const ARENAS = new WeakMap<World, { arena: BotArena; layout: Layout; wallsVersion: number; hazardKey: string }>();

const sameLayout = (l: Layout, walls: readonly Wall[], crates: readonly Crate[]) =>
  l.crates === crates && l.walls.length === walls.length && l.walls.every((wall, i) => wall === walls[i]);

function hazardsOf(w: World, train: TrainDef | undefined): Rect[] {
  const hazards: Rect[] = [];
  for (const t of w.thrown) if (t.kind === 'fire') hazards.push({ x: t.x - t.r, y: t.y - t.r, w: 2 * t.r, h: 2 * t.r });
  if (train && trainAt(train, w.now).k !== 'clear') hazards.push(train.lane);
  return hazards;
}

export function arenaFor(w: World): BotArena {
  const cached = ARENAS.get(w);
  const { size, train } = MAPS[w.map];
  const hazards = hazardsOf(w, train);
  const hazardKey = hazards.map((h) => `${h.x},${h.y},${h.w},${h.h}`).join(' ');
  if (cached && cached.wallsVersion === w.wallsVersion && cached.hazardKey === hazardKey) return cached.arena;
  const mapWalls = w.walls.filter((wall) => !wall.built);
  const layout = cached && sameLayout(cached.layout, mapWalls, w.crates) ? cached.layout : buildLayout(size, mapWalls, w.crates, w.fences);
  const built = w.walls.filter((wall) => wall.built);
  const walled = built.length ? withSolids(layout.nav, built, WORLD.playerRadius) : layout.nav;
  const arena: BotArena = {
    size, version: (cached?.arena.version ?? 0) + 1, walls: wallViews(w), hazards, cover: layout.cover, replans: { tick: -1, left: 0 },
    nav: hazards.length ? withSolids(walled, hazards, WORLD.playerRadius + HAZARD_MARGIN) : walled,
  };
  ARENAS.set(w, { arena, layout, wallsVersion: w.wallsVersion, hazardKey });
  return arena;
}

/** Whether a body standing at `p` would be in a hazard. */
export const inHazard = (a: BotArena, p: Point): boolean => a.hazards.some((h) => circleHitsRect(p.x, p.y, WORLD.playerRadius, h));

/**
 * Where to step from `me` toward `to` without setting foot in a hazard: `to` itself when the way is clear, the last safe point short of
 * the first hazard on the way, null when that is where the bot stands. A bot already in one steps out by the shortest way first.
 */
export function safeStep(a: BotArena, me: Point, to: Point): Point | null {
  if (a.hazards.length === 0) return to;
  const R = WORLD.playerRadius;
  const holding = a.hazards.filter((h) => circleHitsRect(me.x, me.y, R, h));
  if (holding.length) {
    const outs = holding.flatMap((h) => [
      { x: h.x - R - EXIT_SLACK, y: me.y }, { x: h.x + h.w + R + EXIT_SLACK, y: me.y },
      { x: me.x, y: h.y - R - EXIT_SLACK }, { x: me.x, y: h.y + h.h + R + EXIT_SLACK },
    ]).filter((p) => p.x > R && p.y > R && p.x < a.size - R && p.y < a.size - R && !inHazard(a, p) && isOpen(a.nav, p));
    const cost = (p: Point) => Math.hypot(p.x - me.x, p.y - me.y) + Math.hypot(p.x - to.x, p.y - to.y) / 4;
    outs.sort((p, q) => cost(p) - cost(q));
    return outs[0] ?? to;
  }
  const d = Math.hypot(to.x - me.x, to.y - me.y);
  const steps = Math.ceil(d / SAFE_STEP_PX);
  let last: Point | null = null;
  for (let i = 1; i <= steps; i++) {
    const p = { x: me.x + ((to.x - me.x) * i) / steps, y: me.y + ((to.y - me.y) * i) / steps };
    if (inHazard(a, p)) return last;
    last = p;
  }
  return to;
}

/**
 * Extra room the nav keeps round a hazard, more than a nav cell's half diagonal, so a path the planner calls walkable never brings a
 * body within reach of one by the exact test `safeStep` holds it to.
 */
const HAZARD_MARGIN = 20;
const EXIT_SLACK = HAZARD_MARGIN + 25;
const SAFE_STEP_PX = 10;

function buildLayout(size: number, walls: readonly Wall[], crates: readonly Crate[], fences: readonly Rect[]): Layout {
  const solids: Rect[] = [...walls, ...crates.map(crateRect), ...fences];
  const nav = navGrid(size, solids, WORLD.playerRadius);
  return { walls, crates, nav, cover: coverIndex(nav, solids, WORLD.playerRadius) };
}

export function openSpot(a: BotArena, rand: () => number, near?: { at: Point; r: number }): Point {
  for (let i = 0; i < 20; i++) {
    const p = near
      ? { x: near.at.x + (rand() * 2 - 1) * near.r, y: near.at.y + (rand() * 2 - 1) * near.r }
      : { x: rand() * a.size, y: rand() * a.size };
    if (p.x > 0 && p.y > 0 && p.x < a.size && p.y < a.size && isOpen(a.nav, p)) return p;
  }
  if (near && near.r < a.size) return openSpot(a, rand, { at: near.at, r: near.r * 2 });
  return near?.at ?? { x: a.size / 2, y: a.size / 2 };
}
