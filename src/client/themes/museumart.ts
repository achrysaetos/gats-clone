import { districtAt, type DistrictId } from '../../shared/maps/museum.ts';
import { seeded } from '../grain.ts';
import { INK } from '../palette.ts';
import type { Solid } from '../tilt.ts';

/**
 * Museum solids, painted whole once per solid into the sprite cache. Each wall kind changes its dress with the district it
 * stands in (the half-turn twins share their walls and cover, never their looks): sandstone and torches in Egypt, banners
 * and armour in the armour hall, bare white walls and odd sculptures in modern art, a cave-painted ice age, and so on.
 */

const TAU = Math.PI * 2;
const BRASS = '#b79a4a';
const BRASS_HI = '#d9c27a';
const BONE = '#e8dfc6';
const BONE_SHADE = '#b9ad8c';
const hash = (a: number, b: number) => (Math.imul(Math.round(a) | 0, 73856093) ^ Math.imul(Math.round(b) | 0, 19349663)) >>> 0;
const hexA = (hex: string, a: number) => {
  const v = parseInt(hex.slice(1), 16);
  return `rgba(${(v >> 16) & 255}, ${(v >> 8) & 255}, ${v & 255}, ${a})`;
};

/* ---------------------------------------------------------------------------------------------------------------- *
 * Solids: every wall kind is painted whole, once per solid, into the sprite cache.
 * ---------------------------------------------------------------------------------------------------------------- */

const FACE = { gallery: 18, marble: 16, vitrine: 14, plinth: 22, counter: 14 } as const;
const BEVEL = 4;

/** Front face, top face, the two cel steps and the ink outline, in the kit's usual order. */
function shell(ctx: CanvasRenderingContext2D, s: Solid, top: string, front: string, face: number, paintFront: () => void, paintTop: () => void) {
  const { x, y, w, h } = s, e = BEVEL;
  ctx.lineJoin = 'miter';
  ctx.fillStyle = front;
  ctx.fillRect(x, y + h, w, face);
  paintFront();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.13)';
  ctx.fillRect(x, y + h, w, 2);
  ctx.fillStyle = 'rgba(10, 12, 16, 0.34)';
  ctx.fillRect(x, y + h + face - 4, w, 4);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y + h, w, face);
  ctx.fillStyle = top;
  ctx.fillRect(x, y, w, h);
  paintTop();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.24)';
  ctx.beginPath();
  ctx.moveTo(x, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w - e, y + e); ctx.lineTo(x + e, y + e); ctx.lineTo(x + e, y + h - e); ctx.lineTo(x, y + h);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(10, 12, 16, 0.32)';
  ctx.beginPath();
  ctx.moveTo(x + w, y); ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h); ctx.lineTo(x + e, y + h - e); ctx.lineTo(x + w - e, y + h - e); ctx.lineTo(x + w - e, y + e);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, w, h);
}

const rr = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
};

/* -- gallery wall ----------------------------------------------------------------------------------------------- */

type Picture = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) => void;
const PICTURES: readonly Picture[] = [
  // A landscape: sky over a green field with a pale sun.
  (c, x, y, w, h) => { c.fillStyle = '#6a8fa6'; c.fillRect(x, y, w, h); c.fillStyle = '#6b7a3e'; c.fillRect(x, y + h * 0.58, w, h * 0.42); c.fillStyle = '#e8d9a0'; c.fillRect(x + w * 0.64, y + h * 0.18, h * 0.24, h * 0.24); },
  // A portrait: a dark ground and a pale face.
  (c, x, y, w, h) => { c.fillStyle = '#2c2420'; c.fillRect(x, y, w, h); c.fillStyle = '#d9b48a'; c.beginPath(); c.ellipse(x + w / 2, y + h * 0.42, w * 0.2, h * 0.3, 0, 0, TAU); c.fill(); c.fillStyle = '#7a2e3a'; c.fillRect(x + w * 0.2, y + h * 0.78, w * 0.6, h * 0.22); },
  // Abstract blocks of ochre, red and blue.
  (c, x, y, w, h) => { c.fillStyle = '#c8963a'; c.fillRect(x, y, w, h); c.fillStyle = '#b4524a'; c.fillRect(x + w * 0.1, y + h * 0.15, w * 0.45, h * 0.55); c.fillStyle = '#3e5f8a'; c.fillRect(x + w * 0.5, y + h * 0.4, w * 0.4, h * 0.5); },
  // A still life: a burgundy bowl on cream.
  (c, x, y, w, h) => { c.fillStyle = '#d8cdb0'; c.fillRect(x, y, w, h); c.fillStyle = '#7a2e3a'; c.beginPath(); c.arc(x + w / 2, y + h * 0.6, h * 0.28, 0, Math.PI); c.fill(); c.fillStyle = '#6b7a3e'; c.fillRect(x + w * 0.4, y + h * 0.22, w * 0.2, h * 0.2); },
  // A moonlit sea.
  (c, x, y, w, h) => { c.fillStyle = '#26304a'; c.fillRect(x, y, w, h); c.fillStyle = '#3d4e75'; c.fillRect(x, y + h * 0.62, w, h * 0.38); c.fillStyle = '#e8e0c0'; c.beginPath(); c.arc(x + w * 0.7, y + h * 0.3, h * 0.17, 0, TAU); c.fill(); },
];

function frames(ctx: CanvasRenderingContext2D, s: Solid, face: number) {
  const rand = seeded(hash(s.x, s.y));
  const y = s.y + s.h + 3.5, fh = face - 8;
  for (let x = s.x + 9 + rand() * 8; x < s.x + s.w - 24;) {
    const fw = rand() < 0.3 ? 16 : rand() < 0.5 ? 22 : 28;
    if (x + fw > s.x + s.w - 6) break;
    ctx.fillStyle = '#2c1019';
    ctx.fillRect(x + 2, y + 2, fw, fh);
    ctx.fillStyle = BRASS;
    ctx.fillRect(x, y, fw, fh);
    ctx.fillStyle = BRASS_HI;
    ctx.fillRect(x, y, fw, 1.5);
    PICTURES[Math.floor(rand() * PICTURES.length)]!(ctx, x + 2.5, y + 2.5, fw - 5, fh - 5);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x, y, fw, fh);
    x += fw + 14 + rand() * 26;
  }
}


type Motif = 'frames' | 'glyph' | 'banner' | 'abstract' | 'niche' | 'shelves' | 'board' | 'prints' | 'stars' | 'waves' | 'drafts' | 'drawings' | 'strips' | 'gold';
type WallDress = { top: string; inner: string; front: string; rail: string; motif: Motif; torches?: true };
const DRESS: Partial<Record<DistrictId, WallDress>> = {
  egypt: { top: '#b89a64', inner: '#a8895a', front: '#9a7d4a', rail: '#7a5a2e', motif: 'glyph', torches: true },
  gems: { top: '#34487e', inner: '#2a3b66', front: '#1f2c4f', rail: '#5ad0ff', motif: 'strips' },
  treasury: { top: '#7a2a38', inner: '#6a2430', front: '#4a1a24', rail: '#d9b24a', motif: 'gold' },
  armour: { top: '#8a8d96', inner: '#7a7d86', front: '#5f626b', rail: '#3d4048', motif: 'banner', torches: true },
  impress: { top: '#8a3a47', inner: '#7c3240', front: '#7a313e', rail: BRASS, motif: 'frames' },
  modern: { top: '#e0ded8', inner: '#cfcdc6', front: '#c4c1b9', rail: '#2a2c32', motif: 'abstract' },
  sculpt: { top: '#d6c8a8', inner: '#c6b894', front: '#b5a684', rail: '#8a7a56', motif: 'niche' },
  shop: { top: '#4a7c86', inner: '#3f6f78', front: '#356068', rail: '#e8dfc6', motif: 'shelves' },
  cafe: { top: '#5f7d5c', inner: '#4f6b4f', front: '#425b44', rail: '#e8dfc6', motif: 'board' },
  iceage: { top: '#8aa4ba', inner: '#7a95ab', front: '#667f95', rail: '#dff0ff', motif: 'prints' },
  space: { top: '#323a70', inner: '#262d5e', front: '#1c2248', rail: '#9a8cff', motif: 'stars' },
  oceans: { top: '#3a8088', inner: '#2f7078', front: '#255a62', rail: '#bff5ee', motif: 'waves' },
  lab: { top: '#d0cab8', inner: '#bfb9a6', front: '#a8a28e', rail: '#6a6454', motif: 'drafts' },
  kids: { top: '#d0a84a', inner: '#c0983c', front: '#a8842e', rail: '#8a2e3c', motif: 'drawings' },
};
const DEFAULT_DRESS = DRESS.impress!;
const dressAt = (s: { x: number; y: number; w: number; h: number }) => DRESS[districtAt(s.x + s.w / 2, s.y + s.h / 2).id] ?? DEFAULT_DRESS;

/** Where a wall carries a torch: every few paces along a run, offset by position so no two walls tick together. */
export function torchSpots(s: { x: number; y: number; w: number; h: number }): { x: number; y: number }[] {
  if (!dressAt(s).torches || s.w < 140) return [];
  const out: { x: number; y: number }[] = [];
  for (let x = s.x + 70 + (hash(s.x, s.y) % 60); x < s.x + s.w - 40; x += 300) out.push({ x, y: s.y + s.h + 9 });
  return out;
}

const glyph = (c: CanvasRenderingContext2D, x: number, y: number, k: number, color: string) => {
  c.fillStyle = color; c.strokeStyle = color; c.lineWidth = 1.3;
  if (k === 0) { c.beginPath(); c.ellipse(x, y, 3.4, 2, 0, 0, TAU); c.stroke(); c.fillRect(x - 1, y - 1, 2, 2); }
  else if (k === 1) { c.beginPath(); c.arc(x, y - 2.5, 1.8, 0, TAU); c.stroke(); c.fillRect(x - 0.7, y - 1, 1.4, 6); c.fillRect(x - 2.5, y + 0.5, 5, 1.2); }
  else if (k === 2) { c.beginPath(); c.moveTo(x - 3, y + 3); c.lineTo(x, y - 3); c.lineTo(x + 3, y + 3); c.closePath(); c.fill(); }
  else if (k === 3) { c.beginPath(); c.moveTo(x - 4, y); c.lineTo(x - 2, y - 2); c.lineTo(x, y + 2); c.lineTo(x + 2, y - 2); c.lineTo(x + 4, y); c.stroke(); }
  else { c.beginPath(); c.arc(x, y, 2.6, 0, TAU); c.stroke(); c.fillRect(x - 0.7, y - 0.7, 1.4, 1.4); }
};

