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

test('nextMap walks the deal and skips a repeat of the current map', () => {
  const w = { mode: 'TDM' as const, map: rotationMap('TDM', 9, 0), rotationSeed: 9, rotationAt: 0 };
  const a = nextMap(w);
  assert.equal(a.at, 1);
  assert.equal(a.map, rotationMap('TDM', 9, 1));
  const forced = { ...w, map: rotationMap('TDM', 9, 1) };
  assert.notEqual(nextMap(forced).map, forced.map, 'a dev-chosen start never repeats');
  assert.deepEqual(nextMap({ mode: 'ZOM', map: 'outpost', rotationSeed: 9, rotationAt: 0 }).map, 'outpost');
});
