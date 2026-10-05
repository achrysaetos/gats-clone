import { WORLD, type BuildingKind } from '../shared/defs.ts';
import type { BuildingView, CrateView, RunView, WallView } from '../shared/protocol.ts';
import { cellRect, coreRectAt } from '../shared/sim/build.ts';
import { paintFloor, paintFoliage, paintGrain, type Grain } from './grain.ts';
import { PALETTE } from './palette.ts';

/**
 * The fixed-tilt look: every solid's top face is exactly its collision rect, a thin dark lip shows its bottom and right sides,
 * and one fixed light casts its shadow down and to the right.
 */
export const LIGHT = { x: 0.62, y: 0.78 } as const;
const SHADOW_PER_HEIGHT = 2.2;
/** How far the lip reaches past a solid's rect, down and to the right. Nothing of a solid is drawn further out than this. */
export const LIP = 4;

type SolidKind = 'sandstone' | 'concrete' | 'curb' | 'planter' | 'slate' | 'brick' | 'pad' | 'core';
/** A planter's bed of leaves sits `inset` inside its rim. */
type Bed = { inset: number; ground: string; leaves: readonly (readonly [string, number])[] };
type Material = { top: string; grain: Grain; height: number; bed?: Bed };

const GRAIN: Grain = { specks: 1400, blotches: 4, scratches: 0.6, seams: null, tile: 160 };

export const MATERIALS: Record<SolidKind, Material> = {
  sandstone: { top: '#d1b89f', grain: GRAIN, height: 46 },
  concrete: { top: '#a3abba', grain: GRAIN, height: 46 },
  curb: { top: '#b4b9c2', grain: GRAIN, height: 20 },
  planter: { top: '#b9bdc6', grain: GRAIN, height: 26, bed: { inset: 6, ground: '#1c2617', leaves: [['#2c3b23', 0.4], ['#3a4f2c', 0.35], ['#4b6338', 0.2], ['#64804a', 0.06]] } },
  slate: { top: '#7f8999', grain: { ...GRAIN, seams: 'panel', tile: 50 }, height: 36 },
  brick: { top: '#c7a383', grain: { ...GRAIN, seams: 'brick', tile: 50 }, height: 28 },
  pad: { top: '#bcc0c8', grain: GRAIN, height: 14 },
  core: { top: '#4d5462', grain: GRAIN, height: 56 },
};

const INK_EDGE = 'rgba(26, 28, 34, 0.92)';
const LIP_COLOR = '#4a4f5a';
const HIGHLIGHT = 'rgba(255, 255, 255, 0.75)';

/** `wear` runs from 0 (whole) to 1 (about to break) on solids that can be worn down. */
export type Solid = { kind: SolidKind; x: number; y: number; w: number; h: number; wear?: number };

/** The rect swept along the light by its height, as flat x,y pairs. With both light components positive, the hull of the rect and its moved copy is this hexagon. */
export function shadowHull({ kind, x, y, w, h }: Solid): number[] {
  const len = MATERIALS[kind].height * SHADOW_PER_HEIGHT;
  const dx = LIGHT.x * len, dy = LIGHT.y * len;
  return [x, y, x + w, y, x + w + dx, y + dy, x + w + dx, y + h + dy, x + dx, y + h + dy, x, y + h];
}

const CURB = 18;
/** Blocks no longer than this times their width are cut from sandstone; longer walls are poured concrete. */
const BLOCKY = 1.6;

const mapWallKind = (w: WallView): SolidKind => (w.built ? 'slate' : Math.max(w.w, w.h) <= BLOCKY * Math.min(w.w, w.h) ? 'sandstone' : 'concrete');

export const wallSolids = (walls: readonly WallView[]): Solid[] => walls.map((w) => ({ kind: mapWallKind(w), x: w.x, y: w.y, w: w.w, h: w.h }));

/** The low rim drawn around the arena, outside the playable square. */
export const curbSolids = (size: number): Solid[] => [
  { kind: 'curb', x: -CURB, y: -CURB, w: size + CURB * 2, h: CURB },
  { kind: 'curb', x: -CURB, y: 0, w: CURB, h: size },
  { kind: 'curb', x: size, y: 0, w: CURB, h: size },
  { kind: 'curb', x: -CURB, y: size, w: size + CURB * 2, h: CURB },
];

