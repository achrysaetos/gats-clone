import { C, hash, TAU } from './railyardkit.ts';

/**
 * Hand-drawn little things for the Rail Yard: every vignette is a sprite drawn once into an offscreen canvas (railyarddecor.ts
 * stamps them under the bodies). Each tells a bit of the night the last train never left. Anchored at the sprite's centre
 * unless said otherwise; each draws with the key light at the top left and soft contact shadows to the lower right.
 */
type G = CanvasRenderingContext2D;
export type Sprite = { w: number; h: number; ax: number; ay: number; draw: (g: G) => void };
const S = (w: number, h: number, draw: (g: G) => void, ax = w / 2, ay = h / 2): Sprite => ({ w, h, ax, ay, draw });
const shadow = (g: G, x: number, y: number, rx: number, ry: number) => { g.fillStyle = 'rgba(10, 12, 18, 0.34)'; g.beginPath(); g.ellipse(x + 3, y + 4, rx, ry, 0, 0, TAU); g.fill(); };
const ink = (g: G, w = 2) => { g.strokeStyle = C.ink; g.lineWidth = w; g.lineJoin = 'round'; g.stroke(); };
const rrect = (g: G, x: number, y: number, w: number, h: number, r: number) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + r, y, r); g.closePath(); };
const spec = (g: G, x: number, y: number, r = 1.8) => { g.fillStyle = 'rgba(255,255,255,0.6)'; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); };

function suitcase(g: G, x: number, y: number, w: number, h: number, col: string, rot = 0, label = true) {
  g.save(); g.translate(x, y); g.rotate(rot);
  g.fillStyle = 'rgba(10,12,18,0.34)'; rrect(g, -w / 2 + 3, -h / 2 + 4, w, h, 4); g.fill();
  g.fillStyle = col; rrect(g, -w / 2, -h / 2, w, h, 4); g.fill(); ink(g);
  g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(-w / 2 + 3, -h / 2 + 2, w - 6, 3);
  g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(-w / 2 + 3, h / 2 - 6, w - 6, 3);
  g.fillStyle = C.brass; g.fillRect(-w / 2 + 6, -3, 4, 6); g.fillRect(w / 2 - 10, -3, 4, 6);
  g.strokeStyle = '#3a2a1a'; g.lineWidth = 2; g.beginPath(); g.moveTo(-5, -h / 2); g.lineTo(-5, -h / 2 - 3); g.lineTo(5, -h / 2 - 3); g.lineTo(5, -h / 2); g.stroke();
  if (label) { g.fillStyle = '#e8e2d0'; g.fillRect(w / 4 - 5, -4, 10, 8); g.strokeStyle = C.red; g.lineWidth = 1; g.strokeRect(w / 4 - 5, -4, 10, 8); }
  g.restore();
}

/** The abandoned luggage: cases, a hatbox, a cabin trunk, a furled umbrella. */
export const luggage = (): Sprite => S(120, 90, (g) => {
  g.translate(60, 45);
  shadow(g, 0, 20, 50, 16);
  g.save(); g.translate(8, -6); g.fillStyle = 'rgba(10,12,18,0.3)'; rrect(g, -34 + 3, -20 + 4, 68, 40, 5); g.fill(); g.fillStyle = '#5a3a2a'; rrect(g, -34, -20, 68, 40, 5); g.fill(); ink(g);
  g.strokeStyle = C.brass; g.lineWidth = 2.5; for (const x of [-20, 20]) { g.beginPath(); g.moveTo(x, -20); g.lineTo(x, 20); g.stroke(); }
  g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(-32, -18, 64, 4); g.restore();
  suitcase(g, -30, 10, 44, 28, '#7a3a30', -0.15);
  suitcase(g, 22, 22, 38, 24, '#3f5a4a', 0.2);
  suitcase(g, -6, -26, 36, 22, '#a8793c', -0.3);
  g.fillStyle = '#e2dccb'; g.beginPath(); g.ellipse(-44, -8, 13, 11, 0, 0, TAU); g.fill(); ink(g); g.fillStyle = '#b8473a'; g.fillRect(-57, -9, 26, 3);
  g.strokeStyle = '#2a2f36'; g.lineWidth = 3; g.lineCap = 'round'; g.beginPath(); g.moveTo(40, -24); g.lineTo(22, 14); g.stroke(); g.strokeStyle = '#6a3a22'; g.lineWidth = 3; g.beginPath(); g.moveTo(40, -24); g.quadraticCurveTo(46, -32, 52, -26); g.stroke();
});

