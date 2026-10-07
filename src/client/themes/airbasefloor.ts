import { DISTRICTS, ROOMS, SIZE, STENCILS, TOWER, type District, type RoomKind } from '../../shared/maps/airbasedata.ts';
import type { Rect } from '../../shared/sim/movement.ts';
import { stencil, type FloorPlan } from '../floor.ts';
import { blotch, seeded } from '../grain.ts';
import { FLOOR, INK } from '../palette.ts';

/**
 * The Airbase floor. Outdoors it is apron concrete, darker than the yards of the other maps, with the paint of a working
 * flight line: yellow taxi centrelines with their edge lines, aircraft stands, chocks, tie-downs and a dashed runway
 * centreline down the long avenue. Indoors each building has its own floor (cold epoxy and a painted service bay in the
 * hangars, hazard-edged green in the maintenance bay, olive lino and boards in the barracks, a checkerboard mess, a round
 * lobby with a compass rose under the tower). Every district also gets a faint wash of its own light. Baked once; the half-turn
 * twin is painted from the turned rectangles, so its text still reads the right way up.
 */
const TAU = Math.PI * 2;
const PAINT = FLOOR.paint;
const BONE = '#d2cab4';
const hexA = (hex: string, a: number) => {
  const v = parseInt(hex.slice(1), 16);
  return `rgba(${(v >> 16) & 255}, ${(v >> 8) & 255}, ${v & 255}, ${a})`;
};
const turnRect = (r: Rect): Rect => ({ x: SIZE - r.x - r.w, y: SIZE - r.y - r.h, w: r.w, h: r.h });
const turnPt = (x: number, y: number): [number, number] => [SIZE - x, SIZE - y];

type G = CanvasRenderingContext2D;

function hazard(g: G, x: number, y: number, w: number, h: number, a: string, b: string, band = 14) {
  g.save();
  g.beginPath(); g.rect(x, y, w, h); g.clip();
  g.fillStyle = a; g.fillRect(x, y, w, h);
  g.fillStyle = b;
  const step = band * 2;
  for (let k = -h; k < w + h; k += step) {
    g.beginPath(); g.moveTo(x + k, y + h); g.lineTo(x + k + band, y + h); g.lineTo(x + k + band + h, y); g.lineTo(x + k + h, y); g.closePath(); g.fill();
  }
  g.restore();
}

/** A hazard-striped frame, `t` thick, inside a rect. */
function hazardFrame(g: G, r: Rect, t: number, a = '#2b2e34', b = '#b79a4a', alpha = 0.8) {
  g.save();
  g.globalAlpha = alpha;
  hazard(g, r.x, r.y, r.w, t, a, b, t); hazard(g, r.x, r.y + r.h - t, r.w, t, a, b, t);
  hazard(g, r.x, r.y + t, t, r.h - 2 * t, a, b, t); hazard(g, r.x + r.w - t, r.y + t, t, r.h - 2 * t, a, b, t);
  g.restore();
}

function grid(g: G, r: Rect, step: number, color: string, w = 2, ox = 0, oy = 0) {
  g.strokeStyle = color; g.lineWidth = w; g.beginPath();
  for (let x = r.x + ox; x < r.x + r.w; x += step) { g.moveTo(x, r.y); g.lineTo(x, r.y + r.h); }
  for (let y = r.y + oy; y < r.y + r.h; y += step) { g.moveTo(r.x, y); g.lineTo(r.x + r.w, y); }
  g.stroke();
}

function checker(g: G, r: Rect, t: number, a: string, b: string, rand: () => number, shift = 0.04) {
  for (let ty = r.y, j = 0; ty < r.y + r.h; ty += t, j++) for (let tx = r.x, i = 0; tx < r.x + r.w; tx += t, i++) {
    g.fillStyle = (i + j) & 1 ? b : a; g.fillRect(tx, ty, Math.min(t, r.x + r.w - tx), Math.min(t, r.y + r.h - ty));
    const k = (rand() - 0.5) * shift; g.fillStyle = k > 0 ? `rgba(255,244,220,${k})` : `rgba(10,8,6,${-k})`; g.fillRect(tx, ty, t, t);
  }
}

const dash = (g: G, color: string, w: number, d: number[], pts: readonly (readonly [number, number])[], alpha = 1) => {
  g.save(); g.globalAlpha = alpha; g.strokeStyle = color; g.lineWidth = w; g.setLineDash(d); g.lineCap = 'butt'; g.beginPath();
  pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke(); g.restore();
};

