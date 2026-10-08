import type { FloorPlan } from '../floor.ts';
import { blotch, canvas, seeded, speckle } from '../grain.ts';
import { C, hash, MID, SIZE, TAU, TRACKS, type Pt } from './railyardkit.ts';

/**
 * The Rail Yard's ground, baked once: dark cinder and cobble, ballast and rails, paved platforms with their white edges,
 * the big tiled concourse, and a different floor in each twin room. The north-west half is painted and then painted again
 * turned (so the geometry is exact); only lettering is kept upright. Everything is low contrast so players pop.
 */
type G = CanvasRenderingContext2D;
type Rc = readonly [number, number, number, number];

/** Runs `fn` once as drawn and once turned half a turn about the centre, with `turned` set. */
function halves(g: G, fn: (turned: boolean) => void) {
  fn(false);
  g.save(); g.translate(SIZE, SIZE); g.rotate(Math.PI);
  fn(true);
  g.restore();
}
/** Upright lettering at a point given in the current (maybe turned) frame. */
function label(g: G, turned: boolean, text: string, x: number, y: number, font: string, fill: string, spacing = 0) {
  g.save(); g.translate(x, y); if (turned) g.rotate(Math.PI);
  g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = fill;
  (g as unknown as { letterSpacing: string }).letterSpacing = `${spacing}px`;
  g.fillText(text, 0, 0);
  g.restore();
}
const hexA = (hex: string, a: number) => { const v = parseInt(hex.slice(1), 16); return `rgba(${(v >> 16) & 255}, ${(v >> 8) & 255}, ${v & 255}, ${a})`; };

