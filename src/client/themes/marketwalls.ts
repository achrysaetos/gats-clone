import { seeded } from '../grain.ts';
import { FACE, type Solid } from '../tilt.ts';
import { districtAt, font, hash, hexA, OUTLINE, rr, shade, type District } from './marketkit.ts';

type G = CanvasRenderingContext2D;
const TAU = Math.PI * 2;

/** The standard solid: dark front face under a lit top, hard bevels, ink outline. Everything below paints on top of it. */
function box(g: G, s: Solid, top: string, front: string) {
  const f = FACE[s.kind];
  g.fillStyle = front;
  g.fillRect(s.x, s.y + s.h, s.w, f);
  g.fillStyle = 'rgba(255, 255, 255, 0.12)';
  g.fillRect(s.x, s.y + s.h, s.w, 2);
  g.fillStyle = 'rgba(10, 12, 16, 0.32)';
  g.fillRect(s.x, s.y + s.h + f - Math.max(3, f * 0.28), s.w, Math.max(3, f * 0.28));
  g.fillStyle = top;
  g.fillRect(s.x, s.y, s.w, s.h);
  g.fillStyle = 'rgba(255, 255, 255, 0.2)';
  g.beginPath();
  g.moveTo(s.x, s.y); g.lineTo(s.x + s.w, s.y); g.lineTo(s.x + s.w - 4, s.y + 4); g.lineTo(s.x + 4, s.y + 4); g.lineTo(s.x + 4, s.y + s.h - 4); g.lineTo(s.x, s.y + s.h);
  g.fill();
  g.fillStyle = 'rgba(10, 12, 16, 0.3)';
  g.beginPath();
  g.moveTo(s.x + s.w, s.y); g.lineTo(s.x + s.w, s.y + s.h); g.lineTo(s.x, s.y + s.h); g.lineTo(s.x + 4, s.y + s.h - 4); g.lineTo(s.x + s.w - 4, s.y + s.h - 4); g.lineTo(s.x + s.w - 4, s.y + 4);
  g.fill();
}
function outline(g: G, s: Solid) {
  g.strokeStyle = OUTLINE;
  g.lineWidth = 2;
  g.strokeRect(s.x, s.y, s.w, s.h);
  g.strokeRect(s.x, s.y + s.h, s.w, FACE[s.kind]);
}
const ink = (g: G, lw = 1.5) => { g.strokeStyle = OUTLINE; g.lineWidth = lw; g.lineJoin = 'round'; };
const disc = (g: G, x: number, y: number, r: number, fill: string, stroke = true) => { g.fillStyle = fill; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); if (stroke) { ink(g, 1.5); g.stroke(); } };
const dot = (g: G, x: number, y: number, r: number, fill: string) => { g.fillStyle = fill; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); };
const slab = (g: G, x: number, y: number, w: number, h: number, fill: string, lw = 1.5) => { g.fillStyle = fill; g.fillRect(x, y, w, h); ink(g, lw); g.strokeRect(x, y, w, h); };
const text = (g: G, t: string, x: number, y: number, size: number, fill: string, align: CanvasTextAlign = 'center') => { g.font = font(size); g.textAlign = align; g.textBaseline = 'middle'; g.fillStyle = fill; g.fillText(t, x, y); };
const shadowDot = (g: G, x: number, y: number, rx: number, ry: number) => { g.fillStyle = 'rgba(14, 16, 22, 0.32)'; g.beginPath(); g.ellipse(x + 2, y + 3, rx, ry, 0, 0, TAU); g.fill(); };

export function fish(g: G, x: number, y: number, len: number, col: string, flip = 1) {
  g.save(); g.translate(x, y); g.scale(flip, 1);
  g.fillStyle = col;
  g.beginPath(); g.ellipse(0, 0, len / 2, len / 4.2, 0, 0, TAU); g.fill();
  g.beginPath(); g.moveTo(len / 2 - 2, 0); g.lineTo(len / 2 + len * 0.28, -len * 0.2); g.lineTo(len / 2 + len * 0.28, len * 0.2); g.closePath(); g.fill();
  ink(g, 1.2); g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.55)'; g.fillRect(-len * 0.3, -len * 0.1, len * 0.45, 1.4);
  dot(g, -len * 0.3, -len * 0.04, 1.3, OUTLINE);
  g.restore();
}
export function paperLantern(g: G, x: number, y: number, r: number, col: string) {
  g.fillStyle = OUTLINE; g.fillRect(x - r * 0.35, y - r * 1.1, r * 0.7, r * 0.3);
  g.fillStyle = col; g.beginPath(); g.ellipse(x, y, r * 0.86, r, 0, 0, TAU); g.fill();
  ink(g, 1.4); g.stroke();
  g.strokeStyle = 'rgba(30,10,10,0.35)'; g.lineWidth = 1;
  for (const k of [-0.45, 0, 0.45]) { g.beginPath(); g.ellipse(x, y, Math.abs(k) * r * 0.9 + 0.1, r * 0.98, 0, 0, TAU); g.stroke(); }
  g.fillStyle = 'rgba(255,255,255,0.4)'; g.beginPath(); g.ellipse(x - r * 0.3, y - r * 0.35, r * 0.18, r * 0.28, -0.4, 0, TAU); g.fill();
  g.fillStyle = OUTLINE; g.fillRect(x - r * 0.3, y + r * 0.95, r * 0.6, r * 0.25);
}
function stool(g: G, x: number, y: number, col = '#b84a3a') { shadowDot(g, x, y, 7, 5); disc(g, x, y, 6, col); dot(g, x - 1.6, y - 1.8, 1.4, 'rgba(255,255,255,0.45)'); }
function crateTop(g: G, x: number, y: number, w: number, h: number, wood: string) {
  slab(g, x, y, w, h, wood, 1.6);
  g.strokeStyle = 'rgba(20,14,8,0.5)'; g.lineWidth = 1;
  for (let i = 1; i < 4; i++) { g.beginPath(); g.moveTo(x + 1, y + (h * i) / 4); g.lineTo(x + w - 1, y + (h * i) / 4); g.stroke(); }
  g.fillStyle = 'rgba(255,255,255,0.16)'; g.fillRect(x + 1.5, y + 1.5, w - 3, 2);
}
function priceBoard(g: G, x: number, y: number, w: number, h: number, line: string) {
  slab(g, x, y, w, h, '#2c3a34', 1.5);
  g.strokeStyle = 'rgba(240,236,220,0.8)'; g.lineWidth = 1.1;
  g.beginPath(); g.moveTo(x + 3, y + 4); for (let i = 0; i < 4; i++) g.lineTo(x + 3 + ((i + 1) * (w - 6)) / 4, y + 4 + (i % 2 ? 1.4 : -0.4)); g.stroke();
  text(g, line, x + w / 2, y + h - 5, Math.min(11, h * 0.55), 'rgba(250,244,226,0.95)');
}

/* ----------------------------------------------------------------------------------------------- shopfront */

const poster = (g: G, x: number, y: number, w: number, h: number, col: string, seed: number) => {
  slab(g, x, y, w, h, '#efe4c4', 1.4);
  g.fillStyle = col; g.fillRect(x + 2, y + 2, w - 4, h * 0.38);
  dot(g, x + w / 2, y + h * 0.52, h * 0.1, col);
  g.fillStyle = 'rgba(40,30,20,0.55)'; for (let i = 0; i < 3; i++) g.fillRect(x + 3, y + h * 0.7 + i * 2.4, (w - 6) * (0.5 + 0.5 * hash(seed, i)), 1);
};

