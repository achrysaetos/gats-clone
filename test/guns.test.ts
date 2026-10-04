import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EVOLUTIONS, GUN_IDS, GUNS, PERK_TIERS, WEAPON_IDS } from '../src/shared/defs.ts';
import { respawn } from '../src/shared/sim.ts';
import { snapshotFor } from '../src/shared/sim/snapshot.ts';
import { emptyWorld, run, shootUntilDead, spawnAt } from './helpers.ts';

test('every class gun branches twice, every stage-1 gun branches twice, and stage-2 guns are leaves', () => {
  for (const id of GUN_IDS) {
    const g = GUNS[id];
    assert.equal(EVOLUTIONS[id].length, g.stage < 2 ? 2 : 0, `${id} evolutions`);
    for (const child of EVOLUTIONS[id]) assert.deepEqual([GUNS[child].stage, GUNS[child].base], [g.stage + 1, g.base], `${child} follows ${id}`);
  }
  assert.deepEqual(GUN_IDS.filter((id) => GUNS[id].stage === 0), [...WEAPON_IDS], 'the class guns are the stage-0 guns');
  assert.equal(GUN_IDS.length, 42);
});

test('gun names are unique and no gun id collides with a perk id', () => {
  const names = GUN_IDS.map((id) => GUNS[id].name);
  assert.equal(new Set(names).size, names.length);
  const perks = new Set<string>(Object.values(PERK_TIERS).flat());
  assert.deepEqual(GUN_IDS.filter((id) => perks.has(id)), []);
});

test('dying puts the class gun back in your hands', () => {
  const w = emptyWorld();
  const victim = spawnAt(w, 500, 500, { loadout: { weapon: 'shotgun' } });
  const killer = spawnAt(w, 300, 500);
  victim.gun = 'railSlug';
  shootUntilDead(w, killer, victim);
  run(w, 3100);
  assert.ok(respawn(w, victim.id, victim.loadout));
  assert.equal(snapshotFor(w, victim.id).players.find((p) => p.id === victim.id)?.gun, 'shotgun');
});