/* ---------------------------------------------------------------- tiles */
function tileOf(kind: 'terrazzo' | 'encaustic' | 'slabs' | 'checker' | 'parquet' | 'lino' | 'boards' | 'setts' | 'flags' | 'oil'): CanvasPattern | null {
  const S = kind === 'setts' ? 64 : kind === 'slabs' ? 200 : 100;
  const [c, p] = canvas(S);
  const r = seeded(kind.length * 31 + 7);
  const fill = (col: string, x = 0, y = 0, w = S, h = S) => { p.fillStyle = col; p.fillRect(x, y, w, h); };
  switch (kind) {
    case 'terrazzo': fill('#9a9484'); for (let i = 0; i < 90; i++) { p.fillStyle = ['#c9c2ae', '#6f6a5c', '#7d8a72', '#a8604a'][Math.floor(r() * 4)]!; p.globalAlpha = 0.5; p.fillRect(r() * S, r() * S, 2 + r() * 3, 2 + r() * 2); } p.globalAlpha = 1; p.strokeStyle = 'rgba(30, 28, 24, 0.5)'; p.strokeRect(0.5, 0.5, S - 1, S - 1); break;
    case 'encaustic': fill('#6b4b42'); p.fillStyle = '#76594e'; p.fillRect(8, 8, 84, 84); p.fillStyle = '#566a5d'; p.beginPath(); p.moveTo(50, 12); p.lineTo(88, 50); p.lineTo(50, 88); p.lineTo(12, 50); p.closePath(); p.fill(); p.fillStyle = '#76594e'; p.beginPath(); p.moveTo(50, 28); p.lineTo(72, 50); p.lineTo(50, 72); p.lineTo(28, 50); p.closePath(); p.fill(); p.fillStyle = '#8a7548'; p.beginPath(); p.arc(50, 50, 5, 0, TAU); p.fill(); p.strokeStyle = 'rgba(20, 14, 10, 0.3)'; p.lineWidth = 2; p.strokeRect(1, 1, S - 2, S - 2); break;
    case 'slabs': fill('#6a5750'); for (let i = 0; i < 40; i++) { p.fillStyle = r() < 0.5 ? 'rgba(255, 250, 235, 0.025)' : 'rgba(10, 8, 6, 0.04)'; p.fillRect(r() * S, r() * S, 30 + r() * 40, 20 + r() * 30); } p.strokeStyle = 'rgba(24, 16, 12, 0.35)'; p.lineWidth = 2; p.strokeRect(1, 1, S - 2, S - 2); break;
    case 'checker': fill('#d4cfc0'); p.fillStyle = '#2c2a2e'; p.fillRect(0, 0, 50, 50); p.fillRect(50, 50, 50, 50); break;
    case 'parquet': fill('#7a5a38'); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { p.fillStyle = (i + j) % 2 ? '#8a6842' : '#6a4c2e'; if ((i + j) % 2) p.fillRect(i * 25 + 1, j * 25 + 1, 23, 11); else p.fillRect(i * 25 + 1, j * 25 + 1, 11, 23); } p.strokeStyle = 'rgba(20, 12, 4, 0.5)'; p.lineWidth = 1; p.strokeRect(0.5, 0.5, S - 1, S - 1); break;
    case 'lino': fill('#5f7a68'); p.fillStyle = '#6a8672'; p.fillRect(0, 0, 50, 50); p.fillRect(50, 50, 50, 50); p.strokeStyle = 'rgba(10, 20, 14, 0.35)'; p.strokeRect(0.5, 0.5, S - 1, S - 1); break;
    case 'boards': fill('#6b4e30'); for (let i = 0; i < 6; i++) { p.fillStyle = ['#7a5a38', '#634730', '#70523a'][Math.floor(r() * 3)]!; p.fillRect(0, i * 17, S, 16); } p.fillStyle = 'rgba(10, 6, 2, 0.45)'; for (let i = 1; i < 7; i++) p.fillRect(0, i * 17 - 1, S, 1.5); break;
    case 'setts': fill('#5a5750'); for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) { const k = r(); p.fillStyle = k < 0.33 ? '#6c6a62' : k < 0.66 ? '#4c4a44' : '#605d55'; p.beginPath(); p.ellipse(i * 16 + 8 + (j % 2) * 8, j * 16 + 8, 7, 6.5, 0, 0, TAU); p.fill(); } break;
    case 'flags': fill('#6f6a5f'); p.strokeStyle = 'rgba(30, 28, 24, 0.55)'; p.lineWidth = 1.5; p.strokeRect(0.5, 0.5, S - 1, S - 1); for (let i = 0; i < 4; i++) { p.fillStyle = r() < 0.5 ? 'rgba(255, 250, 230, 0.05)' : 'rgba(10, 12, 16, 0.08)'; p.fillRect(r() * S, r() * S, 40, 30); } break;
    case 'oil': fill('#3b3a3c'); for (let i = 0; i < 18; i++) { p.fillStyle = 'rgba(8, 8, 12, 0.35)'; p.beginPath(); p.ellipse(r() * S, r() * S, 4 + r() * 12, 3 + r() * 8, r() * 3, 0, TAU); p.fill(); } p.strokeStyle = 'rgba(20, 20, 24, 0.5)'; p.strokeRect(0.5, 0.5, S - 1, S - 1); break;
  }
  return c.getContext('2d')!.createPattern(c, 'repeat');
}
function patch(g: G, kind: Parameters<typeof tileOf>[0], r: Rc, edge = true) {
  const t = tileOf(kind);
  g.fillStyle = t ?? '#666'; g.fillRect(r[0], r[1], r[2] - r[0], r[3] - r[1]);
  if (edge) { g.strokeStyle = C.ink; g.lineWidth = 2; g.strokeRect(r[0], r[1], r[2] - r[0], r[3] - r[1]); }
}

