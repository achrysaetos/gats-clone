/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MAP_IDS } from '../src/shared/maps.ts';
import { ROTATION } from '../src/shared/maps.ts';
import { generateBar, IDLE_INPUT, LAYER_IDS, type Inst, type LayerId, type Mode } from '../src/client/musictheory.ts';
import { formSeconds, MAP_TRACK, TRACK_IDS, TRACKS, trackIdFor, type TrackId } from '../src/client/musictracks.ts';
import { EXTRA_INSTS } from '../src/client/musicvoices.ts';

const BUILT_IN: readonly Inst[] = ['kick', 'snare', 'hat', 'tom', 'bass', 'pad', 'glock', 'stab', 'lead', 'heart'];
const KNOWN = new Set<Inst>([...BUILT_IN, ...EXTRA_INSTS]);
const modesOf = (id: TrackId): Mode[] => (id === 'outpost' ? ['major', 'minor'] : ['major']);
const inputFor = (id: TrackId, mode: Mode) => ({ mode: id === 'outpost' ? ('zombies' as const) : ('arena' as const), night: mode === 'minor', day: id === 'outpost' && mode === 'major' });

test('every map has its own track, and the geometry test room and the menu fall back to the march', () => {
  for (const id of MAP_IDS) assert.ok(TRACKS[trackIdFor(id)], `${id} resolves`);
  assert.equal(new Set(MAP_IDS.map((id) => trackIdFor(id))).size, MAP_IDS.length, 'no two maps share a track');
  assert.deepEqual(new Set(Object.values(MAP_TRACK)), new Set(TRACK_IDS));
  assert.equal(trackIdFor('geo-test'), 'march');
  assert.equal(trackIdFor(undefined), 'march');
  assert.equal(trackIdFor('plaza'), 'march');
  assert.equal(trackIdFor('outpost'), 'outpost');
  for (const mode of ['FFA', 'TDM', 'DOM', 'BR', 'ZOM', 'RNG'] as const) for (const id of ROTATION[mode]) assert.ok(MAP_TRACK[id], `${mode}: ${id}`);
});

test('a seed always writes the same bars for every track, and other seeds write others', () => {
  for (const id of TRACK_IDS) for (const mode of modesOf(id)) {
    const t = TRACKS[id];
    const a = JSON.stringify(Array.from({ length: 40 }, (_, n) => t.bar(7, mode, n)));
    assert.equal(a, JSON.stringify(Array.from({ length: 40 }, (_, n) => t.bar(7, mode, n))), `${id} ${mode} is deterministic`);
    assert.notEqual(a, JSON.stringify(Array.from({ length: 40 }, (_, n) => t.bar(8, mode, n))), `${id} ${mode} varies with the seed`);
  }
  assert.deepEqual(generateBar(42, 'major', 5, 'oldtown'), generateBar(42, 'major', 5, 'oldtown'));
});

test('tempos sit in the game\'s pace and the keys are the tracks\' own', () => {
  for (const id of TRACK_IDS) for (const mode of modesOf(id)) {
    const bpm = TRACKS[id].bpm(inputFor(id, mode));
    assert.ok(bpm >= 96 && bpm <= 140, `${id} ${mode}: ${bpm} bpm`);
  }
  assert.equal(TRACKS.outpost.tonic(1), TRACKS.outpost.tonic(99), 'a written track keeps its key');
  assert.ok(TRACKS.outpost.bpm(inputFor('outpost', 'minor')) > TRACKS.outpost.bpm(inputFor('outpost', 'major')), 'the night quickens');
  const tonics = new Set(TRACK_IDS.filter((id) => id !== 'march').map((id) => `${TRACKS[id].tonic(1)}`));
  assert.ok(tonics.size >= 6, 'a spread of keys');
});

