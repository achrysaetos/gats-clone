import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GUNS, WORLD } from '../src/shared/defs.ts';
import type { GameEvent } from '../src/shared/protocol.ts';
import { step } from '../src/shared/sim.ts';
import type { Player, World } from '../src/shared/sim/world.ts';
import { emptyWorld, equip, hpOf, press, spawnAt, TICK_MS } from './helpers.ts';

function pressAndCollect(w: World, shooter: Player, ms: number): GameEvent[] {
  const events: GameEvent[] = [];
  press(w, shooter, { angle: 0, shots: shooter.input.shots + 1 });
  step(w, TICK_MS);
  events.push(...w.events);
  press(w, shooter, { angle: 0 });
  for (let t = 0; t < ms; t += TICK_MS) { step(w, TICK_MS); events.push(...w.events); }
  return events;
}

const ammoOf = (p: Player) => (p.life.k === 'alive' ? p.life.ammo : 0);

test('one press of a burst gun fires its burst, one round of ammo each, then waits out the cooldown', () => {
  const w = emptyWorld();
  const a = spawnAt(w, 500, 500);
  equip(a, 'machinePistol');
  const burst = { count: GUNS.machinePistol.burst?.count ?? 1 };
  const shots = (events: GameEvent[]) => events.filter((e) => e.e === 'shot').length;
  assert.equal(shots(pressAndCollect(w, a, GUNS.machinePistol.fireMs + 200)), burst.count, 'a single press');
  assert.equal(ammoOf(a), GUNS.machinePistol.mag - burst.count);
  assert.equal(shots(pressAndCollect(w, a, GUNS.machinePistol.fireMs + 200)), burst.count, 'the next press after the cooldown');
  assert.equal(ammoOf(a), GUNS.machinePistol.mag - 2 * burst.count);
});

test('a penetrating round hits one more player than it can pass through, then stops', () => {
  const w = emptyWorld();
  const a = spawnAt(w, 500, 500);
  equip(a, 'executioner');
  const line = [700, 800, 900].map((x) => spawnAt(w, x, 500));
  pressAndCollect(w, a, 500);
  assert.equal(GUNS.executioner.penetrate, 1);
  assert.deepEqual(line.map((p) => WORLD.baseHp - hpOf(p)), [GUNS.executioner.damage, GUNS.executioner.damage, 0]);
  assert.equal(w.bullets.length, 0);
});

test('a blast round damages bodies within its radius where it stops: at a wall, or at the end of its range', () => {
  const w = emptyWorld();
  const a = spawnAt(w, 500, 500);
  equip(a, 'thunderclap');
  w.walls.push({ x: 800, y: 300, w: 20, h: 400, built: false, expiresAt: Infinity });
  const nearWall = spawnAt(w, 770, 545);
  const clear = spawnAt(w, 770, 680);
  pressAndCollect(w, a, 400);
  assert.ok(hpOf(nearWall) < WORLD.baseHp, 'a body beside the impact takes splash');
  assert.equal(hpOf(clear), WORLD.baseHp, 'a body outside the radius does not');

  w.walls = [];
  const rangeEnd = a.x + WORLD.playerRadius + 4 + GUNS.thunderclap.range;
  const atRangeEnd = spawnAt(w, rangeEnd, 560);
  pressAndCollect(w, a, 1000);
  assert.ok(hpOf(atRangeEnd) < WORLD.baseHp, 'a spent round still bursts');
});

test('a silenced gun fires without revealing the shooter, like the silencer perk', () => {
  const w = emptyWorld();
  const a = spawnAt(w, 500, 500);
  equip(a, 'phantom');
  const shot = pressAndCollect(w, a, 100).find((e) => e.e === 'shot');
  assert.ok(shot?.e === 'shot' && shot.silenced);
  assert.ok(w.now >= a.revealedUntil);
});
