/// <reference types="node" />
// Usage: node scripts/map-lint.ts
import { fileURLToPath } from 'node:url';
import { EXT, GUN_IDS, GUNS, WORLD, ZOM, type ModeId } from '../src/shared/defs.ts';
import { KIT, placed } from '../src/shared/kit.ts';
import { MAP_IDS, MAPS, modesOn, ZONE_RADIUS, type Center, type MapDef } from '../src/shared/maps.ts';
import type { TrainDef } from '../src/shared/sim/train.ts';
import { circleHitsRect, rectsOverlap, type Rect } from '../src/shared/sim/movement.ts';

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

/** Last Squad's ring table is scaled for maps this size. */
export const ROYALE_SIZE = 4000;
/** Clear ground kept between the train's lane and any spawn, zone, terminal, pad or core. */
export const LANE_MARGIN = 100;
/** The longest stretch of lane, from an end or between crossings, that nobody can cross. */
export const CROSSING_SPACING = 1600;
/** A crossing's signal or warning light stands within this of the crossing. */
export const SIGNAL_REACH = 300;
const SIGNALS = new Set(['signal', 'alarm']);

/** Without a list, a map is judged for the modes its sections suggest: a siege map for zombies, an extraction map for extraction, else the versus modes. */
const modesFor = (def: MapDef): readonly ModeId[] => (def.siege ? ['ZOM'] : def.extract ? ['EXT'] : ['FFA', 'TDM', 'DOM']);