test('every bar of every track is playable: known voices, sane steps, velocities and note ranges, and a bounded note count', () => {
  for (const id of TRACK_IDS) for (const mode of modesOf(id)) {
    const t = TRACKS[id];
    const bars = id === 'march' ? 96 : t.formBars[mode] * 2;
    for (let n = 0; n < bars; n++) {
      const bar = t.bar(11, mode, n);
      assert.ok(bar.events.length > 0 && bar.events.length < 220, `${id} bar ${n}: ${bar.events.length} events`);
      for (const e of bar.events) {
        assert.ok(KNOWN.has(e.inst), `${id}: unknown voice ${e.inst}`);
        assert.ok(e.step >= 0 && e.step < 16 && e.dur > 0 && e.vel > 0 && e.vel <= 1.0001, `${id} bar ${n}: ${JSON.stringify(e)}`);
        assert.ok(Number.isFinite(e.midi) && e.midi >= 0 && e.midi <= 120, `${id}: midi ${e.midi}`);
        if (e.inst !== 'heart' && !['kick', 'snare', 'hat', 'ohat', 'brush', 'swirl', 'clap', 'shaker', 'rim', 'chug', 'sleigh', 'stomp', 'dust', 'wind', 'scrape', 'tom'].includes(e.inst)) assert.ok(e.midi >= 20, `${id}: ${e.inst} at midi ${e.midi}`);
      }
      assert.ok(bar.chord.tones.length >= 3);
    }
  }
});

test('each track writes every intensity layer, so calm, combat, hype and finale all work (and the night its heartbeat)', () => {
  for (const id of TRACK_IDS) for (const mode of modesOf(id)) {
    const t = TRACKS[id];
    const seen = new Set<LayerId>();
    for (let n = 0; n < (id === 'march' ? 64 : t.formBars[mode]); n++) for (const e of t.bar(3, mode, n).events) seen.add(e.layer);
    const want = id === 'outpost' && mode === 'major' ? (['calm', 'combat', 'hype'] as LayerId[]) : id === 'outpost' ? [...LAYER_IDS] : id === 'march' ? [...LAYER_IDS] : (['calm', 'combat', 'hype', 'finale'] as LayerId[]);
    for (const l of want) assert.ok(seen.has(l), `${id} ${mode} has ${l}`);
  }
});

test('the forms run two and a half minutes or more before they come round, and nothing repeats note for note inside two minutes', () => {
  for (const id of TRACK_IDS) {
    if (id === 'march' || id === 'oldtown' || id === 'quarry') continue; // the marches write each phrase from the seed; checked below
    for (const mode of modesOf(id)) {
      const t = TRACKS[id];
      const secs = formSeconds(t, mode);
      assert.ok(secs >= 150, `${id} ${mode}: the form is ${Math.round(secs)} s`);
      const nb = t.formBars[mode] * 2;
      const bar = 240 / t.bpm(inputFor(id, mode));
      const sig = Array.from({ length: nb }, (_, n) => {
        const b = t.bar(5, mode, n);
        const lead = b.events.filter((e) => e.layer === 'hype' || (id === 'outpost' && mode === 'major' && e.inst === 'harp'));
        return lead.length ? JSON.stringify([b.chord, lead.map((e) => [e.step, e.midi, e.inst])]) : null;
      });
      let worst = 0;
      for (let lag = 1; lag * bar < 120 && lag < nb; lag++) {
        let run = 0;
        for (let i = 0; i + lag < nb; i++) { if (sig[i] !== null && sig[i] === sig[i + lag]) worst = Math.max(worst, ++run); else run = 0; }
      }
      assert.ok(worst < 6, `${id} ${mode}: ${worst} sung bars repeat exactly inside two minutes`);
    }
  }
});

test('the march keeps its character and gains a bridge and a breakdown so its phrases are not all alike', () => {
  const lead = (n: number) => JSON.stringify(generateBar(9, 'major', n).events.filter((e) => e.layer === 'hype').map((e) => [e.step, e.midi]));
  const phrase = (p: number) => Array.from({ length: 8 }, (_, i) => lead(p * 8 + i)).join('|');
  assert.equal(new Set([0, 1, 2, 3, 4, 5, 6, 7].map(phrase)).size, 8, 'eight phrases, eight different tunes');
  const kicks = (n: number) => generateBar(9, 'major', n).events.filter((e) => e.layer === 'combat' && e.inst === 'kick').length;
  assert.ok(kicks(24) < kicks(0), 'the breakdown thins the drums');
  const stabs = (n: number) => generateBar(9, 'major', n).events.filter((e) => e.inst === 'stab').length;
  assert.equal(stabs(24), 0);
  assert.ok(stabs(28) > 0, 'and the build brings the brass back');
  assert.equal(generateBar(9, 'major', 0).tonic, generateBar(9, 'major', 100).tonic);
});

