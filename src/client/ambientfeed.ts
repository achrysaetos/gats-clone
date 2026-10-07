import { MAPS, type MapId } from '../shared/maps.ts';
import type { Snapshot } from '../shared/protocol.ts';
import { createAmbient } from './ambient.ts';
import { fx as blastFx } from './blastfx.ts';
import { emitSfxAt } from './sfxbus.ts';
import { reducedMotion } from './screenfx.ts';
import type { Session } from './state.ts';
import { mapOf, themeOf } from './themes/registry.ts';

/**
 * The page's one ambient-life instance and its event tap (docs/maps/AMBIENT.md). render.ts calls `drawAmbientGround` right
 * after the walls and `drawAmbientSky` over bodies and roofs; everything else is read from state the client already keeps:
 * muzzle-flash effects (every shot, yours and others'), the blast ring buffer and the snapshot's players. Nothing is written back.
 */
const engine = createAmbient();
const MAP_IDS = Object.keys(MAPS) as MapId[];
let lastFlash = -Infinity, lastBlast = -Infinity;
let reduced = false, reducedAt = -1e9;
let listener = { x: 0, y: 0 };
let skyDark = 0;
let lastStep = 0;
let lastView = { x0: 0, y0: 0, x1: 1280, y1: 800 };
const seen = { shots: 0, booms: 0 };
const DEV = typeof location !== 'undefined' && new URLSearchParams(location.search).has('dev');
/** `?dev&noambient` turns the layer off, for before/after frame-time runs. */
let OFF = DEV && new URLSearchParams(location.search).has('noambient');
const cost = { ms: 0, frames: 0 };

engine.setSound((id, x, y, gain) => {
  const d = Math.hypot(x - listener.x, y - listener.y);
  const g = gain * (1 - d / 1200);
  if (g > 0.03) emitSfxAt(id, x, y, false, { gain: g });
});

type Args = { snap: Snapshot; s: Session; now: number; view: { x0: number; y0: number; x1: number; y1: number }; dark: number };

export function drawAmbientGround(ctx: CanvasRenderingContext2D, a: Args) {
  if (OFF) return;
  const t0 = DEV ? performance.now() : 0;
  const { snap, s, now } = a;
  const map = mapOf(snap.match.map);
  if (!map) return;
  const id = MAP_IDS.find((k) => MAPS[k] === map) ?? snap.match.map;
  if (reducedAt < now - 500 || reducedAt > now) { reduced = reducedMotion(); reducedAt = now; }
  if (engine.mapKey !== id) {
    engine.load(id, map, s.walls);
    // Whatever shots and blasts are already in the buffers are old news.
    lastFlash = s.effects.reduce((m, e) => (e.kind === 'flash' ? Math.max(m, e.born) : m), -Infinity);
    lastBlast = blastFx.blasts.slots.reduce((m, b) => Math.max(m, b.born), -Infinity);
  } else engine.setWalls(s.walls);
  listener = s.lastSelf;
  const dark = Math.max(a.dark, themeOf(map.theme)?.night ?? 0);
  skyDark = dark;
  lastStep = now;
  lastView = a.view;
  engine.step(now, { horde: snap.zombies, players: snap.players, view: a.view, dark, reduced, listener });
  let f = lastFlash;
  for (const e of s.effects) if (e.kind === 'flash' && e.born > lastFlash) { engine.shot(e.x, e.y, now); seen.shots++; if (e.born > f) f = e.born; }
  lastFlash = f;
  let b = lastBlast;
  for (const e of blastFx.blasts.slots) if (e.born > lastBlast && !e.pop) { engine.boom(e.x, e.y, e.r, now); seen.booms++; if (e.born > b) b = e.born; }
  lastBlast = b;
  engine.drawGround(ctx, now, a.view, dark);
  if (DEV) { cost.ms += performance.now() - t0; cost.frames++; }
}

export function drawAmbientSky(ctx: CanvasRenderingContext2D, now: number, view: Args['view']) {
  if (!engine.count || OFF) return;
  const t0 = DEV ? performance.now() : 0;
  engine.drawSky(ctx, now, view, skyDark);
  if (DEV) cost.ms += performance.now() - t0;
}

/** For the dev probe and verification scripts. */
export const ambientEngine = engine;

// `?dev` only: lets verification scripts see the critters and inject a shot or a blast at a place.
if (DEV) {
  Object.assign(window, {
    skirmishAmbient: {
      map: () => engine.mapKey,
      perches: () => engine.groups.flatMap((g) => (g.kind === 'bat' ? [] : g.spots.flatMap((_, i) => (i % 2 ? [] : [{ kind: g.kind, x: g.spots[i]!, y: g.spots[i + 1]! }])))),
      critters: () => engine.crits.slice(0, engine.count).map((c) => ({ kind: c.kind, x: Math.round(c.x), y: Math.round(c.y), z: Math.round(c.z), st: c.st, alpha: +c.alpha.toFixed(2) })),
      shot: (x: number, y: number) => engine.shot(x, y, lastStep),
      boom: (x: number, y: number, r = 120) => engine.boom(x, y, r, lastStep),
      count: () => engine.count,
      seen: () => seen,
      off: (v: boolean) => { OFF = v; },
      /** Rasterised cost: draws the layer n times into a scratch canvas and forces the pixels out. */
      bench: (n = 100) => {
        const c = document.createElement('canvas'); c.width = 1280; c.height = 800;
        const g = c.getContext('2d', { willReadFrequently: false })!;
        const v = lastView; const sx = 1280 / (v.x1 - v.x0);
        const t0 = performance.now();
        for (let i = 0; i < n; i++) { g.setTransform(sx, 0, 0, sx, -v.x0 * sx, -v.y0 * sx); engine.drawGround(g, lastStep, v, skyDark); engine.drawSky(g, lastStep, v, skyDark); }
        g.getImageData(0, 0, 1, 1);
        return (performance.now() - t0) / n;
      },
      cost: () => ({ avgMs: cost.frames ? cost.ms / cost.frames : 0, frames: cost.frames }),
    },
  });
}
