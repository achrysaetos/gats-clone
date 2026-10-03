/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EMPTY_PAIR, interpolateSnap, lerpAngle, pushSnap, renderAlpha } from '../src/client/interp.ts';
import type { PlayerView, Snapshot } from '../src/shared/protocol.ts';

const player = (id: number, x: number, y: number, angle = 0): PlayerView => ({
  id, name: `p${id}`, x, y, angle, hp: 100, maxHp: 100, armor: 0, maxArmor: 0, color: 'red', weapon: 'pistol',
  team: null, alive: true, hidden: false, shield: false, dashing: false, score: 0, level: 1,
});

const snap = (tick: number, players: PlayerView[]): Snapshot => ({
  t: 'snap', tick, ackSeq: 0,
  self: { id: 1, ammo: 12, mag: 12, speed: 300, reloading: false, perks: {}, pendingTier: null, ability: null, abilityReadyIn: 0, respawnIn: 0, kills: 0, deaths: 0, viewRadius: 900 },
  players, bullets: [], crates: [], thrown: [], zones: [], minimap: [], leaderboard: [],
  match: { mode: 'FFA', teamScore: { red: 0, blue: 0 }, winner: null, restartIn: 0 }, events: [],
});

const twoSnaps = (a: PlayerView[], b: PlayerView[]) => pushSnap(pushSnap(EMPTY_PAIR, snap(1, a), 1000), snap(2, b), 1033);

test('keeps only the last two snapshots', () => {
  const pair = pushSnap(twoSnaps([], []), snap(3, []), 1066);
  assert.equal(pair.prev?.snap.tick, 2);
  assert.equal(pair.next?.snap.tick, 3);
});

test('draws the newest snapshot as-is until a second arrives', () => {
  const pair = pushSnap(EMPTY_PAIR, snap(1, [player(1, 10, 20)]), 1000);
  assert.deepEqual(interpolateSnap(pair, 5000)?.players[0], player(1, 10, 20));
  assert.equal(interpolateSnap(EMPTY_PAIR, 0), null);
});

test('renders one arrival interval behind, walking prev -> next and holding at next', () => {
  const pair = twoSnaps([player(1, 0, 0)], [player(1, 100, 50)]);
  assert.equal(interpolateSnap(pair, 1033)?.players[0]?.x, 0);
  const mid = interpolateSnap(pair, 1033 + 16.5)!.players[0]!;
  assert.ok(Math.abs(mid.x - 50) < 1e-9 && Math.abs(mid.y - 25) < 1e-9, `midpoint was ${mid.x},${mid.y}`);
  assert.equal(interpolateSnap(pair, 9999)?.players[0]?.x, 100);
  assert.equal(renderAlpha(pair, 0), 0);
});

test('matches entities by id, not by array position', () => {
  const pair = twoSnaps([player(1, 0, 0), player(2, 200, 0)], [player(2, 220, 0), player(1, 20, 0)]);
  const [a, b] = interpolateSnap(pair, 1033 + 16.5)!.players;
  assert.equal(a?.id, 2);
  assert.ok(Math.abs(a!.x - 210) < 1e-9);
  assert.ok(Math.abs(b!.x - 10) < 1e-9);
});

test('new entities and teleports snap to their latest position', () => {
  const pair = twoSnaps([player(1, 0, 0)], [player(1, 2000, 0), player(3, 5, 5)]);
  const [respawned, joined] = interpolateSnap(pair, 1033 + 16.5)!.players;
  assert.equal(respawned?.x, 2000);
  assert.equal(joined?.x, 5);
});

test('players that left are dropped', () => {
  const pair = twoSnaps([player(1, 0, 0), player(2, 0, 0)], [player(1, 0, 0)]);
  assert.deepEqual(interpolateSnap(pair, 1040)!.players.map((p) => p.id), [1]);
});

test('angles turn the short way across the wrap', () => {
  const a = Math.PI - 0.1;
  const b = -Math.PI + 0.1;
  const half = lerpAngle(a, b, 0.5);
  assert.ok(Math.abs(Math.abs(half) - Math.PI) < 1e-9, `expected ~pi, got ${half}`);
  const pair = twoSnaps([player(1, 0, 0, a)], [player(1, 0, 0, b)]);
  const p = interpolateSnap(pair, 1033 + 16.5)!.players[0]!;
  assert.ok(Math.abs(Math.cos(p.angle) + 1) < 1e-9, 'should face west, not swing through east');
});
