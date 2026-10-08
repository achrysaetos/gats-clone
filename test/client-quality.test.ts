/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS, PRESET_IDS, autoPick, createDegrader, createMeter, knobsFor, sanitizeAdv, stepDown, type Env, type Knobs } from '../src/client/quality.ts';

const env = (o: Partial<Env> = {}): Env => ({ glOk: true, dpr: 1, touch: false, renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3070 Direct3D11)', deviceMemory: 8, probeMs: 8, ...o });

test('every preset costs at least as much as the one below it, knob by knob', () => {
  const numeric: (keyof Knobs)[] = ['lightMul', 'shadowMul', 'bloom', 'grain', 'critters', 'particles', 'decor', 'vehicleRes', 'dprCap'];
  for (let i = 1; i < PRESET_IDS.length; i++) {
    const lo = PRESETS[PRESET_IDS[i - 1]!], hi = PRESETS[PRESET_IDS[i]!];
    for (const k of numeric) assert.ok((hi[k] as number) >= (lo[k] as number), `${PRESET_IDS[i]} ${k}`);
    assert.ok(hi.tier <= lo.tier, 'a lower tier index is richer lighting');
    assert.ok(hi.waterTier <= lo.waterTier);
    assert.ok(Number(hi.post) >= Number(lo.post) && Number(hi.lighting) >= Number(lo.lighting) && Number(hi.waterGL) >= Number(lo.waterGL));
  }
  assert.equal(PRESETS.low.post, false, 'Low is the plain picture');
  assert.equal(PRESETS.low.shadowMul, 0, 'Low casts no shadows from lights');
});

test('each preset gives different knobs; overrides win; ?nofx beats all; lighting needs the pass', () => {
  const seen = new Set(PRESET_IDS.map((p) => JSON.stringify(knobsFor(p))));
  assert.equal(seen.size, 4);
  assert.equal(knobsFor('low', { post: true, lighting: true }).lighting, true);
  assert.equal(knobsFor('high', { critters: 0 }).critters, 0);
  const nofx = knobsFor('ultra', {}, true);
  assert.equal(nofx.post, false);
  assert.equal(nofx.lighting, false);
  assert.equal(knobsFor('medium', { post: false }).lighting, false);
});

test('Auto picks from the renderer, memory, DPR, touch and the measured frame time, and says why', () => {
  assert.equal(autoPick(env({ glOk: false })).preset, 'low');
  const soft = autoPick(env({ renderer: 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device), SwiftShader driver)' }));
  assert.equal(soft.preset, 'low');
  assert.match(soft.why, /software renderer/);
  assert.equal(autoPick(env({ deviceMemory: 2 })).preset, 'low');
  assert.equal(autoPick(env({ saveData: true })).preset, 'low');
  assert.equal(autoPick(env({ touch: true })).preset, 'medium');
  assert.equal(autoPick(env({ renderer: 'ANGLE (Intel, Intel(R) UHD Graphics 620)' })).preset, 'medium');
  assert.equal(autoPick(env({ deviceMemory: 4 })).preset, 'medium');
  assert.equal(autoPick(env()).preset, 'ultra');
  assert.equal(autoPick(env({ probeMs: null })).preset, 'high', 'a strong GPU needs a fast probe to reach Ultra');
  assert.equal(autoPick(env({ dpr: 3 })).preset, 'high');
  assert.equal(autoPick(env({ renderer: undefined, probeMs: null })).preset, 'high');
  const slow = autoPick(env({ probeMs: 40 }));
  assert.equal(slow.preset, 'medium', 'a slow probe lowers the pick one step');
  assert.match(slow.why, /40 ms/);
  assert.match(autoPick(env()).why, /RTX 3070/);
});

test('stepDown walks Ultra to Low and stops', () => {
  assert.equal(stepDown('ultra'), 'high');
  assert.equal(stepDown('high'), 'medium');
  assert.equal(stepDown('medium'), 'low');
  assert.equal(stepDown('low'), null);
});

test('the degrader fires only after ten seconds of slow frames, resets on a good second, and ignores stalls', () => {
  const d = createDegrader();
  let fired = -1;
  for (let t = 0; t < 15_000 && fired < 0; t += 40) if (d.push(40, t)) fired = t;
  assert.ok(fired >= 10_000 && fired <= 12_100, `fired at ${fired}`);
  const e = createDegrader();
  let any = false;
  for (let t = 0; t < 30_000; t += 40) {
    const good = t % 9_000 < 1_500;
    if (e.push(good ? 10 : 40, t)) any = true;
  }
  assert.equal(any, false, 'a good second every nine keeps resetting the clock');
  const f = createDegrader();
  let stalled = false;
  for (let t = 0; t < 30_000; t += 500) if (f.push(900, t)) stalled = true;
  assert.equal(stalled, false, 'a hidden tab is not a slow GPU');
  const g = createDegrader();
  let fast = false;
  for (let t = 0; t < 30_000; t += 16) if (g.push(16, t)) fast = true;
  assert.equal(fast, false);
  const h = createDegrader();
  let capped = false;
  for (let t = 0; t < 30_000; t += 33.3) if (h.push(33.3, t)) capped = true;
  assert.equal(capped, false, 'a steady 30 Hz power-saver cap is not slow');
});

test('a degrader reset (the page was hidden) forgets the slow seconds before it', () => {
  const d = createDegrader();
  let fired = false, t = 0;
  for (; t < 9_000; t += 40) if (d.push(40, t)) fired = true;
  d.reset();
  for (const end = t + 4_000; t < end; t += 40) if (d.push(40, t)) fired = true;
  assert.equal(fired, false, 'nine slow seconds, a reset, then four more is not ten in a row');
  for (const end = t + 8_000; t < end; t += 40) if (d.push(40, t)) fired = true;
  assert.equal(fired, true, 'but twelve after the reset is');
});

test('the meter reads fps and the slowest recent frame once it has a few, over its last 60 frames only', () => {
  const m = createMeter();
  assert.equal(m.read(), null);
  for (let i = 0; i < 4; i++) m.push(20);
  assert.equal(m.read(), null, 'four frames are too few to say');
  for (let i = 0; i < 6; i++) m.push(20);
  m.push(50);
  const r = m.read()!;
  assert.equal(r.worst, 50);
  assert.ok(Math.abs(r.ms - 250 / 11) < 1e-9, `the mean frame (${r.ms})`);
  assert.ok(Math.abs(r.fps - 1000 / (250 / 11)) < 1e-9);
  for (let i = 0; i < 60; i++) m.push(10);
  assert.deepEqual(m.read(), { fps: 100, ms: 10, worst: 10 }, 'the old slow frame has rolled out of the window');
  m.push(0);
  m.push(-3);
  m.push(5000);
  assert.deepEqual(m.read(), { fps: 100, ms: 10, worst: 10 }, 'zero, negative and stall-length frames are not frames');
});

test('advanced overrides are snapped to the steps on offer', () => {
  assert.deepEqual(sanitizeAdv({ post: false, lighting: 'no', waterGL: true, critters: 0.3, dprCap: 1.7, junk: 1 }), { post: false, waterGL: true, critters: 0.25, dprCap: 1.5 });
  assert.deepEqual(sanitizeAdv(undefined), {});
});
