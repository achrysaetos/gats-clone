import { EXT, WORLD } from './defs.ts';
import { KIT, placed } from './kit.ts';
import { ZONE_RADIUS, type Center, type MapDef } from './maps.ts';
import { circleHitsRect, rectsOverlap, type Rect } from './sim/movement.ts';

/**
 * The layout checks every map must pass: shared by `scripts/map-lint.ts`, the tests and the map editor, which marks each
 * problem on the map at `at`, or lists it without a place when it has none.
 */
export type Problem = { text: string; at: Center | null };

export const CELL = 25;
const R = WORLD.playerRadius;

export function standable(def: MapDef, n: number): Uint8Array {
  const free = new Uint8Array(n * n);
  const at = (i: number) => (i + 0.5) * CELL;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) free[j * n + i] = at(i) >= R && at(j) >= R && at(i) <= def.size - R && at(j) <= def.size - R ? 1 : 0;
  for (const s of [...def.walls, ...def.fences, ...crateRects(def)]) {
    const i0 = Math.max(0, Math.floor((s.x - R) / CELL)), i1 = Math.min(n - 1, Math.floor((s.x + s.w + R) / CELL));
    const j0 = Math.max(0, Math.floor((s.y - R) / CELL)), j1 = Math.min(n - 1, Math.floor((s.y + s.h + R) / CELL));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (circleHitsRect(at(i), at(j), R, s)) free[j * n + i] = 0;
  }
  return free;
}

const crateRects = (def: MapDef): Rect[] => def.breakables.flatMap((at) => placed(at).solids);
/** What a piece stands on, for spotting two pieces drawn into each other: paint and overhead pieces lie in other layers. */
const standsOn = (def: MapDef) => def.pieces.filter((at) => KIT[at.p].height > 0 && !KIT[at.p].overhead).map((at) => ({ at, foot: placed(at).foot }));
const centerOf = (c: number, n: number): Center => ({ x: ((c % n) + 0.5) * CELL, y: (Math.floor(c / n) + 0.5) * CELL });
/** The raster cells on both sides of `v` when it sits on a cell edge, so a zone and its turned twin are judged alike. */
const cellsEitherSide = (v: number, n: number) => [Math.floor((v - 1) / CELL), Math.floor((v + 1) / CELL)].filter((k) => k >= 0 && k < n);
const mid = (r: Rect): Center => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
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

const MATERIAL_KEY = { concrete: 1, metal: 2, wood: 4, planter: 8, sandbag: 16 } as const;
const SPAWN_KEY = { red: 1, blue: 2, ffa: 4 } as const;
const swapTeams = (k: number) => (k & SPAWN_KEY.ffa) | (k & SPAWN_KEY.red ? SPAWN_KEY.blue : 0) | (k & SPAWN_KEY.blue ? SPAWN_KEY.red : 0);

function withoutHalfTurnTwin(points: readonly Center[], size: number): Center[] {
  const key = (p: Center) => `${p.x},${p.y}`;
  const have = new Map<string, number>();
  for (const p of points) have.set(key(p), (have.get(key(p)) ?? 0) + 1);
  return points.filter((p) => have.get(key({ x: size - p.x, y: size - p.y })) !== have.get(key(p)));
}

