export const WEAPON_IDS = ['pistol', 'smg', 'shotgun', 'assault', 'sniper', 'lmg'] as const;
export type WeaponId = (typeof WEAPON_IDS)[number];

export const GUN_IDS = [
  ...WEAPON_IDS,
  'handCannon', 'machinePistol', 'executioner', 'gunslinger', 'akimbo', 'hailstorm',
  'skirmisher', 'heavySmg', 'phantom', 'hornet', 'ripper', 'bulldog',
  'slugGun', 'doubleBarrel', 'railSlug', 'boomSlug', 'sawedOff', 'streetSweeper',
  'battleRifle', 'carbine', 'marksman', 'grenadier', 'specter', 'scout',
  'longshot', 'semiAuto', 'piercer', 'artillery', 'repeater', 'ghost',
  'heavyLmg', 'lightMg', 'minigun', 'juggernaut', 'ranger', 'twinMg',
] as const;
export type GunId = (typeof GUN_IDS)[number];

export type Blast = { radius: number; damage: number };

/** `hands: 2` draws a whole gun in each hand rather than one gun with more barrels. */
export type GunLook = { length: number; width: number; barrels: 1 | 2 | 3; hands?: 2; accent: string; bullet: { r: number; color: string } };

export type GunDef = {
  name: string;
  desc: string;
  base: WeaponId;
  stage: 0 | 1 | 2;
  from: GunId | null;
  damage: number;
  fireMs: number;
  pellets: number;
  spread: number;
  range: number;
  bulletSpeed: number;
  mag: number;
  reloadMs: number;
  moveMul: number;
  auto: boolean;
  /** One press fires `count` rounds `gapMs` apart, one ammo each, then waits `fireMs`. */
  burst?: { count: number; gapMs: number };
  /** Players a bullet passes through before it stops. */
  penetrate?: number;
  /** The bullet explodes wherever it stops. */
  blast?: Blast;
  silenced?: true;
  /** Hits that kill a full-health target through heavy armor; a pellet gun counts a whole point-blank blast as one hit. */
  breakpoint?: 1 | 2;
  rules?: Partial<GunRules>;
  look: GunLook;
};

/**
 * How a class handles beyond its numbers. `movingSpreadMul` scales spread while walking. Under `bloom` each shot of a spray
 * after the first `free` widens spread by `perShot` of itself, up to `maxMul`, and letting go of the trigger takes it back to
 * nothing within `recoverMs`. Under `spinUp` holding the trigger takes the shot interval from `startMul` times `fireMs` down to
 * `fireMs` over `upMs`, and letting go spins it back over `downMs`. `viewMul` stretches how far you see.
 */
/**
 * Moving spread is `spread * movingSpreadMul + movingSpreadAdd`; the added part keeps a tight sniper cone from staying a sure hit on the run.
 * Bloom grows a shot past the first `free` of a spray and cools once no shot has left for `settleMs`, so tapping or bursting stays tight whatever the button does.
 * `steadyMs`: how long after the last step the still spread takes hold, so planting your feet is a commitment rather than a flick.
 * `plant`: when a bot stands still to shoot.
 * `pinpoint`: once steady and unsuppressed the gun has no spread at all, so a planted sniper puts every round exactly where it aims.
 * `suppress`: how much each of its rounds (each pellet, for a shotgun) suppresses an enemy it passes close to (see `SUPPRESSION`).
 * `muzzleBoost`: how much faster than `bulletSpeed` a round leaves the muzzle (see `MUZZLE` in sim/ballistics.ts).
 */
export type GunRules = {
  movingSpreadMul: number;
  movingSpreadAdd: number;
  steadyMs: number;
  plant: 'never' | 'atRange' | 'always';
  bloom: { free: number; perShot: number; maxMul: number; settleMs: number; recoverMs: number } | null;
  spinUp: { startMul: number; upMs: number; downMs: number } | null;
  viewMul: number;
  pinpoint: boolean;
  suppress: number;
  muzzleBoost: number;
};

const STEADY: GunRules = { movingSpreadMul: 1, movingSpreadAdd: 0, steadyMs: 0, plant: 'never', bloom: null, spinUp: null, viewMul: 1, pinpoint: false, suppress: 0, muzzleBoost: 4 };
export const GUN_RULES: Record<WeaponId, GunRules> = {
  pistol: { ...STEADY, movingSpreadMul: 1.15, suppress: 0.04 },
  smg: { ...STEADY, movingSpreadMul: 1.15, suppress: 0.05, bloom: { free: 5, perShot: 0.06, maxMul: 1.6, settleMs: 150, recoverMs: 300 } },
  shotgun: { ...STEADY, suppress: 0.02 },
  assault: { ...STEADY, movingSpreadMul: 1.3, suppress: 0.07, bloom: { free: 3, perShot: 0.12, maxMul: 2, settleMs: 150, recoverMs: 250 } },
  sniper: { ...STEADY, movingSpreadAdd: 0.08, steadyMs: 350, plant: 'always', viewMul: 1.35, pinpoint: true, suppress: 0.3, muzzleBoost: 0.4 },
  lmg: { ...STEADY, movingSpreadMul: 2, steadyMs: 200, plant: 'atRange', suppress: 0.14, bloom: { free: 8, perShot: 0.05, maxMul: 1.8, settleMs: 200, recoverMs: 400 } },
};


const BASE_BULLET = { r: 1.6, color: '#25211c' };
const BASE_LOOK: GunLook = { length: 1, width: 1, barrels: 1, accent: '#7b8494', bullet: BASE_BULLET };