function gratings(g: G, x: number, y: number, w: number, h: number) {
  g.fillStyle = '#1f2228'; g.fillRect(x, y, w, h);
  g.fillStyle = '#3a3f48';
  if (w >= h) for (let k = x + 5; k < x + w - 4; k += 8) g.fillRect(k, y + 3, 4, h - 6);
  else for (let k = y + 5; k < y + h - 4; k += 8) g.fillRect(x + 3, k, w - 6, 4);
  g.strokeStyle = INK; g.lineWidth = 2; g.strokeRect(x, y, w, h);
}

export function oilSpot(g: G, rand: () => number, x: number, y: number, r: number, a = 0.28) {
  g.fillStyle = `rgba(12, 12, 16, ${a * 0.55})`; g.beginPath(); g.ellipse(x, y, r * 1.35, r * 1.1, rand() * TAU, 0, TAU); g.fill();
  g.fillStyle = `rgba(10, 10, 14, ${a})`; g.beginPath(); g.ellipse(x + r * 0.1, y, r, r * 0.8, rand() * TAU, 0, TAU); g.fill();
  g.fillStyle = `rgba(80, 90, 120, ${a * 0.22})`; g.beginPath(); g.ellipse(x - r * 0.25, y - r * 0.25, r * 0.4, r * 0.25, 0.5, 0, TAU); g.fill();
}

/* -- outdoor ground ---------------------------------------------------------------------------------------------- */

function ground(g: G, rand: () => number) {
  g.fillStyle = FLOOR.base; g.fillRect(0, 0, SIZE, SIZE);
  const slab = 250;
  for (let y = 0; y < SIZE; y += slab) for (let x = 0; x < SIZE; x += slab) {
    const k = (rand() - 0.5) * 2 * FLOOR.slabShift;
    g.fillStyle = k > 0 ? hexA(FLOOR.slabA, k * 22) : hexA(FLOOR.slabB, -k * 22);
    g.fillRect(x, y, slab, slab);
    const h = rand();
    if (h < 0.2) { g.fillStyle = 'rgba(110, 130, 160, 0.05)'; g.fillRect(x, y, slab, slab); }
    else if (h > 0.88) { g.fillStyle = 'rgba(150, 120, 80, 0.05)'; g.fillRect(x, y, slab, slab); }
  }
  for (let i = 0; i < 36; i++) blotch(g, rand() * SIZE, rand() * SIZE, 90 + rand() * 220, '30, 28, 24', 0.05 + rand() * 0.04);
  g.fillStyle = hexA(FLOOR.seam, 0.2);
  for (let x = 125; x < SIZE; x += 250) g.fillRect(x - 0.5, 0, 1, SIZE);
  for (let y = 125; y < SIZE; y += 250) g.fillRect(0, y - 0.5, SIZE, 1);
  g.fillStyle = hexA(FLOOR.seam, 0.85);
  for (let x = slab; x < SIZE; x += slab) g.fillRect(x - 1, 0, 2, SIZE);
  for (let y = slab; y < SIZE; y += slab) g.fillRect(0, y - 1, SIZE, 2);
  g.fillStyle = hexA(FLOOR.grime, 0.6);
  for (let y = slab; y < SIZE; y += slab) for (let x = slab; x < SIZE; x += slab) g.fillRect(x - 3, y - 3, 6, 6);
}

function gravelPatch(g: G, r: Rect, rand: () => number, base: string, n = 1) {
  g.fillStyle = base; g.fillRect(r.x, r.y, r.w, r.h);
  const count = ((r.w * r.h) / 400) * n;
  for (let i = 0; i < count; i++) {
    g.fillStyle = rand() < 0.5 ? 'rgba(255, 244, 210, 0.13)' : 'rgba(20, 16, 10, 0.16)';
    const s = 1.5 + rand() * 2.5; g.fillRect(r.x + rand() * r.w, r.y + rand() * r.h, s, s * 0.8);
  }
}

const studs = (g: G, x: number, y: number, rim: string, core: string) => {
  g.fillStyle = rim; g.beginPath(); g.arc(x, y, 7, 0, TAU); g.fill();
  g.fillStyle = core; g.beginPath(); g.arc(x, y, 4, 0, TAU); g.fill();
  g.strokeStyle = INK; g.lineWidth = 1.5; g.beginPath(); g.arc(x, y, 7, 0, TAU); g.stroke();
};

/* -- everything painted in the west half's coordinates, called once per half ---------------------------------------- */

