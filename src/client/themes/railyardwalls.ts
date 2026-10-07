import type { Solid, SolidKind } from '../tilt.ts';
import { C, hash, openSides, TAU, type Open } from './railyardkit.ts';

/**
 * The Rail Yard's solids, each painted whole into its sprite: a front face hanging below the south edge, a top face with two
 * cel steps, and an ink outline on the sides that face open air. Brick for the terminus, cast iron for columns and the crane
 * foot, painted wagons for the sidings, timber stacks, green-and-cream joinery, and coal.
 */
type G = CanvasRenderingContext2D;
type Rc = { x: number; y: number; w: number; h: number };
export const RY_FACE = { terminus: 18, ironwork: 10, boxcar: 16, sleepers: 12, kiosk: 14, coalheap: 10 } as const;

const LIT = 'rgba(255, 246, 215, 0.2)', DARK = 'rgba(8, 12, 18, 0.3)';

function outline(g: G, s: Rc, o: Open, width = 2) {
  g.strokeStyle = C.ink; g.lineWidth = width; g.lineCap = 'square'; g.beginPath();
  for (const [a, b] of o.spans.n) { g.moveTo(s.x + a, s.y); g.lineTo(s.x + b, s.y); }
  for (const [a, b] of o.spans.s) { g.moveTo(s.x + a, s.y + s.h); g.lineTo(s.x + b, s.y + s.h); }
  for (const [a, b] of o.spans.w) { g.moveTo(s.x, s.y + a); g.lineTo(s.x, s.y + b); }
  for (const [a, b] of o.spans.e) { g.moveTo(s.x + s.w, s.y + a); g.lineTo(s.x + s.w, s.y + b); }
  g.stroke();
}
function cel(g: G, s: Rc, o: Open, e = 4) {
  g.fillStyle = LIT;
  for (const [a, b] of o.spans.n) g.fillRect(s.x + a, s.y, b - a, e);
  for (const [a, b] of o.spans.w) g.fillRect(s.x, s.y + a, e, b - a);
  g.fillStyle = DARK;
  for (const [a, b] of o.spans.s) g.fillRect(s.x + a, s.y + s.h - e, b - a, e);
  for (const [a, b] of o.spans.e) g.fillRect(s.x + s.w - e, s.y + a, e, b - a);
}
/** The front face over each open stretch of the south edge; returns the spans. */
function face(g: G, s: Rc, o: Open, fh: number, fill: string, low: string) {
  const list = o.spans.s.map(([a, b]) => ({ x: s.x + a, y: s.y + s.h, w: b - a, h: fh }));
  g.fillStyle = fill; for (const q of list) g.fillRect(q.x, q.y, q.w, q.h);
  g.fillStyle = 'rgba(255, 246, 215, 0.12)'; for (const q of list) g.fillRect(q.x, q.y, q.w, 2);
  g.fillStyle = low; for (const q of list) g.fillRect(q.x, q.y + fh * 0.68, q.w, fh * 0.32);
  g.strokeStyle = C.ink; g.lineWidth = 2; g.lineJoin = 'miter'; g.beginPath();
  for (const q of list) { g.moveTo(q.x, q.y); g.lineTo(q.x, q.y + fh); g.lineTo(q.x + q.w, q.y + fh); g.lineTo(q.x + q.w, q.y); }
  g.stroke();
  return list;
}
const rr = (g: G, x: number, y: number, w: number, h: number, r: number) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + r, y, r); g.closePath(); };

/* ---------------------------------------------------------------- brick */

const isTower = (s: Rc) => s.w === 200 && s.h === 200;
const inTunnel = (s: Rc) => (s.x >= 5400 && s.y > 900 && s.y < 1600) || (s.x + s.w <= 600 && s.y > 4400 && s.y < 5100);

