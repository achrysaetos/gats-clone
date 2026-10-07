import assert from 'node:assert/strict';
import { test } from 'node:test';
import { at, CAPS, createBlastFx, fx, isPop, liveCount, scaleOf, seeded, startBoom, startDust, trackDash, ghostsOf, GHOST_MS } from '../src/client/blastfx.ts';

test('pools are fixed-size rings that overwrite the oldest entry', () => {
  const sizes = [fx.particles.slots.length, fx.blasts.slots.length, fx.scorches.slots.length, fx.slashes.slots.length];
  for (let i = 0; i < 200; i++) startBoom(i, i, 160, i);
  for (let i = 0; i < 100; i++) startDust({ x: 0, y: 0, w: 100, h: 20 }, 1000 + i);
  assert.deepEqual([fx.particles.slots.length, fx.blasts.slots.length, fx.scorches.slots.length, fx.slashes.slots.length], sizes);
  assert.deepEqual(sizes, [CAPS.particles, CAPS.blasts, CAPS.scorches, CAPS.slashes]);
  assert.ok(liveCount(fx.particles, 150) <= CAPS.particles);
});

test('a pop leaves no scorch, a blast does', () => {
  const f = createBlastFx();
  assert.equal(f.scorches.slots.every((s) => s.born === -Infinity), true);
  assert.ok(isPop(40) && !isPop(90));
  assert.ok(scaleOf(10) === 0.45 && scaleOf(1000) === 1.8);
});

test('particles are a pure function of time and die at their life', () => {
  const p = { x: 0, y: 0, vx: 100, vy: 0, drag: 2, born: 0, life: 1000, size: 1, grow: 0, kind: 'spark' as const, tone: 0, rot: 0, spin: 0 };
  assert.deepEqual(at(p, 500), at(p, 500));
  assert.ok(at(p, 1000).x < 50 && at(p, 1000).k === 1);
});

test('seeded random repeats', () => {
  const a = seeded(5), b = seeded(5);
  assert.deepEqual([a(), a(), a()], [b(), b(), b()]);
});

test('dash ghosts age out and are capped', () => {
  for (let i = 0; i < 60; i++) trackDash([{ id: 1, x: i * 10, y: 0, dashing: true, alive: true }], i * 5);
  assert.ok(ghostsOf(1).length <= 24);
  trackDash([{ id: 1, x: 0, y: 0, dashing: false, alive: true }], 300 + GHOST_MS + 500);
  assert.equal(ghostsOf(1).length, 0);
});
