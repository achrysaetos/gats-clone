import type { Rect } from './movement.ts';

/**
 * A train that runs down a lane on a fixed timetable. Where it is follows from the server clock alone, so the sim and every
 * client work it out the same way with nothing sent; `jitterMs` varies each run's arrival by a hash of the run's number, so
 * players can't set a watch by it. `axis` is the way the lane runs and `dir` which end the train comes in from.
 */
export type TrainDef = {
  lane: Rect;
  axis: 'x' | 'y';
  dir: 1 | -1;
  everyMs: number;
  jitterMs: number;
  /** How long the signals flash and the horn sounds before the nose enters. */
  warnMs: number;
  /** Game units a second. */
  speed: number;
  length: number;
};

export type TrainState =
  | { k: 'clear'; nextAt: number }
  | { k: 'warn'; arrivesAt: number }
  | { k: 'pass'; body: Rect; arrivedAt: number };

function hash(n: number): number {
  let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export const arrivalOf = (t: TrainDef, run: number): number => run * t.everyMs + Math.floor(hash(run) * t.jitterMs);
export const passMs = (t: TrainDef): number => (((t.axis === 'x' ? t.lane.w : t.lane.h) + t.length) / t.speed) * 1000;

/** The timetable must leave each run room to warn and pass before the next one can start warning. */
export function timetableProblem(t: TrainDef): string | null {
  if (t.speed <= 0 || t.length <= 0) return 'the train needs a speed and a length';
  if (t.jitterMs + t.warnMs + passMs(t) >= t.everyMs) return `a run (${Math.round(t.warnMs + passMs(t))}ms with up to ${t.jitterMs}ms late) does not fit in ${t.everyMs}ms`;
  return null;
}

/** Where the train is at server time `now`. */
export function trainAt(t: TrainDef, now: number): TrainState {
  const run = Math.floor(now / t.everyMs);
  for (const k of [run - 1, run]) {
    const at = arrivalOf(t, k);
    if (now >= at && now < at + passMs(t)) return { k: 'pass', body: bodyAt(t, ((now - at) / 1000) * t.speed), arrivedAt: at };
  }
  for (const k of [run, run + 1]) {
    const at = arrivalOf(t, k);
    if (now < at) return now >= at - t.warnMs ? { k: 'warn', arrivesAt: at } : { k: 'clear', nextAt: at };
  }
  return { k: 'clear', nextAt: arrivalOf(t, run + 2) };
}

/** The train's body once its nose has come `d` into the lane, cut to the lane. */
function bodyAt(t: TrainDef, d: number): Rect {
  const { lane } = t;
  const span = t.axis === 'x' ? lane.w : lane.h;
  const from = Math.max(0, d - t.length), to = Math.min(span, d);
  const a = t.dir === 1 ? from : span - to, len = to - from;
  return t.axis === 'x' ? { x: lane.x + a, y: lane.y, w: len, h: lane.h } : { x: lane.x, y: lane.y + a, w: lane.w, h: len };
}