export const crateSolid = (c: CrateView): Solid => ({ kind: 'planter', x: c.x, y: c.y, w: c.size, h: c.size, wear: 1 - c.hp / WORLD.crateHp });

const BUILDING_SOLID: Record<BuildingKind, SolidKind> = { wall: 'brick', sentry: 'pad', cannon: 'pad' };

/** A building's health arrives in tenths. */
export const buildingSolid = (b: BuildingView): Solid => ({ kind: BUILDING_SOLID[b.kind], ...cellRect(b.cx, b.cy), wear: 1 - b.hp / 10 });

export const coreSolid = (run: RunView): Solid => ({ kind: 'core', ...coreRectAt(run.core) });

type GroundLayer = { canvas: HTMLCanvasElement; x: number; y: number; scale: number };

/** How far the layer reaches past the arena, so the curb's shadow fits. */
const LAYER_PAD = 120;
const LAYER_SCALE = 0.5;
const BLUR_PX = 12;
/** The cast shadow's darkness where it is solid; the blur feathers its edge. */
const SHADOW_ALPHA = 0.3;
const FLOOR_SEED = 7;

function layerCanvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = c.height = Math.ceil((size + LAYER_PAD * 2) * LAYER_SCALE);
  const g = c.getContext('2d')!;
  g.setTransform(LAYER_SCALE, 0, 0, LAYER_SCALE, LAYER_PAD * LAYER_SCALE, LAYER_PAD * LAYER_SCALE);
  return [c, g];
}

function fillHulls(g: CanvasRenderingContext2D, solids: readonly Solid[]) {
  g.fillStyle = '#000';
  g.beginPath();
  for (const s of solids) {
    const p = shadowHull(s);
    g.moveTo(p[0]!, p[1]!);
    for (let i = 2; i < p.length; i += 2) g.lineTo(p[i]!, p[i + 1]!);
    g.closePath();
  }
  g.fill();
}

const solidKey = (solids: readonly Solid[]) => solids.map((s) => `${s.kind}${s.x},${s.y},${s.w},${s.h}`).join('|');

/**
 * The ground under everything: the arena's floor with every cast shadow already on it, rendered off screen at half scale,
 * so a frame draws floor and shadows with one image copy. The floor is painted and the map's solids traced once per layout
 * (`statics` is read only when `layout` changes); the squad's buildings and core re-blur the shadows only when the set of them
 * changes. Overlapping shadows merge instead of darkening each other.
 */
export function createGroundCache() {
  let layout: object | null = null;
  let size = 0;
  let floor: HTMLCanvasElement | null = null;
  let hard: HTMLCanvasElement | null = null;
  let movingKey: string | null = null;
  let layer: GroundLayer | null = null;
  let bakes = 0;
  const get = (nextLayout: object, worldSize: number, statics: () => readonly Solid[], moving: readonly Solid[]): GroundLayer => {
    const key = solidKey(moving);
    if (nextLayout === layout && worldSize === size && key === movingKey && layer) return layer;
    if (nextLayout !== layout || worldSize !== size || !floor || !hard) {
      layout = nextLayout;
      size = worldSize;
      const [f, fg] = layerCanvas(size);
      fg.fillStyle = PALETTE.outside;
      fg.fillRect(-LAYER_PAD, -LAYER_PAD, size + LAYER_PAD * 2, size + LAYER_PAD * 2);
      paintFloor(fg, size, FLOOR_SEED);
      floor = f;
      const [h, hg] = layerCanvas(size);
      fillHulls(hg, statics());
      hard = h;
    }
    movingKey = key;
    let source = hard;
    if (moving.length) {
      const [all, g] = layerCanvas(size);
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.drawImage(hard, 0, 0);
      g.setTransform(LAYER_SCALE, 0, 0, LAYER_SCALE, LAYER_PAD * LAYER_SCALE, LAYER_PAD * LAYER_SCALE);
      fillHulls(g, moving);
      source = all;
    }
    const [out, o] = layerCanvas(size);
    o.setTransform(1, 0, 0, 1, 0, 0);
    o.drawImage(floor, 0, 0);
    o.filter = `blur(${BLUR_PX * LAYER_SCALE}px)`;
    o.globalAlpha = SHADOW_ALPHA;
    o.drawImage(source, 0, 0);
    bakes++;
    layer = { canvas: out, x: -LAYER_PAD, y: -LAYER_PAD, scale: LAYER_SCALE };
    return layer;
  };
  return { get, bakes: () => bakes };
}