function torch(c: CanvasRenderingContext2D, x: number, y: number) {
  c.fillStyle = INK; c.fillRect(x - 3, y - 1, 6, 8);
  c.fillStyle = '#6a5a3e'; c.fillRect(x - 2, y, 4, 6);
  c.fillStyle = INK; c.beginPath(); c.moveTo(x - 5, y - 1); c.lineTo(x + 5, y - 1); c.lineTo(x + 3, y - 4); c.lineTo(x - 3, y - 4); c.closePath(); c.fill();
  c.fillStyle = '#d9541f'; c.beginPath(); c.moveTo(x - 4, y - 3); c.quadraticCurveTo(x - 5, y - 9, x, y - 14); c.quadraticCurveTo(x + 5, y - 9, x + 4, y - 3); c.closePath(); c.fill();
  c.fillStyle = '#ffb347'; c.beginPath(); c.moveTo(x - 2, y - 3); c.quadraticCurveTo(x - 3, y - 7, x, y - 10); c.quadraticCurveTo(x + 3, y - 7, x + 2, y - 3); c.closePath(); c.fill();
  c.fillStyle = '#fff1c2'; c.fillRect(x - 0.8, y - 6, 1.6, 3);
}

function banner(c: CanvasRenderingContext2D, x: number, y: number, color: string) {
  c.fillStyle = INK; c.fillRect(x - 8, y, 16, 2.5);
  c.fillStyle = BRASS; c.fillRect(x - 7, y + 0.5, 14, 1.2);
  c.fillStyle = color;
  c.beginPath(); c.moveTo(x - 6, y + 2); c.lineTo(x + 6, y + 2); c.lineTo(x + 6, y + 14); c.lineTo(x, y + 10); c.lineTo(x - 6, y + 14); c.closePath(); c.fill();
  c.strokeStyle = INK; c.lineWidth = 1.5; c.stroke();
  c.fillStyle = BRASS_HI; c.fillRect(x - 1, y + 4, 2, 5); c.fillRect(x - 3, y + 6, 6, 1.6);
}

function dressFront(ctx: CanvasRenderingContext2D, s: Solid, face: number, d: WallDress) {
  const { x, w } = s, y0 = s.y + s.h, rand = seeded(hash(s.x, s.y));
  const m = d.motif;
  if (w < 40 && m !== 'banner') return;
  if (m === 'frames') { frames(ctx, s, face - 5); return; }
  if (m === 'glyph') {
    ctx.fillStyle = '#7a5a2e'; ctx.fillRect(x, y0 + 3, w, 1.5); ctx.fillRect(x, y0 + face - 9, w, 1.5);
    for (let gx = x + 8; gx < x + w - 6; gx += 11) glyph(ctx, gx, y0 + 9, Math.floor(rand() * 5), rand() < 0.2 ? '#2f8f8a' : '#5a3d1e');
    for (const t of torchSpots(s)) torch(ctx, t.x, t.y - 2);
  } else if (m === 'banner') {
    ctx.strokeStyle = 'rgba(30, 32, 38, 0.45)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, y0 + 9); ctx.lineTo(x + w, y0 + 9); for (let bx = x + 14; bx < x + w - 4; bx += 28) { ctx.moveTo(bx, y0 + 1); ctx.lineTo(bx, y0 + 9); } ctx.stroke();
    if (w >= 120) for (let bx = x + 40 + (hash(s.x, s.y) % 50), i = 0; bx < x + w - 30; bx += 150, i++) banner(ctx, bx, y0 + 1, i % 2 ? '#2a3b66' : '#8a2e3c');
    for (const t of torchSpots(s)) torch(ctx, t.x + 75, t.y - 2);
  } else if (m === 'abstract') {
    const cols = ['#e0705a', '#3e8fa8', '#e8c13a', '#222'] as const;
    for (let ax = x + 12 + rand() * 20; ax < x + w - 40; ax += 70 + rand() * 60) {
      const aw = 30 + rand() * 18;
      ctx.fillStyle = '#f4f2ec'; ctx.fillRect(ax, y0 + 3, aw, face - 10);
      ctx.fillStyle = cols[Math.floor(rand() * 3)]!; ctx.beginPath(); ctx.arc(ax + aw * (0.3 + rand() * 0.4), y0 + 8, 4 + rand() * 3, 0, TAU); ctx.fill();
      ctx.fillStyle = cols[Math.floor(rand() * 4)]!; ctx.fillRect(ax + aw * rand() * 0.5, y0 + 10, aw * 0.4, 3);
      ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.strokeRect(ax, y0 + 3, aw, face - 10);
    }
    // A banana, taped to the wall. Somebody called it art.
    if (s.y === 4000 && s.h === 50 && s.x <= 1100 && s.x + w >= 1250) {
      const bx = 1170, by = y0 + 5;
      ctx.fillStyle = '#e8e4da'; ctx.fillRect(bx - 12, by - 3, 24, 11); ctx.strokeStyle = INK; ctx.lineWidth = 1.2; ctx.strokeRect(bx - 12, by - 3, 24, 11);
      ctx.fillStyle = '#f0c92e'; ctx.beginPath(); ctx.moveTo(bx - 9, by + 2); ctx.quadraticCurveTo(bx, by + 8, bx + 9, by); ctx.quadraticCurveTo(bx, by + 5, bx - 9, by + 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#9aa0a8'; ctx.fillRect(bx - 3, by - 3, 6, 3);
    }
  } else if (m === 'niche') {
    for (let nx = x + 18; nx < x + w - 14; nx += 56) {
      ctx.fillStyle = '#4a3f2c'; ctx.beginPath(); ctx.moveTo(nx - 7, y0 + face - 7); ctx.lineTo(nx - 7, y0 + 7); ctx.arc(nx, y0 + 7, 7, Math.PI, 0); ctx.lineTo(nx + 7, y0 + face - 7); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = '#e8dfc6'; ctx.beginPath(); ctx.arc(nx, y0 + 9, 3, 0, TAU); ctx.fill(); ctx.fillRect(nx - 4, y0 + 11, 8, 4);
    }
  } else if (m === 'shelves') {
    for (const sy of [y0 + 7, y0 + face - 7]) { ctx.fillStyle = '#e8dfc6'; ctx.fillRect(x + 2, sy, w - 4, 1.6); }
    for (let bx = x + 6; bx < x + w - 10; bx += 11 + Math.floor(rand() * 5)) {
      for (const sy of [y0 + 7, y0 + face - 7]) { ctx.fillStyle = ['#e8dfc6', '#b4524a', '#e8c13a', '#3e8fa8', '#6b7a3e'][Math.floor(rand() * 5)]!; const bh = 3 + rand() * 3; ctx.fillRect(bx, sy - bh, 8, bh); }
    }
  } else if (m === 'board') {
    ctx.fillStyle = '#e8dfc6'; ctx.fillRect(x, y0 + face - 7, w, 7);
    ctx.strokeStyle = 'rgba(40, 60, 40, 0.5)'; ctx.lineWidth = 1; ctx.beginPath(); for (let bx = x + 10; bx < x + w; bx += 10) { ctx.moveTo(bx, y0 + face - 7); ctx.lineTo(bx, y0 + face); } ctx.stroke();
    for (let bx = x + 14; bx < x + w - 60; bx += 130) {
      ctx.fillStyle = '#26332a'; ctx.fillRect(bx, y0 + 3, 54, 7); ctx.strokeStyle = BRASS; ctx.lineWidth = 1.5; ctx.strokeRect(bx, y0 + 3, 54, 7);
      ctx.fillStyle = 'rgba(240, 240, 230, 0.8)'; for (let k = 0; k < 4; k++) ctx.fillRect(bx + 4, y0 + 4.5 + (k % 3) * 1.8, 10 + rand() * 30, 1);
    }
  } else if (m === 'prints') {
    ctx.fillStyle = '#c97a5a';
    for (let px = x + 12; px < x + w - 10; px += 20 + rand() * 40) {
      if (rand() < 0.6) { ctx.beginPath(); ctx.arc(px, y0 + 10, 3.2, 0, TAU); ctx.fill(); for (let f = 0; f < 4; f++) ctx.fillRect(px - 4 + f * 2.6, y0 + 4, 1.6, 3.4); }
      else { ctx.fillStyle = '#6a3d2a'; ctx.beginPath(); ctx.ellipse(px, y0 + 9, 7, 4, 0, 0, TAU); ctx.fill(); ctx.fillRect(px + 5, y0 + 4, 1.6, 5); ctx.fillRect(px - 5, y0 + 11, 1.6, 4); ctx.fillStyle = '#c97a5a'; }
    }
  } else if (m === 'stars') {
    ctx.fillStyle = '#e8e0ff';
    for (let i = 0; i < w / 9; i++) ctx.fillRect(x + 4 + rand() * (w - 8), y0 + 3 + rand() * (face - 12), rand() < 0.2 ? 2 : 1.4, rand() < 0.2 ? 2 : 1.4);
    for (let px = x + 30; px < x + w - 20; px += 110 + rand() * 80) { ctx.fillStyle = ['#e0705a', '#e8c13a', '#6fa8ff'][Math.floor(rand() * 3)]!; ctx.beginPath(); ctx.arc(px, y0 + 9, 4.5, 0, TAU); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 1.4; ctx.stroke(); }
  } else if (m === 'waves') {
    ctx.strokeStyle = 'rgba(200, 255, 245, 0.6)'; ctx.lineWidth = 1.4;
    for (const wy of [y0 + 6, y0 + 11]) { ctx.beginPath(); for (let wx = x + 2; wx < x + w - 2; wx += 8) { ctx.moveTo(wx, wy); ctx.quadraticCurveTo(wx + 2, wy - 3, wx + 4, wy); ctx.quadraticCurveTo(wx + 6, wy + 3, wx + 8, wy); } ctx.stroke(); }
    ctx.fillStyle = 'rgba(14, 40, 48, 0.7)';
    for (let fx = x + 24; fx < x + w - 24; fx += 90 + rand() * 60) { ctx.beginPath(); ctx.ellipse(fx, y0 + 9, 6, 3, 0, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.moveTo(fx + 5, y0 + 9); ctx.lineTo(fx + 10, y0 + 5); ctx.lineTo(fx + 10, y0 + 13); ctx.fill(); }
  } else if (m === 'drafts') {
    for (let px = x + 10; px < x + w - 24; px += 40 + rand() * 50) {
      const blue = rand() < 0.35;
      ctx.fillStyle = blue ? '#4a78b0' : '#f4f2ec'; ctx.fillRect(px, y0 + 3, 20, face - 9); ctx.strokeStyle = INK; ctx.lineWidth = 1.3; ctx.strokeRect(px, y0 + 3, 20, face - 9);
      ctx.fillStyle = blue ? 'rgba(255,255,255,0.7)' : 'rgba(30,30,40,0.5)'; for (let k = 0; k < 3; k++) ctx.fillRect(px + 3, y0 + 6 + k * 3, 10 + rand() * 4, 1);
      ctx.fillStyle = '#d9d2a8'; ctx.fillRect(px + 7, y0 + 1.5, 6, 3);
    }
  } else if (m === 'drawings') {
    const cr = ['#d9541f', '#3e8fa8', '#6b9a5a', '#e8c13a', '#b4524a'] as const;
    for (let px = x + 8; px < x + w - 26; px += 34 + rand() * 40) {
      ctx.fillStyle = '#f4f2ec'; ctx.fillRect(px, y0 + 3, 22, face - 9); ctx.strokeStyle = INK; ctx.lineWidth = 1.3; ctx.strokeRect(px, y0 + 3, 22, face - 9);
      ctx.strokeStyle = cr[Math.floor(rand() * 5)]!; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(px + 7, y0 + 8, 2.5, 0, TAU); ctx.moveTo(px + 4, y0 + 13); ctx.lineTo(px + 19, y0 + 13); ctx.lineTo(px + 15, y0 + 9); ctx.stroke();
      ctx.fillStyle = cr[Math.floor(rand() * 5)]!; ctx.fillRect(px + 10, y0 + 5, 2, 2); ctx.fillStyle = '#d9541f'; ctx.fillRect(px + 9, y0 + 1.5, 3, 3);
    }
  } else if (m === 'strips') {
    ctx.fillStyle = '#5ad0ff'; ctx.fillRect(x, y0 + 5, w, 2); ctx.fillStyle = 'rgba(190, 240, 255, 0.5)'; ctx.fillRect(x, y0 + 5, w, 1);
    ctx.strokeStyle = 'rgba(8, 14, 34, 0.7)'; ctx.lineWidth = 1; ctx.beginPath(); for (let sx = x + 24; sx < x + w; sx += 48) { ctx.moveTo(sx, y0 + 8); ctx.lineTo(sx, y0 + face - 6); } ctx.stroke();
  } else if (m === 'gold') {
    ctx.fillStyle = hexA('#d9b24a', 0.9);
    for (let gx = x + 10; gx < x + w - 6; gx += 16) { ctx.beginPath(); ctx.moveTo(gx, y0 + 9); ctx.lineTo(gx + 4, y0 + 5); ctx.lineTo(gx + 8, y0 + 9); ctx.lineTo(gx + 4, y0 + 13); ctx.closePath(); ctx.fill(); }
    ctx.fillRect(x, y0 + 3, w, 1.5); ctx.fillRect(x, y0 + face - 9, w, 1.5);
  }
}

function paintGallery(ctx: CanvasRenderingContext2D, s: Solid) {
  const { x, y, w, h } = s, face = FACE.gallery, d = dressAt(s);
  shell(ctx, s, d.top, d.front, face, () => {
    ctx.fillStyle = 'rgba(10, 8, 12, 0.32)';
    ctx.fillRect(x, y + h + face - 6, w, 6);
    ctx.fillStyle = d.rail;
    ctx.fillRect(x, y + h + face - 7, w, 1.5);
    dressFront(ctx, s, face, d);
  }, () => {
    if (w > 14 && h > 14) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
      ctx.fillRect(x + 2, y + 2, w - 4, h - 4);
      ctx.fillStyle = d.inner;
      ctx.fillRect(x + 6, y + 6, w - 12, h - 12);
    }
    ctx.fillStyle = hexA(d.rail, 0.75);
    if (w >= h) ctx.fillRect(x + 8, y + h / 2 - 1, w - 16, 2);
    else ctx.fillRect(x + w / 2 - 1, y + 8, 2, h - 16);
  });
}

/* -- marble ----------------------------------------------------------------------------------------------------- */

function veins(ctx: CanvasRenderingContext2D, s: Solid, n: number, alpha: number) {
  const rand = seeded(hash(s.x * 3, s.y * 5));
  ctx.strokeStyle = `rgba(74, 70, 63, ${alpha})`;
  ctx.lineWidth = 1.4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    let px = s.x + 4 + rand() * (s.w - 8), py = s.y + 4 + rand() * (s.h - 8);
    ctx.moveTo(px, py);
    for (let k = 0; k < 3; k++) {
      px = Math.min(s.x + s.w - 3, Math.max(s.x + 3, px + (rand() - 0.3) * s.w * 0.4));
      py = Math.min(s.y + s.h - 3, Math.max(s.y + 3, py + (rand() - 0.3) * s.h * 0.4));
      ctx.lineTo(px, py);
    }
  }
  ctx.stroke();
  ctx.lineCap = 'butt';
}

