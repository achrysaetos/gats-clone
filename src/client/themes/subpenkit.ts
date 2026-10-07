import type { MapDef } from '../../shared/maps.ts';
import type { Rect } from '../../shared/sim/movement.ts';
import { blotch, canvas, seeded } from '../grain.ts';
import { FLOOR, INK } from '../palette.ts';
import { reducedMotion } from '../screenfx.ts';
import type { ThemeView } from './registry.ts';

/**
 * Sub Pen's districts, landmarks and the small stories in its margins.
 *
 * The lore: Pen 7 is a covert boat base. Two boats are in for refit, NARWHAL (77) in slip 1 and KELPIE (41) in slip 2, and the
 * night shift (Dutch the chief, Mags on the board, Ortiz in the shop, Pip the new kid) was told the alarm test was Wednesday.
 * It is not Wednesday. The mugs are still warm, the lunch is half eaten, and the cat, Torpedo, has slept through all of it.
 *
 * Twin halves share walls and cover, never decor: each district below is dressed on its own terms.
 */
const TAU = Math.PI * 2;
const SIZE = 6000;

const rand01 = (a: number, b = 0, c = 0): number => {
  let h = (Math.imul(a | 0, 73856093) ^ Math.imul(b | 0, 19349663) ^ Math.imul(c | 0, 83492791)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0;
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39) >>> 0;
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
};
function rr(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const k = Math.min(r, w / 2, h / 2);
  g.moveTo(x + k, y);
  g.arcTo(x + w, y, x + w, y + h, k);
  g.arcTo(x + w, y + h, x, y + h, k);
  g.arcTo(x, y + h, x, y, k);
  g.arcTo(x, y, x + w, y, k);
  g.closePath();
}
const ink = (g: CanvasRenderingContext2D, w = 2) => { g.strokeStyle = INK; g.lineWidth = w; g.stroke(); };
const FONT = "'Barlow Condensed', 'Arial Narrow', Impact, sans-serif";

/* ------------------------------------------------------------------------------------------------------------------ *
 * Districts: eleven places that look different from each other with the minimap off.
 * ------------------------------------------------------------------------------------------------------------------ */

export type FloorKind = 'lanes' | 'wet' | 'checker' | 'hazard' | 'grid' | 'emblem' | 'rings' | 'plate' | 'bunk';
export type District = { id: string; name: string; rect: Rect; light: string; tint: string; floor: FloorKind; sub?: string };

/** First match wins, so the halls and the centre sit ahead of the corners. Edges fall on the floor's 500 px girders. */
export const DISTRICTS: readonly District[] = [
  { id: 'pen1', name: 'SLIP 1', sub: 'NARWHAL', rect: { x: 0, y: 1500, w: 3000, h: 1000 }, light: '#ffb347', tint: 'rgba(40, 90, 100, 0.07)', floor: 'plate' },
  { id: 'pen2', name: 'SLIP 2', sub: 'KELPIE', rect: { x: 3000, y: 3500, w: 3000, h: 1000 }, light: '#8fe3d6', tint: 'rgba(40, 90, 100, 0.07)', floor: 'plate' },
  { id: 'dock1', name: 'DOCK 1', sub: 'SODIUM BAY', rect: { x: 0, y: 0, w: 2500, h: 1500 }, light: '#ffb347', tint: 'rgba(255, 160, 60, 0.07)', floor: 'lanes' },
  { id: 'sump', name: 'SUMP YARD', rect: { x: 2500, y: 0, w: 1000, h: 1500 }, light: '#9fe8e0', tint: 'rgba(60, 150, 160, 0.08)', floor: 'wet' },
  { id: 'control', name: 'CONTROL', sub: 'NIGHT WATCH', rect: { x: 3500, y: 0, w: 2500, h: 2000 }, light: '#ff5a48', tint: 'rgba(70, 70, 130, 0.12)', floor: 'checker' },
  { id: 'comms', name: 'COMMS', sub: 'BUNKER', rect: { x: 3500, y: 2000, w: 2500, h: 1500 }, light: '#b9c8ff', tint: 'rgba(110, 130, 190, 0.08)', floor: 'rings' },
  { id: 'store', name: 'TORPEDO STORE', rect: { x: 0, y: 2500, w: 2500, h: 1000 }, light: '#ff9a3c', tint: 'rgba(200, 90, 40, 0.09)', floor: 'hazard' },
  { id: 'flood', name: 'FLOOD CONTROL', rect: { x: 0, y: 3500, w: 2500, h: 1000 }, light: '#7fe0c0', tint: 'rgba(40, 140, 120, 0.1)', floor: 'wet' },
  { id: 'shop', name: 'MACHINE SHOP', sub: 'ORTIZ', rect: { x: 0, y: 4500, w: 2500, h: 1500 }, light: '#7fe0c0', tint: 'rgba(60, 140, 110, 0.09)', floor: 'grid' },
  { id: 'fuel', name: 'FUEL DEPOT', rect: { x: 2500, y: 4500, w: 1000, h: 1500 }, light: '#ff9a3c', tint: 'rgba(200, 110, 40, 0.09)', floor: 'hazard' },
  { id: 'dock2', name: 'DOCK 2', sub: 'WORK LIGHTS', rect: { x: 3500, y: 4500, w: 2500, h: 1500 }, light: '#8fe3d6', tint: 'rgba(60, 150, 170, 0.08)', floor: 'wet' },
  { id: 'bunks', name: 'CREW QUARTERS', rect: { x: 3500, y: 3500, w: 2500, h: 1000 }, light: '#ffd9a0', tint: 'rgba(160, 110, 70, 0.08)', floor: 'bunk' },
  { id: 'centre', name: 'CENTRAL DOCK', rect: { x: 2500, y: 1500, w: 1000, h: 3000 }, light: '#d3e6ff', tint: 'rgba(150, 190, 230, 0.06)', floor: 'emblem' },
];
const FALLBACK: District = { id: 'yard', name: 'YARD', rect: { x: 0, y: 0, w: SIZE, h: SIZE }, light: '#ffb347', tint: 'rgba(0,0,0,0)', floor: 'plate' };
export const districtAt = (x: number, y: number): District => DISTRICTS.find((d) => x >= d.rect.x && x < d.rect.x + d.rect.w && y >= d.rect.y && y < d.rect.y + d.rect.h) ?? FALLBACK;

const hits = (a: Rect, b: Rect, pad = 0) => a.x - pad < b.x + b.w && a.x + a.w + pad > b.x && a.y - pad < b.y + b.h && a.y + a.h + pad > b.y;

/** The spot in a district where a floor sign of this size clears every wall, nearest the district's heart. */
function signSpot(walls: readonly Rect[], d: District, w: number, h: number): { x: number; y: number } | null {
  const cx = d.rect.x + d.rect.w / 2, cy = d.rect.y + d.rect.h / 2;
  let best: { x: number; y: number } | null = null, bd = Infinity;
  for (let y = d.rect.y + 150; y < d.rect.y + d.rect.h - h - 150; y += 50) {
    for (let x = d.rect.x + 150; x < d.rect.x + d.rect.w - w - 150; x += 50) {
      const box = { x, y, w, h };
      if (walls.some((k) => hits(box, k, 40))) continue;
      const dd = Math.hypot(x + w / 2 - cx, y + h / 2 - cy);
      if (dd < bd) { bd = dd; best = { x, y }; }
    }
  }
  return best;
}

