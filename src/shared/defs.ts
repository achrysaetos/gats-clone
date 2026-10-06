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
export type GunRules = {
  movingSpreadMul: number;
  bloom: { free: number; perShot: number; maxMul: number; recoverMs: number } | null;
  spinUp: { startMul: number; upMs: number; downMs: number } | null;
  viewMul: number;
};

const STEADY: GunRules = { movingSpreadMul: 1, bloom: null, spinUp: null, viewMul: 1 };
export const GUN_RULES: Record<WeaponId, GunRules> = {
  pistol: STEADY,
  smg: STEADY,
  shotgun: STEADY,
  assault: { ...STEADY, movingSpreadMul: 1.3, bloom: { free: 3, perShot: 0.12, maxMul: 2, recoverMs: 250 } },
  sniper: { ...STEADY, movingSpreadMul: 4, viewMul: 1.35 },
  lmg: { ...STEADY, movingSpreadMul: 2 },
};

export const rulesOf = (def: GunDef): GunRules => (def.rules ? { ...GUN_RULES[def.base], ...def.rules } : GUN_RULES[def.base]);

const BASE_BULLET = { r: 1.6, color: '#25211c' };
const BASE_LOOK: GunLook = { length: 1, width: 1, barrels: 1, accent: '#7b8494', bullet: BASE_BULLET };

