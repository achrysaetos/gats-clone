import type { MapDef } from '../shared/maps.ts';
import { registerAmbient, type AmbientGroup, type AmbientPt, type AmbientRect } from './ambientreg.ts';

/**
 * Ambient life for the maps that exist today (docs/maps/AMBIENT.md). Counts are small on purpose: a map is 6000 px and a view
 * about 1500, so a flock here and a cat there is what a player meets. Placement is automatic (wall tops, quiet margins, water)
 * unless a map has a place that matters (a gift shop, a lamp).
 */

/** The map's streetlamp props: where moths gather. */
const lamps = (map: MapDef, n: number): AmbientPt[] => map.props.filter((p) => p.kind === 'lamp').slice(0, n).map((p) => ({ x: p.x, y: p.y }));
const mothsAt = (map: MapDef, n: number, extra: Partial<AmbientGroup> = {}): AmbientGroup[] => { const at = lamps(map, n); return at.length ? [{ kind: 'moth', count: at.length * 2, at, ...extra }] : []; };

registerAmbient('plaza', (map) => ({
  wind: { x: 22, y: -8 },
  groups: [
    { kind: 'pigeon', count: 9, on: 'wall' }, { kind: 'sparrow', count: 4, on: 'wall' },
    { kind: 'cat', count: 1, roam: 220 }, { kind: 'rat', count: 3 },
    { kind: 'paper', count: 4 }, { kind: 'leaf', count: 3 },
    ...mothsAt(map, 5),
  ],
}));

registerAmbient('oldtown', (map) => ({
  wind: { x: 16, y: 6 },
  groups: [
    { kind: 'pigeon', count: 7, on: 'wall' }, { kind: 'crow', count: 3, on: 'wall' }, { kind: 'sparrow', count: 3, on: 'wall' },
    { kind: 'cat', count: 1, roam: 200 }, { kind: 'dog', count: 1, roam: 260 }, { kind: 'rat', count: 3 },
    { kind: 'leaf', count: 7 }, { kind: 'paper', count: 3 },
    ...mothsAt(map, 5),
  ],
}));

registerAmbient('quarry', {
  wind: { x: 34, y: -10 },
  groups: [
    { kind: 'crow', count: 7, on: 'wall' }, { kind: 'sparrow', count: 2, on: 'wall' },
    { kind: 'rat', count: 2 }, { kind: 'dustdevil', count: 1 }, { kind: 'tumbleweed', count: 2 }, { kind: 'paper', count: 2 },
  ],
});

registerAmbient('subpen', {
  wind: { x: 10, y: -4 },
  groups: [
    { kind: 'gull', count: 8, on: 'wall' }, { kind: 'rat', count: 3 },
    { kind: 'fish', count: 10, on: 'water' },
    { kind: 'bat', count: 8, on: 'wall', in: [{ x: 250, y: 250, w: 1100, h: 1100 }], when: 'any' },
  ],
});

/** The gift shop (west-south and its half-turn twin): a mouse in each. The apron round the building is open ground, so the pigeons live there. */
const SHOP: AmbientPt[] = [{ x: 820, y: 5440 }, { x: 1080, y: 5240 }];
const APRON: AmbientRect[] = [{ x: 40, y: 40, w: 5920, h: 330 }, { x: 40, y: 5630, w: 5920, h: 330 }, { x: 40, y: 40, w: 330, h: 5920 }, { x: 5630, y: 40, w: 330, h: 5920 }];
registerAmbient('museum', (map) => ({
  wind: { x: 6, y: 0 },
  groups: [
    { kind: 'pigeon', count: 6, on: 'ground', in: APRON }, { kind: 'sparrow', count: 3, on: 'ground', in: APRON },
    { kind: 'mouse', count: 2, at: SHOP.map((p) => ({ x: p.x, y: p.y })), roam: 150 },
    { kind: 'mouse', count: 2, at: SHOP.map((p) => ({ x: 6000 - p.x, y: 6000 - p.y })), roam: 150 },
    ...mothsAt(map, 3, { when: 'any' }),
    { kind: 'bat', count: 8, on: 'wall', in: [{ x: 420, y: 420, w: 1000, h: 800 }], when: 'any' },
  ],
}));

registerAmbient('park', (map) => ({
  wind: { x: 18, y: 4 },
  groups: [
    // The pond already has its ducks (parkdecor.ts) and fireflies come at dusk (parkdecor.ts); the rest of the park is ours.
    { kind: 'crow', count: 4, on: 'wall', materials: ['trunk', 'parkstone', 'bench'] }, { kind: 'sparrow', count: 5, on: 'wall', materials: ['hedge', 'bench', 'parkstone', 'trunk'] },
    { kind: 'butterfly', count: 5, on: 'ground' }, { kind: 'leaf', count: 9 },
    { kind: 'fish', count: 12, on: 'water' }, { kind: 'cat', count: 1, roam: 240 }, { kind: 'mouse', count: 2 },
    ...mothsAt(map, 4),
  ],
}));

registerAmbient('market', (map) => ({
  wind: { x: 12, y: -6 },
  groups: [
    { kind: 'pigeon', count: 6, on: 'wall' }, { kind: 'cat', count: 2, roam: 220 }, { kind: 'rat', count: 4 },
    { kind: 'paper', count: 7 }, { kind: 'leaf', count: 2 },
    ...mothsAt(map, 5, { when: 'any' }),
    { kind: 'bat', count: 8, on: 'wall', in: [{ x: 300, y: 300, w: 1000, h: 900 }], when: 'any' },
  ],
}));

registerAmbient('range', { wind: { x: 20, y: -6 }, groups: [{ kind: 'sparrow', count: 3, on: 'wall' }, { kind: 'crow', count: 2, on: 'wall' }, { kind: 'paper', count: 2 }, { kind: 'leaf', count: 2 }] });

// Zombies: the crows on the outpost walls lift off as the horde walks in.
registerAmbient('outpost', { wind: { x: 26, y: -8 }, groups: [{ kind: 'crow', count: 9, on: 'wall' }, { kind: 'tumbleweed', count: 2 }, { kind: 'paper', count: 2 }, { kind: 'rat', count: 2 }] });
