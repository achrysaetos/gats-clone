import { COLORS, type ArmorId, type ZombieKind } from '../shared/defs.ts';
import type { Team } from '../shared/protocol.ts';

export const INK = '#1c1f26';

export const PALETTE = {
  outside: '#c3c6cc',
  letterbox: '#16181d',
  grid: 'rgba(70, 74, 90, 0.1)',
  contact: 'rgba(20, 24, 32, 0.3)',
  tracerGlow: '#ffc65a',
  tracer: '#ffe6a6',
  tracerHot: '#fffcf0',
  casing: '#5d616a',
  label: '#2a2e36',
  hpGood: '#35c46a',
  hpBad: '#e5484d',
  armor: '#5b8def',
  shield: 'rgba(110, 180, 255, 0.9)',
  gas: 'rgba(132, 186, 64, 0.16)',
  gasEdge: 'rgba(92, 140, 36, 0.6)',
  neutral: '#7a808b',
  gold: '#ffd34d',
  hunted: '#ff3b30',
  rival: '#f2555a',
} as const;

/** Zombies' night: the world darkens toward this cool blue while the HUD stays as it is. */
export const NIGHT = { shade: '#141c3c', alpha: 0.56, label: '#e6ebf5' } as const;

export const TEAM_COLORS: Record<Exclude<Team, null>, string> = { red: COLORS.red, blue: COLORS.blue };

/** Armor thickens a body's dark rim by this much. */
export const ARMOR_RIM: Record<ArmorId, number> = { none: 0, light: 0.8, medium: 1.6, heavy: 2.4 };

export function shade(hex: string, f: number): string {
  const v = parseInt(hex.slice(1), 16);
  const c = (s: number) => Math.round(Math.min(255, Math.max(0, ((v >> s) & 255) * f)));
  return `rgb(${c(16)}, ${c(8)}, ${c(0)})`;
}

/** Mixes `hex` toward white by `k` (0 keeps it, 1 is white). */
export function tint(hex: string, k: number): string {
  const v = parseInt(hex.slice(1), 16);
  const c = (s: number) => Math.round(((v >> s) & 255) + (255 - ((v >> s) & 255)) * k);
  return `rgb(${c(16)}, ${c(8)}, ${c(0)})`;
}

/** `hex`'s hue at full saturation and lightness `l` (0..1), as rgb: a dark ink hue made to glow. */
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

export const ZOMBIE_LOOK: Record<ZombieKind, { body: string; arm: string; eye: string }> = {
  walker: { body: '#8fb35a', arm: '#6f9440', eye: '#1b1d22' },
  brute: { body: '#8a74a3', arm: '#5e4d72', eye: '#ff5a3c' },
};
