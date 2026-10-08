/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, SETTINGS_KEY, gainOfPercent, loadSettings, motionReduced, onSettings, percentOfGain, resetSettings, sanitize, setSetting, settings, shakeFactor, uiFactor, useStore, type Store } from '../src/client/settings.ts';

const memory = (): Store & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return { data, get: (k) => data.get(k) ?? null, set: (k, v) => { data.set(k, v); } };
};

test('settings persist: a change is written, a fresh load (a reload) reads it back', () => {
  const store = memory();
  useStore(store);
  setSetting('shake', 'reduced');
  setSetting('uiScale', 120);
  setSetting('damageNumbers', false);
  setSetting('crosshair', 'ring');
  setSetting('quality', 'medium');
  assert.ok(store.data.has(SETTINGS_KEY));
  useStore(store);
  const s = settings();
  assert.equal(s.shake, 'reduced');
  assert.equal(s.uiScale, 120);
  assert.equal(s.damageNumbers, false);
  assert.equal(s.crosshair, 'ring');
  assert.equal(s.quality, 'medium');
  useStore(null);
});

test('bad, hostile or missing stored values fall back one by one', () => {
  assert.deepEqual(sanitize(null), DEFAULTS);
  assert.deepEqual(sanitize('x'), DEFAULTS);
  const s = sanitize({ shake: 'violent', uiScale: 9999, motion: 'on', crosshair: 3, quality: 'off', damageNumbers: 'yes', adv: { post: 'x', critters: 0.55, dprCap: 9 } });
  assert.equal(s.shake, DEFAULTS.shake);
  assert.equal(s.uiScale, 150);
  assert.equal(s.motion, 'on');
  assert.equal(s.crosshair, 'classic');
  assert.equal(s.quality, 'low', "the first version's Off is Low now");
  assert.equal(s.damageNumbers, true);
  assert.deepEqual(s.adv, { critters: 0.6, dprCap: 2.5 });
  assert.equal(sanitize({ uiScale: 5 }).uiScale, 80);
  assert.equal(sanitize({ uiScale: 0 }).uiScale, 0);
  assert.equal(sanitize({ uiScale: 104.6 }).uiScale, 105, 'a whole percent');
  assert.equal(sanitize({ uiScale: '120' }).uiScale, 120, 'a number stored as text still reads');
  assert.equal(sanitize({ crosshairColor: 'mint' }).crosshairColor, 'mint');
  assert.equal(sanitize({ crosshairColor: 'red' }).crosshairColor, DEFAULTS.crosshairColor);
  assert.equal(sanitize({ touchAssist: false }).touchAssist, false);
  assert.deepEqual(loadSettings(memory()), DEFAULTS, 'nothing stored yet: the defaults');
  const junk = memory();
  junk.data.set(SETTINGS_KEY, '{not json');
  assert.deepEqual(loadSettings(junk), DEFAULTS);
});

test('storage that throws never breaks a change; listeners hear it; reset restores defaults', () => {
  const heard: string[] = [];
  // Under node there is no localStorage, so the browser store is exactly the blocked-storage case: reads give null, writes are swallowed.
  useStore(null);
  const off = onSettings((_s, k) => heard.push(String(k)));
  setSetting('touchAssist', false);
  assert.equal(settings().touchAssist, false);
  resetSettings();
  assert.deepEqual(settings(), DEFAULTS);
  off();
  assert.deepEqual(heard, ['touchAssist', 'null']);
});

test('volume sliders map to gains: 0..100 is 0..1, clamped and rounded, and back', () => {
  assert.equal(gainOfPercent(0), 0);
  assert.equal(gainOfPercent(100), 1);
  assert.equal(gainOfPercent(35), 0.35);
  assert.equal(gainOfPercent(250), 1);
  assert.equal(gainOfPercent(-5), 0);
  assert.equal(percentOfGain(0.8), 80);
  assert.equal(percentOfGain(7), 100);
  assert.equal(percentOfGain(NaN), 100);
  assert.equal(gainOfPercent(NaN), 1, 'a garbled slider value is full volume, not silence');
  for (let p = 0; p <= 100; p += 5) assert.equal(percentOfGain(gainOfPercent(p)), p);
});

test('shake, motion and UI scale options', () => {
  assert.equal(shakeFactor('on'), 1);
  assert.equal(shakeFactor('off'), 0);
  assert.ok(shakeFactor('reduced') > 0 && shakeFactor('reduced') < 1);
  assert.equal(motionReduced('system', true), true);
  assert.equal(motionReduced('system', false), false);
  assert.equal(motionReduced('on', false), true);
  assert.equal(motionReduced('off', true), false);
  assert.equal(uiFactor(0), 1);
  assert.equal(uiFactor(80), 0.8);
  assert.equal(uiFactor(150), 1.5);
  assert.equal(uiFactor(400), 1.5);
});

