import { GUNS, type GunId } from '../shared/defs.ts';
import type { FoleyId } from './foley.ts';

/**
 * When the beats of each class's reload land, as a share (0..1) of the reload's length. The arm choreography (reloadanim.ts)
 * is keyframed on these, and the reload foley (`soundTimeline` below, voiced by reloadsfx.ts) fires on the same beats, so every
 * click lands on its motion at the reload's real length (perks and evolved guns included).
 */
export const BEATS = {
  /** Pistol, SMG, assault: grab the mag, `release` its button, pull it (`out` scrapes, `drop` lets go), fresh one from the vest (`pouch` rustles, `take`), `near` the well (its scrape), `seat` snaps it in, `slap`, rack the slide or handle back (`rackBack`) and forward (`rack` clicks). */
  box: { grab: 0.1, release: 0.125, out: 0.15, drop: 0.27, pouch: 0.44, take: 0.5, near: 0.6, seat: 0.64, slap: 0.72, rackBack: 0.88, rack: 0.93 },
  /** LMG: lift the feed cover (`lid` latches and swings, `lidUp` lifts the belt), pull the box (`drop` lets go), `near` and `seat` the fresh one, `lay` the belt, `shut` the cover, rack. */
  lmg: { lid: 0.15, lidUp: 0.2, out: 0.22, drop: 0.34, pouch: 0.48, take: 0.52, near: 0.58, seat: 0.64, lay: 0.68, shut: 0.76, rackBack: 0.86, rack: 0.92 },
  /** Bolt-action: `lift` of the handle, `up` and `back` of the bolt, `take` and `seat` the stripper clip, `press` its rounds down, `slide` the bolt forward (`fwd` arrives), `latch` it down. */
  sniper: { grab: 0.1, lift: 0.13, up: 0.16, back: 0.25, take: 0.4, seat: 0.62, press: 0.7, slide: 0.78, fwd: 0.84, latch: 0.9 },
  /** Shotgun: shells are thumbed in from `start` to `end`, then the pump racks back (`pumpBack`) and forward (`pump` clicks). */
  tube: { start: 0.05, end: 0.84, pumpBack: 0.92, pump: 0.97 },
  /** Akimbo: each pistol's own reload takes half of the whole (`u` 0..1 within its half): the back pistol first, then the front. */
  akimbo: { release: 0.22, out: 0.27, pop: 0.32, pouch: 0.36, fresh: 0.4, near: 0.56, seat: 0.62, slap: 0.72 },
} as const;

/** The shells a tube reload loads: one per round of the gun's magazine, up to a count that stays readable. */
export const SHELLS_MAX = 6;
export const shellCount = (mag: number): number => Math.max(1, Math.min(SHELLS_MAX, mag));
/** When shell `i` of `n` clicks home, as a share of the reload. */
export const shellSeat = (i: number, n: number): number => BEATS.tube.start + ((BEATS.tube.end - BEATS.tube.start) / n) * (i + 0.92);

/** When shell `i` of `n` is picked from the pouch, as a share of the reload. */
export const shellPick = (i: number, n: number): number => BEATS.tube.start + ((BEATS.tube.end - BEATS.tube.start) / n) * (i + 0.42);

/** How long a dropped magazine is in the air before it first hits the floor (ms): its arc is `casingHeight` in gunfx.ts. */
export const MAG_FALL_MS = 180;

/** One sound of a reload: `at` is the share of the reload it fires on; `afterMs` is real time after the beat (a mag falling), not scaled by the reload. */
export type TimelineEntry = {
  at: number;
  id: FoleyId | 'foley:drop';
  /** Relative loudness, pitch (1 = the class's own) and stereo placement (your own gun only). */
  gain?: number; pitch?: number; pan?: number; afterMs?: number;
};

type BoxBase = 'pistol' | 'smg' | 'assault';

