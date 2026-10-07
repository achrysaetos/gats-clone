import { COSMETIC_BY_ID } from '../shared/cosmetics.ts';
import { reducedMotion } from './screenfx.ts';

/** The plain name ink on a gunmetal plate (the field kit's bone). */
export const NAME_INK = '#ece6d6';

/** The ink a name is drawn in: one colour, a gradient across its width, or a shimmer that slides across it for the animated ones. */
export function nameInk(ctx: CanvasRenderingContext2D, id: string, x0: number, w: number, now: number): string | CanvasGradient {
  const c = COSMETIC_BY_ID.get(id);
  if (!c || c.swatch.length === 0) return NAME_INK;
  if (c.swatch.length === 1) return c.swatch[0]!;
  const sw = c.swatch;
  if (c.animated && !reducedMotion()) {
    const off = w * (0.5 + 0.5 * Math.sin(now / 700));
    const g = ctx.createLinearGradient(x0 - w + off, 0, x0 + w + off, 0);
    const stops = [...sw, ...sw.slice(0, -1).reverse()];
    stops.forEach((col, i) => g.addColorStop(i / (stops.length - 1), col));
    return g;
  }
  const g = ctx.createLinearGradient(x0, 0, x0 + w, 0);
  sw.forEach((col, i) => g.addColorStop(i / (sw.length - 1), col));
  return g;
}

