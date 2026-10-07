import { registerAmbient } from '../ambientreg.ts';
import { registerTheme } from './registry.ts';
import { railOver, railUnder } from './railyarddecor.ts';
import { paintRailFloor } from './railyardfloor.ts';
import { railDoor, railDrawSetPiece, railRoof } from './railyardgeo.ts';
import { RAIL_WALLS } from './railyardwalls.ts';

/**
 * Rail Yard, a terminus and freight yard at night: registers the theme. Floor in railyardfloor.ts, solids in
 * railyardwalls.ts, polygons, doors and roofs in railyardgeo.ts, vignettes in railyardprops.ts, and everything that
 * stands over or moves in railyarddecor.ts.
 */
registerTheme('railyard', { floor: paintRailFloor, walls: RAIL_WALLS, under: railUnder, over: railOver, drawSetPiece: railDrawSetPiece, door: railDoor, roof: railRoof, dusk: 0.3 });

/** The station's own residents: pigeons in the rafters and on the brick, rats on the sleepers, a cat, crows on the tower and crane, bats in the tunnel, moths round the lamps. */
const turned = (x: number, y: number) => ({ x: 6000 - x, y: 6000 - y });
registerAmbient('railyard', {
  wind: { x: 10, y: -3 },
  groups: [
    { kind: 'pigeon', count: 9, on: 'wall', materials: ['terminus'] },
    { kind: 'pigeon', count: 3, at: [{ x: 2300, y: 1020 }, { x: 3100, y: 1520 }, turned(2300, 1020)] },
    { kind: 'sparrow', count: 4, on: 'wall', materials: ['kiosk', 'sleepers'] },
    { kind: 'crow', count: 4, at: [{ x: 5250, y: 330 }, { x: 3700, y: 2680 }, turned(5250, 330), turned(3700, 2680)] },
    { kind: 'rat', count: 5, in: [{ x: 1700, y: 720, w: 1700, h: 160 }, { x: 1700, y: 1720, w: 1700, h: 160 }, { x: 3700, y: 1750, w: 400, h: 400 }, { x: 2600, y: 4120, w: 1700, h: 160 }] },
    { kind: 'rat', count: 3, in: [{ x: 3800, y: 3100, w: 800, h: 300 }, { x: 1300, y: 2600, w: 800, h: 300 }], roam: 140 },
    { kind: 'cat', count: 1, at: [{ x: 2440, y: 2330 }, turned(1400, 2820)] },
    { kind: 'bat', count: 4, at: [{ x: 5760, y: 1300 }, turned(5760, 1300)] },
    { kind: 'moth', count: 5, at: [{ x: 1925, y: 525 }, { x: 2325, y: 1025 }, { x: 2725, y: 1525 }, { x: 2325, y: 2025 }] },
    { kind: 'paper', count: 4 },
    { kind: 'leaf', count: 3, when: 'night' },
  ],
});
