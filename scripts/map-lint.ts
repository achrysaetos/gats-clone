/// <reference types="node" />
// Usage: node scripts/map-lint.ts
// Prints each map's layout problems: places a player cannot walk to, spawns a player cannot stand in, spawns in sight of the enemy's,
// a team map that is not the same after a half turn, and DOM zones off the map, out of reach or overlapping walls.
import { fileURLToPath } from 'node:url';
import { WORLD } from '../src/shared/defs.ts';
import { CRATE_SIZE, MAP_IDS, MAPS, ZONE_RADIUS, type Center, type MapDef } from '../src/shared/maps.ts';
import { circleHitsRect, type Rect } from '../src/shared/sim/movement.ts';

const CELL = 25;
const R = WORLD.playerRadius;

/** Where a player's center can stand, on a CELL raster: clear of every wall and crate and inside the map. Crates count since a gap one blocks stays blocked until it breaks. */
function standable(def: MapDef, n: number): Uint8Array {
  const free = new Uint8Array(n * n);
  const at = (i: number) => (i + 0.5) * CELL;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) free[j * n + i] = at(i) >= R && at(j) >= R && at(i) <= def.size - R && at(j) <= def.size - R ? 1 : 0;
  for (const s of [...def.walls, ...crateRects(def)]) {
    const i0 = Math.max(0, Math.floor((s.x - R) / CELL)), i1 = Math.min(n - 1, Math.floor((s.x + s.w + R) / CELL));
    const j0 = Math.max(0, Math.floor((s.y - R) / CELL)), j1 = Math.min(n - 1, Math.floor((s.y + s.h + R) / CELL));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (circleHitsRect(at(i), at(j), R, s)) free[j * n + i] = 0;
  }
  return free;
}

const crateRects = (def: MapDef): Rect[] => def.crates.map((c) => ({ x: c.x - CRATE_SIZE / 2, y: c.y - CRATE_SIZE / 2, w: CRATE_SIZE, h: CRATE_SIZE }));
const centerOf = (c: number, n: number): Center => ({ x: ((c % n) + 0.5) * CELL, y: (Math.floor(c / n) + 0.5) * CELL });
const where = (p: Center) => `(${Math.round(p.x)}, ${Math.round(p.y)})`;

/** The raster cells whose centers lie in `r`. */
function cellsIn(r: Rect, n: number): number[] {
  const cells: number[] = [];
  const i0 = Math.max(0, Math.ceil(r.x / CELL - 0.5)), j0 = Math.max(0, Math.ceil(r.y / CELL - 0.5));
  for (let j = j0; j < n && (j + 0.5) * CELL < r.y + r.h; j++) for (let i = i0; i < n && (i + 0.5) * CELL < r.x + r.w; i++) cells.push(j * n + i);
  return cells;
}

function flood(free: Uint8Array, n: number, sources: readonly number[], seen: Uint8Array): number[] {
  const queue = sources.filter((c) => free[c] && !seen[c]);
  for (const c of queue) seen[c] = 1;
  for (let head = 0; head < queue.length; head++) {
    const c = queue[head]!, i = c % n;
    for (const d of [i + 1 < n ? 1 : 0, i > 0 ? -1 : 0, n, -n]) {
      const next = c + d;
      if (d === 0 || next < 0 || next >= n * n || !free[next] || seen[next]) continue;
      seen[next] = 1;
      queue.push(next);
    }
  }
  return queue;
}

/** Whether the segment from a to b touches `r`, by clipping it against the rect's slabs. */
function crosses(ax: number, ay: number, bx: number, by: number, r: Rect): boolean {
  let t0 = 0, t1 = 1;
  const dx = bx - ax, dy = by - ay;
  if (dx === 0) { if (ax < r.x || ax > r.x + r.w) return false; } else {
    const a = (r.x - ax) / dx, b = (r.x + r.w - ax) / dx;
    t0 = Math.max(t0, Math.min(a, b)); t1 = Math.min(t1, Math.max(a, b));
  }
  if (dy === 0) { if (ay < r.y || ay > r.y + r.h) return false; } else {
    const a = (r.y - ay) / dy, b = (r.y + r.h - ay) / dy;
    t0 = Math.max(t0, Math.min(a, b)); t1 = Math.min(t1, Math.max(a, b));
  }
  return t0 <= t1;
}

/**
 * The first place where a layer of keyed rects differs from itself turned half way round, or null when it matches everywhere.
 * Rects are compared by what they cover, on the grid of every edge and its turned twin, so two ways of cutting the same shape into rects agree.
 */
function asymmetryOf(rects: readonly { r: Rect; key: number }[], turnKey: (k: number) => number, size: number): Center | null {
  const edges = [...new Set(rects.flatMap(({ r }) => [r.x, r.x + r.w, r.y, r.y + r.h]).flatMap((v) => [v, size - v]).concat(0, size))].sort((a, b) => a - b);
  const index = new Map(edges.map((v, i) => [v, i]));
  const k = edges.length - 1;
  const cover = new Uint8Array(k * k);
  for (const { r, key } of rects) {
    for (let j = index.get(r.y)!; j < index.get(r.y + r.h)!; j++) for (let i = index.get(r.x)!; i < index.get(r.x + r.w)!; i++) cover[j * k + i]! |= key;
  }
  for (let j = 0; j < k; j++) for (let i = 0; i < k; i++) {
    if (turnKey(cover[j * k + i]!) !== cover[(k - 1 - j) * k + (k - 1 - i)]) return { x: (edges[i]! + edges[i + 1]!) / 2, y: (edges[j]! + edges[j + 1]!) / 2 };
  }
  return null;
}