function westHalf(g: G, rand: () => number, twin: boolean) {
  const T = twin ? turnRect : (r: Rect) => r;
  const P = twin ? turnPt : (x: number, y: number): [number, number] => [x, y];
  const at = (x: number, y: number, fn: (px: number, py: number) => void) => { const [px, py] = P(x, y); fn(px, py); };

  // Yard grounds under each district, softer than the interiors.
  const gravelFor = (r: Rect, base: string, n = 1) => gravelPatch(g, T(r), rand, base, n);
  gravelFor({ x: 50, y: 2250, w: 850, h: 1500 }, '#5d5a51');
  gravelFor({ x: 1350, y: 4800, w: 1050, h: 1150 }, '#625e52');
  gravelFor({ x: 50, y: 3750, w: 1300, h: 2200 }, '#615b4d', 0.8);
  gravelFor({ x: 1350, y: 3750, w: 1050, h: 1050 }, '#625d50', 0.8);

  // Apron slabs: big 500 px pours with expansion joints, darker and cooler than the yards.
  for (const r of [T({ x: 2400, y: 50, w: 600, h: 2350 }), T({ x: 2400, y: 3750, w: 600, h: 2200 })]) {
    g.fillStyle = 'rgba(40, 44, 54, 0.22)'; g.fillRect(r.x, r.y, r.w, r.h);
    grid(g, r, 500, 'rgba(24, 24, 28, 0.55)', 3);
  }

  for (const d of DISTRICTS) {
    if (d.id === 'apron') continue;
    const r = T(d.rect);
    g.fillStyle = d.tint; g.fillRect(r.x, r.y, r.w, r.h);
  }

  // The avenue's dashed runway centreline, and the threshold's piano keys at the north end (the twin puts the south end).
  for (let y = 150; y < 2630; y += 150) { const [px, py] = P(3000, y); g.fillStyle = hexA(BONE, 0.42); g.fillRect(px - 7, py - 36, 14, 72); }
  for (let i = 0; i < 8; i++) { const [px, py] = P(2780 + i * 60 + (i >= 4 ? 120 : 0), 120); g.fillStyle = hexA(BONE, 0.3); g.fillRect(px - 15, py - 20, 30, 70); }

  // Taxi lines: yellow centrelines out of each door and across the apron.
  const yellow = hexA(PAINT, 0.7);
  const taxi: [number, number][][] = [
    [[2400, 575], [2480, 575], [2560, 640], [2600, 800]],
    [[2400, 1875], [2700, 1875], [3000, 1875]],
    [[2400, 2200], [2600, 2150], [3000, 2150]],
  ];
  for (const path of taxi) {
    const pts = path.map(([x, y]) => P(x, y));
    g.save(); g.lineJoin = 'round';
    g.strokeStyle = 'rgba(14,14,18,0.2)'; g.lineWidth = 11; g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke();
    g.strokeStyle = yellow; g.lineWidth = 7; g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke();
    g.restore();
  }
  // A hold-short bar before the plaza: one solid, one dashed.
  { const [px, py] = P(2750, 2380); g.fillStyle = hexA(PAINT, 0.65); g.fillRect(px - 150, py - 3, 300, 5); dash(g, PAINT, 5, [14, 12], [[px - 150, py + 14], [px + 150, py + 14]], 0.65); }

  // Aircraft stand boxes with chocks and tie-down rings on the north apron.
  const stand = (x: number, y: number, w: number, h: number) => {
    const r = T({ x, y, w, h });
    g.strokeStyle = hexA(BONE, 0.38); g.lineWidth = 5; g.setLineDash([32, 20]); g.strokeRect(r.x, r.y, r.w, r.h); g.setLineDash([]);
  };
  stand(2440, 1100, 220, 250);
  stand(2780, 1650, 200, 260);
  const chock = (x: number, y: number) => at(x, y, (px, py) => {
    g.save(); g.translate(px, py);
    g.fillStyle = 'rgba(14,14,18,0.35)'; g.beginPath(); g.moveTo(-14, 7); g.lineTo(14, 7); g.lineTo(0, -11); g.closePath(); g.fill();
    g.fillStyle = '#c9a23c'; g.beginPath(); g.moveTo(-14, 5); g.lineTo(14, 5); g.lineTo(0, -12); g.closePath(); g.fill();
    g.strokeStyle = INK; g.lineWidth = 2; g.stroke(); g.restore();
  });
  const ring = (x: number, y: number) => at(x, y, (px, py) => { g.fillStyle = '#26282e'; g.beginPath(); g.arc(px, py, 9, 0, TAU); g.fill(); g.strokeStyle = '#8a8f98'; g.lineWidth = 3; g.beginPath(); g.arc(px, py, 6, 0, TAU); g.stroke(); });
  for (const [x, y] of [[2470, 1330], [2630, 1330], [2810, 1890], [2950, 1890]] as const) chock(x, y);
  for (const [x, y] of [[2470, 1120], [2630, 1120], [2810, 1670], [2950, 1670]] as const) ring(x, y);

  for (const [x, y, w, h] of [[2420, 1500, 12, 60], [2985, 1990, 12, 60], [2420, 2300, 12, 60]] as const) { const r = T({ x, y, w, h }); gratings(g, r.x, r.y, r.w, r.h); }
  for (let i = 0; i < 26; i++) {
    const [px, py] = P(2420 + rand() * 560, 80 + rand() * 2200);
    g.strokeStyle = 'rgba(22,22,26,0.3)'; g.lineWidth = 2; g.beginPath(); g.moveTo(px, py);
    let cx = px, cy = py, a = rand() * TAU;
    for (let k = 0; k < 5; k++) { a += (rand() - 0.5) * 1.1; cx += Math.cos(a) * 18; cy += Math.sin(a) * 18; g.lineTo(cx, cy); }
    g.stroke();
  }
  // Tow-tractor tyre marks swinging out of the door lane.
  g.save(); g.strokeStyle = 'rgba(14,14,18,0.2)'; g.lineWidth = 6; g.lineCap = 'round';
  for (const off of [-22, 22]) { const a = P(2400, 575 + off), b = P(2480, 575 + off), c = P(2640, 640 + off * 0.6); g.beginPath(); g.moveTo(a[0], a[1]); g.quadraticCurveTo(b[0], b[1], c[0], c[1]); g.stroke(); }
  g.restore();

  // Taxiway edge lights along the avenue's west edge (the studs; their glow comes from the lights pass).
  for (let y = 120; y < 2300; y += 150) at(2425, y, (px, py) => studs(g, px, py, '#1e2a3a', '#4a8ad8'));
}

