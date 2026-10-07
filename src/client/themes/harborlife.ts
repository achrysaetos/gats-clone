import { PLACED_SHIPS, QUAY, SIZE } from '../../shared/maps/causewaydata.ts';
import { registerAmbient, type AmbientGroup, type AmbientPt } from '../ambientreg.ts';

/**
 * The harbour's living things, as a config for the shared ambient engine (docs/maps/AMBIENT.md): gulls on the mooring bollards and
 * the pier's end (they burst away from gunfire and settle again), a pelican that has claimed the pier head, a dock cat at each fish
 * shed door, fish shadows in the sea and the ponds, steam from the cafe and the pump house, smoke from the funnels and litter on the
 * wind. The harbour's own movers (the swell under the hulls, the gantry trolley, the sweeping beam, pennants, laundry) are in harbor.ts.
 */

const bollards: AmbientPt[] = PLACED_SHIPS.flatMap((s) => {
  let y0 = Infinity, y1 = -Infinity;
  for (const p of s.hull) { y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
  const x = s.east ? SIZE - QUAY - 26 : QUAY + 26;
  return [{ x, y: y0 + (y1 - y0) * 0.24 - 70 }, { x, y: y0 + (y1 - y0) * 0.76 + 70 }];
});
const turn = (p: AmbientPt): AmbientPt => ({ x: SIZE - p.x, y: SIZE - p.y });
const both = (pts: readonly AmbientPt[]): AmbientPt[] => [...pts, ...pts.map(turn)];
const rects = (r: { x: number; y: number; w: number; h: number }[]) => [...r, ...r.map((q) => ({ x: SIZE - q.x - q.w, y: SIZE - q.y - q.h, w: q.w, h: q.h }))];

const groups: AmbientGroup[] = [
  { kind: 'gull', count: 8, at: bollards },
  { kind: 'gull', count: 4, at: both([{ x: 330, y: 5190 }, { x: 905, y: 1000 }, { x: 905, y: 5020 }]) },
  { kind: 'gull', count: 3, on: 'wall' },
  // The pelican: a gull that has seen better days and bigger fish.
  { kind: 'gull', count: 1, at: [{ x: 322, y: 5240 }], scale: 1.7 },
  { kind: 'cat', count: 1, at: [{ x: 1384, y: 4300 }], roam: 140 },
  { kind: 'cat', count: 1, at: [{ x: SIZE - 1384, y: SIZE - 4300 }], roam: 120 },
  { kind: 'fish', count: 10, on: 'water', in: rects([{ x: 40, y: 1100, w: 220, h: 3800 }, { x: 40, y: 80, w: 700, h: 480 }, { x: 2660, y: 2290, w: 320, h: 480 }]) },
  { kind: 'steam', at: both([{ x: 580, y: 5220 }, { x: 2910, y: 436 }]) },
  { kind: 'horn', at: both([{ x: 590, y: 3668 }]), periodMs: 9000 },
  { kind: 'paper', count: 3 },
  { kind: 'leaf', count: 2 },
];

registerAmbient('causeway', { wind: { x: 9, y: -3 }, groups });
