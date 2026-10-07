import { ROYALE, WORLD, type BuildingKind } from '../shared/defs.ts';
import type { BuildingView, CrateView, RunView, WallView } from '../shared/protocol.ts';
import { cellRect, coreRectAt } from '../shared/sim/build.ts';
import { paintFloor, paintFoliage, paintGrain, paintHazard, type Grain } from './grain.ts';
import { PALETTE } from './palette.ts';

export const LIGHT = { x: 0.62, y: 0.78 } as const;
const SHADOW_PER_HEIGHT = 2.2;
export const LIP = 4;

type SolidKind = 'sandstone' | 'concrete' | 'curb' | 'planter' | 'slate' | 'brick' | 'pad' | 'core';
type Bed = { inset: number; ground: string; leaves: readonly (readonly [string, number])[] };
type Material = { top: string; grain: Grain; height: number; bed?: Bed };

/**
 * The world wears the same kit as the interface (style.css): gunmetal, khaki and olive with an ink outline, each solid
 * cel-shaded in two hard steps, a light edge toward the light and a dark one away from it, over the bone concrete floor.
 * Surfaces stay quiet so a solid reads by its colour and its edges, as the guns and bodies do.
 */
const GRAIN: Grain = { specks: 120, blotches: 0, scratches: 0.2, seams: null, tile: 160 };

export const MATERIALS: Record<SolidKind, Material> = {
  sandstone: { top: '#b4a07a', grain: { ...GRAIN, seams: 'panel', tile: 100 }, height: 46 },
  concrete: { top: '#5d636d', grain: { ...GRAIN, seams: 'panel', tile: 200, rivets: true }, height: 46 },
  curb: { top: '#2b2e34', grain: GRAIN, height: 20 },
  planter: { top: '#6c7356', grain: GRAIN, height: 26, bed: { inset: 6, ground: '#252b1d', leaves: [['#3a4429', 0.45], ['#4d5934', 0.35], ['#66744a', 0.2]] } },
  slate: { top: '#4f5560', grain: { ...GRAIN, seams: 'panel', tile: 50, rivets: true }, height: 36 },
  // A squad's own wall: riveted khaki plate, a shade darker than the map's sandstone so it reads as built, not found.
  brick: { top: '#978562', grain: { ...GRAIN, seams: 'panel', tile: 50, rivets: true }, height: 28 },
  pad: { top: '#454a53', grain: GRAIN, height: 14 },
  core: { top: '#3c414b', grain: GRAIN, height: 56 },
};

/** The arena's edge is hazard tape in the interface's orange, so the map is framed like every other piece of kit. */
const HAZARD = { a: '#2b2e34', b: '#d9541f', band: 12 } as const;

const INK_EDGE = '#1c1f26';
const LIP_COLOR = '#2a2d34';
/** The two hard cel steps, `edge` px wide, on every top face. */
const BEVEL = { light: 'rgba(255, 255, 255, 0.2)', dark: 'rgba(10, 12, 16, 0.28)', edge: 3 } as const;

export type Solid = { kind: SolidKind; x: number; y: number; w: number; h: number; wear?: number };

export function shadowHull({ kind, x, y, w, h }: Solid): number[] {
  const len = MATERIALS[kind].height * SHADOW_PER_HEIGHT;
  const dx = LIGHT.x * len, dy = LIGHT.y * len;
  return [x, y, x + w, y, x + w + dx, y + dy, x + w + dx, y + h + dy, x + dx, y + h + dy, x, y + h];
}

const CURB = 18;
const mapWallKind = (w: WallView): SolidKind => (w.built ? 'slate' : w.material);

export const wallSolids = (walls: readonly WallView[]): Solid[] => walls.map((w) => ({ kind: mapWallKind(w), x: w.x, y: w.y, w: w.w, h: w.h }));

export const curbSolids = (size: number): Solid[] => [
  { kind: 'curb', x: -CURB, y: -CURB, w: size + CURB * 2, h: CURB },
  { kind: 'curb', x: -CURB, y: 0, w: CURB, h: size },
  { kind: 'curb', x: size, y: 0, w: CURB, h: size },
  { kind: 'curb', x: -CURB, y: size, w: size + CURB * 2, h: CURB },
];

export const crateSolid = (c: CrateView): Solid => ({ kind: c.drop ? 'slate' : 'planter', x: c.x, y: c.y, w: c.size, h: c.size, wear: 1 - c.hp / (c.drop ? ROYALE.dropHp : WORLD.crateHp) });

const BUILDING_SOLID: Record<BuildingKind, SolidKind> = { wall: 'brick', sentry: 'pad', cannon: 'pad', scatter: 'pad', mortar: 'pad' };

export const buildingSolid = (b: BuildingView): Solid => ({ kind: BUILDING_SOLID[b.kind], ...cellRect(b.cx, b.cy), wear: 1 - b.hp / 10 });

export const coreSolid = (run: RunView): Solid => ({ kind: 'core', ...coreRectAt(run.core) });

type GroundLayer = { canvas: HTMLCanvasElement; x: number; y: number; scale: number };

const LAYER_PAD = 120;
const LAYER_SCALE = 0.5;
/** Crisp, graphic drop shadows rather than soft photographic ones. */
const BLUR_PX = 3;
const SHADOW_ALPHA = 0.24;
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

