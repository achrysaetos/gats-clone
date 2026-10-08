/**
 * When the next input is due. The server applies one input a tick at exactly `WORLD.tickHz`, but `setInterval(fn, 1000 / 30)`
 * runs at 1000 / 33 = 30.3 Hz (a timer's delay is whole ms), so a client sent one input too many every 3.3 s: a held trigger
 * (which the server never drains) built a queue that delayed every input by up to eight ticks. Scheduling each input from the
 * last one's due time instead keeps the average exactly one per tick however the timer rounds or wobbles. A timer that comes
 * a whole step or more late (a hidden tab, a long frame) forgets what it missed rather than sending a burst the server would
 * only queue.
 */
export function nextInputDue(now: number, dueAt: number, stepMs: number): number {
  return now - dueAt >= stepMs ? now + stepMs : dueAt + stepMs;
}

/**
 * A move key that goes down or up sends its input at once rather than waiting up to a tick for the next one, so your soldier
 * starts and stops on the keypress. Only when the last input went out at least half a tick ago: the schedule then restarts from
 * now, so a steady stream stays one input a tick and only a burst of key changes adds a few.
 */
export const pullsInput = (now: number, lastSentAt: number, stepMs: number): boolean => now - lastSentAt >= stepMs / 2;
