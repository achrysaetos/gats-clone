import type { MapDef } from '../../shared/maps.ts';
import { DISTRICTS, FLOORS, MUSEUM, type MuseumFloor } from '../../shared/maps/museum.ts';
import { stencil, type FloorPlan } from '../floor.ts';
import { blotch, canvas, seeded } from '../grain.ts';
import { FLOOR, INK } from '../palette.ts';
import { paintDecor } from './museumdecor.ts';

/**
 * The Museum's floor: flagstone grounds, marble halls with mosaics, and a floor of its own in every district (sandstone
 * blocks in Egypt, slate in the armour hall, polished concrete in modern art, terrazzo, ice, star-map blue, ocean teal, foam
 * play mats). Each district also gets a faint wash of its light's colour, and wear gathers on the lanes people walk. Baked once.
 */

const TAU = Math.PI * 2;
const BRASS = '#b79a4a';
const hexA = (hex: string, a: number) => {
  const v = parseInt(hex.slice(1), 16);
  return `rgba(${(v >> 16) & 255}, ${(v >> 8) & 255}, ${v & 255}, ${a})`;
};

const WOODS = ['#6b4a2c', '#74512f', '#5f4227', '#7a5834'] as const;

/** One tile of herringbone: planks four times as long as wide, tiling every eight widths. */
function herringbone(g: CanvasRenderingContext2D, seed: number): CanvasPattern {
  const W = 12, L = 48, T = 96;
  const [c, p] = canvas(T);
  const rand = seeded(seed);
  p.lineWidth = 1;
  const plank = (x: number, y: number, w: number, h: number) => {
    for (const ox of [-T, 0, T]) for (const oy of [-T, 0, T]) {
      const px = x + ox, py = y + oy;
      if (px + w < 0 || py + h < 0 || px > T || py > T) continue;
      p.fillStyle = WOODS[Math.floor(rand() * WOODS.length)]!;
      p.fillRect(px, py, w, h);
      p.fillStyle = 'rgba(255, 220, 160, 0.07)';
      p.fillRect(px, py, w, 2);
      p.strokeStyle = 'rgba(40, 26, 14, 0.7)';
      p.strokeRect(px + 0.5, py + 0.5, w - 1, h - 1);
    }
  };
  for (let j = -12; j <= 12; j++) for (let k = -12; k <= 12; k++) {
    plank(k * W + j * -8 * W, k * W, L, W);
    plank(k * W + L + j * -8 * W, k * W + W - L, W, L);
  }
  return g.createPattern(c, 'repeat')!;
}


function tiles(g: CanvasRenderingContext2D, f: MuseumFloor, T: number, a: string, b: string, joint: string, rand: () => number, shift = 0.05) {
  const { x, y, w, h } = f;
  for (let ty = y; ty < y + h; ty += T) for (let tx = x; tx < x + w; tx += T) {
    g.fillStyle = (((tx - x) / T + (ty - y) / T) & 1) === 1 ? b : a; g.fillRect(tx, ty, T, T);
    const k = (rand() - 0.5) * shift; g.fillStyle = k > 0 ? `rgba(255,244,220,${k})` : `rgba(10,8,6,${-k})`; g.fillRect(tx, ty, T, T);
  }
  g.strokeStyle = joint; g.lineWidth = 2; g.beginPath();
  for (let tx = x + T; tx < x + w; tx += T) { g.moveTo(tx, y); g.lineTo(tx, y + h); }
  for (let ty = y + T; ty < y + h; ty += T) { g.moveTo(x, ty); g.lineTo(x + w, ty); }
  g.stroke();
}