export const GUNS: Record<GunId, GunDef> = {
  pistol: { name: 'Pistol', desc: 'Reliable sidearm, steady on the run', base: 'pistol', stage: 0, from: null, damage: 25, fireMs: 200, pellets: 1, spread: 0.04, range: 700, bulletSpeed: 900, mag: 12, reloadMs: 1000, moveMul: 1.0, auto: false, look: BASE_LOOK },
  handCannon: { name: 'Hand Cannon', desc: 'Two hits drop any armor', base: 'pistol', stage: 1, from: 'pistol', damage: 66, fireMs: 480, pellets: 1, spread: 0.025, range: 780, bulletSpeed: 990, mag: 6, reloadMs: 1300, moveMul: 1.0, auto: false, breakpoint: 2,
    look: { length: 1.2, width: 1.3, barrels: 1, accent: '#c8553d', bullet: { r: 2.6, color: '#7a2e1f' } } },
  machinePistol: { name: 'Machine Pistol', desc: 'Three-round bursts on the run', base: 'pistol', stage: 1, from: 'pistol', damage: 24, fireMs: 380, pellets: 1, spread: 0.05, range: 620, bulletSpeed: 900, mag: 18, reloadMs: 1000, moveMul: 1.05, auto: false, burst: { count: 3, gapMs: 60 },
    look: { length: 1.1, width: 1, barrels: 1, accent: '#3fa7b5', bullet: { r: 1.6, color: '#1f5560' } } },
  executioner: { name: 'Executioner', desc: 'Two hits drop even thick skin; punches through a body', base: 'pistol', stage: 2, from: 'handCannon', damage: 93, fireMs: 520, pellets: 1, spread: 0.02, range: 900, bulletSpeed: 1200, mag: 5, reloadMs: 1500, moveMul: 0.935, auto: false, penetrate: 1, breakpoint: 2,
    look: { length: 1.45, width: 1.35, barrels: 1, accent: '#e5484d', bullet: { r: 3.2, color: '#b3261e' } } },
  gunslinger: { name: 'Gunslinger', desc: 'Quick revolver, two hits up close', base: 'pistol', stage: 2, from: 'handCannon', damage: 66, fireMs: 300, pellets: 1, spread: 0.045, range: 650, bulletSpeed: 960, mag: 6, reloadMs: 1100, moveMul: 1.05, auto: false, breakpoint: 2,
    look: { length: 1.05, width: 1.2, barrels: 1, accent: '#3fa7b5', bullet: { r: 2.4, color: '#1f5560' } } },
  akimbo: { name: 'Akimbo', desc: 'Two pistols, twice the bursts', base: 'pistol', stage: 2, from: 'machinePistol', damage: 18, fireMs: 190, pellets: 1, spread: 0.09, range: 560, bulletSpeed: 900, mag: 36, reloadMs: 1700, moveMul: 1.05, auto: false, burst: { count: 3, gapMs: 50 },
    look: { length: 1.05, width: 1, barrels: 1, hands: 2, accent: '#30c0a0', bullet: { r: 1.7, color: '#11806a' } } },
  hailstorm: { name: 'Hailstorm', desc: 'Full auto with a deep magazine', base: 'pistol', stage: 2, from: 'machinePistol', damage: 16, fireMs: 80, pellets: 1, spread: 0.1, range: 560, bulletSpeed: 900, mag: 40, reloadMs: 1300, moveMul: 1.0, auto: true,
    rules: { bloom: { free: 5, perShot: 0.06, maxMul: 1.6, settleMs: 150, recoverMs: 300 } },
    look: { length: 1.25, width: 1.1, barrels: 1, accent: '#5b8def', bullet: { r: 1.7, color: '#2b55b8' } } },

  smg: { name: 'SMG', desc: 'Fast and light, fires at full stride', base: 'smg', stage: 0, from: null, damage: 14, fireMs: 75, pellets: 1, spread: 0.12, range: 520, bulletSpeed: 840, mag: 30, reloadMs: 1300, moveMul: 1.0, auto: true, look: BASE_LOOK },
  skirmisher: { name: 'Skirmisher', desc: 'Fastest feet in the fight', base: 'smg', stage: 1, from: 'smg', damage: 13, fireMs: 66, pellets: 1, spread: 0.12, range: 500, bulletSpeed: 870, mag: 28, reloadMs: 1100, moveMul: 1.08, auto: true,
    look: { length: 0.9, width: 0.95, barrels: 1, accent: '#3fa7b5', bullet: { r: 1.5, color: '#1f5560' } } },
  heavySmg: { name: 'Heavy SMG', desc: 'Bigger rounds, more reach', base: 'smg', stage: 1, from: 'smg', damage: 18, fireMs: 85, pellets: 1, spread: 0.09, range: 620, bulletSpeed: 900, mag: 30, reloadMs: 1500, moveMul: 0.935, auto: true,
    look: { length: 1.15, width: 1.2, barrels: 1, accent: '#c8553d', bullet: { r: 2, color: '#7a2e1f' } } },
  phantom: { name: 'Phantom', desc: 'Suppressed, fastest on foot', base: 'smg', stage: 2, from: 'skirmisher', damage: 15, fireMs: 66, pellets: 1, spread: 0.11, range: 480, bulletSpeed: 870, mag: 30, reloadMs: 1100, moveMul: 1.1, auto: true, silenced: true,
    look: { length: 1.15, width: 0.9, barrels: 1, accent: '#8e4ec6', bullet: { r: 1.4, color: '#5a2d85' } } },
  hornet: { name: 'Hornet', desc: 'Blistering rate, tiny rounds', base: 'smg', stage: 2, from: 'skirmisher', damage: 10, fireMs: 33, pellets: 1, spread: 0.13, range: 460, bulletSpeed: 870, mag: 40, reloadMs: 900, moveMul: 1.05, auto: true,
    look: { length: 1, width: 1.05, barrels: 1, accent: '#f5c400', bullet: { r: 1.5, color: '#a88600' } } },
  ripper: { name: 'Ripper', desc: 'Rounds punch through one body', base: 'smg', stage: 2, from: 'heavySmg', damage: 21, fireMs: 85, pellets: 1, spread: 0.085, range: 680, bulletSpeed: 960, mag: 30, reloadMs: 1600, moveMul: 0.896, auto: true, penetrate: 1,
    look: { length: 1.3, width: 1.25, barrels: 1, accent: '#e5484d', bullet: { r: 2.2, color: '#b3261e' } } },
  bulldog: { name: 'Bulldog', desc: 'Sixty-round drum, slower feet', base: 'smg', stage: 2, from: 'heavySmg', damage: 18, fireMs: 75, pellets: 1, spread: 0.1, range: 600, bulletSpeed: 900, mag: 60, reloadMs: 2400, moveMul: 0.844, auto: true,
    look: { length: 1.15, width: 1.4, barrels: 1, accent: '#5b8def', bullet: { r: 2, color: '#2b55b8' } } },

  shotgun: { name: 'Shotgun', desc: 'A point-blank blast drops any armor', base: 'shotgun', stage: 0, from: null, damage: 17, fireMs: 800, pellets: 8, spread: 0.2, range: 420, bulletSpeed: 780, mag: 5, reloadMs: 1800, moveMul: 0.935, auto: false, breakpoint: 1, look: BASE_LOOK },
  slugGun: { name: 'Slug Gun', desc: 'One heavy slug, two hits at mid range', base: 'shotgun', stage: 1, from: 'shotgun', damage: 70, fireMs: 560, pellets: 1, spread: 0.015, range: 800, bulletSpeed: 1080, mag: 6, reloadMs: 1800, moveMul: 0.935, auto: false, breakpoint: 2,
    look: { length: 1.2, width: 0.9, barrels: 1, accent: '#c8553d', bullet: { r: 3, color: '#7a2e1f' } } },
  doubleBarrel: { name: 'Double Barrel', desc: 'Two blasts back to back', base: 'shotgun', stage: 1, from: 'shotgun', damage: 17, fireMs: 260, pellets: 9, spread: 0.22, range: 400, bulletSpeed: 780, mag: 2, reloadMs: 1500, moveMul: 0.935, auto: false, breakpoint: 1,
    look: { length: 0.95, width: 1.1, barrels: 2, accent: '#3fa7b5', bullet: { r: 1.7, color: '#1f5560' } } },
  railSlug: { name: 'Rail Slug', desc: 'Hypersonic slug pierces two bodies', base: 'shotgun', stage: 2, from: 'slugGun', damage: 75, fireMs: 540, pellets: 1, spread: 0.01, range: 900, bulletSpeed: 2400, mag: 5, reloadMs: 1900, moveMul: 0.896, auto: false, penetrate: 2, breakpoint: 2,
    look: { length: 1.5, width: 0.85, barrels: 1, accent: '#e5484d', bullet: { r: 2.6, color: '#ff3b30' } } },
  boomSlug: { name: 'Boom Slug', desc: 'Slugs explode on impact', base: 'shotgun', stage: 2, from: 'slugGun', damage: 55, fireMs: 540, pellets: 1, spread: 0.02, range: 700, bulletSpeed: 900, mag: 5, reloadMs: 1900, moveMul: 0.896, auto: false, blast: { radius: 90, damage: 45 }, breakpoint: 2,
    look: { length: 1.2, width: 1.25, barrels: 1, accent: '#f76b15', bullet: { r: 3.8, color: '#e0661a' } } },
  sawedOff: { name: 'Sawed-off', desc: 'Both barrels at once, arm\'s reach', base: 'shotgun', stage: 2, from: 'doubleBarrel', damage: 15, fireMs: 300, pellets: 18, spread: 0.32, range: 280, bulletSpeed: 780, mag: 1, reloadMs: 1300, moveMul: 1.05, auto: false, breakpoint: 1,
    look: { length: 0.75, width: 1.3, barrels: 2, accent: '#c8553d', bullet: { r: 1.8, color: '#7a2e1f' } } },
  streetSweeper: { name: 'Street Sweeper', desc: 'Automatic drum shotgun', base: 'shotgun', stage: 2, from: 'doubleBarrel', damage: 16, fireMs: 300, pellets: 7, spread: 0.24, range: 420, bulletSpeed: 780, mag: 12, reloadMs: 2600, moveMul: 0.805, auto: true,
    look: { length: 1.15, width: 1.35, barrels: 1, accent: '#5b8def', bullet: { r: 1.7, color: '#2b55b8' } } },

  assault: { name: 'Assault', desc: 'All-rounder; tap for accuracy', base: 'assault', stage: 0, from: null, damage: 17, fireMs: 110, pellets: 1, spread: 0.05, range: 800, bulletSpeed: 1020, mag: 30, reloadMs: 1500, moveMul: 0.935, auto: true, look: BASE_LOOK },
  battleRifle: { name: 'Battle Rifle', desc: 'One clean burst drops the unarmored', base: 'assault', stage: 1, from: 'assault', damage: 34, fireMs: 640, pellets: 1, spread: 0.035, range: 850, bulletSpeed: 1080, mag: 24, reloadMs: 1700, moveMul: 0.896, auto: true, burst: { count: 3, gapMs: 70 },
    look: { length: 1.15, width: 1.1, barrels: 1, accent: '#c8553d', bullet: { r: 2, color: '#7a2e1f' } } },
  carbine: { name: 'Carbine', desc: 'Lighter and quicker, steady on the move', base: 'assault', stage: 1, from: 'assault', damage: 16, fireMs: 90, pellets: 1, spread: 0.055, range: 720, bulletSpeed: 1020, mag: 30, reloadMs: 1200, moveMul: 1.0, auto: true,
    rules: { movingSpreadMul: 1 },
    look: { length: 0.9, width: 0.95, barrels: 1, accent: '#3fa7b5', bullet: { r: 1.6, color: '#1f5560' } } },
  marksman: { name: 'Marksman', desc: 'Precise single shots, long reach', base: 'assault', stage: 2, from: 'battleRifle', damage: 55, fireMs: 340, pellets: 1, spread: 0.015, range: 900, bulletSpeed: 1380, mag: 12, reloadMs: 1700, moveMul: 0.87, auto: false,
    look: { length: 1.4, width: 1, barrels: 1, accent: '#e5484d', bullet: { r: 2.4, color: '#b3261e' } } },
  grenadier: { name: 'Grenadier', desc: 'Bursts of exploding rounds', base: 'assault', stage: 2, from: 'battleRifle', damage: 24, fireMs: 450, pellets: 1, spread: 0.05, range: 750, bulletSpeed: 900, mag: 18, reloadMs: 1800, moveMul: 0.857, auto: true, burst: { count: 3, gapMs: 70 }, blast: { radius: 55, damage: 14 },
    look: { length: 1.2, width: 1.35, barrels: 1, accent: '#f76b15', bullet: { r: 2.8, color: '#e0661a' } } },
  specter: { name: 'Specter', desc: 'Suppressed and light', base: 'assault', stage: 2, from: 'carbine', damage: 19, fireMs: 88, pellets: 1, spread: 0.055, range: 700, bulletSpeed: 1020, mag: 30, reloadMs: 1200, moveMul: 1.02, auto: true, silenced: true,
    look: { length: 1.2, width: 0.9, barrels: 1, accent: '#8e4ec6', bullet: { r: 1.5, color: '#5a2d85' } } },
  scout: { name: 'Scout', desc: 'Scoped carbine, sees and hits farther', base: 'assault', stage: 2, from: 'carbine', damage: 22, fireMs: 120, pellets: 1, spread: 0.035, range: 900, bulletSpeed: 1140, mag: 25, reloadMs: 1300, moveMul: 1.0, auto: true,
    rules: { viewMul: 1.25 },
    look: { length: 1.2, width: 0.95, barrels: 1, accent: '#3fa7b5', bullet: { r: 1.7, color: '#1f5560' } } },

  sniper: { name: 'Bolt-action', desc: 'One shot drops any armor; plant your feet', base: 'sniper', stage: 0, from: null, damage: 135, fireMs: 1350, pellets: 1, spread: 0.01, range: 1200, bulletSpeed: 1760, mag: 5, reloadMs: 2000, moveMul: 0.87, auto: false, breakpoint: 1, look: BASE_LOOK },
  longshot: { name: 'Longshot', desc: 'Heavier rounds, farther, faster', base: 'sniper', stage: 1, from: 'sniper', damage: 160, fireMs: 1700, pellets: 1, spread: 0.008, range: 1300, bulletSpeed: 2560, mag: 5, reloadMs: 2100, moveMul: 0.844, auto: false, breakpoint: 1,
    rules: { viewMul: 1.5 },
    look: { length: 1.2, width: 1.05, barrels: 1, accent: '#c8553d', bullet: { r: 2.2, color: '#7a2e1f' } } },
  semiAuto: { name: 'Semi-auto Rifle', desc: 'Two hits drop any armor, quick follow-ups', base: 'sniper', stage: 1, from: 'sniper', damage: 68, fireMs: 360, pellets: 1, spread: 0.015, range: 1150, bulletSpeed: 2000, mag: 10, reloadMs: 1900, moveMul: 0.896, auto: false, breakpoint: 2,
    look: { length: 1, width: 1.1, barrels: 1, accent: '#3fa7b5', bullet: { r: 1.8, color: '#1f5560' } } },
  piercer: { name: 'Piercer', desc: 'Rounds pass through three bodies', base: 'sniper', stage: 2, from: 'longshot', damage: 160, fireMs: 1700, pellets: 1, spread: 0.006, range: 1400, bulletSpeed: 2880, mag: 5, reloadMs: 2200, moveMul: 0.818, auto: false, penetrate: 3, breakpoint: 1,
    rules: { viewMul: 1.6 },
    look: { length: 1.45, width: 1, barrels: 1, accent: '#e5484d', bullet: { r: 2.4, color: '#ff3b30' } } },
  artillery: { name: 'Artillery', desc: 'Slow shells with a wide blast', base: 'sniper', stage: 2, from: 'longshot', damage: 100, fireMs: 1500, pellets: 1, spread: 0.01, range: 1300, bulletSpeed: 1440, mag: 4, reloadMs: 2300, moveMul: 0.818, auto: false, blast: { radius: 130, damage: 80 }, breakpoint: 1,
    look: { length: 1.3, width: 1.45, barrels: 1, accent: '#f76b15', bullet: { r: 4, color: '#e0661a' } } },
  repeater: { name: 'Repeater', desc: 'Fastest follow-ups, lighter rounds', base: 'sniper', stage: 2, from: 'semiAuto', damage: 55, fireMs: 230, pellets: 1, spread: 0.018, range: 1100, bulletSpeed: 2080, mag: 14, reloadMs: 1800, moveMul: 0.935, auto: false,
    look: { length: 1.05, width: 1.2, barrels: 1, accent: '#5b8def', bullet: { r: 1.9, color: '#2b55b8' } } },
  ghost: { name: 'Ghost', desc: 'Suppressed marksman rifle', base: 'sniper', stage: 2, from: 'semiAuto', damage: 68, fireMs: 360, pellets: 1, spread: 0.012, range: 1150, bulletSpeed: 2080, mag: 10, reloadMs: 1900, moveMul: 0.935, auto: false, silenced: true, breakpoint: 2,
    look: { length: 1.25, width: 0.95, barrels: 1, accent: '#8e4ec6', bullet: { r: 1.6, color: '#5a2d85' } } },

  lmg: { name: 'LMG', desc: 'A long belt; steady when planted', base: 'lmg', stage: 0, from: null, damage: 16, fireMs: 90, pellets: 1, spread: 0.055, range: 850, bulletSpeed: 960, mag: 100, reloadMs: 3500, moveMul: 0.766, auto: true, look: BASE_LOOK },
  heavyLmg: { name: 'Heavy LMG', desc: 'Bigger rounds, holds a lane', base: 'lmg', stage: 1, from: 'lmg', damage: 23, fireMs: 100, pellets: 1, spread: 0.055, range: 900, bulletSpeed: 1020, mag: 100, reloadMs: 3800, moveMul: 0.714, auto: true,
    look: { length: 1.15, width: 1.2, barrels: 1, accent: '#c8553d', bullet: { r: 2.1, color: '#7a2e1f' } } },
  lightMg: { name: 'Light MG', desc: 'Lighter build, fires on the walk', base: 'lmg', stage: 1, from: 'lmg', damage: 14, fireMs: 75, pellets: 1, spread: 0.07, range: 800, bulletSpeed: 960, mag: 80, reloadMs: 3000, moveMul: 0.87, auto: true,
    rules: { movingSpreadMul: 1.3 },
    look: { length: 0.95, width: 0.95, barrels: 1, accent: '#3fa7b5', bullet: { r: 1.6, color: '#1f5560' } } },
  minigun: { name: 'Minigun', desc: 'Spins up into a torrent of lead', base: 'lmg', stage: 2, from: 'heavyLmg', damage: 15, fireMs: 33, pellets: 1, spread: 0.065, range: 900, bulletSpeed: 960, mag: 200, reloadMs: 4500, moveMul: 0.675, auto: true,
    rules: { spinUp: { startMul: 2.5, upMs: 700, downMs: 800 } },
    look: { length: 1.2, width: 1.25, barrels: 3, accent: '#f5c400', bullet: { r: 1.6, color: '#a88600' } } },
  juggernaut: { name: 'Juggernaut', desc: 'Biggest rounds, huge belt, slowest feet', base: 'lmg', stage: 2, from: 'heavyLmg', damage: 30, fireMs: 105, pellets: 1, spread: 0.05, range: 900, bulletSpeed: 1080, mag: 150, reloadMs: 4500, moveMul: 0.636, auto: true,
    look: { length: 1.3, width: 1.45, barrels: 1, accent: '#e5484d', bullet: { r: 2.3, color: '#b3261e' } } },
  ranger: { name: 'Ranger', desc: 'Lightest MG, accurate on the move', base: 'lmg', stage: 2, from: 'lightMg', damage: 16, fireMs: 75, pellets: 1, spread: 0.06, range: 800, bulletSpeed: 990, mag: 75, reloadMs: 2400, moveMul: 0.935, auto: true,
    rules: { movingSpreadMul: 1.15 },
    look: { length: 1, width: 0.95, barrels: 1, accent: '#3fa7b5', bullet: { r: 1.6, color: '#1f5560' } } },
  twinMg: { name: 'Twin MG', desc: 'Paired barrels, double rounds', base: 'lmg', stage: 2, from: 'lightMg', damage: 12, fireMs: 85, pellets: 2, spread: 0.085, range: 760, bulletSpeed: 960, mag: 100, reloadMs: 3200, moveMul: 0.87, auto: true,
    look: { length: 1.05, width: 1.3, barrels: 2, accent: '#30c0a0', bullet: { r: 1.7, color: '#11806a' } } },
};

