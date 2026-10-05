/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GUNS, WORLD } from '../src/shared/defs.ts';
import type { BulletView, PlayerView } from '../src/shared/protocol.ts';
import { drawnRounds, fireOwnRounds, roundScene, type RoundScene } from '../src/client/rounds.ts';
import { TRACER } from '../src/client/render.ts';

const ME = 1;
const MUZZLE = { x: 100, y: 100 };
const OPEN: RoundScene = { solids: [], bodies: [] };
const straight = () => 0.5;
const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;

test('my own round is drawn from my muzzle the moment it fires, its tail never reaching back past the muzzle', () => {
  const [round] = fireOwnRounds('pistol', GUNS.pistol.range, GUNS.pistol.spread, MUZZLE, 0, OPEN, 1000, -1, straight);
  const [born] = drawnRounds([], [round!], ME, 1000);
  assert.ok(born && near(born.x, 100) && near(born.y, 100), JSON.stringify(born));
  assert.ok(near(born.x - born.vx * TRACER.tail, 100), 'no tail behind the muzzle at birth');
  const [later] = drawnRounds([], [round!], ME, 1100);
  assert.ok(later && near(later.x, 100 + GUNS.pistol.bulletSpeed * 0.1), JSON.stringify(later));
  const gone = 1000 + (1000 * GUNS.pistol.range) / GUNS.pistol.bulletSpeed + 20;
  assert.deepEqual(drawnRounds([], [round!], ME, gone), [], 'stops drawing past its range');
});

test('the server\'s copies of my gun\'s rounds are not drawn, while my shrapnel and everyone else\'s rounds are', () => {
  const bullet = (id: number, owner: number, gun: BulletView['gun']): BulletView => ({ id, x: 0, y: 0, vx: 1, vy: 0, owner, gun });
  const drawn = drawnRounds([bullet(1, ME, 'pistol'), bullet(2, ME, null), bullet(3, 2, 'pistol')], [], ME, 0);
  assert.deepEqual(drawn.map((b) => b.id), [2, 3]);
});

test('my round stops at the first wall on its line, or at the first body past the ones its gun pierces', () => {
  const wall = { x: 300, y: 50, w: 20, h: 100 };
  const body = (x: number) => ({ x, y: 100, r: WORLD.playerRadius });
  const reach = (gun: 'pistol' | 'marksman', scene: RoundScene) => fireOwnRounds(gun, 1000, 0, MUZZLE, 0, scene, 0, -1, straight)[0]!.reach;
  assert.ok(near(reach('pistol', { solids: [wall], bodies: [] }), 200));
  assert.ok(near(reach('pistol', { solids: [wall], bodies: [body(250)] }), 150 - WORLD.playerRadius));
  assert.ok(near(reach('marksman', { solids: [], bodies: [body(250), body(400)] }), 300 - WORLD.playerRadius), 'pierces one body');
  assert.equal(reach('pistol', OPEN), 1000);
});

test('a shotgun fires one round per pellet, each its own id', () => {
  const rounds = fireOwnRounds('shotgun', 420, GUNS.shotgun.spread, MUZZLE, 0, OPEN, 0, -10);
  assert.equal(rounds.length, GUNS.shotgun.pellets);
  assert.equal(new Set(rounds.map((r) => r.id)).size, rounds.length);
});

test('my rounds pass through me and my teammates and stop at enemies, crates and zombies', () => {
  const p = (id: number, x: number, team: PlayerView['team']) => ({ id, x, y: 100, alive: true, team }) as PlayerView;
  const scene = roundScene({ players: [p(ME, 100, 'red'), p(2, 200, 'red'), p(3, 300, 'blue')], crates: [{ id: 9, x: 500, y: 90, hp: 1, size: 20 }], zombies: [[4, 0, 600, 100, 10]] }, [], ME);
  assert.deepEqual(scene.bodies.map((b) => b.x), [300, 600]);
  assert.deepEqual(scene.solids, [{ x: 500, y: 90, w: 20, h: 20 }]);
});