/** A dropped bouquet: red roses in brown paper, petals scattered, a hand-written card. */
export const bouquet = (): Sprite => S(80, 64, (g) => {
  g.translate(40, 32); g.rotate(-0.4);
  shadow(g, 0, 8, 24, 9);
  g.fillStyle = '#b79a68'; g.beginPath(); g.moveTo(-26, 4); g.lineTo(10, -14); g.lineTo(20, 8); g.lineTo(-22, 16); g.closePath(); g.fill(); ink(g);
  g.fillStyle = '#d6bd8a'; g.beginPath(); g.moveTo(-26, 4); g.lineTo(0, -4); g.lineTo(-22, 16); g.closePath(); g.fill();
  for (const [x, y] of [[12, -6], [20, 2], [8, 6], [16, -14], [24, -6]]) { g.fillStyle = '#a8231f'; g.beginPath(); g.arc(x!, y!, 7, 0, TAU); g.fill(); ink(g, 1.5); g.fillStyle = '#d94a3f'; g.beginPath(); g.arc(x! - 1, y! - 1, 3.4, 0, TAU); g.fill(); g.strokeStyle = '#7a1612'; g.lineWidth = 1; g.beginPath(); g.arc(x!, y!, 1.8, 0, 4); g.stroke(); }
  g.strokeStyle = '#3a6a3a'; g.lineWidth = 2; for (const a of [-0.5, 0.2, 0.8]) { g.beginPath(); g.moveTo(10, 0); g.lineTo(10 + Math.cos(a) * 24, Math.sin(a) * 24 - 6); g.stroke(); }
  g.fillStyle = '#c0242a'; for (const [x, y, r] of [[-12, 24, 0.6], [30, 18, 1.1], [-30, -8, 0.2], [34, -18, 0.9]] as const) { g.save(); g.translate(x, y); g.rotate(r); g.beginPath(); g.ellipse(0, 0, 4, 2.6, 0, 0, TAU); g.fill(); g.restore(); }
  g.fillStyle = '#efe8d4'; g.fillRect(-4, 16, 16, 10); g.strokeStyle = C.ink; g.lineWidth = 1; g.strokeRect(-4, 16, 16, 10); g.fillStyle = '#6a3a3a'; g.fillRect(-2, 19, 10, 1.4); g.fillRect(-2, 22, 7, 1.4);
});

/** The conductor's whistle, with its chain and a punch. */
export const whistle = (): Sprite => S(60, 40, (g) => {
  g.translate(30, 20);
  g.strokeStyle = '#8a8f98'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(-6, 0); for (let i = 0; i < 6; i++) g.quadraticCurveTo(-18 - i * 3, 8 - i * 4, -24 - i * 3.6, -6 + i * 2); g.stroke();
  shadow(g, 6, 6, 14, 6);
  g.fillStyle = C.brass; rrect(g, -8, -6, 24, 12, 5); g.fill(); ink(g, 1.8);
  g.fillStyle = C.brassHi; g.fillRect(-4, -4, 15, 3); g.fillStyle = '#17181c'; g.fillRect(2, -1, 7, 3);
  g.fillStyle = C.brass; g.beginPath(); g.arc(-8, 0, 6, 0, TAU); g.fill(); ink(g, 1.6);
  g.fillStyle = '#c9a23c'; g.fillRect(12, 4, 4, 6); spec(g, -2, -4, 1.4);
});

