/**
 * Graphics presets. One choice (Auto, Low, Medium, High, Ultra) sets every cost knob together; the pause menu's Advanced
 * disclosure can override a few of them one by one. No DOM here, so the table, Auto's pick and its step-down rule are
 * unit-tested; qualityrt.ts applies the result to the shader pass, the water, the critters and the rest.
 */

export type PresetId = 'low' | 'medium' | 'high' | 'ultra';
export const PRESET_IDS: readonly PresetId[] = ['low', 'medium', 'high', 'ultra'];

export type Knobs = {
  /** The WebGL pass: colour grade, bloom, vignette, grain. Off draws the plain 2D picture (same as `?nofx`). */
  post: boolean;
  /** Real lights and shadows in that pass (needs `post`). */
  lighting: boolean;
  /** Index into the lighting tiers (lighting.ts TIERS): 0 is the richest. */
  tier: number;
  /** Multipliers on how many lights, and how many of those cast shadows, a frame may use. */
  lightMul: number;
  shadowMul: number;
  /** Multipliers on the glow and the film grain. */
  bloom: number;
  grain: number;
  /** The harbour's water on the GPU (false: the plain 2D water) and its resolution tier (0 sharpest). */
  waterGL: boolean;
  waterTier: number;
  /** Multipliers: ambient birds, rats and drifting dressing; the particle pool; fixtures a map may carry. */
  critters: number;
  particles: number;
  decor: number;
  /** Multiplier on the resolution vehicle sprites are baked at. */
  vehicleRes: number;
  /** Highest device-pixel ratio the canvas renders at. */
  dprCap: number;
};

export const PRESETS: Readonly<Record<PresetId, Knobs>> = {
  low: { post: false, lighting: false, tier: 2, lightMul: 0.5, shadowMul: 0, bloom: 0, grain: 0, waterGL: false, waterTier: 2, critters: 0.25, particles: 0.4, decor: 0.5, vehicleRes: 0.6, dprCap: 1 },
  medium: { post: true, lighting: true, tier: 2, lightMul: 0.7, shadowMul: 0.5, bloom: 0.6, grain: 0.5, waterGL: true, waterTier: 1, critters: 0.6, particles: 0.7, decor: 0.75, vehicleRes: 0.8, dprCap: 1.5 },
  high: { post: true, lighting: true, tier: 1, lightMul: 1, shadowMul: 1, bloom: 1, grain: 1, waterGL: true, waterTier: 0, critters: 1, particles: 1, decor: 1, vehicleRes: 1, dprCap: 2 },
  ultra: { post: true, lighting: true, tier: 0, lightMul: 1, shadowMul: 1, bloom: 1, grain: 1, waterGL: true, waterTier: 0, critters: 1.25, particles: 1.5, decor: 1, vehicleRes: 1, dprCap: 2.5 },
};

export const PRESET_INFO: Readonly<Record<PresetId, { name: string; blurb: string }>> = {
  low: { name: 'Low', blurb: 'Plain picture: no glow or lighting, flat water, fewer critters. Easiest on old laptops and phones.' },
  medium: { name: 'Medium', blurb: 'Colour grade and glow, a few lights without shadows, GPU water at reduced detail.' },
  high: { name: 'High', blurb: 'Full lighting with shadows, all the glow and grain, sharp water. Good on most computers.' },
  ultra: { name: 'Ultra', blurb: 'Everything at maximum: richest lights, densest critters and sparks, full resolution on sharp screens.' },
};

/** The few knobs the Advanced disclosure lets the player set on their own, over the preset. */
export type Adv = { post?: boolean; lighting?: boolean; waterGL?: boolean; critters?: number; dprCap?: number };
export const CRITTER_STEPS: readonly (readonly [number, string])[] = [[0, 'None'], [0.25, 'Few'], [0.6, 'Some'], [1, 'Many']];
export const DPR_STEPS: readonly (readonly [number, string])[] = [[1, '1x'], [1.5, '1.5x'], [2, '2x'], [2.5, 'Max']];

export function sanitizeAdv(raw: unknown): Adv {
  const r = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const out: Adv = {};
  for (const k of ['post', 'lighting', 'waterGL'] as const) if (typeof r[k] === 'boolean') out[k] = r[k] as boolean;
  const near = (v: unknown, steps: readonly (readonly [number, string])[]) => (typeof v === 'number' && Number.isFinite(v) ? steps.reduce((a, s) => (Math.abs(s[0] - v) < Math.abs(a[0] - v) ? s : a))[0] : undefined);
  const c = near(r.critters, CRITTER_STEPS), d = near(r.dprCap, DPR_STEPS);
  if (c !== undefined) out.critters = c;
  if (d !== undefined) out.dprCap = d;
  return out;
}

/** The knobs in force: the preset, the player's overrides, and `?nofx` over everything. Lighting needs the pass, so it follows `post`. */
export function knobsFor(preset: PresetId, adv: Adv = {}, nofx = false): Knobs {
  const k: Knobs = { ...PRESETS[preset], ...adv };
  if (nofx) k.post = false;
  if (!k.post) k.lighting = false;
  return k;
}

// ---- Auto ----

export type Env = {
  renderer?: string;
  glOk: boolean;
  deviceMemory?: number;
  dpr: number;
  touch: boolean;
  saveData?: boolean;
  /** Average frame time measured over the first seconds, if there is one yet. */
  probeMs?: number | null;
};

const SOFTWARE = /swiftshader|llvmpipe|softpipe|software|basic render/i;
const STRONG = /nvidia|geforce|rtx|gtx|radeon rx|radeon pro|apple m\d|apple gpu|arc a\d/i;
const INTEGRATED = /intel|uhd|iris|hd graphics|mali|adreno|powervr|vega \d|radeon graphics/i;

