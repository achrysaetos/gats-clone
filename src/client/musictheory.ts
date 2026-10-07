/**
 * The pure half of the soundtrack: seeded bar generation, the state-to-layer mapping and the fade maths.
 * Nothing here touches WebAudio, so it is deterministic and unit tested; musicsynth.ts voices it and music.ts runs it.
 */

export type LayerId = 'calm' | 'combat' | 'hype' | 'finale' | 'heart';
export const LAYER_IDS: readonly LayerId[] = ['calm', 'combat', 'hype', 'finale', 'heart'];
export type Mode = 'major' | 'minor';
export type Inst = 'kick' | 'snare' | 'hat' | 'tom' | 'bass' | 'pad' | 'glock' | 'stab' | 'lead' | 'heart';

export const STEPS_PER_BAR = 16;
export const BARS_PER_PHRASE = 8;
export const MID_C = 60;

/** One note or hit. `step` is in 16ths from the bar's start, `dur` in 16ths, `midi` is ignored by the drums, `tier` thins the heartbeat. */
export type MusicEvent = { layer: LayerId; inst: Inst; step: number; dur: number; midi: number; vel: number; tier?: 0 | 1 | 2 };
export type Chord = { rootPc: number; tones: readonly number[] };
export type Bar = { barNo: number; mode: Mode; tonic: number; chord: Chord; degree: number; events: MusicEvent[] };

/** mulberry32: a tiny seeded generator, so one seed always writes the same march. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const hash = (...n: number[]): number => {
  let h = 2166136261;
  for (const v of n) { h ^= v | 0; h = Math.imul(h, 16777619); h ^= h >>> 13; }
  return h >>> 0;
};
const pick = <T,>(r: () => number, list: readonly T[]): T => list[Math.floor(r() * list.length) % list.length]!;
const chance = (r: () => number, p: number) => r() < p;

export const midiToHz = (m: number) => 440 * 2 ** ((m - 69) / 12);

/** Tonics by pitch class: bright keys for brass. */
export const KEYS = [0, 2, 5, 7, 10] as const;

const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11];
const MINOR_SCALE = [0, 2, 3, 5, 7, 8, 10];
const MAJ = [0, 4, 7], MIN = [0, 3, 7], DIM = [0, 3, 6];

type Deg = readonly [rootOffset: number, tones: readonly number[]];
const I: Deg = [0, MAJ], ii: Deg = [2, MIN], iii: Deg = [4, MIN], IV: Deg = [5, MAJ], V: Deg = [7, MAJ], vi: Deg = [9, MIN];
const i: Deg = [0, MIN], iv: Deg = [5, MIN], III: Deg = [3, MAJ], VI: Deg = [8, MAJ], VII: Deg = [10, MAJ], iidim: Deg = [2, DIM];

/** Four-bar loops; a phrase plays one twice and turns round on the dominant. */
export const PROGRESSIONS: Record<Mode, readonly (readonly Deg[])[]> = {
  major: [[I, V, vi, IV], [I, vi, IV, V], [I, IV, V, IV], [vi, IV, I, V], [I, iii, IV, V]],
  minor: [[i, VI, III, VII], [i, iv, VII, III], [i, VII, VI, V], [i, VI, iv, V], [i, iidim, V, i]],
};

export const keyOfSeed = (seed: number) => KEYS[hash(seed, 7) % KEYS.length]!;

/** The chord under `barNo`, the phrase's last bar turning to the dominant so each phrase leans back into the next. */
export function chordAt(seed: number, mode: Mode, barNo: number): { chord: Chord; degree: number } {
  const tonic = keyOfSeed(seed);
  const phrase = Math.floor(barNo / BARS_PER_PHRASE);
  const prog = PROGRESSIONS[mode][hash(seed, phrase, mode === 'major' ? 1 : 2) % PROGRESSIONS[mode].length]!;
  const inPhrase = barNo % BARS_PER_PHRASE;
  let deg = prog[inPhrase % 4]!;
  if (inPhrase === BARS_PER_PHRASE - 1) deg = V;
  return { chord: { rootPc: (tonic + deg[0]) % 12, tones: deg[1] }, degree: deg[0] };
}

const scaleOf = (mode: Mode) => (mode === 'major' ? MAJOR_SCALE : MINOR_SCALE);

/** Scale notes of the key between `lo` and `hi` (midi). */
function scaleNotes(tonic: number, mode: Mode, lo: number, hi: number): number[] {
  const out: number[] = [];
  for (let m = lo; m <= hi; m++) if (scaleOf(mode).includes((((m - tonic) % 12) + 12) % 12)) out.push(m);
  return out;
}
const chordNotes = (c: Chord, lo: number, hi: number): number[] => {
  const out: number[] = [];
  for (let m = lo; m <= hi; m++) if (c.tones.some((t) => (m - c.rootPc - t) % 12 === 0)) out.push(m);
  return out;
};

