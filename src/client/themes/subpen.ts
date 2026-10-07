import { drawSubmarines, subpenGeo } from './subpengeo.ts';
import { MAPS, type MapDef } from '../../shared/maps.ts';
import type { Rect } from '../../shared/sim/movement.ts';
import { stencil, type FloorPlan } from '../floor.ts';
import { blotch, canvas, paintHazard, seeded } from '../grain.ts';
import { setLight } from '../lighting.ts';
import { FLOOR, INK } from '../palette.ts';
import type { Solid, SolidKind } from '../tilt.ts';
import { registerTheme, type ThemeView } from './registry.ts';
import { districtAt, drawKit, paintDistricts } from './subpenkit.ts';

/**
 * Sub Pen: a covert submarine base. Steel, rust and teal-grey under sodium lamps and red alarm beacons: riveted bulkheads
 * with watertight hatches, torpedo racks, black dock water that shimmers with caustics, grating catwalks on a deck of
 * plate, and two boats moored in their slips with the conning towers rising over the decks. Everything here follows the art
 * bible: ink outlines, a lit top face over a darker front face, two cel steps, one key light from the top left.
 */
const TAU = Math.PI * 2;
const CELL = 50;

const STEEL = { top: '#6d7783', lit: '#929ca8', shade: '#4f5864', face: '#454c57' } as const;
const HULL = { top: '#5f777c', lit: '#829a9d', shade: '#44585e', face: '#35464c' } as const;
const RUST = '#a8552e';
const BEACON = '#ff4d3a';
const WATER = { deep: '#14242a', mid: '#1d3640', wall: '#2a363d', lip: '#5f6a74', line: '#3f7480' } as const;
const SEAM = 'rgba(14, 20, 24, 0.5)';

const rand01 = (a: number, b = 0, c = 0): number => {
  let h = (Math.imul(a | 0, 73856093) ^ Math.imul(b | 0, 19349663) ^ Math.imul(c | 0, 83492791)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0;
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39) >>> 0;
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
};

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const k = Math.min(r, w / 2, h / 2);
  g.moveTo(x + k, y);
  g.arcTo(x + w, y, x + w, y + h, k);
  g.arcTo(x + w, y + h, x, y + h, k);
  g.arcTo(x, y + h, x, y, k);
  g.arcTo(x, y, x + w, y, k);
  g.closePath();
}

/* ------------------------------------------------------------------------------------------------------------------ *
 * Layout knowledge: which grid cells are which, so adjoining pieces of one hull draw as a single body.
 * ------------------------------------------------------------------------------------------------------------------ */

const cells = new Map<SolidKind, Set<number>>();
function cellsOf(kind: SolidKind): Set<number> {
  let set = cells.get(kind);
  if (set) return set;
  set = new Set();
  for (const w of MAPS.subpen.walls) {
    if (w.material !== kind) continue;
    for (let j = 0; j < w.h / CELL; j++) for (let i = 0; i < w.w / CELL; i++) set.add((w.y / CELL + j) * 1000 + w.x / CELL + i);
  }
  cells.set(kind, set);
  return set;
}
const has = (kind: SolidKind, cx: number, cy: number) => cellsOf(kind).has(cy * 1000 + cx);

/** Ink along every edge of a solid that has no neighbour of its own kind: pieces of one hull merge, a hull and a tower do not. */
function outline(g: CanvasRenderingContext2D, s: Solid, width = 2, same: (cx: number, cy: number) => boolean = (cx, cy) => has(s.kind, cx, cy)) {
  const cx = s.x / CELL, cy = s.y / CELL, nx = s.w / CELL, ny = s.h / CELL;
  g.strokeStyle = INK;
  g.lineWidth = width;
  g.lineCap = 'square';
  g.beginPath();
  for (let i = 0; i < nx; i++) {
    if (!same(cx + i, cy - 1)) { g.moveTo(s.x + i * CELL, s.y); g.lineTo(s.x + (i + 1) * CELL, s.y); }
    if (!same(cx + i, cy + ny)) { g.moveTo(s.x + i * CELL, s.y + s.h); g.lineTo(s.x + (i + 1) * CELL, s.y + s.h); }
  }
  for (let j = 0; j < ny; j++) {
    if (!same(cx - 1, cy + j)) { g.moveTo(s.x, s.y + j * CELL); g.lineTo(s.x, s.y + (j + 1) * CELL); }
    if (!same(cx + nx, cy + j)) { g.moveTo(s.x + s.w, s.y + j * CELL); g.lineTo(s.x + s.w, s.y + (j + 1) * CELL); }
  }
  g.stroke();
  g.lineCap = 'butt';
}

/** Runs of the bottom edge with no same-kind cell below: where the front face shows. */
function faceRuns(s: Solid): [number, number][] {
  const cx = s.x / CELL, cy = s.y / CELL, nx = s.w / CELL, ny = s.h / CELL;
  const runs: [number, number][] = [];
  let from = -1;
  for (let i = 0; i <= nx; i++) {
    const exposed = i < nx && !has(s.kind, cx + i, cy + ny);
    if (exposed && from < 0) from = i;
    if (!exposed && from >= 0) { runs.push([s.x + from * CELL, s.x + i * CELL]); from = -1; }
  }
  return runs;
}

/** The front face under a solid's south edge: a flat darker plate with a lit lip, a shaded foot and ink. */
function frontFace(g: CanvasRenderingContext2D, s: Solid, fh: number, color: string, detail?: (x0: number, x1: number, y: number) => void) {
  for (const [x0, x1] of faceRuns(s)) {
    const y = s.y + s.h;
    g.fillStyle = color;
    g.fillRect(x0, y, x1 - x0, fh);
    g.fillStyle = 'rgba(255, 255, 255, 0.13)';
    g.fillRect(x0, y, x1 - x0, 2);
    g.fillStyle = 'rgba(10, 12, 16, 0.34)';
    g.fillRect(x0, y + fh - Math.max(3, fh * 0.28), x1 - x0, Math.max(3, fh * 0.28));
    detail?.(x0, x1, y);
    g.strokeStyle = INK;
    g.lineWidth = 2;
    g.strokeRect(x0, y, x1 - x0, fh);
  }
}

function rivets(g: CanvasRenderingContext2D, pts: readonly (readonly [number, number])[], r: number, dark = 'rgba(14, 18, 22, 0.6)') {
  g.fillStyle = dark;
  g.beginPath();
  for (const [x, y] of pts) { g.moveTo(x + r, y); g.arc(x, y, r, 0, TAU); }
  g.fill();
  g.fillStyle = 'rgba(255, 255, 255, 0.28)';
  g.beginPath();
  for (const [x, y] of pts) { g.moveTo(x - r * 0.2 + r * 0.45, y - r * 0.35); g.arc(x - r * 0.2, y - r * 0.35, r * 0.45, 0, TAU); }
  g.fill();
}

