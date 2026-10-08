/**
 * Scores for the harbour (a sea shanty), the night market (city-pop future-funk), the museum (a smoky jazz trio), the submarine pen (industrial
 * techno) and the park (indie-pop picnic). Each is a `TrackSpec` (musicgen.ts): a written theme (musichook.ts: an A hook, a B tune and a bass
 * riff, the same notes every time), a form whose A and B carry the theme's own chords, and a `build` that writes one bar into the intensity
 * layers (calm, combat, hype, finale). Each genre has its own band, drum kit and groove; the sampled instruments are in musicsamples.ts.
 */
import { chordNotes, comp, d, E12, fillKind, pat, pick, Q, riff, roll, rootMidi, stageHook, toneMidi, voicing, type Section, type TrackSpec } from './musicgen.ts';
import { theme } from './musichook.ts';

const sec = (kind: Section['kind'], bars: number, prog: Section['prog'], o: { alt?: Section['alt']; lift?: number } = {}): Section => ({ kind, bars, prog, ...o });

// ================= HARBOUR: a sea shanty in 12/8 =================
// D dorian, 108 dotted-quarter beats a minute. A fiddle lead, an accordion and a tuba, a deck stomp and claps, a bodhran under the jig.
const hi = d(0, Q.min), hVII = d(10, Q.maj), hIV = d(5, Q.maj), hIII = d(3, Q.maj), hV = d(7, Q.maj);
const H_A = [hi, hVII, hi, hVII, hi, hIV, hVII, hV], H_B = [hIII, hVII, hi, hi, hIII, hVII, hV, hV];
export const HARBOR: TrackSpec = {
  id: 'harbor', tonic: 2, scale: [0, 2, 3, 5, 7, 9, 10],
  // A quarter-eighth lilt that tumbles down the D minor chord from the top and heaves back up (D'-C-A-F-D, F-A), then the same a step down.
  theme: theme({
    meter: 12,
    A: 'D6:2 C6:1 A5:2 F5:1 D5:3 F5:2 A5:1 | C6:2 B5:1 G5:2 E5:1 C5:3 E5:2 G5:1 | D6:2 C6:1 A5:2 F5:1 D5:2 E5:1 F5:2 A5:1 | G5:2 F5:1 E5:2 D5:1 C5:6 |'
      + ' A5:2 A5:1 A5:2 G5:1 F5:2 E5:1 D5:3 | B5:2 B5:1 B5:2 A5:1 G5:2 A5:1 B5:3 | C6:2 B5:1 A5:2 G5:1 E5:2 G5:1 C5:3 | E5:3 A5:3 E5:6',
    B: 'F5:3 A5:3 C6:3 A5:3 | G5:3 E5:3 C5:6 | D5:2 E5:1 F5:2 G5:1 A5:6 | F5:2 E5:1 D5:9 | F5:3 A5:3 C6:3 D6:3 | C6:3 G5:3 E5:6 | E5:2 F5:1 E5:2 D5:1 C#5:6 | E5:6 A5:6',
    bass: '1:3 5,:3 1:3 5,:2 ^:1',
  }),
  form: {
    major: [
      sec('intro', 4, [hi, hi, hVII, hi]),
      sec('A', 8, H_A),
      sec('A2', 8, H_A),
      sec('B', 8, H_B),
      sec('A', 8, H_A),
      sec('bridge', 8, [hIV, hi, hIV, hi, hVII, hIII, hVII, hV]),
      sec('B', 8, H_B),
      sec('break', 4, [hi, hVII]),
      sec('A2', 8, H_A),
      sec('A', 8, H_A, { lift: 2 }),
      sec('outro', 8, [hi, hVII, hi, hIV, hVII, hIII, hV, hi]),
    ],
  },
  build(cx) {
    const kind = cx.sec.kind;
    const root = rootMidi(cx, 38);
    const open = kind === 'intro' || kind === 'break';
    const fk = fillKind(cx);
    // calm: the tuba's oom-pah riff, the squeezebox pumping the off-beats, the fog and a ship's bell.
    riff(cx, 'calm', 'tuba', 38, 0.9);
    if (!open) comp(cx, 'calm', 'accordion', '..6..5..6..5', 0.35, 60, 0.9);
    if (cx.barIn === 0 && (open || kind === 'bridge' || cx.cycle % 2 === 0)) cx.add('calm', 'foghorn', 0, 12, rootMidi(cx, 28), 0.8);
    if (cx.barIn % 4 === 0 && (open || kind === 'bridge')) { cx.add('calm', 'rbell', 0, 2, 88, 0.6); cx.add('calm', 'rbell', 2 * E12, 2, 88, 0.45); }

    // combat: a deck-stomp on the dotted beats, claps between, a bodhran rolling the jig underneath.
    if (kind !== 'break') pat(cx, 'combat', 'stomp', kind === 'bridge' ? '9.....5.....' : '9.....9.....', 0.95);
    pat(cx, 'combat', 'clap', '...8.....8..', 0.85);
    pat(cx, 'combat', 'tom', '7.47.47.47.4', 0.55, 45);
    if (cx.barIn % 4 === 3) [8, 9, 10, 11].forEach((h, i) => cx.add('combat', 'tom', h * E12, 1, 52 - i * 2, 0.6 + i * 0.08 + (fk ? 0.05 : 0)));

    // The fiddle sings the tune (a tin whistle takes the second verse); the accordion doubles it low; the bridge whistles the riff.
    stageHook(cx, { lead: 'fiddle', alt: 'whistle', calm: 'accordion', calmVel: 0.32, dbl: 'accordion', dblShift: -12, dblVel: 0.45, harm: 'fiddle', harmVel: 0.4, riffInst: 'whistle', riffLo: 38, riffShift: 36, riffVel: 0.5 });
    if (cx.barIn % 8 === 7) cx.add('hype', 'foghorn', 0, 12, rootMidi(cx, 28), 0.7);

    // finale: a tambourine jig on every eighth, the squeezebox pumping triplets, the tuba doubled.
    pat(cx, 'finale', 'tamb', '9.59.59.59.5', 0.9);
    comp(cx, 'finale', 'accordion', '6..5..6..5..', 0.3, 64, 0.8);
    for (const s of [4, 12]) cx.add('finale', 'tuba', s, 2, root + 12, 0.6);
  },
};

