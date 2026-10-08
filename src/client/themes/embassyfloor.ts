import { ATRIUM, DISTRICTS, FOUNTAIN, GROUNDS, HEDGE_RUNS, VEHICLES, type FloorKind } from '../../shared/maps/embassy.ts';
import { stencil, type FloorPlan } from '../floor.ts';
import { blotch, seeded } from '../grain.ts';
import { FLOOR, INK } from '../palette.ts';
import { paintDecor } from './embassydecor.ts';
import { BRASS, BRASS_HI, CREAM, NAVY, TAU, hexA, lettering, ringText, seal, star, stain } from './embassykit.ts';

/**
 * The Embassy's floor, baked once. Every district has a floor of its own (navy carpet in the Office Wing, walnut parquet in the
 * Ambassador's Suite, raised tile in the Server Room, red runners and polished wood in the Residence, mown stripes on the lawn)
 * and a faint wash of its light's colour. The Atrium wears the republic's emblem in marble, brass and navy. Quiet, mid-dark,
 * and kept low in contrast so the soldiers stay the loudest thing on it.
 */

type Rand = () => number;
type G = CanvasRenderingContext2D;
type Rect = { x: number; y: number; w: number; h: number };

function grid(g: G, r: Rect, T: number, a: string, b: string, joint: string, rand: Rand, shift = 0.05, jw = 2) {
  for (let ty = r.y; ty < r.y + r.h; ty += T) {
    for (let tx = r.x; tx < r.x + r.w; tx += T) {
      g.fillStyle = (((tx - r.x) / T + (ty - r.y) / T) & 1) === 1 ? b : a;
      g.fillRect(tx, ty, Math.min(T, r.x + r.w - tx), Math.min(T, r.y + r.h - ty));
      const k = (rand() - 0.5) * shift;
      g.fillStyle = k > 0 ? `rgba(255, 246, 226, ${k})` : `rgba(8, 8, 12, ${-k})`;
      g.fillRect(tx, ty, Math.min(T, r.x + r.w - tx), Math.min(T, r.y + r.h - ty));
    }
  }
  g.strokeStyle = joint; g.lineWidth = jw; g.beginPath();
  for (let tx = r.x + T; tx < r.x + r.w; tx += T) { g.moveTo(tx, r.y); g.lineTo(tx, r.y + r.h); }
  for (let ty = r.y + T; ty < r.y + r.h; ty += T) { g.moveTo(r.x, ty); g.lineTo(r.x + r.w, ty); }
  g.stroke();
}

const WOODS = ['#6b4a2c', '#74512f', '#5f4227', '#7a5834'] as const;
function herring(g: G, seed: number, tone: readonly string[] = WOODS): CanvasPattern {
  const W = 12, L = 48, T = 96;
  const c = document.createElement('canvas'); c.width = c.height = T;
  const p = c.getContext('2d')!;
  const rand = seeded(seed);
  p.lineWidth = 1;
  const plank = (x: number, y: number, w: number, h: number) => {
    for (const ox of [-T, 0, T]) for (const oy of [-T, 0, T]) {
      const px = x + ox, py = y + oy;
      if (px + w < 0 || py + h < 0 || px > T || py > T) continue;
      p.fillStyle = tone[Math.floor(rand() * tone.length)]!; p.fillRect(px, py, w, h);
      p.fillStyle = 'rgba(255, 220, 160, 0.07)'; p.fillRect(px, py, w, 2);
      p.strokeStyle = 'rgba(40, 26, 14, 0.7)'; p.strokeRect(px + 0.5, py + 0.5, w - 1, h - 1);
    }
  };
  for (let j = -12; j <= 12; j++) for (let k = -12; k <= 12; k++) { plank(k * W + j * -8 * W, k * W, L, W); plank(k * W + L + j * -8 * W, k * W + W - L, W, L); }
  return g.createPattern(c, 'repeat')!;
}

const border = (g: G, r: Rect, inset: number, color: string, lw = 3) => { g.strokeStyle = color; g.lineWidth = lw; g.strokeRect(r.x + inset, r.y + inset, r.w - 2 * inset, r.h - 2 * inset); };

/** Tufted carpet: a quiet lattice of diamonds. */
function carpet(g: G, r: Rect, base: string, line: string, pitch = 40) {
  g.fillStyle = base; g.fillRect(r.x, r.y, r.w, r.h);
  g.save(); g.beginPath(); g.rect(r.x, r.y, r.w, r.h); g.clip();
  g.strokeStyle = line; g.lineWidth = 1.5; g.beginPath();
  for (let ty = r.y; ty < r.y + r.h; ty += pitch) for (let tx = r.x; tx < r.x + r.w; tx += pitch) { g.moveTo(tx + pitch / 2, ty + 5); g.lineTo(tx + pitch - 5, ty + pitch / 2); g.lineTo(tx + pitch / 2, ty + pitch - 5); g.lineTo(tx + 5, ty + pitch / 2); g.closePath(); }
  g.stroke(); g.restore();
}