function airCon(g: G, x: number, y: number) {
  shadowDot(g, x + 11, y + 14, 12, 5);
  slab(g, x, y, 22, 16, '#8f979f', 1.6);
  disc(g, x + 11, y + 8, 5.4, '#5d646c');
  g.strokeStyle = OUTLINE; g.lineWidth = 1.2; g.beginPath(); g.moveTo(x + 11 - 4, y + 8); g.lineTo(x + 11 + 4, y + 8); g.moveTo(x + 11, y + 4); g.lineTo(x + 11, y + 12); g.stroke();
}
function waterTank(g: G, x: number, y: number, col: string) {
  shadowDot(g, x, y + 8, 12, 6);
  disc(g, x, y, 11, col);
  g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = 1; g.beginPath(); g.arc(x, y, 7, 0, TAU); g.stroke();
  dot(g, x - 3.5, y - 4, 2, 'rgba(255,255,255,0.4)');
}

type Spot = (g: G, x: number, y: number, d: District, seed: number) => void;

/** Rooftop vignettes: small stories on the roofs, which are never lanes. Each district has its own few. */
const ROOF_SPOTS: Record<string, Spot[]> = {
  temple: [
    (g, x, y) => { // the wishing rack: little wooden plaques on red cords, one of them a soldier's helmet
      slab(g, x, y, 78, 6, '#6b4a30', 1.6); slab(g, x + 4, y - 10, 4, 14, '#6b4a30', 1.2); slab(g, x + 70, y - 10, 4, 14, '#6b4a30', 1.2);
      for (let i = 0; i < 7; i++) { g.strokeStyle = '#c0392b'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(x + 8 + i * 10, y + 6); g.lineTo(x + 8 + i * 10, y + 12); g.stroke(); slab(g, x + 4 + i * 10, y + 12, 8, 10, i === 4 ? '#a9b38a' : '#e8d3a6', 1.1); }
      g.fillStyle = '#6c7356'; g.beginPath(); g.arc(x + 48, y + 20, 4.6, Math.PI, 0); g.lineTo(x + 52.6, y + 22); g.lineTo(x + 43.4, y + 22); g.fill(); ink(g, 1); g.stroke(); // the helmet plaque
    },
    (g, x, y) => { // tea table with two cups and a pot
      shadowDot(g, x + 18, y + 24, 20, 7); disc(g, x + 18, y + 16, 15, '#7a5a3a'); disc(g, x + 14, y + 13, 3.6, '#efe4c4'); disc(g, x + 24, y + 18, 3.6, '#efe4c4'); disc(g, x + 18, y + 20, 4.4, '#4f6e5e');
    },
  ],
  lantern: [
    (g, x, y, d, seed) => { // lantern workshop: a bench of lanterns waiting for their paint
      slab(g, x, y, 84, 22, '#8a6a42', 1.6);
      for (let i = 0; i < 4; i++) paperLantern(g, x + 12 + i * 20, y + 11, 7.5, i === 2 ? '#f1d9a0' : d.lantern);
      slab(g, x + 90, y + 4, 9, 9, '#c0392b', 1.2); slab(g, x + 90, y + 15, 9, 9, '#e9b44c', 1.2);
      g.strokeStyle = OUTLINE; g.lineWidth = 1.6; g.beginPath(); g.moveTo(x + 104, y + 2); g.lineTo(x + 114, y + 18); g.stroke();
    },
    (g, x, y) => { // fortune teller's table: cloth, cards, a glass ball
      shadowDot(g, x + 30, y + 30, 32, 8); slab(g, x, y, 60, 28, '#6a2d5a', 1.8);
      for (let i = 0; i < 3; i++) slab(g, x + 8 + i * 9, y + 6, 7, 11, '#f1e6c8', 1.1);
      disc(g, x + 46, y + 14, 6.5, '#9fc9d8'); dot(g, x + 44, y + 11.5, 1.8, 'rgba(255,255,255,0.8)');
      slab(g, x - 9, y + 4, 8, 6, '#b84a3a', 1.2);
    },
  ],
  fish: [
    (g, x, y) => { // drying line: three fish on a rail
      slab(g, x, y, 80, 3, '#5a4a38', 1.2);
      for (let i = 0; i < 4; i++) { g.save(); g.translate(x + 12 + i * 19, y + 5); g.rotate(Math.PI / 2); fish(g, 10, 0, 18, ['#9db4c4', '#c9a97c', '#8fa8a0', '#b9c5cc'][i]!); g.restore(); }
    },
    (g, x, y) => { // ice chest with the lid off and a few fish in the ice
      slab(g, x, y, 52, 32, '#d9e6ec', 1.8); slab(g, x + 4, y + 4, 44, 24, '#b9d8e6', 1.2);
      fish(g, x + 18, y + 12, 17, '#9db4c4'); fish(g, x + 34, y + 20, 15, '#c9a97c', -1);
      g.fillStyle = 'rgba(255,255,255,0.7)'; for (let i = 0; i < 6; i++) g.fillRect(x + 7 + i * 7, y + 6 + (i % 3) * 8, 3, 3);
    },
  ],
  produce: [
    (g, x, y) => { // a rooftop bed of leeks and cabbages under a tilted sheet
      slab(g, x, y, 70, 30, '#4a3a28', 1.8); for (let i = 0; i < 5; i++) disc(g, x + 8 + i * 13, y + 10 + (i % 2) * 9, 5.4, ['#7ab04a', '#9acb5a', '#5a9a4a'][i % 3]!);
      g.fillStyle = 'rgba(210,225,235,0.28)'; g.fillRect(x + 2, y + 2, 66, 8);
    },
    (g, x, y) => { // a dog asleep in a cardboard box
      slab(g, x, y, 46, 30, '#b08a58', 1.8); g.strokeStyle = 'rgba(60,40,20,0.5)'; g.lineWidth = 1; g.beginPath(); g.moveTo(x, y + 15); g.lineTo(x + 46, y + 15); g.stroke();
      g.fillStyle = '#c9a77a'; g.beginPath(); g.ellipse(x + 23, y + 16, 14, 8, 0.1, 0, TAU); g.fill(); ink(g, 1.2); g.stroke();
      disc(g, x + 12, y + 14, 5, '#a9855a'); g.fillStyle = '#6b4a30'; g.beginPath(); g.ellipse(x + 8.5, y + 11, 2.4, 4, -0.5, 0, TAU); g.fill();
    },
    (g, x, y) => { // a vendor's stool, a radio and a little fan
      stool(g, x, y + 8, '#4f8a3a'); slab(g, x + 18, y, 18, 11, '#3f4650', 1.4); disc(g, x + 24, y + 5.5, 3, '#8a8f96'); g.strokeStyle = OUTLINE; g.lineWidth = 1.2; g.beginPath(); g.moveTo(x + 33, y); g.lineTo(x + 40, y - 8); g.stroke();
      disc(g, x + 56, y + 6, 6.5, '#d9dee2'); g.strokeStyle = OUTLINE; g.beginPath(); g.moveTo(x + 52, y + 6); g.lineTo(x + 60, y + 6); g.moveTo(x + 56, y + 2); g.lineTo(x + 56, y + 10); g.stroke();
    },
  ],
  gate: [
    (g, x, y) => { // the festival board, hand lettered
      slab(g, x, y, 62, 40, '#f1e6c8', 1.8); g.fillStyle = '#c0392b'; g.fillRect(x + 3, y + 3, 56, 12);
      text(g, 'LANTERN FEST', x + 31, y + 9.5, 11, '#f7e6a8'); text(g, 'TONIGHT 8PM', x + 31, y + 24, 10, '#3a2c20'); text(g, 'FREE TEA', x + 31, y + 34, 8.5, '#8a3a2a');
    },
    (g, x, y) => { slab(g, x, y, 54, 34, '#4f5560', 1.8); disc(g, x + 18, y + 17, 9, '#cdeeea'); disc(g, x + 42, y + 17, 9, '#ff9ad8'); text(g, 'BUS', x + 27, y + 17, 9, '#1c1f26'); },
  ],
  spice: [
    (g, x, y) => { // a mahjong table in the middle of a hand: tiles, four stools, tea
      shadowDot(g, x + 28, y + 56, 34, 8); slab(g, x + 8, y + 8, 40, 40, '#2f6a50', 1.8);
      for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) slab(g, x + 12 + i * 8.5, y + 12 + (i % 2 ? 0 : 0) + j * 0.01, 7, 9, j ? '#efe4c4' : '#efe4c4', 1);
      for (let i = 0; i < 6; i++) slab(g, x + 14 + (i % 3) * 8, y + 28 + Math.floor(i / 3) * 9, 7, 8, '#efe4c4', 1);
      slab(g, x + 36, y + 30, 8, 8, '#a8d0c0', 1);
      stool(g, x + 28, y - 2, '#8a3a2a'); stool(g, x + 28, y + 58, '#8a3a2a'); stool(g, x - 2, y + 28, '#8a3a2a'); stool(g, x + 58, y + 28, '#8a3a2a');
    },
    (g, x, y) => { // sacks of spice, brass scale
      for (let i = 0; i < 3; i++) { g.fillStyle = ['#c98a3a', '#a8472f', '#b9a04a'][i]!; g.beginPath(); g.ellipse(x + 10 + i * 18, y + 14, 9, 12, 0, 0, TAU); g.fill(); ink(g, 1.4); g.stroke(); dot(g, x + 10 + i * 18, y + 5, 3, 'rgba(255,255,255,0.35)'); }
      disc(g, x + 64, y + 14, 8, '#d9b04a');
    },
  ],
  arcade: [
    (g, x, y, d) => { slab(g, x, y, 40, 30, '#232b36', 1.8); g.fillStyle = '#0f1a24'; g.fillRect(x + 4, y + 4, 32, 18); g.fillStyle = d.neon; g.fillRect(x + 8, y + 9, 8, 6); g.fillStyle = d.neon2; g.fillRect(x + 22, y + 13, 6, 5); dot(g, x + 12, y + 26, 2.2, '#d9541f'); dot(g, x + 24, y + 26, 2.2, '#ffd34d'); },
    (g, x, y) => { // high-score board
      slab(g, x, y, 66, 38, '#14202e', 1.8); text(g, 'HI-SCORE', x + 33, y + 9, 10, '#3fe0e0'); text(g, 'AAA 99870', x + 33, y + 21, 10, '#ff4fd0'); text(g, 'ZZZ 41200', x + 33, y + 31, 9, '#6fb8ff');
    },
    (g, x, y) => { // a small invader, painted on the tar by someone who snuck up here
      g.fillStyle = 'rgba(63,224,224,0.55)'; const rows = ['0011111100', '0111111110', '1101111011', '1111111111', '0011001100', '0110110110']; rows.forEach((r, j) => [...r].forEach((c, i) => { if (c === '1') g.fillRect(x + i * 3, y + j * 3, 3, 3); }));
    },
  ],
  noodle: [
    (g, x, y) => { // the hidden noodle stall: one stool, one steaming bowl, a tiny hand-lettered sign
      slab(g, x, y, 54, 22, '#a8472f', 1.8); slab(g, x + 6, y + 4, 42, 8, '#f1e6c8', 1.1); text(g, 'ONE SEAT', x + 27, y + 8.5, 7.5, '#7a2f1f');
      disc(g, x + 14, y + 17, 3.6, '#efe4c4'); stool(g, x + 28, y + 36, '#d4a02c');
      g.fillStyle = '#d4a02c'; g.fillRect(x + 4, y + 22, 3, 8); g.fillRect(x + 47, y + 22, 3, 8);
    },
    (g, x, y) => { for (let i = 0; i < 3; i++) { disc(g, x + 10 + i * 20, y + 10, 8, '#efe4c4'); disc(g, x + 10 + i * 20, y + 10, 5.4, ['#d9a548', '#c98a3a', '#e8b95a'][i]!, false); } },
  ],
  grill: [
    (g, x, y) => { // charcoal sacks and a crate of beer
      for (let i = 0; i < 3; i++) { g.fillStyle = '#2e2c2a'; g.beginPath(); g.ellipse(x + 10 + i * 16, y + 14, 8, 11, 0, 0, TAU); g.fill(); ink(g, 1.4); g.stroke(); dot(g, x + 8 + i * 16, y + 9, 2, 'rgba(255,255,255,0.22)'); }
      crateTop(g, x + 54, y + 4, 24, 18, '#8a6a42'); for (let i = 0; i < 3; i++) disc(g, x + 60 + i * 7, y + 13, 2.6, '#6a8a3a');
    },
    (g, x, y) => { // plastic stools around a low table
      slab(g, x + 10, y + 10, 30, 24, '#c9c2b0', 1.6); for (const [a, b] of [[4, 8], [44, 8], [4, 36], [44, 36]] as const) stool(g, x + a, y + b, '#d9541f');
    },
  ],
};


