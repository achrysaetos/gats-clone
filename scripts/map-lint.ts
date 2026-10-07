/// <reference types="node" />
// Usage: node scripts/map-lint.ts
import { fileURLToPath } from 'node:url';
import { BARREL, GUN_IDS, GUNS, WORLD } from '../src/shared/defs.ts';
import { CRATE_SIZE, MAP_IDS, MAPS, ZONE_RADIUS, type Center, type MapDef } from '../src/shared/maps.ts';
import { circleHitsRect, rectsOverlap, type Rect } from '../src/shared/sim/movement.ts';

export const CELL = 25;
const R = WORLD.playerRadius;

export function standable(def: MapDef, n: number): Uint8Array {
  const free = new Uint8Array(n * n);
  const at = (i: number) => (i + 0.5) * CELL;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) free[j * n + i] = at(i) >= R && at(j) >= R && at(i) <= def.size - R && at(j) <= def.size - R ? 1 : 0;
  for (const s of [...def.walls, ...crateRects(def), ...barrelRects(def)]) {
    const i0 = Math.max(0, Math.floor((s.x - R) / CELL)), i1 = Math.min(n - 1, Math.floor((s.x + s.w + R) / CELL));
    const j0 = Math.max(0, Math.floor((s.y - R) / CELL)), j1 = Math.min(n - 1, Math.floor((s.y + s.h + R) / CELL));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (circleHitsRect(at(i), at(j), R, s)) free[j * n + i] = 0;
  }
  return free;
}

const crateRects = (def: MapDef): Rect[] => def.crates.map((c) => ({ x: c.x - CRATE_SIZE / 2, y: c.y - CRATE_SIZE / 2, w: CRATE_SIZE, h: CRATE_SIZE }));
const barrelRects = (def: MapDef): Rect[] => def.barrels.map((b) => ({ x: b.x - BARREL.size / 2, y: b.y - BARREL.size / 2, w: BARREL.size, h: BARREL.size }));
const centerOf = (c: number, n: number): Center => ({ x: ((c % n) + 0.5) * CELL, y: (Math.floor(c / n) + 0.5) * CELL });
/** The raster cells on both sides of `v` when it sits on a cell edge, so a zone and its turned twin are judged alike. */
const cellsEitherSide = (v: number, n: number) => [Math.floor((v - 1) / CELL), Math.floor((v + 1) / CELL)].filter((k) => k >= 0 && k < n);
const where = (p: Center) => `(${Math.round(p.x)}, ${Math.round(p.y)})`;

export function cellsIn(r: Rect, n: number): number[] {
  const cells: number[] = [];
  const i0 = Math.max(0, Math.ceil(r.x / CELL - 0.5)), j0 = Math.max(0, Math.ceil(r.y / CELL - 0.5));
  for (let j = j0; j < n && (j + 0.5) * CELL < r.y + r.h; j++) for (let i = i0; i < n && (i + 0.5) * CELL < r.x + r.w; i++) cells.push(j * n + i);
  return cells;
}