/** Two cel steps on a top face: a lit band toward the light and a shaded band away from it. */
function bevel(g: CanvasRenderingContext2D, s: Solid, e = 4) {
  g.fillStyle = 'rgba(255, 255, 255, 0.22)';
  g.beginPath();
  g.moveTo(s.x, s.y); g.lineTo(s.x + s.w, s.y); g.lineTo(s.x + s.w - e, s.y + e); g.lineTo(s.x + e, s.y + e); g.lineTo(s.x + e, s.y + s.h - e); g.lineTo(s.x, s.y + s.h);
  g.closePath();
  g.fill();
  g.fillStyle = 'rgba(10, 12, 16, 0.3)';
  g.beginPath();
  g.moveTo(s.x + s.w, s.y); g.lineTo(s.x + s.w, s.y + s.h); g.lineTo(s.x, s.y + s.h); g.lineTo(s.x + e, s.y + s.h - e); g.lineTo(s.x + s.w - e, s.y + s.h - e); g.lineTo(s.x + s.w - e, s.y + e);
  g.closePath();
  g.fill();
}

/* ------------------------------------------------------------------------------------------------------------------ *
 * Hull: one cylinder, shaded by the world's coordinates so every piece of it agrees where the light band falls.
 * ------------------------------------------------------------------------------------------------------------------ */

/** Each hull's long axis band, [top, bottom] in world y; the twin is the half turn. */
const HULL_BANDS: readonly (readonly [number, number])[] = [[1850, 2150], [3850, 4150]];
/** The collision pieces of a hull. Those between the bands are the pit under the boat (the vehicle kit's submarine is drawn over them); the rest are the cradle blocks the planes rest on. */
function paintHull(g: CanvasRenderingContext2D, s: Solid) {
  if (inBand(s.y)) { paintPit(g, s); return; }
  frontFace(g, s, 14, '#2f353d', (x0, x1, y) => {
    const studs: [number, number][] = [];
    for (let x = Math.ceil((x0 + 5) / 14) * 14; x < x1 - 4; x += 14) studs.push([x, y + 5]);
    rivets(g, studs, 1.3);
  });
  g.fillStyle = '#56606b';
  g.fillRect(s.x, s.y, s.w, s.h);
  g.fillStyle = 'rgba(255, 255, 255, 0.16)'; g.fillRect(s.x, s.y, s.w, s.h * 0.3);
  g.fillStyle = 'rgba(10, 12, 16, 0.26)'; g.fillRect(s.x, s.y + s.h * 0.74, s.w, s.h * 0.26);
  rivets(g, [[s.x + 10, s.y + 10], [s.x + s.w - 10, s.y + 10], [s.x + 10, s.y + s.h - 10], [s.x + s.w - 10, s.y + s.h - 10]], 2.2);
  g.strokeStyle = SEAM; g.lineWidth = 2; g.strokeRect(s.x + 14, s.y + 14, s.w - 28, s.h - 28);
  bevel(g, s, 3);
  g.strokeStyle = INK; g.lineWidth = 2; g.strokeRect(s.x, s.y, s.w, s.h);
}

/* ------------------------------------------------------------------------------------------------------------------ *
 * Conning tower: a taller body with its own face, drawn as an overlay after the walls so it hangs over the hull below it.
 * ------------------------------------------------------------------------------------------------------------------ */

/** The tower's own cells just carry the deck under the submarine, so there is never a hole in the hull while it bakes. */
function paintTower(g: CanvasRenderingContext2D, s: Solid) {
  g.fillStyle = HULL.top;
  g.fillRect(s.x, s.y, s.w, s.h);
}

/* ------------------------------------------------------------------------------------------------------------------ *
 * Bulkhead: plated steel with a pipe run and a valve across its crown, hatches and a pipe on its face.
 * ------------------------------------------------------------------------------------------------------------------ */

function valve(g: CanvasRenderingContext2D, x: number, y: number, r: number) {
  g.fillStyle = '#a8493f';
  g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  g.strokeStyle = INK; g.lineWidth = 2; g.stroke();
  g.fillStyle = '#5a2a26';
  g.beginPath(); g.arc(x, y, r * 0.38, 0, TAU); g.fill();
  g.strokeStyle = '#5a2a26'; g.lineWidth = 2;
  g.beginPath();
  for (let k = 0; k < 3; k++) { const a = (k * TAU) / 6 + 0.3; g.moveTo(x + Math.cos(a) * r * 0.85, y + Math.sin(a) * r * 0.85); g.lineTo(x - Math.cos(a) * r * 0.85, y - Math.sin(a) * r * 0.85); }
  g.stroke();
  g.fillStyle = 'rgba(255, 255, 255, 0.55)';
  g.fillRect(x - r * 0.55, y - r * 0.6, 2.4, 2.4);
}

function hatchDoor(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  g.fillStyle = '#2f353d';
  g.beginPath(); roundRect(g, x, y, w, h, 4); g.fill();
  g.strokeStyle = INK; g.lineWidth = 1.6; g.stroke();
  g.fillStyle = '#6a7480';
  g.beginPath(); roundRect(g, x + 2.5, y + 2, w - 5, h - 4, 3); g.fill();
  g.fillStyle = '#a8493f';
  g.beginPath(); g.arc(x + w / 2, y + h / 2, 3.2, 0, TAU); g.fill();
  g.strokeStyle = INK; g.lineWidth = 1.2; g.stroke();
  g.fillStyle = 'rgba(14, 18, 22, 0.7)';
  g.fillRect(x + 2, y + 3, 2, 2); g.fillRect(x + 2, y + h - 5, 2, 2);
}

