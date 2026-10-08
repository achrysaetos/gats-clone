/// <reference types="node" />
/**
 * The music director over a long session, on a bookkeeping fake of WebAudio: every node's connections, every source's start and stop, and
 * every AudioParam's automation timeline with Chrome's rule that a value curve may not overlap another event (Chrome throws NotSupportedError).
 * It runs the director for a simulated quarter hour of map changes, radio presses and main-thread stalls, and counts what is left alive.
 * One file, one module instance: music.ts keeps its state in module scope.
 */
import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { EMPTY_BUFFER } from '../src/client/interp.ts';
import { TRACK_IDS } from '../src/shared/radio.ts';

type Ev = { t: number; end: number; curve: boolean };
type FakeNode = Record<string, unknown> & { outs: FakeNode[]; inCount: number };

let clock = 0;
const pastStarts: { at: number; clock: number }[] = [];
const live = new Set<{ stopAt: number }>();
const gains: FakeNode[] = [];

function param(): Record<string, unknown> {
  let events: Ev[] = [];
  const p: Record<string, unknown> = { value: 1, defaultValue: 1 };
  const inCurve = (t: number) => events.find((e) => e.curve && t > e.t && t < e.end);
  const add = (name: string, t: number) => {
    const c = inCurve(t);
    if (c) throw Object.assign(new Error(`${name}(${t}) overlaps setValueCurveAtTime(${c.t}, ${c.end - c.t})`), { name: 'NotSupportedError' });
    if (events.length > 64) events = events.filter((e) => e.end > clock - 1); // the engine drops events long past, as Chrome does
    events.push({ t, end: t, curve: false });
    return p;
  };
  p.setValueAtTime = (_v: number, t: number) => add('setValueAtTime', t);
  p.linearRampToValueAtTime = (_v: number, t: number) => add('linearRampToValueAtTime', t);
  p.exponentialRampToValueAtTime = (_v: number, t: number) => add('exponentialRampToValueAtTime', t);
  p.setTargetAtTime = (_v: number, t: number) => add('setTargetAtTime', t);
  p.setValueCurveAtTime = (_c: Float32Array, t: number, d: number) => {
    const hit = events.find((e) => e.t > t && e.t < t + d) ?? inCurve(t);
    if (hit) throw Object.assign(new Error(`setValueCurveAtTime(${t}, ${d}) overlaps an event at ${hit.t}`), { name: 'NotSupportedError' });
    events.push({ t, end: t + d, curve: true });
    return p;
  };
  p.cancelScheduledValues = (t: number) => { events = events.filter((e) => e.t < t); return p; };
  p.cancelAndHoldAtTime = (t: number) => { events = events.filter((e) => e.t < t).map((e) => (e.curve && e.end > t ? { ...e, end: t } : e)); return p; };
  return p;
}

function node(kind: string): FakeNode {
  const n: FakeNode = { kind, outs: [], inCount: 0 };
  for (const k of ['gain', 'frequency', 'detune', 'Q', 'pan', 'playbackRate', 'threshold', 'knee', 'ratio', 'attack', 'release']) n[k] = param();
  n.connect = (d: FakeNode) => { if (d && typeof d === 'object' && 'outs' in d) { n.outs.push(d); d.inCount++; } return d; };
  n.disconnect = () => { for (const d of n.outs) d.inCount--; n.outs = []; };
  if (kind === 'src') {
    const rec = { stopAt: Infinity };
    n.start = (t = 0, _off = 0, dur?: number) => {
      if (t < clock - 1e-3) pastStarts.push({ at: t, clock });
      live.add(rec);
      if (dur !== undefined) rec.stopAt = Math.min(rec.stopAt, t + dur);
    };
    n.stop = (t = 0) => { rec.stopAt = Math.min(rec.stopAt, t); };
  }
  if (kind === 'gain') gains.push(n);
  return n;
}

