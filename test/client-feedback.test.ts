/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addFeedback, ASSIST_MS, HURT_ARC_MS, HURT_MS, NO_FEEDBACK, NUMBER_MS, numberHeight, type Feedback } from '../src/client/feedback.ts';
import type { DamageKind, GameEvent } from '../src/shared/protocol.ts';

const ME = 1;
const dmg = (attacker: number | null, victim: number, amount: number, kind: DamageKind = 'player'): GameEvent =>
  ({ e: 'dmg', attacker, victim, amount, x: victim * 10, y: 0, kind });
const kill = (killerId: number, victimId: number, assisters: number[] = []): GameEvent => ({ e: 'kill', killer: 'k', victim: 'v', killerId, victimId, weapon: 'Pistol', bounty: false, assisters });
const apply = (events: GameEvent[], now = 1000, fb: Feedback = NO_FEEDBACK, players: { id: number; x: number; y: number }[] = []) => addFeedback(fb, events, players, ME, 100, now);

test('the hitmarker shows only for damage you deal to a player or a zombie', () => {
  assert.deepEqual(apply([dmg(ME, 2, 20)]).hitmarker, { born: 1000, kill: false });
  assert.deepEqual(apply([dmg(ME, 60, 20, 'zombie')]).hitmarker, { born: 1000, kill: false });
  assert.deepEqual(apply([{ e: 'zkill', id: 60, kind: 'walker', x: 0, y: 0, by: ME }]).hitmarker, { born: 1000, kill: true }, 'your zombie kill');
  assert.equal(apply([{ e: 'zkill', id: 60, kind: 'walker', x: 0, y: 0, by: 3 }]).hitmarker, null, 'a squadmate\'s zombie kill');
  assert.equal(apply([dmg(null, 50, 20, 'building')]).hitmarker, null, 'a zombie biting a wall');
  assert.equal(apply([dmg(3, 2, 20)]).hitmarker, null, 'someone else hitting someone');
  assert.equal(apply([dmg(ME, 50, 20, 'crate')]).hitmarker, null, 'hitting a crate');
  assert.equal(apply([dmg(2, ME, 20)]).hitmarker, null, 'being hit');
});

test('a kill upgrades the hitmarker, and a later plain hit in the same burst does not downgrade it', () => {
  const fb = apply([dmg(ME, 2, 20), kill(ME, 2), dmg(ME, 3, 20)]);
  assert.deepEqual(fb.hitmarker, { born: 1000, kill: true });
  assert.equal(apply([kill(4, 2)]).hitmarker, null, 'another player\'s kill');
});

test('damage numbers show your damage, summing rapid hits on one target', () => {
  const pellets = apply([dmg(ME, 2, 15), dmg(ME, 2, 15), dmg(ME, 3, 15), dmg(4, 2, 99)]);
  assert.deepEqual(pellets.numbers.map((n) => [n.victim, n.amount]), [[2, 30], [3, 15]]);
  const later = apply([dmg(ME, 2, 10)], 1100, pellets);
  assert.deepEqual(later.numbers.map((n) => [n.victim, n.amount]), [[2, 40], [3, 15]], 'a hit 100ms later joins the same number');
  const separate = apply([dmg(ME, 2, 10)], 1000 + 600, pellets);
  assert.deepEqual(separate.numbers.map((n) => [n.victim, n.amount]), [[2, 30], [3, 15], [2, 10]], 'a hit after a pause starts a new number');
  assert.deepEqual(apply([], 1000 + NUMBER_MS, pellets).numbers, [], 'numbers expire');
});

test('a new number over a victim starts clear above the ones still floating there, and keeps clear as they rise', () => {
  const first = apply([dmg(ME, 2, 10), dmg(ME, 3, 10)]);
  const at = 1000 + 400;
  const second = apply([dmg(ME, 2, 10)], at, first);
  const [old, other, fresh] = second.numbers;
  assert.equal(numberHeight(other!, at), numberHeight(old!, at), 'victim 3 is unaffected');
  for (const t of [at, at + 300, at + 490]) assert.ok(numberHeight(fresh!, t) - numberHeight(old!, t) >= 20, `still apart ${t - at}ms later`);
  assert.equal(apply([dmg(ME, 3, 10)], 1000 + NUMBER_MS + 10, second).numbers.at(-1)!.lift, 0, 'with nothing left floating over a victim, its number starts at the bottom');
});

