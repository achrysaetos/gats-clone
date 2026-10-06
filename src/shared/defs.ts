export const WEAPON_IDS = ['pistol', 'smg', 'shotgun', 'assault', 'sniper', 'lmg'] as const;
export type WeaponId = (typeof WEAPON_IDS)[number];

export const GUN_IDS = [
  ...WEAPON_IDS,
  'handCannon', 'machinePistol', 'executioner', 'thunderclap', 'twinFang', 'hailstorm',
  'skirmisher', 'heavySmg', 'phantom', 'hornet', 'ripper', 'spitfire',
  'slugGun', 'doubleBarrel', 'railSlug', 'boomSlug', 'quadBarrel', 'streetSweeper',
  'battleRifle', 'carbine', 'marksman', 'grenadier', 'vanguard', 'specter',
  'longshot', 'semiAuto', 'piercer', 'artillery', 'repeater', 'ghost',
  'heavyLmg', 'lightMg', 'juggernaut', 'siegeGun', 'minigun', 'twinMg',
] as const;
export type GunId = (typeof GUN_IDS)[number];

export type Blast = { radius: number; damage: number };

export type GunLook = { length: number; width: number; barrels: 1 | 2 | 3; accent: string; bullet: { r: number; color: string } };

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
  look: GunLook;
};

const BASE_BULLET = { r: 1.6, color: '#25211c' };
const BASE_LOOK: GunLook = { length: 1, width: 1, barrels: 1, accent: '#7b8494', bullet: BASE_BULLET };

