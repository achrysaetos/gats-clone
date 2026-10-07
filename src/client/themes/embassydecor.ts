import { INK } from '../palette.ts';
import { BRASS, BRASS_HI, CREAM, CRIMSON, TAU, hexA, inkDisc, inkRect, shadowEllipse, stain } from './embassykit.ts';

/**
 * Hand-placed set dressing for the Embassy, baked into the floor layer. Everything sits in margins, against walls, in corners and
 * beside furniture, never across a lane, drawn low and quiet with the kit's ink and a crisp contact shadow. The story told in
 * it: tonight was the gala. The ambassador's reception was under way (a limousine at the red carpet, the ballroom laid, the
 * quartet tuning up) when the word came, and everyone left at once. A champagne flute lies where its owner dropped it on the red
 * carpet, a high heel beside it. The quartet's chairs are knocked back and a second flute rolled under the ballroom's buffet. In
 * the Office Wing a shredder jammed mid-document and the server room hums on, alone. The kitchen abandoned a souffle. The ambassador's cat
 * sleeps on his chair through all of it, the gardener's thread still runs through the maze, and in the long gallery a toy soldier
 * hangs in a gilt frame under the plaque "OUR MAN IN THE FIELD".
 * Positions are px in the west half's frame; the east list is drawn turned (a half turn about the map centre), in the frame of
 * the room it dresses.
 */

type G = CanvasRenderingContext2D;
export type DecorItem = { k: string; x: number; y: number; r?: number; w?: number; h?: number; v?: number; x2?: number; y2?: number };

const at = (g: G, it: DecorItem, paint: () => void) => { g.save(); g.translate(it.x, it.y); if (it.r) g.rotate(it.r); paint(); g.restore(); };
const hl = (g: G, x: number, y: number, w: number) => { g.fillStyle = 'rgba(255,255,255,0.28)'; g.fillRect(x, y, w, 1.6); };