/** A bare-bones Web Audio: every node records its gain and ignores wiring, enough to read the values the sliders set. */
function fakeAudio() {
  const nodes: { gain: { value: number; setTargetAtTime(v: number): void } }[] = [];
  const node = (): Record<string, unknown> => {
    const gain = { value: 1, setTargetAtTime(v: number) { gain.value = v; }, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} };
    const n: Record<string, unknown> = { gain, frequency: { value: 0, setTargetAtTime() {}, setValueAtTime() {}, exponentialRampToValueAtTime() {} }, Q: { value: 0 }, threshold: {}, knee: {}, ratio: {}, attack: {}, release: {}, pan: { value: 0 }, start() {}, stop() {} };
    n.connect = (to: unknown) => to;
    nodes.push(n as never);
    return n;
  };
  class FakeContext {
    state = 'running'; currentTime = 0; sampleRate = 8000; destination = {};
    createGain = node; createDynamicsCompressor = node; createBiquadFilter = node; createStereoPanner = node; createOscillator = node; createBufferSource = node;
    createBuffer(_c: number, n: number) { return { getChannelData: () => new Float32Array(n) }; }
    resume() { return Promise.resolve(); }
  }
  (globalThis as { AudioContext?: unknown }).AudioContext = FakeContext;
  return nodes;
}

test('the master and effects sliders reach separate gain nodes; the music bus is untouched', async () => {
  const nodes = fakeAudio();
  const { createAudio } = await import('../src/client/audio.ts');
  const audio = createAudio();
  assert.equal(audio.gains(), null, 'no graph before a gesture unlocks audio');
  audio.unlock();
  const start = audio.gains()!;
  audio.setMasterVolume(0.5);
  audio.setSfxVolume(0.25);
  const g = audio.gains()!;
  assert.ok(Math.abs(g.master - 0.8 * 0.5) < 1e-9, `master bus ${g.master} is the engine's 0.8 times the slider`);
  assert.equal(g.sfx, 0.25);
  assert.equal(audio.getMasterVolume(), 0.5);
  assert.equal(audio.getSfxVolume(), 0.25);
  audio.setSfxVolume(0);
  assert.equal(audio.gains()!.sfx, 0);
  audio.setSfxVolume(3);
  assert.equal(audio.getSfxVolume(), 1, 'clamped to full');
  audio.setSfxVolume(NaN);
  assert.equal(audio.getSfxVolume(), 1, 'a garbled value is full volume');
  audio.setSfxVolume(-1);
  assert.equal(audio.gains()!.sfx, 0, 'and never negative');
  assert.ok(Math.abs(audio.gains()!.master - 0.4) < 1e-9, 'effects slider leaves the master (and so the music) alone');
  assert.ok(start.master > g.master);
  // Muted, a cue builds no audio nodes at all; unmuted, the same cue does.
  const kill = [{ id: 'kill', x: 0, y: 0, self: true, gain: 1 }] as const;
  audio.setMuted(true);
  assert.equal(audio.isMuted(), true);
  let before = nodes.length;
  audio.play(kill, { x: 0, y: 0 }, 900);
  assert.equal(nodes.length, before, 'muted: nothing plays');
  audio.setMuted(false);
  assert.equal(audio.isMuted(), false);
  audio.play(kill, { x: 0, y: 0 }, 900);
  assert.ok(nodes.length > before, 'unmuted: the cue plays');
  assert.equal(audio.toggleMute(), true, 'M flips it and says which way');
  before = nodes.length;
  audio.play(kill, { x: 0, y: 0 }, 900);
  assert.equal(nodes.length, before);
});

test('a gesture wakes an audio context that Safari interrupted (a call, Siri, another app), not only one that never started', async () => {
  fakeAudio();
  const Base = (globalThis as { AudioContext?: new () => { state: string } }).AudioContext!;
  const made: { ctx: { state: string; resumes: number } | null } = { ctx: null };
  (globalThis as { AudioContext?: unknown }).AudioContext = class extends Base {
    resumes = 0;
    constructor() { super(); made.ctx = this; }
    resume() { this.resumes++; this.state = 'running'; return Promise.resolve(); }
  };
  const { createAudio } = await import('../src/client/audio.ts');
  const audio = createAudio();
  audio.unlock();
  const ctx = made.ctx!;
  assert.equal(ctx.resumes, 0, 'already running: nothing to do');
  for (const stopped of ['suspended', 'interrupted']) {
    ctx.state = stopped;
    const before: number = ctx.resumes;
    audio.unlock();
    assert.equal(ctx.resumes, before + 1, `a ${stopped} context is resumed by the next gesture`);
    assert.equal(ctx.state, 'running');
  }
});
