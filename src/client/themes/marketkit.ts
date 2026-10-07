import type { MapDef, MapWall } from '../../shared/maps.ts';
import { INK } from '../palette.ts';

/**
 * Night Market: a lantern-festival night. The map is nine districts, each with its own paving, light colour, awning
 * stripes, rooftops and one landmark, so a player knows where they stand with no minimap. Nothing here moves a wall:
 * the walls are the cover, everything else is paint, light and slow animation in the margins.
 */
export type District = {
  id: string;
  name: string;
  /** Anchor in world px (the landmark block or the crossing). */
  x: number; y: number;
  /** Floor: base wash, seam colour, and what the pavement is made of. */
  floor: string; seam: string; paving: 'flags' | 'tiles' | 'asphalt' | 'cobbles' | 'grid' | 'soot' | 'rugs';
  /** Practical light colour (lanterns, windows) and neon accents. */
  light: string; neon: string; neon2: string;
  /** Awning stripe colours. */
  awn: readonly [string, string];
  /** Roof tint and shop names painted on roofs. */
  roof: string;
  shops: readonly string[];
  lantern: string;
};

export const DISTRICTS: readonly District[] = [
  { id: 'temple', name: 'TEMPLE COURT', x: 375, y: 675, floor: '#5d5a56', seam: '#3d3a36', paving: 'flags', light: '#ffc27a', neon: '#ffb347', neon2: '#ff7a59', awn: ['#8f2f2f', '#e6d3a8'], roof: '#5e4a42', shops: ['INCENSE', 'TEA HOUSE', 'WISHES', 'CALLIGRAPHY'], lantern: '#d9482f' },
  { id: 'lantern', name: 'LANTERN ALLEY', x: 2900, y: 175, floor: '#57504e', seam: '#37302e', paving: 'asphalt', light: '#ff7a4a', neon: '#ff4d6d', neon2: '#ffb347', awn: ['#c0392b', '#f1d9a0'], roof: '#54424a', shops: ['LANTERNS', 'PAPER CO', 'RED THREAD', 'FESTIVAL'], lantern: '#e5412d' },
  { id: 'fish', name: 'FISH MARKET', x: 5175, y: 275, floor: '#5a6168', seam: '#3a4148', paving: 'tiles', light: '#d6ecff', neon: '#6fd8ff', neon2: '#e9fbff', awn: ['#2f7f8f', '#e8f1f2'], roof: '#46565e', shops: ['FRESH FISH', 'ICE CO', 'SQUID KING', 'TUNA'], lantern: '#cfe9f5' },
  { id: 'produce', name: 'PRODUCE ROW', x: 175, y: 3475, floor: '#575a4c', seam: '#383b2e', paving: 'cobbles', light: '#e8e08a', neon: '#9be36a', neon2: '#ffd34d', awn: ['#4f8a3a', '#f0e6a8'], roof: '#4e5444', shops: ['GREENS', 'FRUIT', 'MR LEE', 'HERBS'], lantern: '#f0d86a' },
  { id: 'gate', name: 'NEON CROSSING', x: 3000, y: 3000, floor: '#4d4a54', seam: '#302e38', paving: 'grid', light: '#ff9ad8', neon: '#ff4fd0', neon2: '#3fe0d0', awn: ['#a02c7a', '#cdeeea'], roof: '#4a4452', shops: ['CROSSING', 'NIGHT BUS', 'LUCKY 8', 'PHOTO'], lantern: '#ff6fcf' },
  { id: 'spice', name: 'SPICE BAZAAR', x: 5825, y: 2525, floor: '#5e5246', seam: '#3e3328', paving: 'rugs', light: '#ffc24a', neon: '#c78bff', neon2: '#ffc24a', awn: ['#6a3d8f', '#e8c36a'], roof: '#58483f', shops: ['SPICES', 'TEA & HERB', 'SAFFRON', 'DRIED GOODS'], lantern: '#e8a93a' },
  { id: 'arcade', name: 'ARCADE ROW', x: 825, y: 5725, floor: '#4a4f5a', seam: '#2c3038', paving: 'grid', light: '#6fb8ff', neon: '#3fe0e0', neon2: '#ff4fd0', awn: ['#1f6f9f', '#bfeaf5'], roof: '#3f4656', shops: ['GAME ZONE', 'PIXEL', 'TOKENS', 'REPAIR'], lantern: '#6fb8ff' },
  { id: 'noodle', name: 'NOODLE LANE', x: 3100, y: 5825, floor: '#59544a', seam: '#39342a', paving: 'asphalt', light: '#ffe08a', neon: '#ffd34d', neon2: '#ff8a4a', awn: ['#d4a02c', '#f4ecd0'], roof: '#56503f', shops: ['NOODLES', 'DUMPLING', 'CONGEE', 'SOUP'], lantern: '#ffd05a' },
  { id: 'grill', name: 'STREET FOOD ROW', x: 5625, y: 5325, floor: '#544c46', seam: '#352e28', paving: 'soot', light: '#ff9a3c', neon: '#ff7a2a', neon2: '#ffe08a', awn: ['#d9541f', '#f4e6cc'], roof: '#523f38', shops: ['GRILL', 'SKEWERS', 'BBQ', 'HOT POT'], lantern: '#ff8a3a' },
];