export function byGun<T>(f: (id: GunId) => T): Record<GunId, T> {
  const out: Partial<Record<GunId, T>> = {};
  for (const id of GUN_IDS) out[id] = f(id);
  return out as Record<GunId, T>;
}

/** An evolution keeps its parent's rules and overrides only what it names, so a Specter is as steady on the move as the Carbine it came from. */
const resolveRules = (def: GunDef): GunRules => ({ ...(def.from ? resolveRules(GUNS[def.from]) : GUN_RULES[def.base]), ...def.rules });
const RULES = new Map(GUN_IDS.map((id) => [GUNS[id], resolveRules(GUNS[id])]));
export const rulesOf = (def: GunDef): GunRules => RULES.get(def)!;

export const EVOLUTIONS: Record<GunId, readonly GunId[]> = byGun((id) => GUN_IDS.filter((child) => GUNS[child].from === id));

export const ARMOR_IDS = ['none', 'light', 'medium', 'heavy'] as const;
export type ArmorId = (typeof ARMOR_IDS)[number];
export const ARMORS: Record<ArmorId, { name: string; blockFrac: number; speedMul: number }> = {
  none: { name: 'No armor', blockFrac: 0, speedMul: 1.0 },
  light: { name: 'Light', blockFrac: 0.08, speedMul: 0.9 },
  medium: { name: 'Medium', blockFrac: 0.16, speedMul: 0.8 },
  heavy: { name: 'Heavy', blockFrac: 0.24, speedMul: 0.7 },
};

/** The least share of base speed a gun and armor together can leave you, so the heaviest loadout is slow but still moves (about 148 px/s). */
export const LOAD_SPEED_FLOOR = 0.58;