const ctx = {
  get currentTime() { return clock; },
  sampleRate: 8000, state: 'running', baseLatency: 0, outputLatency: 0,
  createBuffer: (_c: number, l: number) => ({ duration: l / 8000, getChannelData: () => new Float32Array(l) }),
  createGain: () => node('gain'), createOscillator: () => node('src'), createBufferSource: () => node('src'), createBiquadFilter: () => node('filter'),
  createDynamicsCompressor: () => node('comp'), createConvolver: () => node('verb'), createStereoPanner: () => node('pan'),
  decodeAudioData: () => Promise.reject(new Error('no samples in the soak')),
  resume: () => Promise.resolve(),
};

test('a long session of map changes, radio presses and stalls never schedules in the past, never wedges the director, and leaves only the decks it is playing', async () => {
  globalThis.fetch = (() => Promise.reject(new Error('offline'))) as typeof fetch;
  mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  try {
    const music = await import('../src/client/music.ts');
    const out = node('out');
    music.musicStart(ctx as unknown as AudioContext, out as unknown as AudioNode);
    const sum = gains[2]!; // createRig: volume, duck, sum (every deck's fade joins it)
    const maps = ['plaza', 'causeway', 'oldtown', 'quarry', 'museum', 'subpen', 'park', 'market'];
    const state = { phase: 'playing', s: { snaps: EMPTY_BUFFER, mapId: 'plaza' } };
    const errors: string[] = [];
    let worstDecks = 0, worstLive = 0, mapAt = 0, stations = 0;
    const frame = (dt: number) => {
      clock += dt;
      music.musicUpdate(state as never, clock * 1000, false);
      // A page's timer outlives a throw (the browser logs it and calls again), so count them and carry on.
      try { mock.timers.tick(dt * 1000); } catch (e) { errors.push(String(e)); }
      for (const r of live) if (r.stopAt < clock - 0.05) live.delete(r);
      worstDecks = Math.max(worstDecks, sum.inCount);
      worstLive = Math.max(worstLive, live.size);
    };
    const minutes = 12;
    for (let i = 0; clock < minutes * 60; i++) {
      frame(0.05);
      // A new map every 40 s; every third one arrives with a long frame (the map loads), sometimes just before the bar line.
      if (clock - mapAt > 40) {
        mapAt = clock;
        state.s.mapId = maps[(maps.indexOf(state.s.mapId) + 1) % maps.length]!;
        if (Math.floor(clock / 40) % 3 === 0) frame(0.6 + (Math.floor(clock) % 5) * 0.25);
      }
      // A burst of radio presses every 25 s, a tenth of a second apart, and sometimes a stall right after.
      if (i % 500 === 250) {
        for (let k = 0; k < 6; k++) { music.setPersonalStation(TRACK_IDS[stations++ % TRACK_IDS.length]!); frame(0.1); }
        if (i % 1500 === 250) frame(1.1);
        music.setPersonalStation(null);
      }
    }
    // A quiet minute for the fades and disposals to finish.
    for (let i = 0; i < 1200; i++) frame(0.05);
    assert.deepEqual(errors.slice(0, 3), [], `the scheduler threw ${errors.length} times`);
    assert.deepEqual(pastStarts.slice(0, 3), [], `${pastStarts.length} notes were scheduled to start in the past (they all sound at once)`);
    assert.ok(worstDecks <= 9, `at most a handful of decks at once (saw ${worstDecks})`);
    assert.ok(sum.inCount <= 2, `only the playing deck (and a fading one) are still connected after a quiet minute: ${sum.inCount}`);
    assert.ok(worstLive < 4000, `sources alive at once stay bounded: ${worstLive}`);
    assert.equal(music.getPlayingTrack(), music.getMapTrack(), 'and the director still follows the map');
    const probe = music.musicProbe();
    assert.ok(probe.lastBar && probe.lastBar.at > clock - 3, 'and is still handing bars to the synth');
  } finally {
    mock.timers.reset();
  }
});
