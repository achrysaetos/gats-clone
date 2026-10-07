import type { FloorPlan } from '../floor.ts';
import { stencil } from '../floor.ts';
import { blotch, seeded, speckle } from '../grain.ts';
import { SUMMIT } from '../../shared/maps/summit.ts';
import { C, DISTRICTS, GROUNDS, SIZE, TAU, curve, ell, hash, hexA, mix, rr, shade, type G, type Pt } from './summitkit.ts';
import { paintInteriors } from './summitrooms.ts';
import { paintSites } from './summitsites.ts';
import { paintLake } from './summitlake.ts';
import { paintVignettes } from './summitegg.ts';

/**
 * The Summit floor, baked once into the ground layer. Under everything is snow, kept mid-value and cool: blotched into
 * drifts, scoured to hard blue in the wind, and trampled grey where people actually walk. On it, in order: the district
 * washes, the lake and its rink, the trails and the tracks across the slopes, each site's own ground (decks, lots, aprons,
 * ice tiles, tree rows), every room's floor under its roof, the footprints, and the pads and zones that make it a match.
 */
const turned = (pts: readonly Pt[]): Pt[] => pts.map(([x, y]) => [SIZE - x, SIZE - y] as Pt);

/** Trampled trails (west half; each is also walked in the turn): the lift to the lodge, the lodge to the rink, the woods to the cabin. */
const TRAILS: readonly (readonly Pt[])[] = [
  [[2000, 960], [2060, 1200], [1900, 1480], [1700, 1760], [1560, 2040]],                    // station gate to the deck
  [[2420, 960], [2400, 1500], [2480, 2000], [2400, 2500], [2300, 2900]],                    // gate to the rink
  [[2000, 3000], [2150, 3000], [2290, 3000]],                                               // lodge doors to the rink
  [[700, 940], [640, 1200], [600, 1480], [700, 1700]],                                      // cabin to the tubs
  [[1500, 640], [1800, 660], [2000, 640]],                                                  // woods to the lift mouth
  [[1290, 3880], [1290, 4000], [1500, 4200], [1900, 4500], [2300, 4600]],                   // shop shutter to the lake
  [[400, 4350], [700, 4380], [1000, 4400], [1400, 4420]],                                   // staging yard along the lot
  [[1600, 3900], [1700, 4300], [1650, 4800], [1500, 5000]],                                 // lot to the garage yard
  [[1300, 5400], [1500, 5200], [1850, 5100], [2300, 5000]],                                 // garage to the fuel house
  [[2480, 3450], [2400, 3800], [2420, 4050]],                                               // rink to the hut
];

/** Ski tracks: pairs of long curved grooves across the open slopes, and snowmobile treads along the lanes. */
const SKIS: readonly (readonly Pt[])[] = [
  [[1500, 100], [1560, 500], [1480, 900], [1560, 1300]],
  [[2900, 120], [2800, 560], [2860, 1000], [2780, 1400]],
  [[200, 2000], [330, 2020], [380, 2400]],
  [[2700, 4400], [2600, 4800], [2680, 5300], [2620, 5800]],
  [[1750, 4900], [1840, 5300], [1780, 5800]],
  [[2200, 1500], [2480, 1800], [2750, 1700], [2900, 1960]],
  [[2150, 3700], [2060, 3900], [2200, 4100]],
];
const SLEDS: readonly (readonly Pt[])[] = [
  [[1700, 5000], [1600, 5200], [1580, 5500], [1620, 5850]],
  [[1480, 5640], [1750, 5680], [2100, 5600], [2500, 5530]],
  [[500, 3960], [900, 4000], [1300, 4000], [1700, 4020]],
];

