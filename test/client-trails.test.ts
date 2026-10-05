/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { recordTrail, TRAIL, trailDashes, type TrailPoint } from '../src/client/trails.ts';

const walk = (trail: TrailPoint[], from: number, to: number, stepPx: number, msPerStep: number, t0 = 0) => {
  let now = t0;
  for (let x = from; x <= to; x += stepPx, now += msPerStep) recordTrail(trail, x, 0, now, false);
  return now - msPerStep;
};

test('a trail samples only real travel, keeps at most its cap, and starts over after a jump', () => {
  const trail: TrailPoint[] = [];
  recordTrail(trail, 0, 0, 0, false);
  recordTrail(trail, TRAIL.step - 1, 0, 10, false);
  assert.equal(trail.length, 1, 'standing still or creeping adds nothing');
  recordTrail(trail, TRAIL.step, 0, 20, false);
  assert.deepEqual(trail.map((p) => p.walked), [0, TRAIL.step], 'each point carries the distance walked');
  walk(trail, TRAIL.step * 2, TRAIL.step * (TRAIL.cap + 20), TRAIL.step, 1, 30);
  assert.equal(trail.length, TRAIL.cap);
  recordTrail(trail, 10_000, 0, 200, false);
  assert.deepEqual(trail.map((p) => [p.x, p.walked]), [[10_000, 0]], 'a respawn across the map is no trail');
});

test('points fade out of the trail once older than its life', () => {
  const trail: TrailPoint[] = [];
  const last = walk(trail, 0, 300, 10, 20);
  recordTrail(trail, 300, 0, last + TRAIL.lifeMs, false);
  assert.ok(trail.every((p) => last + TRAIL.lifeMs - p.at < TRAIL.lifeMs), 'nothing older than the life survives');
  assert.ok(trailDashes(trail, last + TRAIL.lifeMs * 2).length === 0, 'and a trail left alone draws nothing');
});

test('dashes keep their place on the floor as the body walks on, and fade with the age of their ground', () => {
  const trail: TrailPoint[] = [];
  walk(trail, 0, 200, 8, 16);
  const early = trailDashes(trail, 400);
  walk(trail, 208, 320, 8, 16, 26 * 16);
  const later = trailDashes(trail, 600);
  const key = (d: { x0: number; x1: number }) => `${d.x0.toFixed(3)}-${d.x1.toFixed(3)}`;
  const stayed = early.filter((d) => later.some((l) => key(l) === key(d)));
  assert.ok(stayed.length >= 3, `dashes from before still lie where they were (${stayed.length})`);
  for (const d of later) {
    const on = (d.x0 % (TRAIL.dash + TRAIL.gap) + TRAIL.dash + TRAIL.gap) % (TRAIL.dash + TRAIL.gap);
    assert.ok(on < TRAIL.dash + 1e-6, `dash at ${d.x0} starts inside an on stretch`);
    assert.ok(d.x1 - d.x0 <= TRAIL.dash + 1e-6, 'no dash runs longer than a dash');
  }
  const oldest = later.reduce((a, b) => (a.x0 < b.x0 ? a : b)), newest = later.reduce((a, b) => (a.x0 > b.x0 ? a : b));
  assert.ok(oldest.fade < newest.fade, 'older ground is fainter');
});

test('a stretch covered by a dash ability is one unbroken streak', () => {
  const trail: TrailPoint[] = [];
  recordTrail(trail, 0, 0, 0, false);
  recordTrail(trail, 60, 0, 10, true);
  const dashes = trailDashes(trail, 20);
  assert.deepEqual(dashes.map((d) => [d.x0, d.x1, d.dashing]), [[0, 60, true]]);
});
