import { INK } from '../palette.ts';

/**
 * Hand-placed set dressing for the Museum, baked into the floor layer. Everything here sits in the margins (against walls, in
 * corners, beside exhibits), never across a lane, and is drawn low-contrast with the kit's ink outline and a crisp contact
 * shadow. The story, told in the margins: tonight a crew came in by the loading dock (the van outside, the muddy bootprints,
 * a ladder dropped in Egypt), cut the power to the treasury (dead beams, a cut cable, a hole in a case) and left through the
 * main entrance, where the guard's coffee and crossword went cold on the desk. The gem vault is still sealed and humming.
 * Positions are in cells (50 px); `r` is a rotation in radians.
 */

export type DecorItem = { k: string; x: number; y: number; r?: number; w?: number; h?: number; v?: number };

const C = 50;
const TAU = Math.PI * 2;
const BRASS = '#b79a4a';

function at(g: CanvasRenderingContext2D, it: DecorItem, paint: () => void) {
  g.save();
  g.translate(it.x * C, it.y * C);
  if (it.r) g.rotate(it.r);
  paint();
  g.restore();
}
const shade = (g: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number) => { g.fillStyle = 'rgba(20, 24, 32, 0.3)'; g.beginPath(); g.ellipse(x + 3, y + 3, rx, ry, 0, 0, TAU); g.fill(); };
const box = (g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, fill: string, lw = 1.8) => { g.fillStyle = fill; g.fillRect(x, y, w, h); g.strokeStyle = INK; g.lineWidth = lw; g.strokeRect(x, y, w, h); };
const disc = (g: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string, lw = 1.6) => { g.fillStyle = fill; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); g.strokeStyle = INK; g.lineWidth = lw; g.stroke(); };
const hl = (g: CanvasRenderingContext2D, x: number, y: number, w: number) => { g.fillStyle = 'rgba(255, 255, 255, 0.28)'; g.fillRect(x, y, w, 1.6); };
const blob = (g: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, fill: string, rot = 0) => { g.fillStyle = fill; g.beginPath(); g.ellipse(x, y, rx, ry, rot, 0, TAU); g.fill(); };