/* --------------------------------------------------------------- tracks */
function trackPath(g: G, pts: readonly Pt[]) { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); }
function offsetPts(pts: readonly Pt[], d: number): Pt[] {
  return pts.map(([x, y], i) => {
    const a = pts[Math.max(0, i - 1)]!, b = pts[Math.min(pts.length - 1, i + 1)]!;
    const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
    return [x - (dy / l) * d, y + (dx / l) * d] as Pt;
  });
}
function smooth(pts: readonly Pt[]): Pt[] {
  // Fillet corners so a track curves.
  const out: Pt[] = [pts[0]!];
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i]!, a = pts[i - 1]!, b = pts[i + 1]!;
    const la = Math.hypot(p[0] - a[0], p[1] - a[1]), lb = Math.hypot(b[0] - p[0], b[1] - p[1]);
    const k = Math.min(160, la / 2, lb / 2);
    const p0: Pt = [p[0] + ((a[0] - p[0]) / la) * k, p[1] + ((a[1] - p[1]) / la) * k], p1: Pt = [p[0] + ((b[0] - p[0]) / lb) * k, p[1] + ((b[1] - p[1]) / lb) * k];
    for (let t = 0; t <= 8; t++) { const u = t / 8; out.push([(1 - u) * (1 - u) * p0[0] + 2 * u * (1 - u) * p[0] + u * u * p1[0], (1 - u) * (1 - u) * p0[1] + 2 * u * (1 - u) * p[1] + u * u * p1[1]]); }
  }
  out.push(pts[pts.length - 1]!);
  return out;
}
function drawTrack(g: G, raw: readonly Pt[], buffer: string | undefined, turned: boolean) {
  const pts = smooth(raw);
  g.lineCap = 'butt'; g.lineJoin = 'round';
  g.strokeStyle = 'rgba(10, 10, 12, 0.3)'; g.lineWidth = 150; trackPath(g, pts); g.stroke();
  g.strokeStyle = turned ? '#524f4a' : C.ballast; g.lineWidth = 128; trackPath(g, pts); g.stroke();
  g.strokeStyle = C.ballastLo; g.lineWidth = 118; g.globalAlpha = 0.35; trackPath(g, pts); g.stroke(); g.globalAlpha = 1;
  // Sleepers.
  let carry = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const [x0, y0] = pts[i]!, [x1, y1] = pts[i + 1]!, len = Math.hypot(x1 - x0, y1 - y0), a = Math.atan2(y1 - y0, x1 - x0);
    for (let d = carry; d < len; d += 26) {
      const x = x0 + Math.cos(a) * d, y = y0 + Math.sin(a) * d;
      g.save(); g.translate(x, y); g.rotate(a);
      g.fillStyle = hash(Math.round(x), Math.round(y)) < 0.5 ? C.sleeper : '#3c2d1e'; g.fillRect(-4.5, -40, 9, 80);
      g.restore();
      carry = d + 26 - len;
    }
  }
  // Rails: a dark foot, a bright head.
  for (const d of [-28, 28]) {
    const o = offsetPts(pts, d);
    g.strokeStyle = 'rgba(8, 8, 10, 0.7)'; g.lineWidth = 8; trackPath(g, o); g.stroke();
    g.strokeStyle = turned ? '#7a6048' : C.rail; g.lineWidth = 4.5; trackPath(g, o); g.stroke();
    g.strokeStyle = turned ? '#a08060' : C.railHi; g.lineWidth = 1.4; trackPath(g, offsetPts(pts, d - 1)); g.stroke();
  }
  if (buffer === 'start' || buffer === 'both') bufferStop(g, pts[0]!, pts[1]!);
  if (buffer === 'end' || buffer === 'both') bufferStop(g, pts[pts.length - 1]!, pts[pts.length - 2]!);
}
function bufferStop(g: G, p: Pt, q: Pt) {
  const a = Math.atan2(q[1] - p[1], q[0] - p[0]);
  g.save(); g.translate(p[0], p[1]); g.rotate(a);
  g.fillStyle = C.timberLo; g.fillRect(-26, -46, 22, 92); g.strokeStyle = C.ink; g.lineWidth = 2; g.strokeRect(-26, -46, 22, 92);
  g.fillStyle = C.red; for (const y of [-30, 30]) { g.beginPath(); g.arc(-8, y, 7, 0, TAU); g.fill(); g.stroke(); }
  g.restore();
}

