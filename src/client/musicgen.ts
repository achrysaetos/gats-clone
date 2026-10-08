/**
 * The bar writer for the per-map scores: a form of sections (intro, A, B, bridge, breakdown...), seeded chord
 * substitutions, motif-based melodies and compact drum-pattern strings. Pure and deterministic: the same
 * (spec, seed, mode, barNo) always returns the same bar, and nothing touches WebAudio.
 */
import { hash, rng, type Bar, type Chord, type Inst, type LayerId, type Mode, type MusicEvent } from './musictheory.ts';

export type Deg = readonly [root: number, tones: readonly number[]];
/** Chord shapes, as semitones above the root. */
export const Q = {
  maj: [0, 4, 7], min: [0, 3, 7], dim: [0, 3, 6], maj7: [0, 4, 7, 11], min7: [0, 3, 7, 10], dom7: [0, 4, 7, 10], m7b5: [0, 3, 6, 10],
  mmaj7: [0, 3, 7, 11], sus4: [0, 5, 7], add9: [0, 4, 7, 14], min9: [0, 3, 7, 10, 14], pow: [0, 7, 12],
} as const;
export const d = (root: number, tones: readonly number[]): Deg => [root, tones];

export type SectionKind = 'intro' | 'A' | 'A2' | 'B' | 'bridge' | 'break' | 'build' | 'outro';
export type Section = {
  kind: SectionKind;
  bars: number;
  /** One chord per bar, looping if shorter than the section. */
  prog: readonly Deg[];
  /** A second reading of the section some cycles play instead. */
  alt?: readonly Deg[];
  /** Chords that may stand in for the last bar of a four-bar group. */
  turn?: readonly Deg[];
};
export type Rhythm = readonly (readonly [step: number, dur: number])[];

export type Cx = {
  spec: TrackSpec;
  seed: number;
  mode: Mode;
  barNo: number;
  sec: Section;
  secIdx: number;
  /** Bar within the section. */
  barIn: number;
  /** How many times the whole form has gone round. */
  cycle: number;
  /** The section's last bar. */
  last: boolean;
  chord: Chord;
  next: Chord;
  tonic: number;
  /** The bar's own seeded random. */
  r: () => number;
  /** Seeded by the cycle too, so the same bar of the next cycle differs. */
  cr: () => number;
  add(layer: LayerId, inst: Inst, step: number, dur: number, midi: number, vel: number, tier?: 0 | 1 | 2): void;
  events: MusicEvent[];
};

export type TrackSpec = {
  id: string;
  tonic: number;
  /** Scale pitch classes above the tonic, for melodies. */
  scale: readonly number[];
  /** How far the off-beat eighths are pushed late, in sixteenths (0 straight, 0.67 a full triplet swing). */
  swing?: number;
  form: { major: readonly Section[]; minor?: readonly Section[] };
  build(cx: Cx): void;
};

const totals = new WeakMap<readonly Section[], number>();
export function formBars(form: readonly Section[]): number {
  let n = totals.get(form);
  if (n === undefined) { n = form.reduce((a, s) => a + s.bars, 0); totals.set(form, n); }
  return n;
}
export const formOf = (spec: TrackSpec, mode: Mode): readonly Section[] => (mode === 'minor' && spec.form.minor) || spec.form.major;

function locate(form: readonly Section[], barNo: number) {
  const total = formBars(form);
  const cycle = Math.floor(barNo / total);
  let pos = barNo % total;
  for (let i = 0; i < form.length; i++) {
    const sec = form[i]!;
    if (pos < sec.bars) return { sec, secIdx: i, barIn: pos, cycle };
    pos -= sec.bars;
  }
  throw new Error('unreachable');
}

function chordIn(spec: TrackSpec, mode: Mode, seed: number, barNo: number): { chord: Chord; sec: Section; secIdx: number; barIn: number; cycle: number } {
  const loc = locate(formOf(spec, mode), barNo);
  const { sec } = loc;
  const prog = sec.alt && hash(seed, loc.cycle, loc.secIdx, 5) % 2 === 1 ? sec.alt : sec.prog;
  let deg = prog[loc.barIn % prog.length]!;
  if (sec.turn && loc.barIn % 4 === 3 && loc.barIn !== sec.bars - 1 && hash(seed, loc.cycle, loc.secIdx, loc.barIn, 9) % 3 === 0) deg = sec.turn[hash(seed, loc.cycle, loc.barIn) % sec.turn.length]!;
  return { chord: { rootPc: (spec.tonic + deg[0]) % 12, tones: deg[1] }, ...loc };
}

