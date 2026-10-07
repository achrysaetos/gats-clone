import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GUN_IDS, GUNS, WORLD } from '../src/shared/defs.ts';
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

test('hands hold each gun on its grip and handguard, a pistol out in both hands, a long gun shouldered', async () => {
  const { heldHands, heldMuzzleReach, heldFlipped, heldForeshorten } = await import('../src/client/gunart.ts');
  const R = WORLD.playerRadius;
  for (const id of GUN_IDS) {
    const [trigger, support] = heldHands(id, R);
    const reach = heldMuzzleReach(id, R);
    assert.ok(trigger.x > 0 && trigger.x < reach, `${id}: the trigger hand is on the gun, ahead of the body`);
    assert.ok(support.x < reach && support.x <= 1.9 * R + 1e-9, `${id}: the support hand stays on the gun and within an arm's reach`);
    if (GUNS[id].look.hands !== 2 && GUNS[GUNS[id].base].base !== 'pistol') assert.ok(support.x - trigger.x > R * 0.5, `${id}: two-handed, the support hand well forward`);
  }
  const [pt, ps] = heldHands('pistol', R);
  assert.ok(Math.abs(pt.x - ps.x) < R * 0.3, 'a pistol is held in both hands, together on the grip');
  assert.ok(pt.x > heldHands('assault', R)[0].x * 0.8 && heldMuzzleReach('pistol', R) < heldMuzzleReach('assault', R), 'held out, but a rifle still outreaches it');
  assert.ok(heldMuzzleReach('sniper', R) > heldMuzzleReach('assault', R), 'a bolt-action reaches furthest');
  // Aimed left, the gun mirrors so its grip still hangs down-screen, and the hands mirror with it.
  assert.ok(heldFlipped(Math.PI) && !heldFlipped(0) && !heldFlipped(Math.PI / 3));
  assert.equal(heldHands('assault', R, Math.PI)[0].y, -heldHands('assault', R, 0)[0].y);
  // Aimed up- or down-screen the gun foreshortens, and the muzzle (where rounds are drawn from) moves in with it.
  assert.ok(heldForeshorten(Math.PI / 2) < 1 && heldForeshorten(0) === 1);
  assert.ok(heldMuzzleReach('assault', R, -Math.PI / 2) < heldMuzzleReach('assault', R, 0));
  assert.ok(heldHands('assault', R, Math.PI / 2)[0].x < heldHands('assault', R, 0)[0].x);
});