/** Mixes two '#rrggbb' colours: k = 0 is `a`, 1 is `b`. */
export function mix(a: string, b: string, k: number): string {
  const x = parseInt(a.slice(1), 16), y = parseInt(b.slice(1), 16);
  const f = (s: number) => Math.round(((x >> s) & 255) * (1 - k) + ((y >> s) & 255) * k);
  return `rgb(${f(16)}, ${f(8)}, ${f(0)})`;
}

export function districtAt(x: number, y: number): District {
  let best = DISTRICTS[0]!, bd = Infinity;
  for (const d of DISTRICTS) {
    const dd = (d.x - x) ** 2 + (d.y - y) ** 2;
    if (dd < bd) { bd = dd; best = d; }
  }
  return best;
}

export const hash = (a: number, b = 0): number => {
  let h = (Math.imul(Math.round(a) | 0, 73856093) ^ Math.imul(Math.round(b) | 0, 19349663)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 3266489909) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

export const FONT = '700 {n}px "Barlow Condensed", "Arial Narrow", sans-serif';
export const font = (n: number): string => FONT.replace('{n}', String(Math.round(n)));

export const hexA = (hex: string, a: number): string => {
  const v = parseInt(hex.slice(1), 16);
  return `rgba(${(v >> 16) & 255}, ${(v >> 8) & 255}, ${v & 255}, ${a.toFixed(3)})`;
};
/** Mixes `hex` toward white (k > 0) or black (k < 0). */
export const shade = (hex: string, k: number): string => {
  const v = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.round(k >= 0 ? c + (255 - c) * k : c * (1 + k));
  return `rgb(${f((v >> 16) & 255)}, ${f((v >> 8) & 255)}, ${f(v & 255)})`;
};

export type Placed = { w: MapWall; d: District; h: number };
export type StringSpan = { x0: number; y0: number; x1: number; y1: number; d: District; n: number; seed: number };
export type Derived = {
  stalls: Placed[]; shops: Placed[]; carts: Placed[]; stacks: Placed[]; marks: Placed[];
  strings: StringSpan[];
  puddles: { x: number; y: number; r: number; d: District; seed: number }[];
};

const derived = new WeakMap<MapDef, Derived>();

/** Everything the theme needs from the walls, worked out once per map: which stalls, which strings span which alleys. */
export function deriveOf(map: MapDef): Derived {
  let out = derived.get(map);
  if (out) return out;
  const place = (m: string): Placed[] => map.walls.filter((w) => w.material === m).map((w) => ({ w, d: districtAt(w.x + w.w / 2, w.y + w.h / 2), h: hash(w.x, w.y) }));
  const shops = place('shopfront');
  const strings: StringSpan[] = [];
  // Lanterns criss-cross every street: two or three wires hang between each pair of shopfronts that face each other across it, and one runs corner to corner.
  const taken = new Set<string>();
  const wire = (x0: number, y0: number, x1: number, y1: number, seed: number) => {
    const key = Math.abs(x1 - x0) >= Math.abs(y1 - y0) ? `h${Math.round(x0)},${Math.round(x1)},${Math.round(y0 / 60)}` : `v${Math.round(y0)},${Math.round(y1)},${Math.round(x0 / 60)}`;
    if (taken.has(key)) return;
    taken.add(key);
    const len = Math.hypot(x1 - x0, y1 - y0);
    strings.push({ x0, y0, x1, y1, d: districtAt((x0 + x1) / 2, (y0 + y1) / 2), n: Math.max(4, Math.min(12, Math.round(len / 36))), seed });
  };
  for (const a of shops) for (const b of shops) {
    if (a === b) continue;
    const A = a.w, B = b.w;
    const gapX = B.x - (A.x + A.w), oy = Math.min(A.y + A.h, B.y + B.h) - Math.max(A.y, B.y);
    if (gapX >= 140 && gapX <= 560 && oy >= 140) {
      const y0 = Math.max(A.y, B.y);
      for (const [i, f] of [0.3, 0.7].entries()) wire(A.x + A.w, y0 + oy * f, B.x, y0 + oy * f + (i ? 36 : -36), hash(A.x + i, B.y));
    }
    const gapY = B.y - (A.y + A.h), ox = Math.min(A.x + A.w, B.x + B.w) - Math.max(A.x, B.x);
    if (gapY >= 140 && gapY <= 560 && ox >= 140) {
      const x0 = Math.max(A.x, B.x);
      for (const [i, f] of [0.3, 0.7].entries()) wire(x0 + ox * f, A.y + A.h, x0 + ox * f + (i ? 36 : -36), B.y, hash(B.x + i, A.y));
    }
  }
  // Wet ground sits at the kerbs, under the shopfronts' feet, not scattered in the lanes.
  const puddles: Derived['puddles'] = [];
  shops.forEach((sh, i) => {
    const w = sh.w;
    for (let k = 0; k < 2; k++) {
      if (hash(w.x, w.y + k * 31) > 0.62) continue;
      const r = 22 + hash(w.y, w.x + k) * 22, x = w.x + w.w * (0.15 + 0.7 * hash(w.x + k, w.y)), y = w.y + w.h + 34 + r * 0.5;
      if (map.walls.some((o) => x + r > o.x - 6 && x - r < o.x + o.w + 6 && y + r * 0.6 > o.y - 6 && y - r * 0.6 < o.y + o.h + 24)) continue;
      puddles.push({ x, y, r, d: districtAt(x, y), seed: i * 3 + k });
    }
  });
  out = { stalls: place('stall'), shops, carts: place('cart'), stacks: place('stack'), marks: place('shrine'), strings, puddles };
  derived.set(map, out);
  return out;
}

/** Which side a stall's awning (its vendor's space) lies on: toward the map's near edge, so half-turn twins face opposite ways. */
export const awningNorth = (w: MapWall, size: number): boolean => w.y + w.h / 2 < size / 2;

export const OUTLINE = INK;

/** A rounded rectangle path. */
export function rr(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const k = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + k, y); g.lineTo(x + w - k, y); g.quadraticCurveTo(x + w, y, x + w, y + k);
  g.lineTo(x + w, y + h - k); g.quadraticCurveTo(x + w, y + h, x + w - k, y + h);
  g.lineTo(x + k, y + h); g.quadraticCurveTo(x, y + h, x, y + h - k);
  g.lineTo(x, y + k); g.quadraticCurveTo(x, y, x + k, y);
  g.closePath();
}