type P = (g: G, it: DecorItem) => void;
const PAINT: Record<string, P> = {
  rug: (g, it) => at(g, it, () => {
    const w = it.w ?? 300, h = it.h ?? 200, v = it.v ?? 0;
    const [a, b, c] = [['#4a2a38', '#2f4a6a', '#d9b24a'], ['#2f4a3a', '#6a2a2a', '#d9b24a'], ['#5a1c28', '#2a3b66', '#d9b24a'], ['#2f3a58', '#7a8aa8', '#e8dfc6']][v % 4]!;
    g.fillStyle = a; g.fillRect(-w / 2, -h / 2, w, h);
    g.strokeStyle = c; g.lineWidth = 3; g.strokeRect(-w / 2 + 8, -h / 2 + 8, w - 16, h - 16);
    g.strokeStyle = b; g.lineWidth = 6; g.strokeRect(-w / 2 + 18, -h / 2 + 18, w - 36, h - 36);
    g.fillStyle = hexA(c, 0.28); for (let y = -h / 2 + 34; y < h / 2 - 28; y += 22) for (let x = -w / 2 + 34; x < w / 2 - 28; x += 22) { g.beginPath(); g.moveTo(x, y - 5); g.lineTo(x + 5, y); g.lineTo(x, y + 5); g.lineTo(x - 5, y); g.closePath(); g.fill(); }
    g.fillStyle = c; for (let x = -w / 2; x < w / 2; x += 8) { g.fillRect(x, -h / 2 - 5, 3, 5); g.fillRect(x, h / 2, 3, 5); }
  }),
  plant: (g, it) => at(g, it, () => {
    const s = it.w ?? 1;
    shadowEllipse(g, 4 * s, 6 * s, 16 * s, 9 * s);
    inkDisc(g, 0, 0, 13 * s, '#8a5a38'); g.fillStyle = '#3a2a1c'; g.beginPath(); g.arc(0, 0, 10 * s, 0, TAU); g.fill();
    for (let k = 0; k < 9; k++) { const a = k * 0.7 + (it.v ?? 0); g.strokeStyle = INK; g.lineWidth = 4.5 * s; g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(Math.cos(a) * 10 * s, Math.sin(a) * 10 * s - 3, Math.cos(a) * 22 * s, Math.sin(a) * 22 * s); g.stroke(); g.strokeStyle = k % 2 ? '#3f7a3a' : '#5a9a48'; g.lineWidth = 2.8 * s; g.stroke(); }
  }),
  cat: (g, it) => at(g, it, () => {
    // The ambassador's cat asleep on his chair: a ginger loop with a white bib and a tail round its nose.
    shadowEllipse(g, 0, 4, 24, 20); inkDisc(g, 0, 0, 20, '#2f3a58'); inkDisc(g, 0, 0, 14, '#3f4b6e', 1.4);
    g.fillStyle = '#d8872e'; g.beginPath(); g.ellipse(0, 1, 13, 10, 0.3, 0, TAU); g.fill(); g.strokeStyle = INK; g.lineWidth = 1.6; g.stroke();
    g.fillStyle = '#c0731f'; g.beginPath(); g.arc(-8, -5, 5.5, 0, TAU); g.fill(); g.stroke();
    g.fillStyle = '#d8872e'; g.beginPath(); g.moveTo(-12, -9); g.lineTo(-10, -14); g.lineTo(-7, -9); g.fill(); g.beginPath(); g.moveTo(-6, -10); g.lineTo(-3, -14); g.lineTo(-2, -8); g.fill();
    g.strokeStyle = '#e8c07a'; g.lineWidth = 2; g.beginPath(); g.arc(1, 2, 11, 0.2, 2.6); g.stroke();
    g.fillStyle = '#f0e6d0'; g.fillRect(-10, 0, 5, 3);
    g.fillStyle = 'rgba(80,60,40,0.6)'; g.fillRect(-10, -6, 3, 1.2);
  }),
  globe: (g, it) => at(g, it, () => {
    shadowEllipse(g, 3, 5, 18, 12);
    g.strokeStyle = INK; g.lineWidth = 6; g.beginPath(); g.arc(0, 0, 17, 0.5, 5.8); g.stroke(); g.strokeStyle = BRASS_HI; g.lineWidth = 3; g.stroke();
    inkDisc(g, 0, 0, 13, '#4a7ea8'); g.fillStyle = '#6a9a58'; g.beginPath(); g.ellipse(-3, -2, 6, 8, 0.4, 0, TAU); g.fill(); g.beginPath(); g.ellipse(6, 4, 4, 5, -0.3, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.25)'; g.lineWidth = 1; g.beginPath(); g.ellipse(0, 0, 13, 5, 0, 0, TAU); g.stroke(); g.beginPath(); g.ellipse(0, 0, 5, 13, 0, 0, TAU); g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.7)'; g.beginPath(); g.arc(-5, -6, 2, 0, TAU); g.fill();
  }),
  flute: (g, it) => at(g, it, () => {
    // A dropped champagne flute: a pale spill, a few shards, the stem on its side.
    stain(g, 0, 0, 34, 20, '220, 200, 120', 0.3, 0.3);
    for (const [x, y, s, a] of [[-18, -6, 4, 0.4], [-10, 10, 5, 1.3], [16, -8, 3.5, 2.4], [22, 6, 4.5, 0.9], [4, -14, 3, 2]] as const) { g.save(); g.translate(x, y); g.rotate(a); g.fillStyle = 'rgba(215, 240, 246, 0.85)'; g.beginPath(); g.moveTo(-s, s * 0.5); g.lineTo(s * 0.4, -s); g.lineTo(s, s * 0.6); g.closePath(); g.fill(); g.strokeStyle = 'rgba(28,31,38,0.7)'; g.lineWidth = 1; g.stroke(); g.restore(); }
    g.save(); g.rotate(-0.5); g.strokeStyle = INK; g.lineWidth = 4; g.beginPath(); g.moveTo(-4, 0); g.lineTo(18, 0); g.stroke(); g.strokeStyle = 'rgba(220,240,246,0.9)'; g.lineWidth = 2; g.stroke();
    g.fillStyle = 'rgba(215,240,246,0.8)'; g.beginPath(); g.moveTo(-4, -1); g.lineTo(-18, -6); g.lineTo(-18, 6); g.lineTo(-4, 1); g.closePath(); g.fill(); g.strokeStyle = INK; g.lineWidth = 1.4; g.stroke(); g.restore();
  }),
  shoe: (g, it) => at(g, it, () => {
    shadowEllipse(g, 2, 2, 12, 5); g.strokeStyle = INK; g.lineWidth = 6; g.lineCap = 'round'; g.beginPath(); g.moveTo(-10, 0); g.quadraticCurveTo(0, -5, 10, 0); g.moveTo(10, 0); g.lineTo(14, 8); g.stroke();
    g.strokeStyle = '#c0392b'; g.lineWidth = 3.4; g.stroke(); g.lineCap = 'butt';
    g.fillStyle = '#c0392b'; g.beginPath(); g.ellipse(-8, 0, 6, 4, 0, 0, TAU); g.fill(); g.strokeStyle = INK; g.lineWidth = 1.2; g.stroke();
  }),
  shredder: (g, it) => at(g, it, () => {
    // The shredder that jammed mid-document: a half-fed page, a heap of strips under it, a red light on.
    shadowEllipse(g, 4, 8, 28, 18);
    for (let i = 0; i < 22; i++) { g.fillStyle = i % 3 ? '#e8e2d0' : '#d8d2c0'; g.save(); g.translate(-18 + (i * 7) % 40, 20 + ((i * 5) % 12)); g.rotate((i * 0.9) % 3); g.fillRect(0, 0, 14, 2); g.restore(); }
    inkRect(g, -22, -16, 44, 32, '#4a4f58'); hl(g, -22, -16, 44);
    g.fillStyle = '#1c1f26'; g.fillRect(-16, -6, 32, 5);
    g.fillStyle = '#f0ead8'; g.fillRect(-8, -22, 16, 18); g.strokeStyle = INK; g.lineWidth = 1.2; g.strokeRect(-8, -22, 16, 18);
    g.fillStyle = '#8a2e3c'; g.fillRect(-6, -19, 12, 2); g.fillStyle = 'rgba(30,30,40,0.5)'; for (let i = 0; i < 3; i++) g.fillRect(-6, -14 + i * 3, 12, 1);
    g.fillStyle = '#ff3b30'; g.beginPath(); g.arc(14, 8, 2.4, 0, TAU); g.fill();
  }),
  papers: (g, it) => at(g, it, () => {
    const n = it.v ?? 8;
    for (let i = 0; i < n; i++) { g.save(); g.translate(((i * 37) % 70) - 35, ((i * 53) % 44) - 22); g.rotate(i * 1.3); g.fillStyle = i % 2 ? '#e8e2d0' : '#f0ead8'; g.fillRect(-9, -6, 18, 12); g.strokeStyle = 'rgba(28,31,38,0.7)'; g.lineWidth = 1.1; g.strokeRect(-9, -6, 18, 12); g.fillStyle = 'rgba(40,40,60,0.4)'; g.fillRect(-6, -2, 11, 1); g.fillRect(-6, 1, 8, 1); g.restore(); }
  }),
  cone: (g, it) => at(g, it, () => { shadowEllipse(g, 2, 3, 8, 5); g.fillStyle = '#2a2d34'; g.fillRect(-8, 2, 16, 4); g.fillStyle = '#ff7a2a'; g.beginPath(); g.moveTo(-6, 3); g.lineTo(0, -9); g.lineTo(6, 3); g.closePath(); g.fill(); g.strokeStyle = INK; g.lineWidth = 1.4; g.stroke(); g.fillStyle = '#f0ead8'; g.fillRect(-3.4, -2, 6.8, 2.6); }),
  stanchions: (g, it) => {
    const x1 = it.x, y1 = it.y, x2 = it.x2 ?? x1, y2 = it.y2 ?? y1;
    const n = Math.max(1, Math.round(Math.hypot(x2 - x1, y2 - y1) / 90));
    const post = (i: number) => ({ x: x1 + ((x2 - x1) * i) / n, y: y1 + ((y2 - y1) * i) / n });
    g.lineCap = 'round';
    for (const [w, color] of [[5.5, INK], [3, '#8a2e3c']] as const) { g.strokeStyle = color; g.lineWidth = w; for (let i = 0; i < n; i++) { const a = post(i), b = post(i + 1); g.beginPath(); g.moveTo(a.x, a.y - 10); g.quadraticCurveTo((a.x + b.x) / 2, (a.y + b.y) / 2 - 1, b.x, b.y - 10); g.stroke(); } }
    for (let i = 0; i <= n; i++) { const p = post(i); shadowEllipse(g, p.x + 3, p.y + 2, 7, 3.4); inkDisc(g, p.x, p.y, 5, '#2f343c', 1.2); g.strokeStyle = INK; g.lineWidth = 4.4; g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x, p.y - 10); g.stroke(); g.strokeStyle = BRASS; g.lineWidth = 2.2; g.stroke(); inkDisc(g, p.x, p.y - 11, 3.6, BRASS_HI, 1.2); }
    g.lineCap = 'butt';
  },
  chair: (g, it) => at(g, it, () => { shadowEllipse(g, 3, 4, 14, 11); inkRect(g, -10, -9, 20, 18, it.v ? '#7a2e3a' : '#2f3a58', 1.6); g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(-10, 5, 20, 4); hl(g, -10, -9, 20); }),
  cello: (g, it) => at(g, it, () => { shadowEllipse(g, 3, 4, 30, 14); g.fillStyle = '#8a4a22'; g.beginPath(); g.ellipse(0, 0, 22, 12, 0, 0, TAU); g.fill(); g.strokeStyle = INK; g.lineWidth = 1.8; g.stroke(); g.fillStyle = '#6a3414'; g.beginPath(); g.ellipse(-4, 0, 9, 7, 0, 0, TAU); g.fill(); g.strokeStyle = INK; g.lineWidth = 3.6; g.beginPath(); g.moveTo(20, 0); g.lineTo(48, 0); g.stroke(); g.strokeStyle = '#2a2018'; g.lineWidth = 2; g.stroke(); g.strokeStyle = 'rgba(255,240,200,0.6)'; g.lineWidth = 1; for (const y of [-2, 0, 2]) { g.beginPath(); g.moveTo(10, y); g.lineTo(46, y); g.stroke(); } g.strokeStyle = INK; g.lineWidth = 3.4; g.beginPath(); g.moveTo(-8, -20); g.lineTo(26, 14); g.stroke(); g.strokeStyle = '#a8743f'; g.lineWidth = 1.8; g.stroke(); }),
  stand: (g, it) => at(g, it, () => { shadowEllipse(g, 2, 3, 10, 6); inkDisc(g, 0, 0, 5, '#2a2d34', 1.2); inkRect(g, -8, -14, 16, 11, '#e8e2d0', 1.2); g.fillStyle = 'rgba(30,30,40,0.5)'; for (let i = 0; i < 3; i++) g.fillRect(-6, -12 + i * 3, 12, 1); }),
  boxes: (g, it) => at(g, it, () => { for (const [x, y, w, h, a, c] of [[-14, 0, 26, 20, 0.2, '#c9b790'], [14, -6, 24, 18, -0.4, '#b8a77c'], [2, 18, 22, 16, 0.9, '#d5c6a0'], [-26, 22, 20, 14, -0.2, '#c0ae84']] as const) { g.save(); g.translate(x, y); g.rotate(a); inkRect(g, -w / 2, -h / 2, w, h, c, 1.5); g.fillStyle = '#f0ebdc'; g.fillRect(-w / 2 + 4, -3, 10, 5); g.restore(); } }),
  sundial: (g, it) => at(g, it, () => { shadowEllipse(g, 4, 5, 22, 14); inkDisc(g, 0, 0, 20, '#c8c0a6'); g.strokeStyle = 'rgba(60,50,36,0.6)'; g.lineWidth = 1.2; for (let k = 0; k < 12; k++) { const a = (k / 12) * TAU; g.beginPath(); g.moveTo(Math.cos(a) * 12, Math.sin(a) * 12); g.lineTo(Math.cos(a) * 18, Math.sin(a) * 18); g.stroke(); } g.fillStyle = BRASS; g.beginPath(); g.moveTo(0, 0); g.lineTo(16, -4); g.lineTo(0, 6); g.closePath(); g.fill(); g.strokeStyle = INK; g.lineWidth = 1.2; g.stroke(); }),
  thread: (g, it) => {
    // The gardener's red thread through the maze, still running from the gate to the middle.
    const pts = [[it.x, it.y], [it.x + 40, it.y - 60], [it.x - 30, it.y - 150], [it.x + 20, it.y - 260], [it.x + 120, it.y - 330], [it.x + 220, it.y - 300], [it.x + 330, it.y - 350]] as const;
    g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
    for (const [w, c] of [[3.4, 'rgba(20,20,24,0.55)'], [1.8, 'rgba(210, 70, 70, 0.95)']] as const) { g.strokeStyle = c; g.lineWidth = w; g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) g.quadraticCurveTo(pts[i - 1][0] + 30, pts[i - 1][1] - 20, pts[i][0], pts[i][1]); g.stroke(); }
    g.restore();
    inkDisc(g, it.x, it.y + 6, 7, '#c8433f', 1.3);
  },
  hat: (g, it) => at(g, it, () => { shadowEllipse(g, 3, 3, 14, 8); inkDisc(g, 0, 0, 13, '#d9cba0'); inkDisc(g, 0, 0, 7, '#e8dcb4', 1.2); g.strokeStyle = '#8a2e3c'; g.lineWidth = 2; g.beginPath(); g.arc(0, 0, 9, 0, TAU); g.stroke(); }),
  hose: (g, it) => at(g, it, () => { for (const r of [14, 10, 6]) { g.strokeStyle = INK; g.lineWidth = 5; g.beginPath(); g.arc(0, 0, r, 0, TAU); g.stroke(); g.strokeStyle = '#3f8a5a'; g.lineWidth = 3; g.stroke(); } g.strokeStyle = '#3f8a5a'; g.lineWidth = 3; g.beginPath(); g.moveTo(14, 0); g.quadraticCurveTo(30, 6, 44, -10); g.stroke(); }),
  barrow: (g, it) => at(g, it, () => { shadowEllipse(g, 4, 5, 26, 14); inkRect(g, -22, -12, 36, 24, '#3f6a8a', 1.8); g.fillStyle = '#4a3a2a'; g.fillRect(-18, -8, 28, 16); g.strokeStyle = INK; g.lineWidth = 3.4; g.beginPath(); g.moveTo(14, -6); g.lineTo(40, -10); g.moveTo(14, 6); g.lineTo(40, 10); g.stroke(); inkDisc(g, -26, 0, 5, '#2a2d34', 1.2); }),
  bikes: (g, it) => at(g, it, () => { for (let i = 0; i < 3; i++) { const y = -30 + i * 30; g.strokeStyle = INK; g.lineWidth = 4; g.beginPath(); g.ellipse(-10, y, 11, 4, 0, 0, TAU); g.ellipse(14, y, 11, 4, 0, 0, TAU); g.moveTo(-10, y); g.lineTo(14, y); g.stroke(); g.strokeStyle = ['#c0392b', '#2f6a9a', '#6a9a3a'][i]!; g.lineWidth = 2; g.stroke(); } g.strokeStyle = '#8a8f98'; g.lineWidth = 3; g.beginPath(); g.moveTo(-22, -42); g.lineTo(-22, 42); g.stroke(); }),
  ashstand: (g, it) => at(g, it, () => { shadowEllipse(g, 3, 3, 12, 7); inkDisc(g, 0, 0, 9, '#4a4f58'); g.fillStyle = '#6a6460'; g.beginPath(); g.arc(0, 0, 6, 0, TAU); g.fill(); g.fillStyle = '#e8e2d0'; for (let i = 0; i < 6; i++) g.fillRect(-4 + i * 1.6, -2 + (i % 3) * 2, 2, 1.2); for (let i = 0; i < 9; i++) { g.save(); g.translate(14 + (i * 7) % 26, 8 + ((i * 11) % 16)); g.rotate(i); g.fillStyle = '#e8e2d0'; g.fillRect(-2.5, -1, 5, 2); g.restore(); } }),
  cage: (g, it) => at(g, it, () => { shadowEllipse(g, 4, 6, 20, 12); inkDisc(g, 0, 0, 17, 'rgba(210,190,120,0.35)'); g.strokeStyle = BRASS; g.lineWidth = 1.6; for (let k = 0; k < 10; k++) { const a = (k / 10) * TAU; g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a) * 17, Math.sin(a) * 17); g.stroke(); } inkDisc(g, 0, 0, 7, '#4fae4a', 1.3); inkDisc(g, 3, -3, 3.6, '#e84a3a', 1); g.fillStyle = '#e8c23a'; g.fillRect(5, -3, 4, 2); }),
  gate: (g, it) => at(g, it, () => {
    // A boom barrier across the drive: red and white arm on its housing, the arm up.
    shadowEllipse(g, 4, 6, 14, 12); inkRect(g, -10, -12, 20, 24, '#d9b24a', 1.8); hl(g, -10, -12, 20);
    for (let i = 0; i < 6; i++) { g.fillStyle = i & 1 ? '#c0392b' : '#f0ead8'; g.fillRect(10 + i * 14, -3, 14, 6); }
    g.strokeStyle = INK; g.lineWidth = 2; g.strokeRect(10, -3, 84, 6);
  }),
  tyres: (g, it) => at(g, it, () => { for (const [x, y] of [[-12, -8], [12, -6], [0, 14]] as const) { shadowEllipse(g, x + 3, y + 3, 14, 12); inkDisc(g, x, y, 13, '#2a2d34'); inkDisc(g, x, y, 6, '#6a6f78', 1.3); } }),
  hand: (g, it) => at(g, it, () => { shadowEllipse(g, 3, 4, 18, 12); inkRect(g, -14, -9, 28, 18, '#3f6a8a', 1.6); g.strokeStyle = INK; g.lineWidth = 3.2; g.beginPath(); g.moveTo(-14, -6); g.lineTo(-30, -14); g.moveTo(-14, 6); g.lineTo(-30, 14); g.stroke(); inkDisc(g, 14, 0, 5, '#2a2d34', 1.2); }),
  flour: (g, it) => at(g, it, () => { stain(g, 0, 0, 60, 40, '240, 236, 226', 0.4, 0.4); inkRect(g, 20, -10, 30, 20, '#9aa4ae', 1.5); inkDisc(g, 28, 0, 7, '#e8c860', 1.2); g.fillStyle = '#e8e2d0'; for (let i = 0; i < 12; i++) { g.beginPath(); g.arc(((i * 17) % 80) - 40, ((i * 29) % 50) - 25, 2.4, 0, TAU); g.fill(); } }),
  pot: (g, it) => at(g, it, () => { shadowEllipse(g, 3, 3, 14, 9); inkDisc(g, 0, 0, 12, '#9aa4ae'); inkDisc(g, 0, 0, 8, '#6a727c', 1.2); g.strokeStyle = INK; g.lineWidth = 3.4; g.beginPath(); g.moveTo(12, 0); g.lineTo(26, 0); g.stroke(); g.strokeStyle = '#4a4f58'; g.lineWidth = 1.8; g.stroke(); }),
  dumpster: (g, it) => at(g, it, () => { shadowEllipse(g, 4, 5, 34, 18); inkRect(g, -32, -16, 64, 32, '#3f6a4a', 1.8); hl(g, -32, -16, 64); g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(-28, -12, 56, 8); g.fillStyle = '#e8e2d0'; g.fillRect(-26, 4, 20, 3); }),
  barrier: (g, it) => at(g, it, () => { const L = it.w ?? 120; for (let i = 0; i < L / 14; i++) { g.fillStyle = i & 1 ? '#ffd34d' : '#2a2d34'; g.fillRect(-L / 2 + i * 14, -3, 14, 6); } g.strokeStyle = INK; g.lineWidth = 2; g.strokeRect(-L / 2, -3, L, 6); }),
  tape: (g, it) => at(g, it, () => { g.fillStyle = hexA('#ffd34d', 0.6); g.fillRect(-(it.w ?? 80) / 2, -2, it.w ?? 80, 4); }),
  clock: (g, it) => at(g, it, () => { inkDisc(g, 0, 0, 7, '#e8e2d0', 1.4); g.strokeStyle = INK; g.lineWidth = 1.3; g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -5); g.moveTo(0, 0); g.lineTo(4, 1); g.stroke(); }),
  coffee: (g, it) => at(g, it, () => { stain(g, 0, 4, 26, 18, '60, 36, 20', 0.55, 0.3); inkDisc(g, -10, -4, 5, '#e8e2d0', 1.2); g.fillStyle = '#6a4030'; g.beginPath(); g.arc(-10, -4, 3, 0, TAU); g.fill(); }),
  badge: (g, it) => at(g, it, () => { inkRect(g, -7, -5, 14, 10, '#e8e2d0', 1.2); g.fillStyle = '#2f4a6a'; g.fillRect(-7, -5, 14, 3); g.strokeStyle = '#8a8f98'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(-3, -5); g.quadraticCurveTo(-4, -16, 4, -18); g.stroke(); }),
  duck: (g, it) => at(g, it, () => { shadowEllipse(g, 1, 2, 5, 3); inkDisc(g, 0, 0, 4.4, '#ffd34d', 1.1); inkDisc(g, 3, -3, 2.6, '#ffd34d', 1); g.fillStyle = '#ff8a2a'; g.fillRect(5, -3.6, 3, 1.6); }),
  rose: (g, it) => at(g, it, () => { const w = it.w ?? 70, h = it.h ?? 44; g.fillStyle = '#3a2a1c'; g.fillRect(-w / 2, -h / 2, w, h); g.strokeStyle = INK; g.lineWidth = 2; g.strokeRect(-w / 2, -h / 2, w, h); for (let i = 0; i < (w * h) / 150; i++) { g.fillStyle = ['#b03a48', '#d8d0c0', '#c85a6a', '#3f7a3a'][i % 4]!; g.beginPath(); g.arc(-w / 2 + 6 + ((i * 23) % (w - 12)), -h / 2 + 6 + ((i * 37) % (h - 12)), 3.4, 0, TAU); g.fill(); } }),
  trellis: (g, it) => at(g, it, () => { const w = it.w ?? 80; g.strokeStyle = INK; g.lineWidth = 4; g.beginPath(); g.moveTo(-w / 2, 0); g.lineTo(w / 2, 0); g.stroke(); g.strokeStyle = '#e8e2d0'; g.lineWidth = 2; g.stroke(); for (let x = -w / 2; x < w / 2; x += 12) { g.fillStyle = '#3f7a3a'; g.beginPath(); g.arc(x + 4, -3, 4, 0, TAU); g.fill(); g.fillStyle = '#d86a7a'; g.beginPath(); g.arc(x + 9, 2, 2.6, 0, TAU); g.fill(); } }),
};

