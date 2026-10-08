import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nextMap, ROTATION, rotationMap } from '../src/shared/maps.ts';

const VERSUS = ['FFA', 'TDM', 'DOM', 'BR'] as const;

test('the random rotation deals every map once per cycle and never the same map twice running', () => {
  for (const mode of VERSUS) {
    const n = ROTATION[mode].length;
    for (const seed of [1, 7, 12345, -99]) {
      const deal = Array.from({ length: n * 4 }, (_, i) => rotationMap(mode, seed, i));
      for (let c = 0; c < 4; c++) assert.deepEqual([...deal.slice(c * n, c * n + n)].sort(), [...ROTATION[mode]].sort(), `${mode} seed ${seed} cycle ${c} has every map once`);
      for (let i = 1; i < deal.length; i++) assert.notEqual(deal[i], deal[i - 1], `${mode} seed ${seed}: no repeat at ${i}`);
    }
  }
});

test('the deal is a pure function of the seed, and different seeds deal different orders', () => {
  assert.deepEqual(Array.from({ length: 20 }, (_, i) => rotationMap('FFA', 42, i)), Array.from({ length: 20 }, (_, i) => rotationMap('FFA', 42, i)));
  const orders = new Set([1, 2, 3, 4, 5].map((s) => Array.from({ length: 6 }, (_, i) => rotationMap('FFA', s, i)).join()));
  assert.ok(orders.size >= 4, 'seeds give varied orders');
});

test('no repeat across a cycle boundary, over many seeds: a cycle never opens on the map the last one closed with', () => {
  for (const mode of VERSUS) {
    const n = ROTATION[mode].length;
    for (let seed = 0; seed < 300; seed++) {
      for (let c = 1; c < 4; c++) assert.notEqual(rotationMap(mode, seed, c * n), rotationMap(mode, seed, c * n - 1), `${mode} seed ${seed} cycle ${c}`);
    }
  }
});

test('the shuffle is fair: every map opens a room about as often, and each cycle is dealt afresh', () => {
  const n = ROTATION.FFA.length;
  const opens = new Map<string, number>();
  let sameOrder = 0;
  const seeds = 100 * n;
  for (let seed = 0; seed < seeds; seed++) {
    opens.set(rotationMap('FFA', seed, 0), (opens.get(rotationMap('FFA', seed, 0)) ?? 0) + 1);
    const cycle = (c: number) => Array.from({ length: n }, (_, i) => rotationMap('FFA', seed, c * n + i)).join();
    if (cycle(1) === cycle(2)) sameOrder++;
  }
  // Each map is expected to open 100 times; a biased shuffle (one that never leaves a map where it started) never opens on the first.
  for (const map of ROTATION.FFA) assert.ok((opens.get(map) ?? 0) > 50, `${map} opened ${opens.get(map) ?? 0} of ${seeds} rooms`);
  assert.equal(sameOrder, 0, 'two cycles of a room never repeat the same order');
});

test('nextMap walks the deal and skips a repeat of the current map', () => {
  const w = { mode: 'TDM' as const, map: rotationMap('TDM', 9, 0), rotationSeed: 9, rotationAt: 0 };
  const a = nextMap(w);
  assert.equal(a.at, 1);
  assert.equal(a.map, rotationMap('TDM', 9, 1));
  const forced = { ...w, map: rotationMap('TDM', 9, 1) };
  assert.notEqual(nextMap(forced).map, forced.map, 'a dev-chosen start never repeats');
  assert.deepEqual(nextMap({ mode: 'ZOM', map: 'outpost', rotationSeed: 9, rotationAt: 0 }).map, 'outpost');
});
