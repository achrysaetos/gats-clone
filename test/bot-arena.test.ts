/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadMap } from '../src/shared/sim/world.ts';
import { arenaFor } from '../src/server/bot/arena.ts';
import { findPath, isOpen } from '../src/server/bot/nav.ts';
import { emptyWorld, setWalls } from './helpers.ts';

test('an engineer wall blocks bot paths while it stands and frees them once it is gone, without rebuilding the map\'s cover', () => {
  const w = emptyWorld();
  setWalls(w, [{ x: 1000, y: 0, w: 40, h: 1400 }]);
  const before = arenaFor(w);
  assert.equal(arenaFor(w), before, 'unchanged walls hand back the same arena');
  const gap = { x: 1020, y: 1500 };
  assert.ok(isOpen(before.nav, gap), 'the gap below the wall is open');

  w.walls.push({ x: 960, y: 1400, w: 140, h: 1600, built: true, expiresAt: Infinity });
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
  loadMap(w, 'oldtown');
  const second = arenaFor(w);
  assert.notEqual(second.cover, first.cover);
  assert.ok(!isOpen(second.nav, { x: 500, y: 500 }), 'old town\'s first block is solid');
});