export const SLOW_PROBE_MS = 28;
export const OK_PROBE_MS = 12;

/** What Auto picks for this device and why, as a line the menu can show ("Auto → Medium: ..."). */
export function autoPick(env: Env): { preset: PresetId; why: string } {
  const gpu = env.renderer ? `GPU: ${env.renderer}` : 'GPU unknown';
  let pick: { preset: PresetId; why: string };
  if (!env.glOk) pick = { preset: 'low', why: 'WebGL is not available' };
  else if (env.renderer && SOFTWARE.test(env.renderer)) pick = { preset: 'low', why: `software renderer detected (${env.renderer})` };
  else if (env.saveData) pick = { preset: 'low', why: 'data saver is on' };
  else if (env.deviceMemory !== undefined && env.deviceMemory <= 2) pick = { preset: 'low', why: `low memory (${env.deviceMemory} GB)` };
  else if (env.touch || (env.deviceMemory !== undefined && env.deviceMemory <= 4) || (env.renderer && INTEGRATED.test(env.renderer) && !STRONG.test(env.renderer))) {
    pick = { preset: 'medium', why: env.touch ? `touch device. ${gpu}` : env.deviceMemory !== undefined && env.deviceMemory <= 4 ? `${env.deviceMemory} GB memory. ${gpu}` : `integrated graphics. ${gpu}` };
  } else if (env.renderer && STRONG.test(env.renderer) && (env.deviceMemory ?? 8) >= 8 && env.dpr <= 2 && env.probeMs != null && env.probeMs <= OK_PROBE_MS) {
    pick = { preset: 'ultra', why: `${gpu}, ${env.probeMs.toFixed(1)} ms frames` };
  } else pick = { preset: 'high', why: gpu };
  // A measured frame time can only lower the pick: a slow probe says the GPU string flattered the device.
  if (env.probeMs != null && env.probeMs > SLOW_PROBE_MS) {
    const lower = stepDown(pick.preset);
    if (lower) return { preset: lower, why: `${pick.why}; frames took ${env.probeMs.toFixed(0)} ms in the first seconds` };
  }
  return pick;
}

export const stepDown = (p: PresetId): PresetId | null => PRESET_IDS[PRESET_IDS.indexOf(p) - 1] ?? null;

/**
 * Fed every frame's time: returns true once frames have averaged over `limitMs` for `holdMs` without a good second in between
 * (the cue for Auto to step one preset down). Frames over `ignoreMs` are a hidden tab or a stall, not a slow GPU, and are skipped.
 */
export function createDegrader(limitMs = 24, holdMs = 10_000, ignoreMs = 250) {
  let sum = 0, n = 0, bucketAt = -1, badSince = -1;
  let frames: number[] = [];
  return {
    push(frameMs: number, now: number): boolean {
      if (frameMs > ignoreMs) { badSince = -1; sum = 0; n = 0; frames = []; bucketAt = now; return false; }
      if (bucketAt < 0) bucketAt = now;
      sum += frameMs; n++; frames.push(frameMs);
      if (now - bucketAt < 1000) return false;
      // A display held to 30 Hz (power saver) paces every frame at 33 ms, perfectly evenly: that is its refresh, not a slow GPU.
      const sorted = [...frames].sort((a, b) => a - b), q25 = sorted[Math.floor(sorted.length * 0.25)]!, q75 = sorted[Math.floor(sorted.length * 0.75)]!;
      const capped = Math.abs(q25 - 33.33) < 3 && q75 - q25 < 3.3;
      const bad = sum / n > (capped ? Math.max(limitMs, 51) : limitMs);
      sum = 0; n = 0; frames = []; bucketAt = now;
      if (!bad) { badSince = -1; return false; }
      if (badSince < 0) badSince = now;
      if (now - badSince >= holdMs) { badSince = -1; return true; }
      return false;
    },
    reset() { sum = 0; n = 0; frames = []; bucketAt = -1; badSince = -1; },
  };
}

/**
 * Whether frame times can be trusted yet. A hidden tab draws no frames, and the first moments after it returns are slow while the
 * page wakes (timers, queued messages, the compositor), none of which says anything about the GPU. So frames are ignored while
 * hidden and for `settleMs` after becoming visible, and a step-down that gets remembered across visits can never come from there.
 */
export function createFrameGate(settleMs = 2000, hiddenAtStart = false) {
  let until = hiddenAtStart ? Infinity : 0;
  return {
    setHidden(hidden: boolean, now: number) { until = hidden ? Infinity : now + settleMs; },
    /** True when a frame at `now` may be judged. */
    open: (now: number, hidden = false): boolean => !hidden && now >= until,
  };
}

/** A rolling frame-time meter for the readout beside the selector. */
export function createMeter(window = 60) {
  const times: number[] = [];
  return {
    push(frameMs: number) { if (frameMs > 0 && frameMs < 1000) { times.push(frameMs); if (times.length > window) times.shift(); } },
    read(): { fps: number; ms: number; worst: number } | null {
      if (times.length < 5) return null;
      const ms = times.reduce((a, b) => a + b, 0) / times.length;
      return { fps: 1000 / ms, ms, worst: Math.max(...times) };
    },
  };
}

// ---- the knobs in force, read by the code that obeys them ----

let current: Knobs = PRESETS.high;
export const knobs = (): Knobs => current;
export function setKnobs(k: Knobs): void { current = k; }

/** `n` scaled by a knob multiplier, never below zero. */
export const scaled = (n: number, mul: number): number => Math.max(0, Math.round(n * mul));
