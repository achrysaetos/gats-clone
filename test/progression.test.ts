import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GUNS, WORLD } from '../src/shared/defs.ts';
import { snapshotFor } from '../src/shared/sim/snapshot.ts';
import { choosePerk } from '../src/shared/sim/stats.ts';
import { emptyWorld, grantPerks, hpOf, press, run, shootOnce, spawnAt, TICK_MS } from './helpers.ts';

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

test('a round restart resets level, perks and ability along with score', () => {
  const w = emptyWorld('TDM');
  const a = spawnAt(w, 500, 500, { team: 'red' });
  grantPerks(w, a, ['extended', 'thickSkin', 'dash']);
  press(w, a, { reload: true });
  run(w, GUNS.pistol.reloadMs + 100);
  press(w, a, {});
  a.score = 450;
  w.teamScore.red = WORLD.tdmWinScore;
  run(w, TICK_MS);
  assert.equal(w.match.k, 'over');
  run(w, WORLD.roundRestartMs - 200);
  if (a.life.k === 'alive') a.life.lastDamageAt = w.now;
  assert.deepEqual([hpOf(a), snapshotFor(w, a.id).self.ammo], [WORLD.baseHp + 30, 18], 'thick skin health and an extended magazine before the restart');
  run(w, 300);
  const snap = snapshotFor(w, a.id);
  const view = snap.players.find((p) => p.id === a.id)!;
  assert.deepEqual([view.score, view.level, snap.self.perks, snap.self.pendingTier, snap.self.ability], [0, 0, {}, null, null]);
  assert.equal(view.maxHp, WORLD.baseHp);
  assert.ok(view.hp <= view.maxHp, `hp ${view.hp} fits the base max`);
  assert.ok(snap.self.ammo <= snap.self.mag, `ammo ${snap.self.ammo} fits the base magazine ${snap.self.mag}`);
});
