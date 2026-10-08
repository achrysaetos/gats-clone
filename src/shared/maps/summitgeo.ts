import { make, poly, type MapDoor, type MapPoly, type MapRoof, type Pt } from '../geom.ts';
import type { Geometry } from '../mapgeo.ts';
import type { MapDef } from '../maps.ts';

/**
 * Summit's non-rectangular and moving parts, authored for the west half (withGeometry turns each half a turn for the east):
 * the rink and its goals, the open pools, the hot tubs, pylons, the cars in the lot, the groomer in its bay, the round
 * observatory (a fuel house in the turn), the pine groves and rock outcrops, and every door and roof of the buildings.
 * The grid (summit.ts) holds the timber, stone, counters and snow banks. Read this beside it: a cell is 50 px.
 */
/** The centre line of a grid cell, and the start of a run of cells. */
const mid = (c: number) => c * 50 + 25;
const at = (c: number) => c * 50;

/* -- door helpers: a vertical door fills column `col` from row `row` for `n` cells; a horizontal one fills row `row` from column `col` -- */
type Extra = Partial<Pick<MapDoor, 'hinge' | 'auto' | 'locked' | 'side' | 'closeMs' | 'glow' | 'thick'>>;
const dv = (id: string, kind: MapDoor['kind'], col: number, row: number, n: number, material: string, extra: Extra = {}): MapDoor => ({ id, kind, x: mid(col), y: at(row), w: n * 50, axis: 'v', material, ...extra });
const dh = (id: string, kind: MapDoor['kind'], col: number, row: number, n: number, material: string, extra: Extra = {}): MapDoor => ({ id, kind, x: at(col), y: mid(row), w: n * 50, axis: 'h', material, ...extra });

const WARM = '#ffb347';

export const SUMMIT_DOORS: MapDoor[] = [
  // The lodge, north to south. Guest rooms on the west side of the corridor, each with a connecting door where two share a wall.
  dv('g1', 'swing', 11, 45, 2, 'wood'), dv('g2', 'swing', 11, 52, 2, 'wood'), dv('g3', 'swing', 11, 59, 2, 'wood'), dv('g4', 'swing', 11, 66, 2, 'wood'), dv('g5', 'swing', 11, 73, 2, 'wood'),
  dh('g12', 'swing', 7, 49, 2, 'wood'), dh('g45', 'swing', 7, 70, 2, 'wood'),
  dv('g3x', 'swing', 5, 59, 2, 'wood', { glow: WARM }),
  dh('corr-n', 'swing', 12, 42, 2, 'wood'), dh('corr-s', 'swing', 12, 77, 2, 'wood'),
  dh('fire', 'double-swing', 12, 58, 2, 'wood', { closeMs: 3200 }),
  dv('e0', 'swing', 14, 45, 2, 'wood'), dv('e1', 'swing', 14, 55, 2, 'wood'), dv('e2', 'swing', 14, 64, 2, 'wood'), dv('e3', 'swing', 14, 73, 2, 'wood'),
  dh('e12', 'swing', 16, 60, 2, 'wood'),
  dh('pas-n', 'swing', 16, 42, 2, 'wood', { glow: WARM }), dh('pas-s', 'swing', 16, 77, 2, 'wood', { glow: WARM }),
  dv('bar-w', 'swing', 20, 45, 2, 'wood'), dv('shop-w', 'swing', 20, 73, 2, 'wood'),
  dh('saloon', 'double-swing', 28, 51, 3, 'wood', { glow: WARM, closeMs: 1800 }),
  dh('hall-shop', 'swing', 28, 69, 2, 'wood'),
  dh('bar-deck', 'swing', 29, 42, 2, 'wood', { glow: WARM }),
  dv('bar-terrace', 'swing', 39, 46, 2, 'wood', { glow: WARM }),
  dv('great', 'double-swing', 39, 59, 3, 'glass', { glow: WARM }),
  dv('hall-n', 'swing', 39, 53, 2, 'wood', { glow: WARM }), dv('hall-s', 'swing', 39, 66, 2, 'wood', { glow: WARM }),
  dh('shutter', 'slide', 24, 77, 3, 'metal', { auto: false, glow: WARM }),
  dv('shop-e', 'swing', 39, 73, 2, 'wood', { glow: WARM }),
  // The hunter's cabin in the pines.
  dh('cabin-s', 'swing', 11, 18, 2, 'wood', { glow: WARM }), dh('cabin-n', 'swing', 13, 12, 2, 'wood'),
  // The chairlift station: chained shut at the gate; a service door round the back.
  dh('lift-gate', 'double-swing', 47, 18, 3, 'metal', { locked: true }),
  dh('lift-svc', 'swing', 51, 8, 2, 'metal'),
  // The snowcat garage.
  dh('gar-office', 'swing', 9, 105, 2, 'wood', { glow: WARM }),
  dh('gar-big', 'double-slide', 15, 115, 5, 'metal', { glow: '#ffd9a0' }),
  dv('gar-sleds', 'slide', 26, 108, 3, 'metal', { glow: '#ffd9a0' }),
  dh('gar-n', 'swing', 17, 100, 2, 'wood'),
  dv('gar-alley', 'swing', 5, 110, 2, 'wood'),
  // The ice fishing hut on the lake.
  dv('hut-w', 'swing', 46, 83, 2, 'wood', { glow: WARM }), dv('hut-e', 'swing', 54, 84, 2, 'wood', { glow: WARM }),
  // The observatory (a fuel house in the turn): one door in the round wall.
  { id: 'dome-door', kind: 'double-swing', x: 2565, y: 5240, w: 120, axis: 'v', material: 'metal', glow: '#cfe3ff' },
];