function paintColumn(ctx: CanvasRenderingContext2D, s: Solid) {
  const { x, y, w, h } = s, face = FACE.marble;
  shell(ctx, s, '#cfc6b0', '#b8b09a', face, () => {
    // A fluted shaft between a pale capital and a dark base.
    for (let i = 0, fx = x + 2; fx < x + w - 2; i++, fx += 6) {
      ctx.fillStyle = i % 2 ? '#a39b86' : '#c9c1ab';
      ctx.fillRect(fx, y + h + 3, Math.min(6, x + w - 2 - fx), face - 6);
    }
    ctx.fillStyle = '#e0d8c3';
    ctx.fillRect(x, y + h, w, 3);
    ctx.fillStyle = '#8a8370';
    ctx.fillRect(x, y + h + face - 4, w, 4);
  }, () => {
    const cx = x + w / 2, cy = y + h / 2, r = Math.min(w, h) / 2 - 6;
    ctx.fillStyle = '#e4dcc7';
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = '#d3cab3';
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.58, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#a79e88'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = '#8a8370';
    ctx.beginPath(); ctx.arc(cx, cy, 2.4, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, r - 2, Math.PI * 1.08, Math.PI * 1.62); ctx.stroke();
  });
}

function paintSarcophagus(ctx: CanvasRenderingContext2D, s: Solid) {
  const { x, y, w, h } = s;
  const long = h >= w;
  shell(ctx, s, '#cfc6b0', '#9b937f', FACE.marble, () => {
    ctx.fillStyle = '#867f6c';
    for (const f of [0.18, 0.62]) ctx.fillRect(x + w * f, y + h + 4, w * 0.2, FACE.marble - 8);
  }, () => {
    veins(ctx, s, 3, 0.18);
    // The lid: a rounded case in marble and brass, a face at the head and banded wrappings below it.
    const lx = x + 10, ly = y + 10, lw = w - 20, lh = h - 20;
    ctx.fillStyle = '#dcd3bc';
    rr(ctx, lx, ly, lw, lh, Math.min(lw, lh) * 0.32);
    ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke();
    ctx.save();
    ctx.translate(x + w / 2, y + h / 2);
    if (!long) ctx.rotate(-Math.PI / 2);
    const L = long ? lh : lw, Wd = long ? lw : lh;
    ctx.fillStyle = BRASS;
    ctx.beginPath(); ctx.arc(0, -L * 0.3, Wd * 0.2, 0, TAU); ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = INK;
    for (const dx of [-1, 1]) ctx.fillRect(dx * Wd * 0.07 - 1.5, -L * 0.3 - 2, 3, 3);
    ctx.fillStyle = hexA(BRASS, 0.9);
    for (let i = 0; i < 4; i++) ctx.fillRect(-Wd * 0.34, -L * 0.04 + i * L * 0.13, Wd * 0.68, 4);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.fillRect(-Wd * 0.4, -L * 0.42, 3, L * 0.8);
    ctx.restore();
  });
}