function brick(g: G, s: Solid) {
  const o = openSides('terminus', s), fh = RY_FACE.terminus;
  const rock = inTunnel(s);
  const base = rock ? '#5a5048' : C.brick, front = rock ? '#3e3630' : C.brickFront, low = rock ? '#2c2622' : C.brickDeep;
  const { x, y, w, h } = s;
  if (isTower(s)) { clockTowerBase(g, s); return; }
  const list = face(g, s, o, fh, front, low);
  // Courses on the front face, stretcher bond, with now and then a lit arched slit.
  g.strokeStyle = 'rgba(20, 8, 6, 0.38)'; g.lineWidth = 1.2; g.beginPath();
  for (const q of list) {
    for (let r = 1; r < 3; r++) { const yy = q.y + (fh * r) / 3; g.moveTo(q.x, yy); g.lineTo(q.x + q.w, yy); }
    for (let r = 0; r < 3; r++) for (let xx = q.x + (r % 2 ? 8 : 0) + 8; xx < q.x + q.w; xx += 16) { g.moveTo(xx, q.y + (fh * r) / 3); g.lineTo(xx, q.y + (fh * (r + 1)) / 3); }
  }
  g.stroke();
  if (!rock && w >= 200) for (const q of list) for (let xx = q.x + 34; xx < q.x + q.w - 20; xx += 100) {
    if (hash(Math.round(xx), Math.round(q.y), 3) < 0.45) continue;
    g.fillStyle = C.ink; g.beginPath(); g.moveTo(xx - 5, q.y + fh - 3); g.lineTo(xx - 5, q.y + 7); g.arc(xx, q.y + 7, 5, Math.PI, 0); g.lineTo(xx + 5, q.y + fh - 3); g.fill();
    g.fillStyle = 'rgba(255, 200, 110, 0.85)'; g.beginPath(); g.moveTo(xx - 3, q.y + fh - 4); g.lineTo(xx - 3, q.y + 7); g.arc(xx, q.y + 7, 3, Math.PI, 0); g.lineTo(xx + 3, q.y + fh - 4); g.fill();
  }
  // Top: brick colour, courses, a coping edge.
  g.fillStyle = base; g.fillRect(x, y, w, h);
  g.strokeStyle = rock ? 'rgba(10, 8, 6, 0.3)' : 'rgba(40, 14, 10, 0.3)'; g.lineWidth = 1; g.beginPath();
  if (h >= 24 && w >= 24) for (let yy = y + 8; yy < y + h; yy += 8) { g.moveTo(x, yy); g.lineTo(x + w, yy); }
  g.stroke();
  if (rock) { g.fillStyle = 'rgba(10, 8, 6, 0.28)'; for (let i = 0; i < Math.max(2, (w * h) / 900); i++) { const px = x + hash(x, y, i) * w, py = y + hash(y, x, i + 9) * h; g.beginPath(); g.ellipse(px, py, 5 + hash(i, x) * 9, 3 + hash(i, y) * 5, 0, 0, TAU); g.fill(); } }
  cel(g, s, o, 5);
  // Coping stones along the long axis.
  g.fillStyle = rock ? '#6a5f55' : '#b8715a';
  if (w >= h) g.fillRect(x + 3, y + h / 2 - 2, w - 6, 4); else g.fillRect(x + w / 2 - 2, y + 3, 4, h - 6);
  outline(g, s, o);
}

