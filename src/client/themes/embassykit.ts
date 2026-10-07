import { INK } from '../palette.ts';

/**
 * Small shared tools for the Embassy theme: palette, the republic's emblem and flag, rounded rects, lettering. The Embassy is a
 * small republic's mission abroad: navy, white and gold on its flag, brass on every fitting, marble and walnut inside, cool strip
 * lights in the modern Office Wing and warm lamps in the old Residence.
 */

export const TAU = Math.PI * 2;
export const BRASS = '#b79a4a';
export const BRASS_HI = '#d9c27a';
export const BRASS_LO = '#7a6630';
export const NAVY = '#2f4070';
export const NAVY_DK = '#1f2a4c';
export const CREAM = '#e8dfc6';
export const WALNUT = '#6b4a2c';
export const WALNUT_DK = '#4a321c';
export const WALNUT_HI = '#8a6238';
export const CRIMSON = '#8a2e3c';

export const hash = (a: number, b: number): number => (Math.imul(Math.round(a) | 0, 73856093) ^ Math.imul(Math.round(b) | 0, 19349663)) >>> 0;
export const hexA = (hex: string, a: number): string => {
  const v = parseInt(hex.slice(1), 16);
  return `rgba(${(v >> 16) & 255}, ${(v >> 8) & 255}, ${v & 255}, ${a})`;
};
export const mix = (hex: string, to: number, t: number): string => {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(v + (to - v) * t));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
};

export const reduced = (() => { try { return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } })();
/** Slow living touches freeze under reduced motion. */
export const clock = (now: number): number => (reduced ? 4000 : now);

export function rr(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  r = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
  g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r);
  g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y);
  g.closePath();
}

export const shadowEllipse = (g: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number): void => {
  g.fillStyle = 'rgba(14, 16, 22, 0.34)'; g.beginPath(); g.ellipse(x + 3, y + 3, rx, ry, 0, 0, TAU); g.fill();
};
export const inkRect = (g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, fill: string, lw = 1.8): void => {
  g.fillStyle = fill; g.fillRect(x, y, w, h); g.strokeStyle = INK; g.lineWidth = lw; g.strokeRect(x, y, w, h);
};
export const inkDisc = (g: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string, lw = 1.8): void => {
  g.fillStyle = fill; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); g.strokeStyle = INK; g.lineWidth = lw; g.stroke();
};
export const hiLine = (g: CanvasRenderingContext2D, x: number, y: number, w: number, a = 0.28): void => {
  g.fillStyle = `rgba(255, 255, 255, ${a})`; g.fillRect(x, y, w, 1.6);
};

type LetterG = CanvasRenderingContext2D & { letterSpacing: string };
export function lettering(g: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, color: string, opts: { rot?: number; alpha?: number; spacing?: number; shadow?: boolean; weight?: number; align?: CanvasTextAlign } = {}): void {
  g.save();
  g.translate(x, y);
  if (opts.rot) g.rotate(opts.rot);
  g.globalAlpha *= opts.alpha ?? 1;
  g.font = `${opts.weight ?? 700} ${size}px "Barlow Condensed", "Arial Narrow", sans-serif`;
  g.textAlign = opts.align ?? 'center'; g.textBaseline = 'middle';
  (g as LetterG).letterSpacing = `${Math.round(size * (opts.spacing ?? 0.2))}px`;
  if (opts.shadow !== false) { g.fillStyle = 'rgba(14, 12, 10, 0.5)'; g.fillText(text, 1.5, 2); }
  g.fillStyle = color; g.fillText(text, 0, 0);
  g.restore();
}