/**
 * Sprint: held with movement, it multiplies move speed by `speedMul` (after the loadout floor, so Lightweight stacks) and lowers the gun.
 * You cannot fire while sprinting (a click ends the sprint), but you can reload. Leaving sprint pulls the gun back up over `raiseMs`, with no shot
 * until it is up (a click made that early is not kept; a held trigger fires once the gun is up), and starts a settle: spread is `settleMul` times
 * normal and eases out (quadratically) to normal over `settleMs`.
 */
export const SPRINT = { speedMul: 1.35, settleMul: 2.2, settleMs: 2000, raiseMs: 1000 } as const;
/** How many of the tier-2 pool a level-up offers, drawn per life. */
export const TIER2_OFFER = 4;

export const COLOR_IDS = ['red', 'orange', 'yellow', 'green', 'blue', 'purple'] as const;
export type ColorId = (typeof COLOR_IDS)[number];
export const byColor = <T>(f: (c: ColorId) => T) => Object.fromEntries(COLOR_IDS.map((c) => [c, f(c)])) as Record<ColorId, T>;
export const COLORS: Record<ColorId, string> = {
  red: '#e5484d', orange: '#f76b15', yellow: '#f5c400', green: '#30a46c', blue: '#3e63dd', purple: '#8e4ec6',
};

export const PERK_TIERS = {
  1: ['optics', 'thermal', 'ghillie', 'piercing', 'extended', 'grip', 'silencer', 'lightweight', 'longRange', 'quickReload', 'choke'],
  2: ['shield', 'thickSkin', 'firstAid', 'marathon', 'steadyHands', 'secondWind', 'adrenaline', 'bloodlust', 'recon', 'ninja', 'overclock', 'demolitions', 'fastHands', 'tracker', 'brace'],
  3: ['grenade', 'fragGrenade', 'gasGrenade', 'landMine', 'knife', 'engineer', 'dash', 'flashbang', 'smokeGrenade'],
} as const;
export type Tier = keyof typeof PERK_TIERS;
export type PerkId = (typeof PERK_TIERS)[Tier][number];
export type AbilityId = (typeof PERK_TIERS)[3][number];

export const PERK_INFO: Record<PerkId, { name: string; desc: string }> = {
  optics: { name: 'Optics', desc: 'See further' },
  thermal: { name: 'Thermal', desc: 'Reveal hidden enemies' },
  ghillie: { name: 'Ghillie suit', desc: 'Nearly invisible while still' },
  piercing: { name: 'AP rounds', desc: 'Bullets ignore armor' },
  extended: { name: 'Extended mag', desc: '+50% magazine' },
  grip: { name: 'Grip', desc: '-40% spread' },
  silencer: { name: 'Silencer', desc: 'Firing does not reveal you on the minimap' },
  lightweight: { name: 'Lightweight', desc: '+25% move speed' },
  longRange: { name: 'Long range', desc: '+40% bullet range' },
  quickReload: { name: 'Quick reload', desc: 'Reload 35% faster' },
  choke: { name: 'Choke', desc: '-25% pellet spread' },
  shield: { name: 'Shield', desc: 'Blocks 33% of bullet damage from the front' },
  thickSkin: { name: 'Thick skin', desc: '+40 health: outlast a one- or two-hit gun' },
  firstAid: { name: 'First aid', desc: 'Regenerate health 3x faster, starting 1.6s after a hit' },
  marathon: { name: 'Marathon', desc: 'Sprint 15% faster, and your gun settles 50% sooner after a sprint' },
  steadyHands: { name: 'Steady hands', desc: 'Spray bloom builds 40% slower and recovers 60% faster; the post-sprint settle is 25% shorter' },
  secondWind: { name: 'Second wind', desc: 'Once a life, dropping under 25% health gives 2s of +30% speed and half damage taken' },
  adrenaline: { name: 'Adrenaline', desc: 'A kill grants +20% move speed for 3s' },
  bloodlust: { name: 'Bloodlust', desc: 'Heal 15% of the damage you deal to players' },
  recon: { name: 'Recon', desc: '+15% view radius, and enemies in view show a mark while they reload' },
  ninja: { name: 'Ninja', desc: 'Firing shows you on the minimap for 1s, not 2s, and your sprint makes no noise' },
  overclock: { name: 'Overclock', desc: 'Ability cooldown 30% shorter' },
  demolitions: { name: 'Demolitions', desc: 'Your blasts hit 30% harder and 30% wider; you take 30% less blast damage' },
  fastHands: { name: 'Fast hands', desc: 'Reload 25% faster, and an evolution refills your magazine' },
  tracker: { name: 'Tracker', desc: 'Enemies you damage show on your minimap for 4s' },
  brace: { name: 'Brace', desc: 'Take 60% less knockback and deal 15% more' },
  grenade: { name: 'Grenade', desc: 'Thrown explosive' },
  fragGrenade: { name: 'Frag grenade', desc: 'Explodes into shrapnel' },
  gasGrenade: { name: 'Gas grenade', desc: 'Lingering damage cloud' },
  landMine: { name: 'Land mine', desc: 'Hidden explosive at your feet, two at a time' },
  knife: { name: 'Knife', desc: 'Lunge melee strike' },
  engineer: { name: 'Engineer', desc: 'Build a wall' },
  dash: { name: 'Dash', desc: 'Burst of speed' },
  flashbang: { name: 'Flashbang', desc: 'Blinds everyone who sees it burst, you and your team too' },
  smokeGrenade: { name: 'Smoke', desc: 'A dense cloud nobody can see through; bullets still fly' },
};

export const ABILITY_COOLDOWN_MS: Record<AbilityId, number> = {
  grenade: 6000, fragGrenade: 7000, gasGrenade: 8000, landMine: 9000, knife: 4000, engineer: 10000, dash: 3500, flashbang: 9000, smokeGrenade: 12000,
};

export const PLAYER_KINDS = ['human', 'bot'] as const;
export type PlayerKind = (typeof PLAYER_KINDS)[number];
/** Humans carry multiplied health so a person outlasts the bots that fill the room. Regen scales with it, so healing takes the same time. */
export const HP_MULTIPLIER: Record<PlayerKind, number> = { human: 4, bot: 1 };

export type Pick = { k: 'perk'; tier: Tier; /** The tier-2 perks offered this life (`TIER2_OFFER` of the pool, drawn at spawn); absent means the whole tier. */ offer?: readonly PerkId[] } | { k: 'evolve' };
export type PendingPick = { level: number } & Pick;
export type PickOption = PerkId | GunId;

export const LEVELS = [
  // A new gun is the best reward there is, so the first kill evolves your gun; the attachment follows at the second or third.
  // Medals pay a large share of score, more the hotter a life runs, so the ladder steepens toward the top: set from 800 bot
  // lives (`node scripts/level-scale.ts`, and test/balance.test.ts holds it).
  { score: 0, pick: null }, { score: 100, pick: { k: 'evolve' } }, { score: 250, pick: { k: 'perk', tier: 1 } },
  { score: 420, pick: { k: 'perk', tier: 2 } }, { score: 620, pick: { k: 'perk', tier: 3 } }, { score: 1000, pick: { k: 'evolve' } },
] as const satisfies readonly { score: number; pick: Pick | null }[];

type Attachment = (typeof PERK_TIERS)[1][number];

export const ATTACHMENTS: Record<WeaponId, readonly Attachment[]> = {
  pistol: ['extended', 'quickReload', 'silencer', 'lightweight', 'optics'],
  smg: ['grip', 'extended', 'silencer', 'longRange', 'lightweight'],
  shotgun: ['choke', 'quickReload', 'extended', 'lightweight', 'piercing'],
  assault: ['grip', 'extended', 'silencer', 'optics', 'piercing'],
  sniper: ['extended', 'thermal', 'ghillie', 'silencer', 'quickReload'],
  lmg: ['quickReload', 'grip', 'lightweight', 'piercing', 'extended'],
};

const DOES_NOTHING: Partial<Record<Attachment, (def: GunDef) => boolean>> = {
  silencer: (def) => def.silenced ?? false,
  choke: (def) => def.pellets < 2,
  extended: (def) => def.mag < 2,
};

export const pickOptions = (pick: Pick, gun: GunId): readonly PickOption[] =>
  pick.k === 'evolve' ? EVOLUTIONS[gun]
    : pick.tier === 1 ? ATTACHMENTS[GUNS[gun].base].filter((perk) => !DOES_NOTHING[perk]?.(GUNS[gun]))
      : pick.tier === 2 && pick.offer ? pick.offer : PERK_TIERS[pick.tier];

export const isPerkId = (option: PickOption): option is PerkId => Object.hasOwn(PERK_INFO, option);

export const PICK_OPTIONS: readonly PickOption[] = [...PERK_TIERS[1], ...PERK_TIERS[2], ...PERK_TIERS[3], ...GUN_IDS];

/** How long a press waits past the gun's cooldown or reload to fire, so a tap a moment early is not lost. */
export const PRESS_GRACE_MS = 100;
/** How far ahead of the gun being ready a click is kept; an earlier click is dropped rather than firing later on its own. */
export const PRESS_BUFFER_MS = 200;

/**
 * An enemy gun round passing within `px` of a player's edge suppresses them by its gun's `suppress`, once per round, hit or miss.
 * It holds `holdMs` after the last such round and then fades at `decayPerSec`, so only fire faster than the hold keeps
 * stacking: a machine gun pins a player down while a pistol or a sniper only makes them flinch. Full suppression widens
 * spread by `spread` of itself, breaks a planted sniper's pinpoint once past `breaksPinpoint`, and shades the screen's edges.
 */
