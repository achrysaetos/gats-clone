import type { MapPoly, MapRoof, Pt } from '../../shared/geom.ts';
import { MAPS, type MapWall } from '../../shared/maps.ts';
import { WRECKS } from '../../shared/maps/wasteland.ts';
import { INK } from '../palette.ts';

/**
 * Shared bits of the Wasteland theme: its palette, its nine districts, a view of the map's own walls so a painter can tell
 * which edges of a wall face open air, and the small geometry helpers every painter uses. Nothing here touches the DOM
 * except `bake`, which makes one offscreen canvas.
 */
export const CELL = 50;
export const WASTELAND = MAPS.wasteland;
export const SIZE = WASTELAND.size;
export const MID = SIZE / 2;
export const TAU = Math.PI * 2;

/** Rust, sun-bleached khaki, faded paint and green growth, all within the art bible's muted kit. */
export const C = {
  ink: INK,
  // ground
  asphalt: '#5b5851', asphaltHi: '#68645b', asphaltLo: '#4d4b45', crack: '#2f2d29', line: '#a38e4c', lineWhite: '#b9b3a1',
  sand: '#8c7d5c', sandHi: '#a08f6a', sandLo: '#6f6249', dirt: '#6a5a44', dirtLo: '#52453a', mud: '#443a30',
  concrete: '#79756b', concreteHi: '#8d887b', concreteLo: '#5f5c54', concreteFront: '#46443e',
  grass: '#556a3a', grassHi: '#6f8a47', grassLo: '#3f5230', dry: '#8a8248', moss: '#6b8b4b',
  oil: '#2c2a2b', ash: '#4a4843', glass: '#3c5a48',
  // metal and paint
  rust: '#a8552e', rustHi: '#c06a3c', rustLo: '#6e3a20', rustDeep: '#4a2a1a',
  scrapA: '#8a6a4a', scrapB: '#6f7f7a', scrapC: '#9a8a64', scrapD: '#7a4a3a', scrapE: '#4f6f78', scrapF: '#a8794a',
  steel: '#808a99', steelLo: '#4f5560', steelDark: '#3d4450', alu: '#a9b2bd', aluHi: '#cdd5de', aluLo: '#7d8794',
  khaki: '#b4a07a', khakiLo: '#978562', olive: '#6c7356', bone: '#d2cab4', paintRed: '#9a4a3c', paintBlue: '#4a6a8e', paintTeal: '#4f8a82', mustard: '#b79a4a',
  wood: '#8d6b44', woodHi: '#ac8656', woodLo: '#664a2d', tarpBlue: '#4a739a', tarpOrange: '#c9702f', tarpGreen: '#5a7a46',
  // light
  fire: '#ffb347', fireHot: '#ffe08a', rad: '#7fe88a', radLo: '#2f6a40', flare: '#ff5a3a',
} as const;

export const hexA = (hex: string, a: number): string => {
  const v = parseInt(hex.slice(1), 16);
  return `rgba(${(v >> 16) & 255}, ${(v >> 8) & 255}, ${v & 255}, ${a})`;
};