type P = (g: CanvasRenderingContext2D, it: DecorItem) => void;
const PAINT: Record<string, P> = {
  // --- the loading dock
  container: (g, it) => at(g, it, () => {
    const w = (it.w ?? 5.4) * C, h = (it.h ?? 2.1) * C;
    shade(g, w / 2, h / 2 + 6, w / 2, h / 2);
    box(g, -w / 2, -h / 2, w, h, '#3f6f78');
    g.fillStyle = 'rgba(10, 12, 16, 0.28)';
    for (let x = -w / 2 + 8; x < w / 2 - 4; x += 12) g.fillRect(x, -h / 2 + 3, 5, h - 6);
    g.fillStyle = 'rgba(255, 255, 255, 0.18)'; g.fillRect(-w / 2, -h / 2, w, 4);
    box(g, w / 2 - 22, -h / 2 + 6, 14, h - 12, '#2f5860', 1.5);
    g.fillStyle = '#e8dfc6'; g.fillRect(-w / 2 + 12, -h / 2 + 10, 34, 5); g.fillRect(-w / 2 + 12, -h / 2 + 19, 22, 3);
  }),
  pallet: (g, it) => at(g, it, () => {
    shade(g, 0, 0, 28, 24);
    box(g, -26, -22, 52, 44, '#a3814f');
    g.strokeStyle = 'rgba(40, 26, 12, 0.6)'; g.lineWidth = 1.5; for (let i = -1; i <= 1; i++) { g.beginPath(); g.moveTo(-26, i * 14); g.lineTo(26, i * 14); g.stroke(); }
    box(g, -16, -14, 22, 20, '#c9a36a'); box(g, 2, -8, 18, 18, '#d9c08a');
    g.fillStyle = '#e8dfc6'; g.fillRect(-12, -8, 12, 3); hl(g, -16, -14, 22);
  }),
  forklift: (g, it) => at(g, it, () => {
    shade(g, 0, 0, 34, 24);
    for (const dy of [-18, 18]) { box(g, -20, dy - 5, 14, 10, '#2f343c', 1.5); box(g, 12, dy - 5, 14, 10, '#2f343c', 1.5); }
    box(g, -26, -14, 52, 28, '#e8a03a'); hl(g, -26, -14, 52);
    box(g, -8, -10, 22, 20, '#cf8a28', 1.5);
    box(g, 26, -10, 26, 4, '#8a8f98', 1.5); box(g, 26, 6, 26, 4, '#8a8f98', 1.5);
    g.strokeStyle = INK; g.lineWidth = 2.4; g.beginPath(); g.moveTo(-8, -14); g.lineTo(-8, -22); g.lineTo(14, -22); g.lineTo(14, -14); g.stroke();
    disc(g, -18, 0, 4, '#e8dfc6', 1.2);
  }),
  van: (g, it) => at(g, it, () => {
    // The crew's getaway van, parked on the grounds with its side door open.
    shade(g, 0, 0, 62, 30);
    box(g, -60, -28, 120, 56, '#d9d4c7'); hl(g, -60, -28, 120);
    box(g, 22, -26, 36, 52, '#a8b0bc', 1.5);
    box(g, 30, -22, 22, 44, '#3d4450', 1.5);
    g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(33, -20, 4, 40);
    g.strokeStyle = INK; g.lineWidth = 1.5; g.strokeRect(-56, -24, 70, 48);
    box(g, -2, 28, 36, 5, '#b8bec8', 1.5);
    g.fillStyle = '#2f343c'; for (const [x, y] of [[-40, -30], [-40, 30], [28, -30], [28, 30]] as const) g.fillRect(x - 9, y - 3, 18, 6);
    g.fillStyle = '#8a2e3c'; g.fillRect(-50, -6, 40, 12); g.fillStyle = '#e8dfc6'; g.fillRect(-46, -3, 22, 2.4); g.fillRect(-46, 1, 14, 2.4);
  }),
  tyre: (g, it) => at(g, it, () => {
    g.strokeStyle = 'rgba(20, 18, 14, 0.22)'; g.lineWidth = 5; g.lineCap = 'round';
    for (const o of [-10, 10]) { g.beginPath(); g.moveTo(-(it.w ?? 4) * C / 2, o); g.quadraticCurveTo(0, o + 8, (it.w ?? 4) * C / 2, o); g.stroke(); }
  }),
  // --- Egypt: the archaeologists' camp, a dropped ladder, a rug under the sarcophagus
  bedroll: (g, it) => at(g, it, () => {
    shade(g, 0, 0, 52, 22); box(g, -52, -20, 104, 40, '#6b7a3e'); hl(g, -52, -20, 104);
    box(g, -52, -20, 26, 40, '#e8dfc6', 1.5); g.fillStyle = '#4a5a2e'; g.fillRect(-20, -18, 70, 36);
    g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 1.5; for (let x = -12; x < 48; x += 14) { g.beginPath(); g.moveTo(x, -16); g.lineTo(x, 16); g.stroke(); }
  }),
  lantern: (g, it) => at(g, it, () => {
    shade(g, 0, 2, 9, 5); box(g, -6, -4, 12, 12, '#6a5a3e', 1.5); g.fillStyle = '#ffb347'; g.fillRect(-3.5, -2, 7, 8);
    g.strokeStyle = INK; g.lineWidth = 2; g.beginPath(); g.arc(0, -4, 5, Math.PI, 0); g.stroke();
  }),
  notebook: (g, it) => at(g, it, () => {
    shade(g, 0, 0, 14, 10); box(g, -12, -9, 24, 18, '#e8e2d0', 1.5);
    g.strokeStyle = 'rgba(30,30,40,0.5)'; g.lineWidth = 1; for (let i = -5; i < 6; i += 4) { g.beginPath(); g.moveTo(-9, i); g.lineTo(9, i); g.stroke(); }
    g.strokeStyle = INK; g.lineWidth = 3; g.beginPath(); g.moveTo(4, 6); g.lineTo(20, -6); g.stroke(); g.strokeStyle = '#c9a36a'; g.lineWidth = 1.6; g.stroke();
  }),
  ladder: (g, it) => at(g, it, () => {
    const L = (it.w ?? 5) * C;
    shade(g, 0, 0, L / 2, 14);
    for (const dy of [-11, 11]) box(g, -L / 2, dy - 2.5, L, 5, '#a3814f', 1.5);
    g.strokeStyle = INK; g.lineWidth = 4.2; for (let x = -L / 2 + 10; x < L / 2; x += 18) { g.beginPath(); g.moveTo(x, -9); g.lineTo(x, 9); g.stroke(); }
    g.strokeStyle = '#c9a36a'; g.lineWidth = 2.4; for (let x = -L / 2 + 10; x < L / 2; x += 18) { g.beginPath(); g.moveTo(x, -9); g.lineTo(x, 9); g.stroke(); }
    g.fillStyle = '#8a2e3c'; g.fillRect(L / 2 - 30, -13, 4, 26);
  }),
  rug: (g, it) => at(g, it, () => {
    const w = (it.w ?? 8) * C, h = (it.h ?? 10) * C, v = it.v ?? 0;
    const [a, b, c] = v === 0 ? ['#6a2a2a', '#2f8f8a', '#d9b24a'] : ['#5a1c28', '#2a3b66', '#d9b24a'];
    g.fillStyle = a; g.fillRect(-w / 2, -h / 2, w, h);
    g.strokeStyle = c; g.lineWidth = 4; g.strokeRect(-w / 2 + 8, -h / 2 + 8, w - 16, h - 16);
    g.strokeStyle = b; g.lineWidth = 6; g.strokeRect(-w / 2 + 20, -h / 2 + 20, w - 40, h - 40);
    g.fillStyle = 'rgba(255,255,255,0.12)'; for (let y = -h / 2 + 34; y < h / 2 - 30; y += 22) for (let x = -w / 2 + 34; x < w / 2 - 30; x += 22) { g.beginPath(); g.moveTo(x, y - 5); g.lineTo(x + 5, y); g.lineTo(x, y + 5); g.lineTo(x - 5, y); g.closePath(); g.fill(); }
    g.fillStyle = c; for (let x = -w / 2; x < w / 2; x += 8) { g.fillRect(x, -h / 2 - 5, 3, 5); g.fillRect(x, h / 2, 3, 5); }
  }),
  helmet: (g, it) => at(g, it, () => { shade(g, 0, 0, 12, 9); disc(g, 0, 0, 10, '#c3c9d3'); g.fillStyle = INK; g.fillRect(-7, -1, 14, 3); g.fillStyle = '#e8ecf2'; g.fillRect(-6, -6, 3, 2); }),
  pith: (g, it) => at(g, it, () => { shade(g, 0, 0, 14, 11); disc(g, 0, 0, 12, '#d9cba0'); disc(g, 0, 0, 6.5, '#e8dcb4', 1.4); g.strokeStyle = '#8a6a3e'; g.lineWidth = 2; g.beginPath(); g.arc(0, 0, 8.5, 0, TAU); g.stroke(); }),
  // --- the vaults
  shards: (g, it) => at(g, it, () => {
    for (const [x, y, s, a] of [[-14, -4, 6, 0.4], [-2, 6, 8, 1.3], [10, -6, 5, 2.4], [16, 5, 7, 0.9], [4, -12, 4, 2], [-20, 8, 5, 2.8]] as const) {
      g.save(); g.translate(x, y); g.rotate(a); g.fillStyle = 'rgba(210, 240, 245, 0.8)'; g.beginPath(); g.moveTo(-s, s * 0.5); g.lineTo(s * 0.4, -s); g.lineTo(s, s * 0.6); g.closePath(); g.fill(); g.strokeStyle = 'rgba(28, 31, 38, 0.7)'; g.lineWidth = 1.2; g.stroke(); g.restore();
    }
  }),
  bag: (g, it) => at(g, it, () => { shade(g, 0, 0, 20, 13); box(g, -18, -11, 36, 22, '#2f343c'); hl(g, -18, -11, 36); g.fillStyle = '#6a7080'; g.fillRect(-18, -2, 36, 3); g.strokeStyle = INK; g.lineWidth = 2; g.beginPath(); g.arc(0, -11, 8, Math.PI, 0); g.stroke(); box(g, -5, -3, 10, 7, '#9aa0a8', 1.3); g.fillStyle = '#e8c13a'; g.fillRect(14, -8, 8, 3); }),
  glove: (g, it) => at(g, it, () => { shade(g, 0, 0, 10, 8); g.fillStyle = '#26282e'; g.beginPath(); g.ellipse(0, 0, 8, 6, 0, 0, TAU); g.fill(); for (let i = -2; i <= 2; i++) g.fillRect(6 + Math.abs(i) * 0.5, i * 2.4 - 1, 6, 2.2); g.strokeStyle = INK; g.lineWidth = 1.2; g.stroke(); }),
  cable: (g, it) => at(g, it, () => {
    // A power cable snipped clean through, its two ends a pace apart.
    g.strokeStyle = INK; g.lineWidth = 6; g.lineCap = 'round'; g.beginPath(); g.moveTo(-60, 0); g.quadraticCurveTo(-30, 14, -8, 6); g.moveTo(10, 4); g.quadraticCurveTo(30, -10, 60, 4); g.stroke();
    g.strokeStyle = '#d9541f'; g.lineWidth = 3.4; g.stroke(); g.fillStyle = '#c9a36a'; g.fillRect(-9, 3, 4, 6); g.fillRect(8, 1, 4, 6);
  }),
  // --- armour hall
  dummy: (g, it) => at(g, it, () => { shade(g, 0, 0, 22, 18); disc(g, 0, 0, 20, '#d9c08a'); disc(g, 0, 0, 14, '#a8552e', 1.5); disc(g, 0, 0, 8, '#d9c08a', 1.4); disc(g, 0, 0, 3, '#a8552e', 1.2); g.strokeStyle = INK; g.lineWidth = 2; for (const [x, y] of [[-26, 10], [24, -14], [8, 24]] as const) { g.beginPath(); g.moveTo(x, y); g.lineTo(x + 12, y - 6); g.stroke(); } }),
  fallensuit: (g, it) => at(g, it, () => {
    // A suit of armour knocked off its stand, the helm rolled clear.
    shade(g, 0, 0, 38, 20);
    box(g, -26, -14, 40, 28, '#a0a6b0'); hl(g, -26, -14, 40);
    g.strokeStyle = 'rgba(30,32,38,0.5)'; g.lineWidth = 1.5; for (let x = -14; x < 12; x += 9) { g.beginPath(); g.moveTo(x, -14); g.lineTo(x, 14); g.stroke(); }
    box(g, 14, -8, 24, 8, '#8a8f98', 1.5); box(g, 14, 2, 22, 8, '#8a8f98', 1.5); box(g, -44, -10, 20, 7, '#8a8f98', 1.5); box(g, -40, 6, 18, 7, '#8a8f98', 1.5);
    g.fillStyle = '#8a2e3c'; g.fillRect(-26, -3, 40, 6);
  }),
  // --- impressionists, modern art, sculpture
  easel: (g, it) => at(g, it, () => {
    shade(g, 0, 8, 26, 22);
    g.strokeStyle = INK; g.lineWidth = 5; g.lineCap = 'round'; for (const [x, y] of [[-22, 18], [22, 18], [0, -22]] as const) { g.beginPath(); g.moveTo(0, -4); g.lineTo(x, y); g.stroke(); }
    g.strokeStyle = '#a3814f'; g.lineWidth = 2.6; for (const [x, y] of [[-22, 18], [22, 18], [0, -22]] as const) { g.beginPath(); g.moveTo(0, -4); g.lineTo(x, y); g.stroke(); }
    box(g, -20, -16, 40, 30, '#f4f2ec');
    if (it.v === 1) {
      // The restorer's half-finished portrait: a toy soldier in a round helmet, the helmet still pencil.
      g.fillStyle = '#6a7a8a'; g.fillRect(-18, -14, 36, 26);
      g.fillStyle = '#e0b88a'; g.beginPath(); g.arc(0, -1, 7, 0, TAU); g.fill();
      g.fillStyle = '#6b7a3e'; g.beginPath(); g.arc(0, -4, 8.5, Math.PI, TAU); g.fill(); g.fillRect(-9, -4, 18, 2.4);
      g.fillStyle = '#4a5a2e'; g.fillRect(-10, 6, 20, 6);
      g.strokeStyle = 'rgba(28,31,38,0.8)'; g.lineWidth = 1.2; g.beginPath(); g.arc(0, -4, 8.5, Math.PI, TAU); g.stroke(); g.setLineDash([2, 2]); g.strokeRect(-17, -13, 34, 24); g.setLineDash([]);
      g.fillStyle = '#d9541f'; g.fillRect(-2, 8, 4, 3);
    } else { g.fillStyle = '#8fb4a6'; g.fillRect(-17, -13, 34, 12); g.fillStyle = '#d9b06a'; g.fillRect(-17, -1, 34, 12); g.fillStyle = '#e0705a'; g.beginPath(); g.arc(8, -6, 4, 0, TAU); g.fill(); g.strokeStyle = 'rgba(28,31,38,0.6)'; g.lineWidth = 1; g.setLineDash([2, 2]); g.strokeRect(-17, -13, 34, 24); g.setLineDash([]); }
    box(g, 22, 12, 14, 9, '#8a6a3e', 1.4); blob(g, 26, 16, 2.4, 1.8, '#e0705a'); blob(g, 31, 16, 2.4, 1.8, '#3e8fa8');
  }),
  stool: (g, it) => at(g, it, () => { shade(g, 0, 0, 11, 8); disc(g, 0, 0, 9, '#8a5a34'); disc(g, 0, 0, 5, '#9a6a3e', 1.2); }),
  sketchbook: (g, it) => at(g, it, () => { shade(g, 0, 0, 13, 9); box(g, -11, -8, 22, 16, '#d9d2a8', 1.5); g.strokeStyle = 'rgba(30,30,40,0.5)'; g.lineWidth = 1; g.beginPath(); g.moveTo(-6, -3); g.quadraticCurveTo(0, -8, 6, 0); g.stroke(); g.strokeStyle = INK; g.lineWidth = 2.6; g.beginPath(); g.moveTo(8, 5); g.lineTo(20, 3); g.stroke(); }),
  paintspill: (g, it) => at(g, it, () => {
    blob(g, 0, 0, 22, 14, 'rgba(224, 112, 90, 0.8)', 0.3); blob(g, 14, 6, 14, 9, 'rgba(62, 143, 168, 0.8)', -0.4); blob(g, -8, -6, 8, 6, 'rgba(232, 193, 58, 0.8)');
    g.strokeStyle = INK; g.lineWidth = 1.2; g.beginPath(); g.ellipse(0, 0, 22, 14, 0.3, 0, TAU); g.stroke();
    disc(g, 30, 14, 9, '#b8bec8', 1.5); g.fillStyle = '#e0705a'; g.beginPath(); g.arc(30, 14, 6, 0, TAU); g.fill();
  }),
  paintprints: (g, it) => at(g, it, () => {
    for (let i = 0; i < 7; i++) { const x = i * 24, y = (i % 2 ? 7 : -7); g.fillStyle = i < 4 ? 'rgba(224, 112, 90, 0.7)' : i < 6 ? 'rgba(224, 112, 90, 0.4)' : 'rgba(224, 112, 90, 0.2)'; g.beginPath(); g.ellipse(x, y, 5, 8, 0.1, 0, TAU); g.fill(); }
  }),
  cart: (g, it) => at(g, it, () => {
    // The cleaner's trolley, left mid-shift: a bucket, a mop in it and a bin bag.
    shade(g, 0, 0, 36, 22); box(g, -32, -18, 64, 36, '#4a7a86'); hl(g, -32, -18, 64);
    box(g, -26, -12, 22, 24, '#2f343c', 1.5); disc(g, 14, -2, 12, '#e8c13a'); disc(g, 14, -2, 8, '#2f343c', 1.3); blob(g, 14, -2, 6, 5, 'rgba(120, 170, 200, 0.8)');
    g.strokeStyle = INK; g.lineWidth = 4.4; g.beginPath(); g.moveTo(14, -2); g.lineTo(46, 18); g.stroke(); g.strokeStyle = '#c9a36a'; g.lineWidth = 2.4; g.stroke();
    g.fillStyle = '#e8e2d0'; g.beginPath(); g.ellipse(48, 19, 8, 5, 0.5, 0, TAU); g.fill(); g.strokeStyle = INK; g.lineWidth = 1.4; g.stroke();
    for (const [x, y] of [[-28, -20], [28, -20], [-28, 20], [28, 20]] as const) disc(g, x, y, 3.2, '#2f343c', 1.2);
  }),
  wetsign: (g, it) => at(g, it, () => {
    // A yellow A-frame "wet floor" sign; v=1 means somebody knocked it flat.
    shade(g, 0, 0, 16, 12);
    if (it.v === 1) { g.fillStyle = '#e8c13a'; g.beginPath(); g.moveTo(-15, 8); g.lineTo(-10, -9); g.lineTo(12, -6); g.lineTo(17, 9); g.closePath(); g.fill(); g.strokeStyle = INK; g.lineWidth = 2; g.stroke(); g.fillStyle = INK; g.fillRect(-4, -4, 9, 2.4); g.fillRect(-3, 0, 7, 2); }
    else { g.fillStyle = '#e8c13a'; g.beginPath(); g.moveTo(-12, 10); g.lineTo(-7, -10); g.lineTo(7, -10); g.lineTo(12, 10); g.closePath(); g.fill(); g.strokeStyle = INK; g.lineWidth = 2; g.stroke(); g.fillStyle = INK; g.fillRect(-4, -5, 8, 2.4); }
  }),
  puddle: (g, it) => at(g, it, () => {
    const w = (it.w ?? 2) * C * 0.5;
    blob(g, 0, 0, w, w * 0.62, 'rgba(110, 170, 200, 0.28)', 0.3); g.strokeStyle = 'rgba(190, 230, 250, 0.4)'; g.lineWidth = 1.6; g.beginPath(); g.ellipse(0, 0, w, w * 0.62, 0.3, 0, TAU); g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.3)'; g.fillRect(-w * 0.4, -w * 0.2, w * 0.3, 2);
  }),
  // --- shop and cafe
  totes: (g, it) => at(g, it, () => { shade(g, 0, 0, 20, 14); for (const [x, y, c] of [[-6, 4, '#b4524a'], [4, -2, '#e8dfc6'], [-2, -8, '#3e8fa8']] as const) { box(g, x - 14, y - 8, 28, 16, c, 1.6); g.fillStyle = 'rgba(255,255,255,0.3)'; g.fillRect(x - 14, y - 8, 28, 2); } }),
  plushpile: (g, it) => at(g, it, () => {
    shade(g, 0, 0, 26, 16);
    for (const [x, y, c] of [[-14, 2, '#6b9a5a'], [6, -4, '#e8806a'], [16, 6, '#6fa8ff'], [-2, 8, '#e8c13a']] as const) { g.fillStyle = c; g.beginPath(); g.ellipse(x, y, 11, 7, 0.3, 0, TAU); g.fill(); g.strokeStyle = INK; g.lineWidth = 1.6; g.stroke(); disc(g, x + 9, y - 3, 4, c, 1.4); g.fillStyle = INK; g.fillRect(x + 10, y - 5, 1.6, 1.6); }
  }),
  coins: (g, it) => at(g, it, () => { for (const [x, y] of [[0, 0], [10, 4], [-8, 8], [16, -6], [4, 14], [26, 10]] as const) disc(g, x, y, 3.6, '#d9b24a', 1.2); box(g, -22, -8, 18, 10, '#6a7080', 1.4); }),
  tray: (g, it) => at(g, it, () => { shade(g, 0, 0, 22, 14); box(g, -20, -12, 40, 24, '#8a8f98'); blob(g, -6, -2, 8, 6, 'rgba(110, 70, 40, 0.8)'); disc(g, 6, 2, 6, '#f4f2ec', 1.4); g.fillStyle = '#b4524a'; g.fillRect(12, -8, 6, 4); }),
  menu: (g, it) => at(g, it, () => { shade(g, 0, 0, 14, 10); g.fillStyle = '#26332a'; g.beginPath(); g.moveTo(-12, 10); g.lineTo(-8, -10); g.lineTo(8, -10); g.lineTo(12, 10); g.closePath(); g.fill(); g.strokeStyle = '#a3814f'; g.lineWidth = 2.4; g.stroke(); g.strokeStyle = 'rgba(240,240,230,0.8)'; g.lineWidth = 1.2; for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(-6, -5 + i * 4); g.lineTo(5 - i, -5 + i * 4); g.stroke(); } }),
  chairs: (g, it) => at(g, it, () => { for (let i = 0; i < 3; i++) { shade(g, 0, i * -3, 12, 9); box(g, -10, -8 - i * 3, 20, 16, i % 2 ? '#8a5a34' : '#6a4426', 1.6); } hl(g, -10, -14, 20); }),
  // --- natural history wing
  snow: (g, it) => at(g, it, () => { blob(g, 0, 4, 28, 16, 'rgba(20, 24, 32, 0.25)'); blob(g, 0, 0, 26, 15, '#e8f0f6'); blob(g, -8, -4, 12, 7, '#ffffff'); g.strokeStyle = INK; g.lineWidth = 1.6; g.beginPath(); g.ellipse(0, 0, 26, 15, 0, 0, TAU); g.stroke(); }),
  snowman: (g, it) => at(g, it, () => { shade(g, 0, 0, 14, 10); disc(g, 0, 4, 11, '#f4f8fb'); disc(g, 0, -8, 7.5, '#f4f8fb'); g.fillStyle = INK; g.fillRect(-3, -10, 1.8, 1.8); g.fillRect(2, -10, 1.8, 1.8); g.fillStyle = '#e8801a'; g.fillRect(0, -7, 5, 2); g.fillStyle = '#b4524a'; g.fillRect(-8, -3, 16, 3); }),
  telescope: (g, it) => at(g, it, () => { shade(g, 0, 4, 22, 18); g.strokeStyle = INK; g.lineWidth = 5; g.lineCap = 'round'; for (const [x, y] of [[-16, 14], [16, 14], [0, -16]] as const) { g.beginPath(); g.moveTo(0, 0); g.lineTo(x, y); g.stroke(); } g.strokeStyle = '#8a8f98'; g.lineWidth = 2.4; for (const [x, y] of [[-16, 14], [16, 14], [0, -16]] as const) { g.beginPath(); g.moveTo(0, 0); g.lineTo(x, y); g.stroke(); } box(g, -6, -26, 12, 30, '#3a4280'); box(g, -8, -30, 16, 6, '#b79a4a', 1.4); }),
  foodpack: (g, it) => at(g, it, () => { shade(g, 0, 0, 10, 7); box(g, -8, -5, 16, 10, '#c0b6ff', 1.5); g.fillStyle = '#e8e0ff'; g.fillRect(-5, -2, 10, 3); }),
  flipflop: (g, it) => at(g, it, () => { shade(g, 0, 0, 8, 12); g.fillStyle = '#e8806a'; g.beginPath(); g.ellipse(0, 0, 6, 11, 0.4, 0, TAU); g.fill(); g.strokeStyle = INK; g.lineWidth = 1.5; g.stroke(); g.strokeStyle = '#f4f2ec'; g.lineWidth = 2; g.beginPath(); g.moveTo(-3, 2); g.lineTo(0, -6); g.lineTo(4, 1); g.stroke(); }),
  // --- lab and kids' corner
  dropcloth: (g, it) => at(g, it, () => { const w = (it.w ?? 3) * C, h = (it.h ?? 2) * C; g.fillStyle = 'rgba(20,24,32,0.25)'; g.fillRect(-w / 2 + 3, -h / 2 + 3, w, h); g.fillStyle = '#e6dfc8'; g.beginPath(); g.moveTo(-w / 2, -h / 2); g.lineTo(w / 2 - 6, -h / 2 + 3); g.lineTo(w / 2, h / 2); g.lineTo(-w / 2 + 5, h / 2 - 4); g.closePath(); g.fill(); g.strokeStyle = 'rgba(28,31,38,0.7)'; g.lineWidth = 1.6; g.stroke(); for (const [x, y, c] of [[-w * 0.2, -h * 0.1, '#b4524a'], [w * 0.2, h * 0.15, '#3e8fa8'], [0, -h * 0.25, '#e8c13a']] as const) blob(g, x, y, 5, 3.4, c); }),
  jars: (g, it) => at(g, it, () => { for (const [x, y] of [[-12, 0], [0, 4], [12, -2]] as const) { shade(g, x, y, 6, 5); disc(g, x, y, 6, '#9fd0d8', 1.4); g.strokeStyle = '#d9541f'; g.lineWidth = 1.6; for (let i = -1; i <= 1; i++) { g.beginPath(); g.moveTo(x + i * 2, y); g.lineTo(x + i * 3, y - 9); g.stroke(); } } }),
  backpack: (g, it) => at(g, it, () => { shade(g, 0, 0, 14, 12); box(g, -12, -11, 24, 22, '#b4524a'); hl(g, -12, -11, 24); box(g, -8, 0, 16, 9, '#8a2e3c', 1.4); g.fillStyle = '#e8c13a'; g.fillRect(-2, -8, 4, 5); }),
  lunchbox: (g, it) => at(g, it, () => { shade(g, 0, 0, 12, 8); box(g, -10, -7, 20, 14, '#3e8fa8', 1.5); g.fillStyle = '#e8dfc6'; g.fillRect(-4, -2, 8, 3); }),
  blocks: (g, it) => at(g, it, () => { shade(g, 0, 0, 20, 14); for (const [x, y, c] of [[-10, 2, '#b4524a'], [6, -4, '#3e8fa8'], [14, 8, '#e8c13a'], [-2, -8, '#6b9a5a']] as const) { box(g, x - 7, y - 7, 14, 14, c, 1.6); g.fillStyle = '#f4f2ec'; g.fillRect(x - 3, y - 3, 6, 6); } }),
  plushhat: (g, it) => at(g, it, () => {
    // A stuffed dinosaur in a paper party hat, propped in the corner.
    shade(g, 0, 0, 17, 13); g.fillStyle = '#6b9a5a'; g.beginPath(); g.ellipse(0, 3, 13, 9, 0, 0, TAU); g.fill(); g.strokeStyle = INK; g.lineWidth = 1.8; g.stroke();
    disc(g, 12, -4, 7, '#6b9a5a', 1.6); g.fillStyle = '#b4524a'; for (const x of [-8, -2, 4]) g.fillRect(x - 1.5, -8, 3, 3);
    g.fillStyle = INK; g.fillRect(14, -6, 1.8, 1.8);
    g.fillStyle = '#d9541f'; g.beginPath(); g.moveTo(8, -9); g.lineTo(16, -9); g.lineTo(13, -20); g.closePath(); g.fill(); g.strokeStyle = INK; g.lineWidth = 1.4; g.stroke(); disc(g, 13, -21, 2.4, '#e8dfc6', 1.1);
  }),
  hopscotch: (g, it) => at(g, it, () => { g.strokeStyle = 'rgba(240, 232, 200, 0.45)'; g.lineWidth = 3; for (let i = 0; i < 5; i++) g.strokeRect(-12 - (i % 2 ? 12 : 0), -i * 26, 24, 26); g.fillStyle = 'rgba(240, 232, 200, 0.5)'; g.beginPath(); g.arc(0, 18, 5, 0, TAU); g.fill(); }),
  // --- the entrance desk: cold coffee, a crossword half done, a radio and the monitors
  desk: (g, it) => at(g, it, () => {
    const w = (it.w ?? 5) * C, h = (it.h ?? 2) * C;
    shade(g, 0, 4, w / 2, h / 2); box(g, -w / 2, -h / 2, w, h, '#8a5a34'); hl(g, -w / 2, -h / 2, w);
    g.fillStyle = BRASS; g.fillRect(-w / 2, h / 2 - 5, w, 3);
    // the crossword and a pencil
    box(g, -w / 2 + 14, -h / 2 + 12, 40, 30, '#f4f2ec', 1.5);
    g.strokeStyle = 'rgba(30,30,40,0.6)'; g.lineWidth = 1; for (let i = 1; i < 6; i++) { g.beginPath(); g.moveTo(-w / 2 + 14 + i * 6.6, -h / 2 + 12); g.lineTo(-w / 2 + 14 + i * 6.6, -h / 2 + 42); g.stroke(); g.beginPath(); g.moveTo(-w / 2 + 14, -h / 2 + 12 + i * 5); g.lineTo(-w / 2 + 54, -h / 2 + 12 + i * 5); g.stroke(); }
    g.fillStyle = INK; for (const [x, y] of [[1, 1], [2, 3], [4, 2], [3, 4]] as const) g.fillRect(-w / 2 + 14 + x * 6.6 + 1, -h / 2 + 12 + y * 5 + 1, 5, 4);
    g.strokeStyle = INK; g.lineWidth = 3; g.beginPath(); g.moveTo(-w / 2 + 40, -h / 2 + 40); g.lineTo(-w / 2 + 62, -h / 2 + 28); g.stroke(); g.strokeStyle = '#e8c13a'; g.lineWidth = 1.5; g.stroke();
    // the mug, long since cold, and a stain beside it
    blob(g, -w / 2 + 84, -h / 2 + 36, 9, 6, 'rgba(70, 40, 20, 0.3)'); disc(g, -w / 2 + 78, -h / 2 + 30, 8, '#f4f2ec'); disc(g, -w / 2 + 78, -h / 2 + 30, 5.4, '#4a2c1a', 1.2); g.strokeStyle = INK; g.lineWidth = 2; g.beginPath(); g.arc(-w / 2 + 88, -h / 2 + 30, 3.4, -1.5, 1.5); g.stroke();
    // the radio and the CCTV monitors
    box(g, w / 2 - 70, -h / 2 + 10, 24, 14, '#3d4450', 1.5); g.fillStyle = '#e8c13a'; g.fillRect(w / 2 - 66, -h / 2 + 14, 8, 3); disc(g, w / 2 - 52, -h / 2 + 17, 3, '#8a8f98', 1.1);
    for (const dx of [-34, -12]) { box(g, w / 2 + dx, -h / 2 + 6, 18, 16, '#1c1f26', 1.6); g.fillStyle = '#26503a'; g.fillRect(w / 2 + dx + 2, -h / 2 + 8, 14, 10); }
    // a note: "back in 5"
    box(g, w / 2 - 28, h / 2 - 28, 16, 14, '#e8e04a', 1.3); g.fillStyle = 'rgba(30,30,40,0.6)'; g.fillRect(w / 2 - 25, h / 2 - 24, 10, 1.2); g.fillRect(w / 2 - 25, h / 2 - 21, 7, 1.2);
    // the chair, pushed back in a hurry
    disc(g, 0, h / 2 + 24, 14, '#3d4450'); g.fillStyle = 'rgba(255,255,255,0.2)'; g.fillRect(-9, h / 2 + 14, 12, 2);
  }),
  coatrack: (g, it) => at(g, it, () => { shade(g, 0, 2, 20, 12); for (let i = -2; i <= 2; i++) { g.fillStyle = ['#2a3b66', '#8a2e3c', '#4a4036', '#6b7a3e', '#3d4450'][i + 2]!; g.beginPath(); g.ellipse(i * 9, 0, 6, 10, 0, 0, TAU); g.fill(); g.strokeStyle = INK; g.lineWidth = 1.5; g.stroke(); } g.strokeStyle = BRASS; g.lineWidth = 2.4; g.beginPath(); g.moveTo(-24, -12); g.lineTo(24, -12); g.stroke(); }),
  mat: (g, it) => at(g, it, () => { const w = (it.w ?? 3) * C, h = (it.h ?? 1.2) * C; g.fillStyle = '#4a4036'; g.fillRect(-w / 2, -h / 2, w, h); g.strokeStyle = '#b79a4a'; g.lineWidth = 2; g.strokeRect(-w / 2 + 5, -h / 2 + 5, w - 10, h - 10); g.fillStyle = 'rgba(255,255,255,0.1)'; for (let x = -w / 2 + 10; x < w / 2 - 6; x += 8) g.fillRect(x, -h / 2 + 8, 3, h - 16); }),
  umbrella: (g, it) => at(g, it, () => { shade(g, 0, 0, 12, 9); disc(g, 0, 0, 10, '#2a3b66'); g.strokeStyle = 'rgba(255,255,255,0.3)'; g.lineWidth = 1.2; for (let k = 0; k < 4; k++) { g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(k * 1.57) * 10, Math.sin(k * 1.57) * 10); g.stroke(); } }),
  flashlight: (g, it) => at(g, it, () => { shade(g, 0, 0, 14, 5); box(g, -12, -3.5, 22, 7, '#2f343c', 1.4); box(g, 10, -5, 7, 10, '#b8bec8', 1.4); g.fillStyle = '#ffe9a0'; g.fillRect(16, -3, 2, 6); }),
  guardcap: (g, it) => at(g, it, () => { shade(g, 0, 0, 12, 8); g.fillStyle = '#2a3b66'; g.beginPath(); g.ellipse(0, 0, 10, 7, 0, 0, TAU); g.fill(); g.strokeStyle = INK; g.lineWidth = 1.6; g.stroke(); g.fillStyle = '#1c2446'; g.fillRect(-4, 4, 12, 3); disc(g, -2, -1, 2.4, '#d9b24a', 1); }),
};

