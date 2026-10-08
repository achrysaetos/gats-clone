/**
 * Scores for the railyard, summit, embassy, airbase, wasteland, shooting range and the Zombies outpost (day and night).
 * Same shape as musictracksa.ts: a form of sections and a `build` writing one bar into the intensity layers.
 */
import { bassLine, chordNotes, comp, d, fillKind, melody, pat, pick, Q, roll, rootMidi, toneMidi, voicing, type Cx, type Rhythm, type Section, type TrackSpec } from './musicgen.ts';

const sec = (kind: Section['kind'], bars: number, prog: Section['prog'], alt?: Section['alt'], turn?: Section['turn']): Section => ({ kind, bars, prog, alt, turn });

// ================= RAILYARD: train-rhythm driving swing =================
// A, twelve-bar blues, 120 bpm, shuffle. The chug is the brush "choo-ch-choo-ch"; harmonica leads; a crossing bell rings between verses.
const rI = d(0, Q.dom7), rIV = d(5, Q.dom7), rV = d(7, Q.dom7), rVI = d(2, Q.dom7);
const BLUES12 = [rI, rI, rI, rI, rIV, rIV, rI, rI, rV, rIV, rI, rV];
const BLUES12_QC = [rI, rIV, rI, rI, rIV, rIV, rI, rI, rV, rIV, rI, rV];
const HARP: readonly Rhythm[] = [
  [[0, 3], [3, 1], [4, 2], [6, 2], [8, 4], [12, 4]], [[0, 2], [2, 2], [4, 4], [8, 2], [10, 1], [11, 1], [12, 4]],
  [[2, 2], [4, 2], [6, 2], [8, 6], [14, 2]], [[0, 1], [1, 1], [2, 2], [4, 6], [10, 2], [12, 4]],
];
export const RAILYARD: TrackSpec = {
  id: 'railyard', tonic: 9, scale: [0, 2, 3, 4, 5, 7, 9, 10], swing: 0.6,
  form: {
    major: [
      sec('intro', 4, [rI, rI, rIV, rV]),
      sec('A', 12, BLUES12, BLUES12_QC, [rVI, d(10, Q.dom7)]),
      sec('A2', 12, BLUES12, BLUES12_QC, [rVI]),
      sec('bridge', 8, [rIV, rIV, rI, rI, rIV, rIV, rV, rV]),
      sec('B', 12, BLUES12_QC, BLUES12, [rVI]),
      sec('break', 8, [rI, rI, rI, rI, rIV, rIV, rV, rV]),
      sec('A', 12, BLUES12, BLUES12_QC, [rVI]),
      sec('A2', 12, BLUES12_QC, BLUES12, [rVI]),
      sec('outro', 4, [rIV, rI, rV, rI]),
    ],
  },
  build(cx) {
    const kind = cx.sec.kind;
    const root = rootMidi(cx, 33), fifth = root + 7;
    const open = kind === 'intro' || kind === 'break';
    const stop = kind === 'bridge';
    const fk = fillKind(cx);
    // calm: the chug, boom-chick bass, the odd harmonica sigh, the crossing bell.
    pat(cx, 'calm', 'chug', open ? '9.539.539.539.53' : '7.537.537.537.53', 0.7);
    cx.add('calm', 'upright', 0, 3, root, 1); cx.add('calm', 'upright', 8, 3, fifth, 0.85);
    if (!stop) { cx.add('calm', 'upright', 4, 2, root + 12, 0.5); cx.add('calm', 'upright', 12, 2, fifth + 5, 0.5); }
    if ((kind === 'intro' || kind === 'bridge') && cx.barIn % 4 < 2) for (let s = 0; s < 16; s += 2) cx.add('calm', 'rbell', s, 1.5, s % 4 === 0 ? 88 : 91, 0.5);
    if (kind === 'break' && cx.barIn % 4 === 0) cx.add('calm', 'rbell', 0, 3, 88, 0.8);
    if (cx.cr() < 0.35) cx.add('calm', 'harmonica', 8, 6, pick(cx.cr, chordNotes(cx.chord, 69, 83)), 0.6);

    // combat: shuffled snare, kick on 1 and 3, a chord chop on the guitar; the stop-time bridge hits only the beat.
    pat(cx, 'combat', 'kick', '9.......9.......', 0.8);
    pat(cx, 'combat', 'snare', stop ? '9...............' : '....9..5....9..5', 0.8);
    pat(cx, 'combat', 'hat', '7.5.7.5.7.5.7.5.', 0.7);
    if (!stop) comp(cx, 'combat', 'bgtr', '..7...5...7...5.', 0.8, 52, 2);
    if (cx.barIn % 4 === 3) { if (fk === 0) roll(cx, 'combat', 'snare', 8, 0.3, 0.9); else pat(cx, 'combat', 'tom', '........5.7.9.9.', 0.8, 50); }

    // hype: the harmonica, bending into notes.
    if (kind !== 'intro' && kind !== 'break') melody(cx, { layer: 'hype', inst: 'harmonica', rhythms: HARP, lo: 64, hi: 84, salt: 0x3c, restP: 0.12, cadence: [[0, 4], [4, 12]] });
    // finale: the train opens up: double-time chug, a bell on every beat, an octave harmonica, toms.
    pat(cx, 'finale', 'chug', '9.9.9.9.9.9.9.9.', 0.8);
    for (const s of [0, 4, 8, 12]) cx.add('finale', 'rbell', s, 1.5, 88, 0.45);
    pat(cx, 'finale', 'tom', '..........5.7.9.', 0.9, 48);
    cx.add('finale', 'harmonica', 0, 6, toneMidi(cx, 2, 76), 0.45);
  },
};