function paintBulkhead(g: CanvasRenderingContext2D, s: Solid) {
  const wall = Math.min(s.w, s.h) <= 100;
  const horiz = s.w >= s.h;
  frontFace(g, s, 16, STEEL.face, (x0, x1, y) => {
    g.strokeStyle = 'rgba(14, 16, 20, 0.5)';
    g.lineWidth = 1.2;
    g.beginPath();
    for (let x = Math.ceil(x0 / 100) * 100; x < x1; x += 100) { g.moveTo(x + 0.5, y + 1); g.lineTo(x + 0.5, y + 16); }
    g.stroke();
    const studs: [number, number][] = [];
    for (let x = Math.ceil((x0 + 4) / 16) * 16; x < x1 - 3; x += 16) studs.push([x, y + 11.5]);
    rivets(g, studs, 1.2);
    if (wall && horiz && x1 - x0 >= 200) {
      for (let x = Math.ceil((x0 + 40) / 100) * 100; x < x1 - 70; x += 100) {
        const r = rand01(x, y);
        if (r < 0.3) hatchDoor(g, x - 11, y + 1, 22, 11);
        else if (r < 0.55) {
          // A pipe running along the face, with brackets.
          g.fillStyle = FLOOR.rust;
          g.fillRect(x - 46, y + 3, 92, 6);
          g.fillStyle = 'rgba(255, 255, 255, 0.28)';
          g.fillRect(x - 46, y + 3, 92, 2);
          g.strokeStyle = INK; g.lineWidth = 1.4;
          g.strokeRect(x - 46, y + 3, 92, 6);
          g.fillStyle = '#3a3f48';
          g.fillRect(x - 30, y + 1, 4, 10); g.fillRect(x + 26, y + 1, 4, 10);
        }
      }
    }
  });
  g.fillStyle = STEEL.top;
  g.fillRect(s.x, s.y, s.w, s.h);
  g.save();
  g.beginPath(); g.rect(s.x, s.y, s.w, s.h); g.clip();
  if (wall) {
    const long = horiz ? s.w : s.h, along = (v: number) => (horiz ? { x: v, y: s.y + s.h / 2 } : { x: s.x + s.w / 2, y: v });
    const start = (horiz ? s.x : s.y);
    // Crown: a lit upper half and a shaded lower half over the plate seams.
    g.fillStyle = STEEL.lit;
    if (horiz) g.fillRect(s.x, s.y, s.w, s.h * 0.34); else g.fillRect(s.x, s.y, s.w * 0.34, s.h);
    g.fillStyle = STEEL.shade;
    if (horiz) g.fillRect(s.x, s.y + s.h * 0.7, s.w, s.h * 0.3); else g.fillRect(s.x + s.w * 0.7, s.y, s.w * 0.3, s.h);
    g.strokeStyle = SEAM;
    g.lineWidth = 2;
    g.beginPath();
    const studs: [number, number][] = [];
    for (let v = Math.ceil(start / 100) * 100; v < start + long; v += 100) {
      if (horiz) { g.moveTo(v, s.y); g.lineTo(v, s.y + s.h); studs.push([v - 6, s.y + 8], [v + 6, s.y + 8], [v - 6, s.y + s.h - 8], [v + 6, s.y + s.h - 8]); }
      else { g.moveTo(s.x, v); g.lineTo(s.x + s.w, v); studs.push([s.x + 8, v - 6], [s.x + 8, v + 6], [s.x + s.w - 8, v - 6], [s.x + s.w - 8, v + 6]); }
    }
    g.stroke();
    rivets(g, studs, 1.7);
    // The pipe run along the crown, with flanges, and a valve wheel now and then.
    if (long >= 300) {
      const p0 = along(start + 20), p1 = along(start + long - 20);
      g.lineCap = 'butt';
      g.strokeStyle = INK; g.lineWidth = 11;
      g.beginPath(); g.moveTo(p0.x, p0.y); g.lineTo(p1.x, p1.y); g.stroke();
      g.strokeStyle = FLOOR.rust; g.lineWidth = 7;
      g.beginPath(); g.moveTo(p0.x, p0.y); g.lineTo(p1.x, p1.y); g.stroke();
      g.strokeStyle = 'rgba(255, 235, 200, 0.4)'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(p0.x - (horiz ? 0 : 2), p0.y - (horiz ? 2 : 0)); g.lineTo(p1.x - (horiz ? 0 : 2), p1.y - (horiz ? 2 : 0)); g.stroke();
      for (let v = Math.ceil((start + 50) / 100) * 100; v < start + long - 30; v += 100) {
        const p = along(v);
        g.fillStyle = '#3a3f48';
        if (horiz) g.fillRect(p.x - 2.5, p.y - 8, 5, 16); else g.fillRect(p.x - 8, p.y - 2.5, 16, 5);
        if (rand01(v, s.y, s.x) < 0.2) valve(g, p.x, p.y, 9);
      }
    }
    // Hazard cap on both ends: a door frame.
    const cap = paintHazardTile();
    g.fillStyle = cap;
    if (horiz) { g.fillRect(s.x, s.y, 10, s.h); g.fillRect(s.x + s.w - 10, s.y, 10, s.h); }
    else { g.fillRect(s.x, s.y, s.w, 10); g.fillRect(s.x, s.y + s.h - 10, s.w, 10); }
  } else {
    // A machinery housing: two tank domes and a vent grille on a plated roof.
    g.fillStyle = STEEL.lit;
    g.fillRect(s.x, s.y, s.w, s.h * 0.2);
    g.fillStyle = STEEL.shade;
    g.fillRect(s.x, s.y + s.h * 0.82, s.w, s.h * 0.18);
    g.strokeStyle = SEAM;
    g.lineWidth = 2;
    g.beginPath();
    for (let x = Math.ceil(s.x / 100) * 100; x < s.x + s.w; x += 100) { g.moveTo(x, s.y); g.lineTo(x, s.y + s.h); }
    for (let y = Math.ceil(s.y / 100) * 100; y < s.y + s.h; y += 100) { g.moveTo(s.x, y); g.lineTo(s.x + s.w, y); }
    g.stroke();
    const r = Math.min(24, Math.min(s.w, s.h) * 0.2);
    const domes = s.w >= s.h ? [[0.28, 0.5], [0.72, 0.5]] : [[0.5, 0.28], [0.5, 0.72]];
    for (const [fx, fy] of domes as [number, number][]) {
      const dx = s.x + s.w * fx, dy = s.y + s.h * fy;
      g.fillStyle = '#7d8793';
      g.beginPath(); g.arc(dx, dy, r, 0, TAU); g.fill();
      g.strokeStyle = INK; g.lineWidth = 2; g.stroke();
      g.fillStyle = STEEL.lit;
      g.beginPath(); g.arc(dx - r * 0.2, dy - r * 0.25, r * 0.62, 0, TAU); g.fill();
      g.fillStyle = 'rgba(255, 255, 255, 0.6)';
      g.fillRect(dx - r * 0.5, dy - r * 0.55, 3, 3);
      valve(g, dx + r * 1.15, dy + r * 0.2, 7);
    }
    g.fillStyle = '#1c2126';
    const gx = s.x + s.w / 2 - 22, gy = s.y + s.h - 22;
    g.fillRect(gx, gy, 44, 12);
    g.fillStyle = '#59646b';
    for (let k = 0; k < 5; k++) g.fillRect(gx + 4 + k * 8, gy + 2, 4, 8);
    g.fillStyle = 'rgba(226, 220, 203, 0.8)';
    stencil(g, `E${1 + Math.floor(rand01(s.x, s.y) * 8)}`, s.x + 12, s.y + 12, 16);
  }
  g.restore();
  bevel(g, s);
  g.strokeStyle = INK;
  g.lineWidth = 2;
  g.strokeRect(s.x, s.y, s.w, s.h);
}

let hazardTile: CanvasPattern | null = null;
function paintHazardTile(): CanvasPattern | string {
  if (hazardTile) return hazardTile;
  const [c, p] = canvas(8);
  p.drawImage(paintHazard('#2b2e34', FLOOR.paint, 7), 0, 0);
  try { hazardTile = c.getContext('2d')!.createPattern(paintHazard('#2b2e34', FLOOR.paint, 7), 'repeat'); } catch { hazardTile = null; }
  return hazardTile ?? FLOOR.paint;
}

/* ------------------------------------------------------------------------------------------------------------------ *
 * Torpedo racks: three or four fish in cradles, warheads orange, bands painted.
 * ------------------------------------------------------------------------------------------------------------------ */

