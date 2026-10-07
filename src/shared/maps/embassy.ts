import { gridMap } from '../mapgrid.ts';
import type { MapDef } from '../maps.ts';
import { withGeometry } from '../mapgeo.ts';
import { poly, make, type MapDoor, type MapPoly, type MapRoof, type Pt } from '../geom.ts';

/**
 * The Embassy: a gala interrupted. The west half is drawn here and the east half is its half turn, so every room has a twin
 * that is dressed as something else: the modern Office Wing (NW) turns into the old Residence (SE), the Lobby and Security
 * Checkpoint (SW) into the Kitchen and Staff Entrance (NE), the Topiary Garden into the Garden Maze, the Front Lawn and Motorcade
 * Drive into the Service Lot and Delivery Dock. The Atrium and its glass dome sit on the centre point, with zone B in the middle.
 * (Geometry stays exactly twinned; the dressing in src/client/themes/embassy*.ts picks each half's look by district.)
 *
 * = building wall (partition, panelling or facade, by district), | curtain glass, + furniture (desks, counters, tables), z racks and
 * shelving (servers, archives, shelves, cabinets), u clipped hedge. Round, curved and angled things are polygons below.
 */
const SIZE = 6000;
const GRID = `
  ============================================================
  =...............===========================================.
  =...............=..%%%%%%%....=...%%=....=.++++.....++++..=.
  =.FF............=.............=...%%=....=................=.
  =.FF............=.............=..........=................=.
  =.FF............=.............=..........=................=.
  =.............................=.....=.....................=.
  =.............................=.....=.......................
  =...............=....++++++...=.....=....=..................
  =...............=....++++++.........=....=................=.
  =...............=...............++..=....=................=.
  =...............=.++..........=.++..=....=................=.
  =...............=.++......++..=.....=....=................=.
  =...............=.........++..=.....=....=.++..........++.=.
  =...............======..=========..==....======....========.
  =...............=...................=....=................=.
  =...................................=....=..................
  =...................................=....=..................
  =...............=...................=....=................=.
  =...............==========..=========....===..========..===.
  =...............=...................=....=.....%%%=%%%....=.
  =...i...........=.+++.....++....+++.=....=........=.......=.
  =...............=.+++...........+++.=....=........=.......=.
  =...............=...................=....=........=....g..=.
  =...............=...................=.FF..........=.......=.
  =...............=.....................FF....++++..=.......=.
  =.........................A..............=..++++............
  =...................................=....=..................
  =...............=...................=....=........=.......=.
  =...............=...................=....=..FF....=..+++..=.
  =...............=...................=....=..FF....=..+++..=.
  =...............=...................=...b=........=.......=.
  =...............=...................=....=........=.......=.
  =...............======..====..=======....==================.
  =...............=...................=....=................=.
  =...............=...................=....=................=.
  =...................................=....=...........c......
  =...................................=....=..................
  =...............=======..============....=======..=========.
  =...............=..............=....=....=................=.
  =...............=..............=....=....=...........+++++=.
  =...............=%%%%%....%%%%.=....=....=.++......++.....=.
  =...............=..........................++......++.....=.
  =...............=.......................................p.=.
  =..............................=..%%=....=..................
  =..............................=..%%=....=..................
  =...............=%%%%%....%%%%.=..%%=....=.....++......++.=.
  =...............=......FF......=..%%=....=.....++......++.=.
  =...............=......FF......=....=....=................=.
  =...............=%%%%%....%%%%.=....=....=................=.
  =...............=..............=...e=....=................=.
  =...............=====================....====..============.
  =&&&&&&...&&&&&&=...........................................
  =&&&&&&...&&&&&&=...........................................
  =...............=...........................................
  =...............=...............................c...........
  =.......l.................FF......++........................
  =.........................FF......++........................
  =...............=.........FF..................b.............
  =...............=...........................................
  =.......++++..l.=...........c...............................
  =..FF...++++....=...........................................
  =..FF...........====..=========....===========..=====.......
  =..FF...........=......=....................=......==.......
  =..FF...........=......=....................=......==.......
  =...............=...+++=....................=+++...==.......
  =.&&&&&&...c....=................................m.==.......
  =...............=................c.....c...........=........
  =...............=......=....................=......=........
  =...................+++=.....++++++++.......=...............
  =.........l..b.........=.....++++++++.......=..++...........
  =...............=......=....................=..++..=........
  =...............=.................FFFF........a....=........
  =...............=.................FFFF.............=........
  =.........&&&&&.=......=....................=......=........
  =...............=...+++=....................=+++...=........
  =...............=......=....................=......=........
  =...............========..======....======..========........
  =..&&...........=..................................=........
  =..&&.....++++..=.++............................++.=........
  =..&&.........l.=.++..++++++++.c......++++++++..++.=........
  =..&&...........=.....++++++++........++++++++.....=........
  =..&&...........=..................................=........
  =..&&...........=..................................=........
  =...............=|||||||....||||||||||||....|||||||=........
  =...........................................................
  =...........................................................
  =.........c.......+++++......................+++++..........
  =...................................................l.......
  =...........................................................
  =.......&&....................l...........l..c..........b...
  =.......&&..................................................
  =.......&&..........................................&&&&....
  =.......&&..........................................&&&&....
  =.......&&.......o....l...................FFFF..............
  =.......&&................................FFFF..............
  =...............======....................FFFF..............
  =...............=....=......................................
  =...........&&&.=...........................&&&&............
  =...........&&&.=...........................&&&&............
  =...........b...=....=..&&&&........c................FFFF...
  =...............==..==..&&&&.........................FFFF...
  =....................................................FFFF...
  =....................................................FFFF...
  ======...=====..............................................
  ==...........=..............................................
  ==...........=.....................b............l...........
  ==...........=..............................................
  ==.RRRRRRR...=......c...................======....=======...
  ==.RRRRRRR...=..........................=...............=...
  ==.RRRRRRR..............................=...............=...
  ==.RRRRRRR..............................=.........++++..=...
  ==.RRRRRRR..........l.............c.........++....++++..=...
  ==.RRRRRRR...=..............................++..........=...
  ==.RRRRRRR...=..........................=...............=...
  ==.RRRRRRR...=..........................=...............=...
  ==.RRRRRRR...=..........................=...............=...
  ==...........=..........................==========....===...
  ==============..............................................
  ============================================================
`;

