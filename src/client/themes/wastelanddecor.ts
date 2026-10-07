import { C, SIZE, TAU, hexA } from './wastelandkit.ts';

/**
 * Hand-placed floor dressing for the Wasteland, baked into the ground layer. One thread of lore runs through it: the
 * survivors came back, a handful at a time, and made a home (the garden in tyres, the kid's drawing of the sun, the tally of
 * days, the bedroll beside the fire). Everything sits in the margins, never across a lane, drawn low in contrast with the
 * kit's ink outline and a crisp contact shadow. Three eggs wait for anyone who looks: a rubber duck in the dry pool, a teddy
 * bear in a gas mask in the bunker, and a gumball machine that still has one gumball.
 */
type G = CanvasRenderingContext2D;
const at = (g: G, x: number, y: number, r: number, paint: () => void) => { g.save(); g.translate(x, y); g.rotate(r); paint(); g.restore(); };
const shade = (g: G, x: number, y: number, rx: number, ry: number) => { g.fillStyle = 'rgba(20, 24, 32, 0.3)'; g.beginPath(); g.ellipse(x + 3, y + 3, rx, ry, 0, 0, TAU); g.fill(); };
const disc = (g: G, x: number, y: number, r: number, fill: string, lw = 1.8) => { g.fillStyle = fill; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); g.strokeStyle = C.ink; g.lineWidth = lw; g.stroke(); };
const box = (g: G, x: number, y: number, w: number, h: number, fill: string, lw = 1.8) => { g.fillStyle = fill; g.fillRect(x, y, w, h); g.strokeStyle = C.ink; g.lineWidth = lw; g.strokeRect(x, y, w, h); };

function tyre(g: G, x: number, y: number, r: number) { shade(g, x, y, r, r * 0.9); disc(g, x, y, r, '#25272b', 2); disc(g, x, y, r * 0.5, '#3f4a38', 1.6); g.fillStyle = 'rgba(255,255,255,0.12)'; g.beginPath(); g.arc(x - r * 0.3, y - r * 0.3, r * 0.3, 3.4, 4.6); g.lineTo(x, y); g.fill(); }

/** The garden in tyres: stacked rings, soil, seedlings, a scarecrow of a broom. */
function tyreGarden(g: G, x: number, y: number) {
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU, cx = x + Math.cos(a) * 46, cy = y + Math.sin(a) * 30;
    tyre(g, cx, cy, 20); g.fillStyle = '#4a3a2a'; g.beginPath(); g.arc(cx, cy, 9, 0, TAU); g.fill();
    g.strokeStyle = C.grassHi; g.lineWidth = 3; g.lineCap = 'round'; g.beginPath(); g.moveTo(cx, cy + 2); g.lineTo(cx - 3, cy - 8); g.moveTo(cx, cy + 2); g.lineTo(cx + 4, cy - 7); g.stroke();
    if (i % 3 === 0) { g.fillStyle = C.rustHi; g.beginPath(); g.arc(cx + 3, cy - 6, 3, 0, TAU); g.fill(); }
  }
  tyre(g, x, y, 22); g.fillStyle = '#4a3a2a'; g.beginPath(); g.arc(x, y, 11, 0, TAU); g.fill();
  g.strokeStyle = C.wood; g.lineWidth = 4; g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - 24); g.stroke(); g.strokeStyle = C.khaki; g.beginPath(); g.moveTo(x - 10, y - 18); g.lineTo(x + 10, y - 18); g.stroke();
}

