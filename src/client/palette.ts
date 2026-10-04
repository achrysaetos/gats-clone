import { COLORS, type ArmorId } from '../shared/defs.ts';
import type { Team } from '../shared/protocol.ts';

/** One outline color for every world object, so bodies, walls, crates and grenades read as one drawn set. */
export const INK = '#1b1d22';

export const PALETTE = {
  outside: '#2b2f36',
  letterbox: '#16181d',
  floor: '#e2ddd1',
  seam: '#cbc4b4',
  speck: '#8f8676',
  curb: '#4d5360',
  curbTop: '#6a7180',
  wallTop: '#5b6272',
  wallFace: '#3a404c',
  wallEdge: '#7b8394',
  builtTop: '#b48a52',
  builtFace: '#81602f',
  builtEdge: '#d2ab73',
  crate: '#c08a4c',
  crateDark: '#8a5a28',
  crateLight: '#dcab6c',
  shadow: 'rgba(28, 22, 12, 0.22)',
  bullet: '#25211c',
  ownBullet: '#d48a00',
  text: '#1d2128',
  halo: 'rgba(255, 255, 255, 0.75)',
  hpGood: '#30a46c',
  hpBad: '#e5484d',
  armor: '#5b8def',
  steelLight: '#a5adbb',
  shield: 'rgba(110, 180, 255, 0.9)',
  gas: 'rgba(132, 186, 64, 0.16)',
  gasEdge: 'rgba(92, 140, 36, 0.6)',
  neutral: '#8b8f98',
  gold: '#ffd34d',
} as const;

export const TEAM_COLORS: Record<Exclude<Team, null>, string> = { red: COLORS.red, blue: COLORS.blue };

/** Armor band width inside the body outline, in world units: the heavier the armor, the thicker the band. */
export const ARMOR_BAND: Record<ArmorId, number> = { none: 0, light: 4.5, medium: 7, heavy: 9.5 };

export function shade(hex: string, f: number): string {
  const v = parseInt(hex.slice(1), 16);
  const c = (s: number) => Math.round(Math.min(255, Math.max(0, ((v >> s) & 255) * f)));
  return `rgb(${c(16)}, ${c(8)}, ${c(0)})`;
}

export const teamColor = (t: Team) => (t ? TEAM_COLORS[t] : PALETTE.neutral);
