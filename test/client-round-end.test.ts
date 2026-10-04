/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEATH_ARM_MS, deathScreenArmed, nextObjectiveSeen, NO_OBJECTIVE_SEEN, OBJECTIVE_MS, objectiveVisible, topScorers } from '../src/client/derive.ts';
import type { LeaderRow } from '../src/shared/protocol.ts';

test('the objective banner never shows while the round is over', () => {
  assert.equal(objectiveVisible('playing', { winner: null }, 0), true, 'shows right after spawning');
  assert.equal(objectiveVisible('playing', { winner: 'Red team' }, 0), false, 'hidden under the win banner');
  assert.equal(objectiveVisible('playing', { winner: null }, OBJECTIVE_MS), false, 'fades after its time');
  assert.equal(objectiveVisible('dead', { winner: null }, 0), false, 'hidden on the death screen');
});

test('the round summary lists the top three by round kills, whatever their current life\'s score', () => {
  const rows: LeaderRow[] = [
    { id: 1, name: 'Ann', score: 40, kills: 9, team: null },
    { id: 2, name: 'Bo', score: 90, kills: 3, team: null },
    { id: 3, name: 'Cy', score: 10, kills: 1, team: null },
    { id: 4, name: 'Di', score: 65, kills: 5, team: null },
  ];
  assert.deepEqual(topScorers(rows, 3).map((r) => [r.name, r.kills]), [['Ann', 9], ['Di', 5], ['Bo', 3]]);
  assert.deepEqual(topScorers(rows.slice(0, 2), 3).map((r) => r.name), ['Ann', 'Bo'], 'fewer players than places lists them all');
});

test('the objective banner introduces each round once, not every respawn', () => {
  const ffa = { mode: 'FFA', map: 'Boneyard', winner: null } as const;
  const join = nextObjectiveSeen(NO_OBJECTIVE_SEEN, 'playing', ffa, null, 1000);
  assert.equal(join.at, 1000, 'shown on joining');
  const dead = nextObjectiveSeen(join, 'dead', ffa, null, 9000);
  assert.equal(nextObjectiveSeen(dead, 'playing', ffa, null, 12000).at, 1000, 'a respawn into the same round keeps the old time, so it stays hidden');
  assert.equal(nextObjectiveSeen(join, 'playing', { ...ffa, map: 'Old Town' }, null, 12000).at, 12000, 'a new map introduces itself');
  assert.equal(nextObjectiveSeen(join, 'playing', { ...ffa, mode: 'TDM' }, 'red', 12000).at, 12000, 'so does a new mode or team');
  const over = nextObjectiveSeen(join, 'playing', { ...ffa, winner: 'Ann' }, null, 20000);
  assert.equal(nextObjectiveSeen(over, 'playing', ffa, null, 28000).at, 28000, 'the next round on the same map is introduced again');
});

test('the death screen ignores clicks until a held trigger has had time to let go', () => {
  assert.equal(deathScreenArmed(1000, 1000), false, 'not on the frame it opens');
  assert.equal(deathScreenArmed(1000, 1000 + DEATH_ARM_MS - 1), false, 'not just before the delay ends');
  assert.equal(deathScreenArmed(1000, 1000 + DEATH_ARM_MS), true, 'armed once the delay has passed');
  assert.ok(DEATH_ARM_MS >= 500, 'long enough to outlast a spammed trigger');
});