const PAINT: Record<FloorKind, (g: G, d: Rect, rand: Rand, seed: number) => void> = {
  navy: (g, d) => carpet(g, d, '#33415f', 'rgba(150, 175, 220, 0.12)'),
  walnut: (g, d, rand, seed) => {
    g.fillStyle = herring(g, seed ^ 0x31); g.fillRect(d.x, d.y, d.w, d.h);
    g.strokeStyle = 'rgba(30, 18, 10, 0.4)'; g.lineWidth = 22; g.strokeRect(d.x, d.y, d.w, d.h);
    border(g, d, 14, hexA(BRASS, 0.5), 2);
    for (let i = 0; i < 5; i++) blotch(g, d.x + rand() * d.w, d.y + rand() * d.h, 120 + rand() * 120, '30, 18, 10', 0.1);
  },
  confcarpet: (g, d) => { carpet(g, d, '#3b5260', 'rgba(170, 210, 230, 0.12)', 50); border(g, d, 20, 'rgba(190, 220, 240, 0.35)', 3); },
  tilecarpet: (g, d, rand) => { grid(g, d, 100, '#58606b', '#535b66', 'rgba(26, 30, 38, 0.55)', rand, 0.06); },
  raised: (g, d, rand) => {
    grid(g, d, 50, '#48515f', '#454e5c', 'rgba(14, 18, 28, 0.7)', rand, 0.05);
    // Perforated cold-aisle tiles: dotted, in the aisles between the racks, lit blue from below.
    g.fillStyle = 'rgba(10, 14, 26, 0.55)';
    for (const [x0, x1] of [[1100, 1300]] as const) for (let y = d.y + 100; y < d.y + d.h - 100; y += 50) for (let x = x0; x < x1; x += 50) for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) g.fillRect(x + 10 + i * 9, y + 10 + j * 9, 3, 3);
    g.fillStyle = 'rgba(86, 184, 255, 0.07)'; g.fillRect(1100, d.y + 40, 200, d.h - 80);
    border(g, d, 8, 'rgba(255, 211, 77, 0.45)', 4);
  },
  cafetile: (g, d, rand) => { grid(g, d, 50, '#7f8e6c', '#a4a184', 'rgba(36, 40, 28, 0.45)', rand, 0.05); },
  flagmarble: (g, d, rand) => {
    grid(g, d, 100, '#7a766a', '#847f72', 'rgba(44, 41, 36, 0.8)', rand, 0.06);
    g.strokeStyle = 'rgba(52, 48, 42, 0.28)'; g.lineWidth = 1.3;
    for (let i = 0; i < 40; i++) { const sx = d.x + rand() * d.w, sy = d.y + rand() * d.h; g.beginPath(); g.moveTo(sx, sy); g.quadraticCurveTo(sx + (rand() - 0.5) * 80, sy + (rand() - 0.5) * 80, sx + (rand() - 0.5) * 100, sy + (rand() - 0.5) * 100); g.stroke(); }
  },
  granite: (g, d, rand) => {
    grid(g, d, 100, '#4d4f58', '#54565f', 'rgba(20, 20, 26, 0.7)', rand, 0.05);
    for (let i = 0; i < 380; i++) { g.fillStyle = rand() < 0.5 ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.16)'; g.fillRect(d.x + rand() * d.w, d.y + rand() * d.h, 1.5, 1.5); }
    border(g, d, 30, hexA(BRASS, 0.55), 3);
  },
  checktile: (g, d, rand) => {
    grid(g, d, 50, '#707a86', '#6a7480', 'rgba(24, 28, 34, 0.45)', rand, 0.04);
    // Hazard lanes round the belts, and the line you queue behind.
    g.save(); g.beginPath(); g.rect(d.x, d.y, d.w, d.h); g.clip();
    g.fillStyle = 'rgba(255, 211, 77, 0.55)'; g.fillRect(d.x, d.y + 12, d.w, 5);
    g.fillStyle = 'rgba(255, 211, 77, 0.3)';
    for (let x = d.x; x < d.x + d.w; x += 36) { g.beginPath(); g.moveTo(x, d.y + 40); g.lineTo(x + 14, d.y + 40); g.lineTo(x + 34, d.y + 54); g.lineTo(x + 20, d.y + 54); g.closePath(); g.fill(); }
    g.restore();
  },
  terrace: (g, d, rand) => {
    grid(g, d, 100, '#8a8473', '#837d6d', 'rgba(50, 46, 38, 0.7)', rand, 0.07);
    for (let i = 0; i < 60; i++) blotch(g, d.x + rand() * d.w, d.y + rand() * d.h, 40 + rand() * 80, '30, 26, 20', 0.07);
  },
  lawn: (g, d, rand) => {
    g.fillStyle = '#4b6a3b'; g.fillRect(d.x, d.y, d.w, d.h);
    for (let y = d.y, i = 0; y < d.y + d.h; y += 100, i++) { g.fillStyle = i & 1 ? 'rgba(255, 255, 220, 0.045)' : 'rgba(0, 20, 0, 0.07)'; g.fillRect(d.x, y, d.w, 100); }
    for (let i = 0; i < 900; i++) { g.fillStyle = rand() < 0.5 ? 'rgba(170, 220, 120, 0.2)' : 'rgba(20, 50, 20, 0.22)'; g.fillRect(d.x + rand() * d.w, d.y + rand() * d.h, 2, 4 + rand() * 3); }
    for (let i = 0; i < 30; i++) blotch(g, d.x + rand() * d.w, d.y + rand() * d.h, 80 + rand() * 140, '20, 40, 16', 0.1);
  },
  garden: (g, d, rand) => {
    g.fillStyle = '#44603a'; g.fillRect(d.x, d.y, d.w, d.h);
    for (let i = 0; i < 400; i++) { g.fillStyle = rand() < 0.5 ? 'rgba(160, 210, 110, 0.18)' : 'rgba(16, 40, 16, 0.22)'; g.fillRect(d.x + rand() * d.w, d.y + rand() * d.h, 2, 4); }
    for (let i = 0; i < 22; i++) blotch(g, d.x + rand() * d.w, d.y + rand() * d.h, 60 + rand() * 90, '16, 36, 14', 0.12);
  },
  mazegrass: (g, d, rand) => PAINT.garden(g, d, rand, 0),
  asphalt: (g, d, rand) => {
    g.fillStyle = '#4b4d53'; g.fillRect(d.x, d.y, d.w, d.h);
    for (let i = 0; i < 700; i++) { g.fillStyle = rand() < 0.5 ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.16)'; g.fillRect(d.x + rand() * d.w, d.y + rand() * d.h, 2, 2); }
    for (let i = 0; i < 16; i++) blotch(g, d.x + rand() * d.w, d.y + rand() * d.h, 60 + rand() * 100, '16, 16, 20', 0.12);
  },
  servicelot: (g, d, rand) => PAINT.asphalt(g, d, rand, 0),
  dock: (g, d, rand) => {
    grid(g, d, 100, '#6a6862', '#66645e', 'rgba(36, 34, 30, 0.6)', rand, 0.05);
    g.strokeStyle = 'rgba(255, 211, 77, 0.5)'; g.lineWidth = 5; g.strokeRect(d.x + 12, d.y + 12, d.w - 24, d.h - 24);
  },
  flagstone: (g, d, rand) => {
    g.fillStyle = '#58544c'; g.fillRect(d.x, d.y, d.w, d.h);
    for (let y = d.y; y < d.y + d.h; y += 100) {
      for (let x = d.x - rand() * 150; x < d.x + d.w;) {
        const w = 130 + rand() * 120, k = (rand() - 0.5) * 0.12;
        g.fillStyle = k > 0 ? `rgba(255, 244, 220, ${k})` : `rgba(14, 12, 10, ${-k * 1.6})`; g.fillRect(Math.max(x, d.x), y, Math.min(w, d.x + d.w - Math.max(x, d.x)), Math.min(100, d.y + d.h - y));
        g.fillStyle = 'rgba(28, 25, 22, 0.8)'; g.fillRect(x - 1, y, 2, 100); x += w;
      }
      g.fillStyle = 'rgba(28, 25, 22, 0.8)'; g.fillRect(d.x, y - 1, d.w, 2);
    }
  },
  yard: (g, d, rand) => PAINT.flagstone(g, d, rand, 0),
  // ---- the Residence
  ruby: (g, d) => carpet(g, d, '#5c2a33', 'rgba(224, 170, 110, 0.14)', 40),
  library: (g, d, rand, seed) => {
    g.fillStyle = herring(g, seed ^ 0x77, ['#4a321c', '#523720', '#43301a', '#5a3d24']); g.fillRect(d.x, d.y, d.w, d.h);
    g.strokeStyle = 'rgba(20, 12, 6, 0.5)'; g.lineWidth = 22; g.strokeRect(d.x, d.y, d.w, d.h);
    for (let i = 0; i < 4; i++) blotch(g, d.x + rand() * d.w, d.y + rand() * d.h, 120, '20, 12, 6', 0.1);
  },
  ballroom: (g, d, rand, seed) => {
    g.fillStyle = herring(g, seed ^ 0x55, ['#7a5c3a', '#80613e', '#745636', '#876844']); g.fillRect(d.x, d.y, d.w, d.h);
    g.strokeStyle = 'rgba(40, 26, 12, 0.5)'; g.lineWidth = 24; g.strokeRect(d.x, d.y, d.w, d.h);
    border(g, d, 16, hexA(BRASS_HI, 0.6), 3);
    // A brass star in a ring inlaid in the middle of the dance floor.
    const cx = d.x + d.w / 2, cy = d.y + d.h / 2;
    g.strokeStyle = hexA(BRASS_HI, 0.55); g.lineWidth = 4; g.beginPath(); g.arc(cx, cy, 150, 0, TAU); g.stroke();
    g.lineWidth = 2; g.beginPath(); g.arc(cx, cy, 132, 0, TAU); g.stroke();
    g.fillStyle = hexA(BRASS_HI, 0.4); star(g, cx, cy, 128, 8, 0.4); g.fill();
    for (let i = 0; i < 5; i++) blotch(g, d.x + rand() * d.w, d.y + rand() * d.h, 120, '40, 26, 12', 0.08);
  },
  stairmarble: (g, d, rand) => {
    grid(g, d, 100, '#847a7c', '#8a8084', 'rgba(50, 40, 44, 0.7)', rand, 0.06);
    g.fillStyle = 'rgba(122, 38, 52, 0.7)'; g.fillRect(d.x + d.w / 2 - 80, d.y, 160, d.h);
    g.fillStyle = hexA(BRASS, 0.55); g.fillRect(d.x + d.w / 2 - 80, d.y, 4, d.h); g.fillRect(d.x + d.w / 2 + 76, d.y, 4, d.h);
  },
  dining: (g, d, rand, seed) => {
    carpet(g, d, '#5a272c', 'rgba(224, 180, 110, 0.15)', 50);
    g.strokeStyle = 'rgba(30, 14, 10, 0.6)'; g.lineWidth = 24; g.strokeRect(d.x, d.y, d.w, d.h);
    void rand; void seed;
  },
  archive: (g, d, rand) => {
    grid(g, d, 100, '#6c6e6a', '#686a66', 'rgba(30, 32, 30, 0.6)', rand, 0.05);
    g.fillStyle = 'rgba(255, 211, 77, 0.4)'; for (let x = d.x + 100; x < d.x + d.w; x += 200) g.fillRect(x - 2, d.y, 4, d.h);
    g.fillStyle = 'rgba(20, 22, 20, 0.5)'; for (let i = 0; i < 40; i++) g.fillRect(d.x + rand() * d.w, d.y + rand() * d.h, 6 + rand() * 20, 2);
  },
  conservatory: (g, d, rand) => {
    grid(g, d, 50, '#955f42', '#8c583d', 'rgba(50, 26, 16, 0.5)', rand, 0.08);
    for (let i = 0; i < 20; i++) blotch(g, d.x + rand() * d.w, d.y + rand() * d.h, 60 + rand() * 60, '40, 70, 30', 0.1);
  },
  portrait: (g, d, rand, seed) => {
    g.fillStyle = herring(g, seed ^ 0x13, ['#4e341f', '#563a22', '#46301b', '#5c3f26']); g.fillRect(d.x, d.y, d.w, d.h);
    g.fillStyle = 'rgba(122, 38, 52, 0.78)'; g.fillRect(d.x, d.y + d.h / 2 - 70, d.w, 140);
    g.fillStyle = hexA(BRASS, 0.5); g.fillRect(d.x, d.y + d.h / 2 - 70, d.w, 3); g.fillRect(d.x, d.y + d.h / 2 + 67, d.w, 3);
    void rand;
  },
  kitchen: (g, d, rand) => {
    grid(g, d, 50, '#8b9498', '#848d92', 'rgba(36, 42, 46, 0.5)', rand, 0.04);
    for (let i = 0; i < 40; i++) blotch(g, d.x + rand() * d.w, d.y + rand() * d.h, 30 + rand() * 40, '40, 30, 18', 0.1);
  },
  staffroom: (g, d, rand) => {
    grid(g, d, 50, '#80866c', '#7a8066', 'rgba(36, 40, 28, 0.45)', rand, 0.05);
    g.fillStyle = 'rgba(255, 211, 77, 0.5)'; g.fillRect(d.x, d.y + 12, d.w, 5);
  },
};

