import assert from 'node:assert/strict';
import { test } from 'node:test';
import { breath, createFxPool, dropPose, emitFx, footfall, fxCount, glintAt, MOTION, popScale, REST_POSE, turnBetween } from '../src/client/motionfx.ts';

test('the fx pool never grows past its cap and overwrites the oldest', () => {
  const pool = createFxPool(8);
  for (let i = 0; i < 100; i++) emitFx(pool, { kind: 'dust', x: i, y: 0, born: i, life: 1000, size: 3, color: '#fff' });
  assert.equal(pool.slots.length, 8);
  assert.equal(fxCount(pool, 100), 8);
  assert.equal(Math.min(...pool.slots.map((f) => f.x)), 92);
});

test('drop-in falls from above, lands squashed wide, then rests', () => {
  assert.equal(dropPose(-5).alpha, 0);
  const air = dropPose(MOTION.dropMs * 0.5);
  assert.ok(air.lift > 0 && air.sy > 1 && air.sx < 1);
  assert.equal(dropPose(MOTION.dropMs - 1).lift < 5, true);
  const land = dropPose(MOTION.dropMs + 25);
  assert.equal(land.lift, 0);
  assert.ok(land.sx > 1 && land.sy < 1);
  assert.equal(dropPose(MOTION.dropMs + MOTION.squashMs + 1), REST_POSE);
  assert.equal(dropPose(MOTION.dropMs * 0.5, true).lift, 0);
});

test('breathing fades out as a stride picks up and stays small', () => {
  const still = breath(1000, 3, 0), run = breath(1000, 3, 1);
  assert.ok(Math.abs(still.sy - 1) <= 0.02);
  assert.deepEqual(run, { sx: 1, sy: 1 });
});

test('a pop swells and settles back to 1 within its time; a footfall lands every half stride; turns are measured the short way', () => {
  assert.equal(popScale(-1), 1);
  assert.equal(popScale(380), 1, 'over at its length');
  const swell = Array.from({ length: 38 }, (_, i) => popScale(i * 10));
  assert.ok(Math.max(...swell) > 1.05 && Math.max(...swell) <= 1.12, `swells a little (${Math.max(...swell)})`);
  assert.ok(swell.indexOf(Math.max(...swell)) < 19, 'peaks early, then eases out');
  assert.deepEqual([0.1, Math.PI - 0.1, Math.PI + 0.1, 2 * Math.PI + 0.1].map(footfall), [0, 0, 1, 2], 'a new footfall each half turn of the walk phase');
  assert.ok(Math.abs(turnBetween(0.1, Math.PI * 2 - 0.1) - 0.2) < 1e-9, 'across the wrap, the short way');
  assert.ok(Math.abs(turnBetween(0, Math.PI) - Math.PI) < 1e-9);
  assert.ok(Math.abs(turnBetween(-3, 3) - (2 * Math.PI - 6)) < 1e-9);
});

test('a dropped gun glints in short flashes, at a rhythm of its own', () => {
  const pulse = (seed: number) => Array.from({ length: 2000 }, (_, i) => glintAt(seed, i * 10));
  for (const seed of [3, 7]) {
    const p = pulse(seed);
    assert.ok(p.every((v) => v >= 0 && v <= 1));
    assert.ok(Math.max(...p) > 0.9, 'it does flash');
    assert.ok(p.filter((v) => v > 0).length / p.length < 0.3, 'but is dark most of the time');
  }
  assert.notDeepEqual(pulse(3).map((v) => v > 0), pulse(7).map((v) => v > 0), 'two corpses never glint in unison');
});
