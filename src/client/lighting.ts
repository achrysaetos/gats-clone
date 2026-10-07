import { pushOutConvex, segmentEntersConvexAt } from '../shared/geom.ts';
import type { Solid } from './tilt.ts';

/**
 * The lighting model, with no GL and no DOM so every decision in it is unit-tested; lightgl.ts draws what this decides.
 *
 * Every bright thing in the world is a light: muzzle flashes, blasts, fires, lamps, the core, a player's lamp and aim cone,
 * a beacon, a golden glint. Transient lights come from `addLight` (they live `life` ms); persistent ones come from
 * `setLight(key, ...)`, which a source calls every frame it exists (a light not refreshed for a moment simply goes out, so
 * a lamp on a destroyed turret never lingers). While the shader pass is off (`enabled` false) every call is a no-op.
 */

export type RGB = readonly [number, number, number];
export type Cone = { /** Aim, in radians. */ angle: number; /** Half the beam's width, in radians. */ half: number };
export type LightSpec = {
  x: number;
  y: number;
  /** World units. */
  radius: number;
  /** '#rrggbb' or 0..1 channels. */
  color: string | RGB;
  /** 0..~1.5; 1 is a lamp's full pool. */
  intensity?: number;
  /** ms a transient light lasts; omit for a persistent one (setLight). */
  life?: number;
  /** 0..1 shimmer: 0.15 for a lamp, 0.5 for a fire. */
  flicker?: number;
  cone?: Cone;
  /** How big the source is, in world units: wider means softer shadow edges. */
  size?: number;
  /** Radius around the source ignored when testing for cover, so a lamp on a pad or a muzzle at a wall is not in its own shadow. */
  inside?: number;
  /** False for a light too small or too brief to be worth casting shadows. */
  shadows?: boolean;
};
export type ActiveLight = LightSpec & { born: number; seed: number; key?: string; seen: number };
/** What the renderer gets: colour and falloff already folded with the light's envelope. */
export type ResolvedLight = { x: number; y: number; radius: number; rgb: RGB; level: number; cone: Cone | null; size: number; inside: number; shadows: boolean };

const TRANSIENT_CAP = 64;
/** A keyed light that has not been refreshed for this long goes out. */
export const KEEP_MS = 300;

let enabled = false;
let clock = 0;
const transient: ActiveLight[] = [];
const keyed = new Map<string, ActiveLight>();

/** The shader pass turns lighting on once its programs compiled, and off again if it breaks. */
export function setLightingEnabled(on: boolean): void {
  enabled = on;
  if (!on) { transient.length = 0; keyed.clear(); shocks.length = 0; }
}
export const lightingEnabled = (): boolean => enabled;
/** The frame clock lights are stamped with (hit-stop aware), set once per frame by the renderer. */
export function setLightClock(now: number): void { clock = now; }

const parsed = new Map<string, RGB>();
export function parseColor(c: string | RGB): RGB {
  if (typeof c !== 'string') return c;
  let rgb = parsed.get(c);
  if (!rgb) {
    const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c.trim());
    const h = m ? (m[1]!.length === 3 ? m[1]!.replace(/./g, '$&$&') : m[1]!) : 'ffb347';
    rgb = [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255];
    parsed.set(c, rgb);
  }
  return rgb;
}

/** A transient light: a flash, a blast, a spark. Cheap to call anywhere; ignored when the shader pass is off. */
export function addLight(spec: LightSpec): void {
  if (!enabled) return;
  const l: ActiveLight = { ...spec, life: spec.life ?? 120, born: clock || performance.now(), seed: Math.random() * 100, seen: 0 };
  if (transient.length >= TRANSIENT_CAP) transient.shift();
  transient.push(l);
}

/** A persistent light named by `key`; call it every frame the source exists. Moving it is just calling it again. */
export function setLight(key: string, spec: LightSpec): void {
  if (!enabled) return;
  const old = keyed.get(key);
  keyed.set(key, { ...spec, key, born: old?.born ?? clock, seed: old?.seed ?? hashKey(key), seen: clock });
}

export function removeLight(key: string): void { keyed.delete(key); }

function hashKey(k: string): number {
  let h = 7;
  for (let i = 0; i < k.length; i++) h = (h * 31 + k.charCodeAt(i)) % 997;
  return h / 10;
}

