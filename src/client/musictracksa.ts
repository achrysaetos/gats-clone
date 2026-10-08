/**
 * Scores for the harbour, night market, museum, submarine pen and park. Each is a `TrackSpec` (musicgen.ts): a form of sections
 * and a `build` that writes one bar into the five intensity layers (calm, combat, hype, finale; heart is the Zombies night's).
 */
import { bassLine, chordNotes, comp, d, E12, fillKind, melody, pat, pick, Q, roll, rootMidi, scaleNotes, toneMidi, voicing, type Cx, type Rhythm, type Section, type TrackSpec } from './musicgen.ts';

const sec = (kind: Section['kind'], bars: number, prog: Section['prog'], alt?: Section['alt'], turn?: Section['turn']): Section => ({ kind, bars, prog, alt, turn });
const E = (r: readonly (readonly [number, number])[]): Rhythm => r.map(([s, n]) => [s, n] as const);

// ================= HARBOUR: sea-shanty swing in 12/8 =================
// D dorian, 108 beats a minute where a beat is a dotted quarter: oom (tuba) on 1 and 3, pah (accordion) on 2 and 4, a heave-ho stomp, a gull for a lead.
const hi = d(0, Q.min), hVII = d(10, Q.maj), hIV = d(5, Q.maj), hIII = d(3, Q.maj), hv = d(7, Q.min), hV = d(7, Q.maj);
const SHANTY: readonly Rhythm[] = [
  E([[0, 3], [3, 2], [5, 1], [6, 3], [9, 3]]), E([[0, 2], [2, 1], [3, 3], [6, 2], [8, 1], [9, 3]]),
  E([[0, 1], [1, 1], [2, 1], [3, 3], [6, 3], [9, 2], [11, 1]]), E([[0, 3], [3, 3], [6, 2], [8, 1], [9, 1], [10, 2]]),
];
export const HARBOR: TrackSpec = {
  id: 'harbor', tonic: 2, scale: [0, 2, 3, 5, 7, 9, 10],
  form: {
    major: [
      sec('intro', 4, [hi, hi, hVII, hi]),
      sec('A', 8, [hi, hVII, hi, hVII, hi, hIV, hVII, hV], [hi, hVII, hIII, hVII, hi, hIV, hv, hV], [hVII]),
      sec('A2', 8, [hi, hVII, hi, hVII, hi, hIV, hVII, hV], [hi, hVII, hIII, hVII, hi, hIV, hv, hV], [hIII]),
      sec('B', 8, [hIII, hVII, hi, hi, hIII, hVII, hV, hV], [hIII, hVII, hi, hIV, hIII, hVII, hV, hi]),
      sec('A', 8, [hi, hVII, hi, hVII, hi, hIV, hVII, hV], [hi, hVII, hIII, hVII, hi, hIV, hv, hV], [hVII]),
      sec('bridge', 8, [hIV, hi, hIV, hi, hVII, hIII, hVII, hV]),
      sec('B', 8, [hIII, hVII, hi, hi, hIII, hVII, hV, hV], [hIII, hVII, hi, hIV, hIII, hVII, hV, hi]),
      sec('break', 4, [hi, hi, hVII, hV]),
      sec('A2', 8, [hi, hVII, hi, hVII, hi, hIV, hVII, hV], [hi, hVII, hIII, hVII, hi, hIV, hv, hV]),
      sec('outro', 8, [hi, hVII, hi, hIV, hVII, hIII, hV, hi]),
    ],
  },
  build(cx) {
    const kind = cx.sec.kind;
    const root = rootMidi(cx, 38), fifth = root + 7;
    const open = kind === 'intro' || kind === 'break', rest = open || kind === 'outro';
    const fk = fillKind(cx);
    const chordTones = (base: number) => cx.chord.tones.map((t) => base + ((cx.chord.rootPc + t - base + 120) % 12));
    // calm: oom-pah, a shaker on the eighths, the fog and a ship's bell.
    cx.add('calm', 'tuba', 0, 3, root, 1); cx.add('calm', 'tuba', 8, 3, kind === 'bridge' ? root : fifth, 0.85);
    if (!open) for (const s of [4, 12]) for (const n of chordTones(60)) cx.add('calm', 'accordion', s, 3, n, 0.55);
    cx.add('calm', 'pad', 0, 16, toneMidi(cx, 0, 55), 0.35); cx.add('calm', 'pad', 0, 16, toneMidi(cx, 2, 55), 0.3);
    pat(cx, 'calm', 'shaker', '6.3.6.3.6.3.', 0.8);
    if (cx.barIn === 0 && (rest || kind === 'bridge' || cx.cycle % 2 === 0)) cx.add('calm', 'foghorn', 0, 12, rootMidi(cx, 28), 0.9);
    if (cx.barIn % 4 === 0 && (open || kind === 'bridge')) { cx.add('calm', 'rbell', 0, 2, 88, 0.7); cx.add('calm', 'rbell', 2 * E12, 2, 88, 0.55); }
    if (cx.r() < 0.5) cx.add('calm', 'chime', Math.floor(cx.r() * 12) * E12, 2, pick(cx.r, chordNotes(cx.chord, 76, 91)), 0.5);

    // combat: heave-ho stomp and clap, the accordion lilts between the beats.
    if (kind !== 'break') {
      pat(cx, 'combat', 'stomp', kind === 'bridge' ? '9.....5.....' : '9.....9.....', 0.9);
      pat(cx, 'combat', 'kick', '9.....7..5..', 0.6);
    }
    pat(cx, 'combat', 'clap', '...8.....8..', 0.8);
    pat(cx, 'combat', 'rim', kind === 'B' ? '..5..5..5..5' : '..........3.', 0.8);
    for (const s of [2 * E12, 7 * E12, 10 * E12]) for (const n of chordTones(64)) cx.add('combat', 'accordion', s, 1.2, n, 0.5);
    cx.add('combat', 'tuba', 11 * E12, 1, fifth, 0.6);
    if (cx.barIn % 4 === 3) {
      const hits = fk === 0 ? [8, 9, 10, 11] : fk === 1 ? [9, 10, 11, 11.5] : [6, 8, 9, 10, 11];
      hits.forEach((h, i) => cx.add('combat', 'tom', h * E12, 1, 52 - i * 2, 0.6 + i * 0.08));
    }

    // hype: the gull sings the tune; the accordion doubles it low in the chorus; the bridge answers it with a pennywhistle fife.
    if (kind !== 'break' && kind !== 'intro') {
      const ev = melody(cx, { layer: 'hype', inst: kind === 'bridge' ? 'fife' : 'gull', rhythms: SHANTY, lo: kind === 'bridge' ? 74 : 69, hi: kind === 'bridge' ? 91 : 86, salt: 0x51, unit: E12, restP: 0.1, cadence: E([[0, 3], [3, 3], [6, 6]]) });
      if (kind === 'B') for (const e of ev) cx.add('hype', 'accordion', e.step, e.dur, e.midi - 12, 0.55);
    }
    if (cx.barIn % 8 === 7) cx.add('hype', 'foghorn', 0, 12, rootMidi(cx, 28), 0.8);

    // finale: a full shaker, an accordion run up the chord, pumping tuba and toms.
    pat(cx, 'finale', 'shaker', '857857857857', 1);
    for (let i = 0; i < 12; i++) cx.add('finale', 'accordion', i * E12, 1.2, toneMidi(cx, i % 4, 64 + (i >> 2) * 0) + 12 * (i >> 2), 0.45);
    for (const s of [4, 12]) cx.add('finale', 'tuba', s, 2, root + 12, 0.7);
    pat(cx, 'finale', 'tom', '..7..7..7..7', 0.8, 47);
  },
};

