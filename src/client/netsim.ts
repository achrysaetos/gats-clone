/**
 * Dev-only network shaping so feel can be measured under latency on localhost: `?lag=<one-way ms>&jitter=<ms>`.
 * Delivery order is preserved, like TCP: a jittered message never overtakes an earlier one.
 */
export function makeDelay(lagMs: number, jitterMs: number, rand: () => number = Math.random) {
  let lastAt = 0;
  return (fn: () => void) => {
    if (lagMs <= 0 && jitterMs <= 0) { fn(); return; }
    const now = performance.now();
    lastAt = Math.max(lastAt, now + lagMs + rand() * jitterMs);
    setTimeout(fn, lastAt - now);
  };
}
