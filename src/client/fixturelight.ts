import { type Fixture, type FixtureKind, type DecorPlan } from './decor.ts';
import type { LightSpec } from './lighting.ts';

/**
 * What the environment's fixtures shine: pure, so every decision (which are lit, how bright, which win the cap) is
 * unit-tested; fixtures.ts draws the lamps and lightfeed.ts hands these specs to the lighting pass.
 *
 * Budget: the lighting pass takes 14 to 32 lights a frame and the players' own lamps and beams come first, so the
 * environment never asks for more than `DECOR_LIGHT_CAP` of them, and only the nearest `DECOR_SHADOW_CAP` cast shadows.
 */
export const DECOR_LIGHT_CAP = 10;
export const DECOR_SHADOW_CAP = 4;

export type FxState = {
  /** The renderer's eased 0..1 dusk. */
  dark: number;
  now: number;
  reduced: boolean;
  /** The siege core is alive and below a third of its health: the red alarms spin. */
  alarm: boolean;
};

export const LAMP_COLOR = '#ffbf6e' as const;
export const WORK_COLOR = '#ffe9c2';
export const TUBE_COLOR = '#cfe8ff';
export const EXIT_COLOR = '#7dffb0';
export const WINDOW_COLOR = '#ffcf8a';
export const BEACON_COLOR = '#ffb347';
export const ALARM_COLOR = '#ff5a4a';
export const FLOOD_COLOR = '#ffecc8';

/** A beacon's turn, slow enough to read as a lamp on a motor and well under 4 Hz. */
export const BEACON_HZ = 0.4;
const smooth = (a: number, b: number, v: number) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };

/** A fluorescent tube is steady except for one short stutter every 10 to 17 seconds; reduced motion keeps it on. */
export function tubeOn(f: Pick<Fixture, 'phase'>, now: number, reduced: boolean): boolean {
  if (reduced) return true;
  const period = 10_000 + f.phase * 7_000, t = now % period;
  if (t > 520) return true;
  return Math.floor(t / 65) % 3 !== 1 && t > 120;
}

/** Spin angle of a beacon or fan at `now`: still under reduced motion. */
export const spinAt = (f: Pick<Fixture, 'phase'>, now: number, reduced: boolean, hz = BEACON_HZ): number => f.phase * Math.PI * 2 + (reduced ? 0 : (now / 1000) * hz * Math.PI * 2);

/** How lit a lamp-like fixture reads by day (a gentle accent) through night (the picture). */
export const lampLevel = (dark: number): number => 0.62 + 0.38 * dark;

/** A district's own lamp colour (decor.ts `REGIONS`): the cold dock, the sodium containers, the warm office. */
export const lampColor = (f: Pick<Fixture, 'region' | 'lamp'>): `#${string}` => (f.region >= 0 && f.lamp ? (f.lamp as `#${string}`) : LAMP_COLOR);

export type Resolved = { spec: LightSpec; key: string };

