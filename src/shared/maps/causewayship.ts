import { make, poly, signedArea, type MapDoor, type MapPoly, type MapRoof, type Pt } from '../geom.ts';

/**
 * Berthed ships for the Causeway harbour. A ship lies alongside a north-south quay (water to the west, the quay's face at
 * `quayX`), bow to the north. Its hull outline is a convex polygon whose quay side is flat for the middle of the ship, so the hull
 * touches the quay; the DECK inside is open floor and the hull side is a thin band of wall (the gunwale) with gaps where the
 * gangways come aboard. Everything on deck is described in ship coordinates (`u` from the bow down the ship, `v` out from the quay)
 * and turned into world rects here, so a berth is a handful of numbers. The pieces are plain `MapPoly`s, doors and roofs; the
 * west half is authored and `withGeometry` adds the half-turn twin.
 */

export type ShipSpec = {
  id: string;
  quayX: number;
  y0: number;
  length: number;
  beam: number;
  /** Length of the tapering bow and stern in px. */
  bow: number;
  stern: number;
  /** Width of the transom as a fraction of the beam. */
  transom: number;
  /** Thickness of the gunwale band. */
  wall: number;
  /** Gangway gaps on the quay side: start (`u`) and width. */
  gangways: readonly { u: number; w: number }[];
};

export type Rect4 = { x: number; y: number; w: number; h: number };

export type Ship = {
  spec: ShipSpec;
  /** World point of ship coordinates. */
  at: (u: number, v: number) => Pt;
  /** The world rect of `[u0,u1] x [v0,v1]` as a point list. */
  rect: (u0: number, u1: number, v0: number, v1: number) => Pt[];
  box: (u0: number, u1: number, v0: number, v1: number) => Rect4;
  hull: Pt[];
  /** The walkable deck: the hull pulled in by the gunwale. */
  deck: Pt[];
  /** The splice the harbour's water takes round the hull, from the quay point before the bow to the one after the stern. */
  waterCut: Pt[];
  gunwale: MapPoly[];
  gangways: Rect4[];
};

const NB = 6, NS = 3;

function offsetConvex(pts: readonly Pt[], t: number): Pt[] {
  const n = pts.length;
  return pts.map((p, i) => {
    const a = pts[(i + n - 1) % n]!, b = pts[(i + 1) % n]!;
    const d1 = { x: p.x - a.x, y: p.y - a.y }, d2 = { x: b.x - p.x, y: b.y - p.y };
    const l1 = Math.hypot(d1.x, d1.y) || 1, l2 = Math.hypot(d2.x, d2.y) || 1;
    // Edge normals on one side; `inset` below picks the side that shrinks the polygon.
    const n1 = { x: d1.y / l1, y: -d1.x / l1 };
    const n2 = { x: d2.y / l2, y: -d2.x / l2 };
    const dot = n1.x * n2.x + n1.y * n2.y;
    const k = t / (1 + dot);
    return { x: p.x + (n1.x + n2.x) * k, y: p.y + (n1.y + n2.y) * k };
  });
}

/** The inward normal sign check: a small test polygon must shrink. */
function inset(pts: readonly Pt[], t: number): Pt[] {
  const a = offsetConvex(pts, t);
  return Math.abs(signedArea(a)) < Math.abs(signedArea(pts)) ? a : offsetConvex(pts, -t);
}

export function ship(spec: ShipSpec): Ship {
  const { quayX, y0, length: L, beam: B } = spec;
  const at = (u: number, v: number): Pt => ({ x: quayX - v, y: y0 + u });
  const rect = (u0: number, u1: number, v0: number, v1: number): Pt[] => [at(u0, v1), at(u0, v0), at(u1, v0), at(u1, v1)].map((p) => ({ ...p }));
  const box = (u0: number, u1: number, v0: number, v1: number): Rect4 => ({ x: quayX - v1, y: y0 + u0, w: v1 - v0, h: u1 - u0 });

  // Width profile along the ship, bow tip first.
  const prof: { u: number; w: number }[] = [];
  for (let i = 0; i <= NB; i++) { const t = i / NB; prof.push({ u: spec.bow * t, w: B * (1 - (1 - t) ** 2.0) }); }
  for (let j = 0; j <= NS; j++) { const t = j / NS; prof.push({ u: L - spec.stern + spec.stern * t, w: B * (1 - (1 - spec.transom) * t ** 1.7) }); }
  const q = prof.map((p) => at(p.u, B / 2 - p.w / 2));
  const o = prof.map((p) => at(p.u, B / 2 + p.w / 2));
  const ia = NB, ib = NB + 1; // the first and last profile points that lie on the quay (full beam)

  // The hull outline, with the gangway gap ends inserted on the quay edge.
  const gaps = [...spec.gangways].sort((a, b) => a.u - b.u);
  const quayPts: { p: Pt; gapStart?: boolean; gapEnd?: boolean }[] = [];
  for (const g of gaps) {
    quayPts.push({ p: at(g.u, 0), gapStart: true });
    quayPts.push({ p: at(g.u + g.w, 0), gapEnd: true });
  }
  // Order, going round: quay side from the bow (tip) down to the stern, then the outboard side back up.
  const hullFull: { p: Pt; gapStart?: boolean; gapEnd?: boolean }[] = [];
  for (let i = 0; i <= ia; i++) if (!(i === 0 && false)) hullFull.push({ p: q[i]! });
  for (const g of quayPts) hullFull.push(g);
  for (let i = ib; i < prof.length; i++) hullFull.push({ p: q[i]! });
  for (let i = prof.length - 1; i >= 1; i--) hullFull.push({ p: o[i]! });
  // `tip` is q[0]; o[0] is the same point so it is left out.

  const hull = hullFull.map((h) => h.p);
  const inner = inset(hull, spec.wall);

  // Rotate so the list starts right after a gap's end, then cut the band into runs between gaps.
  const n = hull.length;
  const gapEdge = (i: number) => !!hullFull[i]!.gapStart; // the edge from i to i+1 is a gap when i is a gap start
  let start = hullFull.findIndex((h) => h.gapEnd);
  if (start < 0) start = 0;
  const gunwale: MapPoly[] = [];
  let run: number[] = [];
  let k = 0;
  const flush = () => {
    if (run.length > 0) {
      const last = run[run.length - 1]! + 1;
      const idx = [...run, last].map((i) => i % n);
      const outer = idx.map((i) => hull[i]!);
      const inn = idx.map((i) => inner[i]!).reverse();
      gunwale.push(make([...outer, ...inn], 'hull', { id: `${spec.id}:gun${k++}`, group: spec.id, part: 'gunwale', shape: 'ship', height: 20 }));
    }
    run = [];
  };
  for (let s = 0; s < n; s++) {
    const i = (start + s) % n;
    if (gapEdge(i)) { flush(); continue; }
    run.push(start + s);
  }
  flush();

  // The water's cut round the hull (see the file comment): from the quay point where the bow section ends back round to the one where the stern section begins.
  const cut: Pt[] = [];
  for (let i = ia; i >= 0; i--) cut.push(q[i]!);
  for (let i = 1; i < prof.length; i++) cut.push(o[i]!);
  for (let i = prof.length - 1; i >= ib; i--) cut.push(q[i]!);

  return {
    spec, at, rect, box, hull, deck: inner, waterCut: cut, gunwale,
    gangways: gaps.map((g) => box(g.u, g.u + g.w, -spec.wall - 4, spec.wall + 4)),
  };
}

