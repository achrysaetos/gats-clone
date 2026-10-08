import { blotch, seeded } from '../grain.ts';
import { C, TAU, ell, hash, hexA, rr, shade, type G } from './summitkit.ts';
import { flags, label, planks, tiles } from './summitdraw.ts';

/**
 * The alpine spa's floors: the lodge turned half a turn and dressed as a bathhouse. Everything is in west-half coordinates
 * and painted under `both` (variant 1), so it lands in the east half. The floor is kept to a calm, mid-value stone and
 * straw so soldiers read on it; the detail that makes it a place (a mosaic, tatami, round stone tubs with steam, folded
 * towels, paper lanterns, wet footprints) is flat, low-contrast or small.
 */

/** A standing paper lantern seen from above: a stone foot, a cream shade with ribs, ink outline. It is the fixture of the warm light beside it. */
export function lantern(g: G, x: number, y: number) {
  g.fillStyle = 'rgba(10, 12, 18, 0.34)'; ell(g, x + 4, y + 5, 17, 15); g.fill();
  g.fillStyle = C.stoneLo; ell(g, x, y, 17, 17); g.fill(); g.strokeStyle = C.ink; g.lineWidth = 2; g.stroke();
  g.fillStyle = '#e9d6a0'; ell(g, x, y, 12, 12); g.fill();
  g.fillStyle = '#c9a868'; g.beginPath(); g.arc(x, y, 12, Math.PI * 0.2, Math.PI * 1.0); g.lineTo(x, y); g.closePath(); g.fill();
  g.strokeStyle = 'rgba(70, 40, 16, 0.7)'; g.lineWidth = 2; g.beginPath(); g.moveTo(x - 12, y); g.lineTo(x + 12, y); g.moveTo(x, y - 12); g.lineTo(x, y + 12); g.stroke();
  g.strokeStyle = C.ink; g.lineWidth = 2; ell(g, x, y, 12, 12); g.stroke();
  g.fillStyle = 'rgba(255, 255, 255, 0.85)'; ell(g, x - 4, y - 5, 2.4, 2.4); g.fill();
}

function towels(g: G, x: number, y: number, rot: number, n: number, cols: readonly string[]) {
  g.save(); g.translate(x, y); g.rotate(rot);
  for (let i = 0; i < n; i++) {
    const c = cols[i % cols.length]!, oy = -i * 4;
    g.fillStyle = 'rgba(10, 12, 18, 0.28)'; g.fillRect(-17 + 3, -11 + oy + 4, 34, 22);
    g.fillStyle = c; g.fillRect(-17, -11 + oy, 34, 22);
    g.fillStyle = shade(c, 0.25); g.fillRect(-17, -11 + oy, 34, 4);
    g.fillStyle = shade(c, -0.25); g.fillRect(-17, 7 + oy, 34, 4);
    g.strokeStyle = C.ink; g.lineWidth = 1.6; g.strokeRect(-17, -11 + oy, 34, 22);
  }
  g.restore();
}
const TOWEL = ['#e4e0d4', '#9cc8cc', '#e4e0d4', '#c9b88a'] as const;

/** A round stone tub: rim in two steps, water in two steps, rings and a glint. */
export function stoneTub(g: G, cx: number, cy: number, r: number) {
  g.fillStyle = 'rgba(10, 12, 18, 0.36)'; ell(g, cx + 7, cy + 10, r + 6, r + 4); g.fill();
  g.fillStyle = '#7d8683'; ell(g, cx, cy, r, r); g.fill();
  g.fillStyle = '#9aa29c'; g.beginPath(); g.arc(cx, cy, r, Math.PI * 0.8, Math.PI * 1.7); g.arc(cx, cy, r - 14, Math.PI * 1.7, Math.PI * 0.8, true); g.closePath(); g.fill();
  g.fillStyle = '#58615f'; g.beginPath(); g.arc(cx, cy, r, -0.3, Math.PI * 0.75); g.arc(cx, cy, r - 14, Math.PI * 0.75, -0.3, true); g.closePath(); g.fill();
  g.strokeStyle = C.ink; g.lineWidth = 2.5; ell(g, cx, cy, r, r); g.stroke();
  g.strokeStyle = 'rgba(30, 38, 36, 0.55)'; g.lineWidth = 2; for (let k = 0; k < 10; k++) { const a = (k / 10) * TAU + 0.2; g.beginPath(); g.moveTo(cx + Math.cos(a) * (r - 14), cy + Math.sin(a) * (r - 14)); g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); g.stroke(); }
  const wr = r - 14;
  g.fillStyle = '#2f7a8c'; ell(g, cx, cy, wr, wr); g.fill();
  g.fillStyle = '#4ca4b4'; g.beginPath(); g.arc(cx, cy, wr, Math.PI * 0.9, Math.PI * 1.75); g.arc(cx + wr * 0.12, cy + wr * 0.14, wr * 0.9, Math.PI * 1.75, Math.PI * 0.9, true); g.closePath(); g.fill();
  g.strokeStyle = C.ink; g.lineWidth = 2; ell(g, cx, cy, wr, wr); g.stroke();
  g.strokeStyle = 'rgba(200, 238, 244, 0.6)'; g.lineWidth = 2; for (const f of [0.38, 0.66]) { ell(g, cx, cy, wr * f, wr * f); g.stroke(); }
  g.fillStyle = 'rgba(255, 255, 255, 0.8)'; ell(g, cx - wr * 0.45, cy - wr * 0.5, 7, 4, -0.6); g.fill();
}

