import { GUNS, type GunId, type WeaponId } from '../shared/defs.ts';

/** How a gun is reloaded, which picks the reload animation and its sounds. */
export type ReloadFamily = 'pistol' | 'mag' | 'pump' | 'box';
export type ReloadCue = 'magOut' | 'magIn' | 'slide' | 'bolt' | 'shell' | 'pump' | 'boxOpen' | 'boxClose';

export const RELOAD_FAMILY: Record<WeaponId, ReloadFamily> = { pistol: 'pistol', smg: 'mag', assault: 'mag', sniper: 'mag', shotgun: 'pump', lmg: 'box' };

/**
 * Where in a reload, as a share of its length, each sound lands. The reload frames change on the same beats, so the magazine
 * leaves the gun on `magOut` and seats on `magIn` whatever the gun's reload time.
 */
export const RELOAD_BEATS: Record<ReloadFamily, readonly { at: number; cue: ReloadCue }[]> = {
  pistol: [{ at: 0.12, cue: 'magOut' }, { at: 0.55, cue: 'magIn' }, { at: 0.82, cue: 'slide' }],
  mag: [{ at: 0.14, cue: 'magOut' }, { at: 0.58, cue: 'magIn' }, { at: 0.84, cue: 'bolt' }],
  pump: [{ at: 0.2, cue: 'shell' }, { at: 0.4, cue: 'shell' }, { at: 0.6, cue: 'shell' }, { at: 0.86, cue: 'pump' }],
  box: [{ at: 0.1, cue: 'boxOpen' }, { at: 0.26, cue: 'magOut' }, { at: 0.56, cue: 'magIn' }, { at: 0.76, cue: 'boxClose' }, { at: 0.9, cue: 'bolt' }],
};

/** Where each of a family's six reload frames starts, as a share of the reload, so the hand moves on the sound's beat. */
export const RELOAD_FRAMES: Record<ReloadFamily, readonly number[]> = {
  pistol: [0, 0.12, 0.33, 0.5, 0.7, 0.82],
  mag: [0, 0.14, 0.3, 0.44, 0.56, 0.8],
  pump: [0, 0.16, 0.3, 0.4, 0.8, 0.88],
  box: [0, 0.2, 0.32, 0.45, 0.56, 0.74],
};

export const reloadFamily = (gun: GunId): ReloadFamily => RELOAD_FAMILY[GUNS[gun].base];

/** The cues a reload passed going from `from` to `to` (shares of the reload), in order. */
export const beatsCrossed = (family: ReloadFamily, from: number, to: number): ReloadCue[] =>
  RELOAD_BEATS[family].filter((b) => b.at > from && b.at <= to).map((b) => b.cue);

/** A manual action worked after every shot: the pump flips a shell out, the bolt a casing. `atMs` is how long after the shot. */
export type Cycle = { kind: 'pump' | 'bolt'; atMs: number };

const PUMPED: ReadonlySet<GunId> = new Set(['shotgun', 'slugGun', 'railSlug', 'boomSlug']);
const BOLTED: ReadonlySet<GunId> = new Set(['sniper', 'longshot', 'piercer', 'artillery']);

export const cycleOf = (gun: GunId): Cycle | null =>
  PUMPED.has(gun) ? { kind: 'pump', atMs: 260 } : BOLTED.has(gun) ? { kind: 'bolt', atMs: 420 } : null;
