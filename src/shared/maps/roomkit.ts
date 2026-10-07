/**
 * Small authoring helpers for the retrofit maps: rooms made of wall polygons with door gaps, roofs over them, and the odd rounded shapes
 * (octagon, cigar, rounded rectangle). Everything is plain `MapPoly` / `MapDoor` / `MapRoof` data for `withGeometry` (docs/maps/GEOMETRY.md).
 */
import { make, poly, type MapDoor, type MapPoly, type MapRoof, type Pt } from '../geom.ts';

type Side = 'n' | 's' | 'e' | 'w';
/** A door gap in one side of a room: `at` is where it starts along that side (x for n and s, y for e and w), `w` its width. */
type Gap = { side: Side; at: number; w: number; /** Leave the opening empty (no door is made for it). */ open?: true };
export type RoomSpec = { id: string; x: number; y: number; w: number; h: number; /** Wall thickness (default 50). */ t?: number; material: string; height?: number; gaps: readonly Gap[]; blocksSight?: boolean };

/** The wall pieces of a room: a hollow rectangle (outer box x, y, w, h) with the gaps cut out of it. */
export function roomWalls(r: RoomSpec): MapPoly[] {
  const t = r.t ?? 50;
  const out: MapPoly[] = [];
  const side = (s: Side, from: number, to: number, fixed: number, horizontal: boolean) => {
    const cuts = r.gaps.filter((g) => g.side === s).sort((a, b) => a.at - b.at);
    let at = from, n = 0;
    const piece = (a: number, b: number) => {
      if (b - a < 1) return;
      const pts = horizontal ? poly.rect(a, fixed, b - a, t) : poly.rect(fixed, a, t, b - a);
      out.push(make(pts, r.material, { id: `${r.id}:${s}${n++}`, height: r.height ?? 14, ...(r.blocksSight === false && { blocksSight: false }), group: r.id }));
    };
    for (const g of cuts) { piece(at, g.at); at = g.at + g.w; }
    piece(at, to);
  };
  side('n', r.x, r.x + r.w, r.y, true);
  side('s', r.x, r.x + r.w, r.y + r.h - t, true);
  side('w', r.y + t, r.y + r.h - t, r.x, false);
  side('e', r.y + t, r.y + r.h - t, r.x + r.w - t, false);
  return out;
}

type DoorOpts = Pick<MapDoor, 'kind' | 'material'> & Partial<Omit<MapDoor, 'id' | 'x' | 'y' | 'w' | 'axis'>>;
/** The door that fills `gap` of room `r`, sitting on the wall's centre line. */
export function roomDoor(r: RoomSpec, gap: Gap, id: string, o: DoorOpts): MapDoor {
  const t = r.t ?? 50;
  const horizontal = gap.side === 'n' || gap.side === 's';
  const fixed = gap.side === 'n' ? r.y + t / 2 : gap.side === 's' ? r.y + r.h - t / 2 : gap.side === 'w' ? r.x + t / 2 : r.x + r.w - t / 2;
  return { id, ...o, x: horizontal ? gap.at : fixed, y: horizontal ? fixed : gap.at, w: gap.w, axis: horizontal ? 'h' : 'v' };
}

/** A roof over a room (its whole outer box, wall tops included). */
export const roomRoof = (r: Pick<RoomSpec, 'x' | 'y' | 'w' | 'h'>, id: string, material: string, tint?: string): MapRoof =>
  ({ id, points: poly.rect(r.x, r.y, r.w, r.h), material, ...(tint && { tint }) });

/** A rectangle with rounded corners (`seg` points per corner). */
export function roundRect(x: number, y: number, w: number, h: number, r: number, seg = 4): Pt[] {
  const out: Pt[] = [];
  const corner = (cx: number, cy: number, a0: number) => { for (let i = 0; i <= seg; i++) { const a = a0 + (i / seg) * (Math.PI / 2); out.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r }); } };
  corner(x + w - r, y + r, -Math.PI / 2);
  corner(x + w - r, y + h - r, 0);
  corner(x + r, y + h - r, Math.PI / 2);
  corner(x + r, y + r, Math.PI);
  return out;
}

/** A regular octagon of circumradius `r` with a flat side facing north. */
export const octagon = (cx: number, cy: number, r: number): Pt[] => poly.transform(poly.circle(0, 0, r, 8), { x: cx, y: cy, rot: Math.PI / 8 });

/**
 * A cigar: a pointed bow at the west end (x0), a long parallel body of half-width `half`, a rounded stern at the east end (x1).
 * `bow` and `stern` are how far the taper and the round-off reach in from each end.
 */
export function cigar(x0: number, x1: number, cy: number, half: number, bow: number, stern: number, seg = 5): Pt[] {
  const top: Pt[] = [];
  for (let i = 0; i <= seg; i++) { const s = i / seg; top.push({ x: x0 + bow * s, y: cy - half * s ** 0.85 }); }
  for (let i = 1; i <= seg; i++) { const s = i / seg; top.push({ x: x1 - stern + stern * s, y: cy - half * Math.sqrt(Math.max(0, 1 - s * s)) }); }
  const bottom = top.slice(1, -1).map((p) => ({ x: p.x, y: 2 * cy - p.y })).reverse();
  return [...top, ...bottom];
}