// ================= NIGHT MARKET: city-pop future-funk =================
// E-flat, 118 bpm, nearly straight. A slap bass in octaves, Rhodes chords, synth-brass stabs, a 909 four on the floor and an alto sax lead.
const mI = d(0, Q.maj7), mIV = d(5, Q.maj7), miii = d(4, Q.min7), mvi = d(9, Q.min7), mii = d(2, Q.min7), mV = d(7, Q.dom7), mbVI = d(8, Q.maj7), mbVII = d(10, Q.maj7);
const M_A = [mIV, mV, miii, mvi, mii, mV, mI, mI], M_B = [mI, mvi, mii, mV, mI, miii, mIV, mV];
export const MARKET: TrackSpec = {
  id: 'market', tonic: 3, scale: [0, 2, 4, 5, 7, 9, 11], swing: 0.12,
  // A pentatonic city-pop hook that skips the downbeat: (rest) di-di DAH DAH, (rest) DAH DAAH, stepping down the chain of sevenths.
  theme: theme({
    A: 'r:2 C6:1 Bb5:1 C6:2 Eb6:2 r:2 Bb5:2 G5:4 | r:2 Bb5:1 Ab5:1 Bb5:2 D6:2 r:2 Ab5:2 F5:4 | r:2 G5:1 F5:1 G5:2 Bb5:2 r:2 F5:2 D5:4 | Eb5:6 F5:2 G5:8 |'
      + ' r:2 C6:1 Bb5:1 C6:2 Eb6:2 r:2 Ab5:2 F5:4 | r:2 Bb5:1 Ab5:1 Bb5:2 D6:2 r:2 F6:2 D6:4 | Eb6:3 D6:1 Bb5:2 G5:2 r:2 F5:2 Eb5:4 | r:8 Bb5:2 C6:2 Eb6:4',
    B: 'G5:4 Bb5:4 Eb6:6 D6:2 | C6:8 r:4 G5:2 Bb5:2 | Ab5:4 C6:4 Eb6:6 C6:2 | D6:8 r:4 C6:2 Bb5:2 | G5:4 Bb5:4 Eb6:4 F6:4 | D6:8 Bb5:4 G5:4 | C6:4 Eb6:4 G5:4 Ab5:4 | F5:6 G5:2 Ab5:4 Bb5:4',
    bass: '1:3 1:1 r:2 8:2 r:2 5:2 7:2 8:2',
  }),
  form: {
    major: [
      sec('intro', 4, [mIV, miii, mii, mV]),
      sec('A', 8, M_A),
      sec('A2', 8, M_A),
      sec('B', 8, M_B),
      sec('bridge', 8, [mbVI, mbVII, mI, mI, mbVI, mbVII, miii, mV]),
      sec('break', 4, [mIV, mV]),
      sec('A', 8, M_A),
      sec('B', 8, M_B),
      sec('A2', 8, M_A),
      sec('A', 8, M_A, { lift: 1 }),
      sec('outro', 4, [mIV, miii, mI, mI]),
    ],
  },
  build(cx) {
    const kind = cx.sec.kind;
    const open = kind === 'intro' || kind === 'break' || kind === 'outro';
    const fk = fillKind(cx);
    // calm: four on the floor kept low and round, the slap bass riff, Rhodes chords pushed off the beat, a shaker.
    pat(cx, 'calm', 'k909', '9...9...9...9...', 0.5);
    riff(cx, 'calm', 'slap', 33, 0.75);
    comp(cx, 'calm', 'epiano', open ? '9...............' : ['9.....7...7.....', '...7..7.....9...'][cx.barIn % 2]!, 0.42, 58, 3);
    pat(cx, 'calm', 'shaker', '4343434343434343', 0.6);

    // combat: the disco kit: clap on two and four, open hats on the off-beats, sixteenth hats, synth-brass stabs.
    pat(cx, 'combat', 'k909', kind === 'break' ? '9...............' : '9...9...9...9...', 0.45);
    pat(cx, 'combat', 'clap', '....9.......9...', 0.95);
    pat(cx, 'combat', 'ohat', '..8...8...8...8.', 0.85);
    pat(cx, 'combat', 'hat', '5.3.5.3.5.3.5.3.', 0.7);
    comp(cx, 'combat', 'synbrass', cx.barIn % 2 ? '......8.....7...' : '..........8.7...', 0.5, 60, 1);
    if (cx.barIn % 4 === 3) { if (fk === 0) roll(cx, 'combat', 'clap', 12, 0.3, 0.8); else pat(cx, 'combat', 'tom', '............5.79', 0.8, 50); }

    // The alto sax has the hook (synth brass the second verse) over a Rhodes skeleton; the Rhodes shadows it an octave down when it heats.
    stageHook(cx, { lead: 'sax', alt: 'synbrass', calm: 'epiano', calmVel: 0.32, dbl: 'epiano', dblShift: -12, dblVel: 0.3, harm: 'sax', harmVel: 0.35, riffInst: 'slap', riffLo: 33, riffShift: 12, riffVel: 0.55 });

    // finale: a crash on the phrase, open hats on every off-beat sixteenth, the slap bass popping octaves.
    if (cx.barIn % 4 === 0) cx.add('finale', 'crash', 0, 1, 0, 0.8);
    pat(cx, 'finale', 'ohat', '.5.5.5.5.5.5.5.5', 0.5);
    pat(cx, 'finale', 'slap', '..5...5...5...5.', 0.55, rootMidi(cx, 33) + 12);
  },
};

