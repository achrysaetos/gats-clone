import { MAPS } from '../../shared/maps.ts';
import { districtAt, type DistrictId } from '../../shared/maps/airbasedata.ts';
import { canvas, seeded } from '../grain.ts';
import { INK } from '../palette.ts';
import type { Solid, SolidKind } from '../tilt.ts';

/**
 * The Airbase's wall kinds, painted whole, once per solid (or per frame for the big ones, so those use patterns and a few
 * fills). Hangar sheeting changes its colour between the twin hangars; cinderblock changes with the building it belongs to
 * (warm in the barracks and mess, cold in the comms shed); and the small kinds (benches, beds, tables, pallets) dress by where
 * they stand. Adjoining cells of one kind merge into one body: ink only runs along edges with no neighbour.
 */
const TAU = Math.PI * 2;
const CELL = 50;
export const hash = (a: number, b: number) => (Math.imul(Math.round(a) | 0, 73856093) ^ Math.imul(Math.round(b) | 0, 19349663)) >>> 0;

/* -- neighbours ---------------------------------------------------------------------------------------------------- */

const cells = new Map<SolidKind, Set<number>>();
function cellsOf(kind: SolidKind): Set<number> {
  let set = cells.get(kind);
  if (set) return set;
  set = new Set();
  for (const w of MAPS.airbase.walls) {
    if (w.material !== kind) continue;
    for (let j = 0; j < w.h / CELL; j++) for (let i = 0; i < w.w / CELL; i++) set.add((w.y / CELL + j) * 1000 + w.x / CELL + i);
  }
  cells.set(kind, set);
  return set;
}
const has = (kind: SolidKind, cx: number, cy: number) => cellsOf(kind).has(cy * 1000 + cx);

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

/** Ink along every edge of a solid that has no neighbour of its own kind. */
function outline(g: CanvasRenderingContext2D, s: Solid, width = 2) {
  const cx = s.x / CELL, cy = s.y / CELL, nx = s.w / CELL, ny = s.h / CELL;
  g.strokeStyle = INK; g.lineWidth = width; g.lineCap = 'square'; g.beginPath();
  for (let i = 0; i < nx; i++) {
    if (!has(s.kind, cx + i, cy - 1)) { g.moveTo(s.x + i * CELL, s.y); g.lineTo(s.x + (i + 1) * CELL, s.y); }
    if (!has(s.kind, cx + i, cy + ny)) { g.moveTo(s.x + i * CELL, s.y + s.h); g.lineTo(s.x + (i + 1) * CELL, s.y + s.h); }
  }
  for (let j = 0; j < ny; j++) {
    if (!has(s.kind, cx - 1, cy + j)) { g.moveTo(s.x, s.y + j * CELL); g.lineTo(s.x, s.y + (j + 1) * CELL); }
    if (!has(s.kind, cx + nx, cy + j)) { g.moveTo(s.x + s.w, s.y + j * CELL); g.lineTo(s.x + s.w, s.y + (j + 1) * CELL); }
  }
  g.stroke(); g.lineCap = 'butt';
}

/** The two hard cel steps on a top face: lit along the north and west edges, shaded along the south and east ones. */
function bevel(g: CanvasRenderingContext2D, s: Solid, e = 4) {
  const cx = s.x / CELL, cy = s.y / CELL, nx = s.w / CELL, ny = s.h / CELL;
  g.fillStyle = 'rgba(255, 255, 255, 0.22)';
  for (let i = 0; i < nx; i++) if (!has(s.kind, cx + i, cy - 1)) g.fillRect(s.x + i * CELL, s.y, CELL, e);
  for (let j = 0; j < ny; j++) if (!has(s.kind, cx - 1, cy + j)) g.fillRect(s.x, s.y + j * CELL, e, CELL);
  g.fillStyle = 'rgba(10, 12, 16, 0.3)';
  for (let i = 0; i < nx; i++) if (!has(s.kind, cx + i, cy + ny)) g.fillRect(s.x + i * CELL, s.y + s.h - e, CELL, e);
  for (let j = 0; j < ny; j++) if (!has(s.kind, cx + nx, cy + j)) g.fillRect(s.x + s.w - e, s.y + j * CELL, e, CELL);
}

type Look = { top: string; face: string };

