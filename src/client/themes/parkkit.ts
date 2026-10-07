import { MAPS, type MapWall } from '../../shared/maps.ts';
import { INK } from '../palette.ts';

/**
 * Shared bits of the Park theme: its palette, and a view of the map's own walls so a painter can tell which edges of a
 * hedge, pond or stone rim are open air (and get an outline) and which butt against the next piece of the same stuff.
 */
export const CELL = 50;
export const PARK = MAPS.park;
export const SIZE = PARK.size;
export const MID = SIZE / 2;

export const C = {
  ink: INK,
  grass: '#3f4b33', grassA: '#475437', grassB: '#3a452f', grassDry: '#58583a', grassDeep: '#2f3a28',
  gravel: '#8d8266', gravelHi: '#a3987a', gravelLo: '#6e6550', soil: '#4c4535',
  flag: '#9a9381', flagLo: '#827c6b', flagSeam: '#645f52',
  hedge: '#4f7040', hedgeHi: '#6f9150', hedgeLo: '#3a5632', hedgeFront: '#2f4a2b', hedgeFrontLo: '#223820',
  bark: '#6a4b32', barkHi: '#8b6745', barkLo: '#46321f',
  leaf: '#3f6338', leafMid: '#55794a', leafHi: '#7fa35f', leafLo: '#2b472a',
  stone: '#bab29c', stoneHi: '#d3ccb7', stoneLo: '#8f8872', stoneFront: '#7b7562', moss: '#6b8b4b',
  water: '#2f565a', waterHi: '#4f8582', waterGlint: '#a9d4c8', waterDeep: '#22403f', shallow: '#3e6b69',
  wood: '#8d6b44', woodHi: '#ac8656', woodLo: '#664a2d', iron: '#2b2e34',
  mustard: '#c9a23c', rust: '#a8552e', teal: '#3f7d78', cream: '#e2dccb', rose: '#b4524a',
  lamp: '#ffb347', fire: '#ffe08a',
} as const;

/** Walls of one material, bucketed on a 100 px grid for point lookups. */
type Bucket = { rects: readonly MapWall[]; cells: Map<number, MapWall[]> };
const buckets = new Map<string, Bucket>();
const BK = 100;
const bkey = (cx: number, cy: number) => cx * 4096 + cy;

function bucketOf(material: string): Bucket {
  let b = buckets.get(material);
  if (b) return b;
  // Round trunks are polygons now; the canopies and shadows still hang off a box round each.
  const boxes = material === 'trunk' ? (PARK.polys ?? []).filter((p) => p.shape === 'trunk').map((p) => {
    const xs = p.points.map((q) => q.x), ys = p.points.map((q) => q.y), x = Math.min(...xs), y = Math.min(...ys);
    return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y, material } as MapWall;
  }) : [];
  const rects = [...PARK.walls.filter((w) => w.material === material), ...boxes];
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
export function inside(material: string, x: number, y: number): boolean {
  const list = bucketOf(material).cells.get(bkey(Math.floor(x / BK), Math.floor(y / BK)));
  return !!list?.some((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
}

export type Open = { n: boolean; e: boolean; s: boolean; w: boolean; /** Open spans along each side as [from, to] offsets. */ spans: Record<'n' | 'e' | 's' | 'w', [number, number][]> };

const exposures = new Map<string, Open>();

/**
 * Which sides of this rect face open air rather than another wall of the same material. A side counts as open if any part
 * of it is; `spans` says which parts, in px along the side from its west or north end.
 */
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
    n: run(r.w, (t) => !inside(material, r.x + t, r.y - 2)),
    s: run(r.w, (t) => !inside(material, r.x + t, r.y + r.h + 2)),
    w: run(r.h, (t) => !inside(material, r.x - 2, r.y + t)),
    e: run(r.h, (t) => !inside(material, r.x + r.w + 2, r.y + t)),
  };
  const open: Open = { n: spans.n.length > 0, e: spans.e.length > 0, s: spans.s.length > 0, w: spans.w.length > 0, spans };
  exposures.set(key, open);
  return open;
}

/** A rounded-rect path with a radius per corner (tl, tr, br, bl). */
export function roundedPath(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: readonly [number, number, number, number]) {
  const [tl, tr, br, bl] = r;
  g.moveTo(x + tl, y);
  g.lineTo(x + w - tr, y);
  if (tr) g.arcTo(x + w, y, x + w, y + tr, tr); else g.lineTo(x + w, y);
  g.lineTo(x + w, y + h - br);
  if (br) g.arcTo(x + w, y + h, x + w - br, y + h, br); else g.lineTo(x + w, y + h);
  g.lineTo(x + bl, y + h);
  if (bl) g.arcTo(x, y + h, x, y + h - bl, bl); else g.lineTo(x, y + h);
  g.lineTo(x, y + tl);
  if (tl) g.arcTo(x, y, x + tl, y, tl); else g.lineTo(x, y);
  g.closePath();
}

/** Corner radii that round only the corners where both neighbouring sides are open air. */
export function cornerRadii(o: Open, r: number): [number, number, number, number] {
  return [o.n && o.w ? r : 0, o.n && o.e ? r : 0, o.s && o.e ? r : 0, o.s && o.w ? r : 0];
}

