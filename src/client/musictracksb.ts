/**
 * Scores for the railyard (a boogie-woogie blues), the summit (an alpine chiptune polka), the embassy (sixties spy surf), the airbase (a brass
 * anthem), the wasteland (a spaghetti-western waltz), the shooting range (lo-fi boom-bap) and the Zombies outpost (a workshop tune by day,
 * horror synthwave by night). Same shape as musictracksa.ts: a written theme, a form whose A and B carry it, and a `build` per bar.
 */
import { chordNotes, comp, d, fillKind, hookNotes, hookPart, pat, pick, play, Q, riff, roll, rootMidi, stageHook, toneMidi, voicing, type Cx, type Section, type TrackSpec } from './musicgen.ts';
import { theme } from './musichook.ts';

const sec = (kind: Section['kind'], bars: number, prog: Section['prog'], o: { alt?: Section['alt']; lift?: number } = {}): Section => ({ kind, bars, prog, ...o });

// ================= RAILYARD: boogie-woogie blues =================
// A, a twelve-bar blues, 120 bpm shuffle. A harmonica and a bottleneck slide, a honky-tonk piano rolling the boogie, an upright, the train's chug.
const rI = d(0, Q.dom7), rIV = d(5, Q.dom7), rV = d(7, Q.dom7);
const BLUES12 = [rI, rI, rI, rI, rIV, rIV, rI, rI, rV, rIV, rI, rV], R_B = [rIV, rIV, rI, rI, rIV, rIV, rV, rV];
export const RAILYARD: TrackSpec = {
  id: 'railyard', tonic: 9, scale: [0, 2, 4, 5, 7, 9, 10], swing: 0.6,
  // Twelve-bar harmonica blues: a slide from the minor third up into the major (C-C#), up the chord to the root, then the same lick on the IV.
  theme: theme({
    A: 'C5:1 C#5:3 E5:2 G5:2 A5:4 r:4 | G5:2 E5:2 G5:2 E5:2 C5:1 C#5:3 A4:4 | C5:1 C#5:3 E5:2 G5:2 A5:2 C6:2 A5:4 | G5:2 E5:2 Eb5:2 D5:2 C#5:8 |'
      + ' F5:1 F#5:3 A5:2 C6:2 A5:4 r:4 | C6:2 A5:2 C6:2 A5:2 F5:1 F#5:3 D5:4 | C5:1 C#5:3 E5:2 G5:2 A5:4 r:4 | G5:2 E5:2 G5:2 E5:2 C5:1 C#5:3 A4:4 |'
      + ' B5:2 B5:2 B5:2 G#5:2 E5:4 D5:4 | A5:2 A5:2 A5:2 F#5:2 D5:4 C5:4 | C5:1 C#5:3 E5:2 G5:2 A5:2 G5:2 E5:4 | B4:4 D5:4 E5:4 G#5:4',
    B: 'A5:8 F#5:4 D5:4 | C6:4 A5:4 F#5:8 | E5:8 C#5:4 A4:4 | G5:4 E5:4 C#5:8 | A5:8 F#5:4 A5:4 | C6:6 B5:2 A5:8 | G#5:8 E5:4 B4:4 | D5:4 E5:4 G#5:4 B5:4',
    bass: '1:2 3:2 5:2 6:2 7:2 6:2 5:2 3:2',
  }),
  form: {
    major: [
      sec('intro', 4, [rI, rI, rIV, rV]),
      sec('A', 12, BLUES12),
      sec('A2', 12, BLUES12),
      sec('B', 8, R_B),
      sec('A', 12, BLUES12),
      sec('break', 8, [rI, rI]),
      sec('A2', 12, BLUES12),
      sec('B', 8, R_B),
      sec('A', 12, BLUES12, { lift: 2 }),
      sec('outro', 4, [rIV, rI, rV, rI]),
    ],
  },
  build(cx) {
    const kind = cx.sec.kind;
    const root = rootMidi(cx, 33);
    const open = kind === 'intro' || kind === 'break';
    // The B is a stop-time chorus: the band hits the one and the harmonica wails over the gaps.
    const stop = kind === 'B';
    const fk = fillKind(cx);
    // calm: the train's brushed chug, the upright walking the boogie, the crossing bell.
    pat(cx, 'calm', 'chug', open ? '9.539.539.539.53' : '7.537.537.537.53', 0.6);
    if (stop) cx.add('calm', 'upright', 0, 3, root, 1);
    else riff(cx, 'calm', 'upright', 33, 0.85);
    if ((kind === 'intro' || kind === 'outro') && cx.barIn % 4 < 2) for (let s = 0; s < 16; s += 2) cx.add('calm', 'rbell', s, 1.5, s % 4 === 0 ? 88 : 91, 0.45);
    if (kind === 'break' && cx.barIn % 4 === 0) cx.add('calm', 'rbell', 0, 3, 88, 0.7);

    // combat: a honky-tonk piano rolling the boogie in the left hand and jabbing shuffled chords in the right, a kick and a backbeat.
    pat(cx, 'combat', 'kick', '9.......9.......', 0.75);
    pat(cx, 'combat', 'snare', stop ? '9...............' : '....9..5....9..5', 0.75);
    if (!stop) { riff(cx, 'combat', 'honky', 45, 0.45); comp(cx, 'combat', 'honky', '..7...5...7...5.', 0.35, 62, 1); }
    else comp(cx, 'combat', 'honky', '9...............', 0.5, 58, 2);
    if (cx.barIn % 4 === 3) { if (fk === 0) roll(cx, 'combat', 'snare', 8, 0.3, 0.9); else pat(cx, 'combat', 'tom', '........5.7.9.9.', 0.8, 50); }

    // The harmonica, bending into its notes; a bottleneck slide guitar takes the second chorus and shadows the harp an octave down.
    stageHook(cx, { lead: 'harmonica', alt: 'steel', calm: 'steel', calmVel: 0.28, dbl: 'steel', dblShift: -12, dblVel: 0.35, harm: 'harmonica', harmVel: 0.32 });

    // finale: the train opens up: a chug on every eighth, the bell on the beat, the piano's right hand pounding the beat.
    pat(cx, 'finale', 'chug', '9.9.9.9.9.9.9.9.', 0.7);
    for (const s of [0, 4, 8, 12]) cx.add('finale', 'rbell', s, 1.5, 88, 0.35);
    comp(cx, 'finale', 'honky', '7...5...7...5...', 0.25, 64, 1);
  },
};

