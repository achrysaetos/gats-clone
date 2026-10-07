import { C, DISTRICTS, hash } from './parkkit.ts';

/**
 * Hand-drawn little things for the Park, each a function that paints around its own origin (0, 0) and is cached as a sprite
 * by parkdecor.ts. Ink outlines 2 px, one light from the top left, nothing bigger than a few players, and none of it in a lane.
 */
type G = CanvasRenderingContext2D;
const TAU = Math.PI * 2;
const INK = C.ink;

const outline = (g: G, w = 2) => { g.strokeStyle = INK; g.lineWidth = w; g.lineJoin = 'round'; g.stroke(); };
function blob(g: G, x: number, y: number, rx: number, ry: number, fill: string, w = 2, rot = 0) {
  g.beginPath(); g.ellipse(x, y, rx, ry, rot, 0, TAU); g.fillStyle = fill; g.fill(); if (w) outline(g, w);
}
function box(g: G, x: number, y: number, w: number, h: number, fill: string, lw = 2) {
  g.fillStyle = fill; g.fillRect(x, y, w, h); if (lw) { g.strokeStyle = INK; g.lineWidth = lw; g.lineJoin = 'round'; g.strokeRect(x, y, w, h); }
}
const shadow = (g: G, x: number, y: number, rx: number, ry: number) => blob(g, x, y, rx, ry, 'rgba(14, 18, 24, 0.3)', 0);

export type Sprite = { w: number; h: number; ax: number; ay: number; draw: (g: G) => void };

/* ---------------------------------------------------------------- signs */

/** A wooden signpost with a painted arrow board; the arrow points `dir` (-1 left, 1 right). */
export function signpost(name: string, dir: 1 | -1, sub?: string): Sprite {
  const w = 280, h = 112;
  return {
    w, h, ax: 140, ay: 96, draw: (g) => {
      shadow(g, 10, 3, 18, 6);
      box(g, -4, -62, 9, 66, C.wood, 2);
      g.fillStyle = C.woodHi; g.fillRect(-3, -61, 3, 64);
      box(g, -2, -4, 5, 5, C.woodLo, 0);
      // The board, notched into an arrow at one end.
      const bw = 132, bh = 30, x0 = dir > 0 ? -22 : -bw + 22;
      g.beginPath();
      if (dir > 0) { g.moveTo(x0, -78); g.lineTo(x0 + bw - 16, -78); g.lineTo(x0 + bw, -78 + bh / 2); g.lineTo(x0 + bw - 16, -78 + bh); g.lineTo(x0, -78 + bh); } else { g.moveTo(x0 + bw, -78); g.lineTo(x0 + 16, -78); g.lineTo(x0, -78 + bh / 2); g.lineTo(x0 + 16, -78 + bh); g.lineTo(x0 + bw, -78 + bh); }
      g.closePath();
      g.fillStyle = '#d9c9a0'; g.fill(); outline(g, 2);
      g.fillStyle = 'rgba(255,255,255,0.3)'; g.fillRect(Math.min(x0, x0 + bw) + 6, -76, bw - 30, 4);
      g.fillStyle = '#2a2d33';
      g.font = `bold ${name.length > 12 ? 9.5 : 11.5}px sans-serif`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(name, x0 + bw / 2 - dir * 4, -78 + bh / 2 + 1);
      if (sub) {
        box(g, -34, -42, 68, 15, '#b9a77c', 1.5);
        g.fillStyle = '#2a2d33'; g.font = 'bold 8.5px sans-serif'; g.fillText(sub, 0, -34);
      }
      g.fillStyle = C.iron; for (const [bx, by] of [[x0 + 8, -70], [x0 + bw - 8, -70]]) { g.beginPath(); g.arc(dir > 0 ? bx! : x0 + bw - (bx! - x0), by!, 1.6, 0, TAU); g.fill(); }
    },
  };
}

/* ----------------------------------------------------- bandstand green */

export const speakerStack = (): Sprite => ({
  w: 80, h: 80, ax: 40, ay: 60, draw: (g) => {
    shadow(g, 6, 4, 30, 8);
    for (const [x, y, s] of [[-26, -34, 30], [4, -34, 30], [-12, -62, 28]] as const) {
      box(g, x, y, s, s, '#2d3138', 2);
      g.fillStyle = 'rgba(255,255,255,0.14)'; g.fillRect(x + 2, y + 2, s - 4, 3);
      blob(g, x + s / 2, y + s / 2 + 2, s * 0.3, s * 0.3, '#1b1e24', 1.5);
      blob(g, x + s / 2, y + s / 2 + 2, s * 0.1, s * 0.1, '#4a4f58', 0);
    }
    g.fillStyle = C.rust; g.fillRect(-22, -4, 26, 5);
  },
});