/** The clock tower's footprint: a brick plinth, stone quoins and a slate pyramid base; the shaft and clock rise in the over layer. */
function clockTowerBase(g: G, s: Solid) {
  const { x, y, w, h } = s, fh = 18;
  g.fillStyle = C.brickFront; g.fillRect(x, y + h, w, fh);
  g.fillStyle = C.brickDeep; g.fillRect(x, y + h + fh * 0.7, w, fh * 0.3);
  g.strokeStyle = C.ink; g.lineWidth = 2; g.strokeRect(x, y + h, w, fh);
  g.fillStyle = C.brick; g.fillRect(x, y, w, h);
  g.fillStyle = '#c9bfa6'; for (const [px, py] of [[x, y], [x + w - 22, y], [x, y + h - 22], [x + w - 22, y + h - 22]]) g.fillRect(px!, py!, 22, 22);
  g.strokeStyle = 'rgba(40, 14, 10, 0.35)'; g.lineWidth = 1; g.beginPath(); for (let yy = y + 8; yy < y + h; yy += 8) { g.moveTo(x + 22, yy); g.lineTo(x + w - 22, yy); } g.stroke();
  g.fillStyle = C.slate; g.beginPath(); g.moveTo(x + 22, y + 22); g.lineTo(x + w - 22, y + 22); g.lineTo(x + w - 52, y + 52); g.lineTo(x + 52, y + 52); g.fill();
  g.fillStyle = C.slateHi; g.fillRect(x + 52, y + 52, w - 104, h - 104);
  g.strokeStyle = 'rgba(20, 24, 32, 0.5)'; g.beginPath(); g.moveTo(x + 22, y + 22); g.lineTo(x + 52, y + 52); g.moveTo(x + w - 22, y + 22); g.lineTo(x + w - 52, y + 52); g.moveTo(x + 22, y + h - 22); g.lineTo(x + 52, y + h - 52); g.moveTo(x + w - 22, y + h - 22); g.lineTo(x + w - 52, y + h - 52); g.stroke();
  g.strokeStyle = C.ink; g.lineWidth = 2.5; g.strokeRect(x, y, w, h);
}

/* ------------------------------------------------------------- ironwork */

function ironwork(g: G, s: Solid) {
  const { x, y, w, h } = s, fh = RY_FACE.ironwork;
  if (w >= 150 || h >= 150) return craneFoot(g, s);
  // A fluted cast-iron column: round shaft, brass collar, a fleur capital.
  const cx = x + w / 2, cy = y + h / 2, r = Math.min(w, h) / 2 - 3;
  g.fillStyle = 'rgba(10, 12, 18, 0.0)';
  g.fillStyle = C.ironFront; rr(g, cx - r, cy, r * 2, r + fh, 7); g.fill();
  g.strokeStyle = C.ink; g.lineWidth = 2; g.stroke();
  g.fillStyle = C.ironLo; g.fillRect(cx + r * 0.2, cy + 4, r * 0.7, fh + r - 6);
  g.fillStyle = C.brass; g.fillRect(cx - r, cy + r + 2, r * 2, 4);
  g.fillStyle = C.iron; g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.fill();
  g.strokeStyle = C.ink; g.lineWidth = 2; g.stroke();
  g.fillStyle = C.ironHi; g.beginPath(); g.arc(cx - r * 0.25, cy - r * 0.25, r * 0.55, 0, TAU); g.fill();
  g.strokeStyle = C.brass; g.lineWidth = 2; g.beginPath(); g.arc(cx, cy, r * 0.62, 0, TAU); g.stroke();
  g.fillStyle = C.iron; g.beginPath(); g.arc(cx, cy, r * 0.28, 0, TAU); g.fill();
  g.fillStyle = 'rgba(255, 255, 255, 0.55)'; g.beginPath(); g.arc(cx - r * 0.38, cy - r * 0.38, 2, 0, TAU); g.fill();
}

