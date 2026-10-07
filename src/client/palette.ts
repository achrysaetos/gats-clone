import { COLORS, type ZombieKind } from '../shared/defs.ts';
import type { Team } from '../shared/protocol.ts';

export const INK = '#1c1f26';

export const PALETTE = {
  outside: '#2b2e34',
  grid: 'rgba(60, 54, 44, 0.07)',
  contact: 'rgba(20, 24, 32, 0.3)',
  tracerGlow: '#ffc65a',
  tracer: '#ffe6a6',
  tracerHot: '#fffcf0',
  casing: '#5d616a',
  label: '#24272e',
  hpGood: '#35c46a',
  hpBad: '#e5484d',
  lossOnDark: '#ff8f87',
  shield: 'rgba(110, 180, 255, 0.9)',
  gas: 'rgba(132, 186, 64, 0.16)',
  gasEdge: 'rgba(92, 140, 36, 0.6)',
  neutral: '#7a808b',
  gold: '#ffd34d',
  hunted: '#ff3b30',
  rival: '#f2555a',
} as const;

export const NIGHT = { shade: '#141c3c', alpha: 0.56, label: '#e6ebf5' } as const;

export const TEAM_COLORS: Record<Exclude<Team, null>, string> = COLORS;

export function shade(hex: string, f: number): string {
  const v = parseInt(hex.slice(1), 16);
  const c = (s: number) => Math.round(Math.min(255, Math.max(0, ((v >> s) & 255) * f)));
  return `rgb(${c(16)}, ${c(8)}, ${c(0)})`;
}

/** `shade`, but as a hex colour, so the result can be shaded and tinted again. */
export function shadeHex(hex: string, f: number): string {
  const v = parseInt(hex.slice(1), 16);
  const c = (s: number) => Math.round(Math.min(255, Math.max(0, ((v >> s) & 255) * f)));
  return `#${((c(16) << 16) | (c(8) << 8) | c(0)).toString(16).padStart(6, '0')}`;
}

export function tint(hex: string, k: number): string {
  const v = parseInt(hex.slice(1), 16);
  const c = (s: number) => Math.round(((v >> s) & 255) + (255 - ((v >> s) & 255)) * k);
  return `rgb(${c(16)}, ${c(8)}, ${c(0)})`;
}

export function glow(hex: string, l: number): string {
  const v = parseInt(hex.slice(1), 16);
  const [r, g, b] = [16, 8, 0].map((s) => ((v >> s) & 255) / 255);
  const max = Math.max(r!, g!, b!), min = Math.min(r!, g!, b!), d = max - min;
  const h = d === 0 ? 0 : max === r ? ((g! - b!) / d + 6) % 6 : max === g ? (b! - r!) / d + 2 : (r! - g!) / d + 4;
  const c = (1 - Math.abs(2 * l - 1)) * 0.9;
  const ch = (n: number) => {
    const k = (n + h) % 6;
    return Math.round(255 * (l - c / 2 + c * Math.max(0, Math.min(1, Math.abs(k - 3) - 1))));
  };
  return `rgb(${ch(0)}, ${ch(4)}, ${ch(2)})`;
}

export const teamColor = (t: Team) => (t ? TEAM_COLORS[t] : PALETTE.neutral);

/**
 * `armor` thickens the ink rim, `shoulders` adds pads behind the arms, and `bar` shows a health bar over the body. `skins` and
 * `cloth` are the variants a horde draws from by zombie id (zombiekit.ts), so no two walkers are quite alike.
 */
export const ZOMBIE_LOOK: Record<ZombieKind, { body: string; arm: string; eye: string; armor: number; shoulders: boolean; bar: boolean; skins: readonly string[]; cloth: readonly string[] }> = {
  // The art bible's horde tones (docs/art/STYLE.md): sickly olive, steel and rust, so the horde belongs to the same toy
  // line. Kinds part by silhouette first; eyes glow sickly lime, lamp amber, or signal orange on the brute that comes for the core.
  walker: { body: '#8a9a5b', arm: '#6f7a4e', eye: '#cfe27a', armor: 0, shoulders: false, bar: false, skins: ['#8a9a5b', '#7f9a6c'], cloth: ['#4f5560', '#7a5a46', '#978562'] },
  brute: { body: '#7a5a46', arm: '#5e4535', eye: '#ff5a1f', armor: 0, shoulders: true, bar: true, skins: ['#7a5a46', '#6d5a52'], cloth: ['#4f5560', '#6c7356', '#a8552e'] },
  runner: { body: '#6f7a4e', arm: '#59633e', eye: '#e8f08a', armor: 0, shoulders: false, bar: false, skins: ['#7d8a56', '#6f7a4e'], cloth: ['#978562', '#a8552e', '#5c6b6e'] },
  plated: { body: '#5c6b6e', arm: '#4a5759', eye: '#ffb347', armor: 4, shoulders: false, bar: false, skins: ['#7a8a62', '#6f7a6a'], cloth: ['#6c7356', '#978562', '#7a5a46'] },
  bloater: { body: '#8a9a5b', arm: '#6f7a4e', eye: '#cfe27a', armor: 0, shoulders: false, bar: false, skins: ['#8ea05a', '#9aa66a'], cloth: ['#cfc7b3', '#978562', '#6c7356'] },
  colossus: { body: '#6a4d3c', arm: '#4f3a2d', eye: '#ffb347', armor: 3, shoulders: true, bar: true, skins: ['#6a4d3c', '#5e4a40'], cloth: ['#4f5560', '#6c7356', '#3d4450'] },
};
