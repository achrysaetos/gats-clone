import type { Pt } from '../../shared/geom.ts';
import type { FloorPlan } from '../floor.ts';
import { blotch, seeded } from '../grain.ts';
import { C, TAU, WASTELAND, baseId, boundsOf, districtBox, DISTRICTS, hash, hexA, inPoly, isTwin, trace, wallsOf } from './wastelandkit.ts';
import { paintFloorDecor } from './wastelanddecor.ts';

/**
 * The Wasteland's ground, baked once: cracked asphalt with weeds pushing through, sand drifting against every wall, oil and
 * tyre marks, a round-about of road markings round the crater, and a floor of its own in every district and every roofed room
 * (found from the map's roofs, so a floor always matches the room above it). Lanes stay quiet: the busy things sit at margins.
 */
type G = CanvasRenderingContext2D;

const rr = (g: G, x: number, y: number, w: number, h: number, k: number) => {
  g.beginPath(); g.moveTo(x + k, y); g.arcTo(x + w, y, x + w, y + h, k); g.arcTo(x + w, y + h, x, y + h, k); g.arcTo(x, y + h, x, y, k); g.arcTo(x, y, x + w, y, k); g.closePath();
};

/** A branching hairline crack, drawn as a chunky 2 px break: random walk, forking now and then. */
function crack(g: G, rand: () => number, x: number, y: number, len: number, depth: number) {
  let a = rand() * TAU;
  g.moveTo(x, y);
  const steps = 5 + Math.floor(rand() * 4);
  for (let i = 0; i < steps; i++) {
    a += (rand() - 0.5) * 1.1;
    x += (Math.cos(a) * len) / steps; y += (Math.sin(a) * len) / steps;
    g.lineTo(x, y);
    if (depth > 0 && rand() < 0.28) { const sx = x, sy = y; crack(g, rand, sx, sy, len * 0.45, depth - 1); g.moveTo(sx, sy); }
  }
}

/** A crack as a chunk: a tapering jagged wedge cut into the paving, wide at its heart, pointed at both ends. */
export function wedge(g: G, rand: () => number, x: number, y: number, len: number) {
  const a = rand() * TAU, n = 6, pts: [number, number][] = [], back: [number, number][] = [];
  let cx = x, cy = y, ang = a;
  for (let i = 0; i <= n; i++) {
    const w = Math.sin((i / n) * Math.PI) * (2.4 + rand() * 1.6);
    pts.push([cx + Math.cos(ang + 1.57) * w, cy + Math.sin(ang + 1.57) * w]); back.push([cx - Math.cos(ang + 1.57) * w, cy - Math.sin(ang + 1.57) * w]);
    ang += (rand() - 0.5) * 0.9; cx += (Math.cos(ang) * len) / n; cy += (Math.sin(ang) * len) / n;
  }
  g.beginPath(); pts.forEach(([px, py], i) => (i ? g.lineTo(px, py) : g.moveTo(px, py))); back.reverse().forEach(([px, py]) => g.lineTo(px, py)); g.closePath(); g.fill();
}

/** Cracks and weeds gather where the paving meets something: round every wall, kerb and ruin. */
function edgeGrowth(g: G, rand: () => number) {
  g.fillStyle = 'rgba(26, 24, 21, 0.4)';
  for (const w of [...wallsOf('rubble'), ...wallsOf('scrap')]) {
    const n = Math.max(1, Math.round((w.w + w.h) / 170));
    for (let i = 0; i < n; i++) {
      const side = Math.floor(rand() * 4);
      const x = side < 2 ? w.x + rand() * w.w : side === 2 ? w.x - 6 : w.x + w.w + 6, y = side === 0 ? w.y - 6 : side === 1 ? w.y + w.h + 6 : w.y + rand() * w.h;
      wedge(g, rand, x, y, 40 + rand() * 50);
      if (rand() < 0.7) tuft(g, x + (rand() - 0.5) * 20, y + (rand() - 0.5) * 20, rand, C.grassLo, C.grassHi, 0.8 + rand() * 0.4);
    }
  }
}

/** A grass tuft: a small ink-green chevron spray. */
function tuft(g: G, x: number, y: number, rand: () => number, lo: string = C.grassLo, hi: string = C.grassHi, s = 1) {
  g.lineCap = 'round';
  for (let i = 0; i < 3; i++) {
    const dx = (i - 1) * 3.4 * s, h = (8 + rand() * 7) * s, lean = (rand() - 0.5) * 6 * s;
    g.strokeStyle = lo; g.lineWidth = 2.6 * s;
    g.beginPath(); g.moveTo(x + dx, y + 2); g.quadraticCurveTo(x + dx + lean * 0.4, y - h * 0.5, x + dx + lean, y - h); g.stroke();
    g.strokeStyle = hi; g.lineWidth = 1.3 * s;
    g.beginPath(); g.moveTo(x + dx, y + 1); g.quadraticCurveTo(x + dx + lean * 0.4, y - h * 0.5, x + dx + lean, y - h); g.stroke();
  }
}

/** A drift of sand: a soft pale lobe with a few chunky ripple strokes, lying against whatever stands in its way. */
export function drift(g: G, x: number, y: number, rx: number, ry: number, rot: number, a = 0.5) {
  g.save();
  g.translate(x, y); g.rotate(rot);
  const k = g.createRadialGradient(0, 0, 0, 0, 0, rx);
  k.addColorStop(0, hexA(C.sandHi, a)); k.addColorStop(0.7, hexA(C.sand, a * 0.7)); k.addColorStop(1, hexA(C.sand, 0));
  g.scale(1, ry / rx);
  g.fillStyle = k;
  g.beginPath(); g.arc(0, 0, rx, 0, TAU); g.fill();
  g.scale(1, rx / ry);
  g.strokeStyle = hexA(C.sandLo, a * 0.55); g.lineWidth = 2.2; g.lineCap = 'round';
  for (let i = -2; i <= 2; i++) { g.beginPath(); g.moveTo(-rx * 0.5, i * ry * 0.22); g.quadraticCurveTo(0, i * ry * 0.22 - ry * 0.12, rx * 0.5, i * ry * 0.22 + 4); g.stroke(); }
  g.restore();
}

