import { poly, type MapDoor, type MapRoof } from '../geom.ts';
import { withGeometry } from '../mapgeo.ts';
import type { MapDef, MapWall } from '../maps.ts';
import { arcWall, cargoPlane, hexKiosk, lShape, place, pillar, roundTank, trainCar } from '../shapes.ts';

/**
 * Geometry test range (dev only, not in any rotation): a cargo plane, an L wall, a round tank, a rail car and a hex kiosk to slide around,
 * and a roofed hall with one of every door type. Everything is authored for the top half and turned for the bottom (see docs/maps/GEOMETRY.md).
 */
const SIZE = 4800;
const wall = (x: number, y: number, w: number, h: number): MapWall => ({ x, y, w, h, material: 'concrete' });
const turnWall = (r: MapWall): MapWall => ({ ...r, x: SIZE - r.x - r.w, y: SIZE - r.y - r.h });

// The hall: x 2000..4450, y 200..1000. A corridor along the top, four rooms below it, a door to each.
const HALL: MapWall[] = [
  wall(2000, 200, 2450, 50),
  wall(2000, 250, 50, 50), wall(2000, 450, 50, 550),
  wall(4400, 250, 50, 50), wall(4400, 450, 50, 550),
  wall(2000, 950, 2450, 50),
  wall(2050, 500, 200, 50), wall(2400, 500, 450, 50), wall(3000, 500, 450, 50), wall(3600, 500, 450, 50), wall(4200, 500, 200, 50),
  wall(2600, 550, 50, 400), wall(3200, 550, 50, 400), wall(3800, 550, 50, 400),
];

const DOORS: MapDoor[] = [
  { id: 'west-gate', kind: 'double-swing', x: 2025, y: 300, w: 150, axis: 'v', material: 'wood' },
  { id: 'east-gate', kind: 'swing', x: 4425, y: 300, w: 150, axis: 'v', material: 'metal', hinge: 'start' },
  { id: 'room-1', kind: 'slide', x: 2250, y: 525, w: 150, axis: 'h', material: 'glass', hinge: 'start', glow: '#ffd9a0' },
  { id: 'room-2', kind: 'double-slide', x: 2850, y: 525, w: 150, axis: 'h', material: 'metal', glow: '#9fd6ff' },
  { id: 'room-3', kind: 'swing', x: 3450, y: 525, w: 150, axis: 'h', material: 'wood', hinge: 'end' },
  { id: 'room-4', kind: 'double-swing', x: 4050, y: 525, w: 150, axis: 'h', material: 'wood', glow: '#ffd9a0' },
];

const ROOFS: MapRoof[] = [
  { id: 'room-1', points: poly.rect(2050, 550, 550, 400) },
  { id: 'room-2', points: poly.rect(2650, 550, 550, 400) },
  { id: 'room-3', points: poly.rect(3250, 550, 550, 400) },
  { id: 'room-4', points: poly.rect(3850, 550, 550, 400) },
  { id: 'corridor', points: poly.rect(2050, 250, 2350, 250) },
];

const WEST: MapWall[] = [...HALL, wall(250, 2200, 50, 400)];

const base: MapDef = {
  name: 'Geo Test',
  size: SIZE,
  walls: [...WEST, ...WEST.map(turnWall)],
  zones: [{ x: 4200, y: 2100 }, { x: SIZE / 2, y: SIZE / 2 }, { x: SIZE - 4200, y: SIZE - 2100 }],
  spawns: {
    red: [{ x: 2100, y: 1150, w: 400, h: 300 }],
    blue: [{ x: SIZE - 2500, y: SIZE - 1450, w: 400, h: 300 }],
    ffa: [{ x: 2100, y: 1150, w: 400, h: 300 }, { x: SIZE - 2500, y: SIZE - 1450, w: 400, h: 300 }],
  },
  crates: [{ x: 2925, y: 800 }, { x: 1700, y: 2300 }, { x: SIZE - 2925, y: SIZE - 800 }, { x: SIZE - 1700, y: SIZE - 2300 }],
  barrels: [],
  props: [],
};

export const GEO_TEST: MapDef = withGeometry(base, {
  polys: [
    ...place(cargoPlane, { x: 1000, y: 1100, rot: 0.3 }, 'fuselage', { id: 'plane' }),
    ...place(lShape, { x: 3000, y: 2000, rot: 0.4, scale: 0.8 }, 'hull', { id: 'ell' }),
    ...place(roundTank, { x: 2300, y: 1850 }, 'tank', { id: 'silo' }),
    ...place(trainCar, { x: 3800, y: 1550, rot: -0.15 }, 'boxcar', { id: 'car' }),
    ...place(hexKiosk, { x: 1500, y: 2100 }, 'kiosk', { id: 'kiosk' }),
    ...place(arcWall, { x: 600, y: 2800, rot: 0.9, scale: 0.7 }, 'concrete', { id: 'arc' }),
    ...place(pillar, { x: 1250, y: 2650 }, 'concrete', { id: 'pier-a' }),
    ...place(pillar, { x: 1450, y: 2650 }, 'concrete', { id: 'pier-b' }),
  ],
  doors: DOORS,
  roofs: ROOFS,
});
