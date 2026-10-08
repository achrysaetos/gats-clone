/**
 * The pure half of the soundtrack: seeded bar generation, the state-to-layer mapping and the fade maths.
 * Nothing here touches WebAudio, so it is deterministic and unit tested; musicsynth.ts voices it and music.ts runs it.
 */

export type LayerId = 'calm' | 'combat' | 'hype' | 'finale' | 'heart';
export const LAYER_IDS: readonly LayerId[] = ['calm', 'combat', 'hype', 'finale', 'heart'];
export type Mode = 'major' | 'minor';
export type Inst =
  | 'kick' | 'snare' | 'hat' | 'tom' | 'bass' | 'pad' | 'glock' | 'stab' | 'lead' | 'heart'
  // Voices added for the per-map scores (musicvoices.ts).
  | 'fife' | 'harp' | 'accordion' | 'foghorn' | 'gull' | 'koto' | 'chime' | 'epiano' | 'vibes' | 'trumpet' | 'upright' | 'sonar' | 'tbass' | 'acid'
  | 'metal' | 'whistle' | 'uke' | 'marimba' | 'harmonica' | 'rbell' | 'yodel' | 'twang' | 'bgtr' | 'tuba' | 'fbass' | 'padair' | 'dread' | 'clank'
  | 'brush' | 'swirl' | 'clap' | 'bongo' | 'sleigh' | 'shaker' | 'rim' | 'chug' | 'ohat' | 'stomp' | 'wind' | 'scrape' | 'drone' | 'dust';

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

/** Every fourth phrase is a bridge: its own set of loops that start away from the tonic. */
const BRIDGES: Record<Mode, readonly (readonly Deg[])[]> = {
  major: [[vi, IV, I, V], [IV, iii, vi, V], [ii, V, iii, vi]],
  minor: [[VI, VII, i, V], [iv, VI, III, VII], [VI, iv, i, V]],
};

/** Which part of the long form a phrase is: 0 and 1 the tune, 2 the bridge, 3 the breakdown and build. */
export const phraseForm = (phrase: number) => phrase % 4;