function paintStatue(ctx: CanvasRenderingContext2D, s: Solid) {
  const { x, y, w, h } = s;
  shell(ctx, s, '#cfc6b0', '#9b937f', FACE.marble, () => {
    ctx.fillStyle = '#867f6c';
    ctx.fillRect(x + 6, y + h + 4, w - 12, 3);
  }, () => {
    const cx = x + w / 2, cy = y + h / 2;
    ctx.fillStyle = '#b9b19b';
    ctx.fillRect(x + 8, y + 8, w - 16, h - 16);
    ctx.strokeStyle = BRASS; ctx.lineWidth = 2; ctx.strokeRect(x + 8, y + 8, w - 16, h - 16);
    // A marble bust seen from above: shoulders, then a head with a laurel ring.
    ctx.fillStyle = '#ece5d2';
    ctx.beginPath(); ctx.ellipse(cx, cy + 8, w * 0.32, h * 0.2, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy - 10, Math.min(w, h) * 0.2, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#7b8a52'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(cx, cy - 10, Math.min(w, h) * 0.2 - 3, Math.PI * 0.15, Math.PI * 0.85, true); ctx.stroke();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.beginPath(); ctx.arc(cx - 6, cy - 17, 3, 0, TAU); ctx.fill();
  });
}

function paintSlab(ctx: CanvasRenderingContext2D, s: Solid) {
  const { x, y, w, h } = s;
  shell(ctx, s, '#cfc6b0', '#9b937f', FACE.marble, () => {
    ctx.strokeStyle = 'rgba(40, 36, 30, 0.35)';
    ctx.lineWidth = 1.5;
    for (let px = x + 22; px < x + w - 8; px += 44) { ctx.beginPath(); ctx.moveTo(px, y + h + 4); ctx.lineTo(px, y + h + FACE.marble - 4); ctx.stroke(); }
  }, () => {
    veins(ctx, s, Math.max(1, Math.round((w * h) / 4000)), 0.22);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
    ctx.beginPath(); ctx.moveTo(x + 4, y + 4); ctx.lineTo(x + Math.min(w, 40), y + 4); ctx.lineTo(x + 4, y + Math.min(h, 40)); ctx.closePath(); ctx.fill();
  });
}


/** A pedestal of some district's own: flat top colour, a front of the same stuff, and whatever stands on it. */
type ColSpec = { top: string; front: string; art: (c: CanvasRenderingContext2D, cx: number, cy: number, r: number, s: Solid) => void };
const ring = (c: CanvasRenderingContext2D, cx: number, cy: number, r: number, fill: string) => { c.fillStyle = fill; c.beginPath(); c.arc(cx, cy, r, 0, TAU); c.fill(); c.strokeStyle = INK; c.lineWidth = 1.8; c.stroke(); };
const glint = (c: CanvasRenderingContext2D, cx: number, cy: number, r: number) => { c.strokeStyle = 'rgba(255, 255, 255, 0.55)'; c.lineWidth = 2; c.beginPath(); c.arc(cx, cy, r, Math.PI * 1.08, Math.PI * 1.62); c.stroke(); };
const COLS: Partial<Record<DistrictId, ColSpec>> = {
  // A papyrus column from above: a sandstone drum crowned with a lotus of eight green petals.
  egypt: { top: '#c9ac74', front: '#a8895a', art: (c, cx, cy, r) => { ring(c, cx, cy, r, '#d9bf8a'); c.fillStyle = '#4f8a5a'; for (let k = 0; k < 8; k++) { c.save(); c.translate(cx, cy); c.rotate((k * TAU) / 8); c.beginPath(); c.ellipse(r * 0.55, 0, r * 0.38, r * 0.16, 0, 0, TAU); c.fill(); c.strokeStyle = INK; c.lineWidth = 1.2; c.stroke(); c.restore(); } ring(c, cx, cy, r * 0.22, '#d9b24a'); glint(c, cx, cy, r - 2); } },
  // A suit of armour on a stone block: a plumed helm between two pauldrons.
  armour: { top: '#8a8d96', front: '#6a6d76', art: (c, cx, cy, r) => { c.fillStyle = '#a0a6b0'; for (const dx of [-1, 1]) { c.beginPath(); c.ellipse(cx + dx * r * 0.72, cy + 2, r * 0.3, r * 0.5, 0, 0, TAU); c.fill(); c.strokeStyle = INK; c.lineWidth = 1.8; c.stroke(); } ring(c, cx, cy, r * 0.55, '#c3c9d3'); c.fillStyle = '#8a2e3c'; c.beginPath(); c.ellipse(cx, cy - r * 0.5, r * 0.16, r * 0.3, 0, 0, TAU); c.fill(); c.strokeStyle = INK; c.lineWidth = 1.4; c.stroke(); c.fillStyle = INK; c.fillRect(cx - r * 0.32, cy + r * 0.05, r * 0.64, 3.4); c.fillStyle = '#e8ecf2'; c.fillRect(cx - r * 0.4, cy - r * 0.15, 3, 2); } },
  // Odd sculpture under cool spots: a coral blob, a teal ball and a yellow cone on a white block.
  modern: { top: '#ece9e2', front: '#d4d1c9', art: (c, cx, cy, r, s) => { const k = hash(s.x, s.y) % 3; if (k === 0) { ring(c, cx - r * 0.2, cy + r * 0.1, r * 0.55, '#e0705a'); ring(c, cx + r * 0.35, cy - r * 0.3, r * 0.3, '#3e8fa8'); } else if (k === 1) { c.fillStyle = '#e8c13a'; c.beginPath(); c.moveTo(cx, cy - r * 0.8); c.lineTo(cx + r * 0.7, cy + r * 0.6); c.lineTo(cx - r * 0.7, cy + r * 0.6); c.closePath(); c.fill(); c.strokeStyle = INK; c.lineWidth = 1.8; c.stroke(); ring(c, cx + r * 0.2, cy, r * 0.22, '#222'); } else { c.strokeStyle = INK; c.lineWidth = 7; c.beginPath(); c.arc(cx, cy, r * 0.5, 0.4, 5.6); c.stroke(); c.strokeStyle = '#e0705a'; c.lineWidth = 4; c.beginPath(); c.arc(cx, cy, r * 0.5, 0.4, 5.6); c.stroke(); } } },
  // A marble bust seen from above; one of them has found a pair of sunglasses.
  sculpt: { top: '#d9d0ba', front: '#b5a684', art: (c, cx, cy, r, s) => { c.fillStyle = '#ece5d2'; c.beginPath(); c.ellipse(cx, cy + r * 0.3, r * 0.75, r * 0.4, 0, 0, TAU); c.fill(); c.strokeStyle = INK; c.lineWidth = 1.8; c.stroke(); ring(c, cx, cy - r * 0.15, r * 0.42, '#f2ecda'); glint(c, cx, cy - r * 0.15, r * 0.34); if (s.x === 1800 && s.y === 4700) { c.fillStyle = INK; c.fillRect(cx - r * 0.34, cy - r * 0.28, r * 0.28, 4); c.fillRect(cx + r * 0.06, cy - r * 0.28, r * 0.28, 4); c.fillRect(cx - r * 0.08, cy - r * 0.28, r * 0.16, 1.4); } } },
  // A round cafe table under a checked cloth with four chairs pulled up.
  cafe: { top: '#8a5a34', front: '#55371f', art: (c, cx, cy, r) => { for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]] as const) ring(c, cx + dx * r * 0.82, cy + dy * r * 0.82, r * 0.22, '#6a4426'); ring(c, cx, cy, r * 0.62, '#f4f2ec'); c.strokeStyle = '#b4524a'; c.lineWidth = 2.4; c.beginPath(); c.arc(cx, cy, r * 0.46, 0, TAU); c.stroke(); ring(c, cx - r * 0.12, cy - r * 0.1, r * 0.12, '#e8dfc6'); ring(c, cx + r * 0.18, cy + r * 0.12, r * 0.1, '#b4524a'); } },
  // A postcard spinner: a ring of coloured cards round a post.
  shop: { top: '#d9d0ba', front: '#9b937f', art: (c, cx, cy, r) => { for (let k = 0; k < 8; k++) { c.save(); c.translate(cx, cy); c.rotate((k * TAU) / 8); c.fillStyle = ['#e8c13a', '#3e8fa8', '#b4524a', '#6b9a5a'][k % 4]!; c.fillRect(r * 0.2, -4, r * 0.6, 8); c.strokeStyle = INK; c.lineWidth = 1.4; c.strokeRect(r * 0.2, -4, r * 0.6, 8); c.restore(); } ring(c, cx, cy, r * 0.2, '#b79a4a'); } },
  // A ringed planet on a stand.
  space: { top: '#3a4280', front: '#262d5e', art: (c, cx, cy, r, s) => { const col = ['#e0705a', '#e8c13a', '#6fa8ff'][hash(s.x, s.y) % 3]!; ring(c, cx, cy, r * 0.5, col); c.strokeStyle = INK; c.lineWidth = 5; c.beginPath(); c.ellipse(cx, cy, r * 0.95, r * 0.28, -0.4, 0, TAU); c.stroke(); c.strokeStyle = '#e8e0ff'; c.lineWidth = 2.4; c.beginPath(); c.ellipse(cx, cy, r * 0.95, r * 0.28, -0.4, 0, TAU); c.stroke(); glint(c, cx, cy, r * 0.42); } },
  // A coral column: pink and orange lumps round a hollow.
  oceans: { top: '#2f7078', front: '#255a62', art: (c, cx, cy, r) => { for (let k = 0; k < 7; k++) { const a = (k / 7) * TAU; ring(c, cx + Math.cos(a) * r * 0.55, cy + Math.sin(a) * r * 0.55, r * 0.3, k % 2 ? '#e8806a' : '#e8a0b0'); } ring(c, cx, cy, r * 0.28, '#1c4046'); } },
  // A pillar of old ice, pale blue with a snow cap.
  iceage: { top: '#a8c4d8', front: '#7a95ab', art: (c, cx, cy, r) => { c.fillStyle = '#d8ecf8'; c.beginPath(); for (let k = 0; k < 7; k++) { const a = (k / 7) * TAU + 0.3, rr2 = r * (0.78 + 0.18 * ((k * 5) % 3) / 2); c.lineTo(cx + Math.cos(a) * rr2, cy + Math.sin(a) * rr2); } c.closePath(); c.fill(); c.strokeStyle = INK; c.lineWidth = 1.8; c.stroke(); c.fillStyle = 'rgba(255, 255, 255, 0.7)'; c.beginPath(); c.arc(cx - r * 0.2, cy - r * 0.25, r * 0.28, 0, TAU); c.fill(); } },
  // A tower of toy blocks.
  kids: { top: '#c0983c', front: '#a8842e', art: (c, cx, cy, r) => { const bl = [['#b4524a', -0.3, -0.3], ['#3e8fa8', 0.25, -0.1], ['#6b9a5a', -0.1, 0.3]] as const; for (const [col, dx, dy] of bl) { c.fillStyle = col; c.fillRect(cx + dx * r - r * 0.35, cy + dy * r - r * 0.35, r * 0.7, r * 0.7); c.strokeStyle = INK; c.lineWidth = 1.8; c.strokeRect(cx + dx * r - r * 0.35, cy + dy * r - r * 0.35, r * 0.7, r * 0.7); c.fillStyle = '#f4f2ec'; c.fillRect(cx + dx * r - 3, cy + dy * r - 3, 6, 6); } } },
  // A crated sculpture under a dust sheet, strapped for the restorers.
  lab: { top: '#a3814f', front: '#7d6038', art: (c, cx, cy, r) => { c.fillStyle = '#e8e2d0'; c.beginPath(); c.moveTo(cx - r * 0.7, cy + r * 0.6); c.quadraticCurveTo(cx - r * 0.8, cy - r * 0.7, cx, cy - r * 0.75); c.quadraticCurveTo(cx + r * 0.8, cy - r * 0.7, cx + r * 0.7, cy + r * 0.6); c.closePath(); c.fill(); c.strokeStyle = INK; c.lineWidth = 1.8; c.stroke(); c.strokeStyle = '#8a7a56'; c.lineWidth = 2; c.beginPath(); c.moveTo(cx - r * 0.7, cy); c.lineTo(cx + r * 0.7, cy); c.stroke(); } },
  // A faceted crystal.
  gems: { top: '#34487e', front: '#1f2c4f', art: (c, cx, cy, r) => { c.fillStyle = '#6fa8ff'; c.beginPath(); for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU; c.lineTo(cx + Math.cos(a) * r * 0.8, cy + Math.sin(a) * r * 0.8); } c.closePath(); c.fill(); c.strokeStyle = INK; c.lineWidth = 1.8; c.stroke(); c.fillStyle = '#bfe0ff'; c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + r * 0.8, cy); c.lineTo(cx + Math.cos(1.05) * r * 0.8, cy + Math.sin(1.05) * r * 0.8); c.closePath(); c.fill(); c.fillStyle = 'rgba(255,255,255,0.7)'; c.fillRect(cx - r * 0.3, cy - r * 0.45, 4, 4); } },
  treasury: { top: '#8a2e3c', front: '#5a1a26', art: (c, cx, cy, r) => { ring(c, cx, cy, r * 0.8, '#d9b24a'); ring(c, cx, cy, r * 0.5, '#e8d08a'); ring(c, cx, cy, r * 0.18, '#8a2e3c'); glint(c, cx, cy, r * 0.7); } },
};

function colFront(ctx: CanvasRenderingContext2D, s: Solid, spec: ColSpec) {
  const { x, y, w, h } = s, face = FACE.marble;
  for (let i = 0, fx = x + 2; fx < x + w - 2; i++, fx += 8) { ctx.fillStyle = i % 2 ? 'rgba(10,12,16,0.14)' : 'rgba(255,255,255,0.1)'; ctx.fillRect(fx, y + h + 3, Math.min(8, x + w - 2 - fx), face - 6); }
  ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.fillRect(x, y + h, w, 3);
  ctx.fillStyle = 'rgba(10,12,16,0.3)'; ctx.fillRect(x, y + h + face - 4, w, 4);
  void spec;
}

function paintPedestal(ctx: CanvasRenderingContext2D, s: Solid, spec: ColSpec) {
  const { x, y, w, h } = s;
  shell(ctx, s, spec.top, spec.front, FACE.marble, () => colFront(ctx, s, spec), () => {
    spec.art(ctx, x + w / 2, y + h / 2, Math.min(w, h) / 2 - 6, s);
  });
}