/* -- polygons (west half; withGeometry adds each one's half-turn twin) ------------------------------------------- */

export type Vehicle = { id: string; kind: 'suv' | 'limo'; x: number; y: number; rot: number };
/** The motorcade on the Front Lawn drive (its twin on the Service Lot is the catering fleet). */
export const VEHICLES: readonly Vehicle[] = [
  { id: 'suv-a', kind: 'suv', x: 1500, y: 5430, rot: 0.1 },
  { id: 'limo', kind: 'limo', x: 2130, y: 5380, rot: 0.04 },
  { id: 'suv-b', kind: 'suv', x: 2770, y: 5440, rot: -0.08 },
];
export const VEHICLE_SIZE = { suv: { len: 330, wid: 140, cut: 28 }, limo: { len: 490, wid: 136, cut: 24 } } as const;
const chamfer = (len: number, wid: number, c: number): Pt[] => poly.fromPath([[-len / 2 + c, -wid / 2], [len / 2 - c, -wid / 2], [len / 2, -wid / 2 + c], [len / 2, wid / 2 - c], [len / 2 - c, wid / 2], [-len / 2 + c, wid / 2], [-len / 2, wid / 2 - c], [-len / 2, -wid / 2 + c]]);

export const ATRIUM = { x: SIZE / 2, y: SIZE / 2, rIn: 360, rOut: 410 } as const;
const OPENING = Math.asin(118 / ((ATRIUM.rIn + ATRIUM.rOut) / 2));
export const FOUNTAIN = { x: 1650, y: 4700, r: 170 } as const;
export const STAIR_ROOM = { x0: 850, y0: 1000, x1: 1800, y1: 1650, cx: 1325, cy: 1325 } as const;
export const TABLE = { x: 2500, y: 400, w: 470, h: 172 } as const;

const ellipse = (cx: number, cy: number, rx: number, ry: number, n = 28): Pt[] => Array.from({ length: n }, (_, i) => ({ x: cx + Math.cos((i / n) * Math.PI * 2) * rx, y: cy + Math.sin((i / n) * Math.PI * 2) * ry }));
const PI = Math.PI;