/** The standard body: front faces where exposed, the top, bevels and ink. `front` and `top` add detail. */
function body(g: CanvasRenderingContext2D, s: Solid, face: number, look: Look, top: () => void, front?: (x0: number, x1: number, y: number) => void) {
  for (const [x0, x1] of faceRuns(s)) {
    const y = s.y + s.h;
    g.fillStyle = look.face; g.fillRect(x0, y, x1 - x0, face);
    front?.(x0, x1, y);
    g.fillStyle = 'rgba(255, 255, 255, 0.13)'; g.fillRect(x0, y, x1 - x0, 2);
    g.fillStyle = 'rgba(10, 12, 16, 0.34)'; g.fillRect(x0, y + face - 4, x1 - x0, 4);
    g.strokeStyle = INK; g.lineWidth = 2; g.strokeRect(x0, y, x1 - x0, face);
  }
  g.fillStyle = look.top; g.fillRect(s.x, s.y, s.w, s.h);
  top();
  bevel(g, s);
  outline(g, s);
}

const mix = (hex: string, to: number, t: number): string => {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(v + (to - v) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
};

/* -- patterns for the big walls (painted per frame, so one fill each) ---------------------------------------------------- */

const patterns = new Map<string, CanvasPattern>();
function pattern(g: CanvasRenderingContext2D, key: string, side: number, paint: (p: CanvasRenderingContext2D) => void): CanvasPattern {
  let p = patterns.get(key);
  if (p) return p;
  const [c, ctx] = canvas(side);
  paint(ctx);
  p = g.createPattern(c, 'repeat')!;
  patterns.set(key, p);
  return p;
}

/* -- hangar sheeting ------------------------------------------------------------------------------------------------------ */

const HANGAR = {
  a: { top: '#76838d', face: '#4b5660', band: '#3f6a8a', rib: '#6a7680' },
  b: { top: '#848a74', face: '#545a48', band: '#a07a34', rib: '#767c66' },
} as const;

function corrugation(g: CanvasRenderingContext2D, key: string, rib: string, dark: string, vertical: boolean): CanvasPattern {
  return pattern(g, `corr:${key}:${vertical}`, 16, (p) => {
    p.fillStyle = rib; p.fillRect(0, 0, 16, 16);
    p.fillStyle = dark;
    if (vertical) { p.fillRect(0, 0, 3, 16); p.fillStyle = 'rgba(255,255,255,0.1)'; p.fillRect(8, 0, 2, 16); } else { p.fillRect(0, 0, 16, 3); p.fillStyle = 'rgba(255,255,255,0.1)'; p.fillRect(0, 8, 16, 2); }
  });
}

function paintHangar(g: CanvasRenderingContext2D, s: Solid) {
  const twin = districtAt(s.x + s.w / 2, s.y + s.h / 2).twin;
  const c = twin ? HANGAR.b : HANGAR.a;
  const vertical = s.h >= s.w;
  body(g, s, 18, { top: c.top, face: c.face }, () => {
    g.fillStyle = corrugation(g, twin ? 'b' : 'a', c.top, 'rgba(20,26,32,0.28)', !vertical);
    g.fillRect(s.x, s.y, s.w, s.h);
    // The capping: a lighter strip down the middle of the wall's top.
    g.fillStyle = 'rgba(255,255,255,0.08)';
    if (vertical) g.fillRect(s.x + s.w / 2 - 4, s.y, 8, s.h); else g.fillRect(s.x, s.y + s.h / 2 - 4, s.w, 8);
  }, (x0, x1, y) => {
    g.fillStyle = corrugation(g, `f${twin ? 'b' : 'a'}`, c.face, 'rgba(8,12,16,0.35)', true);
    g.fillRect(x0, y, x1 - x0, 18);
    // The painted band, the clerestory glazing high on the face, and a kick plate.
    g.fillStyle = c.band; g.fillRect(x0, y + 5, x1 - x0, 4);
    g.fillStyle = '#2b2e34'; g.fillRect(x0, y + 14, x1 - x0, 4);
    if (x1 - x0 >= 150) {
      const n = Math.floor((x1 - x0) / 100);
      for (let i = 0; i < n; i++) {
        const wx = x0 + (x1 - x0) * ((i + 0.5) / n) - 24;
        g.fillStyle = '#d6e8ff'; g.fillRect(wx, y + 10, 48, 3);
      }
    }
  });
}

/* -- cinderblock ------------------------------------------------------------------------------------------------------------ */

type Block = { top: string; face: string; window: string; stripe: string };
const BLOCK: Record<string, Block> = {
  barracks: { top: '#8c8f75', face: '#5b5e49', window: '#ffd68a', stripe: '#6c7356' },
  mess: { top: '#9b8c6a', face: '#675c44', window: '#ffc977', stripe: '#a07a34' },
  comms: { top: '#7f8c90', face: '#4f5b60', window: '#8fe8ff', stripe: '#3f6a8a' },
  parade: { top: '#7d7f6c', face: '#4c4e3f', window: '#ffe9b0', stripe: '#a8552e' },
  tower: { top: '#8d9296', face: '#585d62', window: '#ffe08a', stripe: '#b79a4a' },
  hangar: { top: '#7c8185', face: '#4d5256', window: '#d6e8ff', stripe: '#b79a4a' },
  other: { top: '#85897a', face: '#555949', window: '#ffd68a', stripe: '#6c7356' },
};
const blockOf = (id: DistrictId): Block => BLOCK[id] ?? BLOCK.other!;

function paintCinder(g: CanvasRenderingContext2D, s: Solid) {
  const loc = districtAt(s.x + s.w / 2, s.y + s.h / 2);
  const b = blockOf(loc.d.id);
  const rand = seeded(hash(s.x, s.y));
  body(g, s, 16, { top: b.top, face: b.face }, () => {
    g.fillStyle = 'rgba(30,30,24,0.28)';
    const long = s.w >= s.h;
    if (long) for (let x = s.x + 25; x < s.x + s.w; x += 25 + (((x / 25) | 0) % 2) * 0) { if (((x - s.x) / 25) % 2 === 0) g.fillRect(x - 1, s.y + 2, 1.5, s.h / 2 - 2); else g.fillRect(x - 1, s.y + s.h / 2, 1.5, s.h / 2 - 2); }
    else for (let y = s.y + 25; y < s.y + s.h; y += 25) { if (((y - s.y) / 25) % 2 === 0) g.fillRect(s.x + 2, y - 1, s.w / 2 - 2, 1.5); else g.fillRect(s.x + s.w / 2, y - 1, s.w / 2 - 2, 1.5); }
    g.fillStyle = 'rgba(255,255,255,0.05)';
    if (long) g.fillRect(s.x, s.y + s.h / 2 - 0.75, s.w, 1.5); else g.fillRect(s.x + s.w / 2 - 0.75, s.y, 1.5, s.h);
    if (rand() < 0.5) { g.fillStyle = 'rgba(40,36,24,0.14)'; g.fillRect(s.x + rand() * s.w * 0.8, s.y, 8 + rand() * 14, s.h); }
  }, (x0, x1, y) => {
    g.fillStyle = 'rgba(14,14,10,0.3)';
    for (let yy = y + 4; yy < y + 16; yy += 6) g.fillRect(x0, yy, x1 - x0, 1.5);
    g.fillStyle = b.stripe; g.fillRect(x0, y + 12, x1 - x0, 3);
    // Lit windows every few paces: slits in the face, glowing with the room behind.
    for (let x = x0 + 30 + (hash(x0, y) % 40); x < x1 - 34; x += 90) {
      g.fillStyle = INK; g.fillRect(x - 1, y + 3, 24, 8);
      g.fillStyle = b.window; g.fillRect(x, y + 4, 22, 6);
      g.fillStyle = 'rgba(255,255,255,0.45)'; g.fillRect(x, y + 4, 22, 2);
      g.fillStyle = INK; g.fillRect(x + 10, y + 4, 2, 6);
    }
  });
}

/* -- sandbags ------------------------------------------------------------------------------------------------------------------- */

function paintSandbags(g: CanvasRenderingContext2D, s: Solid) {
  const rand = seeded(hash(s.x, s.y));
  body(g, s, 13, { top: '#b4a07a', face: '#8b7a56' }, () => {
    const long = s.w >= s.h;
    g.strokeStyle = 'rgba(70,56,32,0.55)'; g.lineWidth = 1.6;
    const row = 12, len = 28;
    if (long) {
      for (let y = s.y + row; y < s.y + s.h; y += row) { g.beginPath(); g.moveTo(s.x, y); g.lineTo(s.x + s.w, y); g.stroke(); }
      for (let r = 0; r * row < s.h; r++) for (let x = s.x + (r % 2) * len * 0.5; x < s.x + s.w; x += len) { g.beginPath(); g.moveTo(x, s.y + r * row); g.lineTo(x, s.y + Math.min(s.h, (r + 1) * row)); g.stroke(); }
    } else {
      for (let x = s.x + row; x < s.x + s.w; x += row) { g.beginPath(); g.moveTo(x, s.y); g.lineTo(x, s.y + s.h); g.stroke(); }
      for (let c = 0; c * row < s.w; c++) for (let y = s.y + (c % 2) * len * 0.5; y < s.y + s.h; y += len) { g.beginPath(); g.moveTo(s.x + c * row, y); g.lineTo(s.x + Math.min(s.w, (c + 1) * row), y); g.stroke(); }
    }
    g.fillStyle = 'rgba(255,240,200,0.1)';
    for (let i = 0; i < (s.w * s.h) / 500; i++) g.fillRect(s.x + rand() * s.w, s.y + rand() * s.h, 6, 2);
  }, (x0, x1, y) => {
    g.strokeStyle = 'rgba(50,38,20,0.5)'; g.lineWidth = 1.4;
    for (let x = x0 + 10; x < x1; x += 22) { g.beginPath(); g.moveTo(x, y + 2); g.lineTo(x - 3, y + 11); g.stroke(); }
    g.beginPath(); g.moveTo(x0, y + 7); g.lineTo(x1, y + 7); g.stroke();
  });
}

/* -- ground-support kit: benches, tool chests, carts, steel counters ---------------------------------------------------------- */

const TOOLS = ['#b4524a', '#b79a4a', '#4f7fbf', '#8a8f98'];
function paintGse(g: CanvasRenderingContext2D, s: Solid) {
  const loc = districtAt(s.x + s.w / 2, s.y + s.h / 2);
  const kitchen = loc.d.id === 'mess', yard = !['hangar', 'bay', 'mess'].includes(loc.d.id);
  const look: Look = kitchen ? { top: '#a9aeb0', face: '#6d7378' } : yard ? { top: '#b79a4a', face: '#7d6a30' } : { top: '#7f875a', face: '#4f5538' };
  const rand = seeded(hash(s.x, s.y));
  body(g, s, 12, look, () => {
    const long = s.w >= s.h;
    if (kitchen) {
      // Stainless counters with burner rings and a steam pass.
      g.fillStyle = 'rgba(40,44,48,0.3)';
      for (let x = s.x + 30; x < s.x + s.w - 20; x += 60) { g.beginPath(); g.arc(x, s.y + s.h / 2, 11, 0, TAU); g.fill(); g.strokeStyle = 'rgba(20,20,24,0.6)'; g.lineWidth = 2; g.stroke(); }
      g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(s.x + 4, s.y + 4, s.w - 8, 3);
    } else if (yard) {
      // A cart: yellow deck with a tow bar and a pair of strapped crates.
      g.fillStyle = 'rgba(40,30,10,0.25)'; g.fillRect(s.x + 4, s.y + s.h - 8, s.w - 8, 4);
      for (let x = s.x + 8; x < s.x + s.w - 22; x += 40) { g.fillStyle = '#59653f'; g.fillRect(x, s.y + 8, 30, s.h - 16); g.strokeStyle = INK; g.lineWidth = 1.6; g.strokeRect(x, s.y + 8, 30, s.h - 16); g.fillStyle = 'rgba(14,16,10,0.55)'; g.fillRect(x + 12, s.y + 8, 3, s.h - 16); }
    } else {
      // A workbench: a plank top with vise, tools and a drawer line.
      g.fillStyle = 'rgba(30,24,12,0.28)';
      if (long) for (let x = s.x + 20; x < s.x + s.w; x += 20) g.fillRect(x, s.y + 2, 1.5, s.h - 4);
      else for (let y = s.y + 20; y < s.y + s.h; y += 20) g.fillRect(s.x + 2, y, s.w - 4, 1.5);
      for (let i = 0; i < Math.max(2, Math.floor(Math.max(s.w, s.h) / 60)); i++) {
        const px = long ? s.x + 14 + rand() * (s.w - 28) : s.x + s.w / 2, py = long ? s.y + s.h / 2 : s.y + 14 + rand() * (s.h - 28);
        g.fillStyle = TOOLS[Math.floor(rand() * TOOLS.length)]!; g.fillRect(px - 5, py - 3, 10, 6); g.strokeStyle = INK; g.lineWidth = 1.2; g.strokeRect(px - 5, py - 3, 10, 6);
      }
    }
  }, (x0, x1, y) => {
    g.fillStyle = 'rgba(14,16,10,0.35)';
    for (let x = x0 + 14; x < x1; x += 28) g.fillRect(x, y + 3, 1.5, 7);
    g.fillStyle = yard ? '#2b2e34' : 'rgba(255,255,255,0.1)'; g.fillRect(x0, y + 8, x1 - x0, 2);
  });
}

/* -- bunks, lockers, mess tables ----------------------------------------------------------------------------------------------- */

function paintBunk(g: CanvasRenderingContext2D, s: Solid) {
  const loc = districtAt(s.x + s.w / 2, s.y + s.h / 2);
  const rand = seeded(hash(s.x, s.y));
  const mess = loc.d.id === 'mess';
  const bed = !mess && ((s.w === 50 && s.h >= 100) || (s.h === 50 && s.w >= 100 && loc.d.id === 'barracks'));
  const look: Look = mess ? { top: '#9a7a4c', face: '#5e4a2c' } : bed ? { top: '#6c7356', face: '#434b36' } : { top: '#6b747f', face: '#434a54' };
  body(g, s, mess ? 12 : 10, look, () => {
    const long = s.w >= s.h;
    if (mess) {
      g.strokeStyle = 'rgba(40,26,12,0.4)'; g.lineWidth = 1.4;
      for (let x = s.x + 28; x < s.x + s.w; x += 28) { g.beginPath(); g.moveTo(x, s.y + 2); g.lineTo(x, s.y + s.h - 2); g.stroke(); }
      // Trays, mugs and a cloth: a meal left half eaten.
      for (let x = s.x + 24; x < s.x + s.w - 24; x += 84 + rand() * 40) {
        g.fillStyle = '#8d9096'; g.fillRect(x - 12, s.y + 8, 26, s.h - 16); g.strokeStyle = INK; g.lineWidth = 1.4; g.strokeRect(x - 12, s.y + 8, 26, s.h - 16);
        g.fillStyle = rand() < 0.5 ? '#c9a23c' : '#a8552e'; g.fillRect(x - 6, s.y + 14, 12, 8);
        g.fillStyle = '#e2dccb'; g.beginPath(); g.arc(x + 20, s.y + s.h / 2, 4, 0, TAU); g.fill(); g.strokeStyle = INK; g.stroke();
      }
    } else if (bed) {
      const vertical = s.h >= s.w;
      g.fillStyle = rand() < 0.5 ? '#59653f' : '#4d5a4a';
      if (vertical) { g.fillRect(s.x + 3, s.y + 22, s.w - 6, s.h - 26); g.fillStyle = '#e2dccb'; g.fillRect(s.x + 5, s.y + 4, s.w - 10, 16); g.strokeStyle = INK; g.lineWidth = 1.4; g.strokeRect(s.x + 5, s.y + 4, s.w - 10, 16); g.strokeStyle = 'rgba(14,18,10,0.5)'; g.beginPath(); g.moveTo(s.x + 3, s.y + 40); g.lineTo(s.x + s.w - 3, s.y + 40); g.stroke(); }
      else { g.fillRect(s.x + 22, s.y + 3, s.w - 26, s.h - 6); g.fillStyle = '#e2dccb'; g.fillRect(s.x + 4, s.y + 5, 16, s.h - 10); g.strokeStyle = INK; g.lineWidth = 1.4; g.strokeRect(s.x + 4, s.y + 5, 16, s.h - 10); }
    } else {
      // Lockers: louvred doors and a padlock on each.
      if (long) for (let x = s.x + 2; x < s.x + s.w - 4; x += 25) { g.strokeStyle = 'rgba(14,16,22,0.55)'; g.strokeRect(x, s.y + 3, 23, s.h - 6); g.fillStyle = 'rgba(14,16,22,0.4)'; for (let y = s.y + 8; y < s.y + s.h - 8; y += 5) g.fillRect(x + 4, y, 15, 1.5); g.fillStyle = '#b79a4a'; g.fillRect(x + 18, s.y + s.h / 2, 3, 3); }
      else g.fillRect(s.x, s.y, s.w, s.h);
    }
  }, (x0, x1, y) => { g.fillStyle = 'rgba(14,16,10,0.3)'; g.fillRect(x0, y + 5, x1 - x0, 2); });
}

/* -- pallets -------------------------------------------------------------------------------------------------------------------- */

function paintPallet(g: CanvasRenderingContext2D, s: Solid) {
  const rand = seeded(hash(s.x, s.y));
  body(g, s, 10, { top: '#a3814f', face: '#7d6038' }, () => {
    // Stacked cargo: olive crates strapped to the pallet, each with a stencil.
    const n = Math.max(1, Math.floor(s.w / 50)), m = Math.max(1, Math.floor(s.h / 50));
    for (let j = 0; j < m; j++) for (let i = 0; i < n; i++) {
      const x = s.x + 4 + i * ((s.w - 8) / n), y = s.y + 4 + j * ((s.h - 8) / m), w = (s.w - 8) / n - 3, h = (s.h - 8) / m - 3;
      g.fillStyle = rand() < 0.6 ? '#59653f' : '#7a6a42'; g.fillRect(x, y, w, h);
      g.fillStyle = 'rgba(255,255,255,0.14)'; g.fillRect(x, y, w, 3);
      g.fillStyle = 'rgba(14,16,10,0.4)'; g.fillRect(x, y + h - 3, w, 3);
      g.strokeStyle = INK; g.lineWidth = 1.6; g.strokeRect(x, y, w, h);
      g.fillStyle = 'rgba(20,24,14,0.7)'; g.fillRect(x + w / 2 - 1.5, y, 3, h);
      g.fillStyle = 'rgba(226,220,203,0.7)'; g.fillRect(x + 4, y + h / 2 - 2, w / 2 - 6, 4);
    }
  }, (x0, x1, y) => { g.fillStyle = 'rgba(14,16,10,0.35)'; for (let x = x0 + 4; x < x1; x += 20) g.fillRect(x, y + 3, 10, 6); });
}

/* -- jersey barriers -------------------------------------------------------------------------------------------------------------- */

function paintJersey(g: CanvasRenderingContext2D, s: Solid) {
  body(g, s, 12, { top: '#c8c2b0', face: '#8a8678' }, () => {
    g.fillStyle = 'rgba(40,38,30,0.2)';
    const long = s.w >= s.h;
    if (long) for (let x = s.x + 50; x < s.x + s.w; x += 50) g.fillRect(x - 1, s.y, 2, s.h); else for (let y = s.y + 50; y < s.y + s.h; y += 50) g.fillRect(s.x, y - 1, s.w, 2);
    g.fillStyle = '#b79a4a';
    if (long) for (let x = s.x + 8; x < s.x + s.w - 20; x += 50) { g.beginPath(); g.moveTo(x, s.y + s.h - 6); g.lineTo(x + 14, s.y + 6); g.lineTo(x + 26, s.y + 6); g.lineTo(x + 12, s.y + s.h - 6); g.closePath(); g.fill(); }
    else for (let y = s.y + 8; y < s.y + s.h - 20; y += 50) { g.beginPath(); g.moveTo(s.x + 6, y); g.lineTo(s.x + s.w - 6, y + 14); g.lineTo(s.x + s.w - 6, y + 26); g.lineTo(s.x + 6, y + 12); g.closePath(); g.fill(); }
  }, (x0, x1, y) => { g.fillStyle = 'rgba(40,38,30,0.35)'; g.fillRect(x0, y + 7, x1 - x0, 3); g.fillStyle = '#b79a4a'; for (let x = x0 + 6; x < x1 - 14; x += 50) g.fillRect(x, y + 2, 20, 4); });
}

export const AIRBASE_WALLS = { hangar: paintHangar, cinder: paintCinder, sbags: paintSandbags, gse: paintGse, bunk: paintBunk, pallet: paintPallet, jersey: paintJersey } as const;
export { mix, TAU };