function craneFoot(g: G, s: Solid) {
  const { x, y, w, h } = s, fh = 22;
  g.fillStyle = '#4a2c1e'; g.fillRect(x, y + h, w, fh);
  g.fillStyle = '#33201a'; g.fillRect(x, y + h + fh * 0.65, w, fh * 0.35);
  g.strokeStyle = C.ink; g.lineWidth = 2; g.strokeRect(x, y + h, w, fh);
  g.fillStyle = C.rust; g.fillRect(x, y, w, h);
  const r = (i: number) => hash(x, y, i);
  for (let i = 0; i < 40; i++) { g.fillStyle = r(i) < 0.5 ? C.rustLo : '#c0703c'; g.globalAlpha = 0.5; g.fillRect(x + r(i + 50) * w, y + r(i + 90) * h, 6 + r(i) * 14, 3); }
  g.globalAlpha = 1;
  g.fillStyle = '#2e2420'; g.fillRect(x + 22, y + 22, w - 44, h - 44);
  g.strokeStyle = C.ink; g.lineWidth = 2; g.strokeRect(x + 22, y + 22, w - 44, h - 44);
  g.fillStyle = '#c9a23c';
  for (let i = 0; i < w - 40; i += 16) { g.save(); g.beginPath(); g.rect(x + 24, y + h - 20, w - 48, 14); g.clip(); g.fillRect(x + 24 + i, y + h - 20, 8, 14); g.restore(); }
  g.fillStyle = C.ironHi; for (const [px, py] of [[x + 10, y + 10], [x + w - 10, y + 10], [x + 10, y + h - 10], [x + w - 10, y + h - 10]]) { g.beginPath(); g.arc(px!, py!, 4, 0, TAU); g.fill(); }
  g.strokeStyle = C.ink; g.lineWidth = 2.5; g.strokeRect(x, y, w, h);
  g.fillStyle = LIT; g.fillRect(x, y, w, 4); g.fillRect(x, y, 4, h);
}

/* --------------------------------------------------------------- boxcar */

const LIVERIES = [
  { top: '#8a3d2c', side: '#6e2e20', low: '#4a2016', door: '#5a261a', name: 'GCR' },
  { top: '#6a5a40', side: '#52452f', low: '#382f20', door: '#44392a', name: 'N.E.R.' },
  { top: '#4f6a5a', side: '#3b5246', low: '#27382f', door: '#314639', name: 'L.M.S.' },
  { top: '#7a3a3a', side: '#5e2c2c', low: '#401d1d', door: '#4c2222', name: 'G.W.R.' },
] as const;

function boxcar(g: G, s: Solid) {
  const { x, y, w, h } = s, fh = RY_FACE.boxcar;
  const L = LIVERIES[Math.floor(hash(x, y, 1) * LIVERIES.length)]!;
  const horiz = w >= h;
  // Front face: planked side with a sliding door, door bar, diagonal brace and the owner's name.
  g.fillStyle = L.side; g.fillRect(x, y + h, w, fh);
  g.fillStyle = L.low; g.fillRect(x, y + h + fh * 0.7, w, fh * 0.3);
  g.strokeStyle = 'rgba(10, 6, 4, 0.45)'; g.lineWidth = 1; g.beginPath();
  for (let xx = x + 8; xx < x + w; xx += 9) { g.moveTo(xx, y + h + 1); g.lineTo(xx, y + h + fh * 0.7); }
  g.stroke();
  if (horiz) {
    const dx = x + w / 2 - 30;
    g.fillStyle = L.door; g.fillRect(dx, y + h + 1, 60, fh * 0.72);
    g.strokeStyle = C.ink; g.lineWidth = 1.5; g.strokeRect(dx, y + h + 1, 60, fh * 0.72);
    g.beginPath(); g.moveTo(dx, y + h + 1); g.lineTo(dx + 60, y + h + fh * 0.72); g.moveTo(dx + 60, y + h + 1); g.lineTo(dx, y + h + fh * 0.72); g.stroke();
    g.fillStyle = 'rgba(226, 220, 203, 0.8)'; g.font = '700 7px "Barlow Condensed", sans-serif'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText(L.name, x + 10, y + h + fh * 0.36);
    g.textAlign = 'right'; g.fillText(String(1000 + Math.floor(hash(x, y, 7) * 8999)), x + w - 10, y + h + fh * 0.36);
  }
  // Wheels peek under the body.
  g.fillStyle = C.coal;
  if (horiz) for (const wx of [x + w * 0.2, x + w * 0.8]) g.fillRect(wx - 14, y + h + fh - 2, 28, 5);
  g.strokeStyle = C.ink; g.lineWidth = 2; g.strokeRect(x, y + h, w, fh);
  // Roof: a shallow ridge with a catwalk and a ventilator.
  g.fillStyle = L.top; g.fillRect(x, y, w, h);
  g.fillStyle = 'rgba(0, 0, 0, 0.18)'; if (horiz) g.fillRect(x, y + h * 0.5, w, h * 0.5); else g.fillRect(x + w * 0.5, y, w * 0.5, h);
  g.strokeStyle = 'rgba(10, 6, 4, 0.4)'; g.lineWidth = 1; g.beginPath();
  if (horiz) for (let xx = x + 22; xx < x + w; xx += 22) { g.moveTo(xx, y + 2); g.lineTo(xx, y + h - 2); } else for (let yy = y + 22; yy < y + h; yy += 22) { g.moveTo(x + 2, yy); g.lineTo(x + w - 2, yy); }
  g.stroke();
  g.fillStyle = '#9a8a6a'; if (horiz) g.fillRect(x + 10, y + h / 2 - 5, w - 20, 10); else g.fillRect(x + w / 2 - 5, y + 10, 10, h - 20);
  g.fillStyle = '#2a2c30'; g.beginPath(); g.arc(x + w * 0.3, y + h * 0.5, 7, 0, TAU); g.fill(); g.strokeStyle = C.ink; g.lineWidth = 1.5; g.stroke();
  g.fillStyle = LIT; g.fillRect(x, y, w, 4); g.fillStyle = DARK; g.fillRect(x, y + h - 4, w, 4);
  g.fillStyle = C.coalHi; g.beginPath(); g.arc(x + 8, y + h / 2, 4, 0, TAU); g.arc(x + w - 8, y + h / 2, 4, 0, TAU); g.fill();
  g.strokeStyle = C.ink; g.lineWidth = 2.5; g.strokeRect(x, y, w, h);
}

