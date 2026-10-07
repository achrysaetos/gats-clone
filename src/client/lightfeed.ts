import { AIRDROP, BARREL, ZOM } from '../shared/defs.ts';
import type { Snapshot } from '../shared/protocol.ts';
import type { Point } from './camera.ts';
import { CORE_GLOW } from './coreart.ts';
import { occludersOf, setLight, setLightClock, type Occluder } from './lighting.ts';
import { setPropLightSink } from './propfx.ts';
import type { DecorPlan } from './decor.ts';
import { pickDecorLights, type FxState } from './fixturelight.ts';
import { captureBase, lightingActive } from './postfx.ts';
import { FACE, type Solid } from './tilt.ts';

/**
 * What lights the world each frame, and the hand-off to the shader pass. Persistent sources are derived here from the
 * snapshot (the night lamps ambience.ts used to cut out of its shade, plus fires, beacons and gold); one-off sources
 * (muzzle flashes, blasts, sparks) call `addLight` where they happen.
 */

const LAMP = '#ffc47e';
const AMBER = '#ffb347';
const GOLD = '#ffd34d';
const SIGNAL = '#ff8a3c';
/** Only gun turrets carry a lamp; walls, depots, posts and spikes are dark. */
const TURRET_LIGHT: Partial<Record<string, string>> = { sentry: AMBER, cannon: AMBER, scatter: AMBER, mortar: AMBER, tesla: '#8fc4ff' };

export type LitWorld = {
  snap: Pick<Snapshot, 'players' | 'buildings' | 'run' | 'barrels' | 'airdrop'>;
  selfId: number;
  selfAngle: number | null;
  tl: Point;
  br: Point;
  /** The renderer's eased 0..1 dusk. */
  dark: number;
  now: number;
  /** The supply crate has landed (the beacon only burns then). */
  airLanded?: boolean;
  /** Solids standing in view (walls, built walls, crates, siege buildings); non-blocking kinds are dropped. */
  solids: readonly Solid[];
  /** Extra shadow casters: polygon walls and door leaves (geoart.ts). */
  occluders?: readonly Occluder[];
  /** The map's practical fixtures (decor.ts) and this frame's state for them; their lights come from the nearest few in view. */
  decor?: DecorPlan;
  fx?: FxState;
};

/** Tonight's lamps: each player a lamp and a beam along their aim, each turret an amber lamp, and the core a hearth. */
function feedNight(w: LitWorld) {
  const { snap, dark } = w;
  if (dark <= 0.02) return;
  for (const p of snap.players) {
    if (!p.alive || p.hidden) continue;
    const angle = p.id === w.selfId && w.selfAngle !== null ? w.selfAngle : p.angle;
    setLight(`lamp:${p.id}`, { x: p.x, y: p.y, radius: 170, color: LAMP, intensity: 0.7 * dark, size: 10, inside: 16, flicker: 0.04 });
    setLight(`beam:${p.id}`, { x: p.x, y: p.y, radius: 400, color: '#ffd9a0', intensity: 0.7 * dark, cone: { angle, half: 0.4 }, size: 6, inside: 16 });
  }
  for (const b of snap.buildings ?? []) {
    const color = TURRET_LIGHT[b.kind];
    if (!color) continue;
    setLight(`turret:${b.cx},${b.cy}`, { x: (b.cx + 0.5) * ZOM.cell, y: (b.cy + 0.5) * ZOM.cell, radius: 200, color, intensity: 0.85 * dark, flicker: 0.14, size: 8, inside: 22 });
  }
}