export const stackedChairs = (): Sprite => ({
  w: 60, h: 80, ax: 30, ay: 62, draw: (g) => {
    shadow(g, 4, 4, 20, 6);
    for (let i = 0; i < 4; i++) {
      const y = -8 - i * 11;
      box(g, -16, y - 6, 32, 7, i % 2 ? '#a8552e' : '#c06a3c', 2);
      box(g, -16, y - 22, 5, 17, '#2b2e34', 1.5);
      box(g, 11, y - 22, 5, 17, '#2b2e34', 1.5);
    }
    box(g, -14, 1, 4, 8, '#2b2e34', 1.5); box(g, 10, 1, 4, 8, '#2b2e34', 1.5);
  },
});

export const banner = (): Sprite => ({
  w: 250, h: 60, ax: 125, ay: 30, draw: (g) => {
    g.beginPath(); g.moveTo(-110, -22); g.quadraticCurveTo(0, -14, 110, -22); g.lineTo(106, 18); g.quadraticCurveTo(0, 28, -106, 18); g.closePath();
    g.fillStyle = '#c9a23c'; g.fill(); outline(g, 2);
    g.fillStyle = '#a8552e'; g.fillRect(-100, -14, 6, 30); g.fillRect(94, -14, 6, 30);
    g.fillStyle = '#2a2d33'; g.font = 'bold 11.5px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('MIDSUMMER LANTERN NIGHT', 0, 2);
    g.fillStyle = INK; for (const x of [-108, 108]) { g.beginPath(); g.arc(x, -22, 3, 0, TAU); g.fill(); }
  },
});

export const iceCream = (): Sprite => ({
  w: 70, h: 60, ax: 35, ay: 30, draw: (g) => {
    blob(g, 8, 6, 22, 9, 'rgba(236, 226, 205, 0.85)', 0);
    blob(g, 2, 4, 10, 5, 'rgba(255, 250, 235, 0.9)', 0);
    g.save(); g.translate(-8, -2); g.rotate(2.2);
    g.beginPath(); g.moveTo(-5, -5); g.lineTo(5, -5); g.lineTo(0, 18); g.closePath(); g.fillStyle = '#c99a5a'; g.fill(); outline(g, 1.8);
    g.restore();
  },
});

export const flyers = (seed: number): Sprite => ({
  w: 130, h: 90, ax: 65, ay: 45, draw: (g) => {
    for (let i = 0; i < 5; i++) {
      g.save(); g.translate((hash(seed, i, 1) - 0.5) * 90, (hash(seed, i, 2) - 0.5) * 50); g.rotate(hash(seed, i, 3) * TAU);
      box(g, -9, -12, 18, 24, i === 2 ? '#e8c868' : '#e2dccb', 1.5);
      g.fillStyle = 'rgba(40,40,46,0.55)'; g.fillRect(-6, -8, 12, 3); g.fillRect(-6, -2, 12, 2); g.fillRect(-6, 3, 8, 2);
      g.restore();
    }
  },
});

export const buntingCoil = (): Sprite => ({
  w: 100, h: 80, ax: 50, ay: 40, draw: (g) => {
    shadow(g, 4, 6, 34, 8);
    const cols = [C.rust, C.mustard, C.cream, C.teal, C.rose];
    g.strokeStyle = '#5a4a36'; g.lineWidth = 3;
    g.beginPath(); g.ellipse(0, 0, 30, 14, 0.2, 0, TAU); g.stroke();
    for (let i = 0; i < 9; i++) {
      const a = i * 0.72;
      g.save(); g.translate(Math.cos(a) * 30, Math.sin(a) * 14); g.rotate(a + 1.2);
      g.beginPath(); g.moveTo(-6, 0); g.lineTo(6, 0); g.lineTo(0, 13); g.closePath(); g.fillStyle = cols[i % 5]!; g.fill(); outline(g, 1.5);
      g.restore();
    }
  },
});

