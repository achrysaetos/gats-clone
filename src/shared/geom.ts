/**
 * Polygon geometry for maps: the authoring types (`MapPoly`, `MapDoor`, `MapRoof`), the authoring helpers (`poly`, `halfTurn`),
 * the concave -> convex split, and the circle / segment tests against one convex part.
 * Pure math with no imports from the rest of the sim, so movement, bots, lint and the client can all share it. See docs/maps/GEOMETRY.md.
 */

export type Pt = { x: number; y: number };

/** A solid polygon on a map. Concave shapes are split into convex parts when the map loads. */
export type MapPoly = {
  points: readonly Pt[];
  material: string;
  /** Px of south-facing front face in the tilt art. */
  height?: number;
  /** Default true. False: bodies are stopped but rounds fly over. */
  blocksBullets?: boolean;
  /** Default true. False: bodies are stopped but sight and light pass. */
  blocksSight?: boolean;
  id?: string;
  /** Parts of one set piece share a group; art can draw the group as one object. */
  group?: string;
  /** The part's name inside its group ('fuselage', 'wing-l'). */
  part?: string;
  /** The shape's name ('cargoPlane') so a theme can paint the whole piece. */
  shape?: string;
};

export type DoorKind = 'slide' | 'swing' | 'double-slide' | 'double-swing';

export type MapDoor = {
  id: string;
  kind: DoorKind;
  /** Start of the span on the door's centre line. */
  x: number;
  y: number;
  /** Span (opening width) in px. */
  w: number;
  /** 'h': the span runs along +x from (x, y). 'v': along +y. */
  axis: 'h' | 'v';
  /** Single leaves: the end the leaf is anchored to (swing) or retracts into (slide). Default 'start'. */
  hinge?: 'start' | 'end';
  material: string;
  /** Slide kinds: opens when anyone is near, closes after `closeMs`. Default true. False: toggled with use (E). */
  auto?: boolean;
  locked?: boolean;
  thick?: number;
  /** Swing only: opens only toward this side (+1 is toward +y for 'h', +x for 'v'). Default: away from whoever pushes. */
  side?: 1 | -1;
  closeMs?: number;
  /** Colour of the light that leaks out when the door is open. */
  glow?: string;
};

export type MapRoof = { id: string; points: readonly Pt[]; material?: string; tint?: string };

/** A convex solid as a wall rect carries it: counter-clockwise by the positive-area rule, flat `[x0, y0, x1, y1, ...]`. */
export type Convex = readonly number[];

const EPS = 1e-9;

export const signedArea = (pts: readonly Pt[]): number => {
  let a = 0;
  for (let i = 0; i < pts.length; i++) { const p = pts[i]!, q = pts[(i + 1) % pts.length]!; a += p.x * q.y - q.x * p.y; }
  return a / 2;
};

const tidy = (pts: readonly Pt[]): Pt[] => {
  // Drops repeated points and collinear middles, and winds the polygon so its signed area is positive.
  let out = pts.filter((p, i) => { const q = pts[(i + 1) % pts.length]!; return Math.hypot(p.x - q.x, p.y - q.y) > 1e-6; });
  for (let again = true; again && out.length > 3;) {
    again = false;
    for (let i = 0; i < out.length; i++) {
      const a = out[(i + out.length - 1) % out.length]!, b = out[i]!, c = out[(i + 1) % out.length]!;
      const cr = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
      if (Math.abs(cr) < 1e-7 * Math.max(1, Math.hypot(b.x - a.x, b.y - a.y) * Math.hypot(c.x - b.x, c.y - b.y))) { out = out.filter((_, j) => j !== i); again = true; break; }
    }
  }
  return signedArea(out) < 0 ? [...out].reverse() : out;
};

const cross3 = (a: Pt, b: Pt, c: Pt) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);