function region(g: CanvasRenderingContext2D, f: MuseumFloor, seed: number, parquet: CanvasPattern) {
  const { x, y, w, h } = f;
  const rand = seeded(seed ^ (x * 31 + y * 17));
  g.save();
  g.beginPath(); g.rect(x, y, w, h); g.clip();
  switch (f.kind) {
    case 'parquet':
      g.fillStyle = parquet; g.fillRect(x, y, w, h);
      g.strokeStyle = 'rgba(30, 18, 10, 0.4)'; g.lineWidth = 22; g.strokeRect(x, y, w, h);
      g.strokeStyle = hexA(BRASS, 0.55); g.lineWidth = 2; g.strokeRect(x + 14, y + 14, w - 28, h - 28);
      for (let i = 0; i < 6 + (w * h) / 200000; i++) blotch(g, x + rand() * w, y + rand() * h, 120 + rand() * 160, '30, 18, 10', 0.1);
      break;
    case 'marble': {
      const T = 100;
      for (let ty = Math.floor(y / T) * T; ty < y + h; ty += T) for (let tx = Math.floor(x / T) * T; tx < x + w; tx += T) {
        g.fillStyle = ((tx / T + ty / T) & 1) === 1 ? '#6f6a5f' : '#7b766a'; g.fillRect(tx, ty, T, T);
        g.fillStyle = 'rgba(255, 244, 220, 0.045)'; g.beginPath(); g.moveTo(tx, ty); g.lineTo(tx + T, ty); g.lineTo(tx, ty + T); g.closePath(); g.fill();
        if (rand() < 0.5) { g.strokeStyle = 'rgba(52, 48, 42, 0.3)'; g.lineWidth = 1.3; g.beginPath(); const sx = tx + rand() * T, sy = ty + rand() * T; g.moveTo(sx, sy); g.quadraticCurveTo(sx + (rand() - 0.5) * 80, sy + (rand() - 0.5) * 80, tx + rand() * T, ty + rand() * T); g.stroke(); }
      }
      g.strokeStyle = 'rgba(46, 43, 38, 0.8)'; g.lineWidth = 2; g.beginPath();
      for (let tx = Math.ceil(x / T) * T; tx < x + w; tx += T) { g.moveTo(tx, y); g.lineTo(tx, y + h); }
      for (let ty = Math.ceil(y / T) * T; ty < y + h; ty += T) { g.moveTo(x, ty); g.lineTo(x + w, ty); }
      g.stroke();
      break;
    }
    case 'carpet':
      g.fillStyle = '#5b2733'; g.fillRect(x, y, w, h);
      g.strokeStyle = 'rgba(122, 52, 66, 0.7)'; g.lineWidth = 3; g.beginPath();
      for (let ty = y; ty < y + h; ty += 50) for (let tx = x; tx < x + w; tx += 50) { g.moveTo(tx + 25, ty + 6); g.lineTo(tx + 44, ty + 25); g.lineTo(tx + 25, ty + 44); g.lineTo(tx + 6, ty + 25); g.closePath(); }
      g.stroke(); g.strokeStyle = hexA(BRASS, 0.6); g.lineWidth = 5; g.strokeRect(x + 10, y + 10, w - 20, h - 20);
      break;
    case 'tile': tiles(g, f, 50, '#8d867a', '#4a4640', 'rgba(30,28,24,0.4)', rand, 0.03); break;
    case 'vault':
      g.fillStyle = '#262c46'; g.fillRect(x, y, w, h);
      g.strokeStyle = 'rgba(90, 170, 255, 0.28)'; g.lineWidth = 2; g.beginPath();
      for (let tx = x; tx < x + w; tx += 50) { g.moveTo(tx, y); g.lineTo(tx, y + h); }
      for (let ty = y; ty < y + h; ty += 50) { g.moveTo(x, ty); g.lineTo(x + w, ty); }
      g.stroke(); blotch(g, x + w / 2, y + h / 2, Math.max(w, h) * 0.7, '90, 160, 255', 0.14);
      break;
    case 'treasury':
      g.fillStyle = '#4a2028'; g.fillRect(x, y, w, h);
      g.strokeStyle = hexA('#d9b24a', 0.35); g.lineWidth = 2; g.beginPath();
      for (let tx = x; tx < x + w; tx += 50) { g.moveTo(tx, y); g.lineTo(tx, y + h); }
      for (let ty = y; ty < y + h; ty += 50) { g.moveTo(x, ty); g.lineTo(x + w, ty); }
      g.stroke(); blotch(g, x + w / 2, y + h / 2, Math.max(w, h) * 0.7, '255, 120, 60', 0.1);
      break;
    case 'sand': {
      tiles(g, f, 100, '#8c7650', '#84704a', 'rgba(60, 44, 24, 0.7)', rand, 0.1);
      for (let i = 0; i < 160; i++) { g.fillStyle = rand() < 0.5 ? 'rgba(255,230,170,0.12)' : 'rgba(60,40,20,0.14)'; g.fillRect(x + rand() * w, y + rand() * h, 2 + rand() * 4, 1.6 + rand() * 2); }
      // A turquoise and oxblood border course, like a temple floor.
      g.strokeStyle = 'rgba(106, 58, 40, 0.55)'; g.lineWidth = 16; g.strokeRect(x + 8, y + 8, w - 16, h - 16);
      g.fillStyle = 'rgba(47, 143, 138, 0.5)'; for (let t = x + 30; t < x + w - 30; t += 36) { for (const yy of [y + 8, y + h - 8]) { g.beginPath(); g.moveTo(t, yy - 5); g.lineTo(t + 5, yy); g.lineTo(t, yy + 5); g.lineTo(t - 5, yy); g.closePath(); g.fill(); } }
      for (let t = y + 30; t < y + h - 30; t += 36) { for (const xx of [x + 8, x + w - 8]) { g.beginPath(); g.moveTo(xx, t - 5); g.lineTo(xx + 5, t); g.lineTo(xx, t + 5); g.lineTo(xx - 5, t); g.closePath(); g.fill(); } }
      break;
    }
    case 'slate': tiles(g, f, 100, '#4b4d55', '#43454c', 'rgba(20, 21, 26, 0.7)', rand, 0.07); break;
    case 'concrete': {
      tiles(g, f, 200, '#8d8b86', '#898782', 'rgba(60, 58, 54, 0.45)', rand, 0.04);
      // Floor tape marks the walking route round the exhibits: coral beside teal, each a few paces long.
      const cy = y + h / 2;
      for (const [off, col] of [[-9, 'rgba(224, 112, 90, 0.5)'], [9, 'rgba(62, 143, 168, 0.5)']] as const) { g.fillStyle = col; g.fillRect(x + 20, cy + off - 3, w - 40, 6); }
      break;
    }
    case 'terrazzo': {
      g.fillStyle = '#8f887a'; g.fillRect(x, y, w, h);
      for (let i = 0; i < (w * h) / 900; i++) { g.fillStyle = ['rgba(240,232,214,0.45)', 'rgba(70,64,56,0.4)', 'rgba(168,85,46,0.3)', 'rgba(110,110,120,0.4)'][Math.floor(rand() * 4)]!; g.beginPath(); g.ellipse(x + rand() * w, y + rand() * h, 1.5 + rand() * 3, 1 + rand() * 2, rand() * 3, 0, TAU); g.fill(); }
      g.strokeStyle = hexA(BRASS, 0.4); g.lineWidth = 2; g.beginPath(); for (let tx = x + 200; tx < x + w; tx += 200) { g.moveTo(tx, y); g.lineTo(tx, y + h); } g.stroke();
      break;
    }
    case 'ice': {
      tiles(g, f, 100, '#6d7c8a', '#67768a', 'rgba(36, 48, 62, 0.7)', rand, 0.08);
      for (let i = 0; i < 90; i++) { g.fillStyle = 'rgba(235,248,255,0.2)'; g.fillRect(x + rand() * w, y + rand() * h, 2 + rand() * 6, 1.4); }
      for (let i = 0; i < 8; i++) blotch(g, x + rand() * w, y + rand() * h, 100 + rand() * 120, '230, 245, 255', 0.1);
      break;
    }
    case 'space': {
      g.fillStyle = '#1f2442'; g.fillRect(x, y, w, h);
      g.strokeStyle = 'rgba(154, 140, 255, 0.22)'; g.lineWidth = 2; for (const r of [120, 190, 270]) { g.beginPath(); g.ellipse(x + w / 2, y + h / 2, r * 2.2, r * 0.55, -0.15, 0, TAU); g.stroke(); }
      for (let i = 0; i < 220; i++) { g.fillStyle = `rgba(232, 224, 255, ${0.25 + rand() * 0.4})`; const s2 = rand() < 0.1 ? 3 : 1.8; g.fillRect(x + rand() * w, y + rand() * h, s2, s2); }
      break;
    }
    case 'ocean': {
      g.fillStyle = '#2c5f66'; g.fillRect(x, y, w, h);
      g.strokeStyle = 'rgba(143, 224, 216, 0.28)'; g.lineWidth = 2.2;
      for (let yy = y + 20; yy < y + h; yy += 36) { g.beginPath(); for (let xx = x; xx < x + w; xx += 36) { g.moveTo(xx, yy); g.quadraticCurveTo(xx + 9, yy - 8, xx + 18, yy); g.quadraticCurveTo(xx + 27, yy + 8, xx + 36, yy); } g.stroke(); }
      break;
    }
    case 'lab': {
      tiles(g, f, 200, '#7d7a72', '#797670', 'rgba(50, 48, 44, 0.5)', rand, 0.06);
      for (let i = 0; i < 40; i++) { g.fillStyle = ['rgba(224,112,90,0.5)', 'rgba(62,143,168,0.5)', 'rgba(232,193,58,0.5)', 'rgba(240,240,230,0.5)'][Math.floor(rand() * 4)]!; g.beginPath(); g.arc(x + rand() * w, y + rand() * h, 1.5 + rand() * 3, 0, TAU); g.fill(); }
      break;
    }
    case 'kids': {
      const cols = ['#a8553f', '#4f7fa0', '#c09a3a', '#6b9a5a'];
      for (let ty = y; ty < y + h; ty += 50) for (let tx = x; tx < x + w; tx += 50) { g.fillStyle = cols[(Math.floor((tx - x) / 50) + 2 * Math.floor((ty - y) / 50)) % 4]!; g.fillRect(tx, ty, 50, 50); g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(tx, ty, 50, 4); }
      g.strokeStyle = 'rgba(20,16,12,0.5)'; g.lineWidth = 2; g.beginPath(); for (let tx = x; tx < x + w; tx += 50) { g.moveTo(tx, y); g.lineTo(tx, y + h); } for (let ty = y; ty < y + h; ty += 50) { g.moveTo(x, ty); g.lineTo(x + w, ty); } g.stroke();
      break;
    }
    default: break;
  }
  g.restore();
  g.strokeStyle = 'rgba(28, 24, 20, 0.85)'; g.lineWidth = 3; g.strokeRect(x, y, w, h);
}

