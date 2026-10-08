/**
 * Sampled instruments for the scores: a few notes of each, cut from the Fluid R3 General MIDI soundfont (Frank Wen, MIT licence; see
 * public/music/LICENSE.txt), shipped as small mono MP3s in public/music/ (scripts/build-music-samples.ts writes them). A track's samples
 * load lazily when it starts; until they arrive (or if they never do) its synth voices play instead, so the music never waits on the network.
 * A note plays the nearest sampled pitch, re-pitched by at most a few semitones.
 */
import type { Inst } from './musictheory.ts';

export type SampleSpec = {
  /** The General MIDI instrument's name in the soundfont. */
  gm: string;
  /** The pitches sampled, midi. */
  notes: readonly number[];
  /** Seconds kept of each note. */
  len: number;
  /** 'hold' sustains for the note's length (winds, bows, reeds, organ); 'ring' lets a struck or plucked note decay, damped after the note. */
  play: 'hold' | 'ring';
  /** Release after the note (or the damping time of a ringing note), seconds. */
  rel: number;
  /** Mix level, to sit with the synth voices. */
  level: number;
  /** Attack, seconds (a soft fade-in for bowed and blown notes). */
  att?: number;
  /** A note slides up into its pitch from this many semitones under (the bottleneck guitar). */
  slide?: number;
};

const every = (lo: number, hi: number, step = 6) => Array.from({ length: Math.floor((hi - lo) / step) + 1 }, (_, i) => lo + i * step);

export const SAMPLES: Partial<Record<Inst, SampleSpec>> = {
  piano: { gm: 'acoustic_grand_piano', notes: every(36, 90), len: 2.4, play: 'ring', rel: 0.25, level: 0.5 },
  honky: { gm: 'honkytonk_piano', notes: every(40, 76), len: 1.6, play: 'ring', rel: 0.15, level: 0.45 },
  epiano: { gm: 'electric_piano_1', notes: every(45, 87), len: 2.2, play: 'ring', rel: 0.3, level: 0.5 },
  tpt: { gm: 'trumpet', notes: every(54, 90), len: 2.2, play: 'hold', rel: 0.1, level: 0.42, att: 0.01 },
  trumpet: { gm: 'muted_trumpet', notes: every(60, 90), len: 2.2, play: 'hold', rel: 0.1, level: 0.42, att: 0.01 },
  horn: { gm: 'french_horn', notes: every(48, 90), len: 2.4, play: 'hold', rel: 0.15, level: 0.45, att: 0.02 },
  bone: { gm: 'trombone', notes: every(40, 70), len: 2.2, play: 'hold', rel: 0.1, level: 0.42, att: 0.01 },
  tuba: { gm: 'tuba', notes: every(28, 58), len: 1.6, play: 'hold', rel: 0.08, level: 0.55 },
  timp: { gm: 'timpani', notes: [38, 43, 48, 53], len: 2, play: 'ring', rel: 0.6, level: 0.7 },
  bell: { gm: 'tubular_bells', notes: every(60, 78), len: 3, play: 'ring', rel: 2, level: 0.4 },
  glock: { gm: 'glockenspiel', notes: every(70, 106), len: 1.4, play: 'ring', rel: 0.8, level: 0.35 },
  vibes: { gm: 'vibraphone', notes: every(54, 96), len: 2.2, play: 'ring', rel: 1, level: 0.42 },
  marimba: { gm: 'marimba', notes: every(48, 90), len: 1, play: 'ring', rel: 0.4, level: 0.5 },
  harp: { gm: 'orchestral_harp', notes: every(42, 90), len: 1.8, play: 'ring', rel: 0.8, level: 0.5 },
  upright: { gm: 'acoustic_bass', notes: every(28, 53, 5), len: 1.4, play: 'ring', rel: 0.12, level: 0.75 },
  fbass: { gm: 'electric_bass_finger', notes: every(28, 58, 5), len: 1.4, play: 'ring', rel: 0.1, level: 0.7 },
  pbass: { gm: 'electric_bass_pick', notes: every(28, 53, 5), len: 1.2, play: 'ring', rel: 0.08, level: 0.7 },
  slap: { gm: 'slap_bass_1', notes: every(28, 63, 5), len: 1, play: 'ring', rel: 0.08, level: 0.65 },
  uke: { gm: 'acoustic_guitar_nylon', notes: every(52, 88), len: 1.4, play: 'ring', rel: 0.2, level: 0.5 },
  steel: { gm: 'acoustic_guitar_steel', notes: every(40, 82), len: 2, play: 'ring', rel: 0.25, level: 0.5, slide: 2 },
  twang: { gm: 'electric_guitar_clean', notes: every(34, 88), len: 2, play: 'ring', rel: 0.3, level: 0.5 },
  dist: { gm: 'distortion_guitar', notes: every(28, 64, 5), len: 1.6, play: 'hold', rel: 0.06, level: 0.33 },
  od: { gm: 'overdriven_guitar', notes: every(52, 88), len: 2.2, play: 'hold', rel: 0.12, level: 0.33 },
  organ: { gm: 'rock_organ', notes: every(48, 90), len: 2, play: 'hold', rel: 0.06, level: 0.3 },
  accordion: { gm: 'accordion', notes: every(48, 90), len: 2.2, play: 'hold', rel: 0.08, level: 0.38, att: 0.02 },
  bandoneon: { gm: 'tango_accordion', notes: every(48, 84), len: 2.2, play: 'hold', rel: 0.06, level: 0.4, att: 0.01 },
  violin: { gm: 'violin', notes: every(55, 97), len: 2.4, play: 'hold', rel: 0.15, level: 0.42, att: 0.04 },
  fiddle: { gm: 'fiddle', notes: every(57, 87), len: 2, play: 'hold', rel: 0.1, level: 0.42, att: 0.02 },
  harmonica: { gm: 'harmonica', notes: every(57, 87), len: 2, play: 'hold', rel: 0.08, level: 0.38, att: 0.02 },
  whistle: { gm: 'whistle', notes: every(66, 96), len: 2.4, play: 'hold', rel: 0.12, level: 0.42, att: 0.03 },
  flute: { gm: 'flute', notes: every(60, 96), len: 2.2, play: 'hold', rel: 0.12, level: 0.42, att: 0.03 },
  sax: { gm: 'alto_sax', notes: every(50, 86), len: 2.2, play: 'hold', rel: 0.1, level: 0.42, att: 0.01 },
  synbrass: { gm: 'synth_brass_1', notes: every(48, 90), len: 1.4, play: 'hold', rel: 0.08, level: 0.32 },
  choir: { gm: 'choir_aahs', notes: every(48, 78), len: 3, play: 'hold', rel: 0.5, level: 0.3, att: 0.25 },
};