/** Copies the part of the layer inside the world-space view rect, and fills any of the view the layer does not reach. */
export function drawGround(ctx: CanvasRenderingContext2D, layer: GroundLayer, x0: number, y0: number, x1: number, y1: number) {
  const lx1 = layer.x + layer.canvas.width / layer.scale, ly1 = layer.y + layer.canvas.height / layer.scale;
  if (x0 < layer.x || y0 < layer.y || x1 > lx1 || y1 > ly1) {
    ctx.fillStyle = PALETTE.outside;
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  }
  const ax = Math.max(layer.x, x0), ay = Math.max(layer.y, y0);
  const bx = Math.min(lx1, x1), by = Math.min(ly1, y1);
  if (bx <= ax || by <= ay) return;
  ctx.drawImage(layer.canvas, (ax - layer.x) * layer.scale, (ay - layer.y) * layer.scale, (bx - ax) * layer.scale, (by - ay) * layer.scale, ax, ay, bx - ax, by - ay);
}

const crateShadows = new Map<number, HTMLCanvasElement>();

/** Crates arrive and leave with the view, so each draws its own pre-blurred shadow rather than re-blurring the layer. */
export function drawCrateShadows(ctx: CanvasRenderingContext2D, crates: readonly Solid[]) {
  const pad = BLUR_PX * 2;
  for (const c of crates) {
    let image = crateShadows.get(c.w);
    if (!image) {
      const side = c.w + MATERIALS.planter.height * SHADOW_PER_HEIGHT + pad * 2;
      image = document.createElement('canvas');
      image.width = image.height = Math.ceil(side * LAYER_SCALE);
      const g = image.getContext('2d')!;
      g.filter = `blur(${BLUR_PX * LAYER_SCALE}px)`;
      g.globalAlpha = SHADOW_ALPHA;
      g.setTransform(LAYER_SCALE, 0, 0, LAYER_SCALE, pad * LAYER_SCALE, pad * LAYER_SCALE);
      fillHulls(g, [{ kind: 'planter', x: 0, y: 0, w: c.w, h: c.h }]);
      crateShadows.set(c.w, image);
    }
    ctx.drawImage(image, c.x - pad, c.y - pad, image.width / LAYER_SCALE, image.height / LAYER_SCALE);
  }
}

const tops = new Map<SolidKind, CanvasPattern>();
const beds = new Map<SolidKind, CanvasPattern>();

/** Each material's grain as a pattern anchored to the world, so it never swims as the camera moves. */
function patternOf(ctx: CanvasRenderingContext2D, cache: Map<SolidKind, CanvasPattern>, kind: SolidKind, paint: () => HTMLCanvasElement): CanvasPattern {
  let p = cache.get(kind);
  if (!p) cache.set(kind, (p = ctx.createPattern(paint(), 'repeat')!));
  return p;
}

/** Every lip first, then every top, so a solid nearer the bottom of the screen covers the lip of one behind it; outlines and highlights go on last. */
export function drawSolids(ctx: CanvasRenderingContext2D, solids: readonly Solid[]) {
  const byKind = new Map<SolidKind, Solid[]>();
  for (const s of solids) {
    const list = byKind.get(s.kind);
    if (list) list.push(s);
    else byKind.set(s.kind, [s]);
  }
  ctx.lineJoin = 'miter';
  ctx.fillStyle = LIP_COLOR;
  ctx.strokeStyle = INK_EDGE;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (const s of solids) ctx.rect(s.x + LIP / 2, s.y + LIP / 2, s.w + LIP / 2, s.h + LIP / 2);
  ctx.fill();
  ctx.stroke();
  for (const [kind, list] of byKind) drawTops(ctx, kind, list);
  ctx.strokeStyle = INK_EDGE;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (const s of solids) ctx.rect(s.x, s.y, s.w, s.h);
  ctx.stroke();
  ctx.strokeStyle = HIGHLIGHT;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  for (const s of solids) {
    ctx.moveTo(s.x + 1.5, s.y + s.h - 1.5);
    ctx.lineTo(s.x + 1.5, s.y + 1.5);
    ctx.lineTo(s.x + s.w - 1.5, s.y + 1.5);
  }
  ctx.stroke();
}

