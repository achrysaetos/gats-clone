import { GUNS, type GunId, type WeaponId } from './defs.ts';

/** The ranges guns are judged at: close, mid and long, then the far edge of the view. */
export const AIM_BANDS = [70, 200, 400, 600] as const;
export type Band = (typeof AIM_BANDS)[number];
const [CLOSE, MID, LONG] = AIM_BANDS;

/** Which classes each band belongs to. */
export const BAND_OWNERS: Record<Band, readonly WeaponId[]> = { 70: ['smg', 'shotgun'], 200: ['assault'], 400: ['lmg', 'sniper'], 600: ['sniper'] };

/** A gun's job: the bands it should win, and the armour it is meant to beat. Evolutions inherit their parent's job. */
export type Job = { bands: readonly Band[]; targetArmor?: 'none' | 'light' | 'medium' | 'heavy' };
const JOB: Partial<Record<GunId, Job>> = {
  pistol: { bands: [CLOSE] },
  handCannon: { bands: [CLOSE, MID], targetArmor: 'heavy' },
  bulldog: { bands: [MID] },
  slugGun: { bands: [MID] },
  railSlug: { bands: [LONG] },
  lightMg: { bands: [CLOSE, MID] },
};

export const jobOf = (id: GunId): Job => {
  const { from, base } = GUNS[id];
  return JOB[id] ?? (from ? jobOf(from) : { bands: AIM_BANDS.filter((d) => BAND_OWNERS[d].includes(base)) });
};

/** The band a distance falls in: each band reaches halfway to its neighbours. */
export function bandOf(distance: number): Band {
  for (let i = 0; i < AIM_BANDS.length - 1; i++) if (distance < (AIM_BANDS[i]! + AIM_BANDS[i + 1]!) / 2) return AIM_BANDS[i]!;
  return AIM_BANDS[AIM_BANDS.length - 1]!;
}

/** Whether a target `distance` away sits in one of the gun's best bands. */
export const inBestBand = (gun: GunId, distance: number): boolean => jobOf(gun).bands.includes(bandOf(distance));
