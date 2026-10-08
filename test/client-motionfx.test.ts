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

test('pop, footfall, turn and glint helpers', () => {
  assert.equal(popScale(-1), 1);
  assert.equal(popScale(1000), 1);
  assert.ok(popScale(100) > 1 && popScale(100) <= 1.12);
  assert.notEqual(footfall(0.1), footfall(Math.PI + 0.1));
  assert.ok(turnBetween(0.1, Math.PI * 2 - 0.1) < 0.3);
  assert.ok(turnBetween(0, Math.PI) > 3);
  assert.equal(glintAt(5, MOTION.glintMs * 3 - 5 * 211), 0, 'dark between glints');
  const peak = Math.max(...Array.from({ length: 100 }, (_, i) => glintAt(7, i * 40)));
  assert.ok(peak > 0.9 && peak <= 1);
});