function paintRack(g: CanvasRenderingContext2D, s: Solid) {
  frontFace(g, s, 12, '#2f343c', (x0, x1, y) => {
    g.fillStyle = 'rgba(160, 170, 180, 0.35)';
    for (let x = Math.ceil(x0 / 64) * 64 + 14; x < x1 - 6; x += 64) g.fillRect(x, y + 2, 7, 8);
    g.fillStyle = '#c9a23c';
    g.fillRect(x0, y + 4, x1 - x0, 2);
  });
  g.fillStyle = '#434b55';
  g.fillRect(s.x, s.y, s.w, s.h);
  g.save();
  g.beginPath(); g.rect(s.x, s.y, s.w, s.h); g.clip();
  // Draw along the long axis; a vertical rack is the same art flipped across the diagonal.
  const vertical = s.h > s.w;
  const L = vertical ? s.h : s.w, T = vertical ? s.w : s.h;
  g.translate(s.x, s.y);
  if (vertical) g.transform(0, 1, 1, 0, 0, 0);
  const n = Math.max(1, Math.round(T / 33)), pitch = T / n, d = Math.min(25, pitch - 5);
  const nose = d * 0.9;
  for (let i = 0; i < n; i++) {
    const cy = pitch * (i + 0.5), x0 = 8, x1 = L - 8 - nose * 0.4;
    // Cradle shadow.
    g.fillStyle = 'rgba(8, 10, 14, 0.35)';
    g.beginPath(); roundRect(g, x0 + 2, cy - d / 2 + 3, x1 - x0, d, d / 2); g.fill();
    // Body: lit band over base over shaded band, so the round reads without a gradient.
    g.fillStyle = '#9aa5b0';
    g.beginPath(); roundRect(g, x0, cy - d / 2, x1 - x0, d, d / 2.4); g.fill();
    g.save();
    g.beginPath(); roundRect(g, x0, cy - d / 2, x1 - x0, d, d / 2.4); g.clip();
    g.fillStyle = '#c4ced6';
    g.fillRect(x0, cy - d / 2, x1 - x0, d * 0.28);
    g.fillStyle = '#69747f';
    g.fillRect(x0, cy + d * 0.2, x1 - x0, d * 0.3);
    g.fillStyle = '#2b2e34';
    for (const f of [0.22, 0.26, 0.74]) g.fillRect(x0 + (x1 - x0) * f, cy - d / 2, 4, d);
    g.fillStyle = FLOOR.paint;
    g.fillRect(x0 + (x1 - x0) * 0.46, cy - d / 2, 6, d);
    g.restore();
    g.strokeStyle = INK; g.lineWidth = 2;
    g.beginPath(); roundRect(g, x0, cy - d / 2, x1 - x0, d, d / 2.4); g.stroke();
    // Warhead.
    g.fillStyle = '#d9541f';
    g.beginPath(); g.moveTo(x1 - 2, cy - d / 2); g.quadraticCurveTo(x1 + nose, cy - d / 3, x1 + nose, cy); g.quadraticCurveTo(x1 + nose, cy + d / 3, x1 - 2, cy + d / 2); g.closePath(); g.fill();
    g.stroke();
    g.fillStyle = 'rgba(255, 255, 255, 0.5)';
    g.fillRect(x1 + 2, cy - d * 0.32, 3, 2.4);
    // Stern fins.
    g.fillStyle = '#69747f';
    g.fillRect(x0 - 5, cy - d * 0.4, 6, d * 0.8);
    g.strokeRect(x0 - 5, cy - d * 0.4, 6, d * 0.8);
  }
  // Cradle straps over the fish.
  for (let x = 40; x < L - 30; x += 70) {
    g.fillStyle = '#2f353d';
    g.fillRect(x, 0, 8, T);
    g.strokeStyle = INK; g.lineWidth = 1.5;
    g.strokeRect(x, 0, 8, T);
    g.fillStyle = 'rgba(255, 255, 255, 0.2)';
    g.fillRect(x + 1, 1, 2, T - 2);
  }
  g.restore();
  bevel(g, s, 3);
  g.strokeStyle = INK;
  g.lineWidth = 2;
  g.strokeRect(s.x, s.y, s.w, s.h);
}

/* ------------------------------------------------------------------------------------------------------------------ *
 * Water: a pit of black dock water, a coping of steel round it, the pit's far wall below the north lip. Its caustics move
 * in the under pass; this sprite is the still picture.
 * ------------------------------------------------------------------------------------------------------------------ */

const LIP = 7;
const WALL_FACE = 13;

const inBand = (y: number) => HULL_BANDS.some(([a, b]) => y >= a - 1 && y < b);
/** A cell that is open water in the picture: a slip, or the water either side of a hull's tapered ends. */
const wetCell = (cx: number, cy: number) => has('water', cx, cy) || (has('hull', cx, cy) && inBand(cy * CELL));

/** Pit water for a rectangle of wet cells: coping and the pit's far wall only on edges that face dry deck, so adjoining pieces read as one slip. */
function paintPit(g: CanvasRenderingContext2D, s: Solid) {
  const cx = s.x / CELL, cy = s.y / CELL, nx = s.w / CELL, ny = s.h / CELL;
  g.fillStyle = WATER.deep;
  g.fillRect(s.x, s.y, s.w, s.h);
  g.save();
  g.beginPath(); g.rect(s.x, s.y, s.w, s.h); g.clip();
  g.fillStyle = WATER.mid;
  const rnd = seeded((s.x * 31 + s.y * 17) | 0);
  for (let k = 0; k < Math.max(2, (s.w * s.h) / 14000); k++) {
    const px = s.x + rnd() * s.w, py = s.y + rnd() * s.h, pw = 40 + rnd() * 90, ph = 8 + rnd() * 14;
    g.beginPath(); roundRect(g, px, py, pw, ph, ph / 2); g.fill();
  }
  if (s.kind === 'water' && s.w >= 250 && s.h >= 250) {
    for (let k = 0; k < 2; k++) {
      const bx = s.x + LIP + 36 + rnd() * (s.w - LIP * 2 - 72), by = s.y + LIP + WALL_FACE + 30 + rnd() * (s.h - LIP * 2 - WALL_FACE - 60);
      g.fillStyle = 'rgba(8, 12, 14, 0.5)';
      g.beginPath(); g.ellipse(bx + 3, by + 5, 11, 6, 0, 0, TAU); g.fill();
      g.fillStyle = '#d9541f';
      g.beginPath(); g.arc(bx, by, 9, 0, TAU); g.fill();
      g.strokeStyle = INK; g.lineWidth = 2; g.stroke();
      g.fillStyle = '#e2dccb';
      g.fillRect(bx - 8, by - 1.5, 16, 3);
      g.fillStyle = 'rgba(255, 255, 255, 0.6)';
      g.fillRect(bx - 4, by - 6, 3, 2.4);
    }
  }
  for (let i = 0; i < nx; i++) {
    const x = s.x + i * CELL;
    if (!wetCell(cx + i, cy - 1)) {
      // The pit's north wall seen from the south, a waterline along its foot, under a lit coping.
      g.fillStyle = WATER.lip; g.fillRect(x, s.y, CELL, LIP);
      g.fillStyle = 'rgba(255, 255, 255, 0.16)'; g.fillRect(x, s.y, CELL, 3);
      g.fillStyle = WATER.wall; g.fillRect(x, s.y + LIP, CELL, WALL_FACE);
      g.fillStyle = 'rgba(10, 12, 16, 0.4)'; g.fillRect(x, s.y + LIP + WALL_FACE - 4, CELL, 4);
      g.fillStyle = WATER.line; g.fillRect(x, s.y + LIP + WALL_FACE, CELL, 3);
      g.fillStyle = 'rgba(8, 12, 14, 0.55)'; g.fillRect(x + 30, s.y + LIP, 1.5, WALL_FACE - 4);
    }
    if (!wetCell(cx + i, cy + ny)) {
      g.fillStyle = WATER.lip; g.fillRect(x, s.y + s.h - LIP, CELL, LIP);
      g.fillStyle = 'rgba(10, 12, 16, 0.3)'; g.fillRect(x, s.y + s.h - 3, CELL, 3);
    }
  }
  for (let j = 0; j < ny; j++) {
    const y = s.y + j * CELL;
    if (!wetCell(cx - 1, cy + j)) { g.fillStyle = WATER.lip; g.fillRect(s.x, y, LIP, CELL); g.fillStyle = 'rgba(255, 255, 255, 0.14)'; g.fillRect(s.x, y, 3, CELL); }
    if (!wetCell(cx + nx, cy + j)) { g.fillStyle = WATER.lip; g.fillRect(s.x + s.w - LIP, y, LIP, CELL); g.fillStyle = 'rgba(10, 12, 16, 0.3)'; g.fillRect(s.x + s.w - 3, y, 3, CELL); }
  }
  g.restore();
  outline(g, s, 2.5, wetCell);
}