/** The bar `barNo` of a track, with every event of every layer. */
export function generateTrackBar(spec: TrackSpec, seed: number, mode: Mode, barNo: number): Bar {
  const here = chordIn(spec, mode, seed, barNo);
  const next = chordIn(spec, mode, seed, barNo + 1).chord;
  const events: MusicEvent[] = [];
  const swing = spec.swing ?? 0;
  const add: Cx['add'] = (layer, inst, step, dur, midi, vel, tier) => {
    let s = step;
    if (swing && Number.isInteger(step)) { if (step % 4 === 2) s += swing; else if (step % 2 === 1) s += swing / 2; }
    events.push({ layer, inst, step: s, dur, midi, vel: Math.min(1, vel), tier });
  };
  const cx: Cx = {
    spec, seed, mode, barNo, sec: here.sec, secIdx: here.secIdx, barIn: here.barIn, cycle: here.cycle, last: here.barIn === here.sec.bars - 1,
    chord: here.chord, next, tonic: spec.tonic, r: rng(hash(seed, barNo, 3, spec.tonic)), cr: rng(hash(seed, barNo, here.cycle, 4, spec.tonic)), add, events,
  };
  spec.build(cx);
  return { barNo, mode, tonic: spec.tonic, chord: here.chord, degree: (here.chord.rootPc - spec.tonic + 12) % 12, events };
}

// ---------------- building blocks ----------------

export const pick = <T,>(r: () => number, list: readonly T[]): T => list[Math.floor(r() * list.length) % list.length]!;
const mod = (n: number, m: number) => ((n % m) + m) % m;

/** The lowest note at or above `lo` that is the chord's root. */
export const rootMidi = (cx: Cx, lo = 34) => lo + mod(cx.chord.rootPc - lo, 12);
/** A chord tone (by index) as a midi note near `base`. */
export const toneMidi = (cx: Cx, i: number, base = 60) => {
  const t = cx.chord.tones[i % cx.chord.tones.length]!;
  return base + mod(cx.chord.rootPc + t - base, 12) + 12 * Math.floor(i / cx.chord.tones.length);
};
/** The tone of `chord` nearest below-or-at `ceil`. */
export const chordNotes = (c: Chord, lo: number, hi: number): number[] => {
  const out: number[] = [];
  for (let m = lo; m <= hi; m++) if (c.tones.some((t) => mod(m - c.rootPc - t, 12) === 0)) out.push(m);
  return out;
};
export const scaleNotes = (tonic: number, scale: readonly number[], lo: number, hi: number): number[] => {
  const out: number[] = [];
  for (let m = lo; m <= hi; m++) if (scale.includes(mod(m - tonic, 12))) out.push(m);
  return out;
};

const patCache = new Map<string, readonly (readonly [number, number])[]>();
function parsePat(str: string): readonly (readonly [number, number])[] {
  let p = patCache.get(str);
  if (!p) {
    const out: [number, number][] = [];
    for (let i = 0; i < str.length; i++) { const c = str[i]!; if (c >= '1' && c <= '9') out.push([(i * 16) / str.length, Number(c) / 9]); }
    patCache.set(str, p = out);
  }
  return p;
}
/**
 * A drum or ostinato pattern as text: one character per slot across the bar (16 for sixteenths, 12 for a 12/8 bar, 8 for eighths),
 * a digit 1-9 the hit's velocity, anything else a rest.
 */
export function pat(cx: Cx, layer: LayerId, inst: Inst, str: string, vel = 1, midi = 0, dur = 1, tier?: 0 | 1 | 2) {
  for (const [step, v] of parsePat(str)) cx.add(layer, inst, step, dur, midi, v * vel, tier);
}

/** A crescendo of `inst` hits on every sixteenth from `from` to the bar's end. */
export function roll(cx: Cx, layer: LayerId, inst: Inst, from: number, v0: number, v1: number, midi = 0) {
  for (let s = from; s < 16; s++) cx.add(layer, inst, s, 1, midi, v0 + ((v1 - v0) * (s - from)) / Math.max(1, 15 - from));
}

/** Which fill this bar gets: seeded by the cycle, so the same bar of the next time round fills differently. */
export const fillKind = (cx: Cx, n = 3) => hash(cx.seed, cx.cycle, cx.barNo, 61) % n;

/** The chord as a held voicing, each tone folded into the octave above `base`. */
export function voicing(cx: Cx, layer: LayerId, inst: Inst, vel: number, base = 60, step = 0, dur = 16, stagger = 0) {
  cx.chord.tones.forEach((t, i) => cx.add(layer, inst, step + i * stagger, dur, base + mod(cx.chord.rootPc + t - base, 12), vel));
}

