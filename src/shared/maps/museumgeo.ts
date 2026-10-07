/**
 * Museum geometry (docs/maps/GEOMETRY.md), authored for the west half; `withGeometry` adds the half-turn twin of everything here.
 * Round marble columns replace the square piers, the dino plinth is a rounded polygon, the wings have double swing doors and roofs, the Gem
 * Vault has a sliding vault door and a glass window, and the hall mouths at the loading dock and the main entrance are glazed fronts.
 */
import { make, poly, type MapDoor, type MapPoly, type MapRoof } from '../geom.ts';
import type { Geometry } from '../mapgeo.ts';
import { roundRect } from './roomkit.ts';

const SIZE = 6000;

/** Centre and radius of every pier that is a column now (cells 2 or 3 wide), as `[x, y, r]`. */
const COLUMNS: readonly (readonly [number, number, number])[] = [
  [1700, 900, 50], [2650, 950, 50], [2200, 1150, 50], [2650, 1250, 50], [1150, 2050, 50], [800, 2150, 50], [1050, 2600, 50], [1550, 2600, 50],
  [2125, 2625, 75], [2125, 3375, 75], [1050, 3400, 50], [1550, 3400, 50], [2625, 3825, 75], [1750, 3850, 50], [2050, 4300, 50], [750, 4350, 50],
  [1850, 4750, 50], [650, 4850, 50], [1450, 5200, 50], [1800, 5300, 50], [1100, 5450, 50],
];

const POLYS: MapPoly[] = [
  ...COLUMNS.map(([x, y, r], i) => make(poly.circle(x, y, r, r > 60 ? 14 : 12), 'marble', { id: `col-${i}`, height: 16, shape: 'column' })),
  // The dinosaur plinth: 550 by 250, soft corners.
  make(roundRect(2250, 2600, 550, 250, 70, 5), 'plinth', { id: 'plinth', height: 22, shape: 'plinth' }),
  // The vault's glass window onto the egyptian hall: bodies and rounds stop, sight passes.
  make(poly.rect(2000, 650, 50, 100), 'glass', { id: 'vault-window', height: 16, blocksSight: false }),
];

/** Fire doors at the grounds and the pair of double doors on each gallery. 200 px gaps in the grid walls, centred on the wall line. */
const DOORS: MapDoor[] = [
  { id: 'egypt-s1', kind: 'double-swing', x: 700, y: 2475, w: 200, axis: 'h', material: 'wood' },
  { id: 'egypt-s2', kind: 'double-swing', x: 1900, y: 2475, w: 200, axis: 'h', material: 'wood' },
  { id: 'egypt-e2', kind: 'double-swing', x: 2475, y: 1800, w: 200, axis: 'v', material: 'wood' },
  { id: 'vault', kind: 'slide', x: 2150, y: 975, w: 200, axis: 'h', hinge: 'start', material: 'metal', closeMs: 2400, glow: '#9fc4ff' },
  { id: 'exit-n', kind: 'double-swing', x: 1300, y: 425, w: 200, axis: 'h', material: 'metal' },
  { id: 'exit-w', kind: 'double-swing', x: 425, y: 1200, w: 200, axis: 'v', material: 'metal' },
  { id: 'exit-s', kind: 'double-swing', x: 700, y: 5575, w: 200, axis: 'h', material: 'metal' },
  { id: 'exit-w2', kind: 'double-swing', x: 425, y: 4200, w: 200, axis: 'v', material: 'metal' },
  { id: 'imp-n1', kind: 'double-swing', x: 1000, y: 3525, w: 200, axis: 'h', material: 'wood' },
  { id: 'imp-n2', kind: 'double-swing', x: 2000, y: 3525, w: 200, axis: 'h', material: 'wood' },
  { id: 'gal-80', kind: 'double-swing', x: 1900, y: 4025, w: 300, axis: 'h', material: 'wood' },
  { id: 'gal-90', kind: 'double-slide', x: 600, y: 4525, w: 300, axis: 'h', material: 'glass' },
  { id: 'gal-100', kind: 'double-swing', x: 1900, y: 5025, w: 300, axis: 'h', material: 'wood' },
  { id: 'cafe-e', kind: 'double-swing', x: 2475, y: 5200, w: 200, axis: 'v', material: 'wood' },
];

const ROOFS: MapRoof[] = [
  // The Egypt wing without the vault's corner, which has its own.
  { id: 'egypt', material: 'slate', points: [{ x: 400, y: 400 }, { x: 2000, y: 400 }, { x: 2000, y: 1000 }, { x: 2500, y: 1000 }, { x: 2500, y: 2500 }, { x: 400, y: 2500 }] },
  { id: 'vault', material: 'vault', points: poly.rect(2000, 400, 500, 600) },
  { id: 'imp', material: 'slate', points: poly.rect(400, 3500, 2100, 550) },
  { id: 'modern', material: 'slate', points: poly.rect(400, 4000, 2100, 550) },
  { id: 'sculpt', material: 'slate', points: poly.rect(400, 4500, 2100, 550) },
  { id: 'shop', material: 'slate', points: poly.rect(400, 5000, 2100, 600) },
];

// The hall mouths, written for the loading dock (x 700..750); the main entrance is the half turn. Both are see-through fronts with three
// sliders (the art paints the dock's as a steel grille and the entrance's as plate glass, the same size and the same rules).
const FRONT = [[2500, 2575], [2725, 2925], [3075, 3275], [3425, 3500]] as const;
const FRONT_POLYS: MapPoly[] = FRONT.map(([a, b], i) => make(poly.rect(700, a, 50, b - a), 'glass', { id: `front-${i}`, height: 20, blocksSight: false }));
const FRONT_DOORS: MapDoor[] = [2575, 2925, 3275].map((y, i) => ({ id: `front-door-${i}`, kind: 'double-slide', x: 725, y, w: 150, axis: 'v', material: 'glass', closeMs: 1600 }));

export const MUSEUM_GEO: Geometry = { polys: [...POLYS, ...FRONT_POLYS], doors: [...DOORS, ...FRONT_DOORS], roofs: ROOFS };
