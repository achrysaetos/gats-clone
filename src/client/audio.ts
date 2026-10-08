import type { Point } from './camera.ts';
import { createSampleLoader, COMMON_SAMPLES } from './samples.ts';
import { placeCue, voiceFor, type Layer, type SampleId, type SampleLayer, type SoundCue, type SoundId } from './sfx.ts';

const MAX_VOICES = 24;
const MASTER_GAIN = 0.5;
const MAX_NOISE_OFFSET_S = 0.5;
const MUTE_KEY = 'skirmish.muted';
const SAMPLE_MANIFEST = '/assets/sfx/manifest.json';

export type AudioStats = { decoded: SampleId[]; fetched: number; plays: Partial<Record<SoundId, { sample: number; synth: number }>> };

type Audio = {
  /** Browsers start an AudioContext suspended until a user gesture, so call this from one. */
  unlock(): void;
  play(cues: readonly SoundCue[], listener: Point, viewRadius: number): void;
  toggleMute(): boolean;
  stats(): AudioStats;
};

function loadMuted(): boolean {
  try { return localStorage.getItem(MUTE_KEY) === '1'; } catch { return false; }
}

function saveMuted(muted: boolean) {
  try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch { /* private mode: mute lasts this tab only */ }
}

export function createAudio(): Audio {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let noise: AudioBuffer | null = null;
  let voices = 0;
  let muted = loadMuted();
  let samples: ReturnType<typeof createSampleLoader<AudioBuffer>> | null = null;
  const plays: AudioStats['plays'] = {};

  function loadSamples(c: AudioContext) {
    const base = new URL(SAMPLE_MANIFEST, location.href);
    const get = (url: URL) => fetch(url).then((r) => (r.ok ? r : null));
    samples = createSampleLoader({
      manifest: () => get(base).then((r) => r?.json() ?? null),
      bytes: (file) => get(new URL(file, base)).then((r) => r?.arrayBuffer() ?? null),
      decode: (bytes) => c.decodeAudioData(bytes),
    });
    if (!muted) samples.want(COMMON_SAMPLES);
  }

  function unlock() {
    if (!ctx) {
      ctx = new AudioContext();
      const limiter = ctx.createDynamicsCompressor();
      limiter.connect(ctx.destination);
      master = ctx.createGain();
      master.gain.value = MASTER_GAIN;
      master.connect(limiter);
      noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      loadSamples(ctx);
    }
    if (ctx.state === 'suspended') void ctx.resume();
  }

  function synthVoice(c: AudioContext, layer: Layer, out: AudioNode, done: () => void) {
    const t0 = c.currentTime + (layer.delayMs ?? 0) / 1000;
    const t1 = t0 + layer.ms / 1000;
    const env = c.createGain();
    env.gain.setValueAtTime(layer.gain, t0);
    env.gain.exponentialRampToValueAtTime(0.0001, t1);
    env.connect(out);
    let src: AudioScheduledSourceNode;
    if (layer.src === 'tone') {
      const osc = c.createOscillator();
      osc.type = layer.wave;
      osc.frequency.setValueAtTime(layer.pitchHz[0], t0);
      osc.frequency.exponentialRampToValueAtTime(layer.pitchHz[1], t1);
      osc.connect(env);
      osc.start(t0);
      src = osc;
    } else {
      const buf = c.createBufferSource();
      buf.buffer = noise;
      const filter = c.createBiquadFilter();
      filter.type = layer.filter;
      filter.Q.value = layer.q;
      filter.frequency.setValueAtTime(layer.cutoffHz[0], t0);
      filter.frequency.exponentialRampToValueAtTime(layer.cutoffHz[1], t1);
      buf.connect(filter).connect(env);
      buf.start(t0, Math.random() * MAX_NOISE_OFFSET_S);
      src = buf;
    }
    voices++;
    src.onended = () => { voices--; env.disconnect(); done(); };
    src.stop(t1);
  }

  function sampleVoice(c: AudioContext, layer: SampleLayer, out: AudioNode, done: () => void) {
    const src = c.createBufferSource();
    src.buffer = samples?.buffer(layer.sample) ?? null;
    src.playbackRate.value = layer.rate;
    const level = c.createGain();
    level.gain.value = layer.gain;
    src.connect(level).connect(out);
    voices++;
    src.onended = () => { voices--; level.disconnect(); done(); };
    src.start();
  }

  function play(cues: readonly SoundCue[], listener: Point, viewRadius: number) {
    if (muted || !ctx || !master || ctx.state !== 'running') return;
    const missing: SampleId[] = [];
    const decoded = (id: SampleId) => (samples?.buffer(id) ? true : (missing.push(id), false));
    for (const cue of cues) {
      const voice = voiceFor(cue.id, decoded, Math.random);
      const count = voice.kind === 'sample' ? voice.layers.length : voice.recipe.length;
      if (voices + count > MAX_VOICES) continue;
      const placed = placeCue(cue, listener, viewRadius);
      if (!placed) continue;
      const tally = (plays[cue.id] ??= { sample: 0, synth: 0 });
      tally[voice.kind]++;
      const gain = ctx.createGain();
      gain.gain.value = placed.gain;
      const pan = ctx.createStereoPanner();
      pan.pan.value = placed.pan;
      gain.connect(pan).connect(master);
      let playing = count;
      const done = () => { if (--playing === 0) pan.disconnect(); };
      if (voice.kind === 'sample') for (const layer of voice.layers) sampleVoice(ctx, layer, gain, done);
      else for (const layer of voice.recipe) synthVoice(ctx, layer, gain, done);
    }
    if (missing.length) samples?.want(missing);
  }

  function toggleMute() {
    muted = !muted;
    saveMuted(muted);
    if (!muted) samples?.want(COMMON_SAMPLES);
    return muted;
  }

  const stats = (): AudioStats => ({ decoded: samples?.decoded() ?? [], fetched: samples?.fetched() ?? 0, plays: structuredClone(plays) });

  return { unlock, play, toggleMute, stats };
}