/** A child's drawing of the sun, in chalk and crayon on the paving, with a stick family under it. */
function sunDrawing(g: G, x: number, y: number) {
  g.save(); g.translate(x, y); g.globalAlpha = 0.7; g.lineCap = 'round';
  g.fillStyle = '#e8c868'; g.beginPath(); g.arc(0, 0, 26, 0, TAU); g.fill();
  g.strokeStyle = '#e8c868'; g.lineWidth = 5; for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; g.beginPath(); g.moveTo(Math.cos(a) * 34, Math.sin(a) * 34); g.lineTo(Math.cos(a) * 52, Math.sin(a) * 52); g.stroke(); }
  g.strokeStyle = '#2a2a2a'; g.lineWidth = 3; g.beginPath(); g.arc(0, 4, 13, 0.3, Math.PI - 0.3); g.stroke(); g.fillStyle = '#2a2a2a'; g.beginPath(); g.arc(-8, -7, 2.4, 0, TAU); g.arc(8, -7, 2.4, 0, TAU); g.fill();
  g.strokeStyle = hexA(C.bone, 0.9); g.lineWidth = 3;
  for (const [fx, fy, s] of [[-40, 90, 1], [0, 92, 0.7], [40, 90, 1]] as const) { g.beginPath(); g.arc(fx, fy - 26 * s, 6 * s, 0, TAU); g.moveTo(fx, fy - 20 * s); g.lineTo(fx, fy); g.moveTo(fx - 10 * s, fy - 12 * s); g.lineTo(fx + 10 * s, fy - 12 * s); g.moveTo(fx, fy); g.lineTo(fx - 7 * s, fy + 16 * s); g.moveTo(fx, fy); g.lineTo(fx + 7 * s, fy + 16 * s); g.stroke(); }
  g.restore();
}

function tally(g: G, x: number, y: number) {
  g.save(); g.translate(x, y); g.strokeStyle = hexA(C.bone, 0.65); g.lineWidth = 3; g.lineCap = 'round';
  for (let k = 0; k < 6; k++) { for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(k * 22 + i * 4, 0); g.lineTo(k * 22 + i * 4, 18); g.stroke(); } g.beginPath(); g.moveTo(k * 22 - 3, 14); g.lineTo(k * 22 + 15, 3); g.stroke(); }
  g.restore();
}

function bedroll(g: G, x: number, y: number, r: number, col: string) {
  at(g, x, y, r, () => { shade(g, 0, 0, 36, 16); g.fillStyle = col; g.beginPath(); g.roundRect(-34, -14, 68, 28, 12); g.fill(); g.strokeStyle = C.ink; g.lineWidth = 2; g.stroke(); g.fillStyle = hexA(C.bone, 0.5); g.beginPath(); g.roundRect(-30, -10, 18, 20, 7); g.fill(); g.stroke(); g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 2; g.beginPath(); g.moveTo(-6, -12); g.lineTo(-6, 12); g.moveTo(10, -12); g.lineTo(10, 12); g.stroke(); });
}

function duck(g: G, x: number, y: number) {
  shade(g, x, y, 12, 8); disc(g, x, y, 9, '#f2c93c', 1.8); disc(g, x + 8, y - 5, 5.4, '#f2c93c', 1.6);
  g.fillStyle = '#e8762c'; g.beginPath(); g.moveTo(x + 12, y - 6); g.lineTo(x + 19, y - 4); g.lineTo(x + 12, y - 2); g.closePath(); g.fill(); g.strokeStyle = C.ink; g.lineWidth = 1.2; g.stroke();
  g.fillStyle = C.ink; g.beginPath(); g.arc(x + 9, y - 7, 1, 0, TAU); g.fill();
}

function teddy(g: G, x: number, y: number) {
  shade(g, x, y + 4, 14, 9); disc(g, x, y + 4, 10, '#a8794a', 1.8); disc(g, x - 8, y - 6, 4, '#a8794a', 1.4); disc(g, x + 8, y - 6, 4, '#a8794a', 1.4); disc(g, x, y - 4, 8, '#b98a58', 1.8);
  disc(g, x, y - 1, 5, '#4f5560', 1.4); g.fillStyle = '#26303c'; g.fillRect(x - 5, y - 8, 4, 3); g.fillRect(x + 1, y - 8, 4, 3);
  g.strokeStyle = C.ink; g.lineWidth = 1.4; g.beginPath(); g.moveTo(x - 7, y - 4); g.lineTo(x + 7, y - 4); g.stroke();
}