export function flood(free: Uint8Array, n: number, sources: readonly number[], seen: Uint8Array): number[] {
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

const MATERIAL_KEY = { concrete: 1, sandstone: 2, planter: 4 } as const;
const SPAWN_KEY = { red: 1, blue: 2, ffa: 4 } as const;
const swapTeams = (k: number) => (k & SPAWN_KEY.ffa) | (k & SPAWN_KEY.red ? SPAWN_KEY.blue : 0) | (k & SPAWN_KEY.blue ? SPAWN_KEY.red : 0);

function withoutHalfTurnTwin(points: readonly Center[], size: number): Center[] {
  const key = (p: Center) => `${p.x},${p.y}`;
  const have = new Map<string, number>();
  for (const p of points) have.set(key(p), (have.get(key(p)) ?? 0) + 1);
  return points.filter((p) => have.get(key({ x: size - p.x, y: size - p.y })) !== have.get(key(p)));
}

export function lintMap(def: MapDef): string[] {
  const problems: string[] = [];
  const n = Math.ceil(def.size / CELL);
  const free = standable(def, n);
  const crates = crateRects(def);
  const inside = (r: Rect, margin: number) => r.x >= margin && r.y >= margin && r.x + r.w <= def.size - margin && r.y + r.h <= def.size - margin;
  def.walls.forEach((w, i) => { if (!inside(w, 0)) problems.push(`wall ${i} leaves the world`); });
  crates.forEach((c, i) => {
    if (!inside(c, 0)) problems.push(`crate ${i} leaves the world`);
    if (def.walls.some((w) => rectsOverlap(w, c))) problems.push(`crate ${i} overlaps a wall`);
  });
  const barrels = barrelRects(def);
  barrels.forEach((b, i) => {
    if (!inside(b, 0)) problems.push(`barrel ${i} leaves the world`);
    if (def.walls.some((w) => rectsOverlap(w, b))) problems.push(`barrel ${i} at ${where(def.barrels[i]!)} overlaps a wall`);
    if (crates.some((c) => rectsOverlap(c, b))) problems.push(`barrel ${i} at ${where(def.barrels[i]!)} overlaps a crate`);
    if (barrels.some((o, j) => j > i && rectsOverlap(o, b))) problems.push(`barrel ${i} at ${where(def.barrels[i]!)} overlaps another barrel`);
    for (const [side, regions] of Object.entries(def.spawns)) {
      if (regions.some((r) => rectsOverlap(r, b, WORLD.playerRadius + BARREL.spawnGap))) problems.push(`barrel ${i} at ${where(def.barrels[i]!)} sits within ${BARREL.spawnGap}px of a ${side} spawn`);
    }
  });
  const spawnSides = Object.entries(def.spawns) as [keyof MapDef['spawns'], readonly Rect[]][];

  for (const [side, regions] of spawnSides) {
    if (regions.length === 0) problems.push(`no ${side} spawn region`);
    regions.forEach((r, i) => {
      if (!inside(r, R)) problems.push(`${side} spawn ${i} lets a player stand past the edge`);
      if ([...def.walls, ...crates].some((s) => rectsOverlap(s, r, R))) problems.push(`${side} spawn ${i} lets a player stand in a wall or crate`);
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
    if (!cellsEitherSide(z.y, n).some((row) => cellsEitherSide(z.x, n).some((col) => reached[row * n + col]))) problems.push(`zone ${i}'s center ${where(z)} cannot be walked to from any spawn`);
    if (def.walls.some((w) => circleHitsRect(z.x, z.y, ZONE_RADIUS, w))) problems.push(`zone ${i} at ${where(z)} overlaps a wall`);
    if (crates.some((c) => circleHitsRect(z.x, z.y, ZONE_RADIUS, c))) problems.push(`zone ${i} at ${where(z)} overlaps a crate`);
    if (barrels.some((b) => circleHitsRect(z.x, z.y, ZONE_RADIUS, b))) problems.push(`zone ${i} at ${where(z)} overlaps a barrel`);
  });

  if (def.siege) return problems;
  if (def.zones.length !== 3) problems.push(`${def.zones.length} zones, DOM needs 3`);

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
  for (const c of withoutHalfTurnTwin(def.crates, def.size)) problems.push(`the crate at ${where(c)} has no twin at the half turn`);
  for (const b of withoutHalfTurnTwin(def.barrels, def.size)) problems.push(`the barrel at ${where(b)} has no twin at the half turn`);
  for (const z of withoutHalfTurnTwin(def.zones, def.size)) problems.push(`zone at ${where(z)} has no twin at the half turn`);
  return problems;
}

function sightlines(def: MapDef): { from: Center; to: Center; length: number }[] {
  const step = 50, lines: { from: Center; to: Center; length: number }[] = [];
  const inside = (p: Center) => p.x > 0 && p.y > 0 && p.x < def.size && p.y < def.size;
  const blocked = (p: Center) => def.walls.some((w) => p.x >= w.x && p.x <= w.x + w.w && p.y >= w.y && p.y <= w.y + w.h);
  const starts: { p: Center; d: Center }[] = [];
  for (let v = step / 2; v < def.size; v += step) {
    starts.push({ p: { x: 0.5, y: v }, d: { x: 1, y: 0 } }, { p: { x: v, y: 0.5 }, d: { x: 0, y: 1 } });
    starts.push({ p: { x: v, y: 0.5 }, d: { x: 1, y: 1 } }, { p: { x: 0.5, y: v }, d: { x: 1, y: 1 } });
    starts.push({ p: { x: v, y: 0.5 }, d: { x: -1, y: 1 } }, { p: { x: def.size - 0.5, y: v }, d: { x: -1, y: 1 } });
  }
  for (const { p, d } of starts) {
    const unit = step / Math.hypot(d.x, d.y) / Math.SQRT2;
    let from: Center | null = null, last = p;
    for (let q = p; inside(q); q = { x: q.x + d.x * unit, y: q.y + d.y * unit }) {
      if (blocked(q)) { if (from) lines.push({ from, to: last, length: Math.hypot(last.x - from.x, last.y - from.y) }); from = null; } else from ??= q;
      last = q;
    }
    if (from) lines.push({ from, to: last, length: Math.hypot(last.x - from.x, last.y - from.y) });
  }
  return lines;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const reach = Math.max(...GUN_IDS.map((g) => GUNS[g].range));
  for (const id of MAP_IDS) {
    const problems = lintMap(MAPS[id]);
    console.log(problems.length ? `${id}: ${problems.length} problem(s)\n${problems.map((p) => `  ${p}`).join('\n')}` : `${id}: ok`);
    const lines = sightlines(MAPS[id]).sort((a, b) => b.length - a.length);
    const over = (min: number) => lines.filter((l) => l.length > min).length;
    const top = lines[0];
    if (top) console.log(`  longest sightline ${Math.round(top.length)}px ${where(top.from)} to ${where(top.to)}; ${over(reach)} lines past the longest gun (${reach}px), ${over(reach + WORLD.viewRadius)} past it plus the view (${reach + WORLD.viewRadius}px)`);
  }
}