/** West half: the Office Wing, the Lobby and its lawn. */
export const WEST_DECOR: readonly DecorItem[] = [
  // The Ambassador's Suite.
  { k: 'rug', x: 1200, y: 470, w: 430, h: 300, v: 0 }, { k: 'cat', x: 1200, y: 355 }, { k: 'globe', x: 1600, y: 170 },
  { k: 'plant', x: 880, y: 640 }, { k: 'plant', x: 1760, y: 640, v: 2 }, { k: 'coffee', x: 1150, y: 540 }, { k: 'papers', x: 1370, y: 560, v: 5 },
  // The secretary's anteroom and the conference room.
  { k: 'chair', x: 1650, y: 410, r: 0.3 }, { k: 'plant', x: 1740, y: 130 },
  { k: 'plant', x: 2130, y: 150 }, { k: 'plant', x: 2870, y: 150, v: 3 }, { k: 'coffee', x: 2630, y: 330 }, { k: 'papers', x: 2390, y: 610, v: 4 },
  // The spine and its corridors: plants, a water cooler's puddle.
  { k: 'plant', x: 1900, y: 130 }, { k: 'plant', x: 2000, y: 2510, v: 1 }, { k: 'plant', x: 1900, y: 2510 }, { k: 'plant', x: 2000, y: 130, v: 4 },
  // Open plan: the duck, a spilled coffee, plants.
  { k: 'plant', x: 900, y: 1040 }, { k: 'plant', x: 1760, y: 1620, v: 5 }, { k: 'duck', x: 1000, y: 1090 }, { k: 'coffee', x: 1450, y: 1090 }, { k: 'papers', x: 1100, y: 1580, v: 6 },
  // Comms and print: the shredder jammed mid-document, and the page that tried to follow.
  { k: 'shredder', x: 2790, y: 1230, r: 1.57 }, { k: 'papers', x: 2700, y: 1380, v: 9 }, { k: 'papers', x: 2600, y: 1520, v: 5 }, { k: 'plant', x: 2130, y: 1620 },
  // Server room: a crash cart's mess of cables is in the lights; boxes of spare disks.
  { k: 'boxes', x: 1380, y: 2150 }, { k: 'tape', x: 1200, y: 1990, w: 200 },
  // Cafeteria.
  { k: 'plant', x: 2130, y: 2060, v: 2 }, { k: 'plant', x: 2870, y: 2520 }, { k: 'coffee', x: 2300, y: 2300 },
  // Flag gallery, lobby and checkpoint.
  { k: 'plant', x: 880, y: 2640 }, { k: 'plant', x: 880, y: 3060, v: 3 }, { k: 'badge', x: 1560, y: 3210 }, { k: 'plant', x: 2540, y: 3260 },
  { k: 'shoe', x: 1990, y: 4880, r: 0.6 }, { k: 'barrier', x: 1250, y: 4070, w: 220 }, { k: 'barrier', x: 2100, y: 4070, w: 220 },
  { k: 'plant', x: 880, y: 4120 }, { k: 'plant', x: 2530, y: 4130, v: 1 },
  // The red carpet: stanchions along both edges, the dropped flute and the heel.
  { k: 'stanchions', x: 1880, y: 4300, x2: 1880, y2: 4980 }, { k: 'stanchions', x: 2060, y: 4300, x2: 2060, y2: 4980 },
  { k: 'flute', x: 1960, y: 4790 }, { k: 'badge', x: 2100, y: 5010 },
  // The front lawn: a valet stand's cones, flower beds, a bench of cones at the gate.
  { k: 'rose', x: 1100, y: 4400, w: 150, h: 60 }, { k: 'rose', x: 2500, y: 4420, w: 150, h: 60 }, { k: 'cone', x: 2330, y: 5130 }, { k: 'cone', x: 2370, y: 5130 }, { k: 'cone', x: 2410, y: 5130 },
  // The staging yard and the gate house.
  { k: 'cone', x: 330, y: 5170 }, { k: 'cone', x: 380, y: 5170 }, { k: 'cone', x: 430, y: 5170 }, { k: 'tyres', x: 160, y: 5860 }, { k: 'tape', x: 640, y: 5300, w: 100, r: 1.57 },
  { k: 'gate', x: 780, y: 5260 }, { k: 'barrier', x: 650, y: 5190, w: 100, r: 0 },
  // The Valet Garage.
  { k: 'tyres', x: 2150, y: 5780 }, { k: 'tyres', x: 2700, y: 5760 }, { k: 'hand', x: 2480, y: 5600 },
  // The Topiary Garden: the gardener's tools, a bed of roses, a gnome (see the over layer), a birdbath.
  { k: 'barrow', x: 140, y: 1710 }, { k: 'hose', x: 215, y: 1260 }, { k: 'sundial', x: 450, y: 1010 }, { k: 'plant', x: 150, y: 2400, v: 2 }, { k: 'hat', x: 460, y: 2180 },
  // The smokers' court: bikes, an ash stand, a stub-strewn corner.
  { k: 'bikes', x: 140, y: 3480 }, { k: 'ashstand', x: 600, y: 4040 }, { k: 'plant', x: 640, y: 3180 }, { k: 'cone', x: 400, y: 4200 },
  // Front steps and the north terrace.
  { k: 'plant', x: 2750, y: 3200 }, { k: 'plant', x: 2750, y: 4160, v: 4 }, { k: 'plant', x: 3100, y: 1900 },
];