const regionOf = (d: Rect) => ({ x: d.x, y: d.y, w: d.w, h: d.h });

/** A gravel path or aisle: pale pebbles on the lawn, with two darker edges. */
function gravel(g: G, r: Rect, rand: Rand, tone = '#8a8272') {
  g.fillStyle = tone; g.fillRect(r.x, r.y, r.w, r.h);
  for (let i = 0; i < (r.w * r.h) / 90; i++) { g.fillStyle = rand() < 0.5 ? 'rgba(255,248,228,0.22)' : 'rgba(30,26,20,0.28)'; g.fillRect(r.x + rand() * r.w, r.y + rand() * r.h, 2, 2); }
  g.fillStyle = 'rgba(16, 36, 14, 0.4)';
  if (r.w < r.h) { g.fillRect(r.x, r.y, 3, r.h); g.fillRect(r.x + r.w - 3, r.y, 3, r.h); } else { g.fillRect(r.x, r.y, r.w, 3); g.fillRect(r.x, r.y + r.h - 3, r.w, 3); }
}

/** The garden's gravel aisles and the gaps between hedges; drawn for the west half and then turned for the maze. */
function gardenPaths(g: G, rand: Rand) {
  for (const x of [50, 350, 650]) gravel(g, { x, y: 50, w: x === 650 ? 150 : 200, h: 2550 }, rand, '#82796a');
  for (const [x, a, b] of HEDGE_RUNS) void [x, a, b];
  const gaps: [number, number][] = [[250, 700], [250, 1500], [250, 2200], [550, 300], [550, 1100], [550, 1900]];
  for (const [x, y] of gaps) gravel(g, { x, y, w: 100, h: y === 700 || y === 1500 || y === 2200 ? 200 : 200 }, rand, '#82796a');
  // A round bed of roses at the head of the aisle.
  for (const [x, y] of [[150, 300], [450, 2500]] as const) { g.fillStyle = '#3a2a1c'; g.beginPath(); g.arc(x, y, 38, 0, TAU); g.fill(); for (let i = 0; i < 14; i++) { g.fillStyle = ['#b03a48', '#d8d0c0', '#c85a6a'][i % 3]!; g.beginPath(); g.arc(x + Math.cos(i * 2.4) * (8 + (i % 4) * 7), y + Math.sin(i * 2.4) * (8 + (i % 4) * 7), 4, 0, TAU); g.fill(); } }
}