/** Muddy bootprints along a path: alternating left and right, fading as the mud wears off. */
function trail(g: CanvasRenderingContext2D, pts: readonly (readonly [number, number])[], step = 40, alpha = 0.3) {
  let walked = 0, side = 1, n = 0;
  const total = pts.slice(1).reduce((a, p, i) => a + Math.hypot(p[0] - pts[i]![0], p[1] - pts[i]![1]), 0);
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1]!, [x1, y1] = pts[i]!;
    const len = Math.hypot(x1 - x0, y1 - y0), ang = Math.atan2(y1 - y0, x1 - x0);
    for (let t = step - (walked % step); t < len; t += step) {
      const k = (walked + t) / total;
      if (n++ % 7 === 6) continue;
      const px = x0 + Math.cos(ang) * t - Math.sin(ang) * 6 * side, py = y0 + Math.sin(ang) * t + Math.cos(ang) * 6 * side;
      g.save(); g.translate(px, py); g.rotate(ang);
      g.fillStyle = `rgba(52, 36, 22, ${(alpha * (1 - k * 0.7)).toFixed(3)})`;
      g.beginPath(); g.ellipse(0, 0, 8, 4.4, 0, 0, TAU); g.fill(); g.beginPath(); g.ellipse(-9, 0, 4.4, 3.6, 0, 0, TAU); g.fill();
      g.restore(); side = -side;
    }
    walked += len;
  }
}