// ================= SUMMIT: an alpine chiptune polka =================
// D major, 140 bpm. An eight-bit square lead and arpeggios, a chip kit, an accordion, sleigh bells and a glockenspiel.
const aI = d(0, Q.maj), aIV = d(5, Q.maj), aV = d(7, Q.maj), avi = d(9, Q.min), aII = d(2, Q.maj);
const L_A = [aI, aIV, aI, aV, aI, aIV, aV, aI], L_B = [avi, aIV, aI, aV, avi, aIV, aV, aV];
export const SUMMIT: TrackSpec = {
  id: 'summit', tonic: 2, scale: [0, 2, 4, 5, 7, 9, 11], swing: 0.15,
  // A yodel that flips between chest and head on every note (D-A-F#-A-D-A-F#), then the same zigzag on the IV; the B is an alpenhorn call.
  theme: theme({
    A: 'D5:2 A5:2 F#5:2 A5:2 D5:2 A5:2 F#5:4 | D5:2 B5:2 G5:2 B5:2 D5:2 B5:2 G5:4 | D5:2 A5:2 F#5:2 A5:2 D6:4 A5:4 | C#6:2 B5:2 A5:2 G5:2 E5:8 |'
      + ' D5:2 A5:2 F#5:2 A5:2 D5:2 A5:2 F#5:4 | D5:2 B5:2 G5:2 B5:2 D5:2 B5:2 G5:4 | E5:2 C#6:2 A5:2 C#6:2 E5:2 C#6:2 A5:4 | D6:4 A5:4 D5:8',
    B: 'B5:6 A5:2 F#5:8 | G5:6 F#5:2 D5:8 | A5:6 B5:2 A5:4 F#5:4 | E5:12 r:4 | B5:6 C#6:2 D6:8 | B5:6 A5:2 G5:8 | A5:4 E5:4 C#5:4 E5:4 | A5:16',
    bass: '1:2 r:2 8:2 r:2 5:2 r:2 8:2 r:2',
  }),
  form: {
    major: [
      sec('intro', 4, [aI, aIV, aI, aV]),
      sec('A', 8, L_A),
      sec('A2', 8, L_A),
      sec('B', 8, L_B),
      sec('A', 8, L_A),
      sec('bridge', 8, [aI, aII, aIV, aI, aI, aII, aIV, aV]),
      sec('B', 8, L_B),
      sec('A', 8, L_A),
      sec('bridge', 8, [aI, aII, aIV, aI, aI, aII, aIV, aV]),
      sec('break', 4, [aI, aIV]),
      sec('B', 8, L_B),
      sec('A2', 8, L_A, { lift: 2 }),
      sec('outro', 4, [aIV, aV, aI, aI]),
    ],
  },
  build(cx) {
    const kind = cx.sec.kind;
    const open = kind === 'intro' || kind === 'break' || kind === 'outro';
    const fk = fillKind(cx);
    // calm: an eight-bit polka: the bass bouncing oom-pah, the accordion's pah on the off-beats, sleigh bells, a glockenspiel twinkle.
    riff(cx, 'calm', 'bass', 38, 0.75);
    if (!open) comp(cx, 'calm', 'accordion', '..6...6...6...6.', 0.28, 60, 1.5);
    pat(cx, 'calm', 'sleigh', open ? '7...4...7...4...' : '7.4.7.4.7.4.7.4.', 0.75);
    const sp = chordNotes(cx.chord, 79, 100);
    for (let k = 0; k < (open ? 2 : 1); k++) cx.add('calm', 'glock', Math.floor(cx.r() * 8) * 2, 2, pick(cx.r, sp), 0.45);

    // combat: the chip kit (a noise snare on two and four, noise hats on the eighths, a short kick) and a chiptune arpeggio on every sixteenth.
    pat(cx, 'combat', 'kick', kind === 'break' ? '9...............' : '9.......9.......', 0.7);
    pat(cx, 'combat', 'chip', '....9.......9...', 0.9, 40);
    pat(cx, 'combat', 'chip', '6.4.6.4.6.4.6.4.', 0.7);
    const arp = chordNotes(cx.chord, 67, 91);
    for (let s = 0; s < 16; s++) cx.add('combat', 'square', s, 0.8, arp[(s + (s >> 2)) % arp.length]!, s % 4 === 0 ? 0.3 : 0.2);
    if (cx.barIn % 4 === 3) { if (fk === 0) roll(cx, 'combat', 'chip', 12, 0.3, 0.8, 40); else pat(cx, 'combat', 'tom', '..........5.7.9.', 0.8, 52); }

    // The chiptune square sings the yodel (the accordion takes the second verse), the glockenspiel's skeleton in calm.
    stageHook(cx, { lead: 'square', alt: 'accordion', calm: 'glock', calmVel: 0.28, dbl: 'accordion', dblShift: -12, dblVel: 0.3, harm: 'square', harmVel: 0.32, riffInst: 'square', riffLo: 38, riffShift: 36, riffVel: 0.4 });

    // finale: sleigh bells in sixteenths, glockenspiel runs up the chord, chip-snare rolls.
    pat(cx, 'finale', 'sleigh', '9565956595659565', 0.7);
    for (let i = 0; i < 8; i++) cx.add('finale', 'glock', i * 2, 1.5, arp[(i * 2) % arp.length]! + 12, 0.35);
    pat(cx, 'finale', 'chip', '..........5.7.9.', 0.8, 40);
  },
};