function oil(g: G, x: number, y: number, r: number, rand: () => number) {
  g.fillStyle = 'rgba(24, 22, 24, 0.5)';
  g.beginPath();
  for (let i = 0; i < 9; i++) { const a = (i / 9) * TAU, q = r * (0.7 + rand() * 0.5); g.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q * 0.75); }
  g.closePath(); g.fill();
  g.fillStyle = 'rgba(120, 110, 150, 0.1)';
  g.beginPath(); g.ellipse(x - r * 0.2, y - r * 0.18, r * 0.35, r * 0.18, -0.4, 0, TAU); g.fill();
}

/** Tyre marks: two parallel chunky strokes along a curve. */
function skid(g: G, pts: readonly [number, number][], gap = 22) {
  g.lineCap = 'round'; g.lineJoin = 'round';
  for (const side of [-1, 1]) {
    g.strokeStyle = 'rgba(22, 20, 20, 0.42)'; g.lineWidth = 7;
    g.beginPath();
    pts.forEach(([x, y], i) => { const nx = pts[Math.min(i + 1, pts.length - 1)]![0] - pts[Math.max(i - 1, 0)]![0], ny = pts[Math.min(i + 1, pts.length - 1)]![1] - pts[Math.max(i - 1, 0)]![1], l = Math.hypot(nx, ny) || 1; const px = x - (ny / l) * gap * side * 0.5, py = y + (nx / l) * gap * side * 0.5; if (i) g.lineTo(px, py); else g.moveTo(px, py); });
    g.stroke();
  }
}

const dash = (g: G, x0: number, y0: number, x1: number, y1: number, w: number, color: string, on = 70, off = 60) => {
  g.strokeStyle = color; g.lineWidth = w; g.setLineDash([on, off]); g.lineCap = 'butt';
  g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); g.setLineDash([]);
};

/* ------------------------------------------------------------------------------------------------------------------ */

function ground(g: G, size: number, seed: number) {
  const rand = seeded(seed ^ 0x77a1);
  g.fillStyle = C.asphalt; g.fillRect(0, 0, size, size);
  // Asphalt in big patches, each a shade apart, as if resurfaced a section at a time.
  for (let y = 0; y < size; y += 300) for (let x = 0; x < size; x += 300) {
    const k = (rand() - 0.5) * 2;
    g.fillStyle = k > 0 ? hexA(C.asphaltHi, k * 0.55) : hexA(C.asphaltLo, -k * 0.55);
    g.fillRect(x, y, 300, 300);
    if (rand() < 0.1) {
      const pw = 90 + rand() * 120, ph = 70 + rand() * 100, px = x + 20 + rand() * (300 - pw - 40), py = y + 20 + rand() * (300 - ph - 40);
      g.fillStyle = 'rgba(30, 28, 26, 0.18)'; g.fillRect(px, py, pw, ph);
      g.strokeStyle = 'rgba(24, 22, 20, 0.35)'; g.lineWidth = 2; g.strokeRect(px, py, pw, ph);
    }
  }
  const area = (size * size) / 1_000_000;
  for (let i = 0; i < 90 * area; i++) blotch(g, rand() * size, rand() * size, 100 + rand() * 260, rand() < 0.5 ? '24, 22, 18' : '130, 112, 70', 0.05 + rand() * 0.06);
  // Fine grit.
  for (let i = 0; i < 9000 * area; i++) {
    g.fillStyle = rand() < 0.6 ? 'rgba(20, 18, 16, 0.2)' : 'rgba(200, 190, 160, 0.14)';
    const s = 0.8 + rand() * 1.2;
    g.fillRect(rand() * size, rand() * size, s, s);
  }
  // Cracks: dark breaks, a few long ones and many short, with weeds pushing up along them.
  // A few chunky breaks (tapering wedges, never hairlines) and weeds in the seams; both gather round walls, see edgeGrowth.
  g.fillStyle = 'rgba(26, 24, 21, 0.42)';
  for (let i = 0; i < 26 * area; i++) wedge(g, rand, rand() * size, rand() * size, 70 + rand() * 110);
  for (let i = 0; i < 90 * area; i++) tuft(g, rand() * size, rand() * size, rand, C.grassLo, hash(i) < 0.3 ? C.dry : C.grassHi, 0.8 + rand() * 0.5);
}