// ================= SUMMIT: crisp alpine =================
// D major, 116 bpm. Sleigh-bell shuffle, glockenspiel, an airy pad, a yodel full of leaps.
const aI = d(0, Q.maj), aIV = d(5, Q.maj), aV = d(7, Q.maj), avi = d(9, Q.min), aII = d(2, Q.maj);
const ALP: readonly Rhythm[] = [
  [[0, 2], [2, 2], [4, 4], [8, 2], [10, 2], [12, 4]], [[0, 3], [3, 1], [4, 2], [6, 2], [8, 4], [12, 4]],
  [[0, 2], [2, 1], [3, 1], [4, 4], [8, 2], [10, 1], [11, 1], [12, 4]], [[2, 2], [4, 2], [6, 2], [8, 6], [14, 2]],
];
export const SUMMIT: TrackSpec = {
  id: 'summit', tonic: 2, scale: [0, 2, 4, 5, 7, 9, 11], swing: 0.4,
  form: {
    major: [
      sec('intro', 4, [aI, aIV, aI, aV]),
      sec('A', 8, [aI, aIV, aI, aV, aI, aIV, aV, aI], [aI, avi, aIV, aV, aI, aIV, aV, aI], [d(9, Q.dom7)]),
      sec('A2', 8, [aI, aIV, aI, aV, aI, aIV, aV, aI], [aI, avi, aIV, aV, aI, aIV, aV, aI], [d(9, Q.dom7)]),
      sec('B', 8, [avi, aIV, aI, aV, avi, aIV, aV, aV]),
      sec('A', 8, [aI, aIV, aI, aV, aI, aIV, aV, aI], [aI, avi, aIV, aV, aI, aIV, aV, aI]),
      sec('bridge', 8, [aI, aII, aIV, aI, aI, aII, aIV, aV]),
      sec('B', 8, [avi, aIV, aI, aV, avi, aIV, aV, aV]),
      sec('break', 4, [aI, aIV, aI, aV]),
      sec('A2', 8, [aI, aIV, aI, aV, aI, aIV, aV, aI], [aI, avi, aIV, aV, aI, aIV, aV, aI]),
      sec('B', 8, [avi, aIV, aI, aV, avi, aIV, aV, aV]),
      sec('outro', 4, [aIV, aV, aI, aI]),
    ],
  },
  build(cx) {
    const kind = cx.sec.kind;
    const root = rootMidi(cx, 38), fifth = root + 7;
    const open = kind === 'intro' || kind === 'break' || kind === 'outro';
    const fk = fillKind(cx);
    // calm: sleigh bells, a pad of cold air, an oom-pah, glockenspiel sparkle.
    pat(cx, 'calm', 'sleigh', open ? '7...4...7...4...' : '7.4.7.4.7.4.7.4.', 0.9);
    voicing(cx, 'calm', 'padair', 0.8, 55, 0, 16);
    cx.add('calm', 'tuba', 0, 3, root, 0.8); cx.add('calm', 'tuba', 8, 3, fifth, 0.7);
    const sp = chordNotes(cx.chord, 79, 100);
    const nsp = open ? 2 : 3;
    for (let k = 0; k < nsp; k++) cx.add('calm', 'glock', Math.floor(cx.r() * 8) * 2, 2, pick(cx.r, sp), 0.5);

    // combat: crisp kick, rim, glockenspiel arpeggios on the eighths.
    pat(cx, 'combat', 'kick', kind === 'break' ? '9...............' : '9.......9..5....', 0.8);
    pat(cx, 'combat', 'rim', '....8.......8...', 0.9);
    pat(cx, 'combat', 'hat', '..5...5...5...5.', 0.7);
    const arp = chordNotes(cx.chord, 67, 91);
    for (let s = 0; s < 16; s += 2) cx.add('combat', 'harp', s, 2, arp[(s / 2 + cx.barIn) % arp.length]!, 0.5);
    if (cx.barIn % 4 === 3) { if (fk === 0) roll(cx, 'combat', 'rim', 12, 0.3, 0.8); else pat(cx, 'combat', 'tom', '..........5.7.9.', 0.8, 52); }

    // hype: the yodel. Most bars sing the tune; every fourth bar leaps a fifth and an octave and falls back.
    if (kind !== 'intro' && kind !== 'break') {
      if (cx.barIn % 4 === 3 && !cx.last && (kind === 'A' || kind === 'A2')) {
        const t = toneMidi(cx, 0, 69);
        [[0, 2, t], [2, 2, t + 12], [4, 2, t + 7], [6, 2, t + 12], [8, 4, t + 4]].forEach(([s, du, n]) => cx.add('hype', 'yodel', s!, du!, n!, 0.9));
      } else {
        const ev = melody(cx, { layer: 'hype', inst: 'yodel', rhythms: ALP, lo: 66, hi: 90, salt: 0x44, restP: 0.1, leap: 12, cadence: [[0, 4], [4, 12]] });
        for (const e of ev) if (e.dur >= 3) cx.add('hype', 'glock', e.step, 2, e.midi + 12, 0.4);
      }
    }
    // finale: sleigh bells in sixteenths, glock runs up the chord, toms like falling snow.
    pat(cx, 'finale', 'sleigh', '9565956595659565', 0.8);
    for (let i = 0; i < 8; i++) cx.add('finale', 'glock', i * 2, 1.5, arp[(i * 2) % arp.length]! + 12, 0.4);
    pat(cx, 'finale', 'tom', '..........5.7.9.', 0.8, 55);
  },
};

