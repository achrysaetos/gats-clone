import type { GameEvent, Snapshot } from '../shared/protocol.ts';
import type { FoleyId } from './foley.ts';

/**
 * The kill top-up (`KILL_REWARD.ammo`, sim/combat.ts `refuel`): a kill puts rounds back in your mag at once, and with no cue
 * it reads as a reload with no motion or sound. The sim stays as it is; the page sees the rounds arrive on the snapshot
 * that carries your kill and answers with a quick "thumb the rounds in" beat: a patter of rounds, the support hand's tap, and a "+n" on the HUD magazine.
 */

/** How long the support hand's tap on the ammo lasts (ms). */
export const TOPUP_MS = 260;
/** At most this many rounds are voiced, one every `ROUND_GAP_MS`. */
export const TOPUP_VOICED = 4;
export const ROUND_GAP_MS = 62;

/**
 * The rounds the kill in `snap` put back in your mag, or 0. Needs your own kill in the snapshot's events, you alive and not reloading
 * on either side of it (a kill mid-reload refuels nothing). Your shots in the same snapshot are added back so a kill with the last round still counts.
 */
export function topupOf(prev: Snapshot | null | undefined, snap: Snapshot, myId: number): number {
  if (!prev || !snap.self.alive || !prev.self.alive || prev.self.reloading || snap.self.reloading) return 0;
  const killed = snap.events.some((e: GameEvent) => e.e === 'kill' && e.killerId === myId);
  if (!killed) return 0;
  const fired = snap.events.filter((e: GameEvent) => e.e === 'shot' && e.owner === myId).length;
  return Math.max(0, snap.self.ammo - Math.max(0, prev.self.ammo - fired));
}

export type TopupCue = { id: FoleyId; gain: number; pitch: number; delayMs: number };

/** The sounds of `n` rounds thumbed in: one click per round (up to `TOPUP_VOICED`), the pitch walking up a hair, the last one a touch firmer. */
export function topupCues(n: number): TopupCue[] {
  const voiced = Math.max(0, Math.min(TOPUP_VOICED, n));
  return Array.from({ length: voiced }, (_, i) => ({ id: 'foley:round' as const, gain: i === voiced - 1 ? 1 : 0.8, pitch: 1 + 0.04 * i, delayMs: i * ROUND_GAP_MS }));
}