/** The light a fixture throws right now, or null when it is dark (a fan, steam, a floodlight at noon, an alarm at rest). */
export function fixtureLight(f: Fixture, st: FxState): Resolved | null {
  const key = `decor:${f.id}`;
  const k = lampLevel(st.dark);
  const flick = st.reduced ? 0 : 0.1;
  const at = { x: f.lx, y: f.ly };
  switch (f.kind) {
    case 'lamp':
      return { key, spec: { ...at, radius: 260, color: lampColor(f), intensity: 0.85 * k, flicker: flick, size: 9, inside: 18 } };
    case 'boothlamp':
      return { key, spec: { ...at, radius: 300, color: LAMP_COLOR, intensity: 0.9 * k, flicker: flick * 0.5, size: 12, inside: 36 } };
    case 'lanepost':
      return { key, spec: { ...at, radius: 240, color: lampColor(f), intensity: 0.8 * k, flicker: flick, size: 8, inside: 12 } };
    case 'work':
      return { key, spec: { ...at, radius: 330, color: f.region >= 0 ? lampColor(f) : WORK_COLOR, intensity: 0.95 * k, size: 10, inside: 16, cone: { angle: f.angle, half: 0.8 } } };
    case 'tube': {
      if (!tubeOn(f, st.now, st.reduced)) return null;
      return { key, spec: { ...at, radius: 250, color: TUBE_COLOR, intensity: 0.7 * k, size: 14, inside: 14, cone: { angle: f.angle, half: 1.1 } } };
    }
    case 'window':
      return { key, spec: { ...at, radius: 270, color: WINDOW_COLOR, intensity: 0.75 * k, size: 12, inside: 14, cone: { angle: f.angle, half: 0.85 } } };
    case 'exit':
      return { key, spec: { ...at, radius: 120, color: EXIT_COLOR, intensity: 0.55, size: 6, inside: 10, shadows: false } };
    case 'uplight':
      return { key, spec: { ...at, radius: 170, color: lampColor(f), intensity: 0.6 * k, size: 8, inside: 14, shadows: false } };
    case 'beacon': {
      // A sweeping amber cone, plus a steady glow so the beacon is a lit thing even when the cone faces away.
      const sweep = spinAt(f, st.now, st.reduced);
      return { key, spec: { ...at, radius: 280, color: BEACON_COLOR, intensity: st.reduced ? 0.5 : 0.95 * k, size: 8, inside: 14, shadows: false, cone: { angle: sweep, half: st.reduced ? Math.PI : 0.55 } } };
    }
    case 'flood': {
      const on = smooth(0.08, 0.5, st.dark);
      if (on <= 0.01) return null;
      return { key, spec: { ...at, radius: 560, color: FLOOD_COLOR, intensity: 1.05 * on, size: 16, inside: 40, cone: { angle: f.angle, half: 0.62 } } };
    }
    case 'alarm': {
      if (!st.alarm) return null;
      const sweep = spinAt(f, st.now, st.reduced, 0.7);
      return { key, spec: { ...at, radius: 340, color: ALARM_COLOR, intensity: 1, size: 8, inside: 20, shadows: false, cone: { angle: sweep, half: st.reduced ? Math.PI : 0.6 } } };
    }
    case 'lantern':
      return { key, spec: { ...at, radius: 130, color: '#ffb35a', intensity: 0.8 * k, flicker: st.reduced ? 0 : 0.3, size: 6, inside: 8, shadows: false } };
    case 'scoreboard':
      return { key, spec: { ...at, radius: 200, color: '#ffd9a0', intensity: 0.55 * k, size: 14, inside: 24, shadows: false, cone: { angle: f.angle, half: 1.1 } } };
    default:
      return null;
  }
}

export type View = { x0: number; y0: number; x1: number; y1: number };

/**
 * The environment's lights for a view: only those whose pool touches it, the nearest `cap` of them, and shadows only on the
 * nearest `shadowCap`. A fixture is a lamp or it is not: this never invents one.
 */
export function pickDecorLights(plan: DecorPlan, view: View, st: FxState, cap = DECOR_LIGHT_CAP, shadowCap = DECOR_SHADOW_CAP): Resolved[] {
  const cx = (view.x0 + view.x1) / 2, cy = (view.y0 + view.y1) / 2;
  const seen: { r: Resolved; d: number }[] = [];
  for (const f of plan.fixtures) {
    if (!LIT.has(f.kind)) continue;
    // Cheap reject before building a spec: no light here reaches further than 600.
    if (f.lx < view.x0 - 600 || f.lx > view.x1 + 600 || f.ly < view.y0 - 600 || f.ly > view.y1 + 600) continue;
    const r = fixtureLight(f, st);
    if (!r) continue;
    const rad = r.spec.radius;
    if (f.lx + rad < view.x0 || f.lx - rad > view.x1 || f.ly + rad < view.y0 || f.ly - rad > view.y1) continue;
    seen.push({ r, d: Math.hypot(f.lx - cx, f.ly - cy) });
  }
  seen.sort((a, b) => a.d - b.d);
  return seen.slice(0, cap).map(({ r }, i) => (i < shadowCap ? r : { key: r.key, spec: { ...r.spec, shadows: false } }));
}

const LIT = new Set<FixtureKind>(['lamp', 'boothlamp', 'lanepost', 'work', 'tube', 'window', 'exit', 'uplight', 'beacon', 'flood', 'alarm', 'scoreboard', 'lantern']);
