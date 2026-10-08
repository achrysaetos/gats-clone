/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEngine, VOICE_CAPS } from '../src/client/audio.ts';
import { minGapMs, priorityOf, SOUNDS, type SoundCue } from '../src/client/sfx.ts';

/** A Web Audio stand-in that counts the sources the engine starts, and lets the test end them. */
function fakeContext() {
  const sources: { stopped: number; onended: (() => void) | null }[] = [];
  const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime() {} });
  const node = (): Record<string, unknown> => {
    const n: Record<string, unknown> = { gain: param(), frequency: param(), Q: param(), pan: param(), disconnect() {} };
    n.connect = (to: unknown) => to;
    return n;
  };
  const source = () => {
    const s = { ...node(), stopped: 0, onended: null as (() => void) | null, start() {}, stop(t: number) { s.stopped = t; } };
    sources.push(s);
    return s;
  };
  const ctx = {
    currentTime: 0, sampleRate: 8000,
    createGain: node, createStereoPanner: node, createBiquadFilter: node, createOscillator: source, createBufferSource: source,
  };
  const engine = createEngine(ctx as unknown as BaseAudioContext, node() as unknown as AudioNode, {} as AudioBuffer);
  /** Ends every source started so far, as the audio thread would once they ran out. */
  const endAll = () => { for (const s of sources.splice(0)) s.onended?.(); };
  return { ctx, engine, sources, endAll };
}

const me = { x: 0, y: 0 };
const cue = (id: SoundCue['id'], o: Partial<SoundCue> = {}) => ({ id, x: 0, y: 0, self: false, gain: 1, ...o }) as SoundCue;

test('a cue plays one voice per layer, and someone else\'s gun leaves out the layers only its owner hears', () => {
  const { engine, sources } = fakeContext();
  const recipe = SOUNDS['shot:pistol'];
  assert.ok(recipe.some((l) => l.selfOnly), 'the pistol has own-gun-only layers (casings, the action)');
  engine.play([cue('shot:pistol', { self: true })], me, 900);
  assert.equal(sources.length, recipe.length);
  assert.equal(engine.voices(), recipe.length);
  engine.play([cue('shot:pistol', { x: 100 })], me, 900);
  assert.equal(sources.length - recipe.length, recipe.filter((l) => !l.selfOnly).length);
});

test('voices are counted down as they end', () => {
  const { engine, endAll } = fakeContext();
  engine.play([cue('kill', { self: true })], me, 900);
  assert.equal(engine.voices(), SOUNDS.kill.length);
  endAll();
  assert.equal(engine.voices(), 0);
});

test('a sound beyond earshot plays nothing; one at the edge of the view still does', () => {
  const { engine, sources } = fakeContext();
  engine.play([cue('boom', { x: 900 * 1.2 + 10 })], me, 900);
  assert.equal(sources.length, 0);
  engine.play([cue('boom', { x: 900 })], me, 900);
  assert.equal(sources.length, SOUNDS.boom.length);
  engine.play([cue('kill', { self: true, x: 99_999 })], me, 900);
  assert.equal(sources.length, SOUNDS.boom.length + SOUNDS.kill.length, 'your own cue is heard wherever its event was');
});

test('someone else\'s repeat of a sound inside its minimum gap is dropped, your own never is', () => {
  const { ctx, engine, sources } = fakeContext();
  const gap = minGapMs('shot:smg');
  assert.ok(gap > 0);
  const layers = SOUNDS['shot:smg'].filter((l) => !l.selfOnly).length;
  engine.play([cue('shot:smg', { x: 50 }), cue('shot:smg', { x: 60 })], me, 900);
  assert.equal(sources.length, layers, 'two at once from others: one voice set');
  ctx.currentTime = (gap - 1) / 1000;
  engine.play([cue('shot:smg', { x: 50 })], me, 900);
  assert.equal(sources.length, layers, 'still inside the gap');
  ctx.currentTime = (gap + 1) / 1000;
  engine.play([cue('shot:smg', { x: 50 })], me, 900);
  assert.equal(sources.length, 2 * layers, 'past the gap it plays');
  const before = sources.length;
  engine.play([cue('shot:smg', { self: true }), cue('shot:smg', { self: true })], me, 900);
  assert.equal(sources.length - before, 2 * SOUNDS['shot:smg'].length, 'your own trigger is never thinned');
});

test('a full mix drops ambience at the soft cap and own shots at the normal cap, but feedback plays on to the hard cap', () => {
  const { ctx, engine } = fakeContext();
  assert.equal(priorityOf(cue('shot:smg')), 0);
  assert.equal(priorityOf(cue('shot:smg', { self: true })), 1);
  assert.equal(priorityOf(cue('hit', { self: true })), 2);
  const fill = (c: SoundCue) => { for (let i = 0; i < 200; i++) { ctx.currentTime += 0.1; engine.play([c], me, 900); } return engine.voices(); };
  const ambience = fill(cue('shot:smg', { x: 50 }));
  assert.ok(ambience <= VOICE_CAPS.soft && ambience > VOICE_CAPS.soft - SOUNDS['shot:smg'].length, `others' shots stop at the soft cap (${ambience})`);
  const own = fill(cue('shot:smg', { self: true }));
  assert.ok(own <= VOICE_CAPS.normal && own > VOICE_CAPS.normal - SOUNDS['shot:smg'].length, `your shots go on to the normal cap (${own})`);
  const feedback = fill(cue('hit', { self: true }));
  assert.ok(feedback <= VOICE_CAPS.hard && feedback > VOICE_CAPS.hard - SOUNDS.hit.length, `hits go on to the hard cap (${feedback})`);
});