/** The horse of a jousting knight, armoured and caparisoned, the armour hall's big landmark. */
function paintJoust(ctx: CanvasRenderingContext2D, s: Solid) {
  const { x, y, w, h } = s;
  shell(ctx, s, '#8a8d96', '#6a6d76', FACE.marble, () => { ctx.fillStyle = '#8a2e3c'; ctx.fillRect(x + 6, y + h + 4, w - 12, 5); ctx.fillStyle = BRASS; ctx.fillRect(x + 6, y + h + 9, w - 12, 1.5); }, () => {
    ctx.fillStyle = '#7a7d86'; ctx.fillRect(x + 6, y + 6, w - 12, h - 12); ctx.strokeStyle = BRASS; ctx.lineWidth = 2; ctx.strokeRect(x + 6, y + 6, w - 12, h - 12);
    ctx.save(); ctx.translate(x + w / 2, y + h / 2); ctx.rotate(-Math.PI / 2);
    const L = h - 30;
    ctx.fillStyle = '#4a4036'; ctx.beginPath(); ctx.ellipse(0, 0, L * 0.3, w * 0.25, 0, 0, TAU); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#8a2e3c'; ctx.fillRect(-L * 0.2, -w * 0.3, L * 0.4, w * 0.6); ctx.strokeRect(-L * 0.2, -w * 0.3, L * 0.4, w * 0.6);
    ctx.fillStyle = BRASS_HI; ctx.fillRect(-L * 0.05, -w * 0.3, 4, w * 0.6);
    ctx.fillStyle = '#4a4036'; ctx.beginPath(); ctx.ellipse(L * 0.38, 0, L * 0.12, w * 0.12, 0, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#c3c9d3'; ctx.beginPath(); ctx.arc(-L * 0.02, 0, w * 0.17, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#8a2e3c'; ctx.fillRect(-L * 0.02 - 2, -w * 0.28, 4, 10);
    ctx.strokeStyle = '#6a5a3e'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-L * 0.15, w * 0.18); ctx.lineTo(L * 0.5, w * 0.05); ctx.stroke();
    ctx.restore();
  });
}

function paintGlobe(ctx: CanvasRenderingContext2D, s: Solid) {
  const { x, y, w, h } = s;
  shell(ctx, s, '#cfc6b0', '#9b937f', FACE.marble, () => { ctx.fillStyle = '#867f6c'; ctx.fillRect(x + 6, y + h + 4, w - 12, 3); }, () => {
    const cx = x + w / 2, cy = y + h / 2, r = Math.min(w, h) * 0.36;
    ctx.fillStyle = '#b9b19b'; ctx.fillRect(x + 8, y + 8, w - 16, h - 16); ctx.strokeStyle = BRASS; ctx.lineWidth = 2; ctx.strokeRect(x + 8, y + 8, w - 16, h - 16);
    ctx.fillStyle = '#3e6fb0'; ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#6b9a5a'; ctx.beginPath(); ctx.ellipse(cx - r * 0.25, cy - r * 0.2, r * 0.38, r * 0.3, 0.5, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.ellipse(cx + r * 0.35, cy + r * 0.3, r * 0.22, r * 0.3, -0.3, 0, TAU); ctx.fill();
    ctx.strokeStyle = BRASS; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.arc(cx, cy, r + 5, 0.5, 5.8); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.arc(cx - r * 0.4, cy - r * 0.5, 3.5, 0, TAU); ctx.fill();
  });
}

function paintMarble(ctx: CanvasRenderingContext2D, s: Solid) {
  const big = Math.max(s.w, s.h), small = Math.min(s.w, s.h), d = districtAt(s.x + s.w / 2, s.y + s.h / 2).id;
  if (big <= 160 && big / small <= 1.6) { const spec = COLS[d]; if (spec) paintPedestal(ctx, s, spec); else paintColumn(ctx, s); }
  else if (s.w * s.h >= 25000 && big / small >= 1.8) { if (d === 'armour') paintJoust(ctx, s); else paintSarcophagus(ctx, s); }
  else if (s.w * s.h >= 25000) { if (d === 'shall') paintGlobe(ctx, s); else paintStatue(ctx, s); }
  else paintSlab(ctx, s);
}

/* -- glass display cases ---------------------------------------------------------------------------------------- */

type Artifact = (c: CanvasRenderingContext2D, cx: number, cy: number, r: number) => void;
const ARTIFACTS: readonly Artifact[] = [
  // A fossil egg, cream and freckled.
  (c, cx, cy, r) => { c.fillStyle = '#e3d8b8'; c.beginPath(); c.ellipse(cx, cy, r * 0.62, r * 0.8, 0.5, 0, TAU); c.fill(); c.strokeStyle = INK; c.lineWidth = 1.5; c.stroke(); c.fillStyle = '#a8946b'; for (const [dx, dy] of [[-3, -2], [2, 3], [4, -5]] as const) c.fillRect(cx + dx * r * 0.1, cy + dy * r * 0.1, 2, 2); },
  // A gold death mask.
  (c, cx, cy, r) => { c.fillStyle = '#d9b24a'; c.beginPath(); c.moveTo(cx - r * 0.6, cy - r * 0.7); c.lineTo(cx + r * 0.6, cy - r * 0.7); c.lineTo(cx + r * 0.4, cy + r * 0.8); c.lineTo(cx - r * 0.4, cy + r * 0.8); c.closePath(); c.fill(); c.strokeStyle = INK; c.lineWidth = 1.5; c.stroke(); c.fillStyle = '#26304a'; c.fillRect(cx - r * 0.38, cy - r * 0.2, r * 0.26, 3); c.fillRect(cx + r * 0.12, cy - r * 0.2, r * 0.26, 3); c.fillRect(cx - r * 0.7, cy - r * 0.55, r * 0.14, r * 1.1); c.fillRect(cx + r * 0.56, cy - r * 0.55, r * 0.14, r * 1.1); },
  // An amphora seen from above: a round lip between two handles.
  (c, cx, cy, r) => { c.fillStyle = '#a8552e'; c.beginPath(); c.arc(cx, cy, r * 0.5, 0, TAU); c.fill(); c.strokeStyle = INK; c.lineWidth = 1.5; c.stroke(); c.fillStyle = '#1c1f26'; c.beginPath(); c.arc(cx, cy, r * 0.26, 0, TAU); c.fill(); c.strokeStyle = '#a8552e'; c.lineWidth = 3; c.beginPath(); c.arc(cx - r * 0.7, cy, r * 0.22, -1.2, 1.2); c.moveTo(cx + r * 0.7, cy); c.arc(cx + r * 0.7, cy, r * 0.22, Math.PI - 1.2, Math.PI + 1.2); c.stroke(); },
  // A cut sapphire.
  (c, cx, cy, r) => { c.fillStyle = '#3e6fb0'; c.beginPath(); for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; c.lineTo(cx + Math.cos(a) * r * 0.62, cy + Math.sin(a) * r * 0.62); } c.closePath(); c.fill(); c.strokeStyle = INK; c.lineWidth = 1.5; c.stroke(); c.fillStyle = 'rgba(255,255,255,0.6)'; c.beginPath(); c.moveTo(cx - r * 0.3, cy - r * 0.4); c.lineTo(cx + r * 0.1, cy - r * 0.45); c.lineTo(cx - r * 0.1, cy); c.closePath(); c.fill(); },
  // A skull.
  (c, cx, cy, r) => { c.fillStyle = BONE; c.beginPath(); c.ellipse(cx, cy - r * 0.1, r * 0.55, r * 0.6, 0, 0, TAU); c.fill(); c.fillRect(cx - r * 0.3, cy + r * 0.3, r * 0.6, r * 0.34); c.strokeStyle = INK; c.lineWidth = 1.5; c.stroke(); c.fillStyle = INK; for (const dx of [-1, 1]) { c.beginPath(); c.arc(cx + dx * r * 0.25, cy - r * 0.15, r * 0.15, 0, TAU); c.fill(); } },
  // A trilobite: a segmented grey oval.
  (c, cx, cy, r) => { c.fillStyle = '#7e8590'; c.beginPath(); c.ellipse(cx, cy, r * 0.46, r * 0.78, 0, 0, TAU); c.fill(); c.strokeStyle = INK; c.lineWidth = 1.5; c.stroke(); c.strokeStyle = '#4a5058'; c.lineWidth = 1.2; c.beginPath(); for (let i = -2; i <= 2; i++) { c.moveTo(cx - r * 0.42, cy + i * r * 0.22); c.lineTo(cx + r * 0.42, cy + i * r * 0.22); } c.stroke(); },
  // A ceremonial dagger on a cushion.
  (c, cx, cy, r) => { c.save(); c.translate(cx, cy); c.rotate(-0.6); c.fillStyle = '#cfd6dd'; c.beginPath(); c.moveTo(-r * 0.8, -2.5); c.lineTo(r * 0.3, -2.5); c.lineTo(r * 0.8, 0); c.lineTo(r * 0.3, 2.5); c.lineTo(-r * 0.8, 2.5); c.closePath(); c.fill(); c.strokeStyle = INK; c.lineWidth = 1.2; c.stroke(); c.fillStyle = BRASS; c.fillRect(-r * 0.95, -4, r * 0.3, 8); c.strokeRect(-r * 0.95, -4, r * 0.3, 8); c.restore(); },
];

