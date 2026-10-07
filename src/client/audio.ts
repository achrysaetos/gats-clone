import type { Point } from './camera.ts';
import { SOUNDS, minGapMs, priorityOf, varianceOf, type Layer, type SoundCue } from './sfx.ts';

/** Voices (oscillators and noise sources) alive at once. Ambience is dropped past the soft cap, feedback only past the hard one. */
export const VOICE_CAPS = { soft: 28, normal: 44, hard: 72 } as const;
const AUDIBLE_RADII = 1.2;
const MASTER_GAIN = 0.8;
const NOISE_SECONDS = 2;
const MUTE_KEY = 'skirmish.muted';
const VOLUME_KEY = 'skirmish.volume';
const ATTACK_S = 0.0015;
/** A far-off sound is dulled as well as quieted: its low-pass cutoff falls from open to this. */
const FAR_CUTOFF_HZ = 1400;
const MUFFLE_HZ = 1100;
const SWEEP_STEPS = 12;
/** A cue's attack may take up to this much of its length (a reverse swell is nearly all attack). */
const MAX_ATTACK = 0.92;

type Audio = {
  /** Browsers start an AudioContext suspended until a user gesture, so call this from one. */
  unlock(): void;
  play(cues: readonly SoundCue[], listener: Point, viewRadius: number): void;
  toggleMute(): boolean;
  /** The shared context and master bus, for the soundtrack to join once unlocked. */
  bus(): { ctx: AudioContext; out: AudioNode } | null;
  /** Dulls the whole mix, music included, as through a wall: the killcam. */
  muffle(on: boolean): void;
};

export type Engine = {
  play(cues: readonly SoundCue[], listener: Point, viewRadius: number): void;
  voices(): number;
};

function loadMuted(): boolean {
  try { return localStorage.getItem(MUTE_KEY) === '1'; } catch { return false; }
}

/** An optional 0..1 master volume kept in localStorage (`skirmish.volume`); absent means full. */
function loadVolume(): number {
  try {
    const v = Number(localStorage.getItem(VOLUME_KEY));
    return localStorage.getItem(VOLUME_KEY) !== null && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 1;
  } catch { return 1; }
}

function saveMuted(muted: boolean) {
  try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch { /* private mode: mute lasts this tab only */ }
}

/**
 * Master bus: a gentle glue compressor so layered sounds swell together instead of summing, then a fast brick-wall
 * limiter so a burst of overlapping shots can never clip the output.
 */
export function createBus(ctx: BaseAudioContext, destination: AudioNode, volume = 1): GainNode {
  const master = ctx.createGain();
  master.gain.value = MASTER_GAIN * volume;
  const glue = ctx.createDynamicsCompressor();
  glue.threshold.value = -16; glue.knee.value = 10; glue.ratio.value = 4; glue.attack.value = 0.003; glue.release.value = 0.15;
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -4; limiter.knee.value = 0; limiter.ratio.value = 20; limiter.attack.value = 0.001; limiter.release.value = 0.06;
  const trim = ctx.createGain();
  trim.gain.value = 0.9;
  const muffle = ctx.createBiquadFilter();
  muffle.type = 'lowpass'; muffle.frequency.value = OPEN_HZ; muffle.Q.value = 0.5;
  muffles.set(master, muffle);
  master.connect(muffle).connect(glue).connect(limiter).connect(trim).connect(destination);
  return master;
}

const OPEN_HZ = 20000;
const muffles = new WeakMap<AudioNode, BiquadFilterNode>();

/** Eases the bus's low-pass shut (a muffled mix) or open again. */
export function setMuffle(ctx: BaseAudioContext, master: AudioNode, on: boolean) {
  muffles.get(master)?.frequency.setTargetAtTime(on ? MUFFLE_HZ : OPEN_HZ, ctx.currentTime, 0.08);
}

