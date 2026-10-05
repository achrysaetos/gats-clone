import { WORLD, type BuildingKind } from '../shared/defs.ts';
import type { BuildingView, CrateView, RunView, WallView } from '../shared/protocol.ts';
import { cellRect, coreRectAt } from '../shared/sim/build.ts';
import { shade } from './palette.ts';

/**
 * The fixed-tilt look: every solid's top face is exactly its collision rect, a darker front face hangs below it,
 * and one fixed light casts its shadow down and to the right.
 */
export const LIGHT = { x: 0.62, y: 0.78 } as const;
const FACE_PER_HEIGHT = 0.42;
const SHADOW_PER_HEIGHT = 2;

type SolidKind = 'concrete' | 'curb' | 'crate' | 'barricade' | 'sandbag' | 'sentry' | 'cannon' | 'core';
type Material = { top: string; face: string; edge: string; height: number };

export const MATERIALS: Record<SolidKind, Material> = {
  concrete: { top: '#a3a8b0', face: '#6d727b', edge: '#c3c7cd', height: 46 },
  curb: { top: '#8e939c', face: '#5f646d', edge: '#aeb2b9', height: 20 },
  crate: { top: '#d0a86d', face: '#8e6a3a', edge: '#e5c18a', height: 30 },
  barricade: { top: '#3f72bd', face: '#264c85', edge: '#5e8fd6', height: 36 },
  sandbag: { top: '#a3a57c', face: '#676a4b', edge: '#c3c59c', height: 28 },
  sentry: { top: '#8b929e', face: '#585e69', edge: '#adb3bd', height: 14 },
  cannon: { top: '#8c7b66', face: '#5b4e3f', edge: '#ad9c86', height: 16 },
  core: { top: '#39404d', face: '#22272f', edge: '#5a6476', height: 56 },
};

/** `wear` runs from 0 (whole) to 1 (about to break) on solids that can be worn down. */
export type Solid = { kind: SolidKind; x: number; y: number; w: number; h: number; wear?: number };

export const faceDepth = (kind: SolidKind) => MATERIALS[kind].height * FACE_PER_HEIGHT;

/** The rect swept along the light by its height, as flat x,y pairs. With both light components positive, the hull of the rect and its moved copy is this hexagon. */
export function shadowHull({ kind, x, y, w, h }: Solid): number[] {
  const len = MATERIALS[kind].height * SHADOW_PER_HEIGHT;
  const dx = LIGHT.x * len, dy = LIGHT.y * len;
  return [x, y, x + w, y, x + w + dx, y + dy, x + w + dx, y + h + dy, x + dx, y + h + dy, x, y + h];
}

const CURB = 18;

export const wallSolids = (walls: readonly WallView[]): Solid[] => walls.map((w) => ({ kind: w.built ? 'barricade' : 'concrete', x: w.x, y: w.y, w: w.w, h: w.h }));

/** The low rim drawn around the arena, outside the playable square. */
export const curbSolids = (size: number): Solid[] => [
  { kind: 'curb', x: -CURB, y: -CURB, w: size + CURB * 2, h: CURB },
  { kind: 'curb', x: -CURB, y: 0, w: CURB, h: size },
  { kind: 'curb', x: size, y: 0, w: CURB, h: size },
  { kind: 'curb', x: -CURB, y: size, w: size + CURB * 2, h: CURB },
];

export const crateSolid = (c: CrateView): Solid => ({ kind: 'crate', x: c.x, y: c.y, w: c.size, h: c.size, wear: 1 - c.hp / WORLD.crateHp });

const BUILDING_SOLID: Record<BuildingKind, SolidKind> = { wall: 'sandbag', sentry: 'sentry', cannon: 'cannon' };

/** A building's health arrives in tenths. */
export const buildingSolid = (b: BuildingView): Solid => ({ kind: BUILDING_SOLID[b.kind], ...cellRect(b.cx, b.cy), wear: 1 - b.hp / 10 });

export const coreSolid = (run: RunView): Solid => ({ kind: 'core', ...coreRectAt(run.core) });

type ShadowLayer = { canvas: HTMLCanvasElement; x: number; y: number; scale: number };

/** How far the layer reaches past the arena, so the curb's shadow fits. */
const LAYER_PAD = 120;
const LAYER_SCALE = 0.5;
const BLUR_PX = 7;

function layerCanvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = c.height = Math.ceil((size + LAYER_PAD * 2) * LAYER_SCALE);
  return [c, c.getContext('2d')!];
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
 * Cast shadows, rendered off screen at half scale and blurred, so a frame draws them with one image copy.
 * The map's solids are traced once per layout (`statics` is read only when `layout` changes); the squad's buildings and core
 * re-blur the layer only when the set of them changes. Overlapping shadows merge instead of darkening each other.
 */
