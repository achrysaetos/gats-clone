import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Team } from '../src/shared/protocol.ts';
import { snapshotFor } from '../src/shared/sim/snapshot.ts';
import { ZONE_CAPTURE_MS, ZONE_RATE_CAP, zoneRate } from '../src/shared/sim/modes.ts';
import type { Player, World, Zone } from '../src/shared/sim/world.ts';
import { emptyWorld, run, spawnAt, TICK_MS } from './helpers.ts';

/** `n` soldiers of `team` round the zone's centre, well inside it. */
function squad(w: World, z: Zone, team: Team, n: number, side = 1): Player[] {
  return Array.from({ length: n }, (_, i) => spawnAt(w, z.x + side * (20 + 30 * i), z.y + (i % 2 ? 40 : -40), { team }));
}

/** Ticks until `done`, returning the ms it took (or Infinity past `capMs`). */
function timeUntil(w: World, done: () => boolean, capMs = 10_000): number {
  for (let t = 0; t <= capMs; t += TICK_MS) {
    if (done()) return t;
    run(w, TICK_MS);
  }
  return Infinity;
}

const away = (ps: Player[], z: Zone) => { for (const p of ps) p.x = z.x + 3 * z.r; };

test('zoneRate: 1x alone, +0.5x for each teammate, capped at 2.5x from four on', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 9].map(zoneRate), [1, 1.5, 2, 2.5, 2.5, 2.5]);
  assert.equal(ZONE_RATE_CAP, 2.5);
  assert.equal(zoneRate(0), 1, 'an empty zone bleeds a stranded capture off at the lone rate');
});

test('DOM: more teammates on a neutral zone take it faster, with diminishing returns', () => {
  const took: number[] = [];
  for (const n of [1, 2, 3, 4, 6]) {
    const w = emptyWorld('DOM');
    const z = w.zones[0]!;
    squad(w, z, 'red', n);
    took.push(timeUntil(w, () => z.owner === 'red'));
  }
  for (const [i, n] of [1, 2, 3, 4, 6].entries()) {
    const want = ZONE_CAPTURE_MS / zoneRate(n);
    assert.ok(Math.abs(took[i]! - want) <= 2 * TICK_MS, `${n} on the point take it in ${took[i]} ms (want ~${want})`);
  }
  assert.equal(took[3], took[4], 'past four the rate is capped');
});

test('DOM: the snapshot carries the crew on the point and a contested flag, and leaves both out when idle', () => {
  const w = emptyWorld('DOM');
  const z = w.zones[0]!;
  const me = spawnAt(w, z.x + 3 * z.r, z.y, { team: 'red' });
  run(w, TICK_MS);
  let view = snapshotFor(w, me.id).zones[0]!;
  assert.equal('crew' in view, false);
  assert.equal('contested' in view, false);
  const reds = squad(w, z, 'red', 3);
  run(w, TICK_MS);
  view = snapshotFor(w, me.id).zones[0]!;
  assert.deepEqual([view.crew, view.contested, view.capturing], [3, undefined, 'red']);
  const blue = squad(w, z, 'blue', 1, -1);
  run(w, TICK_MS);
  view = snapshotFor(w, me.id).zones[0]!;
  assert.deepEqual([view.crew, view.contested], [undefined, true]);
  away([...reds, ...blue], z);
});

test('DOM: a contested zone holds still however many stand on it', () => {
  const w = emptyWorld('DOM');
  const z = w.zones[0]!;
  const reds = squad(w, z, 'red', 4);
  run(w, 600);
  const before = z.progress;
  assert.ok(before > 0.4, `four reds moved it (${before.toFixed(2)})`);
  squad(w, z, 'blue', 1, -1);
  run(w, 2000);
  assert.equal(z.progress, before, 'frozen while both teams stand on it');
  assert.deepEqual([z.owner, z.capturing, z.contested], [null, 'red', true]);
  away(reds, z);
  run(w, TICK_MS);
  assert.equal(z.contested, false);
  assert.ok(z.progress < before, 'the lone blue starts draining once the reds leave');
});

test('DOM: a bigger squad drains a partial enemy capture faster too', () => {
  const drain = (n: number) => {
    const w = emptyWorld('DOM');
    const z = w.zones[0]!;
    const blue = squad(w, z, 'blue', 1, -1);
    run(w, 1500);
    away(blue, z);
    z.progress = 0.6;
    squad(w, z, 'red', n);
    return timeUntil(w, () => z.capturing !== 'blue');
  };
  const lone = drain(1), three = drain(3);
  assert.ok(Math.abs(lone - 0.6 * ZONE_CAPTURE_MS) <= 2 * TICK_MS, `one red drains 0.6 in ${lone} ms`);
  assert.ok(Math.abs(three - (0.6 * ZONE_CAPTURE_MS) / 2) <= 2 * TICK_MS, `three reds drain it in half the time (${three} ms)`);
});

test('DOM: neutralise then capture an enemy zone, both legs at the crew rate', () => {
  const w = emptyWorld('DOM');
  const z = w.zones[0]!;
  z.owner = 'blue';
  squad(w, z, 'red', 2);
  const neutral = timeUntil(w, () => z.owner === null);
  assert.ok(Math.abs(neutral - ZONE_CAPTURE_MS / 1.5) <= 2 * TICK_MS, `two reds neutralise it in ${neutral} ms`);
  assert.deepEqual([z.capturing, z.progress], ['red', 0], 'neutral, with the reds starting their own capture');
  const taken = timeUntil(w, () => z.owner === 'red');
  assert.ok(Math.abs(taken - ZONE_CAPTURE_MS / 1.5) <= 2 * TICK_MS, `and take it in ${taken} ms more`);
  assert.deepEqual([z.capturing, z.progress], [null, 0]);
});

test('DOM: an empty zone bleeds a stranded capture off at the lone rate, whoever started it', () => {
  const w = emptyWorld('DOM');
  const z = w.zones[0]!;
  const reds = squad(w, z, 'red', 4);
  run(w, 600);
  const left = z.progress;
  away(reds, z);
  const gone = timeUntil(w, () => z.capturing === null);
  assert.ok(Math.abs(gone - left * ZONE_CAPTURE_MS) <= 2 * TICK_MS, `${left.toFixed(2)} drains in ${gone} ms`);
});