export const GUNS: Record<GunId, GunDef> = {
  pistol: { name: 'Pistol', desc: 'Reliable sidearm, steady on the run', base: 'pistol', stage: 0, from: null, damage: 25, fireMs: 200, pellets: 1, spread: 0.04, range: 700, bulletSpeed: 1500, mag: 12, reloadMs: 1000, moveMul: 1.0, auto: false, look: BASE_LOOK },
  handCannon: { name: 'Hand Cannon', desc: 'Two hits drop anyone', base: 'pistol', stage: 1, from: 'pistol', damage: 66, fireMs: 480, pellets: 1, spread: 0.025, range: 780, bulletSpeed: 1650, mag: 6, reloadMs: 1300, moveMul: 1.0, auto: false, breakpoint: 2,
    look: { length: 1.2, width: 1.3, barrels: 1, accent: '#c8553d', bullet: { r: 2.6, color: '#7a2e1f' } } },
  machinePistol: { name: 'Machine Pistol', desc: 'Three-round bursts on the run', base: 'pistol', stage: 1, from: 'pistol', damage: 24, fireMs: 380, pellets: 1, spread: 0.05, range: 620, bulletSpeed: 1500, mag: 18, reloadMs: 1000, moveMul: 1.05, auto: false, burst: { count: 3, gapMs: 60 },
    look: { length: 1.1, width: 1, barrels: 1, accent: '#3fa7b5', bullet: { r: 1.6, color: '#1f5560' } } },
  executioner: { name: 'Executioner', desc: 'Huge rounds punch through one body', base: 'pistol', stage: 2, from: 'handCannon', damage: 80, fireMs: 520, pellets: 1, spread: 0.02, range: 900, bulletSpeed: 2000, mag: 5, reloadMs: 1500, moveMul: 0.95, auto: false, penetrate: 1, breakpoint: 2,
    look: { length: 1.45, width: 1.35, barrels: 1, accent: '#e5484d', bullet: { r: 3.2, color: '#b3261e' } } },
  gunslinger: { name: 'Gunslinger', desc: 'Quick revolver, two hits up close', base: 'pistol', stage: 2, from: 'handCannon', damage: 66, fireMs: 300, pellets: 1, spread: 0.045, range: 650, bulletSpeed: 1600, mag: 6, reloadMs: 1100, moveMul: 1.05, auto: false, breakpoint: 2,
    look: { length: 1.05, width: 1.2, barrels: 1, accent: '#3fa7b5', bullet: { r: 2.4, color: '#1f5560' } } },
  akimbo: { name: 'Akimbo', desc: 'Two pistols, twice the bursts', base: 'pistol', stage: 2, from: 'machinePistol', damage: 18, fireMs: 190, pellets: 1, spread: 0.09, range: 560, bulletSpeed: 1500, mag: 36, reloadMs: 1700, moveMul: 1.05, auto: false, burst: { count: 3, gapMs: 50 },
    look: { length: 1.05, width: 1, barrels: 1, hands: 2, accent: '#30c0a0', bullet: { r: 1.7, color: '#11806a' } } },
  hailstorm: { name: 'Hailstorm', desc: 'Full auto with a deep magazine', base: 'pistol', stage: 2, from: 'machinePistol', damage: 16, fireMs: 80, pellets: 1, spread: 0.1, range: 560, bulletSpeed: 1500, mag: 40, reloadMs: 1300, moveMul: 1.0, auto: true,
    look: { length: 1.25, width: 1.1, barrels: 1, accent: '#5b8def', bullet: { r: 1.7, color: '#2b55b8' } } },

  smg: { name: 'SMG', desc: 'Fast and light, fires at full stride', base: 'smg', stage: 0, from: null, damage: 14, fireMs: 75, pellets: 1, spread: 0.12, range: 520, bulletSpeed: 1400, mag: 30, reloadMs: 1300, moveMul: 1.0, auto: true, look: BASE_LOOK },
  skirmisher: { name: 'Skirmisher', desc: 'Fastest feet in the fight', base: 'smg', stage: 1, from: 'smg', damage: 13, fireMs: 66, pellets: 1, spread: 0.12, range: 500, bulletSpeed: 1450, mag: 28, reloadMs: 1100, moveMul: 1.08, auto: true,
    look: { length: 0.9, width: 0.95, barrels: 1, accent: '#3fa7b5', bullet: { r: 1.5, color: '#1f5560' } } },
  heavySmg: { name: 'Heavy SMG', desc: 'Bigger rounds, more reach', base: 'smg', stage: 1, from: 'smg', damage: 18, fireMs: 85, pellets: 1, spread: 0.09, range: 620, bulletSpeed: 1500, mag: 30, reloadMs: 1500, moveMul: 0.95, auto: true,
    look: { length: 1.15, width: 1.2, barrels: 1, accent: '#c8553d', bullet: { r: 2, color: '#7a2e1f' } } },
  phantom: { name: 'Phantom', desc: 'Suppressed, fastest on foot', base: 'smg', stage: 2, from: 'skirmisher', damage: 15, fireMs: 66, pellets: 1, spread: 0.11, range: 480, bulletSpeed: 1450, mag: 30, reloadMs: 1100, moveMul: 1.1, auto: true, silenced: true,
    look: { length: 1.15, width: 0.9, barrels: 1, accent: '#8e4ec6', bullet: { r: 1.4, color: '#5a2d85' } } },
  hornet: { name: 'Hornet', desc: 'Blistering rate, tiny rounds', base: 'smg', stage: 2, from: 'skirmisher', damage: 10, fireMs: 33, pellets: 1, spread: 0.13, range: 460, bulletSpeed: 1450, mag: 40, reloadMs: 900, moveMul: 1.05, auto: true,
    look: { length: 1, width: 1.05, barrels: 1, accent: '#f5c400', bullet: { r: 1.5, color: '#a88600' } } },
  ripper: { name: 'Ripper', desc: 'Rounds punch through one body', base: 'smg', stage: 2, from: 'heavySmg', damage: 21, fireMs: 85, pellets: 1, spread: 0.085, range: 680, bulletSpeed: 1600, mag: 30, reloadMs: 1600, moveMul: 0.92, auto: true, penetrate: 1,
    look: { length: 1.3, width: 1.25, barrels: 1, accent: '#e5484d', bullet: { r: 2.2, color: '#b3261e' } } },
  bulldog: { name: 'Bulldog', desc: 'Sixty-round drum, slower feet', base: 'smg', stage: 2, from: 'heavySmg', damage: 18, fireMs: 75, pellets: 1, spread: 0.1, range: 600, bulletSpeed: 1500, mag: 60, reloadMs: 2400, moveMul: 0.88, auto: true,
    look: { length: 1.15, width: 1.4, barrels: 1, accent: '#5b8def', bullet: { r: 2, color: '#2b55b8' } } },

  shotgun: { name: 'Shotgun', desc: 'A point-blank blast drops anyone', base: 'shotgun', stage: 0, from: null, damage: 17, fireMs: 800, pellets: 8, spread: 0.2, range: 420, bulletSpeed: 1300, mag: 5, reloadMs: 1800, moveMul: 0.95, auto: false, breakpoint: 1, look: BASE_LOOK },
  slugGun: { name: 'Slug Gun', desc: 'One heavy slug, two hits at mid range', base: 'shotgun', stage: 1, from: 'shotgun', damage: 70, fireMs: 560, pellets: 1, spread: 0.015, range: 800, bulletSpeed: 1800, mag: 6, reloadMs: 1800, moveMul: 0.95, auto: false, breakpoint: 2,
    look: { length: 1.2, width: 0.9, barrels: 1, accent: '#c8553d', bullet: { r: 3, color: '#7a2e1f' } } },
  doubleBarrel: { name: 'Double Barrel', desc: 'Two blasts back to back', base: 'shotgun', stage: 1, from: 'shotgun', damage: 17, fireMs: 260, pellets: 9, spread: 0.22, range: 400, bulletSpeed: 1300, mag: 2, reloadMs: 1500, moveMul: 0.95, auto: false, breakpoint: 1,
    look: { length: 0.95, width: 1.1, barrels: 2, accent: '#3fa7b5', bullet: { r: 1.7, color: '#1f5560' } } },
  railSlug: { name: 'Rail Slug', desc: 'Hypersonic slug pierces two bodies', base: 'shotgun', stage: 2, from: 'slugGun', damage: 75, fireMs: 540, pellets: 1, spread: 0.01, range: 900, bulletSpeed: 3000, mag: 5, reloadMs: 1900, moveMul: 0.92, auto: false, penetrate: 2, breakpoint: 2,
    look: { length: 1.5, width: 0.85, barrels: 1, accent: '#e5484d', bullet: { r: 2.6, color: '#ff3b30' } } },
  boomSlug: { name: 'Boom Slug', desc: 'Slugs explode on impact', base: 'shotgun', stage: 2, from: 'slugGun', damage: 55, fireMs: 600, pellets: 1, spread: 0.02, range: 700, bulletSpeed: 1500, mag: 5, reloadMs: 1900, moveMul: 0.92, auto: false, blast: { radius: 90, damage: 45 }, breakpoint: 2,
    look: { length: 1.2, width: 1.25, barrels: 1, accent: '#f76b15', bullet: { r: 3.8, color: '#e0661a' } } },
  sawedOff: { name: 'Sawed-off', desc: 'Both barrels at once, arm\'s reach', base: 'shotgun', stage: 2, from: 'doubleBarrel', damage: 15, fireMs: 300, pellets: 18, spread: 0.32, range: 280, bulletSpeed: 1300, mag: 1, reloadMs: 1300, moveMul: 1.0, auto: false, breakpoint: 1,
    look: { length: 0.75, width: 1.3, barrels: 2, accent: '#c8553d', bullet: { r: 1.8, color: '#7a2e1f' } } },
  streetSweeper: { name: 'Street Sweeper', desc: 'Automatic drum shotgun', base: 'shotgun', stage: 2, from: 'doubleBarrel', damage: 16, fireMs: 300, pellets: 7, spread: 0.24, range: 420, bulletSpeed: 1300, mag: 12, reloadMs: 2600, moveMul: 0.85, auto: true,
    look: { length: 1.15, width: 1.35, barrels: 1, accent: '#5b8def', bullet: { r: 1.7, color: '#2b55b8' } } },

  assault: { name: 'Assault', desc: 'All-rounder; tap for accuracy', base: 'assault', stage: 0, from: null, damage: 17, fireMs: 110, pellets: 1, spread: 0.05, range: 800, bulletSpeed: 1700, mag: 30, reloadMs: 1500, moveMul: 0.95, auto: true, look: BASE_LOOK },
  battleRifle: { name: 'Battle Rifle', desc: 'One clean burst drops the unarmored', base: 'assault', stage: 1, from: 'assault', damage: 34, fireMs: 600, pellets: 1, spread: 0.035, range: 850, bulletSpeed: 1800, mag: 24, reloadMs: 1700, moveMul: 0.92, auto: true, burst: { count: 3, gapMs: 70 },
    look: { length: 1.15, width: 1.1, barrels: 1, accent: '#c8553d', bullet: { r: 2, color: '#7a2e1f' } } },
  carbine: { name: 'Carbine', desc: 'Lighter and quicker, steady on the move', base: 'assault', stage: 1, from: 'assault', damage: 16, fireMs: 90, pellets: 1, spread: 0.055, range: 720, bulletSpeed: 1700, mag: 30, reloadMs: 1200, moveMul: 1.0, auto: true,
    rules: { movingSpreadMul: 1 },
    look: { length: 0.9, width: 0.95, barrels: 1, accent: '#3fa7b5', bullet: { r: 1.6, color: '#1f5560' } } },
  marksman: { name: 'Marksman', desc: 'Precise single shots, long reach', base: 'assault', stage: 2, from: 'battleRifle', damage: 55, fireMs: 340, pellets: 1, spread: 0.015, range: 900, bulletSpeed: 2300, mag: 12, reloadMs: 1700, moveMul: 0.9, auto: false,
    look: { length: 1.4, width: 1, barrels: 1, accent: '#e5484d', bullet: { r: 2.4, color: '#b3261e' } } },
  grenadier: { name: 'Grenadier', desc: 'Bursts of exploding rounds', base: 'assault', stage: 2, from: 'battleRifle', damage: 24, fireMs: 450, pellets: 1, spread: 0.05, range: 750, bulletSpeed: 1500, mag: 18, reloadMs: 1800, moveMul: 0.89, auto: true, burst: { count: 3, gapMs: 70 }, blast: { radius: 55, damage: 14 },
    look: { length: 1.2, width: 1.35, barrels: 1, accent: '#f76b15', bullet: { r: 2.8, color: '#e0661a' } } },
  specter: { name: 'Specter', desc: 'Suppressed and light', base: 'assault', stage: 2, from: 'carbine', damage: 19, fireMs: 88, pellets: 1, spread: 0.055, range: 700, bulletSpeed: 1700, mag: 30, reloadMs: 1200, moveMul: 1.02, auto: true, silenced: true,
    rules: { movingSpreadMul: 1 },
    look: { length: 1.2, width: 0.9, barrels: 1, accent: '#8e4ec6', bullet: { r: 1.5, color: '#5a2d85' } } },
  scout: { name: 'Scout', desc: 'Scoped carbine, sees and hits farther', base: 'assault', stage: 2, from: 'carbine', damage: 22, fireMs: 120, pellets: 1, spread: 0.035, range: 900, bulletSpeed: 1900, mag: 25, reloadMs: 1300, moveMul: 1.0, auto: true,
    rules: { movingSpreadMul: 1, viewMul: 1.25 },
    look: { length: 1.2, width: 0.95, barrels: 1, accent: '#3fa7b5', bullet: { r: 1.7, color: '#1f5560' } } },

  sniper: { name: 'Bolt-action', desc: 'One shot, one kill; plant your feet', base: 'sniper', stage: 0, from: null, damage: 135, fireMs: 1350, pellets: 1, spread: 0.01, range: 1200, bulletSpeed: 2200, mag: 5, reloadMs: 2000, moveMul: 0.9, auto: false, breakpoint: 1, look: BASE_LOOK },
  longshot: { name: 'Longshot', desc: 'Heavier rounds, farther, faster', base: 'sniper', stage: 1, from: 'sniper', damage: 160, fireMs: 1700, pellets: 1, spread: 0.008, range: 1300, bulletSpeed: 3200, mag: 5, reloadMs: 2100, moveMul: 0.88, auto: false, breakpoint: 1,
    rules: { viewMul: 1.5 },
    look: { length: 1.2, width: 1.05, barrels: 1, accent: '#c8553d', bullet: { r: 2.2, color: '#7a2e1f' } } },
  semiAuto: { name: 'Semi-auto Rifle', desc: 'Two hits drop anyone, quick follow-ups', base: 'sniper', stage: 1, from: 'sniper', damage: 68, fireMs: 360, pellets: 1, spread: 0.015, range: 1150, bulletSpeed: 2500, mag: 10, reloadMs: 1900, moveMul: 0.92, auto: false, breakpoint: 2,
    look: { length: 1, width: 1.1, barrels: 1, accent: '#3fa7b5', bullet: { r: 1.8, color: '#1f5560' } } },
  piercer: { name: 'Piercer', desc: 'Rounds pass through three bodies', base: 'sniper', stage: 2, from: 'longshot', damage: 160, fireMs: 1700, pellets: 1, spread: 0.006, range: 1400, bulletSpeed: 3600, mag: 5, reloadMs: 2200, moveMul: 0.86, auto: false, penetrate: 3, breakpoint: 1,
    rules: { viewMul: 1.6 },
    look: { length: 1.45, width: 1, barrels: 1, accent: '#e5484d', bullet: { r: 2.4, color: '#ff3b30' } } },
  artillery: { name: 'Artillery', desc: 'Slow shells with a wide blast', base: 'sniper', stage: 2, from: 'longshot', damage: 100, fireMs: 1500, pellets: 1, spread: 0.01, range: 1300, bulletSpeed: 1800, mag: 4, reloadMs: 2300, moveMul: 0.86, auto: false, blast: { radius: 130, damage: 80 }, breakpoint: 1,
    rules: { viewMul: 1.5 },
    look: { length: 1.3, width: 1.45, barrels: 1, accent: '#f76b15', bullet: { r: 4, color: '#e0661a' } } },
  repeater: { name: 'Repeater', desc: 'Fastest follow-ups, lighter rounds', base: 'sniper', stage: 2, from: 'semiAuto', damage: 55, fireMs: 250, pellets: 1, spread: 0.018, range: 1100, bulletSpeed: 2600, mag: 14, reloadMs: 1800, moveMul: 0.95, auto: false,
    look: { length: 1.05, width: 1.2, barrels: 1, accent: '#5b8def', bullet: { r: 1.9, color: '#2b55b8' } } },
  ghost: { name: 'Ghost', desc: 'Suppressed marksman rifle', base: 'sniper', stage: 2, from: 'semiAuto', damage: 68, fireMs: 400, pellets: 1, spread: 0.012, range: 1150, bulletSpeed: 2600, mag: 10, reloadMs: 1900, moveMul: 0.95, auto: false, silenced: true, breakpoint: 2,
    look: { length: 1.25, width: 0.95, barrels: 1, accent: '#8e4ec6', bullet: { r: 1.6, color: '#5a2d85' } } },

  lmg: { name: 'LMG', desc: 'A long belt; steady when planted', base: 'lmg', stage: 0, from: null, damage: 16, fireMs: 90, pellets: 1, spread: 0.055, range: 850, bulletSpeed: 1600, mag: 100, reloadMs: 3500, moveMul: 0.82, auto: true, look: BASE_LOOK },
  heavyLmg: { name: 'Heavy LMG', desc: 'Bigger rounds, holds a lane', base: 'lmg', stage: 1, from: 'lmg', damage: 23, fireMs: 100, pellets: 1, spread: 0.055, range: 900, bulletSpeed: 1700, mag: 100, reloadMs: 3800, moveMul: 0.78, auto: true,
    look: { length: 1.15, width: 1.2, barrels: 1, accent: '#c8553d', bullet: { r: 2.1, color: '#7a2e1f' } } },
  lightMg: { name: 'Light MG', desc: 'Lighter build, fires on the walk', base: 'lmg', stage: 1, from: 'lmg', damage: 14, fireMs: 75, pellets: 1, spread: 0.07, range: 800, bulletSpeed: 1600, mag: 80, reloadMs: 3000, moveMul: 0.9, auto: true,
    rules: { movingSpreadMul: 1.3 },
    look: { length: 0.95, width: 0.95, barrels: 1, accent: '#3fa7b5', bullet: { r: 1.6, color: '#1f5560' } } },
  minigun: { name: 'Minigun', desc: 'Spins up into a torrent of lead', base: 'lmg', stage: 2, from: 'heavyLmg', damage: 12, fireMs: 33, pellets: 1, spread: 0.08, range: 750, bulletSpeed: 1600, mag: 200, reloadMs: 4500, moveMul: 0.75, auto: true,
    rules: { spinUp: { startMul: 2.5, upMs: 700, downMs: 800 } },
    look: { length: 1.2, width: 1.25, barrels: 3, accent: '#f5c400', bullet: { r: 1.6, color: '#a88600' } } },
  juggernaut: { name: 'Juggernaut', desc: 'Biggest rounds, huge belt, slowest feet', base: 'lmg', stage: 2, from: 'heavyLmg', damage: 30, fireMs: 105, pellets: 1, spread: 0.05, range: 900, bulletSpeed: 1800, mag: 150, reloadMs: 4500, moveMul: 0.72, auto: true,
    look: { length: 1.3, width: 1.45, barrels: 1, accent: '#e5484d', bullet: { r: 2.3, color: '#b3261e' } } },
  ranger: { name: 'Ranger', desc: 'Lightest MG, accurate on the move', base: 'lmg', stage: 2, from: 'lightMg', damage: 16, fireMs: 75, pellets: 1, spread: 0.06, range: 800, bulletSpeed: 1650, mag: 75, reloadMs: 2400, moveMul: 0.95, auto: true,
    rules: { movingSpreadMul: 1 },
    look: { length: 1, width: 0.95, barrels: 1, accent: '#3fa7b5', bullet: { r: 1.6, color: '#1f5560' } } },
  twinMg: { name: 'Twin MG', desc: 'Paired barrels, double rounds', base: 'lmg', stage: 2, from: 'lightMg', damage: 12, fireMs: 85, pellets: 2, spread: 0.1, range: 760, bulletSpeed: 1600, mag: 100, reloadMs: 3200, moveMul: 0.88, auto: true,
    rules: { movingSpreadMul: 1.3 },
    look: { length: 1.05, width: 1.3, barrels: 2, accent: '#30c0a0', bullet: { r: 1.7, color: '#11806a' } } },
};