// ================= EMBASSY: spy lounge =================
// A harmonic minor, 120 bpm. Surf-twang guitar, bongos and a conga, a prowling bass, sneaky chords.
const ei = d(0, Q.mmaj7), ei7 = d(0, Q.min7), eiv = d(5, Q.min7), eV = d(7, Q.dom7), ebII = d(1, Q.maj7), ebVI = d(8, Q.maj7);
const SPY: readonly Rhythm[] = [
  [[0, 2], [2, 1], [3, 1], [4, 2], [6, 2], [8, 3], [11, 1], [12, 4]], [[0, 1], [1, 1], [2, 2], [4, 1], [5, 1], [6, 2], [8, 4], [12, 2], [14, 2]],
  [[0, 4], [4, 2], [6, 2], [8, 2], [10, 2], [12, 4]], [[2, 2], [4, 2], [8, 2], [10, 1], [11, 1], [12, 4]],
];
export const EMBASSY: TrackSpec = {
  id: 'embassy', tonic: 9, scale: [0, 2, 3, 5, 7, 8, 11],
  form: {
    major: [
      sec('intro', 4, [ei, ei, eiv, eV]),
      sec('A', 8, [ei, ei, eiv, eiv, eV, eV, ei7, ebII], [ei, ebVI, eiv, eV, ei, ebII, eV, ei], [d(1, Q.dom7)]),
      sec('A2', 8, [ei, ei, eiv, eiv, eV, eV, ei7, ebII], [ei, ebVI, eiv, eV, ei, ebII, eV, ei], [d(1, Q.dom7)]),
      sec('B', 8, [ebVI, eV, ei, eiv, ebVI, eV, ei, eV]),
      sec('A', 8, [ei, ei, eiv, eiv, eV, eV, ei7, ebII], [ei, ebVI, eiv, eV, ei, ebII, eV, ei]),
      sec('bridge', 8, [eiv, eiv, ei, ei, ebVI, eV, ebII, eV]),
      sec('break', 4, [ei, ebII, ei, eV]),
      sec('A2', 8, [ei, ei, eiv, eiv, eV, eV, ei7, ebII], [ei, ebVI, eiv, eV, ei, ebII, eV, ei]),
      sec('B', 8, [ebVI, eV, ei, eiv, ebVI, eV, ei, eV]),
      sec('A', 8, [ei, ei, eiv, eiv, eV, eV, ei7, ebII], [ei, ebVI, eiv, eV, ei, ebII, eV, ei]),
      sec('B', 8, [ebVI, eV, ei, eiv, ebVI, eV, ei, eV]),
      sec('outro', 4, [eiv, eV, ei, ei]),
    ],
  },
  build(cx) {
    const kind = cx.sec.kind;
    const root = rootMidi(cx, 33);
    const open = kind === 'intro' || kind === 'break' || kind === 'outro';
    const fk = fillKind(cx);
    // calm: a stalking bass, bongos, a muted shaker, short sneaky chord plinks.
    bassLine(cx, 'calm', 'fbass', open ? '9.....5.....7...' : '9..5..7.9..5..7.', [0, 0, 7, 0, 5, 7], 0.85, 33, 2);
    pat(cx, 'calm', 'bongo', '..7.5...5.7.....', 0.9, 74);
    pat(cx, 'calm', 'bongo', '9.......5.......', 0.9, 66);
    pat(cx, 'calm', 'shaker', '4.3.4.3.4.3.4.3.', 0.8);
    comp(cx, 'calm', 'twang', '...5.......5..7.', 0.55, 57, 1.5);
    if (cx.barIn % 4 === 0) cx.add('calm', 'vibes', 0, 6, toneMidi(cx, 2, 76), 0.4);

    // combat: rim clicks, congas, kick, offbeat twang stabs.
    pat(cx, 'combat', 'kick', '9......5..9.....', 0.8);
    pat(cx, 'combat', 'rim', '....8.......8...', 0.9);
    pat(cx, 'combat', 'hat', '5.3.5.3.5.3.5.3.', 0.7);
    pat(cx, 'combat', 'bongo', '.5.7.5.7.5.7.5.7', 0.8, 70);
    comp(cx, 'combat', 'twang', '9..5..9...5.....', 0.6, 52, 2);
    if (cx.barIn % 4 === 3) { if (fk === 0) roll(cx, 'combat', 'bongo', 10, 0.3, 0.9, 72); else pat(cx, 'combat', 'tom', '............5.79', 0.8, 50); }

    // hype: the twang lead, tremolo-picked in the bridge.
    if (kind !== 'intro' && kind !== 'break') {
      const ev = melody(cx, { layer: 'hype', inst: 'twang', rhythms: SPY, lo: 64, hi: 88, salt: 0x58, restP: 0.1, cadence: [[0, 4], [4, 12]] });
      if (kind === 'bridge') for (const e of ev) for (let s = e.step + 1; s < e.step + e.dur - 0.5 && s < 16; s += 1) cx.add('hype', 'twang', s, 1, e.midi, 0.4);
    }
    // finale: sixteenth shaker, a rising twang arpeggio, bongo rolls.
    pat(cx, 'finale', 'shaker', '6465646564656465', 0.9);
    const arp = chordNotes(cx.chord, 57, 81);
    for (let s = 0; s < 16; s += 2) cx.add('finale', 'twang', s, 2, arp[(s / 2) % arp.length]!, 0.45);
    pat(cx, 'finale', 'clap', '....6.......6...', 0.8);
    if (cx.barIn % 2 === 1) roll(cx, 'finale', 'bongo', 12, 0.4, 0.9, 74);
    cx.add('finale', 'fbass', 0, 4, root + 12, 0.6);
  },
};