/** The chord under `barNo`, the phrase's last bar turning to the dominant so each phrase leans back into the next. A bar halfway through a phrase may swap to the ii (iv in minor). */
export function chordAt(seed: number, mode: Mode, barNo: number, tonicOverride?: number): { chord: Chord; degree: number } {
  const tonic = tonicOverride ?? keyOfSeed(seed);
  const phrase = Math.floor(barNo / BARS_PER_PHRASE);
  const bridge = phraseForm(phrase) === 2;
  const list = bridge ? BRIDGES[mode] : PROGRESSIONS[mode];
  const prog = list[hash(seed, phrase, mode === 'major' ? 1 : 2) % list.length]!;
  const inPhrase = barNo % BARS_PER_PHRASE;
  let deg = prog[inPhrase % 4]!;
  if (inPhrase === 5 && !bridge && hash(seed, phrase, 13) % 2 === 0) deg = mode === 'major' ? ii : iv;
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

/** The yard march comes in three flavours: the plaza's brass band, the old town's fife and snare, the quarry's heavy industrial one. */
export type MarchStyle = 'plaza' | 'oldtown' | 'quarry';
/** Fixed keys for the flavours that have one; the plaza's key still comes from the seed. */
export const MARCH_TONIC: Partial<Record<MarchStyle, number>> = { oldtown: 5, quarry: 2 };

/** The generated bar: the pure source of the whole soundtrack. Same (seed, mode, barNo, style) always returns the same bar. */
export function generateBar(seed: number, mode: Mode, barNo: number, style: MarchStyle = 'plaza'): Bar {
  if (style === 'quarry') mode = 'minor';
  const tonic = MARCH_TONIC[style] ?? keyOfSeed(seed);
  const { chord, degree } = chordAt(seed, mode, barNo, tonic);
  const phrase = Math.floor(barNo / BARS_PER_PHRASE);
  const inPhrase = barNo % BARS_PER_PHRASE;
  const form = phraseForm(phrase);
  const bridge = form === 2, breakdown = form === 3 && inPhrase < 4, build = form === 3 && inPhrase >= 4;
  const r = rng(hash(seed, barNo, mode === 'major' ? 3 : 4));
  const pr = rng(hash(seed, phrase, 99));
  const ev: MusicEvent[] = [];
  const add = (layer: LayerId, inst: Inst, step: number, dur: number, midi: number, vel: number, tier?: 0 | 1 | 2) => ev.push({ layer, inst, step, dur, midi, vel, tier });
  const root = 36 + chord.rootPc;
  const fifth = root + 7;
  const third = root + chord.tones[1]!;
  const fill = inPhrase === 7, miniFill = inPhrase === 3;
  const smallFill = (inPhrase === 1 || inPhrase === 5) && hash(seed, phrase, inPhrase, 41) % 3 === 0;
  const bassStyle = bridge ? 1 : Math.floor(pr() * 3);
  const march = Math.floor(pr() * 3);

  // calm: pad, bouncy bass, brushed kick and hats, glockenspiel sparkles.
  for (const t of chord.tones) add('calm', 'pad', 0, 16, 60 + chord.rootPc + t - (chord.rootPc > 6 ? 12 : 0), bridge ? 0.65 : 0.5);
  if (bassStyle === 0) { add('calm', 'bass', 0, 3, root, 1); add('calm', 'bass', 4, 2, fifth, 0.8); add('calm', 'bass', 8, 3, root, 0.95); add('calm', 'bass', 12, 2, third, 0.8); add('calm', 'bass', 14, 2, fifth, 0.75); }
  else if (bassStyle === 1) { for (let s = 0; s < 16; s += 4) { add('calm', 'bass', s, 2, root, s === 0 ? 1 : 0.8); add('calm', 'bass', s + 2, 2, s % 8 === 4 ? fifth : root + 12, 0.7); } }
  else { add('calm', 'bass', 0, 2, root, 1); add('calm', 'bass', 3, 1, root + 12, 0.7); add('calm', 'bass', 6, 2, fifth, 0.85); add('calm', 'bass', 8, 2, root, 0.95); add('calm', 'bass', 11, 1, root + 12, 0.7); add('calm', 'bass', 14, 2, fifth, 0.85); }
  add('calm', 'kick', 0, 1, 0, 0.55); add('calm', 'kick', 8, 1, 0, 0.45);
  for (let s = 2; s < 16; s += 4) add('calm', 'hat', s, 1, 0, bridge ? 0.5 : 0.35);
  const spark = chordNotes(chord, MID_C + 12, MID_C + 31);
  const nSpark = (breakdown ? 5 : 3) + Math.floor(r() * 3);
  const used = new Set<number>();
  for (let k = 0; k < nSpark; k++) {
    let s = Math.floor(r() * 16);
    if (used.has(s)) s = (s + 1) % 16;
    used.add(s);
    add('calm', 'glock', s, 2, pick(r, spark), 0.5 + r() * 0.3);
  }

  // combat: snare march, oom-pah brass stabs, driving kick. The breakdown drops to a half-time thump, the build rolls back in.
  const snareMarch: readonly (readonly number[])[] = [[4, 12, 7, 15], [4, 12, 6, 7, 14, 15], [3, 4, 11, 12, 14]];
  if (breakdown) {
    add('combat', 'kick', 0, 1, 0, 0.85); add('combat', 'kick', 8, 1, 0, 0.8);
    add('combat', 'snare', 12, 1, 0, 0.8); add('combat', 'tom', 4, 1, 45, 0.5);
  } else {
    add('combat', 'kick', 0, 1, 0, 0.8); add('combat', 'kick', 8, 1, 0, 0.75); add('combat', 'kick', 10, 1, 0, 0.55);
    add('combat', 'snare', 4, 1, 0, 0.9); add('combat', 'snare', 12, 1, 0, 0.95);
    for (const s of snareMarch[march]!) if (s !== 4 && s !== 12) add('combat', 'snare', s, 1, 0, 0.4);
    for (const s of [2, 6, 10, 14]) for (const t of chord.tones) add('combat', 'stab', s, 1, 55 + ((((chord.rootPc + t - 55) % 12) + 12) % 12), build && inPhrase === 4 ? 0.3 : 0.45);
  }
  if (miniFill) for (let s = 12; s < 16; s++) add('combat', 'snare', s, 1, 0, 0.5 + (s - 12) * 0.12);
  if (smallFill) { add('combat', 'tom', 14, 1, 50, 0.7); add('combat', 'tom', 15, 1, 45, 0.75); }
  if (build && inPhrase >= 6) for (let s = inPhrase === 7 ? 0 : 8; s < 16; s++) add('combat', 'snare', s, 1, 0, 0.3 + s * 0.04);

  // hype: the brass lead, bell doubling, a snare roll into each phrase turn. The bridge adds a bell arpeggio under it; the breakdown rests the lead for two bars.
  const leadOn = !(breakdown && inPhrase < 2);
  if (leadOn) for (const e of leadFor(seed, mode, barNo, chord, tonic)) { ev.push(e); if (e.dur >= 3) add('hype', 'glock', e.step, 2, e.midi + 12, 0.45); }
  if (bridge) { const arp = chordNotes(chord, MID_C + 12, MID_C + 28); for (let s = 0; s < 16; s += 2) add('hype', 'glock', s, 2, arp[(s / 2 + inPhrase) % arp.length]!, 0.3); }
  if (fill) for (let s = 8; s < 16; s++) add('hype', 'snare', s, 1, 0, 0.35 + (s - 8) * 0.09);
  if (fill) add('hype', 'tom', 15, 1, 43, 0.9);
  if (inPhrase === 0) add('hype', 'tom', 0, 1, 50, 0.8);

  // finale: sixteenth hats, octave-pumping bass, the lead's harmony a third up, tom rolls.
  for (let s = 0; s < 16; s++) add('finale', 'hat', s, 1, 0, s % 4 === 0 ? 0.5 : 0.3);
  for (let s = 0; s < 16; s += 2) add('finale', 'bass', s, 1, root + (s % 4 === 2 ? 12 : 0), 0.7);
  if (leadOn) for (const e of leadFor(seed, mode, barNo, chord, tonic)) add('finale', 'lead', e.step, e.dur, e.midi + (mode === 'major' ? 4 : 3), 0.55);
  add('finale', 'tom', 6, 1, 45, 0.6); add('finale', 'tom', 14, 1, 40, 0.65); if (fill) for (let s = 12; s < 16; s++) add('finale', 'tom', s, 1, 55 - (s - 12) * 4, 0.8);

  // heart: lub-dub on the beat, thickening with tiers (see heartTier).
  add('heart', 'heart', 0, 1, 0, 1, 0); add('heart', 'heart', 2, 1, 0, 0.7, 0);
  add('heart', 'heart', 8, 1, 0, 1, 0); add('heart', 'heart', 10, 1, 0, 0.7, 0);
  add('heart', 'heart', 4, 1, 0, 0.9, 1); add('heart', 'heart', 6, 1, 0, 0.6, 1);
  add('heart', 'heart', 12, 1, 0, 0.9, 1); add('heart', 'heart', 14, 1, 0, 0.6, 1);
  for (const s of [3, 7, 11, 15]) add('heart', 'heart', s, 1, 0, 0.5, 2);
  // A dark pedal under the night: the root, two octaves down.
  if (mode === 'minor') add('heart', 'bass', 0, 16, root - 12 + (root - 12 < 24 ? 12 : 0), 0.6, 0);

  return { barNo, mode, tonic, chord, degree, events: style === 'plaza' ? ev : flavour(style, ev, inPhrase, root, r) };
}

/** Re-voices the march for the old town (fife, harp, rim-clicks and snare ruffs on the cobbles) or the quarry (growling bass, anvil clanks). */
function flavour(style: Exclude<MarchStyle, 'plaza'>, ev: MusicEvent[], inPhrase: number, root: number, r: () => number): MusicEvent[] {
  const out: MusicEvent[] = [];
  const add = (layer: LayerId, inst: Inst, step: number, dur: number, midi: number, vel: number) => out.push({ layer, inst, step, dur, midi, vel });
  if (style === 'oldtown') {
    for (const e of ev) {
      if (e.inst === 'lead') out.push({ ...e, inst: 'fife', midi: e.midi + 12 });
      else if (e.inst === 'glock' && e.layer === 'calm') out.push({ ...e, inst: 'harp' });
      else if (e.inst === 'bass' && e.layer === 'calm') out.push({ ...e, inst: 'tuba' });
      else if (e.inst === 'stab') out.push({ ...e, inst: 'accordion', vel: e.vel * 1.3 });
      else out.push(e);
      // a ruff (grace stroke) before every backbeat snare
      if (e.inst === 'snare' && (e.step === 4 || e.step === 12) && e.layer === 'combat') add('combat', 'snare', e.step - 0.4, 1, 0, 0.25);
    }
    add('calm', 'rim', 4, 1, 0, 0.6); add('calm', 'rim', 12, 1, 0, 0.6);
    if (r() < 0.5) add('calm', 'rim', 14, 1, 0, 0.35);
    return out;
  }
  for (const e of ev) {
    if (e.inst === 'bass') out.push({ ...e, inst: 'tbass', vel: Math.min(1, e.vel * 1.2) });
    else if (e.inst === 'glock' && e.layer === 'calm') out.push({ ...e, inst: 'clank', midi: e.midi + (r() < 0.5 ? 0 : 7), vel: Math.min(1, e.vel * 0.9) });
    else out.push(e);
  }
  add('calm', 'clank', 0, 1, 52, 0.7); add('calm', 'clank', 8, 1, 55, 0.55);
  for (const s of [2, 6, 10, 14]) add('combat', 'clank', s, 1, s % 8 === 2 ? 64 : 67, 0.5);
  add('combat', 'kick', 4, 1, 0, 0.6); add('combat', 'kick', 12, 1, 0, 0.6);
  if (inPhrase % 4 === 3) add('combat', 'scrape', 12, 3, 0, 0.7);
  for (let s = 0; s < 16; s += 4) add('finale', 'clank', s + 1, 1, 60 + (s % 8), 0.5);
  return out;
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
