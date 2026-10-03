import assert from 'node:assert/strict';
import { test } from 'node:test';
import { WORLD } from '../src/shared/defs.ts';
import { snapshotFor, type Player, type World } from '../src/shared/sim.ts';
import { emptyWorld, grantPerks, press, run, spawnAt, TICK_MS } from './helpers.ts';

const R = WORLD.playerRadius;
const builtWalls = (w: World) => w.walls.filter((x) => x.built);
const overlaps = (p: Player, r: { x: number; y: number; w: number; h: number }) =>
  Math.hypot(p.x - Math.max(r.x, Math.min(p.x, r.x + r.w)), p.y - Math.max(r.y, Math.min(p.y, r.y + r.h))) < R;

test('an engineer wall never spawns on a player, keeps the cooldown ready, and builds once the spot clears', () => {
  const w = emptyWorld();
  const builder = spawnAt(w, 500, 500);
  const enemy = spawnAt(w, 580, 500);
  grantPerks(w, builder, ['grip', 'thickSkin', 'engineer']);
  press(w, builder, { ability: true, angle: 0 });
  run(w, 500);
  assert.equal(builtWalls(w).length, 0, 'no wall over the enemy');
  assert.equal(snapshotFor(w, builder.id).self.abilityReadyIn, 0, 'cooldown not spent');

  enemy.y = 800;
  run(w, TICK_MS * 2);
  const [wall] = builtWalls(w);
  assert.ok(wall, 'the held key builds as soon as the spot is clear');
  for (const p of w.players.values()) assert.ok(!overlaps(p, wall), `wall clear of player ${p.id}`);
  assert.ok(snapshotFor(w, builder.id).self.abilityReadyIn > 0, 'cooldown spent on the build');
});

function dasher(w: World, x = 500, y = 500): Player {
  const p = spawnAt(w, x, y);
  grantPerks(w, p, ['grip', 'thickSkin', 'dash']);
  return p;
}

test('dash with no movement keys bursts about 240px along the aim', () => {
  const w = emptyWorld();
  const p = dasher(w);
  press(w, p, { ability: true, angle: Math.PI / 2 });
  run(w, 600);
  assert.ok(Math.abs(p.x - 500) < 1e-9, `no sideways drift (x ${p.x})`);
  assert.ok(p.y - 500 >= 220 && p.y - 500 <= 260, `moved ${p.y - 500}px down the aim`);
});

test('dash follows the movement keys over the aim', () => {
  const w = emptyWorld();
  const p = dasher(w);
  const walker = spawnAt(w, 500, 1500);
  press(w, p, { right: true, ability: true, angle: Math.PI / 2 });
  press(w, walker, { right: true });
  run(w, 600);
  assert.ok(Math.abs(p.y - 500) < 1e-9, `stays on the movement line (y ${p.y})`);
  assert.ok(p.x - walker.x >= 150, `dash added ${p.x - walker.x}px over walking`);
});

test('a dash stops at a thin built wall instead of passing through it', () => {
  const w = emptyWorld();
  const p = dasher(w);
  w.walls.push({ x: 540, y: 400, w: 24, h: 200, built: true, expiresAt: Infinity });
  press(w, p, { ability: true, angle: 0 });
  run(w, 600);
  assert.ok(p.x <= 540 - R + 1e-6, `stopped on the near side (x ${p.x})`);
});