/** Tiny deterministic hash to 0..1. */
export function hash(a: number, b = 0, c = 0): number {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(c | 0, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export const hashStr = (s: string): number => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
};

/** The half-turn twins of the map carry a `~` on their ids: the east and south halves, dressed as the other district of each pair. */
export const isTwin = (id: string | undefined): boolean => !!id && id.endsWith('~');
export const baseId = (id: string): string => (id.endsWith('~') ? id.slice(0, -1) : id);

/* ------------------------------------------------------------ districts */

export type DistrictId = 'overpass' | 'gas' | 'shanty' | 'pool' | 'crater' | 'church' | 'bunker' | 'market' | 'crash';
export type District = {
  id: DistrictId;
  name: string;
  col: 0 | 1 | 2;
  row: 0 | 1 | 2;
  /** The colour and strength of the district's own light, so each corner has its own temperature. */
  light: string;
  glow: number;
  /** A wash over the ground there: rgb triplet and alpha. */
  tint: readonly [string, number];
};

export const DISTRICTS: readonly District[] = [
  { id: 'overpass', name: 'THE OVERPASS', col: 0, row: 0, light: '#ffb15e', glow: 0.5, tint: ['210, 150, 80', 0.07] },
  { id: 'gas', name: 'GAS STATION', col: 1, row: 0, light: '#d9e68a', glow: 0.5, tint: ['190, 210, 110', 0.06] },
  { id: 'shanty', name: 'SHANTY TOWN', col: 2, row: 0, light: '#ff9a4a', glow: 0.55, tint: ['255, 140, 60', 0.08] },
  { id: 'pool', name: 'DRY POOL', col: 0, row: 1, light: '#7fd6c8', glow: 0.5, tint: ['70, 170, 170', 0.08] },
  { id: 'crater', name: 'THE CRATER', col: 1, row: 1, light: '#7fe88a', glow: 0.6, tint: ['100, 220, 120', 0.06] },
  { id: 'church', name: 'OLD CHURCH', col: 2, row: 1, light: '#ffcf8a', glow: 0.5, tint: ['210, 150, 180', 0.05] },
  { id: 'bunker', name: 'BUNKER', col: 0, row: 2, light: '#8fb8e0', glow: 0.5, tint: ['100, 150, 220', 0.07] },
  { id: 'market', name: 'SCRAP MARKET', col: 1, row: 2, light: '#ffd070', glow: 0.55, tint: ['255, 190, 80', 0.07] },
  { id: 'crash', name: 'CRASH SITE', col: 2, row: 2, light: '#cfe0ff', glow: 0.5, tint: ['180, 200, 255', 0.05] },
];
const CUT = [2000, 4000] as const;
export const districtAt = (x: number, y: number): District => {
  const col = x < CUT[0] ? 0 : x < CUT[1] ? 1 : 2, row = y < CUT[0] ? 0 : y < CUT[1] ? 1 : 2;
  return DISTRICTS.find((d) => d.col === col && d.row === row)!;
};
export const districtBox = (d: District) => ({ x0: d.col === 0 ? 0 : CUT[d.col - 1]!, x1: d.col === 2 ? SIZE : CUT[d.col]!, y0: d.row === 0 ? 0 : CUT[d.row - 1]!, y1: d.row === 2 ? SIZE : CUT[d.row]! });
export const districtById = (id: DistrictId): District => DISTRICTS.find((d) => d.id === id)!;

/* ------------------------------------------------------------ sprites */

export type Sprite = { canvas: HTMLCanvasElement; x: number; y: number };
/** Bakes `paint` (in world coordinates) into a canvas covering the box `x0,y0..x1,y1`, so a set piece costs one drawImage a frame. */
export function bake(x0: number, y0: number, x1: number, y1: number, paint: (g: CanvasRenderingContext2D) => void, scale = 1): Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil((x1 - x0) * scale));
  canvas.height = Math.max(1, Math.ceil((y1 - y0) * scale));
  const g = canvas.getContext('2d')!;
  g.scale(scale, scale);
  g.translate(-x0, -y0);
  paint(g);
  return { canvas, x: x0, y: y0 };
}

export const boundsOf = (pts: readonly Pt[]) => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  return { x0, y0, x1, y1 };
};

export const trace = (g: CanvasRenderingContext2D, pts: readonly Pt[]) => {
  g.beginPath();
  pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
  g.closePath();
};

/** A positive-area (clockwise on screen) copy of a polygon, so edge tests agree on which side faces the light. */
export const wound = (pts: readonly Pt[]): Pt[] => {
  let a = 0;
  for (let i = 0; i < pts.length; i++) { const p = pts[i]!, q = pts[(i + 1) % pts.length]!; a += p.x * q.y - q.x * p.y; }
  return a < 0 ? [...pts].reverse() : [...pts];
};

/** South-facing edges of a positive-area polygon: the ones that run leftward on screen (matches geoart.ts). */
export const southEdges = (pts: readonly Pt[]): [Pt, Pt][] => {
  const out: [Pt, Pt][] = [];
  for (let i = 0; i < pts.length; i++) { const a = pts[i]!, b = pts[(i + 1) % pts.length]!; if (b.x < a.x - 0.5) out.push([a, b]); }
  return out;
};

export const inPoly = (x: number, y: number, pts: readonly Pt[]): boolean => {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i]!, b = pts[j]!;
    if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
};

/** A seeded point inside a polygon. */
export function pointIn(pts: readonly Pt[], rand: () => number): Pt {
  const b = boundsOf(pts);
  for (let i = 0; i < 60; i++) {
    const x = b.x0 + rand() * (b.x1 - b.x0), y = b.y0 + rand() * (b.y1 - b.y0);
    if (inPoly(x, y, pts)) return { x, y };
  }
  return { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 };
}