/** A tiny wooden toy train left on a bench. */
export const toyTrain = (): Sprite => S(56, 22, (g) => {
  g.translate(28, 11);
  shadow(g, 0, 6, 24, 5);
  const car = (x: number, w: number, col: string) => { g.fillStyle = col; rrect(g, x, -6, w, 12, 2); g.fill(); ink(g, 1.4); g.fillStyle = 'rgba(255,255,255,0.3)'; g.fillRect(x + 2, -5, w - 4, 2); g.fillStyle = '#2a2c32'; g.beginPath(); g.arc(x + 4, 6, 2.2, 0, TAU); g.arc(x + w - 4, 6, 2.2, 0, TAU); g.fill(); };
  car(-26, 14, '#3f6a52'); car(-10, 14, '#b8473a'); car(6, 14, '#c9a23c');
  g.fillStyle = '#2c4a39'; rrect(g, 22, -7, 14, 14, 2); g.fill(); ink(g, 1.4); g.fillStyle = '#17181c'; g.fillRect(31, -11, 4, 5); g.fillStyle = '#c9a23c'; g.fillRect(24, -9, 4, 3);
  g.strokeStyle = '#5a4a3a'; g.lineWidth = 1; g.beginPath(); g.moveTo(-12, 0); g.lineTo(-10, 0); g.moveTo(4, 0); g.lineTo(6, 0); g.moveTo(20, 0); g.lineTo(22, 0); g.stroke();
});

/** A sleeping station cat, a warm loaf. */
export const cat = (): Sprite => S(52, 40, (g) => {
  g.translate(26, 20);
  shadow(g, 0, 8, 22, 9);
  g.fillStyle = '#c9822f'; g.beginPath(); g.ellipse(0, 2, 21, 14, 0, 0, TAU); g.fill(); ink(g);
  g.fillStyle = '#a86820'; g.beginPath(); g.ellipse(3, 8, 17, 7, 0, 0, TAU); g.fill();
  g.strokeStyle = '#7a4a14'; g.lineWidth = 2; g.beginPath(); for (let i = -2; i <= 2; i++) { g.moveTo(i * 6, -6); g.lineTo(i * 6 + 2, 2); } g.stroke();
  g.fillStyle = '#c9822f'; g.beginPath(); g.arc(-14, -4, 9, 0, TAU); g.fill(); ink(g);
  g.beginPath(); g.moveTo(-21, -9); g.lineTo(-19, -17); g.lineTo(-14, -11); g.moveTo(-14, -11); g.lineTo(-9, -16); g.lineTo(-8, -9); g.fillStyle = '#c9822f'; g.fill(); ink(g, 1.6);
  g.strokeStyle = C.ink; g.lineWidth = 1.6; g.beginPath(); g.moveTo(-19, -4); g.quadraticCurveTo(-17, -2, -15, -4); g.moveTo(-13, -4); g.quadraticCurveTo(-11, -2, -9, -4); g.stroke();
  g.strokeStyle = '#a86820'; g.lineWidth = 5; g.lineCap = 'round'; g.beginPath(); g.moveTo(16, 6); g.quadraticCurveTo(26, 6, 24, -4); g.stroke(); ink(g, 0);
});

/** A tea urn with its tap, steaming (the steam is animated by the decor layer). */
export const urn = (): Sprite => S(36, 44, (g) => {
  g.translate(18, 24);
  shadow(g, 0, 10, 14, 7);
  g.fillStyle = '#b9bcc4'; rrect(g, -11, -12, 22, 26, 6); g.fill(); ink(g);
  g.fillStyle = '#e4e6ec'; g.fillRect(-8, -10, 6, 20); g.fillStyle = C.brass; g.fillRect(-11, -14, 22, 4); g.fillStyle = C.ink; g.fillRect(11, 2, 6, 3);
  g.fillStyle = '#5a5e68'; g.beginPath(); g.arc(0, -16, 4, 0, TAU); g.fill(); ink(g, 1.5);
});