// ================= AIRBASE: military-aviation anthem drive =================
// B-flat major, 130 bpm. A propeller hum under everything, rolling snares, brass stabs and a heroic horn.
const vI = d(0, Q.maj), vV = d(7, Q.maj), vvi = d(9, Q.min), vIV = d(5, Q.maj), vbVII = d(10, Q.maj);
const ANTHEM: readonly Rhythm[] = [
  [[0, 3], [3, 1], [4, 4], [8, 3], [11, 1], [12, 4]], [[0, 2], [2, 2], [4, 2], [6, 2], [8, 4], [12, 2], [14, 2]],
  [[0, 4], [4, 2], [6, 2], [8, 3], [11, 1], [12, 4]], [[0, 1], [1, 1], [2, 2], [4, 4], [8, 1], [9, 1], [10, 2], [12, 4]],
];
export const AIRBASE: TrackSpec = {
  id: 'airbase', tonic: 10, scale: [0, 2, 4, 5, 7, 9, 11],
  form: {
    major: [
      sec('intro', 4, [vI, vbVII, vIV, vV]),
      sec('A', 8, [vI, vV, vvi, vIV, vI, vIV, vV, vV], [vI, vvi, vIV, vV, vI, vIV, vV, vV], [d(2, Q.dom7)]),
      sec('A2', 8, [vI, vV, vvi, vIV, vI, vIV, vV, vV], [vI, vvi, vIV, vV, vI, vIV, vV, vV], [d(2, Q.dom7)]),
      sec('B', 8, [vIV, vV, vI, vvi, vIV, vV, vI, vI], [vIV, vV, vvi, vI, vIV, vV, vI, vV]),
      sec('A', 8, [vI, vV, vvi, vIV, vI, vIV, vV, vV], [vI, vvi, vIV, vV, vI, vIV, vV, vV]),
      sec('bridge', 8, [vbVII, vIV, vI, vI, vbVII, vIV, vV, vV]),
      sec('B', 8, [vIV, vV, vI, vvi, vIV, vV, vI, vI], [vIV, vV, vvi, vI, vIV, vV, vI, vV]),
      sec('break', 4, [vI, vI, vIV, vV]),
      sec('A2', 8, [vI, vV, vvi, vIV, vI, vIV, vV, vV], [vI, vvi, vIV, vV, vI, vIV, vV, vV]),
      sec('bridge', 8, [vbVII, vIV, vI, vI, vbVII, vIV, vV, vV]),
      sec('B', 8, [vIV, vV, vI, vvi, vIV, vV, vI, vI]),
      sec('outro', 4, [vIV, vV, vI, vI]),
    ],
  },
  build(cx) {
    const kind = cx.sec.kind;
    const root = rootMidi(cx, 34);
    const open = kind === 'intro' || kind === 'break' || kind === 'outro';
    const fk = fillKind(cx);
    // calm: the propeller hum, steady eighth-note bass, soft horn pad, hats.
    cx.add('calm', 'drone', 0, 16, rootMidi(cx, 34), 0.9);
    bassLine(cx, 'calm', 'bass', open ? '9...5...9...5...' : '9.5.9.5.9.5.9.5.', [0, 0, 12, 0, 7], 0.8, 34, 1.5);
    voicing(cx, 'calm', 'pad', 0.55, 58, 0, 16);
    pat(cx, 'calm', 'hat', '..5...5...5...5.', 0.7);
    pat(cx, 'calm', 'kick', '9.......5.......', 0.5);

    // combat: rolling snares, driving kick, brass stabs on the off-beats.
    pat(cx, 'combat', 'kick', '9..5..5.9...5...', 0.9);
    pat(cx, 'combat', 'snare', cx.barIn % 2 === 0 ? '....9..5....9.57' : '....9.7.5...9.9.', 0.9);
    comp(cx, 'combat', 'stab', '..7...7...7...7.', 0.8, 55, 1);
    if (cx.barIn % 4 === 3) { if (fk === 0) roll(cx, 'combat', 'snare', 8, 0.3, 1); else { roll(cx, 'combat', 'snare', 12, 0.4, 1); pat(cx, 'combat', 'tom', '..........7.9...', 0.9, 45); } }

    // hype: the horn, with bells on its long notes.
    if (kind !== 'intro' && kind !== 'break') {
      const ev = melody(cx, { layer: 'hype', inst: 'lead', rhythms: ANTHEM, lo: 70, hi: 89, salt: 0x66, restP: 0.05, cadence: [[0, 4], [4, 12]] });
      for (const e of ev) if (e.dur >= 3) cx.add('hype', 'glock', e.step, 2, e.midi + 12, 0.45);
    }
    if (cx.barIn === 0 && kind === 'A') cx.add('hype', 'tom', 0, 1, 50, 0.9);
    // finale: sixteenth snare rolls, timpani, the horn a third up, a crash on the phrase.
    pat(cx, 'finale', 'snare', '5.5.7.5.5.5.7.5.', 0.7);
    pat(cx, 'finale', 'tom', '9.....7.....9.7.', 0.9, 43);
    for (const s of [0, 4, 8, 12]) cx.add('finale', 'bass', s, 3, root + (s % 8 === 0 ? 0 : 12), 0.7);
    if (cx.barIn % 4 === 0) cx.add('finale', 'ohat', 0, 1, 0, 0.9);
    if (kind !== 'intro' && kind !== 'break') melody(cx, { layer: 'finale', inst: 'lead', rhythms: ANTHEM, lo: 73, hi: 92, salt: 0x67, restP: 0.05, vel: 0.55, cadence: [[0, 4], [4, 12]] });
  },
};

