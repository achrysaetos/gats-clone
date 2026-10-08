import { fxCapable, fxRenderer, fxPlanState, setFxPlan } from './postfx.ts';
import { setWaterPlan } from './themes/harborwater.ts';
import { PRESET_INFO, autoPick, createDegrader, createMeter, knobs, knobsFor, setKnobs, stepDown, type Env, type Knobs, type PresetId } from './quality.ts';
import { browserStore, onSettings, settings } from './settings.ts';

/**
 * Runs the graphics preset: works out what Auto picks for this device, applies the knobs in force to the shader pass, the
 * water and the canvas resolution, watches frame times (a short probe at the start, then ten slow seconds in a match), and
 * tells the player when Auto steps down. The pure half is quality.ts.
 */

const CAP_KEY = 'skirmish.quality.auto';
const PROBE_FRAMES = 90;

let env: Env = { glOk: true, dpr: 1, touch: false };
let auto = autoPick(env);
/** The best preset Auto may use: lowered when frames stayed slow, and remembered so the next visit starts there. */
let cap: PresetId | null = null;
let onResize: (() => void) | null = null;
let notify: ((message: string) => void) | null = null;
const meter = createMeter();
const degrader = createDegrader();
let probeSum = 0, probeN = 0, probed = false;

const nofx = (): boolean => typeof location !== 'undefined' && new URLSearchParams(location.search).has('nofx');

function storedCap(): PresetId | null {
  const v = browserStore.get(CAP_KEY);
  return v === 'low' || v === 'medium' || v === 'high' || v === 'ultra' ? v : null;
}

function recompute(extra = '') {
  const picked = autoPick(env);
  const order: PresetId[] = ['low', 'medium', 'high', 'ultra'];
  if (cap && order.indexOf(picked.preset) > order.indexOf(cap)) auto = { preset: cap, why: `${picked.why}; lowered to ${PRESET_INFO[cap].name} after slow frames` };
  else auto = picked;
  if (extra) auto = { ...auto, why: `${auto.why}${extra}` };
}

/** The preset in force: the player's pick, or Auto's. */
export const effectivePreset = (): PresetId => { const q = settings().quality; return q === 'auto' ? auto.preset : q; };

export function applyQuality(): Knobs {
  const s = settings();
  const k = knobsFor(effectivePreset(), s.adv, nofx());
  setKnobs(k);
  setFxPlan({ post: k.post, lighting: k.lighting, tier: k.tier, lightMul: k.lightMul, shadowMul: k.shadowMul, bloom: k.bloom, grain: k.grain, hold: s.quality !== 'auto' });
  setWaterPlan({ gl: k.waterGL, tier: k.waterTier });
  if (typeof document !== 'undefined') document.documentElement.dataset.gfx = effectivePreset();
  onResize?.();
  return k;
}

export function initQuality(opts: { resize(): void; toast(message: string): void }) {
  onResize = opts.resize;
  notify = opts.toast;
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  env = { renderer: fxRenderer(), glOk: fxCapable() || fxRenderer() !== undefined, deviceMemory: nav.deviceMemory, dpr: devicePixelRatio || 1, touch: matchMedia('(pointer: coarse)').matches, saveData: !!nav.connection?.saveData, probeMs: null };
  cap = storedCap();
  recompute();
  onSettings((_s, changed) => { if (changed === 'quality' || changed === 'adv' || changed === null) { degrader.reset(); applyQuality(); } });
  applyQuality();
}

/** Called once per drawn frame with its duration. `inMatch` limits the ten-second step-down to real play (the menu scene is not the game). */
export function frameTick(frameMs: number, now: number, inMatch: boolean): void {
  meter.push(frameMs);
  if (!probed && frameMs < 250) {
    probeSum += frameMs;
    if (++probeN >= PROBE_FRAMES) {
      probed = true;
      env = { ...env, probeMs: probeSum / probeN };
      recompute();
      if (settings().quality === 'auto') applyQuality();
    }
  }
  if (!inMatch || settings().quality !== 'auto' || document.hidden) { degrader.reset(); return; }
  if (!degrader.push(frameMs, now)) return;
  const lower = stepDown(auto.preset);
  if (!lower) return;
  cap = lower;
  browserStore.set(CAP_KEY, lower);
  recompute();
  applyQuality();
  notify?.(`Graphics lowered to ${PRESET_INFO[lower].name}: the frame rate stayed low. Change it in Pause, Settings.`);
}

export type QualityReadout = { setting: string; preset: PresetId; autoWhy: string; fps: number | null; ms: number | null; worst: number | null; renderer: string | null };

export function qualityState(): QualityReadout {
  const m = meter.read();
  return { setting: settings().quality, preset: effectivePreset(), autoWhy: auto.why, fps: m ? Math.round(m.fps) : null, ms: m ? Math.round(m.ms * 10) / 10 : null, worst: m ? Math.round(m.worst) : null, renderer: fxRenderer() ?? null };
}

/** Dev probe: the knobs in force, and what the pieces that obey them hold. */
export const qualityProbe = () => ({ ...qualityState(), knobs: knobs(), fx: fxPlanState() });