/** An opening in a room's wall: where along that side (centre), how wide, and the door that fills it (none: a doorway). */
export type Opening = { side: 'n' | 's' | 'e' | 'w'; at: number; w: number; door?: Omit<MapDoor, 'id' | 'x' | 'y' | 'w' | 'axis'> };

export type RoomSpec = {
  id: string;
  /** Outer rectangle. */
  x: number; y: number; w: number; h: number;
  /** Wall thickness. */
  t?: number;
  material: string;
  height?: number;
  openings?: readonly Opening[];
  roof?: { material?: string; tint?: string } | false;
  group?: string;
  part?: string;
};

/** Walls of a rectangular room with openings cut and doors set in them, plus its roof. */
export function room(r: RoomSpec): { polys: MapPoly[]; doors: MapDoor[]; roofs: MapRoof[] } {
  const t = r.t ?? 30;
  const polys: MapPoly[] = [], doors: MapDoor[] = [];
  const group = r.group ?? r.id;
  let n = 0;
  const strip = (x: number, y: number, w: number, h: number) => { if (w > 0.5 && h > 0.5) polys.push(make(poly.rect(x, y, w, h), r.material, { id: `${r.id}:w${n++}`, group, part: r.part ?? 'wall', shape: 'room', ...(r.height !== undefined && { height: r.height }) })); };
  const along = (side: Opening['side'], from: number, to: number) => {
    const cuts = (r.openings ?? []).filter((o) => o.side === side).map((o) => [o.at - o.w / 2, o.at + o.w / 2] as const).sort((a, b) => a[0] - b[0]);
    const segs: [number, number][] = [];
    let cur = from;
    for (const [a, b] of cuts) { if (a > cur) segs.push([cur, a]); cur = Math.max(cur, b); }
    if (cur < to) segs.push([cur, to]);
    return segs;
  };
  // North and south walls run the full width; east and west run between them.
  for (const [a, b] of along('n', r.x, r.x + r.w)) strip(a, r.y, b - a, t);
  for (const [a, b] of along('s', r.x, r.x + r.w)) strip(a, r.y + r.h - t, b - a, t);
  for (const [a, b] of along('w', r.y + t, r.y + r.h - t)) strip(r.x, a, t, b - a);
  for (const [a, b] of along('e', r.y + t, r.y + r.h - t)) strip(r.x + r.w - t, a, t, b - a);
  (r.openings ?? []).forEach((o, i) => {
    if (!o.door) return;
    const start = o.at - o.w / 2;
    const horizontal = o.side === 'n' || o.side === 's';
    const line = o.side === 'n' ? r.y + t / 2 : o.side === 's' ? r.y + r.h - t / 2 : o.side === 'w' ? r.x + t / 2 : r.x + r.w - t / 2;
    doors.push({ id: `${r.id}:d${i}`, ...o.door, x: horizontal ? start : line, y: horizontal ? line : start, w: o.w, axis: horizontal ? 'h' : 'v', thick: o.door.thick ?? Math.min(14, t - 4) });
  });
  const roofs: MapRoof[] = r.roof === false ? [] : [{ id: `${r.id}:roof`, points: poly.rect(r.x - 2, r.y - 2, r.w + 4, r.h + 4), ...(r.roof?.material && { material: r.roof.material }), ...(r.roof?.tint && { tint: r.roof.tint }) }];
  return { polys, doors, roofs };
}
