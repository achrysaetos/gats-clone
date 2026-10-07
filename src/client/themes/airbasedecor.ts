import { SIZE } from '../../shared/maps/airbasedata.ts';
import { INK } from '../palette.ts';
import type { ThemeView } from './registry.ts';

/**
 * Hand-placed stories for Kestrel Field, drawn over the floor and under the bodies. West-half coordinates; each is drawn
 * twice, the twin turned half a turn but telling its own version (OP LANTERN or OP SPARROW on the crib's board, a poker hand
 * or a chess game on the mess tables, a cigarette or a pipe at the gate booth). Everything moves slowly or not at all.
 */
type G = CanvasRenderingContext2D;
const TAU = Math.PI * 2;
const BONE = '#e2dccb';
const FONT = (px: number) => `700 ${px}px "Barlow Condensed", "Arial Narrow", sans-serif`;
const calm = (() => { try { return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } })();
const inView = (v: ThemeView, x: number, y: number, r: number) => x + r >= v.x0 && x - r <= v.x1 && y + r >= v.y0 && y - r <= v.y1;

function say(g: G, s: string, x: number, y: number, px: number, fill: string, rot = 0) {
  g.save(); g.translate(x, y); g.rotate(rot); g.font = FONT(px); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = fill; g.fillText(s, 0, 0); g.restore();
}
const shadow = (g: G, x: number, y: number, rx: number, ry: number) => { g.fillStyle = 'rgba(10,12,18,0.32)'; g.beginPath(); g.ellipse(x + 3, y + 4, rx, ry, 0, 0, TAU); g.fill(); };

function missionBoard(g: G, x: number, y: number, twin: boolean) {
  g.fillStyle = 'rgba(10,12,18,0.3)'; g.fillRect(x + 4, y + 5, 170, 54);
  g.fillStyle = '#7a5a34'; g.fillRect(x, y, 170, 54); g.strokeStyle = INK; g.lineWidth = 2; g.strokeRect(x, y, 170, 54);
  g.fillStyle = '#c8bfa4'; g.fillRect(x + 6, y + 6, 74, 42); g.strokeRect(x + 6, y + 6, 74, 42);
  g.strokeStyle = '#4a6a52'; g.lineWidth = 2; g.beginPath(); g.moveTo(x + 14, y + 38); g.quadraticCurveTo(x + 40, y + 10, x + 70, y + 30); g.stroke();
  g.fillStyle = '#b4524a'; g.beginPath(); g.arc(x + 70, y + 30, 3.5, 0, TAU); g.fill();
  g.fillStyle = '#e2dccb'; g.fillRect(x + 88, y + 8, 36, 20); g.fillRect(x + 128, y + 12, 34, 24); g.fillRect(x + 90, y + 32, 40, 16);
  say(g, twin ? 'OP SPARROW' : 'OP LANTERN', x + 106, y + 18, 11, '#1c1f26');
  g.strokeStyle = '#b4524a'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(x + 70, y + 30); g.lineTo(x + 106, y + 14); g.lineTo(x + 145, y + 20); g.stroke();
  g.fillStyle = '#3d4450'; for (const [px, py] of [[x + 106, y + 10], [x + 145, y + 14], [x + 110, y + 34]] as const) { g.beginPath(); g.arc(px, py, 2, 0, TAU); g.fill(); }
  say(g, 'DO NOT LOAD THE DUCK', x + 110, y + 42, 8, '#7a2e2a');
}

function boots(g: G, x: number, y: number, rot: number) {
  g.save(); g.translate(x, y); g.rotate(rot);
  for (const dy of [-6, 6]) { g.fillStyle = '#2b2620'; g.beginPath(); g.ellipse(0, dy, 11, 5, 0, 0, TAU); g.fill(); g.strokeStyle = INK; g.lineWidth = 1.6; g.stroke(); g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(-8, dy - 3, 8, 1.6); }
  g.restore();
}