// ================= NIGHT MARKET: city-pop / lo-fi groove =================
// E-flat, 100 bpm, swung sixteenths. Electric piano comps, a plucky bass, a koto on pentatonic hooks, lantern chimes.
const mI = d(0, Q.maj7), mIV = d(5, Q.maj7), miii = d(4, Q.min7), mvi = d(9, Q.min7), mii = d(2, Q.min7), mV = d(7, Q.dom7), mbVI = d(8, Q.maj7), mbVII = d(10, Q.maj7);
const MARKET_HOOKS: readonly Rhythm[] = [
  E([[0, 2], [2, 1], [3, 1], [4, 3], [8, 2], [10, 2], [12, 4]]), E([[0, 1], [2, 2], [4, 2], [6, 1], [7, 1], [8, 4], [12, 2], [14, 2]]),
  E([[0, 3], [3, 1], [4, 2], [6, 2], [8, 2], [10, 1], [11, 1], [12, 4]]), E([[2, 2], [4, 2], [6, 2], [8, 3], [11, 1], [12, 4]]),
];
export const MARKET: TrackSpec = {
  id: 'market', tonic: 3, scale: [0, 2, 4, 7, 9], swing: 0.3,
  form: {
    major: [
      sec('intro', 4, [mIV, miii, mii, mV]),
      sec('A', 8, [mIV, mV, miii, mvi, mii, mV, mI, mI], [mIV, miii, mii, mV, mIV, mV, mI, mvi], [d(1, Q.dom7), d(2, Q.dom7)]),
      sec('A2', 8, [mIV, mV, miii, mvi, mIV, mV, mI, mI], [mIV, miii, mvi, mV, mIV, mV, mI, mI], [d(4, Q.dom7)]),
      sec('B', 8, [mI, mvi, mii, mV, mI, miii, mIV, mV], [mI, mvi, mii, mV, mI, mbVII, mIV, mV]),
      sec('bridge', 8, [mbVI, mbVII, mI, mI, mbVI, mbVII, miii, mV]),
      sec('break', 4, [mI, mIV, mI, mV]),
      sec('A', 8, [mIV, mV, miii, mvi, mii, mV, mI, mI], [mIV, miii, mii, mV, mIV, mV, mI, mvi], [d(1, Q.dom7)]),
      sec('B', 8, [mI, mvi, mii, mV, mI, miii, mIV, mV], [mI, mvi, mii, mV, mI, mbVII, mIV, mV]),
      sec('A2', 8, [mIV, mV, miii, mvi, mIV, mV, mI, mI], [mIV, miii, mvi, mV, mIV, mV, mI, mI]),
      sec('outro', 4, [mIV, miii, mI, mI]),
    ],
  },
  build(cx) {
    const kind = cx.sec.kind;
    const open = kind === 'intro' || kind === 'break' || kind === 'outro';
    const fk = fillKind(cx);
    const compPat = [
      '9..5..9...5.....', '..9...5..9..5...', '9.....5.9..5..7.', '.9..5...9.5..5..',
    ][cx.secIdx % 4]!;
    // calm: rootless piano comps, a plucky bass, soft kick, swung shaker, lantern chimes.
    comp(cx, 'calm', 'epiano', open ? '9.......5.......' : compPat, 0.55, 60, 3);
    const bassPat = open ? '9.......5...5...' : ['9..5..7..9..5.7.', '9...5.7.9...5.9.'][cx.secIdx % 2]!;
    bassLine(cx, 'calm', 'fbass', bassPat, [0, 12, 7, 0, 10, 12, 7, 5], 0.85, 33, 2);
    pat(cx, 'calm', 'kick', '9.....5...5.....', 0.5);
    pat(cx, 'calm', 'shaker', '4.3.4.3.4.3.4.3.', 0.9);
    const bells = scaleNotes(cx.tonic, [0, 2, 4, 7, 9], 79, 96);
    if (cx.r() < 0.7) cx.add('calm', 'chime', Math.floor(cx.r() * 8) * 2, 2, pick(cx.r, bells), 0.55);
    if (cx.barIn % 4 === 0) cx.add('calm', 'chime', 0, 2, pick(cx.r, bells), 0.7);

    // combat: a lazy backbeat, funk kick, offbeat open hats, koto arpeggios.
    pat(cx, 'combat', 'rim', '....9.....5.9...', 0.9);
    pat(cx, 'combat', 'kick', kind === 'break' ? '9...............' : '9..5..5.9..5.5..', 0.9);
    pat(cx, 'combat', 'hat', '6.4.6.4.6.4.6.4.', 0.8);
    pat(cx, 'combat', 'ohat', '..............5.', 0.7);
    const arp = chordNotes(cx.chord, 67, 86);
    const arpPat = '9.5.7.5.9.5.7.5.';
    let k = 0;
    for (let s = 0; s < 16; s += 2) { if (arpPat[s] !== '.') cx.add('combat', 'koto', s, 2, arp[(k++ * 2 + (cx.barIn % 2)) % arp.length]!, (Number(arpPat[s]) / 9) * 0.6); }
    if (cx.barIn % 4 === 3) { if (fk === 0) roll(cx, 'combat', 'rim', 12, 0.3, 0.8); else pat(cx, 'combat', 'tom', '............5.79', 0.8, 50); }

    // hype: the koto sings the hook, a lantern chime doubling the long notes an octave up.
    if (kind !== 'break' && kind !== 'intro') {
      const ev = melody(cx, { layer: 'hype', inst: 'koto', rhythms: MARKET_HOOKS, lo: 72, hi: 91, salt: 0x6d, restP: 0.1, cadence: E([[0, 2], [2, 2], [4, 12]]), vel: 0.9 });
      for (const e of ev) if (e.dur >= 3) cx.add('hype', 'chime', e.step, 2, e.midi + 12, 0.5);
    }
    // finale: sixteenth shaker, claps, a chime run, bass octave fills.
    pat(cx, 'finale', 'shaker', '6564656465646564', 0.9);
    pat(cx, 'finale', 'clap', '....7.......7...', 0.8);
    if (cx.barIn % 2 === 0) for (let i = 0; i < 6; i++) cx.add('finale', 'chime', i * 2, 2, bells[(i * 2 + cx.barIn) % bells.length]!, 0.4);
    bassLine(cx, 'finale', 'fbass', '..5...5...5...5.', [12], 0.6, 33, 1);
  },
};