// ================= EMBASSY: sixties spy surf =================
// A harmonic minor, 126 bpm. A reverb-drenched guitar, a spy organ, a stalking bass, a surf kit and bongos.
const ei = d(0, Q.mmaj7), eiv = d(5, Q.min7), eV = d(7, Q.dom7), ebII = d(1, Q.maj7), ebVI = d(8, Q.maj7);
const X_A = [ei, ei, eiv, eiv, eV, eV, ei, ebII], X_B = [ebVI, eV, ei, eiv, ebVI, eV, ei, eV];
export const EMBASSY: TrackSpec = {
  id: 'embassy', tonic: 9, scale: [0, 2, 3, 5, 7, 8, 11],
  // A surf-twang spy riff: DAH-da DAH di-da, (rest) DAH DAAH, down to the sharp seventh; the turn lands on a sneaky flat-II chord.
  theme: theme({
    A: 'A5:3 A5:1 C6:2 B5:1 A5:1 r:2 G#5:2 E5:4 | A5:3 A5:1 C6:2 B5:1 A5:1 r:2 E6:6 | D6:3 D6:1 F6:2 E6:1 D6:1 r:2 C6:2 A5:4 | D6:3 D6:1 F6:2 E6:1 D6:1 r:2 A5:6 |'
      + ' B5:2 C6:1 B5:1 G#5:2 E5:2 F5:2 G#5:2 B5:4 | D6:2 C6:1 B5:1 G#5:2 F5:2 E5:8 | A5:3 A5:1 C6:2 B5:1 A5:1 r:2 G#5:2 E5:4 | D5:4 F5:4 Bb5:8',
    B: 'C6:6 B5:2 A5:8 | G#5:6 F5:2 E5:8 | E6:6 D6:2 C6:8 | F6:4 E6:4 D6:4 A5:4 | C6:6 B5:2 A5:8 | B5:4 G#5:4 F5:4 D5:4 | C6:4 B5:4 A5:4 E5:4 | G#5:8 B5:8',
    bass: '1:2 r:1 1:1 @3:2 @5:2 1:2 r:1 1:1 @7:2 @6:2',
  }),
  form: {
    major: [
      sec('intro', 4, [ei, ei, eiv, eV]),
      sec('A', 8, X_A),
      sec('A2', 8, X_A),
      sec('B', 8, X_B),
      sec('A', 8, X_A),
      sec('bridge', 8, [eiv, eiv, ei, ei, ebVI, eV, ebII, eV]),
      sec('break', 4, [ei, ei]),
      sec('B', 8, X_B),
      sec('A2', 8, X_A),
      sec('B', 8, X_B),
      sec('A', 8, X_A, { lift: 1 }),
      sec('outro', 4, [eiv, eV, ei, ei]),
    ],
  },
  build(cx) {
    const kind = cx.sec.kind;
    const root = rootMidi(cx, 33);
    const open = kind === 'intro' || kind === 'break' || kind === 'outro';
    const fk = fillKind(cx);
    // calm: the stalking bass, a held spy-organ chord, bongos, a ride ticking.
    riff(cx, 'calm', 'fbass', 33, 0.85);
    comp(cx, 'calm', 'organ', '9...............', 0.22, 57, 15);
    pat(cx, 'calm', 'bongo', '..7.5...5.7.....', 0.85, 74);
    pat(cx, 'calm', 'bongo', '9.......5.......', 0.85, 66);
    pat(cx, 'calm', 'ride', open ? '9.......9.......' : '9...9...9...9...', 0.55);
    if (cx.barIn % 4 === 0 && hookPart(cx) === null) cx.add('calm', 'vibes', 0, 6, toneMidi(cx, 2, 76), 0.4);

    // combat: a surf kit (kick, a fat snare on two and four, the ride in eighths), reverb-guitar chord stabs, surf tom rolls into each four.
    pat(cx, 'combat', 'krock', '9......5..9.....', 0.8);
    pat(cx, 'combat', 'srock', '....8.......8...', 0.75);
    pat(cx, 'combat', 'ride', '6.4.6.4.6.4.6.4.', 0.6);
    comp(cx, 'combat', 'twang', '9..5..9...5.....', 0.4, 52, 1.5);
    pat(cx, 'combat', 'bongo', '.5.7.5.7.5.7.5.7', 0.7, 70);
    if (cx.barIn % 4 === 3) { if (fk === 0) pat(cx, 'combat', 'tom', '........6.7.8.9.', 0.85, 50); else roll(cx, 'combat', 'bongo', 10, 0.3, 0.9, 72); }

    // The reverb guitar's spy riff (the organ takes the second time), the vibes' skeleton in calm; the bridge hands the bass line to the guitar.
    stageHook(cx, { lead: 'twang', alt: 'organ', calm: 'vibes', calmVel: 0.3, dbl: 'twang', dblShift: -12, dblVel: 0.35, harm: 'twang', harmVel: 0.3, riffInst: 'twang', riffLo: 33, riffShift: 24, riffVel: 0.5 });

    // finale: a sixteenth shaker, a crash on the phrase, organ stabs off the beat, the bass doubled up.
    pat(cx, 'finale', 'shaker', '6465646564656465', 0.8);
    if (cx.barIn % 4 === 0) cx.add('finale', 'crash', 0, 1, 0, 0.7);
    comp(cx, 'finale', 'organ', '......6.......6.', 0.25, 62, 1);
    cx.add('finale', 'fbass', 0, 4, root + 12, 0.5);
  },
};