export function isConvex(pts: readonly Pt[]): boolean {
  const n = pts.length;
  for (let i = 0; i < n; i++) if (cross3(pts[i]!, pts[(i + 1) % n]!, pts[(i + 2) % n]!) < -1e-7) return false;
  return true;
}

const inTriangle = (p: Pt, a: Pt, b: Pt, c: Pt) => cross3(a, b, p) >= -EPS && cross3(b, c, p) >= -EPS && cross3(c, a, p) >= -EPS;

/** Ear clipping: a positive-area simple polygon into triangles of vertex indices. */
function triangulate(pts: readonly Pt[]): [number, number, number][] {
  const idx = pts.map((_, i) => i);
  const tris: [number, number, number][] = [];
  while (idx.length > 3) {
    let cut = -1;
    for (let k = 0; k < idx.length && cut < 0; k++) {
      const ia = idx[(k + idx.length - 1) % idx.length]!, ib = idx[k]!, ic = idx[(k + 1) % idx.length]!;
      const a = pts[ia]!, b = pts[ib]!, c = pts[ic]!;
      if (cross3(a, b, c) <= EPS) continue;
      let clear = true;
      for (const j of idx) {
        if (j === ia || j === ib || j === ic) continue;
        const p = pts[j]!;
        if ((p.x === a.x && p.y === a.y) || (p.x === b.x && p.y === b.y) || (p.x === c.x && p.y === c.y)) continue;
        if (inTriangle(p, a, b, c)) { clear = false; break; }
      }
      if (clear) cut = k;
    }
    if (cut < 0) cut = idx.findIndex((_, k) => cross3(pts[idx[(k + idx.length - 1) % idx.length]!]!, pts[idx[k]!]!, pts[idx[(k + 1) % idx.length]!]!) > EPS);
    if (cut < 0) break;
    tris.push([idx[(cut + idx.length - 1) % idx.length]!, idx[cut]!, idx[(cut + 1) % idx.length]!]);
    idx.splice(cut, 1);
  }
  if (idx.length === 3 && cross3(pts[idx[0]!]!, pts[idx[1]!]!, pts[idx[2]!]!) > EPS) tris.push([idx[0]!, idx[1]!, idx[2]!]);
  return tris;
}

/** Splits a simple polygon (convex or concave, either winding) into convex parts, each wound positive-area. Triangulates by ear clipping, then merges neighbours while they stay convex (Hertel-Mehlhorn). */
export function decompose(points: readonly Pt[]): Pt[][] {
  const pts = tidy(points);
  if (pts.length < 3) return [];
  if (isConvex(pts)) return [pts];
  const polys: number[][] = triangulate(pts).map((t) => [...t]);
  const convexLoop = (loop: readonly number[]) => isConvex(loop.map((i) => pts[i]!));
  for (let merged = true; merged;) {
    merged = false;
    outer: for (let i = 0; i < polys.length; i++) {
      const A = polys[i]!;
      for (let ai = 0; ai < A.length; ai++) {
        const u = A[ai]!, v = A[(ai + 1) % A.length]!;
        for (let j = i + 1; j < polys.length; j++) {
          const B = polys[j]!;
          const bi = B.findIndex((x, k) => x === v && B[(k + 1) % B.length] === u);
          if (bi < 0) continue;
          // A runs u->v, B runs v->u: walk A from v round to u, then B from u round to v, skipping the shared edge.
          const loop: number[] = [];
          for (let k = 1; k <= A.length; k++) loop.push(A[(ai + k) % A.length]!);
          for (let k = 2; k < B.length; k++) loop.push(B[(bi + k) % B.length]!);
          if (!convexLoop(loop)) continue;
          polys[i] = loop;
          polys.splice(j, 1);
          merged = true;
          break outer;
        }
      }
    }
  }
  return polys.map((loop) => tidy(loop.map((i) => pts[i]!)));
}

export const flat = (pts: readonly Pt[]): number[] => pts.flatMap((p) => [p.x, p.y]);
export const unflat = (f: readonly number[]): Pt[] => Array.from({ length: f.length / 2 }, (_, i) => ({ x: f[2 * i]!, y: f[2 * i + 1]! }));

