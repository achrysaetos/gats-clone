import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ExtView } from '../src/shared/protocol.ts';
import { extGoal, extStatus, extSteps, roleOf, roundLabel } from '../src/client/extract.ts';

const base: ExtView = {
  round: 2, attackers: 'blue', wins: { red: 1, blue: 0 },
  terminal: { x: 2650, y: 650, r: 110 }, pad: { x: 200, y: 2600, w: 300, h: 300 },
  case: { k: 'hacking', progress: 0.62, contested: false }, roundEndsAt: 300_000, between: null,
};
const name = (id: number) => `p${id}`;

test('sides follow the round: blue attacks round 2 and red defends', () => {
  assert.equal(roleOf(base, 'blue'), 'attack');
  assert.equal(roleOf(base, 'red'), 'defend');
  assert.equal(roleOf(base, null), null);
});

test('the status line reads the hack, the case and the carrier from each side', () => {
  assert.equal(extStatus(base, 'attack', 1, 0, name), 'Hacking 62%');
  assert.equal(extStatus({ ...base, case: { k: 'hacking', progress: 0.62, contested: true } }, 'attack', 1, 0, name), 'Hack contested');
  const carried: ExtView = { ...base, case: { k: 'carried', by: 7, x: 0, y: 0 } };
  assert.equal(extStatus(carried, 'attack', 7, 0, name), 'You have the case: get to the pad');
  assert.equal(extStatus(carried, 'attack', 1, 0, name), 'Escort p7 to the pad');
  assert.equal(extStatus(carried, 'defend', 1, 0, name), 'p7 has the case: stop them');
  assert.equal(extStatus({ ...base, case: { k: 'dropped', x: 0, y: 0, returnAt: 12_400 } }, 'defend', 1, 0, name), 'Case dropped · returns in 13s');
  assert.equal(extStatus({ ...base, roundEndsAt: null, between: { winner: 'blue', why: 'extracted', nextAt: 4000 } }, 'attack', 1, 0, name), 'Blue extracted the case · round 3 in 4s');
});

test('the goal arrow points each side at its next job, and the carrier at the pad', () => {
  assert.deepEqual(extGoal(base, 'attack', 1), { x: 2650, y: 650, r: 110, label: 'HACK' });
  assert.deepEqual(extGoal({ ...base, case: { k: 'dropped', x: 900, y: 900, returnAt: 0 } }, 'defend', 1), { x: 900, y: 900, label: 'RETURN CASE' });
  const carried: ExtView = { ...base, case: { k: 'carried', by: 7, x: 1200, y: 1300 } };
  assert.deepEqual(extGoal(carried, 'attack', 7), { x: 350, y: 2750, label: 'EXTRACT' });
  assert.deepEqual(extGoal(carried, 'defend', 1), { x: 1200, y: 1300, label: 'STOP CARRIER' });
  assert.equal(extGoal({ ...base, between: { winner: 'red', why: 'time', nextAt: 0 } }, 'attack', 1), null, 'nothing to chase between rounds');
});

test('the checklist ticks the hack, the pickup and the extraction in turn, and the pill shows the round clock', () => {
  assert.deepEqual(extSteps(base).map((s) => s.done), [false, false, false]);
  assert.deepEqual(extSteps({ ...base, case: { k: 'carried', by: 7, x: 0, y: 0 } }).map((s) => s.done), [true, true, false]);
  assert.deepEqual(extSteps({ ...base, case: { k: 'carried', by: 7, x: 0, y: 0 }, between: { winner: 'blue', why: 'extracted', nextAt: 0 } }).map((s) => s.done), [true, true, true]);
  assert.equal(roundLabel(base, 300_000 - 133_000), 'R2 · 2:13');
});