// ================= WASTELAND: dusty western =================
// E minor pentatonic, 98 bpm. A baritone guitar riff, stomp and clap, a lonesome whistle, wind.
const wi = d(0, Q.min), wVII = d(10, Q.maj), wVI = d(8, Q.maj), wV = d(7, Q.dom7), wiv = d(5, Q.min);
const LONE: readonly Rhythm[] = [
  [[0, 6], [6, 2], [8, 4], [12, 4]], [[0, 4], [4, 4], [8, 2], [10, 2], [12, 4]], [[2, 4], [6, 2], [8, 6], [14, 2]], [[0, 2], [2, 2], [4, 6], [10, 2], [12, 4]],
];
export const WASTELAND: TrackSpec = {
  id: 'wasteland', tonic: 4, scale: [0, 3, 5, 6, 7, 10],
  form: {
    major: [
      sec('intro', 4, [wi, wi, wVII, wi]),
      sec('A', 8, [wi, wVII, wi, wVII, wi, wVI, wVII, wV], [wi, wVII, wVI, wVII, wi, wiv, wVII, wV], [wVII]),
      sec('A2', 8, [wi, wVII, wi, wVII, wi, wVI, wVII, wV], [wi, wVII, wVI, wVII, wi, wiv, wVII, wV], [wVII]),
      sec('B', 8, [wVI, wVII, wi, wi, wVI, wVII, wV, wV]),
      sec('A', 8, [wi, wVII, wi, wVII, wi, wVI, wVII, wV], [wi, wVII, wVI, wVII, wi, wiv, wVII, wV]),
      sec('bridge', 8, [wiv, wi, wiv, wi, wVI, wVII, wV, wV]),
      sec('B', 8, [wVI, wVII, wi, wi, wVI, wVII, wV, wV]),
      sec('break', 4, [wi, wi, wVII, wV]),
      sec('A2', 8, [wi, wVII, wi, wVII, wi, wVI, wVII, wV], [wi, wVII, wVI, wVII, wi, wiv, wVII, wV]),
      sec('outro', 4, [wiv, wVII, wi, wi]),
    ],
  },
  build(cx) {
    const kind = cx.sec.kind;
    const root = rootMidi(cx, 40);
    const open = kind === 'intro' || kind === 'break' || kind === 'outro';
    const fk = fillKind(cx);
    // calm: wind over dust, a slow low pulse, the baritone guitar picking the chord.
    if (cx.barIn % 2 === 0) cx.add('calm', 'wind', 0, 32, 0, 0.9);
    pat(cx, 'calm', 'stomp', '7.......4.......', 0.9);
    voicing(cx, 'calm', 'padair', 0.9, 52, 0, 16);
    const arp = chordNotes(cx.chord, 40, 60);
    [0, 4, 8, 12].forEach((s, i) => { if (!open || i % 2 === 0) cx.add('calm', 'bgtr', s + 0.05, 3, arp[(i * 2 + cx.barIn) % arp.length]!, 0.85); });
    if (cx.r() < 0.5) cx.add('calm', 'dust', Math.floor(cx.r() * 16), 1, 0, 0.8);

    // combat: stomp stomp clap, a gritty riff, tambourine.
    pat(cx, 'combat', 'stomp', '9.......9.......', 0.9);
    pat(cx, 'combat', 'clap', '....9.......9...', 0.9);
    pat(cx, 'combat', 'shaker', kind === 'break' ? '................' : '5.3.5.3.5.3.5.3.', 0.9);
    bassLine(cx, 'combat', 'bgtr', '9..5..7...5.7...', [0, 0, 12, 7, 10, 12], 0.8, 40, 2);
    if (cx.barIn % 4 === 3) { if (fk === 0) pat(cx, 'combat', 'tom', '........5.7.9.9.', 0.9, 45); else roll(cx, 'combat', 'clap', 12, 0.3, 0.9); }

    // hype: the lonesome whistle; the bridge adds the baritone an octave below.
    if (kind !== 'intro' && kind !== 'break') {
      const ev = melody(cx, { layer: 'hype', inst: 'whistle', rhythms: LONE, lo: 69, hi: 89, salt: 0x73, restP: 0.1, cadence: [[0, 4], [4, 12]] });
      if (kind === 'bridge') for (const e of ev) cx.add('hype', 'bgtr', e.step, e.dur, e.midi - 24, 0.6);
    }
    // finale: a tambourine on every sixteenth, octave-picked riff, tom rolls, the wind rising.
    pat(cx, 'finale', 'shaker', '9565956595659565', 0.8);
    pat(cx, 'finale', 'bgtr', '9.5.9.5.9.5.9.5.', 0.6, root + 12);
    pat(cx, 'finale', 'tom', '..........5.7.9.', 0.9, 43);
    if (cx.barIn % 2 === 1) cx.add('finale', 'wind', 0, 16, 0, 1.2);
  },
};