export const GUNS: Record<GunId, GunDef> = {
  pistol: { name: 'Pistol', desc: 'Reliable sidearm', base: 'pistol', stage: 0, from: null, damage: 27, fireMs: 220, pellets: 1, spread: 0.04, range: 700, bulletSpeed: 1500, mag: 12, reloadMs: 1100, moveMul: 1.0, auto: false, look: BASE_LOOK },
  handCannon: { name: 'Hand Cannon', desc: 'Heavy single shots', base: 'pistol', stage: 1, from: 'pistol', damage: 38, fireMs: 420, pellets: 1, spread: 0.03, range: 780, bulletSpeed: 1650, mag: 8, reloadMs: 1300, moveMul: 0.98, auto: false,
    look: { length: 1.2, width: 1.3, barrels: 1, accent: '#c8553d', bullet: { r: 2.6, color: '#7a2e1f' } } },
  machinePistol: { name: 'Machine Pistol', desc: 'Three-round bursts', base: 'pistol', stage: 1, from: 'pistol', damage: 19, fireMs: 430, pellets: 1, spread: 0.06, range: 650, bulletSpeed: 1500, mag: 18, reloadMs: 1200, moveMul: 1.0, auto: false, burst: { count: 3, gapMs: 60 },
    look: { length: 1.1, width: 1, barrels: 1, accent: '#3fa7b5', bullet: { r: 1.6, color: '#1f5560' } } },
  executioner: { name: 'Executioner', desc: 'Huge rounds punch through one body', base: 'pistol', stage: 2, from: 'handCannon', damage: 60, fireMs: 560, pellets: 1, spread: 0.02, range: 900, bulletSpeed: 2000, mag: 6, reloadMs: 1400, moveMul: 0.97, auto: false, penetrate: 1,
    look: { length: 1.45, width: 1.35, barrels: 1, accent: '#e5484d', bullet: { r: 3.2, color: '#b3261e' } } },
  thunderclap: { name: 'Thunderclap', desc: 'Rounds burst on impact', base: 'pistol', stage: 2, from: 'handCannon', damage: 34, fireMs: 420, pellets: 1, spread: 0.03, range: 700, bulletSpeed: 1400, mag: 6, reloadMs: 1400, moveMul: 0.97, auto: false, blast: { radius: 70, damage: 22 },
    look: { length: 1.25, width: 1.5, barrels: 1, accent: '#f76b15', bullet: { r: 3.4, color: '#e0661a' } } },
  twinFang: { name: 'Twin Fang', desc: 'Bursts of paired rounds', base: 'pistol', stage: 2, from: 'machinePistol', damage: 14, fireMs: 520, pellets: 2, spread: 0.06, range: 650, bulletSpeed: 1500, mag: 21, reloadMs: 1200, moveMul: 1.0, auto: false, burst: { count: 3, gapMs: 60 },
    look: { length: 1.1, width: 1.15, barrels: 2, accent: '#30c0a0', bullet: { r: 1.8, color: '#11806a' } } },
  hailstorm: { name: 'Hailstorm', desc: 'Full auto with a deep magazine', base: 'pistol', stage: 2, from: 'machinePistol', damage: 15, fireMs: 98, pellets: 1, spread: 0.12, range: 560, bulletSpeed: 1500, mag: 40, reloadMs: 1500, moveMul: 0.98, auto: true,
    look: { length: 1.25, width: 1.1, barrels: 1, accent: '#5b8def', bullet: { r: 1.7, color: '#2b55b8' } } },

  smg: { name: 'SMG', desc: 'Fast and light', base: 'smg', stage: 0, from: null, damage: 13, fireMs: 75, pellets: 1, spread: 0.12, range: 550, bulletSpeed: 1400, mag: 30, reloadMs: 1300, moveMul: 0.97, auto: true, look: BASE_LOOK },
  skirmisher: { name: 'Skirmisher', desc: 'Faster fire, faster feet', base: 'smg', stage: 1, from: 'smg', damage: 12, fireMs: 66, pellets: 1, spread: 0.12, range: 550, bulletSpeed: 1450, mag: 32, reloadMs: 1200, moveMul: 1.04, auto: true,
    look: { length: 0.9, width: 0.95, barrels: 1, accent: '#3fa7b5', bullet: { r: 1.5, color: '#1f5560' } } },
  heavySmg: { name: 'Heavy SMG', desc: 'Harder hits, longer reach', base: 'smg', stage: 1, from: 'smg', damage: 17, fireMs: 78, pellets: 1, spread: 0.1, range: 650, bulletSpeed: 1500, mag: 30, reloadMs: 1400, moveMul: 0.94, auto: true,
    look: { length: 1.15, width: 1.2, barrels: 1, accent: '#c8553d', bullet: { r: 2, color: '#7a2e1f' } } },
  phantom: { name: 'Phantom', desc: 'Silenced, fastest on foot', base: 'smg', stage: 2, from: 'skirmisher', damage: 15, fireMs: 66, pellets: 1, spread: 0.11, range: 520, bulletSpeed: 1450, mag: 34, reloadMs: 1100, moveMul: 1.1, auto: true, silenced: true,
    look: { length: 1.15, width: 0.9, barrels: 1, accent: '#8e4ec6', bullet: { r: 1.4, color: '#5a2d85' } } },
  hornet: { name: 'Hornet', desc: 'Blistering rate, big magazine', base: 'smg', stage: 2, from: 'skirmisher', damage: 9, fireMs: 33, pellets: 1, spread: 0.14, range: 520, bulletSpeed: 1450, mag: 50, reloadMs: 1500, moveMul: 1.02, auto: true,
    look: { length: 1, width: 1.05, barrels: 1, accent: '#f5c400', bullet: { r: 1.5, color: '#a88600' } } },
  ripper: { name: 'Ripper', desc: 'Rounds punch through one body', base: 'smg', stage: 2, from: 'heavySmg', damage: 22, fireMs: 80, pellets: 1, spread: 0.09, range: 700, bulletSpeed: 1600, mag: 30, reloadMs: 1500, moveMul: 0.93, auto: true, penetrate: 1,
    look: { length: 1.3, width: 1.25, barrels: 1, accent: '#e5484d', bullet: { r: 2.2, color: '#b3261e' } } },
  spitfire: { name: 'Spitfire', desc: 'Two rounds every shot', base: 'smg', stage: 2, from: 'heavySmg', damage: 12, fireMs: 82, pellets: 2, spread: 0.15, range: 560, bulletSpeed: 1450, mag: 30, reloadMs: 1500, moveMul: 0.93, auto: true,
    look: { length: 1.1, width: 1.3, barrels: 2, accent: '#f76b15', bullet: { r: 1.8, color: '#e0661a' } } },

  shotgun: { name: 'Shotgun', desc: 'Devastating up close', base: 'shotgun', stage: 0, from: null, damage: 15, fireMs: 750, pellets: 7, spread: 0.22, range: 420, bulletSpeed: 1300, mag: 6, reloadMs: 1800, moveMul: 0.93, auto: false, look: BASE_LOOK },
  slugGun: { name: 'Slug Gun', desc: 'One heavy slug, long reach', base: 'shotgun', stage: 1, from: 'shotgun', damage: 100, fireMs: 900, pellets: 1, spread: 0.02, range: 750, bulletSpeed: 1700, mag: 6, reloadMs: 1800, moveMul: 0.93, auto: false,
    look: { length: 1.2, width: 0.9, barrels: 1, accent: '#c8553d', bullet: { r: 3, color: '#7a2e1f' } } },
  doubleBarrel: { name: 'Double Barrel', desc: 'Two quick blasts, more pellets', base: 'shotgun', stage: 1, from: 'shotgun', damage: 16, fireMs: 260, pellets: 9, spread: 0.24, range: 400, bulletSpeed: 1300, mag: 2, reloadMs: 1400, moveMul: 0.93, auto: false,
    look: { length: 0.95, width: 1.1, barrels: 2, accent: '#3fa7b5', bullet: { r: 1.7, color: '#1f5560' } } },
  railSlug: { name: 'Rail Slug', desc: 'Hypersonic slug pierces two bodies', base: 'shotgun', stage: 2, from: 'slugGun', damage: 110, fireMs: 650, pellets: 1, spread: 0.01, range: 1000, bulletSpeed: 3000, mag: 5, reloadMs: 1900, moveMul: 0.92, auto: false, penetrate: 2,
    look: { length: 1.5, width: 0.85, barrels: 1, accent: '#e5484d', bullet: { r: 2.6, color: '#ff3b30' } } },
  boomSlug: { name: 'Boom Slug', desc: 'Slugs explode on impact', base: 'shotgun', stage: 2, from: 'slugGun', damage: 70, fireMs: 650, pellets: 1, spread: 0.02, range: 650, bulletSpeed: 1500, mag: 5, reloadMs: 1900, moveMul: 0.92, auto: false, blast: { radius: 90, damage: 50 },
    look: { length: 1.2, width: 1.25, barrels: 1, accent: '#f76b15', bullet: { r: 3.8, color: '#e0661a' } } },
  quadBarrel: { name: 'Quad Barrel', desc: 'Four blasts before a reload', base: 'shotgun', stage: 2, from: 'doubleBarrel', damage: 14, fireMs: 380, pellets: 8, spread: 0.24, range: 400, bulletSpeed: 1300, mag: 4, reloadMs: 1900, moveMul: 0.91, auto: false,
    look: { length: 1, width: 1.3, barrels: 3, accent: '#30c0a0', bullet: { r: 1.8, color: '#11806a' } } },
  streetSweeper: { name: 'Street Sweeper', desc: 'Automatic drum shotgun', base: 'shotgun', stage: 2, from: 'doubleBarrel', damage: 13, fireMs: 300, pellets: 7, spread: 0.24, range: 420, bulletSpeed: 1300, mag: 12, reloadMs: 2400, moveMul: 0.9, auto: true,
    look: { length: 1.15, width: 1.35, barrels: 1, accent: '#5b8def', bullet: { r: 1.7, color: '#2b55b8' } } },

  assault: { name: 'Assault', desc: 'All-rounder rifle', base: 'assault', stage: 0, from: null, damage: 16, fireMs: 110, pellets: 1, spread: 0.07, range: 800, bulletSpeed: 1700, mag: 30, reloadMs: 1500, moveMul: 0.92, auto: true, look: BASE_LOOK },
  battleRifle: { name: 'Battle Rifle', desc: 'Hard-hitting three-round bursts', base: 'assault', stage: 1, from: 'assault', damage: 24, fireMs: 300, pellets: 1, spread: 0.05, range: 850, bulletSpeed: 1800, mag: 24, reloadMs: 1600, moveMul: 0.91, auto: true, burst: { count: 3, gapMs: 60 },
    look: { length: 1.15, width: 1.1, barrels: 1, accent: '#c8553d', bullet: { r: 2, color: '#7a2e1f' } } },
  carbine: { name: 'Carbine', desc: 'Quicker fire, lighter carry', base: 'assault', stage: 1, from: 'assault', damage: 16, fireMs: 88, pellets: 1, spread: 0.08, range: 720, bulletSpeed: 1700, mag: 30, reloadMs: 1300, moveMul: 0.97, auto: true,
    look: { length: 0.9, width: 0.95, barrels: 1, accent: '#3fa7b5', bullet: { r: 1.6, color: '#1f5560' } } },
  marksman: { name: 'Marksman', desc: 'Precise shots pierce one body', base: 'assault', stage: 2, from: 'battleRifle', damage: 60, fireMs: 320, pellets: 1, spread: 0.02, range: 1100, bulletSpeed: 2300, mag: 12, reloadMs: 1700, moveMul: 0.9, auto: false, penetrate: 1,
    look: { length: 1.4, width: 1, barrels: 1, accent: '#e5484d', bullet: { r: 2.4, color: '#b3261e' } } },
  grenadier: { name: 'Grenadier', desc: 'Bursts of exploding rounds', base: 'assault', stage: 2, from: 'battleRifle', damage: 20, fireMs: 380, pellets: 1, spread: 0.05, range: 750, bulletSpeed: 1500, mag: 18, reloadMs: 1800, moveMul: 0.89, auto: true, burst: { count: 3, gapMs: 70 }, blast: { radius: 55, damage: 14 },
    look: { length: 1.2, width: 1.35, barrels: 1, accent: '#f76b15', bullet: { r: 2.8, color: '#e0661a' } } },
  vanguard: { name: 'Vanguard', desc: 'Bigger magazine, harder hits', base: 'assault', stage: 2, from: 'carbine', damage: 21, fireMs: 88, pellets: 1, spread: 0.07, range: 780, bulletSpeed: 1800, mag: 45, reloadMs: 1500, moveMul: 0.95, auto: true,
    look: { length: 1.1, width: 1.15, barrels: 1, accent: '#5b8def', bullet: { r: 1.9, color: '#2b55b8' } } },
  specter: { name: 'Specter', desc: 'Silenced and light', base: 'assault', stage: 2, from: 'carbine', damage: 20, fireMs: 82, pellets: 1, spread: 0.07, range: 720, bulletSpeed: 1700, mag: 30, reloadMs: 1200, moveMul: 1.0, auto: true, silenced: true,
    look: { length: 1.2, width: 0.9, barrels: 1, accent: '#8e4ec6', bullet: { r: 1.5, color: '#5a2d85' } } },

  sniper: { name: 'Bolt-action', desc: 'One shot, one kill', base: 'sniper', stage: 0, from: null, damage: 100, fireMs: 1300, pellets: 1, spread: 0.01, range: 1400, bulletSpeed: 2600, mag: 5, reloadMs: 2000, moveMul: 0.9, auto: false, look: BASE_LOOK },
  longshot: { name: 'Longshot', desc: 'Heavier rounds, farther, faster', base: 'sniper', stage: 1, from: 'sniper', damage: 150, fireMs: 1850, pellets: 1, spread: 0.008, range: 1600, bulletSpeed: 3200, mag: 5, reloadMs: 2100, moveMul: 0.89, auto: false,
    look: { length: 1.2, width: 1.05, barrels: 1, accent: '#c8553d', bullet: { r: 2.2, color: '#7a2e1f' } } },
  semiAuto: { name: 'Semi-auto Rifle', desc: 'Fast follow-up shots', base: 'sniper', stage: 1, from: 'sniper', damage: 62, fireMs: 470, pellets: 1, spread: 0.015, range: 1300, bulletSpeed: 2500, mag: 10, reloadMs: 1900, moveMul: 0.91, auto: false,
    look: { length: 1, width: 1.1, barrels: 1, accent: '#3fa7b5', bullet: { r: 1.8, color: '#1f5560' } } },
  piercer: { name: 'Piercer', desc: 'Rounds pass through three bodies', base: 'sniper', stage: 2, from: 'longshot', damage: 150, fireMs: 1450, pellets: 1, spread: 0.006, range: 1800, bulletSpeed: 3600, mag: 5, reloadMs: 2100, moveMul: 0.89, auto: false, penetrate: 3,
    look: { length: 1.45, width: 1, barrels: 1, accent: '#e5484d', bullet: { r: 2.4, color: '#ff3b30' } } },
  artillery: { name: 'Artillery', desc: 'Slow shells with a wide blast', base: 'sniper', stage: 2, from: 'longshot', damage: 110, fireMs: 1300, pellets: 1, spread: 0.01, range: 1500, bulletSpeed: 1800, mag: 4, reloadMs: 2300, moveMul: 0.86, auto: false, blast: { radius: 130, damage: 90 },
    look: { length: 1.3, width: 1.45, barrels: 1, accent: '#f76b15', bullet: { r: 4, color: '#e0661a' } } },
  repeater: { name: 'Repeater', desc: 'Rapid precision fire', base: 'sniper', stage: 2, from: 'semiAuto', damage: 60, fireMs: 340, pellets: 1, spread: 0.015, range: 1300, bulletSpeed: 2600, mag: 12, reloadMs: 1800, moveMul: 0.92, auto: false,
    look: { length: 1.05, width: 1.2, barrels: 1, accent: '#5b8def', bullet: { r: 1.9, color: '#2b55b8' } } },
  ghost: { name: 'Ghost', desc: 'Silenced marksman rifle', base: 'sniper', stage: 2, from: 'semiAuto', damage: 75, fireMs: 480, pellets: 1, spread: 0.012, range: 1300, bulletSpeed: 2600, mag: 10, reloadMs: 1900, moveMul: 0.94, auto: false, silenced: true,
    look: { length: 1.25, width: 0.95, barrels: 1, accent: '#8e4ec6', bullet: { r: 1.6, color: '#5a2d85' } } },

  lmg: { name: 'LMG', desc: 'Sustained suppressing fire', base: 'lmg', stage: 0, from: null, damage: 14, fireMs: 90, pellets: 1, spread: 0.14, range: 750, bulletSpeed: 1600, mag: 75, reloadMs: 3200, moveMul: 0.82, auto: true, look: BASE_LOOK },
  heavyLmg: { name: 'Heavy LMG', desc: 'Harder hits, longer reach, slower feet', base: 'lmg', stage: 1, from: 'lmg', damage: 19, fireMs: 92, pellets: 1, spread: 0.12, range: 850, bulletSpeed: 1700, mag: 75, reloadMs: 3300, moveMul: 0.78, auto: true,
    look: { length: 1.15, width: 1.2, barrels: 1, accent: '#c8553d', bullet: { r: 2.1, color: '#7a2e1f' } } },
  lightMg: { name: 'Light MG', desc: 'Lighter build, quicker fire', base: 'lmg', stage: 1, from: 'lmg', damage: 13, fireMs: 66, pellets: 1, spread: 0.14, range: 720, bulletSpeed: 1600, mag: 70, reloadMs: 2800, moveMul: 0.9, auto: true,
    look: { length: 0.95, width: 0.95, barrels: 1, accent: '#3fa7b5', bullet: { r: 1.6, color: '#1f5560' } } },
  juggernaut: { name: 'Juggernaut', desc: 'Huge belt, rounds pierce one body', base: 'lmg', stage: 2, from: 'heavyLmg', damage: 25, fireMs: 84, pellets: 1, spread: 0.11, range: 900, bulletSpeed: 1800, mag: 150, reloadMs: 4000, moveMul: 0.75, auto: true, penetrate: 1,
    look: { length: 1.3, width: 1.45, barrels: 1, accent: '#e5484d', bullet: { r: 2.3, color: '#b3261e' } } },
  siegeGun: { name: 'Siege Gun', desc: 'Every round bursts', base: 'lmg', stage: 2, from: 'heavyLmg', damage: 18, fireMs: 100, pellets: 1, spread: 0.12, range: 800, bulletSpeed: 1500, mag: 60, reloadMs: 3600, moveMul: 0.77, auto: true, blast: { radius: 50, damage: 10 },
    look: { length: 1.25, width: 1.5, barrels: 1, accent: '#f76b15', bullet: { r: 2.6, color: '#e0661a' } } },
  minigun: { name: 'Minigun', desc: 'Torrent of lead, long reload', base: 'lmg', stage: 2, from: 'lightMg', damage: 8, fireMs: 33, pellets: 1, spread: 0.15, range: 700, bulletSpeed: 1600, mag: 200, reloadMs: 4500, moveMul: 0.84, auto: true,
    look: { length: 1.2, width: 1.25, barrels: 3, accent: '#f5c400', bullet: { r: 1.6, color: '#a88600' } } },
  twinMg: { name: 'Twin MG', desc: 'Paired barrels, double rounds', base: 'lmg', stage: 2, from: 'lightMg', damage: 12, fireMs: 75, pellets: 2, spread: 0.15, range: 720, bulletSpeed: 1600, mag: 80, reloadMs: 3000, moveMul: 0.88, auto: true,
    look: { length: 1.05, width: 1.3, barrels: 2, accent: '#5b8def', bullet: { r: 1.7, color: '#2b55b8' } } },
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
  1: ['bipod', 'optics', 'thermal', 'ghillie', 'piercing', 'extended', 'grip', 'silencer', 'lightweight', 'longRange'],
  2: ['shield', 'thickSkin', 'firstAid'],
  3: ['grenade', 'fragGrenade', 'gasGrenade', 'landMine', 'knife', 'engineer', 'dash'],
} as const;
export type Tier = keyof typeof PERK_TIERS;
export type PerkId = (typeof PERK_TIERS)[Tier][number];
export type AbilityId = (typeof PERK_TIERS)[3][number];