// ================= MUSEUM: noir heist jazz =================
// C minor, 112 bpm, triplet swing. Walking upright, brushes on the ride, a muted trumpet over vibraphone comps.
const mi7 = d(0, Q.min7), miv7 = d(5, Q.min7), miiø = d(2, Q.m7b5), mV7 = d(7, Q.dom7), mbVIM = d(8, Q.maj7), mbVII7 = d(10, Q.dom7), mbIII = d(3, Q.maj7), mimaj = d(0, Q.mmaj7);
const NOIR: readonly Rhythm[] = [
  E([[0, 6], [6, 2], [8, 4], [12, 2], [14, 2]]), E([[2, 2], [4, 4], [10, 2], [12, 4]]), E([[0, 2], [2, 2], [4, 2], [6, 2], [8, 8]]), E([[0, 4], [4, 2], [6, 1], [7, 1], [8, 6]]),
];
export const MUSEUM: TrackSpec = {
  id: 'museum', tonic: 0, scale: [0, 2, 3, 5, 7, 8, 10, 11], swing: 0.6,
  form: {
    major: [
      sec('intro', 8, [mi7, mi7, miv7, mV7, mi7, mbVIM, miiø, mV7]),
      sec('A', 8, [mi7, miv7, miiø, mV7, mi7, mbVIM, miiø, mV7], [mi7, miv7, mbVII7, mbIII, mbVIM, miiø, mV7, mi7], [d(1, Q.dom7)]),
      sec('A2', 8, [mi7, miv7, miiø, mV7, mi7, mbVIM, miiø, mV7], [mi7, miv7, mbVII7, mbIII, mbVIM, miiø, mV7, mi7], [d(1, Q.dom7)]),
      sec('B', 8, [miv7, mbVII7, mbIII, mbVIM, miiø, mV7, mi7, mi7], [miv7, mbVII7, mbIII, mbVIM, miiø, d(1, Q.dom7), mi7, mV7]),
      sec('A', 8, [mi7, miv7, miiø, mV7, mi7, mbVIM, miiø, mV7], [mi7, miv7, mbVII7, mbIII, mbVIM, miiø, mV7, mi7]),
      sec('bridge', 8, [mi7, mi7, miv7, miv7, mbVIM, mV7, mi7, mV7]),
      sec('break', 4, [mi7, mbVIM, miiø, mV7]),
      sec('A2', 8, [mi7, miv7, miiø, mV7, mi7, mbVIM, miiø, mV7], [mi7, miv7, mbVII7, mbIII, mbVIM, miiø, mV7, mi7]),
      sec('B', 8, [miv7, mbVII7, mbIII, mbVIM, miiø, mV7, mi7, mi7]),
      sec('outro', 4, [mi7, miv7, mV7, mimaj]),
    ],
  },
  build(cx) {
    const kind = cx.sec.kind;
    const fk = fillKind(cx);
    const nextRoot = rootMidi({ ...cx, chord: cx.next } as Cx, 36);
    const root = rootMidi(cx, 36);
    // calm: walking bass (root, chord tone, fifth, chromatic approach), brush ride, foot hat, sparse vibes comps.
    const third = root + cx.chord.tones[1]!, fifthN = root + 7;
    const approach = nextRoot + (cx.r() < 0.5 ? -1 : 1) + (nextRoot < root - 6 ? 12 : nextRoot > root + 6 ? -12 : 0);
    const step2 = pick(cx.r, [third, fifthN, root + 12]);
    const walk = kind === 'break' && cx.barIn % 2 === 1 ? [root, third, fifthN, root + 12] : [root, step2, pick(cx.r, [fifthN, root + 9, third + 12 > root + 14 ? third : third + 12]), approach];
    walk.forEach((n, i) => cx.add('calm', 'upright', i * 4, 3.4, n, i === 0 ? 1 : 0.8));
    pat(cx, 'calm', 'brush', kind === 'break' ? '9.......9.......' : '9...9.5.9...9.5.', 0.8);
    pat(cx, 'calm', 'hat', '....5.......5...', 0.6);
    if (kind !== 'break' && kind !== 'intro' && cx.cr() < 0.7) comp(cx, 'calm', 'vibes', cx.cr() < 0.5 ? '......7.........' : '..............7.', 0.5, 64, 3, 0.1);
    if (kind === 'intro' && cx.barIn % 4 === 0) cx.add('calm', 'vibes', 0, 6, toneMidi(cx, 3, 79), 0.5);

    // combat: feathered kick, cross-stick, snare ghosts.
    pat(cx, 'combat', 'kick', '5...5...5...5...', 0.5);
    pat(cx, 'combat', 'rim', kind === 'break' ? '................' : '....8.......8...', 0.9);
    const ghosts = [3, 7, 10, 11, 15];
    for (const g of ghosts) if (cx.r() < 0.4) cx.add('combat', 'brush', g, 1, 0, 0.45);
    pat(cx, 'combat', 'swirl', '..........7.....', 0.8);
    if (cx.barIn % 4 === 3) { if (fk === 0) { cx.add('combat', 'rim', 12, 1, 0, 0.5); cx.add('combat', 'rim', 14, 1, 0, 0.55); cx.add('combat', 'rim', 15, 1, 0, 0.7); } else roll(cx, 'combat', 'brush', 10, 0.3, 0.8); }

    // hype: the muted trumpet; in the solo section the vibraphone plays the tune.
    if (kind !== 'break' && kind !== 'intro') {
      const solo = kind === 'bridge';
      melody(cx, { layer: 'hype', inst: solo ? 'vibes' : 'trumpet', rhythms: NOIR, lo: 67, hi: 86, salt: 0x77, restP: 0.15, cadence: E([[0, 4], [4, 12]]), vel: solo ? 0.9 : 1 });
      if (solo) comp(cx, 'hype', 'trumpet', '..............7.', 0.5, 62, 2);
    }
    // finale: ride in eighths, the trumpet shadowed by vibraphone, tom breaks.
    pat(cx, 'finale', 'brush', '9.9.9.9.9.9.9.9.', 0.7);
    pat(cx, 'finale', 'hat', '....7.......7...', 0.6);
    if (cx.barIn % 2 === 0) for (let i = 0; i < 4; i++) cx.add('finale', 'vibes', 8 + i * 2, 2, toneMidi(cx, i, 72), 0.45);
    if (cx.barIn % 4 === 3) roll(cx, 'finale', 'brush', 12, 0.4, 0.9);
  },
};