/* -------------------------------------------------------------- sleepers */

function sleepers(g: G, s: Solid) {
  const o = openSides('sleepers', s), fh = RY_FACE.sleepers;
  const { x, y, w, h } = s;
  // The face shows square timber ends, stacked.
  const list = face(g, s, o, fh, C.timberLo, '#2c2014');
  g.strokeStyle = 'rgba(10, 6, 2, 0.6)'; g.lineWidth = 1.5; g.beginPath();
  for (const q of list) { g.moveTo(q.x, q.y + fh / 2); g.lineTo(q.x + q.w, q.y + fh / 2); for (let xx = q.x + 12; xx < q.x + q.w; xx += 12) { g.moveTo(xx, q.y); g.lineTo(xx, q.y + fh); } }
  g.stroke();
  g.fillStyle = C.timber; g.fillRect(x, y, w, h);
  // Timbers lie side by side, each its own tone.
  const horiz = w >= h, n = Math.max(2, Math.round((horiz ? h : w) / 12));
  for (let i = 0; i < n; i++) {
    g.fillStyle = [C.timber, C.timberHi, '#5c4329', '#6a4e30'][Math.floor(hash(x, y, i) * 4)]!;
    if (horiz) g.fillRect(x + 2, y + (h * i) / n + 1, w - 4, h / n - 1.5); else g.fillRect(x + (w * i) / n + 1, y + 2, w / n - 1.5, h - 4);
  }
  g.fillStyle = 'rgba(10, 6, 2, 0.35)'; for (let i = 0; i < 6; i++) g.fillRect(x + hash(x, i, 2) * (w - 12), y + hash(y, i, 3) * (h - 4), 10, 2);
  cel(g, s, o); outline(g, s, o);
}

/* ------------------------------------------------------------------ kiosk */