/** Furniture any roof can wear, so no two neighbouring roofs read as copies. */
const ROOF_EXTRAS: Spot[] = [
  (g, x, y) => { // laundry on a line: shirts and a pair of trousers
    g.strokeStyle = OUTLINE; g.lineWidth = 1.2; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 40, y + 8, x + 80, y); g.stroke();
    for (const [i, col] of ['#e8e2d0', '#6fa0c8', '#d9482f', '#e8e2d0'].entries()) { slab(g, x + 6 + i * 19, y + 3 + Math.sin(i) * 1.2, 11, i === 3 ? 18 : 13, col, 1.1); }
  },
  (g, x, y) => { // skylight with a lit pane
    slab(g, x, y, 44, 30, '#2a2d34', 1.8); g.fillStyle = 'rgba(255,224,150,0.45)'; g.fillRect(x + 4, y + 4, 36, 22); g.strokeStyle = OUTLINE; g.lineWidth = 1.2; g.beginPath(); g.moveTo(x + 22, y + 4); g.lineTo(x + 22, y + 26); g.stroke();
  },
  (g, x, y) => { // pots of herbs
    for (let i = 0; i < 4; i++) { disc(g, x + 8 + i * 15, y + 8 + (i % 2) * 7, 6.5, '#a8523a'); disc(g, x + 8 + i * 15, y + 8 + (i % 2) * 7, 4.2, ['#5a9a4a', '#7ab04a', '#4f8a3a'][i % 3]!, false); }
  },
  (g, x, y) => { // a satellite dish
    shadowDot(g, x + 14, y + 22, 14, 5); disc(g, x + 14, y + 12, 12, '#d9dee2'); disc(g, x + 14, y + 12, 6, '#aab2ba', false); g.strokeStyle = OUTLINE; g.lineWidth = 1.6; g.beginPath(); g.moveTo(x + 14, y + 12); g.lineTo(x + 24, y + 2); g.stroke(); dot(g, x + 25, y + 1, 1.8, '#d9541f');
  },
  (g, x, y) => { // stacked cardboard and a folded stool
    slab(g, x, y + 8, 30, 20, '#b08a58', 1.6); slab(g, x + 4, y, 22, 12, '#c49a68', 1.4); g.strokeStyle = 'rgba(60,40,20,0.5)'; g.lineWidth = 1; g.beginPath(); g.moveTo(x + 15, y + 8); g.lineTo(x + 15, y + 28); g.stroke();
  },
  (g, x, y) => { // pigeons on the ledge, one with its head turned
    for (let i = 0; i < 3; i++) { g.fillStyle = '#9aa0a8'; g.beginPath(); g.ellipse(x + i * 12, y + (i % 2) * 3, 5.5, 3.8, 0.3 * i, 0, TAU); g.fill(); ink(g, 1); g.stroke(); dot(g, x + i * 12 - 4.5, y + (i % 2) * 3 - 1, 1.8, '#6a7078'); }
  },
];

