import { WORLD } from '../shared/defs.ts';
import type { World } from '../shared/sim/world.ts';

/**
 * Bot brains were most of a room's CPU: every bot built its own snapshot and planned, aimed and pathed thirty times a second,
 * which put one FFA room with a single human at about twice the CPU of the older build, past what a shared vCPU sustains
 * (its burst runs out after a few minutes and the throttled server then lags every player). A bot no human can see, far from
 * every human and on no human's team, thinks only every `OFFSCREEN_THINK_EVERY`th tick; between thoughts it keeps pressing
 * what it last chose. Any bot a human might see, or that fights beside one, still thinks every tick, so nothing on screen changes.
 */
export const OFFSCREEN_THINK_EVERY = 3;
/** Past this far from every human a bot is off every screen: the widest view (a sniper's, on a wide screen) with room to spare. */
export const OFFSCREEN_PX = WORLD.viewRadius * 2;

export function botsDue<T>(w: World, bots: ReadonlyMap<number, T>): Map<number, T> {
  const humans = [...w.players.values()].filter((p) => p.kind === 'human');
  const due = new Map<number, T>();
  for (const [id, mem] of bots) {
    const p = w.players.get(id);
    const seen = !p || humans.some((h) => (h.team !== null && h.team === p.team) || Math.hypot(h.x - p.x, h.y - p.y) <= OFFSCREEN_PX);
    if (seen || (w.tick + id) % OFFSCREEN_THINK_EVERY === 0) due.set(id, mem);
  }
  return due;
}
