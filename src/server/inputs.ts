import type { InputState } from '../shared/protocol.ts';

/** A client input waiting for the tick that applies it, with the rewind its shots were allowed when it arrived. */
export type QueuedInput = { seq: number; input: InputState; viewAt: number | null; rewindCapMs: number };

/**
 * How many inputs a client may have waiting. Each tick applies one, so a client that sends faster than the tick rate,
 * or a burst after a stall, cannot speed its player up; past the cap the two oldest merge, which bounds the delay a
 * backlog adds to this many ticks.
 */
export const INPUT_QUEUE_CAP = 3;

/** The newer input, keeping the older one's held buttons so a press that lived only in the older one still lands. */
function merge(older: QueuedInput, newer: QueuedInput): QueuedInput {
  const a = older.input, b = newer.input;
  return {
    ...newer,
    input: { ...b, fire: a.fire || b.fire, reload: a.reload || b.reload, ability: a.ability || b.ability, use: a.use || b.use, shots: Math.max(a.shots, b.shots) },
  };
}

/** Queues an input behind the ones still waiting. One no newer than the last queued is dropped. */
export function enqueueInput(queue: QueuedInput[], next: QueuedInput): void {
  const last = queue.at(-1);
  if (last && next.seq <= last.seq) return;
  queue.push(next);
  if (queue.length > INPUT_QUEUE_CAP) queue.splice(0, 2, merge(queue[0]!, queue[1]!));
}
