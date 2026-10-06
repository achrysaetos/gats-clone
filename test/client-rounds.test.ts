/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GUNS, WORLD } from '../src/shared/defs.ts';
import type { BulletView, PlayerView } from '../src/shared/protocol.ts';
import { coverServerRounds, drawnRounds, fireRounds, recentShooters, roundScene, TRACER, type RoundScene, type Shot } from '../src/client/rounds.ts';
import { MAX_RANGE_MUL } from '../src/shared/sim/stats.ts';

const ME = 1;
const MUZZLE = { x: 100, y: 100 };
const OPEN: RoundScene = { solids: [], bodies: [] };
const NONE = new Map<number, boolean>();
const PISTOL: Shot = { owner: ME, gun: 'pistol', range: GUNS.pistol.range, spread: GUNS.pistol.spread };
const straight = () => 0.5;
const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;
const bullet = (id: number, owner: number, gun: BulletView['gun']): BulletView => ({ id, x: 0, y: 0, vx: 1, vy: 0, owner, gun });

test('a round is drawn from its muzzle the moment it fires, its tail never reaching back past the muzzle', () => {
  const [round] = fireRounds({ ...PISTOL, owner: 7 }, MUZZLE, 0, OPEN, 1000, -1, straight);
  const [born] = drawnRounds([], [round!], NONE, 1000);
  assert.ok(born && near(born.x, 100) && near(born.y, 100) && born.owner === 7, JSON.stringify(born));
  assert.ok(near(born.x - born.vx * TRACER.tail, 100), 'no tail behind the muzzle at birth');
  const [later] = drawnRounds([], [round!], NONE, 1100);
  assert.ok(later && near(later.x, 100 + GUNS.pistol.bulletSpeed * 0.1), JSON.stringify(later));
  const gone = 1000 + (1000 * GUNS.pistol.range) / GUNS.pistol.bulletSpeed + 20;
  assert.deepEqual(drawnRounds([], [round!], NONE, gone), [], 'stops drawing past its range');
});

test('the server\'s gun rounds from shooters whose shots the page received are left to the local rounds, while shrapnel and other rounds are drawn', () => {
  const bullets = [bullet(1, ME, 'pistol'), bullet(2, 3, 'smg'), bullet(3, ME, null), bullet(4, 9, 'sniper')];
  const cover = coverServerRounds(NONE, bullets, new Set([ME, 3]));
  assert.deepEqual(drawnRounds(bullets, [], cover, 0).map((b) => b.id), [3, 4]);
});

test('a server round is judged the first frame it is seen, so it never pops in or out mid-flight', () => {
  const first = coverServerRounds(NONE, [bullet(1, 3, 'smg'), bullet(2, 9, 'smg')], new Set([3]));
  const later = coverServerRounds(first, [bullet(1, 3, 'smg'), bullet(2, 9, 'smg'), bullet(5, 3, 'smg')], new Set([9]));
  assert.deepEqual([...later], [[1, true], [2, false], [5, false]]);
  assert.deepEqual([...coverServerRounds(later, [bullet(5, 3, 'smg')], new Set())], [[5, false]], 'forgets rounds that are gone');
});

test('a round stops at the first wall on its line, or at the first body past the ones its gun pierces', () => {
  const wall = { x: 300, y: 50, w: 20, h: 100 };
  const body = (x: number) => ({ x, y: 100, r: WORLD.playerRadius });
  const reach = (gun: 'pistol' | 'marksman', scene: RoundScene) => fireRounds({ owner: ME, gun, range: 1000, spread: 0 }, MUZZLE, 0, scene, 0, -1, straight)[0]!.reach;
  assert.ok(near(reach('pistol', { solids: [wall], bodies: [] }), 200));
  assert.ok(near(reach('pistol', { solids: [wall], bodies: [body(250)] }), 150 - WORLD.playerRadius));
  assert.ok(near(reach('marksman', { solids: [], bodies: [body(250), body(400)] }), 300 - WORLD.playerRadius), 'pierces one body');
  assert.equal(reach('pistol', OPEN), 1000);
});

test('a shotgun fires one round per pellet, each its own id', () => {
  const rounds = fireRounds({ owner: ME, gun: 'shotgun', range: 420, spread: GUNS.shotgun.spread }, MUZZLE, 0, OPEN, 0, -10);
  assert.equal(rounds.length, GUNS.shotgun.pellets);
  assert.equal(new Set(rounds.map((r) => r.id)).size, rounds.length);
});

test('a round passes through its shooter and their teammates and stops at their enemies, crates and zombies', () => {
  const p = (id: number, x: number, team: PlayerView['team']) => ({ id, x, y: 100, alive: true, team }) as PlayerView;
  const scene = roundScene({ players: [p(ME, 100, 'red'), p(2, 200, 'red'), p(3, 300, 'blue'), p(4, 400, 'blue')], crates: [{ id: 9, x: 500, y: 90, hp: 1, size: 20 }], zombies: [[4, 0, 600, 100, 10]] }, [], 3);
  assert.deepEqual(scene.bodies.map((b) => b.x), [100, 200, 600]);
  assert.deepEqual(scene.solids, [{ x: 500, y: 90, w: 20, h: 20 }]);
});

test('a shooter counts as recent while a round from their last received shot could still be flying', () => {
  const longest = 1000 * MAX_RANGE_MUL * Math.max(...Object.values(GUNS).map((g) => g.range / g.bulletSpeed));
  const last = new Map([[2, 10_000], [3, 10_000 - longest - 1]]);
  assert.deepEqual([...recentShooters(last, 10_000)], [2], 'forgotten once its longest flight is over');
  assert.deepEqual([...recentShooters(last, 10_000 - 2)], [2, 3]);
});