/** Roofs: each building in sections, so walking into the bar does not lift the hall's roof. */
export const SUMMIT_ROOFS: MapRoof[] = [
  { id: 'wing', points: poly.rect(250, 2100, 800, 1800), material: 'shingle' },
  { id: 'bar', points: poly.rect(1000, 2100, 1000, 500), material: 'shingle' },
  { id: 'hall', points: poly.rect(1000, 2550, 1000, 950), material: 'shingle' },
  { id: 'shop', points: poly.rect(1000, 3450, 1000, 450), material: 'shingle' },
  { id: 'cabin', points: poly.rect(400, 600, 450, 350), material: 'shingle' },
  { id: 'lift', points: poly.rect(2000, 400, 850, 550), material: 'tin' },
  { id: 'office', points: poly.rect(250, 5000, 400, 300), material: 'tin' },
  { id: 'bay', points: [{ x: 650, y: 5000 }, { x: 1350, y: 5000 }, { x: 1350, y: 5800 }, { x: 250, y: 5800 }, { x: 250, y: 5300 }, { x: 650, y: 5300 }], material: 'tin' },
  { id: 'hut', points: poly.rect(2300, 4050, 450, 350), material: 'tin' },
  { id: 'dome', points: poly.circle(2300, 5300, 292, 28), material: 'dome' },
];

/* -- the polygons that are one-offs ------------------------------------------------------------------------------------ */

const cap = (x1: number, y1: number, x2: number, y2: number, r: number, seg = 5) => poly.capsule(x1, y1, x2, y2, r, seg);

/** A rounded, slightly chamfered box centred on the origin, nose toward +x. */
const hull = (w: number, h: number, c: number): Pt[] => [
  { x: -w / 2 + c, y: -h / 2 }, { x: w / 2 - c, y: -h / 2 }, { x: w / 2, y: -h / 2 + c }, { x: w / 2, y: h / 2 - c },
  { x: w / 2 - c, y: h / 2 }, { x: -w / 2 + c, y: h / 2 }, { x: -w / 2, y: h / 2 - c }, { x: -w / 2, y: -h / 2 + c },
];

