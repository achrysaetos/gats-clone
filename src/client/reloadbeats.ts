import type { WeaponId } from '../shared/defs.ts';

/**
 * When the beats of each class's reload land, as a share (0..1) of the reload's length. The arm choreography (reloadanim.ts)
 * is keyframed on these, and the reload sounds (sfx.ts) are timed to the same beats, so the clicks land on the motions.
 */
export const BEATS = {
  /** Pistol, SMG, assault: grab the mag, pull it (`out` clicks, `drop` lets go), fresh one from the vest (`take`), `seat` snaps it in, `slap`, rack the slide or handle back and forward (`rack` clicks). */
  box: { grab: 0.1, out: 0.15, drop: 0.27, pouch: 0.44, take: 0.5, near: 0.6, seat: 0.64, slap: 0.72, rackBack: 0.88, rack: 0.93 },
  /** LMG: lift the feed cover (`lid` clicks), pull the box (`drop` lets go), `seat` the fresh one, `shut` the cover, rack. */
  lmg: { lid: 0.15, lidUp: 0.2, out: 0.22, drop: 0.34, pouch: 0.48, take: 0.52, seat: 0.64, shut: 0.76, rackBack: 0.86, rack: 0.92 },
  /** Bolt-action: `back` of the bolt, `seat` the stripper clip, `fwd` of the bolt, `latch` it down. */
  sniper: { grab: 0.1, up: 0.16, back: 0.25, take: 0.4, seat: 0.62, press: 0.7, fwd: 0.84, latch: 0.9 },
  /** Shotgun: shells are thumbed in from `start` to `end`, then the pump racks back (`pumpBack`) and forward (`pump` clicks). */
  tube: { start: 0.05, end: 0.84, pumpBack: 0.92, pump: 0.97 },
} as const;

/** The shells a tube reload loads: one per round of the gun's magazine, up to a count that stays readable. */
export const SHELLS_MAX = 6;
export const shellCount = (mag: number): number => Math.max(1, Math.min(SHELLS_MAX, mag));
/** When shell `i` of `n` clicks home, as a share of the reload. */
export const shellSeat = (i: number, n: number): number => BEATS.tube.start + ((BEATS.tube.end - BEATS.tube.start) / n) * (i + 0.92);

/** The share of the reload at which each sound of a class's reload plays, in order, by what it is. */
export const SOUND_BEATS: Record<WeaponId, Readonly<Record<string, number>>> = {
  pistol: { out: BEATS.box.out, in: BEATS.box.seat, slap: BEATS.box.slap, rack: BEATS.box.rack },
  smg: { out: BEATS.box.out, in: BEATS.box.seat, slap: BEATS.box.slap, rack: BEATS.box.rack },
  assault: { out: BEATS.box.out, swap: BEATS.box.pouch, in: BEATS.box.seat, slap: BEATS.box.slap, rack: BEATS.box.rack },
  lmg: { lid: BEATS.lmg.lid, out: BEATS.lmg.out, swap: BEATS.lmg.pouch, in: BEATS.lmg.seat, shut: BEATS.lmg.shut, rack: BEATS.lmg.rack },
  shotgun: { pump: BEATS.tube.pump },
  sniper: { back: BEATS.sniper.back, in: BEATS.sniper.seat, fwd: BEATS.sniper.fwd, latch: BEATS.sniper.latch },
};
