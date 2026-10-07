import { blotch, seeded } from '../grain.ts';
import { C, SIZE, TAU, ell, hash, hexA, rr, shade, type G } from './summitkit.ts';

/**
 * Painting primitives for Summit's floors and walls: floorboards, tile, rugs, stains, and the half-turn trick every paired
 * site uses. `both` draws a west-half painter once as it stands and once turned half a turn about the centre of the map,
 * handing it `v` (0 for the original, 1 for the twin) so it can dress the twin as a different place.
 */

export type Variant = 0 | 1;

/** Runs `fn` for the west original, then again under a half turn for the east twin. */
export function both(g: G, fn: (g: G, v: Variant) => void): void {
  fn(g, 0);
  g.save();
  g.translate(SIZE, SIZE);
  g.rotate(Math.PI);
  fn(g, 1);
  g.restore();
}

/** Text at a west-half point that reads upright in either variant. */
export function label(g: G, v: Variant, text: string, x: number, y: number, size: number, color: string, opts: { rot?: number; spacing?: number; align?: CanvasTextAlign } = {}) {
  g.save();
  g.translate(x, y);
  if (v) g.rotate(Math.PI);
  if (opts.rot) g.rotate(opts.rot);
  g.fillStyle = color;
  g.font = `700 ${size}px "Barlow Condensed", "Arial Narrow", sans-serif`;
  g.textAlign = opts.align ?? 'center';
  g.textBaseline = 'middle';
  (g as unknown as { letterSpacing: string }).letterSpacing = `${opts.spacing ?? 3}px`;
  g.fillText(text, 0, 0);
  (g as unknown as { letterSpacing: string }).letterSpacing = '0px';
  g.restore();
}

/** Boards laid across a rect, each a shade of the base, with the gaps between them and the odd nail head. */
export function planks(g: G, x: number, y: number, w: number, h: number, opts: { base?: string; hi?: string; lo?: string; board?: number; vertical?: boolean; seed?: number; seam?: string; nails?: boolean } = {}) {
  const base = opts.base ?? C.plank, hi = opts.hi ?? C.plankHi, lo = opts.lo ?? C.plankLo, bw = opts.board ?? 22, seed = opts.seed ?? 1;
  const n = Math.ceil((opts.vertical ? w : h) / bw);
  g.save();
  g.beginPath(); g.rect(x, y, w, h); g.clip();
  for (let i = 0; i < n; i++) {
    const k = hash(seed, i, 4);
    g.fillStyle = k > 0.7 ? hi : k < 0.28 ? lo : base;
    const off = i * bw;
    if (opts.vertical) g.fillRect(x + off, y, bw - 1, h); else g.fillRect(x, y + off, w, bw - 1);
    // Butt joints: each board is a few lengths, staggered.
    const L = 150 + hash(seed, i, 9) * 130;
    g.fillStyle = 'rgba(20, 12, 6, 0.55)';
    for (let s = hash(seed, i, 2) * L; s < (opts.vertical ? h : w); s += L) { if (opts.vertical) g.fillRect(x + off, y + s, bw - 1, 1.6); else g.fillRect(x + s, y + off, 1.6, bw - 1); }
    if (opts.nails !== false && i % 2 === 0) {
      g.fillStyle = 'rgba(20, 14, 10, 0.45)';
      for (let s = 12 + hash(seed, i, 6) * 60; s < (opts.vertical ? h : w); s += L) { if (opts.vertical) g.fillRect(x + off + bw / 2 - 1, y + s, 2, 2); else g.fillRect(x + s, y + off + bw / 2 - 1, 2, 2); }
    }
  }
  g.fillStyle = opts.seam ?? 'rgba(18, 10, 6, 0.55)';
  for (let i = 1; i < n; i++) { if (opts.vertical) g.fillRect(x + i * bw - 1, y, 1.4, h); else g.fillRect(x, y + i * bw - 1, w, 1.4); }
  g.restore();
}