/** Worn stencil paint: letters with a few specks scuffed out of them. */
function sprayText(g: CanvasRenderingContext2D, text: string, x: number, y: number, px: number, color: string, seed: number) {
  g.save();
  g.font = `700 ${px}px ${FONT}`;
  g.textBaseline = 'middle';
  g.textAlign = 'center';
  (g as unknown as { letterSpacing: string }).letterSpacing = `${Math.round(px * 0.12)}px`;
  const fit = Math.min(1, 560 / Math.max(1, g.measureText(text).width));
  if (fit < 1) { px = Math.floor(px * fit); g.font = `700 ${px}px ${FONT}`; (g as unknown as { letterSpacing: string }).letterSpacing = `${Math.round(px * 0.12)}px`; }
  g.fillStyle = color;
  g.fillText(text, x, y);
  // Scuffs: knock back a few specks with floor-coloured paint.
  const rand = seeded(seed);
  const wid = g.measureText(text).width;
  g.globalCompositeOperation = 'destination-out';
  g.globalAlpha = 0.5;
  for (let i = 0; i < wid / 6; i++) g.fillRect(x - wid / 2 + rand() * wid, y - px * 0.4 + rand() * px * 0.8, 2 + rand() * 4, 1 + rand() * 2);
  g.restore();
}

function lanes(g: CanvasRenderingContext2D, r: Rect, seed: number) {
  g.fillStyle = 'rgba(183, 154, 74, 0.34)';
  for (let y = r.y + 250; y < r.y + r.h; y += 500) for (let x = r.x + 30; x < r.x + r.w - 60; x += 90) g.fillRect(x, y - 3, 52, 6);
  const rand = seeded(seed);
  for (let i = 0; i < 5; i++) { const x = r.x + rand() * r.w, y = r.y + rand() * r.h; blotch(g, x, y, 60 + rand() * 90, '90, 60, 30', 0.06); }
}
function checker(g: CanvasRenderingContext2D, r: Rect) {
  for (let y = r.y; y < r.y + r.h; y += 100) for (let x = r.x; x < r.x + r.w; x += 100) {
    if (((x + y) / 100) % 2) continue;
    g.fillStyle = 'rgba(20, 24, 50, 0.16)';
    g.fillRect(x, y, 100, 100);
  }
  g.fillStyle = 'rgba(255, 90, 72, 0.3)';
  for (let x = r.x + 60; x < r.x + r.w - 60; x += 40) { g.fillRect(x, r.y + 16, 20, 5); g.fillRect(x, r.y + r.h - 21, 20, 5); }
}
function hazard(g: CanvasRenderingContext2D, r: Rect, seed: number) {
  g.strokeStyle = 'rgba(217, 120, 40, 0.3)';
  g.lineWidth = 5;
  g.setLineDash([60, 30]);
  g.strokeRect(r.x + 26, r.y + 26, r.w - 52, r.h - 52);
  g.setLineDash([]);
  const rand = seeded(seed);
  for (let i = 0; i < 4; i++) {
    const x = r.x + 80 + rand() * (r.w - 160), y = r.y + 80 + rand() * (r.h - 160), q = 18 + rand() * 30;
    g.fillStyle = 'rgba(10, 10, 14, 0.16)';
    g.beginPath(); g.ellipse(x, y, q * 1.3, q, rand() * 3, 0, TAU); g.fill();
  }
}
function grid(g: CanvasRenderingContext2D, r: Rect) {
  g.fillStyle = 'rgba(183, 154, 74, 0.22)';
  for (let x = r.x + 250; x < r.x + r.w; x += 250) g.fillRect(x - 2, r.y, 4, r.h);
  for (let y = r.y + 250; y < r.y + r.h; y += 250) g.fillRect(r.x, y - 2, r.w, 4);
  g.fillStyle = 'rgba(8, 12, 14, 0.2)';
  for (let x = r.x + 125; x < r.x + r.w; x += 250) for (let y = r.y + 125; y < r.y + r.h; y += 250) g.fillRect(x - 24, y - 24, 48, 48);
}
function rings(g: CanvasRenderingContext2D, r: Rect) {
  g.strokeStyle = 'rgba(185, 200, 255, 0.16)';
  g.lineWidth = 5;
  const cx = r.x + r.w * 0.5, cy = r.y + r.h * 0.5;
  for (let k = 1; k <= 6; k++) { g.beginPath(); g.arc(cx, cy, k * 150, 0, TAU); g.stroke(); }
  g.beginPath();
  for (let a = 0; a < 8; a++) { g.moveTo(cx, cy); g.lineTo(cx + Math.cos((a * TAU) / 8) * 900, cy + Math.sin((a * TAU) / 8) * 900); }
  g.stroke();
}
function bunk(g: CanvasRenderingContext2D, r: Rect, seed: number) {
  // Linoleum strips and a worn rug runner: a place somebody lives in.
  g.fillStyle = 'rgba(120, 80, 50, 0.16)';
  for (let y = r.y; y < r.y + r.h; y += 100) if ((y / 100) % 2) g.fillRect(r.x, y, r.w, 100);
  const rand = seeded(seed);
  for (let i = 0; i < 4; i++) {
    const x = r.x + 300 + rand() * (r.w - 800), y = r.y + 200 + rand() * (r.h - 400);
    g.fillStyle = 'rgba(150, 60, 50, 0.3)';
    g.fillRect(x, y, 260, 90);
    g.strokeStyle = 'rgba(226, 200, 150, 0.4)'; g.lineWidth = 3;
    g.strokeRect(x + 8, y + 8, 244, 74);
  }
}
function emblem(g: CanvasRenderingContext2D, r: Rect) {
  // A painted compass rose and anchor ring for the crossroads of the base.
  const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
  g.strokeStyle = 'rgba(226, 220, 203, 0.3)';
  g.lineWidth = 8;
  g.beginPath(); g.arc(cx, cy, 430, 0, TAU); g.stroke();
  g.lineWidth = 5;
  g.setLineDash([22, 18]);
  g.beginPath(); g.arc(cx, cy, 470, 0, TAU); g.stroke();
  g.setLineDash([]);
  g.fillStyle = 'rgba(226, 220, 203, 0.26)';
  for (let k = 0; k < 4; k++) {
    g.save(); g.translate(cx, cy); g.rotate((k * TAU) / 4);
    g.beginPath(); g.moveTo(300, -26); g.lineTo(520, 0); g.lineTo(300, 26); g.closePath(); g.fill();
    g.restore();
  }
}