/** Where a sample is published, under public/. */
export const sampleFile = (inst: Inst, midi: number) => `music/${inst}-${midi}.mp3`;

type Loaded = { notes: number[]; buf: Map<number, { buffer: AudioBuffer; start: number }> };
export type Voice = (t: number, midi: number, dur: number, v: number, dest: AudioNode) => void;
export type SampleBank = {
  /** Starts loading these instruments' notes (each once); resolves when they are in, or have failed. */
  load(insts: Iterable<Inst>): Promise<void>;
  /** The sampled voice for an instrument, or null until every one of its notes has loaded. */
  voice(inst: Inst): Voice | null;
  loaded(): Inst[];
};

/** Where the sound starts in a decoded note: past any encoder delay or silence, so samples land on the beat. */
function onsetOf(b: AudioBuffer): number {
  const d = b.getChannelData(0);
  let peak = 0;
  for (let i = 0; i < Math.min(d.length, b.sampleRate); i++) peak = Math.max(peak, Math.abs(d[i]!));
  const gate = peak * 0.05;
  for (let i = 0; i < d.length; i++) if (Math.abs(d[i]!) > gate) return Math.max(0, i / b.sampleRate - 0.002);
  return 0;
}

/** A bank of sampled voices on `ctx`; `fetchBytes` reads a file published under public/ (fetch in the page, the disk in a render). */
export function createSampleBank(ctx: BaseAudioContext, fetchBytes: (path: string) => Promise<ArrayBuffer>): SampleBank {
  const ready = new Map<Inst, Loaded>();
  const pending = new Map<Inst, Promise<void>>();
  const voices = new Map<Inst, Voice>();

  async function loadOne(inst: Inst, spec: SampleSpec) {
    const buf = new Map<number, { buffer: AudioBuffer; start: number }>();
    await Promise.all(spec.notes.map(async (n) => {
      const bytes = await fetchBytes(sampleFile(inst, n));
      const buffer = await ctx.decodeAudioData(bytes);
      buf.set(n, { buffer, start: onsetOf(buffer) });
    }));
    ready.set(inst, { notes: [...spec.notes], buf });
  }

  function makeVoice(inst: Inst, spec: SampleSpec, s: Loaded): Voice {
    return (t, midi, dur, v, dest) => {
      let near = s.notes[0]!;
      for (const n of s.notes) if (Math.abs(n - midi) < Math.abs(near - midi)) near = n;
      const { buffer, start } = s.buf.get(near)!;
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const rate = 2 ** ((midi - near) / 12);
      if (spec.slide) {
        src.playbackRate.setValueAtTime(rate * 2 ** (-spec.slide / 12), t);
        src.playbackRate.exponentialRampToValueAtTime(rate, t + 0.09);
      } else src.playbackRate.value = rate;
      const g = ctx.createGain();
      const peak = spec.level * v;
      const att = spec.att ?? 0.003;
      const avail = (buffer.duration - start) / rate;
      const hold = Math.max(0.02, Math.min(dur, avail - spec.rel - att));
      const end = spec.play === 'hold' ? t + att + hold : t + Math.min(avail - 0.02, dur + 0.05);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(peak, t + att);
      g.gain.setValueAtTime(peak, Math.max(t + att, end));
      g.gain.setTargetAtTime(0.0001, Math.max(t + att, end), spec.rel / 3);
      src.connect(g).connect(dest);
      src.start(t, start);
      src.stop(Math.max(t + att, end) + spec.rel * 1.5 + 0.02);
    };
  }

  return {
    load(insts) {
      const jobs: Promise<void>[] = [];
      for (const inst of insts) {
        const spec = SAMPLES[inst];
        if (!spec) continue;
        let p = pending.get(inst);
        // A failed load (a network blip) is forgotten, so the next track that asks for the instrument fetches it again; meanwhile the synth voice stays.
        if (!p) { p = loadOne(inst, spec).catch(() => { pending.delete(inst); }); pending.set(inst, p); }
        jobs.push(p);
      }
      return Promise.all(jobs).then(() => undefined);
    },
    voice(inst) {
      const hit = voices.get(inst);
      if (hit) return hit;
      const s = ready.get(inst), spec = SAMPLES[inst];
      if (!s || !spec) return null;
      const v = makeVoice(inst, spec, s);
      voices.set(inst, v);
      return v;
    },
    loaded: () => [...ready.keys()],
  };
}
