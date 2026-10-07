import assert from 'node:assert/strict';
import { test } from 'node:test';
import { circleHitsConvex } from '../src/shared/geom.ts';
import { polyParts } from '../src/shared/mapgeo.ts';
import { MAPS, ROTATION } from '../src/shared/maps.ts';
import { BERTHS, DISTRICTS, districtAt, PLACED_SHIPS } from '../src/shared/maps/causewaydata.ts';
import { EAST_ITEMS, WEST_ITEMS } from '../src/client/themes/harbordecor.ts';

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
  assert.equal(polyParts(map).filter((p) => p.material === 'water').every((p) => p.nb && p.ns), true);
  for (const s of PLACED_SHIPS) {
    // The hull's gunwale is wall and the deck inside is open ground a player could stand on.
    const centre = s.deck.reduce((a, p) => ({ x: a.x + p.x / s.deck.length, y: a.y + p.y / s.deck.length }), { x: 0, y: 0 });
    assert.ok(s.deck.length > 6);
    assert.ok(centre.x > 0);
  }
  assert.ok(map.polys!.filter((p) => p.material === 'hull').length >= 12, 'six gunwales, each in two or more pieces');
});

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