/** A chequered or plain tile floor with joints. */
export function tiles(g: G, x: number, y: number, w: number, h: number, T: number, a: string, b: string, joint: string, seed = 1, wear = 0.05) {
  g.save();
  g.beginPath(); g.rect(x, y, w, h); g.clip();
  for (let ty = y; ty < y + h; ty += T) for (let tx = x; tx < x + w; tx += T) {
    g.fillStyle = (((tx - x) / T + (ty - y) / T) & 1) === 1 ? b : a;
    g.fillRect(tx, ty, T, T);
    const k = (hash(seed, tx, ty) - 0.5) * wear * 2;
    g.fillStyle = k > 0 ? `rgba(255, 244, 220, ${k})` : `rgba(10, 8, 6, ${-k})`;
    g.fillRect(tx, ty, T, T);
  }
  g.strokeStyle = joint; g.lineWidth = 2; g.beginPath();
  for (let tx = x + T; tx < x + w; tx += T) { g.moveTo(tx, y); g.lineTo(tx, y + h); }
  for (let ty = y + T; ty < y + h; ty += T) { g.moveTo(x, ty); g.lineTo(x + w, ty); }
  g.stroke();
  g.restore();
}

/** Flagstones: irregular blocks laid in courses of varied length. */
export function flags(g: G, x: number, y: number, w: number, h: number, base: string, seed: number, joint = 'rgba(20, 24, 34, 0.7)') {
  g.save();
  g.beginPath(); g.rect(x, y, w, h); g.clip();
  g.fillStyle = base; g.fillRect(x, y, w, h);
  const rand = seeded(seed);
  let yy = y;
  while (yy < y + h) {
    const rh = 52 + rand() * 40;
    let xx = x - rand() * 60;
    while (xx < x + w) {
      const rw = 60 + rand() * 80;
      const k = (rand() - 0.5) * 0.1;
      g.fillStyle = k > 0 ? `rgba(255, 250, 240, ${k})` : `rgba(8, 10, 18, ${-k})`;
      g.fillRect(xx, yy, rw, rh);
      g.strokeStyle = joint; g.lineWidth = 2; g.strokeRect(xx + 0.5, yy + 0.5, rw - 1, rh - 1);
      xx += rw;
    }
    yy += rh;
  }
  g.restore();
}

export type RugPalette = { field: string; border: string; inner: string; motif: string };
export const RUGS: Record<string, RugPalette> = {
  lodge: { field: '#6a2a32', border: '#d8c9a0', inner: '#3b2a3e', motif: '#d8b25a' },
  forest: { field: '#34503f', border: '#d8c9a0', inner: '#233a2e', motif: '#c8a45a' },
  navy: { field: '#2c3b5c', border: '#d8c9a0', inner: '#1f2c46', motif: '#d8c9a0' },
  rust: { field: '#8a4a2e', border: '#e0cfa0', inner: '#5e3220', motif: '#e8d49a' },
};

/** A woollen rug: field, bands, a diamond lattice, a fringe. */
export function rug(g: G, x: number, y: number, w: number, h: number, pal: RugPalette, seed = 1) {
  g.save();
  g.fillStyle = 'rgba(10, 8, 6, 0.28)'; g.fillRect(x + 5, y + 6, w, h);
  g.fillStyle = pal.border; g.fillRect(x, y, w, h);
  g.fillStyle = pal.field; g.fillRect(x + 12, y + 12, w - 24, h - 24);
  g.strokeStyle = pal.motif; g.lineWidth = 3; g.strokeRect(x + 22, y + 22, w - 44, h - 44);
  g.fillStyle = pal.inner; g.fillRect(x + 34, y + 34, w - 68, h - 68);
  // Diamond lattice.
  g.save(); g.beginPath(); g.rect(x + 34, y + 34, w - 68, h - 68); g.clip();
  g.strokeStyle = hexA(pal.motif, 0.7); g.lineWidth = 2.4;
  const step = 44;
  for (let ix = -h; ix < w; ix += step) { g.beginPath(); g.moveTo(x + ix, y); g.lineTo(x + ix + h, y + h); g.moveTo(x + ix + h, y); g.lineTo(x + ix, y + h); g.stroke(); }
  g.fillStyle = hexA(pal.motif, 0.8);
  for (let ix = 0; ix < w; ix += step * 2) for (let iy = 0; iy < h; iy += step * 2) { g.beginPath(); g.moveTo(x + ix + step, y + iy); g.lineTo(x + ix + step * 1.4, y + iy + step * 0.4); g.lineTo(x + ix + step, y + iy + step * 0.8); g.lineTo(x + ix + step * 0.6, y + iy + step * 0.4); g.closePath(); g.fill(); }
  g.restore();
  g.fillStyle = 'rgba(255, 244, 220, 0.5)';
  for (let i = 0; i < w; i += 6) { g.fillRect(x + i, y - 5, 2, 5); g.fillRect(x + i, y + h, 2, 5); }
  for (let i = 0; i < h; i += 6) { g.fillRect(x - 5, y + i, 5, 2); g.fillRect(x + w, y + i, 5, 2); }
  g.strokeStyle = C.ink; g.lineWidth = 2; g.globalAlpha = 0.4; g.strokeRect(x, y, w, h); g.globalAlpha = 1;
  void seed;
  g.restore();
}