/** Paints every district's floor: tint, treatment, a metal strip along the borders, a stencilled name where lanes are clear. */
export function paintDistricts(g: CanvasRenderingContext2D, seed: number, walls: readonly Rect[]) {
  for (const [i, d] of DISTRICTS.entries()) {
    const r = d.rect;
    g.save();
    g.beginPath(); g.rect(r.x, r.y, r.w, r.h); g.clip();
    g.fillStyle = d.tint;
    g.fillRect(r.x, r.y, r.w, r.h);
    if (d.floor === 'lanes') lanes(g, r, seed + i);
    else if (d.floor === 'checker') checker(g, r);
    else if (d.floor === 'hazard') hazard(g, r, seed + i);
    else if (d.floor === 'grid') grid(g, r);
    else if (d.floor === 'rings') rings(g, r);
    else if (d.floor === 'bunk') bunk(g, r, seed + i);
    else if (d.floor === 'emblem') emblem(g, r);
    else if (d.floor === 'wet') {
      const rand = seeded(seed + i * 7);
      const pits = (walls as readonly (Rect & { material?: string })[]).filter((w) => w.material === 'water');
      for (let k = 0; k < 18; k++) {
        const x = r.x + rand() * r.w, y = r.y + rand() * r.h, q = 14 + rand() * 20;
        if (!pits.some((w) => hits({ x: x - 260, y: y - 260, w: 520, h: 520 }, w))) continue;
        if (walls.some((w) => hits({ x: x - q, y: y - q, w: q * 2, h: q * 2 }, w, 6))) continue;
        g.fillStyle = 'rgba(12, 28, 34, 0.2)';
        g.beginPath(); g.ellipse(x, y, q * 1.4, q, 0, 0, TAU); g.fill();
        g.fillStyle = 'rgba(140, 220, 216, 0.14)';
        g.beginPath(); g.ellipse(x - q * 0.3, y - q * 0.3, q * 0.7, q * 0.3, 0, 0, TAU); g.fill();
      }
      g.fillStyle = 'rgba(10, 16, 20, 0.5)';
      for (let y = r.y + 500; y < r.y + r.h; y += 1000) g.fillRect(r.x, y - 7, r.w, 14);
    }
    g.restore();
  }
  // Metal threshold strips where one kind of floor meets another, left off wherever a wall stands.
  for (const d of DISTRICTS) {
    const r = d.rect;
    const edges: [number, number, number, number][] = [[r.x, r.y, r.w, 0], [r.x, r.y + r.h, r.w, 0], [r.x, r.y, 0, r.h], [r.x + r.w, r.y, 0, r.h]];
    for (const [x, y, w, h] of edges) {
      if (x <= 0 && w === 0 || y <= 0 && h === 0 || x >= SIZE && w === 0 || y >= SIZE && h === 0) continue;
      const len = w || h;
      for (let s = 0; s < len; s += 50) {
        const seg = w ? { x: x + s - 8, y: y - 8, w: 66, h: 16 } : { x: x - 8, y: y + s - 8, w: 16, h: 66 };
        if (walls.some((k) => hits(seg, k, 4))) continue;
        const px = w ? x + s : x - 4, py = w ? y - 4 : y + s, pw = w ? 50 : 8, ph = w ? 8 : 50;
        g.fillStyle = '#66717a'; g.fillRect(px, py, pw, ph);
        g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(px, py, w ? pw : 2, w ? 2 : ph);
        g.fillStyle = 'rgba(8,10,14,0.45)'; g.fillRect(w ? px : px + pw - 2, w ? py + ph - 2 : py, w ? pw : 2, w ? 2 : ph);
        g.fillStyle = 'rgba(14,18,22,0.7)'; g.fillRect(w ? px + 24 : px + 3, w ? py + 3 : py + 24, 2, 2);
      }
    }
  }
  // District names, stencilled big where the lane is clear, with the sub-line under.
  for (const d of DISTRICTS) {
    const px = d.id === 'store' || d.id === 'flood' ? 78 : 96;
    const spot = signSpot(walls, d, 620, 190);
    if (!spot) continue;
    const cx = spot.x + 310, cy = spot.y + 70;
    const col = 'rgba(205, 214, 220, 0.13)';
    sprayText(g, d.name, cx, cy, px, col, seed + d.id.length);
    if (d.sub) sprayText(g, d.sub, cx, cy + 70, 40, col, seed + 9);
  }
}

/* ------------------------------------------------------------------------------------------------------------------ *
 * Landmarks: one big thing per district, built on the roof of a wall block so it is solid, never a lie.
 * ------------------------------------------------------------------------------------------------------------------ */

export type LandmarkKind = 'crane' | 'tanks' | 'shop' | 'control' | 'pump' | 'comms' | 'gen' | 'stores';
export type Landmark = { kind: LandmarkKind; rect: Rect };
const AT: readonly { kind: LandmarkKind; x: number; y: number }[] = [
  { kind: 'crane', x: 1325, y: 300 }, { kind: 'tanks', x: SIZE - 1325, y: SIZE - 300 },
  { kind: 'shop', x: 1550, y: 5150 }, { kind: 'control', x: SIZE - 1550, y: SIZE - 5150 },
  { kind: 'pump', x: 1650, y: 3900 }, { kind: 'comms', x: SIZE - 1650, y: SIZE - 3900 },
  { kind: 'gen', x: 600, y: 1150 }, { kind: 'stores', x: SIZE - 600, y: SIZE - 1150 },
];
export function landmarksOf(map: MapDef): Landmark[] {
  const out: Landmark[] = [];
  for (const a of AT) {
    const w = map.walls.find((k) => k.material === 'bulkhead' && a.x >= k.x && a.x < k.x + k.w && a.y >= k.y && a.y < k.y + k.h);
    if (w) out.push({ kind: a.kind, rect: { x: w.x, y: w.y, w: w.w, h: w.h } });
  }
  return out;
}

const PAD = 60, FACE = 26;
const YEL = { top: '#a8924a', lit: '#c4ac5e', shade: '#7e6c36', face: '#5c4f28' } as const;
const STL = { top: '#6d7783', lit: '#929ca8', shade: '#4f5864', face: '#454c57' } as const;

