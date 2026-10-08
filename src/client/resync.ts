import { newestSnap, type SnapBuffer } from './interp.ts';
import { NO_PREDICTION, type Prediction } from './predict.ts';

/**
 * Coming back to a tab that was hidden. A hidden tab's timers run at 1 Hz or less and its frames stop, so the clocks the
 * netcode keeps (the server-clock estimate, the snapshot buffer, the prediction's pending inputs) describe a moment long gone.
 * This is the pure half: main.ts calls it on `visibilitychange` and caps every frame step with `frameStep`.
 */

/** The longest frame step any smoothing, decay or animation is advanced by: a frame gap past this is a stall, not time passing. */
export const MAX_FRAME_STEP_MS = 100;

/** The ms since the last frame, never negative and never more than `MAX_FRAME_STEP_MS` (a suspended rAF must not fast-forward things). */
export const frameStep = (now: number, last: number): number => (last > 0 ? Math.min(MAX_FRAME_STEP_MS, Math.max(0, now - last)) : 0);

/**
 * What to keep when the tab returns: only the newest authoritative snapshot, with the server-clock estimate forgotten so the
 * next snapshot sets it afresh, a prediction with no pending inputs or smoothing left (the next snapshot reconciles it), and
 * none of the effects and other players' shots that piled up unseen while no frame was drawn (every one would otherwise be
 * released on the first frame back, as a burst of particles, decals, corpses and sounds).
 */
export function resyncNet(s: { snaps: SnapBuffer; predict: Prediction; pendingFx: readonly unknown[]; pendingShots: readonly unknown[] }) {
  const newest = newestSnap(s.snaps);
  return { snaps: { snaps: newest ? [newest] : [], serverClockOffset: null } as SnapBuffer, predict: NO_PREDICTION, pendingFx: [] as never[], pendingShots: [] as never[] };
}