export const stepLadder = (): Sprite => ({
  w: 70, h: 100, ax: 35, ay: 80, draw: (g) => {
    shadow(g, 6, 4, 22, 6);
    g.strokeStyle = INK; g.lineWidth = 8; g.lineCap = 'round';
    g.beginPath(); g.moveTo(-16, 0); g.lineTo(-8, -64); g.moveTo(16, 0); g.lineTo(8, -64); g.stroke();
    g.strokeStyle = C.woodHi; g.lineWidth = 4.5;
    g.beginPath(); g.moveTo(-16, 0); g.lineTo(-8, -64); g.moveTo(16, 0); g.lineTo(8, -64); g.stroke();
    g.strokeStyle = INK; g.lineWidth = 6;
    for (const y of [-14, -30, -46]) { g.beginPath(); g.moveTo(-13 + (-y) * 0.1, y); g.lineTo(13 - (-y) * 0.1, y); g.stroke(); }
    g.strokeStyle = C.wood; g.lineWidth = 3;
    for (const y of [-14, -30, -46]) { g.beginPath(); g.moveTo(-13 + (-y) * 0.1, y); g.lineTo(13 - (-y) * 0.1, y); g.stroke(); }
    g.lineCap = 'butt';
  },
});

/* ---------------------------------------------------------- playground */

export const hopscotch = (): Sprite => ({
  w: 80, h: 190, ax: 40, ay: 95, draw: (g) => {
    g.strokeStyle = 'rgba(245, 242, 225, 0.8)'; g.lineWidth = 3; g.lineJoin = 'round';
    const cells: [number, number, number][] = [[0, 70, 1], [0, 46, 1], [-14, 22, 2], [0, 0, 1], [-14, -24, 2], [0, -48, 1], [0, -74, 3]];
    let n = 0;
    for (const [x, y, k] of cells) {
      n++;
      if (k === 2) { g.strokeRect(x - 12, y - 11, 24, 22); g.strokeRect(x + 12, y - 11, 24, 22); } else g.strokeRect(x - 12, y - 11, 24, 22);
      g.fillStyle = 'rgba(245, 242, 225, 0.8)'; g.font = 'bold 10px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      if (k !== 3) g.fillText(String(n), x, y + 1);
    }
    g.beginPath(); g.arc(0, -86, 10, 0, TAU); g.stroke();
    g.strokeStyle = 'rgba(232, 160, 190, 0.8)'; g.beginPath(); g.moveTo(34, 60); g.lineTo(34, 40); g.stroke();
  },
});

export const sandcastle = (): Sprite => ({
  w: 110, h: 90, ax: 55, ay: 55, draw: (g) => {
    shadow(g, 6, 4, 30, 8);
    box(g, -22, -16, 44, 20, '#cdb98c', 2);
    for (const x of [-22, -8, 6, 20]) { g.fillStyle = '#cdb98c'; g.fillRect(x - 3, -24, 7, 9); g.strokeStyle = INK; g.lineWidth = 1.8; g.strokeRect(x - 3, -24, 7, 9); }
    box(g, -8, -34, 16, 18, '#d9c699', 2);
    g.beginPath(); g.moveTo(0, -34); g.lineTo(0, -48); g.stroke();
    g.beginPath(); g.moveTo(0, -48); g.lineTo(11, -44); g.lineTo(0, -40); g.closePath(); g.fillStyle = C.rust; g.fill(); outline(g, 1.5);
    // The bucket and the spade, left where the builder dropped them.
    g.save(); g.translate(34, 6); g.rotate(0.5);
    g.beginPath(); g.moveTo(-8, -9); g.lineTo(8, -9); g.lineTo(6, 8); g.lineTo(-6, 8); g.closePath(); g.fillStyle = C.teal; g.fill(); outline(g, 2);
    g.restore();
    g.save(); g.translate(-38, 10); g.rotate(-0.5); box(g, -2, -14, 4, 22, C.woodHi, 1.5); box(g, -6, 6, 12, 9, C.rust, 1.5); g.restore();
  },
});

export const tricycle = (): Sprite => ({
  w: 100, h: 80, ax: 50, ay: 40, draw: (g) => {
    shadow(g, 4, 10, 32, 8);
    g.save(); g.rotate(-0.12);
    blob(g, 16, 6, 12, 12, 'rgba(0,0,0,0)', 3);
    blob(g, -20, 12, 8, 8, 'rgba(0,0,0,0)', 2.5);
    blob(g, -20, -2, 8, 8, 'rgba(0,0,0,0)', 2.5);
    g.strokeStyle = INK; g.lineWidth = 7; g.lineCap = 'round';
    g.beginPath(); g.moveTo(-20, 5); g.lineTo(-4, -4); g.lineTo(16, 6); g.stroke();
    g.strokeStyle = C.rust; g.lineWidth = 3.5; g.stroke();
    g.strokeStyle = INK; g.lineWidth = 6; g.beginPath(); g.moveTo(10, -12); g.lineTo(22, -12); g.stroke();
    g.strokeStyle = C.mustard; g.lineWidth = 2.5; g.stroke();
    box(g, -10, -14, 12, 5, '#2b2e34', 1.5);
    g.restore(); g.lineCap = 'butt';
  },
});