function slab(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, c: { top: string; lit: string; shade: string; face: string }) {
  g.fillStyle = 'rgba(8, 12, 16, 0.3)';
  g.fillRect(x + 10, y + h, w, FACE + 12);
  g.fillStyle = c.face;
  g.fillRect(x, y + h - 4, w, FACE + 4);
  g.fillStyle = 'rgba(10, 12, 16, 0.34)';
  g.fillRect(x, y + h + FACE - 8, w, 8);
  g.fillStyle = 'rgba(255, 255, 255, 0.13)';
  g.fillRect(x, y + h, w, 2);
  g.beginPath(); g.rect(x, y + h, w, FACE); ink(g);
  g.fillStyle = c.top; g.fillRect(x, y, w, h);
  g.fillStyle = c.lit; g.fillRect(x, y, w, h * 0.16);
  g.fillStyle = c.shade; g.fillRect(x, y + h * 0.84, w, h * 0.16);
  g.beginPath(); g.rect(x, y, w, h); ink(g, 2.5);
}
function rivetRow(g: CanvasRenderingContext2D, x0: number, x1: number, y: number) {
  g.fillStyle = 'rgba(14, 18, 22, 0.6)';
  g.beginPath();
  for (let x = x0; x < x1; x += 14) { g.moveTo(x + 1.3, y); g.arc(x, y, 1.3, 0, TAU); }
  g.fill();
}
function hazardEdge(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, t = 8) {
  g.save();
  g.beginPath(); g.rect(x, y, w, h); g.rect(x + t, y + t, w - 2 * t, h - 2 * t); g.clip('evenodd');
  g.fillStyle = FLOOR.paint; g.fillRect(x, y, w, h);
  g.fillStyle = '#2b2e34';
  for (let k = -h; k < w + h; k += 16) { g.beginPath(); g.moveTo(x + k, y + h); g.lineTo(x + k + 8, y + h); g.lineTo(x + k + 8 + h, y); g.lineTo(x + k + h, y); g.closePath(); g.fill(); }
  g.restore();
  g.beginPath(); g.rect(x + t, y + t, w - 2 * t, h - 2 * t); ink(g, 1.5);
}
function label(g: CanvasRenderingContext2D, text: string, x: number, y: number, px: number, color = 'rgba(226, 220, 203, 0.85)') {
  g.save(); g.font = `700 ${px}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  (g as unknown as { letterSpacing: string }).letterSpacing = `${Math.round(px * 0.1)}px`;
  g.fillStyle = color; g.fillText(text, x, y); g.restore();
}
function porthole(g: CanvasRenderingContext2D, x: number, y: number, glass = '#5fa8a4') {
  g.fillStyle = '#10181c'; g.beginPath(); g.arc(x, y, 6, 0, TAU); g.fill();
  g.strokeStyle = '#7a9296'; g.lineWidth = 2; g.stroke();
  g.fillStyle = glass; g.fillRect(x - 3.5, y - 3.5, 2.5, 2.5);
  g.strokeStyle = INK; g.lineWidth = 1.5; g.beginPath(); g.arc(x, y, 7.8, 0, TAU); g.stroke();
}
function pipe(g: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, w: number, c: string) {
  g.lineCap = 'butt';
  g.strokeStyle = INK; g.lineWidth = w + 4; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
  g.strokeStyle = c; g.lineWidth = w; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
  g.strokeStyle = 'rgba(255,255,255,0.3)'; g.lineWidth = 2; g.beginPath(); g.moveTo(x0 - 1, y0 - 2); g.lineTo(x1 - 1, y1 - 2); g.stroke();
}
function wheel(g: CanvasRenderingContext2D, x: number, y: number, r: number) {
  g.fillStyle = '#a8493f'; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); ink(g);
  g.strokeStyle = '#5a2a26'; g.lineWidth = 2; g.beginPath();
  for (let k = 0; k < 3; k++) { const a = (k * TAU) / 6 + 0.3; g.moveTo(x + Math.cos(a) * r * 0.8, y + Math.sin(a) * r * 0.8); g.lineTo(x - Math.cos(a) * r * 0.8, y - Math.sin(a) * r * 0.8); }
  g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.55)'; g.fillRect(x - r * 0.5, y - r * 0.6, 2.4, 2.4);
}

function paintLandmark(g: CanvasRenderingContext2D, kind: LandmarkKind, x: number, y: number, w: number, h: number) {
  switch (kind) {
    case 'crane': {
      slab(g, x, y, w, h, YEL);
      hazardEdge(g, x + 6, y + 6, w - 12, h - 12);
      rivetRow(g, x + 20, x + w - 12, y + h + 15);
      // Counterweight, cab and the boom reaching up and out, with lattice cross-bracing.
      g.fillStyle = '#3a3f48'; g.fillRect(x + 22, y + h - 78, 70, 52); g.strokeStyle = INK; g.lineWidth = 2.5; g.strokeRect(x + 22, y + h - 78, 70, 52);
      g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(x + 24, y + h - 76, 66, 5);
      g.fillStyle = '#d4b24a'; g.beginPath(); rr(g, x + 78, y + h * 0.42, 74, 64, 8); g.fill(); ink(g, 2.5);
      g.fillStyle = '#10181c'; g.beginPath(); rr(g, x + 120, y + h * 0.42 + 10, 26, 24, 4); g.fill(); ink(g, 1.5);
      g.fillStyle = '#5fa8a4'; g.fillRect(x + 124, y + h * 0.42 + 13, 6, 5);
      pipe(g, x + 100, y + h * 0.5, x + w - 16, y + 24, 18, '#d4b24a');
      g.strokeStyle = INK; g.lineWidth = 2; g.beginPath();
      for (let k = 0; k < 6; k++) { const u = (k + 0.5) / 6, bx = x + 100 + (w - 116) * u, by = y + h * 0.5 - (h * 0.5 - 24) * u; g.moveTo(bx - 6, by + 8); g.lineTo(bx + 6, by - 8); }
      g.stroke();
      g.strokeStyle = '#2b2e34'; g.lineWidth = 2; g.beginPath(); g.moveTo(x + w - 16, y + 24); g.lineTo(x + w - 16, y + h - 60); g.stroke();
      g.fillStyle = '#3a3f48'; g.beginPath(); g.arc(x + w - 16, y + h - 56, 7, 0, TAU); g.fill(); ink(g, 2);
      label(g, 'DOCK 1', x + w / 2 + 6, y + h + 17, 14, '#e2dccb');
      break;
    }
    case 'tanks': {
      slab(g, x, y, w, h, STL);
      for (const cy of [0.28, 0.72]) {
        const cx = x + w / 2, ty = y + h * cy, r = Math.min(w, h) * 0.22;
        g.fillStyle = 'rgba(8,12,16,0.3)'; g.beginPath(); g.ellipse(cx + 9, ty + 10, r, r * 0.9, 0, 0, TAU); g.fill();
        g.fillStyle = '#8c97a3'; g.beginPath(); g.arc(cx, ty, r, 0, TAU); g.fill(); ink(g, 2.5);
        g.fillStyle = '#b6c0ca'; g.beginPath(); g.arc(cx - r * 0.18, ty - r * 0.2, r * 0.7, 0, TAU); g.fill();
        g.fillStyle = '#69747f'; g.beginPath(); g.arc(cx, ty, r, 0.2, Math.PI * 0.9); g.arc(cx, ty, r * 0.8, Math.PI * 0.9, 0.2, true); g.fill();
        g.strokeStyle = '#d9541f'; g.lineWidth = 6; g.beginPath(); g.arc(cx, ty, r * 0.86, 0, TAU); g.stroke();
        g.strokeStyle = INK; g.lineWidth = 1.5; g.beginPath(); g.arc(cx, ty, r * 0.86 + 3, 0, TAU); g.stroke(); g.beginPath(); g.arc(cx, ty, r * 0.86 - 3, 0, TAU); g.stroke();
        g.fillStyle = '#3a3f48'; g.beginPath(); g.arc(cx, ty, 9, 0, TAU); g.fill(); ink(g, 2);
        g.fillStyle = 'rgba(255,255,255,0.7)'; g.fillRect(cx - r * 0.45, ty - r * 0.6, 4, 4);
      }
      pipe(g, x + w / 2, y + h * 0.28 + 40, x + w / 2, y + h * 0.72 - 40, 9, '#a8552e');
      wheel(g, x + w - 22, y + h / 2, 10);
      label(g, 'FUEL', x + w / 2, y + h + 17, 14, '#e2dccb');
      break;
    }
    case 'shop': {
      slab(g, x, y, w, h, STL);
      // Sawtooth skylight roof, a strip of teal glass for each tooth.
      const n = 5, sh = (h - 40) / n;
      for (let k = 0; k < n; k++) {
        const sy = y + 14 + k * sh;
        g.fillStyle = '#7d8793'; g.fillRect(x + 12, sy, w - 24, sh * 0.5);
        g.fillStyle = '#4f7f82'; g.fillRect(x + 12, sy + sh * 0.5, w - 24, sh * 0.42);
        g.fillStyle = 'rgba(190,240,230,0.25)'; g.fillRect(x + 12, sy + sh * 0.5, w - 24, 3);
        g.strokeStyle = INK; g.lineWidth = 1.5; g.strokeRect(x + 12, sy, w - 24, sh * 0.92);
        g.fillStyle = 'rgba(14,18,22,0.5)'; for (let sx = x + 40; sx < x + w - 20; sx += 60) g.fillRect(sx, sy + sh * 0.5, 3, sh * 0.42);
      }
      g.fillStyle = '#2f353d'; g.beginPath(); g.arc(x + w - 34, y + 34, 15, 0, TAU); g.fill(); ink(g, 2.5);
      g.fillStyle = '#10181c'; g.beginPath(); g.arc(x + w - 34, y + 34, 9, 0, TAU); g.fill();
      label(g, 'SHOP', x + w / 2, y + h + 17, 14, '#e2dccb');
      for (let k = 0; k < 3; k++) porthole(g, x + w * (0.2 + k * 0.3), y + h + 7);
      break;
    }
    case 'control': {
      slab(g, x, y, w, h, { top: '#4f5a6e', lit: '#6b778c', shade: '#363f50', face: '#2b3340' });
      g.fillStyle = '#2f353d'; g.beginPath(); g.arc(x + w / 2, y + h * 0.46, 70, 0, TAU); g.fill(); ink(g, 2.5);
      g.strokeStyle = '#ff5a48'; g.lineWidth = 4; g.setLineDash([14, 10]); g.beginPath(); g.arc(x + w / 2, y + h * 0.46, 82, 0, TAU); g.stroke(); g.setLineDash([]);
      hazardEdge(g, x + 6, y + 6, w - 12, h - 12);
      label(g, 'CONTROL', x + w / 2, y + h + 17, 14, '#ffb0a0');
      break;
    }
    case 'pump': {
      slab(g, x, y, w, h, STL);
      const hs = [[0.28, 0.3], [0.7, 0.3], [0.5, 0.74]] as const;
      pipe(g, x + w * 0.28, y + h * 0.3, x + w * 0.7, y + h * 0.3, 14, '#3a7f86');
      pipe(g, x + w * 0.7, y + h * 0.3, x + w * 0.5, y + h * 0.74, 14, '#3a7f86');
      pipe(g, x + w * 0.5, y + h * 0.74, x + w * 0.28, y + h * 0.3, 14, '#3a7f86');
      for (const [fx, fy] of hs) {
        const cx = x + w * fx, cy = y + h * fy;
        g.fillStyle = '#7d8793'; g.beginPath(); g.arc(cx, cy, 30, 0, TAU); g.fill(); ink(g, 2.5);
        g.fillStyle = '#9aa5b0'; g.beginPath(); g.arc(cx - 3, cy - 4, 20, 0, TAU); g.fill(); ink(g, 1.5);
        wheel(g, cx, cy, 11);
      }
      label(g, 'PUMP 3', x + w / 2, y + h + 17, 14, '#bfeee0');
      break;
    }
    case 'comms': {
      slab(g, x, y, w, h, { top: '#59616e', lit: '#7a8494', shade: '#3e4552', face: '#323843' });
      hazardEdge(g, x + 6, y + 6, w - 12, h - 12);
      // Two dishes on the roof, a feed arm over each bowl.
      for (const [fx, fy, r] of [[0.3, 0.32, 38], [0.3, 0.74, 28]] as const) {
        const dx = x + w * fx, dy = y + h * fy;
        g.fillStyle = 'rgba(8,12,16,0.3)'; g.beginPath(); g.arc(dx + 7, dy + 8, r, 0, TAU); g.fill();
        g.fillStyle = '#9aa5b0'; g.beginPath(); g.arc(dx, dy, r, 0, TAU); g.fill(); ink(g, 2.5);
        g.fillStyle = '#6a7683'; g.beginPath(); g.arc(dx + r * 0.12, dy + r * 0.14, r * 0.72, 0, TAU); g.fill();
        g.fillStyle = '#c2ccd4'; g.beginPath(); g.arc(dx - r * 0.2, dy - r * 0.22, r * 0.3, 0, TAU); g.fill();
        g.strokeStyle = INK; g.lineWidth = 2.5; g.beginPath(); g.moveTo(dx, dy); g.lineTo(dx + r * 0.9, dy - r * 0.7); g.stroke();
        g.fillStyle = '#2f353d'; g.beginPath(); g.arc(dx + r * 0.9, dy - r * 0.7, 4, 0, TAU); g.fill(); ink(g, 1.5);
      }
      // The lattice mast on its base: a tapering tower seen from above, braced.
      const mx = x + w * 0.68, my = y + h * 0.5;
      g.fillStyle = '#2f353d'; g.beginPath(); g.arc(mx, my, 40, 0, TAU); g.fill(); ink(g, 2.5);
      for (let k = 0; k < 4; k++) {
        const s2 = 66 - k * 14, oy = -k * 12;
        g.strokeStyle = INK; g.lineWidth = 6; g.strokeRect(mx - s2 / 2, my - s2 / 2 + oy, s2, s2);
        g.strokeStyle = '#9aa5b0'; g.lineWidth = 3; g.strokeRect(mx - s2 / 2, my - s2 / 2 + oy, s2, s2);
      }
      g.strokeStyle = INK; g.lineWidth = 2; g.beginPath();
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) { g.moveTo(mx + sx * 33, my + sy * 33); g.lineTo(mx + sx * 5, my + sy * 5 - 36); }
      g.stroke();
      label(g, 'COMMS', x + w / 2, y + h + 17, 14, '#cdd8ff');
      break;
    }
    case 'gen': {
      slab(g, x, y, w, h, { top: '#5d6168', lit: '#7c8189', shade: '#43474e', face: '#383b41' });
      hazardEdge(g, x + 5, y + 5, w - 10, h - 10, 7);
      for (let k = 0; k < 3; k++) {
        const cx = x + w / 2, cy = y + h * (0.2 + k * 0.3);
        g.fillStyle = '#2f353d'; g.beginPath(); g.arc(cx, cy, 24, 0, TAU); g.fill(); ink(g, 2.5);
        g.fillStyle = '#16181d'; g.beginPath(); g.arc(cx, cy, 15, 0, TAU); g.fill();
        g.fillStyle = 'rgba(255,255,255,0.2)'; g.fillRect(cx - 18, cy - 20, 8, 3);
      }
      label(g, 'GEN', x + w / 2, y + h + 17, 14, '#ffd9a0');
      break;
    }
    case 'stores': {
      slab(g, x, y, w, h, { top: '#7c7050', lit: '#978a66', shade: '#5a5038', face: '#463e2a' });
      const cols = 2, rows = 3, cw = (w - 36) / cols, ch = (h - 36) / rows;
      for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
        const cx = x + 14 + i * (cw + 8), cy = y + 14 + j * (ch + 8);
        g.fillStyle = j === 1 ? '#6c7356' : '#a3814f'; g.fillRect(cx, cy, cw, ch);
        g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(cx, cy, cw, 4);
        g.strokeStyle = 'rgba(30,22,10,0.55)'; g.lineWidth = 2; g.beginPath(); g.moveTo(cx + 3, cy + 3); g.lineTo(cx + cw - 3, cy + ch - 3); g.moveTo(cx + cw - 3, cy + 3); g.lineTo(cx + 3, cy + ch - 3); g.stroke();
        g.strokeStyle = INK; g.lineWidth = 2; g.strokeRect(cx, cy, cw, ch);
      }
      g.fillStyle = 'rgba(70,90,110,0.9)'; g.beginPath(); g.moveTo(x + 22, y + h * 0.36); g.lineTo(x + w - 22, y + h * 0.4); g.lineTo(x + w - 30, y + h * 0.62); g.lineTo(x + 28, y + h * 0.58); g.closePath(); g.fill(); ink(g, 2);
      label(g, 'STORES', x + w / 2, y + h + 17, 14, '#e2dccb');
      break;
    }
  }
}

const sprites = new Map<string, HTMLCanvasElement>();
function spriteOf(kind: LandmarkKind, w: number, h: number): HTMLCanvasElement {
  const key = `${kind}${w}x${h}`;
  let c = sprites.get(key);
  if (!c) {
    const side = Math.max(w, h) + PAD * 2 + FACE;
    [c] = canvas(side);
    c.width = w + PAD * 2; c.height = h + FACE + PAD * 2;
    paintLandmark(c.getContext('2d')!, kind, PAD, PAD, w, h);
    sprites.set(key, c);
  }
  return c;
}

const inView = (v: ThemeView, x: number, y: number, r: number) => x + r > v.x0 && x - r < v.x1 && y + r > v.y0 && y - r < v.y1;

/** The moving parts of each landmark: radar, smoke, blink, heat, flag. All slow (well under 4 Hz) and still under reduced motion. */
function animate(g: CanvasRenderingContext2D, kind: LandmarkKind, r: Rect, now: number, calm: boolean) {
  const t = calm ? 0 : now;
  const cx = r.x + r.w / 2;
  switch (kind) {
    case 'control': {
      const cy = r.y + r.h * 0.46, a = t * 0.0012;
      g.save(); g.translate(cx, cy); g.rotate(a);
      g.fillStyle = '#9ab2b5'; g.beginPath(); g.ellipse(0, -18, 52, 20, 0, 0, TAU); g.fill(); ink(g, 2.5);
      g.fillStyle = '#6a7e86'; g.beginPath(); g.ellipse(4, -14, 38, 12, 0, 0, TAU); g.fill();
      g.restore();
      g.strokeStyle = INK; g.lineWidth = 3; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx, cy - 18); g.stroke();
      // Console lights along the face: a row of LEDs, a couple blinking on slow, different beats.
      for (let k = 0; k < 9; k++) {
        const on = calm || Math.sin(t * 0.0021 * (1 + (k % 3) * 0.37) + k * 1.9) > -0.2;
        g.fillStyle = on ? (k % 3 === 0 ? '#ff5a48' : k % 3 === 1 ? '#8fe3d6' : '#ffd34d') : '#3a2a2a';
        g.fillRect(r.x + 26 + k * ((r.w - 52) / 9), r.y + r.h + 3, 8, 4);
      }
      break;
    }
    case 'comms': {
      const on = calm || Math.sin(t * 0.0042) > 0;
      g.fillStyle = on ? '#ff6a5a' : '#6a2a26';
      g.beginPath(); g.arc(r.x + r.w * 0.68, r.y + r.h / 2 - 62, 4.5, 0, TAU); g.fill(); ink(g, 1.5);
      // A pennant on the mast, rippling.
      g.fillStyle = '#d9541f'; g.beginPath();
      const w1 = Math.sin(t * 0.004) * 4, w2 = Math.sin(t * 0.004 + 1.4) * 5;
      const fx = r.x + r.w * 0.68, fy = r.y + r.h / 2 - 56; g.moveTo(fx + 2, fy - 6); g.quadraticCurveTo(fx + 18, fy - 8 + w1, fx + 32, fy - 2 + w2); g.quadraticCurveTo(fx + 18, fy + 2 + w1, fx + 2, fy + 4); g.closePath(); g.fill(); ink(g, 1.5);
      break;
    }
    case 'shop': {
      for (let k = 0; k < 3; k++) {
        const u = ((t * 0.00035 + k / 3) % 1);
        g.fillStyle = `rgba(150, 156, 160, ${(0.34 * (1 - u)).toFixed(3)})`;
        g.beginPath(); g.arc(r.x + r.w - 34 + u * 26, r.y + 34 - u * 46, 9 + u * 13, 0, TAU); g.fill();
      }
      break;
    }
    case 'gen': {
      for (let k = 0; k < 3; k++) {
        const cy = r.y + r.h * (0.2 + k * 0.3), f = calm ? 0.7 : 0.6 + 0.4 * Math.sin(t * 0.0031 + k * 2);
        g.fillStyle = `rgba(255, 140, 50, ${(0.5 * f).toFixed(3)})`;
        g.beginPath(); g.arc(cx, cy, 10, 0, TAU); g.fill();
      }
      break;
    }
    case 'crane': {
      const sway = calm ? 0 : Math.sin(t * 0.0009) * 3;
      g.fillStyle = '#e2dccb'; g.fillRect(r.x + r.w - 20 + sway, r.y + r.h - 56, 8, 12); g.strokeStyle = INK; g.lineWidth = 1.5; g.strokeRect(r.x + r.w - 20 + sway, r.y + r.h - 56, 8, 12);
      break;
    }
    case 'pump': {
      const f = calm ? 0 : Math.sin(t * 0.003);
      g.fillStyle = 'rgba(190, 226, 230, 0.35)';
      g.beginPath(); g.arc(r.x + r.w * 0.5, r.y + r.h * 0.74 + f * 2, 4, 0, TAU); g.fill();
      break;
    }
    default: break;
  }
}

/* ------------------------------------------------------------------------------------------------------------------ *
 * Dressing: the small stories. Each is a little inked sprite put where somebody set it down; all sit in the margins,
 * on wall tops or against walls, never in a lane. Positions are full-map pixels and differ between the twin halves.
 * ------------------------------------------------------------------------------------------------------------------ */

type Dress = { kind: string; x: number; y: number; rot?: number; text?: string; flip?: boolean };

/** Items that lie on a floor next to a wall, float in a slip, or sit on a wall's top face (the default). */
const FLOORS = new Set(['wetfloor', 'doodle']);

/** Moves each hand-placed item from its hint to the nearest honest spot: on a wall top, in the water, or clear floor by a wall. */
function place(map: MapDef): Dress[] {
  const tops = map.walls.filter((w) => w.material === 'bulkhead' || w.material === 'rack' || w.material === 'hull');
  const water = map.walls.filter((w) => w.material === 'water');
  const gap = (w: Rect, x: number, y: number) => Math.hypot(Math.max(w.x - x, 0, x - w.x - w.w), Math.max(w.y - y, 0, y - w.y - w.h));
  const out: Dress[] = [];
  for (const d of DRESS) {
    if (d.kind === 'duck') {
      const w = water.sort((a, b) => gap(a, d.x, d.y) - gap(b, d.x, d.y))[0];
      if (w) out.push({ ...d, x: Math.min(w.x + w.w - 40, Math.max(w.x + 40, d.x)), y: Math.min(w.y + w.h - 40, Math.max(w.y + 40, d.y)) });
    } else if (FLOORS.has(d.kind)) {
      let best: Dress | null = null;
      for (let r = 0; r <= 300 && !best; r += 25) {
        for (let k = 0; k < 16 && !best; k++) {
          const a = (k / 16) * TAU, x = d.x + Math.cos(a) * r, y = d.y + Math.sin(a) * r;
          const clear = !map.walls.some((w) => gap(w, x, y) < 34) && x > 60 && y > 60 && x < SIZE - 60 && y < SIZE - 60;
          const near = map.walls.some((w) => gap(w, x, y) < 90);
          if (clear && (near || d.kind === 'doodle')) best = { ...d, x, y };
        }
      }
      if (best) out.push(best);
    } else {
      const w = tops.sort((a, b) => gap(a, d.x, d.y) - gap(b, d.x, d.y))[0];
      if (!w || gap(w, d.x, d.y) > 420) continue;
      const m = Math.min(w.w, w.h) < 70 ? 14 : 24;
      out.push({ ...d, x: Math.min(w.x + w.w - m, Math.max(w.x + m, d.x)), y: Math.min(w.y + w.h - m, Math.max(w.y + m, d.y)) });
    }
  }
  return out;
}

const DRESS: readonly Dress[] = [
  // DOCK 1 (sodium): the crane driver's lunch and the dockhands' board.
  { kind: 'lunch', x: 1212, y: 468, rot: -0.1 }, { kind: 'radio', x: 1262, y: 472 }, { kind: 'sign', x: 800, y: 340, text: 'WHO TOOK MY WRENCH?\n- DUTCH', rot: -0.04 },
  { kind: 'wetfloor', x: 1020, y: 470 }, { kind: 'tally', x: 640, y: 392, text: '||||' },
  // SUMP YARD: a duck, a warning, a mug on the pump pipe.
  { kind: 'duck', x: 1925, y: 860 }, { kind: 'sign', x: 3110, y: 560, text: 'DEEP!\nNO SWIMMING', rot: 0.03 }, { kind: 'note', x: 2300, y: 520, text: 'close valve\nAFTER use!', rot: 0.08 },
  // CONTROL: mugs on the board, the chalkboard of the night.
  { kind: 'mug', x: 4330, y: 735 }, { kind: 'board', x: 4800, y: 660, text: 'TONIGHT:\nALARM TEST?\n(WED!!)' }, { kind: 'note', x: 4575, y: 860, text: 'MAGS -\nNOT TONIGHT', rot: -0.1 }, { kind: 'cat', x: 4560, y: 1020 },
  // COMMS BUNKER: the soldier on the sill.
  { kind: 'toy', x: 4300, y: 2015 }, { kind: 'radio', x: 4412, y: 2062 }, { kind: 'sign', x: 5050, y: 2390, text: 'RADIO SILENCE\nSINCE 0210', rot: 0.02 },
  // SLIP 1: the crew's lunch break, a love note carved in a rack.
  { kind: 'lunch', x: 975, y: 1705 }, { kind: 'mug', x: 2080, y: 1700 }, { kind: 'heart', x: 700, y: 2970, text: 'P+M' }, { kind: 'sign', x: 1600, y: 1650, text: 'NARWHAL\nSAILS 0600', rot: 0 },
  // TORPEDO STORE
  { kind: 'sign', x: 380, y: 2860, text: 'FISH:\nHANDLE LIKE EGGS', rot: -0.02 }, { kind: 'toolbox', x: 920, y: 3330 }, { kind: 'tally', x: 360, y: 2790, text: '|||| ||' },
  // FLOOD CONTROL
  { kind: 'note', x: 1795, y: 3790, text: 'PUMP 3\nSTICKS - KICK IT', rot: 0.05 }, { kind: 'mug', x: 1710, y: 3855 }, { kind: 'toy', x: 1800, y: 3960 },
  // MACHINE SHOP
  { kind: 'sign', x: 1580, y: 5330, text: 'ORTIZ:\nDO NOT TOUCH', rot: 0.03 }, { kind: 'toolbox', x: 1350, y: 5330 }, { kind: 'lunch', x: 1720, y: 5340, rot: 0.2 }, { kind: 'cat', x: 1450, y: 5030 },
  // FUEL DEPOT
  { kind: 'sign', x: 2930, y: 5500, text: 'NO NAKED FLAME\n(THIS MEANS YOU)', rot: -0.02 }, { kind: 'wetfloor', x: 2640, y: 5200 }, { kind: 'note', x: 4570, y: 5900, text: 'tank 2\n~half', rot: 0.04 },
  // DOCK 2
  { kind: 'mug', x: 4640, y: 5895 }, { kind: 'sign', x: 5300, y: 5560, text: 'DOCK 2\nTEAL LIGHTS ONLY', rot: 0.02 }, { kind: 'doodle', x: 5900, y: 5880 },
  // CREW QUARTERS
  { kind: 'sign', x: 5300, y: 3700, text: 'LIGHTS OUT 2200\n- THE MANAGEMENT', rot: 0.0 }, { kind: 'lunch', x: 5550, y: 3880, rot: 0.3 }, { kind: 'cat', x: 5730, y: 3995 },
  // CENTRAL DOCK
  { kind: 'sign', x: 3000, y: 2530, text: 'PEN 7', rot: 0 }, { kind: 'duck', x: 2150, y: 2250 },
];

const dressSprites = new Map<string, HTMLCanvasElement>();
function dressSprite(d: Dress): HTMLCanvasElement {
  const key = `${d.kind}|${d.text ?? ''}`;
  let c = dressSprites.get(key);
  if (c) return c;
  const S = d.kind === 'sign' || d.kind === 'board' ? 180 : 64;
  const [cv, g] = canvas(S);
  c = cv;
  g.translate(S / 2, S / 2);
  const lines = (d.text ?? '').split('\n');
  switch (d.kind) {
    case 'lunch': // a newspaper sheet, half a sandwich, an apple core
      g.fillStyle = '#d9d2bd'; g.beginPath(); rr(g, -22, -14, 44, 28, 2); g.fill(); ink(g, 1.5);
      g.fillStyle = 'rgba(30,30,30,0.35)'; for (let k = 0; k < 4; k++) g.fillRect(-18, -9 + k * 5, 36, 1.5);
      g.fillStyle = '#c9a23c'; g.beginPath(); rr(g, -14, -6, 18, 9, 3); g.fill(); ink(g, 1.5);
      g.fillStyle = '#7d9b4a'; g.fillRect(-12, -3, 14, 2);
      g.fillStyle = '#c24a3a'; g.beginPath(); g.arc(12, 4, 4.5, 0, TAU); g.fill(); ink(g, 1.5);
      g.fillStyle = '#e8dcb0'; g.fillRect(9, 2, 6, 4);
      break;
    case 'mug':
      g.fillStyle = 'rgba(8,12,16,0.3)'; g.beginPath(); g.ellipse(2, 6, 9, 5, 0, 0, TAU); g.fill();
      g.fillStyle = '#d9d2bd'; g.beginPath(); g.arc(0, 0, 8, 0, TAU); g.fill(); ink(g, 2);
      g.fillStyle = '#3b2a1c'; g.beginPath(); g.arc(0, 0, 5.4, 0, TAU); g.fill();
      g.strokeStyle = INK; g.lineWidth = 2.5; g.beginPath(); g.arc(10, 0, 4, -1.2, 1.2); g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.7)'; g.fillRect(-5, -6, 3, 2);
      break;
    case 'radio':
      g.fillStyle = '#5a4a38'; g.beginPath(); rr(g, -12, -8, 24, 16, 3); g.fill(); ink(g, 2);
      g.fillStyle = '#c9a23c'; g.beginPath(); g.arc(-5, 0, 4, 0, TAU); g.fill(); ink(g, 1.2);
      g.fillStyle = '#2b2e34'; for (let k = 0; k < 3; k++) g.fillRect(3, -4 + k * 3.5, 6, 1.6);
      g.strokeStyle = INK; g.lineWidth = 1.6; g.beginPath(); g.moveTo(8, -8); g.lineTo(15, -20); g.stroke();
      break;
    case 'cat': // Torpedo, asleep
      g.fillStyle = 'rgba(8,12,16,0.28)'; g.beginPath(); g.ellipse(2, 8, 17, 8, 0, 0, TAU); g.fill();
      g.fillStyle = '#c9803a'; g.beginPath(); g.ellipse(0, 2, 15, 10, 0, 0, TAU); g.fill(); ink(g, 2);
      g.fillStyle = '#e0a060'; g.beginPath(); g.ellipse(-2, -2, 9, 4, 0, 0, TAU); g.fill();
      g.fillStyle = '#c9803a'; g.beginPath(); g.arc(-12, -1, 7, 0, TAU); g.fill(); ink(g, 2);
      g.beginPath(); g.moveTo(-17, -6); g.lineTo(-16, -12); g.lineTo(-12, -7); g.fill(); g.moveTo(-9, -7); g.lineTo(-7, -12); g.lineTo(-5, -5); g.fill();
      g.strokeStyle = INK; g.lineWidth = 1.4; g.beginPath(); g.moveTo(-15, -1); g.lineTo(-12, 0); g.moveTo(-11, -1); g.lineTo(-8, 0); g.stroke();
      g.strokeStyle = '#c9803a'; g.lineWidth = 4; g.lineCap = 'round'; g.beginPath(); g.moveTo(12, 4); g.quadraticCurveTo(20, 6, 14, 12); g.stroke(); g.lineCap = 'butt';
      break;
    case 'note':
      g.rotate(d.rot ?? 0);
      g.fillStyle = '#f0d95a'; g.fillRect(-20, -16, 40, 32); ink(g, 1.5);
      g.beginPath(); g.rect(-20, -16, 40, 32); g.stroke();
      g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(-20, 12, 40, 4);
      g.fillStyle = '#3b3320'; g.font = `600 8px ${FONT}`; g.textAlign = 'center'; lines.forEach((l, k) => g.fillText(l, 0, -5 + k * 9));
      break;
    case 'duck':
      g.fillStyle = 'rgba(8,16,20,0.4)'; g.beginPath(); g.ellipse(2, 7, 10, 4, 0, 0, TAU); g.fill();
      g.fillStyle = '#f2c835'; g.beginPath(); g.ellipse(0, 2, 9, 6.5, 0, 0, TAU); g.fill(); ink(g, 1.8);
      g.beginPath(); g.arc(-6, -4, 5, 0, TAU); g.fill(); ink(g, 1.8);
      g.fillStyle = '#e8742a'; g.beginPath(); g.moveTo(-10.5, -4); g.lineTo(-15, -3); g.lineTo(-10.5, -1.5); g.fill();
      g.fillStyle = INK; g.fillRect(-7, -6, 1.6, 1.6);
      g.fillStyle = 'rgba(255,255,255,0.8)'; g.fillRect(2, -1, 4, 2);
      break;
    case 'toy': // a green army man on a ledge, the maker's wink
      g.fillStyle = 'rgba(8,12,16,0.35)'; g.beginPath(); g.ellipse(1, 8, 6, 2.5, 0, 0, TAU); g.fill();
      g.fillStyle = '#6c7356'; g.beginPath(); rr(g, -4, -2, 8, 10, 2); g.fill(); ink(g, 1.4);
      g.beginPath(); g.arc(0, -6, 4.5, 0, TAU); g.fill(); ink(g, 1.4);
      g.fillStyle = '#4d5934'; g.beginPath(); g.arc(0, -8, 4.5, Math.PI, 0); g.fill();
      g.strokeStyle = INK; g.lineWidth = 1.6; g.beginPath(); g.moveTo(4, 0); g.lineTo(10, -4); g.stroke();
      break;
    case 'heart':
      g.fillStyle = 'rgba(14,18,22,0.55)'; g.beginPath(); g.moveTo(0, 8); g.bezierCurveTo(-14, -2, -8, -12, 0, -5); g.bezierCurveTo(8, -12, 14, -2, 0, 8); g.fill();
      g.fillStyle = 'rgba(226,220,203,0.8)'; g.font = `700 7px ${FONT}`; g.textAlign = 'center'; g.fillText(d.text ?? '', 0, 14);
      break;
    case 'toolbox':
      g.fillStyle = 'rgba(8,12,16,0.3)'; g.fillRect(-14, 5, 30, 5);
      g.fillStyle = '#a8493f'; g.beginPath(); rr(g, -15, -7, 30, 14, 3); g.fill(); ink(g, 2);
      g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(-13, -6, 26, 3);
      g.fillStyle = '#2b2e34'; g.fillRect(-4, -10, 8, 4); g.strokeStyle = INK; g.lineWidth = 1.5; g.strokeRect(-4, -10, 8, 4);
      g.strokeStyle = '#9aa5b0'; g.lineWidth = 3; g.beginPath(); g.moveTo(18, -4); g.lineTo(28, 4); g.stroke();
      break;
    case 'wetfloor':
      g.fillStyle = 'rgba(8,12,16,0.3)'; g.beginPath(); g.ellipse(0, 11, 12, 4, 0, 0, TAU); g.fill();
      g.fillStyle = '#d4b24a'; g.beginPath(); g.moveTo(-10, 10); g.lineTo(-6, -12); g.lineTo(6, -12); g.lineTo(10, 10); g.closePath(); g.fill(); ink(g, 2);
      g.fillStyle = '#2b2e34'; g.fillRect(-3, -6, 6, 12); g.fillStyle = '#d4b24a'; g.fillRect(-1, -3, 2, 5);
      break;
    case 'tally':
      g.strokeStyle = 'rgba(226,220,203,0.65)'; g.lineWidth = 2; g.beginPath();
      { let x = -22; for (const ch of (d.text ?? '')) { if (ch === '|') { g.moveTo(x, -8); g.lineTo(x, 8); x += 6; } else x += 5; } }
      g.stroke();
      break;
    case 'doodle': // the maker's signature: a small smiling submarine and a date
      g.strokeStyle = 'rgba(226,220,203,0.6)'; g.lineWidth = 2; g.lineCap = 'round';
      g.beginPath(); g.ellipse(0, 0, 18, 8, 0, 0, TAU); g.moveTo(-4, -8); g.lineTo(-4, -14); g.lineTo(4, -14); g.lineTo(4, -8);
      g.moveTo(-5, 0); g.arc(-5, 0, 0.5, 0, TAU); g.moveTo(5, 0); g.arc(5, 0, 0.5, 0, TAU); g.moveTo(-6, 4); g.quadraticCurveTo(0, 8, 6, 4);
      g.stroke(); g.lineCap = 'butt';
      g.fillStyle = 'rgba(226,220,203,0.6)'; g.font = `700 8px ${FONT}`; g.textAlign = 'center'; g.fillText('made with love 2026', 0, 22);
      break;
    case 'sign': case 'board': {
      const w = d.kind === 'board' ? 110 : 120, h = lines.length * 14 + 14;
      g.rotate(d.rot ?? 0);
      g.fillStyle = 'rgba(8,12,16,0.32)'; g.fillRect(-w / 2 + 3, -h / 2 + 4, w, h);
      g.fillStyle = d.kind === 'board' ? '#243a34' : '#c8b48a';
      g.beginPath(); rr(g, -w / 2, -h / 2, w, h, 3); g.fill(); ink(g, 2);
      if (d.kind === 'board') { g.strokeStyle = '#8a6a44'; g.lineWidth = 4; g.strokeRect(-w / 2, -h / 2, w, h); }
      g.fillStyle = d.kind === 'board' ? '#e2e8de' : '#3b2f1e';
      g.font = `700 11px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      lines.forEach((l, k) => g.fillText(l, 0, -h / 2 + 14 + k * 14));
      g.fillStyle = 'rgba(14,18,22,0.6)'; g.fillRect(-w / 2 + 3, -h / 2 + 3, 2, 2); g.fillRect(w / 2 - 5, -h / 2 + 3, 2, 2);
      break;
    }
    default: break;
  }
  dressSprites.set(key, c);
  return c;
}

