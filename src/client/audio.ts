import type { Point } from './camera.ts';
import { SOUNDS, type Layer, type SoundCue } from './sfx.ts';

const MAX_VOICES = 24;
const AUDIBLE_RADII = 1.2;
const MASTER_GAIN = 0.5;
const MAX_NOISE_OFFSET_S = 0.5;
const MUTE_KEY = 'skirmish.muted';

type Audio = {
  /** Browsers start an AudioContext suspended until a user gesture, so call this from one. */
  unlock(): void;
  play(cues: readonly SoundCue[], listener: Point, viewRadius: number): void;
  toggleMute(): boolean;
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
    }
    if (ctx.state === 'suspended') void ctx.resume();
  }

  function voice(c: AudioContext, layer: Layer, out: AudioNode, done: () => void) {
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

  function play(cues: readonly SoundCue[], listener: Point, viewRadius: number) {
    if (muted || !ctx || !master || ctx.state !== 'running') return;
    const audible = viewRadius * AUDIBLE_RADII;
    for (const cue of cues) {
      const recipe = SOUNDS[cue.id];
      if (voices + recipe.length > MAX_VOICES) continue;
      const dx = cue.x - listener.x;
      const falloff = cue.self ? 1 : Math.max(0, 1 - Math.hypot(dx, cue.y - listener.y) / audible) ** 2;
      if (falloff <= 0) continue;
      const gain = ctx.createGain();
      gain.gain.value = falloff * cue.gain;
      const pan = ctx.createStereoPanner();
      pan.pan.value = cue.self ? 0 : Math.max(-1, Math.min(1, dx / viewRadius)) * 0.8;
      gain.connect(pan).connect(master);
      let playing = recipe.length;
      for (const layer of recipe) voice(ctx, layer, gain, () => { if (--playing === 0) pan.disconnect(); });
    }
  }

  function toggleMute() {
    muted = !muted;
    saveMuted(muted);
    return muted;
  }

  return { unlock, play, toggleMute };
}