/** Smooth two-sine shimmer in 0..1, never faster than about 6 Hz. */
export function shimmer(t: number, seed: number): number {
  return 0.5 + 0.28 * Math.sin(t * 0.021 + seed * 3.1) + 0.22 * Math.sin(t * 0.0377 + seed * 7.7);
}

/**
 * How bright a light is `age` ms into its `life`: a quick attack (a tenth of the life, at most 25 ms), then an ease-out
 * decay, times a flicker that only ever dims it. A persistent light (life Infinity) holds at 1 with just the flicker.
 */
export function lightLevel(age: number, life: number, flicker: number, seed: number): number {
  if (age < 0) return 0;
  let base = 1;
  if (Number.isFinite(life)) {
    if (age >= life) return 0;
    const attack = Math.min(25, life * 0.1), k = age / life;
    base = Math.min(1, age / attack) * (1 - k) ** 1.6;
  }
  return base * (1 - flicker * (1 - shimmer(age + seed * 997, seed)));
}

/** Folds every live light into render values, dropping the dead. */
export function resolveLights(now: number): ResolvedLight[] {
  const out: ResolvedLight[] = [];
  const push = (l: ActiveLight, life: number) => {
    const level = lightLevel(now - l.born, life, l.flicker ?? 0, l.seed) * (l.intensity ?? 1);
    if (level < 0.01 || l.radius < 4) return;
    out.push({
      x: l.x, y: l.y, radius: l.radius, rgb: parseColor(l.color), level, cone: l.cone ?? null,
      size: l.size ?? Math.min(14, l.radius * 0.07), inside: l.inside ?? 10, shadows: l.shadows ?? true,
    });
  };
  for (let i = transient.length - 1; i >= 0; i--) {
    const l = transient[i]!;
    if (now - l.born >= (l.life ?? 120)) transient.splice(i, 1);
    else push(l, l.life ?? 120);
  }
  for (const [key, l] of keyed) {
    if (now - l.seen > KEEP_MS) keyed.delete(key);
    else push(l, Infinity);
  }
  return out;
}

export type ViewRect = { x0: number; y0: number; x1: number; y1: number };

/** Strength used to rank lights: a big bright light matters more than a small dim one. */
export const lightWeight = (l: Pick<ResolvedLight, 'radius' | 'level'>): number => l.level * l.radius * l.radius;

/**
 * Keeps the lights that can touch the view, then the `max` strongest of them (ties go to the one nearer the view's centre),
 * strongest first. The first `shadowMax` of those keep `shadows`; the rest are drawn without cover tests.
 */
export function selectLights(lights: readonly ResolvedLight[], view: ViewRect, max: number, shadowMax: number): ResolvedLight[] {
  const cx = (view.x0 + view.x1) / 2, cy = (view.y0 + view.y1) / 2;
  const seen = lights.filter((l) => l.x + l.radius > view.x0 && l.x - l.radius < view.x1 && l.y + l.radius > view.y0 && l.y - l.radius < view.y1);
  const rank = (l: ResolvedLight) => lightWeight(l) / (1 + Math.hypot(l.x - cx, l.y - cy) * 0.0005);
  const top = seen.sort((a, b) => rank(b) - rank(a)).slice(0, max);
  return top.map((l, i) => (l.shadows && i >= shadowMax ? { ...l, shadows: false } : l));
}

/** A solid that stands tall enough to stop light. Curbs, turret pads and the core's own plinth do not. */
export const blocksLight = (s: Pick<Solid, 'kind'>): boolean => s.kind !== 'curb' && s.kind !== 'pad' && s.kind !== 'core' && s.kind !== 'water' && s.kind !== 'pond';

/** A box that casts shadow. A polygon part carries its convex `pts` (flat, positive area) as well as its box. */
export type Occluder = { x: number; y: number; w: number; h: number; face: number; pts?: readonly number[] };

/** The rects that cast shadows and darken floor: in-view solids that stand, each with the height of its front face. */
export function occludersOf(solids: readonly Solid[], view: ViewRect, faceOf: (kind: Solid['kind']) => number): Occluder[] {
  const out: Occluder[] = [];
  for (const s of solids) {
    if (!blocksLight(s)) continue;
    const face = faceOf(s.kind);
    if (s.x + s.w < view.x0 || s.x > view.x1 || s.y + s.h + face < view.y0 || s.y > view.y1) continue;
    out.push({ x: s.x, y: s.y, w: s.w, h: s.h, face });
  }
  return out;
}