function drawDress(ctx: CanvasRenderingContext2D, now: number, view: ThemeView, calm: boolean, list: readonly Dress[]) {
  for (const [i, d] of list.entries()) {
    if (!inView(view, d.x, d.y, 100)) continue;
    const sp = dressSprite(d), S = sp.width;
    let y = d.y, sc = 1, x = d.x;
    if (d.kind === 'cat') sc = 1 + (calm ? 0 : Math.sin(now * 0.0017 + i) * 0.035);
    if (d.kind === 'duck') y += calm ? 0 : Math.sin(now * 0.0011 + i) * 1.8;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(d.kind === 'sign' || d.kind === 'board' || d.kind === 'note' ? 0 : d.rot ?? 0);
    ctx.scale(sc, sc);
    ctx.drawImage(sp, -S / 2, -S / 2);
    ctx.restore();
    if (d.kind === 'mug' && !calm) {
      const u = ((now * 0.0004 + i * 0.37) % 1);
      ctx.strokeStyle = `rgba(230, 236, 238, ${(0.4 * (1 - u)).toFixed(3)})`;
      ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(d.x - 2, d.y - 6); ctx.quadraticCurveTo(d.x + 3 * Math.sin(u * 5), d.y - 12 - u * 8, d.x - 1, d.y - 18 - u * 12); ctx.stroke();
    }
    if (d.kind === 'radio') {
      const on = calm || Math.sin(now * 0.0028 + i * 3) > 0.2;
      ctx.fillStyle = on ? '#ff5a48' : '#4a2a26';
      ctx.fillRect(d.x + 3, d.y - 7, 2.6, 2.6);
    }
  }
}