// ================= RANGE: relaxed practice groove =================
// F major, 96 bpm, lo-fi. Electric piano, a soft kick, vinyl dust; thin on purpose so a long session does not tire the ear.
const gI = d(0, Q.maj7), gvi = d(9, Q.min7), gii = d(2, Q.min7), gV = d(7, Q.dom7), gIV = d(5, Q.maj7), giii = d(4, Q.min7);
const CHILL: readonly Rhythm[] = [
  [[0, 3], [3, 1], [4, 4], [8, 4], [12, 4]], [[2, 2], [4, 2], [8, 6], [14, 2]], [[0, 2], [2, 2], [4, 6], [10, 2], [12, 4]], [[0, 4], [4, 2], [6, 2], [8, 8]],
];
export const RANGE: TrackSpec = {
  id: 'range', tonic: 5, scale: [0, 2, 4, 7, 9], swing: 0.35,
  form: {
    major: [
      sec('intro', 4, [gI, gvi, gii, gV]),
      sec('A', 8, [gI, gvi, gii, gV, gI, gvi, gIV, gV], [gI, giii, gvi, gii, gIV, giii, gii, gV], [d(4, Q.dom7)]),
      sec('A2', 8, [gI, gvi, gii, gV, gI, gvi, gIV, gV], [gI, giii, gvi, gii, gIV, giii, gii, gV]),
      sec('B', 8, [gIV, giii, gii, gI, gIV, giii, gii, gV]),
      sec('A', 8, [gI, gvi, gii, gV, gI, gvi, gIV, gV], [gI, giii, gvi, gii, gIV, giii, gii, gV]),
      sec('bridge', 8, [gvi, gii, gV, gI, gvi, gii, gV, gV]),
      sec('B', 8, [gIV, giii, gii, gI, gIV, giii, gii, gV]),
      sec('break', 4, [gI, gIV, gI, gV]),
      sec('A2', 8, [gI, gvi, gii, gV, gI, gvi, gIV, gV], [gI, giii, gvi, gii, gIV, giii, gii, gV]),
      sec('outro', 4, [gIV, gii, gI, gI]),
    ],
  },
  build(cx) {
    const kind = cx.sec.kind;
    const open = kind === 'intro' || kind === 'break' || kind === 'outro';
    // Everything here is kept light: low velocities and few notes.
    comp(cx, 'calm', 'epiano', open ? '9...............' : '9.......5.....5.', 0.62, 60, 3);
    bassLine(cx, 'calm', 'fbass', open ? '9.......' : '9.......5...5...', [0, 12, 7], 0.85, 33, 2);
    pat(cx, 'calm', 'kick', '9.......5.......', 0.55);
    voicing(cx, 'calm', 'padair', 0.55, 55, 0, 16);
    pat(cx, 'calm', 'shaker', '3.2.3.2.3.2.3.2.', 0.7);
    for (let k = 0; k < 3; k++) if (cx.r() < 0.7) cx.add('calm', 'dust', Math.floor(cx.r() * 16), 1, 0, 0.6);
    const bells = chordNotes(cx.chord, 76, 93);
    if (cx.barIn % 2 === 0 && cx.r() < 0.6) cx.add('calm', 'vibes', Math.floor(cx.r() * 6) * 2, 4, pick(cx.r, bells), 0.35);

    pat(cx, 'combat', 'rim', '....6.......6...', 0.7);
    pat(cx, 'combat', 'hat', '4.3.4.3.4.3.4.3.', 0.7);
    pat(cx, 'combat', 'kick', '..5.......5.....', 0.4);
    if (cx.barIn % 4 === 3) pat(cx, 'combat', 'rim', '..............57', 0.7);

    if (kind !== 'intro' && kind !== 'break') melody(cx, { layer: 'hype', inst: 'marimba', rhythms: CHILL, lo: 69, hi: 88, salt: 0x19, restP: 0.2, cadence: [[0, 4], [4, 12]], vel: 0.7 });
    pat(cx, 'finale', 'shaker', '4344434443444344', 0.7);
    pat(cx, 'finale', 'clap', '....5.......5...', 0.6);
    if (cx.barIn % 2 === 0) for (let i = 0; i < 4; i++) cx.add('finale', 'vibes', 8 + i * 2, 2, toneMidi(cx, i, 79), 0.3);
  },
};