export function byGun<T>(f: (id: GunId) => T): Record<GunId, T> {
  const out: Partial<Record<GunId, T>> = {};
  for (const id of GUN_IDS) out[id] = f(id);
  return out as Record<GunId, T>;
}

export const EVOLUTIONS: Record<GunId, readonly GunId[]> = byGun((id) => GUN_IDS.filter((child) => GUNS[child].from === id));

export const ARMOR_IDS = ['none', 'light', 'medium', 'heavy'] as const;
export type ArmorId = (typeof ARMOR_IDS)[number];
export const ARMORS: Record<ArmorId, { name: string; blockFrac: number; speedMul: number }> = {
  none: { name: 'No armor', blockFrac: 0, speedMul: 1.0 },
  light: { name: 'Light', blockFrac: 0.08, speedMul: 0.93 },
  medium: { name: 'Medium', blockFrac: 0.16, speedMul: 0.86 },
  heavy: { name: 'Heavy', blockFrac: 0.24, speedMul: 0.79 },
};

export const COLOR_IDS = ['red', 'orange', 'yellow', 'green', 'blue', 'purple'] as const;
export type ColorId = (typeof COLOR_IDS)[number];
export const COLORS: Record<ColorId, string> = {
  red: '#e5484d', orange: '#f76b15', yellow: '#f5c400', green: '#30a46c', blue: '#3e63dd', purple: '#8e4ec6',
};