/** The rink boards: a rounded rectangle of low boards round the middle of the lake, with a gate in the middle of each side. Symmetric, so it is not twinned. */
function rinkBoards(): MapPoly[] {
  const cx = 3000, cy = 3000, hx = 700, hy = 400, rc = 170, t = 11, gate = 60;
  const out: MapPoly[] = [];
  const board = (pts: Pt[], id: string) => out.push(make(pts, 'board', { id, height: 22, blocksBullets: false, blocksSight: false }));
  const ax = cx - hx + rc, bx = cx + hx - rc, ay = cy - hy + rc, by = cy + hy - rc;
  for (const [name, y] of [['n', cy - hy], ['s', cy + hy]] as const) {
    board(poly.rect(ax, y - t, cx - gate - ax, 2 * t), `rink-${name}w`);
    board(poly.rect(cx + gate, y - t, bx - cx - gate, 2 * t), `rink-${name}e`);
  }
  for (const [name, x] of [['w', cx - hx], ['e', cx + hx]] as const) {
    board(poly.rect(x - t, ay, 2 * t, cy - gate - ay), `rink-${name}n`);
    board(poly.rect(x - t, cy + gate, 2 * t, by - cy - gate), `rink-${name}s`);
  }
  const corner = (x: number, y: number, a0: number, name: string) => board(poly.arc(x, y, rc - t, rc + t, a0, a0 + Math.PI / 2, 8), `rink-${name}`);
  corner(bx, ay, -Math.PI / 2, 'c-ne'); corner(bx, by, 0, 'c-se'); corner(ax, by, Math.PI / 2, 'c-sw'); corner(ax, ay, Math.PI, 'c-nw');
  return out;
}

/** The poly set that sits on the centre line and is its own half-turn. */
export const SUMMIT_CENTRE: MapPoly[] = [...rinkBoards()];

/** A hand-drawn irregular outline: a star-shaped ring of jittered radii, so it is always a simple polygon. */
export function blob(cx: number, cy: number, r: number, seed: number, n = 9, wobble = 0.26, squash = 1, spin = 0): Pt[] {
  let a = seed >>> 0;
  const rand = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const start = rand() * Math.PI * 2;
  return Array.from({ length: n }, (_, i) => {
    const ang = start + spin + ((i + (rand() - 0.5) * 0.5) / n) * Math.PI * 2;
    const rr = r * (1 + (rand() - 0.5) * 2 * wobble);
    return { x: Math.round(cx + Math.cos(ang) * rr), y: Math.round(cy + Math.sin(ang) * rr * squash) };
  });
}

const car = (id: string, x: number, y: number, rot: number): MapPoly => make(poly.transform(hull(330, 124, 26), { x, y, rot }), 'car', { id, height: 34 });
const sled = (id: string, x: number, y: number, rot: number): MapPoly => make(poly.transform(cap(-50, 0, 50, 0, 30, 4), { x, y, rot }), 'sled', { id, height: 22 });
const tub = (id: string, x: number, y: number): MapPoly => make(poly.circle(x, y, 100, 16), 'tub', { id, height: 26 });

/** The groomer: a body, and the blade that rides in front of it. */
const groomer = (id: string, x: number, y: number, rot: number): MapPoly[] => [
  make(poly.transform(hull(340, 176, 34), { x, y, rot }), 'groomer', { id: `${id}:body`, group: id, part: 'body', shape: 'groomer', height: 44 }),
  make(poly.transform(poly.rect(180, -118, 26, 236), { x, y, rot }), 'groomer', { id: `${id}:blade`, group: id, part: 'blade', shape: 'groomer', height: 22 }),
];

/** The round walls of the observatory (a fuel house in the turn) with a gap for the double door, and the pier in the middle. */
function roundHouse(cx: number, cy: number): MapPoly[] {
  const gap = 0.27;
  return [
    make(poly.arc(cx, cy, 238, 282, gap, Math.PI * 2 - gap, 28), 'ringwall', { id: 'dome-wall', height: 60 }),
    make(poly.circle(cx, cy, 38, 12), 'pier', { id: 'dome-pier', height: 34 }),
  ];
}

/** A pylon, a pole carrying the cable. */
const pylon = (id: string, x: number, y: number): MapPoly => make(poly.circle(x, y, 32, 8), 'pylon', { id, height: 58 });