export function lintMap(def: MapDef): Problem[] {
  const problems: Problem[] = [];
  const note = (text: string, at: Center | Rect | null) => problems.push({ text, at: at && ('w' in at ? mid(at) : at) });
  const n = Math.ceil(def.size / CELL);
  const free = standable(def, n);
  const crates = crateRects(def);
  const inside = (r: Rect, margin: number) => r.x >= margin && r.y >= margin && r.x + r.w <= def.size - margin && r.y + r.h <= def.size - margin;
  def.walls.forEach((w, i) => { if (!inside(w, 0)) note(`wall ${i} leaves the world`, w); });
  const feet = standsOn(def);
  feet.forEach((a, i) => {
    if (!inside(a.foot, 0)) note(`${a.at.p} at ${where(a.foot)} leaves the world`, a.foot);
    for (const b of feet.slice(i + 1)) if (rectsOverlap(a.foot, b.foot)) note(`${a.at.p} at ${where(a.foot)} overlaps ${b.at.p} at ${where(b.foot)}`, b.foot);
  });
  crates.forEach((c, i) => {
    if (!inside(c, 0)) note(`crate ${i} leaves the world`, c);
    if (def.walls.some((w) => rectsOverlap(w, c))) note(`crate ${i} overlaps a wall`, c);
  });
  const ext = def.extract;
  const spawnSides = [...Object.entries(def.spawns), ...(ext ? [['attack', ext.attack], ['defend', ext.defend]] : [])] as [string, readonly Rect[]][];

  for (const [side, regions] of spawnSides) {
    if (regions.length === 0) note(`no ${side} spawn region`, null);
    regions.forEach((r, i) => {
      if (!inside(r, R)) note(`${side} spawn ${i} lets a player stand past the edge`, r);
      const hit = [...def.walls, ...def.fences, ...crates].find((s) => rectsOverlap(s, r, R));
      if (hit) note(`${side} spawn ${i} lets a player stand in the wall or crate at ${where(hit)}`, hit);
    });
  }

  const reached = new Uint8Array(n * n);
  flood(free, n, spawnSides.flatMap(([, regions]) => regions.flatMap((r) => cellsIn(r, n))), reached);
  // Flooding each pocket marks it seen, so what a spawn reaches is kept apart from it.
  const fromSpawn = reached.slice();
  const reachedAt = (p: Center) => cellsEitherSide(p.y, n).some((row) => cellsEitherSide(p.x, n).some((col) => fromSpawn[row * n + col]));
  for (let c = 0; c < n * n; c++) {
    if (!free[c] || reached[c]) continue;
    const pocket = flood(free, n, [c], reached);
    note(`${pocket.length} spots (${pocket.length * CELL * CELL} px²) around ${where(centerOf(c, n))} cannot be walked to from any spawn`, centerOf(c, n));
  }

  def.zones.forEach((z, i) => {
    if (z.x - ZONE_RADIUS < 0 || z.y - ZONE_RADIUS < 0 || z.x + ZONE_RADIUS > def.size || z.y + ZONE_RADIUS > def.size) note(`zone ${i} at ${where(z)} reaches past the map's edge`, z);
    if (!reachedAt(z)) note(`zone ${i}'s center ${where(z)} cannot be walked to from any spawn`, z);
    const wall = def.walls.find((w) => circleHitsRect(z.x, z.y, ZONE_RADIUS, w));
    if (wall) note(`zone ${i} at ${where(z)} overlaps the wall at ${where(wall)}`, z);
    if (crates.some((c) => circleHitsRect(z.x, z.y, ZONE_RADIUS, c))) note(`zone ${i} at ${where(z)} overlaps a crate`, z);
  });

  if (def.siege) return problems;
  if (ext) {
    const t = ext.terminal, r = EXT.terminalR;
    if (t.x - r < 0 || t.y - r < 0 || t.x + r > def.size || t.y + r > def.size) note(`the terminal at ${where(t)} reaches past the map's edge`, t);
    if (!reachedAt(t)) note(`the terminal at ${where(t)} cannot be walked to from any spawn`, t);
    const blocking = [...def.walls, ...def.fences, ...crates].find((s) => circleHitsRect(t.x, t.y, r, s));
    if (blocking) note(`the terminal's circle at ${where(t)} overlaps the solid at ${where(blocking)}`, t);
    const pad = ext.pad, padCenter = { x: pad.x + pad.w / 2, y: pad.y + pad.h / 2 };
    if (!inside(pad, 0)) note(`the pad at ${where(pad)} leaves the world`, pad);
    if (!reachedAt(padCenter)) note(`the pad at ${where(pad)} cannot be walked to from any spawn`, pad);
    const onPad = [...def.walls, ...def.fences, ...crates].find((s) => rectsOverlap(s, pad));
    if (onPad) note(`the pad at ${where(pad)} holds the solid at ${where(onPad)}`, onPad);
    sees(problems, ext.attack, ext.defend, n, def, 'attack', 'defend');
    return problems;
  }
  if (def.zones.length !== 3) note(`${def.zones.length} zones, DOM needs 3`, null);

  sees(problems, def.spawns.red, def.spawns.blue, n, def, 'red', 'blue');

  const walls = asymmetryOf(def.walls.map((r) => ({ r, key: MATERIAL_KEY[r.material] })), (k) => k, def.size);
  if (walls) note(`walls are not the same after a half turn around ${where(walls)}`, walls);
  const spawns = asymmetryOf((Object.entries(def.spawns) as [keyof MapDef['spawns'], readonly Rect[]][]).flatMap(([side, regions]) => regions.map((r) => ({ r, key: SPAWN_KEY[side] }))), swapTeams, def.size);
  if (spawns) note(`spawns are not the same after a half turn (red for blue) around ${where(spawns)}`, spawns);
  for (const c of withoutHalfTurnTwin(crates.map((r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 })), def.size)) note(`the breakable at ${where(c)} has no twin at the half turn`, c);
  for (const z of withoutHalfTurnTwin(def.zones, def.size)) note(`zone at ${where(z)} has no twin at the half turn`, z);
  return problems;
}

function sees(problems: Problem[], one: readonly Rect[], other: readonly Rect[], n: number, def: MapDef, oneName: string, otherName: string) {
  const red = one.flatMap((r) => cellsIn(r, n)).map((c) => centerOf(c, n));
  const blue = other.flatMap((r) => cellsIn(r, n)).map((c) => centerOf(c, n));
  for (const a of red) {
    for (const b of blue) {
      if (def.walls.some((w) => crosses(a.x, a.y, b.x, b.y, w))) continue;
      problems.push({ text: `the ${oneName} spawn at ${where(a)} can see the ${otherName} spawn at ${where(b)}`, at: a });
      return;
    }
  }
}
