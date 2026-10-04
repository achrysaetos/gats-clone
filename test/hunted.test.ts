import assert from 'node:assert/strict';
import { test } from 'node:test';
import { WORLD } from '../src/shared/defs.ts';
import type { GameEvent } from '../src/shared/protocol.ts';
import { step } from '../src/shared/sim.ts';
import { snapshotFor } from '../src/shared/sim/snapshot.ts';
import { choosePick } from '../src/shared/sim/stats.ts';
import { emptyWorld, equip, press, spawnAt, TICK_MS } from './helpers.ts';

test('killing a hunted player pays the bounty on top of the kill score, and the kill says so', () => {
  const w = emptyWorld();
  const a = spawnAt(w, 500, 500);
  const killOne = (gun: 'pistol' | 'executioner') => {
    const v = spawnAt(w, 650, 500);
    equip(v, gun);
    if (v.life.k === 'alive') v.life.hp = 1;
    const before = a.score;
    const events: GameEvent[] = [];
    press(w, a, { angle: 0, shots: a.input.shots + 1 });
    for (let t = 0; t < 300; t += TICK_MS) { step(w, TICK_MS); events.push(...w.events); }
    assert.equal(v.life.k, 'dead');
    w.players.delete(v.id);
    const kill = events.find((e) => e.e === 'kill');
    return { gained: a.score - before, bounty: kill?.e === 'kill' && kill.bounty };
  };
  assert.deepEqual(killOne('pistol'), { gained: WORLD.killScore, bounty: false });
  assert.deepEqual(killOne('executioner'), { gained: WORLD.killScore + WORLD.bountyScore, bounty: true });
});

test('every enemy sees a hunted player on the minimap; teammates see an ally, not a threat', () => {
  const w = emptyWorld('TDM');
  const hunter = spawnAt(w, 2600, 2600, { team: 'red' });
  const ally = spawnAt(w, 300, 300, { team: 'red' });
  const enemy = spawnAt(w, 300, 2600, { team: 'blue' });
  const marks = (viewer: typeof ally) => snapshotFor(w, viewer.id).minimap.filter((m) => m.x === hunter.x && m.y === hunter.y);
  assert.deepEqual(marks(enemy), [], 'a far enemy with a stage-1 gun stays hidden');
  equip(hunter, 'juggernaut');
  assert.deepEqual(marks(enemy).map((m) => m.hunted), [true]);
  assert.deepEqual(marks(ally).map((m) => m.hunted), [false]);
  const near = spawnAt(w, 2500, 2600, { team: 'red' });
  const seenByAlly = snapshotFor(w, near.id).players.find((p) => p.id === hunter.id);
  assert.equal(seenByAlly?.hunted, false, 'no hunted marker over a teammate');
  assert.equal(snapshotFor(w, hunter.id).players.find((p) => p.id === hunter.id)?.hunted, true, 'the hunted player knows it');
});

test('reaching a stage-2 gun announces the hunt to everyone, however far away', () => {
  const w = emptyWorld();
  const a = spawnAt(w, 300, 300, { name: 'Kestrel' });
  const far = spawnAt(w, 2700, 2700);
  a.level = 5;
  for (const [level, option] of [[1, 'grip'], [2, 'handCannon'], [3, 'shield'], [4, 'dash']] as const) assert.ok(choosePick(w, a.id, level, option));
  assert.deepEqual(snapshotFor(w, far.id).events.filter((e) => e.e === 'hunted'), [], 'stage 1 is not hunted');
  assert.ok(choosePick(w, a.id, 5, 'thunderclap'));
  assert.deepEqual(snapshotFor(w, far.id).events.filter((e) => e.e === 'hunted'), [{ e: 'hunted', id: a.id, name: 'Kestrel' }]);
});
