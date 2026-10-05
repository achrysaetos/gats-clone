import { WORLD } from '../../shared/defs.ts';
import { MAPS } from '../../shared/maps.ts';
import type { WallView } from '../../shared/protocol.ts';
import type { Rect } from '../../shared/sim/movement.ts';
import { crateRect, type Crate, type Wall, type World } from '../../shared/sim/world.ts';
import { wallViews } from '../../shared/sim/snapshot.ts';
import { coverIndex, type CoverIndex } from './cover.ts';
import { isOpen, navGrid, withSolids, type NavGrid, type Point } from './nav.ts';

export type BotArena = {
  size: number;
  version: number;
  walls: readonly WallView[];
  nav: NavGrid;
  cover: CoverIndex;
  replans: { tick: number; left: number };
};

// A route across a 6000 px map can take A* a few ms, so a room plans only this many new routes a tick; a bot that misses out keeps walking its old one.
const REPLANS_PER_TICK = 3;

export function takeReplan(a: BotArena, tick: number): boolean {
  if (a.replans.tick !== tick) a.replans = { tick, left: REPLANS_PER_TICK };
  if (a.replans.left <= 0) return false;
  a.replans.left--;
  return true;
}

type Layout = { walls: readonly Wall[]; crates: readonly Crate[]; nav: NavGrid; cover: CoverIndex };

const ARENAS = new WeakMap<World, { arena: BotArena; layout: Layout }>();

const sameLayout = (l: Layout, walls: readonly Wall[], crates: readonly Crate[]) =>
  l.crates === crates && l.walls.length === walls.length && l.walls.every((wall, i) => wall === walls[i]);

export function arenaFor(w: World): BotArena {
  const cached = ARENAS.get(w);
  if (cached && cached.arena.version === w.wallsVersion) return cached.arena;
  const size = MAPS[w.map].size;
  const mapWalls = w.walls.filter((wall) => !wall.built);
  const layout = cached && sameLayout(cached.layout, mapWalls, w.crates) ? cached.layout : buildLayout(size, mapWalls, w.crates);
  const built = w.walls.filter((wall) => wall.built);
  const arena: BotArena = {
    size, version: w.wallsVersion, walls: wallViews(w), cover: layout.cover, replans: { tick: -1, left: 0 },
    nav: built.length ? withSolids(layout.nav, built, WORLD.playerRadius) : layout.nav,
  };
  ARENAS.set(w, { arena, layout });
  return arena;
}

function buildLayout(size: number, walls: readonly Wall[], crates: readonly Crate[]): Layout {
  const solids: Rect[] = [...walls, ...crates.map(crateRect)];
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
  return near?.at ?? { x: a.size / 2, y: a.size / 2 };
}
