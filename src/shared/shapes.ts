/**
 * A library of set pieces at a believable size next to a player. `PX_PER_M` is the scale: a player (radius 24 px) is about 0.75 m wide.
 * Every shape is centred on (0, 0) with its nose toward +x, in px. `place` turns one into `MapPoly[]` on a map.
 */
import { make, poly, type MapPoly, type Pt, type Transform } from './geom.ts';

export const PX_PER_M = 64;

export type ShapePart = { part: string; points: readonly Pt[]; height?: number; blocksSight?: boolean; blocksBullets?: boolean };
export type Shape = { name: string; parts: readonly ShapePart[]; /** Overall box in px, before any rotation or scale. */ size: { w: number; h: number } };

const m = (pts: readonly (readonly [number, number])[]): Pt[] => pts.map(([x, y]) => ({ x: x * PX_PER_M, y: y * PX_PER_M }));
const mirrorY = (pts: readonly Pt[]): Pt[] => pts.map((p) => ({ x: p.x, y: -p.y })).reverse();
const cap = (x1: number, y1: number, x2: number, y2: number, r: number, seg = 7): Pt[] => poly.capsule(x1 * PX_PER_M, y1 * PX_PER_M, x2 * PX_PER_M, y2 * PX_PER_M, r * PX_PER_M, seg);
const disc = (x: number, y: number, r: number, seg = 16): Pt[] => poly.circle(x * PX_PER_M, y * PX_PER_M, r * PX_PER_M, seg);
const box = (x0: number, y0: number, x1: number, y1: number): Pt[] => poly.rect(x0 * PX_PER_M, y0 * PX_PER_M, (x1 - x0) * PX_PER_M, (y1 - y0) * PX_PER_M);

function shape(name: string, parts: readonly ShapePart[]): Shape {
  const b = poly.bounds(parts.flatMap((p) => p.points));
  return { name, parts, size: { w: Math.round(b.w), h: Math.round(b.h) } };
}

/** A part and its mirror image across the long axis ('wing' becomes 'wing-l' and 'wing-r'). */
const pair = (part: string, pts: readonly Pt[], extra: Partial<ShapePart> = {}): ShapePart[] => [
  { part: `${part}-r`, points: pts, ...extra },
  { part: `${part}-l`, points: mirrorY(pts), ...extra },
];

/** A twin-prop transport: about 22 m long, 24 m wingspan, fuselage 3.2 m across. */
export const cargoPlane = shape('cargoPlane', [
  { part: 'fuselage', points: cap(-9.2, 0, 9.0, 0, 1.6, 8), height: 44 },
  ...pair('wing', m([[2.4, 1.3], [-1.8, 1.3], [-3.6, 12], [-1.6, 12]]), { height: 10 }),
  ...pair('engine', cap(0.4, 5.2, 3.4, 5.2, 0.8, 5), { height: 22 }),
  ...pair('engine2', cap(-0.9, 9.0, 1.6, 9.0, 0.6, 5), { height: 22 }),
  ...pair('tailplane', m([[-7.6, 1.2], [-10.4, 1.2], [-11.2, 4.8], [-9.6, 4.8]]), { height: 8 }),
]);

/** A fighter: about 15 m long, 9 m wingspan, a narrow fuselage with swept delta wings. */
export const fighterJet = shape('fighterJet', [
  { part: 'fuselage', points: cap(-6.2, 0, 6.2, 0, 0.75, 7), height: 28 },
  ...pair('wing', m([[1.6, 0.6], [-3.8, 0.6], [-5.0, 4.6], [-3.4, 4.6]]), { height: 8 }),
  ...pair('tailplane', m([[-5.6, 0.6], [-7.4, 0.6], [-7.9, 2.4], [-6.8, 2.4]]), { height: 8 }),
  ...pair('intake', cap(0.2, 1.05, 2.8, 1.05, 0.35, 4), { height: 18 }),
]);

/** A utility helicopter: cabin and tail boom (the rotor is art, not collision). */
export const helicopter = shape('helicopter', [
  { part: 'cabin', points: cap(-1.6, 0, 2.2, 0, 1.15, 8), height: 30 },
  { part: 'boom', points: cap(-7.6, 0, -1.4, 0, 0.32, 3), height: 16 },
  ...pair('skid', m([[-1.9, 1.3], [2.4, 1.3], [2.4, 1.55], [-1.9, 1.55]]), { height: 6 }),
  ...pair('tailfin', m([[-7.6, 0.2], [-8.2, 0.2], [-8.2, 1.1], [-7.8, 1.1]]), { height: 10 }),
]);

const chamfered = (w: number, h: number, c: number): Pt[] =>
  m([[-w / 2 + c, -h / 2], [w / 2 - c, -h / 2], [w / 2, -h / 2 + c], [w / 2, h / 2 - c], [w / 2 - c, h / 2], [-w / 2 + c, h / 2], [-w / 2, h / 2 - c], [-w / 2, -h / 2 + c]]);

