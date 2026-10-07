/**
 * The vehicle kit's toy renderer. A vehicle is a small 3D model (lofted fuselages and hulls, bevelled slabs, wheels) built in
 * metres with the nose toward +x, y to starboard (down-screen at rot 0) and z up. `bake` rasterises it once, on the CPU, into a
 * canvas in the game's three-quarter view, shaded the way docs/art/STYLE.md asks: one key light from the top left, the two hard
 * cel steps (24% toward white on the lit side, 30% toward black on the far side) and the darker front face, an ink outline
 * round the silhouette and along every panel break between parts, one specular dot on glass and domes, and a crisp contact
 * shadow falling down and to the right. Rendering is supersampled and tiled, so memory stays small and edges stay clean.
 */
import { LIGHT } from './tilt.ts';

export const PX_PER_M = 64;
/** How far a metre of height shifts up the screen, in metres of ground: the three-quarter view's tilt. */
export const TILT = 0.36;

export type RGB = readonly [number, number, number];
export type Mat = {
  rgb: RGB;
  /** Glass, domes, lamps: one hard specular dot where the light glances off. */
  gloss?: boolean;
  /** Unshaded (a lit lamp, a glowing window): ignores the cel steps. */
  flat?: boolean;
};
/** Paints a fragment from its model-space position and normal. */
export type Paint = (x: number, y: number, z: number, nx: number, ny: number, nz: number) => Mat;
/** One outline group: a line is inked wherever two groups meet (or one sits in front of itself across a fold). */
type Part = {
  paint: Paint; group: number; ink?: number;
  /** Cut away above this height (model metres): a hollow shell whose inside shows. */
  clip?: number;
  /** Cut away below this height: a hull at its waterline. */
  clipLow?: number;
  /** Cut away wherever this is true (model metres): a doorway through a shell. */
  cut?: (x: number, y: number, z: number) => boolean;
  /** The colour of the inside faces (seen from behind), when the part is cut open. */
  inner?: RGB;
  /** Cut open and see-through: the inside is not drawn at all, so whatever is under the sprite shows in the hole. */
  open?: boolean;
};

export type Spinner = {
  /** Hub in model metres. */
  at: readonly [number, number, number];
  /** The spin axis in model space (unit). */
  axis: readonly [number, number, number];
  r: number;
  blades: number;
  /** Revolutions per second the blade flicks show (the art bible's 4 Hz ceiling is respected by the drawer). */
  rps: number;
  color?: string;
  /** Drawn above the players (the helicopter's main rotor). */
  over?: boolean;
};
type VLight = { at: readonly [number, number, number]; color: string; radius: number; intensity: number; blinkMs?: number; phase?: number; size?: number; key: string };

const rgbOf = (hex: string): RGB => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const MATS = new Map<string, Mat>();
/** A cached paint material from a hex colour. */
export function mat(hex: string, opts: { gloss?: boolean; flat?: boolean } = {}): Mat {
  const key = `${hex}|${opts.gloss ? 1 : 0}${opts.flat ? 1 : 0}`;
  let m = MATS.get(key);
  if (!m) MATS.set(key, (m = { rgb: rgbOf(hex), ...opts }));
  return m;
}
const solid = (hex: string, opts?: { gloss?: boolean; flat?: boolean }): Paint => { const m = mat(hex, opts); return () => m; };

/* -- geometry ------------------------------------------------------------------------------------------------------------ */

type Xf = (p: [number, number, number]) => [number, number, number];
export const rotX = (a: number): Xf => { const c = Math.cos(a), s = Math.sin(a); return ([x, y, z]) => [x, y * c - z * s, y * s + z * c]; };
export const rotY = (a: number): Xf => { const c = Math.cos(a), s = Math.sin(a); return ([x, y, z]) => [x * c + z * s, y, -x * s + z * c]; };
export const rotZ = (a: number): Xf => { const c = Math.cos(a), s = Math.sin(a); return ([x, y, z]) => [x * c - y * s, x * s + y * c, z]; };
export const move = (dx: number, dy: number, dz: number): Xf => ([x, y, z]) => [x + dx, y + dy, z + dz];
export const chain = (...fs: Xf[]): Xf => (p) => fs.reduce((q, f) => f(q), p);
const ID: Xf = (p) => p;

export type Station = { x: number; w: number; h: number; y?: number; z: number; n?: number };

export class Model {
  pos: number[] = [];
  nrm: number[] = [];
  tri: number[] = [];
  triPart: number[] = [];
  parts: Part[] = [];
  spinners: Spinner[] = [];
  lights: VLight[] = [];
  /** The height of the roof that sits on the collision footprint. */
  top = 1;
  /** Decals laid from above on faces that look up: drawn in model metres into a canvas `px` per metre. */
  decal?: Decal;
  /** Decals laid from the side on faces that look along y, in model (x, z) metres; the far side gets a mirrored copy so it reads. */
  side?: Decal;
  private nextGroup = 1;

  part(paint: Paint | string | Mat, opts: { group?: number; ink?: number; clip?: number; clipLow?: number; inner?: string; open?: boolean; cut?: (x: number, y: number, z: number) => boolean } = {}): number {
    const p: Part = {
      paint: typeof paint === 'string' ? solid(paint) : typeof paint === 'function' ? paint : ((m: Mat) => () => m)(paint), group: opts.group ?? this.nextGroup++,
      ...(opts.ink !== undefined && { ink: opts.ink }), ...(opts.clip !== undefined && { clip: opts.clip }), ...(opts.clipLow !== undefined && { clipLow: opts.clipLow }), ...(opts.cut && { cut: opts.cut }), ...(opts.open && { open: true }), ...(opts.inner !== undefined && { inner: rgbOf(opts.inner) }),
    };
    this.parts.push(p);
    return this.parts.length - 1;
  }
  /** A new outline group id, to share between several parts (paint changes inside one group draw no line). */
  group(): number { return this.nextGroup++; }

