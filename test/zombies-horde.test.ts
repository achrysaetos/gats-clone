import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BUILDINGS, WORLD, ZOM, ZOMBIES, type ZombieKind } from '../src/shared/defs.ts';
import { MAPS } from '../src/shared/maps.ts';
import { step } from '../src/shared/sim.ts';
import { clamp } from '../src/shared/sim/movement.ts';
import { createWorld, newId, type World } from '../src/shared/sim/world.ts';
import { hpOf, spawnAt, TICK_MS } from './helpers.ts';

const CORE = MAPS.outpost.siege!.core;
const CORE_CELL = { lo: (CORE.x - ZOM.coreHalf) / ZOM.cell, hi: (CORE.x + ZOM.coreHalf) / ZOM.cell - 1 };

/** A night with nothing left to spawn, so only the zombies a test places walk. */
function nightWorld(): World {
  const w = createWorld('ZOM', 1, 'outpost');
  w.run!.phase = { k: 'night', toSpawn: [], nextSpawnAt: Infinity };
  return w;
}

function addZombie(w: World, kind: ZombieKind, x: number, y: number) {
  const z = { id: newId(w), kind, x, y, hp: 1e9, attackAt: 0 };
  w.zombies.push(z);
  return z;
}

function addWall(w: World, cx: number, cy: number) {
  const b = { id: newId(w), kind: 'wall' as const, cx, cy, hp: BUILDINGS.wall.hp };
  w.buildings.push(b);
  w.buildingsVersion++;
  return b;
}

/** Walls on every cell `gap` cells out from the core's edge, but for any listed in `leave`. */
function ring(w: World, gap: number, leave: (cx: number, cy: number) => boolean = () => false) {
  const lo = CORE_CELL.lo - gap, hi = CORE_CELL.hi + gap;
  for (let cy = lo; cy <= hi; cy++) {
    for (let cx = lo; cx <= hi; cx++) if ((cx === lo || cx === hi || cy === lo || cy === hi) && !leave(cx, cy)) addWall(w, cx, cy);
  }
}

const toCore = (x: number, y: number) => {
  const r = { x: CORE.x - ZOM.coreHalf, y: CORE.y - ZOM.coreHalf, s: ZOM.coreHalf * 2 };
  return Math.hypot(x - clamp(x, r.x, r.x + r.s), y - clamp(y, r.y, r.y + r.s));
};

function stepFor(w: World, ms: number, each: () => void = () => {}) {
  for (let t = 0; t < ms; t += TICK_MS) { step(w, TICK_MS); each(); }
}

test('the horde walks round to a gap in the walls rather than chew through them', () => {
  const w = nightWorld();
  const east = CORE_CELL.hi + 3;
  ring(w, 3, (cx, cy) => cx === east && cy === CORE_CELL.lo);
  addZombie(w, 'walker', 300, CORE.y);
  addZombie(w, 'brute', CORE.x, 300);
  stepFor(w, 40_000);
  assert.ok(w.run!.core.hp < ZOM.coreHp, 'the zombies reached the core');
  assert.deepEqual(w.buildings.filter((b) => b.hp < BUILDINGS.wall.hp).map((b) => [b.cx, b.cy]), [], 'no wall was bitten');
});

test('a core walled in all round gets a wall chewed open before the core is bitten', () => {
  const w = nightWorld();
  ring(w, 3);
  const walls = w.buildings.length;
  addZombie(w, 'walker', 300, CORE.y);
  let wallsWhenCoreBitten: number | null = null;
  stepFor(w, 120_000, () => { if (wallsWhenCoreBitten === null && w.run!.core.hp < ZOM.coreHp) wallsWhenCoreBitten = w.buildings.length; });
  assert.ok(wallsWhenCoreBitten !== null, 'the zombie got to the core');
  assert.equal(wallsWhenCoreBitten, walls - 1, 'exactly one wall fell first');
});

test('a brute tears through walls three times as hard as it bites', () => {
  const w = nightWorld();
  for (let cy = 0; cy < 60; cy++) addWall(w, 10, cy);
  const wall = w.buildings.find((b) => b.cy === 30)!;
  addZombie(w, 'brute', 10 * ZOM.cell - ZOMBIES.brute.radius - 2, 30.5 * ZOM.cell);
  stepFor(w, TICK_MS);
  assert.equal(BUILDINGS.wall.hp - wall.hp, ZOMBIES.brute.damage * ZOMBIES.brute.buildingDamageMul);
});

