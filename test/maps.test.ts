import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MODE_IDS, WORLD, ZOM } from '../src/shared/defs.ts';
import { MAP_IDS, MAPS, ROTATION } from '../src/shared/maps.ts';
import { rectsOverlap, type Rect } from '../src/shared/sim/movement.ts';
import { CELL, cellsIn, flood, standable } from '../src/shared/maplint.ts';

const R = WORLD.playerRadius;

const SIEGE_MAPS = MAP_IDS.filter((id) => MAPS[id].siege);

const EXTRACT_MAPS = MAP_IDS.filter((id) => MAPS[id].extract);

test('every map is played, every mode has a map, zombies plays every siege map and extraction every extraction map', () => {
  for (const id of MAP_IDS) assert.ok(MODE_IDS.some((mode) => ROTATION[mode].includes(id)), `${id} is in no rotation`);
  for (const mode of MODE_IDS) assert.ok(ROTATION[mode].length > 0, `${mode} has no map`);
  assert.deepEqual([...ROTATION.ZOM].sort(), [...SIEGE_MAPS].sort());
  assert.deepEqual([...ROTATION.EXT].sort(), [...EXTRACT_MAPS].sort());
});

for (const id of SIEGE_MAPS) {
  const m = MAPS[id];
  const siege = m.siege!;
  const core: Rect = { x: siege.core.x - ZOM.coreHalf, y: siege.core.y - ZOM.coreHalf, w: ZOM.coreHalf * 2, h: ZOM.coreHalf * 2 };

  test(`${m.name}: the core and the horde's edges are clear, and the core sits on the wall grid`, () => {
    for (const r of [core, ...Object.values(siege.horde)]) {
      assert.ok(r.x >= 0 && r.y >= 0 && r.x + r.w <= m.size && r.y + r.h <= m.size, `${JSON.stringify(r)} leaves the world`);
      assert.ok(!m.walls.some((wall) => rectsOverlap(wall, r)), `${JSON.stringify(r)} overlaps a wall`);
    }
    assert.ok(Object.values(m.spawns).flat().every((r) => !rectsOverlap(core, r, R)), 'squad spawns keep a body clear of the core');
    for (const r of [core, ...m.walls]) assert.ok([r.x, r.y, r.w, r.h].every((v) => v % ZOM.cell === 0), `${JSON.stringify(r)} is off the ${ZOM.cell}px grid`);
  });

  test(`${m.name}: every horde edge can walk to the core`, () => {
    const n = Math.ceil(m.size / CELL);
    const free = standable(m, n);
    const reached = new Uint8Array(n * n);
    flood(free, n, cellsIn({ x: core.x - R - CELL, y: core.y - R - CELL, w: core.w + 2 * (R + CELL), h: CELL }, n), reached);
    const stuck = Object.values(siege.horde).flatMap((r) => cellsIn(r, n)).filter((c) => free[c] && !reached[c]);
    assert.equal(stuck.length, 0, `${stuck.length} horde cells cannot reach the core`);
  });
}
