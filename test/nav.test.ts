/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { circleHitsRect, type Rect } from '../src/shared/sim/movement.ts';
import { findPath, navGrid, type Point } from '../src/server/nav.ts';

const R = 24;

/** Walks the route in 5px steps and returns the first spot where a body of radius R would overlap a solid, or null. */
function firstClash(from: Point, route: readonly Point[], solids: readonly Rect[]): Point | null {
  let at = from;
  for (const to of route) {
    const steps = Math.ceil(Math.hypot(to.x - at.x, to.y - at.y) / 5);
    for (let i = 0; i <= steps; i++) {
      const p = { x: at.x + ((to.x - at.x) * i) / Math.max(1, steps), y: at.y + ((to.y - at.y) * i) / Math.max(1, steps) };
      if (solids.some((s) => circleHitsRect(p.x, p.y, R, s))) return p;
    }
    at = to;
  }
  return null;
}

test('a route round a long wall ends at the goal and never brushes the wall', () => {
  const wall = { x: 1000, y: 200, w: 40, h: 2400 };
  const nav = navGrid(3000, [wall], R);
  const from = { x: 800, y: 1500 }, to = { x: 1300, y: 1500 };
  const route = findPath(nav, from, to);
  assert.ok(route, 'found a route');
  assert.deepEqual(route.at(-1), to, 'ends exactly on the goal');
  assert.equal(firstClash(from, route, [wall]), null, 'clear of the wall all the way');
  assert.ok(route.some((p) => p.y > 2600 || p.y < 200), `goes round an end of the wall: ${JSON.stringify(route)}`);
});

test('a route in the open is one straight leg', () => {
  const nav = navGrid(3000, [], R);
  assert.deepEqual(findPath(nav, { x: 100, y: 100 }, { x: 2900, y: 2000 }), [{ x: 2900, y: 2000 }]);
});

test('a goal sealed inside a box has no route', () => {
  const box = [{ x: 1400, y: 1400, w: 200, h: 20 }, { x: 1400, y: 1580, w: 200, h: 20 }, { x: 1400, y: 1400, w: 20, h: 200 }, { x: 1580, y: 1400, w: 20, h: 200 }];
  const nav = navGrid(3000, box, R);
  assert.equal(findPath(nav, { x: 500, y: 500 }, { x: 1500, y: 1500 }), null);
});

test('a route threads a doorway wider than a body and refuses one narrower', () => {
  const wallWithGap = (gap: number) => [{ x: 1000, y: 0, w: 40, h: 1500 - gap / 2 }, { x: 1000, y: 1500 + gap / 2, w: 40, h: 1500 - gap / 2 }];
  const from = { x: 700, y: 1500 }, to = { x: 1300, y: 1500 };
  const wide = wallWithGap(90);
  const through = findPath(navGrid(3000, wide, R), from, to);
  assert.ok(through, 'a 90px door lets a 48px body through');
  assert.equal(firstClash(from, through, wide), null);
  assert.ok(through.length <= 2, `straight through the door: ${JSON.stringify(through)}`);
  assert.equal(findPath(navGrid(3000, wallWithGap(40), R), from, to), null, 'a 40px door is too narrow');
});

test('the grid follows the size it is given, not a global world size', () => {
  const wall = { x: 4500, y: 0, w: 40, h: 5000 };
  const from = { x: 4000, y: 3000 };
  const route = findPath(navGrid(6000, [wall], R), from, { x: 5000, y: 3000 });
  assert.ok(route && route.some((p) => p.y > 5000), `goes round the far end of a wall past 3000: ${JSON.stringify(route)}`);
  assert.equal(firstClash(from, route, [wall]), null);
  const end = findPath(navGrid(3000, [], R), { x: 100, y: 100 }, { x: 5900, y: 5900 })?.at(-1);
  assert.ok(end && end.x < 3000 && end.y < 3000, `a 3000 grid stops at its own edge: ${JSON.stringify(end)}`);
});
