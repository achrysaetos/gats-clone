import { ARMORS, ARMOR_IDS, LEVEL_SCORES, type ArmorId } from '../shared/defs.ts';
import type { GameEvent, PlayerView, Snapshot } from '../shared/protocol.ts';

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

export function killerOf(events: readonly GameEvent[], victimId: number): string | null {
  for (const ev of events) if (ev.e === 'kill' && ev.victimId === victimId) return ev.killer || null;
  return null;
}

export const feedMentions = (kill: { killerId: number | null; victimId: number }, myId: number): boolean =>
  kill.killerId === myId || kill.victimId === myId;

export const selfOf = (snap: Snapshot): PlayerView | undefined => snap.players.find((p) => p.id === snap.self.id);

/** A dead player may be missing from `players`, so fall back to the respawn timer. */
export function isDead(snap: Snapshot): boolean {
  const me = selfOf(snap);
  return me ? !me.alive : snap.self.respawnIn > 0;
}

export const seconds = (ms: number) => Math.max(0, Math.ceil(ms / 1000));