export const SUPPRESSION = { px: 60, holdMs: 150, decayPerSec: 0.8, spread: 0.25, breaksPinpoint: 0.05 } as const;

/**
 * Knockback: a round or blast that lands shoves its victim along its line. A hit adds `perDamage[gun class]` px/s per point of
 * damage (before the human health multiplier, after armor), the sum is capped at `cap` (`blastCap` for blasts, which push `blastPerDamage`
 * per point), and the shove bleeds off with time constant `tauMs`, so a spray of light rounds barely moves anyone while a point-blank
 * shotgun or a sniper round visibly rocks them. `armor` is the share of a shove each armor lets through; `zombie` the share a horde kind takes
 * (light kinds fly, brutes and the colossus do not budge).
 */
export const KNOCK = {
  perDamage: { pistol: 0.6, smg: 0.35, shotgun: 0.9, assault: 0.6, sniper: 0.9, lmg: 0.4 } as Record<WeaponId, number>,
  blastPerDamage: 1.6, cap: 120, blastCap: 180, tauMs: 80, floor: 6,
  armor: { none: 1, light: 0.93, medium: 0.85, heavy: 0.7 } as Record<ArmorId, number>,
  zombie: { walker: 1.15, runner: 1.4, plated: 0.7, bloater: 0.8, brute: 0, colossus: 0 } as Record<ZombieKind, number>,
} as const;

/**
 * A kill refuels the killer at once: `heal` of their max health and `ammo` of their mag back (not mid-reload), so winning
 * a fight carries you into the next one instead of sending you off to wait out the regen delay.
 */
export const KILL_REWARD = { heal: 0.35, ammo: 0.5 } as const;

/**
 * Kills in one life make a streak. Others see it beside your name from `showAt`; whoever ends a streak of `shutdownAt` or
 * more earns `shutdownScore`. Whoever killed you last is your nemesis, and killing them pays `revengeScore`.
 */
export const STREAK = { showAt: 3, shutdownAt: 5, shutdownScore: 250, revengeScore: 125 } as const;

/**
 * Medals are earned in the moment, Call of Duty style, and each pays its `score` on top of the kill. `tier` sets the
 * medal's metal on screen. The bounty, shutdown and revenge medals carry the bonuses those rules always paid.
 */
export const MEDAL_IDS = [
  'firstBlood', 'doubleKill', 'tripleKill', 'quadKill', 'massacre', 'longShot', 'pointBlank', 'clutch', 'closeCall',
  'revenge', 'shutdown', 'bounty', 'onFire', 'rampage', 'unstoppable', 'untouchable', 'legendary', 'ghost',
  // Each weapon class has feats of its own (`WEAPON_MEDALS`).
  'doubleTap', 'deadeye', 'runAndGun', 'twoBirds', 'longBarrel', 'disciplined', 'oneShot', 'noScope', 'eagleEye', 'reaper',
  'pinnedDown', 'beltFed',
  // The arena's surprises: a barrel kill, a barrel chain, and the supply drop.
  'kaboom', 'chainReaction', 'specialDelivery',
  // The other props (`PROPS`): a propane kill, a kill while shocked by a generator you shorted, a fire kill, and a splash of paint on an enemy.
  'liftoff', 'shockTherapy', 'arsonist', 'picasso',
] as const;
export type MedalId = (typeof MEDAL_IDS)[number];
export type MedalTier = 'bronze' | 'silver' | 'gold' | 'platinum';
export const MEDALS: Record<MedalId, { name: string; desc: string; score: number; tier: MedalTier }> = {
  firstBlood: { name: 'First Blood', desc: 'The first kill of the round', score: 125, tier: 'silver' },
  doubleKill: { name: 'Double Kill', desc: 'Two kills within 4 seconds', score: 60, tier: 'bronze' },
  tripleKill: { name: 'Triple Kill', desc: 'Three kills, each within 4 seconds of the last', score: 125, tier: 'silver' },
  quadKill: { name: 'Quad Kill', desc: 'Four kills, each within 4 seconds of the last', score: 250, tier: 'gold' },
  massacre: { name: 'Massacre', desc: 'Five or more kills, each within 4 seconds of the last', score: 400, tier: 'platinum' },
  longShot: { name: 'Long Shot', desc: 'A kill from 650 px or more away', score: 75, tier: 'bronze' },
  pointBlank: { name: 'Point Blank', desc: 'A kill from 90 px or closer', score: 50, tier: 'bronze' },
  clutch: { name: 'Clutch', desc: 'Kill whoever is hurting you, on 20% health or less', score: 125, tier: 'silver' },
  closeCall: { name: 'Close Call', desc: 'Drop under 10% health and live another 6 seconds', score: 75, tier: 'bronze' },
  revenge: { name: 'Revenge', desc: 'Kill the player who last killed you', score: STREAK.revengeScore, tier: 'silver' },
  shutdown: { name: 'Shutdown', desc: 'End a streak of 5 or more', score: STREAK.shutdownScore, tier: 'gold' },
  bounty: { name: 'Bounty', desc: 'Kill a hunted player', score: 300, tier: 'gold' },
  onFire: { name: 'On Fire', desc: '3 kills without dying', score: 60, tier: 'bronze' },
  rampage: { name: 'Rampage', desc: '5 kills without dying', score: 125, tier: 'silver' },
  unstoppable: { name: 'Unstoppable', desc: '8 kills without dying', score: 250, tier: 'gold' },
  untouchable: { name: 'Untouchable', desc: '12 kills without dying', score: 400, tier: 'platinum' },
  legendary: { name: 'Legendary', desc: '20 kills without dying', score: 600, tier: 'platinum' },
  ghost: { name: 'Ghost', desc: 'Cover 3000 px in one life without firing a shot', score: 75, tier: 'bronze' },
  doubleTap: { name: 'Double Tap', desc: 'Pistol: two kills from one magazine', score: 75, tier: 'bronze' },
  deadeye: { name: 'Deadeye', desc: 'Pistol: a kill from 500 px or more', score: 100, tier: 'silver' },
  runAndGun: { name: 'Run and Gun', desc: 'SMG: a kill on the move', score: 50, tier: 'bronze' },
  twoBirds: { name: 'Two Birds', desc: 'Shotgun: one blast hits two enemies', score: 75, tier: 'bronze' },
  longBarrel: { name: 'Long Barrel', desc: 'Shotgun: a kill from 340 px or more', score: 125, tier: 'silver' },
  disciplined: { name: 'Disciplined', desc: 'Assault: a kill before your spray blooms', score: 50, tier: 'bronze' },
  oneShot: { name: 'One Shot', desc: 'Sniper: a kill with one hit from full health', score: 100, tier: 'silver' },
  noScope: { name: 'No Scope', desc: 'Sniper: a kill from 160 px or closer', score: 125, tier: 'silver' },
  eagleEye: { name: 'Eagle Eye', desc: 'Sniper: a kill from 900 px or more', score: 150, tier: 'gold' },
  reaper: { name: 'Reaper', desc: 'Sniper: three one-hit kills in one life', score: 300, tier: 'platinum' },
  pinnedDown: { name: 'Pinned Down', desc: 'Machine gun: kill an enemy you have pinned with suppression', score: 75, tier: 'bronze' },
  beltFed: { name: 'Belt Fed', desc: 'Machine gun: three kills from one belt', score: 150, tier: 'gold' },
  kaboom: { name: 'Kaboom', desc: 'Kill with an explosive barrel you set off', score: 60, tier: 'bronze' },
  chainReaction: { name: 'Chain Reaction', desc: 'One barrel chain kills two or more', score: 200, tier: 'gold' },
  specialDelivery: { name: 'Special Delivery', desc: 'Crack open a supply drop', score: 100, tier: 'silver' },
  liftoff: { name: 'Liftoff', desc: 'Kill with a propane tank you sent flying', score: 100, tier: 'silver' },
  shockTherapy: { name: 'Shock Therapy', desc: 'Kill an enemy while a generator you shorted still has them shocked', score: 100, tier: 'silver' },
  arsonist: { name: 'Arsonist', desc: 'Kill with a burning oil slick you spilled', score: 75, tier: 'bronze' },
  picasso: { name: 'Picasso', desc: 'Splatter a paint can over an enemy', score: 50, tier: 'bronze' },
};
/** The streak at which each streak medal is earned. */
export const STREAK_MEDALS: readonly (readonly [number, MedalId])[] = [[3, 'onFire'], [5, 'rampage'], [8, 'unstoppable'], [12, 'untouchable'], [20, 'legendary']];
/** The chain of kills each multi-kill medal names, from the second kill. */
export const MULTI_MEDALS: readonly MedalId[] = ['doubleKill', 'tripleKill', 'quadKill', 'massacre'];
export const MEDAL_RULES = { multiMs: 4000, longShotPx: 650, pointBlankPx: 90, clutchHp: 0.2, clutchMs: 5000, closeCallHp: 0.1, closeCallMs: 6000, closeCallReset: 0.5, ghostPx: 3000 } as const;
/**
 * The weapon feats, judged on the gun that fired the killing round (or blast of pellets): kills from one magazine, the
 * range, a kill in one hit from full health, a spray that had not bloomed yet, a victim pinned by suppression.
 */