export function lintMap(def: MapDef, modes: readonly ModeId[] = modesFor(def)): string[] {
  const problems: string[] = [];
  const n = Math.ceil(def.size / CELL);
  const free = standable(def, n);
  const crates = crateRects(def);
  const inside = (r: Rect, margin: number) => r.x >= margin && r.y >= margin && r.x + r.w <= def.size - margin && r.y + r.h <= def.size - margin;
  def.walls.forEach((w, i) => { if (!inside(w, 0)) problems.push(`wall ${i} leaves the world`); });
  const feet = standsOn(def);
  feet.forEach((a, i) => {
    if (!inside(a.foot, 0)) problems.push(`${a.at.p} at ${where(a.foot)} leaves the world`);
    for (const b of feet.slice(i + 1)) if (rectsOverlap(a.foot, b.foot)) problems.push(`${a.at.p} at ${where(a.foot)} overlaps ${b.at.p} at ${where(b.foot)}`);
  });
  crates.forEach((c, i) => {
    if (!inside(c, 0)) problems.push(`crate ${i} leaves the world`);
    if (def.walls.some((w) => rectsOverlap(w, c))) problems.push(`crate ${i} overlaps a wall`);
  });
  const ext = def.extract;
  const spawnSides = [...Object.entries(def.spawns), ...(ext ? [['attack', ext.attack], ['defend', ext.defend]] : [])] as [string, readonly Rect[]][];

  for (const [side, regions] of spawnSides) {
    if (regions.length === 0) problems.push(`no ${side} spawn region`);
    regions.forEach((r, i) => {
      if (!inside(r, R)) problems.push(`${side} spawn ${i} lets a player stand past the edge`);
      const hit = [...def.walls, ...def.fences, ...crates].find((s) => rectsOverlap(s, r, R));
      if (hit) problems.push(`${side} spawn ${i} lets a player stand in the wall or crate at ${where(hit)}`);
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
    problems.push(`${pocket.length} spots (${pocket.length * CELL * CELL} px²) around ${where(centerOf(c, n))} cannot be walked to from any spawn`);
  }

  def.zones.forEach((z, i) => {
    if (z.x - ZONE_RADIUS < 0 || z.y - ZONE_RADIUS < 0 || z.x + ZONE_RADIUS > def.size || z.y + ZONE_RADIUS > def.size) problems.push(`zone ${i} at ${where(z)} reaches past the map's edge`);
    if (!reachedAt(z)) problems.push(`zone ${i}'s center ${where(z)} cannot be walked to from any spawn`);
    const wall = def.walls.find((w) => circleHitsRect(z.x, z.y, ZONE_RADIUS, w));
    if (wall) problems.push(`zone ${i} at ${where(z)} overlaps the wall at ${where(wall)}`);
    if (crates.some((c) => circleHitsRect(z.x, z.y, ZONE_RADIUS, c))) problems.push(`zone ${i} at ${where(z)} overlaps a crate`);
  });

  if (def.train) problems.push(...laneProblems(def, def.train, free, n));
  if (modes.includes('ZOM') && !def.siege) problems.push('zombies needs a siege section: a core and the horde\'s edges');
  if (modes.includes('BR') && def.size !== ROYALE_SIZE) problems.push(`Last Squad needs a ${ROYALE_SIZE} map for its ring, not ${def.size}`);
  if (modes.includes('EXT')) {
    if (ext) extractProblems(problems, def, ext, crates, n, reachedAt, inside);
    else problems.push('extraction needs an extract section');
  }
  if (modes.includes('DOM') && def.zones.length !== 3) problems.push(`${def.zones.length} zones, DOM needs 3`);
  if (modes.includes('TDM') || modes.includes('DOM')) fairness(problems, def, crates, n);
  return problems;
}

function extractProblems(problems: string[], def: MapDef, ext: NonNullable<MapDef['extract']>, crates: readonly Rect[], n: number, reachedAt: (p: Center) => boolean, inside: (r: Rect, margin: number) => boolean) {
  const t = ext.terminal, r = EXT.terminalR;
  if (t.x - r < 0 || t.y - r < 0 || t.x + r > def.size || t.y + r > def.size) problems.push(`the terminal at ${where(t)} reaches past the map's edge`);
  if (!reachedAt(t)) problems.push(`the terminal at ${where(t)} cannot be walked to from any spawn`);
  const blocking = [...def.walls, ...def.fences, ...crates].find((s) => circleHitsRect(t.x, t.y, r, s));
  if (blocking) problems.push(`the terminal's circle at ${where(t)} overlaps the solid at ${where(blocking)}`);
  const pad = ext.pad, padCenter = { x: pad.x + pad.w / 2, y: pad.y + pad.h / 2 };
  if (!inside(pad, 0)) problems.push(`the pad at ${where(pad)} leaves the world`);
  if (!reachedAt(padCenter)) problems.push(`the pad at ${where(pad)} cannot be walked to from any spawn`);
  const onPad = [...def.walls, ...def.fences, ...crates].find((s) => rectsOverlap(s, pad));
  if (onPad) problems.push(`the pad at ${where(pad)} holds the solid at ${where(onPad)}`);
  sees(problems, ext.attack, ext.defend, n, def, 'attack', 'defend');
}

/** Two sides that spawn apart and fight on a map that is the same after a half turn, red for blue. */
function fairness(problems: string[], def: MapDef, crates: readonly Rect[], n: number) {
  sees(problems, def.spawns.red, def.spawns.blue, n, def, 'red', 'blue');
  const walls = asymmetryOf(def.walls.map((r) => ({ r, key: MATERIAL_KEY[r.material] })), (k) => k, def.size);
  if (walls) problems.push(`walls are not the same after a half turn around ${where(walls)}`);
  const spawns = asymmetryOf((Object.entries(def.spawns) as [keyof MapDef['spawns'], readonly Rect[]][]).flatMap(([side, regions]) => regions.map((r) => ({ r, key: SPAWN_KEY[side] }))), swapTeams, def.size);
  if (spawns) problems.push(`spawns are not the same after a half turn (red for blue) around ${where(spawns)}`);
  for (const c of withoutHalfTurnTwin(crates.map((r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 })), def.size)) problems.push(`the breakable at ${where(c)} has no twin at the half turn`);
  for (const z of withoutHalfTurnTwin(def.zones, def.size)) problems.push(`zone at ${where(z)} has no twin at the half turn`);
}

/**
 * The train's lane runs edge to edge over track and holds nothing that stands; spawns, zones and objectives keep `LANE_MARGIN` clear of it;
 * and players can cross it at gaps no more than `CROSSING_SPACING` apart, each with a signal or warning light beside it.
 */
function laneProblems(def: MapDef, train: TrainDef, free: Uint8Array, n: number): string[] {
  const problems: string[] = [];
  const { lane } = train;
  const alongX = train.axis === 'x';
  const [from, span] = alongX ? [lane.x, lane.w] : [lane.y, lane.h];
  if (from !== 0 || span !== def.size) problems.push(`the train's lane runs ${from} to ${from + span}, not edge to edge`);
  if (lane.x < 0 || lane.y < 0 || lane.x + lane.w > def.size || lane.y + lane.h > def.size) problems.push('the train\'s lane leaves the world');
  for (const at of def.pieces) {
    const foot = placed(at).foot;
    if (KIT[at.p].height > 0 && !KIT[at.p].overhead && rectsOverlap(foot, lane)) problems.push(`${at.p} at ${where(foot)} stands in the train's lane`);
  }
  const tracks = def.pieces.filter((at) => at.p === 'track').map((at) => placed(at).foot);
  for (let d = CELL; d < span; d += CELL * 2) {
    const p = alongX ? { x: lane.x + d, y: lane.y + lane.h / 2 } : { x: lane.x + lane.w / 2, y: lane.y + d };
    if (!tracks.some((t) => p.x >= t.x && p.x <= t.x + t.w && p.y >= t.y && p.y <= t.y + t.h)) { problems.push(`the train's lane has no track under ${where(p)}`); break; }
  }

  const clearOf = R + LANE_MARGIN;
  const ext = def.extract;
  const regions: [string, readonly Rect[]][] = [...Object.entries(def.spawns), ...(ext ? [['attack', ext.attack], ['defend', ext.defend]] as [string, readonly Rect[]][] : [])];
  for (const [side, rs] of regions) rs.forEach((r, i) => { if (rectsOverlap(r, lane, clearOf)) problems.push(`${side} spawn ${i} is within ${clearOf} of the train's lane`); });
  def.zones.forEach((z, i) => { if (circleHitsRect(z.x, z.y, ZONE_RADIUS + LANE_MARGIN, lane)) problems.push(`zone ${i} at ${where(z)} is within ${LANE_MARGIN} of the train's lane`); });
  if (ext && circleHitsRect(ext.terminal.x, ext.terminal.y, EXT.terminalR + LANE_MARGIN, lane)) problems.push(`the terminal at ${where(ext.terminal)} is within ${LANE_MARGIN} of the train's lane`);
  if (ext && rectsOverlap(ext.pad, lane, LANE_MARGIN)) problems.push(`the pad at ${where(ext.pad)} is within ${LANE_MARGIN} of the train's lane`);
  const core = def.siege?.core;
  if (core && circleHitsRect(core.x, core.y, ZOM.coreHalf * Math.SQRT2 + LANE_MARGIN, lane)) problems.push(`the core at ${where(core)} is within ${LANE_MARGIN} of the train's lane`);

  // A crossing is a run of the lane where a player can stand just off both edges.
  const standsAt = (p: Center) => p.x >= 0 && p.y >= 0 && p.x < def.size && p.y < def.size && free[Math.floor(p.y / CELL) * n + Math.floor(p.x / CELL)] === 1;
  const off = R + CELL / 2;
  const sides = (d: number): [Center, Center] => (alongX
    ? [{ x: d, y: lane.y - off }, { x: d, y: lane.y + lane.h + off }]
    : [{ x: lane.x - off, y: d }, { x: lane.x + lane.w + off, y: d }]);
  const crossings: { a: number; b: number }[] = [];
  for (let d = from + CELL / 2; d < from + span; d += CELL) {
    if (!sides(d).every(standsAt)) continue;
    const last = crossings.at(-1);
    if (last && last.b === d - CELL) last.b = d; else crossings.push({ a: d, b: d });
  }
  const gaps = crossings.filter((c) => c.b - c.a >= CELL);
  if (gaps.length < 2) problems.push(`the train's lane has ${gaps.length} crossing(s), it needs at least 2`);
  const stops = [from, ...gaps.flatMap((g) => [g.a, g.b]), from + span];
  for (let i = 0; i + 1 < stops.length; i += 2) {
    if (stops[i + 1]! - stops[i]! > CROSSING_SPACING) problems.push(`the train's lane runs ${Math.round(stops[i + 1]! - stops[i]!)} from ${Math.round(stops[i]!)} without a crossing, more than ${CROSSING_SPACING}`);
  }
  const signals = def.pieces.filter((at) => SIGNALS.has(at.p)).map((at) => placed(at).foot).filter((f) => !rectsOverlap(f, lane))
    .map((f) => ({ x: f.x + f.w / 2, y: f.y + f.h / 2 }));
  for (const g of gaps) {
    const seg: Rect = alongX ? { x: g.a, y: lane.y, w: g.b - g.a, h: lane.h } : { x: lane.x, y: g.a, w: lane.w, h: g.b - g.a };
    if (!signals.some((s) => circleHitsRect(s.x, s.y, SIGNAL_REACH, seg))) problems.push(`the crossing at ${where({ x: seg.x + seg.w / 2, y: seg.y + seg.h / 2 })} has no signal or warning light within ${SIGNAL_REACH}`);
  }
  return problems;
}

function sees(problems: string[], one: readonly Rect[], other: readonly Rect[], n: number, def: MapDef, oneName: string, otherName: string) {
  const red = one.flatMap((r) => cellsIn(r, n)).map((c) => centerOf(c, n));
  const blue = other.flatMap((r) => cellsIn(r, n)).map((c) => centerOf(c, n));
  for (const a of red) {
    for (const b of blue) {
      if (def.walls.some((w) => crosses(a.x, a.y, b.x, b.y, w))) continue;
      problems.push(`the ${oneName} spawn at ${where(a)} can see the ${otherName} spawn at ${where(b)}`);
      return;
    }
  }
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
    const problems = lintMap(MAPS[id], modesOn(id));
    console.log(problems.length ? `${id}: ${problems.length} problem(s)\n${problems.map((p) => `  ${p}`).join('\n')}` : `${id}: ok`);
    const lines = sightlines(MAPS[id]).sort((a, b) => b.length - a.length);
    const over = (min: number) => lines.filter((l) => l.length > min).length;
    const top = lines[0];
    if (top) console.log(`  longest sightline ${Math.round(top.length)}px ${where(top.from)} to ${where(top.to)}; ${over(reach)} lines past the longest gun (${reach}px), ${over(reach + WORLD.viewRadius)} past it plus the view (${reach + WORLD.viewRadius}px)`);
  }
}