  private vert(xf: Xf, p: [number, number, number], n: [number, number, number]): number {
    const q = xf(p);
    const o = xf([0, 0, 0]);
    const m = xf([n[0], n[1], n[2]]);
    const nx = m[0] - o[0], ny = m[1] - o[1], nz = m[2] - o[2];
    const l = Math.hypot(nx, ny, nz) || 1;
    this.pos.push(q[0], q[1], q[2]);
    this.nrm.push(nx / l, ny / l, nz / l);
    return this.pos.length / 3 - 1;
  }
  private face(part: number, a: number, b: number, c: number) { this.tri.push(a, b, c); this.triPart.push(part); }

  /**
   * A lofted tube along x: at each station a superellipse cross-section (half width `w` across y, half height `h` up z,
   * exponent `n`: 2 is round, 4 a rounded box). Stations are interpolated smoothly; a station with w = h = 0 closes a tip.
   */
  loft(part: number, stations: readonly Station[], opts: { ring?: number; sub?: number; xf?: Xf; half?: boolean; jag?: number; seed?: number } = {}): void {
    const ring = opts.ring ?? 28, sub = opts.sub ?? 3, xf = opts.xf ?? ID;
    const S: Station[] = [];
    for (let i = 0; i < stations.length - 1; i++) {
      const a = stations[i]!, b = stations[i + 1]!;
      const k0 = stations[i - 1] ?? a, k1 = stations[i + 2] ?? b;
      for (let j = 0; j < sub; j++) {
        const t = j / sub;
        // Catmull-Rom on every parameter, so a few stations make a smooth body.
        const cr = (p0: number, p1: number, p2: number, p3: number) => {
          const t2 = t * t, t3 = t2 * t;
          return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
        };
        const lin = (p1: number, p2: number) => p1 + (p2 - p1) * t;
        S.push({
          x: lin(a.x, b.x),
          w: Math.max(0, cr(k0.w, a.w, b.w, k1.w)),
          h: Math.max(0, cr(k0.h, a.h, b.h, k1.h)),
          y: cr(k0.y ?? 0, a.y ?? 0, b.y ?? 0, k1.y ?? 0),
          z: cr(k0.z, a.z, b.z, k1.z),
          n: lin(a.n ?? 2, b.n ?? 2),
        });
      }
    }
    S.push({ ...stations[stations.length - 1]! });
    const th0 = opts.half ? 0 : 0, th1 = opts.half ? Math.PI : Math.PI * 2;
    const cols = opts.half ? ring + 1 : ring;
    const P: [number, number, number][][] = S.map((s) => {
      const row: [number, number, number][] = [];
      for (let k = 0; k < cols; k++) {
        const th = opts.half ? (k / ring) * Math.PI : th0 + (k / ring) * (th1 - th0);
        const c = Math.cos(th), sn = Math.sin(th), e = 2 / (s.n ?? 2);
        row.push([s.x, (s.y ?? 0) + s.w * Math.sign(c) * Math.abs(c) ** e, s.z + s.h * Math.sign(sn) * Math.abs(sn) ** e]);
      }
      return row;
    });
    if (opts.jag) {
      // A torn end: the last ring's points pushed back by a ragged amount, as if the skin had been ripped.
      const last = P[P.length - 1]!, prev = P[P.length - 2]!, dir = Math.sign(last[0]![0] - prev[0]![0]) || 1, sd = opts.seed ?? 1;
      last.forEach((p, k) => { const h = Math.sin(k * 12.9898 + sd * 78.233) * 43758.5453; p[0] -= dir * opts.jag! * (h - Math.floor(h)) * (k % 2 ? 1 : 0.35); });
    }
    this.grid(part, P, !opts.half, xf);
  }

  /** A grid of points (rows along the length, columns round the ring) as a smooth-shaded surface. */
  grid(part: number, P: readonly (readonly [number, number, number])[][], wrap: boolean, xf: Xf = ID): void {
    const R = P.length, C = P[0]!.length;
    const N = P.map((row) => row.map(() => [0, 0, 0] as [number, number, number]));
    const quads = wrap ? C : C - 1;
    for (let i = 0; i < R - 1; i++) for (let k = 0; k < quads; k++) {
      const k1 = (k + 1) % C;
      const a = P[i]![k]!, b = P[i + 1]![k]!, c = P[i + 1]![k1]!, d = P[i]![k1]!;
      // Face normal of the quad from its diagonals (robust when an edge collapses to a tip).
      const u = [c[0] - a[0], c[1] - a[1], c[2] - a[2]], v = [d[0] - b[0], d[1] - b[1], d[2] - b[2]];
      const n: [number, number, number] = [u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!];
      for (const [ii, kk] of [[i, k], [i + 1, k], [i + 1, k1], [i, k1]] as const) { const t = N[ii]![kk]!; t[0] += n[0]; t[1] += n[1]; t[2] += n[2]; }
    }
    // Orient the normals outward: the winding is consistent, so one vote over every ring decides for the whole surface.
    let vote = 0;
    for (const [i, row] of P.entries()) {
      let cy = 0, cz = 0;
      for (const p of row) { cy += p[1]; cz += p[2]; }
      cy /= row.length; cz /= row.length;
      row.forEach((p, k) => { const n = N[i]![k]!; vote += n[1] * (p[1] - cy) + n[2] * (p[2] - cz); });
    }
    const sgn = vote < 0 ? -1 : 1;
    const idx = P.map((row, i) => row.map((p, k) => {
      const n = N[i]![k]!;
      return this.vert(xf, [p[0], p[1], p[2]], [n[0] * sgn, n[1] * sgn, n[2] * sgn]);
    }));
    for (let i = 0; i < R - 1; i++) for (let k = 0; k < quads; k++) {
      const k1 = (k + 1) % C;
      const a = idx[i]![k]!, b = idx[i + 1]![k]!, c = idx[i + 1]![k1]!, d = idx[i]![k1]!;
      this.face(part, a, b, c); this.face(part, a, c, d);
    }
  }