function paintWater(g: CanvasRenderingContext2D, s: Solid) { paintPit(g, s); }

/* ------------------------------------------------------------------------------------------------------------------ *
 * The floor: deck plate in 100 px panels, grating under the hall catwalks, the dock's painted edge, wet patches.
 * ------------------------------------------------------------------------------------------------------------------ */

const DECK = { base: '#525a60', a: '#59626a', b: '#4a5258', seam: '#2c3236', rivet: '#6c777e', grating: '#171c20', slat: '#4f5a61' } as const;
const HALL: Rect = { x: 500, y: 1650, w: 1800, h: 700 };
const ROOM: Rect = { x: 250, y: 2750, w: 600, h: 700 };

const turn = <T extends Rect>(r: T, size: number): T => ({ ...r, x: size - r.x - r.w, y: size - r.y - r.h });
const circleHits = (x: number, y: number, r: number, w: Rect) => x + r > w.x && x - r < w.x + w.w && y + r > w.y && y - r < w.y + w.h;

function paintDeckFloor(g: CanvasRenderingContext2D, size: number, seed: number, plan: FloorPlan) {
  const rand = seeded(seed ^ 0x5b9e);
  const area = (size * size) / 1_000_000;
  g.fillStyle = DECK.base;
  g.fillRect(0, 0, size, size);
  const tile = 100;
  for (let y = 0; y < size; y += tile) {
    for (let x = 0; x < size; x += tile) {
      const k = rand();
      g.fillStyle = k < 0.35 ? DECK.a : k > 0.7 ? DECK.b : DECK.base;
      if (k < 0.35 || k > 0.7) g.fillRect(x, y, tile, tile);
    }
  }
  for (let i = 0; i < 6 * area; i++) blotch(g, rand() * size, rand() * size, 80 + rand() * 220, "16, 22, 26", 0.04 + rand() * 0.03);
  // Panel joints with a stud in each corner.
  g.fillStyle = DECK.seam;
  for (let x = tile; x < size; x += tile) g.fillRect(x - 1, 0, 2, size);
  for (let y = tile; y < size; y += tile) g.fillRect(0, y - 1, size, 2);
  const studs: [number, number][] = [];
  for (let y = tile; y < size; y += tile) for (let x = tile; x < size; x += tile) studs.push([x - 9, y - 9], [x + 9, y - 9], [x - 9, y + 9], [x + 9, y + 9]);
  g.fillStyle = DECK.rivet;
  g.beginPath();
  for (const [x, y] of studs) { g.moveTo(x + 1.8, y); g.arc(x, y, 1.8, 0, TAU); }
  g.fill();
  // Heavier girder joints every 500.
  g.fillStyle = 'rgba(14, 18, 22, 0.5)';
  for (let x = 500; x < size; x += 500) g.fillRect(x - 2, 0, 4, size);
  for (let y = 500; y < size; y += 500) g.fillRect(0, y - 2, size, 4);

  // Grating over the hall's catwalks and the torpedo room's plate.
  const grating = (r: Rect) => {
    g.fillStyle = DECK.grating;
    g.fillRect(r.x, r.y, r.w, r.h);
    g.fillStyle = DECK.slat;
    for (let y = r.y + 3; y < r.y + r.h - 3; y += 10) g.fillRect(r.x + 2, y, r.w - 4, 4);
    g.fillStyle = 'rgba(255, 255, 255, 0.12)';
    for (let y = r.y + 3; y < r.y + r.h - 3; y += 10) g.fillRect(r.x + 2, y, r.w - 4, 1);
    g.fillStyle = '#2d353b';
    for (let x = r.x + 100; x < r.x + r.w - 6; x += 100) g.fillRect(x - 3, r.y, 6, r.h);
    g.strokeStyle = INK; g.lineWidth = 2;
    g.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
  };
  grating(HALL); grating(turn(HALL, size));
  const plate = (r: Rect) => {
    g.fillStyle = 'rgba(12, 16, 20, 0.22)';
    g.fillRect(r.x, r.y, r.w, r.h);
    g.fillStyle = 'rgba(190, 200, 205, 0.1)';
    for (let y = r.y + 6; y < r.y + r.h - 6; y += 14) for (let x = r.x + 6 + ((y / 14) % 2) * 7; x < r.x + r.w - 10; x += 14) g.fillRect(x, y, 6, 2.4);
  };
  plate(ROOM); plate(turn(ROOM, size));

  const walls = plan.walls as readonly (Rect & { material?: string })[];
  const bulk = walls.filter((w) => w.material === 'bulkhead');
  // A hazard threshold across every hatch gap in a line of bulkhead.
  const mark = paintHazardTile();
  const thresholds: Rect[] = [];
  for (const a of bulk) for (const b of bulk) {
    if (a.y === b.y && a.h === b.h && b.x > a.x + a.w && b.x - (a.x + a.w) <= 200) thresholds.push({ x: a.x + a.w, y: a.y, w: b.x - a.x - a.w, h: a.h });
    if (a.x === b.x && a.w === b.w && b.y > a.y + a.h && b.y - (a.y + a.h) <= 200) thresholds.push({ x: a.x, y: a.y + a.h, w: a.w, h: b.y - a.y - a.h });
  }
  for (const r of thresholds) {
    g.fillStyle = 'rgba(12, 16, 20, 0.45)';
    g.fillRect(r.x, r.y, r.w, r.h);
    g.globalAlpha = 0.55;
    g.fillStyle = mark;
    if (r.w >= r.h) { g.fillRect(r.x + 4, r.y + 6, r.w - 8, 12); g.fillRect(r.x + 4, r.y + r.h - 18, r.w - 8, 12); }
    else { g.fillRect(r.x + 6, r.y + 4, 12, r.h - 8); g.fillRect(r.x + r.w - 18, r.y + 4, 12, r.h - 8); }
    g.globalAlpha = 1;
  }

  // The dock's painted edge round every slip, worn, and a dark drain strip under the lip.
  const water = walls.filter((w) => w.material === 'water');
  g.strokeStyle = FLOOR.paint;
  g.globalAlpha = 0.62;
  g.lineWidth = 6;
  g.setLineDash([34, 20]);
  for (const w of water) g.strokeRect(w.x - 16, w.y - 16, w.w + 32, w.h + 32);
  g.setLineDash([]);
  g.globalAlpha = 1;

  // Stains, puddles and drains kept to the quiet end of the range: wet steel, not clutter.
  const wet = seeded(seed ^ 0x3a11);
  const pits = walls.filter((w) => w.material === 'water');
  for (let i = 0; i < 70 * area; i++) {
    const x = wet() * size, y = wet() * size, r = 10 + wet() * 18;
    if (!pits.some((w) => circleHits(x, y, 170, w))) continue;
    if (walls.some((w) => circleHits(x, y, r + 8, w))) continue;
    g.fillStyle = 'rgba(12, 22, 28, 0.2)';
    g.beginPath(); g.ellipse(x, y, r * 1.35, r, 0, 0, TAU); g.fill();
    g.fillStyle = 'rgba(95, 168, 164, 0.14)';
    g.beginPath(); g.ellipse(x - r * 0.25, y - r * 0.3, r * 0.7, r * 0.32, 0, 0, TAU); g.fill();
  }
  const oil = seeded(seed ^ 0x0112);
  for (let i = 0; i < 1 * area; i++) {
    const x = oil() * size, y = oil() * size, r = 12 + oil() * 22;
    if (walls.some((w) => circleHits(x, y, r, w))) continue;
    g.fillStyle = 'rgba(10, 10, 14, 0.16)';
    g.beginPath(); g.ellipse(x, y, r * 1.3, r, 0.3, 0, TAU); g.fill();
  }
  const dr = seeded(seed ^ 0xd2a1);
  for (let i = 0; i < 0.9 * area; i++) {
    const x = Math.round((dr() * size) / 100) * 100, y = Math.round((dr() * size) / 100) * 100;
    if (walls.some((w) => circleHits(x, y, 40, w)) || (x > HALL.x && x < HALL.x + HALL.w && y > HALL.y && y < HALL.y + HALL.h)) continue;
    g.fillStyle = 'rgba(168, 85, 46, 0.2)';
    g.beginPath(); g.ellipse(x + 10, y + 26, 34, 20, 0, 0, TAU); g.fill();
    g.fillStyle = '#1c2126';
    g.fillRect(x - 26, y - 16, 52, 32);
    g.fillStyle = '#4f5a61';
    for (let k = 0; k < 6; k++) g.fillRect(x - 22 + k * 8, y - 12, 4, 24);
    g.strokeStyle = INK; g.lineWidth = 2;
    g.strokeRect(x - 26, y - 16, 52, 32);
  }
  // Steam vents: a grille on the deck where the pipework below breathes out.
  for (const v of VENTS) for (const p of [v, { x: size - v.x, y: size - v.y }]) {
    g.fillStyle = '#1c2126';
    g.beginPath(); roundRect(g, p.x - 22, p.y - 14, 44, 28, 6); g.fill();
    g.fillStyle = '#59646b';
    for (let k = 0; k < 4; k++) g.fillRect(p.x - 17, p.y - 9 + k * 6, 34, 3);
    g.strokeStyle = INK; g.lineWidth = 2;
    g.beginPath(); roundRect(g, p.x - 22, p.y - 14, 44, 28, 6); g.stroke();
  }

  paintDistricts(g, seed, walls);
  paintMarkings(g, plan, seed);

  // Grime gathers toward the map's edge.
  const rim = 160;
  for (const [x0, y0, x1, y1, rx, ry, rw, rh] of [
    [0, 0, 0, rim, 0, 0, size, rim], [0, size, 0, size - rim, 0, size - rim, size, rim],
    [0, 0, rim, 0, 0, 0, rim, size], [size, 0, size - rim, 0, size - rim, 0, rim, size],
  ] as const) {
    const grad = g.createLinearGradient(x0, y0, x1, y1);
    grad.addColorStop(0, 'rgba(8, 12, 16, 0.5)');
    grad.addColorStop(1, 'rgba(8, 12, 16, 0)');
    g.fillStyle = grad;
    g.fillRect(rx, ry, rw, rh);
  }
}

