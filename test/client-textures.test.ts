/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { crateDamage, floorCracks, slabLevels } from '../src/client/textures.ts';

test('the floor is the same on every load and keeps its plain share', () => {
  const a = slabLevels(7, 900, 4, 0.55);
  assert.deepEqual(a, slabLevels(7, 900, 4, 0.55), 'same seed, same floor');
  assert.notDeepEqual(a, slabLevels(8, 900, 4, 0.55), 'another seed, another floor');
  assert.ok(a.every((l) => Number.isInteger(l) && l >= 0 && l < 4), 'every level names a tone');
  const plain = a.filter((l) => l === 0).length / a.length;
  assert.ok(plain > 0.48 && plain < 0.62, `plain share ${plain}`);
  for (const tone of [1, 2, 3]) assert.ok(a.includes(tone), `tone ${tone} is used`);
});

test('floor cracks stay inside the world', () => {
  const cracks = floorCracks(11, 100, 200);
  assert.equal(cracks.length, 200);
  assert.ok(cracks.flat().every((v) => v >= 0 && v <= 100), 'a crack longer than the world is clipped to it');
  assert.deepEqual(cracks, floorCracks(11, 100, 200));
});

test('a crate shows more damage as it loses health', () => {
  assert.deepEqual([1, 0.7, 0.5, 0.35, 0.2, 0].map(crateDamage), [0, 0, 1, 1, 2, 2]);
});