function turned(g: G, size: number, draw: () => void) { g.save(); g.translate(size, size); g.rotate(Math.PI); draw(); g.restore(); }

function atriumFloor(g: G, rand: Rand) {
  const { x: cx, y: cy } = ATRIUM;
  // A disc of pale marble, four quadrants of two tones, then the emblem laid in brass, navy and cream.
  g.save(); g.beginPath(); g.arc(cx, cy, ATRIUM.rIn + 20, 0, TAU); g.clip();
  g.fillStyle = '#7d786c'; g.fillRect(cx - 420, cy - 420, 840, 840);
  for (let k = 0; k < 16; k++) { g.fillStyle = k & 1 ? 'rgba(255, 244, 220, 0.05)' : 'rgba(0, 0, 0, 0.06)'; g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, 440, (k / 16) * TAU, ((k + 1) / 16) * TAU); g.closePath(); g.fill(); }
  for (let i = 0; i < 30; i++) { g.strokeStyle = 'rgba(52, 48, 42, 0.25)'; g.lineWidth = 1.2; const sx = cx - 380 + rand() * 760, sy = cy - 380 + rand() * 760; g.beginPath(); g.moveTo(sx, sy); g.quadraticCurveTo(sx + (rand() - 0.5) * 90, sy + (rand() - 0.5) * 90, sx + (rand() - 0.5) * 120, sy + (rand() - 0.5) * 120); g.stroke(); }
  g.restore();
  // Outer ring: a navy band with brass stars and the republic's name.
  g.fillStyle = 'rgba(31, 42, 76, 0.85)'; g.beginPath(); g.arc(cx, cy, 340, 0, TAU); g.arc(cx, cy, 276, 0, TAU, true); g.fill();
  g.strokeStyle = hexA(BRASS, 0.85); g.lineWidth = 4; for (const r of [340, 276, 346]) { g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.stroke(); }
  g.fillStyle = hexA(BRASS_HI, 0.8);
  for (let k = 0; k < 24; k++) { const a = (k / 24) * TAU; if (a > 0.9 && a < 2.25) continue; if (a > 3.9 && a < 5.3) continue; star(g, cx + Math.cos(a) * 308, cy + Math.sin(a) * 308, 9); g.fill(); }
  ringText(g, 'REPUBLIC OF CORVANIA', cx, cy, 310, -Math.PI / 2, 26, hexA(CREAM, 0.9));
  ringText(g, 'FIDELITAS ET CONCORDIA', cx, cy, 310, Math.PI / 2, 26, hexA(CREAM, 0.9));
  // The emblem itself, under zone B: a great star in a laurel ring.
  seal(g, cx, cy, 255, { alpha: 0.95 });
  g.strokeStyle = 'rgba(14, 12, 10, 0.5)'; g.lineWidth = 3; g.beginPath(); g.arc(cx, cy, 351, 0, TAU); g.stroke();
}