/** A pocket watch stopped at 21:47 beside two cold cups. */
export const watchCups = (): Sprite => S(80, 50, (g) => {
  g.translate(40, 26);
  shadow(g, 0, 8, 34, 10);
  for (const x of [-22, 24]) { g.fillStyle = '#f0ecdc'; g.beginPath(); g.arc(x, -2, 9, 0, TAU); g.fill(); ink(g, 1.8); g.fillStyle = '#4a2a14'; g.beginPath(); g.arc(x, -2, 6, 0, TAU); g.fill(); g.strokeStyle = '#f0ecdc'; g.lineWidth = 3; g.beginPath(); g.arc(x + 10, -2, 4, -1.2, 1.2); g.stroke(); }
  g.fillStyle = C.brass; g.beginPath(); g.arc(0, 8, 9, 0, TAU); g.fill(); ink(g, 1.8); g.fillStyle = '#efe8d4'; g.beginPath(); g.arc(0, 8, 6.4, 0, TAU); g.fill();
  g.strokeStyle = C.ink; g.lineWidth = 1.2; g.beginPath(); g.moveTo(0, 8); g.lineTo(-3.5, 6); g.moveTo(0, 8); g.lineTo(2, 3.4); g.stroke();
  g.strokeStyle = C.brass; g.lineWidth = 1.4; g.beginPath(); g.moveTo(0, -1); g.lineTo(0, -3); g.moveTo(9, 8); g.quadraticCurveTo(22, 14, 18, 2); g.stroke();
});

/** Platform 9 and three quarters: a luggage trolley half swallowed by the brick wall, with its plaque. */
export const platform934 = (): Sprite => S(140, 100, (g) => {
  g.translate(70, 0);
  // The plaque on the wall face.
  g.fillStyle = 'rgba(10,12,18,0.3)'; rrect(g, -34 + 3, 6 + 4, 68, 30, 4); g.fill();
  g.fillStyle = '#17181c'; rrect(g, -34, 6, 68, 30, 4); g.fill(); g.strokeStyle = C.brass; g.lineWidth = 2.5; g.stroke();
  g.fillStyle = '#efe8d4'; g.font = '800 22px "Barlow Condensed", Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('9¾', 0, 20);
  g.fillStyle = C.brass; g.font = '700 6px "Barlow Condensed", sans-serif'; g.fillText('PLATFORM', 0, 10);
  // A trolley with cases, going into the wall.
  g.translate(0, 46);
  shadow(g, 0, 30, 36, 8);
  g.strokeStyle = '#8a8f98'; g.lineWidth = 3; g.beginPath(); g.rect(-26, 0, 52, 26); g.moveTo(-26, 13); g.lineTo(26, 13); g.moveTo(-26, 0); g.lineTo(-34, -10); g.stroke();
  suitcase(g, -6, 6, 34, 22, '#6a3a2a', 0.08, false);
  g.fillStyle = '#c9c0a6'; rrect(g, 14, 0, 18, 22, 3); g.fill(); ink(g, 1.6); g.strokeStyle = '#4a3a2a'; g.lineWidth = 1; for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(17 + i * 4, 2); g.lineTo(17 + i * 4, 20); g.stroke(); }
  g.fillStyle = C.coal; for (const x of [-18, 18]) { g.beginPath(); g.arc(x, 28, 4, 0, TAU); g.fill(); }
  // The bricks it has gone through: a rough hole's edge.
  g.fillStyle = C.brickLo; for (let i = 0; i < 6; i++) g.fillRect(-30 + i * 11, -4 + (i % 2) * 2, 8, 5);
});

/** A signalman's lever frame: a row of coloured levers on a bench, with a mug and a block bell. */
export const leverFrame = (): Sprite => S(240, 60, (g) => {
  g.translate(120, 30);
  g.fillStyle = '#3a3026'; g.fillRect(-110, 0, 220, 16); g.strokeStyle = C.ink; g.lineWidth = 2; g.strokeRect(-110, 0, 220, 16);
  const cols = ['#c4473a', '#c4473a', '#1f1f24', '#2c64a8', '#c4473a', '#e8c868', '#1f1f24', '#4a8a52', '#2c64a8', '#c4473a'];
  cols.forEach((col, i) => { const x = -98 + i * 22, lean = (i % 3 === 1) ? -3 : 0; g.fillStyle = '#17181c'; g.fillRect(x - 3, -2, 6, 8); g.strokeStyle = '#8a8f98'; g.lineWidth = 3; g.beginPath(); g.moveTo(x, 4); g.lineTo(x + lean, -22 - (i % 3) * 3); g.stroke(); g.fillStyle = col; g.beginPath(); g.arc(x + lean, -24 - (i % 3) * 3, 5, 0, TAU); g.fill(); ink(g, 1.4); });
  g.fillStyle = '#f0ecdc'; g.beginPath(); g.arc(-110, -8, 7, 0, TAU); g.fill(); ink(g, 1.6); g.fillStyle = C.brass; g.beginPath(); g.arc(112, -10, 9, 0, TAU); g.fill(); ink(g, 1.8); spec(g, 109, -13, 2);
});