function flagstones(g: CanvasRenderingContext2D, size: number, seed: number) {
  const rand = seeded(seed);
  g.fillStyle = '#58544c'; g.fillRect(0, 0, size, size);
  const rows = 100;
  for (let y = 0, row = 0; y < size; y += rows, row++) {
    for (let x = -rand() * 150; x < size; ) {
      const w = 130 + rand() * 120;
      const k = (rand() - 0.5) * 0.12;
      g.fillStyle = k > 0 ? `rgba(255, 244, 220, ${k})` : `rgba(14, 12, 10, ${-k * 1.6})`;
      g.fillRect(x, y, w, rows);
      g.fillStyle = 'rgba(28, 25, 22, 0.8)';
      g.fillRect(x - 1, y, 2, rows);
      x += w;
    }
    g.fillStyle = 'rgba(28, 25, 22, 0.8)';
    g.fillRect(0, y - 1, size, 2);
  }
  for (let i = 0; i < 90; i++) blotch(g, rand() * size, rand() * size, 80 + rand() * 180, '24, 22, 18', 0.07);
}


type Pt = { x: number; y: number };

/** A velvet rope loop round an exhibit: brass posts at the corners and along each side, burgundy rope sagging between them. */
function ropeLoop(g: CanvasRenderingContext2D, r: { x: number; y: number; w: number; h: number }, gap: number) {
  const x0 = r.x - gap, y0 = r.y - gap, x1 = r.x + r.w + gap, y1 = r.y + r.h + gap;
  const posts: Pt[] = [];
  const side = (ax: number, ay: number, bx: number, by: number) => {
    const n = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay) / 120));
    for (let i = 0; i < n; i++) posts.push({ x: ax + ((bx - ax) * i) / n, y: ay + ((by - ay) * i) / n });
  };
  side(x0, y0, x1, y0); side(x1, y0, x1, y1); side(x1, y1, x0, y1); side(x0, y1, x0, y0);
  const ball = (p: Pt): Pt => ({ x: p.x, y: p.y - 12 });
  g.lineCap = 'round';
  for (const [w, color] of [[5.5, INK], [3, '#8a2e3c']] as const) {
    g.strokeStyle = color; g.lineWidth = w;
    for (let i = 0; i < posts.length; i++) { const a = ball(posts[i]!), b = ball(posts[(i + 1) % posts.length]!); g.beginPath(); g.moveTo(a.x, a.y); g.quadraticCurveTo((a.x + b.x) / 2, (a.y + b.y) / 2 + 9, b.x, b.y); g.stroke(); }
  }
  for (const p of posts) {
    g.fillStyle = 'rgba(20, 24, 32, 0.3)'; g.beginPath(); g.ellipse(p.x + 5, p.y + 3, 8, 4, 0, 0, TAU); g.fill();
    g.fillStyle = '#2f343c'; g.beginPath(); g.ellipse(p.x, p.y, 7, 4, 0, 0, TAU); g.fill(); g.strokeStyle = INK; g.lineWidth = 1.5; g.stroke();
    g.strokeStyle = INK; g.lineWidth = 5; g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x, p.y - 10); g.stroke();
    g.strokeStyle = BRASS; g.lineWidth = 2.5; g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x, p.y - 10); g.stroke();
    g.fillStyle = '#d9c27a'; g.beginPath(); g.arc(p.x, p.y - 12, 4, 0, TAU); g.fill(); g.strokeStyle = INK; g.lineWidth = 1.5; g.stroke();
    g.fillStyle = 'rgba(255, 255, 255, 0.8)'; g.fillRect(p.x - 2, p.y - 14.5, 1.6, 1.6);
  }
  g.lineCap = 'butt';
}

