import assert from 'node:assert/strict';
import { test } from 'node:test';
import { KIT } from '../src/shared/kit.ts';
import type { GameEvent } from '../src/shared/protocol.ts';
import { step } from '../src/shared/sim.ts';
import { CHAIN_MS } from '../src/shared/sim/combat.ts';
import { snapshotFor } from '../src/shared/sim/snapshot.ts';
import type { World } from '../src/shared/sim/world.ts';
import { crateOf, emptyWorld, hpOf, press, spawnAt, TICK_MS } from './helpers.ts';

const FUEL = KIT['barrel.red'].breaks!;

/** Steps `ms` and hands back each tick's events with the time they happened. */
function watch(w: World, ms: number): { at: number; e: GameEvent }[] {
  const seen: { at: number; e: GameEvent }[] = [];
  for (let t = 0; t < ms; t += TICK_MS) {
    step(w, TICK_MS);
    for (const e of w.events) seen.push({ at: w.now, e });
  }
  return seen;
}

function shoot(w: World, p: ReturnType<typeof spawnAt>, angle: number) {
  press(w, p, { angle, fire: true, shots: p.input.shots + 1 });
}

test('a shot fuel barrel bursts at once, hurts who stands by it and leaves burning fuel', () => {
  const w = emptyWorld();
  const shooter = spawnAt(w, 300, 500);
  const bystander = spawnAt(w, 560, 580);
  w.crates.push({ ...crateOf(1, 485, 485, 'barrel.red'), hp: 1 });
  shoot(w, shooter, 0);
  const seen = watch(w, 300);
  const boom = seen.find((s) => s.e.e === 'boom');
  const broke = seen.find((s) => s.e.e === 'broke');
  assert.ok(broke && boom, 'it broke and burst');
  assert.equal(boom.at, broke.at, 'in the tick the round broke it');
  assert.ok(boom.e.e === 'boom' && boom.e.r === FUEL.blast!.radius);
  assert.ok(hpOf(bystander) < 100, 'the blast reached the bystander');
  const fire = w.thrown.find((t) => t.kind === 'fire');
  assert.ok(fire && fire.x === 500 && fire.y === 500, 'fuel burns where the barrel stood');
  const seenBy = snapshotFor(w, shooter.id).thrown.filter((t) => t.kind === 'fire');
  assert.deepEqual(seenBy.map((t) => t.r), [FUEL.fire!.radius], 'players see the fire at its size');
});

test('a blast sets off the next fuel barrel a beat later, so a row goes up in turn', () => {
  const w = emptyWorld();
  const shooter = spawnAt(w, 200, 500);
  w.crates.push({ ...crateOf(1, 485, 485, 'barrel.red'), hp: 1 }, crateOf(2, 585, 485, 'barrel.red'), crateOf(3, 685, 485, 'barrel.red'));
  shoot(w, shooter, 0);
  const booms = watch(w, 1000).filter((s) => s.e.e === 'boom').map((s) => ({ at: s.at, x: s.e.e === 'boom' ? s.e.x : 0 }));
  assert.deepEqual(booms.map((b) => b.x), [500, 600, 700], 'each barrel burst once, nearest first');
  for (let i = 1; i < booms.length; i++) {
    const gap = booms[i]!.at - booms[i - 1]!.at;
    assert.ok(gap >= CHAIN_MS && gap < CHAIN_MS + TICK_MS * 1.5, `the link took ${gap}ms`);
  }
  assert.equal(w.crates.filter((c) => c.respawnAt === null).length, 0, 'none still stand');
});

test('standing in burning fuel hurts over time and stops once it burns out', () => {
  const w = emptyWorld();
  const p = spawnAt(w, 500, 500);
  w.thrown.push({ id: 99, kind: 'fire', owner: 0, team: null, x: 500, y: 500, r: FUEL.fire!.radius, dps: FUEL.fire!.dps, expiresAt: 1000 });
  watch(w, 500);
  const lost = 100 - hpOf(p);
  assert.ok(Math.abs(lost - FUEL.fire!.dps * 0.5) < FUEL.fire!.dps * 0.1, `half a second took ${lost}`);
  watch(w, 600);
  assert.equal(w.thrown.some((t) => t.kind === 'fire'), false, 'the fire burned out');
  const after = hpOf(p);
  watch(w, 300);
  assert.ok(hpOf(p) >= after, 'and hurts no more');
});

test('whoever broke the barrel is credited with the kill it makes', () => {
  const w = emptyWorld('FFA');
  const shooter = spawnAt(w, 200, 500);
  const victim = spawnAt(w, 540, 540);
  if (victim.life.k === 'alive') victim.life.hp = 30;
  w.crates.push({ ...crateOf(1, 485, 485, 'barrel.red'), hp: 1 });
  shoot(w, shooter, 0);
  const kill = watch(w, 400).find((s) => s.e.e === 'kill');
  assert.ok(kill?.e.e === 'kill' && kill.e.killerId === shooter.id && kill.e.victimId === victim.id, JSON.stringify(kill));
});