/** A calendar, tea tin and an enamel mug: signalbox and engine shed clutter. */
export const mugTin = (): Sprite => S(50, 32, (g) => {
  g.translate(25, 16); shadow(g, 0, 8, 20, 6);
  g.fillStyle = '#e8e2d0'; g.beginPath(); g.arc(-12, 0, 8, 0, TAU); g.fill(); ink(g, 1.6); g.strokeStyle = '#3a6aa8'; g.lineWidth = 2; g.beginPath(); g.arc(-12, 0, 8, 0, TAU); g.stroke(); ink(g, 1);
  g.fillStyle = '#6a2a2a'; rrect(g, 2, -9, 20, 16, 2); g.fill(); ink(g, 1.6); g.fillStyle = C.brass; g.fillRect(4, -5, 16, 3); g.fillRect(4, 1, 16, 2);
});

/** A coal shovel stuck in a heap. */
export const shovel = (): Sprite => S(44, 44, (g) => {
  g.translate(22, 22); shadow(g, 0, 14, 16, 6);
  g.strokeStyle = '#6a4a2a'; g.lineWidth = 4; g.lineCap = 'round'; g.beginPath(); g.moveTo(-12, -18); g.lineTo(6, 6); g.stroke();
  g.fillStyle = '#8a8f98'; g.beginPath(); g.moveTo(2, 2); g.lineTo(14, 8); g.lineTo(8, 18); g.lineTo(-2, 12); g.closePath(); g.fill(); ink(g, 1.8);
  g.fillStyle = C.coal; g.beginPath(); g.ellipse(4, 18, 16, 6, 0, 0, TAU); g.fill();
});