test('the yard marches do not come round: sixteen phrases, sixteen different tunes', () => {
  for (const style of ['plaza', 'oldtown', 'quarry'] as const) {
    const tunes = new Set(Array.from({ length: 16 }, (_, p) => Array.from({ length: 8 }, (_, i) => JSON.stringify(generateBar(21, 'major', p * 8 + i, style).events.filter((e) => e.layer === 'hype'))).join('|')));
    assert.equal(tunes.size, 16, style);
  }
});

test('the yard flavours differ: the old town fifes, the quarry clanks and goes minor', () => {
  const insts = (style: 'plaza' | 'oldtown' | 'quarry') => new Set(Array.from({ length: 16 }, (_, n) => generateBar(4, 'major', n, style)).flatMap((b) => b.events.map((e) => e.inst)));
  assert.ok(insts('oldtown').has('fife') && !insts('plaza').has('fife'));
  assert.ok(insts('quarry').has('clank') && insts('quarry').has('tbass'));
  assert.equal(generateBar(4, 'major', 0, 'quarry').mode, 'minor');
  assert.equal(generateBar(4, 'major', 0, 'oldtown').tonic, 5);
  assert.equal(IDLE_INPUT.phase, 'menu');
});

// ---- the director: crossfade on a map change, the radio, the night ----

import { pickTrack } from '../src/client/musictracks.ts';
import { createRig } from '../src/client/musicsynth.ts';
import { EMPTY_BUFFER } from '../src/client/interp.ts';
import { loadWaa } from '../scripts/render-reload-sfx.ts';

test('a radio station replaces the map\'s track, a Zombies night keeps its own score, and Off is silence', () => {
  assert.equal(pickTrack('museum', null, false), 'museum');
  assert.equal(pickTrack('museum', 'park', false), 'park');
  assert.equal(pickTrack('outpost', 'park', false), 'park');
  assert.equal(pickTrack('outpost', 'park', true), 'outpost', 'the night overrides the station');
  assert.equal(pickTrack('outpost', null, true), 'outpost');
  assert.equal(pickTrack('outpost', 'off', true), 'outpost', 'off is handled by the music gate, not the track choice');
  assert.equal(pickTrack('range', 'harbor', true), 'harbor', 'only the outpost has a night score');
});