/* ------------------------------------------------------------- the pond */

export const lanternString = (): Sprite => ({
  w: 10, h: 10, ax: 5, ay: 5, draw: () => {},
});

export const fishingSpot = (): Sprite => ({
  w: 120, h: 90, ax: 60, ay: 50, draw: (g) => {
    shadow(g, 10, 6, 30, 8);
    g.save(); g.translate(-30, 0); g.rotate(-0.35);
    g.strokeStyle = INK; g.lineWidth = 5; g.beginPath(); g.moveTo(-10, 6); g.lineTo(70, -8); g.stroke();
    g.strokeStyle = C.woodHi; g.lineWidth = 2.4; g.stroke();
    g.restore();
    g.beginPath(); g.moveTo(-6, -2); g.quadraticCurveTo(10, -26, 26, -12); g.strokeStyle = 'rgba(230,230,220,0.7)'; g.lineWidth = 1.2; g.stroke();
    // A tin bucket with a fish tail over the lip.
    g.beginPath(); g.moveTo(26, 0); g.lineTo(52, 0); g.lineTo(48, 24); g.lineTo(30, 24); g.closePath(); g.fillStyle = '#7d8590'; g.fill(); outline(g, 2);
    g.fillStyle = 'rgba(255,255,255,0.3)'; g.fillRect(29, 2, 4, 20);
    g.beginPath(); g.moveTo(44, -2); g.lineTo(54, -14); g.lineTo(56, -4); g.closePath(); g.fillStyle = '#9cb5b0'; g.fill(); outline(g, 1.6);
  },
});

/* ---------------------------------------------------------- rose garden */

export const gnome = (): Sprite => ({
  w: 44, h: 54, ax: 22, ay: 46, draw: (g) => {
    blob(g, 0, -4, 8, 7, '#e8c2a0', 1.8);
    g.beginPath(); g.moveTo(-9, -8); g.lineTo(0, -34); g.lineTo(10, -8); g.closePath(); g.fillStyle = '#c0392b'; g.fill(); outline(g, 1.8);
    g.beginPath(); g.moveTo(-8, 0); g.quadraticCurveTo(0, 18, 8, 0); g.lineTo(0, 4); g.closePath(); g.fillStyle = '#f2eee0'; g.fill(); outline(g, 1.6);
    g.fillStyle = INK; g.fillRect(-4, -5, 2, 2); g.fillRect(2, -5, 2, 2);
  },
});

export const wateringCan = (): Sprite => ({
  w: 80, h: 60, ax: 40, ay: 30, draw: (g) => {
    shadow(g, 4, 10, 24, 6);
    box(g, -14, -12, 28, 22, '#5d7f78', 2);
    g.beginPath(); g.moveTo(14, -4); g.lineTo(34, -18); g.lineWidth = 6; g.strokeStyle = INK; g.stroke(); g.lineWidth = 3; g.strokeStyle = '#5d7f78'; g.stroke();
    g.beginPath(); g.arc(-8, -6, 11, Math.PI * 0.9, Math.PI * 2.1); g.strokeStyle = INK; g.lineWidth = 5; g.stroke(); g.strokeStyle = '#5d7f78'; g.lineWidth = 2.4; g.stroke();
    blob(g, 36, -19, 5, 5, '#c9c2ac', 1.6);
  },
});