/** Deployment pads and capture zones, in the pen's own paint. */
function paintMarkings(g: CanvasRenderingContext2D, plan: FloorPlan, seed: number) {
  const mark = paintHazardTile();
  for (const pad of plan.pads) {
    const tint = pad.team === 'red' ? FLOOR.red : pad.team === 'blue' ? FLOOR.blue : FLOOR.paint;
    g.fillStyle = 'rgba(10, 14, 18, 0.34)';
    g.fillRect(pad.x, pad.y, pad.w, pad.h);
    g.strokeStyle = tint;
    g.globalAlpha = 0.75;
    g.lineWidth = 5;
    const L = 26;
    g.beginPath();
    for (const [cx, cy, sx, sy] of [[pad.x, pad.y, 1, 1], [pad.x + pad.w, pad.y, -1, 1], [pad.x, pad.y + pad.h, 1, -1], [pad.x + pad.w, pad.y + pad.h, -1, -1]] as const) {
      g.moveTo(cx + sx * L, cy + sy * 2.5); g.lineTo(cx + sx * 2.5, cy + sy * 2.5); g.lineTo(cx + sx * 2.5, cy + sy * L);
    }
    g.stroke();
    g.globalAlpha = 0.5;
    g.fillStyle = mark;
    g.fillRect(pad.x, pad.y - 14, pad.w, 8);
    g.fillRect(pad.x, pad.y + pad.h + 6, pad.w, 8);
    g.globalAlpha = 1;
  }
  const r = plan.zoneRadius;
  for (const z of plan.zones) {
    g.globalAlpha = 0.16;
    g.fillStyle = '#0c1014';
    g.beginPath(); g.arc(z.x, z.y, r - 6, 0, TAU); g.fill();
    g.globalAlpha = 0.6;
    g.fillStyle = mark;
    for (let k = 0; k < 24; k++) {
      const a0 = (k / 24) * TAU + 0.03, a1 = ((k + 0.62) / 24) * TAU;
      g.beginPath(); g.arc(z.x, z.y, r + 12, a0, a1); g.arc(z.x, z.y, r + 22, a1, a0, true); g.closePath(); g.fill();
    }
    g.globalAlpha = 0.45;
    g.fillStyle = '#d9d2bd';
    for (let k = 0; k < 4; k++) {
      g.save();
      g.translate(z.x, z.y);
      g.rotate((k * TAU) / 4 + seed * 0);
      g.beginPath();
      g.moveTo(r + 44, 0); g.lineTo(r + 74, -20); g.lineTo(r + 74, -8); g.lineTo(r + 98, 0); g.lineTo(r + 74, 8); g.lineTo(r + 74, 20);
      g.closePath();
      g.restore();
      g.fill();
    }
    g.globalAlpha = 1;
  }
}

