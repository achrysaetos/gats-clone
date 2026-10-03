import assert from 'node:assert/strict';
import { test } from 'node:test';
import { WORLD } from '../src/shared/defs.ts';
import { choosePerk, snapshotFor } from '../src/shared/sim.ts';
import { emptyWorld, shootOnce, spawnAt } from './helpers.ts';

test('four kills and five crates in one life unlock the ability tier', () => {
  const w = emptyWorld();
  const a = spawnAt(w, 500, 500);
  for (let i = 0; i < 4; i++) {
    const v = spawnAt(w, 650, 500);
    if (v.life.k === 'alive') v.life.hp = 1;
    shootOnce(w, a, 0);
    assert.equal(v.life.k, 'dead');
    w.players.delete(v.id);
  }
  for (let i = 0; i < 5; i++) {
    w.crates.push({ id: 900 + i, x: 600, y: 478, size: 44, hp: 1, respawnAt: null });
    shootOnce(w, a, 0);
  }
  assert.equal(a.score, 4 * WORLD.killScore + 5 * WORLD.crateScore);
  assert.ok(choosePerk(w, a.id, 1, 'grip'));
  assert.ok(choosePerk(w, a.id, 2, 'thickSkin'));
  assert.equal(snapshotFor(w, a.id).self.pendingTier, 3, 'the ability tier is open');
});
