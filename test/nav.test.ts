/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { circleHitsRect, type Rect } from '../src/shared/sim/movement.ts';
import { addField, findPath, flowField, navGrid, nearestOpenPoint, withSolids, type Point } from '../src/server/bot/nav.ts';

const R = 24;

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

test('a search capped short of a far goal returns the walkable start of the way there, ending nearer the goal', () => {
  const wall = { x: 3000, y: 0, w: 40, h: 5500 };
  const nav = navGrid(6000, [wall], R);
  const from = { x: 500, y: 500 }, to = { x: 5500, y: 500 };
  const full = findPath(nav, from, to);
  assert.ok(full && full.at(-1)!.x === to.x, 'uncapped, it reaches the goal');
  const part = findPath(nav, from, to, 500);
  assert.ok(part && part.length > 0, 'capped, it still gives a route');
  const end = part.at(-1)!;
  assert.ok(Math.hypot(end.x - to.x, end.y - to.y) < Math.hypot(from.x - to.x, from.y - to.y) - 200, `ends nearer the goal: ${JSON.stringify(end)}`);
  assert.ok(Math.hypot(end.x - to.x, end.y - to.y) > 100, 'but short of it');
  assert.equal(firstClash(from, part, [wall]), null, 'clear of the wall');
});

const routeLength = (from: Point, route: readonly Point[]) => route.reduce((sum, p, i) => sum + Math.hypot(p.x - (i ? route[i - 1]! : from).x, p.y - (i ? route[i - 1]! : from).y), 0);

test('a route round a wall takes the shorter way, close to the shortest a body could walk', () => {
  // The wall's south end is nearer, so the shortest way passes just below it: a body's width past each corner.
  const wall = { x: 1000, y: 200, w: 40, h: 2000 };
  const from = { x: 700, y: 1900 }, to = { x: 1340, y: 1900 };
  const route = findPath(navGrid(3000, [wall], R), from, to)!;
  const corner = (x: number) => ({ x, y: wall.y + wall.h + R });
  const shortest = Math.hypot(corner(wall.x - R).x - from.x, corner(0).y - from.y) + 2 * R + wall.w + Math.hypot(to.x - (wall.x + wall.w + R), corner(0).y - to.y);
  assert.ok(route.every((p) => p.y > 1000), `goes round the near end: ${JSON.stringify(route)}`);
  assert.ok(routeLength(from, route) < shortest * 1.08, `${routeLength(from, route).toFixed(0)}px against a shortest ${shortest.toFixed(0)}px`);
  assert.ok(route.length <= 4, `smoothed to a few straight legs, not cell by cell: ${route.length}`);
});

test('in a cluttered field every route is as short as the grid allows', () => {
  let seed = 5;
  const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const cell = 25;
  for (let trial = 0; trial < 12; trial++) {
    const rocks = Array.from({ length: 40 }, () => ({ x: 200 + rand() * 2400, y: 200 + rand() * 2400, w: 40 + rand() * 300, h: 40 + rand() * 300 }));
    const nav = navGrid(3000, rocks, R, cell);
    const from = { x: 100, y: 100 + rand() * 2800 }, to = { x: 2900, y: 100 + rand() * 2800 };
    if (!nav.open[Math.floor(from.y / cell) * nav.n + Math.floor(from.x / cell)] || !nav.open[Math.floor(to.y / cell) * nav.n + Math.floor(to.x / cell)]) continue;
    const route = findPath(nav, from, to);
    const best = flowField(nav, Math.floor(to.y / cell) * nav.n + Math.floor(to.x / cell))[Math.floor(from.y / cell) * nav.n + Math.floor(from.x / cell)]!;
    if (!Number.isFinite(best)) { assert.equal(route, null, `trial ${trial}: no way`); continue; }
    // The field is the true shortest walk over the cells; a smoothed route cuts its corners, so it is never much longer.
    assert.ok(route && routeLength(from, route) <= (best + 2) * cell, `trial ${trial}: ${route && routeLength(from, route).toFixed(0)}px against ${((best + 2) * cell).toFixed(0)}px`);
  }
});

test('a goal inside a solid is answered with the open spot nearest it', () => {
  const block = { x: 1000, y: 1000, w: 200, h: 200 };
  const nav = navGrid(3000, [block], R);
  const near = nearestOpenPoint(nav, { x: 1010, y: 1100 }, 200)!;
  assert.ok(near.x < block.x - R + 1 && near.x > block.x - R - 30 && Math.abs(near.y - 1100) < 30, `just west of the block: ${JSON.stringify(near)}`);
  assert.equal(nearestOpenPoint(nav, { x: 1100, y: 1100 }, 50), null, 'nothing open that close to the middle');
});

test('a distance field to one goal does not steer a route to another goal far from it', () => {
  const wall = { x: 1000, y: 0, w: 40, h: 2400 };
  const nav = navGrid(3000, [wall], R);
  addField(nav, { x: 2800, y: 200 });
  const from = { x: 800, y: 1500 }, to = { x: 1300, y: 1500 };
  const route = findPath(nav, from, to)!;
  assert.ok(routeLength(from, route) < 2200, `straight round the wall's end, not by the far field's goal: ${routeLength(from, route).toFixed(0)}px`);
  assert.equal(firstClash(from, route, [wall]), null);
});

test('a grid with a new solid stamped on never hands back a route its base grid remembered through that spot', () => {
  const wall = { x: 1000, y: 0, w: 40, h: 1400 };
  const base = navGrid(3000, [wall], R);
  const from = { x: 800, y: 1300 }, to = { x: 1300, y: 1300 };
  assert.ok(findPath(base, from, to), 'round the end of the wall on the base grid');
  const sealed = withSolids(base, [{ x: 960, y: 1400, w: 120, h: 1600 }], R);
  assert.equal(findPath(sealed, from, to), null, 'the gap is sealed, so there is no way');
  assert.ok(findPath(base, from, to), 'and the base grid is untouched');
});

test('a route read off a distance field never crosses a cell the grid has since shut', () => {
  const base = navGrid(3000, [], R);
  const goal = { x: 2700, y: 1500 };
  addField(base, goal);
  const from = { x: 300, y: 1500 };
  assert.deepEqual(findPath(base, from, goal), [goal], 'open ground: one straight leg');
  const fence = { x: 1500, y: 0, w: 40, h: 3000 };
  const fenced = withSolids(base, [fence], R);
  assert.equal(findPath(fenced, from, goal), null, 'a fence right across the map leaves no way, field or not');
  const gapped = withSolids(base, [{ ...fence, h: 2500 }], R);
  const round = findPath(gapped, from, goal)!;
  assert.equal(firstClash(from, round, [{ ...fence, h: 2500 }]), null, 'round the end of a fence with a gap, clear of it');
});
