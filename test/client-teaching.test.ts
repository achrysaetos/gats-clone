/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { WORLD } from '../src/shared/defs.ts';
import { step } from '../src/shared/sim.ts';
import { BLAST_RADIUS } from '../src/shared/sim/abilities.ts';
import { abilityHint } from '../src/client/hud.ts';
import { emptyWorld, hpOf, spawnAt, TICK_MS } from './helpers.ts';

test('an empty ability slot says the score that unlocks it, from the level ladder', () => {
  assert.deepEqual(abilityHint(null), ['Ability', 'at 400']);
  assert.deepEqual(abilityHint({ level: 2, k: 'evolve' }), ['Ability', 'at 400']);
  assert.deepEqual(abilityHint({ level: 3, k: 'perk', tier: 2 }), ['Ability', 'at 400']);
  assert.deepEqual(abilityHint({ level: 4, k: 'perk', tier: 3 }), ['Pick an', 'ability'], 'once the ability tier is pending, the slot points at the perk dock');
});

test('the blast reaches exactly the bodies the ring touches', () => {
  for (const kind of ['grenade', 'fragGrenade'] as const) {
    const w = emptyWorld();
    const owner = spawnAt(w, 200, 200);
    const reach = BLAST_RADIUS[kind] + WORLD.playerRadius;
    const inside = spawnAt(w, 1000 + reach - 2, 1000);
    const outside = spawnAt(w, 1000, 1000 + reach + 2);
    w.thrown.push({ id: 999, kind, owner: owner.id, team: owner.team, x: 1000, y: 1000, vx: 0, vy: 0, explodeAt: w.now });
    step(w, TICK_MS);
    assert.ok(hpOf(inside) < WORLD.baseHp, `${kind}: a body whose edge is inside the ring is hurt`);
    assert.equal(hpOf(outside), WORLD.baseHp, `${kind}: a body just outside the ring is untouched`);
  }
});