/** Footprint trails: a pair of small ovals every stride, a line of them. */
function prints(g: G, pts: readonly Pt[], stride = 34, shoe = 'boot', seed = 1) {
  const rand = seeded(seed);
  let left = true;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i]!, [bx, by] = pts[i + 1]!;
    const len = Math.hypot(bx - ax, by - ay), ang = Math.atan2(by - ay, bx - ax);
    for (let d = 0; d < len; d += stride) {
      const x = ax + Math.cos(ang) * d, y = ay + Math.sin(ang) * d;
      const side = left ? -1 : 1;
      left = !left;
      const px = x - Math.sin(ang) * side * 7 + (rand() - 0.5) * 3, py = y + Math.cos(ang) * side * 7 + (rand() - 0.5) * 3;
      g.fillStyle = 'rgba(40, 55, 85, 0.3)';
      if (shoe === 'paw') { g.beginPath(); g.arc(px, py, 3.2, 0, TAU); g.fill(); for (let k = -1; k <= 1; k++) { g.beginPath(); g.arc(px + Math.cos(ang) * 5 - Math.sin(ang) * k * 3.2, py + Math.sin(ang) * 5 + Math.cos(ang) * k * 3.2, 1.5, 0, TAU); g.fill(); } }
      else { ell(g, px, py, 6, 3.2, ang); g.fill(); g.fillStyle = 'rgba(200, 215, 235, 0.18)'; ell(g, px - 0.8, py - 0.8, 4.5, 2, ang); g.fill(); }
    }
  }
}

/** A pair of parallel grooves along a path, the second a little behind the first. */
function grooves(g: G, pts: readonly Pt[], gap: number, w: number, a: number) {
  g.lineCap = 'round'; g.lineJoin = 'round';
  for (const s of [-1, 1]) {
    const shifted = pts.map(([x, y], i) => {
      const [nx, ny] = pts[Math.min(pts.length - 1, i + 1)]!, [px, py] = pts[Math.max(0, i - 1)]!;
      const ang = Math.atan2(ny - py, nx - px);
      return [x - Math.sin(ang) * s * gap, y + Math.cos(ang) * s * gap] as Pt;
    });
    g.strokeStyle = `rgba(50, 68, 100, ${a})`; g.lineWidth = w; curve(g, shifted); g.stroke();
    g.strokeStyle = `rgba(190, 208, 232, ${a * 0.55})`; g.lineWidth = Math.max(1, w * 0.4); g.translate(-1.2, -1.2); curve(g, shifted); g.stroke(); g.translate(1.2, 1.2);
  }
}

/** The snow itself: blotched drifts, wind scour, ripples, and sparkle. */
function snow(g: G, size: number, seed: number) {
  const rand = seeded(seed ^ 0x51a7);
  g.fillStyle = C.snow;
  g.fillRect(0, 0, size, size);
  const area = (size * size) / 1_000_000;
  // Big slow drifts, a little lighter and a little darker, all stretched the way the wind blows (north-west to south-east).
  for (let i = 0; i < 90 * area; i++) {
    const x = rand() * size, y = rand() * size, r = 120 + rand() * 340;
    g.save(); g.translate(x, y); g.rotate(0.45); g.scale(1.8, 1);
    blotch(g, 0, 0, r, rand() < 0.5 ? '170, 190, 220' : '60, 80, 120', 0.05 + rand() * 0.06);
    g.restore();
  }
  // Wind scour: patches of hard, bluer snow.
  for (let i = 0; i < 26 * area; i++) {
    const x = rand() * size, y = rand() * size;
    g.save(); g.translate(x, y); g.rotate(0.4 + (rand() - 0.5) * 0.2); g.scale(2.4, 1);
    blotch(g, 0, 0, 90 + rand() * 130, '84, 110, 160', 0.09);
    g.restore();
  }
  // Wind ripples: fine, short, curved lines in lighter and darker snow.
  g.lineCap = 'round';
  for (let i = 0; i < 2600 * area; i++) {
    const x = rand() * size, y = rand() * size, len = 14 + rand() * 30, ang = 0.42 + (rand() - 0.5) * 0.35;
    const hi = rand() < 0.5;
    g.strokeStyle = hi ? 'rgba(200, 216, 238, 0.16)' : 'rgba(50, 70, 108, 0.16)';
    g.lineWidth = 1.4 + rand();
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(ang) * len * 0.5, y + Math.sin(ang) * len * 0.5 - 3, x + Math.cos(ang) * len, y + Math.sin(ang) * len); g.stroke();
  }
  speckle(g, rand, size, 5200 * area, '#4c5f82', '#d6e2f2');
}

