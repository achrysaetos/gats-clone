import { INK } from '../palette.ts';

/**
 * Summit: a ski resort the night a blizzard closed the mountain. The districts, the palette and the small tools every Summit
 * painter shares. Nothing here moves a wall: the grid and the polygons (src/shared/maps/summit.ts, summitgeo.ts) are the
 * cover, and everything else is paint, light and slow weather. Snow is kept mid-value on purpose (docs/art/STYLE.md: no
 * white fills over large areas): cool blue-grey, with warm timber and amber windows to carry the eye.
 */
export const SIZE = 6000;
export const TAU = Math.PI * 2;
export const OUTLINE = INK;

export const C = {
  ink: INK,
  // Snow, from the quiet flats to the lit drifts. All of it sits below 70% value so a player's colours stay the loudest thing.
  snow: '#8a9bb4', snowHi: '#a4b4cb', snowLo: '#74859f', snowDeep: '#5f7090', snowBlue: '#6f86a8', snowCap: '#b3c1d6', snowSpark: '#cbd8ea',
  packed: '#7b8aa2', packedLo: '#66758d', slush: '#6a7b92',
  ice: '#4f7f95', iceHi: '#7fb3c6', iceLo: '#355d72', iceDeep: '#274a60', iceCrack: '#c3e1ec', rinkIce: '#9ec6d4', rinkHi: '#bfdde6',
  water: '#13293a', waterHi: '#2a5068', waterRim: '#aac8d6',
  // Timber and stone.
  log: '#7a5430', logHi: '#9a6e40', logLo: '#523620', logEnd: '#b58a55', plank: '#8a6238', plankHi: '#a47848', plankLo: '#6a4828', chink: '#c7b88e',
  stone: '#7d776a', stoneHi: '#9a947f', stoneLo: '#58534a', mortar: '#3f3b34',
  shingle: '#5a4636', shingleHi: '#7a6046', tin: '#7e8a96', tinHi: '#a3aeb9', tinLo: '#566470',
  // Paint and metal.
  red: '#a8402e', redHi: '#c8604a', redLo: '#7a2c1e', green: '#3d6b52', greenHi: '#5c8a70', greenLo: '#294b3a', pine: '#2c4a3a', pineHi: '#3f6652', pineLo: '#1f3629', pineDeep: '#18291f',
  steel: '#5a6672', steelHi: '#7f8d9b', steelLo: '#3b4651', yellow: '#d9b24a', hazard: '#d9541f', brass: '#b79a4a', brassHi: '#d9c27a',
  amber: '#ffb347', amberHi: '#ffd9a0', window: '#ffc470', windowHi: '#fff0c8',
  rock: '#6e6a66', rockHi: '#8d8982', rockLo: '#4a4744', rockDeep: '#35322f',
  bone: '#e2dccb', cloth: '#8a2e3c',
} as const;

/** `#rrggbb` as an rgba() string at alpha `a`. */
export const hexA = (hex: string, a: number): string => {
  const v = parseInt(hex.slice(1), 16);
  return `rgba(${(v >> 16) & 255}, ${(v >> 8) & 255}, ${v & 255}, ${Math.min(1, Math.max(0, a)).toFixed(3)})`;
};

/** Mixes `hex` toward white (k > 0) or black (k < 0). */
export const shade = (hex: string, k: number): string => {
  const v = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.round(k >= 0 ? c + (255 - c) * k : c * (1 + k));
  return `rgb(${f((v >> 16) & 255)}, ${f((v >> 8) & 255)}, ${f(v & 255)})`;
};

/** Mixes two '#rrggbb' colours: k = 0 is `a`, 1 is `b`. */
export function mix(a: string, b: string, k: number): string {
  const x = parseInt(a.slice(1), 16), y = parseInt(b.slice(1), 16);
  const f = (s: number) => Math.round(((x >> s) & 255) * (1 - k) + ((y >> s) & 255) * k);
  return `rgb(${f(16)}, ${f(8)}, ${f(0)})`;
}

