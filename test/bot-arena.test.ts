/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MAPS } from '../src/shared/maps.ts';
import { loadMap } from '../src/shared/sim/world.ts';
import { arenaFor, takeReplan } from '../src/server/bot/arena.ts';
import { findPath, isOpen } from '../src/server/bot/nav.ts';
import { emptyWorld, setWalls } from './helpers.ts';

test('an engineer wall blocks bot paths while it stands and frees them once it is gone, without rebuilding the map\'s cover', () => {
  const w = emptyWorld();
  setWalls(w, [{ x: 1000, y: 0, w: 40, h: 1400 }]);
  const before = arenaFor(w);
  assert.equal(arenaFor(w), before, 'unchanged walls hand back the same arena');
  const gap = { x: 1020, y: 1500 };
  assert.ok(isOpen(before.nav, gap), 'the gap below the wall is open');

  w.walls.push({ x: 960, y: 1400, w: 140, h: MAPS[w.map].size - 1400, built: true, expiresAt: Infinity });
  w.wallsVersion++;
  const walled = arenaFor(w);
  assert.ok(!isOpen(walled.nav, gap), 'the engineer wall closes the gap');
  assert.equal(findPath(walled.nav, { x: 800, y: 1500 }, { x: 1300, y: 1500 }), null, 'no way round');
  assert.equal(walled.cover, before.cover, 'cover is the map\'s own, reused');
  assert.ok(isOpen(before.nav, gap), 'the map\'s own grid is untouched');

  w.walls.pop();
  w.wallsVersion++;
  const freed = arenaFor(w);
  assert.ok(isOpen(freed.nav, gap), 'the gap opens again when the wall goes');
  assert.ok(findPath(freed.nav, { x: 800, y: 1500 }, { x: 1300, y: 1500 }), 'and a path runs through it');
});

test('a new map rebuilds the arena\'s cover', () => {
  const w = emptyWorld();
  const first = arenaFor(w);
  loadMap(w, 'yard');
  const second = arenaFor(w);
  assert.notEqual(second.cover, first.cover);
  const block = MAPS.yard.walls[0]!;
  assert.ok(!isOpen(second.nav, { x: block.x + block.w / 2, y: block.y + block.h / 2 }), 'the yard\'s first wall is solid');
});

test('a room plans only a few new bot routes a tick, and plans again the next tick', () => {
  const a = arenaFor(emptyWorld());
  const granted = (tick: number) => Array.from({ length: 6 }, () => takeReplan(a, tick)).filter(Boolean).length;
  assert.equal(granted(10), 3);
  assert.equal(granted(10), 0, 'the same tick has none left');
  assert.equal(granted(11), 3, 'the next tick has a fresh allowance');
});
