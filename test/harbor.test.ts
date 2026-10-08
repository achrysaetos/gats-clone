import assert from 'node:assert/strict';
import { test } from 'node:test';
import { circleHitsConvex } from '../src/shared/geom.ts';
import { polyParts } from '../src/shared/mapgeo.ts';
import { MAPS, ROTATION } from '../src/shared/maps.ts';
import { BERTHS, DISTRICTS, districtAt, PLACED_SHIPS } from '../src/shared/maps/causewaydata.ts';
import { EAST_ITEMS, WEST_ITEMS } from '../src/client/themes/harbordecor.ts';
import { WORLD } from '../src/shared/defs.ts';
import { circleBlocked } from '../src/shared/sim/movement.ts';
import { createWorld } from '../src/shared/sim/world.ts';

const map = MAPS.causeway;

test('the harbour is a themed polygon map in every versus rotation', () => {
  assert.equal(map.theme, 'harbor');
  for (const mode of ['FFA', 'TDM', 'DOM', 'BR'] as const) assert.ok(ROTATION[mode].includes('causeway'), mode);
  assert.ok(!ROTATION.ZOM.includes('causeway' as never));
});

test('water stops bodies but not bullets or sight; ships have walkable decks', () => {
  const water = map.polys!.filter((p) => p.material === 'water');
  assert.ok(water.length >= 6);
  for (const w of water) { assert.equal(w.blocksBullets, false); assert.equal(w.blocksSight, false); }
  const waterParts = polyParts(map).filter((p) => p.material === 'water');
  assert.equal(waterParts.every((p) => p.nb && p.ns), true);
  const world = createWorld('FFA', 1, 'causeway');
  /** The vertex mean of a convex part's flat `[x0, y0, x1, y1, ...]` points: a point inside it. */
  const centre = (pts: readonly number[]) => {
    let x = 0, y = 0;
    for (let i = 0; i < pts.length; i += 2) { x += pts[i]!; y += pts[i + 1]!; }
    return { x: x / (pts.length / 2), y: y / (pts.length / 2) };
  };
  for (const part of waterParts) {
    const c = centre(part.pts);
    assert.ok(Number.isFinite(c.x) && Number.isFinite(c.y));
    assert.ok(circleBlocked(world.walls, c.x, c.y, WORLD.playerRadius), `a body cannot stand in the water at ${c.x.toFixed(0)},${c.y.toFixed(0)}`);
  }
  for (const s of PLACED_SHIPS) {
    // The hull's gunwale is wall and the deck inside is open ground a body can stand on (cabins and cargo take some of it).
    const xs = s.deck.map((p) => p.x), ys = s.deck.map((p) => p.y);
    let inside = 0, standable = 0;
    for (let x = Math.min(...xs); x <= Math.max(...xs); x += 10) for (let y = Math.min(...ys); y <= Math.max(...ys); y += 10) {
      if (!inPolygon(s.deck, x, y)) continue;
      inside++;
      if (!circleBlocked(world.walls, x, y, WORLD.playerRadius)) standable++;
    }
    assert.ok(inside > 50 && standable / inside > 0.25, `${s.name}: ${standable} of ${inside} deck spots fit a body`);
  }
  assert.ok(map.polys!.filter((p) => p.material === 'hull').length >= 12, 'six gunwales, each in two or more pieces');
});

/** Even-odd ray cast: whether (x, y) lies inside the simple polygon `pts`. */
function inPolygon(pts: readonly { x: number; y: number }[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i]!, b = pts[j]!;
    if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

test('three ships a side, at least three door kinds, roofs over the rooms', () => {
  assert.equal(BERTHS.length, 3);
  assert.equal(PLACED_SHIPS.length, 6);
  const kinds = new Set(map.doors!.map((d) => d.kind));
  for (const k of ['slide', 'swing', 'double-slide', 'double-swing'] as const) assert.ok(kinds.has(k), k);
  assert.ok(map.roofs!.length >= 16);
});

test('eight or more named districts, and the twin half names its places differently', () => {
  assert.ok(DISTRICTS.length >= 8);
  for (const d of DISTRICTS) {
    assert.notEqual(d.name, d.twin);
    const cx = d.x + d.w / 2, cy = d.y + d.h / 2;
    const w = districtAt(cx, cy), e = districtAt(map.size - cx, map.size - cy);
    if (w.d.id === d.id) assert.equal(e.name, d.twin);
  }
  assert.equal(new Set(DISTRICTS.map((d) => d.light)).size, DISTRICTS.length, 'every district lights in its own colour');
});

test('hand-placed belongings never stand in a wall or in the water (but for the floats on it)', () => {
  const parts = polyParts(map);
  for (const it of [...WEST_ITEMS, ...EAST_ITEMS]) {
    if (['motto', 'tally', 'kilroy', 'note', 'rod', 'mop'].includes(it.k)) continue; // painted on the ground or a container's face, or reaching over the edge
    const hit = parts.find((p) => circleHitsConvex(it.x, it.y, 10, p.pts));
    assert.ok(!hit, `${it.k} at ${it.x},${it.y} stands in ${hit?.material}`);
  }
});
