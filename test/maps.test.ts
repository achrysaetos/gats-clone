import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MODE_IDS, WORLD, ZOM } from '../src/shared/defs.ts';
import { CRATE_SIZE, MAP_IDS, MAPS, ROTATION, ZONE_RADIUS, type Center, type MapDef } from '../src/shared/maps.ts';
import { circleHitsRect, rectsOverlap, type Rect } from '../src/shared/sim/movement.ts';

const R = WORLD.playerRadius;
const CELL = 10;

const crateRects = (m: MapDef): Rect[] => m.crates.map((c) => ({ x: c.x - CRATE_SIZE / 2, y: c.y - CRATE_SIZE / 2, w: CRATE_SIZE, h: CRATE_SIZE }));
const inside = (r: Rect, margin: number, S: number) => r.x >= margin && r.y >= margin && r.x + r.w <= S - margin && r.y + r.h <= S - margin;

function placementProblems(m: MapDef): string[] {
  const problems: string[] = [];
  const solids = [...m.walls, ...crateRects(m)];
  m.walls.forEach((w, i) => { if (!inside(w, 0, m.size)) problems.push(`wall ${i} leaves the world`); });
  crateRects(m).forEach((c, i) => {
    if (!inside(c, 0, m.size)) problems.push(`crate ${i} leaves the world`);
    if (m.walls.some((w) => rectsOverlap(w, c))) problems.push(`crate ${i} overlaps a wall`);
  });
  for (const [side, regions] of Object.entries(m.spawns)) {
    if (regions.length === 0) problems.push(`no ${side} spawn region`);
    regions.forEach((r, i) => {
      if (!inside(r, R, m.size)) problems.push(`${side} spawn ${i} lets a player stand past the edge`);
      if (solids.some((s) => rectsOverlap(s, r, R))) problems.push(`${side} spawn ${i} lets a player stand in a wall or crate`);
    });
  }
  if (ROTATION.DOM.some((id) => MAPS[id] === m) && m.zones.length !== 3) problems.push(`${m.zones.length} zones, DOM needs 3`);
  m.zones.forEach((z, i) => { if (crateRects(m).some((s) => circleHitsRect(z.x, z.y, ZONE_RADIUS, s))) problems.push(`zone ${i} overlaps a crate`); });
  return problems;
}

/** Where a player's center can stand, on a CELL grid, treating crates as solid since a door blocked by one is still blocked until it breaks. */
function standable(m: MapDef): boolean[] {
  const S = m.size, N = S / CELL;
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

const cellOf = (p: Center, N: number) => Math.floor(p.y / CELL) * N + Math.floor(p.x / CELL);

function cellsIn(regions: readonly Rect[], N: number): number[] {
  const cells: number[] = [];
  for (const r of regions) {
    for (let y = r.y + CELL / 2; y < r.y + r.h; y += CELL) for (let x = r.x + CELL / 2; x < r.x + r.w; x += CELL) cells.push(cellOf({ x, y }, N));
  }
  return cells;
}

/** Walking distance in cells from the nearest source to every cell, Infinity where unreachable. */
function walk(open: boolean[], sources: number[], N: number): number[] {
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

}

const SIEGE_MAPS = MAP_IDS.filter((id) => MAPS[id].siege);

test('every versus mode rotates through every versus map, and zombies through the siege maps', () => {
  const versus = MAP_IDS.filter((id) => !MAPS[id].siege).sort();
  for (const mode of MODE_IDS) assert.deepEqual([...ROTATION[mode]].sort(), mode === 'ZOM' ? SIEGE_MAPS : versus, mode);
});

for (const id of SIEGE_MAPS) {
  const m = MAPS[id];
  const siege = m.siege!;
  const N = m.size / CELL;
  const core: Rect = { x: siege.core.x - ZOM.coreHalf, y: siege.core.y - ZOM.coreHalf, w: ZOM.coreHalf * 2, h: ZOM.coreHalf * 2 };

  test(`${m.name}: the core and the horde's edges are clear, and the core sits on the wall grid`, () => {
    for (const r of [core, ...siege.horde]) {
      assert.ok(inside(r, 0, m.size), `${JSON.stringify(r)} leaves the world`);
      assert.ok(!m.walls.some((wall) => rectsOverlap(wall, r)), `${JSON.stringify(r)} overlaps a wall`);
    }
    assert.ok(Object.values(m.spawns).flat().every((r) => !rectsOverlap(core, r, R)), 'squad spawns keep a body clear of the core');
    for (const r of [core, ...m.walls]) assert.ok([r.x, r.y, r.w, r.h].every((v) => v % ZOM.cell === 0), `${JSON.stringify(r)} is off the ${ZOM.cell}px grid`);
  });

  test(`${m.name}: every horde edge can walk to the core`, () => {
    const open = standable(m);
    const dist = walk(open, cellsIn([{ x: core.x - R - CELL, y: core.y - R - CELL, w: core.w + 2 * (R + CELL), h: CELL }], N), N);
    const stuck = cellsIn(siege.horde, N).filter((c) => open[c] && dist[c] === Infinity);
    assert.equal(stuck.length, 0, `${stuck.length} horde cells cannot reach the core`);
  });
}