  /**
   * A flat slab: the polygon `poly` (x, y in metres) from `z0` to `z1`, its top edge bevelled by `bevel` so the lit and shaded
   * edges catch the light like a moulded toy. `xf` turns it (a fin is a slab stood on its side).
   */
  slab(part: number, poly: readonly (readonly [number, number])[], z0: number, z1: number, opts: { bevel?: number; xf?: Xf; bottom?: boolean } = {}): void {
    const xf = opts.xf ?? ID;
    let pts = poly.map(([x, y]) => [x, y] as [number, number]);
    if (area(pts) < 0) pts = pts.reverse();
    const b = Math.min(opts.bevel ?? 0, (z1 - z0) * 0.9);
    const inner = b > 0 ? inset(pts, b) : pts;
    const zt = z1, zs = z1 - b;
    const tris = earcut(inner);
    const top = inner.map(([x, y]) => this.vert(xf, [x, y, zt], [0, 0, 1]));
    for (const [a, c, d] of tris) this.face(part, top[a]!, top[c]!, top[d]!);
    // A slab stood up (a fin) shows both faces, so it gets its underside too.
    if (opts.bottom ?? !!opts.xf) {
      const bot = pts.map(([x, y]) => this.vert(xf, [x, y, z0], [0, 0, -1]));
      for (const [a, c, d] of earcut(pts)) this.face(part, bot[a]!, bot[d]!, bot[c]!);
    }
    for (let i = 0; i < pts.length; i++) {
      const j = (i + 1) % pts.length;
      const [ax, ay] = pts[i]!, [bx, by] = pts[j]!;
      const ex = bx - ax, ey = by - ay, l = Math.hypot(ex, ey) || 1;
      const nx = ey / l, ny = -ex / l;
      // Side wall.
      const s = [this.vert(xf, [ax, ay, z0], [nx, ny, 0]), this.vert(xf, [bx, by, z0], [nx, ny, 0]), this.vert(xf, [bx, by, zs], [nx, ny, 0]), this.vert(xf, [ax, ay, zs], [nx, ny, 0])];
      this.face(part, s[0]!, s[1]!, s[2]!); this.face(part, s[0]!, s[2]!, s[3]!);
      if (b > 0) {
        const [cx, cy] = inner[i]!, [dx, dy] = inner[j]!;
        const bn: [number, number, number] = [nx * 0.7, ny * 0.7, 0.7];
        const q = [this.vert(xf, [ax, ay, zs], bn), this.vert(xf, [bx, by, zs], bn), this.vert(xf, [dx, dy, zt], bn), this.vert(xf, [cx, cy, zt], bn)];
        this.face(part, q[0]!, q[1]!, q[2]!); this.face(part, q[0]!, q[2]!, q[3]!);
      }
    }
  }

  /** An axis-aligned box with bevelled top edges. */
  box(part: number, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, bevel = 0.08, xf?: Xf): void {
    this.slab(part, [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], z0, z1, { bevel, ...(xf && { xf }) });
  }

  /** A round tube along x from x0 to x1 (radius r, or rx, rz), its ends capped flat. */
  tube(part: number, x0: number, x1: number, y: number, z: number, r: number, opts: { rz?: number; n?: number; xf?: Xf; ring?: number; cap?: number } = {}): void {
    const rz = opts.rz ?? r, n = opts.n ?? 2, cap = opts.cap ?? Math.min(r, rz) * 0.18;
    this.loft(part, [
      { x: x0, w: 0, h: 0, y, z, n }, { x: x0, w: r - cap, h: rz - cap, y, z, n }, { x: x0 + cap * 0.4, w: r, h: rz, y, z, n },
      { x: x1 - cap * 0.4, w: r, h: rz, y, z, n }, { x: x1, w: r - cap, h: rz - cap, y, z, n }, { x: x1, w: 0, h: 0, y, z, n },
    ], { sub: 1, ...(opts.xf && { xf: opts.xf }), ...(opts.ring && { ring: opts.ring }) });
  }

  /** A wheel (a short tube across y) standing on the ground at (x, y). */
  wheel(tyre: number, hub: number, x: number, y: number, r: number, width: number): void {
    const xf = chain(rotZ(Math.PI / 2), move(x, y, r));
    this.tube(tyre, -width / 2, width / 2, 0, 0, r, { ring: 20, cap: r * 0.25, xf });
    // The hub cap on the outboard face.
    const side = y >= 0 ? 1 : -1;
    this.tube(hub, side > 0 ? width / 2 - 0.02 : -width / 2 - 0.04, side > 0 ? width / 2 + 0.04 : -width / 2 + 0.02, 0, 0, r * 0.5, { ring: 14, xf });
  }