/** A moth about each lamp that has one, circling in no hurry. */
function drawMoths(ctx: CanvasRenderingContext2D, now: number, view: ThemeView, lamps: readonly { x: number; y: number }[], calm: boolean) {
  for (const [i, l] of lamps.entries()) {
    if (i % 3 !== 0 || !inView(view, l.x, l.y, 60)) continue;
    const a = calm ? i : now * 0.0013 + i * 2.2, rad = 20 + 8 * Math.sin(now * 0.0007 + i);
    const mx = l.x + Math.cos(a) * rad, my = l.y + 12 + Math.sin(a * 1.3) * rad * 0.6;
    const flap = calm ? 1 : Math.abs(Math.sin(now * 0.02 + i));
    ctx.fillStyle = 'rgba(226, 214, 190, 0.8)';
    ctx.fillRect(mx - 2.5, my - 1, 2.2, 1.4 + flap * 1.2); ctx.fillRect(mx + 0.3, my - 1, 2.2, 1.4 + flap * 1.2);
    ctx.fillStyle = INK; ctx.fillRect(mx - 0.6, my - 1, 1.2, 3);
  }
}

export type KitSites = { landmarks: Landmark[]; dress: Dress[] };
const kitOf = new WeakMap<MapDef, KitSites>();

export function drawKit(ctx: CanvasRenderingContext2D, now: number, view: ThemeView, map: MapDef, lamps: readonly { x: number; y: number }[]) {
  let kit = kitOf.get(map);
  if (!kit) kitOf.set(map, (kit = { landmarks: landmarksOf(map), dress: place(map) }));
  const calm = reducedMotion();
  for (const l of kit.landmarks) {
    if (!inView(view, l.rect.x + l.rect.w / 2, l.rect.y + l.rect.h / 2, l.rect.w + 100)) continue;
    ctx.drawImage(spriteOf(l.kind, l.rect.w, l.rect.h), l.rect.x - PAD, l.rect.y - PAD);
    animate(ctx, l.kind, l.rect, now, calm);
  }
  drawDress(ctx, now, view, calm, kit.dress);
  drawMoths(ctx, now, view, lamps, calm);
}