/** Roof material and colour by district: terracotta, green glaze, or corrugated tin. */
const ROOFS: Record<string, { kind: 'tiles' | 'tin'; base: string }> = {
  temple: { kind: 'tiles', base: '#9a4a3a' }, lantern: { kind: 'tiles', base: '#a8382e' }, fish: { kind: 'tin', base: '#7d97a3' },
  produce: { kind: 'tiles', base: '#4f8a5e' }, gate: { kind: 'tin', base: '#8a7a98' }, spice: { kind: 'tiles', base: '#b8683a' },
  arcade: { kind: 'tin', base: '#5d7390' }, noodle: { kind: 'tiles', base: '#c08a3a' }, grill: { kind: 'tin', base: '#a8603a' },
};

function paintRoof(g: G, s: Solid, d: District, rand: () => number) {
  const roof = ROOFS[d.id] ?? ROOFS.temple!;
  const base = shade(roof.base, (rand() - 0.5) * 0.14);
  g.fillStyle = base; g.fillRect(s.x, s.y, s.w, s.h);
  const x0 = s.x + 6, x1 = s.x + s.w - 6, y0 = s.y + 6, y1 = s.y + s.h - 6, mid = s.y + s.h / 2;
  g.save(); g.beginPath(); g.rect(x0, y0, x1 - x0, y1 - y0); g.clip();
  if (roof.kind === 'tiles') {
    // a gabled roof: lit slope north of the ridge, shaded slope south, rows of overlapping tiles
    g.fillStyle = 'rgba(255,240,210,0.13)'; g.fillRect(x0, y0, x1 - x0, mid - y0);
    g.fillStyle = 'rgba(12,10,16,0.2)'; g.fillRect(x0, mid, x1 - x0, y1 - mid);
    g.strokeStyle = 'rgba(30,14,10,0.34)'; g.lineWidth = 1.2; g.beginPath();
    for (let y = y0; y < y1; y += 9) { g.moveTo(x0, y + 0.5); g.lineTo(x1, y + 0.5); const off = ((y - y0) / 9) % 2 ? 7 : 0; for (let x = x0 + off; x < x1; x += 14) { g.moveTo(x + 0.5, y); g.lineTo(x + 0.5, y + 9); } }
    g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.1)'; for (let y = y0; y < y1; y += 9) g.fillRect(x0, y + 1.5, x1 - x0, 1.2);
  } else {
    // corrugated tin: ribs, panel seams, a little rust
    for (let x = x0, i = 0; x < x1; x += 6, i++) { g.fillStyle = i % 2 ? 'rgba(255,255,255,0.12)' : 'rgba(10,12,18,0.16)'; g.fillRect(x, y0, 3, y1 - y0); }
    g.fillStyle = 'rgba(10,12,18,0.28)'; for (let y = y0 + 70; y < y1; y += 90) g.fillRect(x0, y, x1 - x0, 2);
    g.fillStyle = 'rgba(150,70,30,0.22)'; for (let k = 0; k < 7; k++) g.fillRect(x0 + rand() * (x1 - x0), y0 + rand() * (y1 - y0), 2 + rand() * 3, 14 + rand() * 30);
  }
  g.restore();
  if (roof.kind === 'tiles') { // the ridge cap
    g.fillStyle = shade(roof.base, -0.35); g.fillRect(x0, mid - 4, x1 - x0, 8);
    g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(x0, mid - 4, x1 - x0, 2);
    ink(g, 1.4); g.strokeRect(x0, mid - 4, x1 - x0, 8);
  }
  // the parapet lip, with a lit edge
  g.strokeStyle = shade(roof.base, -0.42); g.lineWidth = 6; g.strokeRect(s.x + 3, s.y + 3, s.w - 6, s.h - 6);
  g.strokeStyle = 'rgba(255,255,255,0.28)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(s.x + 6, s.y + 5); g.lineTo(s.x + s.w - 6, s.y + 5); g.stroke();
}

function pottedPlant(g: G, x: number, y: number, rand: () => number) {
  shadowDot(g, x, y + 4, 8, 4); disc(g, x, y, 6, '#a8523a');
  for (let k = 0; k < 5; k++) dot(g, x + (rand() - 0.5) * 7, y + (rand() - 0.5) * 7, 3.6, ['#5a9a4a', '#7ab04a', '#4f8a3a'][k % 3]!);
  if (rand() < 0.5) dot(g, x + 2, y - 2, 1.8, ['#ff7a7a', '#ffd34d', '#ff9ad8'][Math.floor(rand() * 3)]!);
}

/** The shop's name on a proper signboard standing on the street-facing edge of the roof. */
function signboard(g: G, s: Solid, d: District, name: string) {
  const size = Math.max(11, Math.min(22, (s.w - 56) / (name.length * 0.5)));
  g.font = font(size);
  const w = Math.min(s.w - 24, g.measureText(name).width + 30), h = size + 12;
  const x = s.x + s.w / 2 - w / 2, y = s.y + s.h - h - 10;
  g.fillStyle = OUTLINE; g.fillRect(x + 6, y + h, 4, 6); g.fillRect(x + w - 10, y + h, 4, 6);
  g.fillStyle = hexA(d.neon, 0.22); g.fillRect(x - 5, y - 5, w + 10, h + 10);
  slab(g, x, y, w, h, '#1c2028', 2);
  g.strokeStyle = d.neon; g.lineWidth = 1.8; g.strokeRect(x + 3, y + 3, w - 6, h - 6);
  text(g, name, x + w / 2, y + h / 2 + 0.5, size, d.neon2);
}

