/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BUILDINGS, ZOMBIES } from '../src/shared/defs.ts';
import type { GameEvent, Snapshot } from '../src/shared/protocol.ts';
import { releaseDue, scheduleEffects } from '../src/client/eventclock.ts';

const ME = 1;
const snapWith = (events: GameEvent[]): Snapshot => ({ players: [], events } as unknown as Snapshot);

test('shots are left to the drawn muzzle, mine and everyone else\'s', () => {
  const later = scheduleEffects(snapWith([
    { e: 'shot', x: 0, y: 0, angle: 0, silenced: false, owner: ME, gun: 'pistol' },
    { e: 'shot', x: 50, y: 0, angle: 0, silenced: false, owner: 2, gun: 'pistol' },
  ]), 1000);
  assert.deepEqual(later, []);
});

test('impacts, sparks and booms are drawn on the render clock, even from my own bullets', () => {
  const later = scheduleEffects(snapWith([
    { e: 'impact', x: 1, y: 1 },
    { e: 'dmg', attacker: ME, victim: 2, amount: 10, x: 2, y: 2, kind: 'player' },
    { e: 'boom', x: 3, y: 3, r: 50 },
    { e: 'kill', killer: 'a', victim: 'b', killerId: ME, victimId: 2, weapon: 'Pistol', bounty: false, assisters: [] },
  ]), 500);
  assert.deepEqual(later.map((p) => p.fx.kind), ['impact', 'impact', 'boom', 'death']);
});

test('a kill puffs where the killing blow landed, and a hit names its victim for the hit flash', () => {
  const later = scheduleEffects(snapWith([
    { e: 'dmg', attacker: ME, victim: 2, amount: 10, x: 5, y: 5, kind: 'player' },
    { e: 'dmg', attacker: ME, victim: 2, amount: 90, x: 8, y: 9, kind: 'player' },
    { e: 'dmg', attacker: ME, victim: 70, amount: 5, x: 1, y: 1, kind: 'crate' },
    { e: 'kill', killer: 'a', victim: 'b', killerId: ME, victimId: 2, weapon: 'Pistol', bounty: false, assisters: [] },
    { e: 'kill', killer: 'a', victim: 'c', killerId: ME, victimId: 3, weapon: 'Pistol', bounty: false, assisters: [] },
  ]), 500);
  const fx = later.map((p) => p.fx);
  assert.deepEqual(fx.filter((f) => f.kind === 'death'), [{ kind: 'death', x: 8, y: 9, victim: 2, by: ME }], 'no puff without a known blow');
  assert.deepEqual(fx.filter((f) => f.kind === 'impact').map((f) => f.kind === 'impact' && f.victim), [2, 2, null], 'crates never flash a player');
});

test('a knife slash draws an arc at the strike point on the render clock, including my own', () => {
  const later = scheduleEffects(snapWith([
    { e: 'slash', x: 10, y: 20, angle: 1.5, owner: ME },
    { e: 'slash', x: 30, y: 40, angle: 0, owner: 2 },
  ]), 700);
  assert.deepEqual(later, [
    { at: 700, fx: { kind: 'slash', x: 10, y: 20, angle: 1.5 } },
    { at: 700, fx: { kind: 'slash', x: 30, y: 40, angle: 0 } },
  ]);
});

test('deferred effects release exactly when the render clock reaches their tick', () => {
  const later = scheduleEffects(snapWith([{ e: 'impact', x: 1, y: 1 }]), 1000);
  const early = releaseDue(later, 999);
  assert.deepEqual(early.due, [], 'nothing shows before its tick');
  assert.equal(early.rest.length, 1);
  const onTime = releaseDue(early.rest, 1000);
  assert.equal(onTime.due.length, 1);
  assert.deepEqual(onTime.rest, []);
});

test('a turret\'s shot draws its round on the render clock from the barrel tip to the first zombie on its line, or to its range', () => {
  const shot: GameEvent = { e: 'turret', kind: 'cannon', x: 100, y: 200, angle: Math.PI / 2 };
  const { muzzle, range } = BUILDINGS.cannon.turret;
  const later = scheduleEffects(snapWith([shot]), 700);
  const open = later[0]!.fx;
  assert.ok(open.kind === 'tracer' && Math.abs(open.x - 100) < 1e-9 && open.y === 200 + muzzle && open.reach === range, JSON.stringify(open));
  const blocked = scheduleEffects({ ...snapWith([shot]), zombies: [[7, 0, 100, 400, 10], [8, 0, 100, 300, 10]] }, 700)[0]!.fx;
  assert.ok(blocked.kind === 'tracer' && Math.abs(blocked.reach - (300 - ZOMBIES.walker.radius - 200 - muzzle)) < 1e-6, JSON.stringify(blocked));
});