test('no zombie stays pinned on cover: one starting behind each wall of the map reaches the core', () => {
  const stuck: string[] = [];
  for (const wall of MAPS.outpost.walls) {
    const cx = wall.x + wall.w / 2, cy = wall.y + wall.h / 2;
    const d = Math.hypot(cx - CORE.x, cy - CORE.y);
    const ux = (cx - CORE.x) / d, uy = (cy - CORE.y) / d;
    const reach = Math.max(wall.w, wall.h) / 2 + 40;
    const w = nightWorld();
    w.run!.core.hp = 1e9;
    const z = addZombie(w, 'walker', clamp(cx + ux * reach, 40, WORLD.size - 40), clamp(cy + uy * reach, 40, WORLD.size - 40));
    let closest = Infinity;
    stepFor(w, (d / ZOMBIES.walker.speed) * 1000 * 2 + 5000, () => { closest = Math.min(closest, toCore(z.x, z.y)); });
    if (closest > ZOMBIES.walker.radius + ZOM.biteReach) stuck.push(`(${z.x.toFixed(0)}, ${z.y.toFixed(0)}) ended ${closest.toFixed(0)}px off`);
  }
  assert.deepEqual(stuck, []);
});

test('a zombie turns on a squad player it can see close by and bites at its own pace', () => {
  const w = nightWorld();
  w.run!.core.hp = 1e9;
  const p = spawnAt(w, 800, 800);
  const before = hpOf(p);
  addZombie(w, 'walker', 800 + ZOM.aggroPx - 10, 800);
  stepFor(w, 1000);
  assert.equal(before - hpOf(p), ZOMBIES.walker.damage, 'one bite in the first second');
  stepFor(w, ZOMBIES.walker.attackMs);
  assert.equal(before - hpOf(p), 2 * ZOMBIES.walker.damage, 'a second bite after the attack interval');
});

test('a player behind a wall does not draw a zombie off its march', () => {
  const w = nightWorld();
  w.run!.core.hp = 1e9;
  const p = spawnAt(w, 8.5 * ZOM.cell, 30.5 * ZOM.cell);
  for (let cy = 27; cy <= 33; cy++) addWall(w, 9, cy);
  const z = addZombie(w, 'walker', 10.5 * ZOM.cell, 30.5 * ZOM.cell);
  assert.ok(Math.hypot(p.x - z.x, p.y - z.y) < ZOM.aggroPx);
  stepFor(w, 2000);
  assert.ok(z.x > 10.5 * ZOM.cell + 150, `the zombie headed for the core, at x ${z.x.toFixed(0)}`);
});

test('a diagonal line of walls closes the way: the horde chews through it rather than wedging between corners', () => {
  const w = nightWorld();
  const mid = (CORE_CELL.lo + CORE_CELL.hi) / 2;
  for (let cy = 0; cy < 60; cy++) for (let cx = 0; cx < 60; cx++) if (Math.abs(cx - mid) + Math.abs(cy - mid) === 6) addWall(w, cx, cy);
  const walls = w.buildings.length;
  // Outside the line, one diagonal step from a cell inside it, across the corner two walls meet at.
  addZombie(w, 'walker', (mid - 2.5 + 0.5) * ZOM.cell, (mid - 4.5 + 0.5) * ZOM.cell);
  stepFor(w, 60_000);
  assert.ok(w.run!.core.hp < ZOM.coreHp, 'the zombie got through to the core');
  assert.equal(w.buildings.length, walls - 1, 'by chewing through one wall');
});

test('zombies piled on one spot spread apart', () => {
  const w = nightWorld();
  w.run!.core.hp = 1e9;
  const zs = Array.from({ length: 5 }, () => addZombie(w, 'walker', 600, 600));
  stepFor(w, 500);
  for (let i = 0; i < zs.length; i++) {
    for (let j = i + 1; j < zs.length; j++) {
      assert.ok(Math.hypot(zs[i]!.x - zs[j]!.x, zs[i]!.y - zs[j]!.y) > ZOMBIES.walker.radius, `zombies ${i} and ${j} still stacked`);
    }
  }
});

test('the core\'s armor shrugs off its share of each bite', () => {
  const w = nightWorld();
  const z = addZombie(w, 'walker', CORE.x, CORE.y + ZOM.coreHalf + ZOMBIES.walker.radius + 2);
  step(w, TICK_MS);
  assert.equal(ZOM.coreHp - w.run!.core.hp, ZOMBIES.walker.damage * (1 - ZOM.coreArmor));
  assert.ok(z.attackAt > w.now, 'that was its bite');
});