// ================= MUSEUM: a smoky jazz trio =================
// C minor, 112 bpm, triplet swing. Walking upright, the ride and brushes, piano comping, a muted trumpet over vibraphone.
const mi7 = d(0, Q.min7), miv7 = d(5, Q.min7), miiø = d(2, Q.m7b5), mV7 = d(7, Q.dom7), mbVIM = d(8, Q.maj7), mbVII7 = d(10, Q.dom7), mbIII = d(3, Q.maj7), mimaj = d(0, Q.mmaj7);
const U_A = [mi7, miv7, miiø, mV7, mi7, mbVIM, miiø, mV7], U_B = [miv7, mbVII7, mbIII, mbVIM, miiø, mV7, mi7, mi7];
export const MUSEUM: TrackSpec = {
  id: 'museum', tonic: 0, scale: [0, 2, 3, 5, 7, 8, 10, 11], swing: 0.6,
  // A cat-burglar head: a chromatic tiptoe into each note ((rest) F#-G, (rest) Bb-G), answered by a slinking fall through the changes.
  theme: theme({
    A: 'r:2 F#5:2 G5:4 r:2 Bb5:2 G5:4 | r:2 B5:2 C6:4 Ab5:2 F5:2 Eb5:4 | D5:2 F5:2 Ab5:2 C6:2 F5:4 r:4 | Ab5:2 G5:2 F5:2 D5:2 B4:8 |'
      + ' r:2 F#5:2 G5:4 r:2 Bb5:2 G5:4 | r:2 B5:2 C6:4 G5:2 Eb5:2 C5:4 | F5:2 Ab5:2 C6:2 Ab5:2 F5:2 D5:2 F5:4 | F5:2 D5:2 B4:4 G5:8',
    B: 'C6:6 Bb5:2 Ab5:4 F5:4 | Ab5:6 G5:2 F5:4 D5:4 | G5:6 F5:2 Eb5:4 G5:4 | C6:12 r:4 | Ab5:4 F5:4 D5:4 F5:4 | B5:4 Ab5:4 F5:4 D5:4 | Eb5:4 G5:4 Bb5:4 D6:4 | C6:8 r:8',
    bass: '1:4 3:4 5:4 ^:4',
  }),
  form: {
    major: [
      sec('intro', 4, [mi7, miv7, miiø, mV7]),
      sec('A', 8, U_A),
      sec('A2', 8, U_A),
      sec('B', 8, U_B),
      sec('A', 8, U_A),
      sec('bridge', 8, [mi7, mi7, miv7, miv7, mbVIM, mV7, mi7, mV7]),
      sec('break', 4, [mi7, miv7]),
      sec('A2', 8, U_A),
      sec('B', 8, U_B),
      sec('A', 8, U_A),
      sec('outro', 4, [mi7, miv7, mV7, mimaj]),
    ],
  },
  build(cx) {
    const kind = cx.sec.kind;
    const fk = fillKind(cx);
    // calm: the walking bass (root, third, fifth, a half-step into the next chord), the ride's ding ding-a-ding, the hat on two and four,
    // and the piano comping shells in a Charleston.
    riff(cx, 'calm', 'upright', 36, 0.95);
    pat(cx, 'calm', 'ride', '9...9.6.9...9.6.', 0.8);
    pat(cx, 'calm', 'hat', '....6.......6...', 0.6);
    if (kind !== 'intro') comp(cx, 'calm', 'piano', cx.barIn % 2 ? '9.....6.........' : '......7.......6.', 0.33, 55, 2.5, 0.02);
    else if (cx.barIn % 2 === 0) cx.add('calm', 'vibes', 0, 6, toneMidi(cx, 3, 79), 0.45);

    // combat: brushes comping on the snare, a feathered kick, the cross-stick on four, the piano punching harder.
    pat(cx, 'combat', 'kick', '5.......5.......', 0.45);
    pat(cx, 'combat', 'rim', kind === 'break' ? '................' : '............8...', 0.85);
    for (const g of [3, 7, 10, 11, 15]) if (cx.r() < 0.4) cx.add('combat', 'brush', g, 1, 0, 0.45);
    pat(cx, 'combat', 'swirl', '..........7.....', 0.7);
    comp(cx, 'combat', 'piano', '...6......6.....', 0.3, 60, 1.5, 0.015);
    if (cx.barIn % 4 === 3) { if (fk === 0) pat(cx, 'combat', 'rim', '............5.57', 0.7); else roll(cx, 'combat', 'brush', 10, 0.3, 0.8); }

    // The muted trumpet has the head (the piano takes the second chorus); vibes shadow it; the bridge is a piano walking with the bass.
    stageHook(cx, { lead: 'trumpet', alt: 'piano', calm: 'vibes', calmVel: 0.32, dbl: 'vibes', dblShift: 12, dblVel: 0.28, harm: 'trumpet', harmVel: 0.38, riffInst: 'piano', riffLo: 36, riffShift: 24, riffVel: 0.5 });

    // finale: the ride on every swung eighth, block chords on the piano, a brush roll into each four.
    pat(cx, 'finale', 'ride', '9.7.9.7.9.7.9.7.', 0.6);
    comp(cx, 'finale', 'piano', '9.......9.......', 0.3, 64, 1, 0.01);
    if (cx.barIn % 4 === 3) roll(cx, 'finale', 'brush', 12, 0.4, 0.9);
  },
};

