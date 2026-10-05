import { WORLD } from '../../shared/defs.ts';
import { MAPS } from '../../shared/maps.ts';
import type { WallView } from '../../shared/protocol.ts';
import type { Rect } from '../../shared/sim/movement.ts';
import { crateRect, type World } from '../../shared/sim/world.ts';
import { wallViews } from '../../shared/sim/snapshot.ts';
import { coverIndex, type CoverIndex } from './cover.ts';
import { isOpen, navGrid, type NavGrid, type Point } from './nav.ts';

/**
 * What every bot in a world knows about its layout, rebuilt only when the walls change.
 * Crates count as solid wherever they stand, broken or not, since they respawn in place; whether one stops a shot right now comes from the snapshot.
 */
export type BotArena = {
  size: number;
  version: number;
  walls: readonly WallView[];
  nav: NavGrid;
  cover: CoverIndex;
};

const ARENAS = new WeakMap<World, BotArena>();

export function arenaFor(w: World): BotArena {
  const cached = ARENAS.get(w);
  if (cached && cached.version === w.wallsVersion) return cached;
  // The one place bot code reads how big the world is.
  const size = MAPS[w.map].size;
  const walls = wallViews(w);
  const solids: Rect[] = [...walls, ...w.crates.map(crateRect)];
  const nav = navGrid(size, solids, WORLD.playerRadius);
  const permanent: Rect[] = [...walls.filter((wall) => !wall.built), ...w.crates.map(crateRect)];
  const arena: BotArena = { size, version: w.wallsVersion, walls, nav, cover: coverIndex(nav, permanent, WORLD.playerRadius) };
  ARENAS.set(w, arena);
  return arena;
}

/** A random spot a body can stand on, within `r` of `near` when given, for patrol goals and search scatter. */
export function openSpot(a: BotArena, rand: () => number, near?: { at: Point; r: number }): Point {
  for (let i = 0; i < 20; i++) {
    const p = near
      ? { x: near.at.x + (rand() * 2 - 1) * near.r, y: near.at.y + (rand() * 2 - 1) * near.r }
      : { x: rand() * a.size, y: rand() * a.size };
    if (p.x > 0 && p.y > 0 && p.x < a.size && p.y < a.size && isOpen(a.nav, p)) return p;
  }
  return near?.at ?? { x: a.size / 2, y: a.size / 2 };
}