export const PERK_TIERS = {
  1: ['optics', 'thermal', 'ghillie', 'piercing', 'extended', 'grip', 'silencer', 'lightweight', 'longRange', 'quickReload', 'choke'],
  2: ['shield', 'thickSkin', 'firstAid'],
  3: ['grenade', 'fragGrenade', 'gasGrenade', 'landMine', 'knife', 'engineer', 'dash'],
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
  lightweight: { name: 'Lightweight', desc: '+10% move speed' },
  longRange: { name: 'Long range', desc: '+40% bullet range' },
  quickReload: { name: 'Quick reload', desc: 'Reload 35% faster' },
  choke: { name: 'Choke', desc: '-40% pellet spread' },
  shield: { name: 'Shield', desc: 'Blocks 33% of bullet damage from the front' },
  thickSkin: { name: 'Thick skin', desc: '+40 max health' },
  firstAid: { name: 'First aid', desc: 'Regenerate health 3x faster, starting 1.6s after a hit' },
  grenade: { name: 'Grenade', desc: 'Thrown explosive' },
  fragGrenade: { name: 'Frag grenade', desc: 'Explodes into shrapnel' },
  gasGrenade: { name: 'Gas grenade', desc: 'Lingering damage cloud' },
  landMine: { name: 'Land mine', desc: 'Hidden explosive at your feet, two at a time' },
  knife: { name: 'Knife', desc: 'Lunge melee strike' },
  engineer: { name: 'Engineer', desc: 'Build a wall' },
  dash: { name: 'Dash', desc: 'Burst of speed' },
};

