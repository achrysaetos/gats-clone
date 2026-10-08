import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BUILDINGS, ZOM, ZOMBIES, type ZombieKind } from '../src/shared/defs.ts';
import { MAPS } from '../src/shared/maps.ts';
import { step } from '../src/shared/sim.ts';
import { clamp } from '../src/shared/sim/movement.ts';
import { explode } from '../src/shared/sim/combat.ts';
import { damageZombie } from '../src/shared/sim/run.ts';
import { createWorld, newId, type World } from '../src/shared/sim/world.ts';
import { hpOf, spawnAt, TICK_MS } from './helpers.ts';

const CORE = MAPS.yard.siege!.core;
const CORE_CELL = { lo: (CORE.x - ZOM.coreHalf) / ZOM.cell, hi: (CORE.x + ZOM.coreHalf) / ZOM.cell - 1 };

/** A night with nothing left to spawn, so only the zombies a test places walk. */
function nightWorld(): World {
  const w = createWorld('ZOM', 1, 'yard');
  w.run!.phase = { k: 'night', toSpawn: [], nextSpawnAt: Infinity, dawnAt: Infinity };
  return w;
}

function addZombie(w: World, kind: ZombieKind, x: number, y: number) {
  const z = { id: newId(w), kind, x, y, hp: 1e9, attackAt: 0, vx: 0, vy: 0 };
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
  for (const b of w.buildings) b.hp = 100;
  const walls = w.buildings.length;
  addZombie(w, 'walker', 300, CORE.y);
  let wallsWhenCoreBitten: number | null = null;
  stepFor(w, 120_000, () => { if (wallsWhenCoreBitten === null && w.run!.core.hp < ZOM.coreHp) wallsWhenCoreBitten = w.buildings.length; });
  assert.ok(wallsWhenCoreBitten !== null, 'the zombie got to the core');
  assert.equal(wallsWhenCoreBitten, walls - 1, 'exactly one wall fell first');
});

test('a brute bites a wall for its building share of its bite', () => {
  const w = nightWorld();
  for (let cy = 0; cy < 60; cy++) addWall(w, 10, cy);
  const wall = w.buildings.find((b) => b.cy === 30)!;
  addZombie(w, 'brute', 10 * ZOM.cell - ZOMBIES.brute.radius - 2, 30.5 * ZOM.cell);
  stepFor(w, TICK_MS);
  assert.equal(BUILDINGS.wall.hp - wall.hp, ZOMBIES.brute.damage * ZOMBIES.brute.buildingDamageMul);
});

