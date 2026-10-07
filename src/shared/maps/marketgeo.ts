/**
 * Night Market geometry (docs/maps/GEOMETRY.md), authored for the west half; `withGeometry` adds the half-turn twin. Three walk-through
 * shops (a roll-up shutter front and back, goods inside, a roof that shows the shop's own rooftop) stand where shopfront blocks were,
 * the food carts are rounded and the shrine posts are round.
 */
import { make, poly, type MapDoor, type MapPoly, type MapRoof } from '../geom.ts';
import type { Geometry } from '../mapgeo.ts';
import { roomDoor, roomRoof, roomWalls, type RoomSpec } from './roomkit.ts';

/** Top-left corners of the shops, in px. Each is a 400 px block: 50 px walls, a 300 px interior, a 100 px shutter gap north and south. */
const SHOPS = [[400, 2200], [1000, 2800], [1000, 3400]] as const;
const CARTS: readonly (readonly [number, number])[] = [[600, 750], [1700, 1850], [2250, 2400], [2250, 3500], [1700, 4050], [1150, 4600], [600, 5150]];
const SHRINES: readonly (readonly [number, number])[] = [[2825, 175], [375, 625], [175, 3475], [825, 5725]];

const spec = ([x, y]: readonly [number, number], i: number): RoomSpec => ({
  id: `shop-${i}`, x, y, w: 400, h: 400, material: 'shop', height: 22,
  gaps: [{ side: 'n', at: x + 150, w: 100 }, { side: 's', at: x + 150, w: 100 }],
});
const ROOMS = SHOPS.map(spec);

const POLYS: MapPoly[] = [
  ...ROOMS.flatMap(roomWalls),
  ...CARTS.map(([x, y], i) => make(poly.capsule(x + 50, y + 50, x + 150, y + 50, 50, 6), 'cart', { id: `cart-${i}`, height: 14, shape: 'cart' })),
  ...SHRINES.map(([x, y], i) => make(poly.circle(x, y, 75, 16), 'shrine', { id: `shrine-${i}`, height: 26, shape: 'shrine' })),
];

const DOORS: MapDoor[] = ROOMS.flatMap((r, i): MapDoor[] => [
  roomDoor(r, r.gaps[0]!, `shop-${i}-n`, { kind: 'slide', material: 'metal', hinge: 'start', closeMs: 1800, glow: '#ffc27a' }),
  roomDoor(r, r.gaps[1]!, `shop-${i}-s`, { kind: 'slide', material: 'metal', hinge: 'end', closeMs: 1800, glow: '#ffc27a' }),
]);

const ROOFS: MapRoof[] = ROOMS.map((r, i) => roomRoof(r, `shop-${i}`, 'shop'));

export const MARKET_GEO: Geometry = { polys: POLYS, doors: DOORS, roofs: ROOFS };