/** A lawn's red carpet from the limousine to the lobby's glass, with a velvet-rope margin and a gold edging. */
function redCarpet(g: G) {
  g.fillStyle = 'rgba(122, 28, 40, 0.88)'; g.fillRect(1900, 4290, 140, 700);
  g.fillStyle = hexA(BRASS, 0.75); g.fillRect(1900, 4290, 4, 700); g.fillRect(2036, 4290, 4, 700);
  g.fillStyle = 'rgba(122, 28, 40, 0.88)'; g.fillRect(1900, 4990, 140, 12);
  g.beginPath(); g.moveTo(1900, 4990); g.lineTo(2040, 4990); g.quadraticCurveTo(2000, 5150, 2120, 5300); g.lineTo(1990, 5300); g.quadraticCurveTo(1900, 5150, 1900, 4990); g.fill();
  g.fillStyle = 'rgba(255, 220, 160, 0.08)'; for (let y = 4310; y < 4990; y += 36) g.fillRect(1912, y, 116, 3);
}

function drivePaint(g: G, rand: Rand) {
  // The drive: a ring of dark tarmac round the fountain and a straight run to the staging gate.
  g.fillStyle = '#4c4e54';
  g.beginPath(); g.arc(FOUNTAIN.x, FOUNTAIN.y, 460, 0, TAU); g.arc(FOUNTAIN.x, FOUNTAIN.y, 360, 0, TAU, true); g.fill();
  g.fillRect(560, 5200, 2440, 360);
  g.fillRect(560, 5560, 300, 60);
  for (let i = 0; i < 900; i++) { g.fillStyle = rand() < 0.5 ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.18)'; g.fillRect(560 + rand() * 2440, 5200 + rand() * 360, 2, 2); }
  g.strokeStyle = 'rgba(232, 220, 190, 0.55)'; g.lineWidth = 5; g.setLineDash([46, 34]); g.beginPath(); g.moveTo(600, 5380); g.lineTo(3000, 5380); g.stroke(); g.setLineDash([]);
  g.strokeStyle = 'rgba(232, 220, 190, 0.5)'; g.lineWidth = 4; g.beginPath(); g.arc(FOUNTAIN.x, FOUNTAIN.y, 410, 0, TAU); g.stroke();
  // Kerbs in pale stone.
  g.strokeStyle = 'rgba(190, 184, 166, 0.7)'; g.lineWidth = 6; g.beginPath(); g.arc(FOUNTAIN.x, FOUNTAIN.y, 462, 0, TAU); g.stroke(); g.beginPath(); g.arc(FOUNTAIN.x, FOUNTAIN.y, 358, 0, TAU); g.stroke();
  g.fillStyle = 'rgba(190, 184, 166, 0.5)'; g.fillRect(560, 5196, 2440, 5); g.fillRect(560, 5560, 2440, 5);
  for (const v of VEHICLES) { stain(g, v.x + 10, v.y + 10, 150, 56, '10, 10, 14', 0.22, v.rot); }
}

