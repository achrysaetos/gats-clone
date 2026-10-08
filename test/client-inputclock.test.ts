/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextInputDue } from '../src/client/inputclock.ts';

const STEP = 1000 / 30;

/** Inputs sent in `ms` by a browser timer: whole-ms delays, each firing `late()` ms after it was asked to. */
function sent(ms: number, late: () => number, stallAt?: number): number[] {
  const at: number[] = [];
  let now = 0, due = 0;
  while (now < ms) {
    at.push(now);
    due = nextInputDue(now, due, STEP);
    now += Math.max(0, Math.trunc(due - now)) + late();
    if (stallAt !== undefined && at.length === stallAt) now += 500;
  }
  return at;
}

test('inputs go out at exactly the tick rate, though timer delays are whole ms and wobble', () => {
  let seed = 3;
  const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const n = sent(60_000, () => rand() * 4).length;
  assert.ok(Math.abs(n - 1800) <= 1, `${n} inputs in a minute, the server applies 1800`);
  // What setInterval(fn, 1000 / 30) does: a 33 ms delay, 30.3 a second.
  assert.equal(Math.floor(60_000 / Math.trunc(STEP)), 1818);
});

test('a timer a whole step late sends one input and carries on, never a burst', () => {
  const at = sent(3000, () => 0, 30);
  const gaps = at.slice(1).map((t, i) => t - at[i]!);
  assert.ok(gaps.every((g) => g >= STEP - 1), `the shortest gap is ${Math.min(...gaps).toFixed(1)}ms`);
  assert.ok(gaps.some((g) => g > 500), 'the stall shows as one long gap');
});