/** Painted road: the highway through the overpass, a ring round the crater with yield triangles, parking bays at the station. */
function roads(g: G, size: number) {
  const white = hexA(C.lineWhite, 0.5), yellow = hexA(C.line, 0.62);
  // Highway 9: runs west to east through the overpass and ends in a broken edge.
  g.fillStyle = 'rgba(30, 29, 27, 0.35)'; g.fillRect(0, 1290, 2500, 420);
  g.fillStyle = 'rgba(25, 24, 22, 0.2)'; g.fillRect(0, 1290, 2500, 14); g.fillRect(0, 1696, 2500, 14);
  dash(g, 0, 1500, 2470, 1500, 5, yellow, 400, 0);
  dash(g, 0, 1511, 2470, 1511, 5, yellow, 400, 0);
  dash(g, 0, 1396, 2470, 1396, 6, white, 70, 70);
  dash(g, 0, 1604, 2470, 1604, 6, white, 70, 70);
  g.strokeStyle = white; g.lineWidth = 7; g.beginPath(); g.moveTo(0, 1318); g.lineTo(2470, 1318); g.moveTo(0, 1682); g.lineTo(2470, 1682); g.stroke();
  // The same road, half a turn on: a service road to the crash site.
  g.save(); g.translate(size, size); g.rotate(Math.PI);
  g.fillStyle = 'rgba(30, 29, 27, 0.3)'; g.fillRect(0, 1290, 2500, 420);
  dash(g, 0, 1500, 2470, 1500, 5, hexA(C.lineWhite, 0.35), 90, 70);
  g.strokeStyle = white; g.lineWidth = 7; g.beginPath(); g.moveTo(0, 1318); g.lineTo(2470, 1318); g.moveTo(0, 1682); g.lineTo(2470, 1682); g.stroke();
  g.restore();
  // Round-about: two white rings and yield triangles where the avenues enter.
  g.strokeStyle = hexA(C.lineWhite, 0.4); g.lineWidth = 8;
  for (const r of [880, 1130]) { g.beginPath(); g.arc(MIDX, MIDX, r, 0, TAU); g.stroke(); }
  g.save(); g.translate(MIDX, MIDX);
  g.strokeStyle = hexA(C.lineWhite, 0.32); g.lineWidth = 7; g.setLineDash([26, 38]);
  g.beginPath(); g.arc(0, 0, 1005, 0, TAU); g.stroke(); g.setLineDash([]);
  g.fillStyle = hexA(C.lineWhite, 0.4);
  for (let i = 0; i < 4; i++) {
    g.save(); g.rotate((i * Math.PI) / 2); g.translate(1180, 0);
    for (const o of [-40, 0, 40]) { g.beginPath(); g.moveTo(-14, o - 14); g.lineTo(14, o); g.lineTo(-14, o + 14); g.closePath(); g.fill(); }
    g.restore();
  }
  g.restore();
  // Parking bays in front of the station, and their twin in front of the market.
  const bays = (ox: number, oy: number, rot: number) => {
    g.save(); g.translate(ox, oy); g.rotate(rot);
    g.strokeStyle = hexA(C.lineWhite, 0.4); g.lineWidth = 5;
    for (let i = 0; i < 8; i++) { g.beginPath(); g.moveTo(i * 80, 0); g.lineTo(i * 80, 100); g.stroke(); }
    g.beginPath(); g.moveTo(0, 0); g.lineTo(560, 0); g.stroke();
    g.restore();
  };
  bays(2300, 1320, 0); bays(size - 2300, size - 1320, Math.PI);
}
const MIDX = 3000;

/** Sand drifts: heaped on the lee (east and south) sides of walls and wrecks, plus long dunes across the open lanes. */
function drifts(g: G, rand: () => number) {
  const rects = [...wallsOf('rubble'), ...wallsOf('scrap')];
  for (const w of rects) {
    if (hash(w.x, w.y, 3) < 0.55) continue;
    const east = hash(w.x, w.y, 4) < 0.5;
    const len = Math.max(w.w, w.h);
    if (len < 100) continue;
    if (east) drift(g, w.x + w.w + 26, w.y + w.h * 0.5, 54 + Math.min(70, len * 0.3), 36 + Math.min(40, len * 0.18), (hash(w.x, w.y, 5) - 0.5) * 0.6, 0.55);
    else drift(g, w.x + w.w * 0.5, w.y + w.h + 24, 60 + Math.min(70, len * 0.3), 30 + Math.min(32, len * 0.12), (hash(w.x, w.y, 6) - 0.5) * 0.4, 0.5);
  }
  for (let i = 0; i < 22; i++) drift(g, 200 + rand() * 5600, 200 + rand() * 5600, 140 + rand() * 180, 50 + rand() * 60, (rand() - 0.5) * 0.7, 0.28);
}

/** Oil, rubber and litter at the margins. */
function litter(g: G, rand: () => number, size: number) {
  for (let i = 0; i < 70; i++) oil(g, rand() * size, rand() * size, 14 + rand() * 30, rand);
  // chips of broken concrete and glass glints, a few cans
  for (let i = 0; i < 1400; i++) {
    const x = rand() * size, y = rand() * size, s = 2 + rand() * 4;
    g.fillStyle = rand() < 0.7 ? hexA(C.concreteHi, 0.5) : hexA(C.steel, 0.5);
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + s, y + s * 0.3); g.lineTo(x + s * 0.4, y + s); g.closePath(); g.fill();
  }
  for (let i = 0; i < 90; i++) {
    const x = rand() * size, y = rand() * size;
    g.save(); g.translate(x, y); g.rotate(rand() * TAU);
    g.fillStyle = [C.rustHi, C.paintBlue, C.bone, C.mustard][Math.floor(rand() * 4)]!; g.globalAlpha = 0.8;
    g.fillRect(-3, -2, 6, 4); g.strokeStyle = C.ink; g.lineWidth = 1.2; g.strokeRect(-3, -2, 6, 4);
    g.restore();
  }
}

/* ------------------------------------------------------------ room floors (found from the roofs) */

function clipped(g: G, pts: readonly Pt[], paint: () => void) { g.save(); trace(g, pts); g.clip(); paint(); g.restore(); }