export const ABILITY_COOLDOWN_MS: Record<AbilityId, number> = {
  grenade: 6000, fragGrenade: 7000, gasGrenade: 8000, landMine: 9000, knife: 4000, engineer: 10000, dash: 3500,
};

export const PLAYER_KINDS = ['human', 'bot'] as const;
export type PlayerKind = (typeof PLAYER_KINDS)[number];
/** Humans carry multiplied health so a person outlasts the bots that fill the room. Regen scales with it, so healing takes the same time. */
export const HP_MULTIPLIER: Record<PlayerKind, number> = { human: 4, bot: 1 };

export type Pick = { k: 'perk'; tier: Tier } | { k: 'evolve' };
export type PendingPick = { level: number } & Pick;
export type PickOption = PerkId | GunId;

export const LEVELS = [
  { score: 0, pick: null }, { score: 100, pick: { k: 'perk', tier: 1 } }, { score: 200, pick: { k: 'evolve' } },
  { score: 300, pick: { k: 'perk', tier: 2 } }, { score: 400, pick: { k: 'perk', tier: 3 } }, { score: 550, pick: { k: 'evolve' } },
] as const satisfies readonly { score: number; pick: Pick | null }[];

type Attachment = (typeof PERK_TIERS)[1][number];

export const ATTACHMENTS: Record<WeaponId, readonly Attachment[]> = {
  pistol: ['extended', 'longRange', 'silencer', 'lightweight', 'optics'],
  smg: ['grip', 'extended', 'silencer', 'longRange', 'lightweight'],
  shotgun: ['choke', 'quickReload', 'extended', 'lightweight', 'piercing'],
  assault: ['grip', 'extended', 'silencer', 'optics', 'piercing'],
  sniper: ['optics', 'thermal', 'ghillie', 'silencer', 'quickReload'],
  lmg: ['quickReload', 'grip', 'lightweight', 'piercing', 'thermal'],
};