// ================= SUBMARINE PEN: industrial techno =================
// C-sharp phrygian, 128 bpm. A 909 on the floor, a rumbling synth bass, an acid line, metal hits and sonar pings.
const si = d(0, Q.min), sII = d(1, Q.maj), sVII = d(10, Q.maj), sVI = d(8, Q.maj);
const S_A = [si, si, sII, si, si, sVII, sII, si], S_B = [sVI, sVII, si, si, sVI, sII, sVII, si];
export const SUBPEN: TrackSpec = {
  id: 'subpen', tonic: 1, scale: [0, 1, 3, 5, 7, 8, 10],
  // An acid riff that bounces off the octave (C#-C#'-.-C#-.-B-C#) then runs down to the root; the B is a slow sonar-lit phrygian line.
  theme: theme({
    A: "C#5:1 C#6:1 r:1 C#5:1 r:1 B5:1 C#5:1 r:1 G#5:2 C#5:1 E5:2 D5:1 C#5:2 | C#5:1 C#6:1 r:1 C#5:1 r:1 B5:1 C#5:1 r:1 E5:2 F#5:2 G#5:4 |"
      + " D5:1 D6:1 r:1 D5:1 r:1 C#6:1 D5:1 r:1 A5:2 D5:1 F#5:2 E5:1 D5:2 | C#5:1 C#6:1 r:1 C#5:1 r:1 B5:1 C#5:1 r:1 E5:2 F#5:2 G#5:4 |"
      + " C#5:1 C#6:1 r:1 C#5:1 r:1 B5:1 C#5:1 r:1 G#5:2 C#5:1 E5:2 D5:1 C#5:2 | B4:1 B5:1 r:1 B4:1 r:1 A5:1 B4:1 r:1 F#5:2 B4:1 D#5:2 C#5:1 B4:2 |"
      + " D5:1 D6:1 r:1 D5:1 r:1 C#6:1 D5:1 r:1 A5:2 D5:1 F#5:2 E5:1 D5:2 | C#5:1 C#6:1 r:1 C#5:1 r:1 B5:1 C#5:1 r:1 G#5:4 C#5:4",
    B: 'C#6:4 B5:4 A5:8 | B5:4 A5:4 F#5:8 | G#5:4 E5:4 C#5:8 | D5:4 E5:4 G#5:8 | C#6:4 B5:4 A5:4 E5:4 | D6:4 C#6:4 A5:8 | B5:4 A5:4 F#5:4 D#5:4 | E5:4 D5:4 C#5:8',
    bass: '1:2 1:1 8:1 1:2 1:1 8:1 1:2 1:1 8:1 5:2 8:2',
  }),
  form: {
    major: [
      sec('intro', 4, [si, si, si, sII]),
      sec('A', 8, S_A),
      sec('A2', 8, S_A),
      sec('B', 8, S_B),
      sec('A', 8, S_A),
      sec('break', 8, [si, si]),
      sec('build', 8, [si, sVII, sVI, sVII, si, sVII, sVI, sII]),
      sec('B', 8, S_B),
      sec('A2', 8, S_A),
      sec('A', 8, S_A),
      sec('outro', 4, [si, si, sII, si]),
    ],
  },
  build(cx) {
    const kind = cx.sec.kind;
    const root = rootMidi(cx, 25);
    const sparse = kind === 'intro' || kind === 'outro' || kind === 'break';
    // calm: a sonar ping on the one with its echoes, the rumbling synth-bass riff, a drone, the odd clank against the hull.
    const ping = 83 + (cx.chord.rootPc === cx.tonic ? 0 : 2);
    cx.add('calm', 'sonar', 0, 4, ping, 0.8); cx.add('calm', 'sonar', 6, 4, ping, 0.25); cx.add('calm', 'sonar', 11, 4, ping, 0.1);
    if (sparse) pat(cx, 'calm', 'synbass', '9...5...7...5...', 0.9, root, 1.5);
    else riff(cx, 'calm', 'synbass', 25, 0.85);
    voicing(cx, 'calm', 'dread', 0.8, 48, 0, 16);
    if (cx.r() < 0.35) cx.add('calm', 'metal', Math.floor(cx.r() * 16), 2, 52 + Math.floor(cx.r() * 14), 0.5);

    // combat: a 909 on the floor, open hats off the beat, claps with a hull hit on two and four, a ride ticking the off-beats.
    pat(cx, 'combat', 'k909', kind === 'break' ? '9.......' : '9...9...9...9...', 1);
    pat(cx, 'combat', 'ohat', '..9...9...9...9.', 0.8);
    pat(cx, 'combat', 'clap', '....8.......8...', 0.85);
    pat(cx, 'combat', 'metal', '....5.......5..3', 0.6, 64);
    pat(cx, 'combat', 'hat', '4545454545454545', 0.55);
    if (kind === 'build') roll(cx, 'combat', 'sgate', cx.barIn >= 6 ? 0 : 8, 0.2, 0.7);
    else if (cx.barIn % 4 === 3) roll(cx, 'combat', 'clap', fillKind(cx, 2) === 0 ? 12 : 8, 0.3, 0.85);

    // The acid riff, its skeleton pinged on the sonar in calm, a saw an octave up when it heats; the build hands the riff to the acid line.
    stageHook(cx, { lead: 'acid', calm: 'sonar', calmVel: 0.25, dbl: 'saw', dblShift: 12, dblVel: 0.3, harm: 'acid', harmVel: 0.35 });
    if (kind === 'build') riff(cx, 'combat', 'acid', 25, 0.45, 36);
    // finale: a crash every four, the ride on every off-beat sixteenth, hull rolls.
    if (cx.barIn % 4 === 0) cx.add('finale', 'crash', 0, 1, 0, 0.7);
    pat(cx, 'finale', 'ride', '.5.5.5.5.5.5.5.5', 0.7);
    if (cx.barIn % 2 === 1) pat(cx, 'finale', 'metal', '.......5.5.5.5.9', 0.7, 60);
  },
};