export type Bounds = { x: number; y: number; w: number; h: number };
const boundsOf = (pts: readonly Pt[]): Bounds => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
};

export type Transform = { x?: number; y?: number; rot?: number; scale?: number; flipX?: boolean };

const circlePts = (cx: number, cy: number, r: number, segments: number): Pt[] =>
  Array.from({ length: segments }, (_, i) => ({ x: cx + Math.cos((i / segments) * 2 * Math.PI) * r, y: cy + Math.sin((i / segments) * 2 * Math.PI) * r }));

/** Authoring helpers; every one returns a plain point list. */
export const poly = {
  rect: (x: number, y: number, w: number, h: number): Pt[] => [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }],
  circle: circlePts,
  /** A stadium: two circles of radius `r` at the ends joined by straight sides. `segments` points per cap. */
  capsule(x1: number, y1: number, x2: number, y2: number, r: number, segments = 8): Pt[] {
    const a = Math.atan2(y2 - y1, x2 - x1);
    const out: Pt[] = [];
    for (let i = 0; i <= segments; i++) { const t = a - Math.PI / 2 + (i / segments) * Math.PI; out.push({ x: x2 + Math.cos(t) * r, y: y2 + Math.sin(t) * r }); }
    for (let i = 0; i <= segments; i++) { const t = a + Math.PI / 2 + (i / segments) * Math.PI; out.push({ x: x1 + Math.cos(t) * r, y: y1 + Math.sin(t) * r }); }
    return out;
  },
  /** `[[x, y], ...]`, a flat `[x, y, x, y, ...]` or `"x,y x,y ..."`. */
  fromPath(path: ReadonlyArray<readonly [number, number]> | readonly number[] | string): Pt[] {
    if (typeof path === 'string') {
      const nums = path.split(/[\s,]+/).filter(Boolean).map(Number);
      if (nums.length % 2 || nums.some((n) => !Number.isFinite(n))) throw new Error(`poly.fromPath: bad path '${path}'`);
      return Array.from({ length: nums.length / 2 }, (_, i) => ({ x: nums[2 * i]!, y: nums[2 * i + 1]! }));
    }
    if (typeof path[0] === 'number') return unflat(path as readonly number[]);
    return (path as ReadonlyArray<readonly [number, number]>).map(([x, y]) => ({ x, y }));
  },
  /** Order: mirror x, scale, rotate (radians), translate. */
  transform(points: readonly Pt[], t: Transform = {}): Pt[] {
    const s = t.scale ?? 1, c = Math.cos(t.rot ?? 0), n = Math.sin(t.rot ?? 0);
    return points.map((p) => {
      const x = (t.flipX ? -p.x : p.x) * s, y = p.y * s;
      return { x: (t.x ?? 0) + x * c - y * n, y: (t.y ?? 0) + x * n + y * c };
    });
  },
  /** An annular sector (a curved wall) between radii `rIn` and `rOut` and angles `a0` to `a1`. */
  arc(cx: number, cy: number, rIn: number, rOut: number, a0: number, a1: number, segments = 12): Pt[] {
    const at = (r: number, i: number) => ({ x: cx + Math.cos(a0 + ((a1 - a0) * i) / segments) * r, y: cy + Math.sin(a0 + ((a1 - a0) * i) / segments) * r });
    return [...Array.from({ length: segments + 1 }, (_, i) => at(rOut, i)), ...Array.from({ length: segments + 1 }, (_, i) => at(rIn, segments - i))];
  },
  area: (pts: readonly Pt[]): number => Math.abs(signedArea(pts)),
  bounds: boundsOf,
  centroid(pts: readonly Pt[]): Pt {
    let a = 0, cx = 0, cy = 0;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i]!, q = pts[(i + 1) % pts.length]!, k = p.x * q.y - q.x * p.y;
      a += k; cx += (p.x + q.x) * k; cy += (p.y + q.y) * k;
    }
    return a === 0 ? pts[0] ?? { x: 0, y: 0 } : { x: cx / (3 * a), y: cy / (3 * a) };
  },
  isConvex,
};

