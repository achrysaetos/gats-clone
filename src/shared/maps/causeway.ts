import { gridMap } from '../mapgrid.ts';
import { withGeometry } from '../mapgeo.ts';
import type { MapDef } from '../maps.ts';
import { WEST_DOORS, WEST_POLYS, WEST_ROOFS } from './causewaygeo.ts';

/**
 * Causeway Harbour: two quays on two seas, a container ship, a trawler and a patrol boat at each to fight on, and a stone causeway
 * across the ponds at the centre. The walls, doors and roofs are in causewaygeo.ts (polygons; water stops bodies but not bullets);
 * this grid carries only the spawns, zone A and the props, placed by pixel and turned by the half turn like everything else.
 */

const cols = 60, rows = 120, CELL = 50;
const cells: string[][] = Array.from({ length: rows }, () => Array.from({ length: cols }, () => '.'));
const put = (ch: string, x: number, y: number) => { cells[Math.min(rows - 1, Math.floor(y / CELL))]![Math.min(cols - 1, Math.floor(x / CELL))] = ch; };
const fill = (ch: string, x0: number, y0: number, x1: number, y1: number) => { for (let y = y0; y < y1; y += CELL) for (let x = x0; x < x1; x += CELL) put(ch, x, y); };

// Red's yard in the south-west, and spread free-for-all pads.
fill('X', 1900, 3660, 2250, 3850);
for (const [x, y] of [
  [1100, 1250], [1300, 450], [1700, 250], [2850, 1475], [1300, 2300], [2150, 3050], [1100, 3750], [1350, 4800], [2750, 4650], [2850, 3850],
] as const) fill('F', x - 50, y - 50, x + 50, y + 50);
put('A', 1975, 2825);

const PROP_CHAR = { propane: 'p', gas: 'g', generator: 'e', oil: 'o', lamp: 'l', medic: 'm', ammo: 'a', paint: 'i' } as const;
type Prop = keyof typeof PROP_CHAR;
for (const [ch, x, y] of [
  ['c', 1300, 2050], ['c', 2000, 3075], ['c', 1300, 3450], ['c', 2350, 4600], ['c', 1100, 1650], ['c', 2550, 2600],
  ['b', 1325, 2700], ['b', 2550, 3400], ['b', 1750, 1650], ['b', 1050, 4550],
] as const) put(ch, x, y);
for (const [k, x, y] of [
  ['lamp', 1000, 1500], ['lamp', 1000, 2500], ['lamp', 1000, 3450], ['lamp', 1000, 4500], ['lamp', 2600, 2950], ['lamp', 1300, 1500],
  ['propane', 1250, 2650], ['gas', 1325, 3050], ['generator', 2300, 1750], ['oil', 1150, 4200], ['medic', 2200, 2600], ['ammo', 1560, 3800], ['paint', 2760, 4850],
  ['ammo', 2650, 1100], ['gas', 2440, 4050], ['medic', 1700, 600],
] as readonly (readonly [Prop, number, number])[]) put(PROP_CHAR[k], x, y);

const built = withGeometry(gridMap('Causeway', cells.map((r) => r.join('')).join('\n'), 'harbor'), { polys: [...WEST_POLYS], doors: [...WEST_DOORS], roofs: [...WEST_ROOFS] });

/** A turned piece keeps its group name from `halfTurn`; give the east half's groups their own so each half is drawn as its own set piece. */
export const CAUSEWAY: MapDef = { ...built, polys: built.polys!.map((p) => (p.id?.endsWith('~') && p.group ? { ...p, group: `${p.group}~` } : p)) };