/** Hedge walls of the garden maze: rounded two-cell hedges between the gaps, and clipped topiary spheres to slalom round. */
export const HEDGE_RUNS: readonly [number, number, number][] = [
  [300, 1, 13], [300, 18, 29], [300, 34, 43], [300, 48, 51],
  [600, 1, 5], [600, 10, 21], [600, 26, 37], [600, 42, 51],
];
export const TOPIARY: readonly (readonly [number, number, number])[] = [
  [100, 600, 50], [200, 1400, 50], [100, 2100, 50], [405, 920, 50], [495, 1750, 50], [405, 2450, 50],
  [688, 640, 36], [762, 1500, 36], [688, 2330, 36], [405, 250, 50], [430, 1330, 40],
];
/** Urns on the terrace between the buildings: they break the long north-south view past the atrium's arches. */
export const URNS: readonly (readonly [number, number])[] = [[2990, 500], [2990, 1150], [2990, 1750], [2990, 2100]];

const POLYS: MapPoly[] = [
  // The atrium ring: two curved marble walls, turned into four; the arches face north and south, glass doors face the galleries.
  make(poly.arc(ATRIUM.x, ATRIUM.y, ATRIUM.rIn, ATRIUM.rOut, PI / 2 + OPENING, PI - OPENING, 10), 'atrium', { id: 'ring-sw', group: 'atrium', height: 34 }),
  make(poly.arc(ATRIUM.x, ATRIUM.y, ATRIUM.rIn, ATRIUM.rOut, PI + OPENING, PI * 1.5 - OPENING, 10), 'atrium', { id: 'ring-nw', group: 'atrium', height: 34 }),
  // The grand staircase hall (an open-plan office on the other half): two curved flights, like parentheses, round the zone.
  make(poly.arc(1325, 1325, 275, 325, PI - 0.8, PI + 0.8, 10), 'stair', { id: 'stair-w', group: 'stair', height: 26 }),
  make(poly.arc(1325, 1325, 275, 325, -0.8, 0.8, 10), 'stair', { id: 'stair-e', group: 'stair', height: 26 }),
  // The long oval table of the conference room (the banquet table of the ballroom).
  make(ellipse(TABLE.x, TABLE.y, TABLE.w / 2, TABLE.h / 2), 'table', { id: 'oval-table', group: 'table', height: 20 }),
  // The fountain: a low basin you cannot walk through but can see and shoot over, a statue on its plinth, a horseshoe hedge round it.
  make(poly.circle(FOUNTAIN.x, FOUNTAIN.y, FOUNTAIN.r, 22), 'fountain', { id: 'fountain', group: 'fountain', height: 14, blocksBullets: false, blocksSight: false }),
  make(poly.circle(FOUNTAIN.x, FOUNTAIN.y, 36, 10), 'plinth', { id: 'fountain-plinth', group: 'fountain', height: 58 }),
  make(poly.arc(FOUNTAIN.x, FOUNTAIN.y, 290, 350, PI - 1.0, PI + 1.0, 10), 'hedge', { id: 'fountain-hedge-w', group: 'fountain-hedge', height: 34 }),
  make(poly.arc(FOUNTAIN.x, FOUNTAIN.y, 290, 350, -1.0, 1.0, 10), 'hedge', { id: 'fountain-hedge-e', group: 'fountain-hedge', height: 34 }),
  // Columns: the lobby's four and the gallery's eight, turned marble.
  ...[[1350, 3300], [2050, 3300], [1350, 3700], [2050, 3700]].map(([x, y], i) => make(poly.circle(x!, y!, 44, 14), 'column', { id: `lobby-col-${i}`, group: 'columns', height: 44 })),
  ...[1200, 1550, 1900, 2250].flatMap((x, i) => [2725, 2975].map((y, j) => make(poly.circle(x, y, 44, 14), 'column', { id: `gal-col-${i}-${j}`, group: 'columns', height: 44 }))),
  // The motorcade: two armoured SUVs and the limousine between them.
  ...VEHICLES.map((v) => make(poly.transform(chamfer(VEHICLE_SIZE[v.kind].len, VEHICLE_SIZE[v.kind].wid, VEHICLE_SIZE[v.kind].cut), { x: v.x, y: v.y, rot: v.rot }), 'vehicle', { id: v.id, group: v.id, shape: v.kind, height: v.kind === 'limo' ? 30 : 38 })),
  // The garden maze: rounded hedge walls and topiary spheres.
  ...HEDGE_RUNS.map(([x, a, b], i) => make(poly.capsule(x, a * 50 + 50, x, (b + 1) * 50 - 50, 50, 4), 'hedge', { id: `maze-${i}`, group: 'maze', height: 40 })),
  ...URNS.map(([x, y], i) => make(poly.circle(x, y, 44, 12), 'urn', { id: `urn-${i}`, group: 'urns', height: 40 })),
  ...TOPIARY.map(([x, y, r], i) => make(poly.circle(x, y, r, 12), 'topiary', { id: `topiary-${i}`, group: 'topiary', height: 46 })),
];