/** Builds a `MapPoly`. */
export const make = (points: readonly Pt[], material: string, opts: Partial<Omit<MapPoly, 'points' | 'material'>> = {}): MapPoly => ({ points, material, ...opts });

const turnPt = (p: Pt, size: number): Pt => ({ x: size - p.x, y: size - p.y });

/** The 180 degree turn about the map centre that makes the other half of a fair map. Works on a point list, a `MapPoly`, a `MapDoor` or a `MapRoof`; ids gain a `~`. */
export function halfTurn(pts: readonly Pt[], size: number): Pt[];
export function halfTurn(p: MapPoly, size: number): MapPoly;
export function halfTurn(p: MapDoor, size: number): MapDoor;
export function halfTurn(p: MapRoof, size: number): MapRoof;
export function halfTurn(p: readonly Pt[] | MapPoly | MapDoor | MapRoof, size: number): Pt[] | MapPoly | MapDoor | MapRoof {
  if (Array.isArray(p)) return (p as readonly Pt[]).map((q) => turnPt(q, size));
  if ('kind' in p) {
    const d = p as MapDoor;
    return { ...d, id: `${d.id}~`, x: d.axis === 'h' ? size - d.x - d.w : size - d.x, y: d.axis === 'v' ? size - d.y - d.w : size - d.y, ...(d.hinge && { hinge: d.hinge === 'start' ? 'end' as const : 'start' as const }), ...(d.side && { side: -d.side as 1 | -1 }) };
  }
  const q = p as MapPoly | MapRoof;
  return { ...q, points: q.points.map((r) => turnPt(r, size)), ...(q.id !== undefined && { id: `${q.id}~` }) } as MapPoly | MapRoof;
}

// ---- collision against one convex part (flat points, positive area) ----

/** Push-out of a circle from a convex part: the new center, or null when they do not overlap (touching is not overlap). */
export function pushOutConvex(x: number, y: number, r: number, pts: Convex): Pt | null {
  const n = pts.length / 2;
  let smax = -Infinity, nx = 0, ny = 0;
  for (let i = 0; i < n; i++) {
    const ax = pts[2 * i]!, ay = pts[2 * i + 1]!, bx = pts[2 * ((i + 1) % n)]!, by = pts[2 * ((i + 1) % n) + 1]!;
    const ex = bx - ax, ey = by - ay, len = Math.hypot(ex, ey);
    if (len === 0) continue;
    const ux = ey / len, uy = -ex / len;
    const s = ux * (x - ax) + uy * (y - ay);
    if (s > smax) { smax = s; nx = ux; ny = uy; }
    if (s >= r) return null;
  }
  if (smax < 0) return { x: x + nx * (r - smax), y: y + ny * (r - smax) };
  // Outside the part but nearer than r to its face (smax < r): the closest feature is an edge or a vertex of the visible chain.
  let bd2 = Infinity, bx0 = x, by0 = y;
  for (let i = 0; i < n; i++) {
    const ax = pts[2 * i]!, ay = pts[2 * i + 1]!, bx = pts[2 * ((i + 1) % n)]!, by = pts[2 * ((i + 1) % n) + 1]!;
    const ex = bx - ax, ey = by - ay, len2 = ex * ex + ey * ey;
    if (len2 === 0) continue;
    const t = Math.max(0, Math.min(1, ((x - ax) * ex + (y - ay) * ey) / len2));
    const cx = ax + ex * t, cy = ay + ey * t, d2 = (x - cx) ** 2 + (y - cy) ** 2;
    if (d2 < bd2) { bd2 = d2; bx0 = cx; by0 = cy; }
  }
  if (bd2 >= r * r) return null;
  if (bd2 === 0) return { x: x + nx * r, y: y + ny * r };
  const d = Math.sqrt(bd2);
  return { x: bx0 + ((x - bx0) / d) * r, y: by0 + ((y - by0) / d) * r };
}

