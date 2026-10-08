/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bandOf, inBestBand } from '../src/shared/bands.ts';
import { killZoom, KILL_ZOOM } from '../src/client/hitstop.ts';

test("the reticle's best band follows each gun's job: a shotgun up close, a sniper far off, evolutions like their parent", () => {
  assert.deepEqual([bandOf(0), bandOf(134), bandOf(135), bandOf(320), bandOf(900)], [70, 70, 200, 400, 600]);
  assert.equal(inBestBand('shotgun', 60), true);
  assert.equal(inBestBand('shotgun', 450), false);
  assert.equal(inBestBand('sniper', 450), true);
  assert.equal(inBestBand('assault', 200), true);
  assert.equal(inBestBand('handCannon', 200), true, 'its own job reaches mid');
});

test('a kill punches the view in by 3% at its peak and is back to 1 after 120 ms', () => {
  assert.equal(killZoom(0, -1), 1);
  assert.ok(Math.abs(killZoom(0, KILL_ZOOM.ms / 2) - 1.03) < 1e-9);
  assert.equal(killZoom(0, KILL_ZOOM.ms), 1);
});