/** A hash of up to three numbers, 0..1: the same inputs always give the same dressing. */
export const hash = (a: number, b = 0, c = 0): number => {
  let h = (Math.imul(Math.round(a) | 0, 73856093) ^ Math.imul(Math.round(b) | 0, 19349663) ^ Math.imul(Math.round(c) | 0, 83492791)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 3266489909) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

export const FONT = '700 {n}px "Barlow Condensed", "Arial Narrow", sans-serif';
export const font = (n: number): string => FONT.replace('{n}', String(Math.round(n)));

/** Reduced motion holds the whole mountain still. */
export const calm = (() => { try { return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } })();
/** The clock every slow animation reads: frozen under reduced motion. */
export const clock = (now: number): number => (calm ? 6000 : now);

export type G = CanvasRenderingContext2D;
export type Box = { x0: number; y0: number; x1: number; y1: number };
export const turnPt = (x: number, y: number): [number, number] => [SIZE - x, SIZE - y];
export const turnBox = (b: Box): Box => ({ x0: SIZE - b.x1, y0: SIZE - b.y1, x1: SIZE - b.x0, y1: SIZE - b.y0 });
export const inBox = (b: Box, x: number, y: number): boolean => x >= b.x0 && x < b.x1 && y >= b.y0 && y < b.y1;
/** A world-px rect from grid cells (inclusive corners), 50 px each. */
export const cells = (c0: number, r0: number, c1: number, r1: number): Box => ({ x0: c0 * 50, y0: r0 * 50, x1: (c1 + 1) * 50, y1: (r1 + 1) * 50 });

export type Pt = readonly [number, number];

/** Smooth path through points. */
export function curve(g: G, pts: readonly Pt[]) {
  g.beginPath();
  g.moveTo(pts[0]![0], pts[0]![1]);
  for (let i = 1; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i]!, [bx, by] = pts[i + 1]!;
    g.quadraticCurveTo(ax, ay, (ax + bx) / 2, (ay + by) / 2);
  }
  const last = pts[pts.length - 1]!;
  g.lineTo(last[0], last[1]);
}

/** A rounded rectangle path. */
export function rr(g: G, x: number, y: number, w: number, h: number, r: number) {
  const k = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + k, y); g.lineTo(x + w - k, y); g.quadraticCurveTo(x + w, y, x + w, y + k);
  g.lineTo(x + w, y + h - k); g.quadraticCurveTo(x + w, y + h, x + w - k, y + h);
  g.lineTo(x + k, y + h); g.quadraticCurveTo(x, y + h, x, y + h - k);
  g.lineTo(x, y + k); g.quadraticCurveTo(x, y, x + k, y);
  g.closePath();
}

/** An ellipse that tolerates old canvases. */
export function ell(g: G, x: number, y: number, rx: number, ry: number, rot = 0) {
  g.beginPath();
  g.ellipse(x, y, Math.max(0.01, rx), Math.max(0.01, ry), rot, 0, TAU);
}

/* -- districts -------------------------------------------------------------------------------------------------------- */

export type FloorKind =
  | 'snow' | 'lodge' | 'spa' | 'deck' | 'sauna' | 'lift' | 'ice' | 'woods' | 'farm' | 'garage' | 'terminal' | 'fuel' | 'ridge' | 'lot' | 'loop' | 'lake' | 'rink' | 'hut' | 'zam';

export type District = {
  id: string; name: string; box: Box; floor: FloorKind;
  /** Wash over the floor (rgb and alpha) and the colour of its lights. */
  wash: readonly [number, number, number, number]; light: string;
  /** The twin site across the half turn (shared family), or null. */
  family: string;
};

const D = (id: string, name: string, box: Box, floor: FloorKind, wash: readonly [number, number, number, number], light: string, family: string): District => ({ id, name, box, floor, wash, light, family });
const pair = (west: District, east: Omit<District, 'box'>): District[] => [west, { ...east, box: turnBox(west.box) }];

/**
 * Where you are, most specific first. The east half is the west turned half a turn: its walls and cover are the same but
 * its dressing is another place entirely (a lodge and the spa hotel, a lift station and the ice garden, a garage and the
 * cable car terminal).
 */