export const bicycle = (): Sprite => ({
  w: 130, h: 90, ax: 65, ay: 62, draw: (g) => {
    shadow(g, 6, 8, 44, 8);
    g.save(); g.rotate(-0.1);
    for (const x of [-34, 34]) {
      blob(g, x, 0, 20, 20, 'rgba(0,0,0,0)', 5.5);
      g.strokeStyle = '#3d3f46'; g.lineWidth = 2.6; g.beginPath(); g.arc(x, 0, 20, 0, TAU); g.stroke();
      g.strokeStyle = 'rgba(210,210,200,0.6)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(x - 20, 0); g.lineTo(x + 20, 0); g.moveTo(x, -20); g.lineTo(x, 20); g.stroke();
    }
    g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(-34, 0); g.lineTo(-8, -26); g.lineTo(22, -26); g.lineTo(34, 0); g.moveTo(-8, -26); g.lineTo(2, 0); g.lineTo(-34, 0); g.moveTo(2, 0); g.lineTo(22, -26);
    g.strokeStyle = INK; g.lineWidth = 7; g.stroke(); g.strokeStyle = C.rust; g.lineWidth = 3.2; g.stroke();
    g.beginPath(); g.moveTo(22, -26); g.lineTo(26, -38); g.lineTo(38, -40); g.strokeStyle = INK; g.lineWidth = 6; g.stroke(); g.strokeStyle = '#3d3f46'; g.lineWidth = 2.6; g.stroke();
    box(g, -18, -36, 18, 6, '#2b2e34', 1.8);
    g.restore(); g.lineCap = 'butt';
  },
});

/* --------------------------------------------------------- the fountain */

export const dogBall = (): Sprite => ({
  w: 70, h: 50, ax: 35, ay: 25, draw: (g) => {
    shadow(g, 3, 8, 12, 4);
    blob(g, 0, 0, 10, 10, '#c9d94a', 2);
    g.strokeStyle = 'rgba(245,250,230,0.9)'; g.lineWidth = 1.6; g.beginPath(); g.arc(-12, 0, 11, -0.9, 0.9); g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.7)'; g.fillRect(-4, -6, 3, 3);
    // Bite marks.
    g.fillStyle = 'rgba(30,30,24,0.5)'; g.beginPath(); g.arc(8, 4, 2, 0, TAU); g.arc(5, 8, 1.6, 0, TAU); g.fill();
  },
});

/* --------------------------------------------------------- sports courts */

export const hoop = (): Sprite => ({
  w: 120, h: 190, ax: 60, ay: 150, draw: (g) => {
    shadow(g, 8, 4, 22, 7);
    box(g, -5, -92, 10, 96, '#6d7683', 2);
    box(g, -36, -128, 72, 44, '#e2dccb', 2.2);
    g.strokeStyle = C.rust; g.lineWidth = 3; g.strokeRect(-14, -112, 28, 22);
    g.strokeStyle = INK; g.lineWidth = 4; g.beginPath(); g.moveTo(-14, -84); g.lineTo(14, -84); g.stroke();
    g.strokeStyle = '#d9541f'; g.lineWidth = 2.4; g.stroke();
    g.strokeStyle = 'rgba(240,240,230,0.85)'; g.lineWidth = 1.4;
    g.beginPath(); for (let i = -12; i <= 12; i += 6) { g.moveTo(i, -83); g.lineTo(i * 0.6, -62); } g.stroke();
  },
});

export const basketball = (): Sprite => ({
  w: 50, h: 40, ax: 25, ay: 20, draw: (g) => {
    shadow(g, 3, 8, 12, 4);
    blob(g, 0, 0, 10, 10, '#c4672f', 2);
    g.strokeStyle = INK; g.lineWidth = 1.4; g.beginPath(); g.moveTo(-10, 0); g.lineTo(10, 0); g.moveTo(0, -10); g.lineTo(0, 10); g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.4)'; g.fillRect(-5, -6, 3, 3);
  },
});

export const net = (len: number): Sprite => ({
  w: len + 40, h: 70, ax: 20, ay: 35, draw: (g) => {
    shadow(g, len / 2 + 6, 14, len / 2, 4);
    box(g, -4, -24, 9, 40, '#6d7683', 2);
    box(g, len - 5, -24, 9, 40, '#6d7683', 2);
    g.fillStyle = 'rgba(235,235,225,0.5)'; g.fillRect(5, -20, len - 10, 26);
    g.strokeStyle = 'rgba(30,30,36,0.55)'; g.lineWidth = 1;
    g.beginPath(); for (let x = 8; x < len - 5; x += 6) { g.moveTo(x, -20); g.lineTo(x, 6); } for (let y = -14; y < 6; y += 6) { g.moveTo(5, y); g.lineTo(len - 5, y); } g.stroke();
    g.fillStyle = '#f2eee0'; g.fillRect(5, -22, len - 10, 5); g.strokeStyle = INK; g.lineWidth = 1.6; g.strokeRect(5, -22, len - 10, 5);
    // A towel over the post, a bottle at its foot.
    g.fillStyle = C.teal; g.fillRect(-8, -26, 12, 16); g.strokeRect(-8, -26, 12, 16);
    box(g, -14, 14, 6, 12, '#7fb0c8', 1.5);
  },
});