/* -- districts: each west-half place and the place its half turn makes of it ------------------------------------------ */

export type FloorKind =
  | 'navy' | 'walnut' | 'confcarpet' | 'tilecarpet' | 'raised' | 'cafetile' | 'flagmarble' | 'granite' | 'checktile' | 'terrace' | 'lawn' | 'garden' | 'asphalt' | 'flagstone'
  | 'ruby' | 'library' | 'ballroom' | 'stairmarble' | 'dining' | 'archive' | 'conservatory' | 'portrait' | 'kitchen' | 'staffroom' | 'mazegrass' | 'servicelot' | 'dock' | 'yard';
export type District = { id: string; name: string; x: number; y: number; w: number; h: number; floor: FloorKind; light: string; accent: string; twin: boolean };
type Spec = { id: string; name: string; floor: FloorKind; light: string; accent: string };
const cells = (c0: number, r0: number, c1: number, r1: number) => ({ x: c0 * 50, y: r0 * 50, w: (c1 - c0 + 1) * 50, h: (r1 - r0 + 1) * 50 });
// Office strip lights are cool (a bluish white); the residence lamps are warm.
const COOL = '190, 220, 255', WARM = '255, 200, 130';
const WEST_DISTRICTS: readonly { cells: readonly [number, number, number, number]; here: Spec; there: Spec }[] = [
  { cells: [16, 1, 35, 14], here: { id: 'suite', name: "AMBASSADOR'S SUITE", floor: 'walnut', light: '255, 214, 160', accent: '#d9b24a' }, there: { id: 'library', name: 'THE LIBRARY', floor: 'library', light: WARM, accent: '#c8a050' } },
  { cells: [41, 1, 58, 14], here: { id: 'conference', name: 'CONFERENCE ROOM', floor: 'confcarpet', light: COOL, accent: '#7fb0d8' }, there: { id: 'ballroom', name: 'BALLROOM', floor: 'ballroom', light: '255, 226, 170', accent: '#e8c860' } },
  { cells: [16, 19, 36, 33], here: { id: 'openplan', name: 'OPEN PLAN', floor: 'tilecarpet', light: COOL, accent: '#8ab4d8' }, there: { id: 'stairhall', name: 'GRAND STAIRCASE', floor: 'stairmarble', light: '255, 214, 160', accent: '#d9b24a' } },
  { cells: [41, 19, 58, 33], here: { id: 'comms', name: 'COMMS & PRINT', floor: 'navy', light: COOL, accent: '#9ac0e0' }, there: { id: 'dining', name: 'DINING ROOM', floor: 'dining', light: WARM, accent: '#c8a050' } },
  { cells: [16, 38, 35, 51], here: { id: 'servers', name: 'SERVER ROOM', floor: 'raised', light: '120, 190, 255', accent: '#56b8ff' }, there: { id: 'archives', name: 'ARCHIVES', floor: 'archive', light: '200, 220, 200', accent: '#9ab8a0' } },
  { cells: [41, 38, 58, 51], here: { id: 'cafeteria', name: 'CAFETERIA', floor: 'cafetile', light: '230, 240, 220', accent: '#c8d8a0' }, there: { id: 'conservatory', name: 'CONSERVATORY', floor: 'conservatory', light: '255, 230, 170', accent: '#7fc070' } },
  { cells: [16, 1, 58, 51], here: { id: 'wing', name: 'OFFICE WING', floor: 'navy', light: COOL, accent: '#8ab4d8' }, there: { id: 'residence', name: 'RESIDENCE', floor: 'ruby', light: WARM, accent: '#d9b24a' } },
  { cells: [16, 52, 52, 62], here: { id: 'flaggallery', name: 'FLAG GALLERY', floor: 'flagmarble', light: '255, 236, 200', accent: '#d9c27a' }, there: { id: 'portraits', name: 'PORTRAIT GALLERY', floor: 'portrait', light: '255, 210, 150', accent: '#d9b24a' } },
  { cells: [16, 78, 51, 84], here: { id: 'checkpoint', name: 'SECURITY CHECKPOINT', floor: 'checktile', light: '210, 230, 255', accent: '#ffd34d' }, there: { id: 'staff', name: 'STAFF ENTRANCE', floor: 'staffroom', light: '240, 240, 220', accent: '#c8c8a0' } },
  { cells: [16, 62, 51, 77], here: { id: 'lobby', name: 'LOBBY', floor: 'granite', light: '255, 236, 200', accent: '#d9c27a' }, there: { id: 'kitchen', name: 'KITCHEN', floor: 'kitchen', light: '245, 245, 235', accent: '#d8d8c8' } },
  { cells: [0, 0, 16, 53], here: { id: 'topiary', name: 'TOPIARY GARDEN', floor: 'garden', light: '190, 230, 170', accent: '#8fcf7a' }, there: { id: 'maze', name: 'GARDEN MAZE', floor: 'mazegrass', light: '170, 220, 150', accent: '#6fbf60' } },
  { cells: [0, 103, 14, 119], here: { id: 'staging', name: 'VEHICLE STAGING', floor: 'asphalt', light: '255, 170, 60', accent: '#ffb347' }, there: { id: 'servicegate', name: 'SERVICE GATE', floor: 'dock', light: '255, 190, 100', accent: '#ffb347' } },
  { cells: [40, 108, 56, 117], here: { id: 'garage', name: 'VALET GARAGE', floor: 'dock', light: '255, 200, 120', accent: '#ffb347' }, there: { id: 'loadingbay', name: 'LOADING BAY', floor: 'dock', light: '255, 200, 120', accent: '#ffb347' } },
  { cells: [0, 54, 16, 85], here: { id: 'westcourt', name: "SMOKERS' COURT", floor: 'flagstone', light: '255, 190, 110', accent: '#ffb347' }, there: { id: 'eastcourt', name: 'ROSE COURT', floor: 'garden', light: '255, 200, 190', accent: '#e890a0' } },
  { cells: [14, 100, 59, 119], here: { id: 'drive', name: 'MOTORCADE DRIVE', floor: 'asphalt', light: '255, 190, 100', accent: '#ffb347' }, there: { id: 'dock', name: 'DELIVERY DOCK', floor: 'asphalt', light: '255, 190, 100', accent: '#ffb347' } },
  { cells: [52, 36, 67, 51], here: { id: 'northterrace', name: 'NORTH TERRACE', floor: 'terrace', light: '255, 220, 170', accent: '#d9c27a' }, there: { id: 'southterrace', name: 'SOUTH TERRACE', floor: 'terrace', light: '255, 220, 170', accent: '#d9c27a' } },
  { cells: [52, 62, 59, 84], here: { id: 'steps', name: 'FRONT STEPS', floor: 'terrace', light: '255, 220, 170', accent: '#d9c27a' }, there: { id: 'backsteps', name: 'BACK STEPS', floor: 'terrace', light: '255, 220, 170', accent: '#d9c27a' } },
  { cells: [0, 85, 59, 119], here: { id: 'lawn', name: 'FRONT LAWN', floor: 'lawn', light: '255, 226, 170', accent: '#9fd08a' }, there: { id: 'servicelot', name: 'SERVICE LOT', floor: 'servicelot', light: '255, 226, 170', accent: '#9fd08a' } },
];
export const ATRIUM_DISTRICT: District = { id: 'atrium', name: 'ATRIUM', x: 3000 - 420, y: 3000 - 420, w: 840, h: 840, floor: 'terrace', light: '255, 236, 190', accent: '#d9c27a', twin: false };
const GROUNDS_SPEC: Spec = { id: 'grounds', name: 'THE GROUNDS', floor: 'flagstone', light: '200, 210, 230', accent: '#9ab4e0' };
export const GROUNDS: District = { ...GROUNDS_SPEC, ...cells(0, 0, 119, 119), twin: false };
/** Every district, west half first and then each one's half turn. */
export const DISTRICTS: readonly District[] = [
  ...WEST_DISTRICTS.map((d) => ({ ...d.here, ...cells(...d.cells), twin: false })),
  ...WEST_DISTRICTS.map((d) => { const r = cells(...d.cells); return { ...d.there, x: SIZE - r.x - r.w, y: SIZE - r.y - r.h, w: r.w, h: r.h, twin: true }; }),
];
/** The district a point stands in; the atrium first, then the smaller places before the bigger ones that hold them. */
export function districtAt(x: number, y: number): District {
  if (Math.hypot(x - SIZE / 2, y - SIZE / 2) < ATRIUM.rOut + 6) return ATRIUM_DISTRICT;
  for (const d of DISTRICTS) if (x >= d.x && x < d.x + d.w && y >= d.y && y < d.y + d.h) return d;
  return GROUNDS;
}