/* -- interiors --------------------------------------------------------------------------------------------------- */

function room(g: G, r: Rect, kind: RoomKind, rand: () => number) {
  g.save();
  g.beginPath(); g.rect(r.x, r.y, r.w, r.h); g.clip();
  switch (kind) {
    case 'epoxy': {
      g.fillStyle = '#566069'; g.fillRect(r.x, r.y, r.w, r.h);
      checker(g, r, 100, 'rgba(70,82,96,0.22)', 'rgba(40,48,60,0.18)', rand, 0.04);
      grid(g, r, 100, 'rgba(26,32,42,0.55)', 2);
      grid(g, r, 500, 'rgba(26,32,42,0.8)', 3);
      g.fillStyle = 'rgba(200, 225, 255, 0.05)';
      for (let x = r.x + 160; x < r.x + r.w - 100; x += 380) g.fillRect(x, r.y + 20, 90, r.h - 40);
      break;
    }
    case 'crib': {
      g.fillStyle = '#5c4a35'; g.fillRect(r.x, r.y, r.w, r.h);
      for (let y = r.y; y < r.y + r.h; y += 22) {
        g.fillStyle = rand() < 0.5 ? 'rgba(255,220,160,0.05)' : 'rgba(20,12,6,0.12)'; g.fillRect(r.x, y, r.w, 22);
        g.fillStyle = 'rgba(30,18,10,0.55)'; g.fillRect(r.x, y, r.w, 2);
        for (let x = r.x + rand() * 80; x < r.x + r.w; x += 70 + rand() * 90) g.fillRect(x, y, 2, 22);
      }
      break;
    }
    case 'cage': {
      g.fillStyle = '#34393f'; g.fillRect(r.x, r.y, r.w, r.h);
      g.fillStyle = '#4b525c';
      for (let y = r.y + 4; y < r.y + r.h; y += 14) for (let x = r.x + 4; x < r.x + r.w; x += 14) g.fillRect(x, y, 8, 8);
      break;
    }
    case 'bayfloor': {
      g.fillStyle = '#4f5b52'; g.fillRect(r.x, r.y, r.w, r.h);
      checker(g, r, 100, 'rgba(110,150,100,0.14)', 'rgba(30,50,34,0.14)', rand, 0.04);
      grid(g, r, 100, 'rgba(18,28,20,0.5)', 2);
      hazardFrame(g, { x: r.x + 14, y: r.y + 14, w: r.w - 28, h: r.h - 28 }, 12, '#23262b', '#b79a4a', 0.75);
      break;
    }
    case 'shed': {
      g.fillStyle = '#3d4650'; g.fillRect(r.x, r.y, r.w, r.h);
      grid(g, r, 25, 'rgba(10,16,22,0.5)', 1.5);
      g.fillStyle = 'rgba(100,220,255,0.08)'; g.fillRect(r.x, r.y, r.w, r.h);
      break;
    }
    case 'stairs': {
      g.fillStyle = '#4a4e56'; g.fillRect(r.x, r.y, r.w, r.h);
      for (let i = 0; i < 9; i++) { const x = r.x + 20 + i * 20; g.fillStyle = i % 2 ? 'rgba(255,255,255,0.05)' : 'rgba(10,12,16,0.12)'; g.fillRect(x, r.y + 10, 20, r.h - 20); g.fillStyle = 'rgba(14,16,20,0.6)'; g.fillRect(x, r.y + 10, 2, r.h - 20); }
      g.fillStyle = hexA(PAINT, 0.6); g.fillRect(r.x + 14, r.y + 8, 3, r.h - 16);
      break;
    }
    case 'bunk': {
      checker(g, r, 25, '#4f5441', '#565b47', rand, 0.05);
      g.fillStyle = 'rgba(14,18,10,0.25)'; g.fillRect(r.x, r.y, r.w, 4);
      break;
    }
    case 'corridor': {
      g.fillStyle = '#6d6f5a'; g.fillRect(r.x, r.y, r.w, r.h);
      grid(g, r, 50, 'rgba(30,32,24,0.35)', 1.5);
      g.fillStyle = hexA(PAINT, 0.55); g.fillRect(r.x, r.y + r.h / 2 - 2, r.w, 4);
      break;
    }
    case 'dining': {
      checker(g, r, 50, '#8d826a', '#4f493e', rand, 0.05);
      grid(g, r, 50, 'rgba(30,26,20,0.35)', 1.5);
      break;
    }
    case 'kitchen': {
      checker(g, r, 25, '#7b7e78', '#6f726d', rand, 0.04);
      for (let i = 0; i < 6; i++) blotch(g, r.x + rand() * r.w, r.y + rand() * r.h, 40 + rand() * 40, '40, 30, 10', 0.14);
      gratings(g, r.x + r.w / 2 - 50, r.y + r.h - 40, 100, 14);
      break;
    }
    case 'armoury': {
      g.fillStyle = '#4a4d46'; g.fillRect(r.x, r.y, r.w, r.h);
      hazardFrame(g, { x: r.x + 6, y: r.y + 6, w: r.w - 12, h: r.h - 12 }, 8, '#23262b', '#a8552e', 0.7);
      break;
    }
    case 'booth': { g.fillStyle = '#4a4d52'; g.fillRect(r.x, r.y, r.w, r.h); break; }
    case 'lobby': break;
  }
  g.restore();
}

