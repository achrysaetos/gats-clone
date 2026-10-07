/**
 * The pure half of the post-processing pass: which look to apply for a context, and whether to run the shaders at all.
 * No DOM or GL in here, so the decisions are unit-tested; postfx.ts does the drawing.
 */

export type Vec3 = readonly [number, number, number];

export type Grade = {
  /** Colour lift: raises the blacks toward a tint (cool shadows). Tiny values. */
  lift: Vec3;
  /** Per-channel gain: the highlights' tint. */
  gain: Vec3;
  /** Midtone gamma (above 1 brightens). */
  gamma: number;
  /** 1 is unchanged, below desaturates. */
  sat: number;
  /** Luminance above which a pixel blooms. The bone floor sits near 0.86, so day stays above it. */
  bloomThreshold: number;
  bloomStrength: number;
  /** Film grain amplitude in 0..1 colour. */
  grain: number;
};

export type Context = { night: number; storm: boolean };

/** Soft overcast: warm highlights, cool shadows, a hair less saturated, bloom only on near-white light. */
export const DAY: Grade = { lift: [-0.004, 0.0, 0.014], gain: [1.03, 1.005, 0.965], gamma: 1.0, sat: 0.97, bloomThreshold: 0.9, bloomStrength: 0.42, grain: 0.011 };
/** Zombies night: deep steel shadows, amber lights kept warm and rich, and lamps that really glow. */
export const NIGHT: Grade = { lift: [0.0, 0.006, 0.026], gain: [1.04, 1.0, 0.97], gamma: 1.04, sat: 1.06, bloomThreshold: 0.84, bloomStrength: 0.85, grain: 0.02 };
/** Last Squad storm: a touch drained and cold, nothing else. */
export const STORM: Grade = { lift: [0.0, 0.006, 0.014], gain: [0.985, 1.0, 1.005], gamma: 1.0, sat: 0.82, bloomThreshold: 0.88, bloomStrength: 0.38, grain: 0.014 };

const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const mix3 = (a: Vec3, b: Vec3, t: number): Vec3 => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];

function blend(a: Grade, b: Grade, t: number): Grade {
  return {
    lift: mix3(a.lift, b.lift, t), gain: mix3(a.gain, b.gain, t), gamma: mix(a.gamma, b.gamma, t), sat: mix(a.sat, b.sat, t),
    bloomThreshold: mix(a.bloomThreshold, b.bloomThreshold, t), bloomStrength: mix(a.bloomStrength, b.bloomStrength, t), grain: mix(a.grain, b.grain, t),
  };
}

/** The grade for a moment: `night` is the 0..1 dusk fade the renderer already eases, so the grade follows it with no pop. */
export function gradeFor({ night, storm }: Context): Grade {
  const t = Math.min(1, Math.max(0, night));
  return blend(storm ? STORM : DAY, NIGHT, t);
}

export type FxMode = 'off' | 'calm' | 'full';

export type Env = {
  search: string;
  reducedMotion: boolean;
  saveData: boolean;
  deviceMemory?: number;
  /** The unmasked GL renderer string, if the browser would tell us. */
  renderer?: string;
  glOk: boolean;
};

export const SOFTWARE_GL = /swiftshader|llvmpipe|softpipe|software|basic render/i;

/**
 * Whether and how to run the shaders. `?nofx` always wins; `?fx` forces them on (even over a software renderer, which is
 * otherwise skipped because the plain 2D path is cheaper than a CPU-emulated GPU). Reduced motion keeps the grade and
 * bloom but drops grain animation and the hit pulse ('calm').
 */
export function decideFx(env: Env): { mode: FxMode; reason: string } {
  const q = new URLSearchParams(env.search);
  if (q.has('nofx')) return { mode: 'off', reason: 'nofx' };
  if (!env.glOk) return { mode: 'off', reason: 'no webgl' };
  const forced = q.has('fx');
  if (!forced) {
    if (env.renderer && SOFTWARE_GL.test(env.renderer)) return { mode: 'off', reason: 'software renderer' };
    if (env.saveData) return { mode: 'off', reason: 'save-data' };
    if (env.deviceMemory !== undefined && env.deviceMemory <= 2) return { mode: 'off', reason: 'low memory' };
  }
  return { mode: env.reducedMotion ? 'calm' : 'full', reason: forced ? 'forced' : 'ok' };
}

/** A running average of the CPU cost of the pass; trips when the path is clearly slower than the plain canvas would be. */
export function watchdog(limitMs = 5, frames = 90) {
  let n = 0, sum = 0;
  return (ms: number): boolean => {
    n++; sum += ms;
    if (n < frames) return false;
    const slow = sum / n > limitMs;
    n = 0; sum = 0;
    return slow;
  };
}

/** Chromatic pulse: starts at the given strength (0..1) and decays exponentially; strongest hit wins, never stacks past 1. */
export const PULSE_HALF_LIFE_MS = 110;
export function addPulse(current: number, strength: number): number { return Math.min(1, Math.max(current, strength)); }
export function decayPulse(current: number, dtMs: number): number {
  const next = current * 0.5 ** (Math.max(0, dtMs) / PULSE_HALF_LIFE_MS);
  return next < 0.004 ? 0 : next;
}

/** Vignette edge reach in screen fractions: the old gradient strips reached 26% of the view or 320 / 230 css px, whichever is less. */
export function vignetteReach(cssW: number, cssH: number): [number, number] {
  return [Math.min(0.26, 320 / cssW), Math.min(0.26, 230 / cssH)];
}

/**
 * Steps the lighting quality down when lit frames arrive slowly. Feed it each lit frame's interval; every `frames` frames it
 * looks at the average and, over `limitMs`, returns the next tier (cheaper), or -1 once there is no cheaper tier left.
 * Otherwise returns the tier it was given. It never steps back up, so quality cannot flap.
 */
export function tierGovernor(limitMs = 21, frames = 75) {
  let n = 0, sum = 0;
  return (dtMs: number, tier: number, lastTier: number): number => {
    n++; sum += dtMs;
    if (n < frames) return tier;
    const slow = sum / n > limitMs;
    n = 0; sum = 0;
    if (!slow) return tier;
    return tier >= lastTier ? -1 : tier + 1;
  };
}
