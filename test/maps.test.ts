import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MODE_IDS, WORLD, ZOM } from '../src/shared/defs.ts';
import { CRATE_SIZE, MAP_IDS, MAPS, ROTATION, ZONE_RADIUS, type Center, type MapDef } from '../src/shared/maps.ts';
import { circleHitsRect, rectsOverlap, type Rect } from '../src/shared/sim/movement.ts';

const S = WORLD.size, R = WORLD.playerRadius;
const CELL = 10;
const N = S / CELL;
const FAIR_TOLERANCE = 0.1;

const crateRects = (m: MapDef): Rect[] => m.crates.map((c) => ({ x: c.x - CRATE_SIZE / 2, y: c.y - CRATE_SIZE / 2, w: CRATE_SIZE, h: CRATE_SIZE }));
const inside = (r: Rect, margin: number) => r.x >= margin && r.y >= margin && r.x + r.w <= S - margin && r.y + r.h <= S - margin;

function placementProblems(m: MapDef): string[] {
  const problems: string[] = [];
  const solids = [...m.walls, ...crateRects(m)];
  m.walls.forEach((w, i) => { if (!inside(w, 0)) problems.push(`wall ${i} leaves the world`); });
  crateRects(m).forEach((c, i) => {
    if (!inside(c, 0)) problems.push(`crate ${i} leaves the world`);
    if (m.walls.some((w) => rectsOverlap(w, c))) problems.push(`crate ${i} overlaps a wall`);
  });
  for (const [side, regions] of Object.entries(m.spawns)) {
    if (regions.length === 0) problems.push(`no ${side} spawn region`);
    regions.forEach((r, i) => {
      if (!inside(r, R)) problems.push(`${side} spawn ${i} lets a player stand past the edge`);
      if (solids.some((s) => rectsOverlap(s, r, R))) problems.push(`${side} spawn ${i} lets a player stand in a wall or crate`);
    });
  }
  if (ROTATION.DOM.some((id) => MAPS[id] === m) && m.zones.length !== 3) problems.push(`${m.zones.length} zones, DOM needs 3`);
  m.zones.forEach((z, i) => {
    if (solids.some((s) => circleHitsRect(z.x, z.y, ZONE_RADIUS, s))) problems.push(`zone ${i} overlaps a wall or crate`);
    if (!inside({ x: z.x - ZONE_RADIUS, y: z.y - ZONE_RADIUS, w: ZONE_RADIUS * 2, h: ZONE_RADIUS * 2 }, 0)) problems.push(`zone ${i} leaves the world`);
  });
  return problems;
}

/** Where a player's center can stand, on a CELL grid, treating crates as solid since a door blocked by one is still blocked until it breaks. */
function standable(m: MapDef): boolean[] {
  const solids = [...m.walls, ...crateRects(m)];
  const open: boolean[] = new Array(N * N);
  for (let gy = 0; gy < N; gy++) {
    for (let gx = 0; gx < N; gx++) {
      const x = (gx + 0.5) * CELL, y = (gy + 0.5) * CELL;
      open[gy * N + gx] = x >= R && y >= R && x <= S - R && y <= S - R && !solids.some((s) => circleHitsRect(x, y, R, s));
    }
  }
  return open;
}

const cellOf = (p: Center) => Math.floor(p.y / CELL) * N + Math.floor(p.x / CELL);

function cellsIn(regions: readonly Rect[]): number[] {
  const cells: number[] = [];
  for (const r of regions) {
    for (let y = r.y + CELL / 2; y < r.y + r.h; y += CELL) for (let x = r.x + CELL / 2; x < r.x + r.w; x += CELL) cells.push(cellOf({ x, y }));
  }
  return cells;
}