const coin = (c: CanvasRenderingContext2D, x: number, y: number, r: number) => { c.fillStyle = '#d9b24a'; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); c.strokeStyle = INK; c.lineWidth = 1.3; c.stroke(); c.fillStyle = 'rgba(255,255,255,0.5)'; c.fillRect(x - r * 0.5, y - r * 0.5, 2, 2); };
const EXTRA: Record<string, Artifact> = {
  scarab: (c, cx, cy, r) => { c.fillStyle = '#2f8f8a'; c.beginPath(); c.ellipse(cx, cy, r * 0.5, r * 0.65, 0, 0, TAU); c.fill(); c.strokeStyle = INK; c.lineWidth = 1.5; c.stroke(); c.strokeStyle = INK; c.beginPath(); c.moveTo(cx, cy - r * 0.6); c.lineTo(cx, cy + r * 0.6); c.stroke(); c.fillStyle = '#d9b24a'; c.fillRect(cx - r * 0.3, cy - r * 0.78, r * 0.6, 3); },
  duck: (c, cx, cy, r) => { c.fillStyle = '#f0c92e'; c.beginPath(); c.ellipse(cx, cy + 1, r * 0.34, r * 0.28, 0, 0, TAU); c.fill(); c.strokeStyle = INK; c.lineWidth = 1.3; c.stroke(); c.beginPath(); c.arc(cx + r * 0.22, cy - r * 0.18, r * 0.17, 0, TAU); c.fill(); c.stroke(); c.fillStyle = '#e8801a'; c.fillRect(cx + r * 0.36, cy - r * 0.2, 4, 2.4); c.fillStyle = INK; c.fillRect(cx + r * 0.25, cy - r * 0.26, 1.6, 1.6); },
  crown: (c, cx, cy, r) => { c.fillStyle = '#d9b24a'; c.beginPath(); c.moveTo(cx - r * 0.7, cy + r * 0.4); c.lineTo(cx - r * 0.7, cy - r * 0.3); c.lineTo(cx - r * 0.35, cy); c.lineTo(cx, cy - r * 0.5); c.lineTo(cx + r * 0.35, cy); c.lineTo(cx + r * 0.7, cy - r * 0.3); c.lineTo(cx + r * 0.7, cy + r * 0.4); c.closePath(); c.fill(); c.strokeStyle = INK; c.lineWidth = 1.5; c.stroke(); c.fillStyle = '#b4324a'; c.fillRect(cx - 2, cy - 1, 4, 4); c.fillStyle = '#3e6fb0'; c.fillRect(cx - r * 0.5, cy + 1, 3, 3); c.fillRect(cx + r * 0.4, cy + 1, 3, 3); },
  coins: (c, cx, cy, r) => { coin(c, cx - r * 0.3, cy + r * 0.1, r * 0.3); coin(c, cx + r * 0.25, cy - r * 0.1, r * 0.3); coin(c, cx, cy + r * 0.35, r * 0.28); },
  sword: (c, cx, cy, r) => { c.save(); c.translate(cx, cy); c.rotate(0.9); c.fillStyle = '#d0d6de'; c.fillRect(-r * 0.9, -2.5, r * 1.6, 5); c.beginPath(); c.moveTo(r * 0.7, -2.5); c.lineTo(r * 1.05, 0); c.lineTo(r * 0.7, 2.5); c.fill(); c.strokeStyle = INK; c.lineWidth = 1.3; c.strokeRect(-r * 0.9, -2.5, r * 1.6, 5); c.fillStyle = BRASS; c.fillRect(-r * 1.0, -6, 4, 12); c.strokeRect(-r * 1.0, -6, 4, 12); c.restore(); },
  helm: (c, cx, cy, r) => { c.fillStyle = '#b8bec8'; c.beginPath(); c.arc(cx, cy, r * 0.55, 0, TAU); c.fill(); c.strokeStyle = INK; c.lineWidth = 1.6; c.stroke(); c.fillStyle = INK; c.fillRect(cx - r * 0.4, cy - 1, r * 0.8, 3); c.fillStyle = '#8a2e3c'; c.fillRect(cx - 2, cy - r * 0.55, 4, r * 0.4); },
  shield: (c, cx, cy, r) => { c.fillStyle = '#2a3b66'; c.beginPath(); c.moveTo(cx - r * 0.5, cy - r * 0.5); c.lineTo(cx + r * 0.5, cy - r * 0.5); c.lineTo(cx + r * 0.5, cy + r * 0.1); c.lineTo(cx, cy + r * 0.7); c.lineTo(cx - r * 0.5, cy + r * 0.1); c.closePath(); c.fill(); c.strokeStyle = INK; c.lineWidth = 1.6; c.stroke(); c.fillStyle = '#d9b24a'; c.fillRect(cx - 2, cy - r * 0.4, 4, r * 0.8); c.fillRect(cx - r * 0.3, cy - 2, r * 0.6, 4); },
  shell: (c, cx, cy, r) => { c.fillStyle = '#e8a0b0'; c.beginPath(); c.moveTo(cx, cy + r * 0.6); for (let k = 0; k <= 6; k++) { const a = Math.PI + (k / 6) * Math.PI; c.lineTo(cx + Math.cos(a) * r * 0.7, cy + r * 0.2 + Math.sin(a) * r * 0.8); } c.closePath(); c.fill(); c.strokeStyle = INK; c.lineWidth = 1.5; c.stroke(); c.strokeStyle = '#b86a7a'; c.lineWidth = 1.2; c.beginPath(); for (let k = 1; k < 6; k++) { const a = Math.PI + (k / 6) * Math.PI; c.moveTo(cx, cy + r * 0.6); c.lineTo(cx + Math.cos(a) * r * 0.7, cy + r * 0.2 + Math.sin(a) * r * 0.8); } c.stroke(); },
  fish: (c, cx, cy, r) => { c.fillStyle = '#e8a03a'; c.beginPath(); c.ellipse(cx - r * 0.1, cy, r * 0.55, r * 0.28, 0, 0, TAU); c.fill(); c.beginPath(); c.moveTo(cx + r * 0.35, cy); c.lineTo(cx + r * 0.75, cy - r * 0.3); c.lineTo(cx + r * 0.75, cy + r * 0.3); c.fill(); c.strokeStyle = INK; c.lineWidth = 1.4; c.stroke(); c.fillStyle = INK; c.fillRect(cx - r * 0.45, cy - 2, 2, 2); },
  cake: (c, cx, cy, r) => { c.fillStyle = '#f4ecd8'; c.beginPath(); c.arc(cx, cy, r * 0.55, 0, TAU); c.fill(); c.strokeStyle = INK; c.lineWidth = 1.5; c.stroke(); c.fillStyle = '#b4524a'; c.beginPath(); c.arc(cx, cy, r * 0.3, 0, TAU); c.fill(); c.fillStyle = '#d9541f'; c.beginPath(); c.arc(cx, cy, r * 0.1, 0, TAU); c.fill(); },
  meteor: (c, cx, cy, r) => { c.fillStyle = '#4a4650'; c.beginPath(); for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU; c.lineTo(cx + Math.cos(a) * r * (0.5 + 0.2 * ((k * 3) % 2)), cy + Math.sin(a) * r * (0.5 + 0.2 * ((k * 3) % 2))); } c.closePath(); c.fill(); c.strokeStyle = INK; c.lineWidth = 1.5; c.stroke(); c.fillStyle = '#9a8cff'; c.fillRect(cx - 3, cy - 2, 3, 2); c.fillStyle = '#c0b6a0'; c.fillRect(cx + 2, cy + 2, 3, 2); },
  tusk: (c, cx, cy, r) => { c.strokeStyle = INK; c.lineWidth = 8; c.lineCap = 'round'; c.beginPath(); c.arc(cx - r * 0.3, cy + r * 0.4, r * 0.9, -1.3, -0.2); c.stroke(); c.strokeStyle = '#efe6cc'; c.lineWidth = 5; c.beginPath(); c.arc(cx - r * 0.3, cy + r * 0.4, r * 0.9, -1.3, -0.2); c.stroke(); c.lineCap = 'butt'; },
  bone: (c, cx, cy, r) => { c.save(); c.translate(cx, cy); c.rotate(-0.5); c.fillStyle = BONE; c.fillRect(-r * 0.6, -3, r * 1.2, 6); for (const dx of [-1, 1]) for (const dy of [-1, 1]) { c.beginPath(); c.arc(dx * r * 0.62, dy * 3, 3.4, 0, TAU); c.fill(); } c.strokeStyle = INK; c.lineWidth = 1.3; c.strokeRect(-r * 0.6, -3, r * 1.2, 6); c.restore(); },
  toy: (c, cx, cy, r) => { c.fillStyle = '#6b9a5a'; c.beginPath(); c.ellipse(cx, cy, r * 0.5, r * 0.3, 0, 0, TAU); c.fill(); c.strokeStyle = INK; c.lineWidth = 1.5; c.stroke(); c.fillStyle = '#b4524a'; for (const dx of [-0.25, 0, 0.25]) c.fillRect(cx + dx * r - 1.5, cy - r * 0.42, 3, 3); c.fillStyle = '#e8c13a'; c.fillRect(cx + r * 0.4, cy - 3, 5, 5); },
  box: (c, cx, cy, r) => { c.fillStyle = ['#e8dfc6', '#7a2e3a', '#3e8fa8'][Math.abs(Math.round(cx + cy)) % 3]!; c.fillRect(cx - r * 0.5, cy - r * 0.4, r, r * 0.8); c.strokeStyle = INK; c.lineWidth = 1.5; c.strokeRect(cx - r * 0.5, cy - r * 0.4, r, r * 0.8); c.fillStyle = BRASS; c.fillRect(cx - r * 0.5, cy - 1, r, 2.4); },
  tool: (c, cx, cy, r) => { c.strokeStyle = INK; c.lineWidth = 4.6; c.lineCap = 'round'; c.beginPath(); c.moveTo(cx - r * 0.6, cy + r * 0.3); c.lineTo(cx + r * 0.5, cy - r * 0.4); c.stroke(); c.strokeStyle = '#c9a36a'; c.lineWidth = 2.6; c.stroke(); c.lineCap = 'butt'; c.fillStyle = '#9aa0a8'; c.fillRect(cx + r * 0.38, cy - r * 0.56, 6, 4); },
  blob: (c, cx, cy, r) => { c.fillStyle = ['#e0705a', '#3e8fa8', '#e8c13a'][Math.abs(Math.round(cx * 3 + cy)) % 3]!; c.beginPath(); for (let k = 0; k < 7; k++) { const a = (k / 7) * TAU; c.lineTo(cx + Math.cos(a) * r * (0.45 + 0.25 * ((k * 5) % 3) / 2), cy + Math.sin(a) * r * (0.45 + 0.25 * ((k * 5) % 3) / 2)); } c.closePath(); c.fill(); c.strokeStyle = INK; c.lineWidth = 1.6; c.stroke(); },
};
const bust: Artifact = (c, cx, cy, r) => { c.fillStyle = '#ece5d2'; c.beginPath(); c.ellipse(cx, cy + r * 0.3, r * 0.5, r * 0.28, 0, 0, TAU); c.fill(); c.strokeStyle = INK; c.lineWidth = 1.5; c.stroke(); c.beginPath(); c.arc(cx, cy - r * 0.1, r * 0.3, 0, TAU); c.fill(); c.stroke(); };
const gemOf = (col: string): Artifact => (c, cx, cy, r) => { c.fillStyle = col; c.beginPath(); for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + 0.5; c.lineTo(cx + Math.cos(a) * r * 0.6, cy + Math.sin(a) * r * 0.6); } c.closePath(); c.fill(); c.strokeStyle = INK; c.lineWidth = 1.5; c.stroke(); c.fillStyle = 'rgba(255,255,255,0.65)'; c.beginPath(); c.moveTo(cx - r * 0.3, cy - r * 0.35); c.lineTo(cx + r * 0.1, cy - r * 0.4); c.lineTo(cx - r * 0.1, cy); c.closePath(); c.fill(); };
const SETS: Partial<Record<DistrictId, { items: readonly Artifact[]; bed: string; glass: string }>> = {
  egypt: { items: [ARTIFACTS[1]!, EXTRA.scarab!, ARTIFACTS[2]!, ARTIFACTS[6]!], bed: '#3a2c1a', glass: '176, 218, 222' },
  gems: { items: [gemOf('#3e6fb0'), gemOf('#8a4ab0'), gemOf('#3a9a7a'), gemOf('#4ab0d0')], bed: '#0c1430', glass: '120, 170, 255' },
  treasury: { items: [EXTRA.crown!, EXTRA.coins!, gemOf('#b4324a'), ARTIFACTS[1]!], bed: '#6a1c28', glass: '255, 200, 160' },
  armour: { items: [EXTRA.sword!, EXTRA.helm!, EXTRA.shield!, ARTIFACTS[6]!], bed: '#2c2420', glass: '190, 200, 215' },
  impress: { items: [ARTIFACTS[2]!, bust, ARTIFACTS[0]!], bed: '#26304a', glass: '176, 218, 222' },
  modern: { items: [EXTRA.blob!], bed: '#f0eee8', glass: '210, 230, 255' },
  sculpt: { items: [bust, ARTIFACTS[2]!], bed: '#2c2420', glass: '176, 218, 222' },
  shop: { items: [EXTRA.box!, EXTRA.toy!], bed: '#e8dfc6', glass: '210, 230, 235' },
  cafe: { items: [EXTRA.cake!], bed: '#e8dfc6', glass: '255, 240, 210' },
  iceage: { items: [EXTRA.tusk!, ARTIFACTS[4]!, EXTRA.bone!, ARTIFACTS[5]!], bed: '#22303c', glass: '190, 225, 250' },
  space: { items: [EXTRA.meteor!], bed: '#12163a', glass: '170, 160, 255' },
  oceans: { items: [EXTRA.shell!, EXTRA.fish!, ARTIFACTS[5]!], bed: '#173a40', glass: '150, 235, 230' },
  lab: { items: [EXTRA.tool!, EXTRA.bone!], bed: '#bdb7a4', glass: '230, 230, 220' },
  kids: { items: [EXTRA.toy!], bed: '#c0983c', glass: '255, 240, 200' },
};
const BEDS = ['#5a2431', '#26304a', '#2c2420'] as const;

