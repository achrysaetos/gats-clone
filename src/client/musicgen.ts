/**
 * The bar writer for the per-map scores: a form of sections (intro, A, B, bridge, breakdown...), each track's written theme
 * (musichook.ts) arranged across the intensity layers, and compact drum-pattern strings. Pure and deterministic: the same
 * (spec, seed, mode, barNo) always returns the same bar, and nothing touches WebAudio. The tune and the chords under it never
 * depend on the seed; the seed only picks drum fills and the odd ornament.
 */
import { bassBar, diatonic, sparse, type HookNote, type Theme } from './musichook.ts';
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
  /** A second reading of the section that every other time round plays instead (sections without the tune only). */
  alt?: readonly Deg[];
  /** Semitones the whole section is lifted by: the last chorus's key change. */
  lift?: number;
};

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
  /** Scale pitch classes above the tonic, for harmony lines under the tune. */
  scale: readonly number[];
  /** The written tune and bass riff. */
  theme: Theme;
  /** The minor-mode form's own tune and scale (the Zombies night), when it has one. */
  minorTheme?: Theme;
  minorScale?: readonly number[];
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

/** Sections that sing the theme keep their written chords; the others alternate a second reading every other time round. */
const HOOK_KINDS: ReadonlySet<SectionKind> = new Set(['A', 'A2', 'B', 'break']);

function chordIn(spec: TrackSpec, mode: Mode, barNo: number): { chord: Chord; sec: Section; secIdx: number; barIn: number; cycle: number } {
  const loc = locate(formOf(spec, mode), barNo);
  const { sec } = loc;
  const prog = sec.alt && !HOOK_KINDS.has(sec.kind) && loc.cycle % 2 === 1 ? sec.alt : sec.prog;
  const deg = prog[loc.barIn % prog.length]!;
  return { chord: { rootPc: (spec.tonic + deg[0]) % 12, tones: deg[1] }, ...loc };
}