test('no zombie stays pinned on cover: one starting behind each wall of the map reaches the core', () => {
  const stuck: string[] = [];
  for (const wall of MAPS.yard.walls) {
    const cx = wall.x + wall.w / 2, cy = wall.y + wall.h / 2;
    const d = Math.hypot(cx - CORE.x, cy - CORE.y);
    const ux = (cx - CORE.x) / d, uy = (cy - CORE.y) / d;
    const reach = Math.max(wall.w, wall.h) / 2 + 40;
    const w = nightWorld();
    w.run!.core.hp = 1e9;
    const z = addZombie(w, 'walker', clamp(cx + ux * reach, 40, MAPS.yard.size - 40), clamp(cy + uy * reach, 40, MAPS.yard.size - 40));
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
  addZombie(w, 'walker', 800 + ZOMBIES.walker.aggroPx - 10, 800);
  stepFor(w, 1000);
  assert.equal(before - hpOf(p), ZOMBIES.walker.damage, 'one bite in the first second');
  stepFor(w, ZOMBIES.walker.attackMs);
  assert.equal(before - hpOf(p), 2 * ZOMBIES.walker.damage, 'a second bite after the attack interval');
});

test('a brute walks past a squad player beside it, on to the core', () => {
  const w = nightWorld();
  w.run!.core.hp = 1e9;
  const p = spawnAt(w, 800, 800);
  const z = addZombie(w, 'brute', 800 + ZOMBIES.brute.radius + 30, 800);
  const before = hpOf(p);
  stepFor(w, 3000);
  assert.equal(hpOf(p), before, 'never bitten');
  assert.ok(Math.hypot(z.x - 800, z.y - 800) > 150, 'it marched on');
});

test('a player behind a wall does not draw a zombie off its march', () => {
  const w = nightWorld();
  w.run!.core.hp = 1e9;
  const p = spawnAt(w, 8.5 * ZOM.cell, 30.5 * ZOM.cell);
  for (let cy = 27; cy <= 33; cy++) addWall(w, 9, cy);
  const z = addZombie(w, 'walker', 10.5 * ZOM.cell, 30.5 * ZOM.cell);
  assert.ok(Math.hypot(p.x - z.x, p.y - z.y) < ZOMBIES.walker.aggroPx);
  stepFor(w, 2000);
  assert.ok(z.x > 10.5 * ZOM.cell + 150, `the zombie headed for the core, at x ${z.x.toFixed(0)}`);
});

test('a diagonal line of walls closes the way: the horde chews through it rather than wedging between corners', () => {
  const w = nightWorld();
  const mid = (CORE_CELL.lo + CORE_CELL.hi) / 2;
  for (let cy = 0; cy < 60; cy++) for (let cx = 0; cx < 60; cx++) if (Math.abs(cx - mid) + Math.abs(cy - mid) === 6) addWall(w, cx, cy).hp = 100;
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
  assert.ok(Math.abs(ZOM.coreHp - w.run!.core.hp - ZOMBIES.walker.damage * (1 - ZOM.coreArmor)) < 1e-9);
  assert.ok(z.attackAt > w.now, 'that was its bite');
});

test('a bloater bursts where it dies, hurting the squad, the horde and the walls round it, so it is best killed far off', () => {
  const w = nightWorld();
  const wall = addWall(w, 10, 30);
  const at = { x: 10 * ZOM.cell - ZOMBIES.bloater.radius - 2, y: 30.5 * ZOM.cell };
  const bloater = addZombie(w, 'bloater', at.x, at.y);
  const walker = addZombie(w, 'walker', at.x - 60, at.y);
  const mate = spawnAt(w, at.x, at.y + 60);
  const shooter = spawnAt(w, at.x - 600, at.y);
  const before = hpOf(mate);
  damageZombie(w, bloater, 1e10, shooter);
  assert.ok(!w.zombies.includes(bloater));
  assert.equal(BUILDINGS.wall.hp - wall.hp, ZOMBIES.bloater.burst!.building, 'the wall it stood by takes the blow');
  assert.ok(hpOf(mate) < before, 'a squadmate beside it is hurt');
  assert.equal(hpOf(shooter), hpOf(spawnAt(w, 100, 100)), 'the shooter far off is not');
  assert.ok(walker.hp < 1e9, 'the horde round it is hurt too');
  assert.ok(w.events.some((e) => e.e === 'boom'), 'it goes up with a boom');
});

test('the squad\'s own blasts still never hurt it', () => {
  const w = nightWorld();
  const mate = spawnAt(w, 600, 1500);
  const before = hpOf(mate);
  explode(w, 600, 1500, 120, 200, { attacker: mate, team: mate.team, label: 'Mortar' });
  assert.equal(hpOf(mate), before);
});

test('a bloater that bursts at the core hurts the core through its armor', () => {
  const w = nightWorld();
  const bloater = addZombie(w, 'bloater', CORE.x, CORE.y + ZOM.coreHalf + ZOMBIES.bloater.radius + 2);
  const shooter = spawnAt(w, CORE.x - 600, CORE.y);
  const before = w.run!.core.hp;
  damageZombie(w, bloater, 1e10, shooter);
  assert.equal(before - w.run!.core.hp, ZOMBIES.bloater.burst!.core * (1 - ZOM.coreArmor));
});
