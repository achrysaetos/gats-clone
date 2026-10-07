/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Snapshot } from '../src/shared/protocol.ts';
import { RANGE, TARGETS, targetPos } from '../src/shared/range.ts';
import { MAPS } from '../src/shared/maps.ts';
import { layoutOf, noteTargetEvents, releaseTargetFx, resetTargetArt, stateOf, targetPose } from '../src/client/targetart.ts';
import { addFeedback, NO_FEEDBACK } from '../src/client/feedback.ts';

const layout = MAPS.range.range!;
const snapWith = (events: Snapshot['events']): Snapshot => ({ events } as unknown as Snapshot);
const down = (i: number) => ({ e: 'target' as const, i, k: 'down' as const, by: 7, x: 0, y: 0 });
const up = (i: number) => ({ e: 'target' as const, i, k: 'up' as const, by: null, x: 0, y: 0 });
const dmg = (i: number) => ({ e: 'dmg' as const, attacker: 7, victim: RANGE.idBase + i, amount: 25, x: 10, y: 10, kind: 'target' as const });

test('the snapshot names the range map, and the client finds its layout by that name', () => {
  assert.equal(layoutOf('Range'), layout);
  assert.equal(layoutOf('Plaza'), undefined);
});

test('a target tips back onto its base when it falls, with a short lean back first, and stays down', () => {
  resetTargetArt();
  noteTargetEvents(snapWith([down(3)]), 1000);
  releaseTargetFx(999, 5000, layout);
  assert.equal(stateOf(3).down, false, 'nothing lands before the render clock reaches its tick');
  releaseTargetFx(1000, 5000, layout);
  const s = stateOf(3);
  assert.equal(s.down, true);
  const rises = [0, 40, 100, 180, 300, 420].map((dt) => targetPose(s, 5000 + dt).rise);
  assert.equal(rises[0], 1);
  assert.ok(rises.every((r, i) => i === 0 || r <= rises[i - 1]! + 0.05), `it only goes down: ${rises}`);
  assert.ok(rises.at(-1)! < 0.2 && rises.at(-1)! > 0.1, `it ends lying nearly flat but never vanishes: ${rises.at(-1)}`);
  assert.ok(targetPose(s, 5000 + 5000).rise === rises.at(-1) || Math.abs(targetPose(s, 10_000).rise - rises.at(-1)!) < 0.02, 'and stays');
});

test('a regenerating target springs up past standing, then settles to 1', () => {
  resetTargetArt();
  noteTargetEvents(snapWith([down(1)]), 0);
  releaseTargetFx(0, 100, layout);
  noteTargetEvents(snapWith([up(1)]), 4000);
  releaseTargetFx(4000, 9000, layout);
  const s = stateOf(1);
  assert.equal(s.down, false);
  const rises = Array.from({ length: 22 }, (_, k) => targetPose(s, 9000 + k * 20).rise);
  assert.ok(rises[0]! < 0.2, 'starts flat');
  assert.ok(Math.max(...rises) > 1.02, `overshoots a little: ${Math.max(...rises).toFixed(3)}`);
  assert.ok(Math.max(...rises) < 1.25, 'but only a little');
  assert.equal(targetPose(s, 9000 + 1000).rise, 1, 'settles');
});

test('a hit wobbles the target and flashes it white for a moment, then it is still', () => {
  resetTargetArt();
  noteTargetEvents(snapWith([dmg(5)]), 0);
  releaseTargetFx(0, 1000, layout);
  const s = stateOf(5);
  assert.equal(s.holes, 1);
  assert.ok(targetPose(s, 1020).flash > 0.7);
  assert.equal(targetPose(s, 1400).flash, 0);
  const swing = Array.from({ length: 12 }, (_, k) => Math.abs(targetPose(s, 1000 + k * 12).lean));
  assert.ok(Math.max(...swing) > 0.03, 'it swings');
  assert.equal(targetPose(s, 1400).lean, 0, 'and stops');
});

test('a hit on a target sounds a hit marker for the shooter, and a fall is a kill marker', () => {
  const dmgEv = dmg(2);
  const hit = addFeedback(NO_FEEDBACK, [dmgEv], [], 7, 100, 0);
  assert.deepEqual(hit.hitmarker && { kill: hit.hitmarker.kill }, { kill: false });
  assert.equal(hit.numbers.length, 1, 'with a damage number');
  const fell = addFeedback(hit, [down(2)], [], 7, 100, 10);
  assert.equal(fell.hitmarker?.kill, true);
  const other = addFeedback(NO_FEEDBACK, [{ ...down(2), by: 9 }], [], 7, 100, 0);
  assert.equal(other.hitmarker, null, 'a target someone else dropped is no marker of mine');
});

test('a slider is where the shared clock puts it, in step on both sides of the wire', () => {
  const slider = layout.targets.find((t) => t.rail)!;
  for (const t of [0, 1234, 98_765]) assert.deepEqual(targetPos(slider, t), targetPos(slider, t));
  const xs = Array.from({ length: 200 }, (_, k) => targetPos(slider, k * 50).y);
  assert.ok(Math.max(...xs) - Math.min(...xs) > slider.rail!.reach * 1.8, 'it covers its rail');
  assert.ok(TARGETS.rail.hp > 0);
});