const DOES_NOTHING: Partial<Record<Attachment, (def: GunDef) => boolean>> = {
  silencer: (def) => def.silenced ?? false,
  choke: (def) => def.pellets < 2,
};

export const pickOptions = (pick: Pick, gun: GunId): readonly PickOption[] =>
  pick.k === 'evolve' ? EVOLUTIONS[gun]
    : pick.tier === 1 ? ATTACHMENTS[GUNS[gun].base].filter((perk) => !DOES_NOTHING[perk]?.(GUNS[gun]))
      : PERK_TIERS[pick.tier];

export const isPerkId = (option: PickOption): option is PerkId => Object.hasOwn(PERK_INFO, option);

export const PICK_OPTIONS: readonly PickOption[] = [...PERK_TIERS[1], ...PERK_TIERS[2], ...PERK_TIERS[3], ...GUN_IDS];

/** How long a press waits past the gun's cooldown or reload to fire, so a tap a moment early is not lost. */
export const PRESS_GRACE_MS = 100;
/** How far ahead of the gun being ready a click is kept; an earlier click is dropped rather than firing later on its own. */
export const PRESS_BUFFER_MS = 200;

export const MODE_IDS = ['FFA', 'TDM', 'DOM', 'ZOM'] as const;
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
  bountyScore: 200,
  assistScore: 50,
  /** Score multiplier while your level trails the other living players' average. */
  catchUpMul: 1.5,
  respawnMs: 3000,
  domWinScore: 3000,
  tdmWinScore: 150,
  /** A human who reaches this ends the FFA round early; otherwise the round runs until MAP_MS.FFA and the top killer, bot or human, wins. */
  ffaWinKills: 30,
  roundRestartMs: 8000,
  minPlayers: 18,
} as const;