function seatRows(g: G, b: { x0: number; y0: number; x1: number; y1: number }, rand: () => number, flip: boolean) {
  const yc = (b.y0 + b.y1) / 2;
  // an aisle runner and rows of three seats either side; many are torn out, a few lie on their sides
  g.fillStyle = '#3f4a5c'; g.fillRect(b.x0, yc - 24, b.x1 - b.x0, 48);
  g.fillStyle = 'rgba(200, 210, 230, 0.12)'; g.fillRect(b.x0, yc - 24, b.x1 - b.x0, 3);
  g.fillStyle = 'rgba(10, 12, 18, 0.25)'; g.fillRect(b.x0, yc + 21, b.x1 - b.x0, 3);
  for (let x = b.x0 + 70; x < b.x1 - 50; x += 54) {
    if (hash(Math.round(x), Math.round(yc), 8) < 0.12) continue;
    for (const side of [-1, 1]) {
      const y = yc + side * 58;
      const tilt = hash(Math.round(x), side, 9) < 0.18 ? (rand() - 0.5) * 1.1 : 0;
      g.save(); g.translate(x, y); g.rotate(tilt);
      for (let s = -1; s <= 1; s++) {
        g.fillStyle = hash(Math.round(x), s + side * 4, 1) < 0.2 ? '#7a4a3c' : '#4a6a8e';
        g.fillRect(-9, s * 20 - 9, 18, 18);
        g.fillStyle = 'rgba(255, 255, 255, 0.14)'; g.fillRect(-9, s * 20 - 9, 18, 3);
        g.strokeStyle = C.ink; g.lineWidth = 1.6; g.strokeRect(-9, s * 20 - 9, 18, 18);
      }
      g.fillStyle = '#2f3a4c'; g.fillRect(flip ? -13 : 9, -29, 4, 58);
      g.restore();
    }
  }
  // luggage and a stray shoe
  for (let i = 0; i < 6; i++) {
    const x = b.x0 + 80 + rand() * (b.x1 - b.x0 - 160), y = yc + (rand() < 0.5 ? -1 : 1) * (28 + rand() * 80);
    g.save(); g.translate(x, y); g.rotate(rand() * TAU);
    g.fillStyle = [C.rust, C.paintBlue, C.olive, C.mustard][Math.floor(rand() * 4)]!;
    g.fillRect(-11, -8, 22, 16); g.strokeStyle = C.ink; g.lineWidth = 1.6; g.strokeRect(-11, -8, 22, 16);
    g.fillStyle = 'rgba(255,255,255,0.2)'; g.fillRect(-11, -8, 22, 3);
    g.restore();
  }
}

function roomFloors(g: G, seed: number) {
  for (const roof of WASTELAND.roofs ?? []) {
    const id = baseId(roof.id), twin = isTwin(roof.id), pts = roof.points as Pt[];
    const b = boundsOf(pts);
    const rand = seeded(seed ^ Math.floor(hash(b.x0, b.y0) * 1e6));
    const w = b.x1 - b.x0, h = b.y1 - b.y0;
    if (id === 'spanA-roof' || id === 'spanB-roof') {
      clipped(g, pts, () => {
        if (!twin) {
          // underpass: dark damp concrete, a painted gutter line, grime and a puddle
          g.fillStyle = '#4a4842'; g.fillRect(b.x0, b.y0, w, h);
          g.fillStyle = 'rgba(12, 12, 14, 0.25)'; g.fillRect(b.x0, b.y0, w, 26); g.fillRect(b.x0, b.y1 - 26, w, 26);
          dash(g, b.x0, (b.y0 + b.y1) / 2, b.x1, (b.y0 + b.y1) / 2, 5, hexA(C.line, 0.55), 60, 50);
          for (let i = 0; i < 18; i++) blotch(g, b.x0 + rand() * w, b.y0 + rand() * h, 30 + rand() * 60, '14, 14, 16', 0.2);
          for (let i = 0; i < 10; i++) crack2(g, rand, b.x0 + rand() * w, b.y0 + rand() * h);
          g.fillStyle = 'rgba(60, 90, 100, 0.35)'; g.beginPath(); g.ellipse(b.x0 + w * (twin ? 0.6 : 0.35), (b.y0 + b.y1) / 2 + 24, 54, 22, 0, 0, TAU); g.fill();
          // a dropped hand-painted arrow: where the water is
          g.fillStyle = hexA(C.mustard, 0.5); g.beginPath(); g.moveTo(b.x0 + w * 0.5 - 22, (b.y0 + b.y1) / 2 - 8); g.lineTo(b.x0 + w * 0.5 + 6, (b.y0 + b.y1) / 2 - 8); g.lineTo(b.x0 + w * 0.5 + 6, (b.y0 + b.y1) / 2 - 20); g.lineTo(b.x0 + w * 0.5 + 30, (b.y0 + b.y1) / 2); g.lineTo(b.x0 + w * 0.5 + 6, (b.y0 + b.y1) / 2 + 20); g.lineTo(b.x0 + w * 0.5 + 6, (b.y0 + b.y1) / 2 + 8); g.lineTo(b.x0 + w * 0.5 - 22, (b.y0 + b.y1) / 2 + 8); g.closePath(); g.fill();
        } else {
          seatRows(g, b, rand, id === 'spanA-roof');
        }
      });
    } else if (id === 'hall') {
      clipped(g, pts, () => {
        if (!twin) poolFloor(g, b, rand); else churchFloor(g, b, rand);
      });
    } else if (id.startsWith('sh') && id !== 'sh-alley') {
      clipped(g, pts, () => {
        if (!twin) {
          // shack: packed dirt, boards laid in strips, a rag rug
          g.fillStyle = C.dirt; g.fillRect(b.x0, b.y0, w, h);
          for (let y = b.y0 + 4; y < b.y1; y += 20) { g.fillStyle = hash(Math.round(y), Math.round(b.x0), 2) < 0.5 ? 'rgba(120,90,56,0.22)' : 'rgba(40,28,20,0.2)'; g.fillRect(b.x0, y, w, 16); }
          g.strokeStyle = 'rgba(20, 14, 10, 0.4)'; g.lineWidth = 2; g.beginPath(); for (let y = b.y0 + 20; y < b.y1; y += 20) { g.moveTo(b.x0, y); g.lineTo(b.x1, y); } g.stroke();
          const rug = [C.scrapD, C.scrapE, C.mustard, C.tarpGreen][Math.floor(hash(b.x0, b.y0, 7) * 4)]!;
          g.fillStyle = hexA(rug, 0.75); rr(g, b.x0 + w * 0.3, b.y0 + h * 0.3, w * 0.4, h * 0.4, 10); g.fill();
          g.strokeStyle = C.ink; g.lineWidth = 2; g.stroke();
          g.strokeStyle = 'rgba(255,255,255,0.18)'; g.lineWidth = 3; rr(g, b.x0 + w * 0.3 + 8, b.y0 + h * 0.3 + 8, w * 0.4 - 16, h * 0.4 - 16, 6); g.stroke();
        } else {
          // bunker: poured concrete, painted lanes, drain grates and a stencilled bay number
          g.fillStyle = '#5a5e64'; g.fillRect(b.x0, b.y0, w, h);
          g.fillStyle = 'rgba(255,255,255,0.05)'; g.fillRect(b.x0, b.y0, w, h * 0.5);
          g.strokeStyle = 'rgba(20, 22, 26, 0.5)'; g.lineWidth = 2;
          g.beginPath(); for (let x = b.x0; x < b.x1; x += 100) { g.moveTo(x, b.y0); g.lineTo(x, b.y1); } for (let y = b.y0; y < b.y1; y += 100) { g.moveTo(b.x0, y); g.lineTo(b.x1, y); } g.stroke();
          g.fillStyle = hexA('#d9c24a', 0.6); const hz = 12;
          for (let x = b.x0 + 6; x < b.x1 - 12; x += 22) { g.beginPath(); g.moveTo(x, b.y0 + h - hz - 6); g.lineTo(x + 10, b.y0 + h - hz - 6); g.lineTo(x + 18, b.y0 + h - 6); g.lineTo(x + 8, b.y0 + h - 6); g.closePath(); g.fill(); }
          g.fillStyle = 'rgba(20,22,26,0.55)'; g.fillRect(b.x0 + w * 0.5 - 16, b.y0 + h * 0.5 - 16, 32, 32);
          g.strokeStyle = 'rgba(200,205,215,0.4)'; g.lineWidth = 2; for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(b.x0 + w * 0.5 - 12, b.y0 + h * 0.5 - 10 + i * 7); g.lineTo(b.x0 + w * 0.5 + 12, b.y0 + h * 0.5 - 10 + i * 7); g.stroke(); }
        }
      });
    } else if (id === 'gs-store') {
      clipped(g, pts, () => {
        if (!twin) {
          // lino chequer, gone grey; a spilled shelf of tins
          const t = 50;
          for (let y = b.y0; y < b.y1; y += t) for (let x = b.x0; x < b.x1; x += t) { g.fillStyle = (((x - b.x0) / t + (y - b.y0) / t) & 1) === 0 ? '#74705f' : '#5c5a4f'; g.fillRect(x, y, t, t); }
          g.strokeStyle = 'rgba(20,20,18,0.3)'; g.lineWidth = 1.6; g.strokeRect(b.x0 + 3, b.y0 + 3, w - 6, h - 6);
          for (let i = 0; i < 14; i++) { const x = b.x0 + 70 + rand() * (w - 140), y = b.y0 + 70 + rand() * (h - 140); g.fillStyle = [C.rust, C.paintBlue, C.bone][Math.floor(rand() * 3)]!; g.beginPath(); g.arc(x, y, 5, 0, TAU); g.fill(); g.strokeStyle = C.ink; g.lineWidth = 1.4; g.stroke(); }
        } else {
          // market stall: a swept earth floor with a striped rug and a scatter of beads
          g.fillStyle = C.dirt; g.fillRect(b.x0, b.y0, w, h);
          const cols = [C.paintRed, C.mustard, C.paintTeal, C.bone];
          for (let i = 0; i < 6; i++) { g.fillStyle = hexA(cols[i % 4]!, 0.65); g.fillRect(b.x0 + 70, b.y0 + 70 + i * ((h - 140) / 6), w - 140, (h - 140) / 6 - 3); }
          g.strokeStyle = C.ink; g.lineWidth = 2; g.strokeRect(b.x0 + 70, b.y0 + 70, w - 140, h - 140);
        }
      });
    } else if (id === 'gs-wash') {
      clipped(g, pts, () => {
        g.fillStyle = '#4a4e50'; g.fillRect(b.x0, b.y0, w, h);
        g.fillStyle = 'rgba(70, 120, 140, 0.18)'; g.fillRect(b.x0, b.y0 + 60, w, h - 120);
        g.strokeStyle = 'rgba(20,24,26,0.5)'; g.lineWidth = 3; g.beginPath(); g.moveTo(b.x0, b.y0 + h / 2); g.lineTo(b.x1, b.y0 + h / 2); g.stroke();
        for (let x = b.x0 + 70; x < b.x1 - 40; x += 60) { g.fillStyle = 'rgba(14,16,18,0.5)'; g.fillRect(x, b.y0 + h / 2 - 5, 30, 10); }
      });
    }
  }
}