/* ------------------------------------------------------------ platforms */
/** Platform surfaces, north-west half as [x0, y0, x1, y1]; the track edge is the long side that faces a track band. */
const PLATFORMS: readonly { r: Rc; edge: 'n' | 's' | 'both'; num: string }[] = [
  { r: [1450, 400, 3500, 700], edge: 's', num: '1' },
  { r: [1450, 900, 3500, 1200], edge: 'both', num: '2' },
  { r: [1450, 1400, 3500, 1700], edge: 'both', num: '3' },
  { r: [1450, 1900, 3500, 2200], edge: 'n', num: '4' },
];
const NUMS_B = ['5', '6', '7', '8'];
function platform(g: G, p: (typeof PLATFORMS)[number], i: number, turned: boolean) {
  const [x0, y0, x1, y1] = p.r, w = x1 - x0;
  const t = tileOf(turned ? 'setts' : 'flags');
  g.fillStyle = 'rgba(8, 8, 10, 0.35)'; g.fillRect(x0 - 6, y0 - 8, w + 12, y1 - y0 + 20);
  g.fillStyle = t ?? '#6f6a5f'; g.fillRect(x0, y0, w, y1 - y0);
  g.fillStyle = 'rgba(20, 16, 12, 0.12)'; for (let x = x0 + 100; x < x1; x += 100) g.fillRect(x - 1, y0, 2, y1 - y0);
  // White edge and yellow tactile strip along the track side.
  const edge = (yy: number, dir: 1 | -1) => {
    g.fillStyle = '#c8c3b2'; g.fillRect(x0, dir > 0 ? yy - 10 : yy, w, 10);
    g.fillStyle = C.brass; for (let x = x0; x < x1; x += 14) g.fillRect(x, dir > 0 ? yy - 34 : yy + 14, 9, 14);
    g.strokeStyle = C.ink; g.lineWidth = 2; g.beginPath(); g.moveTo(x0, yy); g.lineTo(x1, yy); g.stroke();
  };
  if (p.edge === 's' || p.edge === 'both') edge(y1, 1);
  if (p.edge === 'n' || p.edge === 'both') edge(y0, -1);
  g.strokeStyle = C.ink; g.lineWidth = 2; g.strokeRect(x0, y0, w, y1 - y0);
  // The platform's number, stencilled big and faint, at both ends.
  const num = (turned ? NUMS_B : ['1', '2', '3', '4'])[i]!;
  for (const x of [x0 + 160, x1 - 160]) label(g, turned, num, x, (y0 + y1) / 2, '800 120px "Barlow Condensed", Impact, sans-serif', 'rgba(232, 224, 200, 0.2)');
  label(g, turned, `PLATFORM ${num}`, x0 + w / 2 + (i % 2 ? 300 : -300), (y0 + y1) / 2 + (p.edge === 'n' ? 80 : p.edge === 's' ? -80 : 0), '700 26px "Barlow Condensed", sans-serif', 'rgba(232, 224, 200, 0.22)', 6);
}