export const ZOMBIE_KINDS = ['walker', 'brute'] as const;
export type ZombieKind = (typeof ZOMBIE_KINDS)[number];
/**
 * `damage` is per bite and `buildingDamageMul` scales it against walls; `hp` and `damage` grow each night (see `ZOM.nightMul`).
 * A zombie turns on a squad player within `aggroPx`, in sight, instead of marching on the core; a brute never does.
 */
export const ZOMBIES: Record<ZombieKind, {
  name: string; hp: number; speed: number; radius: number; damage: number; attackMs: number; buildingDamageMul: number; aggroPx: number; score: number; scrap: number; firstNight: number;
}> = {
  walker: { name: 'Walker', hp: 50, speed: 120, radius: 16, damage: 8, attackMs: 900, buildingDamageMul: 0.5, aggroPx: 120, score: 10, scrap: 2, firstNight: 1 },
  brute: { name: 'Brute', hp: 400, speed: 75, radius: 24, damage: 25, attackMs: 1400, buildingDamageMul: 1, aggroPx: 0, score: 60, scrap: 10, firstNight: 3 },
};

export const TURRET_KINDS = ['sentry', 'cannon'] as const;
export type TurretKind = (typeof TURRET_KINDS)[number];
export const BUILDING_KINDS = ['wall', ...TURRET_KINDS] as const;
export type BuildingKind = (typeof BUILDING_KINDS)[number];
export const byTurret = <T>(f: (kind: TurretKind) => T) => Object.fromEntries(TURRET_KINDS.map((k) => [k, f(k)])) as Record<TurretKind, T>;

