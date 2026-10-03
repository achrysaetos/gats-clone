import { ARMORS, ARMOR_IDS, LEVEL_SCORES, type ArmorId } from '../shared/defs.ts';
import type { GameEvent } from '../shared/protocol.ts';

export type LevelProgress = { level: number; frac: number; nextAt: number | null };

export function levelProgress(score: number): LevelProgress {
  let i = 0;
  while (i + 1 < LEVEL_SCORES.length && score >= LEVEL_SCORES[i + 1]!) i++;
  const from = LEVEL_SCORES[i]!;
  const to = LEVEL_SCORES[i + 1];
  if (to === undefined) return { level: i + 1, frac: 1, nextAt: null };
  return { level: i + 1, frac: (score - from) / (to - from), nextAt: to };
}

/** Snapshots carry armor points, not the tier; recover it from the max so the ring width tracks the pick. */
export function armorTier(maxArmor: number): ArmorId {
  let best: ArmorId = 'none';
  for (const id of ARMOR_IDS) if (ARMORS[id].points <= maxArmor) best = id;
  return best;
}

export function killerOf(events: readonly GameEvent[], victim: string): string | null {
  for (const ev of events) if (ev.e === 'kill' && ev.victim === victim) return ev.killer;
  return null;
}

export const seconds = (ms: number) => Math.max(0, Math.ceil(ms / 1000));
