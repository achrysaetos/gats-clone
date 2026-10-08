import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MAPS, parseMapFile } from '../src/shared/maps.ts';
import { arrivalOf, passMs, trainAt, type TrainDef } from '../src/shared/sim/train.ts';
import type { GameEvent } from '../src/shared/protocol.ts';
import { WORLD } from '../src/shared/defs.ts';
import { step } from '../src/shared/sim.ts';
import { circleHitsRect, rectsOverlap } from '../src/shared/sim/movement.ts';
import { createWorld, spawnPoint } from '../src/shared/sim/world.ts';
import { emptyWorld, hpOf, shootOnce, spawnAt, TICK_MS } from './helpers.ts';

const TRAIN: TrainDef = { lane: { x: 0, y: 1000, w: 4000, h: 150 }, axis: 'x', dir: 1, everyMs: 60_000, jitterMs: 10_000, warnMs: 5000, speed: 1600, length: 1200 };

test('the timetable follows from the clock alone: every run warns, then passes, then clears', () => {
  const at = arrivalOf(TRAIN, 3);
  assert.deepEqual(trainAt(TRAIN, at - TRAIN.warnMs - 1), { k: 'clear', nextAt: at });
  assert.deepEqual(trainAt(TRAIN, at - 1), { k: 'warn', arrivesAt: at });
  const mid = trainAt(TRAIN, at + passMs(TRAIN) / 2);
  assert.equal(mid.k, 'pass');
  assert.equal(trainAt(TRAIN, at + passMs(TRAIN)).k, 'clear');
  assert.deepEqual(trainAt(TRAIN, at + 1234), trainAt(TRAIN, at + 1234), 'the same time gives the same answer');
  const gaps = [1, 2, 3, 4, 5].map((k) => arrivalOf(TRAIN, k + 1) - arrivalOf(TRAIN, k));
  assert.ok(new Set(gaps).size > 1, `runs come at uneven gaps (${gaps})`);
});

test('the train comes in nose first from its end of the lane and stays in the lane', () => {
  const at = arrivalOf(TRAIN, 1);
  const early = trainAt(TRAIN, at + 250), later = trainAt(TRAIN, at + 1000);
  assert.ok(early.k === 'pass' && later.k === 'pass');
  assert.deepEqual(early.body, { x: 0, y: 1000, w: 400, h: 150 });
  assert.deepEqual(later.body, { x: 400, y: 1000, w: 1200, h: 150 });
  const back = trainAt({ ...TRAIN, dir: -1 }, at + 250);
  assert.ok(back.k === 'pass');
  assert.deepEqual(back.body, { x: 3600, y: 1000, w: 400, h: 150 }, 'with dir -1 it comes in from the far end');
});

test('a map whose runs cannot fit their timetable fails to load', () => {
  const file = { name: 'Bad', size: 4000, pieces: [], spawns: { red: [], ffa: [] }, train: { ...TRAIN, everyMs: 8000 } };
  assert.throws(() => parseMapFile(file), /train: a run/);
});

test('the train kills whoever stands in its lane as it passes, and nobody outside it', () => {
  const w = emptyWorld();
  const def = MAPS[w.map];
  const was = def.train;
  def.train = TRAIN;
  try {
    const inLane = spawnAt(w, 600, 1075);
    const beside = spawnAt(w, 600, 900);
    w.now = arrivalOf(TRAIN, 1) - TRAIN.warnMs;
    const kills: GameEvent[] = [];
    for (let t = 0; t < TRAIN.warnMs; t += TICK_MS) step(w, TICK_MS);
    assert.equal(inLane.life.k, 'alive', 'the warning hurts nobody');
    for (let t = 0; t < 1500; t += TICK_MS) { step(w, TICK_MS); kills.push(...w.events.filter((e) => e.e === 'kill')); }
    assert.equal(kills.length, 1);
    assert.ok(kills[0]!.e === 'kill' && kills[0]!.victimId === inLane.id && kills[0]!.weapon === 'Train');
    assert.equal(beside.life.k, 'alive');
  } finally {
    if (was) def.train = was; else delete def.train;
  }
});

test('a passing train stops rounds, and the lane lets them through once it has gone', () => {
  const w = emptyWorld();
  const def = MAPS[w.map];
  const was = def.train;
  def.train = TRAIN;
  try {
    const shooter = spawnAt(w, 2000, 850);
    const target = spawnAt(w, 2000, 1300);
    const arrive = arrivalOf(TRAIN, 1);
    w.now = arrive + 1500;
    assert.equal(trainAt(TRAIN, w.now).k, 'pass');
    shootOnce(w, shooter, Math.PI / 2, 300);
    assert.equal(hpOf(target), 100, 'the train took the round');
    w.now = arrive + passMs(TRAIN) + 100;
    shootOnce(w, shooter, Math.PI / 2, 600);
    assert.ok(hpOf(target) < 100, 'the empty lane did not');
  } finally {
    if (was) def.train = was; else delete def.train;
  }
});

test('nobody spawns in the lane, even when it is the farthest ground from every rival, and no Last Squad crate or drop lands in it', () => {
  const lane = MAPS.railyard.train!.lane, size = MAPS.railyard.size;
  const w = createWorld('FFA', 7, 'railyard');
  for (const [x, y] of [[300, 300], [size - 300, 300], [300, size - 300], [size - 300, size - 300]] as const) spawnAt(w, x, y);
  for (let i = 0; i < 100; i++) {
    const at = spawnPoint(w, null);
    assert.ok(!circleHitsRect(at.x, at.y, WORLD.playerRadius, lane), `spawned in the lane at (${at.x.toFixed(0)}, ${at.y.toFixed(0)})`);
  }
  for (const seed of [1, 2, 3]) {
    const br = createWorld('BR', seed, 'railyard');
    assert.deepEqual(br.crates.filter((c) => rectsOverlap(c, lane)), [], `seed ${seed}`);
    assert.ok(br.royale!.drops.every((d) => !circleHitsRect(d.x, d.y, WORLD.playerRadius, lane)), 'the first drop lands off the lane');
  }
});
