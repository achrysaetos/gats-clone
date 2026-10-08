import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addPulse, DAY, decayPulse, decideFx, gradeFor, NIGHT, STORM, vignetteReach, watchdog } from '../src/client/fxparams.ts';

const env = { search: '', reducedMotion: false, saveData: false, glOk: true };

test('grade follows context and blends smoothly into night', () => {
  assert.deepEqual(gradeFor({ night: 0, storm: false }), DAY);
  assert.deepEqual(gradeFor({ night: 1, storm: false }), NIGHT);
  assert.deepEqual(gradeFor({ night: 0, storm: true }), STORM);
  const mid = gradeFor({ night: 0.5, storm: false });
  assert.ok(mid.bloomThreshold < DAY.bloomThreshold && mid.bloomThreshold > NIGHT.bloomThreshold);
  assert.deepEqual(gradeFor({ night: 7, storm: false }), NIGHT);
});

test('grades stay gentle: team colours are never washed out and the day floor never blooms', () => {
  assert.ok(STORM.sat < DAY.sat && STORM.sat >= 0.75);
  assert.ok(NIGHT.sat >= 1);
  for (const g of [DAY, NIGHT, STORM]) {
    assert.ok(g.sat >= 0.75 && g.sat <= 1.1);
    assert.ok(g.grain <= 0.03 && g.bloomStrength <= 0.9);
    for (const c of [...g.gain, g.gamma]) assert.ok(c > 0.9 && c < 1.1);
  }
  // Bone floor #e2dccb: the shader's bloom measure is the mean of luma and max channel.
  const [r, gr, b] = [0xe2, 0xdc, 0xcb].map((v) => v / 255);
  const measure = 0.5 * (0.299 * r + 0.587 * gr + 0.114 * b + Math.max(r, gr, b));
  assert.ok(measure < DAY.bloomThreshold);
  assert.ok(measure < STORM.bloomThreshold);
  // Lit night floor can reach the bone colour; the shader squares the weight, so it stays negligible.
  assert.ok(((measure - NIGHT.bloomThreshold) / (1 - NIGHT.bloomThreshold)) ** 2 < 0.05);
});

test('fallback decisions', () => {
  assert.deepEqual(decideFx(env), { mode: 'full', reason: 'ok' });
  assert.equal(decideFx({ ...env, search: '?nofx' }).mode, 'off');
  assert.equal(decideFx({ ...env, search: '?nofx&fx' }).mode, 'off');
  assert.equal(decideFx({ ...env, glOk: false }).mode, 'off');
  assert.equal(decideFx({ ...env, reducedMotion: true }).mode, 'calm');
  assert.equal(decideFx({ ...env, saveData: true }).mode, 'off');
  assert.equal(decideFx({ ...env, deviceMemory: 2 }).mode, 'off');
  assert.equal(decideFx({ ...env, renderer: 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device))' }).reason, 'software renderer');
  assert.equal(decideFx({ ...env, renderer: 'llvmpipe (LLVM 15)' }).mode, 'off');
  assert.equal(decideFx({ ...env, renderer: 'ANGLE (Apple, Apple M2)' }).mode, 'full');
  assert.equal(decideFx({ ...env, search: '?fx', renderer: 'SwiftShader' }).mode, 'full');
});

test('watchdog judges each full window of frames by its average, never a single frame', () => {
  const fast = watchdog(5, 10), slow = watchdog(5, 10), spiky = watchdog(5, 10);
  assert.ok(![...Array(30)].some(() => fast(1)));
  assert.deepEqual([...Array(10)].map(() => slow(9)), [...Array(9).fill(false), true], 'only once the window is full');
  assert.deepEqual([...Array(10)].map(() => slow(9)).at(-1), true, 'and again for the next window');
  // One 40 ms hitch among fast frames averages 4.9 ms: not slow.
  assert.equal([...Array(10)].map((_, i) => spiky(i === 3 ? 40 : 1)).some(Boolean), false);
});

test('pulse decays to zero and never stacks above 1', () => {
  assert.equal(addPulse(0.8, 0.5), 0.8);
  assert.equal(addPulse(0.8, 3), 1);
  assert.ok(decayPulse(1, 110) > 0.49 && decayPulse(1, 110) < 0.51);
  assert.equal(decayPulse(1, 2000), 0);
});

test('vignette reach matches the old strips', () => {
  // The old strips were 320 css px at the sides and 230 at top and bottom, never past 26% of the screen.
  const [x, y] = vignetteReach(1600, 900);
  assert.ok(Math.abs(x - 0.2) < 1e-12 && Math.abs(y - 230 / 900) < 1e-12, `${x}, ${y}`);
  assert.deepEqual(vignetteReach(800, 600), [0.26, 0.26], 'capped on a small screen');
});