/** A chalk note on the turntable apron. */
export const chalkNote = (text: string, small = false): Sprite => S(small ? 190 : 230, 46, (g) => {
  g.translate(small ? 95 : 115, 23);
  g.save(); g.rotate(-0.04);
  g.fillStyle = 'rgba(236, 232, 214, 0.5)'; g.font = `700 ${small ? 18 : 22}px "Barlow Condensed", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  (g as unknown as { letterSpacing: string }).letterSpacing = '3px';
  g.fillText(text, 0, 0);
  g.strokeStyle = 'rgba(236, 232, 214, 0.4)'; g.lineWidth = 2; g.beginPath(); g.moveTo(-(small ? 80 : 100), 16); g.lineTo(small ? 84 : 104, 17); g.stroke();
  g.restore();
});

/** A set of parcels and a platform scale: the goods office. */
export const scales = (): Sprite => S(70, 60, (g) => {
  g.translate(35, 30); shadow(g, 0, 16, 28, 9);
  g.fillStyle = '#2a3a30'; rrect(g, -22, -4, 44, 24, 3); g.fill(); ink(g);
  g.fillStyle = '#8a8f98'; g.fillRect(-18, 2, 36, 10); g.fillStyle = C.brass; g.beginPath(); g.arc(0, -10, 12, Math.PI, 0); g.lineTo(12, -4); g.lineTo(-12, -4); g.closePath(); g.fill(); ink(g, 1.8);
  g.fillStyle = '#efe8d4'; g.beginPath(); g.arc(0, -8, 7, Math.PI, 0); g.fill(); g.strokeStyle = C.ink; g.lineWidth = 1; g.beginPath(); g.moveTo(0, -8); g.lineTo(3, -13); g.stroke();
  g.fillStyle = '#b79a68'; g.fillRect(14, -26, 20, 16); g.strokeStyle = C.ink; g.lineWidth = 1.8; g.strokeRect(14, -26, 20, 16); g.strokeStyle = '#6a4a2a'; g.beginPath(); g.moveTo(24, -26); g.lineTo(24, -10); g.moveTo(14, -18); g.lineTo(34, -18); g.stroke();
});

/** A pile of mail sacks and parcels: the twin goods hall. */
export const mailSacks = (): Sprite => S(130, 90, (g) => {
  g.translate(65, 45); shadow(g, 0, 22, 54, 14);
  const sack = (x: number, y: number, r: number, col: string) => { g.save(); g.translate(x, y); g.rotate(r); g.fillStyle = col; g.beginPath(); g.ellipse(0, 0, 22, 14, 0, 0, TAU); g.fill(); ink(g); g.fillStyle = 'rgba(255,255,255,0.15)'; g.beginPath(); g.ellipse(-5, -4, 10, 4, 0, 0, TAU); g.fill(); g.fillStyle = '#4a3a2a'; g.fillRect(16, -4, 6, 8); g.fillStyle = C.red; g.font = '700 7px sans-serif'; g.textAlign = 'center'; g.fillText('POST', -2, 3); g.restore(); };
  sack(-30, 8, 0.1, '#8a7a5a'); sack(10, 14, -0.2, '#7a6a4a'); sack(-8, -14, 0.3, '#948466'); sack(36, -8, -0.4, '#85755a');
  g.fillStyle = '#b79a68'; g.fillRect(-52, 22, 24, 16); ink(g, 1.8); g.fillStyle = '#c9ad78'; g.fillRect(44, 18, 22, 16); ink(g, 1.8);
});

/** Pigeon-holes and a stamp: the parcels office. */
export const pigeonholes = (): Sprite => S(150, 54, (g) => {
  g.translate(75, 27);
  g.fillStyle = '#3a2c1c'; g.fillRect(-70, -22, 140, 44); g.strokeStyle = C.ink; g.lineWidth = 2; g.strokeRect(-70, -22, 140, 44);
  for (let j = 0; j < 3; j++) for (let i = 0; i < 8; i++) { g.fillStyle = '#17120c'; g.fillRect(-66 + i * 17, -18 + j * 13, 15, 11); if (hash(i, j, 3) < 0.55) { g.fillStyle = '#efe8d4'; g.fillRect(-64 + i * 17, -12 + j * 13, 11, 4); g.fillStyle = '#b79a68'; g.fillRect(-63 + i * 17, -15 + j * 13, 8, 3); } }
  g.fillStyle = C.brass; g.font = '700 7px "Barlow Condensed", sans-serif'; g.textAlign = 'center'; g.fillText('UNCLAIMED', 0, -26);
});

/** A dartboard on the mess wall. */
export const dartboard = (): Sprite => S(40, 40, (g) => {
  g.translate(20, 20); g.fillStyle = '#17181c'; g.beginPath(); g.arc(0, 0, 17, 0, TAU); g.fill(); ink(g, 2);
  for (const [r, a, b] of [[15, '#c4473a', '#2f6a4a'], [10, '#efe8d4', '#17181c'], [5, '#c4473a', '#2f6a4a']] as const) for (let i = 0; i < 12; i++) { g.fillStyle = i % 2 ? a : b; g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, r, (i * TAU) / 12, ((i + 1) * TAU) / 12); g.closePath(); g.fill(); }
  g.fillStyle = '#c4473a'; g.beginPath(); g.arc(0, 0, 2.4, 0, TAU); g.fill(); g.strokeStyle = '#c9a23c'; g.lineWidth = 2; g.beginPath(); g.moveTo(6, -4); g.lineTo(14, -12); g.stroke();
});

/** A garden gnome with a fishing rod. */
export const gnome = (): Sprite => S(40, 54, (g) => {
  g.translate(20, 30); shadow(g, 0, 18, 14, 6);
  g.fillStyle = '#2f6a9a'; g.beginPath(); g.moveTo(-9, 18); g.lineTo(-7, 2); g.lineTo(7, 2); g.lineTo(9, 18); g.closePath(); g.fill(); ink(g, 1.8);
  g.fillStyle = '#efe0c8'; g.beginPath(); g.arc(0, -2, 7, 0, TAU); g.fill(); ink(g, 1.6);
  g.fillStyle = '#efefef'; g.beginPath(); g.moveTo(-7, 0); g.quadraticCurveTo(0, 14, 7, 0); g.closePath(); g.fill(); ink(g, 1.4);
  g.fillStyle = '#c4473a'; g.beginPath(); g.moveTo(-8, -4); g.lineTo(0, -24); g.lineTo(8, -4); g.closePath(); g.fill(); ink(g, 1.8);
  g.strokeStyle = '#6a4a2a'; g.lineWidth = 2; g.beginPath(); g.moveTo(8, 8); g.lineTo(22, -14); g.stroke(); g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 1; g.beginPath(); g.moveTo(22, -14); g.lineTo(22, 6); g.stroke();
});

/** A kettle on a stove ring, a crossing keeper's lamp beside it. */
export const kettle = (): Sprite => S(56, 40, (g) => {
  g.translate(28, 20); shadow(g, 0, 10, 22, 7);
  g.fillStyle = '#2a2c32'; rrect(g, -22, 2, 24, 12, 3); g.fill(); ink(g, 1.8);
  g.fillStyle = '#8a8f98'; g.beginPath(); g.ellipse(-10, -2, 10, 9, 0, 0, TAU); g.fill(); ink(g, 1.8); g.fillStyle = '#c3c9d2'; g.beginPath(); g.ellipse(-12, -4, 4, 3, 0, 0, TAU); g.fill();
  g.strokeStyle = '#8a8f98'; g.lineWidth = 2; g.beginPath(); g.arc(-10, -2, 10, Math.PI, 0); g.stroke();
  g.fillStyle = '#c9a23c'; rrect(g, 10, -6, 12, 18, 3); g.fill(); ink(g, 1.8); g.fillStyle = 'rgba(255, 214, 140, 0.9)'; g.fillRect(12, -2, 8, 8);
});

/** A rusted tool bench with spanners, an oil can and a fire bucket. */
export const toolBench = (): Sprite => S(110, 44, (g) => {
  g.translate(55, 22); shadow(g, 0, 14, 48, 8);
  g.fillStyle = '#4a3a28'; g.fillRect(-48, -8, 96, 22); g.strokeStyle = C.ink; g.lineWidth = 2; g.strokeRect(-48, -8, 96, 22);
  g.fillStyle = '#5a4630'; g.fillRect(-46, -6, 92, 6);
  g.strokeStyle = '#8a8f98'; g.lineWidth = 2.4; g.lineCap = 'round'; for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(-40 + i * 12, -2); g.lineTo(-30 + i * 12, -10 + (i % 2) * 4); g.stroke(); }
  g.fillStyle = C.red; g.beginPath(); g.moveTo(24, -22); g.lineTo(40, -22); g.lineTo(38, -4); g.lineTo(26, -4); g.closePath(); g.fill(); ink(g, 1.8); g.fillStyle = '#efe8d4'; g.fillRect(26, -17, 12, 3);
  g.fillStyle = '#c9a23c'; rrect(g, 42, -10, 10, 14, 2); g.fill(); ink(g, 1.4);
});

/** A rusted sign and a lamp: generic yard clutter with a lit lantern. */
export const lantern = (col = '#ffb347'): Sprite => S(40, 44, (g) => {
  g.translate(20, 22); shadow(g, 0, 14, 12, 5);
  g.fillStyle = '#2a2c32'; g.fillRect(-7, -14, 14, 24); ink(g, 1.8);
  g.fillStyle = col; g.fillRect(-4, -10, 8, 14); g.fillStyle = 'rgba(255,255,255,0.45)'; g.fillRect(-3, -9, 3, 5);
  g.strokeStyle = '#2a2c32'; g.lineWidth = 2; g.beginPath(); g.arc(0, -14, 5, Math.PI, 0); g.stroke();
});

/** A lost child's balloon tied to a bench: floats on a string (the string sways in the decor layer). */
export const balloon = (): Sprite => S(30, 60, (g) => {
  g.translate(15, 40);
  g.strokeStyle = 'rgba(232, 224, 200, 0.8)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(0, 14); g.quadraticCurveTo(-4, 4, 0, -10); g.stroke();
  g.fillStyle = '#d8402f'; g.beginPath(); g.ellipse(0, -20, 10, 13, 0, 0, TAU); g.fill(); ink(g, 1.8);
  g.beginPath(); g.moveTo(-2, -7); g.lineTo(2, -7); g.lineTo(0, -4); g.closePath(); g.fillStyle = '#d8402f'; g.fill(); ink(g, 1.2);
  g.fillStyle = 'rgba(255,255,255,0.5)'; g.beginPath(); g.ellipse(-3.5, -24, 2.6, 4, 0.4, 0, TAU); g.fill();
});

/** A flowerbed in a tub: the stationmaster's garden. */
export const tub = (): Sprite => S(50, 50, (g) => {
  g.translate(25, 25); shadow(g, 0, 12, 22, 9);
  g.fillStyle = '#6a4a2a'; g.beginPath(); g.ellipse(0, 4, 20, 14, 0, 0, TAU); g.fill(); ink(g);
  g.fillStyle = '#3a2a1a'; g.beginPath(); g.ellipse(0, 0, 17, 11, 0, 0, TAU); g.fill();
  for (let i = 0; i < 9; i++) { const a = hash(i, 1) * TAU, d = hash(i, 2) * 11; const x = Math.cos(a) * d, y = Math.sin(a) * d * 0.7; g.fillStyle = '#3f7a3a'; g.beginPath(); g.arc(x, y, 5, 0, TAU); g.fill(); g.fillStyle = ['#e8c868', '#d8402f', '#efe8d4', '#b4797f'][i % 4]!; g.beginPath(); g.arc(x - 1, y - 2, 2.6, 0, TAU); g.fill(); }
});

/** A rusted hanging ring of keys on a nail: tiny signal-box detail. Reused as a generic "ring". */
export const lifeRing = (): Sprite => S(36, 36, (g) => {
  g.translate(18, 18); g.strokeStyle = '#efe8d4'; g.lineWidth = 8; g.beginPath(); g.arc(0, 0, 10, 0, TAU); g.stroke(); g.strokeStyle = C.red; g.lineWidth = 8; g.setLineDash([8, 8]); g.stroke(); g.setLineDash([]); g.strokeStyle = C.ink; g.lineWidth = 1.6; g.beginPath(); g.arc(0, 0, 14, 0, TAU); g.stroke(); g.beginPath(); g.arc(0, 0, 6, 0, TAU); g.stroke();
});

/** A framed old photograph: "The Golden Arrow, 1908". */
export const photo = (): Sprite => S(40, 30, (g) => {
  g.translate(20, 15); g.fillStyle = C.brass; g.fillRect(-18, -12, 36, 24); ink(g, 1.8); g.fillStyle = '#c9bfa6'; g.fillRect(-15, -9, 30, 18); g.fillStyle = '#3a3a40'; g.fillRect(-12, 0, 24, 4); g.fillRect(-4, -4, 10, 4); g.fillStyle = '#e8e2d0'; g.beginPath(); g.arc(-8, -3, 2.4, 0, TAU); g.fill();
});

/** Sleeper-built hand trolley with a milk churn. */
export const churnTrolley = (): Sprite => S(80, 50, (g) => {
  g.translate(40, 25); shadow(g, 0, 16, 34, 8);
  g.fillStyle = '#6a4a2a'; g.fillRect(-32, 2, 64, 8); ink(g, 1.8); g.fillStyle = C.coal; for (const x of [-22, 22]) { g.beginPath(); g.arc(x, 14, 6, 0, TAU); g.fill(); }
  for (const x of [-12, 8]) { g.fillStyle = '#c3c9d2'; rrect(g, x - 8, -18, 16, 22, 4); g.fill(); ink(g, 1.8); g.fillStyle = '#9ea4ae'; g.fillRect(x - 8, -8, 16, 3); g.fillStyle = '#6a8a9a'; g.fillRect(x - 5, -20, 10, 3); }
  g.strokeStyle = '#4a3a2a'; g.lineWidth = 3; g.beginPath(); g.moveTo(32, 4); g.lineTo(46, -10); g.stroke();
});