function paintVitrine(ctx: CanvasRenderingContext2D, s: Solid) {
  const { x, y, w, h } = s, face = FACE.vitrine;
  shell(ctx, s, BRASS, '#5f8087', face, () => {
    // A glass front over a walnut base, one bright glint across it.
    ctx.fillStyle = '#6d9599';
    ctx.fillRect(x + 2, y + h + 2, w - 4, face - 9);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.34)';
    for (let gx = x + 10; gx < x + w - 6; gx += 46) { ctx.beginPath(); ctx.moveTo(gx, y + h + 2); ctx.lineTo(gx + 9, y + h + 2); ctx.lineTo(gx + 3, y + h + face - 7); ctx.lineTo(gx - 6, y + h + face - 7); ctx.closePath(); ctx.fill(); }
    ctx.fillStyle = '#3a2b22';
    ctx.fillRect(x, y + h + face - 7, w, 7);
    ctx.fillStyle = BRASS;
    ctx.fillRect(x, y + h + face - 8, w, 1.5);
  }, () => {
    const rand = seeded(hash(x, y));
    const set = SETS[districtAt(x + w / 2, y + h / 2).id];
    const inset = 5, bx = x + inset, by = y + inset, bw = w - inset * 2, bh = h - inset * 2;
    ctx.fillStyle = set?.bed ?? BEDS[hash(x, y) % BEDS.length]!;
    ctx.fillRect(bx, by, bw, bh);
    const horiz = w >= h, along = horiz ? bw : bh, across = horiz ? bh : bw;
    const slot = Math.max(across, 46), n = Math.max(1, Math.round(along / slot));
    const r = Math.min(across, slot) * 0.36;
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const cx = horiz ? bx + bw * t : bx + bw / 2, cy = horiz ? by + bh / 2 : by + bh * t;
      const pool = set?.items ?? ARTIFACTS;
      // The egyptologists' joke: one case holds a very small rubber duck.
      const art = x === 650 && y === 1450 && i === 3 ? EXTRA.duck! : pool[Math.floor(rand() * pool.length)]!;
      art(ctx, cx, cy, r);
    }
    // Glass over it all: a faint wash, two diagonal glints and a bright corner.
    ctx.fillStyle = `rgba(${set?.glass ?? '176, 218, 222'}, 0.26)`;
    ctx.fillRect(bx, by, bw, bh);
    // The treasury's case has been cut open: a round hole, glass on the bed and a suction cup left behind.
    if (x === 3750 && y === 5200) {
      ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(x + w / 2, y + 30, 13, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(210, 240, 245, 0.85)'; for (const [dx, dy] of [[-10, 8], [8, 6], [14, -4], [-16, -8], [2, 18]] as const) { ctx.beginPath(); ctx.moveTo(x + w / 2 + dx, y + 30 + dy); ctx.lineTo(x + w / 2 + dx + 5, y + 30 + dy + 2); ctx.lineTo(x + w / 2 + dx + 1, y + 30 + dy + 6); ctx.closePath(); ctx.fill(); }
      ctx.fillStyle = '#b4324a'; ctx.beginPath(); ctx.arc(x + w / 2 + 16, y + 52, 6, 0, TAU); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.stroke();
    }
    ctx.save();
    ctx.beginPath(); ctx.rect(bx, by, bw, bh); ctx.clip();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.34)';
    for (let g = 0; g < Math.max(bw, bh) + 60; g += 70) { ctx.beginPath(); ctx.moveTo(bx + g, by); ctx.lineTo(bx + g + 12, by); ctx.lineTo(bx + g - 40 + 12, by + 60); ctx.lineTo(bx + g - 40, by + 60); ctx.closePath(); ctx.fill(); }
    ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
    for (let g = 30; g < Math.max(bw, bh) + 60; g += 70) { ctx.beginPath(); ctx.moveTo(bx + g, by); ctx.lineTo(bx + g + 5, by); ctx.lineTo(bx + g - 35 + 5, by + 60); ctx.lineTo(bx + g - 35, by + 60); ctx.closePath(); ctx.fill(); }
    ctx.restore();
    ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.strokeRect(bx, by, bw, bh);
    // A brass placard on the near rail.
    if (w >= 40) { ctx.fillStyle = BRASS_HI; ctx.fillRect(x + w / 2 - 7, y + h - 4.5, 14, 3); }
  });
}

/* -- the dinosaur plinths --------------------------------------------------------------------------------------- */

type Pen = { stroke: (pts: readonly (readonly [number, number])[], w: number) => void; blob: (cx: number, cy: number, rx: number, ry: number, rot?: number) => void; poly: (pts: readonly (readonly [number, number])[]) => void; hole: (cx: number, cy: number, rx: number, ry: number) => void };

/** A pen for bones: one pass lays the soft shadow, the next the ink outline under bone, so a skeleton reads as one object. */
function bonePen(ctx: CanvasRenderingContext2D, ox: number, oy: number, mode: 'shadow' | 'bone'): Pen {
  const line = (pts: readonly (readonly [number, number])[], w: number, color: string) => {
    ctx.strokeStyle = color; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(ox + x, oy + y) : ctx.moveTo(ox + x, oy + y))); ctx.stroke();
  };
  const ell = (cx: number, cy: number, rx: number, ry: number, rot: number) => { ctx.beginPath(); ctx.ellipse(ox + cx, oy + cy, rx, ry, rot, 0, TAU); };
  return {
    stroke: (pts, w) => {
      if (mode === 'shadow') line(pts.map(([x, y]) => [x + 4, y + 5] as const), w + 3, 'rgba(20, 24, 32, 0.3)');
      else { line(pts, w + 3.5, INK); line(pts, w, BONE); line(pts.map(([x, y]) => [x - w * 0.12, y - w * 0.18] as const), w * 0.32, 'rgba(255, 255, 255, 0.55)'); }
    },
    blob: (cx, cy, rx, ry, rot = 0) => {
      if (mode === 'shadow') { ctx.fillStyle = 'rgba(20, 24, 32, 0.3)'; ell(cx + 4, cy + 5, rx, ry, rot); ctx.fill(); return; }
      ctx.fillStyle = BONE; ell(cx, cy, rx, ry, rot); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = BONE_SHADE; ctx.beginPath(); ctx.ellipse(ox + cx + rx * 0.2, oy + cy + ry * 0.35, rx * 0.7, ry * 0.5, rot, 0, Math.PI); ctx.fill();
    },
    poly: (pts) => {
      ctx.beginPath(); pts.forEach(([x, y], i) => { const px = ox + x + (mode === 'shadow' ? 4 : 0), py = oy + y + (mode === 'shadow' ? 5 : 0); if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); }); ctx.closePath();
      if (mode === 'shadow') { ctx.fillStyle = 'rgba(20, 24, 32, 0.3)'; ctx.fill(); return; }
      ctx.fillStyle = BONE; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.stroke();
    },
    hole: (cx, cy, rx, ry) => { if (mode === 'shadow') return; ctx.fillStyle = INK; ell(cx, cy, rx, ry, 0); ctx.fill(); },
  };
}

const mirror = (pts: readonly (readonly [number, number])[], cy: number) => pts.map(([x, y]) => [x, 2 * cy - y] as const);

/** A tyrannosaur on its plinth, nose east: tail, hips and legs, ribcage, tiny arms and a long skull. `u` runs along the plinth, `v` across. */
function tyrannosaur(pen: Pen) {
  const cy = 125;
  const spine: [number, number][] = [[28, 130], [90, 126], [160, 122], [230, 119], [300, 118], [380, 113], [440, 108], [470, 107]];
  pen.stroke(spine, 7);
  // Tail vertebrae and the ribcage over the spine.
  for (let u = 30; u < 230; u += 14) pen.blob(u, 130 - (u - 30) * 0.05, 3 + (u - 30) / 60, 3 + (u - 30) / 60);
  for (let i = 0; i < 8; i++) {
    const u = 296 + i * 14, len = 46 - Math.abs(i - 2.5) * 5;
    for (const side of [-1, 1]) pen.stroke([[u, 118], [u - 5, 118 + side * len * 0.55], [u - 16, 118 + side * len]], 4.4);
  }
  pen.stroke([[296, 118], [296 + 7 * 14, 112]], 6);
  // Pelvis and the two hind legs, thigh out then shin back, with a three-toed foot.
  pen.blob(236, 120, 26, 32);
  for (const side of [-1, 1]) {
    pen.stroke([[240, 120 + side * 20], [276, 120 + side * 56], [226, 120 + side * 84]], 9);
    pen.stroke([[226, 120 + side * 84], [262, 120 + side * 92]], 5);
    pen.stroke([[226, 120 + side * 84], [264, 120 + side * 84]], 5);
    pen.stroke([[226, 120 + side * 84], [262, 120 + side * 76]], 5);
  }
  // Small arms.
  for (const side of [-1, 1]) pen.stroke([[348, 118 + side * 20], [372, 118 + side * 32], [388, 118 + side * 28]], 4);
  // The skull: a long wedge with eye sockets, nostrils and a jaw line.
  pen.poly([[452, 100], [482, 90], [520, 98], [546, 111], [547, 125], [520, 134], [484, 140], [452, 130]]);
  for (const side of [-1, 1]) { pen.hole(480, cy + side * 28, 8, 5.5); pen.hole(534, cy + side * 5, 2.4, 2); }
  pen.stroke([[462, 118], [540, 118]], 1.4);
  void mirror;
}