// ================= SUBMARINE PEN: tense techno-thriller =================
// C-sharp phrygian, 118 bpm. Sonar pings on the beat, a pulsing low bass, four on the floor, metallic hull hits, an acid line.
const si = d(0, Q.min), sII = d(1, Q.maj), sVII = d(10, Q.maj), siv = d(5, Q.min), sVI = d(8, Q.maj), sdim = d(7, Q.dim);
const SONAR_LEAD: readonly Rhythm[] = [
  E([[0, 2], [2, 2], [4, 1], [5, 1], [6, 2], [8, 2], [10, 2], [12, 4]]), E([[0, 1], [1, 1], [2, 2], [4, 2], [6, 2], [8, 1], [9, 1], [10, 2], [12, 2], [14, 2]]),
  E([[0, 3], [3, 1], [4, 2], [6, 2], [8, 4], [12, 2], [14, 2]]),
];
export const SUBPEN: TrackSpec = {
  id: 'subpen', tonic: 1, scale: [0, 1, 3, 5, 7, 8, 10],
  form: {
    major: [
      sec('intro', 8, [si, si, si, sII, si, si, sII, si]),
      sec('A', 8, [si, si, sII, si, si, sVII, sII, si], [si, sII, si, sVI, siv, sII, si, sdim], [sII]),
      sec('A2', 8, [si, si, sII, si, si, sVII, sII, si], [si, sII, si, sVI, siv, sII, si, sdim], [sVII]),
      sec('B', 8, [sVI, sVII, si, si, sVI, sII, sVII, si]),
      sec('break', 8, [si, si, sII, si, si, si, sII, sII]),
      sec('build', 8, [si, sVII, sVI, sVII, si, sVII, sVI, sII]),
      sec('A', 8, [si, si, sII, si, si, sVII, sII, si], [si, sII, si, sVI, siv, sII, si, sdim]),
      sec('B', 8, [sVI, sVII, si, si, sVI, sII, sVII, si]),
      sec('A2', 8, [si, si, sII, si, si, sVII, sII, si], [si, sII, si, sVI, siv, sII, si, sdim]),
      sec('outro', 4, [si, si, sII, si]),
    ],
  },
  build(cx) {
    const kind = cx.sec.kind;
    const root = rootMidi(cx, 25);
    const sparse = kind === 'intro' || kind === 'outro' || kind === 'break';
    // calm: a sonar ping on the one with its echoes, the low pulse, a drone, the odd clank against the hull.
    const ping = 83 + (cx.chord.rootPc === cx.tonic ? 0 : 2);
    cx.add('calm', 'sonar', 0, 4, ping, 0.9); cx.add('calm', 'sonar', 6, 4, ping, 0.3); cx.add('calm', 'sonar', 11, 4, ping, 0.12);
    if (kind === 'break' || kind === 'build') cx.add('calm', 'sonar', 8, 4, ping + 5, 0.5);
    bassLine(cx, 'calm', 'tbass', sparse ? '9...5...7...5...' : '9.5.7.5.9.5.7.5.', [0, 0, 12, 0, 7, 0], 1, 25, 1.5);
    voicing(cx, 'calm', 'dread', 0.9, 48, 0, 16);
    if (cx.r() < (sparse ? 0.3 : 0.4)) cx.add('calm', 'metal', Math.floor(cx.r() * 16), 2, 52 + Math.floor(cx.r() * 14), 0.55);
    pat(cx, 'calm', 'hat', '....5.......5...', 0.5);

    // combat: the four on the floor, offbeat open hats, claps, a fast pulse.
    if (kind !== 'break') pat(cx, 'combat', 'kick', '9...9...9...9...', 1);
    else pat(cx, 'combat', 'kick', '9.......', 0.8);
    pat(cx, 'combat', 'ohat', '..9...9...9...9.', 0.9);
    pat(cx, 'combat', 'clap', '....8.......8...', 0.9);
    pat(cx, 'combat', 'hat', '4.5.4.5.4.5.4.5.', 0.7);
    bassLine(cx, 'combat', 'tbass', '..5.5.7...5.5.7.', [0, 12, 0, 7], 0.8, 25, 1);
    if (kind === 'build') roll(cx, 'combat', 'snare', cx.barIn >= 6 ? 0 : 8, 0.25, 0.9);
    else if (cx.barIn % 4 === 3) roll(cx, 'combat', 'clap', fillKind(cx, 2) === 0 ? 12 : 8, 0.3, 0.85);

    // hype: the acid line in phrygian.
    if (kind !== 'intro' && kind !== 'break') melody(cx, { layer: 'hype', inst: 'acid', rhythms: SONAR_LEAD, lo: 61, hi: 80, salt: 0x2b, restP: 0.1, cadence: E([[0, 4], [4, 4], [8, 8]]) });
    // finale: sixteenth arpeggio, pings on every beat, hull rolls.
    const arp = chordNotes(cx.chord, 61, 85);
    const order = [0, 2, 1, 3, 2, 1, 3, 2, 0, 2, 1, 3, 4, 3, 2, 1];
    for (let s = 0; s < 16; s++) cx.add('finale', 'acid', s, 1, arp[order[s]! % arp.length]!, s % 4 === 0 ? 0.8 : 0.5);
    for (const s of [4, 8, 12]) cx.add('finale', 'sonar', s, 3, ping + (s === 8 ? 5 : 0), 0.5);
    if (cx.barIn % 2 === 1) pat(cx, 'finale', 'metal', '.......5.5.5.5.9', 0.8, 60);
  },
};