/** The great hall: warm-grey stone in two tones, a border with brass inlay, a mosaic medallion under the zone, wet footprints from the doors. */
export function spaHall(g: G) {
  const x = 1050, y = 2600, w = 900, h = 850;
  tiles(g, x, y, w, h, 100, '#6f8789', '#657d81', 'rgba(16, 30, 34, 0.72)', 12, 0.07);
  // Warm bands of underfloor heating and a pale, wet sheen where the footbaths drip.
  g.fillStyle = 'rgba(255, 150, 90, 0.07)';
  for (let i = 0; i < 8; i++) g.fillRect(x + 30, y + 60 + i * 100, w - 60, 20);
  blotch(g, 1160, 2700, 160, '190, 235, 240', 0.1); blotch(g, 1790, 3380, 150, '190, 235, 240', 0.1);
  // Border: a band of deep teal tile with a brass line each side and a brass stud at every joint.
  g.save(); g.beginPath(); g.rect(x, y, w, h); g.rect(x + 46, y + 46, w - 92, h - 92); g.clip('evenodd');
  g.fillStyle = '#41686b'; g.fillRect(x, y, w, h);
  g.restore();
  g.strokeStyle = hexA(C.brass, 0.75); g.lineWidth = 3; g.strokeRect(x + 46, y + 46, w - 92, h - 92); g.strokeRect(x + 8, y + 8, w - 16, h - 16);
  g.fillStyle = hexA(C.brassHi, 0.8); for (let k = 100; k < w; k += 100) { g.fillRect(x + k - 4, y + 23 - 4, 8, 8); g.fillRect(x + k - 4, y + h - 23 - 4, 8, 8); }
  for (let k = 100; k < h; k += 100) { g.fillRect(x + 23 - 4, y + k - 4, 8, 8); g.fillRect(x + w - 23 - 4, y + k - 4, 8, 8); }
  // The medallion: a sun of sixteen petals in two teals, ringed in brass, under the capture zone.
  g.save(); g.translate(1475, 3025);
  g.fillStyle = 'rgba(14, 24, 28, 0.3)'; ell(g, 5, 7, 252, 252); g.fill();
  g.fillStyle = '#4f7478'; ell(g, 0, 0, 248, 248); g.fill();
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * TAU;
    g.fillStyle = k % 2 ? '#7da0a2' : '#5d8588';
    g.beginPath(); g.moveTo(Math.cos(a - 0.2) * 70, Math.sin(a - 0.2) * 70); g.lineTo(Math.cos(a) * (k % 2 ? 190 : 226), Math.sin(a) * (k % 2 ? 190 : 226)); g.lineTo(Math.cos(a + 0.2) * 70, Math.sin(a + 0.2) * 70); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(20, 36, 40, 0.55)'; g.lineWidth = 2; g.stroke();
  }
  g.strokeStyle = hexA(C.brass, 0.8); g.lineWidth = 5; ell(g, 0, 0, 240, 240); g.stroke(); g.lineWidth = 3; ell(g, 0, 0, 236 - 40, 236 - 40); g.stroke(); ell(g, 0, 0, 62, 62); g.stroke();
  g.fillStyle = hexA(C.brassHi, 0.75); ell(g, 0, 0, 16, 16); g.fill();
  g.strokeStyle = C.ink; g.lineWidth = 2; g.globalAlpha = 0.5; ell(g, 0, 0, 248, 248); g.stroke(); g.globalAlpha = 1;
  g.restore();
  // Bare wet footprints from the footbaths to the tubs, drying.
  g.fillStyle = 'rgba(16, 36, 42, 0.26)';
  for (let i = 0; i < 12; i++) { const px = 1100 + i * 20 + (i % 2 ? 9 : -9), py = 2640 + i * 22; ell(g, px, py, 6, 3.4, 0.5); g.fill(); }
  // Low reed mats along the north wall and a stack of folded towels at the end of each bench row.
  for (const [mx, my] of [[1180, 2650], [1320, 2650]] as const) {
    g.fillStyle = '#b6a574'; g.fillRect(mx, my, 120, 56); g.strokeStyle = '#3d5a48'; g.lineWidth = 4; g.strokeRect(mx + 2, my + 2, 116, 52);
    g.strokeStyle = 'rgba(70, 56, 30, 0.35)'; g.lineWidth = 2; for (let k = 10; k < 56; k += 10) { g.beginPath(); g.moveTo(mx + 6, my + k); g.lineTo(mx + 114, my + k); g.stroke(); }
    g.strokeStyle = C.ink; g.lineWidth = 2; g.strokeRect(mx, my, 120, 56);
  }
  towels(g, 1750, 2700, 0.15, 3, TOWEL); towels(g, 1850, 3360, -0.1, 3, TOWEL);
  lantern(g, 1100, 2660); lantern(g, 1900, 2660); lantern(g, 1900, 3390);
  label(g, 1, 'RELAX', 1475, 2650, 22, 'rgba(210, 244, 236, 0.4)', { spacing: 8 });
}