/** March rhythms for the lead: [step, duration] pairs inside one bar. */
const LEAD_RHYTHMS: readonly (readonly (readonly [number, number])[])[] = [
  [[0, 3], [3, 1], [4, 4], [8, 3], [11, 1], [12, 4]],
  [[0, 2], [2, 2], [4, 2], [6, 2], [8, 4], [12, 2], [14, 2]],
  [[0, 4], [4, 2], [6, 2], [8, 3], [11, 1], [12, 4]],
  [[0, 1], [1, 1], [2, 2], [4, 4], [8, 1], [9, 1], [10, 2], [12, 4]],
  [[0, 6], [6, 2], [8, 6], [14, 2]],
];

const LEAD_LO = 7, LEAD_HI = 26;

/** The four-bar lead motifs of a phrase; bars 4-7 answer 0-3 and the last bar closes on a chord tone. */
function leadFor(seed: number, mode: Mode, barNo: number, chord: Chord, tonic: number): MusicEvent[] {
  const phrase = Math.floor(barNo / BARS_PER_PHRASE);
  const inPhrase = barNo % BARS_PER_PHRASE;
  const answer = inPhrase >= 4;
  const r = rng(hash(seed, phrase, 31, mode === 'major' ? 1 : 2, answer && inPhrase !== 7 ? inPhrase - 4 : inPhrase));
  const lo = MID_C + tonic + LEAD_LO, hi = MID_C + tonic + LEAD_HI;
  const lows = scaleNotes(tonic, mode, lo, hi);
  const rhythm = pick(r, LEAD_RHYTHMS);
  const strong = chordNotes(chord, lo, hi);
  const events: MusicEvent[] = [];
  let cur = pick(r, strong);
  rhythm.forEach(([step, dur], idx) => {
    const onStrong = step % 8 === 0;
    const pool = onStrong ? strong : lows;
    // Stepwise motion, with the odd leap, tends to sound like a tune.
    const near = pool.filter((m) => Math.abs(m - cur) <= (chance(r, 0.25) ? 7 : 3));
    cur = pick(r, near.length ? near : pool);
    if (inPhrase === 7 && idx === rhythm.length - 1) cur = strong.reduce((best, m) => (Math.abs(m - (MID_C + tonic + 12)) < Math.abs(best - (MID_C + tonic + 12)) ? m : best), strong[0]!);
    events.push({ layer: 'hype', inst: 'lead', step, dur, midi: cur, vel: onStrong ? 1 : 0.8 });
  });
  return events;
}