/** A soft wash of each district's light colour, so the colour of the ground tells you where you are. */
function washes(g: G) {
  for (const d of DISTRICTS) {
    const { x0, y0, x1, y1 } = d.box;
    const [r, gg, b, a] = d.wash;
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, rad = Math.hypot(x1 - x0, y1 - y0) / 2;
    const fade = g.createRadialGradient(cx, cy, rad * 0.15, cx, cy, rad * 0.95);
    fade.addColorStop(0, `rgba(${r}, ${gg}, ${b}, ${a * 1.5})`); fade.addColorStop(1, `rgba(${r}, ${gg}, ${b}, 0)`);
    g.fillStyle = fade; g.fillRect(x0 - 40, y0 - 40, x1 - x0 + 80, y1 - y0 + 80);
  }
}

/** Trampled trails and the tracks across the slopes. */
function trails(g: G, seed: number) {
  g.lineCap = 'round'; g.lineJoin = 'round';
  for (const t of TRAILS) for (const pts of [t, turned(t)]) {
    for (const [w, a] of [[78, 0.12], [52, 0.16], [30, 0.12]] as const) { g.strokeStyle = `rgba(${a > 0.14 ? '84, 96, 120' : '98, 110, 136'}, ${a})`; g.lineWidth = w; curve(g, pts); g.stroke(); }
  }
  for (const s of SKIS) for (const pts of [s, turned(s)]) grooves(g, pts, 7, 3.2, 0.3);
  for (const s of SLEDS) for (const pts of [s, turned(s)]) {
    grooves(g, pts, 18, 8, 0.26);
    // Cleat chevrons along each tread.
    g.strokeStyle = 'rgba(40, 56, 88, 0.2)'; g.lineWidth = 1.6;
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i]!, [bx, by] = pts[i + 1]!, len = Math.hypot(bx - ax, by - ay), ang = Math.atan2(by - ay, bx - ax);
      for (let d = 12; d < len; d += 22) for (const s2 of [-18, 18]) {
        const x = ax + Math.cos(ang) * d - Math.sin(ang) * s2, y = ay + Math.sin(ang) * d + Math.cos(ang) * s2;
        g.beginPath(); g.moveTo(x - Math.cos(ang) * 4 - Math.sin(ang) * 6, y - Math.sin(ang) * 4 + Math.cos(ang) * 6); g.lineTo(x + Math.cos(ang) * 4, y + Math.sin(ang) * 4); g.lineTo(x - Math.cos(ang) * 4 + Math.sin(ang) * 6, y - Math.sin(ang) * 4 - Math.cos(ang) * 6); g.stroke();
      }
    }
  }
  // Boot prints along the busiest trails, and one trail that goes nowhere (see summitsites.ts for where it ends).
  let n = 1;
  for (const t of TRAILS.slice(0, 6)) for (const pts of [t, turned(t)]) prints(g, pts, 40, 'boot', seed + n++);
}

/** Snow banked against the windward (north and west) sides of every wall, a lit ridge with a blue trough beside it. */
function ridges(g: G, plan: FloorPlan) {
  for (const w of plan.walls) {
    if (Math.max(w.w, w.h) < 100 || (w.w < 40 && w.h < 40)) continue;
    const horiz = w.w >= w.h;
    const n = Math.min(6, Math.floor(Math.max(w.w, w.h) / 90));
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5 + (hash(w.x, w.y, i) - 0.5) * 0.4) / n;
      const x = horiz ? w.x + w.w * t : w.x - 12, y = horiz ? w.y - 12 : w.y + w.h * t;
      const rx = horiz ? 50 + hash(w.x, i, 2) * 30 : 16, ry = horiz ? 16 : 50 + hash(w.y, i, 3) * 30;
      g.fillStyle = 'rgba(52, 72, 112, 0.2)'; ell(g, x + (horiz ? 0 : -8), y + (horiz ? -8 : 0), rx, ry); g.fill();
      g.fillStyle = 'rgba(214, 226, 246, 0.22)'; ell(g, x, y, rx * 0.8, ry * 0.7); g.fill();
    }
  }
}

