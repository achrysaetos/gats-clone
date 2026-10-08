import assert from 'node:assert/strict';
import { test } from 'node:test';
import { angleBucket, drawBodyShadows, GAIT, gaitAmount, stepGait, walkPose, type Gait } from '../src/client/bodies.ts';

test('a body turned to any angle is drawn from the nearest cached bucket, turned by only a small remainder', () => {
  for (let a = -10; a <= 10; a += 0.173) {
    const { index, rest } = angleBucket(a);
    assert.ok(index >= 0 && index < 32 && Number.isInteger(index), `bucket ${index}`);
    assert.ok(Math.abs(rest) <= Math.PI / 32 + 1e-9, `remainder ${rest}`);
    const back = (index / 32) * Math.PI * 2 + rest;
    assert.ok(Math.abs(Math.sin(back - a)) < 1e-9 && Math.cos(back - a) > 0, 'bucket plus remainder is the angle');
  }
});

test('the walk cycle follows the distance walked: still bodies stand, walkers stride, a teleport is no step', () => {
  let g: Gait | undefined;
  for (let t = 0; t <= 1000; t += 16) g = stepGait(g, 100, 100, t);
  assert.equal(gaitAmount(g), 0, 'standing still');
  assert.equal(walkPose(g).twist, 0);
  const phases = new Set<number>();
  for (let t = 1016; t <= 2000; t += 16) {
    g = stepGait(g, 100 + (t - 1000) * 0.25, 100, t);
    phases.add(Math.round(Math.sin(g.phase) * 10));
  }
  assert.ok(gaitAmount(g) > 0.9, `at full speed, ${g!.speed}`);
  assert.ok(Math.abs(g!.heading) < 1e-6, 'stepping the way it goes');
  assert.ok(phases.has(10) && phases.has(-10), 'the boots swing both ways');
  const halfway = stepGait(g, g!.x + GAIT.step, g!.y, g!.t + 16);
  assert.ok(Math.abs(((halfway.phase - g!.phase + Math.PI * 2) % (Math.PI * 2)) - Math.PI) < 1e-9, 'one step is half a cycle');
  const jumped = stepGait(g, g!.x + 1000, g!.y, g!.t + 16);
  assert.equal(jumped.speed, 0, 'a respawn far away is not a stride');
  assert.equal(stepGait(g, g!.x, g!.y, g!.t + 10_000).speed, 0, 'a body unseen for a while starts afresh');
  assert.equal(stepGait(g, g!.x + 5, g!.y, g!.t), g, 'a second draw in the same instant changes nothing');
});

test('soldiers drawn at two scales in the same frame (the world under a podium or a menu preview) keep their sprites at both', () => {
  let painted = 0;
  const ctx = new Proxy({}, { get: () => () => ({ addColorStop() {} }), set: () => true }) as unknown as CanvasRenderingContext2D;
  Object.assign(globalThis, { document: { createElement: () => { painted++; return { getContext: () => ctx }; } } });
  const body = [{ x: 0, y: 0, r: 17 }];
  for (let frame = 0; frame < 10; frame++) {
    drawBodyShadows(ctx, body, 0.85);
    drawBodyShadows(ctx, body, 2);
  }
  assert.equal(painted, 2, 'one sprite per scale, painted once');
  for (const k of [1, 1.05, 1.1, 1.15, 1.2]) drawBodyShadows(ctx, body, k);
  drawBodyShadows(ctx, body, 0.85);
  assert.equal(painted, 8, 'a zoom through many scales keeps only the latest few');
});