/** A triceratops, nose west: a horned skull and a frilled shield, a barrel of ribs on four stout legs and a short tail. */
function triceratops(pen: Pen) {
  const cy = 125;
  pen.stroke([[180, 125], [260, 125], [350, 125], [420, 125], [470, 126], [520, 128]], 8);
  for (let u = 470; u < 536; u += 13) pen.blob(u, 126 + (u - 470) * 0.03, 5 - (u - 470) / 22, 5 - (u - 470) / 22);
  for (let i = 0; i < 10; i++) {
    const u = 196 + i * 17, len = 62 - Math.abs(i - 4) * 4;
    for (const side of [-1, 1]) pen.stroke([[u, 125], [u + 2, 125 + side * len * 0.6], [u - 10, 125 + side * len]], 5);
  }
  pen.blob(412, 125, 24, 38);
  for (const [u, side] of [[222, -1], [222, 1], [418, -1], [418, 1]] as const) {
    pen.stroke([[u, 125 + side * 40], [u + (u < 300 ? 8 : -6), 125 + side * 78]], 11);
    pen.blob(u + (u < 300 ? 14 : -4), 125 + side * 86, 13, 8);
  }
  // The frill: a scalloped fan with two open windows, then the skull, brow horns, nose horn and beak.
  const frill: [number, number][] = [];
  for (let a = -92; a <= 92; a += 12) {
    const t = (a * Math.PI) / 180, bump = (a / 12) % 2 === 0 ? 1 : 0.92;
    frill.push([164 + Math.cos(t) * 30 * bump, cy + Math.sin(t) * 104 * bump]);
  }
  pen.poly([...frill, [130, cy + 54], [130, cy - 54]]);
  for (const side of [-1, 1]) pen.hole(158, cy + side * 52, 10, 20);
  pen.poly([[132, 92], [118, 100], [52, 112], [34, 122], [34, 128], [52, 138], [118, 150], [132, 158]]);
  for (const side of [-1, 1]) {
    pen.poly([[118, cy + side * 28], [112, cy + side * 40], [54, cy + side * 62], [58, cy + side * 50], [96, cy + side * 28]]);
    pen.hole(100, cy + side * 24, 6, 5);
  }
  pen.poly([[54, 119], [34, 125], [54, 131]]);
}

function paintPlinth(ctx: CanvasRenderingContext2D, s: Solid) {
  const { x, y, w, h } = s, face = FACE.plinth;
  shell(ctx, s, '#b0a07c', '#7d6f55', face, () => {
    // Two stone steps and a brass plaque on the front.
    ctx.fillStyle = '#6c5f48';
    ctx.fillRect(x, y + h + 9, w, 2);
    ctx.fillStyle = '#8f8062';
    ctx.fillRect(x, y + h + 11, w, face - 15);
    ctx.fillStyle = BRASS;
    ctx.fillRect(x + w / 2 - 34, y + h + 4, 68, 9);
    ctx.fillStyle = BRASS_HI;
    ctx.fillRect(x + w / 2 - 34, y + h + 4, 68, 2);
    ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.strokeRect(x + w / 2 - 34, y + h + 4, 68, 9);
    ctx.fillStyle = 'rgba(28, 31, 38, 0.6)';
    for (let i = 0; i < 6; i++) ctx.fillRect(x + w / 2 - 28 + i * 10, y + h + 7.5, 6, 2);
  }, () => {
    ctx.fillStyle = '#a69670';
    ctx.fillRect(x + 8, y + 8, w - 16, h - 16);
    ctx.strokeStyle = BRASS; ctx.lineWidth = 3; ctx.strokeRect(x + 8, y + 8, w - 16, h - 16);
    ctx.strokeStyle = 'rgba(60, 50, 34, 0.35)'; ctx.lineWidth = 1.5; ctx.strokeRect(x + 14, y + 14, w - 28, h - 28);
    const west = x + w / 2 < 3000, ox = x + (w - 550) / 2, oy = y + (h - 250) / 2;
    for (const mode of ['shadow', 'bone'] as const) (west ? tyrannosaur : triceratops)(bonePen(ctx, ox, oy, mode));
    // Somebody has given the triceratops a party hat.
    if (!west) {
      ctx.save(); ctx.translate(ox + 100, oy + 106); ctx.rotate(-0.5);
      ctx.fillStyle = '#d9541f'; ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(8, 0); ctx.lineTo(0, -21); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = INK; ctx.lineWidth = 1.6; ctx.stroke();
      ctx.fillStyle = '#e8dfc6'; ctx.fillRect(-5, -7, 10, 2.4); ctx.fillRect(-3, -13, 6, 2.2);
      ctx.fillStyle = '#4a9ac0'; ctx.beginPath(); ctx.arc(0, -22, 3.6, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.restore();
    }
    ctx.lineCap = 'butt'; ctx.lineJoin = 'miter';
  });
}

/* -- shop counter ----------------------------------------------------------------------------------------------- */

function paintBench(ctx: CanvasRenderingContext2D, s: Solid) {
  const { x, y, w, h } = s, face = FACE.counter;
  shell(ctx, s, '#b8a582', '#8a7752', face, () => {
    ctx.strokeStyle = 'rgba(30, 24, 14, 0.5)'; ctx.lineWidth = 1.5;
    for (let px = x + 30; px < x + w - 10; px += 60) { ctx.beginPath(); ctx.moveTo(px, y + h + 3); ctx.lineTo(px, y + h + face - 3); ctx.stroke(); }
    ctx.fillStyle = '#6a5a3e'; ctx.fillRect(x, y + h + face - 5, w, 5);
  }, () => {
    const rand = seeded(hash(x, y));
    ctx.fillStyle = '#c8b894'; ctx.fillRect(x + 4, y + 4, w - 8, h - 8);
    const along = Math.max(w, h), horiz = w >= h;
    for (let t = 24; t < along - 14; t += 46) {
      const px = horiz ? x + t : x + w / 2, py = horiz ? y + h / 2 : y + t, k = rand();
      if (k < 0.3) { ctx.fillStyle = '#e8e2d0'; ctx.fillRect(px - 9, py - 7, 18, 14); ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.strokeRect(px - 9, py - 7, 18, 14); ctx.fillStyle = 'rgba(30,30,40,0.5)'; ctx.fillRect(px - 6, py - 3, 12, 1); ctx.fillRect(px - 6, py, 9, 1); }
      else if (k < 0.65) { ctx.fillStyle = '#7a8a9a'; ctx.beginPath(); ctx.arc(px, py, 7, 0, TAU); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.stroke(); ctx.strokeStyle = '#d9541f'; ctx.lineWidth = 1.6; for (let b = -1; b <= 1; b++) { ctx.beginPath(); ctx.moveTo(px + b * 2.5, py); ctx.lineTo(px + b * 3.5, py - 11); ctx.stroke(); } }
      else { ctx.fillStyle = '#6fb0c0'; ctx.fillRect(px - 3, py - 8, 6, 16); ctx.strokeStyle = INK; ctx.lineWidth = 1.4; ctx.strokeRect(px - 3, py - 8, 6, 16); }
    }
  });
}

function paintCounterOf(ctx: CanvasRenderingContext2D, s: Solid) {
  if (districtAt(s.x + s.w / 2, s.y + s.h / 2).id === 'lab') paintBench(ctx, s); else paintCounter(ctx, s);
}

function paintCounter(ctx: CanvasRenderingContext2D, s: Solid) {
  const { x, y, w, h } = s, face = FACE.counter;
  shell(ctx, s, '#8a5a34', '#55371f', face, () => {
    ctx.strokeStyle = 'rgba(20, 12, 6, 0.5)'; ctx.lineWidth = 1.5;
    for (let px = x + 18; px < x + w - 6; px += 36) { ctx.beginPath(); ctx.moveTo(px, y + h + 3); ctx.lineTo(px, y + h + face - 6); ctx.stroke(); }
    ctx.fillStyle = BRASS; ctx.fillRect(x, y + h + face - 6, w, 3);
  }, () => {
    const rand = seeded(hash(x, y));
    ctx.fillStyle = '#9a6a3e';
    if (w >= h) ctx.fillRect(x + 4, y + 4, w - 8, 5); else ctx.fillRect(x + 4, y + 4, 5, h - 8);
    ctx.strokeStyle = 'rgba(40, 22, 10, 0.4)'; ctx.lineWidth = 1.2;
    ctx.beginPath();
    if (w >= h) { ctx.moveTo(x + 6, y + h / 2); ctx.lineTo(x + w - 6, y + h / 2); } else { ctx.moveTo(x + w / 2, y + 6); ctx.lineTo(x + w / 2, y + h - 6); }
    ctx.stroke();
    // Brass edge on the lit side.
    ctx.fillStyle = hexA(BRASS_HI, 0.8);
    ctx.fillRect(x + 1, y + 1, w >= h ? w - 2 : 2, w >= h ? 2 : h - 2);
    // Merchandise: boxed souvenirs and a plush stegosaur, and once in a while a till.
    const slots = Math.floor((Math.max(w, h) - 16) / 34);
    for (let i = 0; i < slots; i++) {
      const t = 8 + 17 + i * 34, px = w >= h ? x + t : x + w / 2, py = w >= h ? y + h / 2 : y + t;
      const k = rand();
      if (k < 0.2 && Math.min(w, h) >= 36) { ctx.fillStyle = '#2f343c'; ctx.fillRect(px - 9, py - 8, 18, 14); ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.strokeRect(px - 9, py - 8, 18, 14); ctx.fillStyle = '#6fd3a0'; ctx.fillRect(px - 6, py - 5, 12, 5); }
      else if (k < 0.5) { ctx.fillStyle = ['#e8dfc6', '#7a2e3a', '#4a7a86'][Math.floor(rand() * 3)]!; ctx.fillRect(px - 8, py - 6, 16, 12); ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.strokeRect(px - 8, py - 6, 16, 12); ctx.fillStyle = BRASS; ctx.fillRect(px - 8, py - 1, 16, 2); }
      else if (k < 0.75) { ctx.fillStyle = '#6b7a3e'; ctx.beginPath(); ctx.ellipse(px, py, 11, 7, 0, 0, TAU); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.stroke(); ctx.fillStyle = '#b4524a'; for (const dx of [-5, 0, 5]) ctx.fillRect(px + dx - 1.5, py - 8, 3, 3); }
    }
  });
}


export const MUSEUM_WALLS = { gallery: paintGallery, marble: paintMarble, vitrine: paintVitrine, plinth: paintPlinth, counter: paintCounterOf } as const;
