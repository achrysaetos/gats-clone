import assert from 'node:assert/strict';
import { test } from 'node:test';
import { WORLD } from '../src/shared/defs.ts';
import { ROTATION } from '../src/shared/maps.ts';
import { createWorld } from '../src/shared/sim/world.ts';
import { addPlayer } from '../src/shared/sim.ts';
import { damagePlayer } from '../src/shared/sim/combat.ts';
import { snapshotFor } from '../src/shared/sim/snapshot.ts';
import { emptyWorld, run, shootOnce, spawnAt } from './helpers.ts';

const hit = (w: ReturnType<typeof emptyWorld>, by: ReturnType<typeof spawnAt>, victim: ReturnType<typeof spawnAt>) =>
  damagePlayer(w, victim, 50, { attacker: by, team: by.team, label: 'test', piercing: false, via: 'bullet', fromX: by.x, fromY: by.y });
const hp = (p: ReturnType<typeof spawnAt>) => (p.life.k === 'alive' ? p.life.hp : 0);

test('a fresh spawn takes no damage for its shield time, and shows the shield to others', () => {
  const w = emptyWorld();
  const a = spawnAt(w, 500, 500);
  const fresh = addPlayer(w, 'fresh', { weapon: 'pistol', armor: 'none', color: 'red' }, { at: { x: 800, y: 500 } });
  const full = hp(fresh);
  hit(w, a, fresh);
  assert.equal(hp(fresh), full, 'shielded');
  assert.equal(snapshotFor(w, a.id).players.find((p) => p.id === fresh.id)?.spawnShield, true);
  run(w, WORLD.spawnShieldMs + 100);
  hit(w, a, fresh);
  assert.ok(hp(fresh) < full, 'hurt once the shield is gone');
  assert.equal(snapshotFor(w, a.id).players.find((p) => p.id === fresh.id)?.spawnShield, undefined);
});

test('firing drops the spawn shield at once', () => {
  const w = emptyWorld();
  const a = spawnAt(w, 500, 500);
  const fresh = addPlayer(w, 'fresh', { weapon: 'pistol', armor: 'none', color: 'red' }, { at: { x: 800, y: 900 } });
  const full = hp(fresh);
  shootOnce(w, fresh, Math.PI, 50);
  hit(w, a, fresh);
  assert.ok(hp(fresh) < full, 'a spawn that opens fire can be shot back');
});

test('a free-for-all room fills with everyone well apart, not paired up in the spawn corners', () => {
  for (const map of ROTATION.FFA) {
    const w = createWorld('FFA', 1, map);
    const ps = Array.from({ length: WORLD.minPlayers }, (_, i) => addPlayer(w, `b${i}`, { weapon: 'pistol', armor: 'none', color: 'red' }));
    const nearest = ps.map((p) => Math.min(...ps.filter((q) => q !== p).map((q) => Math.hypot(p.x - q.x, p.y - q.y))));
    assert.ok(Math.min(...nearest) >= 400, `${map}: closest pair ${Math.min(...nearest).toFixed(0)}px apart`);
  }
});