function cards(g: G, x: number, y: number) {
  for (let i = 0; i < 5; i++) { g.save(); g.translate(x, y); g.rotate(-0.5 + i * 0.25); g.fillStyle = BONE; g.fillRect(-6, -18, 12, 18); g.strokeStyle = INK; g.lineWidth = 1.2; g.strokeRect(-6, -18, 12, 18); g.fillStyle = i % 2 ? '#b4524a' : '#1c1f26'; g.fillRect(-3, -14, 4, 4); g.restore(); }
  for (const [dx, dy, c] of [[26, 4, '#b4524a'], [32, 8, '#4f7fbf'], [28, 12, '#c9a23c']] as const) { g.fillStyle = c; g.beginPath(); g.arc(x + dx, y + dy, 5, 0, TAU); g.fill(); g.strokeStyle = INK; g.lineWidth = 1.4; g.stroke(); }
}
function chess(g: G, x: number, y: number) {
  for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) { g.fillStyle = (i + j) & 1 ? '#3a2a1a' : '#d2b27a'; g.fillRect(x + i * 9, y + j * 9, 9, 9); }
  g.strokeStyle = INK; g.lineWidth = 1.6; g.strokeRect(x, y, 36, 36);
  for (const [i, j, c] of [[1, 1, '#e2dccb'], [2, 2, '#1c1f26'], [0, 3, '#e2dccb'], [3, 0, '#1c1f26']] as const) { g.fillStyle = c; g.beginPath(); g.arc(x + i * 9 + 4.5, y + j * 9 + 4.5, 3, 0, TAU); g.fill(); g.stroke(); }
}

function mug(g: G, x: number, y: number, t: number, steam = true) {
  shadow(g, x, y, 6, 4);
  g.fillStyle = BONE; g.beginPath(); g.arc(x, y, 6, 0, TAU); g.fill(); g.strokeStyle = INK; g.lineWidth = 1.6; g.stroke();
  g.fillStyle = '#4a2c18'; g.beginPath(); g.arc(x, y, 4, 0, TAU); g.fill();
  if (steam) for (let i = 0; i < 3; i++) { const u = calm ? i / 3 : ((t * 0.0004 + i / 3) % 1); g.fillStyle = `rgba(240,240,236,${(0.35 * (1 - u)).toFixed(3)})`; g.beginPath(); g.arc(x + Math.sin(u * 6 + i) * 3, y - 6 - u * 24, 3 + u * 5, 0, TAU); g.fill(); }
}