export const WEAPON_MEDALS = {
  doubleTapKills: 2, deadeyePx: 500, twoBirdsHits: 2, longBarrelPx: 340, oneShotsForReaper: 3, noScopePx: 160, eagleEyePx: 900,
  pinnedSuppression: 0.6, beltFedKills: 3,
} as const;

/**
 * Lifetime medals: career tracks kept on a player's profile for good, each with a bronze, silver, gold and platinum
 * medal at the counts in `at`. Every rung pays `CAREER_PAY` of its tier on the spot and gets its own unlock, and the
 * rarest one a player holds is worn by their name in every match. A track counts a career stat or one of the medals.
 */
export const CAREER_IDS = [
  'kills', 'games', 'streak', 'longShot', 'pointBlank', 'multiKill', 'tripleKill', 'massacre', 'clutch', 'closeCall',
  'revenge', 'shutdown', 'bounty', 'firstBlood', 'distance', 'ghost',
  'pistolKills', 'smgKills', 'shotgunKills', 'assaultKills', 'sniperKills', 'lmgKills', 'oneShot', 'twoBirds',
] as const;
export type CareerId = (typeof CAREER_IDS)[number];
/** `km` is career distance walked, at `KM_PX` px to the km: a body is about a metre across, so a km is some 3 minutes on foot. */
export type CareerStat = 'kills' | 'games' | 'bestStreak' | 'km' | `kills:${WeaponId}`;
export const KM_PX = 48_000;
export const CAREER_TIERS: readonly MedalTier[] = ['bronze', 'silver', 'gold', 'platinum'];
export const CAREER: Record<CareerId, { name: string; unit: string; needs: CareerStat | MedalId; at: readonly [number, number, number, number] }> = {
  kills: { name: 'Centurion', unit: 'career kills', needs: 'kills', at: [100, 500, 1500, 5000] },
  games: { name: 'Veteran', unit: 'matches played', needs: 'games', at: [10, 50, 150, 500] },
  streak: { name: 'Iron Will', unit: 'kills in one life', needs: 'bestStreak', at: [5, 10, 15, 25] },
  longShot: { name: 'Marksman', unit: 'Long Shots', needs: 'longShot', at: [10, 50, 150, 400] },
  pointBlank: { name: 'Brawler', unit: 'Point Blank kills', needs: 'pointBlank', at: [10, 50, 150, 400] },
  multiKill: { name: 'Double Trouble', unit: 'Double Kills', needs: 'doubleKill', at: [10, 50, 150, 400] },
  tripleKill: { name: 'Chain Reaction', unit: 'Triple Kills', needs: 'tripleKill', at: [3, 15, 50, 150] },
  massacre: { name: 'Butcher', unit: 'Massacres', needs: 'massacre', at: [1, 5, 15, 50] },
  clutch: { name: 'Clutch Master', unit: 'Clutches', needs: 'clutch', at: [5, 25, 75, 200] },
  closeCall: { name: 'Survivor', unit: 'Close Calls', needs: 'closeCall', at: [5, 25, 75, 200] },
  revenge: { name: 'Avenger', unit: 'Revenges', needs: 'revenge', at: [5, 25, 75, 200] },
  shutdown: { name: 'Giant Slayer', unit: 'Shutdowns', needs: 'shutdown', at: [3, 15, 50, 150] },
  bounty: { name: 'Headhunter', unit: 'Bounties claimed', needs: 'bounty', at: [3, 15, 50, 150] },
  firstBlood: { name: 'Opener', unit: 'First Bloods', needs: 'firstBlood', at: [3, 15, 50, 150] },
  distance: { name: 'Marathon', unit: 'km walked', needs: 'km', at: [10, 50, 200, 800] },
  ghost: { name: 'Phantom', unit: 'Ghost medals', needs: 'ghost', at: [5, 25, 75, 200] },
  pistolKills: { name: 'Sidearm', unit: 'pistol kills', needs: 'kills:pistol', at: [50, 250, 750, 2500] },
  smgKills: { name: 'Spray Master', unit: 'SMG kills', needs: 'kills:smg', at: [50, 250, 750, 2500] },
  shotgunKills: { name: 'Buckshot', unit: 'shotgun kills', needs: 'kills:shotgun', at: [50, 250, 750, 2500] },
  assaultKills: { name: 'Rifleman', unit: 'assault rifle kills', needs: 'kills:assault', at: [50, 250, 750, 2500] },
  sniperKills: { name: 'Sharpshooter', unit: 'sniper kills', needs: 'kills:sniper', at: [50, 250, 750, 2500] },
  lmgKills: { name: 'Gunner', unit: 'machine gun kills', needs: 'kills:lmg', at: [50, 250, 750, 2500] },
  oneShot: { name: 'Silencer', unit: 'One Shots', needs: 'oneShot', at: [10, 50, 150, 400] },
  twoBirds: { name: 'Scattergun', unit: 'Two Birds', needs: 'twoBirds', at: [10, 50, 150, 400] },
};
/** Score a lifetime medal pays the moment it is earned, by tier. */
export const CAREER_PAY: Record<MedalTier, number> = { bronze: 100, silver: 200, gold: 400, platinum: 800 };
/** One rung of a career track: which track, and which tier of it (0 bronze to 3 platinum). */
export type Badge = { track: CareerId; tier: 0 | 1 | 2 | 3 };
export const badgeKey = (b: Badge) => `${b.track}:${b.tier}`;

/**
 * Explosive barrels stand on the versus maps. A barrel is a `size` px square with `hp`; at zero it hisses for `fuseMs`, then
 * bursts as a blast of `radius` and `damage`. A barrel caught in a blast lights a shorter fuse (`chainBaseMs` plus `chainPerPx`
 * a px from the burst), so a row of them goes off in a ripple. It stands again `respawnMs` after bursting.
 */
export const BARREL = {
  size: 36, hp: 24, fuseMs: 420, chainBaseMs: 120, chainPerPx: 1.1, radius: 170, damage: 150, respawnMs: 45_000,
  /** Maps keep barrels this far (px, beyond the player's body) from every spawn region. */
  spawnGap: 120,
} as const;

/**
 * Airdrops (versus modes): `perRound` of them at random times between `from` and `to` of the round's clock, at least `gapMs` apart.
 * A plane crosses the map at `planeSpeed` px/s, drops a crate where it passes the target, and the crate falls `fallMs` under its
 * chute, landing as a crate of `hp` that stands `lifeMs` unless broken. Whoever breaks it gets a golden gun (`goldMul` damage for the life) or, `supplyChance` of the time
 * or if they already hold one, a full heal, a full magazine and `supplyScore`.
 */
export const AIRDROP = {
  perRound: [1, 2] as const, from: 0.15, to: 0.8, gapMs: 120_000, planeSpeed: 1000, fallMs: 5000, hp: 300, size: 64, lifeMs: 75_000,
  goldMul: 1.2, supplyChance: 0.4, supplyScore: 150, edge: 400,
} as const;

/**
 * The props that stand beside the barrels on the versus maps, one `PropKind` each. A prop is a `size` px square with `hp`; shot to
 * zero it does its thing (see `sim/props.ts`) and, but for a lamp, hides until `respawnMs` after (a lamp stays up, dark, and relights
 * then; a cabinet leaves a pack on the floor for `packMs` first). Maps keep props `spawnGap` px from every spawn region.
 */
export const PROP_KINDS = ['propane', 'gas', 'generator', 'oil', 'lamp', 'medic', 'ammo', 'paint'] as const;
export type PropKind = (typeof PROP_KINDS)[number];
export const PROPS: Record<PropKind, { name: string; desc: string; size: number; hp: number; respawnMs: number }> = {
  propane: { name: 'Propane tank', desc: 'Shot, it rockets off the way the round came and bursts where it lands', size: 28, hp: 28, respawnMs: 40_000 },
  gas: { name: 'Gas canister', desc: 'Bursts into a lingering toxic cloud', size: 28, hp: 30, respawnMs: 45_000 },
  generator: { name: 'Generator', desc: 'Shorts out in an EMP: slows everyone near and locks abilities', size: 40, hp: 50, respawnMs: 60_000 },
  oil: { name: 'Oil drum', desc: 'Spills a burning slick', size: 32, hp: 45, respawnMs: 45_000 },
  lamp: { name: 'Streetlamp', desc: 'Shoot the bulb to darken its pool of light', size: 20, hp: 20, respawnMs: 90_000 },
  medic: { name: 'Medical cabinet', desc: 'Shatters and drops a health pack', size: 36, hp: 40, respawnMs: 60_000 },
  ammo: { name: 'Ammo crate', desc: 'Opens and drops a full magazine and a fresh ability', size: 36, hp: 40, respawnMs: 60_000 },
  paint: { name: 'Paint can', desc: 'Splatters your colour on the floor', size: 22, hp: 10, respawnMs: 30_000 },
};
/** The numbers behind each prop's effect. Speeds are px/s, times ms. */
export const PROP_FX = {
  spawnGap: 100,
  /** A tank rockets off at `speed`, skids (its speed bleeds off at `drag` per second) and bursts on touching a wall, body or prop, or after `lifeMs`. */
  propane: { speed: 700, drag: 0.9, lifeMs: 1800, body: 14, radius: 120, damage: 95 },
  /** The gas cloud lasts `cloudMs` (damage is the gas grenade's). */
  gas: { cloudMs: 7000 },
  /** A shorted generator arcs for `arcMs`, then pulses: everyone within `radius` is slowed to `slowMul` for `slowMs` and cannot use an ability for `lockMs`. */
  generator: { arcMs: 600, radius: 210, slowMs: 2600, slowMul: 0.55, lockMs: 2000 },
  /** The slick burns everyone in `radius` (but its spiller) at `dps` for `burnMs`. */
  oil: { radius: 100, burnMs: 6000, dps: 18 },
  /** A broken-open cabinet's pack lies `packMs`, taken by a player within `pickR` who needs it. */
  medic: { heal: 50, packMs: 25_000, pickR: 34 },
  ammo: { packMs: 25_000, pickR: 34 },
  paint: { radius: 90, picassoPx: 80 },
} as const;