// ================= OUTPOST (Zombies): a day to build by, a night to survive =================
// Day: D mixolydian, 112 bpm, a marimba ostinato, hammer clanks, a harp tune (all in the calm layer, which is all the day uses).
// Night: D phrygian (the same tonic, turned dark), 124 bpm, dread pads, a grinding bass, hull-metal hits and scrapes under the heartbeat.
const oI = d(0, Q.maj), obVII = d(10, Q.maj), oIV = d(5, Q.maj), ov = d(7, Q.min), ovi = d(9, Q.min);
const BUILD_TUNE: readonly Rhythm[] = [
  [[0, 3], [3, 1], [4, 4], [8, 3], [11, 1], [12, 4]], [[0, 2], [2, 2], [4, 2], [6, 2], [8, 4], [12, 4]], [[2, 2], [4, 4], [8, 2], [10, 2], [12, 4]], [[0, 4], [4, 2], [6, 2], [8, 2], [10, 1], [11, 1], [12, 4]],
];
const ni = d(0, Q.min), nbII = d(1, Q.maj), nbVI = d(8, Q.maj), nbVII = d(10, Q.maj), nviio = d(7, Q.dim), niv = d(5, Q.min);
const DREAD: readonly Rhythm[] = [
  [[0, 4], [4, 2], [6, 2], [8, 4], [12, 4]], [[0, 2], [2, 2], [4, 4], [8, 2], [10, 2], [12, 4]], [[0, 6], [6, 2], [8, 6], [14, 2]], [[0, 3], [3, 1], [4, 3], [7, 1], [8, 8]],
];
export const OUTPOST: TrackSpec = {
  id: 'outpost', tonic: 2, scale: [0, 2, 4, 5, 7, 9, 10],
  form: {
    major: [
      sec('intro', 4, [oI, obVII, oIV, oI]),
      sec('A', 8, [oI, obVII, oIV, oI, oI, obVII, oIV, ov], [oI, oIV, obVII, oIV, oI, obVII, oIV, obVII], [ovi]),
      sec('A2', 8, [oI, obVII, oIV, oI, oI, obVII, oIV, ov], [oI, oIV, obVII, oIV, oI, obVII, oIV, obVII], [ovi]),
      sec('B', 8, [ovi, oIV, oI, obVII, ovi, oIV, obVII, ov]),
      sec('bridge', 8, [oIV, oI, obVII, oI, oIV, oI, obVII, ov]),
      sec('break', 4, [oI, oI, obVII, oIV]),
      sec('A', 8, [oI, obVII, oIV, oI, oI, obVII, oIV, ov], [oI, oIV, obVII, oIV, oI, obVII, oIV, obVII]),
      sec('B', 8, [ovi, oIV, oI, obVII, ovi, oIV, obVII, ov]),
      sec('A2', 8, [oI, obVII, oIV, oI, oI, obVII, oIV, ov], [oI, oIV, obVII, oIV, oI, obVII, oIV, obVII]),
      sec('bridge', 8, [oIV, oI, obVII, oI, oIV, oI, obVII, ov]),
      sec('outro', 4, [oIV, obVII, oI, oI]),
    ],
    minor: [
      sec('intro', 8, [ni, ni, nbII, ni, ni, ni, nbII, nbII]),
      sec('A', 8, [ni, nbII, ni, nbVII, ni, nbII, nbVI, nviio], [ni, nbII, ni, nbVI, niv, nbII, ni, nviio], [nbII]),
      sec('A2', 8, [ni, nbII, ni, nbVII, ni, nbII, nbVI, nviio], [ni, nbII, ni, nbVI, niv, nbII, ni, nviio], [nbVII]),
      sec('B', 8, [nbVI, nbVII, ni, ni, nbVI, nbII, nbVII, ni]),
      sec('break', 8, [ni, ni, nbII, ni, ni, ni, nbII, nbII]),
      sec('build', 8, [ni, nbVII, nbVI, nbVII, ni, nbVII, nbVI, nbII]),
      sec('A', 8, [ni, nbII, ni, nbVII, ni, nbII, nbVI, nviio], [ni, nbII, ni, nbVI, niv, nbII, ni, nviio]),
      sec('B', 8, [nbVI, nbVII, ni, ni, nbVI, nbII, nbVII, ni]),
      sec('A2', 8, [ni, nbII, ni, nbVII, ni, nbII, nbVI, nviio], [ni, nbII, ni, nbVI, niv, nbII, ni, nviio]),
      sec('B', 8, [nbVI, nbVII, ni, ni, nbVI, nbII, nbVII, ni]),
      sec('outro', 4, [ni, nbII, ni, ni]),
    ],
  },
  build(cx) {
    if (cx.mode === 'minor') night(cx); else day(cx);
  },
};