const FRAMES = [[44, 18, 53, 21], [56, 30, 65, 33], [82, 17, 89, 22], [51, 48, 54, 51]] as const;
function isJoinery(s: Rc): boolean {
  // Wall of a platform room, hut or signal box (on a room's outline), as against a counter or bench.
  for (const [c0, r0, c1, r1] of FRAMES) for (const t of [false, true]) {
    const x0 = (t ? 6000 - (c1 + 1) * 50 : c0 * 50), y0 = (t ? 6000 - (r1 + 1) * 50 : r0 * 50), x1 = t ? 6000 - c0 * 50 : (c1 + 1) * 50, y1 = t ? 6000 - r0 * 50 : (r1 + 1) * 50;
    if (s.x >= x0 - 1 && s.y >= y0 - 1 && s.x + s.w <= x1 + 1 && s.y + s.h <= y1 + 1) return true;
  }
  return false;
}

function kiosk(g: G, s: Solid) {
  const o = openSides('kiosk', s), fh = RY_FACE.kiosk;
  const { x, y, w, h } = s;
  const wall = isJoinery(s);
  const bench = !wall && Math.min(w, h) <= 50 && Math.max(w, h) <= 160;
  const counter = !wall && !bench;
  const list = face(g, s, o, fh, wall ? C.paintGreenLo : bench ? C.timberLo : '#3a2c1c', wall ? '#1f3328' : '#2c2014');
  // Vertical boarding, with a lit window in the face of a long wall.
  g.strokeStyle = 'rgba(8, 14, 10, 0.4)'; g.lineWidth = 1; g.beginPath();
  for (const q of list) for (let xx = q.x + 7; xx < q.x + q.w; xx += 7) { g.moveTo(xx, q.y + 2); g.lineTo(xx, q.y + fh - 1); }
  g.stroke();
  if (wall) for (const q of list) if (q.w >= 120) for (let xx = q.x + 24; xx < q.x + q.w - 30; xx += 70) {
    g.fillStyle = C.ink; g.fillRect(xx - 1, q.y + 2, 24, fh - 4);
    g.fillStyle = 'rgba(255, 214, 140, 0.9)'; g.fillRect(xx + 1, q.y + 4, 20, fh - 8);
    g.fillStyle = C.ink; g.fillRect(xx + 10, q.y + 4, 2, fh - 8);
  }
  // Top.
  g.fillStyle = wall ? C.paintGreen : bench ? C.timber : '#7a5030'; g.fillRect(x, y, w, h);
  if (wall) { g.fillStyle = C.cream; if (w >= h) g.fillRect(x + 3, y + h / 2 - 1.5, w - 6, 3); else g.fillRect(x + w / 2 - 1.5, y + 3, 3, h - 6); }
  if (bench) {
    g.strokeStyle = 'rgba(10, 6, 2, 0.45)'; g.lineWidth = 1; g.beginPath();
    if (w >= h) for (let yy = y + 12; yy < y + h; yy += 12) { g.moveTo(x, yy); g.lineTo(x + w, yy); } else for (let xx = x + 12; xx < x + w; xx += 12) { g.moveTo(xx, y); g.lineTo(xx, y + h); }
    g.stroke();
    g.fillStyle = C.brassLo; g.fillRect(x + 4, y + 4, 4, 4); g.fillRect(x + w - 8, y + h - 8, 4, 4);
  }
  if (counter) {
    // A zinc or marble top inset in a timber edge, with a brass rail, cups and papers where a counter has them.
    g.fillStyle = '#c9c6b8'; g.fillRect(x + 5, y + 5, w - 10, h - 10);
    g.strokeStyle = C.brass; g.lineWidth = 2; g.strokeRect(x + 5, y + 5, w - 10, h - 10);
    g.fillStyle = 'rgba(255, 255, 255, 0.25)'; g.fillRect(x + 7, y + 7, w - 14, 3);
    if (w >= 100 && h >= 40) { g.fillStyle = '#f2eee0'; g.beginPath(); g.arc(x + w * 0.3, y + h / 2, 5, 0, TAU); g.arc(x + w * 0.7, y + h / 2, 5, 0, TAU); g.fill(); g.strokeStyle = C.ink; g.lineWidth = 1.2; g.stroke(); }
  }
  cel(g, s, o); outline(g, s, o);
}

/* ----------------------------------------------------------------- coal */