export const PERK_INFO: Record<PerkId, { name: string; desc: string }> = {
  bipod: { name: 'Bipod', desc: 'Half spread while standing still' },
  optics: { name: 'Optics', desc: 'See further' },
  thermal: { name: 'Thermal', desc: 'Reveal hidden enemies' },
  ghillie: { name: 'Ghillie suit', desc: 'Nearly invisible while still' },
  piercing: { name: 'AP rounds', desc: 'Bullets ignore armor' },
  extended: { name: 'Extended mag', desc: '+50% magazine' },
  grip: { name: 'Grip', desc: '-40% spread' },
  silencer: { name: 'Silencer', desc: 'Firing does not reveal you on the minimap' },
  lightweight: { name: 'Lightweight', desc: '+10% move speed' },
  longRange: { name: 'Long range', desc: '+40% bullet range' },
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

export const pickOptions = (pick: Pick, gun: GunId): readonly PickOption[] => (pick.k === 'perk' ? PERK_TIERS[pick.tier] : EVOLUTIONS[gun]);

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

export type Burst = Blast & { building: number };
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
  walker: { name: 'Walker', many: 'walkers', hp: 50, speed: 120, radius: 16, damage: 8, attackMs: 900, buildingDamageMul: 0.5, aggroPx: 120, score: 10, scrap: 2, plate: 0, burst: null, pack: 1 },
  brute: { name: 'Brute', many: 'brutes', hp: 400, speed: 75, radius: 24, damage: 25, attackMs: 1400, buildingDamageMul: 1, aggroPx: 0, score: 60, scrap: 10, plate: 0, burst: null, pack: 1 },
  runner: { name: 'Runner', many: 'runners', hp: 30, speed: 210, radius: 12, damage: 6, attackMs: 600, buildingDamageMul: 0.25, aggroPx: 360, score: 8, scrap: 1, plate: 0, burst: null, pack: 5 },
  plated: { name: 'Plated', many: 'plated', hp: 200, speed: 95, radius: 19, damage: 12, attackMs: 1000, buildingDamageMul: 0.6, aggroPx: 120, score: 30, scrap: 5, plate: 20, burst: null, pack: 1 },
  bloater: {
    name: 'Bloater', many: 'bloaters', hp: 120, speed: 80, radius: 22, damage: 10, attackMs: 1200, buildingDamageMul: 1, aggroPx: 0, score: 25, scrap: 4, plate: 0,
    burst: { radius: 110, damage: 70, building: 600 }, pack: 1,
  },
  colossus: { name: 'Colossus', many: 'a colossus', hp: 6000, speed: 55, radius: 40, damage: 80, attackMs: 1600, buildingDamageMul: 2.5, aggroPx: 0, score: 500, scrap: 80, plate: 15, burst: null, pack: 1 },
};