function day(cx: Cx) {
  const kind = cx.sec.kind;
  const open = kind === 'intro' || kind === 'break' || kind === 'outro';
  const root = rootMidi(cx, 38);
  const fk = fillKind(cx);
  // The day is the calm layer alone: it has to carry a whole track.
  const notes = chordNotes(cx.chord, 62, 84);
  const ost = open ? '9...5...9...5...' : '9.5.7.5.9.5.7.5.';
  let k = 0;
  for (let s = 0; s < 16; s++) if (ost[s] !== '.') cx.add('calm', 'marimba', s, 2, notes[(k++ * 2 + (kind === 'bridge' ? cx.barIn : 0)) % notes.length]!, Number(ost[s]) / 9 * 0.7);
  bassLine(cx, 'calm', 'fbass', open ? '9.......5.......' : '9..5..7.9..5..7.', [0, 12, 7, 0, 10], 0.85, 33, 2);
  pat(cx, 'calm', 'clank', kind === 'bridge' ? '....5.....5.3...' : '....4.....3.....', 0.8, 70);
  pat(cx, 'calm', 'rim', '....5.......5...', 0.7);
  pat(cx, 'calm', 'shaker', '4.3.4.3.4.3.4.3.', 0.8);
  pat(cx, 'calm', 'kick', open ? '9...............' : '9.......5..5....', 0.55);
  voicing(cx, 'calm', 'padair', 0.7, 55, 0, 16);
  if (kind !== 'intro' && kind !== 'break') melody(cx, { layer: 'calm', inst: 'harp', rhythms: BUILD_TUNE, lo: 69, hi: 88, salt: 0x2e, restP: 0.12, cadence: [[0, 4], [4, 12]] });
  if (cx.barIn % 4 === 3) { if (fk === 0) pat(cx, 'calm', 'clank', '............5.79', 0.8, 66); else pat(cx, 'calm', 'tom', '..............57', 0.7, 50); }
  if (cx.barIn === 0 && (kind === 'A' || kind === 'bridge')) cx.add('calm', 'chime', 0, 2, notes.at(-1)!, 0.5);
  void root;
  // a little in the louder layers, should a fight break out by day
  pat(cx, 'combat', 'snare', '....6.......6...', 0.7);
  melody(cx, { layer: 'hype', inst: 'whistle', rhythms: BUILD_TUNE, lo: 74, hi: 91, salt: 0x2f, restP: 0.1, vel: 0.8 });
}

function night(cx: Cx) {
  const kind = cx.sec.kind;
  const sparse = kind === 'intro' || kind === 'break' || kind === 'outro';
  const root = rootMidi(cx, 30);
  const fk = fillKind(cx);
  // calm: the dread pad, a slow grinding pulse, hull hits and scrapes in the dark.
  voicing(cx, 'calm', 'dread', 0.8, 48, 0, 16);
  bassLine(cx, 'calm', 'tbass', sparse ? '9.......5.......' : '9...5...7...5...', [0, 0, 1, 0], 0.7, 30, 2);
  if (cx.r() < 0.5) cx.add('calm', 'metal', Math.floor(cx.r() * 16), 2, 48 + Math.floor(cx.r() * 12), 0.6);
  if (cx.barIn % 4 === 0) cx.add('calm', 'scrape', 0, 6, 0, 0.8);
  if (sparse && cx.barIn % 2 === 0) cx.add('calm', 'wind', 0, 32, 0, 1);
  pat(cx, 'calm', 'hat', '....4.......4...', 0.4);
  // heart: the heartbeat, thickening with the horde, over a root pedal (the layer is the night's alone).
  pat(cx, 'heart', 'heart', '9.7.....9.7.....', 1, 0, 1, 0);
  pat(cx, 'heart', 'heart', '....9.6.....9.6.', 0.9, 0, 1, 1);
  pat(cx, 'heart', 'heart', '...5...5...5...5', 0.6, 0, 1, 2);
  cx.add('heart', 'bass', 0, 16, root - 12 + (root - 12 < 24 ? 12 : 0), 0.6, 0);

  // combat: a march that stalks: stomp and kick, clap, grinding eighth bass, a tritone stab.
  pat(cx, 'combat', 'kick', kind === 'break' ? '9...............' : '9.....5.9.5.....', 0.9);
  pat(cx, 'combat', 'stomp', '9.......9.......', 0.6);
  pat(cx, 'combat', 'clap', '....8.......8...', 0.8);
  pat(cx, 'combat', 'clank', '..............7.', 0.7, 58);
  bassLine(cx, 'combat', 'tbass', '9.9.9.9.9.9.9.9.', [0, 0, 0, 1, 0, 0, 7, 1], 0.75, 30, 1);
  comp(cx, 'combat', 'stab', '..9.....7.......', 0.7, 55, 1);
  cx.add('combat', 'metal', 6, 2, root + 30, 0.5);
  if (kind === 'build') roll(cx, 'combat', 'snare', cx.barIn >= 6 ? 0 : 8, 0.25, 0.9);
  else if (cx.barIn % 4 === 3) { if (fk === 0) roll(cx, 'combat', 'snare', 12, 0.3, 0.9); else pat(cx, 'combat', 'tom', '........5.7.9.9.', 0.9, 40); }

  // hype: a dark brass line in phrygian, tritone chimes at its phrase ends.
  if (kind !== 'intro' && kind !== 'break') {
    melody(cx, { layer: 'hype', inst: 'lead', rhythms: DREAD, lo: 55, hi: 76, salt: 0x81, restP: 0.1, scale: [0, 1, 3, 5, 6, 7, 8, 10], cadence: [[0, 4], [4, 12]] });
    if (cx.last) cx.add('hype', 'chime', 12, 3, root + 42, 0.5);
  }
  // finale: a low acid arpeggio, hull rolls, scrapes on the phrase turn.
  const arp = chordNotes(cx.chord, 42, 66);
  for (let s = 0; s < 16; s++) cx.add('finale', 'acid', s, 1, arp[[0, 1, 2, 1, 0, 2, 1, 3][s % 8]! % arp.length]!, s % 4 === 0 ? 0.8 : 0.5);
  pat(cx, 'finale', 'metal', '.......5.5.5.5.9', 0.8, 58);
  pat(cx, 'finale', 'ohat', '..9...9...9...9.', 0.7);
  if (cx.barIn % 8 === 7) cx.add('finale', 'scrape', 8, 8, 0, 1);
}