function drawTops(ctx: CanvasRenderingContext2D, kind: SolidKind, list: readonly Solid[]) {
  const m = MATERIALS[kind];
  ctx.fillStyle = patternOf(ctx, tops, kind, () => paintGrain(m.top, m.grain, kind.length * 7919));
  ctx.beginPath();
  for (const s of list) ctx.rect(s.x, s.y, s.w, s.h);
  ctx.fill();
  if (m.bed) drawBeds(ctx, kind, m.bed, list);
  for (const s of list) {
    if (!s.wear) continue;
    ctx.fillStyle = `rgba(20, 22, 28, ${(0.3 * s.wear).toFixed(3)})`;
    ctx.fillRect(s.x, s.y, s.w, s.h);
  }
  drawWearCracks(ctx, list);
}

/** The leaves sit sunk in the rim: a dark line along the bed's top and left edges reads as the rim's inner wall. */
function drawBeds(ctx: CanvasRenderingContext2D, kind: SolidKind, bed: Bed, list: readonly Solid[]) {
  ctx.fillStyle = patternOf(ctx, beds, kind, () => paintFoliage(bed.ground, bed.leaves, 64, 31));
  ctx.beginPath();
  for (const s of list) ctx.rect(s.x + bed.inset, s.y + bed.inset, s.w - bed.inset * 2, s.h - bed.inset * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(20, 24, 18, 0.55)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (const s of list) {
    ctx.moveTo(s.x + bed.inset, s.y + s.h - bed.inset);
    ctx.lineTo(s.x + bed.inset, s.y + bed.inset);
    ctx.lineTo(s.x + s.w - bed.inset, s.y + bed.inset);
  }
  ctx.stroke();
}

const CRACK_STEPS = [0.15, 0.45, 0.75] as const;
const crackCache = new Map<string, number[][]>();

/** A worn solid's cracks, fixed by where it stands so it cracks the same way every frame. */
function cracksAt(s: Solid): number[][] {
  const key = `${s.x},${s.y},${s.w}`;
  let lines = crackCache.get(key);
  if (lines) return lines;
  let seed = (Math.round(s.x) * 73856093) ^ (Math.round(s.y) * 19349663);
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  lines = CRACK_STEPS.map(() => {
    const x = s.w * (0.2 + rnd() * 0.6), y = s.h * (0.15 + rnd() * 0.3);
    return [x, y, x + (rnd() - 0.5) * s.w * 0.45, y + s.h * (0.15 + rnd() * 0.2), x + (rnd() - 0.5) * s.w * 0.6, y + s.h * (0.35 + rnd() * 0.25)];
  });
  if (crackCache.size > 2000) crackCache.clear();
  crackCache.set(key, lines);
  return lines;
}

function drawWearCracks(ctx: CanvasRenderingContext2D, list: readonly Solid[]) {
  ctx.strokeStyle = 'rgba(28, 31, 38, 0.6)';
  ctx.lineWidth = 0.9;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  for (const s of list) {
    const n = CRACK_STEPS.filter((t) => (s.wear ?? 0) > t).length;
    for (const c of cracksAt(s).slice(0, n)) {
      ctx.moveTo(s.x + c[0]!, s.y + c[1]!); ctx.lineTo(s.x + c[2]!, s.y + c[3]!); ctx.lineTo(s.x + c[4]!, s.y + c[5]!);
    }
  }
  ctx.stroke();
  ctx.lineJoin = 'miter';
}