export function createShadowCache() {
  let layout: object | null = null;
  let hard: [HTMLCanvasElement, CanvasRenderingContext2D] | null = null;
  let size = 0;
  let movingKey: string | null = null;
  let layer: ShadowLayer | null = null;
  let bakes = 0;
  const get = (nextLayout: object, worldSize: number, statics: () => readonly Solid[], moving: readonly Solid[]): ShadowLayer => {
    const key = solidKey(moving);
    if (nextLayout === layout && worldSize === size && key === movingKey && layer) return layer;
    if (nextLayout !== layout || worldSize !== size || !hard) {
      layout = nextLayout;
      size = worldSize;
      hard = layerCanvas(size);
      hard[1].setTransform(LAYER_SCALE, 0, 0, LAYER_SCALE, LAYER_PAD * LAYER_SCALE, LAYER_PAD * LAYER_SCALE);
      fillHulls(hard[1], statics());
    }
    movingKey = key;
    let source = hard[0];
    if (moving.length) {
      const [all, g] = layerCanvas(size);
      g.drawImage(hard[0], 0, 0);
      g.setTransform(LAYER_SCALE, 0, 0, LAYER_SCALE, LAYER_PAD * LAYER_SCALE, LAYER_PAD * LAYER_SCALE);
      fillHulls(g, moving);
      source = all;
    }
    const [out, o] = layerCanvas(size);
    o.filter = `blur(${BLUR_PX * LAYER_SCALE}px)`;
    o.globalAlpha = 0.22;
    o.drawImage(source, 0, 0);
    bakes++;
    layer = { canvas: out, x: -LAYER_PAD, y: -LAYER_PAD, scale: LAYER_SCALE };
    return layer;
  };
  return { get, bakes: () => bakes };
}

/** Copies the part of the layer inside the world-space view rect. */
export function drawShadowLayer(ctx: CanvasRenderingContext2D, layer: ShadowLayer, x0: number, y0: number, x1: number, y1: number) {
  const ax = Math.max(layer.x, x0), ay = Math.max(layer.y, y0);
  const bx = Math.min(layer.x + layer.canvas.width / layer.scale, x1), by = Math.min(layer.y + layer.canvas.height / layer.scale, y1);
  if (bx <= ax || by <= ay) return;
  ctx.drawImage(layer.canvas, (ax - layer.x) * layer.scale, (ay - layer.y) * layer.scale, (bx - ax) * layer.scale, (by - ay) * layer.scale, ax, ay, bx - ax, by - ay);
}

const crateShadows = new Map<number, HTMLCanvasElement>();

/** Crates arrive and leave with the view, so each draws its own pre-blurred shadow rather than re-blurring the layer. */
export function drawCrateShadows(ctx: CanvasRenderingContext2D, crates: readonly Solid[]) {
  for (const c of crates) {
    let image = crateShadows.get(c.w);
    if (!image) {
      const reach = MATERIALS.crate.height * SHADOW_PER_HEIGHT;
      const pad = BLUR_PX * 2;
      const side = c.w + reach + pad * 2;
      image = document.createElement('canvas');
      image.width = image.height = Math.ceil(side * LAYER_SCALE);
      const g = image.getContext('2d')!;
      g.filter = `blur(${BLUR_PX * LAYER_SCALE}px)`;
      g.globalAlpha = 0.22;
      g.setTransform(LAYER_SCALE, 0, 0, LAYER_SCALE, pad * LAYER_SCALE, pad * LAYER_SCALE);
      fillHulls(g, [{ kind: 'crate', x: 0, y: 0, w: c.w, h: c.h }]);
      crateShadows.set(c.w, image);
    }
    const pad = BLUR_PX * 2;
    ctx.drawImage(image, c.x - pad, c.y - pad, image.width / LAYER_SCALE, image.height / LAYER_SCALE);
  }
}

/** Every front face first, then every top, so a solid nearer the bottom of the screen covers the face of one behind it. */
export function drawSolids(ctx: CanvasRenderingContext2D, solids: readonly Solid[]) {
  const byKind = new Map<SolidKind, Solid[]>();
  for (const s of solids) {
    const list = byKind.get(s.kind);
    if (list) list.push(s);
    else byKind.set(s.kind, [s]);
  }
  for (const [kind, list] of byKind) {
    const f = faceDepth(kind);
    ctx.fillStyle = MATERIALS[kind].face;
    ctx.beginPath();
    for (const s of list) ctx.rect(s.x, s.y + s.h, s.w, f);
    ctx.fill();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.14)';
    ctx.beginPath();
    for (const s of list) ctx.rect(s.x, s.y + s.h + f - 2, s.w, 2);
    ctx.fill();
  }
  for (const [kind, list] of byKind) drawTops(ctx, kind, list);
}