  /** An ellipsoid (a dome when cut by the ground). */
  blob(part: number, cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, opts: { n?: number; xf?: Xf; rows?: number } = {}): void {
    const rows = opts.rows ?? 10, st: Station[] = [];
    for (let i = 0; i <= rows; i++) {
      const a = -Math.PI / 2 + (i / rows) * Math.PI;
      st.push({ x: cx + rx * Math.sin(a), w: ry * Math.cos(a), h: rz * Math.cos(a), y: cy, z: cz, n: opts.n ?? 2 });
    }
    this.loft(part, st, { sub: 1, ...(opts.xf && { xf: opts.xf }) });
  }

  /** Decals painted from above, in model metres (x right along the nose, y down-screen); `parts` limits which parts take them. */
  decals(x0: number, y0: number, x1: number, y1: number, px: number, parts: readonly number[], paint: (g: CanvasRenderingContext2D) => void): void {
    this.decal = decalOf(x0, y0, x1, y1, px, parts, paint);
  }
  /** Decals painted from the starboard side, in model (x, -z) metres: canvas y runs down, so pass z as -z. */
  sideDecals(x0: number, z0: number, x1: number, z1: number, px: number, parts: readonly number[], paint: (g: CanvasRenderingContext2D) => void): void {
    this.side = decalOf(x0, -z1, x1, -z0, px, parts, paint);
  }
}

type Decal = { x0: number; y0: number; px: number; w: number; h: number; parts: Set<number>; paint: (g: CanvasRenderingContext2D) => void; data?: Uint8ClampedArray };
/** A decal is painted into its canvas only when a bake needs it. */
function decalOf(x0: number, y0: number, x1: number, y1: number, px: number, parts: readonly number[], paint: (g: CanvasRenderingContext2D) => void): Decal {
  return { x0, y0, px, w: Math.ceil((x1 - x0) * px), h: Math.ceil((y1 - y0) * px), parts: new Set(parts), paint };
}
function decalData(d: Decal): Uint8ClampedArray {
  if (!d.data) {
    const c = makeCanvas(d.w, d.h);
    const g = c.getContext('2d') as CanvasRenderingContext2D;
    g.scale(d.px, d.px);
    g.translate(-d.x0, -d.y0);
    d.paint(g);
    d.data = g.getImageData(0, 0, d.w, d.h).data;
  }
  return d.data;
}
/** Samples a decal: returns its alpha and leaves the texel's index in SI. */
let SI = 0;
const sample = (d: Decal, u: number, v: number): number => {
  const iu = Math.floor((u - d.x0) * d.px), iv = Math.floor((v - d.y0) * d.px);
  if (iu < 0 || iv < 0 || iu >= d.w || iv >= d.h) return 0;
  SI = (iv * d.w + iu) * 4;
  const al = d.data![SI + 3]! / 255;
  return al > 0.02 ? al : 0;
};

/* -- polygon helpers --------------------------------------------------------------------------------------------------- */

const area = (p: readonly (readonly [number, number])[]) => { let a = 0; for (let i = 0; i < p.length; i++) { const q = p[i]!, r = p[(i + 1) % p.length]!; a += q[0] * r[1] - r[0] * q[1]; } return a / 2; };

/** Offsets a counter-clockwise polygon inward by d. */
function inset(p: readonly [number, number][], d: number): [number, number][] {
  const n = p.length, out: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = p[(i + n - 1) % n]!, b = p[i]!, c = p[(i + 1) % n]!;
    const e0 = norm(b[0] - a[0], b[1] - a[1]), e1 = norm(c[0] - b[0], c[1] - b[1]);
    // Inward normals of a CCW polygon (y down is still a consistent handedness).
    const n0 = [-e0[1], e0[0]], n1 = [-e1[1], e1[0]];
    const bx = n0[0]! + n1[0]!, by = n0[1]! + n1[1]!;
    const bl = Math.hypot(bx, by) || 1;
    const cosHalf = (bx / bl) * n0[0]! + (by / bl) * n0[1]!;
    const k = d / Math.max(0.3, cosHalf);
    out.push([b[0] + (bx / bl) * k, b[1] + (by / bl) * k]);
  }
  return out;
}
const norm = (x: number, y: number): [number, number] => { const l = Math.hypot(x, y) || 1; return [x / l, y / l]; };

/** Ear clipping for a simple counter-clockwise polygon. */
function earcut(p: readonly [number, number][]): [number, number, number][] {
  const idx = p.map((_, i) => i), out: [number, number, number][] = [];
  const cross = (a: number, b: number, c: number) => (p[b]![0] - p[a]![0]) * (p[c]![1] - p[a]![1]) - (p[b]![1] - p[a]![1]) * (p[c]![0] - p[a]![0]);
  const inside = (a: number, b: number, c: number, q: number) => cross(a, b, q) >= 0 && cross(b, c, q) >= 0 && cross(c, a, q) >= 0;
  let guard = 0;
  while (idx.length > 3 && guard++ < 5000) {
    let cut = false;
    for (let i = 0; i < idx.length; i++) {
      const a = idx[(i + idx.length - 1) % idx.length]!, b = idx[i]!, c = idx[(i + 1) % idx.length]!;
      if (cross(a, b, c) <= 1e-9) continue;
      if (idx.some((q) => q !== a && q !== b && q !== c && inside(a, b, c, q))) continue;
      out.push([a, b, c]);
      idx.splice(i, 1);
      cut = true;
      break;
    }
    if (!cut) break;
  }
  if (idx.length === 3) out.push([idx[0]!, idx[1]!, idx[2]!]);
  return out;
}

/* -- the bake ------------------------------------------------------------------------------------------------------------ */