/* ------------------------------------------------------------------------------------------------------------------ *
 * The under pass: everything that moves or glows, built once per map from where the walls stand.
 * ------------------------------------------------------------------------------------------------------------------ */

const VENTS = [{ x: 1700, y: 2575 }, { x: 700, y: 3725 }, { x: 2600, y: 4825 }] as const;
type Lamp = { x: number; y: number; dx: number; dy: number };
type Beacon = { x: number; y: number; phase: number };
type Drip = { x: number; y: number; period: number; phase: number };
type Sites = { water: Rect[]; lamps: Lamp[]; beacons: Beacon[]; drips: Drip[]; towers: Rect[]; vents: { x: number; y: number }[] };
const sitesOf = new WeakMap<MapDef, Sites>();

function sites(map: MapDef): Sites {
  let s = sitesOf.get(map);
  if (s) return s;
  const size = map.size;
  const walls = map.walls;
  const lamps: Lamp[] = [], drips: Drip[] = [];
  for (const w of walls) {
    if (w.material === 'bulkhead') {
      const horiz = w.w >= w.h;
      if (Math.min(w.w, w.h) <= 100) {
        const long = horiz ? w.w : w.h;
        for (let v = 150 + (rand01(w.x, w.y) * 100 | 0); v < long - 90; v += 600) {
          if (horiz) { lamps.push({ x: w.x + v, y: w.y + w.h, dx: 0, dy: 1 }); drips.push({ x: w.x + v + 60, y: w.y + w.h + 18 + rand01(v, w.y) * 20, period: 2400 + rand01(v, w.x) * 2600, phase: rand01(w.x, v) * 5000 }); }
          else lamps.push({ x: w.x + w.w, y: w.y + v, dx: 1, dy: 0 });
        }
      } else lamps.push({ x: w.x + w.w / 2, y: w.y + w.h, dx: 0, dy: 1 });
    }
  }
  const water = walls.filter((w) => w.material === 'water') as Rect[];
  const wet = walls.filter((w) => w.material === 'water' || (w.material === 'hull' && inBand(w.y))) as Rect[];
  for (const w of water.filter((r) => r.w >= 150 && r.h >= 150)) for (let k = 0; k < 3; k++) drips.push({ x: w.x + 30 + rand01(w.x, k) * (w.w - 60), y: w.y + WALL_FACE + 14 + rand01(w.y, k) * (w.h - 40), period: 1800 + rand01(w.w, k) * 2600, phase: rand01(k, w.y) * 4000 });
  const west: Beacon[] = [
    { x: 1240, y: 1940, phase: 0 }, { x: 775, y: 1575, phase: 1.3 }, { x: 975, y: 1575, phase: 2.6 }, { x: 1275, y: 2375, phase: 3.9 }, { x: 625, y: 2675, phase: 5.1 },
  ];
  const beacons = [...west, ...west.map((b) => ({ x: size - b.x, y: size - b.y, phase: b.phase + 0.7 }))];
  const towers = walls.filter((w) => w.material === 'tower') as Rect[];
  const vents = VENTS.flatMap((v) => [{ ...v }, { x: size - v.x, y: size - v.y }]);
  s = { water: wet, lamps, beacons, drips, towers, vents };
  sitesOf.set(map, s);
  return s;
}

const inView = (v: ThemeView, x: number, y: number, r: number) => x + r > v.x0 && x - r < v.x1 && y + r > v.y0 && y - r < v.y1;

/** A tile of caustic light: chunky, wrapping bands of pale teal, in flat translucent shapes. */
let caustic: CanvasPattern | null = null;
function causticPattern(ctx: CanvasRenderingContext2D): CanvasPattern | null {
  if (caustic) return caustic;
  const T = 192;
  const [c, g] = canvas(T);
  const rnd = seeded(0xc0ffee);
  g.strokeStyle = 'rgba(150, 226, 214, 0.34)';
  g.fillStyle = 'rgba(150, 226, 214, 0.1)';
  g.lineWidth = 4;
  g.lineJoin = 'round';
  for (let i = 0; i < 9; i++) {
    const cx = rnd() * T, cy = rnd() * T, r = 18 + rnd() * 26, n = 5 + Math.floor(rnd() * 2);
    for (const ox of [-T, 0, T]) for (const oy of [-T, 0, T]) {
      const px = cx + ox, py = cy + oy;
      if (px + r * 1.4 < 0 || px - r * 1.4 > T || py + r * 1.4 < 0 || py - r * 1.4 > T) continue;
      g.beginPath();
      for (let k = 0; k <= n; k++) {
        const a = (k / n) * TAU + i, rr = r * (0.75 + 0.35 * ((k * 7 + i * 3) % 3) / 2);
        const x = px + Math.cos(a) * rr * 1.3, y = py + Math.sin(a) * rr;
        if (k) g.lineTo(x, y); else g.moveTo(x, y);
      }
      g.closePath();
      g.fill();
      g.stroke();
    }
  }
  try { caustic = ctx.createPattern(c, 'repeat'); } catch { caustic = null; }
  return caustic;
}

function drawWater(ctx: CanvasRenderingContext2D, now: number, view: ThemeView, water: readonly Rect[]) {
  const pat = causticPattern(ctx);
  if (!pat) return;
  const t = now / 1000;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const w of water) {
    if (!inView(view, w.x + w.w / 2, w.y + w.h / 2, Math.max(w.w, w.h))) continue;
    const cx = w.x / CELL, cy = w.y / CELL, nx = w.w / CELL, ny = w.h / CELL;
    const open = (f: (i: number) => boolean, n: number) => Array.from({ length: n }, (_, i) => f(i)).every(Boolean);
    const iT = open((i) => wetCell(cx + i, cy - 1), nx) ? 0 : LIP + WALL_FACE + 3, iB = open((i) => wetCell(cx + i, cy + ny), nx) ? 0 : LIP;
    const iL = open((j) => wetCell(cx - 1, cy + j), ny) ? 0 : LIP, iR = open((j) => wetCell(cx + nx, cy + j), ny) ? 0 : LIP;
    const ix = w.x + iL, iy = w.y + iT, iw = w.w - iL - iR, ih = w.h - iT - iB;
    ctx.save();
    ctx.beginPath();
    ctx.rect(ix, iy, iw, ih);
    ctx.clip();
    // Two layers drifting different ways, one coarser: the light on the bottom moving under a slow swell.
    for (const [scale, vx, vy, a] of [[1, 9, 5, 0.5], [1.7, -6, 8, 0.38]] as const) {
      pat.setTransform(new DOMMatrix().translate(t * vx + Math.sin(t * 0.4) * 6, t * vy + Math.cos(t * 0.3) * 6).scale(scale));
      ctx.globalAlpha = a;
      ctx.fillStyle = pat;
      ctx.fillRect(ix, iy, iw, ih);
    }
    // Slow swell lines crossing the slip: soft long lozenges, never faster than a lap per few seconds.
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(95, 168, 164, 0.12)';
    for (let k = 0; k < Math.max(2, Math.round(ih / 90)); k++) {
      const yy = iy + ((k * 90 + t * 14 + rand01(w.x, k) * 90) % ih);
      ctx.beginPath(); roundRect(ctx, ix + 10, yy, iw - 20, 5, 2.5); ctx.fill();
    }
    ctx.restore();
  }
  ctx.restore();
  pat.setTransform(new DOMMatrix());
}