/** A 20 m rail car, 3 m wide. */
export const trainCar = shape('trainCar', [{ part: 'body', points: chamfered(20, 3, 0.35), height: 40 }]);

/** A locomotive: 19 m long, a tapered nose (+x), a cab at the back. */
export const locomotive = shape('locomotive', [
  { part: 'cab', points: chamfered(5.5, 3.2, 0.25).map((p) => ({ x: p.x - 6.6 * PX_PER_M, y: p.y })), height: 46 },
  { part: 'engine', points: m([[-4, -1.4], [6.4, -1.4], [9.5, -0.7], [9.5, 0.7], [6.4, 1.4], [-4, 1.4]]), height: 38 },
]);

/** A main battle tank: 7 m hull, 3.4 m wide, round turret and a long gun. */
export const tank = shape('tank', [
  { part: 'hull', points: m([[-3.4, -1.7], [2.6, -1.7], [3.4, -0.9], [3.4, 0.9], [2.6, 1.7], [-3.4, 1.7]]), height: 24 },
  { part: 'turret', points: disc(-0.3, 0, 1.25, 12), height: 40 },
  { part: 'gun', points: m([[0.6, -0.14], [5.2, -0.14], [5.2, 0.14], [0.6, 0.14]]), height: 36 },
]);

/** A box truck: 8 m, cab in front. */
export const truck = shape('truck', [
  { part: 'cab', points: m([[1.6, -1.25], [3.6, -1.25], [4.0, -0.8], [4.0, 0.8], [3.6, 1.25], [1.6, 1.25]]), height: 36 },
  { part: 'box', points: box(-4.2, -1.35, 1.4, 1.35), height: 44 },
]);

/** A work boat: 12 m, 4 m beam, a pointed bow (+x) and a wheelhouse. */
export const boat = shape('boat', [
  { part: 'hull', points: m([[-6, -1.9], [3.2, -2], [6, -0.6], [6, 0.6], [3.2, 2], [-6, 1.9]]), height: 18 },
  { part: 'house', points: box(-3.2, -1.2, -0.4, 1.2), height: 40 },
]);

/** A storage tank: 10 m across. */
export const roundTank = shape('roundTank', [{ part: 'tank', points: disc(0, 0, 5, 28), height: 52 }]);

/** A square pier, 1.2 m across. */
export const pillar = shape('pillar', [{ part: 'pier', points: box(-0.6, -0.6, 0.6, 0.6), height: 40 }]);

/** An L-shaped wall (a concave polygon): two 12 m by 2 m arms. */
export const lShape = shape('lShape', [{ part: 'wall', points: m([[-6, -6], [-4, -6], [-4, 4], [6, 4], [6, 6], [-6, 6]]), height: 16 }]);

/** A curved wall, 2 m thick, swept 100 degrees at a 10 m radius. */
export const arcWall = shape('arcWall', [{ part: 'wall', points: poly.arc(0, 0, 9 * PX_PER_M, 11 * PX_PER_M, -0.87, 0.87, 12), height: 16 }]);

/** A six-sided kiosk, 5 m across. */
export const hexKiosk = shape('hexKiosk', [{ part: 'kiosk', points: poly.circle(0, 0, 2.5 * PX_PER_M, 6), height: 34 }]);

export const SHAPES = { cargoPlane, fighterJet, helicopter, trainCar, locomotive, tank, truck, boat, roundTank, pillar, lShape, arcWall, hexKiosk } as const;

export type PlaceOpts = Partial<Pick<MapPoly, 'id' | 'group' | 'blocksBullets' | 'blocksSight' | 'height'>>;

/** Puts a shape on the map (`at` moves, turns, scales and mirrors it) as one `MapPoly` per part, all in one group. */
export function place(s: Shape, at: Transform, material: string, opts: PlaceOpts = {}): MapPoly[] {
  const group = opts.group ?? opts.id ?? `${s.name}@${Math.round(at.x ?? 0)},${Math.round(at.y ?? 0)}`;
  return s.parts.map((p) => make(poly.transform(p.points, at), material, {
    group, part: p.part, shape: s.name,
    ...(opts.id !== undefined && { id: `${opts.id}:${p.part}` }),
    ...((p.height ?? opts.height) !== undefined && { height: p.height ?? opts.height }),
    ...((p.blocksBullets ?? opts.blocksBullets) !== undefined && { blocksBullets: p.blocksBullets ?? opts.blocksBullets }),
    ...((p.blocksSight ?? opts.blocksSight) !== undefined && { blocksSight: p.blocksSight ?? opts.blocksSight }),
  }));
}