/** Spawn pads and capture zones: a trampled square and a ring of ski poles. */
function marks(g: G, plan: FloorPlan) {
  for (const [i, pad] of plan.pads.entries()) {
    const tint = pad.team === 'red' ? '#b4524a' : pad.team === 'blue' ? '#4f7fbf' : '#2c3548';
    g.globalAlpha = 0.18; g.fillStyle = tint; g.fillRect(pad.x, pad.y, pad.w, pad.h);
    g.globalAlpha = 0.5; g.fillStyle = '#4a5878'; g.fillRect(pad.x + 4, pad.y + 4, pad.w - 8, pad.h - 8);
    g.globalAlpha = 0.55; g.fillStyle = '#c8d4e8';
    const arm = Math.min(34, pad.w / 2, pad.h / 2), t = 5;
    for (const [px, py, sx, sy] of [[pad.x, pad.y, 1, 1], [pad.x + pad.w, pad.y, -1, 1], [pad.x, pad.y + pad.h, 1, -1], [pad.x + pad.w, pad.y + pad.h, -1, -1]] as const) { g.fillRect(Math.min(px, px + sx * arm), Math.min(py, py + sy * t), arm, t); g.fillRect(Math.min(px, px + sx * t), Math.min(py, py + sy * arm), t, arm); }
    g.globalAlpha = 0.5;
    const text = pad.team === 'red' ? `A${(i % 9) + 1}` : pad.team === 'blue' ? `b${(i % 9) + 1}` : `P${(i % 9) + 1}`;
    const th = Math.min(30, pad.h * 0.4, pad.w * 0.5);
    if (th >= 16) stencil(g, text, pad.x + pad.w / 2 - (text.length * (th * 0.52 + th * 0.24)) / 2, pad.y + pad.h / 2 - th / 2, th);
    g.globalAlpha = 1;
  }
  for (const z of plan.zones) {
    const r = plan.zoneRadius;
    g.globalAlpha = 0.16; g.fillStyle = '#1a2236'; g.beginPath(); g.arc(z.x, z.y, r - 6, 0, TAU); g.fill();
    g.globalAlpha = 0.7;
    // Slalom flags: alternating orange and bone poles round the ring, like a gate course.
    for (let k = 0; k < 24; k++) {
      const a0 = (k / 24) * TAU + 0.03, a1 = ((k + 0.62) / 24) * TAU;
      g.fillStyle = k % 2 ? '#d9541f' : '#e2dccb';
      g.beginPath(); g.arc(z.x, z.y, r + 12, a0, a1); g.arc(z.x, z.y, r + 22, a1, a0, true); g.closePath(); g.fill();
    }
    g.globalAlpha = 1;
  }
}

/** The rim of the map: the snow bank's long shadow, so the edge reads as finished. */
function rim(g: G, size: number) {
  const r = 190;
  for (const [x0, y0, x1, y1, rx, ry, rw, rh] of [
    [0, 0, 0, r, 0, 0, size, r], [0, size, 0, size - r, 0, size - r, size, r],
    [0, 0, r, 0, 0, 0, r, size], [size, 0, size - r, 0, size - r, 0, r, size],
  ] as const) {
    const grad = g.createLinearGradient(x0, y0, x1, y1);
    grad.addColorStop(0, 'rgba(18, 26, 48, 0.5)'); grad.addColorStop(0.4, 'rgba(18, 26, 48, 0.18)'); grad.addColorStop(1, 'rgba(18, 26, 48, 0)');
    g.fillStyle = grad; g.fillRect(rx, ry, rw, rh);
  }
}

export function paintSummitFloor(g: G, size: number, seed: number, plan: FloorPlan) {
  snow(g, size, seed);
  washes(g);
  paintLake(g, size, seed);
  trails(g, seed);
  ridges(g, plan);
  paintSites(g, size, seed);
  paintInteriors(g, size, seed);
  paintVignettes(g);
  marks(g, plan);
  rim(g, size);
  void SUMMIT; void GROUNDS; void hash; void hexA; void mix; void rr; void shade;
}
