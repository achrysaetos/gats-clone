import assert from 'node:assert/strict';
import { test } from 'node:test';
import { WORLD } from '../src/shared/defs.ts';
import type { GameEvent } from '../src/shared/protocol.ts';
import { step } from '../src/shared/sim.ts';
import { snapshotFor } from '../src/shared/sim/snapshot.ts';
import { choosePick } from '../src/shared/sim/stats.ts';
import { createWorld } from '../src/shared/sim/world.ts';
import { emptyWorld, equip, grantPerks, medalPay, offerPerks, press, run, spawnAt, TICK_MS } from './helpers.ts';

test('killing a hunted player pays the bounty on top of the kill score, and the kill says so', () => {
  const w = emptyWorld();
  w.firstBlood = true;
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
    const medals = events.flatMap((e) => (e.e === 'medal' ? [e.medal] : []));
    return { gained: a.score - before - medalPay(events.filter((e) => e.e === 'medal' && e.medal !== 'bounty'), a.id), bounty: kill?.e === 'kill' && kill.bounty, paid: medals.includes('bounty') };
  };
  assert.deepEqual(killOne('pistol'), { gained: WORLD.killScore, bounty: false, paid: false });
  assert.deepEqual(killOne('executioner'), { gained: WORLD.killScore + WORLD.bountyScore, bounty: true, paid: true }, 'the bounty medal pays the bounty');
});

test('every enemy sees a hunted player on the minimap as a ping; teammates see an ally, not a threat', () => {
  const w = emptyWorld('TDM');
  const hunter = spawnAt(w, 2600, 2600, { team: 'red' });
  const ally = spawnAt(w, 300, 300, { team: 'red' });
  const enemy = spawnAt(w, 300, 2600, { team: 'blue' });
  const marks = (viewer: typeof ally) => snapshotFor(w, viewer.id).minimap.filter((m) => m.x === hunter.x && m.y === hunter.y);
  assert.deepEqual(marks(enemy), [], 'a far enemy with a stage-1 gun stays hidden');
  equip(hunter, 'juggernaut');
  step(w, TICK_MS);
  assert.deepEqual(marks(enemy).map((m) => m.pingAge), [0]);
  assert.deepEqual(marks(ally).map((m) => m.pingAge), [null]);
  const near = spawnAt(w, 2500, 2600, { team: 'red' });
  const seenByAlly = snapshotFor(w, near.id).players.find((p) => p.id === hunter.id);
  assert.equal(seenByAlly?.hunted, false, 'no hunted marker over a teammate');
  assert.equal(snapshotFor(w, hunter.id).players.find((p) => p.id === hunter.id)?.hunted, true, 'the hunted player knows it');
});

function huntedPhantom() {
  const w = emptyWorld();
  const hunter = spawnAt(w, 2600, 2600);
  const enemy = spawnAt(w, 300, 300);
  equip(hunter, 'phantom');
  step(w, TICK_MS);
  const mark = () => snapshotFor(w, enemy.id).minimap.map((m) => ({ x: Math.round(m.x), y: Math.round(m.y) }));
  return { w, hunter, mark };
}

test('a hunted enemy stays where the last ping caught them until the next ping, 2.5s later', () => {
  const { w, hunter, mark } = huntedPhantom();
  assert.deepEqual(mark(), [{ x: 2600, y: 2600 }]);
  press(w, hunter, { left: true });
  run(w, 1000);
  assert.ok(hunter.x < 2400, `the hunter moved (x ${hunter.x})`);
  assert.deepEqual(mark(), [{ x: 2600, y: 2600 }], 'frozen between pings');
  run(w, 1600);
  const at = mark()[0]!;
  assert.ok(at.x < 2000 && Math.abs(at.x - hunter.x) < 200, `the next ping moved the mark (x ${at.x}, hunter ${Math.round(hunter.x)})`);
});

test('an unsilenced shot from a hunted player pings them at once; a silenced one does not', () => {
  const { w, hunter, mark } = huntedPhantom();
  press(w, hunter, { left: true });
  run(w, 1000);
  press(w, hunter, { shots: hunter.input.shots + 1 });
  step(w, TICK_MS);
  assert.deepEqual(mark(), [{ x: 2600, y: 2600 }], 'the silenced Phantom keeps its old ping');
  equip(hunter, 'juggernaut');
  press(w, hunter, { shots: hunter.input.shots + 1 });
  run(w, 100);
  assert.deepEqual(mark(), [{ x: Math.round(hunter.x), y: Math.round(hunter.y) }], 'the loud Juggernaut is pinged where it fired');
});

test('reaching a stage-2 gun announces the hunt to everyone, however far away', () => {
  const w = emptyWorld();
  const a = spawnAt(w, 300, 300, { name: 'Kestrel' });
  const far = spawnAt(w, 2700, 2700);
  a.level = 4;
  offerPerks(a, 'shield');
  for (const [level, option] of [[1, 'handCannon'], [2, 'lightweight'], [3, 'shield'], [4, 'dash']] as const) assert.ok(choosePick(w, a.id, level, option));
  const shipped = () => { step(w, TICK_MS); return snapshotFor(w, far.id).events.filter((e) => e.e === 'hunted'); };
  assert.deepEqual(shipped(), [], 'stage 1 is not hunted');
  a.level = 5;
  assert.ok(choosePick(w, a.id, 5, 'gunslinger'));
  assert.deepEqual(shipped(), [{ e: 'hunted', id: a.id, name: 'Kestrel' }], 'the tick after the pick ships the announcement');
  assert.deepEqual(shipped(), [], 'announced once');
});

test('a hunted player cannot vanish in a ghillie suit', () => {
  const w = emptyWorld();
  const camper = spawnAt(w, 500, 500, { loadout: { weapon: 'sniper' } });
  const enemy = spawnAt(w, 900, 500);
  grantPerks(w, camper, ['ghillie']);
  const seen = () => snapshotFor(w, enemy.id).players.some((p) => p.id === camper.id);
  run(w, 1000);
  assert.equal(seen(), false, 'a still ghillie player with a class gun is hidden');
  equip(camper, 'ghost');
  assert.equal(seen(), true);
});

test('a squadmate on a stage-2 gun in a zombies run is never hunted: no announcement, no marker, no ping', () => {
  const w = createWorld('ZOM', 1, 'outpost');
  const a = spawnAt(w, 1400, 1400, { name: 'Bramble' });
  const mate = spawnAt(w, 1600, 1400);
  a.level = 4;
  offerPerks(a, 'shield');
  for (const [level, option] of [[1, 'handCannon'], [2, 'lightweight'], [3, 'shield'], [4, 'dash']] as const) assert.ok(choosePick(w, a.id, level, option));
  a.level = 5;
  assert.ok(choosePick(w, a.id, 5, 'gunslinger'));
  step(w, TICK_MS);
  const snap = snapshotFor(w, mate.id);
  assert.deepEqual(snap.events.filter((e) => e.e === 'hunted'), []);
  assert.equal(snap.players.find((p) => p.id === a.id)?.hunted, false);
  assert.equal(snapshotFor(w, a.id).players.find((p) => p.id === a.id)?.hunted, false, 'not even to themself');
  assert.equal(a.huntedPing, null);
});