/** The one-offs, for the west half. */
export const SUMMIT_POLYS: MapPoly[] = [
  // The lake: two open pools in the north-west, a pool and the south in the other, each a place you cannot walk and can shoot over.
  make(blob(2600, 2050, 250, 11, 22, 0.1), 'openwater', { id: 'pool-a', height: 0, blocksBullets: false, blocksSight: false }),
  make(blob(2500, 3750, 220, 12, 22, 0.1), 'openwater', { id: 'pool-b', height: 0, blocksBullets: false, blocksSight: false }),
  // Pressure ridges where the ice buckled.
  make(poly.transform(poly.rect(-110, -16, 220, 32), { x: 2180, y: 2420, rot: -0.5 }), 'iceridge', { id: 'ridge-a', height: 30 }),
  make(poly.transform(poly.rect(-90, -14, 180, 28), { x: 2960, y: 2300, rot: 0.35 }), 'iceridge', { id: 'ridge-b', height: 26 }),
  make(poly.transform(poly.rect(-100, -15, 200, 30), { x: 2240, y: 3420, rot: 0.55 }), 'iceridge', { id: 'ridge-c', height: 28 }),
  // The goal at the west end of the rink; the east goal is its twin.
  make(poly.rect(2385, 2935, 70, 130), 'net', { id: 'goal', height: 34, blocksSight: false }),
  // The hot tubs, and the barrel sauna beside them.
  tub('tub-a', 650, 1800), tub('tub-b', 1000, 1740), tub('tub-c', 1350, 1830),
  make(poly.circle(1620, 1650, 120, 18), 'sauna', { id: 'sauna', height: 52 }),
  // Rails round the deck, with gaps, low enough to shoot over.
  make(poly.rect(400, 1500, 330, 14), 'rail', { id: 'rail-1', height: 14, blocksBullets: false, blocksSight: false }),
  make(poly.rect(860, 1500, 520, 14), 'rail', { id: 'rail-2', height: 14, blocksBullets: false, blocksSight: false }),
  make(poly.rect(1500, 1500, 180, 14), 'rail', { id: 'rail-3', height: 14, blocksBullets: false, blocksSight: false }),
  // The lift: pylons carrying the cable west to the turn at the top, the turn's wheel house, a queue of ropes under the shed roof.
  pylon('pylon-1', 2013, 860), pylon('pylon-2', 1287, 1020),
  make(poly.circle(560, 1180, 84, 14), 'wheelhouse', { id: 'turn', height: 58 }),
  make(poly.rect(2150, 796, 250, 8), 'rope', { id: 'rope-1', height: 12, blocksBullets: false, blocksSight: false }),
  make(poly.rect(2500, 796, 150, 8), 'rope', { id: 'rope-2', height: 12, blocksBullets: false, blocksSight: false }),
  // A snowman someone gave up on, by the closed gate.
  make(poly.circle(2290, 1130, 42, 14), 'snowman', { id: 'snowman', height: 40 }),
  // The elder pine: a spruce twice the height of the rest, strung with lights nobody turned off.
  make(poly.circle(1000, 1250, 175, 20), 'elder', { id: 'elder', height: 70 }),
  // The lot: pickups buried to the doors, and the sleds by the garage.
  car('car-1', 760, 4130, 0.05), car('car-2', 1180, 4170, -0.04), car('car-3', 1600, 4120, 0.02), car('car-4', 900, 4620, Math.PI + 0.06), car('car-5', 1480, 4600, Math.PI - 0.03),
  sled('sled-1', 1560, 5330, 1.57), sled('sled-2', 1560, 5420, 1.57), sled('sled-3', 1560, 5510, 1.57), sled('sled-4', 1660, 5380, 1.2),
  ...groomer('cat', 780, 5400, -0.1),
  // The staging yard in the south-west, where the first squad used to muster: a pickup nosed to the bank and two sleds under a lamp.
  car('car-6', 262, 4600, Math.PI / 2 + 0.05), sled('sled-5', 430, 4800, 1.57), sled('sled-6', 520, 4800, 1.57),
  // The observatory on its ridge (a round fuel house in the turn).
  ...roundHouse(2300, 5300),
];

/* -- groves and outcrops: scattered by a seeded hand, kept clear of everything else -------------------------------------- */

