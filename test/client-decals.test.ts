/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addCrack, crackFade, CRACKS, createCracks, hostKey, hostOf, inward } from '../src/client/decals.ts';

const wall = { x: 100, y: 200, w: 120, h: 50 };

test('a crack starts at the struck edge, runs inward and never leaves the top it lies on', () => {
  const post = { x: 100, y: 200, w: 8, h: 8 };
  const pool = createCracks();
  for (let i = 0; i < 40; i++) addCrack(pool, post, 100, 201 + (i % 6), 0, Math.random);
  for (const c of pool.slots) {
    if (!c) continue;
    for (let i = 0; i < c.lines.length; i += 2) {
      const x: number = c.lines[i]!, y: number = c.lines[i + 1]!;
      assert.ok(x >= post.x && x <= post.x + post.w && y >= post.y && y <= post.y + post.h, `${x},${y} inside a post narrower than a crack is long`);
    }
  }
  assert.equal(inward(wall, 100, 220), 0, 'struck on the left edge, it runs right');
  assert.equal(inward(wall, 160, 250), -Math.PI / 2, 'struck on the bottom edge, it runs up');
  assert.deepEqual(hostOf([wall], 99, 220), wall, 'a hit just outside the edge still finds its wall');
  assert.equal(hostOf([wall], 50, 50), null);
});

test('the pool holds at most its cap, reusing the oldest slot first', () => {
  const pool = createCracks(4);
  for (let i = 0; i < 10; i++) addCrack(pool, { ...wall, x: i * 1000 }, i * 1000, 220, i, Math.random);
  assert.equal(pool.slots.length, 4);
  assert.deepEqual(pool.slots.map((c) => c!.born).sort((a, b) => a - b), [6, 7, 8, 9], 'only the four newest remain');
});

test('a crack holds, then fades out by the end of its life', () => {
  const pool = createCracks();
  addCrack(pool, wall, 100, 220, 1000, Math.random);
  const c = pool.slots[0]!;
  assert.equal(crackFade(c, 1000), 1);
  assert.equal(crackFade(c, 1000 + CRACKS.lifeMs - CRACKS.fadeMs), 1, 'whole until the fade begins');
  assert.ok(crackFade(c, 1000 + CRACKS.lifeMs - CRACKS.fadeMs / 2) < 1);
  assert.equal(crackFade(c, 1000 + CRACKS.lifeMs), 0);
});