export function paintShopfront(g: G, s: Solid) {
  const d = districtAt(s.x + s.w / 2, s.y + s.h / 2);
  const rand = seeded((hash(s.x, s.y) * 4294967296) >>> 0);
  const roof = ROOFS[d.id] ?? ROOFS.temple!;
  const front = shade(roof.base, -0.62);
  box(g, s, roof.base, front);
  const f = FACE.shopfront;
  // front: rolled shutters under a lit strip
  const doors = Math.max(1, Math.floor(s.w / 70));
  for (let i = 0; i < doors; i++) {
    const w = (s.w - 12) / doors, x = s.x + 6 + i * w;
    g.fillStyle = shade(front, 0.1 + 0.05 * ((i + Math.floor(rand() * 3)) % 3)); g.fillRect(x + 3, s.y + s.h + 7, w - 6, f - 8);
    g.strokeStyle = 'rgba(10,12,16,0.5)'; g.lineWidth = 1; g.beginPath(); for (let k = s.y + s.h + 10; k < s.y + s.h + f - 1; k += 3) { g.moveTo(x + 3, k + 0.5); g.lineTo(x + w - 3, k + 0.5); } g.stroke();
    const lit = rand() < 0.55;
    g.fillStyle = lit ? hexA(i % 2 ? d.neon : '#ffc27a', 0.95) : 'rgba(20,22,28,0.7)'; g.fillRect(x + 7, s.y + s.h + 2.5, w - 14, 3.2);
  }
  paintRoof(g, s, d, rand);
  const room = s.w >= 150 && s.h >= 150;
  const name = d.shops[Math.floor(hash(s.x * 3 + 1, s.y * 7 + 5) * d.shops.length) % d.shops.length]!;
  if (room) {
    airCon(g, s.x + s.w - 40, s.y + 22); if (rand() < 0.6) airCon(g, s.x + s.w - 40, s.y + 46);
    waterTank(g, s.x + 34, s.y + 74, shade(roof.base, 0.2));
    g.strokeStyle = '#2a2d34'; g.lineWidth = 2.2; g.beginPath(); g.moveTo(s.x + 46, s.y + 76); g.lineTo(s.x + s.w - 60, s.y + 76); g.lineTo(s.x + s.w - 60, s.y + 38); g.stroke();
    poster(g, s.x + 22, s.y + 22, 18, 24, d.neon, s.x + s.y);
    for (let i = 0; i < 3; i++) pottedPlant(g, s.x + 70 + i * 17, s.y + 20, rand);
    const spots = ROOF_SPOTS[d.id] ?? [];
    if (spots.length) {
      const k = Math.floor(hash(s.y, s.x) * spots.length);
      g.save(); g.translate(Math.round(s.x + s.w * (0.24 + 0.2 * rand())), Math.round(s.y + s.h * (0.27 + 0.16 * rand()))); g.scale(1.45, 1.45);
      spots[k]!(g, 0, 0, d, s.x);
      g.restore();
    }
    if (rand() < 0.85) { const e = ROOF_EXTRAS[Math.floor(hash(s.x + 5, s.y + 11) * ROOF_EXTRAS.length)]!; g.save(); g.translate(Math.round(s.x + s.w * (0.5 + 0.2 * rand())), Math.round(s.y + s.h * (0.5 + 0.12 * rand()))); g.scale(1.3, 1.3); e(g, 0, 0, d, s.x); g.restore(); }
  } else if (s.w >= 100) {
    airCon(g, s.x + 14, s.y + 14);
    waterTank(g, s.x + s.w - 24, s.y + 30, shade(roof.base, 0.2));
    pottedPlant(g, s.x + s.w / 2, s.y + 18, rand);
  }
  if (s.w >= 100) signboard(g, s, d, name);
  outline(g, s);
}

/* -------------------------------------------------------------------------------------------------- stalls */

const pile = (g: G, x: number, y: number, r: number, cols: readonly string[]) => { // a little pyramid of round things
  for (const [dx, dy, k] of [[-r, r * 0.7, 0], [r, r * 0.7, 1], [0, r * 0.7, 2], [-r * 0.5, -r * 0.5, 1], [r * 0.5, -r * 0.5, 0], [0, -r * 1.5, 2]] as const) { disc(g, x + dx, y + dy, r, cols[k % cols.length]!); dot(g, x + dx - r * 0.3, y + dy - r * 0.35, r * 0.25, 'rgba(255,255,255,0.45)'); }
};
const GOODS: Record<string, (g: G, x: number, y: number, i: number, seed: number) => void> = {
  temple: (g, x, y, i) => { if (i % 2) pile(g, x, y, 4, ['#e8a93a', '#d9662f']); else { g.strokeStyle = '#7a4a2a'; g.lineWidth = 1.4; for (let k = -3; k <= 3; k++) { g.beginPath(); g.moveTo(x + k * 1.6, y + 7); g.lineTo(x + k * 2.2, y - 8); g.stroke(); } dot(g, x, y - 8, 1.6, '#ff9a3c'); g.fillStyle = '#c0392b'; g.fillRect(x - 5, y + 2, 10, 3); } },
  lantern: (g, x, y, i) => paperLantern(g, x, y, 7.5, i % 3 === 0 ? '#f1d9a0' : i % 3 === 1 ? '#e5412d' : '#ffb347'),
  fish: (g, x, y, i) => { fish(g, x - 2, y - 3, 20, ['#b9c5cc', '#c9a97c', '#9db4c4'][i % 3]!, i % 2 ? 1 : -1); fish(g, x + 3, y + 7, 17, ['#9db4c4', '#d98a6a', '#b9c5cc'][i % 3]!, i % 2 ? -1 : 1); },
  produce: (g, x, y, i) => pile(g, x, y + 1, 4.4, [['#d9482f', '#e8a93a', '#6aa84a'], ['#c8d65a', '#6aa84a', '#d9482f'], ['#e8a93a', '#d9662f', '#c8d65a']][i % 3]!),
  gate: (g, x, y, i) => { g.strokeStyle = '#2a2d34'; g.lineWidth = 1; g.beginPath(); g.moveTo(x, y - 9); g.lineTo(x, y - 2); g.stroke(); disc(g, x, y + 2, 5, ['#ff9ad8', '#3fe0d0', '#ffd34d'][i % 3]!); dot(g, x, y + 2, 1.8, '#1c1f26'); },
  spice: (g, x, y, i) => { disc(g, x, y, 8, '#d9b04a'); disc(g, x, y, 6, '#2a2218', false); disc(g, x, y - 1, 5, ['#c98a3a', '#a8472f', '#b9a04a', '#6a3d8f'][i % 4]!, false); dot(g, x - 2, y - 3, 1.6, 'rgba(255,255,255,0.4)'); },
  arcade: (g, x, y, i) => { slab(g, x - 8, y - 6, 16, 12, '#232b36', 1.4); g.fillStyle = ['#3fe0e0', '#ff4fd0', '#9be36a'][i % 3]!; g.fillRect(x - 5, y - 3, 10, 5); dot(g, x + 5, y + 4, 1.4, '#ffd34d'); },
  noodle: (g, x, y, i) => { disc(g, x, y + 2, 8.5, '#c9a96a'); disc(g, x, y - 2, 8.5, '#d9b87a'); g.strokeStyle = 'rgba(80,50,20,0.55)'; g.lineWidth = 1; g.beginPath(); g.arc(x, y - 2, 5.4, 0, TAU); g.stroke(); },
  grill: (g, x, y, i) => { g.strokeStyle = '#7a5a3a'; g.lineWidth = 1.6; for (let k = 0; k < 3; k++) { g.beginPath(); g.moveTo(x - 8, y - 5 + k * 5); g.lineTo(x + 8, y - 5 + k * 5); g.stroke(); dot(g, x - 4, y - 5 + k * 5, 2.4, '#9a4a2a'); dot(g, x + 1, y - 5 + k * 5, 2.4, '#b8683a'); dot(g, x + 6, y - 5 + k * 5, 2.2, '#d98a4a'); } },
};
const SIGNS: Record<string, string> = { temple: 'OFFERINGS', lantern: '2 FOR 5', fish: 'FRESH! $12', produce: '3 FOR 10', gate: 'TOKENS', spice: 'BY WEIGHT', arcade: '1 PLAY', noodle: 'BOWL $6', grill: '5 STICKS' };