export const MODE_IDS = ['FFA', 'TDM', 'DOM', 'ZOM', 'BR', 'RNG'] as const;
export type ModeId = (typeof MODE_IDS)[number];

export const WORLD = {
  playerRadius: 24,
  baseHp: 100,
  baseSpeed: 255,
  regenDelayMs: 4000,
  regenPerSec: 5,
  tickHz: 30,
  viewRadius: 900,
  crateHp: 40,
  crateScore: 10,
  killScore: 100,
  bountyScore: 300,
  assistScore: 50,
  /** Score multiplier while your level trails the other living players' average. */
  catchUpMul: 1.5,
  respawnMs: 3000,
  /** Outside a zombies run, a fresh life takes no damage this long, or until its owner fires or uses an ability, so a spawn is never a free kill. */
  spawnShieldMs: 2000,
  domWinScore: 3000,
  tdmWinScore: 150,
  /** A human who reaches this ends the FFA round early; otherwise the round runs until MAP_MS.FFA and the top killer, bot or human, wins. */
  ffaWinKills: 30,
  roundRestartMs: 8000,
  minPlayers: 18,
} as const;

/** A burst's blast, and its blows to each building and to the core (before the core's armor) within its radius. */
export type Burst = Blast & { building: number; core: number };
export const ZOMBIE_KINDS = ['walker', 'brute', 'runner', 'plated', 'bloater', 'colossus'] as const;
export type ZombieKind = (typeof ZOMBIE_KINDS)[number];
/**
 * `damage` is per bite and `buildingDamageMul` scales it against walls; `hp` and `damage` grow each night (see `ZOM.nightMul`).
 * A zombie turns on a squad player within `aggroPx`, in sight, instead of marching on the core; one with none never does.
 * `plate` comes off every bullet that hits it, down to 1, unless the round pierces armor; blasts get through whole.
 * A zombie with a `burst` blows up where it dies, hurting the squad and the walls round it. `pack` of them walk in together.
 */
export const ZOMBIES: Record<ZombieKind, {
  name: string; many: string; hp: number; speed: number; radius: number; damage: number; attackMs: number; buildingDamageMul: number; aggroPx: number; score: number; scrap: number;
  plate: number; burst: Burst | null; pack: number;
}> = {
  walker: { name: 'Walker', many: 'walkers', hp: 50, speed: 120, radius: 16, damage: 8, attackMs: 900, buildingDamageMul: 0.5, aggroPx: 160, score: 10, scrap: 2, plate: 0, burst: null, pack: 6 },
  brute: { name: 'Brute', many: 'brutes', hp: 900, speed: 75, radius: 24, damage: 40, attackMs: 1400, buildingDamageMul: 1, aggroPx: 0, score: 60, scrap: 10, plate: 0, burst: null, pack: 2 },
  runner: { name: 'Runner', many: 'runners', hp: 30, speed: 210, radius: 12, damage: 9, attackMs: 600, buildingDamageMul: 0.25, aggroPx: 360, score: 8, scrap: 1, plate: 0, burst: null, pack: 6 },
  plated: { name: 'Plated', many: 'plated', hp: 200, speed: 95, radius: 19, damage: 12, attackMs: 1000, buildingDamageMul: 0.6, aggroPx: 120, score: 30, scrap: 5, plate: 10, burst: null, pack: 3 },
  bloater: {
    name: 'Bloater', many: 'bloaters', hp: 120, speed: 80, radius: 22, damage: 10, attackMs: 1200, buildingDamageMul: 1, aggroPx: 0, score: 25, scrap: 4, plate: 0,
    burst: { radius: 110, damage: 70, building: 600, core: 250 }, pack: 2,
  },
  colossus: { name: 'Colossus', many: 'a colossus', hp: 5000, speed: 55, radius: 40, damage: 80, attackMs: 1600, buildingDamageMul: 2.5, aggroPx: 0, score: 500, scrap: 80, plate: 8, burst: null, pack: 1 },
};

export const SIDES = ['north', 'east', 'south', 'west'] as const;
export type Side = (typeof SIDES)[number];
/**
 * One row per night, the last the Tide: how many of each kind come for a squad of four bots, and the sides they walk in from.
 */
export type NightDef = { name?: string; horde: Partial<Record<ZombieKind, number>>; from: readonly Side[] };
export const NIGHTS: readonly NightDef[] = [
  { horde: { walker: 20 }, from: ['north'] },
  { horde: { walker: 28, runner: 6, brute: 3 }, from: ['east'] },
  { horde: { walker: 40, runner: 12, plated: 6, brute: 12 }, from: ['south', 'west'] },
  { horde: { walker: 52, runner: 12, plated: 16, brute: 17 }, from: ['north', 'east'] },
  { name: 'The Colossus', horde: { walker: 52, runner: 16, brute: 9, colossus: 1 }, from: ['west'] },
  { horde: { walker: 66, runner: 12, bloater: 10, plated: 16, brute: 18 }, from: ['east', 'south'] },
  { horde: { walker: 68, runner: 28, plated: 12, bloater: 10, brute: 18 }, from: ['north', 'south', 'west'] },
  { horde: { walker: 70, plated: 14, bloater: 12, brute: 16 }, from: ['north', 'east', 'west'] },
  { horde: { walker: 70, runner: 26, plated: 14, bloater: 12, brute: 16 }, from: SIDES },
  { name: 'The Tide', horde: { walker: 72, runner: 28, plated: 14, bloater: 12, brute: 15, colossus: 1 }, from: SIDES },
];
export const nightOf = (night: number): NightDef => NIGHTS[Math.min(night, NIGHTS.length) - 1]!;
/** A boss is a kind that walks alone (`pack: 1`): it comes as listed for any squad, its health scaled by the squad's share instead. */
export const isBoss = (kind: ZombieKind) => ZOMBIES[kind].pack === 1;
/** How many of a kind listed `listed` times come for a squad with this share of the horde. */
export const hordeCount = (kind: ZombieKind, listed: number, share: number) => (!listed || isBoss(kind) ? listed : Math.max(1, Math.round(listed * share)));

export const TURRET_KINDS = ['sentry', 'cannon', 'scatter', 'mortar', 'tesla'] as const;
export type TurretKind = (typeof TURRET_KINDS)[number];
/** Utility kinds: an ammo `depot` and a `post` that mends are solid like a wall, `spikes` lie on the floor and are walked over. */
export const UTILITY_KINDS = ['depot', 'post', 'spikes'] as const;
export type UtilityKind = (typeof UTILITY_KINDS)[number];
export const BUILDING_KINDS = ['wall', ...TURRET_KINDS, ...UTILITY_KINDS] as const;
export type BuildingKind = (typeof BUILDING_KINDS)[number];
export const isTurretKind = (kind: BuildingKind): kind is TurretKind => (TURRET_KINDS as readonly string[]).includes(kind);
export const byTurret = <T>(f: (kind: TurretKind) => T) => Object.fromEntries(TURRET_KINDS.map((k) => [k, f(k)])) as Record<TurretKind, T>;

/**
 * A turret holds `ammo` rounds and fires `pellets` of `damage` each every `fireMs` at the nearest zombie of the kind it `prefers` in `range`, else the nearest of any kind.
 * Its rounds leave the barrel `muzzle` px from the cell's center; a refill costs `scrapPerRound`.
 * A `lobbed` round flies over everything to where its target will be when it lands and bursts there, so a lobbing turret needs no line of sight.
 */
export type TurretDef = {
  prefers: ZombieKind; range: number; fireMs: number; damage: number; pellets: number; bulletSpeed: number; spread: number; ammo: number; scrapPerRound: number;
  muzzle: number; bullet: { r: number; color: string }; lobbed: Blast | null;
  /** A coil's arc: it leaps from its first target to up to `jumps` more within `reach` px of the last, each hit `falloff` as hard as the one before. No round flies. */
  arc?: { jumps: number; reach: number; falloff: number };
};
/**
 * A wall comes in three tiers, each an upgrade of the one below: `armor` is the share of a zombie's bite it shrugs off and `blast` scales a bloater's burst on it.
 * Walls are the only buildings priced by tier; `BUILDINGS.wall` is the first.
 */
export type WallTier = { name: string; cost: number; hp: number; armor: number; blast: number; repairMul: number };
export const WALL_TIERS = [
  { name: 'Barricade', cost: 10, hp: 800, armor: 0, blast: 1, repairMul: 1.5 },
  { name: 'Sandbag wall', cost: 24, hp: 2000, armor: 0.1, blast: 0.75, repairMul: 1 },
  { name: 'Steel wall', cost: 60, hp: 4800, armor: 0.3, blast: 0.5, repairMul: 0.8 },
] as const satisfies readonly WallTier[];
/**
 * Upgrades: one level up costs `costShare[lv - 1]` of the building's base price (a wall pays the difference of its tiers' prices instead),
 * and each level scales a turret's `damage`, `fireMs`, `range` and `ammo`, every building's `hp`, and a utility's `aura` (how fast it works) and `reach`.
 */