function boxEntries(b: BoxBase, f: (share: number) => number, w: { pitch?: number; pan?: number } = {}): TimelineEntry[] {
  const B = BEATS.box, o = { ...(w.pitch === undefined ? {} : { pitch: w.pitch }), ...(w.pan === undefined ? {} : { pan: w.pan }) };
  return [
    { at: f(B.release), id: `foley:release:${b}`, ...o }, { at: f(B.out), id: `foley:magout:${b}`, ...o },
    { at: f(B.drop), id: 'foley:drop', afterMs: MAG_FALL_MS, ...o }, { at: f(B.pouch), id: 'foley:pouch', ...o },
    { at: f(B.near), id: `foley:magscrape:${b}`, ...o }, { at: f(B.seat), id: `foley:magseat:${b}`, ...o }, { at: f(B.slap), id: `foley:slap:${b}`, ...o },
    { at: f(B.rackBack), id: `foley:rackback:${b}`, ...o }, { at: f(B.rack), id: `foley:rack:${b}`, ...o },
  ];
}

function buildTimeline(gun: GunId): TimelineEntry[] {
  const { base, look, mag } = GUNS[gun];
  if (look.hands === 2) {
    // Two pistols, one after the other, the back one (left in the pan) first.
    const A = BEATS.akimbo, out: TimelineEntry[] = [];
    for (const half of [0, 1]) {
      const f = (u: number) => (half + u) / 2, o = { pitch: half ? 1.03 : 0.97, pan: half ? 0.3 : -0.3, gain: 0.88 };
      out.push(
        { at: f(A.release), id: 'foley:release:pistol', ...o }, { at: f(A.out), id: 'foley:magout:pistol', ...o },
        { at: f(A.pop), id: 'foley:drop', afterMs: MAG_FALL_MS, ...o }, { at: f(A.pouch), id: 'foley:pouch', ...o },
        { at: f(A.near), id: 'foley:magscrape:pistol', ...o }, { at: f(A.seat), id: 'foley:magseat:pistol', ...o }, { at: f(A.slap), id: 'foley:slap:pistol', ...o },
      );
    }
    return out;
  }
  switch (base) {
    case 'pistol': case 'smg': case 'assault': return boxEntries(base, (x) => x);
    case 'lmg': {
      const B = BEATS.lmg;
      return [
        { at: B.lid, id: 'foley:latch' }, { at: B.lid, id: 'foley:creak' }, { at: B.lidUp, id: 'foley:belt' }, { at: B.out, id: 'foley:magout:lmg' },
        { at: B.drop, id: 'foley:drop', afterMs: MAG_FALL_MS + 20, gain: 1.35, pitch: 0.72 }, { at: B.pouch, id: 'foley:pouch', gain: 1.3, pitch: 0.8 },
        { at: B.near, id: 'foley:magscrape:lmg' }, { at: B.seat, id: 'foley:magseat:lmg' }, { at: B.lay, id: 'foley:beltlay' }, { at: B.shut, id: 'foley:slam' },
        { at: B.rackBack, id: 'foley:rackback:lmg' }, { at: B.rack, id: 'foley:rack:lmg' },
      ];
    }
    case 'shotgun': {
      const n = shellCount(mag), out: TimelineEntry[] = [];
      for (let i = 0; i < n; i++) {
        // A tiny pitch walk so a row of shells is not one sample six times.
        const p = 1 + 0.025 * (i % 3);
        out.push({ at: shellPick(i, n), id: 'foley:shellpick', pitch: p }, { at: shellSeat(i, n), id: 'foley:shellin', pitch: p });
      }
      out.push({ at: BEATS.tube.pumpBack, id: 'foley:pumpback' }, { at: BEATS.tube.pump, id: 'foley:pump' });
      return out;
    }
    case 'sniper': {
      const B = BEATS.sniper;
      return [
        { at: B.lift, id: 'foley:boltup' }, { at: B.up, id: 'foley:boltdraw' }, { at: B.back, id: 'foley:boltrear' }, { at: B.take, id: 'foley:pouch', gain: 0.8, pitch: 0.9 },
        { at: B.seat, id: 'foley:clipseat' }, { at: B.press, id: mag <= 2 ? 'foley:round' : 'foley:ratchet' },
        { at: B.slide, id: 'foley:boltfwd' }, { at: B.latch, id: 'foley:boltlock' },
      ];
    }
  }
}

const timelines = new Map<GunId, readonly TimelineEntry[]>();

/** Every sound of `gun`'s reload, in order, each on the beat of the arm animation it belongs to. Silenced guns sound the same: the foley is not suppressed. */
export function soundTimeline(gun: GunId): readonly TimelineEntry[] {
  let t = timelines.get(gun);
  if (!t) timelines.set(gun, (t = buildTimeline(gun).sort((a, b) => a.at - b.at)));
  return t;
}
