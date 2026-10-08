/**
 * Scores for the old town (a tango) and the quarry (heavy rock). Same shape as musictracksa.ts: a written theme, a form whose A and B carry it,
 * and a `build` writing one bar into the intensity layers.
 */
import { comp, d, fillKind, hookNotes, hookPart, pat, play, Q, riff, roll, rootMidi, stageHook, type Section, type TrackSpec } from './musicgen.ts';
import { diatonic, sparse, theme } from './musichook.ts';

const sec = (kind: Section['kind'], bars: number, prog: Section['prog'], o: { alt?: Section['alt']; lift?: number } = {}): Section => ({ kind, bars, prog, ...o });

// ================= OLD TOWN: a tango =================
// F minor, 118 bpm. A bandoneon and a violin over a piano and a plucked contrabass: no drum kit, just the marcato, the sincopa, the drag
// into the downbeat and a knock on the violin's body.
const ti = d(0, Q.min), tII7 = d(2, Q.dom7), tIII = d(3, Q.maj), tiv = d(5, Q.min), tV7 = d(7, Q.dom7), tVI = d(8, Q.maj), tVII7 = d(10, Q.dom7);
const T_A = [ti, tV7, ti, tV7, tiv, ti, tVI, tV7], T_B = [tIII, tVII7, tIII, ti, tVI, tiv, tII7, tV7];
export const OLDTOWN: TrackSpec = {
  id: 'oldtown', tonic: 5, scale: [0, 2, 3, 5, 7, 8, 11],
  // Three clipped repeats and a lean on the leading tone before the leap (F . F-F E F Ab), the same a step up on the dominant.
  theme: theme({
    A: 'F5:2 r:1 F5:1 F5:2 E5:2 F5:4 Ab5:4 | G5:2 r:1 G5:1 G5:2 F#5:2 G5:4 Bb5:4 | Ab5:2 r:1 Ab5:1 G5:2 F5:2 E5:2 F5:2 C6:4 | Bb5:4 Ab5:2 G5:2 E5:8 |'
      + ' F5:2 r:1 F5:1 F5:2 E5:2 F5:4 Db6:4 | C6:4 Bb5:2 Ab5:2 F5:8 | Ab5:2 r:1 Ab5:1 Ab5:2 G5:2 F5:4 Db5:4 | E5:2 F5:2 G5:2 Bb5:2 C6:4 r:4',
    B: 'C6:6 Bb5:2 Ab5:8 | G5:6 Ab5:2 Bb5:8 | Eb6:6 Db6:2 C6:8 | Ab5:6 G5:2 F5:8 | F5:4 Ab5:4 Db6:8 | Db6:4 C6:4 Bb5:8 | D6:4 B5:4 G5:4 F5:4 | E5:8 G5:4 Bb5:4',
    bass: '1:3 r:3 1:2 r:2 5,:2 4,:2 ^:2',
  }),
  form: {
    major: [
      sec('intro', 4, [ti, ti, tiv, tV7]),
      sec('A', 8, T_A),
      sec('A2', 8, T_A),
      sec('B', 8, T_B),
      sec('A', 8, T_A),
      sec('bridge', 8, [tiv, ti, tVI, tV7, tiv, ti, tII7, tV7]),
      sec('B', 8, T_B),
      sec('break', 4, [ti, tV7]),
      sec('A2', 8, T_A),
      sec('A', 8, T_A, { lift: 1 }),
      sec('outro', 4, [tiv, tV7, ti, ti]),
    ],
  },
  build(cx) {
    const kind = cx.sec.kind;
    const fk = fillKind(cx);
    // calm: the contrabass plucking the walk, the piano's left hand in the sincopa (three, three, two).
    riff(cx, 'calm', 'upright', 33, 0.85);
    comp(cx, 'calm', 'piano', kind === 'intro' ? '9...............' : '9.....7.....8...', 0.32, 53, 1.5);
    // combat: the marcato: the piano on every beat, staccato; a knock on the violin's body on two and four; the bandoneon dragging into the one.
    comp(cx, 'combat', 'piano', '9...7...9...7...', 0.34, 60, 0.8);
    pat(cx, 'combat', 'rim', '....6.......6...', 0.7);
    if (kind !== 'break') comp(cx, 'combat', 'bandoneon', '............7...', 0.24, 55, 4);
    pat(cx, 'combat', 'scrape', '..............4.', 0.5);
    if (cx.barIn % 4 === 3) pat(cx, 'combat', 'upright', fk === 0 ? '........9.7.9.7.' : '............9.9.', 0.6, rootMidi(cx, 33));

    // The bandoneon has the tune (the violin the second time), the piano's right hand its skeleton; a violin an octave up when it heats.
    stageHook(cx, { lead: 'bandoneon', alt: 'violin', calm: 'piano', calmVel: 0.3, dbl: 'violin', dblShift: 12, dblVel: 0.3, harm: 'bandoneon', harmVel: 0.32, riffInst: 'violin', riffLo: 33, riffShift: 36, riffVel: 0.5 });
    // finale: the piano hammering the beat up high, the contrabass slapped on the beat.
    comp(cx, 'finale', 'piano', '9...7...9...7...', 0.22, 72, 0.7);
    pat(cx, 'finale', 'upright', '9...9...9...9...', 0.5, rootMidi(cx, 33) + 12, 1);
  },
};