type Disc = { x: number; y: number; r: number };
type Region = { pts: Pt[]; tries: number; blobs: readonly [number, number]; radius: readonly [number, number]; material: string; height: number; gap: number; seed: number; wobble: number; sides: number };

const inside = (pts: readonly Pt[], x: number, y: number): boolean => {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i]!, b = pts[j]!;
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
};

/** The distance from a point to a polygon: zero inside it. */
const polyDist = (pts: readonly Pt[], x: number, y: number): number => {
  if (inside(pts, x, y)) return 0;
  let best = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!, b = pts[(i + 1) % pts.length]!;
    const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
    const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / l2));
    best = Math.min(best, Math.hypot(x - (a.x + dx * t), y - (a.y + dy * t)));
  }
  return best;
};

const GROVES: Region[] = [
  // The Pine Woods: dense clumps, trails left between them.
  { pts: poly.fromPath('90,90 1380,90 1480,520 1450,1100 1220,1480 760,1560 300,1500 90,1100'), tries: 24000, blobs: [3, 6], radius: [48, 84], material: 'pine', height: 58, gap: 84, seed: 101, wobble: 0.25, sides: 10 },
  // Then single young pines in the gaps, so the woods read as woods.
  { pts: poly.fromPath('90,90 1380,90 1480,520 1450,1100 1220,1480 760,1560 300,1500 90,1100'), tries: 6000, blobs: [1, 2], radius: [34, 50], material: 'pine', height: 52, gap: 84, seed: 111, wobble: 0.2, sides: 8 },
  // A thin line of firs on the west shore, and along the north of the lake.
  { pts: poly.fromPath('90,1560 210,1560 210,2000 90,2000'), tries: 80, blobs: [2, 3], radius: [60, 90], material: 'pine', height: 58, gap: 108, seed: 102, wobble: 0.24, sides: 9 },
  { pts: poly.fromPath('1950,1380 2900,1380 2900,1620 1950,1620'), tries: 1500, blobs: [2, 3], radius: [60, 100], material: 'pine', height: 58, gap: 108, seed: 103, wobble: 0.24, sides: 9 },
  // Firs round the south yards.
  { pts: poly.fromPath('90,4900 380,4900 380,5000 90,5000'), tries: 20, blobs: [2, 2], radius: [60, 80], material: 'pine', height: 58, gap: 108, seed: 104, wobble: 0.24, sides: 9 },
  { pts: poly.fromPath('1750,4150 2250,4150 2250,4800 1750,4800'), tries: 1500, blobs: [2, 3], radius: [60, 90], material: 'pine', height: 58, gap: 108, seed: 105, wobble: 0.24, sides: 9 },
  { pts: poly.fromPath('2800,3900 2900,3900 2900,5900 2800,5900'), tries: 100, blobs: [2, 3], radius: [60, 90], material: 'pine', height: 58, gap: 108, seed: 106, wobble: 0.24, sides: 9 },
  // The ridge below the tank farm (the observatory's crags in the turn): broken rock.
  { pts: poly.fromPath('1450,4600 2850,4500 2900,5000 2850,5900 1450,5900 1400,5100'), tries: 6000, blobs: [1, 3], radius: [60, 130], material: 'rock', height: 46, gap: 108, seed: 107, wobble: 0.34, sides: 7 },
];

/** Every wall, prop, zone, spawn and fixed polygon on the whole map (the fixed ones turned too), for the groves to keep clear of. */
function keepouts(base: MapDef, fixed: readonly MapPoly[]): { discs: Disc[]; rects: { x: number; y: number; w: number; h: number }[]; spawns: { x: number; y: number; w: number; h: number }[]; shapes: { pts: Pt[]; box: { x: number; y: number; w: number; h: number } }[] } {
  const discs: Disc[] = [];
  const shapes: { pts: Pt[]; box: { x: number; y: number; w: number; h: number } }[] = [];
  for (const p of fixed) for (const pts of [p.points, p.points.map((q) => ({ x: base.size - q.x, y: base.size - q.y }))]) shapes.push({ pts: [...pts], box: poly.bounds(pts) });
  for (const p of [...base.crates, ...base.barrels, ...base.props]) discs.push({ x: p.x, y: p.y, r: 40 });
  for (const z of base.zones) discs.push({ x: z.x, y: z.y, r: 200 });
  const rects = [...base.walls];
  return { discs, rects, shapes, spawns: Object.values(base.spawns).flat() };
}