function crack2(g: G, rand: () => number, x: number, y: number) {
  g.strokeStyle = 'rgba(20, 20, 20, 0.5)'; g.lineWidth = 2; g.lineCap = 'round'; g.beginPath(); crack(g, rand, x, y, 70, 1); g.stroke();
}

/** The dry pool: aqua tile gone chalky, lane lines, depth numbers, a drain, and a little jungle in the corners. */
function poolFloor(g: G, b: { x0: number; y0: number; x1: number; y1: number }, rand: () => number) {
  // the deck (the hall's own floor) first, then the basin inset by the coping
  g.fillStyle = '#7d8a84'; g.fillRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
  const px0 = b.x0 + 50, py0 = b.y0 + 50, px1 = b.x1 - 50, py1 = b.y1 - 50;
  const t = 25;
  for (let y = py0; y < py1; y += t) for (let x = px0; x < px1; x += t) {
    const deep = (x - px0) / (px1 - px0);
    const k = hash(x, y, 11);
    g.fillStyle = k < 0.15 ? '#8aa8a4' : k > 0.85 ? '#5f8884' : deep > 0.6 ? '#5a8a8c' : '#76a3a0';
    g.fillRect(x, y, t, t);
  }
  g.strokeStyle = 'rgba(20, 40, 44, 0.32)'; g.lineWidth = 1.6; g.beginPath();
  for (let x = px0; x <= px1; x += t) { g.moveTo(x, py0); g.lineTo(x, py1); }
  for (let y = py0; y <= py1; y += t) { g.moveTo(px0, y); g.lineTo(px1, y); }
  g.stroke();
  // depth shading toward the deep end, and the slope line
  const grad = g.createLinearGradient(px0, 0, px1, 0);
  grad.addColorStop(0, 'rgba(20, 50, 60, 0)'); grad.addColorStop(1, 'rgba(10, 30, 40, 0.38)');
  g.fillStyle = grad; g.fillRect(px0, py0, px1 - px0, py1 - py0);
  g.fillStyle = 'rgba(15, 25, 30, 0.45)'; g.fillRect(px0 + (px1 - px0) * 0.5 - 3, py0, 6, py1 - py0);
  // lane lines
  g.fillStyle = 'rgba(20, 24, 30, 0.7)';
  for (const f of [0.3, 0.5, 0.7]) g.fillRect(px0 + 10, py0 + (py1 - py0) * f - 3, px1 - px0 - 20, 6);
  // depth marks
  g.fillStyle = hexA(C.bone, 0.65); g.font = '800 26px "Barlow Condensed", "Arial Narrow", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (const [f, txt] of [[0.08, '1.0'], [0.35, '1.6'], [0.62, '2.4'], [0.9, '3.2']] as const) g.fillText(txt, px0 + (px1 - px0) * f, py0 + 22);
  // drain
  const dx = px1 - 90, dy = (py0 + py1) / 2;
  g.fillStyle = '#1e2428'; g.beginPath(); g.arc(dx, dy, 22, 0, TAU); g.fill(); g.strokeStyle = C.ink; g.lineWidth = 2; g.stroke();
  g.strokeStyle = 'rgba(200,210,220,0.35)'; g.lineWidth = 3; for (let i = -1; i <= 1; i++) { g.beginPath(); g.moveTo(dx - 16, dy + i * 8); g.lineTo(dx + 16, dy + i * 8); g.stroke(); }
  // weeds and a cracked mud skin where the last of the water stood
  g.fillStyle = 'rgba(70, 60, 40, 0.4)'; g.beginPath(); g.ellipse(px1 - 160, dy + 20, 120, 54, 0.1, 0, TAU); g.fill();
  g.strokeStyle = 'rgba(30, 24, 16, 0.55)'; g.lineWidth = 2; g.beginPath();
  for (let i = 0; i < 18; i++) { const a = rand() * TAU, d = rand() * 100; const x = px1 - 160 + Math.cos(a) * d, y = dy + 20 + Math.sin(a) * d * 0.5; g.moveTo(x, y); g.lineTo(x + (rand() - 0.5) * 40, y + (rand() - 0.5) * 24); }
  g.stroke();
  for (let i = 0; i < 70; i++) tuft(g, px0 + rand() * (px1 - px0), py0 + rand() * (py1 - py0), rand, C.grassLo, C.grassHi, 0.9);
}