function drawTops(ctx: CanvasRenderingContext2D, kind: SolidKind, list: readonly Solid[]) {
  const m = MATERIALS[kind];
  for (const s of list) {
    ctx.fillStyle = s.wear ? shade(m.top, 1 - 0.28 * s.wear) : m.top;
    ctx.fillRect(s.x, s.y, s.w, s.h);
  }
  ctx.lineJoin = 'miter';
  switch (kind) {
    case 'concrete':
    case 'curb':
    case 'core':
      ctx.lineWidth = 2;
      ctx.strokeStyle = m.edge;
      ctx.beginPath();
      for (const s of list) if (s.w > 10 && s.h > 10) ctx.rect(s.x + 3, s.y + 3, s.w - 6, s.h - 6);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
      ctx.beginPath();
      for (const s of list) if (s.w > 16 && s.h > 16) ctx.rect(s.x + 6, s.y + 6, s.w - 12, s.h - 12);
      ctx.fill();
      break;
    case 'crate':
      ctx.strokeStyle = '#a9824b';
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (const s of list) ctx.rect(s.x + 5, s.y + 5, s.w - 10, s.h - 10);
      ctx.stroke();
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      for (const s of list) {
        ctx.moveTo(s.x + 7, s.y + 7); ctx.lineTo(s.x + s.w - 7, s.y + s.h - 7);
        ctx.moveTo(s.x + s.w - 7, s.y + 7); ctx.lineTo(s.x + 7, s.y + s.h - 7);
      }
      ctx.stroke();
      ctx.strokeStyle = m.edge;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (const s of list) ctx.rect(s.x + 1.5, s.y + 1.5, s.w - 3, s.h - 3);
      ctx.stroke();
      break;
    case 'barricade':
      ctx.strokeStyle = 'rgba(10, 30, 70, 0.35)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (const s of list) {
        const along = s.w >= s.h;
        for (let d = 7; d < (along ? s.w : s.h) - 4; d += 7) {
          if (along) { ctx.moveTo(s.x + d, s.y + 4); ctx.lineTo(s.x + d, s.y + s.h - 4); }
          else { ctx.moveTo(s.x + 4, s.y + d); ctx.lineTo(s.x + s.w - 4, s.y + d); }
        }
      }
      ctx.stroke();
      ctx.strokeStyle = m.edge;
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (const s of list) ctx.rect(s.x + 1, s.y + 1, s.w - 2, s.h - 2);
      ctx.stroke();
      break;
    case 'sandbag':
      ctx.strokeStyle = shade(m.face, 1.1);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (const s of list) {
        const course = s.h / 3;
        for (let i = 1; i < 3; i++) { ctx.moveTo(s.x + 2, s.y + i * course); ctx.lineTo(s.x + s.w - 2, s.y + i * course); }
        for (let i = 0; i < 3; i++) for (const bx of i % 2 ? [s.w / 2] : [s.w / 4, (3 * s.w) / 4]) { ctx.moveTo(s.x + bx, s.y + i * course + 2); ctx.lineTo(s.x + bx, s.y + (i + 1) * course - 2); }
      }
      ctx.stroke();
      ctx.strokeStyle = m.edge;
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (const s of list) ctx.rect(s.x + 1, s.y + 1, s.w - 2, s.h - 2);
      ctx.stroke();
      break;
    case 'sentry':
    case 'cannon':
      ctx.strokeStyle = m.edge;
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (const s of list) ctx.rect(s.x + 4, s.y + 4, s.w - 8, s.h - 8);
      ctx.stroke();
      break;
  }
  drawCracks(ctx, list);
}

const CRACK_STEPS = [0.15, 0.45, 0.75] as const;
const crackCache = new Map<string, number[][]>();

/** A solid's cracks, fixed by where it stands so it cracks the same way every frame. */
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

function drawCracks(ctx: CanvasRenderingContext2D, list: readonly Solid[]) {
  ctx.strokeStyle = 'rgba(28, 31, 38, 0.6)';
  ctx.lineWidth = 1.6;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  for (const s of list) {
    const n = CRACK_STEPS.filter((t) => (s.wear ?? 0) > t).length;
    for (const c of cracksAt(s).slice(0, n)) {
      ctx.moveTo(s.x + c[0]!, s.y + c[1]!); ctx.lineTo(s.x + c[2]!, s.y + c[3]!); ctx.lineTo(s.x + c[4]!, s.y + c[5]!);
    }
  }
  ctx.stroke();
}