/** The generated bar: the pure source of the whole soundtrack. Same (seed, mode, barNo) always returns the same bar. */
export function generateBar(seed: number, mode: Mode, barNo: number): Bar {
  const tonic = keyOfSeed(seed);
  const { chord, degree } = chordAt(seed, mode, barNo);
  const phrase = Math.floor(barNo / BARS_PER_PHRASE);
  const inPhrase = barNo % BARS_PER_PHRASE;
  const r = rng(hash(seed, barNo, mode === 'major' ? 3 : 4));
  const pr = rng(hash(seed, phrase, 99));
  const ev: MusicEvent[] = [];
  const add = (layer: LayerId, inst: Inst, step: number, dur: number, midi: number, vel: number, tier?: 0 | 1 | 2) => ev.push({ layer, inst, step, dur, midi, vel, tier });
  const root = 36 + chord.rootPc;
  const fifth = root + 7;
  const third = root + chord.tones[1]!;
  const fill = inPhrase === 7, miniFill = inPhrase === 3;
  const bassStyle = Math.floor(pr() * 3);
  const march = Math.floor(pr() * 3);

  // calm: pad, bouncy bass, brushed kick and hats, glockenspiel sparkles.
  for (const t of chord.tones) add('calm', 'pad', 0, 16, 60 + chord.rootPc + t - (chord.rootPc > 6 ? 12 : 0), 0.5);
  if (bassStyle === 0) { add('calm', 'bass', 0, 3, root, 1); add('calm', 'bass', 4, 2, fifth, 0.8); add('calm', 'bass', 8, 3, root, 0.95); add('calm', 'bass', 12, 2, third, 0.8); add('calm', 'bass', 14, 2, fifth, 0.75); }
  else if (bassStyle === 1) { for (let s = 0; s < 16; s += 4) { add('calm', 'bass', s, 2, root, s === 0 ? 1 : 0.8); add('calm', 'bass', s + 2, 2, s % 8 === 4 ? fifth : root + 12, 0.7); } }
  else { add('calm', 'bass', 0, 2, root, 1); add('calm', 'bass', 3, 1, root + 12, 0.7); add('calm', 'bass', 6, 2, fifth, 0.85); add('calm', 'bass', 8, 2, root, 0.95); add('calm', 'bass', 11, 1, root + 12, 0.7); add('calm', 'bass', 14, 2, fifth, 0.85); }
  add('calm', 'kick', 0, 1, 0, 0.55); add('calm', 'kick', 8, 1, 0, 0.45);
  for (let s = 2; s < 16; s += 4) add('calm', 'hat', s, 1, 0, 0.35);
  const spark = chordNotes(chord, MID_C + 12, MID_C + 31);
  const nSpark = 3 + Math.floor(r() * 3);
  const used = new Set<number>();
  for (let k = 0; k < nSpark; k++) {
    let s = Math.floor(r() * 16);
    if (used.has(s)) s = (s + 1) % 16;
    used.add(s);
    add('calm', 'glock', s, 2, pick(r, spark), 0.5 + r() * 0.3);
  }

  // combat: snare march, oom-pah brass stabs, driving kick.
  const snareMarch: readonly (readonly number[])[] = [[4, 12, 7, 15], [4, 12, 6, 7, 14, 15], [3, 4, 11, 12, 14]];
  add('combat', 'kick', 0, 1, 0, 0.8); add('combat', 'kick', 8, 1, 0, 0.75); add('combat', 'kick', 10, 1, 0, 0.55);
  add('combat', 'snare', 4, 1, 0, 0.9); add('combat', 'snare', 12, 1, 0, 0.95);
  for (const s of snareMarch[march]!) if (s !== 4 && s !== 12) add('combat', 'snare', s, 1, 0, 0.4);
  for (const s of [2, 6, 10, 14]) for (const t of chord.tones) add('combat', 'stab', s, 1, 55 + ((((chord.rootPc + t - 55) % 12) + 12) % 12), 0.45);
  if (miniFill) for (let s = 12; s < 16; s++) add('combat', 'snare', s, 1, 0, 0.5 + (s - 12) * 0.12);

  // hype: the brass lead, bell doubling, a snare roll into each phrase turn.
  for (const e of leadFor(seed, mode, barNo, chord, tonic)) { ev.push(e); if (e.dur >= 3) add('hype', 'glock', e.step, 2, e.midi + 12, 0.45); }
  if (fill) for (let s = 8; s < 16; s++) add('hype', 'snare', s, 1, 0, 0.35 + (s - 8) * 0.09);
  if (fill) add('hype', 'tom', 15, 1, 43, 0.9);
  if (inPhrase === 0) add('hype', 'tom', 0, 1, 50, 0.8);

  // finale: sixteenth hats, octave-pumping bass, the lead's harmony a third up, tom rolls.
  for (let s = 0; s < 16; s++) add('finale', 'hat', s, 1, 0, s % 4 === 0 ? 0.5 : 0.3);
  for (let s = 0; s < 16; s += 2) add('finale', 'bass', s, 1, root + (s % 4 === 2 ? 12 : 0), 0.7);
  for (const e of leadFor(seed, mode, barNo, chord, tonic)) add('finale', 'lead', e.step, e.dur, e.midi + (mode === 'major' ? 4 : 3), 0.55);
  add('finale', 'tom', 6, 1, 45, 0.6); add('finale', 'tom', 14, 1, 40, 0.65); if (fill) for (let s = 12; s < 16; s++) add('finale', 'tom', s, 1, 55 - (s - 12) * 4, 0.8);

  // heart: lub-dub on the beat, thickening with tiers (see heartTier).
  add('heart', 'heart', 0, 1, 0, 1, 0); add('heart', 'heart', 2, 1, 0, 0.7, 0);
  add('heart', 'heart', 8, 1, 0, 1, 0); add('heart', 'heart', 10, 1, 0, 0.7, 0);
  add('heart', 'heart', 4, 1, 0, 0.9, 1); add('heart', 'heart', 6, 1, 0, 0.6, 1);
  add('heart', 'heart', 12, 1, 0, 0.9, 1); add('heart', 'heart', 14, 1, 0, 0.6, 1);
  for (const s of [3, 7, 11, 15]) add('heart', 'heart', s, 1, 0, 0.5, 2);
  // A dark pedal under the night: the root, two octaves down.
  if (mode === 'minor') add('heart', 'bass', 0, 16, root - 12 + (root - 12 < 24 ? 12 : 0), 0.6, 0);

  return { barNo, mode, tonic, chord, degree, events: ev };
}