export const SIDES = ['north', 'east', 'south', 'west'] as const;
export type Side = (typeof SIDES)[number];
/**
 * One row per night, the last the Tide: how many of each kind come for a squad of four bots, and the sides they walk in from.
 * A human counts as one and a half bots, and every kind on the row sends at least one.
 */
export type NightDef = { name?: string; horde: Partial<Record<ZombieKind, number>>; from: readonly Side[] };
export const NIGHTS: readonly NightDef[] = [
  { horde: { walker: 20 }, from: ['north'] },
  { horde: { walker: 26, runner: 5 }, from: ['east'] },
  { horde: { walker: 28, runner: 10, brute: 2 }, from: ['south', 'west'] },
  { horde: { walker: 30, plated: 6, brute: 3 }, from: ['north', 'east'] },
  { name: 'The Colossus', horde: { walker: 34, runner: 10, brute: 3, colossus: 1 }, from: ['west'] },
  { horde: { walker: 38, bloater: 6, plated: 6 }, from: ['east', 'south'] },
  { horde: { walker: 42, runner: 20, bloater: 6, brute: 4 }, from: ['north', 'south', 'west'] },
  { horde: { walker: 46, plated: 12, bloater: 8, brute: 5 }, from: ['north', 'east', 'west'] },
  { horde: { walker: 52, runner: 20, plated: 10, bloater: 8, brute: 6 }, from: SIDES },
  { name: 'The Tide', horde: { walker: 64, runner: 25, plated: 14, bloater: 10, brute: 8, colossus: 1 }, from: SIDES },
];
export const nightOf = (night: number): NightDef => NIGHTS[Math.min(night, NIGHTS.length) - 1]!;