/** Walking distance in cells from the nearest source to every cell, Infinity where unreachable. */
function walk(open: boolean[], sources: number[]): number[] {
  const dist = new Array<number>(N * N).fill(Infinity);
  const queue: number[] = [];
  for (const c of sources) if (open[c] && dist[c] === Infinity) { dist[c] = 0; queue.push(c); }
  for (let head = 0; head < queue.length; head++) {
    const c = queue[head]!, x = c % N, y = (c - x) / N;
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      const n = ny * N + nx;
      if (nx < 0 || ny < 0 || nx >= N || ny >= N || !open[n] || dist[n] !== Infinity) continue;
      dist[n] = dist[c]! + 1;
      queue.push(n);
    }
  }
  return dist;
}

for (const id of MAP_IDS) {
  const m = MAPS[id];

  test(`${m.name}: walls and crates sit inside the world, and spawns and zones are clear of them`, () => {
    assert.deepEqual(placementProblems(m), []);
  });

  test(`${m.name}: a player can walk from the red spawn to every open spot`, () => {
    const open = standable(m);
    const dist = walk(open, cellsIn(m.spawns.red));
    const stranded = open.flatMap((o, c) => (o && dist[c] === Infinity ? [`(${(c % N) * CELL}, ${Math.floor(c / N) * CELL})`] : []));
    assert.equal(stranded.length, 0, `unreachable open cells, first: ${stranded.slice(0, 5).join(' ')}`);
  });

  test(`${m.name}: each team's nearest, middle and farthest DOM zone are equally far to walk`, () => {
    const open = standable(m);
    const toZones = (regions: readonly Rect[]) => {
      const dist = walk(open, cellsIn(regions));
      return m.zones.map((z) => dist[cellOf(z)]!).sort((a, b) => a - b);
    };
    const red = toZones(m.spawns.red), blue = toZones(m.spawns.blue);
    red.forEach((r, i) => {
      const b = blue[i]!;
      assert.ok(Number.isFinite(r) && Number.isFinite(b), `zone ${i} unreachable`);
      assert.ok(Math.abs(r - b) <= FAIR_TOLERANCE * Math.max(r, b), `zone rank ${i}: red walks ${r * CELL}, blue walks ${b * CELL}`);
    });
  });
}

const SIEGE_MAPS = MAP_IDS.filter((id) => MAPS[id].siege);

test('every versus mode rotates through every versus map, and zombies through the siege maps', () => {
  const versus = MAP_IDS.filter((id) => !MAPS[id].siege).sort();
  for (const mode of MODE_IDS) assert.deepEqual([...ROTATION[mode]].sort(), mode === 'ZOM' ? SIEGE_MAPS : versus, mode);
});

for (const id of SIEGE_MAPS) {
  const m = MAPS[id];
  const siege = m.siege!;
  const core: Rect = { x: siege.core.x - ZOM.coreHalf, y: siege.core.y - ZOM.coreHalf, w: ZOM.coreHalf * 2, h: ZOM.coreHalf * 2 };

  test(`${m.name}: the core and the horde's edges are clear, and the core sits on the wall grid`, () => {
    for (const r of [core, ...siege.horde]) {
      assert.ok(inside(r, 0), `${JSON.stringify(r)} leaves the world`);
      assert.ok(!m.walls.some((wall) => rectsOverlap(wall, r)), `${JSON.stringify(r)} overlaps a wall`);
    }
    assert.ok(Object.values(m.spawns).flat().every((r) => !rectsOverlap(core, r, R)), 'squad spawns keep a body clear of the core');
    for (const r of [core, ...m.walls]) assert.ok([r.x, r.y, r.w, r.h].every((v) => v % ZOM.cell === 0), `${JSON.stringify(r)} is off the ${ZOM.cell}px grid`);
  });

  test(`${m.name}: every horde edge can walk to the core`, () => {
    const open = standable(m);
    const dist = walk(open, cellsIn([{ x: core.x - R - CELL, y: core.y - R - CELL, w: core.w + 2 * (R + CELL), h: CELL }]));
    const stuck = cellsIn(siege.horde).filter((c) => open[c] && dist[c] === Infinity);
    assert.equal(stuck.length, 0, `${stuck.length} horde cells cannot reach the core`);
  });
}