/** Text bent round a circle, centred on the angle `mid`. */
export function ringText(g: CanvasRenderingContext2D, text: string, cx: number, cy: number, r: number, mid: number, size: number, color: string, alpha = 1): void {
  g.save();
  g.globalAlpha *= alpha;
  g.font = `700 ${size}px "Barlow Condensed", "Arial Narrow", sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = color;
  const step = (size * 0.78) / r;
  const start = mid - (step * (text.length - 1)) / 2;
  for (let i = 0; i < text.length; i++) {
    const a = start + i * step;
    g.save(); g.translate(cx + Math.cos(a) * r, cy + Math.sin(a) * r); g.rotate(a + Math.PI / 2); g.fillText(text[i]!, 0, 0); g.restore();
  }
  g.restore();
}

export function star(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, points = 5, inner = 0.42, rot = -Math.PI / 2): void {
  g.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const a = rot + (i * Math.PI) / points, rad = i % 2 ? r * inner : r;
    g[i ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
  }
  g.closePath();
}

/** The republic's seal: a navy field ringed in gold, a gold star, two laurel branches. Drawn flat (a floor mosaic or a plaque). */
export function seal(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, opts: { ring?: string; field?: string; alpha?: number; text?: boolean } = {}): void {
  g.save();
  g.globalAlpha *= opts.alpha ?? 1;
  const gold = opts.ring ?? BRASS, field = opts.field ?? NAVY;
  g.fillStyle = gold; g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.fill();
  g.fillStyle = field; g.beginPath(); g.arc(cx, cy, r * 0.9, 0, TAU); g.fill();
  g.strokeStyle = gold; g.lineWidth = Math.max(1.5, r * 0.025); g.beginPath(); g.arc(cx, cy, r * 0.72, 0, TAU); g.stroke();
  // Laurel branches round the lower half.
  g.fillStyle = gold;
  for (const side of [-1, 1]) {
    for (let i = 0; i < 9; i++) {
      const a = Math.PI / 2 + side * (0.35 + i * 0.2);
      const px = cx + Math.cos(a) * r * 0.58, py = cy + Math.sin(a) * r * 0.58;
      g.save(); g.translate(px, py); g.rotate(a + side * 0.5); g.beginPath(); g.ellipse(0, 0, r * 0.085, r * 0.035, 0, 0, TAU); g.fill(); g.restore();
    }
  }
  g.fillStyle = CREAM; star(g, cx, cy - r * 0.04, r * 0.42); g.fill();
  g.fillStyle = gold; star(g, cx, cy - r * 0.04, r * 0.3); g.fill();
  g.fillStyle = field; g.beginPath(); g.arc(cx, cy - r * 0.04, r * 0.07, 0, TAU); g.fill();
  if (opts.text) {
    ringText(g, 'REPUBLIC OF CORVANIA', cx, cy, r * 0.8, -Math.PI / 2, Math.max(8, r * 0.1), CREAM);
  }
  g.restore();
}

/** A hung flag, `w` by `h` px, folded into a gentle wave by `ripple` (0 for a flat one). */
export function flag(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, kind: 'republic' | 'navy' | 'crimson' | 'green' | 'gold' | 'stripe', ripple = 0, t = 0): void {
  const slices = 8;
  for (let i = 0; i < slices; i++) {
    const sx = x + (w * i) / slices, sw = w / slices + 0.6;
    const dy = ripple ? Math.sin(t * 0.0016 + i * 0.9) * ripple : 0;
    const k = ripple ? 1 + Math.sin(t * 0.0016 + i * 0.9 + 1) * 0.06 : 1;
    const base = kind === 'navy' ? '#2c3d70' : kind === 'crimson' ? '#8a2e3c' : kind === 'green' ? '#2f6a4a' : kind === 'gold' ? '#c8a23c' : kind === 'stripe' ? '#d8d2c0' : '#2c3d70';
    g.fillStyle = base; g.fillRect(sx, y + dy, sw, h);
    if (kind === 'republic') {
      g.fillStyle = '#e8e2d0'; g.fillRect(sx, y + dy + h * 0.38, sw, h * 0.24);
    } else if (kind === 'stripe') {
      g.fillStyle = '#2c3d70'; g.fillRect(sx, y + dy, sw, h * 0.34); g.fillStyle = '#8a2e3c'; g.fillRect(sx, y + dy + h * 0.66, sw, h * 0.34);
    }
    g.fillStyle = k > 1 ? 'rgba(255,255,255,0.14)' : 'rgba(10,12,16,0.16)'; g.fillRect(sx, y + dy, sw, h);
  }
  if (kind === 'republic') { g.fillStyle = '#d9b24a'; star(g, x + w * 0.5, y + h * 0.5, h * 0.22); g.fill(); }
  g.strokeStyle = INK; g.lineWidth = 1.6; g.strokeRect(x, y, w, h);
}

/** Staining that is a little darker than the floor it sits on (spills, soot, damp). */
export function stain(g: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, rgb: string, a: number, rot = 0): void {
  const grd = g.createRadialGradient(x, y, 0, x, y, Math.max(rx, ry));
  grd.addColorStop(0, `rgba(${rgb}, ${a})`); grd.addColorStop(0.7, `rgba(${rgb}, ${a * 0.7})`); grd.addColorStop(1, `rgba(${rgb}, 0)`);
  g.save(); g.translate(x, y); g.rotate(rot); g.scale(1, ry / rx); g.translate(-x, -y);
  g.fillStyle = grd; g.beginPath(); g.arc(x, y, rx, 0, TAU); g.fill();
  g.restore();
}
