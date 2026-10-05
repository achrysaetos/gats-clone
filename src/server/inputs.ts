import { WORLD } from '../shared/defs.ts';
import type { InputState } from '../shared/protocol.ts';
import { MAX_REWIND_MS } from '../shared/sim/combat.ts';

const TICK_MS = 1000 / WORLD.tickHz;

export type QueuedInput = { seq: number; input: InputState; viewAt: number | null; rewindCapMs: number; arrivedTick: number };

export type InputQueue = { waiting: QueuedInput[]; fewestLeft: number; windowTicks: number };

export const INPUT_QUEUE_CAP = 8;
export const DRAIN_WINDOW_TICKS = 30;

export const newInputQueue = (): InputQueue => ({ waiting: [], fewestLeft: Infinity, windowTicks: 0 });

function merge(older: QueuedInput, newer: QueuedInput): QueuedInput {
  const a = older.input, b = newer.input;
  return {
    ...newer,
    input: { ...b, fire: a.fire || b.fire, reload: a.reload || b.reload, ability: a.ability || b.ability, use: a.use || b.use, shots: Math.max(a.shots, b.shots) },
  };
}

const mergeOldest = (q: InputQueue) => { q.waiting.splice(0, 2, merge(q.waiting[0]!, q.waiting[1]!)); };

export function enqueueInput(q: InputQueue, next: QueuedInput): void {
  q.waiting.push(next);
  if (q.waiting.length > INPUT_QUEUE_CAP) mergeOldest(q);
}

/**
 * The input for this tick, if one is waiting. A backlog that never ran dry over a whole window is delay jitter no longer
 * needs, so the two oldest merge, but only while neither holds the trigger, since merging a held one shortens the hold.
 * The rewind an input may claim grows by the time it waited here, which its round trip did not include.
 */
export function takeInput(q: InputQueue, tick: number): QueuedInput | undefined {
  const next = q.waiting.shift();
  q.fewestLeft = Math.min(q.fewestLeft, q.waiting.length);
  if (++q.windowTicks >= DRAIN_WINDOW_TICKS) {
    const [a, b] = q.waiting;
    if (q.fewestLeft > 0 && a && b && !a.input.fire && !b.input.fire) mergeOldest(q);
    q.fewestLeft = Infinity;
    q.windowTicks = 0;
  }
  return next && { ...next, rewindCapMs: Math.min(MAX_REWIND_MS, next.rewindCapMs + (tick - next.arrivedTick) * TICK_MS) };
}