/** The treatment rooms: tatami in staggered mats with a green binding, a futon, folded towels and a lantern in the corner. */
export function spaRoom(g: G, rx: number, ry: number, rw: number, rh: number, i: number) {
  g.save(); g.beginPath(); g.rect(rx, ry, rw, rh); g.clip();
  g.fillStyle = '#bba871'; g.fillRect(rx, ry, rw, rh);
  const rand = seeded(500 + i);
  for (let row = 0, yy = ry; yy < ry + rh; yy += 100, row++) {
    for (let xx = rx - (row % 2 ? 62 : 0); xx < rx + rw; xx += 125) {
      const k = (rand() - 0.5) * 0.12;
      g.fillStyle = k > 0 ? `rgba(255, 246, 210, ${k})` : `rgba(30, 24, 8, ${-k})`; g.fillRect(xx, yy, 125, 100);
      g.fillStyle = 'rgba(70, 56, 30, 0.22)'; for (let kk = 12; kk < 100; kk += 12) g.fillRect(xx + 6, yy + kk, 113, 2);
      g.fillStyle = '#3d5a48'; g.fillRect(xx, yy, 125, 5); g.fillRect(xx, yy + 95, 125, 5);
      g.strokeStyle = 'rgba(20, 22, 14, 0.7)'; g.lineWidth = 2; g.strokeRect(xx + 1, yy + 1, 123, 98);
    }
  }
  g.restore();
  g.strokeStyle = C.ink; g.lineWidth = 2; g.globalAlpha = 0.45; g.strokeRect(rx, ry, rw, rh); g.globalAlpha = 1;
  towels(g, rx + 216, ry + 70, 0.2, 3, TOWEL);
  lantern(g, rx + 222, ry + rh - 30);
}

/** The hot rooms: warm slate flags, a duckboard path and a round stone tub with its towels and bucket. */
export function spaHotRoom(g: G, ex: number, ry: number, ew: number, seed: number) {
  flags(g, ex, ry, ew, 400, '#667270', seed);
  g.fillStyle = 'rgba(255, 140, 80, 0.1)'; g.fillRect(ex, ry, ew, 400);
  blotch(g, ex + 125, ry + 200, 150, '200, 240, 244', 0.1);
  planks(g, ex + 40, ry + 296, ew - 80, 70, { base: '#a8845a', hi: '#bc9a6c', lo: '#8c6a44', board: 14, seed: seed + 3 });
  g.strokeStyle = C.ink; g.lineWidth = 2; g.strokeRect(ex + 40, ry + 296, ew - 80, 70);
  stoneTub(g, ex + 125, ry + 168, 92);
  towels(g, ex + 36, ry + 40, -0.2, 3, TOWEL);
  g.fillStyle = '#7a5a36'; ell(g, ex + 216, ry + 52, 14, 14); g.fill(); g.strokeStyle = C.ink; g.lineWidth = 2; g.stroke(); g.fillStyle = '#2f7a8c'; ell(g, ex + 216, ry + 52, 9, 9); g.fill();
  lantern(g, ex + 218, ry + 360);
}

/** A runner for the spa corridor: teal with a wave border and a brass edge, laid over the bamboo. */
export function spaRunner(g: G, cx: number, cw: number, y0: number, y1: number) {
  g.fillStyle = 'rgba(10, 12, 18, 0.26)'; g.fillRect(cx + 11, y0, cw - 16, y1 - y0);
  g.fillStyle = '#2f5e60'; g.fillRect(cx + 8, y0, cw - 16, y1 - y0);
  g.fillStyle = '#e0d8b8'; g.fillRect(cx + 14, y0, 4, y1 - y0); g.fillRect(cx + cw - 22, y0, 4, y1 - y0);
  g.strokeStyle = 'rgba(200, 232, 228, 0.55)'; g.lineWidth = 3;
  for (let yy = y0 + 12; yy < y1 - 14; yy += 44) { g.beginPath(); g.moveTo(cx + 26, yy); g.quadraticCurveTo(cx + 38, yy - 10, cx + 50, yy); g.quadraticCurveTo(cx + 62, yy + 10, cx + 74, yy); g.stroke(); }
  g.strokeStyle = C.ink; g.lineWidth = 2; g.globalAlpha = 0.4; g.strokeRect(cx + 8, y0, cw - 16, y1 - y0); g.globalAlpha = 1;
  void hash; void rr;
}