export const floodlight = (): Sprite => ({
  w: 80, h: 220, ax: 40, ay: 190, draw: (g) => {
    shadow(g, 10, 4, 18, 6);
    box(g, -4, -150, 8, 154, '#4a4f58', 2);
    box(g, -22, -174, 44, 26, '#2b2e34', 2);
    for (let i = 0; i < 4; i++) { blob(g, -15 + i * 10, -161, 3.8, 3.8, '#f2f0d8', 1.2); }
  },
});

/* ------------------------------------------------------------ boathouse */

export const rowboat = (): Sprite => ({
  w: 170, h: 90, ax: 85, ay: 45, draw: (g) => {
    g.beginPath(); g.moveTo(-70, -6); g.quadraticCurveTo(0, 26, 70, -8); g.quadraticCurveTo(40, -24, 0, -24); g.quadraticCurveTo(-40, -24, -70, -6); g.closePath();
    g.fillStyle = C.teal; g.fill(); outline(g, 2.4);
    g.beginPath(); g.moveTo(-62, -8); g.quadraticCurveTo(0, -18, 62, -9); g.quadraticCurveTo(0, 12, -62, -8); g.closePath(); g.fillStyle = C.woodLo; g.fill(); outline(g, 1.6);
    for (const x of [-18, 14]) box(g, x, -12, 5, 12, C.woodHi, 1.4);
    g.strokeStyle = INK; g.lineWidth = 4; g.lineCap = 'round'; g.beginPath(); g.moveTo(-10, -10); g.lineTo(-44, 18); g.stroke();
    g.strokeStyle = C.woodHi; g.lineWidth = 2; g.stroke(); g.lineCap = 'butt';
    g.strokeStyle = '#e2dccb'; g.lineWidth = 2; g.beginPath(); g.moveTo(-68, -6); g.quadraticCurveTo(-80, 12, -92, 8); g.stroke();
  },
});

export const lifeRing = (): Sprite => ({
  w: 70, h: 90, ax: 35, ay: 70, draw: (g) => {
    shadow(g, 6, 4, 12, 5);
    box(g, -3, -44, 7, 48, C.woodLo, 2);
    blob(g, 0, -42, 17, 17, '#e2dccb', 2.2);
    blob(g, 0, -42, 8, 8, '#4f5560', 1.8);
    g.fillStyle = C.rust;
    for (const a of [0, 1.57, 3.14, 4.71]) { g.save(); g.translate(0, -42); g.rotate(a); g.fillRect(-4, -16, 8, 8); g.restore(); }
  },
});

export const boot = (): Sprite => ({
  w: 70, h: 70, ax: 35, ay: 40, draw: (g) => {
    shadow(g, 3, 8, 16, 5);
    g.beginPath(); g.moveTo(-10, -22); g.lineTo(8, -22); g.lineTo(8, -4); g.quadraticCurveTo(22, -2, 20, 8); g.lineTo(-12, 8); g.closePath();
    g.fillStyle = '#b8892b'; g.fill(); outline(g, 2.2);
    g.fillStyle = 'rgba(255,255,255,0.3)'; g.fillRect(-8, -20, 4, 24);
    // And on top of the boot, a frog, unbothered.
    blob(g, 0, -28, 9, 6, '#6aa64a', 1.8);
    blob(g, -4, -34, 3.4, 3.4, '#8fcb68', 1.4); blob(g, 4, -34, 3.4, 3.4, '#8fcb68', 1.4);
    g.fillStyle = INK; g.fillRect(-5, -35, 2, 2); g.fillRect(3, -35, 2, 2);
  },
});

/* --------------------------------------------------------------- meadow */

