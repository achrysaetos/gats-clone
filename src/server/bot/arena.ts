import { WORLD } from '../../shared/defs.ts';
import { MAPS } from '../../shared/maps.ts';
import type { WallView } from '../../shared/protocol.ts';
import type { Rect } from '../../shared/sim/movement.ts';
import { barrelRect, crateRect, type Crate, type Wall, type World } from '../../shared/sim/world.ts';
import { wallViews } from '../../shared/sim/snapshot.ts';
import { coverIndex, type CoverIndex } from './cover.ts';
import { isOpen, navGrid, nearestOpenPoint, withSolids, type NavGrid, type Point } from './nav.ts';

export type BotArena = {
  size: number;
  version: number;
  walls: readonly WallView[];
  /** Barrels standing now: solid to bodies and bullets, and in `nav`. */
  barrels: readonly Rect[];
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

const ARENAS = new WeakMap<World, { arena: BotArena; layout: Layout }>();

const sameLayout = (l: Layout, walls: readonly Wall[], crates: readonly Crate[]) =>
  l.crates === crates && l.walls.length === walls.length && l.walls.every((wall, i) => wall === walls[i]);

export function arenaFor(w: World): BotArena {
  const cached = ARENAS.get(w);
  if (cached && cached.arena.version === w.wallsVersion) return cached.arena;
  const size = MAPS[w.map].size;
  const mapWalls = w.walls.filter((wall) => !wall.built);
  const layout = cached && sameLayout(cached.layout, mapWalls, w.crates) ? cached.layout : buildLayout(size, mapWalls, w.crates);
  const barrels = w.barrels.filter((b) => b.respawnAt === null).map(barrelRect);
  const solids: Rect[] = [...w.walls.filter((wall) => wall.built), ...barrels];
  const arena: BotArena = {
    size, version: w.wallsVersion, walls: wallViews(w), barrels, cover: layout.cover, replans: { tick: -1, left: 0 },
    nav: solids.length ? withSolids(layout.nav, solids, WORLD.playerRadius) : layout.nav,
  };
  ARENAS.set(w, { arena, layout });
  return arena;
}

function buildLayout(size: number, walls: readonly Wall[], crates: readonly Crate[]): Layout {
  const solids: Rect[] = [...walls, ...crates.map(crateRect)];
  const nav = navGrid(size, solids, WORLD.playerRadius);
  return { walls, crates, nav, cover: coverIndex(nav, solids, WORLD.playerRadius) };
}

const NEAR_SNAP_PX = 300;

/**
 * A spot a bot can stand on: random tries within `near` (or anywhere), then the nearest open cell to `near.at`, then anywhere.
 * Never a closed point, which a bot would drive at for ever (the route to it is empty, so it walks straight into the wall).
 */
export function openSpot(a: BotArena, rand: () => number, near?: { at: Point; r: number }): Point {
  const tryRandom = (box?: { at: Point; r: number }): Point | null => {
    for (let i = 0; i < 20; i++) {
      const p = box
        ? { x: box.at.x + (rand() * 2 - 1) * box.r, y: box.at.y + (rand() * 2 - 1) * box.r }
        : { x: rand() * a.size, y: rand() * a.size };
      if (p.x > 0 && p.y > 0 && p.x < a.size && p.y < a.size && isOpen(a.nav, p)) return p;
    }
    return null;
  };
  return tryRandom(near) ?? (near ? nearestOpenPoint(a.nav, near.at, NEAR_SNAP_PX) : null) ?? tryRandom() ?? near?.at ?? { x: a.size / 2, y: a.size / 2 };
}