const roped = (w: MapDef['walls'][number]) => w.material === 'plinth' || (w.material === 'marble' && w.w * w.h >= 25000);

/** Brass lettering inlaid in the floor, `size` px tall. */
function inlay(g: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, rot = 0, alpha = 0.34, color = BRASS) {
  g.save(); g.translate(x, y); g.rotate(rot);
  g.font = `700 ${size}px "Barlow Condensed", "Arial Narrow", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  (g as unknown as { letterSpacing: string }).letterSpacing = `${Math.round(size * 0.22)}px`;
  g.fillStyle = 'rgba(14, 12, 10, 0.5)'; g.globalAlpha = alpha; g.fillText(text, 1.5, 2);
  g.fillStyle = color; g.fillText(text, 0, 0);
  g.restore(); g.globalAlpha = 1;
}

function mosaics(g: CanvasRenderingContext2D) {
  // Great hall north: a brass sun in a dark ring.
  const sx = 3000, sy = 1000;
  g.fillStyle = 'rgba(26, 22, 20, 0.22)'; g.beginPath(); g.arc(sx, sy, 330, 0, TAU); g.fill();
  g.strokeStyle = hexA(BRASS, 0.7); g.lineWidth = 5; g.beginPath(); g.arc(sx, sy, 330, 0, TAU); g.stroke(); g.lineWidth = 3; g.beginPath(); g.arc(sx, sy, 130, 0, TAU); g.stroke();
  g.fillStyle = hexA(BRASS, 0.55);
  for (let k = 0; k < 16; k++) { const a = (k * TAU) / 16; g.beginPath(); g.moveTo(sx + Math.cos(a - 0.1) * 140, sy + Math.sin(a - 0.1) * 140); g.lineTo(sx + Math.cos(a) * (k % 2 ? 250 : 310), sy + Math.sin(a) * (k % 2 ? 250 : 310)); g.lineTo(sx + Math.cos(a + 0.1) * 140, sy + Math.sin(a + 0.1) * 140); g.closePath(); g.fill(); }
  // Ocean hall south: a whale in teal tile, its tail toward the rotunda.
  const wx = 3000, wy = 5000;
  g.save(); g.translate(wx, wy); g.rotate(Math.PI / 2);
  g.fillStyle = 'rgba(40, 110, 130, 0.55)'; g.strokeStyle = hexA(BRASS, 0.6); g.lineWidth = 4;
  g.beginPath(); g.moveTo(-300, 0); g.quadraticCurveTo(-260, -90, -90, -90); g.quadraticCurveTo(120, -90, 230, -20); g.lineTo(330, -80); g.quadraticCurveTo(320, -20, 300, 0); g.quadraticCurveTo(320, 20, 330, 80); g.lineTo(230, 20); g.quadraticCurveTo(120, 80, -90, 70); g.quadraticCurveTo(-260, 60, -300, 0); g.closePath(); g.fill(); g.stroke();
  g.beginPath(); g.moveTo(-40, 70); g.quadraticCurveTo(0, 150, 70, 160); g.quadraticCurveTo(60, 100, 40, 66); g.fill(); g.stroke();
  g.fillStyle = hexA(BRASS, 0.7); g.beginPath(); g.arc(-220, -30, 7, 0, TAU); g.fill();
  g.strokeStyle = 'rgba(200,240,240,0.5)'; g.lineWidth = 2.4; for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(-190 + i * 22, 40); g.lineTo(-175 + i * 22, 62); g.stroke(); }
  g.restore();
}

/** Where people walk, the floor is a little paler and scuffed; the margins stay dark and quiet. */
function wear(g: CanvasRenderingContext2D, rand: () => number) {
  g.fillStyle = 'rgba(255, 244, 220, 0.045)';
  for (const [x, y, w, h] of [[450, 2900, 5100, 200], [2900, 450, 200, 5100]] as const) g.fillRect(x, y, w, h);
  g.fillStyle = 'rgba(20, 16, 12, 0.18)';
  for (let i = 0; i < 160; i++) { const horiz = rand() < 0.5; g.fillRect(horiz ? 450 + rand() * 5100 : 2910 + rand() * 180, horiz ? 2910 + rand() * 180 : 450 + rand() * 5100, 6 + rand() * 12, 1.6); }
}

export function paintMuseumFloor(g: CanvasRenderingContext2D, size: number, seed: number, plan: FloorPlan) {
  flagstones(g, size, seed ^ 0x51);
  const parquet = herringbone(g, seed ^ 0x99);
  for (const f of FLOORS) region(g, f, seed, parquet);
  const rand = seeded(seed ^ 0x7c);

  // The dock is poured concrete with hazard edging; the entrance a pale marble apron with a brass threshold.
  g.fillStyle = '#6d6b66'; g.fillRect(0, 2500, 700, 1000);
  g.strokeStyle = 'rgba(40, 38, 34, 0.6)'; g.lineWidth = 2; g.beginPath(); for (let x = 100; x < 700; x += 100) { g.moveTo(x, 2500); g.lineTo(x, 3500); } for (let y = 2600; y < 3500; y += 100) { g.moveTo(0, y); g.lineTo(700, y); } g.stroke();
  g.fillStyle = FLOOR.paint; g.globalAlpha = 0.6; for (const yy of [2520, 3470]) for (let x = 0; x < 700; x += 40) { g.beginPath(); g.moveTo(x, yy + 10); g.lineTo(x + 20, yy + 10); g.lineTo(x + 30, yy - 10); g.lineTo(x + 10, yy - 10); g.closePath(); g.fill(); } g.globalAlpha = 1;
  g.fillStyle = hexA(BRASS, 0.7); g.fillRect(700 - 4, 2500, 4, 1000);
  g.fillStyle = '#85806f'; g.fillRect(5300, 2500, 700, 1000);
  g.strokeStyle = 'rgba(46, 43, 38, 0.8)'; g.lineWidth = 2; g.beginPath(); for (let x = 5300; x < 6000; x += 100) { g.moveTo(x, 2500); g.lineTo(x, 3500); } for (let y = 2500; y < 3500; y += 100) { g.moveTo(5300, y); g.lineTo(6000, y); } g.stroke();
  g.fillStyle = hexA(BRASS, 0.7); g.fillRect(5300, 2500, 4, 1000);
  g.strokeStyle = hexA(BRASS, 0.6); g.lineWidth = 5; g.beginPath(); g.arc(5650, 3000, 230, 0, TAU); g.stroke(); g.lineWidth = 2.4; g.beginPath(); g.arc(5650, 3000, 200, 0, TAU); g.stroke();

  // Runners: a burgundy carpet with brass lines down each great hall, drawn quiet.
  const runner = (x: number, y: number, w: number, h: number, alongX: boolean) => {
    g.fillStyle = 'rgba(94, 40, 52, 0.82)'; g.fillRect(x, y, w, h);
    g.fillStyle = hexA(BRASS, 0.5);
    if (alongX) { g.fillRect(x, y + 8, w, 3); g.fillRect(x, y + h - 11, w, 3); } else { g.fillRect(x + 8, y, 3, h); g.fillRect(x + w - 11, y, 3, h); }
  };
  runner(700, 2930, 4600, 140, true);
  runner(2930, 450, 140, 5100, false);
  mosaics(g);

  // The rotunda floor: a brass compass in dark stone under the zone, ringed by brass.
  const cx = size / 2, cy = size / 2;
  g.fillStyle = 'rgba(26, 22, 20, 0.2)'; g.beginPath(); g.arc(cx, cy, 460, 0, TAU); g.fill();
  g.strokeStyle = hexA(BRASS, 0.7); g.lineWidth = 5; g.beginPath(); g.arc(cx, cy, 460, 0, TAU); g.stroke();
  g.lineWidth = 3; g.beginPath(); g.arc(cx, cy, 410, 0, TAU); g.stroke();
  g.strokeStyle = 'rgba(26, 22, 20, 0.5)'; g.lineWidth = 3; g.beginPath(); g.arc(cx, cy, 300, 0, TAU); g.stroke();
  g.fillStyle = hexA(BRASS, 0.5);
  for (let k = 0; k < 8; k++) { const a = (k * TAU) / 8 + Math.PI / 8, long = k % 2 === 0 ? 400 : 300; g.beginPath(); g.moveTo(cx + Math.cos(a - 0.16) * 120, cy + Math.sin(a - 0.16) * 120); g.lineTo(cx + Math.cos(a) * long, cy + Math.sin(a) * long); g.lineTo(cx + Math.cos(a + 0.16) * 120, cy + Math.sin(a + 0.16) * 120); g.closePath(); g.fill(); }
  wear(g, rand);

  // Brass lettering names the halls where you walk them.
  inlay(g, 'HALL OF GEMS', 1500, 2850, 34); inlay(g, 'HALL OF GIANTS', 4500, 3150, 34);
  inlay(g, 'GREAT HALL', 2800, 1700, 40, -Math.PI / 2); inlay(g, 'OCEAN HALL', 3200, 4300, 40, Math.PI / 2);
  inlay(g, 'MAIN ENTRANCE', 5650, 2700, 34, 0, 0.5, '#d9c27a'); inlay(g, 'LOADING DOCK', 350, 2660, 30, 0, 0.7, FLOOR.paint); inlay(g, 'ROTUNDA', cx, cy - 560, 34);

  // A wash of each district's light, so you can tell where you are from the colour of the room.
  for (const d of DISTRICTS) {
    if (d.id === 'rotunda') { const rg = g.createRadialGradient(cx, cy, 100, cx, cy, 700); rg.addColorStop(0, `rgba(${d.wash}, 0.1)`); rg.addColorStop(1, `rgba(${d.wash}, 0)`); g.fillStyle = rg; g.fillRect(cx - 700, cy - 700, 1400, 1400); continue; }
    g.fillStyle = `rgba(${d.wash}, 0.075)`; g.fillRect(d.x, d.y, d.w, d.h);
  }

  // Warm pools under each exhibit, as if spotlit from the ceiling.
  for (const w of MUSEUM.walls) {
    if (w.material !== 'vitrine' && w.material !== 'plinth' && !(w.material === 'marble' && w.w * w.h >= 25000)) continue;
    blotch(g, w.x + w.w / 2, w.y + w.h / 2 + 20, Math.max(w.w, w.h) / 2 + (w.material === 'plinth' ? 260 : 150), '255, 226, 170', w.material === 'plinth' ? 0.12 : 0.08);
  }
  for (const z of plan.zones) blotch(g, z.x, z.y, 360, '255, 226, 170', 0.1);
  for (const p of plan.pads) blotch(g, p.x + p.w / 2, p.y + p.h / 2, 240 + Math.max(p.w, p.h) * 0.4, '255, 226, 170', 0.07);
  g.fillStyle = 'rgba(150, 170, 210, 0.035)';
  for (let i = 0; i < 40; i++) { const x = 700 + rand() * 4600, y = 2650 + rand() * 700, w = 36 + rand() * 40; g.beginPath(); g.moveTo(x, y); g.lineTo(x + w, y); g.lineTo(x + w + 190, y + 260); g.lineTo(x + 190, y + 260); g.closePath(); g.fill(); }

  for (const w of MUSEUM.walls) if (roped(w)) ropeLoop(g, w, 36);
  paintDecor(g);

  // Brass-edged inlay marks the spawn pads (team tinted) and rings the capture zones.
  for (const [i, pad] of plan.pads.entries()) {
    const tint = pad.team === 'red' ? FLOOR.red : pad.team === 'blue' ? FLOOR.blue : '#20242c';
    g.globalAlpha = 0.2; g.fillStyle = tint; g.fillRect(pad.x, pad.y, pad.w, pad.h);
    g.globalAlpha = 0.7; g.strokeStyle = BRASS; g.lineWidth = 4; g.strokeRect(pad.x - 2, pad.y - 2, pad.w + 4, pad.h + 4);
    g.lineWidth = 2; g.strokeRect(pad.x + 8, pad.y + 8, pad.w - 16, pad.h - 16);
    g.globalAlpha = 0.75; g.fillStyle = pad.team ? tint : BRASS;
    const arm = Math.min(40, pad.w / 2, pad.h / 2), t = 6;
    for (const [px, py, sx, sy] of [[pad.x, pad.y, 1, 1], [pad.x + pad.w, pad.y, -1, 1], [pad.x, pad.y + pad.h, 1, -1], [pad.x + pad.w, pad.y + pad.h, -1, -1]] as const) { g.fillRect(Math.min(px, px + sx * arm), Math.min(py, py + sy * t), arm, t); g.fillRect(Math.min(px, px + sx * t), Math.min(py, py + sy * arm), t, arm); }
    g.globalAlpha = 0.55; g.fillStyle = '#e8dfc6';
    const text = pad.team === 'red' ? `A${(i % 9) + 1}` : pad.team === 'blue' ? `b${(i % 9) + 1}` : `P${(i % 9) + 1}`;
    const th = Math.min(30, pad.h * 0.4, pad.w * 0.5);
    if (th >= 16) stencil(g, text, pad.x + pad.w / 2 - (text.length * (th * 0.52 + th * 0.24)) / 2, pad.y + pad.h / 2 - th / 2, th);
    g.globalAlpha = 1;
  }
  for (const z of plan.zones) {
    const r = plan.zoneRadius;
    g.globalAlpha = 0.16; g.fillStyle = '#16181d'; g.beginPath(); g.arc(z.x, z.y, r - 6, 0, TAU); g.fill();
    g.globalAlpha = 0.65; g.fillStyle = BRASS;
    for (let k = 0; k < 24; k++) { const a0 = (k / 24) * TAU + 0.03, a1 = ((k + 0.62) / 24) * TAU; g.beginPath(); g.arc(z.x, z.y, r + 12, a0, a1); g.arc(z.x, z.y, r + 22, a1, a0, true); g.closePath(); g.fill(); }
    g.globalAlpha = 1;
  }

  const rim = 150;
  for (const [x0, y0, x1, y1, rx, ry, rw, rh] of [
    [0, 0, 0, rim, 0, 0, size, rim], [0, size, 0, size - rim, 0, size - rim, size, rim],
    [0, 0, rim, 0, 0, 0, rim, size], [size, 0, size - rim, 0, size - rim, 0, rim, size],
  ] as const) {
    const grad = g.createLinearGradient(x0, y0, x1, y1);
    grad.addColorStop(0, 'rgba(16, 14, 12, 0.45)'); grad.addColorStop(0.35, 'rgba(16, 14, 12, 0.16)'); grad.addColorStop(1, 'rgba(16, 14, 12, 0)');
    g.fillStyle = grad; g.fillRect(rx, ry, rw, rh);
  }
}