/** Light and shade as a pair of translucent colours, for cel steps. */
export const CEL = { light: 'rgba(255, 252, 230, 0.2)', dark: 'rgba(8, 12, 18, 0.3)' } as const;

/** Where the fountain basin stands: the stone rects within this reach of the map centre are its ring. */
export const FOUNTAIN_REACH = 8.2 * CELL;
export const isBasin = (r: { x: number; y: number; w: number; h: number }) => Math.hypot(r.x + r.w / 2 - MID, r.y + r.h / 2 - MID) < FOUNTAIN_REACH;

/** The two concert shells round zone A and its twin zone C. */
export const SHELLS = [PARK.zones[0]!, PARK.zones[2]!] as const;
export const isShell = (r: { x: number; y: number; w: number; h: number }) => SHELLS.some((z) => Math.hypot(r.x + r.w / 2 - z.x, r.y + r.h / 2 - z.y) < 8.5 * CELL);

/** Tiny deterministic hash to 0..1 for placing things by cell. */
export function hash(a: number, b = 0, c = 0): number {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(c | 0, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/* ------------------------------------------------------------ districts */

export type DistrictId = 'bandstand' | 'playground' | 'lanterns' | 'roses' | 'plaza' | 'courts' | 'boathouse' | 'meadow' | 'orchard';
export type Foliage = { base: string; mid: string; hi: string; lo: string; fruit?: string };
export type District = {
  id: DistrictId;
  name: string;
  /** Column and row of the 3 x 3 split the district fills. */
  col: 0 | 1 | 2;
  row: 0 | 1 | 2;
  /** The colour and strength of the district's own light, so each corner has its own temperature. */
  light: string;
  glow: number;
  /** A faint wash over the lawn there. */
  tint: string;
  foliage: Foliage;
};

const GREEN: Foliage = { base: C.leaf, mid: C.leafMid, hi: C.leafHi, lo: C.leafLo };
export const DISTRICTS: readonly District[] = [
  { id: 'bandstand', name: 'BANDSTAND GREEN', col: 0, row: 0, light: '#ffb45e', glow: 0.5, tint: 'rgba(255, 170, 90, 0.07)', foliage: GREEN },
  { id: 'playground', name: 'PLAYGROUND', col: 1, row: 0, light: '#ffd8a8', glow: 0.4, tint: 'rgba(255, 220, 140, 0.07)', foliage: { base: '#4a7a36', mid: '#689a45', hi: '#9cc267', lo: '#2f5a2b' } },
  { id: 'lanterns', name: 'LANTERN POND', col: 2, row: 0, light: '#7fd6c8', glow: 0.5, tint: 'rgba(60, 170, 170, 0.08)', foliage: { base: '#36605a', mid: '#4b7f73', hi: '#82b49c', lo: '#233f40' } },
  { id: 'roses', name: 'ROSE GARDEN', col: 0, row: 1, light: '#ff9fae', glow: 0.5, tint: 'rgba(255, 120, 150, 0.06)', foliage: { base: '#4a6a3a', mid: '#b4797f', hi: '#e6b2b6', lo: '#2f4a2e' } },
  { id: 'plaza', name: 'FOUNTAIN PLAZA', col: 1, row: 1, light: '#bfe4ff', glow: 0.45, tint: 'rgba(160, 200, 255, 0.05)', foliage: GREEN },
  { id: 'courts', name: 'SPORTS COURTS', col: 2, row: 1, light: '#dce8ff', glow: 0.5, tint: 'rgba(170, 190, 255, 0.05)', foliage: { base: '#3c5f3a', mid: '#527a48', hi: '#7ea45d', lo: '#294629' } },
  { id: 'boathouse', name: 'BOATHOUSE POND', col: 0, row: 2, light: '#9fe0b4', glow: 0.5, tint: 'rgba(60, 150, 110, 0.08)', foliage: { base: '#2f5a3a', mid: '#437a4b', hi: '#6faa66', lo: '#1f4129' } },
  { id: 'meadow', name: 'PICNIC MEADOW', col: 1, row: 2, light: '#f0e68a', glow: 0.4, tint: 'rgba(230, 220, 90, 0.07)', foliage: { base: '#5f8238', mid: '#7ea545', hi: '#b2cf6d', lo: '#3f5f26' } },
  { id: 'orchard', name: 'ORCHARD', col: 2, row: 2, light: '#ff9a4a', glow: 0.5, tint: 'rgba(255, 130, 60, 0.07)', foliage: { base: '#6a7a30', mid: '#c0702f', hi: '#e8a443', lo: '#7a4a1f', fruit: '#c4472f' } },
];
const CUT = [1800, 4200] as const;
export const districtAt = (x: number, y: number): District => {
  const col = x < CUT[0] ? 0 : x < CUT[1] ? 1 : 2, row = y < CUT[0] ? 0 : y < CUT[1] ? 1 : 2;
  return DISTRICTS.find((d) => d.col === col && d.row === row)!;
};
export const districtBox = (d: District) => ({ x0: d.col === 0 ? 0 : CUT[d.col - 1]!, x1: d.col === 2 ? SIZE : CUT[d.col]!, y0: d.row === 0 ? 0 : CUT[d.row - 1]!, y1: d.row === 2 ? SIZE : CUT[d.row]! });