function churchFloor(g: G, b: { x0: number; y0: number; x1: number; y1: number }, rand: () => number) {
  const w = b.x1 - b.x0, h = b.y1 - b.y0;
  g.fillStyle = '#6a4f34'; g.fillRect(b.x0, b.y0, w, h);
  // boards laid along the nave, each its own tone
  for (let y = b.y0 + 4; y < b.y1; y += 18) { g.fillStyle = hash(Math.round(y), 5, 12) < 0.5 ? 'rgba(160,120,70,0.22)' : 'rgba(30,20,10,0.22)'; g.fillRect(b.x0, y, w, 15); }
  g.strokeStyle = 'rgba(24, 14, 8, 0.45)'; g.lineWidth = 2; g.beginPath();
  for (let y = b.y0 + 18; y < b.y1; y += 18) { g.moveTo(b.x0, y); g.lineTo(b.x1, y); }
  for (let y = b.y0; y < b.y1; y += 18) for (let x = b.x0 + hash(Math.round(y), 1, 2) * 90; x < b.x1; x += 90 + hash(Math.round(x), Math.round(y)) * 60) { g.moveTo(x, y); g.lineTo(x, y + 18); }
  g.stroke();
  // the aisle runner, worn to threads in the middle
  const yc = (b.y0 + b.y1) / 2;
  g.fillStyle = '#7a3a3a'; g.fillRect(b.x0 + 50, yc - 34, w - 90, 68);
  g.fillStyle = 'rgba(255, 220, 160, 0.14)'; g.fillRect(b.x0 + 50, yc - 34, w - 90, 5);
  g.strokeStyle = hexA(C.mustard, 0.7); g.lineWidth = 3; g.strokeRect(b.x0 + 56, yc - 28, w - 102, 56);
  g.strokeStyle = C.ink; g.lineWidth = 2; g.strokeRect(b.x0 + 50, yc - 34, w - 90, 68);
  // fallen slates and a patch of sky: a light shaft where the roof has gone
  for (let i = 0; i < 14; i++) { const x = b.x0 + 120 + rand() * (w - 240), y = b.y0 + 60 + rand() * (h - 120); g.fillStyle = '#4a4c52'; g.save(); g.translate(x, y); g.rotate(rand() * TAU); g.fillRect(-9, -6, 18, 12); g.strokeStyle = C.ink; g.lineWidth = 1.4; g.strokeRect(-9, -6, 18, 12); g.restore(); }
  g.fillStyle = 'rgba(255, 240, 200, 0.07)';
  g.beginPath(); g.moveTo(b.x0 + w * 0.3, b.y0); g.lineTo(b.x0 + w * 0.3 + 70, b.y0); g.lineTo(b.x0 + w * 0.3 + 180, b.y1); g.lineTo(b.x0 + w * 0.3 + 100, b.y1); g.closePath(); g.fill();
  for (let i = 0; i < 30; i++) tuft(g, b.x0 + rand() * w, b.y0 + rand() * h, rand, C.grassLo, C.grassHi, 0.9);
}

/* ------------------------------------------------------------ district grounds */