function paintLabels(g: G) {
  // Names painted where you walk them: brass inlay indoors, paint on the paving outside.
  const inlay = (text: string, x: number, y: number, size: number, rot = 0, color = BRASS_HI, alpha = 0.55) => lettering(g, text, x, y, size, color, { rot, alpha, spacing: 0.26 });
  const paint = (text: string, x: number, y: number, size: number, rot = 0, alpha = 0.55) => lettering(g, text, x, y, size, '#e8dfc6', { rot, alpha, spacing: 0.3, shadow: false });
  for (const west of [true, false]) {
    const T = (x: number, y: number) => (west ? { x, y } : { x: 6000 - x, y: 6000 - y });
    const R = 0;
    const name = (id: string) => DISTRICTS.find((d) => d.id === id)!.name;
    const at = (x: number, y: number) => T(x, y);
    const put = (kind: 'inlay' | 'paint', id: string, x: number, y: number, size: number, rot = 0) => { const p = at(x, y); (kind === 'inlay' ? inlay : paint)(west ? name(id) : name(id), p.x, p.y, size, rot + R); };
    if (west) {
      put('inlay', 'flaggallery', 1640, 2850, 30); put('inlay', 'lobby', 1700, 3180, 30); put('paint', 'checkpoint', 1690, 4075, 16);
      put('paint', 'drive', 1500, 5640, 34); put('paint', 'staging', 340, 5500, 26); put('paint', 'lawn', 2500, 4400, 36);
      put('paint', 'westcourt', 430, 3215, 22); put('paint', 'northterrace', 3000, 2150, 24); put('paint', 'steps', 2780, 3550, 22);
    } else {
      put('inlay', 'portraits', 1640, 2850, 30); put('inlay', 'kitchen', 1700, 3180, 30); put('paint', 'staff', 1690, 4075, 16);
      put('paint', 'dock', 1500, 5640, 34); put('paint', 'servicegate', 340, 5500, 26); put('paint', 'servicelot', 2500, 4400, 36);
      put('paint', 'eastcourt', 430, 3215, 22); put('paint', 'southterrace', 3000, 2150, 24); put('paint', 'backsteps', 2780, 3550, 22);
    }
  }
  lettering(g, 'ATRIUM', 2870, 3000 + 440, 26, BRASS_HI, { alpha: 0.5, spacing: 0.4 });
}