/** If (x, y) is inside a rect, the nearest point just outside it; otherwise unchanged. A muzzle pressed to a wall then lights the room, not the wall's inside. */
export function pushOut(x: number, y: number, rects: readonly Occluder[], gap = 3): { x: number; y: number } {
  for (const r of rects) {
    if (r.pts) {
      if (x < r.x || x > r.x + r.w || y < r.y || y > r.y + r.h || segmentEntersConvexAt(x, y, 0, 0, r.pts) === null) continue;
      return pushOutConvex(x, y, gap, r.pts) ?? { x, y };
    }
    if (x <= r.x || x >= r.x + r.w || y <= r.y || y >= r.y + r.h) continue;
    const left = x - r.x, right = r.x + r.w - x, up = y - r.y, down = r.y + r.h - y, m = Math.min(left, right, up, down);
    if (m === left) return { x: r.x - gap, y };
    if (m === right) return { x: r.x + r.w + gap, y };
    if (m === up) return { x, y: r.y - gap };
    return { x, y: r.y + r.h + gap };
  }
  return { x, y };
}

/**
 * Triangles per box, as clip-space x, y, then the front-face flag, ready for the occluder mask: front faces first so
 * a footprint drawn later wins, then footprints. `view` maps world to clip with y flipped (world down is clip down).
 * A polygon part's footprint is a fan, and its front face hangs below each south-facing edge.
 */
export function maskTriangles(rects: readonly Occluder[], view: ViewRect): Float32Array {
  const out: number[] = [];
  const sx = 2 / (view.x1 - view.x0), sy = 2 / (view.y1 - view.y0);
  const clip = (x: number, y: number, flag: number) => { out.push((x - view.x0) * sx - 1, 1 - (y - view.y0) * sy, flag); };
  const quad = (x: number, y: number, w: number, h: number, flag: number) => {
    const l = (x - view.x0) * sx - 1, r = (x + w - view.x0) * sx - 1, t = 1 - (y - view.y0) * sy, b = 1 - (y + h - view.y0) * sy;
    for (const [px, py] of [[l, t], [r, t], [l, b], [l, b], [r, t], [r, b]] as const) out.push(px, py, flag);
  };
  for (const r of rects) {
    if (r.face <= 0) continue;
    if (!r.pts) { quad(r.x, r.y + r.h, r.w, r.face, 1); continue; }
    const n = r.pts.length / 2;
    for (let i = 0; i < n; i++) {
      const ax = r.pts[2 * i]!, ay = r.pts[2 * i + 1]!, bx = r.pts[2 * ((i + 1) % n)]!, by = r.pts[2 * ((i + 1) % n) + 1]!;
      if (bx >= ax) continue;
      for (const [px, py] of [[ax, ay], [bx, by], [ax, ay + r.face], [ax, ay + r.face], [bx, by], [bx, by + r.face]] as const) clip(px, py, 1);
    }
  }
  for (const r of rects) {
    if (!r.pts) { quad(r.x, r.y, r.w, r.h, 0); continue; }
    const n = r.pts.length / 2;
    for (let i = 1; i + 1 < n; i++) for (const k of [0, i, i + 1]) clip(r.pts[2 * k]!, r.pts[2 * k + 1]!, 0);
  }
  return Float32Array.from(out);
}

export type Ambient = {
  /** What the unlit world is multiplied by. */
  rgb: RGB;
  /** How much of each light is added on top of that: day lights are a gentle accent, night lights are the picture. */
  gain: number;
  /** Floor darkening beside walls, 0..1. */
  ao: number;
  /** Strength of the light shafts. */
  shafts: number;
};

