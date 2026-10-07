import { registerAmbient } from '../ambientreg.ts';
import { C, SIZE, TAU, calm, clock, ell, hash, type G } from './summitkit.ts';
import type { ThemeView } from './registry.ts';

/**
 * Summit's living things. The engine's critters come from `ambientreg` (ravens on the wall tops, foxes in the woods, snow
 * blown in gusts); the movers that belong to the place live here: the chairs sliding up the lift line, the steam on the
 * tubs, the snow that falls, the windsock on the garage, smoke from the lodge chimney. Every one is slow (under 1 Hz of
 * motion, far below the 4 Hz limit) and holds still under reduced motion.
 */
registerAmbient('summit', {
  wind: { x: 18, y: 7 },
  groups: [
    { kind: 'crow', count: 5, on: 'wall' },
    { kind: 'fox', count: 2, in: [{ x: 120, y: 120, w: 1300, h: 1400 }], roam: 260 },
    { kind: 'fox', count: 1, in: [{ x: 4580, y: 4480, w: 1300, h: 1400 }], roam: 260 },
    { kind: 'snow', count: 7 },
    { kind: 'dustdevil', count: 1 },
    { kind: 'steam', at: [{ x: 650, y: 1800 }, { x: 1000, y: 1740 }, { x: 1350, y: 1830 }, { x: 5350, y: 4200 }, { x: 5000, y: 4260 }, { x: 4650, y: 4170 }] },
  ],
});

type View = ThemeView;
const inView = (v: View, x: number, y: number, r: number) => x + r >= v.x0 && x - r <= v.x1 && y + r >= v.y0 && y - r <= v.y1;

/** The chair line: the bull wheel in the lift shed to the turn in the woods; the same cable, a half turn on, carries gondolas to the terminal. */
export const LINE = { a: { x: 2740, y: 700 }, b: { x: 560, y: 1180 } } as const;

function chair(g: G, x: number, y: number, ang: number, gondola: boolean) {
  g.save(); g.translate(x, y); g.rotate(ang);
  g.fillStyle = 'rgba(10, 14, 28, 0.28)'; g.fillRect(-10, 24, 22, 8);
  g.strokeStyle = C.ink; g.lineWidth = 4; g.beginPath(); g.moveTo(0, -4); g.lineTo(0, 12); g.stroke();
  g.strokeStyle = C.steelHi; g.lineWidth = 1.8; g.beginPath(); g.moveTo(0, -4); g.lineTo(0, 12); g.stroke();
  if (gondola) {
    g.fillStyle = C.red; g.fillRect(-16, 12, 32, 22); g.fillStyle = 'rgba(190, 225, 245, 0.85)'; g.fillRect(-12, 16, 24, 10);
    g.strokeStyle = C.ink; g.lineWidth = 2; g.strokeRect(-16, 12, 32, 22);
  } else {
    g.fillStyle = C.green; g.fillRect(-14, 12, 28, 5); g.fillRect(-14, 6, 28, 6);
    g.strokeStyle = C.ink; g.lineWidth = 1.8; g.strokeRect(-14, 6, 28, 11); g.beginPath(); g.moveTo(-14, 17); g.lineTo(-14, 25); g.moveTo(14, 17); g.lineTo(14, 25); g.stroke();
    g.fillStyle = 'rgba(200, 215, 235, 0.7)'; g.fillRect(-14, 6, 28, 3);
  }
  g.restore();
}

/** Cable, and chairs riding it slowly (a chair every 150 px, 26 px a second). */
function lift(g: G, now: number, v: View, gondola: boolean) {
  const a = gondola ? { x: SIZE - LINE.a.x, y: SIZE - LINE.a.y } : LINE.a, b = gondola ? { x: SIZE - LINE.b.x, y: SIZE - LINE.b.y } : LINE.b;
  const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy), ux = dx / len, uy = dy / len, nx = -uy, ny = ux;
  if (!inView(v, (a.x + b.x) / 2, (a.y + b.y) / 2, len / 2 + 80)) return;
  g.lineCap = 'round';
  for (const side of [-1, 1]) {
    const ox = nx * 22 * side, oy = ny * 22 * side;
    g.strokeStyle = 'rgba(10, 14, 28, 0.3)'; g.lineWidth = 4; g.beginPath(); g.moveTo(a.x + ox + 10, a.y + oy + 18); g.lineTo(b.x + ox + 10, b.y + oy + 18); g.stroke();
    g.strokeStyle = C.ink; g.lineWidth = 4; g.beginPath(); g.moveTo(a.x + ox, a.y + oy); g.lineTo(b.x + ox, b.y + oy); g.stroke();
    g.strokeStyle = '#8c98a8'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(a.x + ox, a.y + oy - 1); g.lineTo(b.x + ox, b.y + oy - 1); g.stroke();
    const t = (clock(now) * 0.026) % 150;
    for (let d = t; d < len; d += 150) {
      const p = side > 0 ? d : len - d;
      const cx = a.x + ux * p + ox, cy = a.y + uy * p + oy;
      if (inView(v, cx, cy, 40)) chair(g, cx, cy, Math.sin(clock(now) * 0.0011 + d) * 0.05, gondola);
    }
  }
}