function drawHalf(g: G, view: ThemeView, t: number, twin: boolean) {
  const P = (x: number, y: number): [number, number] => (twin ? [SIZE - x, SIZE - y] : [x, y]);
  const near = (x: number, y: number, r = 200) => { const [px, py] = P(x, y); return inView(view, px, py, r); };
  // The crib's board, and a mug beside it.
  if (near(700, 290)) { const [x, y] = P(620, 262); missionBoard(g, twin ? x - 170 : x, twin ? y - 54 : y, twin); const [mx, my] = P(560, 360); mug(g, mx, my, t); }
  // Barracks: boots at the foot of every bed, a note on one pillow, a poker hand abandoned on an officer's table.
  if (near(700, 4300, 900)) {
    for (const [x, y, r] of [[325, 4120, 1.6], [625, 4120, 1.4], [975, 4120, 1.7], [325, 4660, 1.5], [975, 4660, 1.6], [1275, 4120, 1.5]] as const) { const [px, py] = P(x, y); boots(g, px, py, r); }
    const [nx, ny] = P(340, 3965);
    g.save(); g.translate(nx, ny); g.rotate(twin ? 0.2 : -0.15); g.fillStyle = '#e8e0b8'; g.fillRect(-12, -9, 24, 18); g.strokeStyle = INK; g.lineWidth = 1.2; g.strokeRect(-12, -9, 24, 18); say(g, twin ? 'GOOD LUCK' : 'PIP OWES', 0, -2, 6, '#1c1f26'); say(g, twin ? 'SIR' : 'ME $20', 0, 5, 6, '#7a2e2a'); g.restore();
  }
  // Mess: a poker hand on the first table, a chess game on the officers' (twin) one; a pot left simmering in the kitchen.
  if (near(1900, 4200, 500)) {
    const [cx, cy] = P(1800, 4075);
    if (twin) chess(g, cx - 18, cy - 18); else cards(g, cx, cy);
    mug(g, ...P(1640, 4270), t); mug(g, ...P(2060, 4270), t, false);
    const [kx, ky] = P(1900, 4520);
    shadow(g, kx, ky, 22, 12); g.fillStyle = '#4f5560'; g.beginPath(); g.arc(kx, ky, 20, 0, TAU); g.fill(); g.strokeStyle = INK; g.lineWidth = 2; g.stroke();
    g.fillStyle = '#7a4a22'; g.beginPath(); g.arc(kx, ky, 14, 0, TAU); g.fill();
    for (let i = 0; i < 4; i++) { const u = calm ? i / 4 : ((t * 0.0003 + i / 4) % 1); g.fillStyle = `rgba(240,240,236,${(0.4 * (1 - u)).toFixed(3)})`; g.beginPath(); g.arc(kx + Math.sin(u * 7 + i) * 5, ky - 10 - u * 40, 5 + u * 9, 0, TAU); g.fill(); }
  }
  // The gate booth: the days-without-incident board, and somebody's cigarette still burning in the ashtray.
  if (near(2600, 5780, 260)) {
    const [bx, by] = P(2510, 5690);
    const x = twin ? bx - 120 : bx, y = twin ? by - 36 : by;
    g.fillStyle = 'rgba(10,12,18,0.3)'; g.fillRect(x + 4, y + 5, 120, 36); g.fillStyle = '#2f343c'; g.fillRect(x, y, 120, 36); g.strokeStyle = INK; g.lineWidth = 2; g.strokeRect(x, y, 120, 36);
    say(g, 'DAYS WITHOUT INCIDENT', x + 60, y + 9, 9, BONE); g.fillStyle = '#d9341f'; say(g, '0', x + 60, y + 26, 20, '#ff7a68');
    g.strokeStyle = 'rgba(210,202,180,0.5)'; g.lineWidth = 2; g.beginPath(); g.moveTo(x + 76, y + 23); g.lineTo(x + 100, y + 31); g.moveTo(x + 76, y + 29); g.lineTo(x + 100, y + 21); g.stroke();
    const [ax, ay] = P(2640, 5826);
    shadow(g, ax, ay, 9, 6); g.fillStyle = '#8a8f98'; g.beginPath(); g.arc(ax, ay, 7, 0, TAU); g.fill(); g.strokeStyle = INK; g.lineWidth = 1.6; g.stroke();
    const glow = calm ? 0.8 : 0.55 + 0.45 * Math.sin(t * 0.0021);
    g.fillStyle = '#e2dccb'; g.fillRect(ax - 6, ay - 1, 10, 2.4); g.fillStyle = `rgba(255,120,40,${glow.toFixed(2)})`; g.beginPath(); g.arc(ax + 5, ay, 2.6, 0, TAU); g.fill();
    for (let i = 0; i < 3; i++) { const u = calm ? i / 3 : ((t * 0.0003 + i / 3) % 1); g.fillStyle = `rgba(200,200,200,${(0.3 * (1 - u)).toFixed(3)})`; g.beginPath(); g.arc(ax + 5 + Math.sin(u * 5) * 4, ay - 4 - u * 30, 2 + u * 4, 0, TAU); g.fill(); }
  }
  // The comms shed: the radio still plays, and a headset hangs off the desk.
  if (near(400, 2600, 200)) {
    const [rx, ry] = P(470, 2540);
    g.fillStyle = '#2b2e34'; g.fillRect(rx - 14, ry - 8, 28, 16); g.strokeStyle = INK; g.lineWidth = 1.6; g.strokeRect(rx - 14, ry - 8, 28, 16);
    g.fillStyle = '#8fe8ff'; g.fillRect(rx - 10, ry - 4, 12, 5);
    for (let i = 0; i < 3; i++) { const u = calm ? i / 3 : ((t * 0.0004 + i / 3) % 1); g.fillStyle = `rgba(143,232,255,${(0.7 * (1 - u)).toFixed(3)})`; g.font = FONT(12); g.fillText('♪', rx + 8 + u * 14, ry - 12 - u * 22); }
  }
}

/** Called from the theme's `under` hook. */
export function drawVignettes(g: G, now: number, view: ThemeView) {
  const t = calm ? 4000 : now;
  g.save();
  drawHalf(g, view, t, false);
  drawHalf(g, view, t, true);
  g.restore();
}
