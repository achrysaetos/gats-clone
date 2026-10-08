import { COLORS, type ZombieKind } from '../shared/defs.ts';
import type { Team } from '../shared/protocol.ts';

export const INK = '#1c1f26';

export const PALETTE = {
  letterbox: '#16181d',
  tracerGlow: '#ff8526',
  tracer: '#ffad55',
  tracerHot: '#ffe9c4',
  label: '#2a2e36',
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

export const NIGHT = { label: '#e6ebf5' } as const;

export const TEAM_COLORS: Record<Exclude<Team, null>, string> = COLORS;

export function shade(hex: string, f: number): string {
  const v = parseInt(hex.slice(1), 16);
  const c = (s: number) => Math.round(Math.min(255, Math.max(0, ((v >> s) & 255) * f)));
  return `rgb(${c(16)}, ${c(8)}, ${c(0)})`;
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
 * `bar` shows a health bar over the body. `eyes` is where the painter puts the night glows, in radius units: `ahead` of
 * the centre along the facing, `apart` to each side, and `lift` north for the sprite's shear. The zombie bake fails if
 * the model's eyes drift from it.
 */
export const ZOMBIE_LOOK: Record<ZombieKind, { body: string; arm: string; eye: string; bar: boolean; eyes: { ahead: number; apart: number; lift: number } }> = {
  walker: { body: '#8fb35a', arm: '#6f9440', eye: '#1b1d22', bar: false, eyes: { ahead: 0.72, apart: 0.12, lift: 0.09 } },
  brute: { body: '#8a74a3', arm: '#5e4d72', eye: '#ff5a3c', bar: true, eyes: { ahead: 0.71, apart: 0.09, lift: 0.07 } },
  runner: { body: '#d9c27a', arm: '#a8914c', eye: '#1b1d22', bar: false, eyes: { ahead: 0.96, apart: 0.12, lift: 0.12 } },
  plated: { body: '#8d9aa8', arm: '#5f6b78', eye: '#ffd34d', bar: false, eyes: { ahead: 0.72, apart: 0.12, lift: 0.09 } },
  bloater: { body: '#e08a5c', arm: '#b8623c', eye: '#1b1d22', bar: false, eyes: { ahead: 0.42, apart: 0.11, lift: 0.08 } },
  colossus: { body: '#8c3f45', arm: '#5e2a2f', eye: '#ffd34d', bar: true, eyes: { ahead: 0.58, apart: 0.07, lift: 0.03 } },
};
