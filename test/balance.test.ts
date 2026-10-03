/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ARMOR_IDS, WEAPONS, type ArmorId } from '../src/shared/defs.ts';
import { emptyWorld, shootOnce, spawnAt } from './helpers.ts';

test('a bolt-action hit kills an unarmored full-health player', () => {
  const w = emptyWorld();
  const sniper = spawnAt(w, 1000, 1000, { loadout: { weapon: 'sniper' } });
  const target = spawnAt(w, 1600, 1000, { loadout: { armor: 'none' } });
  shootOnce(w, sniper, 0, 800);
  assert.equal(target.life.k, 'dead');
});

test('a point-blank shotgun blast kills an unarmored full-health player', () => {
  const w = emptyWorld();
  const shotgun = spawnAt(w, 1000, 1000, { loadout: { weapon: 'shotgun' } });
  const target = spawnAt(w, 1060, 1000, { loadout: { armor: 'none' } });
  shootOnce(w, shotgun, 0, 300);
  assert.equal(target.life.k, 'dead');
});

test('bolt-action hits to kill rise with armor: none 1, light 2, medium 2, heavy 3', () => {
  const shotsToKill = (armor: ArmorId) => {
    const w = emptyWorld();
    const sniper = spawnAt(w, 1000, 1000, { loadout: { weapon: 'sniper' } });
    const target = spawnAt(w, 1600, 1000, { loadout: { armor } });
    let shots = 0;
    while (target.life.k === 'alive' && shots < 10) { shootOnce(w, sniper, 0, WEAPONS.sniper.fireMs + 100); shots++; }
    return shots;
  };
  assert.deepEqual(ARMOR_IDS.map(shotsToKill), [1, 2, 2, 3]);
});

test('no rifle out-damages the SMG at close range', () => {
  const dps = (id: keyof typeof WEAPONS) => (WEAPONS[id].damage * WEAPONS[id].pellets * 1000) / WEAPONS[id].fireMs;
  for (const id of ['assault', 'lmg', 'pistol'] as const) assert.ok(dps(id) < dps('smg'), `${id} ${dps(id).toFixed(0)} < smg ${dps('smg').toFixed(0)}`);
});