function drawLamps(ctx: CanvasRenderingContext2D, now: number, view: ThemeView, lamps: readonly Lamp[]) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const [i, l] of lamps.entries()) {
    const cx = l.x + l.dx * 70, cy = l.y + l.dy * 70;
    if (!inView(view, cx, cy, 230)) continue;
    const flick = 0.92 + 0.08 * Math.sin(now * 0.004 + i * 2.1) * Math.sin(now * 0.0013 + i);
    const hex = districtAt(l.x, l.y).light, v = parseInt(hex.slice(1), 16), rgb = `${(v >> 16) & 255}, ${(v >> 8) & 255}, ${v & 255}`;
    const grad = ctx.createRadialGradient(cx, cy, 8, cx, cy, 210);
    grad.addColorStop(0, `rgba(${rgb}, ${(0.26 * flick).toFixed(3)})`);
    grad.addColorStop(0.55, `rgba(${rgb}, ${(0.1 * flick).toFixed(3)})`);
    grad.addColorStop(1, `rgba(${rgb}, 0)`);
    ctx.fillStyle = grad;
    ctx.fillRect(cx - 210, cy - 210, 420, 420);
    setLight(`subpen:lamp:${i}`, { x: l.x + l.dx * 12, y: l.y + l.dy * 12 - (l.dy ? 4 : 0), radius: 280, color: hex, intensity: 0.75 * flick, flicker: 0.1, size: 8, inside: 26 });
  }
  ctx.restore();
  // The caged fittings themselves, small and inked, over whatever wall they hang on.
  for (const l of lamps) {
    if (!inView(view, l.x, l.y, 20)) continue;
    const x = l.dx ? l.x + 3 : l.x, y = l.dy ? l.y - 12 : l.y;
    ctx.fillStyle = '#3a3f48';
    ctx.beginPath(); roundRect(ctx, x - 8, y - 5, 16, 11, 3); ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = districtAt(l.x, l.y).light;
    ctx.fillRect(x - 5, y - 2, 10, 5);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.fillRect(x - 4, y - 2, 3, 2);
  }
}

function drawBeacons(ctx: CanvasRenderingContext2D, now: number, view: ThemeView, beacons: readonly Beacon[]) {
  for (const [i, b] of beacons.entries()) {
    if (!inView(view, b.x, b.y, 300)) continue;
    const a = now * 0.0026 + b.phase;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const side of [0, Math.PI]) {
      const ang = a + side, reach = 270, half = 0.3;
      const grad = ctx.createRadialGradient(b.x, b.y, 6, b.x, b.y, reach);
      grad.addColorStop(0, 'rgba(255, 70, 50, 0.3)');
      grad.addColorStop(1, 'rgba(255, 60, 40, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.arc(b.x, b.y, reach, ang - half, ang + half);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    setLight(`subpen:beacon:${i}`, { x: b.x, y: b.y, radius: 320, color: BEACON, intensity: 0.8, cone: { angle: a, half: 0.45 }, size: 6, inside: 16, shadows: false });
    setLight(`subpen:beacon:${i}b`, { x: b.x, y: b.y, radius: 320, color: BEACON, intensity: 0.8, cone: { angle: a + Math.PI, half: 0.45 }, size: 6, inside: 16, shadows: false });
    // The lamp itself: a drum with a red dome and a spark of white.
    ctx.fillStyle = '#3a3f48';
    ctx.beginPath(); ctx.arc(b.x, b.y + 3, 8, 0, TAU); ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = Math.cos(a * 2) > 0.6 ? '#ff8a70' : '#d63a2e';
    ctx.beginPath(); ctx.arc(b.x, b.y - 1, 6, 0, TAU); ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
    ctx.fillRect(b.x - 3, b.y - 4, 2.4, 2.4);
  }
}

function drawDrips(ctx: CanvasRenderingContext2D, now: number, view: ThemeView, drips: readonly Drip[]) {
  for (const d of drips) {
    if (!inView(view, d.x, d.y, 40)) continue;
    const t = ((now + d.phase) % d.period) / 1000;
    if (t < 0.22) {
      const u = t / 0.22, y = d.y - 30 * (1 - u * u);
      ctx.fillStyle = 'rgba(190, 226, 230, 0.75)';
      ctx.fillRect(d.x - 1, y - 5, 2, 5 + u * 3);
    } else if (t < 0.9) {
      const u = (t - 0.22) / 0.68;
      ctx.strokeStyle = `rgba(190, 226, 230, ${(0.5 * (1 - u)).toFixed(3)})`;
      ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.ellipse(d.x, d.y, 2 + u * 11, 1 + u * 5, 0, 0, TAU); ctx.stroke();
    }
  }
}

function drawSteam(ctx: CanvasRenderingContext2D, now: number, view: ThemeView, vents: readonly { x: number; y: number }[]) {
  for (const [i, v] of vents.entries()) {
    if (!inView(view, v.x, v.y - 60, 90)) continue;
    const cycle = 5200, t = (now + i * 1700) % cycle;
    if (t > 2200) continue;
    const u = t / 2200;
    for (let k = 0; k < 3; k++) {
      const uu = Math.min(1, Math.max(0, u * 1.25 - k * 0.14));
      if (uu <= 0 || uu >= 1) continue;
      ctx_puff(ctx, v.x + (k - 1) * 7 + Math.sin(now * 0.002 + k) * 4, v.y - 8 - uu * 60, 8 + uu * 14, 0.26 * (1 - uu));
    }
  }
}
function ctx_puff(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, a: number) {
  ctx.fillStyle = `rgba(214, 224, 226, ${a.toFixed(3)})`;
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
}


registerTheme('subpen', {
  ...subpenGeo({ bulkhead: paintBulkhead }),
  dusk: 0.4,
  floor: paintDeckFloor,
  walls: { hull: paintHull, tower: paintTower, bulkhead: paintBulkhead, rack: paintRack, water: paintWater },
  under(ctx, now, view, map) {
    const s = sites(map);
    drawWater(ctx, now, view, s.water);
    drawSubmarines(ctx, now, view, map);
    drawDrips(ctx, now, view, s.drips);
    drawLamps(ctx, now, view, s.lamps);
    drawBeacons(ctx, now, view, s.beacons);
    drawKit(ctx, now, view, map, s.lamps);
    drawSteam(ctx, now, view, s.vents);
  },
});
