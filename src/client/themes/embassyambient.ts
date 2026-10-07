import { registerAmbient } from '../ambientreg.ts';
import { FOUNTAIN } from '../../shared/maps/embassy.ts';

/**
 * The Embassy's small hours: sparrows and pigeons on the compound wall and the hedges, a ginger cat who naps on the ambassador's
 * chair and slips away when you run in, koi in the fountain and a duck on the service lot's pond, moths round the lamps, butterflies
 * in the topiary garden, mice in the kitchen and the archives, leaves on the lawn and the odd stray page blown across the terrace.
 * (The theme's own movers, the flags, the fountain, the racks and the cameras, live in embassy.ts.)
 */
registerAmbient('embassy', {
  wind: { x: 10, y: 4 },
  groups: [
    { kind: 'sparrow', count: 6, on: 'wall' },
    { kind: 'pigeon', count: 4, at: [{ x: 1050, y: 4260 }, { x: 2280, y: 4260 }, { x: 3000, y: 4100 }, { x: 4950, y: 1760 }] },
    { kind: 'cat', count: 1, at: [{ x: 1200, y: 355 }], roam: 90 },
    { kind: 'fish', count: 6, on: 'water', in: [{ x: FOUNTAIN.x - 120, y: FOUNTAIN.y - 120, w: 240, h: 240 }] },
    { kind: 'duck', count: 3, at: [{ x: 6000 - FOUNTAIN.x, y: 6000 - FOUNTAIN.y }] },
    { kind: 'moth', count: 4, at: [{ x: 1600, y: 5400 }, { x: 2400, y: 4300 }, { x: 4400, y: 1700 }, { x: 3600, y: 600 }] },
    { kind: 'butterfly', count: 3, in: [{ x: 60, y: 60, w: 740, h: 2500 }] },
    { kind: 'mouse', count: 3, in: [{ x: 4300, y: 3100, w: 1300, h: 800 }, { x: 4200, y: 2250, w: 700, h: 500 }] },
    { kind: 'leaf', count: 5 },
    { kind: 'paper', count: 2, in: [{ x: 2600, y: 1800, w: 800, h: 800 }] },
  ],
});
