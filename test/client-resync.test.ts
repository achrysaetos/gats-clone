/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EMPTY_BUFFER, pushSnap, TICK_MS } from '../src/client/interp.ts';
import { NO_PREDICTION, type Prediction } from '../src/client/predict.ts';
import { MAX_FRAME_STEP_MS, frameStep, resyncNet, shouldPredict } from '../src/client/resync.ts';
import { createDegrader, createFrameGate } from '../src/client/quality.ts';
import { lightGovernor } from '../src/client/fxparams.ts';
import type { Snapshot } from '../src/shared/protocol.ts';

const snap = (tick: number) => ({ t: 'snap', tick, ackSeq: 0 }) as unknown as Snapshot;

test('frameStep caps a long gap and ignores the first frame', () => {
  assert.equal(frameStep(1000, 0), 0);
  assert.equal(frameStep(1016, 1000), 16);
  assert.equal(frameStep(61_000, 1000), MAX_FRAME_STEP_MS);
  assert.equal(frameStep(900, 1000), 0);
});

test('resyncNet keeps only the newest snapshot, forgets the clock and the prediction', () => {
  let buf = EMPTY_BUFFER;
  for (let t = 1; t <= 10; t++) buf = pushSnap(buf, snap(t), t * TICK_MS);
  assert.ok(buf.serverClockOffset !== null && buf.snaps.length === 10);
  const pred: Prediction = { ...NO_PREDICTION, pending: [{ seq: 1, input: {} as never, dtMs: TICK_MS, ability: null }], smoothingCorrection: { x: 40, y: 0 } };
  const r = resyncNet({ snaps: buf, predict: pred, pendingFx: [1, 2], pendingShots: [3] });
  assert.equal(r.snaps.snaps.length, 1);
  assert.equal(r.snaps.snaps[0]!.tick, 10);
  assert.equal(r.snaps.serverClockOffset, null);
  assert.equal(r.predict, NO_PREDICTION);
  assert.deepEqual([r.pendingFx, r.pendingShots], [[], []], 'effects queued unseen are dropped');
  // the next snapshot sets the clock afresh, however far the old estimate was
  const next = pushSnap(r.snaps, snap(2000), 61_000);
  assert.equal(next.serverClockOffset, 2000 * TICK_MS - 61_000);
  assert.deepEqual(resyncNet({ snaps: EMPTY_BUFFER, predict: NO_PREDICTION, pendingFx: [], pendingShots: [] }).snaps, { snaps: [], serverClockOffset: null });
});

test('a hidden tab does not predict', () => {
  assert.equal(shouldPredict(true), false);
  assert.equal(shouldPredict(false), true);
});

test('the frame gate ignores hidden time and the settle period after it', () => {
  const g = createFrameGate(2000);
  assert.equal(g.open(100), true);
  g.setHidden(true, 1000);
  assert.equal(g.open(5000), false);
  g.setHidden(false, 60_000);
  assert.equal(g.open(60_500, false), false);
  assert.equal(g.open(61_999), false);
  assert.equal(g.open(62_000), true);
  assert.equal(g.open(63_000, true), false, 'document.hidden wins');
  assert.equal(createFrameGate(2000, true).open(1e9), false, 'loaded hidden stays closed until shown');
});

test('slow frames only in the gated window never step the degrader down', () => {
  const deg = createDegrader(), gate = createFrameGate(2000);
  let stepped = false, now = 0;
  const frame = (ms: number, hidden = false) => { now += ms; if (!gate.open(now, hidden)) { deg.reset(); return; } if (deg.push(ms, now)) stepped = true; };
  for (let i = 0; i < 30; i++) frame(16);
  gate.setHidden(true, now);
  for (let i = 0; i < 5; i++) frame(1000, true);
  gate.setHidden(false, now);
  for (let i = 0; i < 60; i++) frame(33 + (i % 2) * 40); // ~2.4 s of slow frames while the page wakes
  assert.equal(stepped, false);
  // but genuinely slow frames afterwards still do
  for (let i = 0; i < 400; i++) frame(30 + (i % 2) * 10);
  assert.equal(stepped, true);
});

test('lightGovernor.holdUntil judges nothing until then', () => {
  const g = lightGovernor();
  g.holdUntil(10_000);
  let acted = false;
  for (let t = 0; t < 9_900; t += 100) if (g.push(100, 5, t, 0, 2, true).action !== 'none') acted = true;
  assert.equal(acted, false);
  for (let t = 10_000; t < 30_000; t += 100) if (g.push(100, 5, t, 0, 2, true).action === 'down') acted = true;
  assert.equal(acted, true);
});