// ================= QUARRY: heavy rock =================
// D minor, 144 bpm. Distorted power chords chugging a riff, an overdriven lead, a pick bass on the eighths, a rock kit with crashes.
const qD = d(0, Q.pow), qF = d(3, Q.pow), qG = d(5, Q.pow), qA = d(7, Q.pow), qBb = d(8, Q.pow), qC = d(10, Q.pow);
const R_A = [qD, qD, qD, qA, qD, qD, qD, qA], R_B = [qBb, qC, qD, qD, qBb, qC, qA, qA];
export const QUARRY: TrackSpec = {
  id: 'quarry', tonic: 2, scale: [0, 2, 3, 5, 7, 8, 10],
  // A palm-muted chug (D-D . D, F D . G F . C D) and its answer through the flat fifth (Ab); the chorus is a lead guitar over power chords.
  theme: theme({
    A: 'D3:1 D3:1 r:1 D3:1 F3:2 D3:1 r:1 G3:2 F3:1 r:1 C3:2 D3:2 | D3:1 D3:1 r:1 D3:1 F3:2 D3:1 r:1 Ab3:2 G3:2 F3:2 r:2 |'
      + ' D3:1 D3:1 r:1 D3:1 F3:2 D3:1 r:1 G3:2 F3:1 r:1 C3:2 D3:2 | Bb2:4 C3:4 D3:2 D3:1 D3:1 r:2 A2:2 |'
      + ' D3:1 D3:1 r:1 D3:1 F3:2 D3:1 r:1 G3:2 F3:1 r:1 C3:2 D3:2 | D3:1 D3:1 r:1 D3:1 F3:2 D3:1 r:1 Ab3:2 G3:2 F3:2 r:2 |'
      + ' F3:2 F3:1 F3:1 E3:2 E3:1 E3:1 Eb3:2 Eb3:1 Eb3:1 D3:4 | A2:4 r:2 A2:1 A2:1 C3:2 C#3:2 E3:4',
    B: 'D5:4 F5:4 Bb5:6 A5:2 | G5:8 E5:4 C5:4 | F5:4 A5:4 D6:6 C6:2 | A5:12 r:4 | D5:4 F5:4 Bb5:4 D6:4 | C6:6 Bb5:2 G5:8 | A5:4 C#6:4 E6:8 | E6:4 C#6:4 A5:8',
    bass: '1:2 1:2 1:2 1:2 1:2 1:2 1:2 1:2',
  }),
  form: {
    major: [
      sec('intro', 4, [qD, qD, qD, qA]),
      sec('A', 8, R_A),
      sec('A2', 8, R_A),
      sec('B', 8, R_B),
      sec('A', 8, R_A),
      sec('bridge', 8, [qG, qF, qD, qD, qG, qF, qA, qA]),
      sec('B', 8, R_B),
      sec('break', 4, [qD, qD]),
      sec('A2', 8, R_A),
      sec('B', 8, R_B),
      sec('B', 8, R_B),
      sec('A', 8, R_A, { lift: 2 }),
      sec('outro', 4, [qBb, qC, qD, qD]),
    ],
  },
  build(cx) {
    const kind = cx.sec.kind;
    const part = hookPart(cx);
    const notes = hookNotes(cx);
    const fk = fillKind(cx);
    const root = rootMidi(cx, 38);
    // calm: a clean guitar picking the riff (or the chorus's skeleton), the pick bass on the eighths, a ride.
    if (part === 'A' || part === 'tease') play(cx, 'calm', 'twang', notes, 0.4, 12);
    else if (part === 'B') play(cx, 'calm', 'twang', sparse(notes), 0.35);
    riff(cx, 'calm', 'pbass', 38, kind === 'intro' ? 0.6 : 0.8);
    pat(cx, 'calm', 'ride', '6.4.6.4.6.4.6.4.', 0.5);

    // combat: the rock kit (kick on one and the and of two, the snare cracking two and four, eighth hats, a crash on each phrase) and
    // the distorted guitar: the riff in power chords in the A, the chords chugged on the eighths under the chorus.
    pat(cx, 'combat', 'krock', kind === 'break' ? '9...............' : '9.....9...9.....', 0.95);
    pat(cx, 'combat', 'srock', '....9.......9...', 0.9);
    pat(cx, 'combat', 'hat', kind === 'A2' ? '6464646464646464' : '7.5.7.5.7.5.7.5.', 0.65);
    if (cx.barIn === 0) cx.add('combat', 'crash', 0, 1, 0, 0.85);
    if (part === 'A') {
      play(cx, 'combat', 'dist', notes, 0.75);
      play(cx, 'combat', 'dist', notes.map((n) => ({ ...n, midi: n.midi + 7 })), 0.55, 0, false);
    } else if (part === 'B' || kind === 'bridge' || kind === 'outro') {
      for (const s of [0, 2, 4, 6, 8, 10, 12, 14]) { cx.add('combat', 'dist', s, 1.6, root, 0.6); cx.add('combat', 'dist', s, 1.6, root + 7, 0.45); }
      if (part === 'B') play(cx, 'combat', 'od', notes, 0.75);
    }
    if (cx.barIn % 4 === 3) { if (fk === 0) pat(cx, 'combat', 'tom', '........9.8.7.6.', 0.9, 45); else roll(cx, 'combat', 'srock', 12, 0.4, 0.9); }

    // hype: the lead guitar doubles the riff an octave up, a third over the chorus; the bridge is its solo, the riff's line.
    if (part === 'A') play(cx, 'hype', 'od', notes, 0.35, kind === 'A2' ? 19 : 12);
    else if (part === 'B') play(cx, 'hype', 'od', diatonic(notes, cx.tonic, cx.spec.scale, 2), 0.3, 0, false);
    if (kind === 'bridge') riff(cx, 'hype', 'od', 38, 0.5, 24);
    // finale: a crash every bar, the ride on every eighth, the kick doubled.
    cx.add('finale', 'crash', 0, 1, 0, 0.6);
    pat(cx, 'finale', 'ride', '9.7.9.7.9.7.9.7.', 0.55);
    pat(cx, 'finale', 'krock', '..5.......5.5...', 0.6);
  },
};