export function paintStall(g: G, s: Solid) {
  const d = districtAt(s.x + s.w / 2, s.y + s.h / 2);
  const rand = seeded((hash(s.x, s.y) * 4294967296) >>> 0);
  const wood = d.id === 'fish' ? '#a9b8bf' : d.id === 'arcade' ? '#3a4452' : '#8a6a42';
  box(g, s, wood, shade(d.awn[0], -0.35));
  const f = FACE.stall;
  // the apron: awning-coloured cloth with a scalloped hem
  g.fillStyle = d.awn[0]; g.fillRect(s.x + 1, s.y + s.h + 3, s.w - 2, f - 7);
  g.fillStyle = d.awn[1];
  for (let x = s.x + 1; x < s.x + s.w - 4; x += 16) g.fillRect(x, s.y + s.h + 3, 8, f - 7);
  g.fillStyle = d.awn[0];
  for (let x = s.x + 1; x < s.x + s.w - 4; x += 8) { g.beginPath(); g.arc(x + 4, s.y + s.h + f - 4, 4, 0, Math.PI); g.fill(); }
  g.strokeStyle = 'rgba(10,12,16,0.5)'; g.lineWidth = 1; g.beginPath(); g.moveTo(s.x + 1, s.y + s.h + 3.5); g.lineTo(s.x + s.w - 1, s.y + s.h + 3.5); g.stroke();
  // goods along the counter: fish lie on a bed of ice
  if (d.id === 'fish') { g.fillStyle = '#d6ecf5'; g.fillRect(s.x + 14, s.y + 5, s.w - 28, s.h - 10); g.fillStyle = 'rgba(255,255,255,0.8)'; for (let i = 0; i < 18; i++) g.fillRect(s.x + 16 + rand() * (s.w - 34), s.y + 6 + rand() * (s.h - 14), 3, 3); }
  const goods = GOODS[d.id] ?? GOODS.produce!;
  const n = Math.max(3, Math.floor((s.w - 44) / 26));
  for (let i = 0; i < n; i++) goods(g, s.x + 22 + i * ((s.w - 44) / Math.max(1, n - 1)), s.y + s.h / 2 + (i % 2 ? -3 : 3) * 0.7, i + Math.floor(rand() * 3), i);
  // a hand-written price board stands at one end, a till at the other
  if (s.w >= 150) {
    priceBoard(g, s.x + 5, s.y + 3, 30, 15, SIGNS[d.id] ?? '3 FOR 10');
    slab(g, s.x + s.w - 20, s.y + s.h / 2 - 6, 14, 12, '#3a3f48', 1.4); g.fillStyle = '#9be36a'; g.fillRect(s.x + s.w - 17, s.y + s.h / 2 - 3, 8, 3);
  }
  // easter eggs and little stories on specific stalls
  const h = hash(s.x, s.y);
  if (d.id === 'produce' && h < 0.5) { slab(g, s.x + s.w - 44, s.y + 4, 16, 12, '#3f4650', 1.3); disc(g, s.x + s.w - 36, s.y + 10, 3, '#8a8f96'); g.strokeStyle = OUTLINE; g.lineWidth = 1.2; g.beginPath(); g.moveTo(s.x + s.w - 30, s.y + 4); g.lineTo(s.x + s.w - 24, s.y - 0.5); g.stroke(); }
  if (d.id === 'lantern' && h > 0.5) { slab(g, s.x + s.w / 2 - 14, s.y + 5, 28, 16, '#efe4c4', 1.3); text(g, 'MENU', s.x + s.w / 2, s.y + 13, 9, '#7a2f1f'); }
  outline(g, s);
}

/* -------------------------------------------------------------------------------------------------- stacks */

/** The one crate in the fish market a cat has claimed. */
export const catStack = (s: { x: number; y: number }): boolean => hash(s.x, s.y) > 0.62;

export function paintStack(g: G, s: Solid) {
  const d = districtAt(s.x + s.w / 2, s.y + s.h / 2);
  const rand = seeded((hash(s.x, s.y) * 4294967296) >>> 0);
  const fishy = d.id === 'fish';
  const wood = fishy ? '#d9e4e8' : d.id === 'arcade' ? '#5d6572' : d.id === 'produce' ? '#9aa05a' : '#a3814f';
  box(g, s, wood, shade(wood, -0.38));
  const f = FACE.stack;
  g.strokeStyle = 'rgba(10,12,16,0.5)'; g.lineWidth = 1; g.beginPath();
  for (let x = s.x + 8; x < s.x + s.w - 3; x += 8) { g.moveTo(x + 0.5, s.y + s.h + 2); g.lineTo(x + 0.5, s.y + s.h + f - 1); }
  g.stroke();
  const cols = Math.max(1, Math.round(s.w / 50)), rows = Math.max(1, Math.round(s.h / 50));
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const x = s.x + (i * s.w) / cols + 3, y = s.y + (j * s.h) / rows + 3, w = s.w / cols - 6, h = s.h / rows - 6;
    crateTop(g, x, y, w, h, shade(wood, rand() * 0.12 - 0.04));
    if (fishy) { fish(g, x + w * 0.5, y + h * 0.5, 14, ['#9db4c4', '#c9a97c'][(i + j) % 2]!, (i + j) % 2 ? 1 : -1); g.fillStyle = 'rgba(255,255,255,0.8)'; g.fillRect(x + 3, y + 3, 4, 3); }
    else if (d.id === 'produce') { for (let k = 0; k < 4; k++) disc(g, x + 8 + (k % 2) * 12, y + 8 + Math.floor(k / 2) * 11, 4.4, ['#d9482f', '#e8a93a', '#6aa84a'][(k + i + j) % 3]!); }
    else if (d.id === 'arcade') { slab(g, x + 4, y + 5, w - 8, h - 10, '#232b36', 1.2); dot(g, x + 9, y + h / 2, 2, ['#3fe0e0', '#ff4fd0'][(i + j) % 2]!); }
    else if (d.id === 'spice') { disc(g, x + w / 2, y + h / 2, Math.min(w, h) * 0.32, ['#c98a3a', '#a8472f', '#6a3d8f'][(i + j) % 3]!); }
    else if (d.id === 'grill') { g.fillStyle = '#2e2c2a'; g.fillRect(x + 4, y + 4, w - 8, h - 8); g.fillStyle = 'rgba(255,138,58,0.5)'; g.fillRect(x + 8, y + 9, 5, 3); }
    else { g.fillStyle = 'rgba(30,20,10,0.35)'; g.fillRect(x + 6, y + h / 2, w - 12, 2); }
  }
  // the cat's crate: a fish tail hangs off one crate in the fish market
  if (fishy && catStack(s)) {
    const cx = s.x + s.w - 17, cy = s.y + s.h - 15;
    fish(g, cx - 12, cy + 7, 11, '#c9a97c'); shadowDot(g, cx, cy + 4, 9, 5);
    g.fillStyle = '#d98a3a'; g.beginPath(); g.ellipse(cx, cy + 2, 8, 6, 0, 0, TAU); g.fill(); ink(g, 1.4); g.stroke();
    disc(g, cx - 5, cy - 2, 4.6, '#d98a3a'); g.fillStyle = '#d98a3a'; g.beginPath(); g.moveTo(cx - 8, cy - 5); g.lineTo(cx - 7, cy - 9); g.lineTo(cx - 4.4, cy - 6); g.fill(); g.beginPath(); g.moveTo(cx - 3, cy - 6); g.lineTo(cx - 1, cy - 9); g.lineTo(cx - 0.6, cy - 4); g.fill();
    g.fillStyle = 'rgba(120,60,20,0.7)'; g.fillRect(cx - 2, cy - 1, 1.6, 6); g.fillRect(cx + 2, cy - 1, 1.6, 6);
  }
  outline(g, s);
}