export function createNoise(ctx: BaseAudioContext): AudioBuffer {
  const noise = ctx.createBuffer(1, ctx.sampleRate * NOISE_SECONDS, ctx.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return noise;
}

/** Plays cues into `master`. Split from the page's mute/unlock handling so an offline context can render the same sounds. */
export function createEngine(ctx: BaseAudioContext, master: AudioNode, noise: AudioBuffer, isReady: () => boolean = () => true): Engine {
  let voices = 0;
  const lastPlayed = new Map<string, number>();

  function voice(layer: Layer, out: AudioNode, pitchK: number, startS: number, done: () => void) {
    const t0 = startS + (layer.delayMs ?? 0) / 1000;
    const t1 = t0 + layer.ms / 1000;
    const env = ctx.createGain();
    const attack = Math.min((layer.attackMs ?? ATTACK_S * 1000) / 1000, (t1 - t0) * (layer.attackMs && layer.attackMs > layer.ms / 2 ? MAX_ATTACK : 0.5));
    // Silent until t0: a gain node starts at 1, so a delayed layer would otherwise let a few samples of full-scale click through before its first automation event lands.
    env.gain.value = 0.0001;
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.linearRampToValueAtTime(layer.gain, t0 + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, t1);
    env.connect(out);
    let src: AudioScheduledSourceNode;
    if (layer.src === 'tone') {
      const osc = ctx.createOscillator();
      osc.type = layer.wave;
      osc.frequency.setValueAtTime(layer.pitchHz[0] * pitchK, t0);
      osc.frequency.exponentialRampToValueAtTime(layer.pitchHz[1] * pitchK, t1);
      osc.connect(env);
      osc.start(t0);
      src = osc;
    } else {
      const buf = ctx.createBufferSource();
      buf.buffer = noise;
      buf.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = layer.filter;
      filter.Q.value = layer.q;
      filter.frequency.setValueAtTime(layer.cutoffHz[0] * pitchK, t0);
      filter.frequency.exponentialRampToValueAtTime(layer.cutoffHz[1] * pitchK, t1);
      buf.connect(filter).connect(env);
      buf.start(t0, Math.random() * (NOISE_SECONDS / 2));
      src = buf;
    }
    voices++;
    src.onended = () => { voices--; env.disconnect(); done(); };
    src.stop(t1);
  }

  function play(cues: readonly SoundCue[], listener: Point, viewRadius: number) {
    if (!isReady()) return;
    const audible = viewRadius * AUDIBLE_RADII;
    const now = ctx.currentTime * 1000;
    for (const cue of cues) {
      const recipe = SOUNDS[cue.id];
      const rank = priorityOf(cue);
      const cap = rank === 2 ? VOICE_CAPS.hard : rank === 1 ? VOICE_CAPS.normal : VOICE_CAPS.soft;
      if (voices + recipe.length > cap) continue;
      const startS = ctx.currentTime + (cue.delayMs ?? 0) / 1000;
      // Where the cue is heard from at fraction k of its sweep (a still cue has one place): loudness, dullness and stereo position.
      const hear = (k: number) => {
        const sw = cue.sweep;
        const x = sw ? cue.x + (sw.x - cue.x) * k : cue.x, y = sw ? cue.y + (sw.y - cue.y) * k : cue.y;
        const dx = x - listener.x;
        const near = cue.self || cue.pan !== undefined;
        const dist = near ? 0 : Math.hypot(dx, y - listener.y) / audible;
        return {
          dist,
          falloff: near ? 1 : Math.max(0, 1 - dist) ** 2,
          pan: cue.pan !== undefined ? Math.max(-1, Math.min(1, cue.pan)) * 0.8 : cue.self ? 0 : Math.max(-1, Math.min(1, dx / viewRadius)) * 0.8,
          dull: 16000 * (FAR_CUTOFF_HZ / 16000) ** Math.min(1, dist),
        };
      };
      const steps = cue.sweep ? SWEEP_STEPS : 0;
      const spots = Array.from({ length: steps + 1 }, (_, i) => hear(steps ? i / steps : 0));
      if (spots.every((h) => h.falloff <= 0)) continue;
      if (!cue.self) {
        const gap = minGapMs(cue.id);
        if (gap && now - (lastPlayed.get(cue.id) ?? -1e9) < gap) continue;
        lastPlayed.set(cue.id, now);
      }
      const vary = varianceOf(cue.id);
      const pitchK = 1 + (Math.random() * 2 - 1) * vary.pitch;
      const level = cue.gain * (1 + (Math.random() * 2 - 1) * vary.gain);
      const gain = ctx.createGain();
      const pan = ctx.createStereoPanner();
      const first = spots[0]!;
      gain.gain.value = first.falloff * level;
      pan.pan.value = first.pan;
      let tail: AudioNode = gain;
      if (cue.sweep || (!cue.self && cue.pan === undefined && first.dist > 0.15)) {
        const dull = ctx.createBiquadFilter();
        dull.type = 'lowpass';
        dull.frequency.value = first.dull;
        gain.connect(dull);
        tail = dull;
        if (cue.sweep) dull.frequency.setValueAtTime(first.dull, startS);
        if (cue.sweep) spots.forEach((h, i) => { if (i) dull.frequency.linearRampToValueAtTime(h.dull, startS + (i / steps) * (cue.sweep!.ms / 1000)); });
      }
      if (cue.sweep) {
        gain.gain.setValueAtTime(first.falloff * level, startS);
        pan.pan.setValueAtTime(first.pan, startS);
        spots.forEach((h, i) => {
          if (!i) return;
          const t = startS + (i / steps) * (cue.sweep!.ms / 1000);
          gain.gain.linearRampToValueAtTime(h.falloff * level, t);
          pan.pan.linearRampToValueAtTime(h.pan, t);
        });
      }
      tail.connect(pan).connect(master);
      const layers = recipe.filter((l) => cue.self || !l.selfOnly);
      let playing = layers.length;
      for (const layer of layers) voice(layer, gain, pitchK, startS, () => { if (--playing === 0) { pan.disconnect(); gain.disconnect(); } });
    }
  }

  return { play, voices: () => voices };
}

export function createAudio(): Audio {
  let ctx: AudioContext | null = null;
  let engine: Engine | null = null;
  let out: AudioNode | null = null;
  let muted = loadMuted();

  function unlock() {
    if (!ctx) {
      ctx = new AudioContext();
      const c = ctx;
      out = createBus(c, c.destination, loadVolume());
      engine = createEngine(c, out, createNoise(c), () => c.state === 'running');
    }
    if (ctx.state === 'suspended') void ctx.resume();
  }

  function play(cues: readonly SoundCue[], listener: Point, viewRadius: number) {
    if (muted || !engine) return;
    engine.play(cues, listener, viewRadius);
  }

  function toggleMute() {
    muted = !muted;
    saveMuted(muted);
    return muted;
  }

  return { unlock, play, toggleMute, bus: () => (ctx && out ? { ctx, out } : null), muffle: (on) => { if (ctx && out) setMuffle(ctx, out, on); } };
}