/** The tower's lobby floor: paving, radar range rings and a compass ring round zone B. */
function lobby(g: G) {
  const { x, y, inner } = TOWER;
  g.save();
  g.beginPath(); g.arc(x, y, inner + 4, 0, TAU); g.clip();
  g.fillStyle = '#4b535e'; g.fillRect(x - inner, y - inner, inner * 2, inner * 2);
  g.strokeStyle = 'rgba(120, 220, 200, 0.18)'; g.lineWidth = 2;
  for (const r of [70, 140, 210, 280]) { g.beginPath(); g.arc(x, y, r, 0, TAU); g.stroke(); }
  g.strokeStyle = 'rgba(14, 18, 24, 0.5)'; g.lineWidth = 3;
  for (let a = 0; a < 12; a++) { const t = (a / 12) * TAU, l = a % 3 === 0 ? 318 : 300; g.beginPath(); g.moveTo(x + Math.cos(t) * 40, y + Math.sin(t) * 40); g.lineTo(x + Math.cos(t) * l, y + Math.sin(t) * l); g.stroke(); }
  for (let a = 0; a < 72; a++) {
    const t = (a / 72) * TAU, l = a % 6 === 0 ? 16 : 7;
    g.strokeStyle = a % 18 === 0 ? hexA(PAINT, 0.85) : 'rgba(210, 202, 180, 0.4)'; g.lineWidth = a % 6 === 0 ? 3 : 1.5;
    g.beginPath(); g.moveTo(x + Math.cos(t) * 300, y + Math.sin(t) * 300); g.lineTo(x + Math.cos(t) * (300 - l), y + Math.sin(t) * (300 - l)); g.stroke();
  }
  g.fillStyle = hexA(PAINT, 0.8);
  g.beginPath(); g.moveTo(x, y - 292); g.lineTo(x - 11, y - 262); g.lineTo(x + 11, y - 262); g.closePath(); g.fill();
  g.fillStyle = hexA(BONE, 0.55);
  stencil(g, 'N', x - 9, y - 258, 26);
  g.restore();
}