function districtGrounds(g: G, seed: number) {
  for (const d of DISTRICTS) {
    const b = districtBox(d);
    const [rgb, a] = d.tint;
    blotch(g, (b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, 1500, rgb, a * 1.6);
  }
  const rand = seeded(seed ^ 0xd157);
  // SHANTY: packed dirt trodden between the shacks, tyre ruts, mud at the well
  const sh = { x0: 4150, y0: 100, x1: 5900, y1: 1800 };
  g.fillStyle = 'rgba(96, 74, 50, 0.5)'; rr(g, sh.x0, sh.y0, sh.x1 - sh.x0, sh.y1 - sh.y0, 80); g.fill();
  for (let i = 0; i < 200; i++) { g.fillStyle = rand() < 0.5 ? 'rgba(130, 100, 64, 0.35)' : 'rgba(50, 36, 26, 0.35)'; g.fillRect(sh.x0 + rand() * (sh.x1 - sh.x0), sh.y0 + rand() * (sh.y1 - sh.y0), 6 + rand() * 12, 2.4); }
  // BUNKER: the twin compound's apron is gravel and sandbag ring, not dirt
  const bk = { x0: 100, y0: 4200, x1: 1850, y1: 5900 };
  g.fillStyle = 'rgba(90, 96, 104, 0.4)'; rr(g, bk.x0, bk.y0, bk.x1 - bk.x0, bk.y1 - bk.y0, 80); g.fill();
  for (let i = 0; i < 700; i++) { g.fillStyle = rand() < 0.5 ? 'rgba(170,175,180,0.3)' : 'rgba(40,44,50,0.3)'; g.fillRect(bk.x0 + rand() * (bk.x1 - bk.x0), bk.y0 + rand() * (bk.y1 - bk.y0), 2.4, 2.4); }
  // GAS STATION: poured apron slabs round the pumps
  const gs = { x: 2050, y: 560, w: 1950, h: 800 };
  g.fillStyle = 'rgba(120, 118, 108, 0.5)'; g.fillRect(gs.x, gs.y, gs.w, gs.h);
  g.strokeStyle = 'rgba(30, 30, 28, 0.55)'; g.lineWidth = 3; g.beginPath();
  for (let x = gs.x; x <= gs.x + gs.w; x += 220) { g.moveTo(x, gs.y); g.lineTo(x, gs.y + gs.h); }
  for (let y = gs.y; y <= gs.y + gs.h; y += 200) { g.moveTo(gs.x, y); g.lineTo(gs.x + gs.w, y); }
  g.stroke();
  g.strokeStyle = C.ink; g.lineWidth = 2.4; g.strokeRect(gs.x, gs.y, gs.w, gs.h);
  // SCRAP MARKET: pale gravel with squared-off patches of rug and tarp laid flat
  const mk = { x: 2000, y: 4640, w: 1950, h: 800 };
  g.fillStyle = 'rgba(150, 128, 90, 0.38)'; g.fillRect(mk.x, mk.y, mk.w, mk.h);
  for (let i = 0; i < 900; i++) { g.fillStyle = rand() < 0.5 ? 'rgba(200,180,140,0.3)' : 'rgba(70,56,40,0.3)'; g.fillRect(mk.x + rand() * mk.w, mk.y + rand() * mk.h, 2.6, 2.6); }
  const tarps = [C.tarpBlue, C.tarpOrange, C.paintRed, C.mustard, C.paintTeal, C.tarpGreen];
  for (let i = 0; i < 16; i++) {
    const x = mk.x + 40 + rand() * (mk.w - 200), y = mk.y + 30 + rand() * (mk.h - 150), ww = 90 + rand() * 90, hh = 60 + rand() * 60;
    g.save(); g.translate(x, y); g.rotate((rand() - 0.5) * 0.25);
    g.fillStyle = hexA(tarps[Math.floor(rand() * tarps.length)]!, 0.5); g.fillRect(0, 0, ww, hh);
    g.strokeStyle = 'rgba(28, 31, 38, 0.6)'; g.lineWidth = 2; g.strokeRect(0, 0, ww, hh);
    g.restore();
  }
  // CRATER: ash and glassy melt round the pit, scorched rings
  const cr = { x: 3000, y: 3000 };
  g.fillStyle = 'rgba(40, 38, 34, 0.5)'; g.beginPath(); g.arc(cr.x, cr.y, 900, 0, TAU); g.fill();
  const rad = g.createRadialGradient(cr.x, cr.y, 40, cr.x, cr.y, 640);
  rad.addColorStop(0, 'rgba(120, 232, 140, 0.18)'); rad.addColorStop(0.55, 'rgba(60, 130, 80, 0.14)'); rad.addColorStop(1, 'rgba(40, 80, 50, 0)');
  g.fillStyle = rad; g.beginPath(); g.arc(cr.x, cr.y, 640, 0, TAU); g.fill();
  g.strokeStyle = 'rgba(20, 20, 18, 0.34)'; g.lineWidth = 5; g.beginPath();
  for (let i = 0; i < 16; i++) { const a = rand() * TAU, r0 = 120 + rand() * 300; crackFrom(g, rand, cr.x + Math.cos(a) * r0, cr.y + Math.sin(a) * r0, a, 160 + rand() * 260); }
  g.stroke();
  for (let i = 0; i < 40; i++) { const a = rand() * TAU, r0 = 80 + rand() * 440; g.fillStyle = hexA(C.glass, 0.7); g.beginPath(); g.ellipse(cr.x + Math.cos(a) * r0, cr.y + Math.sin(a) * r0, 14 + rand() * 24, 8 + rand() * 12, rand() * TAU, 0, TAU); g.fill(); g.fillStyle = 'rgba(190, 255, 200, 0.2)'; g.beginPath(); g.ellipse(cr.x + Math.cos(a) * r0 - 4, cr.y + Math.sin(a) * r0 - 3, 6, 3, 0, 0, TAU); g.fill(); }
  // CHURCH: grass takes the yard, flagstones lead to the door
  const ch = { x: 4000, y: 2300, w: 2000, h: 1400 };
  for (let i = 0; i < 24; i++) blotch(g, ch.x + rand() * ch.w, ch.y + rand() * ch.h, 120 + rand() * 160, '70, 110, 50', 0.28);
  // POOL: a mown-flat terrace, cracked paving stones, a few palms' worth of dead leaves
  const pl = { x: 0, y: 2300, w: 2000, h: 1400 };
  g.fillStyle = 'rgba(122, 140, 132, 0.28)'; g.fillRect(pl.x, pl.y, pl.w, pl.h);
  // CRASH SITE: the belly gouge, scorched earth and foam
  g.save(); g.translate(6000, 6000); g.rotate(Math.PI);
  g.fillStyle = 'rgba(20, 18, 16, 0.4)';
  g.beginPath(); g.moveTo(180, 1450); g.lineTo(2500, 1380); g.lineTo(2500, 1620); g.lineTo(180, 1550); g.closePath(); g.fill();
  for (let i = 0; i < 10; i++) blotch(g, 400 + rand() * 1900, 1500 + (rand() - 0.5) * 260, 100 + rand() * 120, '10, 8, 6', 0.28);
  g.restore();
  for (let i = 0; i < 30; i++) blotch(g, 4400 + rand() * 1400, 4400 + rand() * 1400, 50 + rand() * 60, '230, 236, 240', 0.08);
}

function crackFrom(g: G, rand: () => number, x: number, y: number, a: number, len: number) {
  g.moveTo(x, y);
  const n = 6;
  for (let i = 0; i < n; i++) { a += (rand() - 0.5) * 0.8; x += (Math.cos(a) * len) / n; y += (Math.sin(a) * len) / n; g.lineTo(x, y); }
}

/* ------------------------------------------------------------ spawn pads */

function pads(g: G, plan: FloorPlan) {
  void plan;
  const mat = (r: { x: number; y: number; w: number; h: number }, col: string, label: boolean) => {
    // A camp rug: woven stripe border in the team's cloth, stitched with chalk. Team colour only here, as a marking.
    g.fillStyle = 'rgba(20, 22, 26, 0.35)'; rr(g, r.x - 6, r.y - 4, r.w + 16, r.h + 16, 18); g.fill();
    g.fillStyle = hexA(col, 0.52); rr(g, r.x - 6, r.y - 6, r.w + 12, r.h + 12, 16); g.fill();
    g.fillStyle = 'rgba(70, 60, 48, 0.55)'; rr(g, r.x + 8, r.y + 8, r.w - 16, r.h - 16, 10); g.fill();
    g.strokeStyle = C.ink; g.lineWidth = 2.4; rr(g, r.x - 6, r.y - 6, r.w + 12, r.h + 12, 16); g.stroke();
    g.strokeStyle = hexA(C.bone, 0.5); g.lineWidth = 3; g.setLineDash([14, 10]); rr(g, r.x + 6, r.y + 6, r.w - 12, r.h - 12, 10); g.stroke(); g.setLineDash([]);
    for (let x = r.x + 20; x < r.x + r.w - 10; x += 30) { g.fillStyle = hexA(col, 0.18); g.fillRect(x, r.y + 12, 14, r.h - 24); }
    if (label) { g.fillStyle = hexA(C.bone, 0.38); g.beginPath(); for (let i = 0; i < 8; i++) { const a = (i * TAU) / 8 - Math.PI / 2, q = i % 2 ? 12 : 28; g.lineTo(r.x + r.w / 2 + Math.cos(a) * q, r.y + r.h / 2 + Math.sin(a) * q); } g.closePath(); g.fill(); }
  };
  for (const r of WASTELAND.spawns.red) mat(r, '#b4524a', true);
  for (const r of WASTELAND.spawns.blue) mat(r, '#4f7fbf', true);
  // FFA landings: a ring of half-buried tyres painted bone, a star in the middle
  for (const r of WASTELAND.spawns.ffa) {
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2, R = Math.min(r.w, r.h) / 2 + 22;
    g.fillStyle = 'rgba(24, 22, 24, 0.22)'; g.beginPath(); g.ellipse(cx + 3, cy + 4, R + 4, R * 0.9, 0, 0, TAU); g.fill();
    g.strokeStyle = hexA(C.bone, 0.42); g.lineWidth = 6; g.setLineDash([18, 12]); g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.stroke(); g.setLineDash([]);
    g.fillStyle = hexA(C.bone, 0.3); g.beginPath(); for (let i = 0; i < 10; i++) { const a = (i * TAU) / 10 - Math.PI / 2, q = i % 2 ? 7 : 17; g.lineTo(cx + Math.cos(a) * q, cy + Math.sin(a) * q); } g.closePath(); g.fill();
  }
}

/* ------------------------------------------------------------------------------------------------------------------ */

export function paintWastelandFloor(g: G, size: number, seed: number, plan: FloorPlan) {
  const rand = seeded(seed ^ 0x3a17);
  ground(g, size, seed);
  roads(g, size);
  districtGrounds(g, seed);
  roomFloors(g, seed);
  edgeGrowth(g, rand);
  drifts(g, rand);
  litter(g, rand, size);
  pads(g, plan);
  paintFloorDecor(g, seed);
  // The rim of the world: rubble darkens the map's edge so it feels finished.
  const rim = 200;
  for (const [x0, y0, x1, y1, rx, ry, rw, rh] of [[0, 0, 0, rim, 0, 0, size, rim], [0, size, 0, size - rim, 0, size - rim, size, rim], [0, 0, rim, 0, 0, 0, rim, size], [size, 0, size - rim, 0, size - rim, 0, rim, size]] as const) {
    const grad = g.createLinearGradient(x0, y0, x1, y1);
    grad.addColorStop(0, 'rgba(14, 12, 10, 0.45)'); grad.addColorStop(1, 'rgba(14, 12, 10, 0)');
    g.fillStyle = grad; g.fillRect(rx, ry, rw, rh);
  }
  void inPoly;
}