export const MAX_LEVEL = 3;
export const UPGRADE = {
  costShare: [0.65, 1.15],
  damage: [1, 1.4, 1.9], fireMs: [1, 0.85, 0.7], range: [1, 1.1, 1.2], ammo: [1, 1.5, 2.2], hp: [1, 1.4, 1.9], aura: [1, 1.6, 2.4], reach: [1, 1.15, 1.3],
} as const;
/**
 * Utilities: the ammo `depot` tops up every turret within `reach` px, `ammoPerSec` as a share of a turret's load a second, for `scrapShare` of a round's price, and reloads a squad player's gun at once there.
 * The `post` mends every squad player within `reach` px `playerHp` health a second and every building there `buildingHp`, free.
 * `spikes` slow a zombie on them to `slow` of its speed, hurt it `dps` a second, and wear `wear` hp a second per zombie, `heavyWear` per heavy one (brute, bloater, colossus).
 */
export const UTILITY = {
  depot: { reach: 175, ammoPerSec: 0.1, scrapShare: 0.6 },
  post: { reach: 175, playerHp: 4, buildingHp: 14 },
  spikes: { slow: 0.45, dps: 14, wear: 7, heavyWear: 24 },
} as const;
type BuildingDef = { name: string; cost: number; hp: number };
export const BUILDINGS: { wall: BuildingDef & { turret: null } } & Record<TurretKind, BuildingDef & { turret: TurretDef }> & Record<UtilityKind, BuildingDef & { turret: null }> = {
  wall: { name: WALL_TIERS[0].name, cost: WALL_TIERS[0].cost, hp: WALL_TIERS[0].hp, turret: null },
  depot: { name: 'Ammo depot', cost: 90, hp: 900, turret: null },
  post: { name: 'Repair post', cost: 110, hp: 800, turret: null },
  spikes: { name: 'Spike strip', cost: 12, hp: 450, turret: null },
  tesla: {
    name: 'Tesla coil', cost: 260, hp: 1100,
    turret: { prefers: 'walker', range: 230, fireMs: 1000, damage: 40, pellets: 1, bulletSpeed: 0, spread: 0, ammo: 36, scrapPerRound: 1.5, muzzle: 0, bullet: { r: 2, color: '#8fd3ff' }, lobbed: null, arc: { jumps: 3, reach: 120, falloff: 0.75 } },
  },
  sentry: {
    name: 'Sentry', cost: 70, hp: 1000,
    turret: { prefers: 'walker', range: 420, fireMs: 140, damage: 14, pellets: 1, bulletSpeed: 2000, spread: 0.06, ammo: 120, scrapPerRound: 0.25, muzzle: 28, bullet: { r: 1.8, color: '#a88600' }, lobbed: null },
  },
  cannon: {
    name: 'Cannon', cost: 180, hp: 1500,
    turret: { prefers: 'brute', range: 560, fireMs: 2200, damage: 260, pellets: 1, bulletSpeed: 2600, spread: 0.01, ammo: 10, scrapPerRound: 4, muzzle: 33, bullet: { r: 4.2, color: '#3b3f4a' }, lobbed: null },
  },
  scatter: {
    name: 'Scatter', cost: 90, hp: 1200,
    turret: { prefers: 'runner', range: 260, fireMs: 650, damage: 11, pellets: 7, bulletSpeed: 1600, spread: 0.22, ammo: 40, scrapPerRound: 0.5, muzzle: 24, bullet: { r: 1.6, color: '#2f9e8f' }, lobbed: null },
  },
  mortar: {
    name: 'Mortar', cost: 220, hp: 1000,
    turret: {
      prefers: 'plated', range: 750, fireMs: 2600, damage: 0, pellets: 1, bulletSpeed: 700, spread: 0.04, ammo: 8, scrapPerRound: 5, muzzle: 18, bullet: { r: 5, color: '#4a3f35' },
      lobbed: { radius: 120, damage: 160 },
    },
  },
};

/** The survivors shoot from the Bastion's walls at what comes close; all of them fire a round every `fireMs`, fewer of them slower. */
export const BASTION_GUN: TurretDef = {
  prefers: 'brute', range: 220, fireMs: 300, damage: 20, pellets: 1, bulletSpeed: 1800, spread: 0.08, ammo: Infinity, scrapPerRound: 0, muzzle: 50,
  bullet: { r: 1.6, color: '#4fd1e8' }, lobbed: null,
};

export const ZOM = {
  /** Zombie kill score is scaled by this, matching the versus levels' scale-up for medals (see `LEVELS`). */
  levelScoreMul: 1.6,
  /** One grid cell in px; a building fills one cell and the horde's flow field runs on the same grid. */
  cell: 50,
  coreHp: 4000,
  /**
   * Who shelters in the core: one is lost for every `survivorHp` of harm the core takes, mended or not, and the run is lost with the last of them.
   * Each one left pays `scrapPerSurvivor` at dawn, and they man the Bastion's gun.
   */
  survivors: 50,
  survivorHp: 100,
  scrapPerSurvivor: 3,
  /** A squad player who bleeds out at night is back at the Bastion after `ms`, and `survivors(night)` of those sheltering there are lost to send them; with too few left they wait for dawn. */
  reinforce: { ms: 15_000, survivors: (night: number) => 1 + Math.ceil(night / 2) },
  /** The share of each bite the core shrugs off, so a breach is an emergency the squad can answer rather than the end. */
  coreArmor: 0.6,
  /** Half the side of the square core at the map's center. */
  coreHalf: 50,
  dayMs: 40_000,
  /** How far from the core's center a building may stand. */
  buildRadius: 600,
  /** How far from the builder's center a building may be placed, repaired or reloaded. */
  reachPx: 250,
  reviveMs: 3000,
  reviveRange: 70,
  bleedOutMs: 25_000,
  crawlMul: 0.3,
  /** Health back after a revive, as a share of max. */
  reviveHpFrac: 0.4,
  repairHpPerSec: 80,
  /** Mending a building costs this share of its price for the share of it that is worn. */
  repairShare: 0.5,
  /** How long holding use takes to fill an empty turret. */
  refillMs: 2500,
  /** Dearer than a wall's, so the core wears down over the nights instead of being made whole every day. */
  coreRepairScrapPerHp: 0.2,
  /** The share of a building's price paid back for taking it down whole; a worn one pays back less. */
  demolishRefund: 0.5,
  startScrap: 100,
  squadSize: 4,
  /** Spawning waits while this many zombies are alive. */
  maxAlive: 200,
  /** How far past touching a zombie's bite reaches. */
  biteReach: 10,
  /** What walking through a wall cell costs the flow field, in orthogonal steps; high enough that the horde takes any open way round. */
  wallCostCells: 40,
  hordeShare: (squad: { humans: number; bots: number }) => (squad.bots + 1.5 * squad.humans) / 4,
  /** Each wave of a night brings this many packs at once, from their own sides, then waits `packGapMs` for each before the next, so later nights come in fewer, bigger waves. */
  packsPerWave: (night: number) => Math.max(1, night - 1),
  packGapMs: (night: number) => Math.max(1000, 2600 - 120 * night),
  /** First light comes this long after the night's last pack walks in, and burns whatever of the horde is still out. */
  stragglersMs: 90_000,
  nightMul: (night: number) => ({ hp: 1 + 0.2 * Math.min(night - 1, 5) + 0.06 * Math.max(0, night - 6), damage: 1 + 0.12 * (night - 1) }),
  restartMs: 20_000,
} as const;

/**
 * Last Squad's ring, one row per phase: the safe circle holds for `waitMs`, then closes over `shrinkMs` to `radius`, inside the circle it closes from.
 * Outside the circle a body loses `dps` of its max health a second, through armor and the spawn shield, and does not regenerate.
 */
export type RingPhase = { waitMs: number; shrinkMs: number; radius: number; dps: number };
export const RING: readonly RingPhase[] = [
  { waitMs: 60_000, shrinkMs: 30_000, radius: 3200, dps: 0.02 },
  { waitMs: 45_000, shrinkMs: 25_000, radius: 2500, dps: 0.03 },
  { waitMs: 40_000, shrinkMs: 20_000, radius: 1900, dps: 0.05 },
  { waitMs: 30_000, shrinkMs: 20_000, radius: 1300, dps: 0.08 },
  { waitMs: 25_000, shrinkMs: 15_000, radius: 700, dps: 0.12 },
  { waitMs: 20_000, shrinkMs: 15_000, radius: 0, dps: 0.2 },
];

export const ROYALE = {
  squadSize: 3,
  /** Redeploys stay open until this many ring phases have closed; after that every life is the last. */
  redeployPhases: 3,
  redeployMs: (deaths: number) => 15_000 + 10_000 * Math.max(0, deaths - 1),
  /** A knocked player's own health, as a share of their max, which enemies shoot through to finish them. */
  knockHpFrac: 0.5,
  crateScore: 25,
  /** Each phase's supply drop lands this long into the phase's wait; minimaps show it `dropNoticeMs` before it lands. */
  dropLandMs: 20_000,
  dropNoticeMs: 10_000,
  dropHp: 300,
  dropSize: 64,
} as const;
