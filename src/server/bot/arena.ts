import { WORLD } from '../../shared/defs.ts';
import type { MapDoor } from '../../shared/geom.ts';
import { MAPS, type MapId } from '../../shared/maps.ts';
import { doorAuto, doorLeaves, isSwing, mapDoors } from '../../shared/sim/doors.ts';
import type { WallView } from '../../shared/protocol.ts';
import { segmentEntersRectAt, type Rect } from '../../shared/sim/movement.ts';
import { barrelRect, crateRect, propRect, propSolid, type Crate, type Wall, type World } from '../../shared/sim/world.ts';
import { coverIndex, type CoverIndex } from './cover.ts';
import { isOpen, navGrid, nearestOpenPoint, withSolids, type NavGrid, type Point } from './nav.ts';

export type BotArena = {
  size: number;
  version: number;
  /** What stops a round: map walls, polygon parts, built walls and door leaves (not low cover flagged `nb`). */
  walls: readonly WallView[];
  /** What stops sight (not glass or other walls flagged `ns`). */
  sightWalls: readonly WallView[];
  /** Barrels and props standing now: solid to bodies and bullets, and in `nav`. */
  barrels: readonly Rect[];
  nav: NavGrid;
  cover: CoverIndex;
  replans: { tick: number; left: number };
  /** The map's doors, for bots that hold an angle on one or wait their turn at one. */
  doors: readonly MapDoor[];
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
  const version = w.wallsVersion + w.doorsVersion;
  if (cached && cached.arena.version === version) return cached.arena;
  const size = MAPS[w.map].size;
  const mapWalls = w.walls.filter((wall) => !wall.built && wall.door === undefined);
  const layout = cached && sameLayout(cached.layout, mapWalls, w.crates) ? cached.layout : buildLayout(size, mapWalls, w.crates, w.map, shutDoors(w.map));
  const barrels = [...w.barrels.filter((b) => b.respawnAt === null).map(barrelRect), ...w.props.filter(propSolid).map(propRect)];
  const solids: Rect[] = [...w.walls.filter((wall) => wall.built), ...barrels];
  const arena: BotArena = {
    size, version, walls: w.walls.filter((wall) => !wall.nb), sightWalls: w.walls.filter((wall) => !wall.ns), barrels, cover: layout.cover, replans: { tick: -1, left: 0 }, doors: mapDoors(w.map),
    nav: solids.length ? withSolids(layout.nav, solids, WORLD.playerRadius) : layout.nav,
  };
  ARENAS.set(w, { arena, layout });
  return arena;
}

/** Doors a bot cannot pass: locked ones, and sliders that wait for a button. Every other door is open road to the planner. */
const shutDoors = (map: MapId): Rect[] => mapDoors(map).filter((d) => d.locked || (!isSwing(d) && !doorAuto(d))).flatMap((d) => doorLeaves(d, 0, 1));

function buildLayout(size: number, walls: readonly Wall[], crates: readonly Crate[], mapId: MapId, doors: readonly Rect[] = []): Layout {
  const solids: Rect[] = [...walls, ...crates.map(crateRect), ...doors];
  const nav = navGrid(size, solids, WORLD.playerRadius);
  return { walls, crates, nav, cover: coverIndex(nav, solids, WORLD.playerRadius, mapDoors(mapId)) };
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

/**
 * Whether a straight line between two points is clear right now: `'shot'` is what stops a round (polygons, closed doors, walls),
 * `'sight'` what stops the eye (glass and other see-through walls do not). Crates and barrels are not counted; add them with `extra`.
 */
export function losClear(arena: BotArena, a: Point, b: Point, kind: 'shot' | 'sight' = 'shot', extra: readonly Rect[] = []): boolean {
  const walls = kind === 'shot' ? arena.walls : arena.sightWalls;
  return !walls.some((r) => segmentEntersRectAt(a.x, a.y, b.x - a.x, b.y - a.y, r) !== null) && !extra.some((r) => segmentEntersRectAt(a.x, a.y, b.x - a.x, b.y - a.y, r) !== null);
}

export const doorCentre = (d: MapDoor): Point => (d.axis === 'h' ? { x: d.x + d.w / 2, y: d.y } : { x: d.x, y: d.y + d.w / 2 });

const LANE_STEP_PX = 60;
const LANE_LEN_PX = 420;

/**
 * Points down the line a door opens along, both sides of it, for the doors within `reach` of `near`. Fed to cover choice as ground
 * that is taken, they keep a bot holding a room off the doorway and out of the lane through it: it takes an angle to the side instead.
 */
export function doorLanes(a: BotArena, near: Point, reach: number): Point[] {
  const out: Point[] = [];
  for (const d of a.doors) {
    const c = doorCentre(d);
    if (Math.hypot(c.x - near.x, c.y - near.y) > reach) continue;
    for (let t = -LANE_LEN_PX; t <= LANE_LEN_PX; t += LANE_STEP_PX) out.push(d.axis === 'h' ? { x: c.x, y: c.y + t } : { x: c.x + t, y: c.y });
  }
  return out;
}