/** The bar `barNo` of a track, with every event of every layer. */
export function generateTrackBar(spec: TrackSpec, seed: number, mode: Mode, barNo: number): Bar {
  const here = chordIn(spec, mode, barNo);
  const after = chordIn(spec, mode, barNo + 1);
  // A bar before a key change walks into the lifted chord.
  const shift = (after.sec.lift ?? 0) - (here.sec.lift ?? 0);
  const next = { ...after.chord, rootPc: (after.chord.rootPc + shift + 12) % 12 };
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
  const lift = here.sec.lift ?? 0;
  if (lift) for (const e of events) if (e.midi > 0) e.midi += lift;
  const chord = lift ? { ...here.chord, rootPc: (here.chord.rootPc + lift) % 12 } : here.chord;
  return { barNo, mode, tonic: (spec.tonic + lift) % 12, chord, degree: (here.chord.rootPc - spec.tonic + 12) % 12, events };
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

/** Converts a rhythm written in eighths of a 12/8 bar into steps. */
export const E12 = 4 / 3;

/** The chord struck on every hit of a pattern string (see `pat`), each tone `stagger` steps after the last for a strum. */
export function comp(cx: Cx, layer: LayerId, inst: Inst, str: string, vel = 1, base = 60, dur = 2, stagger = 0, chord: Chord = cx.chord) {
  for (const [step, v] of parsePat(str)) {
    chord.tones.forEach((t, i) => cx.add(layer, inst, step + i * stagger, dur, base + mod(chord.rootPc + t - base, 12), v * vel));
  }
}



// ---------------- the theme ----------------

/** Which part of the theme this bar sings: the A tune, the B tune, a fragment of A in a breakdown, or none. */
export function hookPart(cx: Cx): 'A' | 'B' | 'tease' | null {
  const k = cx.sec.kind;
  return k === 'A' || k === 'A2' ? 'A' : k === 'B' ? 'B' : k === 'break' ? 'tease' : null;
}
const themeOf = (cx: Cx): Theme => (cx.mode === 'minor' && cx.spec.minorTheme) || cx.spec.theme;
const scaleOf = (cx: Cx) => (cx.mode === 'minor' && cx.spec.minorScale) || cx.spec.scale;
/** The theme's notes for this bar: the tune of an A or B section, the hook's first two bars over and over in a breakdown. */
export function hookNotes(cx: Cx): readonly HookNote[] {
  const th = themeOf(cx), part = hookPart(cx);
  if (part === 'A') return th.A[cx.barIn % th.A.length]!;
  if (part === 'B') return th.B[cx.barIn % th.B.length]!;
  if (part === 'tease') return th.A[cx.barIn % 2]!;
  return [];
}

/** Notes onto a layer, `shift` semitones moved, accented on the beat. Tagged as the hook so tests and tools can find the tune. */
export function play(cx: Cx, layer: LayerId, inst: Inst, notes: readonly HookNote[], vel = 1, shift = 0, tag = true) {
  for (const n of notes) {
    const before = cx.events.length;
    cx.add(layer, inst, n.step, n.dur, n.midi + shift, vel * (Math.abs(n.step % 4) < 0.01 ? 1 : 0.85));
    if (tag) cx.events[before]!.tag = 'hook';
  }
}

/** The bass riff for this bar, its root the lowest at or above `lo`. */
export function riff(cx: Cx, layer: LayerId, inst: Inst, lo: number, vel = 1, shift = 0) {
  for (const n of bassBar(themeOf(cx), cx.barIn, cx.chord, cx.next, lo)) cx.add(layer, inst, n.step, n.dur, n.midi + shift, vel * (Math.abs(n.step % 4) < 0.01 ? 1 : 0.8));
}

/** A diatonic line `steps` scale places from the notes (a third under is -2). */
const harmonise = (cx: Cx, notes: readonly HookNote[], steps = -2) => diatonic(notes, cx.tonic, scaleOf(cx), steps);

export type Arrangement = {
  /** The voice that sings the tune once a fight starts. */
  lead: Inst;
  vel?: number;
  /** The A2 statement's voice (and the A's, every other time round). */
  alt?: Inst;
  /** The quiet layer's voice: the A whole and the rest's skeleton, so the hook is there even with no fight. */
  calm: Inst;
  calmVel?: number;
  /** Doubles the tune in the hype layer, `dblShift` semitones away (an octave up unless set). */
  dbl?: Inst;
  dblShift?: number;
  dblVel?: number;
  /** Sings a third under the tune: the A2's hype and every statement's finale. */
  harm?: Inst;
  harmVel?: number;
  /** Plays the bass riff `riffShift` up in a bridge, where the tune rests. */
  riffInst?: Inst;
  riffLo?: number;
  riffShift?: number;
  riffVel?: number;
};

/**
 * The standard staging of a theme: its skeleton in calm, the whole tune in combat, a double (or, in the A2, a harmony) in hype,
 * the harmony in the finale. A breakdown teases the hook's opening on the calm voice; a bridge hands the riff to a lead voice.
 */
export function stageHook(cx: Cx, a: Arrangement) {
  const part = hookPart(cx);
  const notes = hookNotes(cx);
  if (part === 'tease') { play(cx, 'calm', a.calm, notes, (a.calmVel ?? 0.45) * 1.2); return; }
  if (part === null) {
    if (cx.sec.kind === 'bridge' && a.riffInst) riff(cx, 'combat', a.riffInst, a.riffLo ?? 36, a.riffVel ?? 0.6, a.riffShift ?? 24);
    return;
  }
  const second = cx.sec.kind === 'A2';
  const swap = second !== (cx.cycle % 2 === 1);
  // Calm sings the A softly but whole (it is what you hear at a radio with no fight on), and only the skeleton of the rest.
  play(cx, 'calm', a.calm, cx.sec.kind === 'A' ? notes : sparse(notes), a.calmVel ?? 0.45);
  play(cx, 'combat', swap && a.alt ? a.alt : a.lead, notes, a.vel ?? 0.8);
  const harm = a.harm ?? a.lead;
  if (second) play(cx, 'hype', harm, harmonise(cx, notes), a.harmVel ?? 0.5);
  else if (a.dbl) play(cx, 'hype', a.dbl, notes, a.dblVel ?? 0.45, a.dblShift ?? 12);
  if (second && a.dbl) play(cx, 'finale', a.dbl, notes, a.dblVel ?? 0.45, a.dblShift ?? 12);
  else if (!second) play(cx, 'finale', harm, harmonise(cx, notes), a.harmVel ?? 0.5);
}