export const TRAIL: readonly (readonly [number, number])[] = [[330, 2780], [700, 3380], [2450, 3420], [2570, 3600], [2570, 5090], [3480, 5100], [3680, 4960]];
export const TRAIL_OUT: readonly (readonly [number, number])[] = [[420, 2010], [520, 2420], [330, 2700]];

/** Items in cells. Twin halves of the grid get different dressing on purpose: this is how you know which wing you are in. */
export const DECOR: readonly DecorItem[] = [
  // The grounds: the getaway van and where it left the road.
  { k: 'van', x: 3.6, y: 36.5, r: Math.PI / 2 + 0.06 }, { k: 'tyre', x: 3.4, y: 31, r: Math.PI / 2, w: 6 },
  // The loading dock, west: an open container, pallets, a forklift left running.
  { k: 'container', x: 3.4, y: 52.1 }, { k: 'pallet', x: 10.4, y: 52.4, r: 0.2 }, { k: 'pallet', x: 11.4, y: 66.6, r: -0.15 }, { k: 'pallet', x: 1.8, y: 67.2 }, { k: 'forklift', x: 5.2, y: 67.6, r: -0.35 },
  { k: 'bag', x: 9.4, y: 57.6, r: 0.7 }, { k: 'tyre', x: 5, y: 66, w: 4 },
  // Egypt: the diggers' camp, a dropped ladder, the sarcophagus rug and a pith helmet.
  { k: 'bedroll', x: 11.4, y: 45.6, r: 0.25 }, { k: 'lantern', x: 14.4, y: 45, v: 0 }, { k: 'notebook', x: 13.4, y: 43.7, r: 0.4 }, { k: 'pith', x: 10.2, y: 43.6 },
  { k: 'ladder', x: 19.6, y: 10.5, w: 5.5, r: 0.04 }, { k: 'rug', x: 28.5, y: 28.5, w: 9.4, h: 11.4 },
  // The gem vault: sealed, quiet, humming blue.  The treasury: forced.
  { k: 'shards', x: 75.5, y: 106.6 }, { k: 'bag', x: 73.8, y: 107.8, r: 0.5 }, { k: 'glove', x: 77.2, y: 108.6, r: 2.1 }, { k: 'cable', x: 75.6, y: 100.8 },
  // The armour hall: a practice dummy, a knight knocked off his stand, a red rug under the horse.
  { k: 'dummy', x: 108, y: 74.4 }, { k: 'fallensuit', x: 96.8, y: 104.6, r: 0.4 }, { k: 'helmet', x: 99.4, y: 106.2 }, { k: 'rug', x: 90.5, y: 90.5, w: 9.4, h: 11.4, v: 1 },
  // Impressionists: a student's easel and sketchbook.
  { k: 'easel', x: 29.6, y: 77, r: 0.1, v: 0 }, { k: 'stool', x: 27.2, y: 78, r: 0 }, { k: 'sketchbook', x: 31.6, y: 78.4, r: 0.5 },
  // Modern art: a paint spill and the footprints that left it.
  { k: 'paintspill', x: 22, y: 87.4 }, { k: 'paintprints', x: 24, y: 88.4, r: 0.12 },
  // Sculpture: the cleaner's trolley and a wet floor sign knocked flat.
  { k: 'cart', x: 14.8, y: 98.2, r: 0.1 }, { k: 'wetsign', x: 20, y: 98.6, v: 1, r: 0.5 }, { k: 'puddle', x: 18, y: 98.4, w: 2.4 },
  // The gift shop: totes, plush toys and coins from a till somebody emptied.
  { k: 'totes', x: 21.6, y: 103.6 }, { k: 'plushpile', x: 14, y: 109, r: 0.1 }, { k: 'coins', x: 12.2, y: 104.3 },
  // The cafe: the chalk menu, a dropped tray, a stack of chairs.
  { k: 'menu', x: 27.4, y: 103.6 }, { k: 'tray', x: 36.6, y: 109, r: 0.3 }, { k: 'chairs', x: 47.2, y: 108.4 },
  // Ice age: snow drifts and a snowman the night guard built.
  { k: 'snow', x: 108.4, y: 46.6 }, { k: 'snow', x: 72.4, y: 47.4, r: 0.2 }, { k: 'snowman', x: 109.2, y: 41.8 },
  // Space: a telescope left pointing at the roof, a freeze-dried meal.
  { k: 'telescope', x: 107.6, y: 35.4 }, { k: 'foodpack', x: 74.2, y: 36.2, r: 0.4 },
  // Oceans: a leak, a wet floor sign still standing, one flip-flop.
  { k: 'puddle', x: 79.4, y: 24.4, w: 4.4 }, { k: 'wetsign', x: 77.4, y: 26.2, v: 0 }, { k: 'flipflop', x: 82.6, y: 26.6, r: 0.8 },
  // The restoration lab: dust sheets, brush jars and the soldier on the easel.
  { k: 'dropcloth', x: 98.4, y: 11.6, w: 3.2, h: 2.2 }, { k: 'easel', x: 97.2, y: 15, r: -0.1, v: 1 }, { k: 'jars', x: 108.2, y: 15.3 },
  // Kids' corner: a rucksack and lunchbox, toy blocks, the dinosaur in a party hat, a hopscotch grid.
  { k: 'backpack', x: 74.4, y: 16.2, r: 0.6 }, { k: 'lunchbox', x: 76.6, y: 16.6, r: -0.3 }, { k: 'blocks', x: 86.6, y: 10.8 }, { k: 'plushhat', x: 80.4, y: 12.2, r: -0.1 }, { k: 'hopscotch', x: 89.4, y: 16.8, r: 0.1 },
  // The main entrance: the guard's desk (gone for a minute), coats, the doormat, a dropped cap and torch.
  { k: 'desk', x: 112.8, y: 51.6, w: 5, h: 1.9 }, { k: 'coatrack', x: 117.4, y: 67.6 }, { k: 'mat', x: 118.4, y: 60, w: 1.4, h: 3, r: 0 }, { k: 'guardcap', x: 115.4, y: 66 }, { k: 'flashlight', x: 103.4, y: 55.6, r: 0.4 },
  // The halls: a forgotten umbrella, the crew's torch.
  { k: 'umbrella', x: 100.8, y: 67.6 }, { k: 'flashlight', x: 29.8, y: 66.6, r: 2.4 },
];

export function paintDecor(g: CanvasRenderingContext2D) {
  for (const it of DECOR) PAINT[it.k]?.(g, it);
  trail(g, TRAIL);
  trail(g, TRAIL_OUT, 42, 0.28);
}
