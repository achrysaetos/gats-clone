import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GUN_IDS, GUNS } from '../src/shared/defs.ts';
import { artBounds } from '../src/client/gunart.ts';

const size = (id: (typeof GUN_IDS)[number]) => {
  const b = artBounds(id);
  return { long: b.maxX - b.minX, tall: b.maxY - b.minY };
};

test('every gun has finite art, and an evolution\'s look reshapes its class art', () => {
  for (const id of GUN_IDS) {
    const { long, tall } = size(id);
    assert.ok(Number.isFinite(long) && long > 40 && tall > 10, `${id} ${long}x${tall}`);
  }
  for (const id of GUN_IDS) {
    const { base, look } = GUNS[id];
    if (look.length > 1.05) assert.ok(size(id).long > size(base).long, `${id} is longer than its ${base}`);
    if (look.barrels > 1 || look.hands === 2) assert.ok(size(id).tall > size(base).tall, `${id} shows its extra barrel or gun`);
  }
  assert.ok(size('sniper').long > size('assault').long && size('assault').long > size('pistol').long, 'a rifle outreaches a pistol');
});
