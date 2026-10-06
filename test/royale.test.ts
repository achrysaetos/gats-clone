import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RING, ZOM } from '../src/shared/defs.ts';
import type { Circle, GameEvent } from '../src/shared/protocol.ts';
import { step } from '../src/shared/sim.ts';
import { snapshotFor } from '../src/shared/sim/snapshot.ts';
import type { Player, World } from '../src/shared/sim/world.ts';
import { emptyWorld, hpOf, press, run, shootOnce, shootUntilDead, spawnAt, TICK_MS } from './helpers.ts';

/** Reads the life afresh, past what an earlier assertion narrowed it to. */
const lifeOf = (p: Player) => p.life;

function holdRing(w: World, circle: Circle, phase = 1) {
  w.royale!.ring = { k: 'waiting', phase, circle, next: circle, shrinkAt: Infinity };
}

function collect(w: World, ms: number): GameEvent[] {
  const seen: GameEvent[] = [];
  for (let t = 0; t < ms; t += TICK_MS) { step(w, TICK_MS); seen.push(...w.events); }
  return seen;
}

test('the ring burns only those outside it, through armor and the spawn shield, and holds their regen off', () => {
  const w = emptyWorld('BR');
  holdRing(w, { x: 1000, y: 1000, r: 400 });
  const inside = spawnAt(w, 1100, 1000, { team: 'red', loadout: { armor: 'heavy' } });
  const outside = spawnAt(w, 2000, 1000, { team: 'red', loadout: { armor: 'heavy' }, shielded: true });
  spawnAt(w, 200, 200, { team: 'blue' });
  run(w, 1000);
  assert.equal(hpOf(inside), 100);
  assert.ok(Math.abs(hpOf(outside) - (100 - RING[1]!.dps * 100)) < 0.5, `lost ${100 - hpOf(outside)} in a second`);
  if (inside.life.k === 'alive') inside.life.hp = 50;
  if (inside.life.k === 'alive') inside.life.lastDamageAt = -Infinity;
  const before = hpOf(outside);
  run(w, 6000);
  assert.ok(hpOf(inside) > 50, 'regenerates inside');
  assert.ok(hpOf(outside) < before - 5 * RING[1]!.dps * 100, 'no regen while burning');
});

test('a player with a squadmate standing is knocked, not killed, and the knock pays the kill; enemies can shoot the knocked player to finish them', () => {
  const w = emptyWorld('BR');
  const shooter = spawnAt(w, 1000, 1000, { team: 'blue' });
  const victim = spawnAt(w, 1200, 1000, { team: 'red' });
  spawnAt(w, 3000, 3000, { team: 'red' });
  shootUntilDead(w, shooter, victim);
  assert.equal(lifeOf(victim).k, 'downed');
  assert.equal(shooter.kills, 1);
  assert.equal(shooter.score, 100);
  for (let i = 0; i < 10 && lifeOf(victim).k === 'downed'; i++) shootOnce(w, shooter, 0, 300);
  assert.equal(lifeOf(victim).k, 'dead');
  assert.equal(shooter.kills, 1, 'the finish pays no second kill');
});

test('a squad is out once nobody in it stands: its knocked players die with it and it places below the squads still in', () => {
  const w = emptyWorld('BR');
  const shooter = spawnAt(w, 1000, 1000, { team: 'blue' });
  const first = spawnAt(w, 1200, 1000, { team: 'red' });
  const last = spawnAt(w, 1000, 1200, { team: 'red' });
  spawnAt(w, 4000, 4000, { team: 'green' });
  shootUntilDead(w, shooter, first);
  assert.equal(lifeOf(first).k, 'downed');
  const events: GameEvent[] = [];
  for (let i = 0; i < 40 && lifeOf(last).k === 'alive'; i++) { shootOnce(w, shooter, Math.PI / 2, 0); events.push(...w.events, ...collect(w, 300)); }
  step(w, TICK_MS);
  events.push(...w.events);
  assert.equal(lifeOf(last).k, 'dead', 'the last one standing dies outright');
  assert.equal(lifeOf(first).k, 'dead', 'the knocked squadmate dies with the squad');
  assert.deepEqual(events.filter((e) => e.e === 'wiped'), [{ e: 'wiped', team: 'red', place: 3 }]);
  assert.equal(w.match.k, 'playing', 'two squads are still in');
});

test('the last squad standing wins, and every squad reads back the place it went out in', () => {
  const w = emptyWorld('BR');
  const shooter = spawnAt(w, 1000, 1000, { team: 'blue' });
  const green = spawnAt(w, 1200, 1000, { team: 'green' });
  const red = spawnAt(w, 1000, 1200, { team: 'red' });
  shootUntilDead(w, shooter, green);
  shootUntilDead(w, shooter, red, Math.PI / 2);
  step(w, TICK_MS);
  assert.equal(w.match.k, 'over');
  if (w.match.k === 'over') assert.deepEqual(w.match.winner, { name: 'Blue squad', id: null, note: 'Last squad standing' });
  const place = (p: Player) => snapshotFor(w, p.id).royale!.result?.place;
  assert.deepEqual([place(shooter), place(red), place(green)], [1, 2, 3]);
  assert.equal(snapshotFor(w, shooter.id).royale!.result!.of, 3);
});

test('bullets spare a squadmate but hurt every other squad', () => {
  const w = emptyWorld('BR');
  const shooter = spawnAt(w, 1000, 1000, { team: 'green' });
  const mate = spawnAt(w, 1200, 1000, { team: 'green' });
  const rival = spawnAt(w, 1000, 1200, { team: 'yellow' });
  shootOnce(w, shooter, 0);
  assert.equal(hpOf(mate), 100);
  shootOnce(w, shooter, Math.PI / 2);
  assert.ok(hpOf(rival) < 100);
});

test('a squadmate holding use beside a knocked player revives them; left alone they bleed out', () => {
  const w = emptyWorld('BR');
  const shooter = spawnAt(w, 1000, 1000, { team: 'blue' });
  const victim = spawnAt(w, 1200, 1000, { team: 'red' });
  const medic = spawnAt(w, 1200, 1050, { team: 'red' });
  shootUntilDead(w, shooter, victim);
  press(w, medic, { use: true });
  run(w, ZOM.reviveMs + 100);
  assert.equal(lifeOf(victim).k, 'alive');
  assert.equal(w.royale!.stats.get(medic.id)?.revives, 1);
  press(w, medic, {});
  shootUntilDead(w, shooter, victim);
  run(w, ZOM.bleedOutMs + 100);
  assert.equal(lifeOf(victim).k, 'dead');
});