function gumball(g: G, x: number, y: number) {
  shade(g, x, y + 6, 14, 8); box(g, x - 9, y + 2, 18, 12, '#9a4a3c'); disc(g, x, y - 6, 12, 'rgba(190,225,240,0.8)', 1.8);
  for (const [dx, dy, c] of [[-4, -2, '#e8c868'], [4, -4, '#b4524a'], [0, -9, '#4f8a82'], [-5, -9, '#6a8e4a']] as const) disc(g, x + dx, y - 6 + dy + 2, 3, c, 1);
  g.fillStyle = C.bone; g.fillRect(x - 3, y + 6, 6, 4);
}

function grave(g: G, x: number, y: number, r: number) {
  at(g, x, y, r, () => { g.fillStyle = '#4a4034'; g.beginPath(); g.ellipse(0, 6, 22, 11, 0, 0, TAU); g.fill(); g.strokeStyle = C.ink; g.lineWidth = 1.6; g.stroke(); g.fillStyle = C.concreteHi; g.fillRect(-9, -10, 18, 14); g.strokeRect(-9, -10, 18, 14); g.fillStyle = C.concreteLo; g.fillRect(-9, 4, 18, 4); g.strokeStyle = 'rgba(30,27,22,0.6)'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(0, -7); g.lineTo(0, 0); g.moveTo(-4, -4); g.lineTo(4, -4); g.stroke(); g.fillStyle = C.grassHi; g.beginPath(); g.arc(-15, 6, 3, 0, TAU); g.arc(15, 8, 3, 0, TAU); g.fill(); });
}

function cookfire(g: G, x: number, y: number) {
  shade(g, x, y, 26, 18); for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; disc(g, x + Math.cos(a) * 20, y + Math.sin(a) * 14, 5, i % 2 ? C.concreteHi : C.concreteLo, 1.6); }
  g.fillStyle = '#26221e'; g.beginPath(); g.ellipse(x, y, 13, 9, 0, 0, TAU); g.fill(); g.strokeStyle = C.wood; g.lineWidth = 4; g.lineCap = 'round'; g.beginPath(); g.moveTo(x - 10, y + 3); g.lineTo(x + 8, y - 4); g.moveTo(x - 7, y - 5); g.lineTo(x + 10, y + 4); g.stroke();
}

type Fn = (g: G, x: number, y: number) => void;
const WEST: readonly [Fn, number, number][] = [
  [tyreGarden, 4470, 1560], [sunDrawing, 5020, 780], [tally, 4620, 1180], [cookfire, 4860, 920],
  [(g, x, y) => bedroll(g, x, y, 0.3, '#6a4a5a'), 4930, 1010], [(g, x, y) => bedroll(g, x, y, -0.2, '#4a5a6a'), 4800, 1000],
  [duck, 1500, 3080], [gumball, 2660, 1190], [(g, x, y) => bedroll(g, x, y, 0.1, C.paintRed), 580, 360], [(g, x, y) => bedroll(g, x, y, -0.1, C.olive), 560, 520],
  [tally, 440, 230], [(g, x, y) => grave(g, x, y, 0.1), 4300, 3500], [(g, x, y) => grave(g, x, y, -0.15), 4420, 3550], [(g, x, y) => grave(g, x, y, 0.05), 4540, 3520],
  [(g, x, y) => grave(g, x, y, 0.2), 4660, 3560], [teddy, 1190, 5320],
];

export function paintFloorDecor(g: G, seed: number): void {
  void seed;
  g.save();
  for (const [fn, x, y] of WEST) fn(g, x, y);
  // the half-turn's own few: the market's cook-fire, the bunker's bedrolls, a second garden in the crash site
  tyreGarden(g, SIZE - 4470 + 90, SIZE - 1560 - 40);
  tally(g, SIZE - 4620, SIZE - 1180);
  cookfire(g, SIZE - 4860, SIZE - 920);
  bedroll(g, SIZE - 4930, SIZE - 1010, -0.3, '#5a6a4a');
  // skid marks where the pile-up began, and a trail of spilled luggage across the crash site
  g.lineCap = 'round'; g.strokeStyle = 'rgba(22, 20, 20, 0.4)'; g.lineWidth = 7;
  for (const o of [-12, 12]) { g.beginPath(); g.moveTo(1300, 1380 + o); g.quadraticCurveTo(1700, 1480 + o, 2060, 1700 + o); g.stroke(); }
  g.restore();
}
