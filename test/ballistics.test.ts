import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GUNS, rulesOf, WORLD } from '../src/shared/defs.ts';
import { step } from '../src/shared/sim.ts';
import { flightSec, flownAfter, MUZZLE } from '../src/shared/sim/ballistics.ts';
import { spreadFor } from '../src/shared/sim/stats.ts';
import { emptyWorld, equip, press, run, spawnAt, TICK_MS } from './helpers.ts';

const BODY_PX = 2 * WORLD.playerRadius;

test('a round crosses close range too fast to step out of, and slows to its cruise speed at range', () => {
  const pistol = GUNS.pistol.bulletSpeed;
  const dodgeSec = (d: number) => BODY_PX / WORLD.baseSpeed - flightSec(pistol, d);
  assert.ok(flightSec(pistol, 250) < BODY_PX / WORLD.baseSpeed, 'at 250px the round lands before an unarmored runner covers a body width');
  assert.ok(WORLD.baseSpeed * (flightSec(pistol, 150) + 1 / WORLD.tickHz) < WORLD.playerRadius, 'a runner already strafing at 150px is still hit by a shot at their body');
  assert.ok(dodgeSec(900) < 0 && flightSec(pistol, 900) > 0.6, 'at 900px it takes long enough to read and sidestep');
  assert.ok(flightSec(pistol, 200) < 200 / pistol, 'faster than cruise out of the muzzle');
  const late = flownAfter(pistol, 2) - flownAfter(pistol, 1.9);
  assert.ok(Math.abs(late - pistol * 0.1) < 1, 'and back to cruise speed far out');
  assert.ok(Math.abs(flownAfter(pistol, flightSec(pistol, 500)) - 500) < 1e-6, 'flight time and distance agree');
  assert.ok(MUZZLE.boost > 0);
});

test('the server moves a round by the same curve, tick by tick', () => {
  const w = emptyWorld();
  const p = spawnAt(w, 500, 500);
  press(w, p, { angle: 0, fire: true, shots: 1 });
  step(w, TICK_MS);
  const b = w.bullets[0]!;
  const start = b.x - (b.flown ?? 0);
  for (let i = 0; i < 5; i++) step(w, TICK_MS);
  const expected = flownAfter(GUNS.pistol.bulletSpeed, (6 * TICK_MS) / 1000);
  assert.ok(Math.abs(b.x - start - expected) < 1, `${b.x - start} vs ${expected}`);
});

test('a planted sniper has no spread at all, while walking it still sprays', () => {
  for (const gun of ['sniper', 'longshot', 'semiAuto', 'piercer', 'repeater'] as const) {
    assert.equal(spreadFor(gun, {}, true), 0, `${gun} planted`);
    assert.ok(spreadFor(gun, {}, false) > 0, `${gun} walking`);
  }
  assert.ok(spreadFor('assault', {}, true) > 0, 'other classes keep their still spread');
});

test('a sniper round gets a gentler muzzle kick than other classes, and the server flies it on that curve', () => {
  const boost = rulesOf(GUNS.sniper).muzzleBoost;
  assert.ok(boost > 0 && boost < MUZZLE.boost);
  assert.equal(rulesOf(GUNS.piercer).muzzleBoost, boost, 'every sniper evolution inherits it');
  assert.equal(rulesOf(GUNS.railSlug).muzzleBoost, MUZZLE.boost, 'other classes keep the full kick');
  const w = emptyWorld();
  const p = spawnAt(w, 500, 500, { loadout: { weapon: 'sniper' } });
  equip(p, 'sniper');
  run(w, 400);
  press(w, p, { angle: 0, fire: true, shots: p.input.shots + 1 });
  step(w, TICK_MS);
  const b = w.bullets[0]!;
  const start = b.x - (b.flown ?? 0);
  for (let i = 0; i < 2; i++) step(w, TICK_MS);
  const expected = flownAfter(GUNS.sniper.bulletSpeed, (3 * TICK_MS) / 1000, 0, boost);
  assert.ok(Math.abs(b.x - start - expected) < 1, `${b.x - start} vs ${expected}`);
});