/** The bull wheel at the top of the line: spokes turning one slow turn in a minute, over the drive house. */
function wheel(g: G, now: number, x: number, y: number, r: number, color: string) {
  g.save(); g.translate(x, y);
  g.fillStyle = 'rgba(10, 14, 28, 0.25)'; ell(g, 8, 14, r, r * 0.9); g.fill();
  g.rotate(clock(now) * 0.0001);
  g.strokeStyle = C.ink; g.lineWidth = 9; g.beginPath(); g.arc(0, 0, r, 0, TAU); g.stroke();
  g.strokeStyle = color; g.lineWidth = 5; g.beginPath(); g.arc(0, 0, r, 0, TAU); g.stroke();
  g.lineWidth = 4;
  for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU; g.strokeStyle = C.ink; g.lineWidth = 6; g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a) * r, Math.sin(a) * r); g.stroke(); g.strokeStyle = color; g.lineWidth = 3; g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a) * r, Math.sin(a) * r); g.stroke(); }
  g.fillStyle = C.steelLo; ell(g, 0, 0, 14, 14); g.fill(); g.strokeStyle = C.ink; g.lineWidth = 2.5; g.stroke();
  g.restore();
}

/** Smoke rising from a chimney: pale puffs that swell and lean downwind. */
function smoke(g: G, now: number, x: number, y: number, seed: number, tint = '200, 210, 228') {
  const t = clock(now) / 1000;
  for (let i = 0; i < 7; i++) {
    const u = ((t * 0.22 + i / 7 + hash(seed, i)) % 1);
    const px = x + u * 70 + Math.sin(t + i) * 6, py = y - u * 120;
    g.fillStyle = `rgba(${tint}, ${(0.34 * (1 - u)).toFixed(3)})`;
    ell(g, px, py, 9 + u * 26, 8 + u * 22); g.fill();
  }
}

/** A windsock on a pole: it points downwind and breathes. */
function windsock(g: G, now: number, x: number, y: number) {
  const t = clock(now) / 1000, a = 0.5 + Math.sin(t * 0.7) * 0.18;
  g.fillStyle = 'rgba(10, 14, 28, 0.28)'; ell(g, x + 4, y + 8, 6, 3); g.fill();
  g.strokeStyle = C.ink; g.lineWidth = 6; g.beginPath(); g.moveTo(x, y + 6); g.lineTo(x, y - 40); g.stroke();
  g.strokeStyle = C.steelHi; g.lineWidth = 2.4; g.beginPath(); g.moveTo(x, y + 6); g.lineTo(x, y - 40); g.stroke();
  g.save(); g.translate(x, y - 40); g.rotate(a);
  for (let i = 0; i < 5; i++) { g.fillStyle = i % 2 ? '#e2dccb' : C.hazard; const w0 = 9 - i * 1.2, w1 = 9 - (i + 1) * 1.2; g.beginPath(); g.moveTo(i * 9, -w0); g.lineTo(i * 9 + 9, -w1 + Math.sin(t * 2 + i) * 0.8); g.lineTo(i * 9 + 9, w1 + Math.sin(t * 2 + i) * 0.8); g.lineTo(i * 9, w0); g.closePath(); g.fill(); }
  g.strokeStyle = C.ink; g.lineWidth = 1.6; g.beginPath(); g.moveTo(0, -9); g.lineTo(45, -4); g.lineTo(45, 4); g.lineTo(0, 9); g.closePath(); g.stroke();
  g.restore();
}

const FLAKES = Array.from({ length: 90 }, (_, i) => ({ x: hash(i, 1, 3), y: hash(i, 2, 3), s: 0.5 + hash(i, 3, 3), r: 1 + hash(i, 4, 3) * 1.6 }));

/** Falling snow: light and sparse, never heavier than a flurry, drawn over everything in view. */
function snowfall(g: G, now: number, v: View) {
  const t = clock(now) / 1000, w = v.x1 - v.x0, h = v.y1 - v.y0;
  g.fillStyle = 'rgba(214, 226, 244, 0.5)';
  for (const f of FLAKES) {
    const px = v.x0 + ((f.x * w + t * 14 * f.s + Math.sin(t * 0.6 + f.y * 9) * 18) % w + w) % w;
    const py = v.y0 + ((f.y * h + t * 38 * f.s) % h + h) % h;
    g.beginPath(); g.arc(px, py, f.r, 0, TAU); g.fill();
  }
}

/** Everything that moves above the players. */
export function summitLiving(g: G, now: number, v: View) {
  lift(g, now, v, false);
  lift(g, now, v, true);
  for (const [x, y, r, c, tw] of [[2740, 700, 78, '#8c98a8', false], [SIZE - 2740, SIZE - 700, 78, '#a8c8e0', true]] as const) if (inView(v, x, y, r + 20)) wheel(g, now, x, y, tw ? r * 0.8 : r, c);
  for (const [x, y, s] of [[1125, 3000, 1], [SIZE - 1125, SIZE - 3000, 2], [790, 660, 3], [SIZE - 790, SIZE - 660, 4]] as const) if (inView(v, x, y, 200)) smoke(g, now, x, y, s, s % 2 ? '200, 210, 228' : '215, 225, 235');
  for (const [x, y] of [[1180, 5000], [SIZE - 1180, SIZE - 5000]] as const) if (inView(v, x, y, 80)) windsock(g, now, x, y);
  if (!calm) snowfall(g, now, v);
}