/** A dark oil or water stain with a ragged edge. */
export function stain(g: G, x: number, y: number, r: number, rgb: string, a: number, seed: number) {
  const rand = seeded(seed);
  for (let i = 0; i < 6; i++) blotch(g, x + (rand() - 0.5) * r * 0.8, y + (rand() - 0.5) * r * 0.6, r * (0.4 + rand() * 0.5), rgb, a);
}

/** A hazard stripe (diagonal bands) in a rect. */
export function hazard(g: G, x: number, y: number, w: number, h: number, a = '#2a2e36', b = '#d9a02a', band = 14) {
  g.save();
  g.beginPath(); g.rect(x, y, w, h); g.clip();
  g.fillStyle = a; g.fillRect(x, y, w, h);
  g.fillStyle = b;
  for (let i = -h; i < w + h; i += band * 2) { g.beginPath(); g.moveTo(x + i, y + h); g.lineTo(x + i + band, y + h); g.lineTo(x + i + band + h, y); g.lineTo(x + i + h, y); g.closePath(); g.fill(); }
  g.restore();
}

/** A bed seen from above: frame, mattress, blanket, pillow. */
export function bed(g: G, x: number, y: number, w: number, h: number, blanket: string, vertical = true) {
  g.save();
  g.fillStyle = 'rgba(10, 8, 6, 0.3)'; g.fillRect(x + 4, y + 5, w, h);
  g.fillStyle = C.logLo; g.fillRect(x, y, w, h);
  g.fillStyle = '#d8d0bc'; g.fillRect(x + 4, y + 4, w - 8, h - 8);
  g.fillStyle = blanket;
  if (vertical) { g.fillRect(x + 4, y + h * 0.36, w - 8, h * 0.6); g.fillStyle = shade(blanket, 0.25); g.fillRect(x + 4, y + h * 0.36, w - 8, 5); g.fillStyle = '#f0e8d8'; rr(g, x + 9, y + 9, w - 18, h * 0.22, 5); g.fill(); }
  else { g.fillRect(x + w * 0.36, y + 4, w * 0.6, h - 8); g.fillStyle = shade(blanket, 0.25); g.fillRect(x + w * 0.36, y + 4, 5, h - 8); g.fillStyle = '#f0e8d8'; rr(g, x + 9, y + 9, w * 0.22, h - 18, 5); g.fill(); }
  g.strokeStyle = C.ink; g.lineWidth = 2; g.strokeRect(x, y, w, h);
  g.restore();
}

/** A scatter of needles and twigs on the snow under trees. */
export function needles(g: G, x: number, y: number, w: number, h: number, count: number, seed: number) {
  const rand = seeded(seed);
  g.lineCap = 'round';
  for (let i = 0; i < count; i++) {
    const px = x + rand() * w, py = y + rand() * h, a = rand() * TAU, l = 4 + rand() * 7;
    g.strokeStyle = rand() < 0.7 ? 'rgba(34, 52, 44, 0.45)' : 'rgba(86, 62, 40, 0.4)'; g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(px, py); g.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l); g.stroke();
  }
}

/** A quiet round shadow under something that stands. */
export function contact(g: G, x: number, y: number, rx: number, ry: number) {
  g.fillStyle = 'rgba(10, 12, 18, 0.34)';
  ell(g, x + 3, y + 4, rx, ry); g.fill();
}
