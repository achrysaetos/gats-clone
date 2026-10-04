/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BURSTS, burst, createPool, isLive, liveCount, particleAt } from '../src/client/particles.ts';

test('a storm of bursts never holds more live particles than the cap', () => {
  const pool = createPool(50);
  for (let i = 0; i < 40; i++) burst(pool, 'debris', i, i, 0, 1000);
  assert.equal(pool.slots.length, 50, 'no slot is ever added');
  assert.equal(liveCount(pool, 1000), 50);
});

test('emitting past the cap reuses the oldest slot object instead of allocating', () => {
  const pool = createPool(4);
  const first = pool.slots[0];
  burst(pool, 'spark', 0, 0, 0, 0, () => 0.5);
  burst(pool, 'puff', 99, 77, 0, 10, () => 0.5);
  assert.equal(pool.slots[0], first, 'same object');
  assert.equal(first!.x, 99, 'now holds the newest particle');
  assert.equal(first!.shape, BURSTS.puff.shape);
});

test('particles stop being live when their life runs out', () => {
  const pool = createPool(8);
  burst(pool, 'spark', 0, 0, 0, 1000, () => 0);
  const life = BURSTS.spark.life[0];
  assert.equal(liveCount(pool, 1000 + life - 1), BURSTS.spark.count);
  assert.equal(liveCount(pool, 1000 + life), 0);
  assert.equal(liveCount(pool, 999), 0, 'not live before birth');
  assert.ok(!isLive(createPool(1).slots[0]!, 0), 'fresh slots are dead');
});

test('drag slows a particle so it never travels past speed / drag', () => {
  const p = { x: 0, y: 0, vx: 400, vy: 0, drag: 8, born: 0, life: 10_000, size: 1, grow: 0, color: '', shape: 'chip' as const };
  const early = particleAt(p, 100).x, late = particleAt(p, 5000).x;
  assert.ok(early > 0 && late > early);
  assert.ok(late <= 400 / 8 + 1e-9, `${late}`);
});
