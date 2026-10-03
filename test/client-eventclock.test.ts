/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { GameEvent, Snapshot } from '../src/shared/protocol.ts';
import { releaseDue, scheduleEffects } from '../src/client/eventclock.ts';

const ME = 1;
const snapWith = (events: GameEvent[]): Snapshot => ({ players: [], events } as unknown as Snapshot);

test('my own muzzle flash shows at once; another player\'s waits for the render clock', () => {
  const { now, later } = scheduleEffects(snapWith([
    { e: 'shot', x: 0, y: 0, angle: 0, silenced: false, owner: ME },
    { e: 'shot', x: 50, y: 0, angle: 0, silenced: false, owner: 2 },
  ]), 1000, ME);
  assert.equal(now.length, 1, 'own flash is immediate');
  assert.equal(later.length, 1, 'remote flash is deferred');
  assert.equal(later[0]!.at, 1000);
});

test('impacts, sparks and booms are drawn on the render clock, even from my own bullets', () => {
  const { now, later } = scheduleEffects(snapWith([
    { e: 'impact', x: 1, y: 1 },
    { e: 'dmg', attacker: ME, victim: 2, amount: 10, x: 2, y: 2, kind: 'player' },
    { e: 'boom', x: 3, y: 3, r: 50 },
    { e: 'kill', killer: 'a', victim: 'b', killerId: ME, victimId: 2, weapon: 'Pistol' },
  ]), 500, ME);
  assert.deepEqual(now, []);
  assert.deepEqual(later.map((p) => p.fx.kind), ['impact', 'impact', 'boom'], 'kills are not world effects');
});

test('deferred effects release exactly when the render clock reaches their tick', () => {
  const { later } = scheduleEffects(snapWith([{ e: 'impact', x: 1, y: 1 }]), 1000, ME);
  const early = releaseDue(later, 999);
  assert.deepEqual(early.due, [], 'nothing shows before its tick');
  assert.equal(early.rest.length, 1);
  const onTime = releaseDue(early.rest, 1000);
  assert.equal(onTime.due.length, 1);
  assert.deepEqual(onTime.rest, []);
});
