import type { Point } from './camera.ts';
import { placeCue, SAMPLE_IDS, voiceFor, type Layer, type SampleId, type SampleLayer, type SoundCue, type SoundId } from './sfx.ts';

const MAX_VOICES = 24;
const MASTER_GAIN = 0.5;
const MAX_NOISE_OFFSET_S = 0.5;
const MUTE_KEY = 'skirmish.muted';
const SAMPLE_MANIFEST = '/assets/sfx/manifest.json';

export type AudioStats = { decoded: SampleId[]; plays: Partial<Record<SoundId, { sample: number; synth: number }>> };

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

const isSampleId = (k: string): k is SampleId => (SAMPLE_IDS as readonly string[]).includes(k);

/** Downloads every shipped recording. A missing manifest or file leaves that cue on its synth recipe. */
async function fetchSamples(): Promise<Map<SampleId, ArrayBuffer>> {
  const out = new Map<SampleId, ArrayBuffer>();
  const res = await fetch(SAMPLE_MANIFEST).catch(() => null);
  const files: unknown = res?.ok ? await res.json().catch(() => null) : null;
  if (typeof files !== 'object' || files === null) return out;
  const base = new URL(SAMPLE_MANIFEST, location.href);
  await Promise.all(Object.entries(files).map(async ([id, file]) => {
    if (!isSampleId(id) || typeof file !== 'string') return;
    const got = await fetch(new URL(file, base)).catch(() => null);
    if (got?.ok) out.set(id, await got.arrayBuffer());
  }));
  return out;
}

export function createAudio(): Audio {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let noise: AudioBuffer | null = null;
  let voices = 0;
  let muted = loadMuted();
  const encoded = fetchSamples();
  const buffers = new Map<SampleId, AudioBuffer>();
  const plays: AudioStats['plays'] = {};

  function decodeAll(c: AudioContext) {
    void encoded.then((files) => {
      for (const [id, bytes] of files) {
        c.decodeAudioData(bytes).then((buf) => { buffers.set(id, buf); }, () => { /* undecodable: the synth recipe stays */ });
      }
    });
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
      decodeAll(ctx);
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
    src.buffer = buffers.get(layer.sample) ?? null;
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
    for (const cue of cues) {
      const voice = voiceFor(cue.id, (id) => buffers.has(id), Math.random);
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
  }

  function toggleMute() {
    muted = !muted;
    saveMuted(muted);
    return muted;
  }

  const stats = (): AudioStats => ({ decoded: [...buffers.keys()], plays: structuredClone(plays) });

  return { unlock, play, toggleMute, stats };
}