// ================= AIRBASE: a brass anthem =================
// B-flat major, 116 bpm. Trumpets and French horns, trombone stabs, a tuba, timpani, military snares, the propeller hum.
const vI = d(0, Q.maj), vV = d(7, Q.maj), vvi = d(9, Q.min), vIV = d(5, Q.maj), vbVII = d(10, Q.maj), viii = d(4, Q.min);
const V_A = [vI, vV, vvi, vIV, vI, vIV, vV, vV], V_B = [vIV, vV, viii, vvi, vIV, vV, vI, vI];
export const AIRBASE: TrackSpec = {
  id: 'airbase', tonic: 10, scale: [0, 2, 4, 5, 7, 9, 11],
  // A horn call that leaps a fourth and climbs (F, Bb-C-D) then rests on the dominant; the B drives up the chords in eighths.
  theme: theme({
    A: 'F5:4 Bb5:6 C6:2 D6:4 | C6:8 A5:4 F5:4 | G5:4 D6:6 C6:2 Bb5:4 | Bb5:12 G5:4 | F5:4 Bb5:6 C6:2 D6:4 | Eb6:8 Bb5:4 G5:4 | C6:4 A5:4 F5:4 C6:4 | C6:12 r:4',
    B: 'Eb5:2 G5:2 Bb5:2 Eb6:6 Bb5:4 | C6:2 A5:2 F5:2 A5:2 C6:8 | D6:2 A5:2 F5:2 A5:2 D6:4 A5:4 | Bb5:8 G5:8 |'
      + ' Eb5:2 G5:2 Bb5:2 D6:2 Eb6:4 F6:4 | C6:2 F6:2 C6:2 A5:2 F5:8 | D6:4 C6:4 Bb5:4 D6:4 | Bb5:12 r:4',
    bass: '1:2 1:2 8:2 1:2 5:2 1:2 8:2 5:2',
  }),
  form: {
    major: [
      sec('intro', 4, [vI, vbVII, vIV, vV]),
      sec('A', 8, V_A),
      sec('A2', 8, V_A),
      sec('B', 8, V_B),
      sec('A', 8, V_A),
      sec('bridge', 8, [vbVII, vIV, vI, vI, vbVII, vIV, vV, vV]),
      sec('B', 8, V_B),
      sec('break', 4, [vI, vV]),
      sec('B', 8, V_B),
      sec('A2', 8, V_A),
      sec('A', 8, V_A, { lift: 2 }),
      sec('outro', 4, [vIV, vV, vI, vI]),
    ],
  },
  build(cx) {
    const kind = cx.sec.kind;
    const root = rootMidi(cx, 34);
    const fk = fillKind(cx);
    // calm: the propeller hum, the tuba's riff, French horns holding the chord, a timpani stroke opening each phrase.
    cx.add('calm', 'drone', 0, 16, rootMidi(cx, 34), 0.7);
    riff(cx, 'calm', 'tuba', 34, 0.8);
    comp(cx, 'calm', 'horn', '9...............', 0.22, 53, 15);
    pat(cx, 'calm', 'hat', '..5...5...5...5.', 0.5);
    if (cx.barIn % 4 === 0) cx.add('calm', 'timp', 0, 4, rootMidi(cx, 38), 0.7);

    // combat: rolling military snares, a bass drum, trombone stabs off the beat, the timpani on one and three, a crash on each phrase.
    pat(cx, 'combat', 'krock', '9.......9.......', 0.75);
    pat(cx, 'combat', 'snare', cx.barIn % 2 === 0 ? '....9..5....9.57' : '....9.7.5...9.9.', 0.85);
    comp(cx, 'combat', 'bone', '..7...7...7...7.', 0.38, 50, 1.2);
    pat(cx, 'combat', 'timp', '9.......6.......', 0.75, rootMidi(cx, 38), 3);
    if (cx.barIn === 0) cx.add('combat', 'crash', 0, 1, 0, 0.75);
    if (cx.barIn % 4 === 3) { if (fk === 0) roll(cx, 'combat', 'snare', 8, 0.3, 1); else { roll(cx, 'combat', 'snare', 12, 0.4, 1); pat(cx, 'combat', 'timp', '..........7.9...', 0.9, rootMidi(cx, 38)); } }

    // French horns have the anthem, film-score style (trumpets take the second verse), bells an octave up, trumpets a third under in the finale.
    stageHook(cx, { lead: 'horn', alt: 'tpt', calm: 'glock', calmVel: 0.3, dbl: 'glock', dblShift: 12, dblVel: 0.3, harm: 'tpt', harmVel: 0.4, riffInst: 'bone', riffLo: 34, riffShift: 12, riffVel: 0.45 });
    if (cx.barIn === 0 && kind === 'A') cx.add('hype', 'tom', 0, 1, 50, 0.9);

    // finale: a snare roll on every sixteenth, the timpani rolling, the tuba pumping octaves, a crash each two bars.
    pat(cx, 'finale', 'snare', '5.5.7.5.5.5.7.5.', 0.6);
    pat(cx, 'finale', 'timp', '9.....7.....9.7.', 0.6, rootMidi(cx, 38));
    for (const s of [0, 4, 8, 12]) cx.add('finale', 'tuba', s, 3, root + (s % 8 === 0 ? 0 : 12), 0.55);
    if (cx.barIn % 2 === 0) cx.add('finale', 'crash', 0, 1, 0, 0.55);
  },
};