// ================= PARK: indie-pop picnic =================
// G major, 124 bpm. A strummed ukulele, a bass guitar, hand claps and tambourine, a marimba tune, a whistle and glockenspiel.
const pI = d(0, Q.maj), pIV = d(5, Q.maj), pV = d(7, Q.maj), pvi = d(9, Q.min), piii = d(4, Q.min);
const P_A = [pI, pV, pvi, pIV, pI, pV, pIV, pV], P_B = [pvi, pIV, pI, pV, pvi, pIV, pV, pV];
export const PARK: TrackSpec = {
  id: 'park', tonic: 7, scale: [0, 2, 4, 5, 7, 9, 11],
  // Three staccato hops (G . G . B .) then a skip down the chord: a picnic bounce, answered by the same hops on the dominant.
  theme: theme({
    A: 'G5:1 r:1 G5:1 r:1 B5:1 r:1 D6:2 B5:2 G5:2 A5:2 B5:2 | A5:1 r:1 A5:1 r:1 F#5:1 r:1 D5:2 E5:2 F#5:2 A5:4 | G5:1 r:1 G5:1 r:1 B5:1 r:1 E6:2 D6:2 B5:2 G5:4 | E6:2 D6:2 C6:2 A5:2 G5:8 |'
      + ' G5:1 r:1 G5:1 r:1 B5:1 r:1 D6:2 B5:2 G5:2 A5:2 B5:2 | A5:1 r:1 A5:1 r:1 F#5:1 r:1 D5:2 E5:2 F#5:2 A5:4 | E6:1 r:1 E6:1 r:1 D6:1 r:1 C6:2 B5:2 A5:2 G5:2 E5:2 | F#5:4 A5:4 D6:4 r:4',
    B: 'B5:6 A5:2 G5:4 E5:4 | G5:6 E5:2 C6:8 | D6:6 C6:2 B5:4 G5:4 | A5:12 r:4 | B5:6 A5:2 G5:4 B5:4 | E6:6 D6:2 C6:4 G5:4 | F#5:4 A5:4 D6:4 C6:4 | D6:8 r:4 D5:4',
    bass: '1:2 r:2 5,:2 r:2 1:2 3:2 5:2 3:2',
  }),
  form: {
    major: [
      sec('intro', 4, [pI, pV, pvi, pIV]),
      sec('A', 8, P_A),
      sec('A2', 8, P_A),
      sec('B', 8, P_B),
      sec('A', 8, P_A),
      sec('bridge', 8, [pIV, pV, piii, pvi, pIV, pV, pI, pI]),
      sec('B', 8, P_B),
      sec('break', 8, [pI, pV]),
      sec('B', 8, P_B),
      sec('A2', 8, P_A, { lift: 2 }),
      sec('outro', 4, [pIV, pV, pI, pI]),
    ],
  },
  build(cx) {
    const kind = cx.sec.kind;
    const stripped = kind === 'bridge';
    const fk = fillKind(cx);
    // calm: a ukulele strummed down and up, the bass guitar's bounce, a tambourine, soft claps.
    comp(cx, 'calm', 'uke', kind === 'intro' ? '9...5...9...5...' : '9.5.7.5.9.5.7.5.', 0.5, 60, 2, 0.02);
    riff(cx, 'calm', 'fbass', 36, stripped ? 0.65 : 0.8);
    pat(cx, 'calm', 'tamb', '..5...5...5...5.', 0.6);
    pat(cx, 'calm', 'clap', '....5.......5...', 0.5);
    const spark = chordNotes(cx.chord, 76, 93);
    if (kind === 'intro' || kind === 'bridge' || kind === 'outro') if (cx.r() < 0.6) cx.add('calm', 'glock', Math.floor(cx.r() * 8) * 2, 2, pick(cx.r, spark), 0.5);

    // combat: a bright little kit, hand claps doubled off the beat, tambourine eighths.
    if (kind !== 'break') pat(cx, 'combat', 'krock', stripped ? '9...............' : '9.......9.5.....', 0.8);
    pat(cx, 'combat', 'clap', '....9..5....9..5', 0.9);
    pat(cx, 'combat', 'tamb', '7.4.7.4.7.4.7.4.', 0.75);
    if (cx.barIn % 4 === 3) { if (fk === 0) roll(cx, 'combat', 'clap', 12, 0.3, 0.9); else pat(cx, 'combat', 'tom', '..........5.7.9.', 0.8, 52); }

    // The marimba bounces the tune over a glockenspiel skeleton (whistled the second verse), the glockenspiel an octave up when it heats.
    stageHook(cx, { lead: 'marimba', alt: 'whistle', calm: 'glock', calmVel: 0.28, dbl: 'glock', dblShift: 12, dblVel: 0.28, harm: 'marimba', harmVel: 0.35, riffInst: 'uke', riffLo: 36, riffShift: 36, riffVel: 0.5 });

    // finale: claps on every eighth, the glockenspiel running up the chord, a whistled sixth on top.
    pat(cx, 'finale', 'clap', '9.5.9.5.9.5.9.5.', 0.7);
    for (let i = 0; i < 4; i++) cx.add('finale', 'glock', 8 + i * 2, 2, toneMidi(cx, i, 79), 0.4);
    pat(cx, 'finale', 'tom', '..........7.9.9.', 0.8, 52);
  },
};