function parkingLines(g: G, west: boolean) {
  // Painted bays: the staff car park of the Service Lot (the half turn of the motorcade's lawn), and the valet's bays on the drive.
  g.strokeStyle = 'rgba(232, 220, 190, 0.5)'; g.lineWidth = 4;
  if (west) { for (let x = 1100; x <= 3000; x += 120) { g.beginPath(); g.moveTo(x, 5620); g.lineTo(x, 5900); g.stroke(); } }
  else { for (let x = 1100; x <= 3000; x += 120) { g.beginPath(); g.moveTo(6000 - x, 380); g.lineTo(6000 - x, 100); g.stroke(); } }
}

export function paintEmbassyFloor(g: G, size: number, seed: number, plan: FloorPlan) {
  const rand = seeded(seed ^ 0xe3b);
  PAINT.flagstone(g, regionOf(GROUNDS), rand, seed);
  const herringTone = seed;
  // Biggest first, so every room paints over the building that holds it.
  for (const d of [...DISTRICTS].reverse()) {
    g.save(); g.beginPath(); g.rect(d.x, d.y, d.w, d.h); g.clip();
    PAINT[d.floor](g, d, rand, herringTone);
    g.restore();
  }
  // The gardens' gravel aisles (north west) and their half turn, the maze.
  gardenPaths(g, rand);
  turned(g, size, () => gardenPaths(g, rand));
  drivePaint(g, rand);
  turned(g, size, () => drivePaint(g, rand));
  redCarpet(g);
  turned(g, size, () => redCarpet(g));
  parkingLines(g, true); parkingLines(g, false);
  atriumFloor(g, rand);

  // Corridor runners: navy with a brass-pinned edge in the Office Wing, crimson with a gold edge in the Residence.
  const runner = (x: number, y: number, w: number, h: number, alongX: boolean, colour: string, line: string) => {
    g.fillStyle = colour; g.fillRect(x, y, w, h); g.fillStyle = line;
    if (alongX) { g.fillRect(x, y + 6, w, 3); g.fillRect(x, y + h - 9, w, 3); } else { g.fillRect(x + 6, y, 3, h); g.fillRect(x + w - 9, y, 3, h); }
  };
  const runners = (colour: string, line: string) => {
    runner(1880, 100, 140, 2450, false, colour, line);
    runner(850, 790, 1900, 120, true, colour, line);
    runner(850, 1790, 1900, 120, true, colour, line);
  };
  runners('rgba(70, 96, 150, 0.55)', 'rgba(224, 200, 130, 0.4)');
  turned(g, size, () => runners('rgba(122, 28, 40, 0.8)', hexA(BRASS, 0.55)));
  // Long flag-gallery runner and a lobby carpet.
  g.fillStyle = 'rgba(31, 42, 76, 0.7)'; g.fillRect(850, 2810, 1740, 80); g.fillStyle = hexA(BRASS, 0.55); g.fillRect(850, 2810, 1740, 3); g.fillRect(850, 2887, 1740, 3);
  turned(g, size, () => { g.fillStyle = 'rgba(31, 42, 76, 0.7)'; g.fillRect(850, 2810, 1740, 80); g.fillStyle = hexA(BRASS, 0.55); g.fillRect(850, 2810, 1740, 3); g.fillRect(850, 2887, 1740, 3); });
  paintLabels(g);

  // A wash of each district's light, so the colour of a room tells you where you are.
  for (const d of DISTRICTS) { if (d.id === 'wing' || d.id === 'residence' || d.id === 'lawn' || d.id === 'servicelot') continue; g.fillStyle = `rgba(${d.light}, 0.045)`; g.fillRect(d.x, d.y, d.w, d.h); }
  for (const z of plan.zones) blotch(g, z.x, z.y, 320, '255, 236, 200', 0.1);
  for (const p of plan.pads) blotch(g, p.x + p.w / 2, p.y + p.h / 2, 220 + Math.max(p.w, p.h) * 0.4, '255, 226, 170', 0.07);

  paintDecor(g, rand);

  // Spawn pads: team tinted, edged in brass and hazard yellow.
  for (const [i, pad] of plan.pads.entries()) {
    const tint = pad.team === 'red' ? FLOOR.red : pad.team === 'blue' ? FLOOR.blue : '#20242c';
    g.globalAlpha = 0.2; g.fillStyle = tint; g.fillRect(pad.x, pad.y, pad.w, pad.h);
    g.globalAlpha = 0.7; g.strokeStyle = BRASS; g.lineWidth = 4; g.strokeRect(pad.x - 2, pad.y - 2, pad.w + 4, pad.h + 4);
    g.lineWidth = 2; g.strokeRect(pad.x + 8, pad.y + 8, pad.w - 16, pad.h - 16);
    g.globalAlpha = 0.75; g.fillStyle = pad.team ? tint : BRASS;
    const arm = Math.min(40, pad.w / 2, pad.h / 2), t = 6;
    for (const [px, py, sx, sy] of [[pad.x, pad.y, 1, 1], [pad.x + pad.w, pad.y, -1, 1], [pad.x, pad.y + pad.h, 1, -1], [pad.x + pad.w, pad.y + pad.h, -1, -1]] as const) { g.fillRect(Math.min(px, px + sx * arm), Math.min(py, py + sy * t), arm, t); g.fillRect(Math.min(px, px + sx * t), Math.min(py, py + sy * arm), t, arm); }
    g.globalAlpha = 0.55; g.fillStyle = '#e8dfc6';
    const text = pad.team === 'red' ? `A${(i % 9) + 1}` : pad.team === 'blue' ? `b${(i % 9) + 1}` : `P${(i % 9) + 1}`;
    const th = Math.min(30, pad.h * 0.4, pad.w * 0.5);
    if (th >= 16) stencil(g, text, pad.x + pad.w / 2 - (text.length * (th * 0.52 + th * 0.24)) / 2, pad.y + pad.h / 2 - th / 2, th);
    g.globalAlpha = 1;
  }
  for (const z of plan.zones) {
    const r = plan.zoneRadius;
    g.globalAlpha = 0.16; g.fillStyle = '#16181d'; g.beginPath(); g.arc(z.x, z.y, r - 6, 0, TAU); g.fill();
    g.globalAlpha = 0.65; g.fillStyle = BRASS;
    for (let k = 0; k < 24; k++) { const a0 = (k / 24) * TAU + 0.03, a1 = ((k + 0.62) / 24) * TAU; g.beginPath(); g.arc(z.x, z.y, r + 12, a0, a1); g.arc(z.x, z.y, r + 22, a1, a0, true); g.closePath(); g.fill(); }
    g.globalAlpha = 1;
  }
  const rim = 150;
  for (const [x0, y0, x1, y1, rx, ry, rw, rh] of [
    [0, 0, 0, rim, 0, 0, size, rim], [0, size, 0, size - rim, 0, size - rim, size, rim],
    [0, 0, rim, 0, 0, 0, rim, size], [size, 0, size - rim, 0, size - rim, 0, rim, size],
  ] as const) {
    const grad = g.createLinearGradient(x0, y0, x1, y1);
    grad.addColorStop(0, 'rgba(16, 14, 12, 0.45)'); grad.addColorStop(0.35, 'rgba(16, 14, 12, 0.16)'); grad.addColorStop(1, 'rgba(16, 14, 12, 0)');
    g.fillStyle = grad; g.fillRect(rx, ry, rw, rh);
  }
  void NAVY; void INK;
}