/** Lights that burn in the day too: the core, lit barrels, a landed beacon, a golden gun's glint. */
function feedAlways(w: LitWorld) {
  const { snap, now } = w;
  if (snap.run && snap.run.core.hp > 0) {
    const { x, y } = snap.run.core;
    setLight('core', { x, y, radius: 380, color: CORE_GLOW, intensity: 0.4 + 0.3 * w.dark, flicker: 0.08, size: 20, inside: 56 });
    setLight('core-hearth', { x, y, radius: 150, color: '#bff3ff', intensity: 0.3, size: 12, inside: 56, shadows: false });
  }
  for (const [id, x, y, hp] of snap.barrels ?? []) {
    if (hp !== 0) continue;
    setLight(`barrel:${id}`, { x, y, radius: 130, color: AMBER, intensity: 0.9, flicker: 0.45, size: 8, inside: BARREL.size });
  }
  const air = snap.airdrop;
  if (air && w.airLanded) {
    const pulse = 0.5 + 0.5 * Math.sin(now / 300);
    setLight('beacon', { x: air.x, y: air.y, radius: 150 + 20 * pulse, color: SIGNAL, intensity: 0.4 + 0.25 * pulse, size: 10, inside: AIRDROP.size });
  }
  for (const p of snap.players) {
    if (!p.golden || !p.alive || p.hidden) continue;
    const t = ((now + p.id * 311) % 1900) / 260;
    if (t >= 1) continue;
    const k = Math.sin(t * Math.PI);
    setLight(`gold:${p.id}`, { x: p.x + Math.cos(p.angle) * 22, y: p.y + Math.sin(p.angle) * 22, radius: 80, color: GOLD, intensity: 0.75 * k, shadows: false });
  }
}

/**
 * Feeds this frame's lights and, when the lighting pass is running, captures the world drawn so far as the lit base and
 * clears the canvas so the rest of the frame draws as an unlit overlay. Returns true when it did, and drawWorld then
 * skips ambience.ts's 2D night shade. Does nothing (and returns false) for any canvas but the game's, or with the pass off.
 */
export function lightWorld(ctx: CanvasRenderingContext2D, w: LitWorld): boolean {
  if (!lightingActive() || ctx.canvas.id !== 'game') return false;
  setLightClock(w.now);
  feedNight(w);
  feedAlways(w);
  if (w.decor && w.fx) for (const { key, spec } of pickDecorLights(w.decor, { x0: w.tl.x, y0: w.tl.y, x1: w.br.x, y1: w.br.y }, w.fx)) setLight(key, spec);
  const view = { x0: w.tl.x, y0: w.tl.y, x1: w.br.x, y1: w.br.y };
  if (!captureBase(ctx.canvas, view, [...occludersOf(w.solids, view, (k) => FACE[k]), ...(w.occluders ?? [])])) return false;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.restore();
  return true;
}

/** The menu's backdrop: no lamps, but the walls still ground themselves with the pass's contact shadow. */
export function lightBackdrop(ctx: CanvasRenderingContext2D, tl: Point, br: Point, solids: readonly Solid[], now: number): boolean {
  if (!lightingActive() || ctx.canvas.id !== 'game') return false;
  setLightClock(now);
  const view = { x0: tl.x, y0: tl.y, x1: br.x, y1: br.y };
  if (!captureBase(ctx.canvas, view, occludersOf(solids, view, (k) => FACE[k]))) return false;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.restore();
  return true;
}

/**
 * Prop light (fire slicks, the propane jet, generator arcs, EMP and lamp-pop flashes, streetlamps that go dark with a broken
 * bulb, pack glints) arrives from propfx every frame it draws; each is a keyed light that goes out when propfx stops sending it.
 */
setPropLightSink((lights) => {
  for (const l of lights) {
    const cold = l.color === l.core && l.intensity > 0.5;
    setLight(`prop:${Math.round(l.x)},${Math.round(l.y)},${l.color}`, {
      x: l.x, y: l.y, radius: l.r, color: l.color, intensity: Math.min(1.3, l.intensity * 1.4), flicker: cold ? 0.05 : 0.25,
      size: Math.min(12, l.r * 0.08), inside: 14, shadows: l.r >= 100,
    });
  }
});