// ================= WASTELAND: a spaghetti-western waltz =================
// E minor, a slow 3/4 (80 crotchets a minute, written as 107 four-beat bars of twelve sixteenths). A whistle, a low reverb guitar, a mission bell.
const wi = d(0, Q.min), wVII = d(10, Q.maj), wVI = d(8, Q.maj), wV = d(7, Q.dom7), wiv = d(5, Q.min), wIII = d(3, Q.maj);
const W_A = [wi, wi, wVII, wVII, wVI, wVI, wV, wV], W_B = [wiv, wi, wiv, wV, wVI, wIII, wiv, wV];
export const WASTELAND: TrackSpec = {
  id: 'wasteland', tonic: 4, scale: [0, 2, 3, 5, 7, 8, 10],
  // A waltz in 3/4 for a lonesome whistle: a long low E, then a pickup that leaps the octave (E . . . B-E'), the same a step down on D.
  theme: theme({
    meter: 12,
    A: 'E5:8 B5:2 E6:2 | E6:6 D6:2 B5:4 | D5:8 A5:2 D6:2 | D6:6 C6:2 A5:4 | C6:4 B5:2 A5:2 G5:4 | E6:8 D6:2 C6:2 | B5:6 A5:2 F#5:2 D#5:2 | B5:12',
    B: 'E6:8 D6:2 C6:2 | B5:12 | A5:4 C6:4 E6:4 | D#6:8 B5:4 | G5:8 E5:2 G5:2 | D6:8 B5:2 G5:2 | C6:6 B5:2 A5:4 | F#5:12',
    bass: '1:8 5,:4',
  }),
  form: {
    major: [
      sec('intro', 4, [wi, wi, wVII, wi]),
      sec('A', 8, W_A),
      sec('A2', 8, W_A),
      sec('B', 8, W_B),
      sec('A', 8, W_A),
      sec('bridge', 8, [wVI, wVII, wi, wi, wiv, wi, wV, wV]),
      sec('B', 8, W_B),
      sec('break', 4, [wi, wi]),
      sec('A2', 8, W_A, { lift: 2 }),
      sec('outro', 4, [wiv, wVII, wi, wi]),
    ],
  },
  build(cx) {
    const kind = cx.sec.kind;
    const open = kind === 'intro' || kind === 'break' || kind === 'outro';
    const fk = fillKind(cx);
    // calm (in 3/4: twelve sixteenths a bar): wind over the dust, the low reverb guitar on the bass, a steel guitar strumming
    // two and three, the mission bell tolling the phrases.
    if (cx.barIn % 2 === 0) cx.add('calm', 'wind', 0, 32, 0, 0.8);
    riff(cx, 'calm', 'twang', 40, 0.7);
    if (!open || cx.barIn % 2 === 1) comp(cx, 'calm', 'steel', '....7...6...', 0.3, 55, 3, 0.03);
    if (cx.barIn % 4 === 0 && (kind === 'A' || kind === 'A2' || open)) cx.add('calm', 'bell', 0, 12, rootMidi(cx, 64), 0.45);
    if (cx.r() < 0.5) cx.add('calm', 'dust', Math.floor(cx.r() * 12) * 4 / 3, 1, 0, 0.7);

    // combat: boom, chick, chick: a stomp on one, claps on two and three, a tambourine on the eighths, the horses' gallop on the toms.
    pat(cx, 'combat', 'stomp', '9...........', 0.95);
    pat(cx, 'combat', 'clap', '....8...7...', 0.85);
    pat(cx, 'combat', 'tamb', kind === 'break' ? '............' : '6.4.6.4.6.4.', 0.8);
    pat(cx, 'combat', 'tom', '7..5........', 0.6, 45);
    if (cx.barIn % 4 === 3) { if (fk === 0) pat(cx, 'combat', 'tom', '......5.7.9.', 0.9, 45); else roll(cx, 'combat', 'clap', 12, 0.3, 0.9); }

    // The whistle (a harmonica the second time), a harmonica's skeleton in calm, the low guitar two octaves under when the fight heats.
    stageHook(cx, { lead: 'whistle', alt: 'harmonica', calm: 'harmonica', calmVel: 0.25, dbl: 'twang', dblShift: -24, dblVel: 0.4, harm: 'whistle', harmVel: 0.3, riffInst: 'twang', riffLo: 40, riffShift: 12, riffVel: 0.55 });

    // finale: a choir rising behind it all, the bell on every bar, the tambourine on every sixteenth.
    voicing(cx, 'finale', 'choir', 0.5, 57, 0, 12);
    cx.add('finale', 'bell', 0, 12, rootMidi(cx, 64), 0.35);
    pat(cx, 'finale', 'tamb', '957595759575', 0.7);
  },
};