test('a map change crossfades to the new map\'s track and the old track fades out; a station change does the same', async (t) => {
  const waa = loadWaa();
  if (!waa) { t.skip('node-web-audio-api is not installed'); return; }
  const real = new waa.OfflineAudioContext(2, 44100 * 5, 44100);
  let clock = 0;
  const ctx = new Proxy(real, { get: (target, prop) => (prop === 'currentTime' ? clock : typeof (target as never)[prop as never] === 'function' ? ((target as never)[prop as never] as () => unknown).bind(target) : (target as never)[prop as never]) });
  const music = await import('../src/client/music.ts');
  music.musicStart(ctx as unknown as AudioContext, real.destination);
  const state = { phase: 'playing', s: { snaps: EMPTY_BUFFER, mapId: 'plaza' } } as never;
  const step = (dt: number) => { clock += dt; music.musicUpdate(state, clock * 1000, false); music.musicTick(); };
  for (let i = 0; i < 20; i++) step(0.1);
  assert.equal(music.getPlayingTrack(), 'march');
  assert.equal(music.getCrossfade(), null);
  (state as { s: { mapId: string } }).s.mapId = 'causeway'; // the harbour
  let sawFade = false, steps = 0;
  while (music.getPlayingTrack() !== 'harbor' && steps++ < 400) step(0.1);
  assert.equal(music.getPlayingTrack(), 'harbor', 'the new map\'s track takes over at a bar line');
  assert.deepEqual(music.getCrossfade(), { from: 'march', to: 'harbor' });
  sawFade = true;
  for (let i = 0; i < 80 && music.getCrossfade(); i++) step(0.1);
  assert.equal(music.getCrossfade(), null, 'and the old track is gone once the fade is over');
  assert.ok(sawFade);
  // The radio: a station beats the map's track, null hands back.
  music.setRoomStation('wasteland');
  for (let i = 0; i < 400 && music.getPlayingTrack() !== 'wasteland'; i++) step(0.1);
  assert.equal(music.getPlayingTrack(), 'wasteland');
  music.setPersonalStation('summit');
  for (let i = 0; i < 400 && music.getPlayingTrack() !== 'summit'; i++) step(0.1);
  assert.equal(music.getPlayingTrack(), 'summit', 'your own radio wins over the room\'s');
  assert.equal(music.getStation(), 'summit');
  music.setPersonalStation(null);
  music.setRoomStation(null);
  for (let i = 0; i < 600 && music.getPlayingTrack() !== 'harbor'; i++) step(0.1);
  assert.equal(music.getPlayingTrack(), 'harbor', 'back to the map\'s track');
});

test('a bar of any track costs a bounded number of audio nodes', () => {
  let count = 0;
  const param = () => { const p: Record<string, unknown> = { value: 0 }; for (const m of ['setValueAtTime', 'linearRampToValueAtTime', 'exponentialRampToValueAtTime', 'setTargetAtTime', 'cancelScheduledValues', 'setValueCurveAtTime']) p[m] = () => p; return p; };
  const node = (): never => {
    count++;
    const n: Record<string, unknown> = { frequency: param(), gain: param(), detune: param(), Q: param(), threshold: param(), knee: param(), ratio: param(), attack: param(), release: param(), start() {}, stop() {}, disconnect() {} };
    n.connect = (x: unknown) => x;
    return n as never;
  };
  const ctx = { sampleRate: 44100, currentTime: 0, createBuffer: (_c: number, l: number) => ({ getChannelData: () => new Float32Array(l) }), createGain: node, createOscillator: node, createBiquadFilter: node, createBufferSource: node, createDynamicsCompressor: node, createConvolver: node } as unknown as BaseAudioContext;
  const rig = createRig(ctx, node());
  const deck = rig.newDeck(1);
  for (const id of TRACK_IDS) for (const mode of modesOf(id)) {
    let worst = 0;
    for (let n = 0; n < (id === 'march' ? 64 : TRACKS[id].formBars[mode]); n++) { count = 0; rig.playBar(TRACKS[id].bar(1, mode, n), 0, 0.5, 2, deck); worst = Math.max(worst, count); }
    assert.ok(worst <= 900, `${id} ${mode}: ${worst} nodes in its busiest bar with every layer on`);
  }
});

test('leaving for the menu leaves the radio behind', async () => {
  const music = await import('../src/client/music.ts');
  music.setRoomStation('harbor');
  music.setPersonalStation('park');
  music.musicUpdate({ phase: 'playing', s: { snaps: EMPTY_BUFFER, mapId: 'plaza' } } as never, 1000, false);
  assert.equal(music.getStation(), 'park');
  music.musicUpdate({ phase: 'menu', status: { kind: 'idle' } } as never, 2000, false);
  assert.equal(music.getStation(), null);
  assert.equal(music.getRoomStation(), null);
});

test('every track carries a loudness trim that keeps the library level (measured offline in Chrome; see scripts/render-music.ts)', () => {
  for (const id of TRACK_IDS) assert.ok(TRACKS[id].trim >= 0.6 && TRACKS[id].trim <= 2.2, `${id}: trim ${TRACKS[id].trim}`);
  assert.ok(TRACKS.march.trim <= 1, 'the march, the loudest, is never boosted');
});
