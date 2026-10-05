import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BUILDINGS, WORLD, ZOM } from '../src/shared/defs.ts';
import { parseClientMsg } from '../src/shared/protocol.ts';
import { build, demolish } from '../src/shared/sim/run.ts';
import { circleHitsRect } from '../src/shared/sim/movement.ts';
import { createWorld, newId, solidRects, spawnPoint, type World } from '../src/shared/sim/world.ts';
import { press, run, spawnAt } from './helpers.ts';

/** The builder stands just west of the core; cell (26, 30) is beside them. */
const AT = { x: 1380, y: 1525 }, CELL = { cx: 26, cy: 30 };

function dayWorld() {
  const w = createWorld('ZOM', 1, 'outpost');
  const p = spawnAt(w, AT.x, AT.y);
  return { w, p };
}

test('a wall goes up on a clear cell by day for its cost, counts toward the builder, and blocks the way', () => {
  const { w, p } = dayWorld();
  const scrap = w.run!.scrap, version = w.buildingsVersion;
  assert.equal(build(w, p.id, CELL.cx, CELL.cy), null);
  assert.deepEqual(w.buildings.map((b) => [b.kind, b.cx, b.cy, b.hp]), [['wall', CELL.cx, CELL.cy, BUILDINGS.wall.hp]]);
  assert.equal(scrap - w.run!.scrap, BUILDINGS.wall.cost);
  assert.ok(w.buildingsVersion > version);
  assert.equal(w.run!.stats.get(p.id)?.built, 1);
  press(w, p, { left: true });
  run(w, 1000);
  assert.ok(p.x >= (CELL.cx + 1) * ZOM.cell + 24 - 0.01, `walked into the wall to x ${p.x.toFixed(1)}`);
});

const refusals: [string, (w: World) => { cx: number; cy: number; by?: { x: number; y: number } }][] = [
  ['notDay', (w) => { w.run!.phase = { k: 'night', toSpawn: ['walker'], nextSpawnAt: Infinity }; return CELL; }],
  ['farFromCore', () => ({ cx: 17, cy: 30, by: { x: 17.5 * ZOM.cell + 60, y: 1525 } })],
  ['outOfReach', () => ({ cx: CELL.cx - 5, cy: CELL.cy })],
  ['cover', (w) => { w.walls.push({ x: CELL.cx * ZOM.cell + 10, y: CELL.cy * ZOM.cell, w: 24, h: 140, built: true, expiresAt: Infinity }); return CELL; }],
  ['core', () => ({ cx: 29, cy: 30 })],
  ['body', (w) => { w.zombies.push({ id: newId(w), kind: 'walker', x: (CELL.cx + 0.5) * ZOM.cell, y: CELL.cy * ZOM.cell - 5, hp: 1, attackAt: Infinity }); return CELL; }],
  ['body', (w) => { spawnAt(w, (CELL.cx + 0.5) * ZOM.cell, (CELL.cy + 0.5) * ZOM.cell); return CELL; }],
  ['taken', (w) => { w.buildings.push({ id: newId(w), kind: 'wall', cx: CELL.cx, cy: CELL.cy, hp: 1 }); return CELL; }],
  ['scrap', (w) => { w.run!.scrap = BUILDINGS.wall.cost - 1; return CELL; }],
];

for (const [reason, arrange] of refusals) {
  test(`a wall is refused with ${reason}, and nothing is spent`, () => {
    const { w, p } = dayWorld();
    const { cx, cy, by } = arrange(w);
    if (by) { p.x = by.x; p.y = by.y; }
    const scrap = w.run!.scrap, walls = w.buildings.length;
    assert.equal(build(w, p.id, cx, cy), reason);
    assert.deepEqual([w.run!.scrap, w.buildings.length], [scrap, walls]);
  });
}

test('a wall comes down by day for half its cost back, but not at night', () => {
  const { w, p } = dayWorld();
  build(w, p.id, CELL.cx, CELL.cy);
  const scrap = w.run!.scrap;
  w.run!.phase = { k: 'night', toSpawn: ['walker'], nextSpawnAt: Infinity };
  assert.equal(demolish(w, p.id, CELL.cx, CELL.cy), false);
  w.run!.phase = { k: 'day', endsAt: Infinity };
  assert.equal(demolish(w, p.id, CELL.cx, CELL.cy), true);
  assert.deepEqual([w.buildings.length, w.run!.scrap - scrap], [0, BUILDINGS.wall.cost * ZOM.demolishRefund]);
});

test('build and demolish messages carry whole grid cells only', () => {
  assert.deepEqual(parseClientMsg(JSON.stringify({ t: 'build', cx: 3, cy: 59 })), { t: 'build', cx: 3, cy: 59 });
  assert.deepEqual(parseClientMsg(JSON.stringify({ t: 'demolish', cx: 0, cy: 0 })), { t: 'demolish', cx: 0, cy: 0 });
  for (const bad of [{ cx: 1.5, cy: 2 }, { cx: -1, cy: 2 }, { cx: 60, cy: 2 }, { cx: '3', cy: 2 }, { cy: 2 }]) {
    assert.equal(parseClientMsg(JSON.stringify({ t: 'build', ...bad })), null, JSON.stringify(bad));
  }
});

test('a wall ring over the squad spawn strips sends a squad spawn to clear ground near the core, never into a wall', () => {
  const w = createWorld('ZOM', 1, 'outpost');
  for (let cy = 27; cy <= 32; cy++) for (let cx = 27; cx <= 32; cx++) {
    if (cx === 27 || cx === 32 || cy === 27 || cy === 32) w.buildings.push({ id: newId(w), kind: 'wall', cx, cy, hp: BUILDINGS.wall.hp });
  }
  w.buildingsVersion++;
  for (let i = 0; i < 20; i++) {
    const at = spawnPoint(w, 'red');
    assert.ok(!solidRects(w).some((r) => circleHitsRect(at.x, at.y, WORLD.playerRadius, r)), `spawned inside a solid at ${at.x},${at.y}`);
    assert.ok(Math.hypot(at.x - WORLD.size / 2, at.y - WORLD.size / 2) < 300, `spawned far from the core at ${at.x},${at.y}`);
  }
});