function makeCanvas(w: number, h: number): HTMLCanvasElement | OffscreenCanvas {
  if (typeof document !== 'undefined') { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  return new OffscreenCanvas(w, h);
}

/** The key light, toward the light: from the top left and well above (about 50 degrees). */
const LH = 0.64, LZ = 0.77;
const LX = -LIGHT.x * LH, LY = -LIGHT.y * LH;
/** Toward the viewer, for the specular glance. */
const VY = Math.sin(Math.atan(TILT)), VZ = Math.cos(Math.atan(TILT));
const HX0 = LX, HY0 = LY + VY, HZ0 = LZ + VZ, HL = Math.hypot(HX0, HY0, HZ0);
const HX = HX0 / HL, HY = HY0 / HL, HZ = HZ0 / HL;
/** How far a contact shadow reaches down and right per metre of height: short, so the toy sits on the floor. */
const SHADOW = 0.2;
const INK_RGB = rgbOf('#1c1f26');
const SHADOW_A = 0.42;
/** Above this light term a surface takes the lit step. */
const LIT = 0.9;

type Raw = { px: Uint8ClampedArray; w: number; h: number; ox: number; oy: number; res: number; ms: number };
export type Baked = {
  canvas: HTMLCanvasElement | OffscreenCanvas | ImageBitmap;
  /** World px from the vehicle's origin to the canvas's top-left, and the canvas's px per world px. */
  ox: number; oy: number; res: number;
  ms: number;
};

type BakeOpts = { rot: number; scale: number; res: number; ss?: number; ink?: number };

const TILE = 256;
let scratch: { TW: number; depth: Float32Array; tri: Int32Array; wa: Float32Array; wb: Float32Array; grp: Int32Array; col: Uint8ClampedArray; nB: Int8Array; mask: Uint8Array } | null = null;
function buffers(TW: number) {
  if (!scratch || scratch.TW !== TW) {
    const n = TW * TW;
    scratch = { TW, depth: new Float32Array(n), tri: new Int32Array(n), wa: new Float32Array(n), wb: new Float32Array(n), grp: new Int32Array(n), col: new Uint8ClampedArray(n * 3), nB: new Int8Array(n * 3), mask: new Uint8Array(n) };
  }
  return scratch;
}

/**
 * Renders `m` turned by `rot` (radians, about z) at `scale`, into a canvas `res` px per world px. The model's roof (`m.top`) lands
 * on the collision footprint; heights rise up the screen by TILT. Each tile is rasterised (depth, triangle, barycentrics), then
 * shaded once per pixel, inked, and box-filtered down by the supersampling factor.
 */
export function bake(m: Model, o: BakeOpts): Baked { return toCanvas(bakeRaw(m, o)); }

export function toCanvas(r: Raw): Baked {
  const canvas = makeCanvas(r.w, r.h);
  (canvas.getContext('2d') as CanvasRenderingContext2D).putImageData(new ImageData(r.px as Uint8ClampedArray<ArrayBuffer>, r.w, r.h), 0, 0);
  return { canvas, ox: r.ox, oy: r.oy, res: r.res, ms: r.ms };
}

export function bakeRaw(m: Model, o: BakeOpts): Raw {
  const t0 = performance.now();
  const ss = o.ss ?? 2;
  const k = PX_PER_M * o.scale * o.res * ss; // internal px per model metre
  const cr = Math.cos(o.rot), sr = Math.sin(o.rot);
  const nv = m.pos.length / 3;
  const sx = new Float32Array(nv), sy = new Float32Array(nv), sd = new Float32Array(nv), hx = new Float32Array(nv), hy = new Float32Array(nv);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < nv; i++) {
    const x = m.pos[i * 3]!, y = m.pos[i * 3 + 1]!, z = m.pos[i * 3 + 2]!;
    const wx = x * cr - y * sr, wy = x * sr + y * cr;
    sx[i] = wx * k; sy[i] = (wy - (z - m.top) * TILT) * k; sd[i] = wy * TILT + z;
    // Its shadow on the floor: pushed a little down and right by its height, then seen at the floor's depth.
    hx[i] = (wx + LIGHT.x * z * SHADOW) * k; hy[i] = (wy + LIGHT.y * z * SHADOW + m.top * TILT) * k;
    x0 = Math.min(x0, sx[i]!, hx[i]!); x1 = Math.max(x1, sx[i]!, hx[i]!); y0 = Math.min(y0, sy[i]!, hy[i]!); y1 = Math.max(y1, sy[i]!, hy[i]!);
  }
  const inkW = (o.ink ?? 2.2) * o.res * ss; // the silhouette line, internal px
  const pad = Math.ceil(inkW + 2 * ss);
  const ox = Math.floor((x0 - pad) / ss) * ss, oy = Math.floor((y0 - pad) / ss) * ss;
  const W = Math.ceil(x1 + pad - ox), H = Math.ceil(y1 + pad - oy);
  const Wr = Math.ceil(W / ss) * ss, Hr = Math.ceil(H / ss) * ss;
  const outW = Wr / ss, outH = Hr / ss;
  const out = new Uint8ClampedArray(outW * outH * 4);

  const nt = m.tri.length / 3;
  const tb = new Float32Array(nt * 4), sb = new Float32Array(nt * 4);
  for (let t = 0; t < nt; t++) {
    const a = m.tri[t * 3]!, b = m.tri[t * 3 + 1]!, c = m.tri[t * 3 + 2]!;
    tb[t * 4] = Math.min(sx[a]!, sx[b]!, sx[c]!) - ox; tb[t * 4 + 1] = Math.min(sy[a]!, sy[b]!, sy[c]!) - oy;
    tb[t * 4 + 2] = Math.max(sx[a]!, sx[b]!, sx[c]!) - ox; tb[t * 4 + 3] = Math.max(sy[a]!, sy[b]!, sy[c]!) - oy;
    sb[t * 4] = Math.min(hx[a]!, hx[b]!, hx[c]!) - ox; sb[t * 4 + 1] = Math.min(hy[a]!, hy[b]!, hy[c]!) - oy;
    sb[t * 4 + 2] = Math.max(hx[a]!, hx[b]!, hx[c]!) - ox; sb[t * 4 + 3] = Math.max(hy[a]!, hy[b]!, hy[c]!) - oy;
  }
  const dec = m.decal, side = m.side;
  for (const d of [dec, side]) if (d) decalData(d);
  const decParts = m.parts.map((_, i) => !!dec?.parts.has(i)), sideParts = m.parts.map((_, i) => !!side?.parts.has(i));

  const A = Math.ceil((pad + 2) / ss) * ss;
  const TW = TILE + 2 * A;
  const { depth, tri, wa: WA, wb: WB, grp, col, nB, mask } = buffers(TW);
  const inkR = inkW / 2;
  const disc = (r: number) => { const o: number[] = []; const ri = Math.ceil(r); for (let dy = -ri; dy <= ri; dy++) for (let dx = -ri; dx <= ri; dx++) if (dx * dx + dy * dy <= r * r + 0.25) o.push(dy * TW + dx); return Int32Array.from(o); };
  const D_OUT = disc(inkR), D_IN = disc(inkR * 0.72), D_FOLD = disc(Math.max(0.8, inkR * 0.5));
  const SHADOW_BIT = 1, INK_BIT = 2, SPEC_BIT = 4, HOLE_BIT = 8;
  const P = m.pos, N = m.nrm, T = m.tri, TP = m.triPart, parts = m.parts;

  for (let ty = 0; ty < Hr; ty += TILE) for (let tx = 0; tx < Wr; tx += TILE) {
    const bx0 = tx - A, by0 = ty - A;
    depth.fill(-1e9); tri.fill(-1); mask.fill(0);
    let any = false;
    // The part of the tile anything touches, so the passes below skip the empty rest.
    let cx0 = TW, cy0 = TW, cx1 = 0, cy1 = 0;
    const grow = (a: number, b: number, c: number, d: number) => { cx0 = Math.min(cx0, a - bx0); cy0 = Math.min(cy0, b - by0); cx1 = Math.max(cx1, c - bx0); cy1 = Math.max(cy1, d - by0); };
    for (let t = 0; t < nt; t++) {
      const q = t * 4;
      if (sb[q + 2]! < bx0 || sb[q]! > bx0 + TW || sb[q + 3]! < by0 || sb[q + 1]! > by0 + TW) continue;
      // A see-through part casts no contact shadow, or it would darken whatever shows in its hole.
      if (parts[TP[t]!]!.open) continue;
      const a = T[t * 3]!, b = T[t * 3 + 1]!, c = T[t * 3 + 2]!;
      cover(hx[a]! - ox - bx0, hy[a]! - oy - by0, hx[b]! - ox - bx0, hy[b]! - oy - by0, hx[c]! - ox - bx0, hy[c]! - oy - by0, TW, mask);
      grow(sb[q]!, sb[q + 1]!, sb[q + 2]!, sb[q + 3]!);
      any = true;
    }
    for (let t = 0; t < nt; t++) {
      const q = t * 4;
      if (tb[q + 2]! < bx0 || tb[q]! > bx0 + TW || tb[q + 3]! < by0 || tb[q + 1]! > by0 + TW) continue;
      const a = T[t * 3]!, b = T[t * 3 + 1]!, c = T[t * 3 + 2]!;
      const pt = parts[TP[t]!]!, clip = pt.clip, low = pt.clipLow;
      raster(t, sx[a]! - ox - bx0, sy[a]! - oy - by0, sd[a]!, sx[b]! - ox - bx0, sy[b]! - oy - by0, sd[b]!, sx[c]! - ox - bx0, sy[c]! - oy - by0, sd[c]!, TW, depth, tri, WA, WB,
        clip === undefined && low === undefined ? null : [P[a * 3 + 2]!, P[b * 3 + 2]!, P[c * 3 + 2]!, clip ?? 1e9, low ?? -1e9],
        pt.cut ? { f: pt.cut, a: a * 3, b: b * 3, c: c * 3, P } : null);
      grow(tb[q]!, tb[q + 1]!, tb[q + 2]!, tb[q + 3]!);
      any = true;
    }
    if (!any) continue;
    // Block-aligned working rectangle, padded for the ink.
    const rx0 = Math.max(0, Math.floor((cx0 - pad - 2) / ss) * ss), ry0 = Math.max(0, Math.floor((cy0 - pad - 2) / ss) * ss);
    const rx1 = Math.min(TW, Math.ceil((cx1 + pad + 2) / ss) * ss), ry1 = Math.min(TW, Math.ceil((cy1 + pad + 2) / ss) * ss);
    // Shade: once per supersample block where one triangle covers it (as MSAA does), per sample along edges.
    const shadeAt = (i: number) => {
      const t = tri[i]!;
      const wa = WA[i]!, wb = WB[i]!, wc = 1 - wa - wb;
      const pa = T[t * 3]! * 3, pb = T[t * 3 + 1]! * 3, pc = T[t * 3 + 2]! * 3;
      const x = P[pa]! * wa + P[pb]! * wb + P[pc]! * wc, y = P[pa + 1]! * wa + P[pb + 1]! * wb + P[pc + 1]! * wc, z = P[pa + 2]! * wa + P[pb + 2]! * wb + P[pc + 2]! * wc;
      let nx = N[pa]! * wa + N[pb]! * wb + N[pc]! * wc, ny = N[pa + 1]! * wa + N[pb + 1]! * wb + N[pc + 1]! * wc, nz = N[pa + 2]! * wa + N[pb + 2]! * wb + N[pc + 2]! * wc;
      const nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1; nx /= nl; ny /= nl; nz /= nl;
      const pi = TP[t]!, part = parts[pi]!;
      const mt = part.paint(x, y, z, nx, ny, nz);
      let r = mt.rgb[0], g = mt.rgb[1], bb = mt.rgb[2];
      if (decParts[pi] && nz > 0.3) { const al = sample(dec!, x, y); if (al > 0) { const d = dec!.data!; r += (d[SI]! - r) * al; g += (d[SI + 1]! - g) * al; bb += (d[SI + 2]! - bb) * al; } }
      if (sideParts[pi] && (ny > 0.45 || ny < -0.45)) { const al = sample(side!, ny > 0 ? x : side!.x0 * 2 + side!.w / side!.px - x, -z); if (al > 0) { const d = side!.data!; r += (d[SI]! - r) * al; g += (d[SI + 1]! - g) * al; bb += (d[SI + 2]! - bb) * al; } }
      const wnx = nx * cr - ny * sr, wny = nx * sr + ny * cr;
      const d = wnx * LX + wny * LY + nz * LZ;
      if (part.open && wny * VY + nz * VZ < -0.02) { grp[i] = 0; mask[i]! |= HOLE_BIT; return; }
      if (part.clip !== undefined && wny * VY + nz * VZ < -0.02) {
        // The inside of a cut-open shell: flat and dark, its own colour if it has one.
        const inn = part.inner;
        if (inn) { r = inn[0]; g = inn[1]; bb = inn[2]; } else { r *= 0.45; g *= 0.45; bb *= 0.5; }
      } else if (!mt.flat) {
        if (d > LIT) { r += (255 - r) * 0.24; g += (255 - g) * 0.24; bb += (255 - bb) * 0.24; }
        else if (d < -0.12) { r *= 0.55; g *= 0.55; bb *= 0.58; }
        else if (d < 0.5) { r *= 0.7; g *= 0.7; bb *= 0.72; }
      }
      col[i * 3] = r; col[i * 3 + 1] = g; col[i * 3 + 2] = bb;
      grp[i] = part.group;
      nB[i * 3] = wnx * 127; nB[i * 3 + 1] = wny * 127; nB[i * 3 + 2] = nz * 127;
      if (mt.gloss && wnx * HX + wny * HY + nz * HZ > 0.992) mask[i]! |= SPEC_BIT;
    };
    for (let by = ry0; by < ry1; by += ss) for (let bx = rx0; bx < rx1; bx += ss) {
      const i0 = by * TW + bx, t0b = tri[i0]!;
      if (t0b >= 0) shadeAt(i0); else grp[i0] = 0;
      for (let y2 = 0; y2 < ss; y2++) for (let x2 = 0; x2 < ss; x2++) {
        if (!x2 && !y2) continue;
        const i = i0 + y2 * TW + x2, t = tri[i]!;
        if (t < 0) { grp[i] = 0; continue; }
        if (t !== t0b) { shadeAt(i); continue; }
        col[i * 3] = col[i0 * 3]!; col[i * 3 + 1] = col[i0 * 3 + 1]!; col[i * 3 + 2] = col[i0 * 3 + 2]!;
        grp[i] = grp[i0]!; nB[i * 3] = nB[i0 * 3]!; nB[i * 3 + 1] = nB[i0 * 3 + 1]!; nB[i * 3 + 2] = nB[i0 * 3 + 2]!;
        mask[i]! |= mask[i0]! & (SPEC_BIT | HOLE_BIT);
      }
    }
    // Ink: where the surface ends, where one part meets another across a step in depth, and along folds.
    const NN = TW * TW;
    const stamp = (i: number, D: Int32Array) => { for (let q = 0; q < D.length; q++) { const j = i + D[q]!; if (j >= 0 && j < NN) mask[j]! |= INK_BIT; } };
    const edge = (i: number, j: number) => {
      const gi = grp[i]!, gj = grp[j]!;
      if (gi === gj) {
        if (gi === 0) return;
        const dot = nB[i * 3]! * nB[j * 3]! + nB[i * 3 + 1]! * nB[j * 3 + 1]! + nB[i * 3 + 2]! * nB[j * 3 + 2]!;
        const dz = depth[i]! - depth[j]!;
        if (dz > 0.4 || dz < -0.4 || dot < 7300) stamp(dz > 0 ? i : j, D_FOLD);
        return;
      }
      if (gi === 0 || gj === 0) { stamp(gi ? i : j, D_OUT); return; }
      stamp(depth[i]! > depth[j]! ? i : j, D_IN);
    };
    // Pixels outside the working rectangle hold nothing.
    for (let y = 0; y < TW; y++) if (y < ry0 || y >= ry1) grp.fill(0, y * TW, y * TW + TW); else { grp.fill(0, y * TW, y * TW + rx0); grp.fill(0, y * TW + rx1, y * TW + TW); }
    for (let y = Math.max(1, ry0); y < Math.min(TW - 1, ry1); y++) for (let x = Math.max(1, rx0), i = y * TW + x; x < Math.min(TW - 1, rx1); x++, i++) {
      if (grp[i] !== grp[i + 1] || (grp[i] && tri[i] !== tri[i + 1])) edge(i, i + 1);
      if (grp[i] !== grp[i + TW] || (grp[i] && tri[i] !== tri[i + TW])) edge(i, i + TW);
    }
    // Resolve the tile core, box-filtered.
    const tw = Math.min(TILE, Wr - tx), th = Math.min(TILE, Hr - ty);
    const n = ss * ss;
    for (let oy2 = 0; oy2 < th / ss; oy2++) for (let ox2 = 0; ox2 < tw / ss; ox2++) {
      let r = 0, g = 0, b = 0, al = 0;
      for (let y2 = 0; y2 < ss; y2++) for (let x2 = 0; x2 < ss; x2++) {
        const i = (A + oy2 * ss + y2) * TW + (A + ox2 * ss + x2);
        const f = mask[i]!;
        if (f & INK_BIT) { r += INK_RGB[0]; g += INK_RGB[1]; b += INK_RGB[2]; al += 1; }
        else if (grp[i]) {
          if (f & SPEC_BIT) { r += 250; g += 250; b += 244; } else { r += col[i * 3]!; g += col[i * 3 + 1]!; b += col[i * 3 + 2]!; }
          al += 1;
        } else if ((f & SHADOW_BIT) && !(f & HOLE_BIT)) { r += 10 * SHADOW_A; g += 12 * SHADOW_A; b += 18 * SHADOW_A; al += SHADOW_A; }
      }
      if (al > 0) {
        const o2 = ((ty / ss + oy2) * outW + tx / ss + ox2) * 4;
        out[o2] = r / al; out[o2 + 1] = g / al; out[o2 + 2] = b / al; out[o2 + 3] = (al / n) * 255;
      }
    }
  }
  const per = o.res * ss;
  return { px: out, w: outW, h: outH, ox: ox / per, oy: oy / per, res: o.res, ms: performance.now() - t0 };
}

