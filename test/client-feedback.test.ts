/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addFeedback, HURT_MS, NO_FEEDBACK, NUMBER_MS, type Feedback } from '../src/client/feedback.ts';
import type { DamageKind, GameEvent } from '../src/shared/protocol.ts';

const ME = 1;
const dmg = (attacker: number | null, victim: number, amount: number, kind: DamageKind = 'player'): GameEvent =>
  ({ e: 'dmg', attacker, victim, amount, x: victim * 10, y: 0, kind });
const kill = (killerId: number, victimId: number): GameEvent => ({ e: 'kill', killer: 'k', victim: 'v', killerId, victimId, weapon: 'Pistol' });
const apply = (events: GameEvent[], now = 1000, fb: Feedback = NO_FEEDBACK) => addFeedback(fb, events, ME, 100, now);

// Defect: everyone's hits draw a hitmarker, so it no longer means "I hit someone".
test('the hitmarker shows only for damage you deal to a player', () => {
  assert.deepEqual(apply([dmg(ME, 2, 20)]).hitmarker, { born: 1000, kill: false });
  assert.equal(apply([dmg(3, 2, 20)]).hitmarker, null, 'someone else hitting someone');
  assert.equal(apply([dmg(ME, 50, 20, 'crate')]).hitmarker, null, 'hitting a crate');
  assert.equal(apply([dmg(2, ME, 20)]).hitmarker, null, 'being hit');
});

// Defect: a kill looks the same as any other hit.
test('a kill upgrades the hitmarker, and a later plain hit in the same burst does not downgrade it', () => {
  const fb = apply([dmg(ME, 2, 20), kill(ME, 2), dmg(ME, 3, 20)]);
  assert.deepEqual(fb.hitmarker, { born: 1000, kill: true });
  assert.equal(apply([kill(4, 2)]).hitmarker, null, 'another player\'s kill');
});

// Defect: numbers appear for damage other players deal, or each pellet spawns its own number.
test('damage numbers show your damage, summing rapid hits on one target', () => {
  const pellets = apply([dmg(ME, 2, 15), dmg(ME, 2, 15), dmg(ME, 3, 15), dmg(4, 2, 99)]);
  assert.deepEqual(pellets.numbers.map((n) => [n.victim, n.amount]), [[2, 30], [3, 15]]);
  const later = apply([dmg(ME, 2, 10)], 1100, pellets);
  assert.deepEqual(later.numbers.map((n) => [n.victim, n.amount]), [[2, 40], [3, 15]], 'a hit 100ms later joins the same number');
  const separate = apply([dmg(ME, 2, 10)], 1000 + 600, pellets);
  assert.deepEqual(separate.numbers.map((n) => [n.victim, n.amount]), [[2, 30], [3, 15], [2, 10]], 'a hit after a pause starts a new number');
  assert.deepEqual(apply([], 1000 + NUMBER_MS, pellets).numbers, [], 'numbers expire');
});

// Defect: the vignette ignores how hard you were hit, or fires for damage you deal.
test('the hurt vignette scales with damage taken and ignores damage you deal', () => {
  assert.equal(apply([dmg(2, ME, 25)]).hurt?.strength, 0.25);
  assert.equal(apply([dmg(2, ME, 250)]).hurt?.strength, 1, 'capped at full strength');
  assert.equal(apply([dmg(ME, 2, 25)]).hurt, null);
  const stacked = apply([dmg(2, ME, 20)], 1000 + HURT_MS / 2, apply([dmg(2, ME, 40)]));
  assert.ok(Math.abs(stacked.hurt!.strength - 0.4) < 1e-9, 'a second hit adds to what is left of the first');
});