/** The taxi roundabout round the tower. */
function plaza(g: G) {
  const { x, y } = TOWER;
  g.save();
  g.fillStyle = 'rgba(30, 32, 40, 0.28)'; g.beginPath(); g.arc(x, y, 760, 0, TAU); g.arc(x, y, 380, 0, TAU, true); g.fill();
  g.restore();
  g.strokeStyle = 'rgba(14,14,18,0.3)'; g.lineWidth = 11; g.beginPath(); g.arc(x, y, 560, 0, TAU); g.stroke();
  g.strokeStyle = hexA(PAINT, 0.65); g.lineWidth = 7; g.beginPath(); g.arc(x, y, 560, 0, TAU); g.stroke();
  g.strokeStyle = hexA(BONE, 0.38); g.lineWidth = 5; g.setLineDash([36, 26]);
  g.beginPath(); g.arc(x, y, 740, 0, TAU); g.stroke(); g.setLineDash([]);
  for (let a = 0; a < 48; a++) { const t = (a / 48) * TAU; studs(g, x + Math.cos(t) * 420, y + Math.sin(t) * 420, '#1e2a3a', '#4a8ad8'); }
}

function helipad(g: G, cx: number, cy: number) {
  g.save();
  g.fillStyle = 'rgba(30, 40, 46, 0.4)'; g.beginPath(); g.arc(cx, cy, 262, 0, TAU); g.fill();
  g.strokeStyle = hexA(BONE, 0.7); g.lineWidth = 14; g.beginPath(); g.arc(cx, cy, 235, 0, TAU); g.stroke();
  g.strokeStyle = hexA(PAINT, 0.7); g.lineWidth = 6; g.beginPath(); g.arc(cx, cy, 258, 0, TAU); g.stroke();
  g.fillStyle = hexA(BONE, 0.62);
  g.fillRect(cx - 100, cy - 90, 34, 180); g.fillRect(cx + 66, cy - 90, 34, 180); g.fillRect(cx - 66, cy - 17, 132, 34);
  for (let a = 0; a < 18; a++) { const t = (a / 18) * TAU; studs(g, cx + Math.cos(t) * 276, cy + Math.sin(t) * 276, '#1b2f27', '#58d6a0'); }
  g.restore();
}

/* -- the entry --------------------------------------------------------------------------------------------------- */

export function paintAirbaseFloor(g: CanvasRenderingContext2D, _size: number, seed: number, _plan: FloorPlan) {
  const rand = seeded(seed ^ 0xa1b4);
  ground(g, rand);
  westHalf(g, rand, false);
  westHalf(g, rand, true);
  plaza(g);
  helipad(g, 2780, 800);
  helipad(g, SIZE - 2780, SIZE - 800);
  for (const rm of ROOMS) { room(g, rm.rect, rm.kind, rand); room(g, turnRect(rm.rect), rm.kind, rand); }
  lobby(g);
  for (const s of STENCILS) {
    for (const twin of [false, true]) {
      const w = s.text.length * (s.size * 0.52 + s.size * 0.15 * 1.6);
      g.save();
      g.fillStyle = hexA(BONE, 0.5);
      if (s.rot) {
        // A stencil on a quarter turn reads bottom to top: it is placed by its start point, then turned about it.
        const sx = twin ? SIZE - s.x : s.x, sy = twin ? SIZE - s.y : s.y;
        g.translate(sx, sy); g.rotate(twin ? Math.PI / 2 : s.rot);
        stencil(g, s.text, 0, twin ? -s.size : 0, s.size);
      } else {
        const x = twin ? SIZE - s.x - w : s.x, y = twin ? SIZE - s.y - s.size : s.y;
        stencil(g, s.text, x, y, s.size);
      }
      g.restore();
    }
  }
}