/** Marks a triangle's pixel centres in `mask` (bit 1). */
function cover(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, W: number, mask: Uint8Array) {
  const minX = Math.max(0, Math.floor(Math.min(ax, bx, cx))), maxX = Math.min(W - 1, Math.ceil(Math.max(ax, bx, cx)));
  const minY = Math.max(0, Math.floor(Math.min(ay, by, cy))), maxY = Math.min(W - 1, Math.ceil(Math.max(ay, by, cy)));
  if (minX > maxX || minY > maxY) return;
  const area2 = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  if (Math.abs(area2) < 1e-6) return;
  const inv = 1 / area2;
  const Ax = (by - cy) * inv, Ay = (cx - bx) * inv, Bx = (cy - ay) * inv, By = (ax - cx) * inv;
  const px0 = minX + 0.5;
  for (let y = minY; y <= maxY; y++) {
    const py = y + 0.5;
    let wa = ((bx - px0) * (cy - py) - (by - py) * (cx - px0)) * inv;
    let wb = ((cx - px0) * (ay - py) - (cy - py) * (ax - px0)) * inv;
    void Ay; void By;
    for (let x = minX, i = y * W + minX; x <= maxX; x++, i++, wa += Ax, wb += Bx) if (wa >= 0 && wb >= 0 && wa + wb <= 1) mask[i] = 1;
  }
}