/* ---------------------------------------------------------------------------------------------- carts, scooters */

function scooter(g: G, s: Solid, d: District, vertical: boolean) {
  const body = ['#d9dee2', '#e8a93a', '#d9482f', '#4fb0d0'][Math.floor(hash(s.x, s.y) * 4)]!;
  g.save();
  g.translate(s.x + s.w / 2, s.y + s.h / 2);
  if (!vertical) g.rotate(-Math.PI / 2);
  const L = (vertical ? s.h : s.w) / 2 - 6;
  shadowDot(g, 0, 0, 9, L * 0.9);
  // wheels, deck, seat, delivery box and handlebars, head up-screen
  g.fillStyle = '#23262c'; g.fillRect(-4, -L, 8, 12); g.fillRect(-4, L - 14, 8, 14);
  ink(g, 1.2); g.strokeRect(-4, -L, 8, 12); g.strokeRect(-4, L - 14, 8, 14);
  rr(g, -9, -L * 0.45, 18, L * 1.2, 5); g.fillStyle = body; g.fill(); ink(g, 1.8); g.stroke();
  slab(g, -8, L * 0.22, 16, 14, '#d9a548', 1.6); g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(-6, L * 0.22 + 2, 12, 2);
  slab(g, -6, -L * 0.1, 12, 10, '#2a2d34', 1.4);
  g.strokeStyle = OUTLINE; g.lineWidth = 3; g.beginPath(); g.moveTo(-11, -L * 0.7); g.lineTo(11, -L * 0.7); g.stroke();
  g.strokeStyle = '#9aa0a8'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(-11, -L * 0.7); g.lineTo(11, -L * 0.7); g.stroke();
  dot(g, 0, -L * 0.62, 2.6, '#ffe08a');
  g.restore();
}

export function paintCart(g: G, s: Solid) {
  const d = districtAt(s.x + s.w / 2, s.y + s.h / 2);
  const small = Math.min(s.w, s.h) <= 60;
  if (small) {
    // scooters have no front face: the body is a standing toy, drawn on a flat dark patch of floor so its outline reads
    const f = FACE.cart;
    void f;
    scooter(g, s, d, s.h >= s.w);
    return;
  }
  const rand = seeded((hash(s.x, s.y) * 4294967296) >>> 0);
  box(g, s, '#9aa0a8', '#4a5058');
  const f = FACE.cart;
  // wheels and a hand rail under the front face
  for (const x of [s.x + 22, s.x + s.w - 22]) { disc(g, x, s.y + s.h + f - 1, 6, '#23262c'); dot(g, x, s.y + s.h + f - 1, 2, '#8a8f96'); }
  g.fillStyle = d.awn[0]; g.fillRect(s.x + 2, s.y + s.h + 3, s.w - 4, 5);
  // the counter: pots, a wok, a stack of steamer baskets
  slab(g, s.x + 8, s.y + 8, s.w * 0.4, s.h - 16, '#3a3f48', 1.6);
  disc(g, s.x + 8 + s.w * 0.2, s.y + s.h / 2, Math.min(18, s.h * 0.32), '#23262c');
  dot(g, s.x + 8 + s.w * 0.2, s.y + s.h / 2, Math.min(11, s.h * 0.2), d.id === 'grill' ? '#ff7a2a' : '#52565e');
  for (let i = 0; i < 3; i++) disc(g, s.x + s.w * 0.62 + i * 13, s.y + s.h / 2 + (i % 2 ? 6 : -6), 8.5, '#c9a96a');
  slab(g, s.x + s.w - 26, s.y + 8, 18, 12, '#efe4c4', 1.3); text(g, d.id === 'noodle' ? '$6' : '$5', s.x + s.w - 17, s.y + 14, 8, '#7a2f1f');
  // a menu card pinned on the rail
  if (rand() < 0.6) { slab(g, s.x + 10, s.y + s.h + 11, 26, 12, '#f1e6c8', 1.2); g.fillStyle = 'rgba(80,40,20,0.55)'; g.fillRect(s.x + 13, s.y + s.h + 15, 18, 1); g.fillRect(s.x + 13, s.y + s.h + 18, 12, 1); }
  // the lucky cat on the grill row's cart (its arm is animated by the theme; this is the body)
  if (d.id === 'grill' && hash(s.x, s.y) > 0.2) { shadowDot(g, s.x + s.w - 10, s.y + 40, 8, 4); disc(g, s.x + s.w - 12, s.y + 36, 7.5, '#f4efe4'); disc(g, s.x + s.w - 12, s.y + 26, 5.6, '#f4efe4'); g.fillStyle = '#d9541f'; g.fillRect(s.x + s.w - 16, s.y + 30, 8, 2.4); dot(g, s.x + s.w - 14, s.y + 25, 0.9, OUTLINE); dot(g, s.x + s.w - 10, s.y + 25, 0.9, OUTLINE); }
  outline(g, s);
}

/* --------------------------------------------------------------------------------------------- landmarks */