function coalheap(g: G, s: Solid) {
  const { x, y, w, h } = s, fh = RY_FACE.coalheap;
  if (w >= 300) return hopper(g, s);
  g.fillStyle = '#17181c'; g.fillRect(x + 4, y + h - 6, w - 8, fh + 6);
  g.fillStyle = C.coal; g.beginPath();
  g.moveTo(x, y + h); g.quadraticCurveTo(x + w * 0.1, y + h * 0.1, x + w * 0.5, y); g.quadraticCurveTo(x + w * 0.9, y + h * 0.1, x + w, y + h); g.closePath(); g.fill();
  g.strokeStyle = C.ink; g.lineWidth = 2.5; g.stroke();
  for (let i = 0; i < 40; i++) {
    const px = x + 6 + hash(x, y, i) * (w - 12), py = y + 8 + hash(y, x, i + 3) * (h - 10);
    g.fillStyle = i % 3 ? C.coalHi : '#6a6c78'; g.beginPath(); g.moveTo(px, py); g.lineTo(px + 5, py + 2); g.lineTo(px + 2, py + 5); g.closePath(); g.fill();
  }
  g.fillStyle = 'rgba(255, 255, 255, 0.35)'; g.beginPath(); g.arc(x + w * 0.38, y + h * 0.3, 2, 0, TAU); g.fill();
}

/** The coal hopper: a riveted iron bin on legs above a chute, a gantry along its top, and coal heaped on the rim. */
function hopper(g: G, s: Solid) {
  const { x, y, w, h } = s, fh = 10;
  g.fillStyle = '#2b2d33'; g.fillRect(x, y + h, w, fh);
  g.fillStyle = '#17181c'; g.fillRect(x, y + h + fh * 0.6, w, fh * 0.4);
  g.fillStyle = C.ironFront; for (let i = 0; i < 5; i++) g.fillRect(x + 12 + (i * (w - 44)) / 4, y + h + 2, 12, fh - 2);
  g.strokeStyle = C.ink; g.lineWidth = 2; g.strokeRect(x, y + h, w, fh);
  g.fillStyle = '#3b3e47'; g.fillRect(x, y, w, h);
  g.fillStyle = '#2b2d33'; g.fillRect(x + 14, y + 14, w - 28, h - 28);
  g.fillStyle = C.coal; g.beginPath(); g.moveTo(x + 14, y + h - 14); for (let i = 0; i <= 10; i++) g.lineTo(x + 14 + ((w - 28) * i) / 10, y + 20 + hash(x, i, 4) * 26); g.lineTo(x + w - 14, y + h - 14); g.closePath(); g.fill();
  for (let i = 0; i < 80; i++) { g.fillStyle = i % 3 ? C.coalHi : '#6a6c78'; g.fillRect(x + 22 + hash(x, i, 5) * (w - 44), y + 24 + hash(y, i, 6) * (h - 48), 4, 3); }
  g.strokeStyle = C.brass; g.lineWidth = 3; g.beginPath(); g.moveTo(x + 6, y + 6); g.lineTo(x + w - 6, y + 6); g.moveTo(x + 6, y + h - 6); g.lineTo(x + w - 6, y + h - 6); g.stroke();
  g.fillStyle = C.ironHi; for (let i = 0; i < 12; i++) { g.beginPath(); g.arc(x + 10 + (i * (w - 20)) / 11, y + 10, 2.5, 0, TAU); g.fill(); }
  g.strokeStyle = C.ink; g.lineWidth = 2.5; g.strokeRect(x, y, w, h);
  g.fillStyle = LIT; g.fillRect(x, y, w, 4);
  g.fillStyle = C.brass; g.font = '700 22px "Barlow Condensed", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('WELSH STEAM COAL', x + w / 2, y + h / 2 + 70);
}

export const RAIL_WALLS: Partial<Record<SolidKind, (ctx: CanvasRenderingContext2D, s: Solid) => void>> = { terminus: brick, ironwork, boxcar, sleepers, kiosk, coalheap };