/** Z-buffered triangle: keeps the nearest triangle and its barycentrics per pixel (a larger depth is nearer the viewer). */
type Cut = { f: (x: number, y: number, z: number) => boolean; a: number; b: number; c: number; P: readonly number[] };
function raster(t: number, ax: number, ay: number, ad: number, bx: number, by: number, bd: number, cx: number, cy: number, cd: number, W: number, depth: Float32Array, tri: Int32Array, WA: Float32Array, WB: Float32Array, clip: readonly [number, number, number, number, number] | null, cut: Cut | null) {
  if (clip && ((clip[0] > clip[3] && clip[1] > clip[3] && clip[2] > clip[3]) || (clip[0] < clip[4] && clip[1] < clip[4] && clip[2] < clip[4]))) return;
  const minX = Math.max(0, Math.floor(Math.min(ax, bx, cx))), maxX = Math.min(W - 1, Math.ceil(Math.max(ax, bx, cx)));
  const minY = Math.max(0, Math.floor(Math.min(ay, by, cy))), maxY = Math.min(W - 1, Math.ceil(Math.max(ay, by, cy)));
  if (minX > maxX || minY > maxY) return;
  const area2 = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  if (Math.abs(area2) < 1e-6) return;
  const inv = 1 / area2;
  const Ax = (by - cy) * inv, Bx = (cy - ay) * inv;
  const px0 = minX + 0.5, e = -1e-5;
  for (let y = minY; y <= maxY; y++) {
    const py = y + 0.5;
    let wa = ((bx - px0) * (cy - py) - (by - py) * (cx - px0)) * inv;
    let wb = ((cx - px0) * (ay - py) - (cy - py) * (ax - px0)) * inv;
    for (let x = minX, i = y * W + minX; x <= maxX; x++, i++, wa += Ax, wb += Bx) {
      const wc = 1 - wa - wb;
      if (wa < e || wb < e || wc < e) continue;
      const d = ad * wa + bd * wb + cd * wc;
      if (d <= depth[i]!) continue;
      if (clip) { const z = clip[0] * wa + clip[1] * wb + clip[2] * wc; if (z > clip[3] || z < clip[4]) continue; }
      if (cut) { const P = cut.P; if (cut.f(P[cut.a]! * wa + P[cut.b]! * wb + P[cut.c]! * wc, P[cut.a + 1]! * wa + P[cut.b + 1]! * wb + P[cut.c + 1]! * wc, P[cut.a + 2]! * wa + P[cut.b + 2]! * wb + P[cut.c + 2]! * wc)) continue; }
      depth[i] = d; tri[i] = t; WA[i] = wa; WB[i] = wb;
    }
  }
}
