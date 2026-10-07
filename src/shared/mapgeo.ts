/**
 * Compiles a map's polygons into the convex wall parts the sim collides with, and builds maps that carry polygons, doors and roofs.
 * See docs/maps/GEOMETRY.md.
 */
import { decompose, halfTurn, partRect, type MapDoor, type MapPoly, type MapRoof, type Pt } from './geom.ts';
import type { MapDef, MapWall, WallMaterial } from './maps.ts';
import type { Rect } from './sim/movement.ts';

/** One convex piece of one `MapPoly`: a wall rect with its points; `pid` is the poly's index in `MapDef.polys`. */
export type PolyPart = Rect & { pts: readonly number[]; material: WallMaterial; pid: number };

const CACHE = new WeakMap<object, readonly PolyPart[]>();

/** The convex parts of every polygon on a map, cached per `polys` array. */
export function polyParts(def: Pick<MapDef, 'polys'>): readonly PolyPart[] {
  const polys = def.polys;
  if (!polys || polys.length === 0) return NONE;
  const hit = CACHE.get(polys);
  if (hit) return hit;
  const parts: PolyPart[] = [];
  polys.forEach((p, pid) => {
    for (const convex of decompose(p.points)) {
      parts.push({ ...partRect(convex), material: p.material as WallMaterial, pid, ...(p.blocksBullets === false && { nb: true as const }), ...(p.blocksSight === false && { ns: true as const }) });
    }
  });
  CACHE.set(polys, parts);
  return parts;
}
const NONE: readonly PolyPart[] = [];

/** Every static solid of a map: its grid walls and its polygon parts (not doors). */
export const staticSolids = (def: Pick<MapDef, 'walls' | 'polys'>): readonly Rect[] => (def.polys?.length ? [...def.walls, ...polyParts(def)] : def.walls);

export type Geometry = { polys?: readonly MapPoly[]; doors?: readonly MapDoor[]; roofs?: readonly MapRoof[]; /** Add each piece's half-turn twin (default true). */ twin?: boolean };

const simple = (pts: readonly Pt[]): boolean => {
  // No two non-adjacent edges cross.
  const n = pts.length;
  const ccw = (a: Pt, b: Pt, c: Pt) => (c.y - a.y) * (b.x - a.x) - (b.y - a.y) * (c.x - a.x);
  for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) {
    if (i === 0 && j === n - 1) continue;
    const a = pts[i]!, b = pts[(i + 1) % n]!, c = pts[j]!, d = pts[(j + 1) % n]!;
    if (ccw(a, c, d) * ccw(b, c, d) < 0 && ccw(a, b, c) * ccw(a, b, d) < 0) return false;
  }
  return true;
};

/** `def` with polygons, doors and roofs added; throws on a malformed one. */
export function withGeometry(def: MapDef, g: Geometry): MapDef {
  const twin = g.twin !== false;
  const polys = [...(def.polys ?? []), ...(g.polys ?? []), ...(twin ? (g.polys ?? []).map((p) => halfTurn(p, def.size)) : [])];
  const doors = [...(def.doors ?? []), ...(g.doors ?? []), ...(twin ? (g.doors ?? []).map((d) => halfTurn(d, def.size)) : [])];
  const roofs = [...(def.roofs ?? []), ...(g.roofs ?? []), ...(twin ? (g.roofs ?? []).map((r) => halfTurn(r, def.size)) : [])];
  validateGeometry(def.name, def.size, polys, doors, roofs);
  return { ...def, ...(polys.length && { polys }), ...(doors.length && { doors }), ...(roofs.length && { roofs }) };
}

export function validateGeometry(name: string, size: number, polys: readonly MapPoly[], doors: readonly MapDoor[], roofs: readonly MapRoof[]): void {
  const ids = new Set<string>();
  const uniq = (kind: string, id: string | undefined) => {
    if (id === undefined) return;
    if (ids.has(`${kind}:${id}`)) throw new Error(`${name}: duplicate ${kind} id '${id}'`);
    ids.add(`${kind}:${id}`);
  };
  for (const p of polys) {
    uniq('poly', p.id);
    if (p.points.length < 3) throw new Error(`${name}: poly '${p.id ?? p.material}' needs 3 or more points`);
    if (!simple(p.points)) throw new Error(`${name}: poly '${p.id ?? p.material}' crosses itself`);
    for (const q of p.points) if (!(q.x >= 0 && q.x <= size && q.y >= 0 && q.y <= size)) throw new Error(`${name}: poly '${p.id ?? p.material}' leaves the world at ${Math.round(q.x)},${Math.round(q.y)}`);
  }
  for (const d of doors) {
    uniq('door', d.id);
    if (!(d.w >= 64)) throw new Error(`${name}: door '${d.id}' is ${d.w} px wide; the least is 64`);
  }
  for (const r of roofs) {
    uniq('roof', r.id);
    if (r.points.length < 3) throw new Error(`${name}: roof '${r.id}' needs 3 or more points`);
  }
}

/** Grid wall as the sim holds it. */
export type { MapWall };