/* ------------------------------------------------------------ the floor */
function floor(g: G, size: number, seed: number, plan: FloorPlan) {
  const rand = seeded(seed ^ 0x7a11);
  g.fillStyle = '#4a4742'; g.fillRect(0, 0, size, size);
  const area = (size * size) / 1_000_000;
  for (let i = 0; i < 90 * area; i++) blotch(g, rand() * size, rand() * size, 100 + rand() * 260, rand() < 0.5 ? '20, 20, 22' : '120, 108, 90', 0.05 + rand() * 0.06);
  speckle(g, rand, size, 3600 * area, '#1f1e1f', '#8a8478');

  // Cinder yards: darker, sooty, coal-dusted ground in the freight and marshalling yards.
  halves(g, () => {
    for (const [x0, y0, x1, y1] of [[3500, 0, 5700, 1000], [3500, 1000, 5700, 3000]] as const) {
      g.fillStyle = 'rgba(20, 20, 22, 0.28)'; g.fillRect(x0, y0, x1 - x0, y1 - y0);
      for (let i = 0; i < 420; i++) { g.fillStyle = hash(i, x0, 5) < 0.6 ? '#1c1c20' : '#6a6c78'; g.globalAlpha = 0.5; g.fillRect(x0 + hash(i, 1, x0) * (x1 - x0), y0 + hash(i, 2, y0) * (y1 - y0), 3 + hash(i, 3) * 4, 2 + hash(i, 4) * 3); }
      g.globalAlpha = 1;
    }
  });
  // Cab roads: setts along both side edges, with a kerb toward the buildings.
  halves(g, () => {
    g.fillStyle = tileOf('setts') ?? '#5a5750'; g.fillRect(0, 0, 300, SIZE);
    g.fillStyle = C.ballastHi; g.fillRect(292, 0, 8, SIZE);
    g.strokeStyle = C.ink; g.lineWidth = 2; g.beginPath(); g.moveTo(300, 0); g.lineTo(300, SIZE); g.stroke();
    g.strokeStyle = 'rgba(232, 224, 200, 0.45)'; g.lineWidth = 5; g.setLineDash([60, 50]); g.beginPath(); g.moveTo(150, 0); g.lineTo(150, SIZE); g.stroke(); g.setLineDash([]);
  });

  // Level crossing road: asphalt across the centre with a dashed line and a zebra either side of the rails.
  g.fillStyle = '#3a3a3e'; g.fillRect(2850, 2200, 300, 1600);
  g.fillStyle = 'rgba(255, 255, 255, 0.04)'; for (let i = 0; i < 300; i++) g.fillRect(2850 + hash(i, 1) * 300, 2200 + hash(i, 2) * 1600, 3, 2);
  g.strokeStyle = 'rgba(232, 224, 200, 0.5)'; g.lineWidth = 5; g.setLineDash([46, 40]); g.beginPath(); g.moveTo(3000, 2200); g.lineTo(3000, 3800); g.stroke(); g.setLineDash([]);
  g.fillStyle = C.ballastHi; g.fillRect(2840, 2200, 10, 1600); g.fillRect(3150, 2200, 10, 1600);
  g.strokeStyle = C.ink; g.lineWidth = 2; g.strokeRect(2850, 2200, 300, 1600);

  halves(g, (turned) => {
    // Interiors.
    patch(g, turned ? 'lino' : 'terrazzo', [350, 250, 1400, 850], false);
    patch(g, turned ? 'boards' : 'slabs', [350, 900, 1400, 2150], false);
    if (!turned) {
      // The tile motif lives only in a border band round the hall and in a ring round the compass rose; the rest is quiet slab.
      const mot = tileOf('encaustic');
      g.save(); g.fillStyle = mot ?? '#6b4b42';
      g.beginPath(); g.rect(350, 900, 1050, 1250); g.rect(460, 1010, 830, 1030); g.fill('evenodd');
      g.beginPath(); g.arc(875, 1525, 330, 0, TAU); g.arc(875, 1525, 205, 0, TAU, true); g.fill('evenodd');
      g.restore();
    }
    patch(g, turned ? 'lino' : 'parquet', [350, 2200, 800, 2800], false);
    patch(g, turned ? 'lino' : 'checker', [850, 2200, 1400, 2800], false);
    g.fillStyle = 'rgba(8, 10, 16, 0.2)'; g.fillRect(350, 250, 1050, 2550);
    // The concourse medallion at the zone.
    g.save(); g.translate(875, 1525);
    g.fillStyle = turned ? 'rgba(20, 14, 8, 0.35)' : C.brickDeep; g.beginPath(); g.arc(0, 0, 215, 0, TAU); g.fill();
    g.fillStyle = turned ? '#6a5236' : '#a39a84'; g.beginPath(); g.arc(0, 0, 200, 0, TAU); g.fill();
    g.strokeStyle = C.brass; g.lineWidth = 5; for (const r of [196, 150]) { g.beginPath(); g.arc(0, 0, r, 0, TAU); g.stroke(); }
    for (let i = 0; i < 16; i++) { g.save(); g.rotate((i * TAU) / 16); g.fillStyle = i % 4 === 0 ? (turned ? '#8a6a3e' : C.brick) : (turned ? '#7a5a38' : '#2f4a3c'); g.beginPath(); g.moveTo(0, -150); g.lineTo(i % 4 === 0 ? 14 : 8, -62); g.lineTo(-(i % 4 === 0 ? 14 : 8), -62); g.fill(); g.restore(); }
    g.strokeStyle = C.ink; g.lineWidth = 2.5; g.beginPath(); g.arc(0, 0, 200, 0, TAU); g.stroke();
    g.restore();
    // Brass threshold strips under each doorway of the headhouse.
    g.fillStyle = C.brassLo; for (const [x, y, w, h] of [[300, 450, 50, 150], [300, 1200, 50, 150], [300, 1700, 50, 150], [750, 850, 50, 200], [1400, 950, 50, 200], [1400, 1450, 50, 200]] as const) g.fillRect(x, y, w, h);
    g.strokeStyle = 'rgba(28, 31, 38, 0.6)'; g.lineWidth = 1.5;
    // Painted names.
    label(g, turned, turned ? 'PARCELS' : 'TICKETS', 875, 760, '700 30px "Barlow Condensed", sans-serif', 'rgba(232, 224, 200, 0.28)', 10);
    label(g, turned, turned ? 'GOODS HALL' : 'CONCOURSE', 875, 1235, '700 44px "Barlow Condensed", sans-serif', 'rgba(232, 224, 200, 0.3)', 12);
    label(g, turned, 'WAY OUT', 560, 1275, '700 22px "Barlow Condensed", sans-serif', 'rgba(232, 224, 200, 0.26)', 6);
    // Platforms.
    PLATFORMS.forEach((p, i) => platform(g, p, i, turned));
    // The shed floor under the train shed: oil and soot by the track edges.
    // Ground under the throat: a worn patch of cinder.
    blotch(g, 2200, 2500, 420, '20, 18, 16', 0.2);
  });

  // Tracks.
  halves(g, (turned) => { for (const t of TRACKS) drawTrack(g, t.pts, t.buffer, turned); });

  // Turntable pits, engine and carriage shed floors, inspection pits.
  halves(g, (turned) => {
    const cx = 4300, cy = 2200;
    g.fillStyle = 'rgba(8, 8, 10, 0.4)'; g.beginPath(); g.arc(cx, cy, 262, 0, TAU); g.fill();
    g.fillStyle = turned ? '#2e3a2c' : '#1e1d20'; g.beginPath(); g.arc(cx, cy, 250, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(120, 112, 100, 0.55)'; g.lineWidth = 3; for (const r of [230, 180, 120]) { g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.stroke(); }
    g.strokeStyle = C.rail; g.lineWidth = 4; for (const a of [0, 0.95, Math.PI]) for (const d of [-28, 28]) { g.beginPath(); g.moveTo(cx + Math.cos(a) * 20 - Math.sin(a) * d, cy + Math.sin(a) * 20 + Math.cos(a) * d); g.lineTo(cx + Math.cos(a) * 250 - Math.sin(a) * d, cy + Math.sin(a) * 250 + Math.cos(a) * d); g.stroke(); }
    if (turned) { for (let i = 0; i < 90; i++) { const a = hash(i, 5) * TAU, d = hash(i, 6) * 245; g.strokeStyle = hash(i, 7) < 0.5 ? '#4f7a3a' : '#6a8f4a'; g.lineWidth = 2; g.beginPath(); g.moveTo(cx + Math.cos(a) * d, cy + Math.sin(a) * d); g.lineTo(cx + Math.cos(a) * d + 3, cy + Math.sin(a) * d - 9); g.stroke(); } }
    // Shed floor.
    patch(g, 'oil', [4850, 1750, 5750, 2550], false);
    g.fillStyle = '#121214'; for (const y of [1850, 2100, 2350]) { g.fillRect(4850, y, 900, 50); g.strokeStyle = C.ink; g.lineWidth = 2; g.strokeRect(4850, y, 900, 50); g.fillStyle = '#121214'; }
    g.fillStyle = C.brass; for (let x = 4850; x < 5750; x += 36) for (const y of [1850, 2100, 2350]) g.fillRect(x, y + 3, 14, 3);
    g.fillStyle = 'rgba(8, 8, 10, 0.18)'; g.fillRect(4850, 1750, 900, 800);
    // Goods office floor.
    patch(g, turned ? 'lino' : 'boards', [3150, 1850, 3550, 2050], false);
    // Signal box, platform rooms, huts: boards.
    for (const r of [[2250, 950, 2650, 1050], [2850, 1550, 3250, 1650], [4150, 850, 4400, 1050], [2600, 2450, 2700, 2550]] as const) patch(g, 'boards', r as Rc, false);
    // Lamp room: stone flags.
    patch(g, 'flags', [1850, 2550, 2150, 2750], false);
    // Tunnel: dark floor, rails run straight in.
    g.fillStyle = '#17171a'; g.fillRect(5600, 1250, 400, 200 - 50);
    g.fillStyle = 'rgba(0, 0, 0, 0.35)'; g.fillRect(5550, 1200, 450, 200);
    // Wet patches and oil.
    for (let i = 0; i < 14; i++) blotch(g, 3600 + hash(i, 1) * 2000, 400 + hash(i, 2) * 2400, 26 + hash(i, 3) * 40, turned ? '90, 120, 90' : '10, 10, 14', 0.3);
  });

  // Spawn pads: a worn brass-edged slab, team colour in the corner brackets.
  for (const p of plan.pads) {
    g.fillStyle = 'rgba(8, 8, 12, 0.32)'; g.fillRect(p.x - 4, p.y - 4, p.w + 8, p.h + 8);
    g.fillStyle = 'rgba(236, 226, 200, 0.08)'; g.fillRect(p.x, p.y, p.w, p.h);
    const tint = p.team === 'red' ? '#d05a50' : p.team === 'blue' ? '#5a8fd0' : C.brass;
    g.strokeStyle = hexA(tint, 0.8); g.lineWidth = 3; g.setLineDash([16, 10]); g.strokeRect(p.x + 5, p.y + 5, p.w - 10, p.h - 10); g.setLineDash([]);
    g.strokeStyle = 'rgba(28, 31, 38, 0.7)'; g.lineWidth = 2; g.strokeRect(p.x, p.y, p.w, p.h);
  }
  // The rim darkens.
  for (const [x0, y0, x1, y1, rx, ry, rw, rh] of [[0, 0, 0, 200, 0, 0, size, 200], [0, size, 0, size - 200, 0, size - 200, size, 200], [0, 0, 200, 0, 0, 0, 200, size], [size, 0, size - 200, 0, size - 200, 0, 200, size]] as const) {
    const gr = g.createLinearGradient(x0, y0, x1, y1); gr.addColorStop(0, 'rgba(6, 8, 14, 0.5)'); gr.addColorStop(1, 'rgba(6, 8, 14, 0)'); g.fillStyle = gr; g.fillRect(rx, ry, rw, rh);
  }
  void MID;
}

export const paintRailFloor = floor;
