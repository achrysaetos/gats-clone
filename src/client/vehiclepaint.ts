/**
 * Weathering for the vehicle kit's paint functions: a small value noise and the three looks built on it. Rust comes in small
 * ragged patches, thickest low down and along edges; vines creep up from the ground in leafy clumps; scorch spreads in soot
 * with charred cores. All in hard steps (no gradients on paint), and fixed for a given position, so every bake is the same.
 */
import { mat, type Mat } from './vehiclemesh.ts';

const hash = (x: number, y: number) => { let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const smooth = (t: number) => t * t * (3 - 2 * t);

/** Value noise in 0..1 at frequency 1 per metre. */
function noise(x: number, y: number): number {
  const ix = Math.floor(x), iy = Math.floor(y), fx = smooth(x - ix), fy = smooth(y - iy);
  const a = hash(ix, iy), b = hash(ix + 1, iy), c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
/** Three octaves of `noise`, 0..1. */
export function fbm(x: number, y: number): number {
  return noise(x, y) * 0.55 + noise(x * 2.03 + 17.1, y * 2.03 - 9.7) * 0.3 + noise(x * 4.1 - 3.3, y * 4.1 + 21.7) * 0.15;
}

const RUST_DARK = mat('#6e3d26'), RUST = mat('#a8552e'), SOOT = mat('#2e2b27'), CHAR = mat('#1f1c1a'), EMBER = mat('#5a4030');
const LEAF = mat('#4f6a3a'), LEAF_DARK = mat('#3a5030'), LEAF_LIT = mat('#6c8a48');

export type Wear = { rust?: number; vines?: number; burnt?: number; dirt?: number };

/**
 * Weathers `base` at a point on a vehicle of roof height `top`. `u, v` are the surface's own coordinates for the noise (pass x
 * and y + z so sides and tops both vary), `z` the height (rust and vines climb from the ground), `nz` the normal's up part.
 */
export function weather(base: Mat, w: Wear, x: number, y: number, z: number, nz: number, top: number): Mat {
  // fbm sits around 0.5 with a spread of about 0.12, so each threshold below is a share of the surface.
  const h = Math.max(0, Math.min(1, z / Math.max(0.5, top)));
  if (w.burnt) {
    const t = fbm(x * 0.55 + 3.1, (y + z) * 0.55) - (0.64 - w.burnt * 0.14);
    if (t > 0.1) return fbm(x * 3.1, (y + z) * 3.1) > 0.64 ? EMBER : CHAR;
    if (t > 0) return SOOT;
  }
  if (w.vines) {
    // Clumps thickest near the floor, thinning toward the roof, a leafy texture inside them.
    const c = fbm(x * 1.3 + 40, (y + z * 0.6) * 1.3) - (0.38 - w.vines * 0.12 + h * 0.42);
    if (c > 0) { const l = noise(x * 7.3, (y + z) * 7.3); return l > 0.7 ? LEAF_LIT : l < 0.3 ? LEAF_DARK : LEAF; }
  }
  if (w.rust) {
    const r = fbm(x * 2.6 + 7, (y + z) * 2.6) - (0.68 - w.rust * 0.08 - (1 - h) * 0.05);
    if (r > 0.045) return RUST_DARK;
    if (r > 0) return RUST;
  }
  if (w.dirt) {
    const d = fbm(x * 1.5 - 5, (y + z * 2) * 1.5) - (0.68 - w.dirt * 0.06 - (1 - h) * 0.04);
    if (d > 0) return dirty(base);
  }
  return base;
}

const DIRTY = new Map<Mat, Mat>();
/** A paint 14% darker and a little warmer, for grime. */
function dirty(m: Mat): Mat {
  let d = DIRTY.get(m);
  if (!d) {
    const [r, g, b] = m.rgb;
    const c = (v: number, k: number) => Math.round(v * k).toString(16).padStart(2, '0');
    DIRTY.set(m, (d = mat(`#${c(r, 0.86)}${c(g, 0.84)}${c(b, 0.8)}`, { ...(m.gloss && { gloss: true }) })));
  }
  return d;
}