export const DISTRICTS: readonly District[] = [
  D('rink', 'THE RINK', { x0: 2250, y0: 2550, x1: 3750, y1: 3450 }, 'rink', [190, 230, 255, 0.04], '#d8f0ff', 'lake'),
  ...pair(D('hut', 'FISHING HUT', { x0: 2250, y0: 4020, x1: 2800, y1: 4460 }, 'hut', [120, 190, 230, 0.05], '#ffb347', 'hut'), { id: 'zam', name: 'ZAMBONI SHED', floor: 'zam', wash: [210, 230, 255, 0.04], light: '#e8f2ff', family: 'hut' }),
  ...pair(D('dome', 'FUEL DEPOT', { x0: 1900, y0: 4780, x1: 2950, y1: 5950 }, 'fuel', [255, 150, 70, 0.07], '#ffa04a', 'dome'), { id: 'obs', name: 'OBSERVATORY RIDGE', floor: 'ridge', wash: [150, 170, 255, 0.07], light: '#bcd0ff', family: 'dome' }),
  ...pair(D('garage', 'SNOWCAT GARAGE', { x0: 100, y0: 4900, x1: 1900, y1: 5950 }, 'garage', [255, 200, 120, 0.06], '#ffcf7a', 'garage'), { id: 'terminal', name: 'CABLE CAR TERMINAL', floor: 'terminal', wash: [190, 225, 255, 0.07], light: '#d6ecff', family: 'garage' }),
  ...pair(D('lodge', 'SUMMIT LODGE', { x0: 250, y0: 2100, x1: 2050, y1: 3900 }, 'lodge', [255, 170, 80, 0.06], '#ffb347', 'lodge'), { id: 'spa', name: 'ALPINE SPA', floor: 'spa', wash: [140, 235, 220, 0.06], light: '#a8f0e0', family: 'lodge' }),
  ...pair(D('deck', 'HOT TUB DECK', { x0: 350, y0: 1450, x1: 1750, y1: 2100 }, 'deck', [255, 190, 110, 0.06], '#ffc470', 'deck'), { id: 'sauna', name: 'SAUNA YARD', floor: 'sauna', wash: [255, 140, 90, 0.06], light: '#ff9a62', family: 'deck' }),
  ...pair(D('lift', 'LIFT STATION', { x0: 1750, y0: 100, x1: 2950, y1: 1500 }, 'lift', [255, 210, 150, 0.05], '#ffd9a0', 'lift'), { id: 'iceg', name: 'ICE GARDEN', floor: 'ice', wash: [120, 210, 255, 0.09], light: '#8fd8ff', family: 'lift' }),
  ...pair(D('woods', 'PINE WOODS', { x0: 50, y0: 50, x1: 1500, y1: 1600 }, 'woods', [70, 130, 120, 0.07], '#9fc8d8', 'woods'), { id: 'farm', name: 'TREE FARM', floor: 'farm', wash: [255, 170, 90, 0.05], light: '#ffc470', family: 'woods' }),
  ...pair(D('lot', 'LODGE LOT', { x0: 100, y0: 3900, x1: 2050, y1: 4850 }, 'lot', [255, 205, 140, 0.05], '#ffd08a', 'lot'), { id: 'loop', name: 'SHUTTLE LOOP', floor: 'loop', wash: [190, 225, 255, 0.05], light: '#cfe6ff', family: 'lot' }),
  D('lake', 'FROZEN LAKE', { x0: 2050, y0: 1700, x1: 3950, y1: 4300 }, 'lake', [140, 200, 235, 0.05], '#a8dcf0', 'lake'),
];
export const GROUNDS: District = D('slopes', 'THE SLOPES', { x0: 0, y0: 0, x1: SIZE, y1: SIZE }, 'snow', [110, 130, 175, 0.04], '#a8bad8', 'slopes');

/** The district a point stands in. */
export function districtAt(x: number, y: number): District {
  for (const d of DISTRICTS) if (inBox(d.box, x, y)) return d;
  return GROUNDS;
}
export const district = (id: string): District => DISTRICTS.find((d) => d.id === id) ?? GROUNDS;

/** True for a poly or door id that is a half-turn twin. */
export const isTwin = (id: string | undefined): boolean => !!id && id.endsWith('~');
export const baseId = (id: string | undefined): string => (id ?? '').replace(/~$/, '').replace(/:.*$/, '');

/* -- fixtures: every light on the map, and what it is hung from ---------------------------------------------------------- */

export type Fixture = { key: string; x: number; y: number; radius: number; color: string; intensity: number; flicker?: number; size?: number; shadows?: boolean };

/** Both halves of a west fixture. */
export const twinOf = <T extends { x: number; y: number }>(f: T): T => ({ ...f, x: SIZE - f.x, y: SIZE - f.y });