/* ------------------------------------------------------------ wrecks */

/** The turn, scale and position a wreck's outline was placed with, recovered from its first and fifth points. */
export function wreckPlacement(p: MapPoly): { x: number; y: number; rot: number; scale: number } | null {
  const shape = p.shape as keyof typeof WRECKS | undefined;
  const tpl = shape && WRECKS[shape];
  if (!tpl) return null;
  const a = tpl[0]!, b = tpl[4]!, qa = p.points[0]!, qb = p.points[4]!;
  const scale = Math.hypot(qb.x - qa.x, qb.y - qa.y) / Math.hypot(b.x - a.x, b.y - a.y);
  const rot = Math.atan2(qb.y - qa.y, qb.x - qa.x) - Math.atan2(b.y - a.y, b.x - a.x);
  const c = Math.cos(rot), s = Math.sin(rot);
  return { scale, rot, x: qa.x - (a.x * c - a.y * s) * scale, y: qa.y - (a.x * s + a.y * c) * scale };
}

/* ------------------------------------------------------------ walls */

type Bucket = { rects: readonly MapWall[]; cells: Map<number, MapWall[]> };
const buckets = new Map<string, Bucket>();
const BK = 100;
const bkey = (cx: number, cy: number) => cx * 4096 + cy;

function bucketOf(material: string): Bucket {
  let b = buckets.get(material);
  if (b) return b;
  const rects = WASTELAND.walls.filter((w) => w.material === material);
  const cells = new Map<number, MapWall[]>();
  for (const r of rects) {
    for (let cy = Math.floor(r.y / BK); cy <= Math.floor((r.y + r.h) / BK); cy++) {
      for (let cx = Math.floor(r.x / BK); cx <= Math.floor((r.x + r.w) / BK); cx++) {
        const k = bkey(cx, cy), list = cells.get(k);
        if (list) list.push(r); else cells.set(k, [r]);
      }
    }
  }
  buckets.set(material, (b = { rects, cells }));
  return b;
}

export const wallsOf = (material: string): readonly MapWall[] => bucketOf(material).rects;

/** Is the point inside a wall of this material? */
export function insideWall(material: string, x: number, y: number): boolean {
  const list = bucketOf(material).cells.get(bkey(Math.floor(x / BK), Math.floor(y / BK)));
  return !!list?.some((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
}

export type Open = { n: boolean; e: boolean; s: boolean; w: boolean; spans: Record<'n' | 'e' | 's' | 'w', [number, number][]> };
const exposures = new Map<string, Open>();

/** Which sides of this rect face open air rather than another wall of the same material, and which stretches. */
export function openSides(material: string, r: { x: number; y: number; w: number; h: number }): Open {
  const key = `${material}${r.x},${r.y},${r.w},${r.h}`;
  const known = exposures.get(key);
  if (known) return known;
  const step = 5;
  const run = (len: number, at: (t: number) => boolean): [number, number][] => {
    const out: [number, number][] = [];
    let from = -1;
    for (let t = 0; t < len; t += step) {
      const open = at(t + step / 2);
      if (open && from < 0) from = t;
      if (!open && from >= 0) { out.push([from, t]); from = -1; }
    }
    if (from >= 0) out.push([from, len]);
    return out;
  };
  const spans = {
    n: run(r.w, (t) => !insideWall(material, r.x + t, r.y - 2)),
    s: run(r.w, (t) => !insideWall(material, r.x + t, r.y + r.h + 2)),
    w: run(r.h, (t) => !insideWall(material, r.x - 2, r.y + t)),
    e: run(r.h, (t) => !insideWall(material, r.x + r.w + 2, r.y + t)),
  };
  const open: Open = { n: spans.n.length > 0, e: spans.e.length > 0, s: spans.s.length > 0, w: spans.w.length > 0, spans };
  exposures.set(key, open);
  return open;
}

/** Light and shade as a pair of translucent colours, for cel steps. */
export const CEL = { light: 'rgba(255, 244, 214, 0.2)', dark: 'rgba(8, 10, 16, 0.3)' } as const;

/** Roof outlines of a map by id, for painters that need to know what room a point belongs to. */
export const roofById = (id: string): MapRoof | undefined => WASTELAND.roofs?.find((r) => r.id === id);
