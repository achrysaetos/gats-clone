/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { boardRows, DEATH_ARM_MS, deathScreenArmed, nextObjectiveSeen, NO_OBJECTIVE_SEEN, OBJECTIVE_MS, objectiveVisible, roundPodium, topScorers } from '../src/client/derive.ts';
import type { LeaderRow } from '../src/shared/protocol.ts';

test('the objective banner never shows while the round is over', () => {
  assert.equal(objectiveVisible('playing', { winner: null }, 0), true, 'shows right after spawning');
  assert.equal(objectiveVisible('playing', { winner: { name: 'Red team', id: null, note: null } }, 0), false, 'hidden under the win banner');
  assert.equal(objectiveVisible('playing', { winner: null }, OBJECTIVE_MS), false, 'fades after its time');
  assert.equal(objectiveVisible('dead', { winner: null }, 0), false, 'hidden on the death screen');
});

test('the round summary lists the top three by round kills, whatever their current life\'s score', () => {
  const rows: LeaderRow[] = [
    { id: 1, name: 'Ann', score: 40, kills: 9, deaths: 0, team: null },
    { id: 2, name: 'Bo', score: 90, kills: 3, deaths: 0, team: null },
    { id: 3, name: 'Cy', score: 10, kills: 1, deaths: 0, team: null },
    { id: 4, name: 'Di', score: 65, kills: 5, deaths: 0, team: null },
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
  const over = nextObjectiveSeen(join, 'playing', { ...ffa, winner: { name: 'Ann', id: 1, note: null } }, null, 20000);
  assert.equal(nextObjectiveSeen(over, 'playing', ffa, null, 28000).at, 28000, 'the next round on the same map is introduced again');
});

test('the death screen ignores clicks until a held trigger has had time to let go', () => {
  assert.equal(deathScreenArmed(1000, 1000), false, 'not on the frame it opens');
  assert.equal(deathScreenArmed(1000, 1000 + DEATH_ARM_MS - 1), false, 'not just before the delay ends');
  assert.equal(deathScreenArmed(1000, 1000 + DEATH_ARM_MS), true, 'armed once the delay has passed');
  assert.ok(DEATH_ARM_MS >= 500, 'long enough to outlast a spammed trigger');
});

test('a team round podium lists the winning team with the final team score; FFA lists everyone', () => {
  const rows: LeaderRow[] = [
    { id: 1, name: 'Tansy', score: 0, kills: 9, deaths: 0, team: 'blue' },
    { id: 2, name: 'Flint', score: 0, kills: 7, deaths: 0, team: 'blue' },
    { id: 3, name: 'Ivy', score: 0, kills: 5, deaths: 0, team: 'red' },
    { id: 4, name: 'Nova', score: 0, kills: 3, deaths: 0, team: 'red' },
  ];
  const match = { mode: 'TDM', map: 'Boneyard', nextMap: 'Causeway', mapChangeIn: 0, teamScore: { red: 50, blue: 44 }, winner: { name: 'Red team', id: null, note: null }, restartIn: 8000, roundEndsAt: null } as const;
  const team = roundPodium(match, rows, 3);
  assert.deepEqual(team.rows.map((r) => r.name), ['Ivy', 'Nova']);
  assert.equal(team.score, 'Red 50 · Blue 44');
  const ffa = roundPodium({ ...match, mode: 'FFA', winner: { name: 'Tansy', id: 1, note: null } }, rows.map((r) => ({ ...r, team: null })), 3);
  assert.deepEqual([ffa.rows.map((r) => r.name), ffa.score], [['Tansy', 'Flint', 'Ivy'], null]);
});

test('an FFA podium puts the round winner first even when a bot out-killed them', () => {
  const rows: LeaderRow[] = [
    { id: 1, name: 'Pike', score: 0, kills: 37, deaths: 4, team: null },
    { id: 2, name: 'Juno', score: 0, kills: 25, deaths: 9, team: null },
    { id: 3, name: 'Kestrel', score: 0, kills: 20, deaths: 2, team: null },
  ];
  const match = { mode: 'FFA', map: 'Boneyard', nextMap: 'Causeway', mapChangeIn: 0, teamScore: { red: 0, blue: 0 }, winner: { name: 'Kestrel', id: 3, note: 'Kestrel reached 20 kills' }, restartIn: 8000, roundEndsAt: null } as const;
  assert.deepEqual(roundPodium(match, rows, 3).rows.map((r) => r.name), ['Kestrel', 'Pike', 'Juno']);
});

test('the leaderboard breaks a kill tie on fewer deaths', () => {
  const rows: LeaderRow[] = [
    { id: 1, name: 'Ann', score: 0, kills: 6, deaths: 4, team: null },
    { id: 2, name: 'Bo', score: 0, kills: 6, deaths: 2, team: null },
  ];
  assert.deepEqual(topScorers(rows, 2).map((r) => r.name), ['Bo', 'Ann']);
});

test('the compact leaderboard shows the top five plus your own place, and the whole board on request', () => {
  const rows: LeaderRow[] = [5, 9, 1, 7, 3, 2, 0].map((kills, i) => ({ id: i + 1, name: `P${i + 1}`, score: 0, kills, deaths: 0, team: null }));
  const view = (myId: number, full: number | null) => boardRows(rows, myId, full).map((r) => [r.place, r.row.name]);
  assert.deepEqual(view(3, null), [[1, 'P2'], [2, 'P4'], [3, 'P1'], [4, 'P5'], [5, 'P6'], [6, 'P3']], 'sixth place joins the top five with its place');
  assert.deepEqual(view(5, null), [[1, 'P2'], [2, 'P4'], [3, 'P1'], [4, 'P5'], [5, 'P6']], 'a top-five player is not listed twice');
  assert.equal(view(99, null).length, 5, 'a viewer off the board sees only the top five');
  assert.deepEqual(view(5, 10).map(([p]) => p), [1, 2, 3, 4, 5, 6, 7], 'the whole board in order');
});