/** How many heartbeat tiers are voiced for a horde of 0..1. */
export const heartTier = (horde: number): 0 | 1 | 2 => (horde < 0.3 ? 0 : horde < 0.7 ? 1 : 2);

/** Beats per minute by mood: a light build theme by day, a steady march, a quickened night op. */
export function tempoFor(input: Pick<MusicInput, 'mode' | 'night' | 'day'>): number {
  if (input.night) return 126;
  if (input.day) return 120;
  return 132;
}

// ---------- state -> layers ----------

export type MusicInput = {
  phase: 'menu' | 'play' | 'dead';
  mode: 'arena' | 'zombies';
  day: boolean; night: boolean;
  /** 0..1 how big the horde is. */
  horde: number;
  /** 0..1 heat: enemies near, firing, damage dealt and taken (see `stepHeat`). */
  heat: number;
  streak: number;
  /** A multi-kill landed in the last few seconds. */
  multi: boolean;
  hunted: boolean;
  /** Last 60 s of a round, or a boss on the field. */
  finale: boolean;
};
export const IDLE_INPUT: MusicInput = { phase: 'menu', mode: 'arena', day: false, night: false, horde: 0, heat: 0, streak: 0, multi: false, hunted: false, finale: false };

export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const modeOf = (i: Pick<MusicInput, 'night'>): Mode => (i.night ? 'minor' : 'major');

/** Target level 0..1 of each layer. Layers stack: each louder tier adds to the one below instead of replacing it. */
export function layerTargets(i: MusicInput): Record<LayerId, number> {
  if (i.phase === 'menu') return { calm: 1, combat: 0, hype: 0, finale: 0, heart: 0 };
  if (i.phase === 'dead') return { calm: 0.45, combat: 0, hype: 0, finale: 0, heart: i.night ? 0.3 : 0 };
  // The day of a Zombies run is a light build theme: no snare, just the bouncy bass and bells.
  if (i.day) return { calm: 1, combat: 0, hype: 0, finale: 0, heart: 0 };
  const hot = i.streak >= 3 || i.multi || i.hunted;
  const combat = clamp01(i.heat * 1.4);
  return {
    calm: 1,
    combat: hot ? Math.max(combat, 0.8) : combat,
    hype: hot ? 1 : 0,
    finale: i.finale ? 1 : 0,
    heart: i.night ? 0.35 + 0.65 * clamp01(i.horde) : 0,
  };
}

/** Equal-power crossfade gains for a mix position x in 0..1: a is 1 at 0, b is 1 at 1, and a² + b² is always 1. */
export function crossfade(x: number): { a: number; b: number } {
  const c = clamp01(x);
  return { a: Math.cos(c * Math.PI / 2), b: Math.sin(c * Math.PI / 2) };
}
/** A level 0..1 as the gain that sounds like that fraction of loudness when stacked with others. */
export const levelGain = (level: number) => Math.sin(clamp01(level) * Math.PI / 2);

/** One step of exponential smoothing toward `target` over `dt` seconds with time constant `tau`. */
export const approach = (cur: number, target: number, dt: number, tau: number) => target + (cur - target) * Math.exp(-dt / tau);

/** Fade in over ~1.2 s, out over ~3 s, so a fight swells in fast and drains slowly. */
export const fadeTau = (cur: number, target: number) => (target > cur ? 0.5 : 1.3);

/** Combat heat: rises while you fire, hit or are hit or enemies crowd you, and drains over a few seconds. */
export function stepHeat(heat: number, dt: number, f: { near: number; firing: boolean; hurt: boolean; dealt: boolean }): number {
  const drive = Math.max(f.near * 0.7, f.firing ? 0.6 : 0, f.hurt ? 1 : 0, f.dealt ? 0.9 : 0);
  const next = drive > heat ? approach(heat, drive, dt, 0.4) : approach(heat, drive, dt, 5);
  return clamp01(next);
}

// ---------- beat clock maths ----------

export type BarClock = { t0: number; spb: number; barNo: number };
/** Where `t` falls within the scheduled bars (ascending by t0): the beat count since bar 0 and phase in the beat. Null before the first bar. */
export function beatAt(bars: readonly BarClock[], t: number): { beat: number; phase: number; bar: number; step: number; beatInBar: number } | null {
  let cur: BarClock | null = null;
  for (const b of bars) if (b.t0 <= t) cur = b;
  if (!cur) return null;
  const beats = Math.min((t - cur.t0) / cur.spb, 4 - 1e-9);
  const beatInBar = Math.floor(beats);
  return { beat: cur.barNo * 4 + beats, phase: beats - beatInBar, bar: cur.barNo, step: Math.floor(beats * 4), beatInBar };
}