/**
 * A turret holds `ammo` rounds and fires one every `fireMs` at the nearest zombie of the kind it `prefers` in `range`, else the nearest of any kind.
 * A round's `damage` depends on the kind of zombie it hits, and it leaves the barrel `muzzle` px from the cell's center; a refill costs `scrapPerRound`.
 */
export type TurretDef = {
  prefers: ZombieKind; range: number; fireMs: number; damage: Record<ZombieKind, number>; bulletSpeed: number; spread: number; ammo: number; scrapPerRound: number;
  muzzle: number; bullet: { r: number; color: string };
};
type BuildingDef = { name: string; cost: number; hp: number };
export const BUILDINGS: { wall: BuildingDef & { turret: null } } & Record<TurretKind, BuildingDef & { turret: TurretDef }> = {
  wall: { name: 'Wall', cost: 20, hp: 2000, turret: null },
  sentry: {
    name: 'Sentry', cost: 70, hp: 1000,
    turret: { prefers: 'walker', range: 420, fireMs: 140, damage: { walker: 14, brute: 4 }, bulletSpeed: 2000, spread: 0.06, ammo: 120, scrapPerRound: 0.25, muzzle: 28, bullet: { r: 1.8, color: '#a88600' } },
  },
  cannon: {
    name: 'Cannon', cost: 180, hp: 1500,
    turret: { prefers: 'brute', range: 560, fireMs: 2200, damage: { walker: 260, brute: 260 }, bulletSpeed: 2600, spread: 0.01, ammo: 10, scrapPerRound: 4, muzzle: 33, bullet: { r: 4.2, color: '#3b3f4a' } },
  },
};

export const ZOM = {
  /** One grid cell in px; a building fills one cell and the horde's flow field runs on the same grid. */
  cell: 50,
  coreHp: 4000,
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
  repairScrapPerHp: 0.05,
  /** How long holding use takes to fill an empty turret. */
  refillMs: 2500,
  /** Dearer than a wall's, so the core wears down over the nights instead of being made whole every day. */
  coreRepairScrapPerHp: 0.2,
  demolishRefund: 0.5,
  startScrap: 100,
  squadSize: 4,
  /** Spawning waits while this many zombies are alive. */
  maxAlive: 200,
  /** How far past touching a zombie's bite reaches. */
  biteReach: 10,
  /** What walking through a wall cell costs the flow field, in orthogonal steps; high enough that the horde takes any open way round. */
  wallCostCells: 40,
  spawnGapMs: (night: number) => Math.max(150, 900 - 50 * night),
  /** A squad of four bots meets the base wave; a human, with triple health and better aim than a bot, counts for one and a half. */
  waveSize: (night: number, squad: { humans: number; bots: number }) => Math.max(1, Math.round(((12 + 6 * night + 0.5 * night * night) * (squad.bots + 1.5 * squad.humans)) / 4)),
  /** Brutes join from their first night and make up a growing share after. */
  share: (kind: ZombieKind, night: number) => (night < ZOMBIES[kind].firstNight ? 0 : kind === 'walker' ? 1 : 0.05 * (night - ZOMBIES[kind].firstNight + 1)),
  nightMul: (night: number) => ({ hp: 1 + 0.1 * (night - 1), damage: 1 + 0.1 * (night - 1) }),
  restartMs: 20_000,
} as const;