export const blanket = (): Sprite => ({
  w: 190, h: 150, ax: 95, ay: 75, draw: (g) => {
    g.save(); g.rotate(-0.12);
    g.fillStyle = '#d9d2bd'; g.fillRect(-72, -48, 144, 96);
    g.fillStyle = C.rose; g.globalAlpha = 0.75;
    for (let j = 0; j < 6; j++) for (let i = 0; i < 9; i++) if ((i + j) % 2 === 0) g.fillRect(-72 + i * 16, -48 + j * 16, 16, 16);
    g.globalAlpha = 1;
    g.strokeStyle = INK; g.lineWidth = 2.4; g.lineJoin = 'round'; g.strokeRect(-72, -48, 144, 96);
    // Fringe.
    g.strokeStyle = '#e8e0c8'; g.lineWidth = 1.4; g.beginPath(); for (let y = -44; y < 48; y += 6) { g.moveTo(-72, y); g.lineTo(-79, y + 1); g.moveTo(72, y); g.lineTo(79, y + 1); } g.stroke();
    // The basket, its lid up, bread and a bottle poking out; two apples; a half-eaten sandwich.
    g.beginPath(); g.ellipse(-18, -8, 28, 16, 0, 0, TAU); g.fillStyle = '#a9824e'; g.fill(); outline(g, 2.2);
    g.strokeStyle = 'rgba(60,40,20,0.45)'; g.lineWidth = 1.3; g.beginPath(); for (let i = -4; i <= 4; i++) { g.moveTo(-18 + i * 6, -22); g.lineTo(-18 + i * 6, 6); } g.stroke();
    g.beginPath(); g.arc(-18, -10, 22, Math.PI, 0); g.strokeStyle = INK; g.lineWidth = 5; g.stroke(); g.strokeStyle = '#a9824e'; g.lineWidth = 2; g.stroke();
    box(g, -10, -30, 10, 16, '#3f6b4a', 1.8);
    blob(g, 26, 10, 7, 7, '#b0372e', 1.8); blob(g, 38, -6, 6.5, 6.5, '#c7452f', 1.8);
    g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(24, 6, 2.4, 2.4);
    g.fillStyle = '#e8d6a2'; g.fillRect(-52, 22, 24, 12); g.strokeStyle = INK; g.lineWidth = 1.8; g.strokeRect(-52, 22, 24, 12);
    g.fillStyle = '#a0b87a'; g.fillRect(-50, 26, 20, 3);
    g.restore();
  },
});

export const sandwichAnts = (): Sprite => ({
  w: 260, h: 70, ax: 20, ay: 35, draw: (g) => {
    g.fillStyle = '#e8d6a2'; g.fillRect(-8, -6, 20, 12); g.strokeStyle = INK; g.lineWidth = 1.8; g.strokeRect(-8, -6, 20, 12);
    g.fillStyle = '#a0b87a'; g.fillRect(-6, -1, 16, 3);
    // A very determined line of ants.
    g.fillStyle = INK;
    for (let i = 0; i < 22; i++) { const t = i * 10 + 18; g.beginPath(); g.ellipse(t, Math.sin(t * 0.07) * 7, 2.2, 1.4, 0, 0, TAU); g.fill(); }
  },
});

export const kiteOnGrass = (): Sprite => ({
  w: 120, h: 120, ax: 60, ay: 60, draw: (g) => {
    g.save(); g.rotate(0.5);
    g.beginPath(); g.moveTo(0, -26); g.lineTo(18, 0); g.lineTo(0, 30); g.lineTo(-18, 0); g.closePath(); g.fillStyle = C.rose; g.fill(); outline(g, 2);
    g.beginPath(); g.moveTo(0, -26); g.lineTo(0, 30); g.moveTo(-18, 0); g.lineTo(18, 0); g.strokeStyle = INK; g.lineWidth = 1.4; g.stroke();
    g.fillStyle = C.mustard; g.beginPath(); g.moveTo(0, -26); g.lineTo(18, 0); g.lineTo(0, 0); g.closePath(); g.fill();
    g.restore();
    g.strokeStyle = '#d9cfa8'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(-6, 40); g.bezierCurveTo(-40, 50, -30, 70, -50, 60); g.stroke();
    for (const [x, y] of [[-14, 46], [-28, 54], [-38, 62]]) { g.fillStyle = C.teal; g.beginPath(); g.moveTo(x! - 4, y! - 3); g.lineTo(x! + 4, y! + 3); g.lineTo(x! - 4, y! + 4); g.closePath(); g.fill(); }
  },
});

/* -------------------------------------------------------------- orchard */

