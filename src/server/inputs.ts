import type { InputState } from '../shared/protocol.ts';

export type QueuedInput = { seq: number; input: InputState; viewAt: number | null; rewindCapMs: number };

export const INPUT_QUEUE_CAP = 3;

function merge(older: QueuedInput, newer: QueuedInput): QueuedInput {
  const a = older.input, b = newer.input;
  return {
    ...newer,
    input: { ...b, fire: a.fire || b.fire, reload: a.reload || b.reload, ability: a.ability || b.ability, use: a.use || b.use, shots: Math.max(a.shots, b.shots) },
  };
}

export function enqueueInput(queue: QueuedInput[], next: QueuedInput): void {
  queue.push(next);
  if (queue.length > INPUT_QUEUE_CAP) queue.splice(0, 2, merge(queue[0]!, queue[1]!));
}
