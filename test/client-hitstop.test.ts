/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addStop, HITSTOP, NO_HITSTOP, stopFor, stopLag } from '../src/client/hitstop.ts';

test('a hit holds the drawn world still for its stop, then the world catches back up to the clock', () => {
  const stop = addStop(NO_HITSTOP, 1000, 'hit');
  assert.equal(stopLag(stop, 1000), 0);
  assert.equal(stopLag(stop, 1000 + HITSTOP.hitMs), HITSTOP.hitMs, 'held for the whole stop: the drawn clock did not move');
  const mid = stopLag(stop, 1000 + HITSTOP.hitMs + 20);
  assert.ok(mid > 0 && mid < HITSTOP.hitMs, 'catching up, at less than real time');
  assert.equal(stopLag(stop, 1000 + HITSTOP.hitMs * (1 + 1 / HITSTOP.catchUp)), 0, 'caught up exactly');
  assert.equal(stopLag(NO_HITSTOP, 5000), 0, 'no stop, no lag');
});

test('a kill stops longer than a hit, and hits too close together do not chain into slow motion', () => {
  const kill = addStop(NO_HITSTOP, 0, 'kill');
  assert.equal(stopLag(kill, HITSTOP.killMs), HITSTOP.killMs);
  assert.ok(HITSTOP.killMs > HITSTOP.hitMs);
  const first = addStop(NO_HITSTOP, 0, 'hit');
  assert.equal(addStop(first, HITSTOP.hitGapMs - 1, 'hit'), first, 'a second hit within the gap adds nothing');
  assert.notEqual(addStop(first, 50, 'kill'), first, 'but a kill does');
  let stop = NO_HITSTOP;
  for (let t = 0; t < 2000; t += 10) stop = addStop(stop, t, 'kill');
  for (let t = 0; t < 2000; t += 5) assert.ok(stopLag(stop, t) <= HITSTOP.maxLagMs);
});

test('only your rounds landing on someone else stop the world', () => {
  assert.equal(stopFor({ kind: 'impact', victim: 2, by: 1 }, 1), 'hit');
  assert.equal(stopFor({ kind: 'death', victim: 2, by: 1 }, 1), 'kill');
  assert.equal(stopFor({ kind: 'impact', victim: 2, by: 3 }, 1), null, 'someone else\'s hit');
  assert.equal(stopFor({ kind: 'impact', victim: null, by: 1 }, 1), null, 'a wall or crate');
  assert.equal(stopFor({ kind: 'impact', victim: 1, by: 1 }, 1), null, 'your own blast on yourself');
  assert.equal(stopFor({ kind: 'boom' }, 1), null);
});