// ================= RANGE: lo-fi boom-bap =================
// F major, 86 bpm, a heavy swing. A dusty kick and snare, Rhodes chords, a bass, a lazy flute, vinyl crackle.
const gI = d(0, Q.maj7), gvi = d(9, Q.min7), gii = d(2, Q.min7), gV = d(7, Q.dom7), gIV = d(5, Q.maj7), giii = d(4, Q.min7);
const G_A = [gI, gvi, gii, gV, gI, gvi, gIV, gV], G_B = [gIV, giii, gii, gI, gIV, giii, gii, gV];
export const RANGE: TrackSpec = {
  id: 'range', tonic: 5, scale: [0, 2, 4, 5, 7, 9, 11], swing: 0.55,
  // A lazy lo-fi lick that comes in late and sighs down a third (rest, A-C, A-G-E), the same sigh one chord lower each time.
  theme: theme({
    A: 'r:2 A5:2 C6:3 A5:1 G5:4 E5:4 | r:2 F5:2 A5:3 F5:1 D5:8 | r:2 D6:2 C6:3 A5:1 F5:4 G5:4 | E5:12 r:4 | r:2 A5:2 C6:3 A5:1 G5:4 E5:4 | r:2 F5:2 A5:3 F5:1 D5:8 | r:2 D6:2 C6:3 A5:1 F5:4 D5:4 | E5:4 G5:4 C5:8',
    B: 'F5:4 A5:4 D6:8 | C6:4 A5:4 E5:8 | D6:4 Bb5:4 F5:8 | E5:4 F5:4 A5:8 | F5:4 A5:4 D6:4 F6:4 | E6:4 C6:4 A5:8 | Bb5:4 A5:4 G5:4 F5:4 | G5:8 r:8',
    bass: '1:6 5:2 8:4 r:2 5:2',
  }),
  form: {
    major: [
      sec('intro', 4, [gI, gvi, gii, gV]),
      sec('A', 8, G_A),
      sec('A2', 8, G_A),
      sec('B', 8, G_B),
      sec('A', 8, G_A),
      sec('bridge', 8, [gvi, gii, gV, gI, gvi, gii, gV, gV]),
      sec('B', 8, G_B),
      sec('break', 4, [gI, gvi]),
      sec('A2', 8, G_A),
      sec('outro', 4, [gIV, gii, gI, gI]),
    ],
  },
  build(cx) {
    const kind = cx.sec.kind;
    const open = kind === 'intro' || kind === 'break' || kind === 'outro';
    // Lo-fi boom-bap, kept light on purpose so a long practice session does not tire the ear: a dusty kick and snare even in calm,
    // swung hats, warm Rhodes chords held long, the bass under them, vinyl crackle.
    pat(cx, 'calm', 'kbb', '9.........9.....', 0.6);
    pat(cx, 'calm', 'sbb', '....7.......7...', 0.45);
    pat(cx, 'calm', 'hat', '4.3.4.3.4.3.4.3.', 0.45);
    comp(cx, 'calm', 'epiano', open ? '9...............' : '9.........6.....', 0.36, 57, 9);
    riff(cx, 'calm', 'fbass', 33, 0.75);
    for (let k = 0; k < 4; k++) if (cx.r() < 0.75) cx.add('calm', 'dust', Math.floor(cx.r() * 16), 1, 0, 0.55);
    const bells = chordNotes(cx.chord, 76, 93);
    if (open && cx.barIn % 2 === 0 && cx.r() < 0.6) cx.add('calm', 'vibes', Math.floor(cx.r() * 6) * 2, 4, pick(cx.r, bells), 0.3);

    // combat: the beat fills out: a ghost kick, an off-beat open hat, a shaker, a rim-shot fill.
    pat(cx, 'combat', 'kbb', '......5.......5.', 0.5);
    pat(cx, 'combat', 'ohat', '..............5.', 0.6);
    pat(cx, 'combat', 'shaker', '3.2.3.2.3.2.3.2.', 0.6);
    if (cx.barIn % 4 === 3) pat(cx, 'combat', 'rim', '..............57', 0.6);

    // A lazy flute lick (vibes the second time), the vibes' skeleton in calm, the Rhodes an octave under when it heats.
    stageHook(cx, { lead: 'flute', vel: 0.6, alt: 'vibes', calm: 'vibes', calmVel: 0.24, dbl: 'epiano', dblShift: -12, dblVel: 0.22, harm: 'flute', harmVel: 0.28, riffInst: 'vibes', riffLo: 33, riffShift: 24, riffVel: 0.35 });
    pat(cx, 'finale', 'hat', '3232323232323232', 0.5);
    pat(cx, 'finale', 'clap', '....5.......5...', 0.5);
  },
};

