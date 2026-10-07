/**
 * Sub Pen geometry (docs/maps/GEOMETRY.md), authored for the west half; `withGeometry` adds the half-turn twin. The boat in the slip is a
 * cigar polygon (the water round it stays grid wall), the machine shop and the crew quarters are roofed rooms with steel doors (their
 * twins are the control room and the second crew hut), the torpedo store gets bulkhead hatches, a blast door and a roof, and a round
 * fuel tank stands in the depot.
 */
import { make, type MapDoor, type MapPoly, type MapRoof } from '../geom.ts';
import type { Geometry } from '../mapgeo.ts';
import { cigar, roomDoor, roomRoof, roomWalls, type RoomSpec } from './roomkit.ts';
import { poly } from '../geom.ts';

const SHOP: RoomSpec = { id: 'shop', x: 1250, y: 4850, w: 900, h: 700, material: 'bulkhead', gaps: [{ side: 'n', at: 1800, w: 150 }, { side: 'w', at: 5320, w: 150 }, { side: 'e', at: 5100, w: 150 }, { side: 's', at: 1500, w: 150, open: true }] };
const CREW: RoomSpec = { id: 'crew', x: 150, y: 3700, w: 700, h: 450, material: 'bulkhead', gaps: [{ side: 'n', at: 600, w: 150 }, { side: 'e', at: 3850, w: 150 }, { side: 's', at: 300, w: 150, open: true }] };

const POLYS: MapPoly[] = [
  // The boat in the west slip: bow west, 300 px beam, 1800 px long. The pit round it is water cells in the grid.
  make(cigar(500, 2300, 2000, 150, 300, 180), 'hull', { id: 'sub', height: 40, group: 'sub', part: 'hull', shape: 'submarine' }),
  ...roomWalls(SHOP),
  ...roomWalls(CREW),
  make(poly.circle(2860, 5790, 120, 20), 'tank', { id: 'fuel-tank', height: 52, shape: 'roundTank' }),
];

const DOORS: MapDoor[] = [
  { id: 'store-n', kind: 'swing', x: 450, y: 2700, w: 150, axis: 'h', hinge: 'start', material: 'metal', closeMs: 3000 },
  { id: 'store-e', kind: 'slide', x: 900, y: 3000, w: 150, axis: 'v', hinge: 'start', material: 'metal', thick: 20, glow: '#ff9a3c', closeMs: 2000 },
  { id: 'store-s', kind: 'swing', x: 300, y: 3500, w: 150, axis: 'h', hinge: 'end', material: 'metal', closeMs: 3000 },
  roomDoor(SHOP, SHOP.gaps[0]!, 'shop-n', { kind: 'swing', material: 'metal', hinge: 'start' }),
  roomDoor(SHOP, SHOP.gaps[1]!, 'shop-w', { kind: 'swing', material: 'metal', hinge: 'end' }),
  roomDoor(SHOP, SHOP.gaps[2]!, 'shop-e', { kind: 'slide', material: 'metal', hinge: 'start', glow: '#7fe0c0' }),
  roomDoor(CREW, CREW.gaps[0]!, 'crew-n', { kind: 'swing', material: 'metal', hinge: 'start' }),
  roomDoor(CREW, CREW.gaps[1]!, 'crew-e', { kind: 'double-swing', material: 'metal', glow: '#ffd9a0' }),
];

const ROOFS: MapRoof[] = [
  { id: 'store', material: 'metal', points: poly.rect(150, 2650, 800, 900) },
  roomRoof(SHOP, 'shop', 'metal'),
  roomRoof(CREW, 'crew', 'corrugated'),
];

export const SUBPEN_GEO: Geometry = { polys: POLYS, doors: DOORS, roofs: ROOFS };