export const scarecrow = (): Sprite => ({
  w: 150, h: 200, ax: 75, ay: 170, draw: (g) => {
    shadow(g, 10, 4, 24, 7);
    box(g, -4, -110, 8, 114, C.woodLo, 2);
    box(g, -42, -86, 84, 8, C.wood, 2);
    // A patched coat, straw hands, a sack head, a hat with a flower.
    g.beginPath(); g.moveTo(-26, -86); g.lineTo(26, -86); g.lineTo(20, -40); g.lineTo(-20, -40); g.closePath(); g.fillStyle = '#58646a'; g.fill(); outline(g, 2.2);
    box(g, -12, -74, 12, 12, '#a8552e', 1.5);
    g.strokeStyle = '#d9b84a'; g.lineWidth = 3; g.beginPath(); for (const x of [-46, 46]) { g.moveTo(x, -82); g.lineTo(x + (x < 0 ? -9 : 9), -90); g.moveTo(x, -82); g.lineTo(x + (x < 0 ? -10 : 10), -80); } g.stroke();
    blob(g, 0, -104, 14, 14, '#d5c196', 2.2);
    g.fillStyle = INK; g.fillRect(-6, -108, 3, 3); g.fillRect(3, -108, 3, 3); g.beginPath(); g.moveTo(-6, -98); g.lineTo(6, -98); g.lineWidth = 1.6; g.strokeStyle = INK; g.stroke();
    g.beginPath(); g.ellipse(0, -114, 26, 6, 0, 0, TAU); g.fillStyle = '#7a5a36'; g.fill(); outline(g, 2);
    g.beginPath(); g.moveTo(-12, -116); g.quadraticCurveTo(0, -140, 12, -116); g.fillStyle = '#7a5a36'; g.fill(); outline(g, 2);
    blob(g, 10, -122, 4, 4, C.rose, 1.4);
    // A crow perched on the arm.
    blob(g, 34, -94, 7, 5, '#1f2229', 1.2); g.fillStyle = '#e8c868'; g.fillRect(40, -96, 5, 2);
  },
});

export const appleCrates = (): Sprite => ({
  w: 130, h: 100, ax: 65, ay: 55, draw: (g) => {
    shadow(g, 6, 8, 44, 9);
    for (const [x, y] of [[-34, -6], [4, -6], [-16, -28]] as const) {
      box(g, x, y, 34, 24, C.wood, 2);
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x + 2, y + 10, 30, 2);
      for (let i = 0; i < 3; i++) blob(g, x + 8 + i * 9, y + 1, 5.4, 5.4, i % 2 ? '#c4472f' : '#d9803a', 1.4);
    }
    blob(g, 44, 14, 5.4, 5.4, '#c4472f', 1.4); blob(g, 54, 20, 5.4, 5.4, '#a8372a', 1.4);
  },
});

export const treasure = (): Sprite => ({
  w: 110, h: 90, ax: 55, ay: 45, draw: (g) => {
    shadow(g, 6, 8, 28, 7);
    blob(g, 0, 4, 22, 11, '#5a4630', 2);
    g.fillStyle = 'rgba(255,255,255,0.15)'; g.beginPath(); g.ellipse(-6, 0, 10, 4, 0, 0, TAU); g.fill();
    g.strokeStyle = INK; g.lineWidth = 6; g.lineCap = 'round'; g.beginPath(); g.moveTo(26, -34); g.lineTo(20, 8); g.stroke();
    g.strokeStyle = C.woodHi; g.lineWidth = 2.6; g.stroke();
    g.beginPath(); g.moveTo(14, 4); g.lineTo(28, 2); g.lineTo(26, 14); g.lineTo(12, 14); g.closePath(); g.fillStyle = '#8b94a1'; g.fill(); outline(g, 2);
    g.lineCap = 'butt';
    // A pencilled X on a bit of paper weighted with a stone.
    g.save(); g.translate(-36, 16); g.rotate(-0.2); box(g, -9, -7, 18, 14, '#e2dccb', 1.6);
    g.strokeStyle = C.rose; g.lineWidth = 2; g.beginPath(); g.moveTo(-5, -4); g.lineTo(5, 4); g.moveTo(5, -4); g.lineTo(-5, 4); g.stroke(); g.restore();
  },
});

export const flowerUrn = (color: string): Sprite => ({
  w: 60, h: 70, ax: 30, ay: 50, draw: (g) => {
    shadow(g, 5, 4, 16, 5);
    g.beginPath(); g.moveTo(-12, -20); g.lineTo(12, -20); g.lineTo(8, 2); g.lineTo(-8, 2); g.closePath(); g.fillStyle = '#b9b19b'; g.fill(); outline(g, 2);
    for (let i = 0; i < 6; i++) blob(g, -12 + i * 5, -26 - (i % 2) * 4, 5, 5, i % 3 ? color : '#e2dccb', 1.4);
    blob(g, 0, -24, 14, 4, '#35552f', 0);
  },
});

void DISTRICTS;