// ================= OUTPOST (Zombies): a day to build by, a night to survive =================
// Day: D mixolydian, 112 bpm, a marimba ostinato, hammer clanks, a harp tune (all in the calm layer, which is all the day uses).
// Night: D phrygian, 108 bpm, horror synthwave: a gated snare, a pumping synth bass, a saw lead and a choir, under the heartbeat.
const oI = d(0, Q.maj), obVII = d(10, Q.maj), oIV = d(5, Q.maj), ov = d(7, Q.min), ovi = d(9, Q.min);
const O_A = [oI, obVII, oIV, oI, oI, obVII, oIV, ov], O_B = [ovi, oIV, oI, obVII, ovi, oIV, obVII, ov];
const ni = d(0, Q.min), nbII = d(1, Q.maj), nbVI = d(8, Q.maj), nbVII = d(10, Q.maj), nviio = d(7, Q.dim);
const N_A = [ni, nbII, ni, nbVII, ni, nbII, nbVI, nviio], N_B = [nbVI, nbVII, ni, ni, nbVI, nbII, nbVII, ni];
export const OUTPOST: TrackSpec = {
  id: 'outpost', tonic: 2, scale: [0, 2, 4, 5, 7, 9, 10],
  // Day: a hammer's tap-tap and a bounce down the chord (A-A, A-F#-D-F#-A), the same on C and on G; mixolydian, so the C is flat.
  theme: theme({
    A: 'A5:1 A5:1 r:2 A5:2 F#5:2 D5:2 F#5:2 A5:4 | G5:1 G5:1 r:2 G5:2 E5:2 C5:2 E5:2 G5:4 | B5:1 B5:1 r:2 B5:2 G5:2 D5:2 G5:2 B5:2 D6:2 | C6:2 A5:2 F#5:4 D5:8 |'
      + ' A5:1 A5:1 r:2 A5:2 F#5:2 D5:2 F#5:2 A5:4 | G5:1 G5:1 r:2 G5:2 E5:2 C5:2 E5:2 G5:4 | B5:1 B5:1 r:2 D6:2 B5:2 G5:2 B5:2 D6:4 | C6:4 A5:4 E5:8',
    B: 'F#5:4 B5:4 D6:8 | D6:4 B5:4 G5:8 | A5:4 F#5:4 D5:4 F#5:4 | E5:4 G5:4 C6:8 | F#5:4 B5:4 D6:8 | D6:4 B5:4 G5:4 B5:4 | C6:4 G5:4 E5:4 G5:4 | A5:12 r:4',
    bass: '1:3 1:1 5,:2 1:2 3:3 3:1 5:2 r:2',
  }),
  // Night: a low brass neighbour-note shudder (D-Eb-D ... A), the flat second and the tritone of D phrygian; the B a slow chant.
  minorTheme: theme({
    A: 'D5:4 Eb5:2 D5:2 r:4 A4:4 | G5:4 F5:2 Eb5:2 r:4 Bb4:4 | D5:4 Eb5:2 D5:2 r:2 F5:2 A5:4 | G5:4 E5:4 C5:8 | D5:4 Eb5:2 D5:2 r:4 A4:4 | G5:4 Ab5:2 G5:2 r:4 Eb5:4 | F5:4 D5:4 Bb4:8 | C5:4 Eb5:4 A4:8',
    B: 'Bb4:6 D5:2 F5:8 | E5:6 G5:2 C5:8 | D5:6 F5:2 A5:8 | Ab5:8 A5:8 | Bb5:6 A5:2 F5:8 | G5:6 F5:2 Eb5:8 | E5:6 D5:2 C5:8 | D5:16',
    bass: '1:2 1:2 1:2 @1:2 1:2 1:2 5:2 @1:2',
  }),
  minorScale: [0, 1, 3, 5, 7, 8, 10],
  form: {
    major: [
      sec('intro', 4, [oI, obVII, oIV, oI]),
      sec('A', 8, O_A),
      sec('A2', 8, O_A),
      sec('B', 8, O_B),
      sec('bridge', 8, [oIV, oI, obVII, oI, oIV, oI, obVII, ov]),
      sec('A', 8, O_A),
      sec('break', 4, [oI, obVII]),
      sec('B', 8, O_B),
      sec('A2', 8, O_A),
      sec('A', 8, O_A, { lift: 2 }),
      sec('outro', 4, [oIV, obVII, oI, oI]),
    ],
    minor: [
      sec('intro', 4, [ni, ni, nbII, ni]),
      sec('A', 8, N_A),
      sec('A2', 8, N_A),
      sec('B', 8, N_B),
      sec('break', 8, [ni, nbII]),
      sec('build', 8, [ni, nbVII, nbVI, nbVII, ni, nbVII, nbVI, nbII]),
      sec('A', 8, N_A),
      sec('B', 8, N_B),
      sec('A2', 8, N_A),
      sec('B', 8, N_B),
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
  const fk = fillKind(cx);
  // The day is the calm layer alone: it has to carry a whole track.
  const arp = chordNotes(cx.chord, 62, 84);
  const ost = open ? '9...5...9...5...' : '9.5.7.5.9.5.7.5.';
  let k = 0;
  for (let s = 0; s < 16; s++) if (ost[s] !== '.') cx.add('calm', 'marimba', s, 2, arp[(k++ * 2 + (kind === 'bridge' ? cx.barIn : 0)) % arp.length]!, Number(ost[s]) / 9 * 0.55);
  riff(cx, 'calm', 'fbass', 33, 0.85);
  pat(cx, 'calm', 'clank', kind === 'bridge' ? '....5.....5.3...' : '....4.....3.....', 0.8, 70);
  pat(cx, 'calm', 'rim', '....5.......5...', 0.7);
  pat(cx, 'calm', 'shaker', '4.3.4.3.4.3.4.3.', 0.8);
  pat(cx, 'calm', 'kick', open ? '9...............' : '9.......5..5....', 0.55);
  voicing(cx, 'calm', 'padair', 0.7, 55, 0, 16);
  // The tune on the harp (a glockenspiel joins an octave up the second time); the bridge plays the riff on the harp.
  const notes = hookNotes(cx);
  play(cx, 'calm', 'harp', notes, 0.75);
  if (kind === 'A2') play(cx, 'calm', 'glock', notes, 0.3, 12, false);
  if (kind === 'bridge') riff(cx, 'calm', 'harp', 33, 0.55, 36);
  if (cx.barIn % 4 === 3) { if (fk === 0) pat(cx, 'calm', 'clank', '............5.79', 0.8, 66); else pat(cx, 'calm', 'tom', '..............57', 0.7, 50); }
  if (cx.barIn === 0 && (kind === 'A' || kind === 'bridge')) cx.add('calm', 'chime', 0, 2, arp.at(-1)!, 0.5);
  // a little in the louder layers, should a fight break out by day
  pat(cx, 'combat', 'snare', '....6.......6...', 0.7);
  play(cx, 'hype', 'whistle', notes, 0.6, 12);
}

function night(cx: Cx) {
  const kind = cx.sec.kind;
  const sparse = kind === 'intro' || kind === 'break' || kind === 'outro';
  const root = rootMidi(cx, 30);
  const fk = fillKind(cx);
  // Horror synthwave. calm: a choir and the dread pad, the synth bass slow, hull hits and scrapes in the dark.
  voicing(cx, 'calm', 'dread', 0.7, 48, 0, 16);
  voicing(cx, 'calm', 'choir', 0.4, 57, 0, 16);
  if (sparse) pat(cx, 'calm', 'synbass', '9.......5.......', 0.75, root, 2);
  else pat(cx, 'calm', 'synbass', '9...5...7...5...', 0.7, root, 2);
  if (cx.r() < 0.4) cx.add('calm', 'metal', Math.floor(cx.r() * 16), 2, 48 + Math.floor(cx.r() * 12), 0.5);
  if (cx.barIn % 4 === 0) cx.add('calm', 'scrape', 0, 6, 0, 0.7);
  if (sparse && cx.barIn % 2 === 0) cx.add('calm', 'wind', 0, 32, 0, 1);
  // heart: the heartbeat, thickening with the horde, over a root pedal (the layer is the night's alone).
  pat(cx, 'heart', 'heart', '9.7.....9.7.....', 1, 0, 1, 0);
  pat(cx, 'heart', 'heart', '....9.6.....9.6.', 0.9, 0, 1, 1);
  pat(cx, 'heart', 'heart', '...5...5...5...5', 0.6, 0, 1, 2);
  cx.add('heart', 'bass', 0, 16, root - 12 + (root - 12 < 24 ? 12 : 0), 0.6, 0);

  // combat: an eighties drum machine with a gated snare, the synth bass pumping the riff in eighths, sixteenth hats, a square arpeggio.
  pat(cx, 'combat', 'krock', kind === 'break' ? '9...............' : '9.......9.5.....', 0.85);
  pat(cx, 'combat', 'sgate', '....9.......9...', 0.8);
  pat(cx, 'combat', 'hat', '5353535353535353', 0.55);
  riff(cx, 'combat', 'synbass', 30, 0.7);
  const arp = chordNotes(cx.chord, 62, 81);
  for (let s = 0; s < 16; s += 2) cx.add('combat', 'square', s, 1.5, arp[[0, 1, 2, 1][(s / 2) % 4]! % arp.length]!, 0.22);
  if (kind === 'build') roll(cx, 'combat', 'sgate', cx.barIn >= 6 ? 0 : 8, 0.2, 0.7);
  else if (cx.barIn % 4 === 3) { if (fk === 0) roll(cx, 'combat', 'sgate', 12, 0.25, 0.7); else pat(cx, 'combat', 'tom', '........5.7.9.9.', 0.9, 40); }

  // The saw lead (an eight-bit square the second time), a music-box chime picking out its skeleton in the dark.
  stageHook(cx, { lead: 'saw', vel: 0.8, alt: 'square', calm: 'chime', calmVel: 0.26, dbl: 'saw', dblShift: -12, dblVel: 0.3, harm: 'saw', harmVel: 0.3 });
  if (cx.last && hookPart(cx) !== null) cx.add('hype', 'chime', 12, 3, root + 42, 0.5);
  // finale: a low acid arpeggio in eighths, hull rolls, scrapes on the phrase turn.
  const low = chordNotes(cx.chord, 42, 66);
  for (let s = 0; s < 16; s += 2) cx.add('finale', 'acid', s, 1.5, low[[0, 1, 2, 1, 0, 2, 1, 3][s / 2]! % low.length]!, s % 4 === 0 ? 0.8 : 0.5);
  pat(cx, 'finale', 'metal', '.......5.5.5.5.9', 0.7, 58);
  pat(cx, 'finale', 'ohat', '..9...9...9...9.', 0.6);
  if (cx.barIn % 8 === 7) cx.add('finale', 'scrape', 8, 8, 0, 1);
}