const DOORS: MapDoor[] = [
  { id: 'w-amb', kind: 'swing', x: 825, y: 300, w: 100, axis: 'v', material: 'wood' },
  { id: 'w-c1', kind: 'swing', x: 825, y: 800, w: 100, axis: 'v', material: 'wood' },
  { id: 'w-bull', kind: 'swing', x: 825, y: 1300, w: 100, axis: 'v', material: 'wood' },
  { id: 'w-c2', kind: 'swing', x: 825, y: 1800, w: 100, axis: 'v', material: 'wood' },
  { id: 'w-srv', kind: 'swing', x: 825, y: 2200, w: 100, axis: 'v', material: 'metal' },
  { id: 'e-conf', kind: 'swing', x: 2925, y: 350, w: 100, axis: 'v', material: 'wood' },
  { id: 'e-c1', kind: 'swing', x: 2925, y: 800, w: 100, axis: 'v', material: 'wood' },
  { id: 'e-print', kind: 'swing', x: 2925, y: 1300, w: 100, axis: 'v', material: 'wood' },
  { id: 'e-c2', kind: 'swing', x: 2925, y: 1800, w: 100, axis: 'v', material: 'wood' },
  { id: 'e-cafe', kind: 'swing', x: 2925, y: 2200, w: 100, axis: 'v', material: 'wood' },
  { id: 's-spine', kind: 'double-swing', x: 1850, y: 2575, w: 200, axis: 'h', material: 'glass' },
  { id: 's-cafe', kind: 'swing', x: 2250, y: 2575, w: 100, axis: 'h', material: 'wood' },
  { id: 'amb-s', kind: 'swing', x: 1100, y: 725, w: 100, axis: 'h', material: 'wood' },
  { id: 'amb-sec', kind: 'swing', x: 1525, y: 450, w: 100, axis: 'v', material: 'wood' },
  { id: 'sec-s', kind: 'swing', x: 1650, y: 725, w: 100, axis: 'h', material: 'wood' },
  { id: 'sec-spine', kind: 'swing', x: 1825, y: 200, w: 100, axis: 'v', material: 'wood' },
  { id: 'conf-s', kind: 'double-swing', x: 2350, y: 725, w: 200, axis: 'h', material: 'wood' },
  { id: 'conf-w', kind: 'swing', x: 2075, y: 300, w: 100, axis: 'v', material: 'wood' },
  { id: 'bull-n', kind: 'swing', x: 1300, y: 975, w: 100, axis: 'h', material: 'wood' },
  { id: 'bull-e', kind: 'swing', x: 1825, y: 1250, w: 100, axis: 'v', material: 'wood' },
  { id: 'bull-s1', kind: 'swing', x: 1100, y: 1675, w: 100, axis: 'h', material: 'wood' },
  { id: 'bull-s2', kind: 'swing', x: 1400, y: 1675, w: 100, axis: 'h', material: 'wood' },
  { id: 'comms-w', kind: 'swing', x: 2075, y: 1200, w: 100, axis: 'v', material: 'wood' },
  { id: 'comms-n', kind: 'swing', x: 2200, y: 975, w: 100, axis: 'h', material: 'wood' },
  { id: 'comms-print', kind: 'swing', x: 2525, y: 1300, w: 100, axis: 'v', material: 'wood' },
  { id: 'print-n', kind: 'swing', x: 2700, y: 975, w: 100, axis: 'h', material: 'wood' },
  { id: 'srv-n', kind: 'slide', x: 1150, y: 1925, w: 100, axis: 'h', material: 'metal', auto: true },
  { id: 'srv-ups', kind: 'swing', x: 1575, y: 2100, w: 100, axis: 'v', material: 'metal' },
  { id: 'ups-spine', kind: 'swing', x: 1825, y: 2100, w: 100, axis: 'v', material: 'metal' },
  { id: 'cafe-w', kind: 'swing', x: 2075, y: 2100, w: 100, axis: 'v', material: 'wood' },
  { id: 'cafe-n', kind: 'swing', x: 2400, y: 1925, w: 100, axis: 'h', material: 'wood' },
  { id: 'ring-w', kind: 'double-swing', x: 2632, y: 2900, w: 200, axis: 'v', material: 'wood' },
  { id: 'gal-w', kind: 'swing', x: 825, y: 2800, w: 100, axis: 'v', material: 'wood' },
  { id: 'lob-gal', kind: 'double-swing', x: 1550, y: 3125, w: 200, axis: 'h', material: 'wood' },
  { id: 'lob-gal-w', kind: 'swing', x: 1000, y: 3125, w: 100, axis: 'h', material: 'wood' },
  { id: 'lob-gal-e', kind: 'swing', x: 2300, y: 3125, w: 100, axis: 'h', material: 'wood' },
  { id: 'lob-slide-w', kind: 'double-slide', x: 1200, y: 4225, w: 200, axis: 'h', material: 'glass', auto: true },
  { id: 'lob-slide-e', kind: 'double-slide', x: 2000, y: 4225, w: 200, axis: 'h', material: 'glass', auto: true },
  { id: 'sec-gate-w', kind: 'swing', x: 1200, y: 3875, w: 100, axis: 'h', material: 'metal' },
  { id: 'sec-gate-e', kind: 'swing', x: 2100, y: 3875, w: 100, axis: 'h', material: 'metal' },
  { id: 'sec-vip', kind: 'double-swing', x: 1600, y: 3875, w: 200, axis: 'h', material: 'glass' },
  { id: 'cons-1', kind: 'swing', x: 1175, y: 3300, w: 100, axis: 'v', material: 'wood' },
  { id: 'cons-2', kind: 'swing', x: 1175, y: 3600, w: 100, axis: 'v', material: 'wood' },
  { id: 'cons-x', kind: 'swing', x: 825, y: 3450, w: 100, axis: 'v', material: 'wood' },
  { id: 'guard-1', kind: 'swing', x: 2225, y: 3300, w: 100, axis: 'v', material: 'wood' },
  { id: 'guard-2', kind: 'swing', x: 2225, y: 3600, w: 100, axis: 'v', material: 'wood' },
  { id: 'guard-x', kind: 'swing', x: 2575, y: 3450, w: 100, axis: 'v', material: 'metal' },
  { id: 'gh-e', kind: 'swing', x: 1075, y: 4900, w: 100, axis: 'v', material: 'wood' },
  { id: 'gh-s', kind: 'swing', x: 900, y: 5075, w: 100, axis: 'h', material: 'wood' },
];
const ROOFS: MapRoof[] = [
  { id: 'suite', points: poly.rect(800, 50, 750, 700) },
  { id: 'secretary', points: poly.rect(1500, 50, 350, 700) },
  { id: 'conference', points: poly.rect(2050, 50, 900, 700) },
  { id: 'comms', points: poly.rect(2050, 950, 500, 750) },
  { id: 'print', points: poly.rect(2500, 950, 450, 750) },
  { id: 'servers', points: poly.rect(800, 1900, 800, 700) },
  { id: 'ups', points: poly.rect(1550, 1900, 300, 700) },
  { id: 'consular', points: poly.rect(800, 3100, 400, 800) },
  { id: 'guard', points: poly.rect(2200, 3100, 400, 800) },
  { id: 'gatehouse', points: poly.rect(800, 4800, 300, 300) },
];

const base = gridMap('Embassy', GRID, 'embassy');
const withRooms = withGeometry(base, { polys: POLYS, doors: DOORS, roofs: ROOFS });
/** The Atrium's glass dome sits on the centre point, so it is its own twin. */
export const EMBASSY: MapDef = { ...withRooms, roofs: [...(withRooms.roofs ?? []), { id: 'dome', points: poly.circle(ATRIUM.x, ATRIUM.y, ATRIUM.rOut + 8, 40) }] };