const LAND: Record<string, (g: G, s: Solid, d: District) => void> = {
  temple: (g, s, d) => { // a small shrine: stone base, tiled roof, incense urn, offering plate
    const cx = s.x + s.w / 2, cy = s.y + s.h / 2;
    slab(g, s.x + 10, s.y + 12, s.w - 20, s.h - 24, '#9a958a', 1.8);
    for (let i = 0; i < 3; i++) { g.fillStyle = shade('#6b4a42', i * 0.08); g.beginPath(); g.moveTo(cx - 50 + i * 8, cy + 12 - i * 14); g.lineTo(cx + 50 - i * 8, cy + 12 - i * 14); g.lineTo(cx + 40 - i * 8, cy - 4 - i * 14); g.lineTo(cx - 40 + i * 8, cy - 4 - i * 14); g.closePath(); g.fill(); ink(g, 1.8); g.stroke(); }
    slab(g, cx - 8, cy + 10, 16, 14, d.awn[0], 1.6);
    disc(g, s.x + 28, s.y + s.h - 18, 8, '#6a625a'); dot(g, s.x + 28, s.y + s.h - 18, 3.4, '#ffb347');
    disc(g, s.x + s.w - 30, s.y + s.h - 18, 7, '#efe4c4'); dot(g, s.x + s.w - 33, s.y + s.h - 20, 2.6, '#e8a93a'); dot(g, s.x + s.w - 28, s.y + s.h - 17, 2.6, '#d9482f');
  },
  lantern: (g, s, d) => { // a standing lantern tower: three tiers of red paper on a post
    const cx = s.x + s.w / 2, cy = s.y + s.h / 2;
    disc(g, cx, cy + 20, 26, '#6a625a');
    for (let i = 0; i < 3; i++) paperLantern(g, cx, cy + 12 - i * 22, 20 - i * 3, i === 1 ? '#f1d9a0' : d.lantern);
  },
  fish: (g, s) => { // a tank wall: water, weed and slow fish
    slab(g, s.x + 8, s.y + 10, s.w - 16, s.h - 20, '#1f5a6e', 2);
    g.fillStyle = '#2f8aa2'; g.fillRect(s.x + 12, s.y + 14, s.w - 24, (s.h - 28) * 0.5);
    g.fillStyle = 'rgba(255,255,255,0.22)'; g.fillRect(s.x + 14, s.y + 16, s.w - 28, 4);
    g.strokeStyle = '#4f9a5a'; g.lineWidth = 2.2; for (let i = 0; i < 5; i++) { g.beginPath(); g.moveTo(s.x + 22 + i * 24, s.y + s.h - 20); g.quadraticCurveTo(s.x + 18 + i * 24, s.y + s.h - 34, s.x + 24 + i * 24, s.y + s.h - 46); g.stroke(); }
    fish(g, s.x + 50, s.y + 56, 18, '#ff9a3c'); fish(g, s.x + 100, s.y + 80, 14, '#f1e6c8', -1);
  },
  produce: (g, s) => { // a pyramid of fruit on a weighing scale
    const cx = s.x + s.w / 2;
    slab(g, s.x + 18, s.y + s.h - 40, s.w - 36, 22, '#7a5a3a', 1.8);
    const cols = ['#d9482f', '#e8a93a', '#6aa84a', '#c8d65a'];
    for (let r = 0; r < 4; r++) for (let i = 0; i <= 3 - r; i++) disc(g, cx - (3 - r) * 10 + i * 20, s.y + s.h - 50 - r * 16, 9.5, cols[(i + r) % 4]!);
    disc(g, s.x + s.w - 24, s.y + 26, 12, '#d9dee2'); g.strokeStyle = OUTLINE; g.lineWidth = 1.5; g.beginPath(); g.moveTo(s.x + s.w - 24, s.y + 26); g.lineTo(s.x + s.w - 19, s.y + 21); g.stroke();
  },
  gate: (g, s, d) => { slab(g, s.x + 10, s.y + 10, s.w - 20, s.h - 20, '#3a3f4a', 2); text(g, 'GATE', s.x + s.w / 2, s.y + s.h / 2, 28, d.neon); },
  spice: (g, s) => { // brass urns of spice and a striped awning of sacks
    const cols = ['#c98a3a', '#a8472f', '#6a3d8f', '#b9a04a'];
    for (let i = 0; i < 4; i++) { const x = s.x + 28 + (i % 2) * 52, y = s.y + 34 + Math.floor(i / 2) * 52; disc(g, x, y, 20, '#c9a24a'); disc(g, x, y, 14, cols[i]!, false); dot(g, x - 5, y - 6, 3, 'rgba(255,255,255,0.45)'); }
  },
  arcade: (g, s, d) => { // a bank of cabinets, screens glowing
    for (let i = 0; i < 3; i++) {
      const x = s.x + 12 + i * 44, y = s.y + 16;
      slab(g, x, y, 38, s.h - 32, '#232b36', 2); slab(g, x + 4, y + 5, 30, 34, '#0f1a24', 1.4);
      g.fillStyle = [d.neon, d.neon2, '#9be36a'][i]!; g.fillRect(x + 8, y + 10, 8, 6); g.fillRect(x + 20, y + 22, 8, 6);
      dot(g, x + 12, y + 56, 3, '#d9541f'); dot(g, x + 26, y + 56, 3, '#ffd34d');
    }
  },
  noodle: (g, s, d) => { // a giant bowl sign on a pole
    const cx = s.x + s.w / 2, cy = s.y + s.h / 2;
    shadowDot(g, cx, cy + 34, 44, 10);
    g.fillStyle = '#efe4c4'; g.beginPath(); g.ellipse(cx, cy, 52, 40, 0, 0, TAU); g.fill(); ink(g, 2); g.stroke();
    disc(g, cx, cy - 2, 38, d.neon2, false);
    g.strokeStyle = '#f4ecd0'; g.lineWidth = 3; for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(cx - 28, cy - 14 + i * 9); g.quadraticCurveTo(cx, cy - 22 + i * 9, cx + 28, cy - 14 + i * 9); g.stroke(); }
    g.strokeStyle = '#7a5a3a'; g.lineWidth = 4; g.beginPath(); g.moveTo(cx + 20, cy - 36); g.lineTo(cx + 48, cy - 60); g.moveTo(cx + 30, cy - 38); g.lineTo(cx + 56, cy - 56); g.stroke();
  },
  grill: (g, s) => { // a big charcoal smoker: grate, coals, a chimney
    slab(g, s.x + 12, s.y + 18, s.w - 24, s.h - 34, '#2a2d34', 2);
    g.fillStyle = '#ff7a2a'; g.fillRect(s.x + 20, s.y + 28, s.w - 40, s.h - 54);
    g.fillStyle = '#d9541f'; for (let i = 0; i < 9; i++) g.fillRect(s.x + 24 + (i % 5) * 20, s.y + 32 + Math.floor(i / 5) * 24, 10, 8);
    g.strokeStyle = '#1c1f26'; g.lineWidth = 2.4; for (let i = 0; i < 7; i++) { g.beginPath(); g.moveTo(s.x + 22 + i * 17, s.y + 26); g.lineTo(s.x + 22 + i * 17, s.y + s.h - 28); g.stroke(); }
    for (let i = 0; i < 3; i++) { g.strokeStyle = '#7a5a3a'; g.lineWidth = 2; g.beginPath(); g.moveTo(s.x + 24, s.y + 40 + i * 20); g.lineTo(s.x + s.w - 24, s.y + 40 + i * 20); g.stroke(); dot(g, s.x + 50 + i * 20, s.y + 40 + i * 20, 3, '#9a4a2a'); }
    slab(g, s.x + s.w - 34, s.y - 4, 18, 22, '#4a4f58', 1.8);
  },
};

export function paintLandmark(g: G, s: Solid, round = false) {
  const d = districtAt(s.x + s.w / 2, s.y + s.h / 2);
  const base = d.id === 'fish' ? '#8fa3ad' : d.id === 'arcade' ? '#3a4452' : d.id === 'grill' ? '#4a3f3a' : '#8a8478';
  box(g, s, base, shade(base, -0.42));
  const cx = s.x + s.w / 2, cy = s.y + s.h / 2;
  if (round) {
    // A round post: the art was drawn for a square, so it is shrunk to the square that fits inside the circle and set on a stone
    // plinth ring, instead of being cut off by the clip.
    const r = Math.min(s.w, s.h) / 2;
    g.fillStyle = shade(base, 0.12); g.beginPath(); g.arc(cx, cy, r - 3, 0, TAU); g.fill();
    g.fillStyle = shade(base, -0.18); g.beginPath(); g.arc(cx, cy, r - 3, 0, TAU); g.arc(cx - 1.5, cy - 1.5, r - 9, 0, TAU, true); g.fill('evenodd');
    ink(g, 1.6); g.beginPath(); g.arc(cx, cy, r - 9, 0, TAU); g.stroke();
    const k = 0.66;
    g.save(); g.translate(cx, cy); g.scale(k, k); g.translate(-cx, -cy);
    (LAND[d.id] ?? LAND.temple!)(g, s, d);
    g.restore();
  } else {
    (LAND[d.id] ?? LAND.temple!)(g, s, d);
  }
  // The district plaque: a small plate low on the top face. (On the front face it was cut to a sliver by the round post's clip.)
  g.font = font(10);
  const pw = Math.min(g.measureText(d.name).width + 10, 82), py = s.y + s.h - 14;
  g.fillStyle = 'rgba(20, 22, 28, 0.86)'; rr(g, cx - pw / 2, py - 7, pw, 14, 3); g.fill();
  ink(g, 1.4); g.stroke();
  text(g, d.name, cx, py + 0.5, 10, hexA(d.neon2, 0.95));
  outline(g, s);
}