const MATERIAL_KEY = { concrete: 1, sandstone: 2 } as const;
const SPAWN_KEY = { red: 1, blue: 2, ffa: 4 } as const;
const swapTeams = (k: number) => (k & SPAWN_KEY.ffa) | (k & SPAWN_KEY.red ? SPAWN_KEY.blue : 0) | (k & SPAWN_KEY.blue ? SPAWN_KEY.red : 0);

/** The points with no twin at the half turn of any point in the list. */
function unturned(points: readonly Center[], size: number): Center[] {
  const key = (p: Center) => `${p.x},${p.y}`;
  const have = new Map<string, number>();
  for (const p of points) have.set(key(p), (have.get(key(p)) ?? 0) + 1);
  return points.filter((p) => have.get(key({ x: size - p.x, y: size - p.y })) !== have.get(key(p)));
}

/** Every layout problem with a map, worded for whoever draws it; an empty list means it passes. */
export function lintMap(def: MapDef): string[] {
  const problems: string[] = [];
  const n = Math.ceil(def.size / CELL);
  const free = standable(def, n);
  const spawnSides = Object.entries(def.spawns) as [keyof MapDef['spawns'], readonly Rect[]][];

  for (const [side, regions] of spawnSides) {
    regions.forEach((r, i) => {
      const blocked = cellsIn(r, n).filter((c) => !free[c]);
      if (blocked.length) problems.push(`${side} spawn ${i}: a player cannot stand at ${blocked.length} of its spots, first ${where(centerOf(blocked[0]!, n))}`);
    });
  }

  const reached = new Uint8Array(n * n);
  flood(free, n, spawnSides.flatMap(([, regions]) => regions.flatMap((r) => cellsIn(r, n))), reached);
  for (let c = 0; c < n * n; c++) {
    if (!free[c] || reached[c]) continue;
    const pocket = flood(free, n, [c], reached);
    problems.push(`${pocket.length} spots (${pocket.length * CELL * CELL} px²) around ${where(centerOf(c, n))} cannot be walked to from any spawn`);
  }

  def.zones.forEach((z, i) => {
    if (z.x - ZONE_RADIUS < 0 || z.y - ZONE_RADIUS < 0 || z.x + ZONE_RADIUS > def.size || z.y + ZONE_RADIUS > def.size) problems.push(`zone ${i} at ${where(z)} reaches past the map's edge`);
    // A center on a cell edge counts the cells on both sides, so a zone and its turned twin are judged alike.
    const near = (v: number) => [Math.floor((v - 1) / CELL), Math.floor((v + 1) / CELL)].filter((k) => k >= 0 && k < n);
    if (!near(z.y).some((row) => near(z.x).some((col) => reached[row * n + col]))) problems.push(`zone ${i}'s center ${where(z)} cannot be walked to from any spawn`);
    if (def.walls.some((w) => circleHitsRect(z.x, z.y, ZONE_RADIUS, w))) problems.push(`zone ${i} at ${where(z)} overlaps a wall`);
  });

  if (def.siege) return problems;

  const red = def.spawns.red.flatMap((r) => cellsIn(r, n)).map((c) => centerOf(c, n));
  const blue = def.spawns.blue.flatMap((r) => cellsIn(r, n)).map((c) => centerOf(c, n));
  sight: for (const a of red) {
    for (const b of blue) {
      if (def.walls.some((w) => crosses(a.x, a.y, b.x, b.y, w))) continue;
      problems.push(`the red spawn at ${where(a)} can see the blue spawn at ${where(b)}`);
      break sight;
    }
  }

  const walls = asymmetryOf(def.walls.map((r) => ({ r, key: MATERIAL_KEY[r.material] })), (k) => k, def.size);
  if (walls) problems.push(`walls are not the same after a half turn around ${where(walls)}`);
  const spawns = asymmetryOf(spawnSides.flatMap(([side, regions]) => regions.map((r) => ({ r, key: SPAWN_KEY[side] }))), swapTeams, def.size);
  if (spawns) problems.push(`spawns are not the same after a half turn (red for blue) around ${where(spawns)}`);
  for (const c of unturned(def.crates, def.size)) problems.push(`the crate at ${where(c)} has no twin at the half turn`);
  for (const z of unturned(def.zones, def.size)) problems.push(`zone at ${where(z)} has no twin at the half turn`);
  return problems;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const id of MAP_IDS) {
    const problems = lintMap(MAPS[id]);
    console.log(problems.length ? `${id}: ${problems.length} problem(s)\n${problems.map((p) => `  ${p}`).join('\n')}` : `${id}: ok`);
  }
}
