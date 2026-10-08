import { MAPS } from '../shared/maps.ts';
import { placed } from '../shared/kit.ts';
import type { RunView, WallView } from '../shared/protocol.ts';
import type { Camera } from './camera.ts';
import { createPool } from './particles.ts';
import { drawLabels } from './world/labels.ts';
import { mapLayoutKey } from './world/layout.ts';
import { describeWorld, type Frame, type Scene } from './world/scene.ts';
import type { Knobs } from './quality.ts';
import { createWorld, type World } from './world/stage.ts';

export { bodyColor } from './world/scene.ts';

/**
 * The world is drawn by PixiJS on its own WebGL canvas under the HUD; this is the seam the frame loop calls.
 * The HUD canvas gets the world's words (names, bars, damage numbers) in the same camera, and is cleared here each frame.
 */
let world: World | null = null;

export async function initWorld(canvas: HTMLCanvasElement, knobs: () => Knobs): Promise<World> {
  world = await createWorld(canvas, knobs);
  return world;
}

export const resizeWorld = (w: number, h: number, dpr: number) => world?.resize(w, h, dpr);
export const worldProbe = () => world?.probe() ?? null;
export const finishWorld = () => world?.finish();

let night = 0;
let nightAt = 0;
const NIGHT_FADE_MS = 1500;

export const nightAmount = () => night;

function easeNight(run: RunView | undefined, now: number): number {
  const target = run?.phase === 'night' ? 1 : 0;
  const step = Math.min(1, Math.max(0, now - nightAt) / NIGHT_FADE_MS);
  nightAt = now;
  night = night < target ? Math.min(target, night + step) : Math.max(target, night - step);
  return night;
}

let tagsDrawn: { id: number; bar: boolean; name: boolean }[] = [];
export const drawnTags = () => tagsDrawn;

function clear(ctx: CanvasRenderingContext2D) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
}

export function drawWorld(ctx: CanvasRenderingContext2D, f: Frame) {
  const scene = describeWorld(f, easeNight(f.snap.run, f.now));
  tagsDrawn = scene.tags.map((t) => ({ id: t.id, bar: t.bar > 0, name: t.name !== null }));
  world?.draw(scene, f.cam, f.now, f.s.walls);
  clear(ctx);
  drawLabels(ctx, scene, f.cam, f.dpr, f.now);
}

const BACKDROP = { zoom: 0.75, swayMs: 40_000, fill: 0.85 } as const;
const BACKDROP_MAP = MAPS.warehouse;
const backdropWalls: WallView[] = BACKDROP_MAP.walls.map((w) => ({ ...w, built: false }));
const noParticles = createPool(1);

/** The menu's view: the warehouse's empty ground drifting slowly behind the cards. */
export function drawBackdrop(ctx: CanvasRenderingContext2D, w: number, h: number, now: number) {
  clear(ctx);
  const { size } = BACKDROP_MAP;
  const zoom = Math.max(BACKDROP.zoom, w / (size * BACKDROP.fill), h / (size * BACKDROP.fill));
  const freeX = size - w / zoom, freeY = size - h / zoom;
  const x = freeX / 2 + (freeX / 2) * Math.sin(now / BACKDROP.swayMs) + w / zoom / 2;
  const y = freeY / 2 + (freeY / 2) * 0.5 * Math.cos(now / BACKDROP.swayMs) + h / zoom / 2;
  const cam: Camera = { x, y, scale: zoom, w, h, viewHalfW: w / zoom / 2, viewHalfH: h / zoom / 2 };
  const view = { x0: x - w / zoom / 2, y0: y - h / zoom / 2, x1: x + w / zoom / 2, y1: y + h / zoom / 2 };
  const scene: Scene = {
    view, size, layout: mapLayoutKey(backdropWalls), dark: 0, zones: [], mines: [], thrown: [], dangers: [], gas: [], trails: [],
    crates: !world?.art.loaded() ? [] : BACKDROP_MAP.breakables.map((at, i) => { const { x, y, w } = placed(at).foot; return { id: i, x, y, size: w, tier: undefined, wear: 0 }; }),
    engineerWalls: [], siege: [], core: null, tracers: [], zombies: [], downed: [], bodies: [], tags: [], cracks: [], ring: null, loot: [], drops: [],
    ghost: null, killer: null, numbers: [], effects: [], particles: noParticles,
  };
  world?.draw(scene, cam, now, backdropWalls);
}