const NIGHT_AMBIENT: RGB = [0.28, 0.34, 0.62];
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/** The ambient for a moment. `night` is the renderer's eased 0..1 dusk, so lighting fades in step with it and never pops. */
export function ambientFor(night: number, storm = false): Ambient {
  const t = Math.min(1, Math.max(0, night));
  const day: RGB = storm ? [0.97, 0.99, 1] : [1, 1, 1];
  return {
    rgb: [mix(day[0], NIGHT_AMBIENT[0], t), mix(day[1], NIGHT_AMBIENT[1], t), mix(day[2], NIGHT_AMBIENT[2], t)],
    gain: mix(0.5, 1, t),
    ao: mix(0.14, 0.3, t),
    shafts: Math.max(0, (t - 0.35) / 0.65) * 0.9,
  };
}

/** A shock ring from a blast: the scene bends around its leading edge, then the heat shimmers inside it as it fades. */
export type Shock = { x: number; y: number; radius: number; born: number; life: number; strength: number };
const shocks: Shock[] = [];
const SHOCK_CAP = 4;

export function addShockwave(s: { x: number; y: number; radius: number; strength?: number; life?: number }): void {
  if (!enabled) return;
  if (shocks.length >= SHOCK_CAP) shocks.shift();
  shocks.push({ x: s.x, y: s.y, radius: s.radius, born: clock || performance.now(), life: s.life ?? 650, strength: s.strength ?? 1 });
}

/** Rings alive at `now`: `k` runs 0 to 1 over the life; drops the finished ones. */
export function liveShocks(now: number): (Shock & { k: number })[] {
  const out: (Shock & { k: number })[] = [];
  for (let i = shocks.length - 1; i >= 0; i--) {
    const s = shocks[i]!, k = (now - s.born) / s.life;
    if (k >= 1) shocks.splice(i, 1);
    else if (k >= 0) out.push({ ...s, k });
  }
  return out;
}

/** Quality tiers the frame-time governor steps down through; each is cheaper than the one before. */
export type Tier = { lights: number; shadowLights: number; steps: number; rays: number; ao: boolean; shafts: number; shocks: boolean };
export const TIERS: readonly Tier[] = [
  { lights: 32, shadowLights: 14, steps: 24, rays: 3, ao: true, shafts: 2, shocks: true },
  { lights: 24, shadowLights: 8, steps: 16, rays: 1, ao: true, shafts: 1, shocks: true },
  { lights: 14, shadowLights: 4, steps: 10, rays: 1, ao: false, shafts: 0, shocks: false },
];

const MUZZLE: Record<string, { radius: number; life: number; intensity: number }> = {
  pistol: { radius: 72, life: 60, intensity: 0.38 },
  smg: { radius: 70, life: 50, intensity: 0.34 },
  assault: { radius: 76, life: 55, intensity: 0.4 },
  shotgun: { radius: 84, life: 70, intensity: 0.44 },
  lmg: { radius: 78, life: 55, intensity: 0.4 },
  sniper: { radius: 86, life: 75, intensity: 0.46 },
};

/** The light a muzzle flash throws: bigger and longer for a heavier gun, a third as bright when silenced. */
export function muzzleLight(at: { x: number; y: number }, angle: number, base: string, silenced = false): LightSpec {
  const m = MUZZLE[base] ?? MUZZLE.pistol!;
  return {
    x: at.x + Math.cos(angle) * 5, y: at.y + Math.sin(angle) * 5, radius: m.radius * (silenced ? 0.7 : 1), color: '#ffc46b',
    intensity: m.intensity * (silenced ? 0.35 : 1), life: m.life, size: 5, inside: 16, flicker: 0.12,
  };
}

/** The light a blast throws: a quick white-hot flash and a longer amber glow that gutters, scaled by its radius. */
export function blastLights(x: number, y: number, r: number, pop: boolean): LightSpec[] {
  const glow: LightSpec = { x, y, radius: r * (pop ? 2.2 : 3), color: '#ff9a3c', intensity: pop ? 0.7 : 1.25, life: pop ? 260 : 950, flicker: 0.35, size: r * 0.3, inside: r * 0.3 + 8 };
  const flash: LightSpec = { x, y, radius: r * (pop ? 2.8 : 4), color: '#fff0c8', intensity: pop ? 0.9 : 1.5, life: pop ? 110 : 170, size: r * 0.25, inside: r * 0.3 + 8 };
  return [flash, glow];
}

/** Dev/test: forget everything. */
export function resetLighting(): void { transient.length = 0; keyed.clear(); shocks.length = 0; clock = 0; }
