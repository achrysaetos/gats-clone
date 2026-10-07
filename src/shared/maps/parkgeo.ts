/**
 * Park geometry (docs/maps/GEOMETRY.md), authored for the west half; `withGeometry` adds the half-turn twin. The bandstand is an octagonal
 * pavilion (three openings, a roof) round zone A, the fountain basin is four curved stone rims round zone B, trunks are round, two curved
 * hedges screen the plaza, and a boathouse and a cafe kiosk are roofed timber rooms with doors.
 */
import { make, poly, type MapDoor, type MapPoly, type MapRoof, type Pt } from '../geom.ts';
import type { Geometry } from '../mapgeo.ts';
import { octagon, roomDoor, roomRoof, roomWalls, type RoomSpec } from './roomkit.ts';

const TRUNKS: readonly (readonly [number, number, number])[] = [
  [2425, 175, 25], [2625, 925, 25], [1025, 1025, 25], [325, 1125, 25], [1375, 1125, 25], [475, 1525, 25], [1750, 1750, 50], [2525, 1825, 25],
  [525, 1925, 25], [2125, 1925, 25], [1825, 2425, 25], [2725, 2525, 25], [1425, 2625, 25], [2325, 2825, 25], [750, 3050, 50], [1725, 3025, 25],
  [2625, 3225, 25], [425, 3325, 25], [1525, 3625, 25], [825, 3725, 25], [525, 4125, 25], [2025, 4425, 25], [2525, 4625, 25], [175, 5025, 25],
  [1925, 5025, 25], [2350, 5050, 50], [625, 5125, 25], [2825, 5225, 25], [1225, 5525, 25],
];

/** The bandstand: an octagon round zone A (1125, 1725), 345 px to a corner, walls 50 thick. Sides run E, SE, S, SW, W, NW, N, NE. */
const BAND = { x: 1125, y: 1725, R: 345, Rin: 290 };
const bandSides = (): MapPoly[] => {
  const out: MapPoly[] = [];
  const at = (r: number, k: number): Pt => { const th = (k * Math.PI) / 4 - Math.PI / 8; return { x: BAND.x + Math.cos(th) * r, y: BAND.y + Math.sin(th) * r }; };
  const lerp = (a: Pt, b: Pt, s: number): Pt => ({ x: a.x + (b.x - a.x) * s, y: a.y + (b.y - a.y) * s });
  // Side k lies between corner k and k + 1, centred on angle k * 45 degrees: 0 E, 1 SE, 2 S, 3 SW, 4 W, 5 NW, 6 N, 7 NE.
  const kinds = ['wall', 'wall', 'open', 'wall', 'arch', 'wall', 'wall', 'arch'] as const;
  kinds.forEach((kind, k) => {
    if (kind === 'open') return;
    const oa = at(BAND.R, k), ob = at(BAND.R, k + 1), ia = at(BAND.Rin, k), ib = at(BAND.Rin, k + 1);
    const piece = (s0: number, s1: number, n: number) => out.push(make([lerp(oa, ob, s0), lerp(oa, ob, s1), lerp(ia, ib, s1), lerp(ia, ib, s0)], 'parkstone', { id: `band-${k}${n}`, height: 18, group: 'bandstand', shape: 'bandstand' }));
    if (kind === 'wall') piece(0, 1, 0); else { piece(0, 0.25, 0); piece(0.75, 1, 1); }
  });
  return out;
};

const FOUNTAIN_RIMS: MapPoly[] = [225, 135].map((deg, i) => {
  const a = (deg * Math.PI) / 180, half = (25 * Math.PI) / 180;
  return make(poly.arc(3000, 3000, 265, 335, a - half, a + half, 7), 'parkstone', { id: `rim-${i}`, height: 16, shape: 'fountainRim' });
});

/** Curved hedges screening the plaza's west side: 120 thick, 25 degrees of arc at 580 px from the fountain. */
const HEDGE_ARC = make(poly.arc(3000, 3000, 520, 640, Math.PI - 0.22, Math.PI + 0.22, 8), 'hedge', { id: 'hedge-arc', height: 18, shape: 'hedgeArc' });

const BOATHOUSE: RoomSpec = { id: 'boathouse', x: 150, y: 5250, w: 500, h: 400, material: 'parkwood', height: 18, gaps: [{ side: 'n', at: 300, w: 150 }, { side: 'e', at: 5400, w: 150 }, { side: 's', at: 300, w: 150, open: true }] };
const KIOSK: RoomSpec = { id: 'kiosk', x: 1900, y: 2850, w: 350, h: 300, material: 'parkwood', height: 18, gaps: [{ side: 'n', at: 2000, w: 150 }, { side: 's', at: 2000, w: 150 }, { side: 'e', at: 2925, w: 150 }] };

const POLYS: MapPoly[] = [
  ...bandSides(),
  ...FOUNTAIN_RIMS,
  HEDGE_ARC,
  ...TRUNKS.map(([x, y, r], i) => make(poly.circle(x, y, r, r > 30 ? 14 : 10), 'trunk', { id: `trunk-${i}`, height: 14, shape: 'trunk' })),
  ...roomWalls(BOATHOUSE),
  ...roomWalls(KIOSK),
];

const DOORS: MapDoor[] = [
  roomDoor(BOATHOUSE, BOATHOUSE.gaps[0]!, 'boathouse-n', { kind: 'double-swing', material: 'wood' }),
  roomDoor(BOATHOUSE, BOATHOUSE.gaps[1]!, 'boathouse-e', { kind: 'swing', material: 'wood', hinge: 'start' }),
  roomDoor(KIOSK, KIOSK.gaps[0]!, 'kiosk-n', { kind: 'swing', material: 'wood', hinge: 'start' }),
  roomDoor(KIOSK, KIOSK.gaps[1]!, 'kiosk-s', { kind: 'swing', material: 'wood', hinge: 'end' }),
  roomDoor(KIOSK, KIOSK.gaps[2]!, 'kiosk-e', { kind: 'double-swing', material: 'wood', glow: '#ffb347' }),
];

const ROOFS: MapRoof[] = [
  { id: 'bandstand', material: 'copper', points: octagon(BAND.x, BAND.y, BAND.R) },
  roomRoof(BOATHOUSE, 'boathouse', 'shingle'),
  roomRoof(KIOSK, 'kiosk', 'shingle'),
];

export const PARK_GEO: Geometry = { polys: POLYS, doors: DOORS, roofs: ROOFS };
