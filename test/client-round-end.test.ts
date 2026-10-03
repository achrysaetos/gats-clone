/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { OBJECTIVE_MS, objectiveVisible, topScorers } from '../src/client/derive.ts';
import type { LeaderRow } from '../src/shared/protocol.ts';

test('the objective banner never shows while the round is over', () => {
  assert.equal(objectiveVisible('playing', { winner: null }, 0), true, 'shows right after spawning');
  assert.equal(objectiveVisible('playing', { winner: 'Red team' }, 0), false, 'hidden under the win banner');
  assert.equal(objectiveVisible('playing', { winner: null }, OBJECTIVE_MS), false, 'fades after its time');
  assert.equal(objectiveVisible('dead', { winner: null }, 0), false, 'hidden on the death screen');
});

test('the round summary lists the three highest scores in order', () => {
  const rows: LeaderRow[] = [
    { id: 1, name: 'Ann', score: 40, team: null },
    { id: 2, name: 'Bo', score: 90, team: null },
    { id: 3, name: 'Cy', score: 10, team: null },
    { id: 4, name: 'Di', score: 65, team: null },
  ];
  assert.deepEqual(topScorers(rows, 3).map((r) => [r.name, r.score]), [['Bo', 90], ['Di', 65], ['Ann', 40]]);
  assert.deepEqual(topScorers(rows.slice(0, 2), 3).map((r) => r.name), ['Bo', 'Ann'], 'fewer players than places lists them all');
});