/** Groves of pine and outcrops of rock: clusters of overlapping blobs, each blob kept a lane's width from every other cluster and from everything else. Deterministic: the same seed lays the same woods. */
export function groves(base: MapDef, fixed: readonly MapPoly[]): MapPoly[] {
  const { discs, rects, shapes, spawns } = keepouts(base, fixed);
  const out: MapPoly[] = [];
  const size = base.size;
  const rectDist = (x: number, y: number, r: { x: number; y: number; w: number; h: number }) => Math.hypot(Math.max(r.x - x, 0, x - (r.x + r.w)), Math.max(r.y - y, 0, y - (r.y + r.h)));
  const clear = (x: number, y: number, reach: number, gap: number): boolean => {
    for (const d of discs) if (Math.hypot(x - d.x, y - d.y) < d.r + reach + 60) return false;
    for (const r of rects) if (rectDist(x, y, r) < reach + gap) return false;
    for (const r of spawns) if (rectDist(x, y, r) < reach + 48) return false;
    for (const sh of shapes) if (rectDist(x, y, sh.box) < reach + gap && polyDist(sh.pts, x, y) < reach + gap) return false;
    return true;
  };
  // Every blob already laid, with its twin, as discs.
  const laid: (Disc & { group: number })[] = [];
  let id = 0;
  for (const g of GROVES) {
    let a = g.seed >>> 0;
    const rand = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const b = poly.bounds(g.pts);
    for (let k = 0; k < g.tries; k++) {
      const x = b.x + rand() * b.w, y = b.y + rand() * b.h;
      if (!inside(g.pts, x, y)) continue;
      const n = g.blobs[0] + Math.floor(rand() * (g.blobs[1] - g.blobs[0] + 1));
      const parts: { x: number; y: number; reach: number; pts: Pt[] }[] = [];
      for (let i = 0; i < n; i++) {
        const ang = rand() * Math.PI * 2, d = i === 0 ? 0 : 40 + rand() * 70;
        const cx = x + Math.cos(ang) * d, cy = y + Math.sin(ang) * d, r = g.radius[0] + rand() * (g.radius[1] - g.radius[0]);
        const pts = blob(cx, cy, r, g.seed * 977 + id * 31 + i, g.sides, g.wobble);
        parts.push({ x: cx, y: cy, reach: Math.max(...pts.map((q) => Math.hypot(q.x - cx, q.y - cy))), pts });
      }
      const fits = parts.every((p) => {
        if (p.x - p.reach < 60 || p.y - p.reach < 60 || p.x + p.reach > size - 60 || p.y + p.reach > size - 60) return false;
        if (!clear(p.x, p.y, p.reach, g.gap)) return false;
        if (Math.hypot(p.x - (size - p.x), p.y - (size - p.y)) < 2 * p.reach + g.gap) return false;
        return laid.every((o) => Math.hypot(p.x - o.x, p.y - o.y) >= o.r + p.reach + g.gap && Math.hypot(p.x - (size - o.x), p.y - (size - o.y)) >= o.r + p.reach + g.gap);
      });
      if (!fits) continue;
      parts.forEach((p, i) => {
        laid.push({ x: p.x, y: p.y, r: p.reach, group: id });
        out.push(make(p.pts, g.material, { id: `${g.material}-${id}-${i}`, group: `${g.material}-${id}`, height: g.height }));
      });
      id++;
    }
  }
  return out;
}

/** Everything Summit adds to the grid, for the west half; withGeometry adds the east. */
export function summitGeometry(base: MapDef): Geometry & { centre: readonly MapPoly[] } {
  const fixed = [...SUMMIT_POLYS, ...SUMMIT_CENTRE];
  return { polys: [...SUMMIT_POLYS, ...groves(base, fixed)], doors: SUMMIT_DOORS, roofs: SUMMIT_ROOFS, centre: SUMMIT_CENTRE };
}