// ================= PARK: bright folk-pop =================
// G major, 124 bpm. Ukulele strums, a bouncy tuba-ish bass, hand claps, a whistled tune doubled by marimba.
const pI = d(0, Q.maj), pIV = d(5, Q.maj), pV = d(7, Q.maj), pvi = d(9, Q.min), pii = d(2, Q.min), piii = d(4, Q.min);
const FOLK: readonly Rhythm[] = [
  E([[0, 2], [2, 1], [3, 1], [4, 2], [6, 2], [8, 4], [12, 4]]), E([[0, 1], [1, 1], [2, 2], [4, 2], [6, 2], [8, 2], [10, 2], [12, 4]]),
  E([[0, 4], [4, 2], [6, 1], [7, 1], [8, 2], [10, 1], [11, 1], [12, 4]]), E([[2, 2], [4, 2], [6, 2], [8, 3], [11, 1], [12, 4]]),
];
export const PARK: TrackSpec = {
  id: 'park', tonic: 7, scale: [0, 2, 4, 5, 7, 9, 11],
  form: {
    major: [
      sec('intro', 4, [pI, pV, pvi, pIV]),
      sec('A', 8, [pI, pV, pvi, pIV, pI, pV, pIV, pV], [pI, pIV, pvi, pV, pI, pIV, pV, pI], [d(4, Q.dom7), d(2, Q.dom7)]),
      sec('A2', 8, [pI, pV, pvi, pIV, pI, pV, pIV, pV], [pI, pIV, pvi, pV, pI, pIV, pV, pI], [d(4, Q.dom7)]),
      sec('B', 8, [pvi, pIV, pI, pV, pvi, pIV, pV, pV], [pIV, pI, pV, pvi, pIV, pI, pV, pV]),
      sec('A', 8, [pI, pV, pvi, pIV, pI, pV, pIV, pV], [pI, pIV, pvi, pV, pI, pIV, pV, pI]),
      sec('bridge', 8, [pIV, pV, piii, pvi, pIV, pV, pI, pI]),
      sec('B', 8, [pvi, pIV, pI, pV, pvi, pIV, pV, pV], [pIV, pI, pV, pvi, pIV, pI, pV, pV]),
      sec('break', 8, [pI, pI, pIV, pIV, pvi, pV, pI, pV]),
      sec('A2', 8, [pI, pV, pvi, pIV, pI, pV, pIV, pV], [pI, pIV, pvi, pV, pI, pIV, pV, pI]),
      sec('B', 8, [pvi, pIV, pI, pV, pvi, pIV, pV, pV], [pIV, pI, pV, pvi, pIV, pI, pV, pV]),
      sec('outro', 4, [pIV, pV, pI, pI]),
    ],
  },
  build(cx) {
    const kind = cx.sec.kind;
    const root = rootMidi(cx, 36), fifth = root + 7;
    const stripped = kind === 'bridge';
    const fk = fillKind(cx);
    // calm: strummed ukulele, oom-pah bass, soft claps on 2 and 4, a shaker.
    comp(cx, 'calm', 'uke', kind === 'intro' ? '9...5...9...5...' : '9.5.7.5.9.5.7.5.', 0.8, 62, 2, 0.12);
    cx.add('calm', 'tuba', 0, 3, root, 0.9); cx.add('calm', 'tuba', 8, 3, fifth, 0.8);
    if (!stripped && kind !== 'intro') { cx.add('calm', 'tuba', 4, 2, root + 12, 0.5); cx.add('calm', 'tuba', 12, 2, fifth, 0.5); }
    pat(cx, 'calm', 'clap', '....6.......6...', 0.6);
    pat(cx, 'calm', 'shaker', '..5...5...5...5.', 0.8);
    const spark = chordNotes(cx.chord, 74, 93);
    if (cx.r() < 0.6) cx.add('calm', 'marimba', Math.floor(cx.r() * 8) * 2, 2, pick(cx.r, spark), 0.55);

    // combat: folk stomp, claps, tambourine.
    if (kind !== 'break') pat(cx, 'combat', 'kick', stripped ? '9...............' : '9.......9...5...', 0.9);
    pat(cx, 'combat', 'clap', '....9.......9...', 1);
    pat(cx, 'combat', 'shaker', '9.5.9.5.9.5.9.5.', 0.8);
    pat(cx, 'combat', 'snare', '....7.......7...', 0.4);
    if (cx.barIn % 4 === 3) { if (fk === 0) roll(cx, 'combat', 'clap', 12, 0.3, 0.9); else pat(cx, 'combat', 'tom', '..........5.7.9.', 0.8, 50); }

    // hype: the whistled tune, marimba doubling a bar behind in the chorus.
    if (kind !== 'intro') {
      const ev = melody(cx, { layer: 'hype', inst: 'whistle', rhythms: FOLK, lo: 72, hi: 91, salt: 0x1f, restP: 0.08, cadence: E([[0, 4], [4, 12]]) });
      if (kind === 'B' || kind === 'bridge') for (const e of ev) cx.add('hype', 'marimba', e.step, 2, e.midi - 12, 0.6);
    }
    // finale: a clap on every eighth, bells running up the chord, whistle harmony a sixth up.
    pat(cx, 'finale', 'clap', '9.5.9.5.9.5.9.5.', 0.8);
    for (let i = 0; i < 4; i++) cx.add('finale', 'glock', 8 + i * 2, 2, toneMidi(cx, i, 79), 0.5);
    cx.add('finale', 'whistle', 0, 6, toneMidi(cx, 2, 79), 0.45);
    pat(cx, 'finale', 'tom', '..........7.9.9.', 0.8, 52);
  },
};