test('a merged hit keeps its number where it was drawn instead of snapping back down', () => {
  const first = apply([dmg(ME, 2, 10)]);
  const merged = apply([dmg(ME, 2, 10)], 1250, first);
  assert.equal(merged.numbers.length, 1);
  assert.ok(Math.abs(numberHeight(merged.numbers[0]!, 1250) - numberHeight(first.numbers[0]!, 1250)) < 1e-9);
});

test('a hit draws an arc on the side the attacker stands, or where the hit landed when the attacker is unseen', () => {
  const at = (x: number, y: number) => [{ id: ME, x: 500, y: 500 }, { id: 2, x, y }];
  const [east] = apply([dmg(2, ME, 20)], 1000, NO_FEEDBACK, at(900, 500)).arcs;
  assert.equal(east?.angle, 0, 'attacker due east');
  const [north] = apply([dmg(2, ME, 20)], 1000, NO_FEEDBACK, at(500, 100)).arcs;
  assert.equal(north?.angle, -Math.PI / 2, 'attacker due north, screen y grows downward');
  const unseen = apply([{ e: 'dmg', attacker: 9, victim: ME, amount: 20, x: 500, y: 520, kind: 'player' }], 1000, NO_FEEDBACK, at(0, 0)).arcs;
  assert.deepEqual(unseen.map((a) => a.angle), [Math.PI / 2], 'an attacker off the snapshot falls back to the impact point, below you');
  assert.deepEqual(apply([dmg(ME, 2, 20)], 1000, NO_FEEDBACK, at(900, 500)).arcs, [], 'damage you deal draws no arc');
});

test('a stream of hits from one side refreshes one arc, and arcs fade', () => {
  const players = [{ id: ME, x: 0, y: 0 }, { id: 2, x: 100, y: 0 }, { id: 3, x: -100, y: 0 }];
  const first = apply([dmg(2, ME, 10)], 1000, NO_FEEDBACK, players);
  const stream = apply([dmg(2, ME, 10)], 1100, first, players);
  assert.equal(stream.arcs.length, 1, 'same side merges');
  assert.equal(stream.arcs[0]!.born, 1100, 'the merged arc restarts its fade');
  assert.ok(stream.arcs[0]!.strength > first.arcs[0]!.strength, 'and grows stronger');
  assert.equal(apply([dmg(3, ME, 10)], 1100, first, players).arcs.length, 2, 'the opposite side adds its own arc');
  assert.deepEqual(apply([], 1000 + HURT_ARC_MS, first, players).arcs, [], 'arcs expire');
});

test('the hurt vignette scales with damage taken and ignores damage you deal', () => {
  assert.equal(apply([dmg(2, ME, 25)]).hurt?.strength, 0.25);
  assert.equal(apply([dmg(2, ME, 250)]).hurt?.strength, 1, 'capped at full strength');
  assert.equal(apply([dmg(ME, 2, 25)]).hurt, null);
  const stacked = apply([dmg(2, ME, 20)], 1000 + HURT_MS / 2, apply([dmg(2, ME, 40)]));
  assert.ok(Math.abs(stacked.hurt!.strength - 0.4) < 1e-9, 'a second hit adds to what is left of the first');
});

test('an assist on someone else\'s kill shows the assist bonus, and only to the assister', () => {
  assert.deepEqual(apply([kill(4, 2, [ME])]).assist, { born: 1000 });
  assert.equal(apply([kill(4, 2, [5])]).assist, null, 'another player\'s assist');
  assert.equal(apply([], 1000 + ASSIST_MS, apply([kill(4, 2, [ME])])).assist, null, 'it fades');
});