export const circleHitsConvex = (x: number, y: number, r: number, pts: Convex): boolean => pushOutConvex(x, y, r, pts) !== null;

/** The earliest t in 0..1 where the segment (p + t d) is inside the convex part (0 when it starts inside), or null. */
export function segmentEntersConvexAt(px: number, py: number, dx: number, dy: number, pts: Convex): number | null {
  const n = pts.length / 2;
  let t0 = 0, t1 = 1;
  for (let i = 0; i < n; i++) {
    const ax = pts[2 * i]!, ay = pts[2 * i + 1]!, bx = pts[2 * ((i + 1) % n)]!, by = pts[2 * ((i + 1) % n) + 1]!;
    const nx = by - ay, ny = -(bx - ax);
    const denom = nx * dx + ny * dy, k = nx * (ax - px) + ny * (ay - py);
    if (denom === 0) { if (k < 0) return null; continue; }
    const t = k / denom;
    if (denom > 0) t1 = Math.min(t1, t); else t0 = Math.max(t0, t);
    if (t0 > t1) return null;
  }
  return t0;
}

/** The outward unit normal of the edge of a convex part nearest to (x, y), and the point on it; for bouncing a grenade off a face. */
export function nearestEdge(x: number, y: number, pts: Convex): { nx: number; ny: number; px: number; py: number; dist: number } {
  const n = pts.length / 2;
  let best = { nx: 0, ny: -1, px: x, py: y, dist: Infinity };
  for (let i = 0; i < n; i++) {
    const ax = pts[2 * i]!, ay = pts[2 * i + 1]!, bx = pts[2 * ((i + 1) % n)]!, by = pts[2 * ((i + 1) % n) + 1]!;
    const ex = bx - ax, ey = by - ay, len2 = ex * ex + ey * ey;
    if (len2 === 0) continue;
    const t = Math.max(0, Math.min(1, ((x - ax) * ex + (y - ay) * ey) / len2));
    const cx = ax + ex * t, cy = ay + ey * t, d = Math.hypot(x - cx, y - cy);
    if (d < best.dist) { const len = Math.sqrt(len2); best = { nx: ey / len, ny: -ex / len, px: cx, py: cy, dist: d }; }
  }
  return best;
}

/** A convex part as a wall rect: the AABB plus the flat points. */
export function partRect(part: readonly Pt[]): Bounds & { pts: number[] } {
  return { ...boundsOf(part), pts: flat(part) };
}

/** Whether two convex parts overlap (touching edges do not count). Separating-axis test on both parts' edge normals. */
export function convexOverlap(a: Convex, b: Convex): boolean {
  const separated = (p: Convex, q: Convex): boolean => {
    const n = p.length / 2;
    for (let i = 0; i < n; i++) {
      const ax = p[2 * i]!, ay = p[2 * i + 1]!, bx = p[2 * ((i + 1) % n)]!, by = p[2 * ((i + 1) % n) + 1]!;
      const nx = by - ay, ny = -(bx - ax);
      const base = nx * ax + ny * ay;
      let lo = Infinity;
      for (let j = 0; j < q.length; j += 2) lo = Math.min(lo, nx * q[j]! + ny * q[j + 1]! - base);
      if (lo >= -1e-9 * Math.hypot(nx, ny)) return true;
    }
    return false;
  };
  return !separated(a, b) && !separated(b, a);
}

/** An axis-aligned box as convex points, grown by `pad` on every side. */
export const boxPts = (x: number, y: number, w: number, h: number, pad = 0): number[] => [x - pad, y - pad, x + w + pad, y - pad, x + w + pad, y + h + pad, x - pad, y + h + pad];
