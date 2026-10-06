import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { GunId } from '../src/shared/defs.ts';
import { dominatedPairs, rangeBeyondView, type Pair } from '../scripts/lib/gunscore.ts';

/** Today's offenders. Fix a gun and its pair drops out of the lint, which then fails until the entry is deleted here. */
const KNOWN_DOMINATED: readonly Pair[] = [];
const KNOWN_BEYOND_VIEW: readonly GunId[] = [];

const key = ([a, b]: Pair) => `${a} > ${b}`;

test('no gun beats another of its stage on every axis, beyond the known pairs, and every known pair still holds', () => {
  const found = ([0, 1, 2] as const).flatMap(dominatedPairs).map(key);
  const known = KNOWN_DOMINATED.map(key);
  assert.deepEqual(found.filter((k) => !known.includes(k)), [], 'newly dominated');
  assert.deepEqual(known.filter((k) => !found.includes(k)), [], 'fixed: remove from KNOWN_DOMINATED');
});

test('no gun outranges its owner\'s horizontal view, beyond the known guns, and every known gun still does', () => {
  const found = rangeBeyondView().map((o) => o.id);
  assert.deepEqual(found.filter((id) => !KNOWN_BEYOND_VIEW.includes(id)), [], 'newly beyond view');
  assert.deepEqual(KNOWN_BEYOND_VIEW.filter((id) => !found.includes(id)), [], 'fixed: remove from KNOWN_BEYOND_VIEW');
});
