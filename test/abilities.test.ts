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
