import { COLORS, type ArmorId, type ZombieKind } from '../shared/defs.ts';
import type { Team } from '../shared/protocol.ts';

export const INK = '#1c1f26';

export const PALETTE = {
  outside: '#959ba5',
  letterbox: '#16181d',
  floor: '#e3e5e9',
  gridMinor: 'rgba(60, 70, 90, 0.07)',
  gridMajor: 'rgba(60, 70, 90, 0.14)',
  /** The cast shadow's darkness where it is solid; the blur feathers its edge. */
  shadow: 'rgba(20, 24, 32, 0.22)',
  contact: 'rgba(20, 24, 32, 0.34)',
  tracer: '#ffc43a',
  tracerCore: '#ffe58a',
  tracerHead: '#fffbe6',
  ownTracer: '#ffd75e',
  brass: '#c9962f',
  brassLight: '#f0cd6a',
  label: '#2a2e36',
  hpGood: '#35c46a',
  hpBad: '#e5484d',
  armor: '#5b8def',
  steel: '#9aa3b2',
  steelDark: '#5d6573',
  shield: 'rgba(110, 180, 255, 0.9)',
  selfRing: 'rgba(64, 156, 255, 0.6)',
  gas: 'rgba(132, 186, 64, 0.16)',
  gasEdge: 'rgba(92, 140, 36, 0.6)',
  neutral: '#7a808b',
  gold: '#ffd34d',
  hunted: '#ff3b30',
  rival: '#f2555a',
} as const;

/** Zombies' night: the world darkens toward this cool blue while the HUD stays as it is. */
export const NIGHT = { tint: '#3a4a78', strength: 0.55, label: '#e6ebf5' } as const;

export const TEAM_COLORS: Record<Exclude<Team, null>, string> = { red: COLORS.red, blue: COLORS.blue };

export const ARMOR_BAND: Record<ArmorId, number> = { none: 0, light: 3.5, medium: 5, heavy: 7 };

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

export const teamColor = (t: Team) => (t ? TEAM_COLORS[t] : PALETTE.neutral);

export const ZOMBIE_LOOK: Record<ZombieKind, { body: string; arm: string; eye: string }> = {
  walker: { body: '#8fb35a', arm: '#6f9440', eye: '#1b1d22' },
  brute: { body: '#8a74a3', arm: '#5e4d72', eye: '#ff5a3c' },
};