export type MelodyOpts = {
  layer: LayerId;
  inst: Inst;
  rhythms: readonly Rhythm[];
  /** Range, midi. */
  lo: number;
  hi: number;
  /** Tells one voice's tune from another's. */
  salt: number;
  /** Steps per rhythm unit (4/3 for twelve-eighths bars). */
  unit?: number;
  vel?: number;
  /** Chance each note after the first is left out, decided per cycle. */
  restP?: number;
  /** How the section's last bar ends. */
  cadence?: Rhythm;
  /** A different scale from the track's. */
  scale?: readonly number[];
  /** Largest leap taken now and then, semitones. */
  leap?: number;
};

/**
 * One bar of a tune. A section's tune is a four-bar motif answered by a variant in bars 4-7; which of three readings
 * it plays depends on the seed and the cycle, so the hook is recognisable while a 10-minute round keeps changing.
 */
export function melody(cx: Cx, o: MelodyOpts): MusicEvent[] {
  const unit = o.unit ?? 1;
  const variant = hash(cx.seed, cx.cycle, 3) % 3;
  const key = hash(o.salt, cx.secIdx, variant);
  const m = cx.barIn % 4;
  const answer = cx.barIn % 8 >= 4;
  const fresh = answer && m >= 2 ? 1 : 0;
  const rr = rng(hash(key, m, fresh, 11));
  const rhythm = cx.last && o.cadence ? o.cadence : pick(rr, o.rhythms);
  const rp = rng(hash(key, m, fresh, 12));
  const sn = scaleNotes(cx.tonic, o.scale ?? cx.spec.scale, o.lo, o.hi);
  const cn = chordNotes(cx.chord, o.lo, o.hi);
  const cr = rng(hash(key, 99));
  const contour = [0, 1, 2, 3].map(() => Math.floor(cr() * 5) - 2);
  const centre = Math.min(sn.length - 1, Math.max(0, Math.floor(sn.length / 2) + contour[m]! * 2));
  const target = sn[centre]!;
  let cur = cn.reduce((best, n) => (Math.abs(n - target) < Math.abs(best - target) ? n : best), cn[0]!);
  const rest = rng(hash(cx.seed, cx.barNo, cx.cycle, 21));
  const out: MusicEvent[] = [];
  rhythm.forEach(([s, dur], idx) => {
    const step = s * unit;
    if (idx > 0 && o.restP && rest() < o.restP && !(cx.last && idx === rhythm.length - 1)) return;
    const onBeat = Math.abs(step % 4) < 0.01;
    const pool = onBeat ? cn : sn;
    const reach = rp() < 0.2 ? (o.leap ?? 7) : 3;
    const near = pool.filter((n) => Math.abs(n - cur) <= reach);
    // A tune moves: most of the time the next note is not the one just played.
    const moved = near.filter((n) => n !== cur);
    cur = pick(rp, moved.length && rp() < 0.8 ? moved : near.length ? near : pool);
    if (cx.last && idx === rhythm.length - 1) cur = cn.reduce((best, n) => (Math.abs(n - (o.lo + o.hi) / 2) < Math.abs(best - (o.lo + o.hi) / 2) ? n : best), cn[0]!);
    const ev: MusicEvent = { layer: o.layer, inst: o.inst, step: 0, dur: 0, midi: cur, vel: 0 };
    cx.add(o.layer, o.inst, step, dur * unit, cur, (o.vel ?? 1) * (onBeat ? 1 : 0.82));
    out.push({ ...ev, step, dur: dur * unit, vel: onBeat ? 1 : 0.82 });
  });
  return out;
}

/** Converts a rhythm written in eighths of a 12/8 bar into steps. */
export const E12 = 4 / 3;

/** The chord struck on every hit of a pattern string (see `pat`), each tone `stagger` steps after the last for a strum. */
export function comp(cx: Cx, layer: LayerId, inst: Inst, str: string, vel = 1, base = 60, dur = 2, stagger = 0, chord: Chord = cx.chord) {
  for (const [step, v] of parsePat(str)) {
    chord.tones.forEach((t, i) => cx.add(layer, inst, step + i * stagger, dur, base + mod(chord.rootPc + t - base, 12), v * vel));
  }
}

/** A bass line on the hits of a pattern string: hit k plays the root plus `offs[k % offs.length]` semitones. */
export function bassLine(cx: Cx, layer: LayerId, inst: Inst, str: string, offs: readonly number[], vel = 1, lo = 36, dur = 2) {
  const root = rootMidi(cx, lo);
  parsePat(str).forEach(([step, v], k) => cx.add(layer, inst, step, dur, root + offs[k % offs.length]!, v * vel));
}