export const TURRET_KINDS = ['sentry', 'cannon', 'scatter', 'mortar'] as const;
export type TurretKind = (typeof TURRET_KINDS)[number];
export const BUILDING_KINDS = ['wall', ...TURRET_KINDS] as const;
export type BuildingKind = (typeof BUILDING_KINDS)[number];
export const byTurret = <T>(f: (kind: TurretKind) => T) => Object.fromEntries(TURRET_KINDS.map((k) => [k, f(k)])) as Record<TurretKind, T>;

/**
 * A turret holds `ammo` rounds and fires `pellets` of `damage` each every `fireMs` at the nearest zombie of the kind it `prefers` in `range`, else the nearest of any kind.
 * Its rounds leave the barrel `muzzle` px from the cell's center; a refill costs `scrapPerRound`.
 * A `lobbed` round flies over everything to where its target stood and bursts there, so a lobbing turret needs no line of sight.
 */
export type TurretDef = {
  prefers: ZombieKind; range: number; fireMs: number; damage: number; pellets: number; bulletSpeed: number; spread: number; ammo: number; scrapPerRound: number;
  muzzle: number; bullet: { r: number; color: string }; lobbed: Blast | null;
};
type BuildingDef = { name: string; cost: number; hp: number };
export const BUILDINGS: { wall: BuildingDef & { turret: null } } & Record<TurretKind, BuildingDef & { turret: TurretDef }> = {
  wall: { name: 'Wall', cost: 20, hp: 2000, turret: null },
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

export const ZOM = {
  /** One grid cell in px; a building fills one cell and the horde's flow field runs on the same grid. */
  cell: 50,
  coreHp: 4000,
  /** Who shelters in the core: one is lost for each `coreHp / survivors` it falls below whole, and each one left pays `scrapPerSurvivor` at dawn. */
  survivors: 50,
  scrapPerSurvivor: 1,
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
  /** A squad of four bots meets each night's horde as listed; a human, with triple health and better aim than a bot, counts for one and a half. */
  hordeShare: (squad: { humans: number; bots: number }) => (squad.bots + 1.5 * squad.humans) / 4,
  spawnGapMs: (night: number) => Math.max(150, 900 - 50 * night),
  nightMul: (night: number) => ({ hp: 1 + 0.1 * (night - 1), damage: 1 + 0.1 * (night - 1) }),
  restartMs: 20_000,
} as const;