export function createGroundCache() {
  let layout: unknown = null;
  let size = 0;
  let floor: HTMLCanvasElement | null = null;
  let hard: HTMLCanvasElement | null = null;
  let movingKey: string | null = null;
  let layer: GroundLayer | null = null;
  let bakes = 0;
  const get = (nextLayout: unknown, worldSize: number, statics: () => readonly Solid[], moving: readonly Solid[] | 'static'): GroundLayer => {
    const key = solidKey(moving === 'static' ? [] : moving);
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
    if (moving !== 'static' && moving.length) {
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
    if (moving === 'static') floor = hard = null;
    layer = { canvas: out, x: -LAYER_PAD, y: -LAYER_PAD, scale: LAYER_SCALE };
    return layer;
  };
  return { get, bakes: () => bakes };
}

export function drawGround(ctx: CanvasRenderingContext2D, layer: GroundLayer, x0: number, y0: number, x1: number, y1: number) {
  const lx1 = layer.x + layer.canvas.width / layer.scale, ly1 = layer.y + layer.canvas.height / layer.scale;
  if (x0 < layer.x || y0 < layer.y || x1 > lx1 || y1 > ly1) {
    ctx.fillStyle = PALETTE.outside;
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  }
  const ax = Math.max(layer.x, x0), ay = Math.max(layer.y, y0);
  const bx = Math.min(lx1, x1), by = Math.min(ly1, y1);
  if (bx <= ax || by <= ay) return;
  // The layer is already blurred; smoothed upscaling of it costs a software canvas about 4ms a frame.
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(layer.canvas, (ax - layer.x) * layer.scale, (ay - layer.y) * layer.scale, (bx - ax) * layer.scale, (by - ay) * layer.scale, ax, ay, bx - ax, by - ay);
  ctx.imageSmoothingEnabled = true;
}

const looseShadows = new Map<string, HTMLCanvasElement>();

export function drawLooseShadows(ctx: CanvasRenderingContext2D, solids: readonly Solid[]) {
  const pad = BLUR_PX * 2;
  for (const s of solids) {
    const key = `${s.kind}${s.w}x${s.h}`;
    let image = looseShadows.get(key);
    if (!image) {
      const reach = MATERIALS[s.kind].height * SHADOW_PER_HEIGHT;
      image = document.createElement('canvas');
      image.width = Math.ceil((s.w + LIGHT.x * reach + pad * 2) * LAYER_SCALE);
      image.height = Math.ceil((s.h + LIGHT.y * reach + pad * 2) * LAYER_SCALE);
      const g = image.getContext('2d')!;
      g.filter = `blur(${BLUR_PX * LAYER_SCALE}px)`;
      g.globalAlpha = SHADOW_ALPHA;
      g.setTransform(LAYER_SCALE, 0, 0, LAYER_SCALE, pad * LAYER_SCALE, pad * LAYER_SCALE);
      fillHulls(g, [{ kind: s.kind, x: 0, y: 0, w: s.w, h: s.h }]);
      looseShadows.set(key, image);
    }
    ctx.drawImage(image, s.x - pad, s.y - pad, image.width / LAYER_SCALE, image.height / LAYER_SCALE);
  }
}

const tops = new Map<SolidKind, CanvasPattern>();
const beds = new Map<SolidKind, CanvasPattern>();

function patternOf(ctx: CanvasRenderingContext2D, cache: Map<SolidKind, CanvasPattern>, kind: SolidKind, paint: () => HTMLCanvasElement): CanvasPattern {
  let p = cache.get(kind);
  if (!p) cache.set(kind, (p = ctx.createPattern(paint(), 'repeat')!));
  return p;
}

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
  const e = BEVEL.edge;
  ctx.fillStyle = BEVEL.light;
  ctx.beginPath();
  for (const s of solids) {
    if (s.kind === 'curb') continue;
    ctx.moveTo(s.x, s.y); ctx.lineTo(s.x + s.w, s.y); ctx.lineTo(s.x + s.w - e, s.y + e); ctx.lineTo(s.x + e, s.y + e); ctx.lineTo(s.x + e, s.y + s.h - e); ctx.lineTo(s.x, s.y + s.h); ctx.closePath();
  }
  ctx.fill();
  ctx.fillStyle = BEVEL.dark;
  ctx.beginPath();
  for (const s of solids) {
    if (s.kind === 'curb') continue;
    ctx.moveTo(s.x + s.w, s.y); ctx.lineTo(s.x + s.w, s.y + s.h); ctx.lineTo(s.x, s.y + s.h); ctx.lineTo(s.x + e, s.y + s.h - e); ctx.lineTo(s.x + s.w - e, s.y + s.h - e); ctx.lineTo(s.x + s.w - e, s.y + e); ctx.closePath();
  }
  ctx.fill();
  ctx.strokeStyle = INK_EDGE;
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (const s of solids) ctx.rect(s.x, s.y, s.w, s.h);
  ctx.stroke();
}

function drawTops(ctx: CanvasRenderingContext2D, kind: SolidKind, list: readonly Solid[]) {
  const m = MATERIALS[kind];
  ctx.fillStyle = patternOf(ctx, tops, kind, () => (kind === 'curb' ? paintHazard(HAZARD.a, HAZARD.b, HAZARD.band) : paintGrain(m.top, m.grain, kind.length * 7919)));
  ctx.beginPath();
  for (const s of list) ctx.rect(s.x, s.y, s.w, s.h);
  // Grain needs no filtering, and filtered pattern fills cost a software canvas 2-3ms a frame across the 6000 maps' big blocks.
  ctx.imageSmoothingEnabled = false;
  ctx.fill();
  ctx.imageSmoothingEnabled = true;
  if (m.bed) drawBeds(ctx, kind, m.bed, list);
  for (const s of list) {
    if (!s.wear) continue;
    ctx.fillStyle = `rgba(20, 22, 28, ${(0.3 * s.wear).toFixed(3)})`;
    ctx.fillRect(s.x, s.y, s.w, s.h);
  }
  drawWearCracks(ctx, list);
}

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