/** East half, in the frame of the rooms its rotation makes (drawn turned): the Residence, the Kitchen, the Garden Maze. */
export const EAST_DECOR: readonly DecorItem[] = [
  // The Library: a green rug, a chess game left mid-match, armchairs.
  { k: 'rug', x: 1220, y: 470, w: 400, h: 280, v: 1 }, { k: 'plant', x: 880, y: 640, v: 3 }, { k: 'plant', x: 1760, y: 640 }, { k: 'papers', x: 1430, y: 330, v: 3 }, { k: 'globe', x: 1690, y: 200 },
  { k: 'cat', x: 1500, y: 600 },
  // The Ballroom: the quartet's chairs knocked back, a cello on its side, music stands, a flute rolled under the buffet.
  { k: 'cello', x: 2250, y: 520, r: 0.4 }, { k: 'stand', x: 2350, y: 430 }, { k: 'stand', x: 2420, y: 470 }, { k: 'stand', x: 2490, y: 440 }, { k: 'stand', x: 2560, y: 480 },
  { k: 'chair', x: 2300, y: 600, r: 1.2, v: 1 }, { k: 'chair', x: 2650, y: 600, r: -0.5, v: 1 }, { k: 'chair', x: 2760, y: 300, r: 2.4, v: 1 }, { k: 'flute', x: 2640, y: 640 },
  { k: 'papers', x: 2480, y: 560, v: 7 }, { k: 'plant', x: 2130, y: 150, v: 1 }, { k: 'plant', x: 2870, y: 150 },
  // The Grand Staircase and the Residence's corridors: palms, a dropped glove.
  { k: 'plant', x: 900, y: 1040, v: 2 }, { k: 'plant', x: 1760, y: 1620 }, { k: 'plant', x: 1900, y: 130 }, { k: 'plant', x: 2000, y: 2510 }, { k: 'shoe', x: 1320, y: 1560, r: 2 },
  // The Dining Room: a toppled candelabra, scattered place cards.
  { k: 'papers', x: 2300, y: 1250, v: 6 }, { k: 'pot', x: 2260, y: 1500 }, { k: 'plant', x: 2130, y: 1620 }, { k: 'coffee', x: 2700, y: 1200 },
  // The Archives: spilled file boxes and the papers that fell out of them.
  { k: 'boxes', x: 1100, y: 2160 }, { k: 'papers', x: 1220, y: 2330, v: 10 }, { k: 'boxes', x: 1380, y: 2400 },
  // The Conservatory: a parrot in its cage, palms.
  { k: 'cage', x: 2760, y: 2080 }, { k: 'plant', x: 2130, y: 2060, v: 3 }, { k: 'plant', x: 2870, y: 2520, v: 2 },
  // The Portrait Gallery and the Kitchen: a souffle pan upside down, flour, pots on the floor.
  { k: 'plant', x: 880, y: 2640, v: 4 }, { k: 'plant', x: 880, y: 3060 }, { k: 'stanchions', x: 1500, y: 2640, x2: 2000, y2: 2640 },
  { k: 'flour', x: 1700, y: 3560 }, { k: 'pot', x: 1560, y: 3640 }, { k: 'pot', x: 1830, y: 3610 }, { k: 'coffee', x: 1230, y: 3200 },
  { k: 'barrier', x: 1250, y: 4070, w: 220 }, { k: 'barrier', x: 2100, y: 4070, w: 220 }, { k: 'badge', x: 1560, y: 4020 },
  // The Service Lot and the Loading Bay.
  { k: 'dumpster', x: 2700, y: 4500 }, { k: 'dumpster', x: 2300, y: 4440 }, { k: 'cone', x: 2330, y: 5130 }, { k: 'cone', x: 2370, y: 5130 },
  { k: 'boxes', x: 2150, y: 5780 }, { k: 'hand', x: 2480, y: 5600 }, { k: 'tyres', x: 2700, y: 5760 }, { k: 'barrier', x: 650, y: 5190, w: 100 }, { k: 'gate', x: 780, y: 5260 }, { k: 'cone', x: 330, y: 5170 }, { k: 'cone', x: 380, y: 5170 },
  // The Garden Maze: the thread, a sundial at the crossing, a straw hat, a rose bed.
  { k: 'thread', x: 150, y: 2480 }, { k: 'sundial', x: 450, y: 1330 }, { k: 'hat', x: 205, y: 1530 }, { k: 'rose', x: 130, y: 600, w: 70, h: 90 }, { k: 'hose', x: 470, y: 2150 },
  // The East Court: rose beds and trellises.
  { k: 'rose', x: 180, y: 3300, w: 80, h: 140 }, { k: 'rose', x: 180, y: 3900, w: 80, h: 140 }, { k: 'trellis', x: 400, y: 3600, w: 150 }, { k: 'plant', x: 640, y: 3180, v: 2 },
  { k: 'plant', x: 2750, y: 3200 }, { k: 'plant', x: 2750, y: 4160, v: 4 },
];

export function paintDecor(g: G, rand: () => number): void {
  void rand; void CREAM; void CRIMSON;
  for (const it of WEST_DECOR) PAINT[it.k]?.(g, it);
  g.save(); g.translate(6000, 6000); g.rotate(Math.PI);
  for (const it of EAST_DECOR) PAINT[it.k]?.(g, it);
  g.restore();
}
