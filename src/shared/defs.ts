export const WEAPON_IDS = ['pistol', 'smg', 'shotgun', 'assault', 'sniper', 'lmg'] as const;
export type WeaponId = (typeof WEAPON_IDS)[number];

export type WeaponDef = {
  name: string;
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
};

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  pistol: { name: 'Pistol', damage: 22, fireMs: 220, pellets: 1, spread: 0.04, range: 700, bulletSpeed: 1500, mag: 12, reloadMs: 1100, moveMul: 1.0, auto: false },
  smg: { name: 'SMG', damage: 13, fireMs: 75, pellets: 1, spread: 0.12, range: 550, bulletSpeed: 1400, mag: 30, reloadMs: 1300, moveMul: 0.97, auto: true },
  shotgun: { name: 'Shotgun', damage: 15, fireMs: 750, pellets: 7, spread: 0.22, range: 420, bulletSpeed: 1300, mag: 6, reloadMs: 1800, moveMul: 0.93, auto: false },
  assault: { name: 'Assault', damage: 16, fireMs: 110, pellets: 1, spread: 0.07, range: 800, bulletSpeed: 1700, mag: 30, reloadMs: 1500, moveMul: 0.92, auto: true },
  sniper: { name: 'Bolt-action', damage: 100, fireMs: 1300, pellets: 1, spread: 0.01, range: 1400, bulletSpeed: 2600, mag: 5, reloadMs: 2000, moveMul: 0.9, auto: false },
  lmg: { name: 'LMG', damage: 14, fireMs: 90, pellets: 1, spread: 0.14, range: 750, bulletSpeed: 1600, mag: 75, reloadMs: 3200, moveMul: 0.82, auto: true },
};

export const ARMOR_IDS = ['none', 'light', 'medium', 'heavy'] as const;
export type ArmorId = (typeof ARMOR_IDS)[number];
export const ARMORS: Record<ArmorId, { name: string; points: number; absorbFrac: number; speedMul: number }> = {
  none: { name: 'No armor', points: 0, absorbFrac: 0, speedMul: 1.0 },
  light: { name: 'Light', points: 30, absorbFrac: 0.5, speedMul: 0.93 },
  medium: { name: 'Medium', points: 60, absorbFrac: 0.6, speedMul: 0.86 },
  heavy: { name: 'Heavy', points: 120, absorbFrac: 0.7, speedMul: 0.79 },
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
  piercing: { name: 'Armor piercing', desc: 'Bullets ignore armor' },
  extended: { name: 'Extended mag', desc: '+50% magazine' },
  grip: { name: 'Grip', desc: '-40% spread' },
  silencer: { name: 'Silencer', desc: 'Firing does not reveal you on the minimap' },
  lightweight: { name: 'Lightweight', desc: '+10% move speed' },
  longRange: { name: 'Long range', desc: '+40% bullet range' },
  shield: { name: 'Shield', desc: 'Blocks 60% of frontal damage' },
  thickSkin: { name: 'Thick skin', desc: '+30 max health' },
  firstAid: { name: 'First aid', desc: 'Regenerate health 3x faster' },
  grenade: { name: 'Grenade', desc: 'Thrown explosive' },
  fragGrenade: { name: 'Frag grenade', desc: 'Explodes into shrapnel' },
  gasGrenade: { name: 'Gas grenade', desc: 'Lingering damage cloud' },
  landMine: { name: 'Land mine', desc: 'Hidden explosive at your feet' },
  knife: { name: 'Knife', desc: 'Lunge melee strike' },
  engineer: { name: 'Engineer', desc: 'Build a wall' },
  dash: { name: 'Dash', desc: 'Burst of speed' },
};

export const ABILITY_COOLDOWN_MS: Record<AbilityId, number> = {
  grenade: 6000, fragGrenade: 7000, gasGrenade: 8000, landMine: 9000, knife: 1500, engineer: 10000, dash: 3500,
};

export const PLAYER_KINDS = ['human', 'bot'] as const;
export type PlayerKind = (typeof PLAYER_KINDS)[number];
/** Humans carry triple health so a person outlasts the bots that fill the room. Regen scales with it, so healing takes the same time. */
export const HP_MULTIPLIER: Record<PlayerKind, number> = { human: 3, bot: 1 };

export const LEVEL_SCORES = [0, 100, 250, 450] as const;

export const MODE_IDS = ['FFA', 'TDM', 'DOM'] as const;
export type ModeId = (typeof MODE_IDS)[number];

export const WORLD = {
  size: 3000,
  playerRadius: 24,
  baseHp: 100,
  baseSpeed: 300,
  regenDelayMs: 4000,
  regenPerSec: 5,
  tickHz: 30,
  viewRadius: 900,
  crateCount: 40,
  crateHp: 40,
  crateScore: 10,
  killScore: 100,
  respawnMs: 3000,
  domWinScore: 1000,
  tdmWinScore: 50,
  roundRestartMs: 8000,
  minPlayers: 10,
} as const;
