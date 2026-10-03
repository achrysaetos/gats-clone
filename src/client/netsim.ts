/**
 * Dev-only network shaping so feel can be measured under latency on localhost: `?lag=<one-way ms>&jitter=<ms>`.
 * Messages leave a FIFO queue on one timer chain, so like TCP a jittered message never overtakes an earlier one;
 * separate timers would reorder them because browsers round each timeout to whole milliseconds.
 */
export function makeDelay(lagMs: number, jitterMs: number, rand: () => number = Math.random) {
  const queue: { at: number; fn: () => void }[] = [];
  let lastAt = 0;
  const drain = () => {
    while (queue.length && queue[0]!.at <= performance.now()) queue.shift()!.fn();
    if (queue.length) setTimeout(drain, queue[0]!.at - performance.now());
  };
  return (fn: () => void) => {
    if (lagMs <= 0 && jitterMs <= 0) { fn(); return; }
    lastAt = Math.max(lastAt, performance.now() + lagMs + rand() * jitterMs);
    queue.push({ at: lastAt, fn });
    if (queue.length === 1) setTimeout(drain, lastAt - performance.now());
  };
}
